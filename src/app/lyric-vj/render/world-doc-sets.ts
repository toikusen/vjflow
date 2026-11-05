// The document world's own layouts (感熱收據, boards 2026-11-05, out/research/boards-receipt/boards/receipt.html), as
// numbers measured off the boards at 1920 × 1080 (see world-sets.ts): where an item line prints at the head of the
// continuous feed (board d's lower strip size), where the TOTAL prints under its double rule (board a's red line), the new
// strip hanging from the top printer (board b), the TOTAL close-up (board c) and the strip under the one being torn off
// (board d). Every set is laid into its page (`fixed`): the receipt's rules, numbers and printer are drawn round it.
// Never vertical: a receipt prints across.
import type { SetSpec } from './world-sets';

const base = { lead: 1.16, track: 0.02, rows: [1, 2] as [number, number], lo: 70, flush: -1 as const, keepRows: true, fixed: true, on: ['plate'] as SetSpec['on'] };
const item = { ...base, ink: 'plateInk' as const, key: 'plateInk' as const };
const total = { ...base, ink: 'accent' as const, key: 'accent' as const };
/** The printer's mouth along the frame's bottom (boards a, d) and top (board b). A set's `clear` also holds every stretch
 * of bare counter and every torn edge: a call beside the line is set on paper or not at all (its ink is read on the paper). */
const MOUTH_LOW: [number, number, number, number] = [0, 0.86, 1, 1];
const MOUTH_HIGH: [number, number, number, number] = [0, 0, 1, 0.1];

export const DOC_SETS: Record<string, SetSpec> = {
  // a/d: an item printed at the head of the continuous feed, its number and part above it, the items before it above those
  'document/feed': { ...item, at: [0.0677, 0.8], ax: -1, ay: 1, share: 0.86, tall: 0.36, hi: 180, clear: [MOUTH_LOW, [0.03, 0, 0.97, 0.4]] },
  // a: the TOTAL at the feed's head, under the double rule and 合計, in the second colour
  'document/feed-total': { ...total, at: [0.0677, 0.8], ax: -1, ay: 1, share: 0.865, tall: 0.34, hi: 200, clear: [MOUTH_LOW, [0.03, 0, 0.97, 0.36]] },
  // b: a line of two phrases relayed across two strips: its first on the strip torn and set down at the lower left, its
  // last on the new strip hanging from the top printer, larger
  'document/relay': { ...item, split: { small: 'lead', scale: 0.56, at: [0.057, 0.73], ax: -1, share: 0.46, wide: 0.54, tall: 0.4 }, at: [0.38, 0.2185], ax: -1, ay: -1, share: 0.54, tall: 0.4, hi: 210, clear: [MOUTH_HIGH, [0, 0.1, 0.33, 0.5], [0.58, 0.66, 1, 1]] },
  // c: the TOTAL close-up, big enough that the head's dots show; a line of two phrases prints its first as the item
  // above the double rule, in black, and its last as the TOTAL
  'document/total': { ...total, split: { small: 'lead', scale: 0.2, ink: 'plateInk', at: [0.135, 0.12], ax: -1, share: 0.66 }, at: [0.0625, 0.305], ax: -1, ay: -1, share: 0.875, tall: 0.44, hi: 400, clear: [[0.06, 0.16, 0.94, 0.3], [0.06, 0.77, 0.94, 0.9]] },
  // d: a line of two phrases across the tear: its first on the piece just torn off, its last on the strip fed out under it
  'document/tear': { ...item, split: { small: 'lead', scale: 1, at: [0.0625, 0.235], ax: -1, share: 0.8, wide: 0.78, tall: 0.23 }, at: [0.0625, 0.626], ax: -1, ay: -1, share: 0.78, tall: 0.23, hi: 180, clear: [MOUTH_LOW, [0, 0, 1, 0.56]] },
  // two quick verse lines, two item rows of the feed (a's 01 and 02), each numbered at the left
  'document/pair': { ...item, at: [0.123, 0.56], ax: -1, ay: 0, share: 0.7, tall: 0.5, hi: 130, lead: 1.2, clear: [MOUTH_LOW] },
};
