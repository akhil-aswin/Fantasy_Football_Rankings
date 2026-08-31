import { EMPTY_STAT_LINE, POSITIONS, Position, PlayerData, StatLine } from "./types";

export interface ScoringSettings {
  passYd: number; // points per passing yard
  passTd: number; // points per passing TD
  passInt: number; // points per interception thrown (usually negative)
  rushYd: number; // points per rushing yard
  rushTd: number; // points per rushing TD
  rec: number; // points per reception (0 standard, 0.5 half-PPR, 1 full PPR)
  recYd: number; // points per receiving yard
  recTd: number; // points per receiving TD
  fumbleLost: number; // points per fumble lost (usually negative)
  teReceptionBonus: number; // extra points per TE reception (TE premium)
}

export const SCORING_PRESETS: Record<string, ScoringSettings> = {
  standard: {
    passYd: 0.04,
    passTd: 4,
    passInt: -2,
    rushYd: 0.1,
    rushTd: 6,
    rec: 0,
    recYd: 0.1,
    recTd: 6,
    fumbleLost: -2,
    teReceptionBonus: 0,
  },
  halfPpr: {
    passYd: 0.04,
    passTd: 4,
    passInt: -2,
    rushYd: 0.1,
    rushTd: 6,
    rec: 0.5,
    recYd: 0.1,
    recTd: 6,
    fumbleLost: -2,
    teReceptionBonus: 0,
  },
  ppr: {
    passYd: 0.04,
    passTd: 4,
    passInt: -2,
    rushYd: 0.1,
    rushTd: 6,
    rec: 1,
    recYd: 0.1,
    recTd: 6,
    fumbleLost: -2,
    teReceptionBonus: 0,
  },
};

export interface LeagueSettings {
  teams: number;
  bench: number; // roster bench slots — doesn't factor into starter-based VORP
  starters: {
    QB: number;
    RB: number;
    WR: number;
    TE: number;
    FLEX: number; // RB/WR/TE eligible
    SUPERFLEX: number; // QB/RB/WR/TE eligible
  };
}

export const DEFAULT_LEAGUE_SETTINGS: LeagueSettings = {
  teams: 12,
  bench: 6,
  starters: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, SUPERFLEX: 0 },
};

export interface RankingWeights {
  sourceWeights: Record<string, number>; // e.g. { sleeper: 1, espn: 1 }
  trustProjection: number; // 0..1, 1 = pure projection, 0 = pure history
  vorpInfluence: number; // 0..~2, scales how much positional scarcity matters
  seasonRecencyDecay: number; // 0..1, weight multiplier applied per season further back
}

export const DEFAULT_RANKING_WEIGHTS: RankingWeights = {
  sourceWeights: {},
  trustProjection: 0.7,
  vorpInfluence: 1,
  seasonRecencyDecay: 0.6,
};

const DEFAULT_GAMES = 17;

export function scoreStatLine(
  line: StatLine,
  settings: ScoringSettings,
  position: Position
): number {
  let points =
    line.passYds * settings.passYd +
    line.passTd * settings.passTd +
    line.passInt * settings.passInt +
    line.rushYds * settings.rushYd +
    line.rushTd * settings.rushTd +
    line.rec * settings.rec +
    line.recYds * settings.recYd +
    line.recTd * settings.recTd +
    line.fumblesLost * settings.fumbleLost;

  if (position === "TE") {
    points += line.rec * settings.teReceptionBonus;
  }
  return points;
}

// Weighted average of a stat line across whichever sources are actually
// available for a player — missing sources don't drag the average down,
// weights are renormalized over the sources present.
export function blendStatLines(
  sources: { source: string; statLine: StatLine }[],
  sourceWeights: Record<string, number>
): StatLine {
  if (sources.length === 0) return { ...EMPTY_STAT_LINE };

  const weighted = sources.map((s) => ({
    statLine: s.statLine,
    weight: sourceWeights[s.source] ?? 1,
  }));
  const totalWeight = weighted.reduce((sum, w) => sum + w.weight, 0);
  if (totalWeight <= 0) return { ...EMPTY_STAT_LINE };

  const keys: Exclude<keyof StatLine, "games">[] = [
    "passYds",
    "passTd",
    "passInt",
    "rushYds",
    "rushTd",
    "rec",
    "recYds",
    "recTd",
    "fumblesLost",
  ];

  const result = { ...EMPTY_STAT_LINE };
  for (const key of keys) {
    result[key] = weighted.reduce((sum, w) => sum + w.statLine[key] * w.weight, 0) / totalWeight;
  }

  const games = weighted
    .filter((w) => w.statLine.games != null)
    .reduce((sum, w) => sum + w.statLine.games! * w.weight, 0);
  const gamesWeight = weighted
    .filter((w) => w.statLine.games != null)
    .reduce((sum, w) => sum + w.weight, 0);
  result.games = gamesWeight > 0 ? games / gamesWeight : null;

  return result;
}

