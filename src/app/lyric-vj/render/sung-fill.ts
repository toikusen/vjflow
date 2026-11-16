// Continuous sung fill (idle 'fill'): the line stands whole and fully readable in its own ink from the moment it is up;
// each glyph's own picture takes a key ink left to right (top to bottom in a column) as the character is sung
// (material-patch.ts sungFill: no copy over the glyph). Nothing waits pale: the unsung text keeps its full ink, so no row reads as a line left behind. Pure numbers.
// Idea after claude-animated-text #41 "kara" (pound / POUND0423, MIT); the code here is our own, and it runs on the
// song's own sung times instead of a fixed rate.
import { keyInk } from './key-ink';

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
 * The fill's ink: the accent, or another of the pool, moved until it reads 4.5:1 on every ground under the line and
 * stands visibly apart from the body ink (key-ink.ts keyInk), so both the filled and the unfilled part read.
 */
export function fillInk(accent: string, pool: string[], body: string, grounds: string[]): string {
  return keyInk(accent, pool, body, grounds, 4.5);
}
