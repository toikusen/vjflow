// isometric, from its board (2026-11-05, 風格第4批設計稿/isometric a–d; source out/research/boards-b4/boards/isometric.html):
// a small world in 30° isometric projection. Blocks, stairs, terraces and walls, every block three flat tones (the top
// lit, the left face mid, the right face in shade), no outlines, no perspective, no gradient. The words lie on the walls
// in only the two wall directions (world-b4b-sets ISO_L, ISO_R): the page is built round the line it carries, from the
// layout the set hands it (world-sets FaceLayout), so a wall is always as long as its words and the words never leave
// it. Dark ink on the pale faces, white on the deep walls. Printed words: the song's title, in its opening only.
import type { Piece } from './world-pieces';
import { clamp01, ease, fract, H, hash, HandGround, HandIn, mixHex, W, WorldEnv } from './world-craft';
import { artistBy, C, label, rng, titleOf } from './world-b3-shared';
import type { FaceLayout } from './world-sets';
import { ISO_L, ISO_R } from './world-b4b-sets';
import { B4B } from './b4b-inks';

const [C30, S30] = [Math.cos(Math.PI / 6), 0.5];
type Mat = [string, string, string];
/** The board's materials, top, left face, right face. */
const M: Record<string, Mat> = {
  cream: [B4B.xFFFDF7, B4B.xEFE7D7, B4B.xCFC4AE],
  coral: [B4B.xFF8A6B, B4B.xEE6247, B4B.xB8432F],
  mustard: [B4B.xFFD25E, B4B.xF2B630, B4B.xBD8A1C],
  teal: [B4B.x5FD0C0, B4B.x2FA898, B4B.x1D7469],
  ink: [B4B.x4A56B0, B4B.x3A459E, B4B.x252E75],
  sea: [B4B.x4C7BE0, B4B.x3460C2, B4B.x21418F],
  step: [B4B.xFF8A6B, B4B.xF3ECDD, B4B.xD8CDB6],
  step2: [B4B.xFFD25E, B4B.xF3ECDD, B4B.xD8CDB6],
  deepteal: [B4B.x3BA597, B4B.x1E6F66, B4B.x155A52],
};
type Box3 = { X: number; Y: number; Z: number; w: number; d: number; h: number; m: Mat };

/** Draws in the frame's own coordinates (the page does not slide). */
const frame = (e: WorldEnv, f: (c: CanvasRenderingContext2D) => void) => { const c = e.ctx; c.save(); if (e.base) c.setTransform(e.base); f(c); c.restore(); };
/** World point to frame px, about `o` (the words' centre). */
const P = (o: [number, number], X: number, Y: number, Z: number): [number, number] => [o[0] + (X - Y) * C30, o[1] + (X + Y) * S30 - Z];
function poly(c: C, pts: [number, number][], fill: string) {
  c.beginPath();
  pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
  c.fillStyle = fill;
  c.fill();
  // (the same tone round the edge closes the hairline seam two faces of one wall would leave)
  c.strokeStyle = fill;
  c.lineWidth = 1;
  c.lineJoin = 'miter';
  c.stroke();
}
/** One block: the left face, the right face, the top (board `box`). */
function box(c: C, o: [number, number], b: Box3) {
  const { X, Y, Z, w, d, h, m } = b;
  const p = (x: number, y: number, z: number) => P(o, x, y, z);
  poly(c, [p(X, Y + d, Z), p(X + w, Y + d, Z), p(X + w, Y + d, Z + h), p(X, Y + d, Z + h)], m[1]);
  poly(c, [p(X + w, Y, Z), p(X + w, Y + d, Z), p(X + w, Y + d, Z + h), p(X + w, Y, Z + h)], m[2]);
  poly(c, [p(X, Y, Z + h), p(X + w, Y, Z + h), p(X + w, Y + d, Z + h), p(X, Y + d, Z + h)], m[0]);
}
/** Blocks back to front (the painter's order of a grid of blocks that never pass through each other). */
const scene = (c: C, o: [number, number], bs: Box3[]) => [...bs].sort((a, b) => a.X + a.w + a.Y + a.d - (b.X + b.w + b.Y + b.d) || a.Z - b.Z).forEach((b) => box(c, o, b));
/** A block's frame box. */
const extentOf = (o: [number, number], b: Box3) => {
  const pts = [0, 1].flatMap((i) => [0, 1].flatMap((j) => [0, 1].map((k) => P(o, b.X + i * b.w, b.Y + j * b.d, b.Z + k * b.h))));
  return { x0: Math.min(...pts.map((p) => p[0])), y0: Math.min(...pts.map((p) => p[1])), x1: Math.max(...pts.map((p) => p[0])), y1: Math.max(...pts.map((p) => p[1])) };
};
type Box = { x0: number; y0: number; x1: number; y1: number };
const meets = (a: Box, b: Box, m = 0) => a.x0 < b.x1 + m && b.x0 < a.x1 + m && a.y0 < b.y1 + m && b.y0 < a.y1 + m;
type Poly = [number, number][];
/** The words as drawn on their wall: the block's corners through its shear, `m` px of margin round them. */
const wordsPoly = (f: FaceLayout, m: number): Poly => ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([sx, sy]) => { const [u, v] = [sx * (f.w / 2 + m), sy * (f.h / 2 + m)]; return [f.cx + f.shear[0] * u + f.shear[2] * v, f.cy + f.shear[1] * u + f.shear[3] * v]; });
/** Whether a box and a convex polygon overlap (separating axes: the box's two and the polygon's edge normals). */
function hits(b: Box, p: Poly) {
  const rect: Poly = [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]];
  const axes: [number, number][] = [[1, 0], [0, 1], ...p.map((q, i) => { const r = p[(i + 1) % p.length]; return [r[1] - q[1], q[0] - r[0]] as [number, number]; })];
  return axes.every(([ax, ay]) => { const pr = (ps: Poly) => ps.map(([x, y]) => x * ax + y * ay); const [a, c] = [pr(rect), pr(p)]; return Math.max(...a) >= Math.min(...c) && Math.max(...c) >= Math.min(...a); });
}

