import { POSITIONS, type Position } from "../lib/types";

export { EMPTY_STAT_LINE, type StatLine } from "../lib/types";
export { POSITIONS as SKILL_POSITIONS };
export type SkillPosition = Position;

// NFL season "year" rolls over in March (new league year / free agency),
// well before the season's own games start in September.
function currentNflSeason(): number {
  const now = new Date();
  const year = now.getFullYear();
  return now.getMonth() >= 2 /* March */ ? year : year - 1;
}

export const CURRENT_SEASON = currentNflSeason();
export const PREVIOUS_SEASON = CURRENT_SEASON - 1;

export const REGULAR_SEASON_WEEKS = Array.from({ length: 18 }, (_, i) => i + 1);
