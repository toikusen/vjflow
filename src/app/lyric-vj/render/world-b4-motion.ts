// How the words of style batch 4 (phone, blueprint, xerox; boards 2026-11-05, 風格第4批設計稿) arrive, stay and leave, in
// numbers only, from each board's "later motion": a phone types a line into its field and swipes it away; a drafter writes
// the note last, after the lines are drawn, and the sheet is turned; a copier's lamp passes and the strip lands whole, a
// jolt and no turn. Registered into world-motion.ts's tables by name; a name belongs to one world.
import type { GlyphEnv, GlyphPose, WorldMove } from './world-motion';
import { clamp01, ease as easeOut, easeIn } from './world-craft';

const stepsOf = (q: number, n: number) => Math.floor(clamp01(q) * n) / n;

export const B4_ENTERS: Record<string, WorldMove> = {
  // phone (board motion): the line is typed into the field a character at a time (the caret is the page's); the lock
  // screen's line is swapped on the beat, the new one up from under the old in one short step
  'thumb-type': { sec: 0.5, glyph: ({ q, i, n }) => ({ a: q * (n + 1) >= i + 1 ? 1 : 0 }) },
  'lock-swap': { sec: 0.2, block: (q) => ({ dy: -36 * (1 - stepsOf(easeOut(q, 3), 4)), a: q > 0.02 ? 1 : 0 }) },
  // blueprint (board motion): the note is written last, character after character, once the lines are drawn; or the
  // sheet is laid and the note is on it
  'pen-letter': { sec: 0.6, glyph: ({ q, i, n }) => { const k = clamp01((q - 0.15) * 1.18 * (n + 1) - i); return { a: k > 0 ? 1 : 0, sy: k > 0 && k < 1 ? 0.92 + 0.08 * k : 1 }; } },
  'drawing-lay': { sec: 0.3, block: (q) => ({ dx: 140 * (1 - easeOut(q, 4)), a: q > 0.02 ? 1 : 0 }) },
  // xerox (board motion): the lamp passes left to right and the strip is there behind it, whole; or it is pasted down
  // with a jolt, never turned
  'lamp-copy': { sec: 0.32, clip: (q) => ({ axis: 'x', at: stepsOf(easeOut(q, 2), 10) }) },
  'paste-jolt': { sec: 0.2, block: (q) => ({ dx: q < 1 ? [5, -4, 3, -2, 0][Math.min(4, Math.floor(q * 5))] : 0, dy: q < 0.4 ? -3 : 0, a: q > 0.02 ? 1 : 0 }) },
};

export const B4_EXITS: Record<string, WorldMove> = {
  // a phone deletes the line from its end, or the screen is swiped up
  'thumb-delete': { sec: 0.32, glyph: ({ q, i, n }) => ({ a: q * (n + 1) < n - i + 0.5 ? 1 : 0 }) },
  'swipe-up': { sec: 0.24, block: (q) => ({ dy: 220 * easeIn(q, 3), a: q < 0.9 ? 1 : 0 }) },
  // a drafter's sheet goes off to the left, or the note is rubbed out a stroke row at a time
  'sheet-off': { sec: 0.28, block: (q) => ({ dx: -160 * easeIn(q, 3), a: q < 0.85 ? 1 : 0 }) },
  'eraser-out': { sec: 0.3, clip: (q) => ({ axis: 'y', at: 1 - stepsOf(q, 6) }) },
  // a copy is pulled off the glass, or the next pass of the lamp takes it
  'copy-pull': { sec: 0.18, block: (q) => ({ dy: -48 * Math.ceil(q * 3), a: q < 0.9 ? 1 : 0 }) },
  'lamp-out': { sec: 0.3, clip: (q) => ({ axis: 'x', at: 1 - stepsOf(easeIn(q, 2), 10) }) },
};

export const B4_HOLDS: Record<string, (e: GlyphEnv) => GlyphPose> = {
  'screen-still': () => ({}),
  'sheet-still': () => ({}),
  'copy-still': () => ({}),
};
