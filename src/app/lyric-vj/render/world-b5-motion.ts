// How the words of style batch 5 (embroidery, screentone, art-deco, notebook; boards 2026-11-06, 風格第5批設計稿) arrive,
// stay and leave, in numbers only, from each board's "later motion" (說明.md): thread is stitched a character after the
// other and the hoop slides on and off; a manga panel lights up, its balloon pops on the beat (to 1.06, never past it)
// and a sound effect is stamped on and held two frames; a deco poster opens from its axis outward and the doors close
// on it; a pen writes a character after the other and an eraser takes them back, the page turns. Registered into
// world-motion.ts's tables by name; a name belongs to one world.
import type { GlyphEnv, GlyphPose, WorldMove } from './world-motion';
import { clamp01, ease as easeOut, easeIn } from './world-craft';

const stepsOf = (q: number, n: number) => Math.floor(clamp01(q) * n) / n;
/** How far along one character's own turn a sequence is: 0 before it starts, 1 once it is done. */
const turnOf = (q: number, i: number, n: number, lead = 0) => clamp01((q - lead) * (n + 1) - i);

export const B5_ENTERS: Record<string, WorldMove> = {
  // embroidery: the needle goes a character at a time, each one stitched up from nothing in three passes
  'needle-in': { sec: 0.62, glyph: ({ q, i, n }) => { const k = turnOf(q, i, n); return { a: k > 0 ? 1 : 0, sy: k > 0 && k < 1 ? 0.7 + 0.3 * stepsOf(k, 3) : 1, sx: k > 0 && k < 1 ? 0.9 + 0.1 * stepsOf(k, 3) : 1 }; } },
  // the hoop comes in from the side with its cloth, the words on it
  'hoop-in': { sec: 0.34, block: (q) => ({ dx: 180 * (1 - easeOut(q, 4)), a: q > 0.02 ? 1 : 0 }) },
  // screentone: the balloon pops on the beat, 1.06 and back, in held frames
  'panel-pop': { sec: 0.2, block: (q) => { const s = q < 1 / 3 ? 0.92 : q < 2 / 3 ? 1.06 : 1; return { sx: s, sy: s, a: 1 }; } },
  // a hard cut to the next panel: the words are simply there
  'koma-cut': { sec: 0.08, block: (q) => ({ a: q > 0.02 ? 1 : 0 }) },
  // the sound effect is stamped on, bigger for two frames, then held
  'sfx-slam': { sec: 0.16, block: (q) => { const s = q < 0.5 ? 1.22 : 1; return { sx: s, sy: s, a: 1 }; } },
  // art-deco: the line opens from the axis outward, a character pair at a time
  'axis-open': { sec: 0.6, glyph: ({ q, u }) => { const k = clamp01(q * 1.6 - Math.abs(u - 0.5) * 1.2); return { a: stepsOf(k, 3) > 0 ? 1 : 0, tone: 0.55 + 0.45 * stepsOf(clamp01((q - 0.75) / 0.25), 2) }; } },
  // the gilt letters rise into place in three held steps
  'deco-rise': { sec: 0.36, block: (q) => ({ dy: -30 * (1 - stepsOf(easeOut(q, 2), 3)), a: q > 0.02 ? 1 : 0 }) },
  // notebook: the pen writes a character after the other, each settling as it is finished
  'pen-write': { sec: 0.55, glyph: ({ q, i, n }) => { const k = turnOf(q, i, n); return { a: k > 0 ? 1 : 0, dy: k > 0 && k < 1 ? 3 * (1 - k) : 0 }; } },
  // a pencil is slower and lighter: each character comes up in two passes of graphite
  'pencil-write': { sec: 0.8, glyph: ({ q, i, n }) => { const k = turnOf(q, i, n); return { a: k <= 0 ? 0 : k < 0.5 ? 0.6 : 1 }; } },
  // the page is turned onto: it comes down from above with the words already on it
  'leaf-in': { sec: 0.3, block: (q) => ({ dy: 70 * (1 - easeOut(q, 3)), a: q > 0.02 ? 1 : 0 }) },
};

export const B5_EXITS: Record<string, WorldMove> = {
  // embroidery: the thread is unpicked from the last character back, or the hoop slides off
  'unpick': { sec: 0.4, glyph: ({ q, i, n }) => ({ a: q * (n + 1) < n - i + 0.5 ? 1 : 0 }) },
  'hoop-out': { sec: 0.3, block: (q) => ({ dx: -200 * easeIn(q, 3), a: q < 0.88 ? 1 : 0 }) },
  // screentone: cut away at once, or the page is turned off to the left
  'koma-out': { sec: 0.08, block: (q) => ({ a: q < 0.5 ? 1 : 0 }) },
  'page-flip-out': { sec: 0.26, block: (q) => ({ dx: -140 * easeIn(q, 3), sx: 1 - 0.3 * easeIn(q, 2), a: q < 0.85 ? 1 : 0 }) },
  // art-deco: closed back to the axis, from the ends inward, or let down in steps
  'axis-close': { sec: 0.42, glyph: ({ q, u }) => ({ a: clamp01((1 - q) * 1.6 - (0.5 - Math.abs(u - 0.5)) * 1.2) > 0 ? 1 : 0 }) },
  'deco-fall': { sec: 0.3, block: (q) => ({ dy: -24 * stepsOf(q, 3), a: q < 0.8 ? 1 : 0 }) },
  // notebook: rubbed out from the last character back, a few at a time, or the page is turned away upward
  'erase-out': { sec: 0.42, glyph: ({ q, i, n }) => { const k = clamp01(q * (n + 1) - (n - 1 - i)); return { a: k <= 0 ? 1 : k < 0.5 ? 0.45 : 0 }; } },
  'leaf-off': { sec: 0.26, block: (q) => ({ dy: 90 * easeIn(q, 3), a: q < 0.85 ? 1 : 0 }) },
};

export const B5_HOLDS: Record<string, (e: GlyphEnv) => GlyphPose> = {
  // stitched thread does not move
  'cloth-still': () => ({}),
  // ink on a printed page does not move
  'ink-still': () => ({}),
  // a poster on a wall does not move
  'marquee-still': () => ({}),
  // what is written stays written
  'notebook-still': () => ({}),
};