/**
 * The words' wall as laid out (world-layout hands it with the line's box); a box with no layout (two lines sharing a shot)
 * is read back from its size: a wall at the set's angle is as long as the box is wide over cos 30°.
 */
function faceOf(e: WorldEnv, shear: [number, number, number, number]): FaceLayout {
  const r = e.rect ?? { x0: W * 0.3, y0: H * 0.35, x1: W * 0.7, y1: H * 0.65 };
  const all = ((r as { faces?: FaceLayout[] }).faces ?? [(r as { face?: FaceLayout }).face]).filter((f): f is FaceLayout => !!f && f.shear[1] === shear[1]);
  if (all.length === 1) return all[0];
  if (all.length > 1) return merged(all);
  const [bw, bh] = [Math.max(40, r.x1 - r.x0 - 28), Math.max(40, r.y1 - r.y0 - 28)];
  const w = bw / C30;
  const h = Math.max(60, bh - S30 * w);
  return { cx: (r.x0 + r.x1) / 2, cy: (r.y0 + r.y1) / 2, w, h, shear, size: Math.min(150, h), rows: 1, cells: [] };
}
/** Several lines on one wall (a call beside the line, two lines sharing the shot): one wall round all of them, in the first one's frame. */
function merged(fs: FaceLayout[]): FaceLayout {
  const [a, b, c, d] = fs[0].shear;
  const det = a * d - b * c;
  const toBase = (x: number, y: number): [number, number] => { const [dx, dy] = [x - fs[0].cx, y - fs[0].cy]; return [(d * dx - c * dy) / det, (a * dy - b * dx) / det]; };
  const pts = fs.flatMap((f) => ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([sx, sy]) => { const [u, v] = [(sx * f.w) / 2, (sy * f.h) / 2]; return toBase(f.cx + a * u + c * v, f.cy + b * u + d * v); }));
  const [u0, u1, v0, v1] = [Math.min(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[1]))];
  const [mu, mv] = [(u0 + u1) / 2, (v0 + v1) / 2];
  const cells = fs.flatMap((f) => f.cells.map(([u, v, sz]) => { const [bu, bv] = toBase(f.cx + a * u + c * v, f.cy + b * u + d * v); return [bu - mu, bv - mv, sz] as [number, number, number]; }));
  return { cx: fs[0].cx + a * mu + c * mv, cy: fs[0].cy + b * mu + d * mv, w: u1 - u0, h: v1 - v0, shear: fs[0].shear, size: Math.max(...fs.map((f) => f.size)), rows: fs.reduce((n, f) => n + f.rows, 0), cells };
}
const LABEL = (px: number) => `500 ${px}px "Noto Sans TC", "Noto Sans JP", sans-serif`;
/** The small label, the song's title and its artist, only in its opening. */
function caption(c: C, e: WorldEnv, x: number, y: number, tone: string, align: 'left' | 'right' = 'left') {
  const t = titleOf(e);
  if (!t) return;
  const who = artistBy(e);
  label(c, who ? `${t} ／ ${who}` : t, x, y, LABEL(24), tone, 24 * 0.18, align);
}
/** The page's ground and its 4 % grain are the frame's; the label's tone reads on it. */
const labelTone = (e: WorldEnv) => mixHex(e.paper, lightish(e.paper) ? B4B.x1C2350 : B4B.xFFFFFF, 0.62);
const lightish = (hex: string) => [1, 3, 5].reduce((s, i, k) => s + parseInt(hex.slice(i, i + 2), 16) * [0.3, 0.59, 0.11][k], 0) / 255 > 0.5;
const fill = (c: C, tone: string) => { c.fillStyle = tone; c.fillRect(-W * 0.1, -H * 0.1, W * 1.2, H * 1.2); };
/** The beat the song is on. */
const beatIdx = (e: WorldEnv) => Math.floor((e.now * Math.max(60, e.bpm ?? 120)) / 60);
/** Small blocks stood round the page on the frame (frame px of their foot, size, height, material), those clear of `keep` and of the words. */
function props(c: C, list: [number, number, number, number, string][], keep: Box[], words?: Poly) {
  for (const [x, y, s, h, m] of list) {
    const b: Box3 = { X: -s / 2, Y: -s / 2, Z: 0, w: s, d: s, h, m: M[m] };
    const o: [number, number] = [x, y];
    const e = extentOf(o, b);
    if (keep.some((k) => meets(e, k, 24)) || (words && hits(e, words))) continue;
    box(c, o, b);
  }
}

