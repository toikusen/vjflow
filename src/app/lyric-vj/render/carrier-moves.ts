// How each carrier arrives. All of it is pure numbers of time, and every move has reached its rest pose exactly at the
// end of its entrance, so reading sees paper that is not moving. No three.js here: the composer's tests read these too.
import { easeOutCurve, PaperMotion, PaperPose, leaving } from './carrier-shape';

/** Seconds of each carrier entrance, before a short line's pace. */
export const CARRIER_SEC = { 'tether-drop': 0.62, 'paper-feed': 0.6, 'fold-open': 0.52, 'card-land': 0.46, 'card-develop': 0.68, 'index-lift': 0.66, 'band-stick': 0.44, 'panel-flip': 0.54, 'box-turn': 0.5, 'frame-advance': 0.46, 'frame-dive': 0.62, 'balance-seat': 0.72, 'display-feed': 0.66, 'frame-run': 0.62 } as const;
export type CarrierEnter = keyof typeof CARRIER_SEC;
export const SOFT_FLOAT_SEC = 0.62;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const inOut = (x: number) => { const q = clamp01(x); return q < 0.5 ? 2 * q * q : 1 - (-2 * q + 2) ** 2 / 2; };

/** The share of the entrance the hanging card spends falling; the rest it swings on its strap. */
const FALL = 0.42;

/** The hanging card at t: it falls with its strap, then swings about the hanging point, damped to exactly nothing by landSec. */
export function hangPose(t: number, m: PaperMotion, dir: number, reach = 1300): PaperPose {
  const k = (t - m.show) / m.landSec;
  const fall = clamp01(k / FALL);
  const u = clamp01((k - FALL) / (1 - FALL));
  const swing = k >= 1 ? 0 : dir * 0.12 * Math.exp(-2.6 * u) * Math.cos(u * Math.PI * 3.5) * (1 - u);
  return leaving({ x: 0, y: k >= FALL ? 0 : reach * (1 - fall) ** 2, rot: swing, alpha: t >= m.show ? 1 : 0, open: 1, scale: 1 }, t, m, dir);
}

/** tether-settle: the card is still; only the strap's loose end keeps moving for a moment, well away from the words. */
export function tailSwing(t: number, restAt: number, dir: number): number {
  const u = t - restAt;
  if (u <= 0) return dir * 0.5;
  return u >= 1.8 ? 0 : dir * 0.5 * Math.exp(-2.2 * u) * Math.cos(u * 7) * (1 - u / 1.8);
}

/**
 * How much of the paper is out at entrance progress k, 0..1: it stops at each stop (a phrase's end), and the last is 1.
 * One stop is a continuous unroll.
 */
export function feedShare(k: number, stops: number[]): number {
  if (k <= 0) return 0;
  if (k >= 1) return 1;
  const slot = k * stops.length;
  const i = Math.floor(slot);
  const before = i ? stops[i - 1] : 0;
  return before + (stops[i] - before) * inOut((slot - i) / 0.72);
}

/** Paper stops for phrases ending at these places (0..1 along the paper), at most four, the last one the paper's end. */
export function feedStops(ends: number[]): number[] {
  const inner = ends.filter((e) => e > 0.04 && e < 0.96);
  const pick = inner.length <= 3 ? inner : [0, 1, 2].map((i) => inner[Math.floor(((i + 1) * inner.length) / 4)]);
  return [...pick, 1];
}

export interface FoldPanel {
  /** Where the panel lies along the fold axis at this opening. */
  from: number;
  to: number;
  /** How far across it is pushed at its two ends: a folded panel's near edge looks taller. */
  liftFrom: number;
  liftTo: number;
  /** Darkening on its slanted face, 0 flat. */
  shade: number;
  /** Its flat place. */
  flat: [number, number];
}

/**
 * The fold lines of a sheet running from..to along its axis: up to three of `gaps` (between characters, so no character is
 * ever folded), near uneven shares of the sheet. At least one, whenever there is a gap at all.
 */
export function foldCuts(gaps: number[], from: number, to: number, seed: number): number[] {
  const span = to - from;
  const aims = [0.27 + (seed % 5) * 0.015, 0.58 + (seed % 7) * 0.01, 0.8];
  const near = (x: number) => gaps.reduce((best, g) => (Math.abs(g - x) < Math.abs(best - x) ? g : best), gaps[0]);
  const lines = gaps.length ? [...new Set(aims.map((a) => near(from + span * a)))].sort((a, b) => a - b) : [];
  return [from, ...lines, to];
}

