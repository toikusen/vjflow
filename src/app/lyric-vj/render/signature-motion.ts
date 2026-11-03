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

/** A falling character: `drop` px above its rest until it drops (over `fallSec`), landing at `at` with a short bounce. */
export function fallAt(t: number, at: number, drop: number, fallSec = 0.42): { dy: number; squash: number; falling: boolean } {
  const e = t - at;
  if (e < -fallSec) return { dy: -drop, squash: 1, falling: false };
  if (e < 0) {
    const k = (e + fallSec) / fallSec;
    return { dy: -drop * (1 - k * k), squash: 1, falling: true };
  }
  const bounce = Math.exp(-e * 9) * Math.sin(e * 28) * 18;
  const squash = 1 - 0.18 * Math.exp(-e * 14) * Math.cos(e * 30);
  return { dy: -Math.max(0, bounce), squash, falling: false };
}

/**
 * The jagged crack a tear follows from the bottom of a sheet to its top, about x = cx. `jag` scales the zigzag (1: the
 * approved tear; a smash breaks rougher, a rip runs straighter), `slant` leans the crack (px its top moves right).
 */
export function crackPath(cx: number, h: number, seed: number, jag = 1, slant = 0): [number, number][] {
  const r = rng(seed);
  const steps = Math.round(5 + 2 * jag);
  const pts: [number, number][] = [[cx - slant / 2 + (r() - 0.5) * 30 * jag, h]];
  for (let k = 1; k < steps; k++) {
    const y = h - (h * k) / steps;
    pts.push([cx + slant * (k / steps - 0.5) + ((r() - 0.5) * 90 + (k % 2 ? 24 : -24)) * jag, y]);
  }
  pts.push([cx + slant / 2 + (r() - 0.5) * 30 * jag, 0]);
  return pts;
}

// ---- the line's feel: what varies a form from song to song ----

/** How hard a verb lands, 0..1: a smash harder than a kick, a kick harder than a rip, a rip harder than a wipe. */
const FORCE: [RegExp, number][] = [
  [/[碎砕砸撞踹殴斬斩]|smash|crash|slash|吹き飛|飛ばす/iu, 1],
  [/[踢打蹴破壊燃焼焚丟扔甩投拋抛]|kick|break|burn|throw/iu, 0.75],
  [/[撕裂切割燒]|tear|rip|cut/iu, 0.55],
  [/[融溶滴擦消抹拭飛飄]|放手|手放|melt|drip|wipe|erase|fly|let go/iu, 0.3],
];
export const forceOf = (word: string) => FORCE.find(([r]) => r.test(word))?.[1] ?? 0.5;

export interface Feel {
  /** How hard the word lands, 0..1. */
  force: number;
  /** Sung characters a second over the line: a rapped line moves quicker than a held one. */
  density: number;
  /** Sung characters on the line. */
  length: number;
  /** 0 (a held, slow line) .. 1 (a rapped one): density on a scale that the forms share. */
  pace: number;
}
/** The line's feel from its word and its sung times (the times of the characters drawn, in order). */
export function feelOf(word: string, times: number[]): Feel {
  const n = times.length;
  const span = n > 1 ? Math.max(0.2, times[n - 1] - times[0]) : 1;
  const density = n > 1 ? (n - 1) / span : 1;
  return { force: forceOf(word), density, length: n, pace: clamp((density - 2.5) / 5.5) };
}

/** A small stable hash of a string: the same line always turns the same way, two lines rarely alike. */
export const hashOf = (s: string) => [...s].reduce((h, c) => (h * 31 + c.codePointAt(0)!) % 1000003, 7);

// ---- fall: rain drops straight, snow and petals flutter ----

/** A fluttering character (snow, a petal, a leaf): drifting down from `drop` px above, swaying as it comes, settling at `at`. */
export function flutterAt(t: number, at: number, drop: number, phase: number, fallSec = 0.9): { dy: number; dx: number; rot: number } {
  const e = t - at;
  if (e >= 0) {
    const settle = Math.exp(-e * 6);
    return { dy: 0, dx: 6 * settle * Math.sin(e * 14 + phase), rot: 4 * settle * Math.sin(e * 11 + phase) * RAD };
  }
  const k = clamp((e + fallSec) / fallSec);
  const sway = Math.sin(k * Math.PI * 2.2 + phase) * (1 - k * 0.7);
  return { dy: -drop * (1 - easeOut(k)), dx: 34 * sway, rot: 16 * sway * RAD };
}

// ---- circle ----

/**
 * A line laid round a circle: the first `top` characters along its top (tops outward), the rest along its bottom
 * (upright, reading left to right like a badge's lower rim). The radius, the size of a character and each character's
 * angle (radians, -90° is the top), each rim at most `arc` degrees so every character still reads upright enough.
 */
