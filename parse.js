// Parsing and date helpers. No DOM here so it can be tested with Node.

// Wordle #0 was June 19, 2021.
const EPOCH_UTC = Date.UTC(2021, 5, 19);
const DAY_MS = 864e5;

export function puzzleForDate(d = new Date()) {
  const utc = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((utc - EPOCH_UTC) / DAY_MS);
}

export function dateForPuzzle(n) {
  const d = new Date(EPOCH_UTC + n * DAY_MS);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

// Normal colors, plus the high-contrast colors (orange = correct, blue = present).
const TILE = { '🟩': 'g', '🟧': 'g', '🟨': 'y', '🟦': 'y', '⬛': 'b', '⬜': 'b' };

/**
 * Parse the text Wordle's Share button copies, e.g.
 *   Wordle 1,938 6/6*
 *   🟨🟨🟨⬜⬜
 *   ...
 * Returns {puzzle, score (1-6 or "X"), hard, grid: ["gybbb", ...]} or null.
 */
export function parseShare(text) {
  if (!text) return null;
  const m = String(text).match(/Wordle\s+#?\s*([\d][\d,.\s]*?)\s+([1-6xX])\s*\/\s*6(\*)?/);
  if (!m) return null;
  const puzzle = parseInt(m[1].replace(/\D/g, ''), 10);
  if (!Number.isFinite(puzzle)) return null;
  const score = m[2].toUpperCase() === 'X' ? 'X' : Number(m[2]);

  const grid = [];
  for (const line of String(text).split(/\r?\n/)) {
    const tiles = [...line.trim()].filter((ch) => ch in TILE).map((ch) => TILE[ch]);
    if (tiles.length === 5) grid.push(tiles.join(''));
  }
  return { puzzle, score, hard: Boolean(m[3]), grid: grid.slice(0, 6) };
}

/** Points for a score; a failed puzzle (X) counts as failScore (default 7). */
export function points(score, failScore = 7) {
  return score === 'X' ? failScore : Number(score);
}
