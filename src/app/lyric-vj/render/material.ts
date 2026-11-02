// The finish every composer surface shares: one sheet of paper for a whole song, edges cut by hand, a shadow from one
// light. Numbers only, so the composer's tests read what the canvas draws. y follows whatever the caller's outline uses.

export type Pt = [number, number];

const fract = (x: number) => x - Math.floor(x);
const hash2 = (a: number, b: number) => fract(Math.sin(a * 127.1 + b * 311.7) * 43758.5453);
const smooth = (x: number) => x * x * (3 - 2 * x);

/** Value noise on a lattice that wraps at `period` cells, so a tile of it repeats without a seam. */
function noise(x: number, y: number, seed: number, period: number) {
  const [ix, iy] = [Math.floor(x), Math.floor(y)];
  const at = (a: number, b: number) => hash2(((a % period) + period) % period + seed * 0.37, ((b % period) + period) % period - seed * 0.73);
  const [u, v] = [smooth(x - ix), smooth(y - iy)];
  const [p, q] = [at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * u, at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * u];
  return p + (q - p) * v;
}

/** How the sheet's tone wanders at a point of a unit tile, -1..1: wide slow patches with a little finer cloud on them. */
export function mottle(u: number, v: number, seed: number): number {
  const a = noise(u * 4, v * 4, seed, 4);
  const b = noise(u * 9, v * 9, seed + 1, 9);
  const c = noise(u * 31, v * 31, seed + 2, 31);
  return (a * 0.6 + b * 0.27 + c * 0.13) * 2 - 1;
}

export interface Fibre { x: number; y: number; angle: number; length: number; bow: number; light: boolean; alpha: number }

/** The sheet's fibres over a w × h tile: short, bent, thin, and no more of one tone than the other. */
export function fibres(seed: number, n: number, w: number, h: number): Fibre[] {
  return Array.from({ length: n }, (_, i) => ({
    x: hash2(i, seed + 1) * w,
    y: hash2(i, seed + 2) * h,
    angle: hash2(i, seed + 3) * Math.PI,
    length: 6 + hash2(i, seed + 4) ** 2 * 26,
    bow: (hash2(i, seed + 5) - 0.5) * 5,
    light: i % 2 === 0,
    alpha: 0.03 + hash2(i, seed + 6) * 0.09,
  }));
}

/**
 * An outline cut by hand: every corner stays exactly where it was, so whatever else is built on those corners still
 * meets it, and only the runs between them wander, by at most `amp` px, at about `every` px.
 */
export function roughEdge(outline: Pt[], seed: number, amp: number, every = 34): Pt[] {
  return outline.flatMap((a, i) => {
    const b = outline[(i + 1) % outline.length];
    const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
    const len = Math.hypot(dx, dy);
    const n = Math.max(1, Math.min(60, Math.round(len / every)));
    const [nx, ny] = len ? [-dy / len, dx / len] : [0, 0];
    const run: Pt[] = [a];
    for (let k = 1; k < n; k++) {
      const off = (hash2(i * 13 + k, seed) - 0.5) * 2 * amp * Math.sin((k / n) * Math.PI) ** 0.4;
      run.push([a[0] + (dx * k) / n + nx * off, a[1] + (dy * k) / n + ny * off]);
    }
    return run;
  });
}

/** The outline's signed area: positive when counter-clockwise with y up. */
export const areaOf = (o: Pt[]) => o.reduce((s, [x, y], i) => { const [x2, y2] = o[(i + 1) % o.length]; return s + x * y2 - x2 * y; }, 0) / 2;

/** The outline moved inwards by d px, mitred at each corner: where a hairline partner runs. */
export function insetOutline(o: Pt[], d: number): Pt[] {
  const turn = areaOf(o) >= 0 ? 1 : -1;
  const normal = (a: Pt, b: Pt): Pt => {
    const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
    const len = Math.hypot(dx, dy) || 1;
    return [(-dy / len) * turn, (dx / len) * turn];
  };
  return o.map((p, i) => {
    const prev = o[(i + o.length - 1) % o.length];
    const next = o[(i + 1) % o.length];
    const [n1, n2] = [normal(prev, p), normal(p, next)];
    const dot = 1 + n1[0] * n2[0] + n1[1] * n2[1];
    const k = d / Math.max(0.35, dot);
    return [p[0] + (n1[0] + n2[0]) * k, p[1] + (n1[1] + n2[1]) * k] as Pt;
  });
}