export function circleLayout(top: number, bottom = 0, maxSize = 150, maxR = 430, arc = 150): { r: number; size: number; angles: number[]; under: boolean[] } {
  const step = 1.08;
  const most = Math.max(1, top, bottom);
  let size = Math.min(maxSize, 1500 / most);
  let r = Math.max(230, (most * size * step) / (arc * RAD * 0.85));
  if (r > maxR) {
    size = (maxR * arc * RAD) / (most * step);
    r = maxR;
  }
  size = Math.max(56, Math.min(maxSize, size));
  const rim = (n: number, mid: number, dir: 1 | -1) => {
    const across = ((n - 1) * size * step) / r;
    return Array.from({ length: n }, (_, i) => mid - dir * (across / 2) + dir * ((i * size * step) / r));
  };
  return { r, size, angles: [...rim(top, -Math.PI / 2, 1), ...rim(bottom, Math.PI / 2, -1)], under: [...Array(top).fill(false), ...Array(bottom).fill(true)] };
}

/** A clock's turn at t: a tick on each beat, snapping and settling (radians). */
export function tickAt(t: number, from: number, beats: number[], perTick = 3 * RAD): number {
  let a = 0;
  for (const b of beats) {
    if (b < from || b > t) continue;
    const e = t - b;
    a += perTick * (1 + 0.25 * Math.exp(-e * 16) * Math.sin(e * 40));
  }
  return a;
}

// ---- rise ----

/** A risen character: popped at its sung time, then floating up with its own wobble (balloon, bubble, smoke). */
export function riseAt(t: number, at: number, phase: number, speed: number, wobble: number): { dy: number; dx: number; scale: number } {
  const e = t - at;
  if (e < 0) return { dy: 0, dx: 0, scale: 1 };
  const pop = 1 + 0.15 * Math.exp(-e * 10) * Math.cos(e * 26);
  return { dy: -speed * e * (1 - Math.exp(-e * 2.2)) / (1 + e * 0.05), dx: wobble * Math.sin(e * 3.1 + phase) * clamp(e * 2), scale: pop };
}

// ---- strikes ----

/** A melting column of a glyph: how far its bottom has run (px) e s after the melt began, for a column of seed `k` (0..1). */
export function dripOf(e: number, k: number, size: number, force: number): number {
  if (e <= 0) return 0;
  const grow = 1 - Math.exp(-e * (0.9 + force));
  // most columns sag a little, a few run long (the drips)
  const run = k > 0.72 ? 0.6 + (k - 0.72) * 3.2 : 0.14 + k * 0.22;
  return size * run * grow;
}

/** The slice's offset along its cut: the upper part slides off and settles a little back (px). */
export function sliceShift(e: number, force: number): number {
  if (e <= 0) return 0;
  const far = 18 + 26 * force;
  return far * easeOut(e / 0.12) - far * 0.25 * easeOut((e - 0.12) / 0.5) + 3 * Math.exp(-e * 10) * Math.sin(e * 40);
}

/** A released line's drift: gentle lifts and sways from the verb on; a throw lurches out of the frame's middle first. */
export function flyDrift(e: number, throwIt: boolean, i: number, n: number): { dx: number; dy: number; rot: number } {
  if (e <= 0) {
    if (!throwIt || e < -0.14) return { dx: 0, dy: 0, rot: 0 };
    const w = easeOut((e + 0.14) / 0.14); // the wind-up
    return { dx: -26 * w, dy: 8 * w, rot: 2 * w * RAD };
  }
  const lag = (i / Math.max(1, n - 1)) * 0.18;
  const u = Math.max(0, e - lag);
  if (throwIt) {
    const lurch = 120 * easeOut(u / 0.16);
    return { dx: lurch + 14 * u, dy: -30 * easeOut(u / 0.16) - 10 * u + Math.sin(u * 5 + i) * 4, rot: -3 * RAD * easeOut(u / 0.16) };
  }
  return { dx: 10 * Math.sin(u * 1.7 + i * 0.8), dy: -22 * u - 6 * Math.sin(u * 2.3 + i * 1.3), rot: 4 * RAD * Math.sin(u * 1.9 + i) };
}

/** The frame held still from the stopping word: one beat at least, through the line's last sung character, 2.5 s at most. */
export function freezeSpan(at: number, last: number, beats: number[]): [number, number] {
  const beat = beats.find((b) => b > at + 0.15);
  const oneBeat = beat !== undefined ? Math.min(beat - at, 1) : 0.5;
  return [at, at + Math.min(2.5, Math.max(oneBeat, last + 0.3 - at))];
}

/** The song's beat length near t (s): the median gap of the beats around it, half a second without beats. */
export function beatNear(beats: number[], t: number): number {
  const near = beats.filter((b) => Math.abs(b - t) < 6);
  const gaps = near.slice(1).map((b, i) => b - near[i]).filter((g) => g > 0.2 && g < 1.5).sort((a, b) => a - b);
  return gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0.5;
}
