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
  // gameshow: the card drops on the buzzer with a bounce; the tiles flip to show the answer; the words buzz in one by one
  'slam-in': { sec: 0.24, block: (q) => ({ sx: 1.45 - 0.45 * easeOut(q, 4), sy: 1.45 - 0.45 * easeOut(q, 4), dy: -40 * (1 - easeOut(q, 3)), a: clamp01(q * 6) }) },
  'tile-flip': { sec: 0.4, glyph: ({ q, i, n }) => { const k = clamp01(q * (n + 2) - i); return { a: k > 0 ? 1 : 0, sx: k > 0 ? Math.max(0.05, Math.abs(Math.cos((1 - easeOut(k, 2)) * Math.PI * 0.5))) : 1 }; } },
  'buzz-in': { sec: 0.34, glyph: ({ q, i, n }) => { const k = clamp01(q * (n + 1.5) - i); return { a: k > 0 ? 1 : 0, s: k > 0 ? 1 + 0.3 * (1 - easeOut(k, 2)) : 1, dy: k > 0 ? 24 * (1 - easeOut(k, 2)) : 0 }; } },
  // idol-live: the spot finds the singer; the beam sweeps across; the words drop from the lighting rig
  'spot-on': { sec: 0.3, glyph: ({ q }) => ({ tone: 0.1 + 0.9 * easeOut(q, 2), a: clamp01(q * 4), s: 1.04 - 0.04 * easeOut(q, 2) }) },
  'beam-sweep': { sec: 0.46, glyph: ({ q, u }) => { const k = clamp01((q * 1.5 - u) / 0.5); return { a: k > 0 ? 1 : 0, tone: 0.3 + 0.7 * easeOut(k, 2) + (k > 0 && k < 0.5 ? 0.3 : 0) }; } },
  'rig-drop': { sec: 0.34, block: (q) => ({ dy: -220 * (1 - easeOut(q, 4)) + 14 * Math.sin(q * 9) * (1 - q), a: clamp01(q * 5) }) },
  // y2k (board motion): the title is never bent; each character rises or slides in and fades up, one after the other
  'glyph-rise': { sec: 0.5, glyph: ({ q, i, n }) => { const k = clamp01((q * (n + 3) - i) / 4); return { a: easeOut(k, 2), dy: -26 * (1 - easeOut(k, 3)) }; } },
  'glyph-slide': { sec: 0.5, glyph: ({ q, i, n }) => { const k = clamp01((q * (n + 3) - i) / 4); return { a: easeOut(k, 2), dx: -34 * (1 - easeOut(k, 3)) }; } },
  // psychedelic (board motion): the sign itself never bends; it rises into place, or its bands are printed up from the bottom
  'sign-rise': { sec: 0.5, block: (q) => ({ dy: -60 * (1 - easeOut(q, 3)), a: clamp01(q * 3) }) },
  'band-reveal': { sec: 0.42, clip: (q) => ({ axis: 'y', at: stepsOf(easeOut(q, 2), 6) }) },
  // graffiti: the can sprays, the mist settling into a stroke; the stencil lifts off; the marker writes
  'spray-on': { sec: 0.42, glyph: ({ q, i, seed }) => { const k = clamp01((q - 0.5 * hash(i, seed + 3)) / 0.5); return { a: k > 0 ? 0.35 + 0.65 * easeOut(k, 2) : 0, s: k > 0 ? 1.08 - 0.08 * easeOut(k, 2) : 1.08, tone: 0.5 + 0.5 * k }; } },
  'stencil-lift': { sec: 0.3, clip: (q) => ({ axis: 'y', at: stepsOf(q, 7) }), block: (q) => ({ dy: 6 * (1 - stepsOf(q, 7)) }) },
  'marker-write': { sec: 0.48, glyph: ({ q, i, n }) => { const k = clamp01(q * (n + 1) - i); return { a: k > 0 ? 1 : 0, dx: k > 0 && k < 1 ? 3 : 0 }; } },
  // brutalist: a copy lands, no fade; the sheet slams down in two steps; the strip is torn back to show it
  'xerox-cut': { sec: 0.08, glyph: ({ q }) => ({ a: q > 0 ? 1 : 0 }) },
  'slam-down': { sec: 0.18, block: (q) => ({ dy: -70 * (1 - stepsOf(q, 3)), a: q > 0.02 ? 1 : 0 }) },
  'strip-reveal': { sec: 0.26, clip: (q) => ({ axis: 'y', at: stepsOf(q, 4) }) },
  // citypop (board motion): the title fades in from wide tracking to its own, or line by line; it then stays a long time
  'wide-fade': { sec: 0.9, glyph: ({ q, u }) => ({ a: easeOut(q, 2), dx: (u - 0.5) * 60 * (1 - easeOut(q, 3)) }) },
  'line-fade': { sec: 0.9, glyph: ({ q, v }) => { const k = clamp01(q * 1.6 - v * 0.6); return { a: easeOut(k, 2) }; } },
};

