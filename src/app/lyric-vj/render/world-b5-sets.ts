// Style batch 5's own layouts, as numbers (see world-sets.ts), measured off its boards at 1920 × 1080 (2026-11-06,
// 風格第5批設計稿; sources out/research/boards-b5/boards/*.html): where a line stands in the hoop, the manga page, the deco
// poster and the notebook, how big it may go, what it stands on, and where each page draws its large graphics (`clear`,
// kept free of calls). Every set carries a shear (most of them the identity) so its page is handed the line's glyph
// cells with its box (world-sets FaceLayout): a hoop, a balloon, a plaque or a pen loop is drawn round the words as they
// were really set, never round a guess.
import type { SetSpec } from './world-sets';

const base = { lead: 1.16, track: 0.02, rows: [1, 3] as [number, number], lo: 70 };
/** No change to the block: only so the page gets its cells. */
export const FLAT: [number, number, number, number] = [1, 0, 0, 1];
/** art-deco's tall lettering: the face drawn narrow (board: scaleX .72, here .75 so no two strokes close up) and tracked wide. */
export const DECO_NARROW: [number, number, number, number] = [0.75, 0, 0, 1];
/** art-deco's columns, a little less narrow (board d: scaleX .85). */
export const DECO_COLUMN: [number, number, number, number] = [0.85, 0, 0, 1];
/** screentone's sound effect, turned 10° up (board c: rotate(-10)). */
const SFX_TURN: [number, number, number, number] = [Math.cos(-0.1745), Math.sin(-0.1745), -Math.sin(-0.1745), Math.cos(-0.1745)];
/** screentone's sound-effect lettering under every letter, outermost first: the black ring (24 %), the white ring (16 %). */
const SFX_RINGS = (tone: 'ink' | 'ink2'): SetSpec['under'] => [{ kind: 'sfx-outer', tone }, { kind: 'sfx-inner', tone }];
/** notebook's page under every letter: the paper kept round the strokes (rules stop 8 px short). */
const PAGE_UNDER: SetSpec['under'] = [{ kind: 'nb-halo', tone: 'plate' }];
/** ...and the highlighter under a key word, on a set whose words are all in its body ink (a letter in another ink is a key). */
const PAGE_KEYED: SetSpec['under'] = [...PAGE_UNDER!, { kind: 'nb-highlight', tone: 'ink' }];

