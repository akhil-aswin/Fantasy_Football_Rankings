import { prisma } from "../lib/prisma";
import {
  CURRENT_SEASON,
  PREVIOUS_SEASON,
  REGULAR_SEASON_WEEKS,
  SKILL_POSITIONS,
  StatLine,
  EMPTY_STAT_LINE,
  SkillPosition,
} from "./config";

const SLEEPER_BASE = "https://api.sleeper.app";

interface SleeperPlayer {
  player_id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  position: string | null;
  team: string | null;
  status: string | null;
  espn_id: number | string | null;
  gsis_id: string | null;
  fantasy_positions: string[] | null;
}

function isSkillPosition(position: string | null): position is SkillPosition {
  return !!position && (SKILL_POSITIONS as readonly string[]).includes(position);
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Request failed ${res.status} for ${url}`);
  }
  return res.json() as Promise<T>;
}

async function ingestPlayers(): Promise<Set<string>> {
  console.log("Fetching Sleeper player list...");
  const players = await fetchJson<Record<string, SleeperPlayer>>(
    `${SLEEPER_BASE}/v1/players/nfl`
  );

  const relevantIds = new Set<string>();
  let upserted = 0;

  for (const p of Object.values(players)) {
    if (!isSkillPosition(p.position) || !p.team) continue;

    const name = p.full_name ?? [p.first_name, p.last_name].filter(Boolean).join(" ");
    if (!name) continue;

    await prisma.player.upsert({
      where: { id: p.player_id },
      create: {
        id: p.player_id,
        espnId: p.espn_id != null ? String(p.espn_id) : null,
        gsisId: p.gsis_id || null,
        name,
        position: p.position!,
        team: p.team,
        status: p.status,
      },
      update: {
        espnId: p.espn_id != null ? String(p.espn_id) : null,
        gsisId: p.gsis_id || null,
        name,
        position: p.position!,
        team: p.team,
        status: p.status,
      },
    });
    relevantIds.add(p.player_id);
    upserted++;
  }

  console.log(`Upserted ${upserted} skill-position players.`);
  return relevantIds;
}

function mapSleeperStats(stats: Record<string, number> | undefined): StatLine {
  if (!stats) return { ...EMPTY_STAT_LINE };
  return {
    games: stats.gp ?? null,
    passYds: stats.pass_yd ?? 0,
    passTd: stats.pass_td ?? 0,
    passInt: stats.pass_int ?? 0,
    rushYds: stats.rush_yd ?? 0,
    rushTd: stats.rush_td ?? 0,
    rec: stats.rec ?? 0,
    recYds: stats.rec_yd ?? 0,
    recTd: stats.rec_td ?? 0,
    fumblesLost: stats.fum_lost ?? 0,
  };
}

function addStatLines(a: StatLine, b: StatLine): StatLine {
  return {
    games: (a.games ?? 0) + (b.games ?? 0),
    passYds: a.passYds + b.passYds,
    passTd: a.passTd + b.passTd,
    passInt: a.passInt + b.passInt,
    rushYds: a.rushYds + b.rushYds,
    rushTd: a.rushTd + b.rushTd,
    rec: a.rec + b.rec,
    recYds: a.recYds + b.recYds,
    recTd: a.recTd + b.recTd,
    fumblesLost: a.fumblesLost + b.fumblesLost,
  };
}

interface SleeperProjectionEntry {
  player_id: string;
  stats: Record<string, number>;
}

async function ingestSeasonProjections(relevantIds: Set<string>) {
  console.log(`Fetching Sleeper weekly projections for ${CURRENT_SEASON}...`);
  const seasonTotals = new Map<string, StatLine>();

  for (const week of REGULAR_SEASON_WEEKS) {
    const url = `${SLEEPER_BASE}/projections/nfl/${CURRENT_SEASON}/${week}?season_type=regular&position[]=QB&position[]=RB&position[]=WR&position[]=TE`;
    let entries: SleeperProjectionEntry[];
    try {
      entries = await fetchJson<SleeperProjectionEntry[]>(url);
    } catch (err) {
      console.warn(`  week ${week}: failed to fetch projections (${err}), skipping`);
      continue;
    }

    for (const entry of entries) {
      if (!relevantIds.has(entry.player_id)) continue;
      const line = mapSleeperStats(entry.stats);
      const existing = seasonTotals.get(entry.player_id) ?? { ...EMPTY_STAT_LINE, games: 0 };
      seasonTotals.set(entry.player_id, addStatLines(existing, line));
    }
  }

  let written = 0;
  for (const [playerId, line] of seasonTotals) {
    await prisma.projectionStatLine.upsert({
      where: {
        playerId_source_season_week: {
          playerId,
          source: "sleeper",
          season: CURRENT_SEASON,
          week: 0,
        },
      },
      create: { playerId, source: "sleeper", season: CURRENT_SEASON, week: 0, ...line },
      update: { ...line },
    });
    written++;
  }
  console.log(`Wrote ${written} season-long Sleeper projections for ${CURRENT_SEASON}.`);
}

async function ingestActuals(relevantIds: Set<string>) {
  console.log(`Fetching Sleeper weekly actual stats for ${PREVIOUS_SEASON}...`);
  let written = 0;

  for (const week of REGULAR_SEASON_WEEKS) {
    const url = `${SLEEPER_BASE}/v1/stats/nfl/regular/${PREVIOUS_SEASON}/${week}`;
    let statsByPlayer: Record<string, Record<string, number>>;
    try {
      statsByPlayer = await fetchJson(url);
    } catch (err) {
      console.warn(`  week ${week}: failed to fetch actuals (${err}), skipping`);
      continue;
    }

    for (const [playerId, stats] of Object.entries(statsByPlayer)) {
      if (!relevantIds.has(playerId)) continue;
      const { games, ...line } = mapSleeperStats(stats);
      if ((games ?? 0) <= 0) continue; // didn't play this week

      await prisma.actualStatLine.upsert({
        where: {
          playerId_source_season_week: {
            playerId,
            source: "sleeper",
            season: PREVIOUS_SEASON,
            week,
          },
        },
        create: { playerId, source: "sleeper", season: PREVIOUS_SEASON, week, ...line },
        update: { ...line },
      });
      written++;
    }
  }
  console.log(`Wrote ${written} weekly Sleeper actual stat lines for ${PREVIOUS_SEASON}.`);
}

async function ingestSleeper() {
  const relevantIds = await ingestPlayers();
  await ingestSeasonProjections(relevantIds);
  await ingestActuals(relevantIds);
  return relevantIds;
}

ingestSleeper()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
