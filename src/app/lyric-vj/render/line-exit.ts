// How a line leaves, once it has been read: strips pulled away, slats closing on the key word, a press to one dry stroke,
// the paper cut up, a short single-ink echo, a push from one point, the type shed as crumbs, a slow wave thinning to lines.
// Numbers only: every pose here is exactly the line at rest at q = 0 and gone at q = 1. q is exit progress, 0..1. y is up.

export const LINE_EXIT_SEC = { 'band-out': 0.52, 'slat-close': 0.5, 'line-fold': 0.42, 'tile-scatter': 0.66, 'echo-travel': 0.56, 'radial-leave': 0.5, 'glyph-shed': 0.64, 'wave-dissolve': 0.62, 'pore-out': 0.6, 'focus-out': 0.5, 'rail-leave': 0.62, 'gravity-pass': 0.58, 'box-turn': 0.46, 'frame-advance': 0.44, 'display-off': 0.42, 'node-fold': 0.56 } as const;
export type LineExitKind = keyof typeof LINE_EXIT_SEC;
export const LINE_EXIT_KINDS = Object.keys(LINE_EXIT_SEC) as LineExitKind[];
export const isLineExit = (e: string): e is LineExitKind => e in LINE_EXIT_SEC;
/** Exits that move the whole line or its paper: whatever is drawn beneath them stays solid until they say. */
export const SOLID_EXITS = new Set(['tile-scatter', 'rail-leave', 'gravity-pass']);

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const hash = (a: number, b = 0) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
const easeIn = (x: number, p = 3) => clamp01(x) ** p;
const inOut = (x: number) => { const k = clamp01(x); return k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2; };

/** How far strip i of n has gone at q: staggered from the outside in, the last leaving at exactly 1. */
export function stripShare(i: number, n: number, q: number): number {
  if (q >= 1) return 1;
  const wait = n < 2 ? 0 : 0.34 * (1 - Math.abs(2 * i - (n - 1)) / (n - 1));
  return easeIn((q - wait) / (1 - wait), 2.4);
}

/**
 * A slat at q: the ones nearest the focus close first and the outer ones follow, so gaps open between them and no two ever
 * lie over each other. `near` is its share of the way out from the focus, 0..1; `c` the width left, `x` its centre's offset.
 */
export function slatClose(cx: number, focus: number, q: number, near: number): { x: number; c: number } {
  const wait = 0.42 * clamp01(near);
  const c = q >= 1 ? 0 : 1 - easeIn((q - wait) / (1 - wait), 1.7);
  return { x: (focus - cx) * (1 - c), c };
}

/** A press: `flat` squashes the words onto their stroke, then `shrink` runs that stroke out towards one end. */
export const foldPhase = (q: number) => ({ flat: easeIn(q / 0.5, 2.2), shrink: q >= 1 ? 1 : inOut((q - 0.5) / 0.5) });

/** What is left of a stroke from x0 to x1 at `shrink`, ending at `end` (1 the far end, -1 the near). */
export const strokeLeft = (x0: number, x1: number, end: 1 | -1, shrink: number): [number, number] => (end > 0 ? [x0 + (x1 - x0) * shrink, x1] : [x0, x1 - (x1 - x0) * shrink]);

export interface Tile { x0: number; y0: number; x1: number; y1: number }

/** The paper cut into a few large, uneven pieces, covering it whole. Centre origin. */
export function tilesOf(w: number, h: number, seed: number): Tile[] {
  const across = Math.max(2, Math.min(5, Math.round(w / h)));
  const rows = h > w * 0.42 ? 2 : 1;
  const cuts = (n: number, salt: number) => { const raw = Array.from({ length: n }, (_, i) => 0.74 + 0.52 * hash(i + salt, seed)); const sum = raw.reduce((a, x) => a + x, 0); let at = 0; return [0, ...raw.map((x) => (at += x / sum))]; };
  const down = cuts(rows, 7);
  return down.slice(0, -1).flatMap((d, r) => {
    const xs = cuts(across, r * 11 + 3);
    return xs.slice(0, -1).map((x, i) => ({ x0: -w / 2 + x * w, x1: -w / 2 + xs[i + 1] * w, y0: h / 2 - down[r + 1] * h, y1: h / 2 - d * h }));
  });
}

