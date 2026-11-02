// The motion of signature moments (render/signature.ts), with no canvas: eased schedules keyed to sung times, so
// the same form lands on the sung character in any song. Numbers are degrees, px at 1920×1080 and seconds.

export const clamp = (x: number) => Math.min(1, Math.max(0, x));
export const easeOut = (x: number) => 1 - (1 - clamp(x)) ** 3;
export const easeIn = (x: number) => clamp(x) ** 2.4;
export const mix = (a: number, b: number, k: number) => a + (b - a) * k;
export const RAD = Math.PI / 180;

/** A seeded generator: the same paper and tear on every frame and worker. */
export const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);

export interface Jolt { at: number; dx: number; dy: number; rot: number; zoom: number }
/** Damped jolts of the whole frame: each one is a sung hit landing. Sized by how hard: 1 is the strike itself. */
export const jolt = (at: number, hard: number, dir = 1): Jolt => ({ at, dx: 26 * hard * dir, dy: -32 * hard, rot: -1.1 * hard * dir, zoom: 0.045 * hard });

export function joltAt(jolts: Jolt[], t: number) {
  const out = { dx: 0, dy: 0, rot: 0, zoom: 1 };
  for (const j of jolts) {
    const e = t - j.at;
    if (e < 0 || e > 0.6) continue;
    const k = Math.exp(-e * 11) * Math.cos(e * 34);
    out.dx += j.dx * k;
    out.dy += j.dy * k;
    out.rot += j.rot * k;
    out.zoom += j.zoom * Math.exp(-e * 12);
  }
  return out;
}

/** The striking line's angle: wound back from its entrance, snapping up into the board on the sung verb, recoiling after. */
export function strikeAngle(t: number, enter: number, at: number): number {
  if (t < enter) return 0;
  if (t < at - 0.1) return mix(0, 8, easeOut((t - enter) / 0.6));
  if (t < at) return mix(8, -25, easeIn((t - (at - 0.1)) / 0.1));
  const e = t - at;
  return mix(-25, -13, easeOut(e / 0.62)) - 3 * Math.exp(-e * 8) * Math.sin(e * 26);
}

/** The bars' tip reaches the frame's edge without leaving it, jolt included. */
export const SWING = 52;
export type Pose = [number, number, number];

/**
 * The two bars' poses at the sung hits: hits come in pairs on one bar (up, then down), the bars taking turns; the
 * line sung again swings the other way. Each pose holds a beat and the next hit snaps from it.
 */
export function swingPoses(hits: number[], up: 1 | -1): Pose[] {
  const poses: Pose[] = [];
  const gap = (i: number) => Math.min(0.14, Math.max(0.05, ((hits[i + 1] ?? hits[i] + 0.3) - hits[i]) * 0.45));
  if (hits.length) poses.push([hits[0] - 0.12, 0, 0]);
  hits.forEach((h, i) => {
    const left = Math.floor(i / 2) % 2 === 0;
    const sign = (i % 2 === 0 ? 1 : -1) * up * (left ? 1 : -1);
    const pose: Pose = left ? [h, SWING * sign, 0] : [h, 0, SWING * sign];
    poses.push(pose, [h + gap(i), pose[1], pose[2]]);
  });
  if (hits.length) poses.push([hits[hits.length - 1] + 0.24, 0, 0]);
  return poses;
}

export function barsAt(poses: Pose[], t: number) {
  const i = poses.findIndex((p) => p[0] > t);
  if (i <= 0) return { left: 0, right: 0 };
  const [a, b] = [poses[i - 1], poses[i]];
  const k = easeIn((t - a[0]) / (b[0] - a[0]));
  // the stick recoils off the hit while it holds there
  const held = a[1] === b[1] && a[2] === b[2] && i > 1;
  const e = t - a[0];
  const spring = held ? 0.16 * Math.exp(-e * 18) * Math.cos(e * 46) : 0;
  const p = poses[Math.max(0, i - 2)];
  return { left: mix(a[1], b[1], k) - (a[1] - p[1]) * spring, right: mix(a[2], b[2], k) - (a[2] - p[2]) * spring };
}

/** Which bar and which way hit i lands, as swingPoses lays them: the printed syllable goes where the tip landed. */
export const hitSide = (i: number, up: 1 | -1) => {
  const left = Math.floor(i / 2) % 2 === 0;
  const sign = (i % 2 === 0 ? 1 : -1) * up * (left ? 1 : -1);
  return { left, top: left ? sign > 0 : sign < 0 };
};

/**
 * The line in two bars for the chain, the named thing whole on one of them and the two as even as can be:
 * the index the characters split at.
 */
export function barSplit(chars: string[], wordFrom: number, wordLen: number): number {
  const n = chars.length;
  const options = [wordFrom, wordFrom + wordLen].filter((s) => s > 0 && s < n);
  if (!options.length) return Math.ceil(n / 2);
  return options.sort((a, b) => Math.abs(a - n / 2) - Math.abs(b - n / 2))[0];
}

/** Where a character of a wave line sits at t: on a sine travelling left, tilted to the slope. */
export function waveAt(x: number, t: number, amp: number, length: number, period: number) {
  const ph = (2 * Math.PI * x) / length - (2 * Math.PI * t) / period;
  return { dy: amp * Math.sin(ph), tilt: Math.atan((amp * (2 * Math.PI / length) * Math.cos(ph)) / 1) * 0.5 };
}

/** A falling character: waiting `drop` px above its rest (a ghost, readable) until it drops, landing at `at` with a short bounce. */
export function fallAt(t: number, at: number, drop: number): { dy: number; squash: number; falling: boolean } {
  const e = t - at;
  if (e < -0.42) return { dy: -drop, squash: 1, falling: false };
  if (e < 0) {
    const k = (e + 0.42) / 0.42;
    return { dy: -drop * (1 - k * k), squash: 1, falling: true };
  }
  const bounce = Math.exp(-e * 9) * Math.sin(e * 28) * 18;
  const squash = 1 - 0.18 * Math.exp(-e * 14) * Math.cos(e * 30);
  return { dy: -Math.max(0, bounce), squash, falling: false };
}

/** The jagged crack a tear follows from the bottom of a sheet to its top, about x = cx. */
export function crackPath(cx: number, h: number, seed: number): [number, number][] {
  const r = rng(seed);
  const steps = 7;
  const pts: [number, number][] = [[cx + (r() - 0.5) * 30, h]];
  for (let k = 1; k < steps; k++) {
    const y = h - (h * k) / steps;
    pts.push([cx + (r() - 0.5) * 90 + (k % 2 ? 24 : -24), y]);
  }
  pts.push([cx + (r() - 0.5) * 30, 0]);
  return pts;
}
