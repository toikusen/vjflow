// Style batch 4's own layouts, as numbers (see world-sets.ts), measured off its boards (2026-11-05, 風格第4批設計稿,
// sources out/research/boards-b4/boards/*.html): where a line stands in the phone, the blueprint and the xerox, how big it
// may go, what carries it, and where each page draws its large graphics (`clear`, kept free of calls).
import type { SetSpec } from './world-sets';

const base = { lead: 1.16, track: 0.02, rows: [1, 3] as [number, number], lo: 70 };

export const B4_SETS: Record<string, SetSpec> = {
  // phone (boards a–d): the lock screen's clock is the line, its last phrase thin and wide under it; a line typed into a
  // compose field above the keyboard; the caller's name filling an incoming call; a search field and its top suggestion
  'phone/lock': { ...base, split: { small: 'tail', scale: 0.47, track: 0.32 }, at: [0.5, 0.163], ax: 0, ay: -1, share: 0.8, tall: 0.42, hi: 250, rows: [1, 2], lead: 1.12, track: -0.01, key: 'ink', keepRows: true, clear: [[0.2917, 0.6185, 0.7083, 0.8167], [0, 0.72, 0.34, 1], [0.57, 0.575, 1, 1]], fixed: true },
  'phone/compose': { ...base, at: [0.1042, 0.239], ax: -1, ay: -1, share: 0.62, tall: 0.3, hi: 170, rows: [1, 2], lead: 1.35, track: 0.04, flush: -1, weight: 500, key: 'ink', keepRows: true, clear: [[0, 0.567, 1, 1]], fixed: true },
  // (the compose and call screens in their other theme: the same numbers, the words in the other ink)
  'phone/compose-day': { ...base, at: [0.1042, 0.239], ax: -1, ay: -1, share: 0.62, tall: 0.3, hi: 170, rows: [1, 2], lead: 1.35, track: 0.04, flush: -1, weight: 500, ink: 'plateInk', key: 'plateInk', on: ['plate'], keepRows: true, clear: [[0, 0.567, 1, 1]], fixed: true },
  'phone/call-night': { ...base, at: [0.5, 0.204], ax: 0, ay: -1, share: 0.86, tall: 0.46, hi: 420, rows: [1, 2], lead: 1.06, track: 0.02, key: 'ink', keepRows: true, clear: [[0, 0.704, 1, 1]], fixed: true },
  'phone/call': { ...base, at: [0.5, 0.204], ax: 0, ay: -1, share: 0.86, tall: 0.46, hi: 420, rows: [1, 2], lead: 1.06, track: 0.02, ink: 'plateInk', key: 'plateInk', on: ['plate'], keepRows: true, clear: [[0, 0.704, 1, 1]], fixed: true },
  'phone/search': { ...base, split: { small: 'tail', scale: 1, ink: 'plateInk', at: [0.1302, 0.3315], ax: -1, share: 0.76, wide: 0.78, tall: 0.1 }, at: [0.1406, 0.1097], ax: -1, ay: -1, share: 0.78, tall: 0.2, hi: 104, rows: [1, 2], lead: 1.04, track: 0, flush: -1, ink: 'plateInk', key: 'plateInk', on: ['plate'], keepRows: true, clear: [[0, 0.593, 1, 1], [0.05, 0.44, 0.95, 0.58]], fixed: true },
  // blueprint (boards a–d): the note of a part drawing with its last phrase a size down; two lines of a construction
  // sheet; one character a lettering square; notes 1 and 2 beside an elevation
  'blueprint/part': { ...base, split: { small: 'tail', scale: 0.75, track: 0.1 }, at: [0.0885, 0.139], ax: -1, ay: -1, share: 0.6, tall: 0.42, hi: 200, rows: [1, 2], lead: 1.12, track: 0.02, flush: -1, key: 'ink', keepRows: true, clear: [[0.07, 0.56, 0.8, 0.78], [0.74, 0.14, 0.92, 0.5], [0.71, 0.76, 0.97, 0.95]], fixed: true },
  'blueprint/construct': { ...base, at: [0.0885, 0.231], ax: -1, ay: -1, share: 0.5, tall: 0.36, hi: 170, rows: [1, 3], lead: 1.45, track: 0.06, flush: -1, weight: 400, key: 'ink', keepRows: true, clear: [[0.58, 0.1, 0.9, 0.65], [0.06, 0.66, 0.94, 0.74], [0.71, 0.84, 0.97, 0.95]], fixed: true },
  'blueprint/lettering': { ...base, at: [0.5, 0.361], ax: 0, ay: 0, share: 0.86, tall: 0.3, hi: 300, rows: [1, 1], lead: 1.2, track: 0.33, even: true, key: 'ink', keepRows: true, under: [{ kind: 'plan-cell', tone: 'ink' }], clear: [[0.08, 0.58, 0.92, 0.73], [0.71, 0.8, 0.97, 0.95]], fixed: true },
  'blueprint/notes': { ...base, split: { small: 'tail', scale: 1, at: [0.1563, 0.551], ax: -1, share: 0.6, wide: 0.6, tall: 0.16 }, at: [0.1563, 0.333], ax: -1, ay: 0, share: 0.6, tall: 0.2, hi: 190, rows: [1, 2], lead: 1.08, track: 0.02, flush: -1, key: 'ink', keepRows: true, clear: [[0.79, 0.05, 0.97, 0.82], [0.07, 0.18, 0.19, 0.26], [0.71, 0.8, 0.97, 0.95]], fixed: true },
  // xerox (boards a–d): two cut strips on fluoro-yellow stock by the open lid; two strips on a sheet blown white over a
  // scan streak; one word dragged across a copy on the black glass; two columns of strips on pink stock
  'xerox/strips': { ...base, split: { small: 'tail', scale: 0.92, track: 0.06, ink: 'plateInk', rows: 2, at: [0.5208, 0.6389], share: 0.43, tall: 0.22 }, at: [0.1042, 0.333], ax: -1, ay: 0, share: 0.68, tall: 0.3, hi: 212, rows: [1, 2], lead: 1.08, track: 0.02, flush: -1, ink: 'plateInk', key: 'plateInk', object: 'xx-strip', pad: [50, 44], keepRows: true, clear: [[0.27, 0.51, 0.78, 0.78], [0.56, 0, 0.92, 0.6], [0.85, 0, 1, 1], [0.08, 0.8, 0.36, 0.89]], fixed: true },
  'xerox/blown': { ...base, split: { small: 'tail', scale: 1, track: 0.06, ink: 'plateInk', rows: 2, at: [0.4583, 0.505], share: 0.31, wide: 0.42, tall: 0.12 }, at: [0.1771, 0.335], ax: -1, ay: 0, share: 0.6, tall: 0.24, hi: 170, rows: [1, 2], lead: 1.06, track: 0.06, flush: -1, ink: 'plateInk', key: 'plateInk', object: 'xx-strip', pad: [40, 26], keepRows: true, clear: [[0.06, 0.63, 0.94, 0.73], [0.29, 0.43, 0.63, 0.58], [0.76, 0.18, 0.82, 0.27]], fixed: true },
  'xerox/drag': { ...base, at: [0.083, 0.49], ax: -1, ay: 0, share: 0.64, tall: 0.5, hi: 440, rows: [1, 1], lead: 1.04, track: 0.02, flush: -1, ink: 'plateInk', key: 'plateInk', on: ['plate'], keepRows: true, clear: [[0, 0, 1, 0.14], [0, 0.86, 1, 1]], fixed: true },
  'xerox/columns': { ...base, split: { small: 'tail', scale: 1, ink: 'plateInk', at: [0.6188, 0.091], tall: 0.84 }, at: [0.7469, 0.12], ax: 0, ay: -1, share: 0.062, tall: 0.78, hi: 112, rows: [1, 1], vertical: true, lead: 1.15, track: 0.02, ink: 'plateInk', key: 'plateInk', on: ['plate'], keepRows: true, clear: [[0.12, 0.14, 0.56, 0.92], [0, 0, 0.13, 1], [0.82, 0.08, 0.86, 0.4]], fixed: true },
};

/**
 * Sets laid out again mirrored left to right, with their page mirrored too (`<ground>-r`). (A second part is centred on
 * its strip, never set from its left edge, so it lands on the mirrored strip too.)
 */
export const B4_MIRRORS: Record<string, string> = {
  'blueprint/construct': 'blueprint/construct', 'blueprint/part': 'blueprint/part',
  'xerox/columns': 'xerox/columns', 'xerox/strips': 'xerox/strips', 'xerox/blown': 'xerox/blown',
};
const flip = (x: -1 | 0 | 1) => (-x as -1 | 0 | 1);
for (const id of Object.keys(B4_MIRRORS)) {
  const s = B4_SETS[id];
  B4_SETS[`${id}-r`] = { ...s, at: [1 - s.at[0], s.at[1]], ax: flip(s.ax), ...(s.flush !== undefined ? { flush: flip(s.flush) } : {}), ...(s.split?.at ? { split: { ...s.split, at: [1 - s.split.at[0], s.split.at[1]] as [number, number] } } : {}), ...(s.clear ? { clear: s.clear.map(([x0, y0, x1, y1]) => [1 - x1, y0, 1 - x0, y1] as [number, number, number, number]) } : {}) };
}
