// How the document world's words (感熱收據, boards 2026-11-05, kept for the second boards) arrive, stay and leave, in numbers only, from the boards'
// motion notes: the paper feeds a step at a time, stopping between steps, never a smooth scroll; a line is printed by the
// head from the top down, row after row; at a line's end the paper waits a few frames, then the torn piece goes whole with
// its hard shadow, turned a little. No float, no bounce, no bend. Registered into world-motion.ts's tables by name.
import type { GlyphEnv, GlyphPose, WorldMove } from './world-motion';

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const stepsOf = (q: number, n: number) => Math.floor(clamp01(q) * n) / n;
/** The head's rows: a line is printed in this many held bands, top to bottom. */
export const PRINT_ROWS = 12;

export const DOC_ENTERS: Record<string, WorldMove> = {
  // the head prints the line from its top row down, band by band
  'head-print': { sec: 0.42, clip: (q) => ({ axis: 'y', at: q >= 1 ? 1 : stepsOf(q, PRINT_ROWS) }) },
  // the paper feeds the printed line up out of the head in three held steps, a row (world-doc-receipt ROW) with the rows above
  'feed-step': { sec: 0.3, block: (q) => ({ dy: 42 * (1 - stepsOf(q, 3)), a: q > 0.02 ? 1 : 0 }), clip: (q) => ({ axis: 'y', at: q >= 1 ? 1 : 0.34 + 0.66 * stepsOf(q, 3) }) },
};

export const DOC_EXITS: Record<string, WorldMove> = {
  // a pause of a few frames, then the piece is torn off: it goes whole, up and a little left, turning a hair, in steps
  'tear-off': { sec: 0.4, block: (q) => { const k = stepsOf((q - 0.3) / 0.7, 4); return { dy: 260 * k, dx: -50 * k, r: 0.05 * k, a: q < 0.96 ? 1 : 0 }; } },
  // the paper feeds on: the line goes up a row at a time and out
  'feed-out': { sec: 0.32, block: (q) => ({ dy: 84 * Math.ceil(clamp01(q) * 4), a: q < 0.9 ? 1 : 0 }) },
};

export const DOC_HOLDS: Record<string, (e: GlyphEnv) => GlyphPose> = {
  // a printed receipt does not move
  'receipt-still': () => ({}),
};
