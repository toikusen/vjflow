// Continuous sung fill (idle 'fill'): the line stands whole and fully readable in its own ink from the moment it is up;
// each glyph's own picture takes a key ink left to right (top to bottom in a column) as the character is sung
// (material-patch.ts sungFill: no copy over the glyph). Nothing waits pale: the unsung text keeps its full ink, so no row reads as a line left behind. Pure numbers.
// Idea after claude-animated-text #41 "kara" (pound / POUND0423, MIT); the code here is our own, and it runs on the
// song's own sung times instead of a fixed rate.

/** The longest the last character's fill may take, s (a held vowel fills while it is held, not to the end of a long gap). */
export const FILL_TAIL = 1.2;
/** The shortest a character's fill takes, s: a burst of characters sung at once still sweeps, never blinks on. */
export const FILL_MIN = 0.06;

/**
 * When each character's fill runs, in reading order: from its own sung time to the next one's (times never step back,
 * aligner noise is held flat), the last to the line's end or FILL_TAIL after it is sung, whichever is first.
 */
export function fillSpans(ats: number[], end: number): [number, number][] {
  const mono: number[] = [];
  for (const a of ats) mono.push(Math.max(a, mono.length ? mono[mono.length - 1] : -Infinity));
  return mono.map((a, i) => {
    const next = i + 1 < mono.length ? mono[i + 1] : Math.min(end, a + FILL_TAIL);
    return [a, Math.max(a + FILL_MIN, next)];
  });
}

/** How much of one character is filled at t: 0 before its span, 1 after, even in between. */
export function fillShare(t: number, span: [number, number]): number {
  if (t <= span[0]) return 0;
  if (t >= span[1]) return 1;
  return (t - span[0]) / (span[1] - span[0]);
}

/**
 * The fill's run in a glyph's own frame: the screen direction (left to right on a row, top to bottom down a column)
 * carried into the glyph (`local`, any length; a Latin glyph turned a quarter in a vertical run gets its own x), made
 * unit, and the glyph's extent along it: its advance across its own x, its em across its own y.
 */
export function fillAxis(local: { x: number; y: number }, advance: number, size: number): { dir: [number, number]; extent: number } {
  const n = Math.hypot(local.x, local.y) || 1;
  const [x, y] = [local.x / n, local.y / n];
  return { dir: [x, y], extent: Math.abs(x) * advance + Math.abs(y) * size };
}

/** Px along the run from the glyph's centre that the fill has reached at `share` of the glyph: none before, all after. */
export const fillEdge = (share: number, extent: number) => (share <= 0 ? -1e6 : share >= 1 ? 1e6 : extent * (share - 0.5));