/** One light for the whole song, high on the left. `lift` in px: how far the thing stands off what is under it. */
export const contactShadow = (lift: number) => ({ dx: lift * 0.42, dy: lift * 0.78, blur: lift * 2.1, alpha: 0.2 + Math.min(0.12, 2.4 / Math.max(4, lift)) });

/** A torn edge along `n + 1` points: long lazy runs with short bites, in px either side of the line. */
export function tornLine(n: number, seed: number, amp: number): number[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const x = i / n;
    return amp * (0.6 * (noise(x * 7, 0.5, seed, 1e4) * 2 - 1) + 0.3 * (noise(x * 23, 1.5, seed, 1e4) * 2 - 1) + 0.1 * (hash2(i, seed + 9) * 2 - 1));
  });
}

/** Two sRGB hexes mixed: k of the way from a to b. */
export function mixHex(a: string, b: string, k: number): string {
  const part = (h: string, at: number) => parseInt(h.slice(at, at + 2), 16);
  const ch = [1, 3, 5].map((at) => Math.round(part(a, at) + (part(b, at) - part(a, at)) * k));
  return `#${ch.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export interface Box { x0: number; y0: number; x1: number; y1: number }
export type Edge = 'top' | 'bottom' | 'left' | 'right';

/** How much clear paper each frame edge has before the words start (nothing up: the whole frame). */
export function edgeRoom(rect: Box | undefined, w: number, h: number): Record<Edge, number> {
  if (!rect) return { top: h, bottom: h, left: w, right: w };
  return { top: rect.y0, bottom: h - rect.y1, left: rect.x0, right: w - rect.x1 };
}

/** The edges a piece can stand on, the roomiest first, measured as a share of their own axis so a wide frame's sides do not always win. */
export function edgesByRoom(rect: Box | undefined, w: number, h: number): Edge[] {
  const room = edgeRoom(rect, w, h);
  const share = (e: Edge) => room[e] / (e === 'top' || e === 'bottom' ? h : w);
  return (['bottom', 'top', 'right', 'left'] as Edge[]).sort((a, b) => share(b) - share(a));
}

/** A corner's clear size against the words: the largest square from that corner that stays off them. */
export function cornerRoom(rect: Box | undefined, cx: number, cy: number, w: number, h: number) {
  if (!rect) return Math.min(w, h);
  const across = cx < w / 2 ? rect.x0 : w - rect.x1;
  const down = cy < h / 2 ? rect.y0 : h - rect.y1;
  return Math.max(across, down);
}

/** Moves whose strokes cross the frame wherever the words are: while a line is up the whole picture is printed back this far, evenly. */
export const hushOf = (fx: string): number => (HUSHED[fx] ?? 0);
const HUSHED: Record<string, number> = { rays: 0.45, rain: 0.25, flow: 0.7, synth: 0.76, dots: 0.72, motes: 0.3 };
/** Moves cut off hard at the words' box: nothing of theirs crosses a line being read. */
export const maskedByLine = (fx: string) => fx in HUSHED && fx !== 'rays';

/** A paper colour too strong to be paper (a red ground): it is a flood of ink printed on a paler sheet, and shows as one. */
export function isFlood(hex: string): boolean {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [hi, lo] = [Math.max(r, g, b), Math.min(r, g, b)];
  const light = (hi + lo) / 2;
  const sat = hi === lo ? 0 : (hi - lo) / (1 - Math.abs(2 * light - 1));
  return sat > 0.5 && light > 0.3 && light < 0.72;
}

/** The oval that holds a block whole, corners and all, with `air` px to spare. */
export const ovalOf = (r: Box, air = 34) => ({ cx: (r.x0 + r.x1) / 2, cy: (r.y0 + r.y1) / 2, a: ((r.x1 - r.x0) / 2) * Math.SQRT2 + air, b: ((r.y1 - r.y0) / 2) * Math.SQRT2 + air });

/** The widest hand-drawn ring a block can have inside a half frame: squeezed sideways and taller to match, or nothing when it cannot hold the block. y up, centre origin. */
export function ovalFit(b: Box, halfW: number, halfH: number, air = 22, overshoot = 1.14) {
  const o = ovalOf(b, air);
  const a = Math.min(o.a, (halfW - 14 - Math.abs(o.cx)) / overshoot);
  const half = [(b.x1 - b.x0) / 2 + air * 0.6, (b.y1 - b.y0) / 2 + air * 0.6];
  if (a <= half[0] * 1.02) return undefined;
  const need = half[1] / Math.sqrt(1 - (half[0] / a) ** 2);
  const room = (halfH - 12 - Math.abs(o.cy)) / overshoot;
  return need > room ? undefined : { cx: o.cx, cy: o.cy, a, b: Math.max(need, Math.min(o.b, room)) };
}

/** Where a speed line drawn out from the oval's centre starts: on the oval, plus its own uneven length. */
export function rayStart(o: { a: number; b: number }, angle: number, i: number, seed: number) {
  const on = (o.a * o.b) / Math.hypot(o.b * Math.cos(angle), o.a * Math.sin(angle));
  return on + 10 + 96 * hash2(i, seed + 7) ** 1.6;
}

export interface Scrap { x: number; y: number; r: number; rot: number; tone: number }

/** Offcuts of the sheet along the two roomiest edges only, each wholly clear of the words: never a scatter over the frame. */
export function scrapsOutside(n: number, seed: number, rect: Box | undefined, w: number, h: number): Scrap[] {
  const room = edgeRoom(rect, w, h);
  const edges = edgesByRoom(rect, w, h).slice(0, 2).filter((e) => room[e] > 96);
  if (!edges.length) return [];
  return Array.from({ length: n }, (_, i) => {
    const edge = edges[i % edges.length];
    const r = 11 + 19 * hash2(i, seed + 1);
    const depth = Math.min(170, room[edge] - 56 - r);
    const v = r + 14 + hash2(i, seed + 2) * Math.max(0, depth);
    const along = (edge === 'top' || edge === 'bottom' ? w : h) * (0.04 + 0.92 * hash2(i, seed + 3));
    const [x, y] = edge === 'top' ? [along, v] : edge === 'bottom' ? [along, h - v] : edge === 'left' ? [v, along] : [w - v, along];
    return { x, y, r, rot: hash2(i, seed + 4) * Math.PI, tone: i % 5 === 0 ? 2 : i % 2 };
  });
}

/** The sheet a palette pass goes through: the song's lighter paper leaning to its accent, so never a neutral grey. */
export function passTint(paper: string, ink: string, accent: string) {
  const lum = (h: string) => [1, 3, 5].reduce((a, i, k) => a + [0.3, 0.59, 0.11][k] * parseInt(h.slice(i, i + 2), 16), 0);
  return mixHex(lum(paper) >= lum(ink) ? paper : ink, accent, 0.3);
}

/** A small patch of w × h beside `block`, in whichever side has most room; undefined when no side holds it clear. y down. */
export function patchClear(block: Box, w: number, h: number, frameW: number, frameH: number, gap = 40) {
  const room = edgeRoom(block, frameW, frameH);
  const cy = Math.min(frameH - h / 2 - 16, Math.max(h / 2 + 16, (block.y0 + block.y1) / 2));
  const cx = Math.min(frameW - w / 2 - 16, Math.max(w / 2 + 16, (block.x0 + block.x1) / 2));
  const spots: [number, [number, number]][] = [
    [room.right - w, [block.x1 + gap + w / 2, cy]],
    [room.left - w, [block.x0 - gap - w / 2, cy]],
    [room.bottom - h, [cx, block.y1 + gap + h / 2]],
    [room.top - h, [cx, block.y0 - gap - h / 2]],
  ];
  const best = spots.filter(([r]) => r >= gap + 16).sort((a, b) => b[0] - a[0])[0];
  return best && { x0: best[1][0] - w / 2, y0: best[1][1] - h / 2, x1: best[1][0] + w / 2, y1: best[1][1] + h / 2 };
}

/** A few short cracks in the frame's margin near one corner, each with one fork, none meeting another or reaching `blocked`. */
export function shortCracks(n: number, seed: number, cx: number, cy: number, w: number, h: number, blocked: (x: number, y: number) => boolean): Pt[][] {
  const [dx, dy] = [cx ? -1 : 1, cy ? -1 : 1];
  const out: Pt[][] = [];
  const run = (x: number, y: number, a: number, steps: number, salt: number) => {
    const pts: Pt[] = [[x, y]];
    for (let i = 0; i < steps; i++) {
      const b = a + (hash2(i, salt) - 0.5) * 0.9;
      const l = 22 + 26 * hash2(i, salt + 1);
      const [nx, ny] = [x + Math.cos(b) * l, y + Math.sin(b) * l];
      if (blocked(nx, ny)) break;
      [x, y] = [nx, ny];
      pts.push([x, y]);
    }
    return pts;
  };
  for (let k = 0; k < n; k++) {
    const onSide = k % 2 === 0;
    const along = 110 + k * 95 + 50 * hash2(k, seed);
    const [x, y]: Pt = onSide ? [cx + dx * along, cy] : [cx, cy + dy * along];
    const a = (onSide ? (dy > 0 ? 1 : -1) * (Math.PI / 2) : dx > 0 ? 0 : Math.PI) + (hash2(k, seed + 2) - 0.5) * 0.8;
    const main = run(x, y, a, 4, seed + k * 13);
    if (main.length < 3) continue;
    out.push(main);
    const [fx, fy] = main[Math.floor(main.length / 2)];
    const fork = run(fx, fy, a + (k % 2 ? 0.7 : -0.7), 2, seed + k * 17);
    if (fork.length > 1) out.push(fork);
  }
  return out;
}

export interface FinePlace {
  /** A hairline, frame px, y down. */
  rule: [number, number, number, number];
  /** Where the small type starts and which way it runs. */
  at: [number, number];
  across: boolean;
  align: 1 | -1;
}

const FRAME_INSET = 64;

/**
 * Where the fine tier hugs a block: a rule under it, or over it, or down its side for a block that fills the height, and
 * the small type at the rule's end. `reach` is the rule's share of the block. Nothing when the block leaves no margin.
 */
export function finePlace(r: Box, typeLen: number, w: number, h: number, reach = 0.8, end: 1 | -1 = 1): FinePlace | undefined {
  const [gap, drop] = [22, 40];
  const fits = (y0: number, y1: number) => y0 >= FRAME_INSET * 0.7 && y1 <= h - FRAME_INSET * 0.7;
  const bw = r.x1 - r.x0;
  const across = (y: number, textY: number): FinePlace => {
    const len = Math.max(typeLen + 40, Math.min(w - FRAME_INSET * 2, bw * reach));
    const [x0, x1] = end > 0 ? [Math.max(FRAME_INSET, r.x0), Math.max(FRAME_INSET, r.x0) + len] : [Math.min(w - FRAME_INSET, r.x1) - len, Math.min(w - FRAME_INSET, r.x1)];
    return { rule: [x0, y, Math.min(x1, w - FRAME_INSET), y], at: [end > 0 ? Math.min(x1, w - FRAME_INSET) : x0, textY], across: true, align: end > 0 ? -1 : 1 };
  };
  if (fits(r.y1 + gap, r.y1 + gap + drop + 12)) return across(r.y1 + gap, r.y1 + gap + drop * 0.62);
  if (fits(r.y0 - gap - drop - 12, r.y0 - gap)) return across(r.y0 - gap, r.y0 - gap - drop * 0.62);
  const side = r.x1 + gap + 30 <= w - FRAME_INSET ? r.x1 + gap : r.x0 - gap - 30 >= FRAME_INSET ? r.x0 - gap : undefined;
  if (side === undefined) return undefined;
  const tall = Math.min(r.y1 - r.y0, h - FRAME_INSET * 2) * reach;
  const y0 = Math.max(FRAME_INSET, r.y0);
  if (tall < typeLen + 30) return undefined;
  return { rule: [side, y0, side, y0 + tall], at: [side + (side > r.x1 ? 22 : -22), y0 + 10], across: false, align: 1 };
}