interface PlayerProjection {
  player: PlayerData;
  blendedSeasonPoints: number; // this-season projected total, current scoring settings
  historicalPtsPerGame: number; // recency-weighted actual points/game, current scoring settings
  blendedPtsPerGame: number; // trustProjection-weighted combination
  gamesAssumed: number;
  seasonScore: number; // blendedPtsPerGame * gamesAssumed — pre-VORP ranking value
}

function projectPlayer(
  player: PlayerData,
  scoring: ScoringSettings,
  weights: RankingWeights
): PlayerProjection {
  const blendedProjLine = blendStatLines(player.projections, weights.sourceWeights);
  const blendedSeasonPoints = scoreStatLine(blendedProjLine, scoring, player.position);
  const gamesAssumed = blendedProjLine.games ?? DEFAULT_GAMES;
  const blendedProjPtsPerGame = gamesAssumed > 0 ? blendedSeasonPoints / gamesAssumed : 0;

  let historicalWeightSum = 0;
  let historicalPtsSum = 0;
  player.actuals.forEach((season, idx) => {
    if (season.games <= 0) return;
    const seasonLine = blendStatLines(season.sources, weights.sourceWeights);
    const seasonPoints = scoreStatLine(seasonLine, scoring, player.position);
    const ptsPerGame = seasonPoints / season.games;
    const recencyWeight = Math.pow(weights.seasonRecencyDecay, idx);
    historicalPtsSum += ptsPerGame * recencyWeight;
    historicalWeightSum += recencyWeight;
  });
  const historicalPtsPerGame = historicalWeightSum > 0 ? historicalPtsSum / historicalWeightSum : 0;

  const hasProjection = player.projections.length > 0;
  const hasHistory = historicalWeightSum > 0;
  let blendedPtsPerGame: number;
  if (hasProjection && hasHistory) {
    blendedPtsPerGame =
      weights.trustProjection * blendedProjPtsPerGame +
      (1 - weights.trustProjection) * historicalPtsPerGame;
  } else if (hasProjection) {
    blendedPtsPerGame = blendedProjPtsPerGame;
  } else {
    blendedPtsPerGame = historicalPtsPerGame;
  }

  return {
    player,
    blendedSeasonPoints,
    historicalPtsPerGame,
    blendedPtsPerGame,
    gamesAssumed,
    seasonScore: blendedPtsPerGame * gamesAssumed,
  };
}

// Greedy replacement-level calculation: simulates filling every starting
// (including FLEX/SUPERFLEX) slot across the league by always taking the
// next-highest-scoring available player for an open-eligible slot. The last
// player drafted into a starting slot at each position defines that
// position's replacement level — this makes "roster competition" fall out
// of the league's own settings rather than fixed assumptions about how
// often FLEX gets used on each position.
export function computeReplacementLevels(
  scoresByPosition: Record<Position, number[]>, // each array sorted descending
  league: LeagueSettings
): Record<Position, number> {
  const idx: Record<Position, number> = { QB: 0, RB: 0, WR: 0, TE: 0 };
  const replacement: Record<Position, number> = { QB: 0, RB: 0, WR: 0, TE: 0 };

  const dedicated: Record<Position, number> = {
    QB: league.starters.QB,
    RB: league.starters.RB,
    WR: league.starters.WR,
    TE: league.starters.TE,
  };

  for (const pos of POSITIONS) {
    let remaining = league.teams * dedicated[pos];
    while (remaining > 0 && idx[pos] < scoresByPosition[pos].length) {
      replacement[pos] = scoresByPosition[pos][idx[pos]];
      idx[pos]++;
      remaining--;
    }
  }

  const fillFromPool = (eligiblePositions: Position[], slots: number) => {
    let remaining = slots;
    while (remaining > 0) {
      let bestPos: Position | null = null;
      let bestVal = -Infinity;
      for (const pos of eligiblePositions) {
        const val = scoresByPosition[pos][idx[pos]];
        if (val !== undefined && val > bestVal) {
          bestVal = val;
          bestPos = pos;
        }
      }
      if (!bestPos) break;
      replacement[bestPos] = bestVal;
      idx[bestPos]++;
      remaining--;
    }
  };

  fillFromPool(["RB", "WR", "TE"], league.teams * league.starters.FLEX);
  fillFromPool(["QB", "RB", "WR", "TE"], league.teams * league.starters.SUPERFLEX);

  return replacement;
}

export interface RankedPlayer {
  id: string;
  name: string;
  position: Position;
  team: string | null;
  status: string | null;
  seasonPoints: number; // blended points/game * games, pre-VORP
  pointsPerGame: number;
  vorp: number;
  compositeScore: number;
  sources: { source: string; hasProjection: boolean }[];
}