/**
 * a: a staircase rising up and right. The line runs along its side wall (a wall facing right), on the plinth the steps
 * stand on; the treads alternate coral and mustard, and one riser at a time is lit, a step a beat.
 */
const stairs: HandGround = (e) => frame(e, (c) => {
  fill(c, e.paper);
  const f = faceOf(e, ISO_R);
  const o: [number, number] = [f.cx, f.cy];
  const m = 0.34 * f.size;
  const L = f.w + 2 * m;
  const base = -(f.h / 2 + m);
  const plinth = f.h / 2 + m;
  const [n, rise, dep] = [4, 0.95 * f.size, Math.max(1.3 * f.size, 0.3 * L)];
  const lit = beatIdx(e) % n;
  const steps: Box3[] = Array.from({ length: n }, (_, i) => {
    const mat = i % 2 ? M['step2'] : M['step'];
    const top: Mat = i === lit && e.age > 0.4 ? [mixHex(mat[0], B4B.xFFFDF7, 0.55), mat[1], mat[2]] : mat;
    return { X: -dep, Y: L / 2 - (i + 1) * (L / n), Z: base, w: dep, d: L / n, h: plinth - base + (i + 1) * rise, m: top };
  });
  scene(c, o, steps);
  props(c, [[1524, 690, 170, 600, 'teal'], [1398, 940, 152, 210, 'coral'], [377, 880, 140, 0.55 * 140, 'mustard'], [260, 300, 90, 90, 'coral']], steps.map((b) => extentOf(o, b)), wordsPoly(f, 30));
  if (!e.rect || e.rect.y1 < 940) caption(c, e, 120, 990, labelTone(e));
});

/**
 * b: night by the sea. The line on the front wall of a pale terrace, a lower tier in front of it, the sea a wide blue slab
 * behind with its wave strokes, one gold cube for the star.
 */
