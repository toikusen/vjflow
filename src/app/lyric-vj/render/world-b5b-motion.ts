// How the words of style batch 5's scrapbook, watercolor, midcentury and claymation worlds arrive, stay and leave, in
// numbers only, from each board's "later motion" (風格第5批設計稿 說明.md, 2026-11-06). Stickers are pressed on one at a
// time from a corner and peeled off; paint is brushed in left to right and the reserve shows as the wash closes round it;
// a screen print is pulled in hard steps (limited animation, the fifties' cel economy) and its sheet slid away; clay is
// squashed and stretched on twos (12 frames a second) and boils a hair while it is held. Registered into world-motion.ts.
import type { GlyphEnv, GlyphPose, WorldMove } from './world-motion';
import { clamp01, ease as easeOut, easeIn } from './world-craft';

const hashOf = (a: number, b = 0) => { const x = Math.sin(a * 91.17 + b * 47.53) * 43758.5453; return x - Math.floor(x); };
const stepsOf = (q: number, n: number) => Math.floor(clamp01(q) * n) / n;
/** Clay held on twos: a new pose every second frame at 24 (board: the letters boil a hair, never drift). */
const twos = (age: number) => Math.floor(age * 12);

export const B5B_ENTERS: Record<string, WorldMove> = {
  // scrapbook: each sticker is pressed down from a corner in turn, larger as it comes off the sheet, then flat
  // (a sticker's own lean is cut into it, world-glyph-b5b stickerTilt: the move ends where the sticker rests)
  'sticker-press': { sec: 0.6, glyph: ({ q, i, n }) => { const k = clamp01(q * (n * 0.35 + 1) - i * 0.35); return { a: k > 0 ? 1 : 0, s: 1 + 0.22 * (1 - easeOut(k, 3)), r: 0.25 * (1 - easeOut(k, 3)), dy: -18 * (1 - easeOut(k, 3)) }; } },
  // the whole sheet of stickers slid on from below, the way a page is laid into the album
  'sheet-slide': { sec: 0.42, block: (q) => ({ dy: -120 * (1 - easeOut(q, 3)), a: clamp01(q * 4) }) },
  // watercolor: the paint is brushed in left to right, a band at a time, each band coming up as the wash darkens
  'brush-in': { sec: 0.8, glyph: ({ q, u }) => ({ a: clamp01(q * 1.5 - u * 0.5) > 0 ? (clamp01(q * 1.5 - u * 0.5) < 0.6 ? 0.45 : 1) : 0 }) },
  // the reserve shows as the wash closes round it: the whole line comes up out of the wet sheet
  // (two glazes: the first lays the whole line pale at once, the second deepens it once the first has soaked in)
  'wash-in': { sec: 0.9, block: (q) => ({ a: q <= 0 ? 0 : q < 0.55 ? 0.42 : 1 }) },
  // midcentury: the print is pulled across in four hard steps, a plate at a time
  'pull-in': { sec: 0.36, clip: (q) => ({ axis: 'x', at: stepsOf(easeOut(q, 2), 4) }) },
  // the cut sheet slid in from the left on threes (8 a second), stopping dead
  'cut-slide': { sec: 0.42, block: (q) => ({ dx: -160 * (1 - stepsOf(easeOut(q, 2), 4)), a: q > 0 ? 1 : 0 }) },
  // claymation: each letter is squashed down onto the slab and springs up, on twos
  'squash-in': { sec: 0.5, glyph: ({ q, i, n }) => { const k = stepsOf(clamp01(q * (n * 0.2 + 1) - i * 0.2), 6); return { a: k > 0 ? 1 : 0, sy: k < 0.34 ? 0.55 : k < 0.67 ? 1.14 : 1, sx: k < 0.34 ? 1.25 : k < 0.67 ? 0.93 : 1 }; } },
  // the letters roll in from the left a step at a time
  // (each glyph rolls in a step behind the one before: the step closes the two by a sixth of the roll, kept under a
  // glyph's side bearing so the strokes never meet, world-motion.spec 'no move merges glyphs')
  'roll-in': { sec: 0.5, glyph: ({ q, i, n }) => { const k = stepsOf(clamp01(q * (n * 0.15 + 1) - i * 0.15), 6); return { a: k > 0 ? 1 : 0, dx: -54 * (1 - k), r: -0.6 * (1 - k) }; } },
};

export const B5B_EXITS: Record<string, WorldMove> = {
  // a sticker peeled off from its corner, lifting and turning, the last first (the words stay whole through the first third)
  'sticker-peel': { sec: 0.5, glyph: ({ q, i, n }) => { const k = clamp01((q - 0.3) / 0.7 * (n * 0.3 + 1) - (n - 1 - i) * 0.3); return { a: 1 - easeIn(k, 2), r: -0.4 * easeIn(k, 2), dy: -40 * easeIn(k, 2) }; } },
  'page-out': { sec: 0.4, block: (q) => ({ dx: 220 * easeIn(clamp01((q - 0.3) / 0.7), 2), a: 1 - easeIn(clamp01((q - 0.3) / 0.7), 3) }) },
  'wash-dry': { sec: 0.8, glyph: ({ q }) => ({ a: 1 - easeIn(clamp01((q - 0.35) / 0.65), 1.6) }) },
  'lift-out': { sec: 0.45, block: (q) => ({ dy: 10 * easeIn(q, 2), a: 1 - easeIn(clamp01((q - 0.3) / 0.7), 1.5) }) },
  'pull-out': { sec: 0.3, clip: (q) => ({ axis: 'x', at: 1 - stepsOf(easeIn(clamp01((q - 0.25) / 0.75), 2), 4) }) },
  'cut-away': { sec: 0.36, block: (q) => { const k = stepsOf(easeIn(clamp01((q - 0.3) / 0.7), 2), 4); return { dx: 200 * k, a: k >= 1 ? 0 : 1 }; } },
  'squash-out': { sec: 0.4, glyph: ({ q }) => { const k = stepsOf(clamp01((q - 0.3) / 0.7), 4); return { sy: 1 - 0.75 * k, sx: 1 + 0.3 * k, dy: -30 * k, a: k >= 1 ? 0 : 1 }; } },
  'pop-off': { sec: 0.4, glyph: ({ q, i, n }) => { const k = stepsOf(clamp01((q - 0.3) / 0.7 * (n * 0.2 + 1) - i * 0.2), 5); return { dy: 120 * k, a: k >= 1 ? 0 : 1 }; } },
};

export const B5B_HOLDS: Record<string, (e: GlyphEnv) => GlyphPose> = {
  // stickers stay where they were pressed
  'sticker-still': () => ({}),
  // paint on paper does not move
  'paper-still': () => ({}),
  // a print is a print
  'print-hold': () => ({}),
  // clay boils on twos: each letter shifts by a pixel and a hair of turn, never drifting
  'clay-boil': ({ i, age }) => { const f = twos(age) % 3; return { dx: (hashOf(i, f) - 0.5) * 2, r: (hashOf(i + 7, f) - 0.5) * 0.012 }; },
};
