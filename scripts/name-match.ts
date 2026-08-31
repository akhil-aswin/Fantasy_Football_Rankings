const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);
const COMBINING_DIACRITICS = /[̀-ͯ]/g;

// Normalizes a player name for cross-source matching: lowercase, strip
// punctuation/diacritics and generational suffixes (Sleeper and ESPN
// disagree on "Jr."/periods/apostrophes often enough to break exact matches).
export function normalizeName(name: string): string {
  const cleaned = name
    .normalize("NFD")
    .replace(COMBINING_DIACRITICS, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim();

  const parts = cleaned.split(/\s+/).filter((p) => !SUFFIXES.has(p));
  return parts.join(" ");
}
