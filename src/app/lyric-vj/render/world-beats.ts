// Things that happen while a world's line is held (2026-11-04, gap 1 of docs/research/2026-11-04-jizura-comparison.md:
// a held line drifted and nothing happened). One event a line, in its held stretch, on a beat; each world has its own
// two or three (world-shared.ts). Rebuilt from descriptions only (Motion Prompt #156 text roll, #191 a held moment
// turning on the beat): nothing copied. Numbers only, like world-motion.ts.
// Rules kept: no event moves a stroke into another (crack only opens the line, beat-punch scales the block as one);
// colour changes go to the line's key ink, which is already read against the ground; an event that dims or turns a
// character away (flicker, roll) is only placed after the line's reading time (plan side, lineplan-core.ts beatOf).
import type { BeatKind } from '../world-shared';
import type { BlockPose, GlyphEnv, GlyphPose } from './world-motion';

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const easeOut = (x: number, p = 3) => 1 - (1 - clamp01(x)) ** p;
const fract = (x: number) => x - Math.floor(x);
const hashOf = (a: number, b = 0) => fract(Math.sin(a * 91.17 + b * 47.53) * 43758.5453);

export interface BeatMove {
  sec: number;
  /** It dims or turns characters away for a moment: it waits for the line to be read. */
  hides?: boolean;
  glyph?(e: GlyphEnv): GlyphPose;
  block?(q: number): BlockPose;
}

/** Half a turn and back: 0 at both ends, 1 in the middle. */
const arch = (q: number) => Math.sin(Math.PI * clamp01(q));

export const WORLD_BEATS: Record<BeatKind, BeatMove> = {
  // the characters take the key ink one after another and give it back behind the front
  'ink-run': { sec: 0.9, glyph: ({ q, u }) => ({ key: Math.abs(u - (q * 1.7 - 0.35)) < 0.3 ? 1 : 0 }) },
  // a narrow band of light crosses the line
  'light-sweep': { sec: 0.8, glyph: ({ q, u }) => { const k = Math.exp(-(((u - (q * 1.5 - 0.25)) / 0.13) ** 2)); return { key: k, s: 1 + 0.02 * k }; } },
  // a copy of each character swells out of it and is gone
  echo: { sec: 0.6, glyph: ({ q }) => ({ ghost: { a: 0.42 * (1 - easeOut(q, 2)), s: 1 + 0.5 * easeOut(q, 2) } }) },
  // the key plate slips off register and is pulled back
  'plate-slip': { sec: 0.6, glyph: ({ q }) => { const k = arch(q); return { ghost: { a: 0.9 * Math.min(1, k * 3), dx: 9 * k, dy: -7 * k } }; } },
  // the line opens a crack down its middle, then closes
  crack: { sec: 0.5, glyph: ({ q, u, i, seed }) => { const k = arch(q); const side = u > 0.5 ? 1 : -1; return { dx: side * 9 * k, dy: (hashOf(i, seed) - 0.5) * 4 * k, r: side * 0.02 * k }; } },
  // each character rolls over into the key ink and, half a beat on, back
  roll: { sec: 1, hides: true, glyph: ({ q, u }) => {
    const half = q < 0.5;
    const k = clamp01(((half ? q : q - 0.5) * 2) * 1.6 - u * 0.6);
    const turn = Math.max(0.08, Math.abs(Math.cos(Math.PI * k)));
    return { sy: k > 0 && k < 1 ? turn : 1, key: half ? (k >= 0.5 ? 1 : 0) : k >= 0.5 ? 0 : 1 };
  } },
  // the line kicks on the beat, the block as one, and flashes the key ink as it lands
  'beat-punch': { sec: 0.45, block: (q) => ({ sx: 1 + 0.1 * Math.exp(-q * 6) * (q > 0 ? 1 : 0), sy: 1 + 0.1 * Math.exp(-q * 6) * (q > 0 ? 1 : 0) }), glyph: ({ q }) => ({ key: q < 0.4 ? 1 : 0 }) },
  // the power dips and the characters relight one by one (never below half: it stays readable)
  flicker: { sec: 0.5, hides: true, glyph: ({ q, i, seed }) => { const back = 0.25 + 0.6 * hashOf(i, seed + 7); return { tone: q >= back ? 1 : hashOf(Math.floor(q * 14), i + seed) > 0.5 ? 0.55 : 0.75 }; } },
};

/** An event's progress at `t`, in the world's own time (stepped worlds jump in five steps), or undefined outside it. */
export function beatProgress(at: number, sec: number, t: number, stepped: boolean): number | undefined {
  if (t < at || t >= at + sec) return undefined;
  const q = (t - at) / sec;
  return stepped ? Math.floor(q * 6) / 6 : q;
}
