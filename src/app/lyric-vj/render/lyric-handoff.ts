// The picture changes hands: the line before, its paper and its backdrop move as one, the next line arrives with its
// backdrop and has its whole reading frame before reading starts. Times come from here for both layers, so type and
// backdrop cannot drift apart. Pure numbers; frame px, y up for the type.

import { readingSec } from './reading-window';

export type HandoffKind = 'push' | 'split' | 'door' | 'relay' | 'page' | 'band' | 'chain' | 'aperture' | 'signal' | 'palette';
export const HANDOFF_KINDS: HandoffKind[] = ['push', 'split', 'door', 'relay', 'page', 'band', 'chain', 'aperture', 'signal', 'palette'];

/** The transition each kind draws on the backdrop; a relay leaves the backdrop alone. */
export const HANDOFF_TRANSITION: Partial<Record<HandoffKind, string>> = { push: 'lyric-push', split: 'lyric-split', door: 'lyric-door', page: 'lyric-page', band: 'lyric-band', chain: 'lyric-chain', aperture: 'lyric-aperture', signal: 'lyric-signal', palette: 'lyric-palette' };

export interface Handoff {
  kind: HandoffKind;
  /** Absolute seconds: the line before has finished being read at `from`, the new line reads from `to`. */
  from: number;
  to: number;
  /** Which way the picture moves: 1 towards the left (the new one comes from the right), -1 the other way. */
  dir: number;
}

const W = 1920;
const H = 1080;
const SEC: Record<HandoffKind, number> = { push: 0.3, split: 0.32, door: 0.32, relay: 0.36, page: 0.36, band: 0.34, chain: 0.36, aperture: 0.46, signal: 0.42, palette: 0.34 };
/** The latest the new line may be fully up after its first syllable. */
const LATE = 0.24;
/** How far before its last syllable the old line may start to go. */
const EARLY = 0.12;

const inOut = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2);
/** Progress of a handoff at t: both layers read this. */
export const handoffProgress = (h: Pick<Handoff, 'from' | 'to'>, t: number) => inOut((t - h.from) / (h.to - h.from));

interface Timed { start: number; end: number; text: string }

/**
 * When a handoff can run between two lines, or undefined when either line's reading would pay for it: the old line must be
 * read and nearly sung out by `from`, and what is left of the new line from `to` must still be its whole reading.
 * `oldShow` is when the old line came up, `oldEnter` what its entrance costs, `newGone` when the new line must be gone.
 */
export function handoffTimes(kind: HandoffKind, old: Timed, oldShow: number, oldEnter: number, next: Timed, newGone: number): { from: number; to: number } | undefined {
  const sec = SEC[kind];
  const latest = Math.min(next.start + LATE, newGone - readingSec(next.text, next.start, next.end));
  const earliest = Math.max(old.end - EARLY, oldShow + oldEnter + readingSec(old.text, old.start, old.end)) + sec;
  const to = Math.min(latest, Math.max(earliest, next.start - 0.02));
  if (to < earliest - 1e-6) return undefined;
  return { from: +(to - sec).toFixed(3), to: +to.toFixed(3) };
}

/** A seam clear of the line's box, as near the middle as that allows, with room for the half that opens; undefined when the line fills the frame. */
export function seamClear(lo: number, hi: number, size: number, margin = 60): number | undefined {
  const room = size * 0.16;
  const options = [lo - margin, hi + margin].filter((x) => x >= room && x <= size - room);
  return options.sort((a, b) => Math.abs(a - size / 2) - Math.abs(b - size / 2))[0];
}

/** Half-frame px the two sides of a seam travel, in opposite directions, to leave the frame. */
export const seamTravel = (seam: number, size: number): [number, number] => [seam, size - seam];

/** The line going out, its place at t, in type px (y up). `seam` in frame px from the left (split) or the top (door); `side` -1 the first half, 1 the second. */
export function outPose(h: Handoff, t: number, seam: number, side: number): { x: number; y: number } {
  const e = handoffProgress(h, t);
  if (h.kind === 'push') return { x: -h.dir * W * e, y: 0 };
  if (h.kind === 'split') return { x: side < 0 ? -seam * e : (W - seam) * e, y: 0 };
  if (h.kind === 'door') return { x: 0, y: side < 0 ? seam * e : -(H - seam) * e };
  return { x: 0, y: 0 };
}

/** The line coming in, its place at t: a push brings it in with its picture; the others open on it where it stands. */
export function inPose(h: Handoff, t: number): { x: number; y: number } {
  const e = handoffProgress(h, t);
  return h.kind === 'push' ? { x: h.dir * W * (1 - e), y: 0 } : { x: 0, y: 0 };
}

/** The opening between the two halves at t, frame px along the axis: only this much of the new line shows yet. */
export function openingAt(h: Handoff, t: number, seam: number): [number, number] {
  const e = handoffProgress(h, t);
  const size = h.kind === 'door' ? H : W;
  return [seam - seam * e, seam + (size - seam) * e];
}

