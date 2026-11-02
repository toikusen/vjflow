// A character's surface while it is read: solid, a readable dot screen, or a heavy outline. One state for the whole of the
// reading, chosen by how much ink the character has: what would fill in on a dense character falls back to solid.

export type InkState = 'solid' | 'dots' | 'outline' | 'soft' | 'block' | 'edge';

/** The dot pitch in px at this type size: finer on dense characters so a thin stroke still takes several dots. */
export function dotPitch(size: number, coverage: number): number {
  const fine = Math.min(1, Math.max(0, (coverage - 0.35) / 0.3));
  return Math.max(4, size * (0.075 - 0.03 * fine));
}

/** Above this share of ink in its square, in the outline's own cut, a heavy outline closes the counters (black 愛 measures 0.59, 鬱 0.65). */
const OUTLINE_MAX = 0.55;
/** The same limit for an outline lying behind a character of medium weight: thin, and outside it. */
const EDGE_MAX = 0.62;
/** Under this size the dot screen stops resolving into a surface and only dirties the strokes. */
const DOTS_MIN_SIZE = 110;

/** The soft body's side in px: shallower on dense characters, whose counters a deep side would close. */
export function softDepth(size: number, coverage: number): number {
  const dense = Math.min(1, Math.max(0, (coverage - 0.4) / 0.2));
  return Math.round(size * (0.05 - 0.032 * dense));
}

/** A pressed character's hard thickness in px: never so deep on a dense one that its counters fill. */
export function pressDepth(size: number, coverage: number): number {
  const dense = Math.min(1, Math.max(0, (coverage - 0.4) / 0.2));
  return Math.round(size * (0.085 - 0.05 * dense));
}

/** Which pixels of a width × height alpha mask the outside reaches: what is left is the silhouette with its counters kept whole. */
export function exteriorOf(alpha: (i: number) => number, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h);
  const stack: number[] = [];
  const push = (i: number) => {
    if (out[i] || alpha(i) > 96) return;
    out[i] = 1;
    stack.push(i);
  };
  for (let x = 0; x < w; x++) (push(x), push((h - 1) * w + x));
  for (let y = 0; y < h; y++) (push(y * w), push(y * w + w - 1));
  while (stack.length) {
    const i = stack.pop()!;
    const [x, y] = [i % w, Math.floor(i / w)];
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (y > 0) push(i - w);
    if (y < h - 1) push(i + w);
  }
  return out;
}

/** Under this size the side is a smudge under the strokes, not a body. */
const SOFT_MIN_SIZE = 72;

/** The state a line can actually hold: its densest character decides, for the whole line. */
export function stateFor(want: InkState, size: number, densest: number): InkState {
  if (want === 'outline' && densest > OUTLINE_MAX) return 'solid';
  if (want === 'dots' && size < DOTS_MIN_SIZE) return 'solid';
  if (want === 'soft' && size < SOFT_MIN_SIZE) return 'solid';
  if (want === 'block' && size < SOFT_MIN_SIZE) return 'solid';
  if (want === 'edge' && (size < SOFT_MIN_SIZE || densest > EDGE_MAX)) return 'solid';
  return want;
}

/** How many rows light up in a block `height` tall. */
export const lightRows = (height: number, size: number) => Math.max(4, Math.min(16, Math.round(height / (size * 0.2))));

/** The share of the block lit at entrance progress k: whole rows at a time, the last one landing exactly at k = 1. */
export function litShare(k: number, rows: number): number {
  if (k >= 1) return 1;
  return Math.floor(Math.max(0, k) * rows) / rows;
}

/** The unlit rows' strength while the line lights up. */
export const UNLIT = 0.14;

/** The two screens a line resolves through, as a share of the type size, coarse then fine. */
export const GRAIN_PITCH = [0.095, 0.062] as const;

/** Which screen a spot `share` of the way across the block is on at k: 0, 1, then 2 for the character itself; all 2 from k = 1. */
export function grainStep(share: number, k: number): 0 | 1 | 2 {
  const q = (k - 0.36 * share) / 0.64;
  return k >= 1 || q >= 1 ? 2 : q < 0.48 ? 0 : 1;
}