export function rankPlayers(
  players: PlayerData[],
  scoring: ScoringSettings,
  league: LeagueSettings,
  weights: RankingWeights,
  // When provided, replacement levels (and therefore VORP for every player,
  // drafted or not) are computed from only this pool — so as players get
  // drafted off the board, everyone's VORP reflects the actual remaining
  // player pool rather than the preseason-wide one. Omit to treat every
  // player as available (e.g. before a draft has started).
  availableIds?: Set<string>
): RankedPlayer[] {
  const projections = players.map((p) => projectPlayer(p, scoring, weights));

  const scoresByPosition: Record<Position, number[]> = { QB: [], RB: [], WR: [], TE: [] };
  for (const proj of projections) {
    if (!availableIds || availableIds.has(proj.player.id)) {
      scoresByPosition[proj.player.position].push(proj.seasonScore);
    }
  }
  for (const pos of POSITIONS) {
    scoresByPosition[pos].sort((a, b) => b - a);
  }

  const replacementLevels = computeReplacementLevels(scoresByPosition, league);

  const ranked: RankedPlayer[] = projections.map((proj) => {
    const vorp = proj.seasonScore - replacementLevels[proj.player.position];
    return {
      id: proj.player.id,
      name: proj.player.name,
      position: proj.player.position,
      team: proj.player.team,
      status: proj.player.status,
      seasonPoints: proj.seasonScore,
      pointsPerGame: proj.blendedPtsPerGame,
      vorp,
      compositeScore: proj.seasonScore + weights.vorpInfluence * vorp,
      sources: proj.player.projections.map((s) => ({ source: s.source, hasProjection: true })),
    };
  });

  ranked.sort((a, b) => b.compositeScore - a.compositeScore);
  return ranked;
}

export interface RosterSlot {
  id: string;
  label: string;
  eligiblePositions: Position[];
  player: RankedPlayer | null;
}

// Assigns a drafted-by-me roster to starting slots using the same
// greedy highest-value-fills-the-slot approach as computeReplacementLevels,
// so "who's my best RB2" etc. is answered consistently with how the league's
// replacement levels are derived. Bench slots are filled from RB/WR/TE depth
// only — QB scoring is flat position-wide (there's little value gap between
// a QB12 and QB20 the way there is between an RB12 and RB20), so a second or
// third QB has essentially no standalone bench value in single-QB leagues
// and shouldn't crowd out real bench-worthy skill-position depth. Anything
// left over (e.g. an extra QB you deliberately rostered) goes to overflow.
export function buildRoster(
  myPlayers: RankedPlayer[],
  league: LeagueSettings
): { starterSlots: RosterSlot[]; benchSlots: RosterSlot[]; overflow: RankedPlayer[] } {
  const byPosition: Record<Position, RankedPlayer[]> = { QB: [], RB: [], WR: [], TE: [] };
  for (const p of myPlayers) byPosition[p.position].push(p);
  for (const pos of POSITIONS) byPosition[pos].sort((a, b) => b.compositeScore - a.compositeScore);

  const idx: Record<Position, number> = { QB: 0, RB: 0, WR: 0, TE: 0 };
  const starterSlots: RosterSlot[] = [];

  for (const pos of POSITIONS) {
    for (let i = 0; i < league.starters[pos]; i++) {
      const player = byPosition[pos][idx[pos]] ?? null;
      if (player) idx[pos]++;
      starterSlots.push({ id: `${pos}-${i}`, label: pos, eligiblePositions: [pos], player });
    }
  }

  const fillFromPool = (
    eligiblePositions: Position[],
    count: number,
    label: string,
    target: RosterSlot[]
  ) => {
    for (let i = 0; i < count; i++) {
      let bestPos: Position | null = null;
      let bestScore = -Infinity;
      for (const pos of eligiblePositions) {
        const candidate = byPosition[pos][idx[pos]];
        if (candidate && candidate.compositeScore > bestScore) {
          bestScore = candidate.compositeScore;
          bestPos = pos;
        }
      }
      const player = bestPos ? byPosition[bestPos][idx[bestPos]] : null;
      if (bestPos) idx[bestPos]++;
      target.push({ id: `${label}-${i}`, label, eligiblePositions, player: player ?? null });
    }
  };

  fillFromPool(["RB", "WR", "TE"], league.starters.FLEX, "FLEX", starterSlots);
  fillFromPool(["QB", "RB", "WR", "TE"], league.starters.SUPERFLEX, "SUPERFLEX", starterSlots);

  const benchSlots: RosterSlot[] = [];
  fillFromPool(["RB", "WR", "TE"], league.bench, "BN", benchSlots);

  const overflow: RankedPlayer[] = POSITIONS.flatMap((pos) => byPosition[pos].slice(idx[pos])).sort(
    (a, b) => b.compositeScore - a.compositeScore
  );

  return { starterSlots, benchSlots, overflow };
}

// The single best pick recommendation right now: the highest-compositeScore
// available player who can actually start or bench for you (fills a still-
// open slot, including FLEX/SUPERFLEX/bench eligibility) — falls back to
// best overall available player once your whole roster is full.
export function bestAvailablePick(
  available: RankedPlayer[],
  slots: RosterSlot[]
): RankedPlayer | null {
  const openPositions = new Set<Position>();
  for (const slot of slots) {
    if (!slot.player) for (const pos of slot.eligiblePositions) openPositions.add(pos);
  }

  const pool =
    openPositions.size > 0 ? available.filter((p) => openPositions.has(p.position)) : available;
  if (pool.length === 0) return null;

  return pool.reduce((best, p) => (p.compositeScore > best.compositeScore ? p : best), pool[0]);
}
