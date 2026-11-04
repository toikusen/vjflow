// How the words of style batch 3 (the loud worlds) arrive, stay and leave, in numbers only. Each kind is what its world
// does to a word: a comic panel slams, a quiz card flips, a spot finds the singer, a bubble pops, a wave carries, a can
// sprays, a copier cuts, the air fades. Registered into world-motion.ts's tables by name; a name belongs to one world.
import type { GlyphEnv, GlyphPose, WorldMove } from './world-motion';
import { clamp01, ease as easeOut, easeIn, fract, hash } from './world-craft';

const stepsOf = (q: number, n: number) => Math.floor(clamp01(q) * n) / n;
/** Past 1 and back: a slam that overshoots. */
const over = (q: number, k = 0.18) => { const x = clamp01(q); return 1 + k * Math.sin(x * Math.PI) * (1 - x); };

export const LOUD_ENTERS: Record<string, WorldMove> = {
  // popart (board motion): a balloon pops out of its tail's corner; the colour plate prints first and the key lands two
  // frames later; the narrator's caption only slides; a sound effect is stamped down
  'balloon-pop': { sec: 0.26, block: (q) => { const k = easeOut(q, 3); const s = q >= 1 ? 1 : 0.55 + 0.45 * over(q, 0.22) * k; return { sx: s, sy: s, dx: -60 * (1 - k), dy: 50 * (1 - k), a: clamp01(q * 8) }; } },
  'plate-then-key': { sec: 0.2, glyph: ({ q }) => (q < 0.4 ? { a: q > 0.05 ? 1 : 0, dx: 5, dy: -3, tone: 0.55 } : { a: 1 }) },
  'caption-slide': { sec: 0.34, block: (q) => ({ dx: -90 * (1 - easeOut(q, 3)), a: clamp01(q * 5) }) },
  'sfx-stamp': { sec: 0.18, block: (q) => { const s = q >= 1 ? 1 : 1.35 - 0.35 * easeOut(q, 4); return { sx: s, sy: s, a: q > 0.02 ? 1 : 0 }; } },
  // gameshow (board motion): the card is pushed in from the left, its tab first; the cells flip open letter by letter
  'push-in-left': { sec: 0.26, block: (q) => ({ dx: -900 * (1 - easeOut(q, 3)), a: q > 0.02 ? 1 : 0 }) },
  'tile-reveal': { sec: 0.5, glyph: ({ q, i, n }) => { const k = clamp01(q * (n + 2) - i); return { a: k > 0.5 ? 1 : 0, sy: Math.max(0.03, Math.abs(Math.cos(Math.PI * (1 - k)))) }; } },
  // idol-live (board motion): fan letters are stuck on one by one, a bounce and settle; a card turns over to show its letter
  'sticker-pop': { sec: 0.5, glyph: ({ q, i, n }) => { const k = clamp01(q * (n + 2) - i); return { a: k > 0 ? 1 : 0, s: k > 0 ? 1 + 0.25 * Math.sin(k * Math.PI) * (1 - k * 0.5) : 1 }; } },
  'card-flip-in': { sec: 0.5, glyph: ({ q, i, n }) => { const k = clamp01(q * (n + 2) - i); return { a: k > 0.5 ? 1 : 0, sx: Math.max(0.03, Math.abs(Math.cos(Math.PI * (1 - k)))) }; } },
  // y2k (direction-B boards): a page of the early web. Characters drop in one after another in whole pixel steps, or the
  // block pops like a pressed gel button; a character is never bent, and its pink misprint moves with it (never a trail)
  'pixel-drop': { sec: 0.45, glyph: ({ q, i, n }) => { const k = clamp01(q * (n + 2) - i); return { a: k > 0 ? 1 : 0, dy: 12 * Math.ceil(3 * (1 - k)) }; } },
  'gel-pop': { sec: 0.24, block: (q) => { const s = q >= 1 ? 1 : stepsOf(q, 4) < 0.5 ? 0.9 : stepsOf(q, 4) < 0.75 ? 1.04 : 1; return { sx: s, sy: s, a: q > 0.02 ? 1 : 0 }; } },
  // psychedelic (board motion): the sign itself never bends; it rises into place, or its bands are printed up from the bottom
  'sign-rise': { sec: 0.5, block: (q) => ({ dy: -60 * (1 - easeOut(q, 3)), a: clamp01(q * 3) }) },
  'band-reveal': { sec: 0.42, clip: (q) => ({ axis: 'y', at: stepsOf(easeOut(q, 2), 6) }) },
  // graffiti (round-2 board motion): the stencil is slapped on and the can passes along it, the words appearing segment by
  // segment the way the spray sweeps; or the stencil lifts off
  'stencil-sweep': { sec: 0.4, clip: (q) => ({ axis: 'x', at: stepsOf(easeOut(q, 2), 8) }) },
  'stencil-lift': { sec: 0.3, clip: (q) => ({ axis: 'y', at: stepsOf(q, 7) }), block: (q) => ({ dy: 6 * (1 - stepsOf(q, 7)) }) },
  // brutalist (board motion): cuts, never fades: the block lands whole, or jumps a grid step into place
  'hard-cut': { sec: 0.04, glyph: ({ q }) => ({ a: q > 0 ? 1 : 0 }) },
  'grid-jump': { sec: 0.16, block: (q) => ({ dy: q < 0.5 ? -48 : 0, a: q > 0 ? 1 : 0 }) },
  // citypop (board motion): the title fades in from wide tracking to its own, or line by line; it then stays a long time
  'wide-fade': { sec: 0.9, glyph: ({ q, u }) => ({ a: easeOut(q, 2), dx: (u - 0.5) * 60 * (1 - easeOut(q, 3)) }) },
  'line-fade': { sec: 0.9, glyph: ({ q, v }) => { const k = clamp01(q * 1.6 - v * 0.6); return { a: easeOut(k, 2) }; } },
};