/** A half of the frame, centre origin, y up: what lies where nx·x + ny·y + d >= 0 stays. */
export interface Keep { nx: number; ny: number; d: number }
const ALL: Keep = { nx: 1, ny: 0, d: 1e5 };
const NONE: Keep = { nx: 1, ny: 0, d: -1e5 };

/** The band in band-pass: its width along its travel, wide enough to carry the change and far short of the frame, and how far off square it runs. */
let BAND_BODY = 460;
let BAND_LEAN = 0.2;
/** A song's own band and chain: reach and angle only, never the seconds a line is given. */
export function tuneHandoffs(o: { body: number; lean: number; panels: number }) {
  BAND_BODY = o.body;
  BAND_LEAN = o.lean;
  CHAIN_EDGES.splice(0, CHAIN_EDGES.length, ...BASE_EDGES.map((e, i) => (i && i < BASE_EDGES.length - 1 ? e + (i % 2 ? o.panels : -o.panels) : e)));
}

/** The band-pass band at progress e, along its way (u, its direction of travel, y up): `lead` and `trail` in px from the centre. */
export function bandSpan(dir: number, e: number): { ux: number; uy: number; lead: number; trail: number } {
  const [ux, uy] = [-dir * Math.cos(BAND_LEAN), Math.sin(BAND_LEAN)];
  const reach = (Math.abs(ux) * W + Math.abs(uy) * H) / 2 + 30;
  const lead = -reach + (2 * reach + BAND_BODY) * e;
  return { ux, uy, lead, trail: lead - BAND_BODY };
}

/** Panels the frame flips in along a chain: a few, uneven, in the order they go. */
const BASE_EDGES = [0, 0.17, 0.41, 0.6, 0.83, 1];
export const CHAIN_EDGES = [...BASE_EDGES];
const CHAIN_TURN = 0.4;
/** Panel i's own turn at linear progress k, 0..1: each starts as the one before is partway over. */
export function chainTurn(i: number, k: number): number {
  const n = CHAIN_EDGES.length - 1;
  return Math.min(1, Math.max(0, (k - (i * (1 - CHAIN_TURN)) / (n - 1)) / CHAIN_TURN));
}

/** Where the turning page's edge is, as a signed distance from the seam along `dir` (0 on the seam), at progress e. */
export function pageEdge(dir: number, e: number, seam: number): number {
  const turning = dir > 0 ? W - seam : seam;
  const flat = dir > 0 ? seam : W - seam;
  const c = Math.cos(Math.PI * e);
  return c >= 0 ? turning * c : flat * c;
}

/** How wide the going line looks on the turning page, about the seam: gone once the page is edge-on. */
export const pageSquash = (e: number) => Math.max(0.001, Math.cos(Math.PI * e));

/**
 * What of each line shows at t, for the handoffs that hide one behind a moving edge: `going` keeps the line before ahead of
 * the edge, `coming` the new one behind it. Before `from` the old line is whole and nothing of the new one shows.
 */
export function passKeeps(h: Handoff, t: number, seam: number): { going: Keep; coming: Keep } {
  if (t <= h.from) return { going: ALL, coming: NONE };
  if (t >= h.to) return { going: NONE, coming: ALL };
  // a sheet of paper goes past with no words on the frame at all, so no type ever stands on it half-way
  if (h.kind === 'palette') return { going: NONE, coming: NONE };
  // one line or the other, changing over while the iris is shut
  if (h.kind === 'aperture' || h.kind === 'signal') return handoffProgress(h, t) < 0.5 ? { going: ALL, coming: NONE } : { going: NONE, coming: ALL };
  if (h.kind === 'band') {
    const b = bandSpan(h.dir, handoffProgress(h, t));
    return { going: { nx: b.ux, ny: b.uy, d: -b.lead }, coming: { nx: -b.ux, ny: -b.uy, d: b.trail } };
  }
  if (h.kind === 'chain') {
    const k = (t - h.from) / (h.to - h.from);
    const turns = CHAIN_EDGES.slice(0, -1).map((_, i) => chainTurn(i, k));
    const [started, done] = [turns.filter((q) => q > 0).length, turns.filter((q) => q >= 1).length];
    // the chain runs from the right when dir is 1: the same way a push sends the picture
    const place = (n: number) => h.dir * (W / 2 - CHAIN_EDGES[n] * W);
    return { going: { nx: -h.dir, ny: 0, d: h.dir * place(started) }, coming: { nx: h.dir, ny: 0, d: -h.dir * place(done) } };
  }
  const edge = seam - W / 2 + h.dir * pageEdge(h.dir, handoffProgress(h, t), seam);
  return { going: ALL, coming: { nx: h.dir, ny: 0, d: -h.dir * edge } };
}