/** The panels at opening 0..1: they hinge on each other from `cuts[0]`, flat at exactly 1. */
export function foldPanels(cuts: number[], open: number): FoldPanel[] {
  const theta = (1 - clamp01(open)) * Math.PI * 0.47;
  const [c, s] = [Math.cos(theta), Math.sin(theta)];
  let at = cuts[0];
  return cuts.slice(0, -1).map((a, i) => {
    const size = cuts[i + 1] - a;
    const from = at;
    at += size * c;
    const near = i % 2 ? size * s * 0.1 : 0;
    const far = i % 2 ? 0 : size * s * 0.1;
    return { from, to: at, liftFrom: near, liftTo: far, shade: s * (i % 2 ? 0.34 : 0.14), flat: [a, cuts[i + 1]] };
  });
}

/** Where a point of the flat sheet is on the folded one. */
export function foldPlace(x: number, panels: FoldPanel[]): { at: number; scale: number } {
  const p = panels.find((q) => x < q.flat[1]) ?? panels[panels.length - 1];
  const scale = (p.to - p.from) / (p.flat[1] - p.flat[0]);
  return { at: p.from + (x - p.flat[0]) * scale, scale };
}

/** The card coming down at t: it drifts in with a flutter and takes `share` of the entrance, ending on its resting tilt. */
export function cardPose(t: number, m: PaperMotion, dir: number, tilt: number, share = 1): PaperPose {
  const k = clamp01((t - m.show) / (m.landSec * share));
  const e = easeOutCurve(k);
  const off = 1 - e;
  const flutter = k >= 1 ? 0 : Math.sin(k * 7) * (1 - k) * 0.05;
  return leaving({ x: dir * 340 * off, y: 900 * off, rot: tilt + dir * 0.36 * off ** 2 + flutter, alpha: t >= m.show ? 1 : 0, open: 1, scale: 1 }, t, m, dir);
}

/** A resting tilt small enough to leave every stroke sharp: a card put down by hand, never square. */
export const cardTilt = (seed: number) => ((seed % 2 ? 1 : -1) * (0.012 + ((seed >> 1) % 4) * 0.004));

/** How far a spot at u (0 first to clear, 1 last) has developed at progress k: all of the card by k = 1. */
export function developShare(u: number, k: number, soft = 0.5): number {
  if (k >= 1) return 1;
  return clamp01((Math.max(0, k) * (1 + soft) - u) / soft);
}

/** Slips of a row of this total width: uneven, none alike side by side, adding up exactly. */
export function slipWidths(total: number, seed: number): number[] {
  const parts = Array.from({ length: 6 + (seed % 3) }, (_, i) => 0.55 + (((seed + 3) * (i + 5) * 37) % 11) / 7);
  const sum = parts.reduce((a, x) => a + x, 0);
  return parts.map((x) => (x / sum) * total);
}

/** The slip coming out of the row: `rise` lifts it to the card's place, then `open` widens it to the whole card. */
export function liftPhase(k: number): { rise: number; open: number } {
  return { rise: easeOutCurve(clamp01(k / 0.5)), open: k >= 1 ? 1 : easeOutCurve(clamp01((k - 0.42) / 0.58)) };
}

/** A band's tilt: enough to be a band, little enough to keep the line reading level. */
export const bandTilt = (seed: number) => ((seed % 4 < 2 ? 1 : -1) * (0.04 + ((seed >> 2) % 4) * 0.012));

/** The plain band that crosses before reading, as a window along its length: it runs out, then its far end follows. Empty from k = 1. */
export function crossWindow(k: number): [number, number] {
  if (k <= 0 || k >= 1) return [0, 0];
  return [easeOutCurve(clamp01((k - 0.42) / 0.58)), easeOutCurve(clamp01(k / 0.5))];
}

/** Tiles in rows across this width: in order, left to right; the widths never run past it unless a single tile does. */
export function tileRows(widths: number[], gap: number, maxW: number): { row: number; x: number }[] {
  let [row, x] = [0, 0];
  return widths.map((w) => {
    if (x > 0 && x + w > maxW) { row += 1; x = 0; }
    const at = { row, x };
    x += w + gap;
    return at;
  });
}

const DELAYED = 0.46;
/** Tile i of n at entrance progress k, its own turn from 0 to 1: each starts as the one before is partway over. */
export const tileTurn = (i: number, n: number, k: number) => (k >= 1 ? 1 : clamp01((k - (n < 2 ? 0 : (DELAYED * i) / (n - 1))) / (1 - (n < 2 ? 0 : DELAYED))));

/** A tile at turn q: how wide it looks, and whether its face has come round. Exactly face-on at 1. */
export function tileFace(q: number): { sx: number; face: boolean } {
  if (q >= 1) return { sx: 1, face: true };
  const a = Math.PI * (1 - inOut(q));
  return { sx: Math.max(0.02, Math.abs(Math.cos(a))), face: a < Math.PI / 2 };
}
