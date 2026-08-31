import Papa from "papaparse";
import { prisma } from "../lib/prisma";
import { PREVIOUS_SEASON, SKILL_POSITIONS, SkillPosition } from "./config";
import { normalizeName } from "./name-match";

// nflverse renamed its player-stats release from "player_stats" to
// "stats_player" in 2025; per-season weekly files live here now.
const NFLVERSE_URL = (season: number) =>
  `https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_${season}.csv`;

// Two seasons of history so a single injury-shortened year doesn't dominate
// the "past performance" signal.
const SEASONS_TO_INGEST = [PREVIOUS_SEASON, PREVIOUS_SEASON - 1];

interface NflverseRow {
  player_id: string;
  player_display_name: string;
  position: string;
  season: string;
  week: string;
  season_type: string;
  completions: string;
  passing_yards: string;
  passing_tds: string;
  passing_interceptions: string;
  rushing_yards: string;
  rushing_tds: string;
  rushing_fumbles_lost: string;
  receptions: string;
  receiving_yards: string;
  receiving_tds: string;
  receiving_fumbles_lost: string;
  sack_fumbles_lost: string;
}

function isSkillPosition(position: string): position is SkillPosition {
  return (SKILL_POSITIONS as readonly string[]).includes(position);
}

function num(v: string | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function ingestSeason(
  season: number,
  byGsisId: Map<string, { id: string }>,
  byNameAndPosition: Map<string, { id: string }>
) {
  console.log(`Fetching nflverse weekly stats for ${season}...`);
  const res = await fetch(NFLVERSE_URL(season));
  if (!res.ok) {
    console.warn(`  ${season}: request failed (${res.status}), skipping`);
    return;
  }
  const csvText = await res.text();
  const { data } = Papa.parse<NflverseRow>(csvText, { header: true, skipEmptyLines: true });

  let matched = 0;
  let unmatched = 0;
  let written = 0;

  for (const row of data) {
    if (row.season_type !== "REG") continue;
    if (!row.position || !isSkillPosition(row.position)) continue;

    const dbPlayer =
      byGsisId.get(row.player_id) ??
      byNameAndPosition.get(`${normalizeName(row.player_display_name)}|${row.position}`);

    if (!dbPlayer) {
      unmatched++;
      continue;
    }
    matched++;

    const week = Number(row.week);
    if (!Number.isFinite(week) || week < 1) continue;

    const fumblesLost =
      num(row.rushing_fumbles_lost) + num(row.receiving_fumbles_lost) + num(row.sack_fumbles_lost);

    await prisma.actualStatLine.upsert({
      where: {
        playerId_source_season_week: {
          playerId: dbPlayer.id,
          source: "nflverse",
          season,
          week,
        },
      },
      create: {
        playerId: dbPlayer.id,
        source: "nflverse",
        season,
        week,
        passYds: num(row.passing_yards),
        passTd: num(row.passing_tds),
        passInt: num(row.passing_interceptions),
        rushYds: num(row.rushing_yards),
        rushTd: num(row.rushing_tds),
        rec: num(row.receptions),
        recYds: num(row.receiving_yards),
        recTd: num(row.receiving_tds),
        fumblesLost,
      },
      update: {
        passYds: num(row.passing_yards),
        passTd: num(row.passing_tds),
        passInt: num(row.passing_interceptions),
        rushYds: num(row.rushing_yards),
        rushTd: num(row.rushing_tds),
        rec: num(row.receptions),
        recYds: num(row.receiving_yards),
        recTd: num(row.receiving_tds),
        fumblesLost,
      },
    });
    written++;
  }

  console.log(
    `  ${season}: matched ${matched} player-weeks (${unmatched} unmatched), wrote ${written}.`
  );
}

async function ingestNflverse() {
  const dbPlayers = await prisma.player.findMany({
    select: { id: true, gsisId: true, name: true, position: true },
  });
  const byGsisId = new Map(dbPlayers.filter((p) => p.gsisId).map((p) => [p.gsisId!, p]));
  const byNameAndPosition = new Map(
    dbPlayers.map((p) => [`${normalizeName(p.name)}|${p.position}`, p])
  );

  for (const season of SEASONS_TO_INGEST) {
    await ingestSeason(season, byGsisId, byNameAndPosition);
  }
}

ingestNflverse()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