const terrace: HandGround = (e) => frame(e, (c) => {
  fill(c, e.paper);
  const f = faceOf(e, ISO_L);
  const o: [number, number] = [f.cx, f.cy];
  const m = 0.4 * f.size;
  const [x0, x1] = [-(f.w / 2 + m), f.w / 2 + m + 0.6 * f.size];
  const top = f.h / 2 + m;
  const low = -(f.h / 2) - 0.25 * f.size;
  const floor = low - 1.1 * f.size;
  const t = 1.0 * f.size;
  // the sea behind, wide, its waves short strokes along it
  const sea: Box3 = { X: x0 - 0.15 * f.w, Y: -6.4 * t, Z: floor - 30, w: (x1 - x0) * 1.25, d: 6.4 * t - t * 0.02, h: 30, m: M['sea'] };
  box(c, o, sea);
  c.strokeStyle = B4B.x86A9F2;
  c.lineWidth = 4;
  const R = rng(5);
  for (let i = 0; i < 30; i++) {
    const [X, Y] = [sea.X + 40 + R() * (sea.w - 200), sea.Y + 30 + R() * (sea.d - 120)];
    const len = 70 + R() * 80;
    const [a, b] = [P(o, X, Y, floor), P(o, X + len, Y, floor)];
    c.beginPath();
    c.moveTo(...a);
    c.lineTo(...b);
    c.stroke();
  }
  // the upper tier carries the words; the lower one stands in front of its foot
  scene(c, o, [{ X: x0, Y: -t, Z: floor, w: x1 - x0, d: t, h: top - floor, m: M['cream'] }, { X: x0 - 0.5 * t, Y: 0, Z: floor, w: x1 - x0, d: t, h: low - floor, m: M['cream'] }]);
  const keep = [extentOf(o, sea), ...(e.rect ? [e.rect] : [])];
  // the star: a gold cube high in the sky, clear of the slab and the words
  const star = [[1316, 200], [1580, 170], [300, 150]].find(([x, y]) => !keep.some((k) => meets({ x0: x - 40, y0: y - 80, x1: x + 40, y1: y }, k, 30)));
  if (star) box(c, [star[0], star[1]], { X: -36, Y: -36, Z: 0, w: 72, d: 72, h: 72, m: M['mustard'] });
  if (!e.rect || e.rect.x1 < 1500) caption(c, e, 1704, 990, labelTone(e), 'right');
});

/**
 * c: a city of blocks filling the frame: the line a character a block, the blocks stepping down to the right, coral and
 * mustard tops; the city's other blocks behind and round them on a pale floor that runs off the frame.
 */
const blocks: HandGround = (e) => frame(e, (c) => {
  fill(c, e.paper);
  const f = faceOf(e, ISO_L);
  const o: [number, number] = [f.cx, f.cy];
  const s = f.size;
  const cells = f.cells.length ? f.cells : [[0, 0, s] as [number, number, number]];
  const half = cells.length > 1 ? Math.min(0.68 * s, Math.abs(cells[1][0] - cells[0][0]) / 2 - 0.06 * s) : f.w / 2 + 0.2 * s;
  const floor = Math.max(...cells.map(([, v, sz]) => v + sz / 2)) * -1 - 0.2 * s;
  // (a line in two rows stands its second row on the same blocks: one block a column, as tall as its highest character)
  const cols: { u: number; top: number }[] = [];
  for (const [u, v, sz] of cells) { const col = cols.find((k) => Math.abs(k.u - u) < 0.4 * s); const top = -v + 0.66 * sz; if (col) col.top = Math.max(col.top, top); else cols.push({ u, top }); }
  const own: Box3[] = cols.map(({ u, top }, i) => ({ X: u - half, Y: -2 * half, Z: floor, w: 2 * half, d: 2 * half, h: top - floor, m: i % 2 ? M['step2'] : M['step'] }));
  // the board's city in its own units (a block 340 wide for a 250 px character), scaled to this line's type
  const k = s / 250;
  const at = (bx: number, by: number) => [own[0].X + (bx + 300) * k, (by - 280) * k] as const;
  const city: [number, number, number, string][] = [[-800, -800, 300, 'teal'], [-400, -820, 520, 'coral'], [40, -840, 380, 'ink'], [500, -800, 260, 'mustard'], [900, -760, 440, 'teal'], [-820, -300, 180, 'mustard'], [1300, -300, 200, 'coral'], [1700, -820, 360, 'ink']];
  const front: [number, number, number, string][] = [[-760, 520, 120, 'teal'], [1140, 420, 160, 'ink'], [-300, 760, 90, 'coral'], [1600, 260, 150, 'coral']];
  const mk = ([bx, by, h, mm]: [number, number, number, string], sz: number): Box3 => { const [X, Y] = at(bx, by); return { X, Y, Z: floor, w: sz * k, d: sz * k, h: h * k, m: M[mm] }; };
  box(c, o, { X: own[0].X - 2600 * k, Y: -2600 * k, Z: floor - 40 * k, w: 6400 * k, d: 5200 * k, h: 40 * k, m: M['cream'] });
  scene(c, o, [...city.map((b) => mk(b, 260)).filter((b) => !own.some((q) => b.X < q.X + q.w && q.X < b.X + b.w && b.Y < q.Y + q.d && q.Y < b.Y + b.d)), ...own]);
  // (a block in front is left out where it would stand on the words)
  const words = wordsPoly(f, 24);
  const clearOfOwn = (b: Box3) => !own.some((q) => b.X < q.X + q.w && q.X < b.X + b.w && b.Y < q.Y + q.d && q.Y < b.Y + b.d);
  scene(c, o, front.map((b) => mk(b, 180)).filter((b) => clearOfOwn(b) && !hits(extentOf(o, b), words)));
});