/** A tile on its way: away from a point off the middle, turning as it goes, each leaving in its own time. */
export function tilePose(i: number, n: number, q: number, cx: number, cy: number, fx: number, fy: number, reach: number, seed: number) {
  const wait = n < 2 ? 0 : 0.3 * hash(i, seed + 2);
  const k = easeIn((q - wait) / (1 - wait), 2);
  const [dx, dy] = [cx - fx, cy - fy];
  const len = Math.hypot(dx, dy) || 1;
  const far = reach * (0.7 + 0.5 * hash(i, seed + 3));
  return { x: (dx / len) * far * k, y: (dy / len) * far * k - 220 * k * k, rot: (hash(i, seed + 4) - 0.35) * 2.2 * k, alpha: 1 - easeIn((q - 0.72) / 0.28, 1) };
}

export type EchoWay = 'up' | 'slant';
/** Only ways that part the copies from the line: copies scaled on the spot lie over one another as a grey block. */
export const ECHO_WAYS: EchoWay[] = ['up', 'slant'];

/** Copy i of a short echo at q: each set out a beat after the one before and stands clear of it; the last is gone at exactly 1. */
export function echoPose(way: EchoWay, i: number, q: number, reach = 1) {
  const k = 1 - (1 - clamp01((q - i * 0.1) / (1 - i * 0.1))) ** 2.2;
  const a = (1 - easeIn((q - 0.3 - i * 0.1) / (0.7 - i * 0.1), 1)) * (0.62 - i * 0.2) * Math.min(1, q * 12);
  const far = reach * (1 - i * 0.28);
  if (way === 'up') return { dx: 0, dy: 300 * far * k, scale: 1, alpha: a };
  return { dx: 280 * far * k, dy: 170 * far * k, scale: 1, alpha: a };
}

/** Where a push starts: off the block's middle by a share of its size, towards the key word's side. */
export const pushFocus = (cx: number, cy: number, w: number, h: number, seed: number): [number, number] => [cx + (seed % 2 ? 1 : -1) * w * 0.17, cy + (seed % 3 === 0 ? 1 : -1) * h * 0.12];

/**
 * The push at a point: a plain enlargement from there, so each character's place and size grow by one factor and two that
 * stood clear of each other stay clear. It carries the line off the frame rather than fading it through its own overlaps.
 */
export function radialShift(x: number, y: number, fx: number, fy: number, q: number, reach = 1) {
  const k = easeIn(q, 2);
  const scale = 1 + 1.9 * reach * k;
  return { dx: (x - fx) * (scale - 1), dy: (y - fy) * (scale - 1), scale, alpha: q >= 1 ? 0 : 1 - easeIn((q - 0.88) / 0.12, 1) };
}

/** A crumb of a character at q: `at` is how far from the point it was let go (0..1), which sets when it goes. */
export function crumbPose(at: number, dirX: number, dirY: number, q: number, salt: number, size: number) {
  const k = clamp01((q - at * 0.42) / 0.58);
  const fall = k * k;
  const [vx, vy] = [dirX * (0.6 + 0.9 * hash(salt, 1)), dirY * (0.4 + 0.7 * hash(salt, 2))];
  return { x: vx * size * 1.7 * k, y: vy * size * 1.3 * k - size * 3.4 * fall, rot: (hash(salt, 3) - 0.5) * 5 * k, alpha: k <= 0 ? 1 : 1 - easeIn((k - 0.45) / 0.55, 1), scale: 1 - 0.4 * k };
}

/** A slice of type at height y on a wave that runs one way: slow, and it grows from nothing. */
export function waveShift(y: number, q: number, length: number, amp: number) {
  return amp * clamp01(q / 0.5) ** 1.5 * Math.sin(y / length + q * 3.4);
}

/** How much of a slice's height is left: the type thins to its own lines of ink, then they go. */
export const waveThin = (q: number) => ({ keep: 1 - 0.9 * inOut((q - 0.3) / 0.55), alpha: q >= 1 ? 0 : 1 - easeIn((q - 0.66) / 0.34, 1) });

/** Where a pore-out has eaten at (u, v) of a character, 0 first gone … 1 last: a few off-centre ellipses growing, their rims roughened by the paper's fibre. */
export function poreField(u: number, v: number, seed: number, rough: (u: number, v: number) => number): number {
  let near = 2;
  for (let i = 0; i < 5; i++) {
    const [cx, cy] = [0.08 + 0.84 * hash(i, seed + 1), 0.08 + 0.84 * hash(i, seed + 2)];
    const [a, b] = [0.5 + 0.7 * hash(i, seed + 3), 0.5 + 0.7 * hash(i, seed + 4)];
    near = Math.min(near, Math.hypot((u - cx) * a, (v - cy) * b) * (1 + 0.8 * hash(i, seed + 5)));
  }
  return clamp01(near * 1.5 + 0.11 * rough(u, v));
}

