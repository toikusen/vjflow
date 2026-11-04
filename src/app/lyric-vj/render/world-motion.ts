// How the words of a style world arrive, stay and leave, in numbers only. Each kind comes from what the world is made of: a
// tube strikes in stutters, a printer's head steps along, ink creeps out of a wet stroke, a card jumps in the gate. Time here
// is what the renderer passes in: a world on eighteen frames a second is simply handed time held to that.
import { LOUD_ENTERS, LOUD_EXITS, LOUD_HOLDS } from './world-b3-motion';

export interface GlyphEnv {
  /** Progress through the entrance or the exit, 0..1. */
  q: number;
  i: number;
  n: number;
  /** The glyph's place in the block, 0..1 across and down. */
  u: number;
  v: number;
  seed: number;
  /** Seconds since the line came up, for moves that keep running. */
  age: number;
  /** 0 before this glyph is sung, 1 once it has been. */
  sung: number;
}

export interface GlyphPose {
  /** Opacity. */
  a?: number;
  dx?: number;
  dy?: number;
  /** Size multiplier, and width alone. */
  s?: number;
  sx?: number;
  r?: number;
  /** 1 is the lit character, 0 the world's unlit state of it. */
  tone?: number;
  /** Swap to the damaged picture of the character. */
  eaten?: boolean;
  /** Height alone. */
  sy?: number;
  /** 0..1 toward the line's key ink (read against the ground already). */
  key?: number;
  /** A copy of the character in the key ink behind it: its opacity, size and offset (px). */
  ghost?: { a: number; s?: number; dx?: number; dy?: number };
}

export interface BlockPose { dx?: number; dy?: number; sx?: number; sy?: number; r?: number; a?: number; pivot?: -1 | 0 | 1 }
/** What of the block still shows: from its top or left edge up to `at` of the way across. */
export interface Clip { axis: 'x' | 'y'; at: number }