/**
 * d: a corner room: two walls meeting at the back, coral on the left, deep teal on the right, a pale floor, three small
 * blocks in the middle. The line on one wall in white: the right wall (`corner`, its words run down and right from the
 * corner) or the left one (`corner-l`, its words run up and right to the corner).
 */
const room = (onLeft: boolean): HandGround => (e) => frame(e, (c) => {
  fill(c, e.paper);
  const f = faceOf(e, onLeft ? ISO_R : ISO_L);
  const o: [number, number] = [f.cx, f.cy];
  const s = f.size;
  const m = 0.4 * s;
  const len = f.w + 2 * m + 0.4 * s;
  const [foot, top, t] = [-(f.h / 2) - 1.0 * s, f.h / 2 + 1.25 * s, 0.42 * s];
  // the corner at the words' near end: left of them on the right wall, right of them on the left wall
  const [cx, cy] = onLeft ? [0, -(f.w / 2 + m) - 0.4 * s] : [-(f.w / 2 + m) - 0.4 * s, 0];
  const other = len * 0.98;
  const [lx, ly] = onLeft ? [len, other] : [other, len];
  const floor: Box3 = { X: cx - t, Y: cy, Z: foot - 0.14 * s, w: lx + t, d: ly, h: 0.14 * s, m: M['cream'] };
  // the right wall runs along X from the corner, its words' face toward us; the left wall along Y, its face to the right
  const right: Box3 = { X: cx, Y: cy - t, Z: foot, w: onLeft ? len : f.w / 2 + m - cx, d: t, h: top - foot, m: M['deepteal'] };
  const left: Box3 = { X: cx - t, Y: cy, Z: foot, w: t, d: onLeft ? f.w / 2 + m - cy : ly, h: top - foot, m: M['coral'] };
  box(c, o, floor);
  scene(c, o, [left, right]);
  // the three blocks stand in the middle of the floor
  const [mx, my] = [cx + lx * 0.45, cy + ly * 0.45];
  const u = 0.95 * s;
  const words = wordsPoly(f, 24);
  const blocksOn: Box3[] = [{ X: mx, Y: my, Z: foot, w: u, d: u, h: u, m: M['mustard'] }, { X: mx + u, Y: my, Z: foot, w: u, d: u, h: u * 0.53, m: M['coral'] }, { X: mx, Y: my + u, Z: foot, w: u, d: u, h: u * 0.35, m: M['ink'] }];
  scene(c, o, blocksOn.filter((b) => !hits(extentOf(o, b), words)));
  if (!e.rect || e.rect.y1 < 940) caption(c, e, 120, 990, labelTone(e));
});

const Gs: Record<string, HandGround> = { 'isometric/stairs': stairs, 'isometric/terrace': terrace, 'isometric/blocks': blocks, 'isometric/corner': room(false), 'isometric/corner-l': room(true) };

/** The isometric tile grid over the frame: a rhombus of `s` px at column i, row j. */
const tile = (c: C, x: number, y: number, s: number) => { c.beginPath(); c.moveTo(x, y - s * S30); c.lineTo(x + s * C30, y); c.lineTo(x, y + s * S30); c.lineTo(x - s * C30, y); c.closePath(); };