export const LOUD_EXITS: Record<string, WorldMove> = {
  'panel-wipe': { sec: 0.24, clip: (q) => ({ axis: 'x', at: 1 - stepsOf(easeIn(q, 2), 6) }) },
  'balloon-shrink': { sec: 0.22, block: (q) => { const s = 1 - 0.6 * easeIn(q, 2); return { sx: s, sy: s, dx: -50 * easeIn(q, 2), dy: 40 * easeIn(q, 2), a: q < 0.85 ? 1 : 0 }; } },
  'caption-slide-out': { sec: 0.3, block: (q) => ({ dx: 120 * easeIn(q, 2), a: 1 - easeIn(q, 2) }) },
  'pixel-lift': { sec: 0.36, glyph: ({ q, i, n }) => { const k = clamp01(q * (n + 2) - i); return { a: k < 1 ? 1 : 0, dy: 12 * Math.floor(3 * k) }; } },
  'gel-shrink': { sec: 0.2, block: (q) => { const s = 1 - 0.1 * stepsOf(q, 3); return { sx: s, sy: s, a: q < 0.9 ? 1 : 0 }; } },
  'sign-sink': { sec: 0.42, block: (q) => ({ dy: 50 * easeIn(q, 2), a: 1 - easeIn(q, 2) }) },
  'band-cover': { sec: 0.36, clip: (q) => ({ axis: 'y', at: 1 - stepsOf(easeIn(q, 2), 6) }) },
  'buff-out': { sec: 0.36, clip: (q) => ({ axis: 'x', at: 1 - easeIn(q, 1.6) }) },
  'peel-off': { sec: 0.3, block: (q, seed) => ({ dy: 90 * easeIn(q, 2), r: (seed % 2 ? 0.05 : -0.05) * easeIn(q, 2), a: 1 - easeIn(q, 1.4) }) },
  'hard-off': { sec: 0.04, glyph: ({ q }) => ({ a: q < 0.5 ? 1 : 0 }) },
  'pull-off': { sec: 0.16, block: (q) => ({ dx: -96 * Math.ceil(q * 3), a: q < 0.9 ? 1 : 0 }) },
  'sticker-off': { sec: 0.36, glyph: ({ q, i, n }) => { const k = clamp01(q * (n + 2) - (n - 1 - i)); return { a: 1 - easeIn(k, 2), s: 1 - 0.3 * easeIn(k, 2) }; } },
  'slide-away': { sec: 0.4, block: (q) => ({ dx: 1400 * easeIn(q, 3), a: q < 0.95 ? 1 : 0 }) },
  'push-out-right': { sec: 0.24, block: (q) => ({ dx: 1100 * easeIn(q, 3), a: q < 0.95 ? 1 : 0 }) },
  'tile-hide': { sec: 0.36, glyph: ({ q, i, n }) => { const k = clamp01(q * (n + 2) - i); return { a: k < 0.5 ? 1 : 0, sy: Math.max(0.03, Math.abs(Math.cos(Math.PI * k))) }; } },
  // (the words stay whole through the first third of a long fade: a line squeezed by the next one still reads to its end)
  'slow-fade': { sec: 0.9, glyph: ({ q }) => ({ a: 1 - easeIn(clamp01((q - 0.35) / 0.65), 1.6) }) },
  'wide-out': { sec: 0.8, glyph: ({ q, u }) => ({ a: 1 - easeIn(clamp01((q - 0.35) / 0.65), 1.6), dx: (u - 0.5) * 50 * easeIn(q, 2) }) },
};

export const LOUD_HOLDS: Record<string, (e: GlyphEnv) => GlyphPose> = {
  'page-still': () => ({}),
  // the burst flexes on each beat: the sound effect breathes with it, a hair
  'burst-flex': ({ age }) => ({ s: 1 + 0.025 * Math.exp(-fract(age * 2) * 6) }),
  'studio-still': () => ({}),
  'merch-still': () => ({}),
  'web-still': () => ({}),
  'poster-still': () => ({}),
  // the copier's feed: the sheet moves 1 px every other frame, the words with it
  'copier-feed': ({ age }) => ({ dy: Math.floor(age * 15) % 2 ? -1 : 0 }),
  'cover-still': () => ({}),
  // a paste-up does not move once it is on the wall
  'paste-still': () => ({}),
};
