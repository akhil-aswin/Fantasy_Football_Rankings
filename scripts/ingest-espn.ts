import { prisma } from "../lib/prisma";
import { CURRENT_SEASON, StatLine, EMPTY_STAT_LINE } from "./config";
import { normalizeName } from "./name-match";

const ESPN_URL = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${CURRENT_SEASON}/segments/0/leaguedefaults/3?view=kona_player_info`;

// Confirmed against espn-api's PLAYER_STATS_MAP (github.com/cwendt94/espn-api)
// and cross-checked against real season totals for a known player.
const ESPN_STAT_ID = {
  passYds: "3",
  passTd: "4",
  passInt: "20",
  rushYds: "24",
  rushTd: "25",
  rec: "53",
  recYds: "42",
  recTd: "43",
  fumblesLost: "72",
} as const;

const POSITION_BY_DEFAULT_ID: Record<number, string> = {
  1: "QB",
  2: "RB",
  3: "WR",
  4: "TE",
};

interface EspnStatEntry {
  seasonId: number;
  scoringPeriodId: number;
  statSourceId: number;
  statSplitTypeId: number;
  stats?: Record<string, number>;
}

interface EspnPlayerEntry {
  player: {
    id: number;
    fullName: string;
    defaultPositionId: number;
    stats?: EspnStatEntry[];
  };
}

function mapEspnStats(raw: Record<string, number>): StatLine {
  return {
    games: null,
    passYds: raw[ESPN_STAT_ID.passYds] ?? 0,
    passTd: raw[ESPN_STAT_ID.passTd] ?? 0,
    passInt: raw[ESPN_STAT_ID.passInt] ?? 0,
    rushYds: raw[ESPN_STAT_ID.rushYds] ?? 0,
    rushTd: raw[ESPN_STAT_ID.rushTd] ?? 0,
    rec: raw[ESPN_STAT_ID.rec] ?? 0,
    recYds: raw[ESPN_STAT_ID.recYds] ?? 0,
    recTd: raw[ESPN_STAT_ID.recTd] ?? 0,
    fumblesLost: raw[ESPN_STAT_ID.fumblesLost] ?? 0,
  };
}

async function ingestEspn() {
  console.log(`Fetching ESPN player projections for ${CURRENT_SEASON}...`);
  const res = await fetch(ESPN_URL, {
    headers: {
      "X-Fantasy-Filter": JSON.stringify({
        players: {
          limit: 5000,
          sortDraftRanks: { sortPriority: 1, sortAsc: true, value: "STANDARD" },
        },
      }),
    },
  });
  if (!res.ok) {
    throw new Error(`ESPN request failed: ${res.status}`);
  }
  const data: { players: EspnPlayerEntry[] } = await res.json();
  console.log(`ESPN returned ${data.players.length} players.`);

  const dbPlayers = await prisma.player.findMany({
    select: { id: true, espnId: true, name: true, position: true },
  });
  const byEspnId = new Map(dbPlayers.filter((p) => p.espnId).map((p) => [p.espnId!, p]));
  const byNameAndPosition = new Map(
    dbPlayers.map((p) => [`${normalizeName(p.name)}|${p.position}`, p])
  );

  let matched = 0;
  let unmatched = 0;
  let written = 0;

  for (const entry of data.players) {
    const espnPlayer = entry.player;
    const position = POSITION_BY_DEFAULT_ID[espnPlayer.defaultPositionId];
    if (!position) continue; // K, DST, etc. — out of scope

    const espnIdStr = String(espnPlayer.id);
    const dbPlayer =
      byEspnId.get(espnIdStr) ??
      byNameAndPosition.get(`${normalizeName(espnPlayer.fullName)}|${position}`);

    if (!dbPlayer) {
      unmatched++;
      continue;
    }
    matched++;

    const seasonProjection = espnPlayer.stats?.find(
      (s) =>
        s.seasonId === CURRENT_SEASON &&
        s.scoringPeriodId === 0 &&
        s.statSourceId === 1 &&
        s.statSplitTypeId === 0
    );
    if (!seasonProjection?.stats) continue;

    const line = mapEspnStats(seasonProjection.stats);
    if (JSON.stringify(line) === JSON.stringify({ ...EMPTY_STAT_LINE, games: null })) continue;

    await prisma.projectionStatLine.upsert({
      where: {
        playerId_source_season_week: {
          playerId: dbPlayer.id,
          source: "espn",
          season: CURRENT_SEASON,
          week: 0,
        },
      },
      create: {
        playerId: dbPlayer.id,
        source: "espn",
        season: CURRENT_SEASON,
        week: 0,
        ...line,
      },
      update: { ...line },
    });
    written++;
  }

  console.log(
    `Matched ${matched} ESPN players to existing players (${unmatched} unmatched), wrote ${written} projections.`
  );
}

ingestEspn()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