const INS: Record<string, HandIn> = {
  // a change of line: a diagonal run of floor tiles lights up across the free part of the frame, one row of the grid a
  // step, and goes out behind (never on the words' walls: only where the page shows its ground)
  'tile-run': { sec: 0.5, draw: (e, q) => frame(e, (c) => {
    const s = 120;
    const r = e.rect;
    const head = q * 26 - 4;
    c.fillStyle = mixHex(e.paper, lightish(e.paper) ? B4B.x1C2350 : B4B.xFFFFFF, 0.12);
    for (let j = -2; j < 22; j++) for (let i = -2; i < 20; i++) {
      const [x, y] = [i * s * C30 * 2 + (j % 2 ? s * C30 : 0), j * s * S30];
      const d = i + j * 0.5;
      if (d < head - 3 || d > head) continue;
      if (r && meets({ x0: x - s, y0: y - s, x1: x + s, y1: y + s }, { x0: r.x0 - 120, y0: r.y0 - 160, x1: r.x1 + 120, y1: r.y1 + 160 })) continue;
      tile(c, x, y, s * 0.92);
      c.fill();
    }
  }) },
};

/** Spots on the frame clear of the words, for a set piece. */
const freeSpots = (e: WorldEnv, spots: [number, number][], m: number) => spots.filter(([x, y]) => !e.rect || !meets({ x0: x - m, y0: y - m, x1: x + m, y1: y + m }, e.rect));

const PIECES: Record<string, Piece> = {
  // the city grows: small blocks rise out of the ground one after another along the grid, clear of the words, and sink
  'city-rise': { sec: 2.4, clear: 0, draw: (e, q) => frame(e, (c) => {
    const R = rng(e.seed + 5);
    const spots = freeSpots(e, Array.from({ length: 40 }, (_, i) => [130 + (i % 8) * 236 + (Math.floor(i / 8) % 2) * 118, 150 + Math.floor(i / 8) * 200] as [number, number]), 150);
    const mats = ['coral', 'mustard', 'teal', 'ink'];
    spots.slice(0, 14).forEach(([x, y], i) => {
      const k = Math.min(ease(clamp01(q * 2.2 - i * 0.07), 3), 1 - ease(clamp01((q - 0.8) / 0.2), 2));
      if (k <= 0.01) return;
      const s = 70 + R() * 50;
      box(c, [x, y + 60], { X: -s / 2, Y: -s / 2, Z: 0, w: s, d: s, h: (60 + R() * 120) * k, m: M[mats[i % 4]] });
    });
  }) },
  // a small cube hops along the grid a cell a beat, along the bottom of the frame
  'cube-hop': { sec: 2.6, clear: 0, draw: (e, q) => frame(e, (c) => {
    const n = 6;
    const k = q * n;
    const i = Math.floor(k);
    const hop = Math.sin(Math.PI * fract(k)) * 60;
    const [x0, y0] = e.rect && e.rect.y1 > 760 ? [260, 260] : [260, 900];
    const [x, y] = [x0 + (i + ease(fract(k), 2)) * 120 * C30 * 2, y0 + (i + ease(fract(k), 2)) * 120 * S30 * (y0 > 500 ? -0.4 : 0.4)];
    if (e.rect && meets({ x0: x - 60, y0: y - 140, x1: x + 60, y1: y + 20 }, e.rect, 24)) return;
    box(c, [x, y - hop], { X: -36, Y: -36, Z: 0, w: 72, d: 72, h: 72, m: M['mustard'] });
  }) },
  // gold cubes come out in the sky one by one, the stars of an isometric night
  'gold-stars': { sec: 2.2, clear: 0, draw: (e, q) => frame(e, (c) => {
    const R = rng(e.seed + 9);
    const spots = freeSpots(e, Array.from({ length: 16 }, () => [140 + R() * 1640, 90 + R() * 360] as [number, number]), 70);
    spots.forEach(([x, y], i) => {
      const k = clamp01(q * 1.6 - i * 0.08) * (1 - clamp01((q - 0.86) / 0.14));
      if (k <= 0) return;
      const s = (26 + 22 * hash(i, e.seed)) * Math.min(1, k * 3);
      box(c, [x, y], { X: -s / 2, Y: -s / 2, Z: 0, w: s, d: s, h: s, m: M['mustard'] });
    });
  }) },
};

export const ISO = { grounds: Gs, ins: INS, pieces: PIECES, objects: {} };
