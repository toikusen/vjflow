// Style batch 5's scrapbook, watercolor, midcentury and claymation layouts, as numbers (see world-sets.ts), measured off
// their boards (2026-11-06, 風格第5批設計稿; sources out/research/boards-b5/boards/*.html) at 1920 × 1080: where a line
// stands, how big it may go, and where each page draws its large graphics (`clear`, kept free of calls). The boards the
// review flagged are rebuilt here in their spirit: midcentury's flat waves are gone (citypop's sea), its third board climbs
// a row of cut planes (`drop` below zero: a row that steps up); claymation's letters are the face's own strokes, never
// thickened into a clay rope, so no two strokes meet.
import type { SetSpec } from './world-sets';

const base = { lead: 1.16, track: 0.02, rows: [1, 3] as [number, number], lo: 70 };
/** A scrapbook line is cut as die-cut letter stickers: under every letter the hard shadow, the grey cut line, the white
 * backing; the backing is the carrier the letter reads on, so it stays when the words are taken away to be read. */
const STICKER: SetSpec['under'] = [{ kind: 'scrap-drop', tone: 'ink' }, { kind: 'scrap-cut', tone: 'plate' }, { kind: 'scrap-back', tone: 'plate', carrier: true }];
/** A reserved watercolour letter: the wash pooled dark against the masking fluid round it. */
const POOL: SetSpec['under'] = [{ kind: 'wc-pool', tone: 'plateInk' }];
/** A screen print's second plate a hair out of register under every letter. */
const REG: SetSpec['under'] = [{ kind: 'mc-reg', tone: 'accent' }];
/** A clay letter's hard contact shadow on the slab. */
const CLAY: SetSpec['under'] = [{ kind: 'clay-drop', tone: 'ground' }];

