// Things that happen while a world's line is held (2026-11-04, gap 1 of docs/research/2026-11-04-jizura-comparison.md:
// a held line drifted and nothing happened). One event a line, in its held stretch, on a beat; each world has its own
// two or three (world-shared.ts). Rebuilt from descriptions only (Motion Prompt #156 text roll, #191 a held moment
// turning on the beat): nothing copied. Numbers only, like world-motion.ts.
// Rules kept: no event moves a stroke into another (crack only opens the line, beat-punch scales the block as one);
// colour changes go to the line's key ink, which is already read against the ground; an event that dims or turns a
// character away (flicker, roll) is only placed after the line's reading time (plan side, lineplan-core.ts beatOf).
import type { BeatKind, StressKind } from '../world-shared';
import type { BlockPose, GlyphEnv, GlyphPose } from './world-motion';
import type { Slots } from './world-objects';
import { contrast } from '../contrast';

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const easeOut = (x: number, p = 3) => 1 - (1 - clamp01(x)) ** p;
const fract = (x: number) => x - Math.floor(x);
const hashOf = (a: number, b = 0) => fract(Math.sin(a * 91.17 + b * 47.53) * 43758.5453);

/** A glyph's place for an event: `span` is 1 for the characters of the phrase the event names (ink-swap), else 0. */
export interface BeatEnv extends GlyphEnv { span: number }

export interface BeatMove {
  /** Its own length, s; a settling event takes the length its line gives it (the plan's `sec`). */
  sec: number;
  /** It dims or turns characters away for a moment: it waits for the line to be read. */
  hides?: boolean;
  /** It settles into a new state and keeps it to the line's end (no pulse back). */
  stays?: boolean;
  glyph?(e: BeatEnv): GlyphPose;
  block?(q: number): BlockPose;
  /** How far the line's own carrier has gone, 0..1: slid along its slack (settle) or opened past its edge (open). */
  carrier?(q: number): { slide: number; open: number };
  /** How far the copies behind a blown-up word have spread, as a multiple of their own offset. */
  spread?(q: number): number;
}

/** The settled block's size: once, and it stays (the renderer lowers it to what the frame and the page leave). */
export const GROW = { want: 1.12, least: 1.08 };
/** The copies behind a blown-up word spread to this multiple of their offset, never under `least` (else no event). */
export const SPREAD = { want: 1.9, least: 1.35 };
/** A carrier slides at most this share of the frame's width, and only if its slack round the words leaves at least `least` px. */
export const SETTLE = { share: 0.07, least: 40 };
/** A panel opens past its edge by this share of its width, at least `least` px of the frame. */
export const OPEN = { share: 0.12, least: 60 };

/** How far a rolling character turns: its height never goes under this share. */
export const ROLL_LEAST = 0.6;
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
    // (a half turn, never edge-on: the characters stay readable through it; the reading gate caught edge-on rolls on 3 lines)
    const turn = Math.max(ROLL_LEAST, Math.abs(Math.cos(Math.PI * k)));
    return { sy: k > 0 && k < 1 ? turn : 1, key: half ? (k >= 0.5 ? 1 : 0) : k >= 0.5 ? 0 : 1 };
  } },
  // the line kicks on the beat, the block as one, and flashes the key ink as it lands
  'beat-punch': { sec: 0.45, block: (q) => ({ sx: 1 + 0.1 * Math.exp(-q * 6) * (q > 0 ? 1 : 0), sy: 1 + 0.1 * Math.exp(-q * 6) * (q > 0 ? 1 : 0) }), glyph: ({ q }) => ({ key: q < 0.4 ? 1 : 0 }) },
  // (settling, Q2: most of the change in the first frames, then it stays)
  // a whole phrase takes the key ink at once and keeps it
  'ink-swap': { sec: 0.3, stays: true, glyph: ({ q, span }) => ({ key: span ? easeOut(q, 5) : 0 }) },
  // the line's own carrier slides along the slack round the words and lies there; the words stay where they are
  'carrier-settle': { sec: 0.3, stays: true, carrier: (q) => ({ slide: easeOut(q, 5), open: 0 }) },
  // the copies behind a blown-up word spread further out and stay
  'plate-spread': { sec: 0.3, stays: true, spread: (q) => 1 + (SPREAD.want - 1) * easeOut(q, 5) },
  // the line's own panel opens past one edge, away from the words
  'panel-open': { sec: 0.3, stays: true, carrier: (q) => ({ slide: 0, open: easeOut(q, 5) }) },
  // (the fallback when none of the others fits a line, round 3: every character takes a second ink at once and keeps it;
  // nothing moves, nothing fades, a one-ink world stays one ink across the whole line)
  'line-ink-settle': { sec: 0.2, stays: true, glyph: ({ q }) => ({ key: easeOut(q, 5) }) },
  // the whole block steps up once and stays
  'line-grow': { sec: 0.3, stays: true, block: (q) => { const k = 1 + (GROW.want - 1) * easeOut(q, 5); return { sx: k, sy: k }; } },
  // the power dips and the characters relight one by one (never below half: it stays readable)
  flicker: { sec: 0.5, hides: true, glyph: ({ q, i, seed }) => { const back = 0.25 + 0.6 * hashOf(i, seed + 7); return { tone: q >= back ? 1 : hashOf(Math.floor(q * 14), i + seed) > 0.5 ? 0.55 : 0.75 }; } },
};

/** The colour a stress is drawn in, of the scheme's slots: it must be seen on the ground and the words must read on it, else the next stress. */
export function stressInk(kind: StressKind, ink: string, ground: string, slots: Slots, key: string): string | undefined {
  const pool = kind === 'outline' ? [key, slots.ink2, slots.accent] : kind === 'plate' ? [key, slots.accent, slots.ink2] : [slots.ink2, slots.faint, slots.plateInk, slots.accent];
  // outline sits round the letters, never under a stroke: it only has to be seen; the others lie under the edges
  return pool.find((c) => c && /^#[0-9a-f]{6}$/i.test(c) && contrast(c, ground) >= 1.4 && (kind === 'outline' || contrast(ink, c) >= 3));
}

/** An event's progress at `t`, in the world's own time (stepped worlds jump in five steps), or undefined outside it; one that stays is 1 after. */
export function beatProgress(at: number, sec: number, t: number, stepped: boolean, stays = false): number | undefined {
  if (t < at) return undefined;
  if (t >= at + sec) return stays ? 1 : undefined;
  const q = (t - at) / sec;
  return stepped ? Math.floor(q * 6) / 6 : q;
}
