export const POSITIONS = ["QB", "RB", "WR", "TE"] as const;
export type Position = (typeof POSITIONS)[number];

export interface StatLine {
  games: number | null;
  passYds: number;
  passTd: number;
  passInt: number;
  rushYds: number;
  rushTd: number;
  rec: number;
  recYds: number;
  recTd: number;
  fumblesLost: number;
}

export const EMPTY_STAT_LINE: StatLine = {
  games: null,
  passYds: 0,
  passTd: 0,
  passInt: 0,
  rushYds: 0,
  rushTd: 0,
  rec: 0,
  recYds: 0,
  recTd: 0,
  fumblesLost: 0,
};

export interface SourceStatLine {
  source: string;
  statLine: StatLine;
}

export interface SeasonActuals {
  season: number;
  games: number;
  sources: SourceStatLine[];
}

export interface PlayerData {
  id: string;
  name: string;
  position: Position;
  team: string | null;
  status: string | null;
  projections: SourceStatLine[]; // current season, one entry per source
  actuals: SeasonActuals[]; // past seasons, most recent first
}
