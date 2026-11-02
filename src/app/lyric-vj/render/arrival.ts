// Entrances that land a whole line, in numbers only: how it travels, opens, seats or turns into place. Every pose here is
// exactly the rest pose from k = 1 on, so what reading sees never moves. k is entrance progress, 0..1. y is up.

/** Seconds of each entrance, before a short line's pace. */
export const ARRIVAL_SEC = { 'curve-arrive': 0.64, 'panel-open': 0.58, 'phrase-mark': 0.66, 'wave-reveal': 0.56, 'corner-land': 0.44, 'outline-seat': 0.5, 'slat-face': 0.54, 'grain-resolve': 0.6, 'edge-light': 0.56, 'scale-steps': 0.5 } as const;
export type ArrivalEnter = keyof typeof ARRIVAL_SEC;
export const ARRIVALS = Object.keys(ARRIVAL_SEC) as ArrivalEnter[];
export const isArrival = (e: string): e is ArrivalEnter => e in ARRIVAL_SEC;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const easeOut = (x: number, p = 3) => 1 - (1 - clamp01(x)) ** p;

/** The size a block stands at, k into its entrance: a few hard steps up to its fitted size, reached exactly at 1, never past it. */
export function stepScale(k: number, steps: number, from = 0.55) {
  if (k >= 1) return 1;
  const i = Math.floor(Math.max(0, k) * steps);
  return from + ((1 - from) * i) / steps;
}

export type CurveKind = 's' | 'spiral';
export interface Travel { x: number; y: number; rot: number }

/** Share of the entrance glyph i of n waits, the end of the line that arrives first leading the way. */
export const trainDelay = (i: number, n: number, dir: number) => (n < 2 ? 0 : 0.34 * ((dir > 0 ? i : n - 1 - i) / (n - 1)));

/** Where a glyph is on its way in: an open, off-centre path that never closes on itself and turns the glyph only so far. */
export function curvePoint(q: number, dir: number, kind: CurveKind, reach = 1, bend = 1): Travel {
  const s = 1 - easeOut(q, 2.4);
  if (s <= 0) return { x: 0, y: 0, rot: 0 };
  const rot = dir * 0.4 * Math.sin(s * Math.PI * 1.5) * Math.min(1, s * 4);
  if (kind === 's') return { x: dir * 1180 * reach * s, y: 310 * bend * Math.sin(s * Math.PI * 1.55) * s ** 0.5, rot };
  const a = 0.6 + Math.PI * 1.7 * s;
  return { x: dir * 680 * reach * s * Math.cos(a) * 1.35, y: 680 * bend * s * Math.sin(a) * 0.72, rot };
}

/** A short line turns once on the spot's way in; a long one needs the length of an S. */
export const curveKind = (chars: number): CurveKind => (chars <= 8 ? 'spiral' : 's');

/** Where two doors meet, 0..1 across the block: on the phrase break nearest the song's off-centre aim, never in the middle. */
export function doorSeam(breaks: number[], seed: number, off = 0.12): number {
  const aim = seed % 2 ? 0.5 - off : 0.5 + off;
  const fair = breaks.filter((b) => b >= 0.26 && b <= 0.74 && Math.abs(b - 0.5) >= 0.06);
  return fair.reduce((best, b) => (Math.abs(b - aim) < Math.abs(best - aim) ? b : best), fair[0] ?? aim);
}

/** Doors at k: `cover` lets them down over the block; each then slides off, the far one a moment later. All of it over by 1. */
export function doorPhase(k: number) {
  return { cover: easeOut(k / 0.24), left: k >= 1 ? 1 : easeOut((k - 0.24) / 0.68, 2.2), right: k >= 1 ? 1 : easeOut((k - 0.32) / 0.68, 2.2) };
}

/** How much of phrase i of n has been ruled out at k: one after another, the last done exactly at 1. */
export function markShare(i: number, n: number, k: number): number {
  if (k >= 1) return 1;
  const dur = n < 2 ? 1 : 0.46;
  return easeOut((k - (n < 2 ? 0 : (1 - dur) * (i / (n - 1)))) / dur, 2);
}

/** The torn edge's height at x, in px: two slow, unrelated waves dying away to a straight line by k = 1. */
export function waveEdge(x: number, k: number, seed: number, amp: number, stretch = 1): number {
  if (k >= 1) return 0;
  const [a, b] = [(seed % 13) * 0.7, (seed % 7) * 1.1];
  return amp * (1 - clamp01(k)) ** 0.7 * (0.62 * Math.sin(x / (190 * stretch) + a + clamp01(k) * 2.4) + 0.38 * Math.sin(x / (83 * stretch) + b - clamp01(k) * 1.5));
}

/** How far below its place a glyph is, as a share of its size: it comes up from behind the edge. */
export const waveRise = (k: number) => (k >= 1 ? 0 : 1.1 * (1 - easeOut(k)));

export interface CornerPose { rot: number; dx: number; dy: number; scale: number; pivot: [number, number] }

/** The block swung in about a point near one of its top corners, through an arc off any round angle. `reach` is the song's own, 0.8..1.25. */
export function cornerPose(k: number, dir: number, seed: number, reach = 1): CornerPose {
  const off = 1 - easeOut(k, 3.4);
  const pivot: [number, number] = [dir > 0 ? 0.1 : 0.9, seed % 2 ? 0.9 : 0.72];
  if (off <= 0) return { rot: 0, dx: 0, dy: 0, scale: 1, pivot };
  return { rot: dir * (0.34 + (seed % 5) * 0.055) * reach * off, dx: dir * 300 * reach * off, dy: -(120 + (seed % 3) * 50) * reach * off, scale: 1 + 0.1 * off, pivot };
}

export interface SeatRing { scale: number; alpha: number }

/** The two outlines closing on the solid, at unequal distances, and the solid they leave: gone exactly as it is whole. */
export function seatPhase(k: number, reach = 1): { rings: [SeatRing, SeatRing]; solid: number } {
  if (k >= 1) return { rings: [{ scale: 1, alpha: 0 }, { scale: 1, alpha: 0 }], solid: 1 };
  const ring = (from: number, far: number): SeatRing => {
    const q = clamp01((k - from) / (1 - from));
    return { scale: 1 + far * (1 - easeOut(q)), alpha: clamp01(q * 7) * (1 - clamp01((q - 0.7) / 0.3)) };
  };
  return { rings: [ring(0, 0.56 * reach), ring(0.2, 0.23 * reach)], solid: clamp01((k - 0.55) / 0.42) };
}