export const B5B_SETS: Record<string, SetSpec> = {
  // scrapbook (board a–d): the first phrase in stickers on a cream card held by photo corners, the rest in red stickers on
  // the gingham under it; a calm line in stickers on a torn navy paper among star stickers; the shout across a torn cream
  // banner over a full spread; one phrase a ruled index card
  'scrapbook/card': { ...base, split: { small: 'tail', scale: 1, track: 0.12, ink: 'accent', at: [0.56, 0.69], share: 0.62 }, at: [0.466, 0.37], ax: 0, ay: 0, share: 0.6, tall: 0.24, hi: 168, rows: [1, 2], lead: 1.22, track: 0.1, under: STICKER, on: ['plate'], keepRows: true, clear: [[0.68, 0.75, 0.99, 0.99]], fixed: true },
  'scrapbook/dots': { ...base, at: [0.47, 0.47], ax: 0, ay: 0, share: 0.66, tall: 0.46, hi: 128, rows: [1, 3], lead: 1.7, track: 0.1, stair: 1.2, under: STICKER, on: ['plate'], keepRows: true, clear: [[0.69, 0.22, 0.84, 0.43], [0.62, 0.68, 0.92, 0.92]], fixed: true },
  'scrapbook/spread': { ...base, at: [0.5, 0.5], ax: 0, ay: 0, share: 0.82, tall: 0.36, hi: 292, rows: [1, 2], lead: 1.12, track: 0.06, under: STICKER, on: ['plate'], keepRows: true, clear: [[0.68, 0.76, 0.98, 0.99], [0, 0, 1, 0.22]], fixed: true },
  'scrapbook/index': { ...base, split: { small: 'tail', scale: 1, track: 0.1, ink: 'accent', at: [0.62, 0.69], share: 0.62 }, at: [0.4, 0.37], ax: 0, ay: 0, share: 0.6, tall: 0.24, hi: 120, rows: [1, 2], lead: 1.2, track: 0.1, under: STICKER, on: ['plate'], keepRows: true, clear: [[0.04, 0.84, 0.6, 0.97]], fixed: true },
  // watercolor (board a–d): the line painted in indigo over an ochre wash, its last phrase in crimson; a night sky with the
  // line reserved white in it over a glazed sea; a few big painted characters over two pale glazes; two vertical brush
  // strokes, a phrase reserved white down each
  'watercolor/wash': { ...base, split: { small: 'tail', scale: 1.04, track: 0.04, ink: 'ink2', at: [0.56, 0.6], share: 0.62 }, at: [0.43, 0.3], ax: 0, ay: 0, share: 0.66, tall: 0.24, hi: 192, rows: [1, 2], lead: 1.2, track: 0.04, surface: 'wc-paint', core: 'ink2', keepRows: true, clear: [[0.7, 0.12, 0.96, 0.45]], fixed: true },
  'watercolor/night': { ...base, plain: true, at: [0.5, 0.33], ax: 0, ay: 0, share: 0.66, tall: 0.36, hi: 126, rows: [1, 3], lead: 1.43, track: 0.12, stair: 1.6, ink: 'plate', surface: 'wc-reserve', under: POOL, on: ['plateInk'], keepRows: true, clear: [[0.04, 0.64, 0.96, 0.95]], fixed: true },
  'watercolor/bloom': { ...base, at: [0.5, 0.52], ax: 0, ay: 0, share: 0.86, tall: 0.46, hi: 380, rows: [1, 2], lead: 1.08, track: 0.04, surface: 'wc-paint', core: 'ink2', keepRows: true, clear: [[0.04, 0.05, 0.96, 0.18]], fixed: true },
  'watercolor/strokes': { ...base, plain: true, split: { small: 'tail', scale: 0.96, at: [0.451, 0.12], tall: 0.8 }, at: [0.601, 0.12], ax: 0, ay: -1, share: 0.06, tall: 0.8, hi: 104, rows: [1, 1], vertical: true, lead: 1.15, track: 0.05, ink: 'plate', surface: 'wc-reserve', under: POOL, on: ['plateInk', 'ink2'], keepRows: true, clear: [[0.05, 0.1, 0.36, 0.9]], fixed: true },
  // midcentury (board a–d, pushed to the fifties): the first phrase on a hand-cut mustard bar, the rest in cream on a teal
  // bar, a Bass cut-paper figure at the right; a calm line in cream at dusk under sputnik bursts and a kidney table top (no
  // waves: a flat sea was citypop's); a short shout climbing a row of cut planes, a character a plane; a record sleeve's
  // two flush-left bars
  'midcentury/cut': { ...base, split: { small: 'tail', scale: 1, track: 0.06, ink: 'faint', at: [0.33, 0.67], share: 0.5 }, at: [0.4, 0.335], ax: 0, ay: 0, share: 0.62, tall: 0.22, hi: 190, rows: [1, 2], lead: 1.16, track: 0.02, under: REG, on: ['plate', 'ink2'], keepRows: true, clear: [[0.76, 0.08, 0.92, 0.95]], fixed: true },
  'midcentury/dusk': { ...base, at: [0.47, 0.42], ax: 0, ay: 0, share: 0.64, tall: 0.4, hi: 190, rows: [1, 3], lead: 1.3, track: 0.04, stair: 2, ink: 'faint', under: REG, on: ['ink2'], keepRows: true, clear: [[0.62, 0.06, 0.96, 0.32], [0, 0.72, 0.56, 1]], fixed: true },
  'midcentury/planes': { ...base, at: [0.5, 0.52], ax: 0, ay: 0, share: 0.86, tall: 0.86, hi: 250, rows: [1, 1], lead: 1.1, track: 0.62, even: true, drop: -0.56, under: REG, on: ['plate'], keepRows: true, clear: [[0, 0, 0.3, 0.42]], fixed: true },
  'midcentury/sleeve': { ...base, split: { small: 'tail', scale: 1, track: 0.04, ink: 'ink', at: [0.094, 0.6], share: 0.64, ax: -1 }, at: [0.094, 0.36], ax: -1, ay: 0, share: 0.6, tall: 0.18, hi: 150, rows: [1, 1], lead: 1.1, track: 0.04, flush: -1, ink: 'faint', under: REG, on: ['ink', 'faint'], keepRows: true, clear: [[0.76, 0.1, 0.96, 0.9]], fixed: true },
  // claymation (board a–d, rebuilt crisp): the line in clay letters on a slab over a rolled coil; a calm line in pale clay
  // on a night slab over three flat coils; a short shout, a character a clay colour on a light slab; two rolled strips
  'claymation/slab': { ...base, at: [0.48, 0.43], ax: 0, ay: 0, share: 0.7, tall: 0.5, hi: 200, rows: [1, 2], lead: 1.34, track: 0.06, under: CLAY, keepRows: true, clear: [[0, 0.8, 1, 1]], fixed: true },
  'claymation/night': { ...base, at: [0.48, 0.36], ax: 0, ay: 0, share: 0.64, tall: 0.4, hi: 128, rows: [1, 3], lead: 1.42, track: 0.08, stair: 1.6, under: CLAY, keepRows: true, clear: [[0, 0.66, 1, 1]], fixed: true },
  'claymation/letters': { ...base, at: [0.5, 0.5], ax: 0, ay: 0, share: 0.86, tall: 0.5, hi: 400, rows: [1, 2], lead: 1.12, track: 0.08, surface: 'clay-multi', ink: 'plateInk', under: CLAY, on: ['plate'], keepRows: true, clear: [[0, 0, 1, 0.14], [0, 0.86, 1, 1]], fixed: true },
  'claymation/strips': { ...base, split: { small: 'tail', scale: 1, track: 0.06, ink: 'ink2', at: [0.585, 0.677], share: 0.62 }, at: [0.415, 0.297], ax: 0, ay: 0, share: 0.6, tall: 0.18, hi: 140, rows: [1, 1], lead: 1.1, track: 0.06, ink: 'plateInk', under: CLAY, on: ['plate', 'faint'], keepRows: true, clear: [[0, 0.86, 1, 1]], fixed: true },
  // (the same boards turned left to right: the card, the index cards, the cut bars and the sleeve toward the right, the
  // strokes and strips mirrored. Columns still read from the right)
  'scrapbook/card-r': { ...base, split: { small: 'tail', scale: 1, track: 0.12, ink: 'accent', at: [0.44, 0.69], share: 0.62 }, at: [0.534, 0.37], ax: 0, ay: 0, share: 0.6, tall: 0.24, hi: 168, rows: [1, 2], lead: 1.22, track: 0.1, under: STICKER, on: ['plate'], keepRows: true, clear: [[0.01, 0.75, 0.32, 0.99]], fixed: true },
  'scrapbook/index-r': { ...base, split: { small: 'tail', scale: 1, track: 0.1, ink: 'accent', at: [0.38, 0.69], share: 0.62 }, at: [0.6, 0.37], ax: 0, ay: 0, share: 0.6, tall: 0.24, hi: 120, rows: [1, 2], lead: 1.2, track: 0.1, under: STICKER, on: ['plate'], keepRows: true, clear: [[0.4, 0.84, 0.96, 0.97]], fixed: true },
  'watercolor/wash-r': { ...base, split: { small: 'tail', scale: 1.04, track: 0.04, ink: 'ink2', at: [0.44, 0.6], share: 0.62 }, at: [0.57, 0.3], ax: 0, ay: 0, share: 0.66, tall: 0.24, hi: 192, rows: [1, 2], lead: 1.2, track: 0.04, surface: 'wc-paint', core: 'ink2', keepRows: true, clear: [[0.04, 0.12, 0.3, 0.45]], fixed: true },
  'watercolor/strokes-l': { ...base, plain: true, split: { small: 'tail', scale: 0.96, at: [0.399, 0.12], tall: 0.8 }, at: [0.549, 0.12], ax: 0, ay: -1, share: 0.06, tall: 0.8, hi: 104, rows: [1, 1], vertical: true, lead: 1.15, track: 0.05, ink: 'plate', surface: 'wc-reserve', under: POOL, on: ['plateInk', 'ink2'], keepRows: true, clear: [[0.64, 0.1, 0.95, 0.9]], fixed: true },
  'midcentury/cut-r': { ...base, split: { small: 'tail', scale: 1, track: 0.06, ink: 'faint', at: [0.67, 0.67], share: 0.5 }, at: [0.6, 0.335], ax: 0, ay: 0, share: 0.62, tall: 0.22, hi: 190, rows: [1, 2], lead: 1.16, track: 0.02, under: REG, on: ['plate', 'ink2'], keepRows: true, clear: [[0.08, 0.08, 0.24, 0.95]], fixed: true },
  'claymation/strips-r': { ...base, split: { small: 'tail', scale: 1, track: 0.06, ink: 'ink2', at: [0.415, 0.677], share: 0.62 }, at: [0.585, 0.297], ax: 0, ay: 0, share: 0.6, tall: 0.18, hi: 140, rows: [1, 1], lead: 1.1, track: 0.06, ink: 'plateInk', under: CLAY, on: ['plate', 'faint'], keepRows: true, clear: [[0, 0.86, 1, 1]], fixed: true },
};

/** The mirrored pages of the sets above: `<ground>` drawn turned left to right. */
export const B5B_MIRRORED: Record<string, string> = {
  'scrapbook/card-r': 'scrapbook/card', 'scrapbook/index-r': 'scrapbook/index', 'watercolor/wash-r': 'watercolor/wash', 'watercolor/strokes-l': 'watercolor/strokes',
  'midcentury/cut-r': 'midcentury/cut', 'claymation/strips-r': 'claymation/strips',
};
