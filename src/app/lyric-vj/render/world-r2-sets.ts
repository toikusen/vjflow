// The four worlds rebuilt from the round-2 boards (2026-11-04, 風格設計稿_第二輪: file, card, chalkboard, stained-glass),
// their layouts as numbers (see world-sets.ts). Each set is where its board put the line, measured off the board at
// 1920 × 1080: the case file's entries, its index card, its section sheet and its ruled letter paper; the flash card on
// the beat, the calm card, the card in front of a fanned hand and the pair of cards; the lesson on the board; the
// inscription in each window. A set laid into its page (`fixed`) is printed round by its ground and does not travel.
import type { SetSpec } from './world-sets';

const base = { lead: 1.16, track: 0.02, rows: [1, 3] as [number, number], lo: 70 };

export const R2_SETS: Record<string, SetSpec> = {
  // file (board a–d): the entries on the case sheet, row two in the stamp red; two lines on the index card between its blue
  // rules; the section sheet on top of the stack; two columns of the red-ruled letter paper, written from the right
  'file/case': { ...base, at: [0.1875, 0.27], ax: -1, ay: -1, share: 0.68, tall: 0.52, hi: 206, rows: [1, 2], lead: 1.33, track: 0, flush: -1, ink: 'plateInk', rowInk: ['plateInk', 'accent'], fixed: true },
  // two lines sung too fast to read apart share the case sheet, one entry each, below its header
  'file/pair': { ...base, at: [0.1875, 0.56], ax: -1, ay: 0, share: 0.68, tall: 0.42, hi: 150, rows: [1, 2], lead: 1.33, track: 0, flush: -1, ink: 'plateInk', fixed: true },
  'file/catalogue': { ...base, at: [0.26, 0.32], ax: -1, ay: -1, share: 0.56, tall: 0.42, hi: 150, rows: [1, 2], lead: 1.69, track: 0.04, flush: -1, ink: 'plateInk', fixed: true },
  'file/sections': { ...base, at: [0.094, 0.413], ax: -1, ay: -1, share: 0.66, tall: 0.46, hi: 200, rows: [1, 2], lead: 1.22, track: 0, flush: -1, ink: 'plateInk', fixed: true },
  'file/letter': { ...base, at: [0.844, 0.154], ax: 1, ay: -1, share: 0.32, tall: 0.78, hi: 150, rows: [2, 2], vertical: true, lead: 1.59, track: -0.04, ink: 'plateInk', fixed: true },
  // card (board a–d): the flash card on the beat (tilted), the calm card (level), the card in front of the fan, the pair:
  // the first row on a cream card, the second on the red card that lands on its corner
  'card/main': { ...base, at: [0.135, 0.43], ax: -1, ay: -1, share: 0.6, tall: 0.36, hi: 188, rows: [1, 2], lead: 1.12, track: 0, flush: -1, tilt: 0.035, ink: 'plateInk', fixed: true },
  'card/calm': { ...base, at: [0.208, 0.337], ax: -1, ay: -1, share: 0.6, tall: 0.4, hi: 150, rows: [1, 2], lead: 1.32, track: 0.02, flush: -1, ink: 'plateInk', fixed: true },
  // a long line with no break to take (a run of kana) on one wide card, low in the frame
  'card/long': { ...base, at: [0.5, 0.6], ax: 0, ay: 0, share: 0.8, tall: 0.3, hi: 150, rows: [1, 2], lead: 1.2, track: 0, tilt: 0.035, ink: 'plateInk', fixed: true },
  'card/fan': { ...base, at: [0.26, 0.613], ax: -1, ay: -1, share: 0.52, tall: 0.24, hi: 226, rows: [1, 1], lead: 1, track: 0, flush: -1, ink: 'plateInk', fixed: true },
  'card/pair': { ...base, at: [0.106, 0.269], ax: -1, ay: -1, share: 0.86, tall: 0.72, hi: 150, rows: [2, 2], lead: 2.84, track: 0, flush: -1, stair: 2.28, ink: 'plateInk', rowInk: ['plateInk', 'plate'], keepRows: true, fixed: true },
  // chalkboard (board a–d): the lesson, its answer row in yellow; the calm line over a long rule; the short loud line ringed;
  // two columns, the second in yellow. The board is the same everywhere, so these move between each other while sung
  'chalkboard/lesson': { ...base, at: [0.078, 0.23], ax: -1, ay: -1, share: 0.8, tall: 0.62, hi: 196, rows: [1, 2], lead: 1.7, track: 0.01, flush: -1, stair: 0.26, tilt: 0.02, rowInk: ['ink', 'ink2'] },
  'chalkboard/slow': { ...base, at: [0.099, 0.27], ax: -1, ay: -1, share: 0.8, tall: 0.5, hi: 150, rows: [1, 2], lead: 1.6, track: 0.05, flush: -1 },
  'chalkboard/ring': { ...base, at: [0.5, 0.66], ax: 0, ay: 0, share: 0.56, tall: 0.26, hi: 236, rows: [1, 1], lead: 1, track: 0, tilt: 0.026, ink: 'ink2' },
  'chalkboard/centre': { ...base, at: [0.5, 0.48], ax: 0, ay: 0, share: 0.84, tall: 0.5, hi: 220, rows: [1, 2], lead: 1.5, track: 0.02, tilt: 0.012 },
  'chalkboard/columns': { ...base, at: [0.68, 0.11], ax: 1, ay: -1, share: 0.3, tall: 0.8, hi: 150, rows: [2, 2], vertical: true, lead: 1.98, track: 0, rowInk: ['ink', 'ink2'] },
  // stained-glass (board a–d): the inscription across the transom; down the lancet beside the rose; in the rose's roundel;
  // in the two inner lancets of four
  'stained-glass/transom': { ...base, at: [0.5, 0.5], ax: 0, ay: 0, share: 0.5, tall: 0.37, hi: 150, rows: [1, 2], lead: 1.33, track: 0.04, ink: 'ink', on: ['plate'], fixed: true },
  'stained-glass/lancet': { ...base, at: [0.7396, 0.33], ax: 0, ay: -1, share: 0.16, tall: 0.56, hi: 120, rows: [1, 2], vertical: true, lead: 1.37, track: 0.02, ink: 'ink', on: ['plate'], keepRows: true, fixed: true },
  // (the same board mirrored: the lancet on the left, the rose on the right)
  'stained-glass/lancet-l': { ...base, at: [0.2604, 0.33], ax: 0, ay: -1, share: 0.16, tall: 0.56, hi: 120, rows: [1, 2], vertical: true, lead: 1.37, track: 0.02, ink: 'ink', on: ['plate'], keepRows: true, fixed: true },
  'stained-glass/roundel': { ...base, at: [0.5, 0.5], ax: 0, ay: 0, square: true, share: 0.2, tall: 0.36, hi: 150, rows: [1, 2], lead: 1.08, track: 0.02, ink: 'ink', on: ['plate'], keepRows: true, fixed: true },
  // (four short lancets over a predella: the inscription in the low band window, the boards' lancet and jewelled border together)
  'stained-glass/predella': { ...base, at: [0.5, 0.759], ax: 0, ay: 0, share: 0.66, tall: 0.22, hi: 150, rows: [1, 2], lead: 1.1, track: 0.04, ink: 'ink', on: ['plate'], keepRows: true, fixed: true },
  'stained-glass/lancets': { ...base, at: [0.5, 0.2], ax: 0, ay: -1, share: 0.48, tall: 0.7, hi: 120, rows: [2, 2], vertical: true, lead: 4.4, track: 0, ink: 'ink', on: ['plate'], keepRows: true, fixed: true },
};
