// Style batch 4's cyanotype, isometric and cel80s layouts, as numbers (see world-sets.ts), measured off their boards
// (2026-11-05, 風格第4批設計稿; sources out/research/boards-b4/boards/*.html) at 1920 × 1080: where a line stands, how big
// it may go, and where each page draws its large graphics (`clear`, kept free of calls). The isometric walls and the
// italic anime titles are sheared blocks (world-sets `shear`): the words lie on the wall, the page builds the wall round them.
import type { SetSpec } from './world-sets';

const base = { lead: 1.16, track: 0.02, rows: [1, 3] as [number, number], lo: 70 };
const [C30, S30] = [Math.cos(Math.PI / 6), 0.5];
/** An isometric wall facing left (its words run down and right) and one facing right (they run up and right). */
export const ISO_L: [number, number, number, number] = [C30, S30, 0, 1];
export const ISO_R: [number, number, number, number] = [C30, -S30, 0, 1];
/** The anime title's lean, 9° (board: skewX(-9)). */
export const ITALIC: [number, number, number, number] = [1, 0, Math.tan((-9 * Math.PI) / 180), 1];
/** cel80s's title lettering under every letter, outermost first: the hard shadow, the magenta ring, the indigo ring. */
const CEL_RINGS: SetSpec['under'] = [{ kind: 'cel-drop', tone: 'plateInk' }, { kind: 'cel-outer', tone: 'ink2' }, { kind: 'cel-inner', tone: 'ground' }];

export const B4B_SETS: Record<string, SetSpec> = {
  // cyanotype (board a–d): the title between two fronds, its last phrase wide under it; a calm line among pinholes over
  // the paler sea; the shout in the open centre of a lace doily; two phrases down two narrow prints beside grasses
  'cyanotype/fern': { ...base, split: { small: 'tail', scale: 0.85, track: 0.2 }, at: [0.5, 0.176], ax: 0, ay: -1, share: 0.62, tall: 0.4, hi: 176, rows: [1, 2], lead: 1.31, track: 0.04, keepRows: true, clear: [[0.08, 0.58, 0.33, 0.93], [0.67, 0.58, 0.92, 0.93]], fixed: true },
  'cyanotype/stars': { ...base, at: [0.5, 0.306], ax: 0, ay: -1, share: 0.5, tall: 0.34, hi: 112, rows: [1, 3], lead: 1.43, track: 0.14, weight: 500, clear: [[0.05, 0.66, 0.95, 0.8]], fixed: true },
  'cyanotype/doily': { ...base, at: [0.5, 0.49], ax: 0, ay: 0, share: 0.5, tall: 0.4, hi: 200, rows: [1, 2], lead: 1.15, track: 0.06, keepRows: true, clear: [[0.04, 0.03, 0.96, 0.17], [0.04, 0.83, 0.96, 0.97], [0.04, 0.17, 0.2, 0.83], [0.8, 0.17, 0.96, 0.83]], fixed: true },
  'cyanotype/strips': { ...base, split: { small: 'tail', scale: 0.92, at: [0.583, 0.12], tall: 0.78 }, at: [0.784, 0.12], ax: 0, ay: -1, share: 0.06, tall: 0.78, hi: 106, rows: [1, 1], vertical: true, lead: 1.15, track: 0, key: 'ink', keepRows: true, clear: [[0.08, 0.14, 0.42, 0.86]], fixed: true },
  // isometric (board a–d): the line on the side wall of a staircase, rising right; on the front wall of a pale terrace by
  // the sea; a character a block down a row of blocks; on one wall of a corner room (either wall: white words on the deep
  // wall, so their key is read on deep ink)
  'isometric/stairs': { ...base, at: [0.42, 0.72], ax: 0, ay: 0, share: 0.44, tall: 0.15, hi: 150, rows: [1, 2], lead: 1.14, track: 0.04, shear: ISO_R, ink: 'plateInk', on: ['plate'], keepRows: true, clear: [[0.7, 0.06, 0.86, 0.66], [0.66, 0.62, 0.78, 0.88], [0.14, 0.64, 0.25, 0.83]], fixed: true },
  'isometric/terrace': { ...base, at: [0.31, 0.48], ax: 0, ay: 0, share: 0.42, tall: 0.3, hi: 132, rows: [1, 2], lead: 1.5, track: 0.04, flush: -1, shear: ISO_L, ink: 'plateInk', on: ['plate'], keepRows: true, clear: [[0.5, 0.07, 0.9, 0.88]], fixed: true },
  'isometric/blocks': { ...base, at: [0.5, 0.5], ax: 0, ay: 0, share: 0.86, tall: 0.86, hi: 170, rows: [1, 1], lead: 1, track: 0.48, even: true, drop: 0.48, shear: ISO_L, ink: 'plateInk', on: ['plate'], keepRows: true, fixed: true },
  'isometric/corner': { ...base, at: [0.648, 0.36], ax: 0, ay: 0, share: 0.32, tall: 0.24, hi: 140, rows: [1, 2], lead: 1.2, track: 0.02, flush: -1, shear: ISO_L, ink: 'ink2', key: 'ink2', on: ['plateInk'], keepRows: true, clear: [[0.4, 0.4, 0.6, 0.66]], fixed: true },
  'isometric/corner-l': { ...base, at: [0.345, 0.36], ax: 0, ay: 0, share: 0.32, tall: 0.24, hi: 140, rows: [1, 2], lead: 1.2, track: 0.02, flush: -1, shear: ISO_R, ink: 'ink2', key: 'ink2', on: ['plateInk'], keepRows: true, clear: [[0.4, 0.4, 0.6, 0.66]], fixed: true },
  // cel80s (board a–d): the title card over the speed streaks, its last phrase in yellow under it; a white subtitle in the
  // dusk; the eyecatch, one word in the sunset bands; the ending's two columns down the dark panel
  'cel80s/title': { ...base, split: { small: 'tail', scale: 0.85, track: 0.14, ink: 'accent' }, at: [0.42, 0.43], ax: 0, ay: 0, share: 0.64, tall: 0.46, hi: 200, rows: [1, 2], lead: 1.2, track: 0.02, shear: ITALIC, under: CEL_RINGS, key: 'ink', clear: [[0.83, 0.12, 0.98, 0.28], [0.76, 0.76, 0.86, 0.88]], fixed: true },
  'cel80s/dusk': { ...base, at: [0.5, 0.278], ax: 0, ay: -1, share: 0.46, tall: 0.3, hi: 104, rows: [1, 3], lead: 1.44, track: 0.1, clear: [[0.29, 0.06, 0.8, 0.2], [0, 0.62, 1, 1]], fixed: true },
  'cel80s/eyecatch': { ...base, at: [0.5, 0.5], ax: 0, ay: 0, share: 0.7, tall: 0.4, hi: 360, rows: [1, 1], lead: 1, track: 0.083, shear: ITALIC, surface: 'cel-sunset', core: 'accent', under: CEL_RINGS, keepRows: true, clear: [[0, 0, 1, 0.25], [0, 0.77, 1, 1]], fixed: true },
  'cel80s/ending': { ...base, split: { small: 'tail', scale: 1, ink: 'accent', at: [0.715, 0.157], tall: 0.75 }, at: [0.808, 0.102], ax: 0, ay: -1, share: 0.06, tall: 0.75, hi: 104, rows: [1, 1], vertical: true, lead: 1, track: 0, keepRows: true, clear: [[0, 0, 0.5, 1]], fixed: true },
};
