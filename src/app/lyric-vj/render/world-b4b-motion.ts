// How the words of style batch 4's cyanotype, isometric and cel80s worlds arrive, stay and leave, in numbers only, from
// each board's "later motion" (風格第4批設計稿 說明.md, 2026-11-05). A cyanotype is exposed and developed: the white comes
// up out of the blue, or the transparency is laid on and lifted. An isometric wall rises from the floor with its words,
// or slides in along its own face (never turned, never in perspective). An anime title card lands in three held cels
// (the hold-and-zoom), or a speed streak wipes it in. Registered into world-motion.ts's tables by name.
import type { GlyphEnv, GlyphPose, WorldMove } from './world-motion';
import { clamp01, ease as easeOut, easeIn } from './world-craft';

const stepsOf = (q: number, n: number) => Math.floor(clamp01(q) * n) / n;
/** Along an isometric face's baseline, px: down and right at 30°. */
const ISO = [Math.cos(Math.PI / 6), -0.5];

export const B4B_ENTERS: Record<string, WorldMove> = {
  // cyanotype: the print is exposed under the lamp a band at a time, left to right, each band coming up in steps
  'expose-in': { sec: 0.7, glyph: ({ q, u }) => ({ a: stepsOf(clamp01(q * 1.6 - u * 0.6), 4) }) },
  // the whole print develops in the wash: the white comes up out of the blue
  'develop-in': { sec: 0.9, block: (q) => ({ a: easeOut(q, 2), dy: -8 * (1 - easeOut(q, 3)) }) },
  // isometric: the block grows up out of the floor and its wall's words rise with it
  'block-rise': { sec: 0.42, block: (q) => ({ dy: -110 * (1 - easeOut(q, 3)), a: clamp01(q * 4) }) },
  // the wall slides in along its own face, the way the camera pans an isometric room
  'face-slide': { sec: 0.4, block: (q) => { const k = 1 - easeOut(q, 3); return { dx: -140 * ISO[0] * k, dy: -140 * ISO[1] * k, a: clamp01(q * 4) }; } },
  // cel80s: the hold-and-zoom of an anime title, three cels each held, the last one stays
  'cel-zoom': { sec: 0.3, block: (q) => { const s = q < 1 / 3 ? 1.36 : q < 2 / 3 ? 1.14 : 1; return { sx: s, sy: s, a: 1 }; } },
  // a speed streak wipes the title in from the left, in hard steps
  'streak-wipe': { sec: 0.3, clip: (q) => ({ axis: 'x', at: stepsOf(easeOut(q, 2), 6) }) },
};

export const B4B_EXITS: Record<string, WorldMove> = {
  // (the words stay whole through the first third of a fade: a line squeezed by the next still reads to its end)
  'wash-out': { sec: 0.8, glyph: ({ q }) => ({ a: 1 - easeIn(clamp01((q - 0.35) / 0.65), 1.6) }) },
  'lift-off': { sec: 0.4, block: (q) => ({ dy: 14 * easeIn(q, 2), a: 1 - easeIn(q, 1.5) }) },
  'block-sink': { sec: 0.36, block: (q) => ({ dy: -110 * easeIn(q, 2), a: 1 - easeIn(q, 3) }) },
  'face-slide-out': { sec: 0.36, block: (q) => { const k = easeIn(q, 3); return { dx: 160 * ISO[0] * k, dy: 160 * ISO[1] * k, a: 1 - easeIn(q, 3) }; } },
  'cel-cut-out': { sec: 0.24, block: (q) => { const s = q < 1 / 3 ? 1 : q < 2 / 3 ? 0.9 : 0.8; return { sx: s, sy: s, a: q < 2 / 3 ? 1 : 0 }; } },
  'streak-out': { sec: 0.28, clip: (q) => ({ axis: 'x', at: 1 - stepsOf(easeIn(q, 2), 6) }) },
};

export const B4B_HOLDS: Record<string, (e: GlyphEnv) => GlyphPose> = {
  // a print does not move once it is on the paper
  'print-still': () => ({}),
  // a wall is a wall
  'iso-still': () => ({}),
  // a held cel: the title card is still while the streaks run behind it
  'cel-still': () => ({}),
};
