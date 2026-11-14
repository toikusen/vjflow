// The type floor, one rule for every place a world line's type size is decided (product rule «never set small», 9120f50;
// docs/research/2026-11-12-type-floor.md): a body lyric glyph is never set under max(its set's lo, TYPE_FLOOR.lo). Where a
// step would set it smaller (a frame fit, a split part's container, the words round a blown-up word), the line is laid
// again instead: whole rather than split, wrapped in the set's own rows, and past those a mark the composer reads to take
// another set (Block.floorMiss). No three.js here: the composer plans with the same numbers the renderer draws with.

/**
 * The type every set may reach and the least it sets, px at 1080p: a set's own numbers below these left a short line
 * small in a corner of an empty frame (2026-11-04 audit: silk-cold, ink-wash, file, dark-glitch). A set may ask for more.
 */
export const TYPE_FLOOR = { hi: 150, lo: 84 };

/** Half a pixel: a size rounded or floored on the way to the frame is not a size under the floor. */
const SLACK = 0.5;

/** The least type a line may take in a set: the set's own `lo` or the product's floor, whichever is larger. */
export const floorOf = (spec: { lo: number }) => Math.max(spec.lo, TYPE_FLOOR.lo);

/**
 * The share of a row's type size a set's shear leaves on screen: the shorter of the map's two axes (a face drawn narrow,
 * scaleX .75, a column .85), never above 1 (a lean or a turn keeps the size). The scan and the engine's fit read a glyph
 * as drawn, so a set laid at 84 px before a narrow shear is 63 px on the frame.
 */
export const shearGain = (shear?: readonly number[]) => (shear ? Math.min(1, Math.hypot(shear[0], shear[1]), Math.hypot(shear[2], shear[3])) : 1);

/** The type a block may be laid at in a set before its shear, so that its drawn size is never under the floor (floorOf, shearGain), a whole pixel: a block is laid at whole px, and 98.8 px laid is 98. */
export const layFloorOf = (spec: { lo: number; shear?: readonly number[] }) => Math.max(spec.lo, Math.ceil(TYPE_FLOOR.lo / shearGain(spec.shear) - 1e-9));

/** Whether `size` px is under `floor` (the half-pixel slack of a rounded size kept). */
export const underFloor = (size: number, floor: number = TYPE_FLOOR.lo) => size < floor - SLACK;

/** The least type a laid block sets: its own size, or a split block's smallest row. */
export const leastOf = (b: { size: number; lines?: { size: number }[] }) => Math.min(b.size, ...(b.lines ?? []).map((r) => r.size));

/**
 * A scale a step puts on type already set (`size` px): never under what keeps it at the floor, never above 1. A frame
 * fit, a line stepping back for the next one, a particle the typesetter sets smaller.
 */
export const heldScale = (scale: number, size: number, floor: number = TYPE_FLOOR.lo) => (underFloor(size * scale, floor) ? Math.max(scale, Math.min(1, floor / size)) : scale);

/**
 * The frame fit's scale for a line whose words rest at `least` px (engine fitToFrame): the fit of everything it shows
 * (`whole`), lifted to keep the words at the floor as far as the fit of the words alone (`words`) allows. What the
 * words stand on may then run past the safe edge; the words never leave the frame.
 */
export const fitAtFloor = (whole: number, least: number, floor: number, words: number) => (underFloor(least * whole, floor) ? Math.min(heldScale(whole, least, floor), Math.max(whole, words)) : whole);

/**
 * By how much a line's fit may be multiplied while it plays so its words (`least` px as drawn, em boxes reaching `wx` and
 * `wy` px from the frame's centre) rest at the floor, no further than `edge` px short of the frame's edge: under 1 the
 * zoom-out left to a camera, over 1 the lift a fit that left the words small needs (engine holdScale).
 */
export const holdMultiple = (least: number, floor: number, wx: number, wy: number, edge = 24, w = 1920, h = 1080) =>
  Math.min(floor / least, (w / 2 - edge) / Math.max(1, wx), (h / 2 - edge) / Math.max(1, wy));