/** How far phrase i of n has gone out of focus at q: the focus walks off along the line, one phrase after another. */
export const focusShare = (i: number, n: number, q: number) => (q >= 1 ? 1 : easeIn((q - (n < 2 ? 0 : (0.5 * i) / (n - 1))) / 0.5, 1.4));

/** A card on the curved seam at q: along one arc to a point off to the side, drawn away to almost nothing, facing the way it goes. */
/** How far along its seam a card is at q, 0..1. */
export const railShare = (q: number) => easeIn(q, 2.1);

/** Where the visible seam starts at q: past the card's leading edge, so it only ever lies ahead of the card, never across it. */
export const railAhead = (q: number, halfLength: number) => clamp01(railShare(q) + halfLength);

export function railPose(q: number, from: [number, number], to: [number, number], bow: number) {
  const k = railShare(q);
  const [mx, my] = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2 + bow];
  const u = 1 - k;
  const at = (a: number, b: number, c: number) => u * u * a + 2 * u * k * b + k * k * c;
  return { x: at(from[0], mx, to[0]) - from[0], y: at(from[1], my, to[1]) - from[1], scale: 1 - 0.9 * k, rot: (to[0] > from[0] ? -1 : 1) * 0.16 * k, alpha: q >= 1 ? 0 : 1 - easeIn((q - 0.8) / 0.2, 1) };
}

/** The paper over its edge at q: it tips about one bottom corner first, then falls out of the frame. `follow` is the camera going after it. */
export function gravityPose(q: number, dir: number) {
  const tip = inOut(q / 0.4);
  const fall = easeIn((q - 0.26) / 0.74, 2.2);
  return { rot: dir * 0.24 * tip + dir * 0.34 * fall, y: -1320 * fall, x: dir * 60 * fall, follow: inOut((q - 0.26) / 0.74) };
}

/** A flat box seen turning at k: 1 and 0 at rest. `face` is how wide the front shows, `side` how wide its end does. */
export const boxTurn = (angle: number) => ({ face: Math.cos(angle), side: Math.abs(Math.sin(angle)) });

/** A box's angle at the entrance's k and the exit's q: arriving side-on, leaving to the other side, square for all of the reading. */
export function boxAngle(k: number, q: number, from = 1.2) {
  if (q > 0) return -from * easeIn(q, 2);
  return k >= 1 ? 0 : from * (1 - clamp01(k)) ** 3;
}

/** The strip's place in frame heights at k and q: the next frame up from below, locked at rest, then on up out of the frame. */
export function feedShift(k: number, q: number) {
  if (q > 0) return easeIn(q, 2.4);
  return k >= 1 ? 0 : -((1 - clamp01(k)) ** 3);
}

/** The lightbox coming up to the camera at k: small and off to one side, whole by k = 1; `noise` is what clears off its glass. */
export function divePose(k: number, seed: number) {
  const e = k >= 1 ? 1 : 1 - (1 - clamp01(k)) ** 3;
  return { scale: 0.26 + 0.74 * e, x: (seed % 2 ? 1 : -1) * 220 * (1 - e), y: (seed % 3 === 0 ? 1 : -1) * 90 * (1 - e), noise: k >= 1 ? 0 : 1 - clamp01((k - 0.3) / 0.6), alpha: clamp01(k * 8) };
}

/** The bar's tilt at k: down on the heavier side, swinging through level and damped to exactly nothing by k = 1. */
export function balanceTilt(k: number, heavy: number, reach = 1) {
  if (k >= 1) return 0;
  const q = clamp01(k);
  return heavy * 0.2 * reach * (1 - q) ** 2 * Math.cos(q * Math.PI * 2.4);
}

/** The point a bar balances on: each phrase weighs its own width, so the wider one sits nearer. */
export const balancePoint = (xa: number, wa: number, xb: number, wb: number) => (xa * wa + xb * wb) / Math.max(1, wa + wb);

/** A display band going out at q: whole steps down, never a fade through grey. */
export const displayLevel = (q: number) => (q >= 1 ? 0 : [1, 0.55, 0.25, 0.1][Math.min(3, Math.floor(clamp01(q) * 4))]);

