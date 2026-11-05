// The document world's own layouts (感熱收據, second boards 2026-11-05, out/research/boards-receipt-v2/boards/receipt.html),
// as numbers at 1920 × 1080 (see world-sets.ts): where the line prints 倍角 on the narrow roll. The camera is on the stretch
// of the roll round the line, a little closer than the boards' whole receipt (the paper about 53 % of the frame, boards
// 40–50 %), so the line is the largest thing in it. feed (a): the line just over the printer's tear bar; sheet (b): the
// slip lying still, the line a little higher, blank roll under it; total (c): the closing line near the top, the tail
// printing under it once it is sung; pair: two quick lines as two rows. Every set is laid into its page (`fixed`): the
// receipt's rows, rules and printer are drawn round it (world-doc-receipt.ts). Never vertical: a receipt prints across.
import type { SetSpec } from './world-sets';

/** The paper's left and right edges on each page, frame px. */
export const ROLL = { feed: [450, 1470], sheet: [470, 1450], total: [450, 1470] } as const;
/** Print margin inside the paper's edges. */
export const MARGIN = 60;
/** The small print's head: cells a size, and the pitches of past item rows, the shop block's name, the rest of the block, the 合計 row. */
export const SMALL_G = 24;
export const PITCH = { row: 1.2, shop: 1.3, head: 1.0, total: 1.4 };
/** The largest small print, px a size. */
export const SMALL_MAX = Math.max(...Object.values(PITCH)) * SMALL_G;
/** The line is never printed under this size, px: 2.5 times the largest small print round it. */
export const LYRIC_LEAST = Math.ceil(SMALL_MAX * 2.5);

const across = (r: readonly [number, number]) => ({ x: (r[0] + MARGIN) / 1920, share: (r[1] - r[0] - 2 * MARGIN) / 1920 });
const feed = across(ROLL.feed);
const sheet = across(ROLL.sheet);
const total = across(ROLL.total);

// (one ink a line, plain: a key word takes no colour of its own, the red is the closing line's alone; a box a third of the
// frame tall keeps a line to two rows unless it is long: a third row only where two would set it under the type floor;
// a run with no break of its own wraps at the paper's width, as the printer does)
const base = { lead: 1.16, track: 0.02, rows: [1, 3] as [number, number], lo: LYRIC_LEAST, hi: 170, flush: -1 as const, keepRows: true, fixed: true, plain: true, wrap: true, on: ['plate'] as SetSpec['on'] };
const item = { ...base, ink: 'plateInk' as const, key: 'plateInk' as const };
/** The desk either side of the roll: a call beside the line is set on paper or not at all. */
const desk = (r: readonly [number, number]): [number, number, number, number][] => [[0, 0, r[0] / 1920, 1], [r[1] / 1920, 0, 1, 1]];
/** The printer's mouth along the frame's foot (board a). */
const MOUTH: [number, number, number, number] = [0, 0.88, 1, 1];

export const DOC_SETS: Record<string, SetSpec> = {
  // a: the line printed at the head, its foot just over the quantity row and the tear bar
  'document/feed': { ...item, at: [feed.x, 0.8296], ax: -1, ay: 1, share: feed.share, tall: 0.32, clear: [MOUTH, ...desk(ROLL.feed)] },
  // b: the slip lying on the desk, the line over the blank roll still to print
  'document/sheet': { ...item, at: [sheet.x, 0.76], ax: -1, ay: 1, share: sheet.share, tall: 0.32, clear: desk(ROLL.sheet) },
  // c: the closing line in the paper's second colour, near the top: the tail prints under it
  'document/total': { ...base, ink: 'accent', key: 'accent', at: [total.x, 0.1704], ax: -1, ay: -1, share: total.share, tall: 0.3, clear: [[0, 0.5, 1, 1], ...desk(ROLL.total)] },
  // two quick lines at the head of the feed, a half of the box each (up to two rows a line), the second line's foot just
  // over the quantity row
  'document/pair': { ...item, rows: [1, 3], lead: 1.2, at: [feed.x, 0.595], ax: -1, ay: 0, share: feed.share, tall: 0.5, clear: [MOUTH, ...desk(ROLL.feed)] },
};