export interface WorldMove {
  /** Seconds it wants at full pace. */
  sec: number;
  glyph?(e: GlyphEnv): GlyphPose;
  block?(q: number, seed: number): BlockPose;
  clip?(q: number): Clip;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const fract = (x: number) => x - Math.floor(x);
export const hashOf = (a: number, b = 0) => fract(Math.sin(a * 91.17 + b * 47.53) * 43758.5453);
const easeOut = (x: number, p = 3) => 1 - (1 - clamp01(x)) ** p;
const easeIn = (x: number, p = 3) => clamp01(x) ** p;
/** A step sequence of `n` held values over 0..1. */
const stepsOf = (q: number, n: number) => Math.floor(clamp01(q) * n) / n;
const stutter = (q: number, seed: number, cuts: number) => {
  const k = Math.floor(clamp01(q) * cuts);
  return hashOf(k, seed) > 0.42 + 0.4 * (1 - clamp01(q)) ? 1 : 0.1;
};

export const WORLD_ENTERS: Record<string, WorldMove> = {
  // dark-glitch: the words are there before they can be heard; a word locks in when it is sung
  'signal-lock': { sec: 0.12, glyph: ({ sung, i, age, seed }) => (sung >= 1 ? { tone: 1 } : { eaten: true, tone: 0.62, dx: (hashOf(i, Math.floor(age * 12) + seed) - 0.5) * 3.2 }) },
  'detune': { sec: 0.46, block: (q, seed) => ({ dx: (hashOf(Math.floor(q * 9), seed) - 0.5) * 120 * (1 - easeOut(q, 2)) }), glyph: ({ q, v, seed }) => ({ tone: 0.3 + 0.7 * stepsOf(q, 5), dx: (hashOf(Math.floor(v * 6), Math.floor(q * 9) + seed) - 0.5) * 70 * (1 - easeOut(q)), eaten: q < 0.7 }) },
  // neon-stage: the striker catches letter by letter
  'tube-strike': { sec: 0.62, glyph: ({ q, i, seed }) => { const from = 0.5 * hashOf(i, seed); const k = clamp01((q - from) / (1 - from)); return { tone: q >= 1 ? 1 : k >= 1 ? 1 : k <= 0 ? 0.08 : stutter(k, i + seed, 7) }; } },
  'circuit-run': { sec: 0.5, glyph: ({ q, i, n }) => { const k = clamp01(q * (n + 2) - i); return { tone: k <= 0 ? 0.08 : 0.08 + 0.92 * easeOut(k, 2) + (k < 1 ? 0.2 : 0) }; } },
  // terminal: a cell at a time, or a row at a time
  'key-type': { sec: 0.42, glyph: ({ q, i, n }) => ({ a: q * n >= i ? 1 : 0 }) },
  'line-feed': { sec: 0.3, glyph: ({ q, v }) => { const k = clamp01(q * 1.6 - v); return { a: k > 0 ? 1 : 0, dy: -(1 - stepsOf(k, 3)) * 46 }; } },
  // led-board: lamps come on along the module's own scan
  'row-scan': { sec: 0.34, clip: (q) => ({ axis: 'y', at: stepsOf(q, 11) }) },
  'column-feed': { sec: 0.44, clip: (q) => ({ axis: 'x', at: stepsOf(q, 20) }), glyph: ({ q, u }) => ({ tone: u < q + 0.08 ? 1 : 0.5 }) },
  'bank-switch': { sec: 0.3, glyph: ({ q, i }) => ({ a: q * 5 >= 1 + (i % 4) ? 1 : 0, tone: 0.6 + 0.4 * stepsOf(q, 4) }) },
  // ink-wash: the mark soaks in, heavier where the brush came down first
  'ink-bleed': { sec: 0.62, glyph: ({ q, i, n }) => { const k = clamp01((q - (0.42 * i) / Math.max(1, n)) / 0.58); return { a: easeOut(k, 2), s: 1.05 - 0.05 * easeOut(k, 2), tone: 0.45 + 0.55 * k }; } },
  'brush-fall': { sec: 0.52, glyph: ({ q, i, n }) => { const k = clamp01(q * (n * 0.45 + 1) - i * 0.45); return { a: k > 0 ? clamp01(k * 3) : 0, dy: 16 * (1 - easeOut(k)), sx: 1 + 0.05 * (1 - easeOut(k)) }; } },
  // silent-film: a splice lands, or the iris opens
  'splice-jump': { sec: 0.2, block: (q, seed) => ({ dy: q < 1 ? (Math.floor(q * 3) % 2 ? -1 : 1) * 40 * (1 - q) : 0, dx: (hashOf(Math.floor(q * 3), seed) - 0.5) * 22 * (1 - q) }) },
  'iris-open': { sec: 0.56, block: (q) => ({ sx: 0.97 + 0.03 * easeOut(q), sy: 0.97 + 0.03 * easeOut(q) }), glyph: ({ q }) => ({ a: easeOut((q - 0.25) / 0.75, 2) }) },
  // stained-glass: the sun gets round to it
  'light-through': { sec: 0.74, glyph: ({ q, u }) => ({ tone: 0.16 + 0.84 * clamp01((q * 1.6 - u) / 0.6) }) },
  'pane-set': { sec: 0.5, glyph: ({ q, i, seed }) => { const k = clamp01((q - 0.55 * hashOf(i, seed + 2)) / 0.45); return { a: k > 0 ? 1 : 0, tone: 0.3 + 0.7 * easeOut(k), s: 0.97 + 0.03 * easeOut(k) }; } },
  // ukiyoe: pressed down with the baren, a block laid and lifted
  'baren-press': { sec: 0.5, clip: (q) => ({ axis: 'x', at: easeOut(q, 2) }), glyph: ({ q, u }) => ({ tone: 0.5 + 0.5 * clamp01((q * 1.5 - u) * 2.4) }) },
  'block-lay': { sec: 0.34, block: (q, seed) => ({ dx: (seed % 2 ? 26 : -26) * (1 - easeOut(q, 4)), dy: 40 * (1 - easeOut(q, 4)), a: clamp01(q * 6) }) },
  'plate-register': { sec: 0.4, glyph: ({ q, i, seed }) => { const k = stepsOf(q, 4); return { dx: (hashOf(i, seed) - 0.5) * 16 * (1 - k), dy: (hashOf(i, seed + 1) - 0.5) * 12 * (1 - k), a: q > 0.04 ? 1 : 0 }; } },
  // papercut: the scissors run along it, or a fold opens
  'snip-along': { sec: 0.42, clip: (q) => ({ axis: 'x', at: stepsOf(q, 12) }) },
  'crease-open': { sec: 0.36, block: (q) => ({ sx: Math.max(0.03, easeOut(q, 3)) }) },
  'sheet-drop': { sec: 0.3, block: (q, seed) => ({ dy: 110 * (1 - easeOut(q, 4)), r: (seed % 2 ? 0.03 : -0.03) * (1 - easeOut(q, 3)), a: clamp01(q * 6) }) },
  // paper-lantern: light finds the shape; a sheet comes up on its stand
  'glow-up': { sec: 0.62, glyph: ({ q, u, v }) => ({ a: easeOut(q * 1.6 - 0.5 * Math.hypot(u - 0.5, v - 0.5), 2) }) },
  'stand-up': { sec: 0.44, block: (q) => ({ dy: -90 * (1 - easeOut(q, 4)), sy: 0.8 + 0.2 * easeOut(q, 4), a: clamp01(q * 5) }) },
  // chiyogami: a band wrapped on, a paper turned over
  // the hand pulls slowly to the crease and the paper snaps flat there: most of the change comes late
  'band-wrap': { sec: 0.62, clip: (q) => ({ axis: 'x', at: easeIn(q, 1.6) }), block: (q) => ({ dx: -40 * (1 - easeIn(q, 1.6)) }) },
  'paper-turn': { sec: 0.56, block: (q) => ({ sy: Math.max(0.04, q < 0.7 ? 0.35 * easeOut(q / 0.7, 2) : 0.35 + 0.65 * easeOut((q - 0.7) / 0.3, 3)) }) },
  'tag-lay': { sec: 0.54, block: (q) => ({ sx: 1.1 - 0.1 * easeIn(q, 2), sy: 1.1 - 0.1 * easeIn(q, 2), r: 0.1 * (1 - easeIn(q, 2)), a: clamp01(q * 6) }) },
  // woodcut: the knife, stroke by stroke; the block slammed down on the press
  'knife-cut': { sec: 0.4, glyph: ({ q, i, n, seed }) => { const k = clamp01(q * (n + 1) - i); return { a: k > 0 ? (hashOf(Math.floor(q * 12), i + seed) > 0.25 || k >= 1 ? 1 : 0.5) : 0 }; } },
  'press-slam': { sec: 0.22, block: (q) => ({ sx: 1.12 - 0.12 * easeOut(q, 5), sy: 1.12 - 0.12 * easeOut(q, 5), a: clamp01(q * 8) }) },
  // chalkboard: written at the hand's speed, a character at a time, in stick pressure
  'chalk-write': { sec: 0.6, glyph: ({ q, i, n }) => { const k = clamp01(q * (n + 1) - i); return { a: k > 0 ? 0.55 + 0.45 * clamp01(k * 2) : 0, dy: k < 1 ? 2 : 0 }; } },
  'chalk-tap': { sec: 0.24, glyph: ({ q, i, seed }) => { const k = clamp01(q * 1.6 - 0.6 * hashOf(i, seed)); return { a: k > 0 ? 1 : 0, s: 1.06 - 0.06 * clamp01(k * 3) }; } },
  'finger-write': { sec: 0.4, clip: (q) => ({ axis: 'x', at: stepsOf(q, 9) }) },
  // aizome: bare cloth shows up as the dye is rinsed off it
  'rinse-up': { sec: 0.7, glyph: ({ q, v }) => ({ a: easeOut(q * 1.7 - 0.7 * (1 - v), 2) }) },
  'cloth-settle': { sec: 0.5, block: (q) => ({ dy: -36 * Math.cos(q * 5) * (1 - q), a: clamp01(q * 4) }) },
  // crayon: scrawled across, or stuck on crooked
  'scrawl-on': { sec: 0.44, clip: (q) => ({ axis: 'x', at: stepsOf(q, 8) }) },
  'stuck-on': { sec: 0.24, block: (q) => ({ sx: 1.2 - 0.2 * easeOut(q, 3), sy: 1.2 - 0.2 * easeOut(q, 3), r: 0.06 * (1 - easeOut(q, 3)), a: clamp01(q * 7) }) },
  // the print worlds' own: what the press does
  squeegee: { sec: 0.34, clip: (q) => ({ axis: 'x', at: easeOut(q, 2) }) },
  'drum-feed': { sec: 0.32, glyph: ({ q, v }) => { const k = clamp01(q * 1.5 - 0.5 * v); return { a: k > 0 ? 1 : 0, dy: 90 * (1 - easeOut(k)) }; } },
  'bleach-up': { sec: 0.4, glyph: ({ q, i, n }) => ({ a: clamp01(q * 2.4 - (1.2 * i) / Math.max(1, n)) }) },
  'folder-slide': { sec: 0.28, block: (q) => ({ dx: -260 * (1 - easeOut(q, 4)) }) },
  razor: { sec: 0.26, clip: (q) => ({ axis: 'x', at: easeOut(q, 4) }), block: (q) => ({ dx: 70 * (1 - easeOut(q, 4)) }) },
  'tile-turn': { sec: 0.3, block: (q) => ({ sy: Math.max(0.03, easeOut(q, 3)) }) },
  'screen-lift': { sec: 0.26, block: (q) => ({ dy: -36 * (1 - easeOut(q, 3)) }), glyph: ({ q }) => ({ a: q < 0.3 ? 0.4 : 1 }) },
  'thin-coat': { sec: 0.5, glyph: ({ q }) => ({ a: 0.2 + 0.8 * easeOut(q, 2) }) },
  misregister: { sec: 0.28, block: (q, seed) => ({ dx: (seed % 2 ? 18 : -18) * (1 - stepsOf(q, 3)), dy: 12 * (1 - stepsOf(q, 3)) }) },
  'typed-out': { sec: 0.36, glyph: ({ q, i, n }) => ({ a: q * n >= i ? 1 : 0, dy: q * n >= i + 1 ? 0 : -4 }) },
  'slit-reveal': { sec: 0.24, clip: (q) => ({ axis: 'y', at: easeOut(q, 4) }) },
  'tile-pop': { sec: 0.22, block: (q) => ({ sx: 0.9 + 0.1 * easeOut(q, 4), sy: 0.9 + 0.1 * easeOut(q, 4), a: clamp01(q * 4) }) },
  // gothic-lolita: gold takes the light, a leaf is laid down
  'gilt-rise': { sec: 0.58, glyph: ({ q, v, i, n }) => { const k = clamp01(q * 1.7 - 0.7 * ((v + i / Math.max(1, n)) / 2)); return { a: easeOut(k * 2), tone: 0.35 + 0.65 * easeOut(k) }; } },
  'leaf-lay': { sec: 0.42, block: (q) => ({ sx: 0.04 + 0.96 * easeOut(q, 3), pivot: -1, a: clamp01(q * 5) }) },
};

export const WORLD_EXITS: Record<string, WorldMove> = {
  'carrier-lost': { sec: 0.42, glyph: ({ q, i, seed }) => { const t = hashOf(i, seed + 5) * 0.8; return { a: q < t ? 1 : hashOf(i, Math.floor(q * 9)) > 0.72 ? 0.5 : 0, eaten: q > t * 0.5, tone: 0.7 }; } },
  'squelch': { sec: 0.26, block: (q) => ({ sy: 1 - 0.94 * easeIn(q, 2), a: 1 - easeIn((q - 0.6) / 0.4) }), glyph: ({ q }) => ({ tone: 1 - 0.5 * q }) },
  'tube-die': { sec: 0.5, glyph: ({ q, i, seed }) => { const t = 0.72 * hashOf(i, seed + 9); const k = clamp01((q - t) / 0.28); return { tone: k <= 0 ? 1 : k >= 1 ? 0.06 : stutter(1 - k, i + seed, 5) }; } },
  'breaker-trip': { sec: 0.3, glyph: ({ q }) => ({ tone: q < 0.12 ? 1.1 : 0.34 * (1 - easeOut((q - 0.12) / 0.88)) + 0.02, a: 1 - easeIn((q - 0.5) / 0.5) }) },
  'scroll-off': { sec: 0.32, block: (q) => ({ dy: stepsOf(q, 4) * 300, a: 1 - easeIn((q - 0.6) / 0.4) }) },
  'clear-tty': { sec: 0.22, clip: (q) => ({ axis: 'y', at: 1 - stepsOf(q, 6) }) },
  'lamp-steps': { sec: 0.36, glyph: ({ q }) => ({ tone: q < 0.34 ? 0.62 : q < 0.67 ? 0.32 : 0.12, a: q < 0.96 ? 1 : 0 }) },
  'row-drop': { sec: 0.34, clip: (q) => ({ axis: 'y', at: 1 - stepsOf(q, 11) }) },
  'wash-away': { sec: 0.62, glyph: ({ q, v }) => { const k = clamp01(q * 1.4 - 0.4 * (1 - v)); return { a: 1 - easeOut(k, 1.6), dy: -22 * easeIn(k, 2), sx: 1 + 0.06 * k }; } },
  'dry-out': { sec: 0.58, glyph: ({ q, i, n }) => ({ a: 1 - easeIn(q, 1.6), tone: 1 - 0.8 * clamp01(q * 1.5 - (0.3 * i) / Math.max(1, n)) }) },
  'iris-close': { sec: 0.46, block: (q) => ({ sx: 1 - 0.05 * q, sy: 1 - 0.05 * q }), glyph: ({ q }) => ({ a: 1 - easeIn((q - 0.3) / 0.7, 2) }) },
  'gate-roll': { sec: 0.3, block: (q) => ({ dy: easeIn(q, 2) * 900 }) },
  'light-pass': { sec: 0.6, glyph: ({ q, u }) => ({ tone: 1 - 0.9 * clamp01((q * 1.6 - u) / 0.6), a: 1 - easeIn((q - 0.72) / 0.28) }) },
  'cloud-over': { sec: 0.56, glyph: ({ q }) => ({ tone: 1 - 0.84 * easeOut(q, 2), a: 1 - easeIn((q - 0.7) / 0.3) }) },
  'leaf-turn': { sec: 0.44, block: (q) => ({ sx: 1 - 0.97 * easeIn(q, 2), pivot: -1, a: 1 - easeIn((q - 0.76) / 0.24) }) },
  'mist-take': { sec: 0.5, clip: (q) => ({ axis: 'x', at: 1 - easeIn(q, 2) }) },
  'block-off': { sec: 0.3, block: (q) => ({ dy: 60 * easeIn(q, 2), a: 1 - easeIn((q - 0.3) / 0.7) }) },
  'fall-off': { sec: 0.4, block: (q, seed) => ({ dy: -520 * easeIn(q, 2), r: (seed % 2 ? 1 : -1) * 0.2 * easeIn(q, 2), a: q < 0.82 ? 1 : 0 }) },
  'snip-off': { sec: 0.3, clip: (q) => ({ axis: 'x', at: 1 - stepsOf(q, 10) }) },
  'lamp-down': { sec: 0.56, glyph: ({ q, u, v }) => ({ a: 1 - easeIn(q * 1.5 - 0.5 * (1 - Math.hypot(u - 0.5, v - 0.5)), 2) }) },
  'stand-down': { sec: 0.4, block: (q) => ({ dy: -160 * easeIn(q, 2), a: 1 - easeIn((q - 0.5) / 0.5) }) },
  'band-slip': { sec: 0.36, clip: (q) => ({ axis: 'x', at: 1 - easeIn(q, 2) }), block: (q) => ({ dx: 60 * easeIn(q, 2) }) },
  'paper-flip': { sec: 0.3, block: (q) => ({ sy: Math.max(0.04, 1 - easeIn(q, 2)), a: q < 0.96 ? 1 : 0 }) },
  'block-away': { sec: 0.26, block: (q) => ({ dy: -180 * easeIn(q, 3), a: 1 - easeIn((q - 0.5) / 0.5) }) },
  'knife-off': { sec: 0.3, glyph: ({ q, i, seed }) => ({ a: q > hashOf(i, seed + 4) * 0.9 ? 0 : 1 }) },
  'wipe-off': { sec: 0.32, clip: (q) => ({ axis: 'x', at: 1 - easeIn(q, 1.6) }), block: (q) => ({ dx: -14 * q }) },
  'dust-fall': { sec: 0.44, glyph: ({ q, i, seed }) => ({ dy: -80 * easeIn(q, 2) * (0.4 + hashOf(i, seed)), a: 1 - easeIn(q, 2) }) },
  'finger-rub': { sec: 0.3, clip: (q) => ({ axis: 'x', at: 1 - stepsOf(q, 6) }), block: (q) => ({ dx: 10 * q }) },
  'dye-take': { sec: 0.62, glyph: ({ q, v }) => ({ a: 1 - easeIn(q * 1.5 - 0.5 * v, 1.6) }) },
  'cloth-fold': { sec: 0.34, block: (q) => ({ sy: Math.max(0.04, 1 - easeIn(q, 2)), a: 1 - easeIn((q - 0.7) / 0.3) }) },
  'peel-page': { sec: 0.28, block: (q, seed) => ({ dy: 300 * easeIn(q, 2), r: (seed % 2 ? 0.14 : -0.14) * easeIn(q, 2), a: q < 0.9 ? 1 : 0 }) },
  'rub-out': { sec: 0.34, clip: (q) => ({ axis: 'x', at: 1 - stepsOf(q, 7) }) },
  'plate-lift': { sec: 0.3, block: (q) => ({ dy: 180 * easeIn(q, 2), a: 1 - easeIn((q - 0.4) / 0.6) }) },
  'tile-back': { sec: 0.26, block: (q) => ({ sy: Math.max(0.03, 1 - easeIn(q, 2)), a: q < 0.96 ? 1 : 0 }) },
  'razor-off': { sec: 0.24, clip: (q) => ({ axis: 'x', at: 1 - easeIn(q, 2) }) },
  'squeegee-back': { sec: 0.26, clip: (q) => ({ axis: 'x', at: 1 - easeOut(q, 2) }) },
  'fade-thin': { sec: 0.5, glyph: ({ q }) => ({ a: 1 - easeOut(q, 2) }) },
  'breath-off': { sec: 0.5, block: (q) => ({ dy: 14 * q, a: 1 - easeIn(q, 2) }) },
  'drum-out': { sec: 0.28, block: (q) => ({ dy: -170 * easeIn(q, 2), a: 1 - easeIn((q - 0.5) / 0.5) }) },
  'ink-slip': { sec: 0.26, block: (q, seed) => ({ dx: (seed % 2 ? 40 : -40) * q, a: q < 0.8 ? 1 : 0 }) },
  'file-away': { sec: 0.26, block: (q) => ({ dx: 300 * easeIn(q, 3), a: 1 - easeIn((q - 0.5) / 0.5) }) },
  'strike-out': { sec: 0.3, glyph: ({ q, i, n }) => ({ a: q * n >= n - i ? 0 : 1 }) },
  'slash-drop': { sec: 0.24, block: (q) => ({ dy: -120 * easeIn(q, 3), dx: 90 * easeIn(q, 3), a: q < 0.9 ? 1 : 0 }) },
  'tile-drop': { sec: 0.24, block: (q) => ({ sx: 1 - 0.1 * q, sy: 1 - 0.1 * q, a: 1 - easeIn(q, 2) }) },
  'gilt-dust': { sec: 0.6, glyph: ({ q, i, seed }) => { const k = clamp01((q - 0.4 * hashOf(i, seed)) / 0.6); return { a: 1 - easeIn(k, 2), dy: -60 * easeIn(k, 2.4), r: (hashOf(i, 3) - 0.5) * 0.3 * k }; } },
};

/** What a held line does: never so much that a stroke leaves its place. */
export const WORLD_HOLDS: Record<string, (e: GlyphEnv) => GlyphPose> = {
  'press-set': () => ({}),
  'hand-shake': ({ age, i, seed }) => { const t = Math.floor(age * 8); return { dx: (hashOf(t, i + seed) - 0.5) * 1.4, dy: (hashOf(t, i + seed + 2) - 0.5) * 1.4 }; },
  'cloth-drift': ({ age, u }) => ({ dy: 3 * Math.sin(age * 0.9 + u * 3) }),
  'crayon-boil': ({ age, i, seed }) => { const t = Math.floor(age * 8); return { dx: (hashOf(t, i + seed) - 0.5) * 2.4, dy: (hashOf(t, i + seed + 2) - 0.5) * 2.4, r: (hashOf(t, i) - 0.5) * 0.01 }; },
  'paper-settle': ({ age }) => ({ dy: 1.2 * Math.sin(age * 1.4) }),
  'block-boil': ({ age, i, seed }) => { const t = Math.floor(age * 7); return { dx: (hashOf(t, i + seed) - 0.5) * 1.6, dy: (hashOf(t, i + seed + 3) - 0.5) * 1.6 }; },
  'pin-sway': ({ age, seed }) => ({ dx: 2.4 * Math.sin(age * 1.1 + seed), r: 0.002 * Math.sin(age * 1.1 + seed) }),
  'lamp-breath': ({ age }) => ({ tone: 0.95 + 0.05 * Math.sin(age * 1.3) }),
  'dry-hang': ({ age, seed }) => ({ dy: 1.4 * Math.sin(age * 0.8 + seed) }),
  'cold-still': ({ age }) => ({ s: 1 + 0.006 * Math.sin(age * 0.6) }),
  'drum-tremor': ({ age, seed }) => ({ dx: Math.floor(age * 6 + seed) % 7 === 0 ? 1.5 : 0 }),
  'file-rest': () => ({ tone: 1 }),
  'blade-lean': ({ age }) => ({ dx: Math.min(4, age * 2) }),
  'beat-bump': ({ age }) => ({ s: 1 + 0.012 * Math.exp(-fract(age * 1.6) * 5) }),
  'carrier-hum': ({ v, age, seed }) => { const tick = Math.floor(age * 8); return hashOf(tick, seed + Math.floor(v * 5)) > 0.93 ? { dx: 5, tone: 0.86 } : {}; },
  'tube-hum': ({ i, age, seed }) => { const tick = Math.floor(age * 15); return { tone: hashOf(tick, i + seed) > 0.985 ? 0.72 : 0.96 + 0.04 * Math.sin(age * 37 + i) }; },
  'cursor-wait': () => ({}),
  'refresh-band': ({ v, age }) => ({ tone: 0.82 + 0.18 * (fract(v * 0.5 + age * 0.42) < 0.82 ? 1 : 0.4) }),
  'wet-spread': ({ age, i }) => ({ s: 1 + 0.012 * clamp01(age / 3) + 0.002 * Math.sin(age + i) }),
  'gate-weave': ({ age, seed }) => { const tick = Math.floor(age * 18); return { dx: (hashOf(tick, seed) - 0.5) * 3, dy: (hashOf(tick, seed + 1) - 0.5) * 2.4, tone: 0.93 + 0.07 * hashOf(tick, 9) }; },
  'sun-crawl': ({ u, age }) => { const d = fract(u * 0.4 - age * 0.16); return { tone: 0.84 + 0.16 * Math.exp(-(((d - 0.5) / 0.14) ** 2)) }; },
  'candle-sway': ({ u, v, age }) => ({ tone: 0.9 + 0.1 * Math.sin(age * 2.3 + u * 2.5) * Math.sin(age * 1.31 + v * 2) }),
};
// style batch 3's loud worlds keep their moves in world-b3-motion.ts
Object.assign(WORLD_ENTERS, LOUD_ENTERS);
Object.assign(WORLD_EXITS, LOUD_EXITS);
Object.assign(WORLD_HOLDS, LOUD_HOLDS);

/** Seconds a move gets when a line has `room` past its reading: shortened, or given up for a plain cut, never paid for by reading. */
export function moveSec(want: number, room: number, pace = 1) {
  const sec = want * pace;
  return room >= sec ? sec : room >= sec * 0.5 ? room : 0;
}

/** Each glyph's share of a line's sung time when the song has no timing of its own: by character, from the line's start. */
export function sungAt(i: number, n: number, start: number, end: number, charStarts?: number[]) {
  return charStarts?.[i] ?? start + ((end - start) * 0.92 * i) / Math.max(1, n);
}