/** How far text still has to run at k along a display, as a share of its travel: exactly 0 from k = 1. */
export const feedLeft = (k: number) => (k >= 1 ? 0 : (1 - clamp01(k)) ** 2.4);

/** Seconds a line's last sound is held, read from its character times; a marked vowel with no times counts as a held one. */
export function heldTail(text: string, end: number, charStarts?: number[], charTimed?: boolean) {
  const at = charTimed ? charStarts?.at(-1) : undefined;
  if (at !== undefined) return Math.max(0, end - at);
  return /(?:[啊喔哦嗚唉呀～~ー]|ah|oh)\s*$/i.test(text) ? 1.1 : 0;
}

/** A breath's hand-drawn wave at u along it, in px off the line: it starts flat, swells and dies at its tip. */
export function breathLine(u: number, amp: number, waves: number, seed: number) {
  return amp * Math.sin(u * Math.PI) ** 0.8 * Math.sin(u * waves * Math.PI * 2 + (seed % 7) * 0.4) * (0.75 + 0.25 * hash(Math.floor(u * 9), seed));
}

/** A point of the hand's ring at u along it, in units of its axes: past 1 from the centre everywhere, its ends not quite meeting. */
export function ovalStroke(u: number, seed: number, tilt = 0) {
  const a = -2.3 + (seed % 5) * 0.2 + u * Math.PI * 2 * 0.955;
  const r = 1.06 + 0.03 * Math.sin(a * 2 + seed) + 0.018 * Math.sin(a * 5 + seed * 0.7) + 0.05 * (u - 0.5);
  const [x, y] = [Math.cos(a) * r, Math.sin(a) * r];
  return { x: x - y * tilt, y: y + x * tilt };
}

/** One lamp span after another round a closed path, long and short, the gaps uneven: [from, to] in 0..1 of the way round. */
export function lampSpans(n: number, seed: number): [number, number][] {
  const weights = Array.from({ length: n }, (_, i) => 0.6 + 2.2 * (i % 3 === 0 ? 1 : 0.3) * (0.7 + 0.6 * hash(i, seed)));
  const gaps = Array.from({ length: n }, (_, i) => 0.25 + 0.6 * hash(i, seed + 2));
  const total = [...weights, ...gaps].reduce((a, x) => a + x, 0);
  let at = 0;
  return weights.map((w, i) => {
    const from = at / total;
    at += w;
    const to = at / total;
    at += gaps[i];
    return [from, to];
  });
}

/** How many lamps are on at k: in fits and starts round the path, all of them from k = 1. */
export const lampsLit = (n: number, k: number) => (k >= 1 ? n : Math.floor(n * clamp01(k) ** 1.4));

/** The iris at e: closing on where the line going out stood, shut at 0.5, opening on where the next one stands. */
export function apertureAt(e: number, from: [number, number], to: [number, number], reach: number) {
  const closing = e < 0.5;
  const k = closing ? 1 - e / 0.5 : (e - 0.5) / 0.5;
  const [cx, cy] = closing ? from : to;
  const rx = reach * Math.max(0.0005, k) ** 1.6;
  return { cx, cy, rx, ry: rx * 0.62 };
}

/** A phrase drawing into its ink point at q: the type closes up and is wholly gone first, and only then the small point lands; gone at 1. */
export const nodePhase = (q: number) => ({ gather: easeIn(q / 0.6, 2), dot: clamp01((q - 0.62) / 0.16), fade: q >= 1 ? 1 : easeIn((q - 0.84) / 0.16, 1) });

/** Each phrase's point: its size follows its length, with no two alike, and they never fall on a measure. */
export const nodeSize = (chars: number, i: number, seed: number, unit: number) => Math.min(13, unit * (0.022 + 0.003 * Math.min(6, chars) + 0.012 * hash(i, seed)));

/** Where the accent stands at k of the entrance, as a character index: from the line's start to the key word, exactly there at 1. */
export const relayAt = (k: number, key: number) => (k >= 1 ? key : Math.floor(inOut(k) * (key + 1)) * (key > 0 ? 1 : 0));

/** How far a line leans from its block's shape: a long low one barely, for a short one more. Radians, always within the fit's margin. */
export const leanAngle = (chars: number) => Math.min(0.03, 0.2 / Math.max(6, chars));
