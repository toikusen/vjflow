// How the words of the four worlds rebuilt from the round-2 boards arrive, stay and leave, in numbers only (the boards'
// "later motion" notes, 風格設計稿_第二輪/說明.md). A file's entry is typed a character at a time and the sheet is pulled
// away; a flash card turns over on its middle, showing only its edge half way, fast on a fast song and slow on a calm
// one; chalk is written stroke by stroke in the hand's order and wiped off right to left; a leaded inscription waits
// for the light to come round to it. Registered into world-motion.ts's tables by name; a name belongs to one world.
import type { GlyphEnv, GlyphPose, WorldMove } from './world-motion';
import { clamp01, ease as easeOut, easeIn, hash } from './world-craft';

/** Half a turn about the middle: the width a card shows at `k` (never quite edge-on, so it is never a sliver of noise). */
const turn = (k: number) => Math.max(0.02, Math.abs(Math.cos(Math.PI * clamp01(k))));

export const R2_ENTERS: Record<string, WorldMove> = {
  // file (board motion): each character struck by the typewriter, landing with a 2 px kick; the sheet slid up out of the folder
  'type-in': { sec: 0.5, glyph: ({ q, i, n }) => { const k = q * (n + 1) - i; return { a: k > 0 ? 1 : 0, dy: k > 0 && k < 1 ? -2 : 0 }; } },
  'sheet-in': { sec: 0.32, block: (q) => ({ dy: -70 * (1 - easeOut(q, 3)), a: clamp01(q * 6) }) },
  // card (board motion): the card turns over on its middle, the face showing once past the edge; a calm song's turns slowly
  'card-flip': { sec: 0.26, block: (q) => ({ sx: turn(1 - q), a: q >= 0.5 ? 1 : 0 }) },
  'card-flip-slow': { sec: 0.7, block: (q) => ({ sx: turn(1 - easeOut(q, 2)), a: easeOut(q, 2) >= 0.5 ? 1 : 0 }) },
  'card-deal': { sec: 0.3, block: (q) => ({ dx: 520 * (1 - easeOut(q, 3)), dy: -40 * (1 - easeOut(q, 3)), r: 0.08 * (1 - easeOut(q, 3)), a: clamp01(q * 6) }) },
  // chalkboard (board motion): written in the hand's order a character at a time, each one stroke by stroke from its top
  'chalk-hand': { sec: 0.7, glyph: ({ q, i, n }) => { const k = clamp01(q * (n + 1) - i); return { a: k > 0 ? Math.min(1, 0.25 + k * 1.5) : 0, sy: k > 0 && k < 1 ? 0.97 + 0.03 * k : 1 }; } },
  'chalk-press': { sec: 0.3, glyph: ({ q, i, seed }) => { const k = clamp01(q * 1.5 - 0.5 * hash(i, seed)); return { a: k > 0 ? 1 : 0, s: k > 0 ? 1.04 - 0.04 * easeOut(k * 2, 2) : 1 }; } },
  // stained-glass (board motion): the light comes round to the inscription, the letters going from unlit to lit; or the pane
  // is set into its lead, settling a hair
  'light-come': { sec: 0.9, glyph: ({ q, u, v }) => { const k = clamp01(q * 1.6 - (u * 0.4 + v * 0.2)); return { a: k > 0 ? 1 : 0, tone: 0.3 + 0.7 * easeOut(k, 2) }; } },
  'pane-in': { sec: 0.4, block: (q) => ({ dy: 14 * (1 - easeOut(q, 3)), a: clamp01(q * 4) }) },
};

export const R2_EXITS: Record<string, WorldMove> = {
  // the top sheet pulled away up and to the left, or the entry struck out of the typewriter back to front
  'sheet-pull': { sec: 0.32, block: (q) => ({ dx: -260 * easeIn(q, 2), dy: 90 * easeIn(q, 2), r: -0.02 * easeIn(q, 2), a: q < 0.9 ? 1 : 0 }) },
  'type-out': { sec: 0.36, glyph: ({ q, i, n }) => ({ a: q * (n + 1) < n - i ? 1 : 0 }) },
  'card-flip-out': { sec: 0.24, block: (q) => ({ sx: turn(q), a: q < 0.5 ? 1 : 0 }) },
  'card-toss': { sec: 0.3, block: (q) => ({ dx: -700 * easeIn(q, 2), dy: 60 * easeIn(q, 2), r: -0.1 * easeIn(q, 2), a: q < 0.9 ? 1 : 0 }) },
  // the eraser comes from the right: each character goes as it passes, the board shows through
  'eraser-pass': { sec: 0.42, glyph: ({ q, u }) => ({ a: u < 1 - q * 1.15 ? 1 : 0 }) },
  'chalk-fade': { sec: 0.5, glyph: ({ q, v }) => ({ a: 1 - easeIn(clamp01(q * 1.3 - v * 0.3), 2), dy: 6 * easeIn(q, 2) }) },
  'light-go': { sec: 0.8, glyph: ({ q, u }) => { const k = clamp01(q * 1.5 - (1 - u) * 0.5); return { tone: 1 - 0.7 * easeIn(k, 2), a: k < 1 ? 1 : 0 }; } },
  'pane-out': { sec: 0.4, block: (q) => ({ dy: -12 * easeIn(q, 2), a: 1 - easeIn(q, 2) }) },
};

export const R2_HOLDS: Record<string, (e: GlyphEnv) => GlyphPose> = {
  'paper-still': () => ({}),
  'card-rest': () => ({}),
  // the hand's tremor: a character redrawn now and then a hair off, at the board's eight drawings a second
  'chalk-still': ({ age, i, seed }) => { const tick = Math.floor(age * 8); return { dx: (hash(tick + i, seed) - 0.5) * 0.8, dy: (hash(tick + i, seed + 1) - 0.5) * 0.8 }; },
  // the inscription lit by the slow sun: never below full reading tone
  'glass-still': () => ({}),
};