export const B5_SETS: Record<string, SetSpec> = {
  // embroidery (boards a–d): two lines in two threads in a big hoop; cream thread on night linen in a small hoop under knot
  // stars; one word in cross-stitch on a sampler; two columns in a hoop (the first phrase right, in blue, the second in red)
  'embroidery/hoop': { ...base, split: { small: 'tail', scale: 1, ink: 'accent', at: [0.534, 0.632], share: 0.5, tall: 0.2 }, at: [0.5, 0.248], ax: 0, ay: -1, share: 0.62, tall: 0.42, hi: 186, rows: [1, 2], lead: 1.22, track: 0.06, ink: 'plateInk', on: ['plate'], plain: true, keepRows: true, shear: FLAT, clear: [[0, 0, 0.09, 1], [0.91, 0, 1, 1]], fixed: true },
  'embroidery/hoop-low': { ...base, at: [0.5, 0.53], ax: 0, ay: 0, share: 0.5, tall: 0.42, hi: 170, rows: [1, 3], lead: 1.3, track: 0.06, ink: 'plateInk', on: ['plate'], plain: true, keepRows: true, shear: FLAT, clear: [[0, 0, 0.18, 1], [0.82, 0, 1, 1]], fixed: true },
  'embroidery/night': { ...base, at: [0.5, 0.344], ax: 0, ay: -1, share: 0.38, tall: 0.3, hi: 170, rows: [1, 3], lead: 1.6, track: 0.04, ink: 'faint', on: ['ink2'], plain: true, keepRows: true, shear: FLAT, clear: [[0.31, 0.12, 0.69, 0.3], [0.28, 0.66, 0.72, 0.82]], fixed: true },
  'embroidery/sampler': { ...base, at: [0.5, 0.46], ax: 0, ay: 0, share: 0.66, tall: 0.4, hi: 410, rows: [1, 1], lead: 1, track: 0.02, weight: 500, surface: 'cross-stitch', ink: 'accent', on: ['plate'], plain: true, keepRows: true, shear: FLAT, clear: [[0, 0, 1, 0.17], [0, 0.83, 1, 1], [0, 0, 0.1, 1], [0.9, 0, 1, 1]], fixed: true },
  'embroidery/columns': { ...base, split: { small: 'tail', scale: 1, ink: 'accent', at: [0.456, 0.117], tall: 0.8 }, at: [0.545, 0.155], ax: 0, ay: -1, share: 0.06, tall: 0.72, hi: 104, rows: [1, 1], vertical: true, lead: 1.04, track: 0.04, ink: 'plateInk', on: ['plate'], plain: true, keepRows: true, shear: FLAT, clear: [[0, 0, 0.2, 1], [0.8, 0, 1, 1]], fixed: true },
  // screentone (boards a–d): a vertical line in a spiky balloon, its last phrase as a sound effect down the next panel; a
  // narration box set vertically over a toned night sky; one sound effect across four panels; two vertical balloons; a
  // narration box set across, for what cannot stand in a column
  'screentone/shout': { ...base, split: { small: 'tail', scale: 1.45, ink: 'ink2', at: [0.79, 0.12], tall: 0.8 }, at: [0.335, 0.2], ax: 0, ay: -1, share: 0.07, tall: 0.66, hi: 120, rows: [1, 1], vertical: true, lead: 1.05, track: 0.05, ink: 'ink', plain: true, under: SFX_RINGS('ink2'), keepRows: true, shear: FLAT, clear: [[0.6, 0.06, 0.97, 0.93]], fixed: true },
  'screentone/narration': { ...base, split: { small: 'tail', scale: 1, at: [0.516, 0.278], tall: 0.8 }, at: [0.586, 0.185], ax: 0, ay: -1, share: 0.06, tall: 0.7, hi: 104, rows: [1, 1], vertical: true, lead: 1.05, track: 0.02, ink: 'plateInk', on: ['plate'], plain: true, keepRows: true, shear: FLAT, clear: [[0.04, 0.07, 0.4, 0.4], [0.7, 0.07, 0.96, 0.4]], fixed: true },
  'screentone/sfx': { ...base, at: [0.5, 0.5], ax: 0, ay: 0, share: 0.6, tall: 0.6, hi: 560, rows: [1, 1], lead: 1, track: 0, ink: 'ink', plain: true, under: SFX_RINGS('ink'), keepRows: true, shear: SFX_TURN, fixed: true },
  'screentone/balloons': { ...base, split: { small: 'tail', scale: 0.92, at: [0.3875, 0.215], tall: 0.8 }, at: [0.608, 0.13], ax: 0, ay: -1, share: 0.06, tall: 0.62, hi: 96, rows: [1, 1], vertical: true, lead: 1.05, track: 0.04, ink: 'plateInk', on: ['plate'], plain: true, keepRows: true, shear: FLAT, clear: [[0.03, 0.05, 0.16, 0.93], [0.84, 0.05, 0.97, 0.93]], fixed: true },
  // (board a's shout set across, for a line with no second phrase or a Latin one: the balloon round it in the wide panel)
  'screentone/burst': { ...base, at: [0.36, 0.5], ax: 0, ay: 0, share: 0.5, tall: 0.42, hi: 170, rows: [1, 2], lead: 1.15, track: 0.04, ink: 'plateInk', on: ['plate'], plain: true, keepRows: true, shear: FLAT, clear: [[0.72, 0.06, 0.97, 0.93]], fixed: true },
  'screentone/caption': { ...base, at: [0.1, 0.15], ax: -1, ay: -1, share: 0.6, tall: 0.3, hi: 130, rows: [1, 2], lead: 1.3, track: 0.04, flush: -1, ink: 'plateInk', on: ['plate'], plain: true, keepRows: true, shear: FLAT, clear: [[0.52, 0.5, 0.96, 0.92]], fixed: true },
  // art-deco (boards a–d): two centred lines on a black plaque before a sunburst, the second in pale gold; two lines in a
  // stepped arch window over a chevron sea; one line dark on a cream stepped plaque in a field of fans; a column on each of
  // two stepped pillars
  'art-deco/marquee': { ...base, split: { small: 'tail', scale: 1, ink: 'ink2', track: 0.3, at: [0.5, 0.588], share: 0.72, tall: 0.2 }, at: [0.5, 0.25], ax: 0, ay: -1, share: 0.72, tall: 0.42, hi: 200, rows: [1, 2], lead: 1.25, track: 0.18, ink: 'ink', plain: true, keepRows: true, shear: DECO_NARROW, clear: [[0, 0, 1, 0.09], [0, 0.9, 1, 1], [0, 0, 0.05, 1], [0.95, 0, 1, 1]], fixed: true },
  'art-deco/arch': { ...base, at: [0.5, 0.306], ax: 0, ay: -1, share: 0.62, tall: 0.32, hi: 140, rows: [1, 3], lead: 1.28, track: 0.14, ink: 'ink', plain: true, keepRows: true, shear: DECO_NARROW, clear: [[0.22, 0.64, 0.78, 0.93]], fixed: true },
  'art-deco/plaque': { ...base, at: [0.5, 0.51], ax: 0, ay: 0, share: 0.8, tall: 0.3, hi: 190, rows: [1, 2], lead: 1.15, track: 0.16, ink: 'plateInk', on: ['plate'], plain: true, keepRows: true, shear: DECO_NARROW, clear: [[0, 0, 1, 0.27], [0, 0.75, 1, 1]], fixed: true },
  'art-deco/pillars': { ...base, split: { small: 'tail', scale: 1, ink: 'ink2', at: [0.414, 0.157], tall: 0.76 }, at: [0.586, 0.176], ax: 0, ay: -1, share: 0.05, tall: 0.72, hi: 100, rows: [1, 1], vertical: true, lead: 1, track: 0.06, ink: 'ink', plain: true, keepRows: true, shear: DECO_COLUMN, fixed: true },
  // notebook (boards a–d): two marker lines on a side-spiral page, a key word highlighted and the last phrase looped in
  // ballpoint; a pencil line on a dotted page, a wavy line under it; a reporter's pad, a ballpoint head line over a marker
  // line boxed twice; two columns down a top-bound page with vertical rules
  'notebook/spiral': { ...base, split: { small: 'tail', scale: 1, at: [0.552, 0.648], share: 0.5, tall: 0.26 }, at: [0.5, 0.278], ax: 0, ay: -1, share: 0.64, tall: 0.42, hi: 206, rows: [1, 2], lead: 1.3, track: 0.02, ink: 'ink', key: 'accent', under: PAGE_KEYED, keepRows: true, shear: FLAT, clear: [[0, 0, 0.07, 1], [0.06, 0.27, 0.15, 0.42], [0.66, 0.06, 0.9, 0.14]], fixed: true },
  'notebook/dotted': { ...base, split: { small: 'tail', scale: 1, at: [0.469, 0.64], share: 0.5, tall: 0.2 }, at: [0.156, 0.344], ax: -1, ay: -1, share: 0.5, tall: 0.42, hi: 200, rows: [1, 2], lead: 1.5, track: 0.02, flush: -1, surface: 'pencil-type', ink: 'ink2', plain: true, under: PAGE_UNDER, keepRows: true, shear: FLAT, clear: [[0.87, 0, 0.93, 1], [0.66, 0.08, 0.86, 0.14]], fixed: true },
  'notebook/reporter': { ...base, split: { small: 'lead', scale: 0.33, ink: 'accent', at: [0.136, 0.257], ax: -1, share: 0.45 }, at: [0.5, 0.63], ax: 0, ay: 0, share: 0.7, tall: 0.36, hi: 318, rows: [1, 2], lead: 1.1, track: 0.02, ink: 'ink', plain: true, under: PAGE_UNDER, keepRows: true, shear: FLAT, clear: [[0, 0, 1, 0.15]], fixed: true },
  'notebook/vertical': { ...base, split: { small: 'tail', scale: 1, at: [0.517, 0.178], tall: 0.8 }, at: [0.657, 0.178], ax: 0, ay: -1, share: 0.05, tall: 0.74, hi: 96, rows: [1, 1], vertical: true, lead: 1, track: 0.02, ink: 'ink', plain: true, under: PAGE_UNDER, keepRows: true, shear: FLAT, clear: [[0, 0, 1, 0.12]], fixed: true },
};