export const LOUD_EXITS: Record<string, WorldMove> = {
  'panel-wipe': { sec: 0.24, clip: (q) => ({ axis: 'x', at: 1 - stepsOf(easeIn(q, 2), 6) }) },
  'balloon-shrink': { sec: 0.22, block: (q) => { const s = 1 - 0.6 * easeIn(q, 2); return { sx: s, sy: s, dx: -50 * easeIn(q, 2), dy: 40 * easeIn(q, 2), a: q < 0.85 ? 1 : 0 }; } },
  'caption-slide-out': { sec: 0.3, block: (q) => ({ dx: 120 * easeIn(q, 2), a: 1 - easeIn(q, 2) }) },
  'card-drop': { sec: 0.3, block: (q) => ({ dy: 700 * easeIn(q, 2), r: 0.08 * easeIn(q, 2), a: q < 0.9 ? 1 : 0 }) },
  'flip-away': { sec: 0.28, glyph: ({ q, i, n }) => { const k = clamp01(q * (n + 2) - (n - i)); return { sx: Math.max(0.05, 1 - easeIn(k, 2)), a: k >= 1 ? 0 : 1 }; } },
  'blackout-off': { sec: 0.26, glyph: ({ q }) => ({ tone: 1 - 0.9 * easeOut(q, 2), a: q < 0.8 ? 1 : 1 - (q - 0.8) * 5 }) },
  'beam-off': { sec: 0.4, glyph: ({ q, u }) => { const k = clamp01((q * 1.5 - (1 - u)) / 0.5); return { tone: 1 - 0.7 * k, a: 1 - easeIn(k, 2) }; } },
  'glyph-lift-out': { sec: 0.4, glyph: ({ q, i, n }) => { const k = clamp01((q * (n + 3) - i) / 4); return { a: 1 - easeIn(k, 2), dy: 22 * easeIn(k, 2) }; } },
  'glyph-slide-out': { sec: 0.4, glyph: ({ q, i, n }) => { const k = clamp01((q * (n + 3) - i) / 4); return { a: 1 - easeIn(k, 2), dx: 30 * easeIn(k, 2) }; } },
  'sign-sink': { sec: 0.42, block: (q) => ({ dy: 50 * easeIn(q, 2), a: 1 - easeIn(q, 2) }) },
  'band-cover': { sec: 0.36, clip: (q) => ({ axis: 'y', at: 1 - stepsOf(easeIn(q, 2), 6) }) },
  'buff-out': { sec: 0.36, clip: (q) => ({ axis: 'x', at: 1 - easeIn(q, 1.6) }) },
  'peel-off': { sec: 0.3, block: (q, seed) => ({ dy: 90 * easeIn(q, 2), r: (seed % 2 ? 0.05 : -0.05) * easeIn(q, 2), a: 1 - easeIn(q, 1.4) }) },
  'rip-off': { sec: 0.2, block: (q, seed) => ({ dx: (seed % 2 ? 1 : -1) * 500 * stepsOf(easeIn(q, 2), 4), a: q < 0.85 ? 1 : 0 }) },
  'invert-off': { sec: 0.16, glyph: ({ q }) => ({ tone: q < 0.5 ? 0.2 : 1, a: q < 0.5 ? 1 : 0 }) },
  'slow-fade': { sec: 0.9, glyph: ({ q }) => ({ a: 1 - easeIn(q, 1.6) }) },
  'wide-out': { sec: 0.8, glyph: ({ q, u }) => ({ a: 1 - easeIn(q, 1.6), dx: (u - 0.5) * 50 * easeIn(q, 2) }) },
};

export const LOUD_HOLDS: Record<string, (e: GlyphEnv) => GlyphPose> = {
  'page-still': () => ({}),
  // the burst flexes on each beat: the sound effect breathes with it, a hair
  'burst-flex': ({ age }) => ({ s: 1 + 0.025 * Math.exp(-fract(age * 2) * 6) }),
  'studio-bounce': ({ age }) => ({ s: 1 + 0.02 * Math.exp(-fract(age * 2) * 7) }),
  'stage-pulse': ({ age, i }) => ({ tone: 0.92 + 0.08 * Math.sin(age * 2.2 + i * 0.4) }),
  'sleeve-still': () => ({}),
  'poster-still': () => ({}),
  'drip-hang': ({ age, i, seed }) => ({ dy: Math.min(4, age * 0.5) * hash(i, seed + 7) }),
  'copier-jitter': ({ age, i, seed }) => { const t = Math.floor(age * 12); return { dx: (hash(t, i + seed) - 0.5) * 2, dy: (hash(t, seed) - 0.5) * 1.5 }; },
  'cover-still': () => ({}),
};
