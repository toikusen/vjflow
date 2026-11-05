// blueprint, from its boards (2026-11-05, 風格第4批設計稿/blueprint a–d, source out/research/boards-b4/boards/blueprint.html):
// a drawing sheet in Prussian blue with white lines (or the diazo whiteprint, blue on white). A double border with zone
// marks 1–8 and A–D, a 40 px grid (9 %) under a 200 px one (18 %) cut away round the words, a title block of real data:
// the song's title and artist in the opening only (titleNow), the time of the cut, the scale. The line is the drawing's
// note: beside a part drawing with its section (a), beside a compass construction with one long dimension (b), one
// character a lettering square (c), or notes 1 and 2 beside an elevation (d). Line weights from the board: border 2 / 4,
// outline 3.5, dimension and construction 1.5, centre lines 38-8-6-8. The sheet is drawn in its drafting order as a cut
// opens: centre lines, outlines, dimensions; the note is written last (world-b4-motion pen-letter). The words are always
// solid (JIZURA's blueprint flicker turns them hollow); no leader callouts or coordinate rings, only dimensions.
import type { Piece } from './world-pieces';
import { clamp01, ease, H, HandGround, HandIn, hash, kept, W, WorldEnv } from './world-craft';
import { artistBy, C, label, titleOf } from './world-b3-shared';
import { scriptOf } from '../fonts';

const LETTER = (px: number, w = 400) => `${w} ${px}px "LXGW WenKai Mono TC", "Klee One", monospace`;
type Box = { x0: number; y0: number; x1: number; y1: number };
const frame = (e: WorldEnv, f: (c: CanvasRenderingContext2D) => void) => { const c = e.ctx; c.save(); if (e.base) c.setTransform(e.base); f(c); c.restore(); };
const pick = <T,>(e: WorldEnv, ja: T, zh: T, latin: T) => ({ ja, zh, latin })[scriptOf(e.title ?? '')];
const clock = (t: number) => `${Math.floor(Math.max(0, t) / 60)}:${String(Math.floor(Math.max(0, t) % 60)).padStart(2, '0')}`;
/** How far the drafting of a cut has got for a stage that runs from `a` to `b` seconds in, 0..1. */
const stage = (e: WorldEnv, a: number, b: number) => clamp01((e.age - a) / (b - a));
/** Draws `f` revealed left to right up to share `k` of the span `x0`..`x1` (a pen moving across). */
function drawn(c: C, k: number, x0: number, x1: number, f: () => void) {
  if (k <= 0) return;
  c.save();
  if (k < 1) { c.beginPath(); c.rect(x0 - 40, -20, (x1 - x0 + 80) * k, H + 40); c.clip(); }
  f();
  c.restore();
}

/** The sheet: the scheme's paper with a mottle of the diazo print (a value noise, 22 % at most), made once. */
const sheet = (e: WorldEnv) => kept(`bp|${e.paper}|${e.slots.ink}`, W, H, (c) => {
  c.fillStyle = e.paper;
  c.fillRect(0, 0, W, H);
  const img = c.getImageData(0, 0, W, H);
  const d = img.data;
  const n = (x: number, y: number) => {
    const s = 220;
    const [xi, yi] = [Math.floor(x / s), Math.floor(y / s)];
    const [fx, fy] = [x / s - xi, y / s - yi];
    const v = (i: number, j: number) => hash(xi + i, yi + j + 7);
    const sm = (t: number) => t * t * (3 - 2 * t);
    const a = v(0, 0) + (v(1, 0) - v(0, 0)) * sm(fx);
    const b = v(0, 1) + (v(1, 1) - v(0, 1)) * sm(fx);
    return a + (b - a) * sm(fy);
  };
  for (let y = 0; y < H; y += 2)
    for (let x = 0; x < W; x += 2) {
      const k = 1 - 0.07 * n(x, y) - 0.03 * hash(x, y);
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const i = ((y + dy) * W + x + dx) * 4; d[i] *= k; d[i + 1] *= k; d[i + 2] *= k; }
    }
  c.putImageData(img, 0, 0);
});

/** The 40 px and 200 px grid inside the border, cut away round the words (the board's mask), made once a box. */
const grid = (e: WorldEnv, holes: Box[]) => kept(`bp-grid|${e.slots.ink}|${holes.map((b) => [b.x0, b.y0, b.x1, b.y1].map((v) => Math.round(v / 20)).join(',')).join(';')}`, W, H, (c) => {
  c.beginPath();
  c.rect(0, 0, W, H);
  for (const b of holes) c.rect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
  c.clip('evenodd');
  c.strokeStyle = e.slots.ink;
  for (const [major, a, w] of [[false, 0.09, 1], [true, 0.18, 1.2]] as [boolean, number, number][]) {
    c.globalAlpha = a;
    c.lineWidth = w;
    c.beginPath();
    for (let x = 64; x < 1860; x += 40) if (((x - 64) % 200 === 0) === major) { c.moveTo(x, 64); c.lineTo(x, 1016); }
    for (let y = 64; y < 1020; y += 40) if (((y - 64) % 200 === 0) === major) { c.moveTo(64, y); c.lineTo(1856, y); }
    c.stroke();
  }
});

const line = (c: C, tone: string, w: number, path: (c: C) => void, dash: number[] = []) => { c.save(); c.strokeStyle = tone; c.lineWidth = w; c.setLineDash(dash); c.beginPath(); path(c); c.stroke(); c.restore(); };
const CENTRE = [38, 8, 6, 8];

/** The border with its zone marks, and the title block: real data only, the opening's title and artist, the time, the scale. */
function border(c: C, e: WorldEnv) {
  const t = e.slots.ink;
  line(c, t, 2, (g) => g.rect(40, 40, 1840, 1000));
  line(c, t, 4, (g) => g.rect(64, 64, 1792, 952));
  line(c, t, 2, (g) => { for (let i = 1; i < 8; i++) { const x = 64 + i * 224; g.moveTo(x, 40); g.lineTo(x, 64); g.moveTo(x, 1016); g.lineTo(x, 1040); } for (let i = 1; i < 4; i++) { const y = 64 + i * 238; g.moveTo(40, y); g.lineTo(64, y); g.moveTo(1856, y); g.lineTo(1880, y); } });
  for (let i = 0; i < 8; i++) { label(c, String(i + 1), 64 + i * 224 + 112, 58, LETTER(18), t, 0, 'center'); label(c, String(i + 1), 64 + i * 224 + 112, 1035, LETTER(18), t, 0, 'center'); }
  'ABCD'.split('').forEach((k, i) => { label(c, k, 52, 64 + i * 238 + 125, LETTER(18), t, 0, 'center'); label(c, k, 1868, 64 + i * 238 + 125, LETTER(18), t, 0, 'center'); });
  const rows: [string, string][] = [];
  const [ti, ar] = [titleOf(e), artistBy(e)];
  if (ti) rows.push([pick(e, '図名', '圖名', 'TITLE'), ti]);
  if (ar) rows.push([pick(e, '作者', '作者', 'BY'), ar]);
  rows.push([pick(e, '時刻', '時間', 'TIME'), clock(e.now - e.age)], [pick(e, '尺度', '比例', 'SCALE'), '1:1']);
  const [x0, y0] = [1376, 1016 - rows.length * 44];
  line(c, t, 3, (g) => g.rect(x0, y0, 480, rows.length * 44));
  rows.forEach(([k, v], i) => {
    const y = y0 + i * 44;
    line(c, t, 1.5, (g) => { if (i) { g.moveTo(x0, y); g.lineTo(1856, y); } g.moveTo(x0 + 120, y); g.lineTo(x0 + 120, y + 44); });
    label(c, k, x0 + 14, y + 30, LETTER(20), t, 0);
    label(c, v, x0 + 136, y + 31, LETTER(24), t, 0);
  });
}
/** The sheet a page is drawn on: paper, grid cut round the words, border and title block. */
function base(c: C, e: WorldEnv, extra: Box[] = []) {
  c.drawImage(sheet(e), 0, 0);
  const r = e.rect;
  c.drawImage(grid(e, [...(r ? [{ x0: r.x0 - 30, y0: r.y0 - 30, x1: r.x1 + 30, y1: r.y1 + 30 }] : []), ...extra]), 0, 0);
  border(c, e);
}

/** A dimension: extension lines, filled arrowheads, the value centred in a gap. */
function dim(c: C, tone: string, x1: number, x2: number, y: number, ext: number, val: string) {
  const mid = (x1 + x2) / 2;
  const gap = [...val].length * 9 + 18;
  line(c, tone, 1.5, (g) => { g.moveTo(x1, ext); g.lineTo(x1, y + 12); g.moveTo(x2, ext); g.lineTo(x2, y + 12); g.moveTo(x1, y); g.lineTo(mid - gap, y); g.moveTo(mid + gap, y); g.lineTo(x2, y); });
  c.fillStyle = tone;
  c.beginPath(); c.moveTo(x1, y); c.lineTo(x1 + 22, y - 6); c.lineTo(x1 + 22, y + 6); c.closePath(); c.moveTo(x2, y); c.lineTo(x2 - 22, y - 6); c.lineTo(x2 - 22, y + 6); c.closePath(); c.fill();
  label(c, val, mid, y + 9, LETTER(26), tone, 0, 'center');
}
function vdim(c: C, tone: string, y1: number, y2: number, x: number, ext: number, val: string) {
  line(c, tone, 1.5, (g) => { g.moveTo(ext, y1); g.lineTo(x + 12, y1); g.moveTo(ext, y2); g.lineTo(x + 12, y2); g.moveTo(x, y1); g.lineTo(x, y2); });
  c.fillStyle = tone;
  c.beginPath(); c.moveTo(x, y1); c.lineTo(x - 6, y1 + 22); c.lineTo(x + 6, y1 + 22); c.closePath(); c.moveTo(x, y2); c.lineTo(x - 6, y2 - 22); c.lineTo(x + 6, y2 - 22); c.closePath(); c.fill();
  label(c, val, x + 14, (y1 + y2) / 2 + 9, LETTER(26), tone, 0);
}
/** A round bar in elevation: chamfered ends, end lines, its centre line; a cross hole near one end, hidden lines dashed. */
function bar(c: C, tone: string, x: number, y: number, L: number, D: number, holeRight: boolean, k: [number, number]) {
  const ch = 10;
  drawn(c, k[0], x - 24, x + L + 24, () => line(c, tone, 1.5, (g) => { g.moveTo(x - 24, y + D / 2); g.lineTo(x + L + 24, y + D / 2); }, CENTRE));
  drawn(c, k[1], x, x + L, () => {
    line(c, tone, 3.5, (g) => { g.moveTo(x + ch, y); g.lineTo(x + L - ch, y); g.lineTo(x + L, y + ch); g.lineTo(x + L, y + D - ch); g.lineTo(x + L - ch, y + D); g.lineTo(x + ch, y + D); g.lineTo(x, y + D - ch); g.lineTo(x, y + ch); g.closePath(); });
    line(c, tone, 1.5, (g) => { g.moveTo(x + ch, y); g.lineTo(x + ch, y + D); g.moveTo(x + L - ch, y); g.lineTo(x + L - ch, y + D); });
    const bx = holeRight ? x + L - 34 : x + 34;
    line(c, tone, 1.5, (g) => { g.moveTo(bx - 7, y + 6); g.lineTo(bx - 7, y + D - 6); g.moveTo(bx + 7, y + 6); g.lineTo(bx + 7, y + D - 6); }, [8, 6]);
  });
}
/** The neck between two bars: a narrower turned length with its two shoulders (a stepped shaft, any song's part). */
function neck(c: C, tone: string, x1: number, x2: number, y: number, d: number) {
  line(c, tone, 3.5, (g) => { g.moveTo(x1, y - d / 2); g.lineTo(x2, y - d / 2); g.moveTo(x1, y + d / 2); g.lineTo(x2, y + d / 2); });
  line(c, tone, 1.5, (g) => { for (const x of [x1 + 14, x2 - 14]) { g.moveTo(x, y - d / 2); g.lineTo(x, y + d / 2); } });
}
/** An octagonal section hatched at 45°, with its centre lines. */
function section(c: C, tone: string, cx: number, cy: number, r: number, k: [number, number]) {
  drawn(c, k[0], cx - r - 30, cx + r + 30, () => line(c, tone, 1.5, (g) => { g.moveTo(cx - r - 30, cy); g.lineTo(cx + r + 30, cy); g.moveTo(cx, cy - r - 30); g.lineTo(cx, cy + r + 30); }, CENTRE));
  drawn(c, k[1], cx - r, cx + r, () => {
    const oct = new Path2D();
    for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + (i * Math.PI) / 4; (i ? oct.lineTo.bind(oct) : oct.moveTo.bind(oct))(cx + r * Math.cos(a), cy + r * Math.sin(a)); }
    oct.closePath();
    c.save();
    c.clip(oct);
    line(c, tone, 1.5, (g) => { for (let s = -2 * r; s < 2 * r; s += 16) { g.moveTo(cx + s - r, cy + r); g.lineTo(cx + s + r, cy - r); } });
    c.restore();
    c.save(); c.strokeStyle = tone; c.lineWidth = 3.5; c.stroke(oct); c.restore();
  });
}

/** a: the note of a part drawing: a stepped shaft with its dimensions below, the section A–A up right. */
const part: HandGround = (e) => frame(e, (c) => {
  base(c, e);
  const t = e.slots.ink;
  const k: [number, number] = [stage(e, 0, 0.18), stage(e, 0.12, 0.4)];
  bar(c, t, 170, 690, 520, 56, true, k);
  drawn(c, k[1], 690, 930, () => neck(c, t, 690, 930, 718, 30));
  bar(c, t, 930, 690, 520, 56, false, k);
  drawn(c, stage(e, 0.36, 0.6), 160, 1520, () => {
    dim(c, t, 170, 690, 640, 684, '300');
    dim(c, t, 930, 1450, 640, 684, '300');
    dim(c, t, 690, 930, 800, 752, '120');
    vdim(c, t, 690, 746, 1500, 1456, '⌀30');
    line(c, t, 6, (g) => { g.moveTo(1190, 664); g.lineTo(1190, 680); g.moveTo(1190, 756); g.lineTo(1190, 772); });
    line(c, t, 2.5, (g) => { g.moveTo(1190, 664); g.lineTo(1160, 664); g.lineTo(1168, 656); g.moveTo(1190, 772); g.lineTo(1160, 772); g.lineTo(1168, 780); });
    label(c, 'A', 1148, 660, LETTER(26), t, 0, 'center');
    label(c, 'A', 1148, 804, LETTER(26), t, 0, 'center');
  });
  const r = e.rect;
  if (!r || r.x1 < 1440 || r.y0 > 560) {
    section(c, t, 1600, 330, 120, [stage(e, 0.1, 0.3), stage(e, 0.25, 0.55)]);
    drawn(c, stage(e, 0.5, 0.7), 1500, 1700, () => label(c, pick(e, '断面 A–A', '剖面 A–A', 'SECTION A–A'), 1600, 514, LETTER(26), t, 0, 'center'));
  }
});

/** b: two or three lines at the left; a five-point star stepped round a circle with compass and straightedge at the right; one long dimension under all. */
const construct: HandGround = (e) => frame(e, (c) => {
  base(c, e);
  const t = e.slots.ink;
  const [cx, cy, R] = [1420, 400, 230];
  const P = [0, 1, 2, 3, 4].map((i) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5; return [cx + R * Math.cos(a), cy + R * Math.sin(a)] as [number, number]; });
  drawn(c, stage(e, 0, 0.2), cx - R - 50, cx + R + 50, () => line(c, t, 1.5, (g) => { g.moveTo(cx - R - 50, cy); g.lineTo(cx + R + 50, cy); g.moveTo(cx, cy - R - 50); g.lineTo(cx, cy + R + 50); }, CENTRE));
  drawn(c, stage(e, 0.1, 0.35), cx - R, cx + R, () => {
    c.save(); c.globalAlpha = 0.85; line(c, t, 1.5, (g) => g.arc(cx, cy, R, 0, Math.PI * 2), [10, 8]); c.restore();
    P.forEach(([x, y], i) => {
      const [nx, ny] = P[(i + 1) % 5];
      const L = Math.hypot(nx - x, ny - y);
      const a0 = Math.atan2(ny - y, nx - x);
      c.save(); c.globalAlpha = 0.8; line(c, t, 1.5, (g) => g.arc(x, y, L, a0 - 0.18, a0 + 0.18)); c.restore();
    });
  });
  drawn(c, stage(e, 0.3, 0.6), cx - R, cx + R, () => {
    line(c, t, 3.5, (g) => { [0, 2, 4, 1, 3].forEach((i, j) => (j ? g.lineTo(...P[i]) : g.moveTo(...P[i]))); g.closePath(); });
    c.fillStyle = t;
    P.forEach(([x, y]) => { c.beginPath(); c.arc(x, y, 5, 0, Math.PI * 2); c.fill(); });
  });
  drawn(c, stage(e, 0.45, 0.75), 120, 1800, () => { dim(c, t, 120, 1800, 780, 740, '∞'); line(c, t, 3.5, (g) => { g.moveTo(120, 740); g.lineTo(1800, 740); }); });
});

/** c: one character a lettering square (the squares are the letters' own under-surface, plan-cell); the height guide and the stroke-weight scale below. */
const lettering: HandGround = (e) => frame(e, (c) => {
  base(c, e);
  const t = e.slots.ink;
  const r = e.rect;
  const x0 = r ? Math.max(170, r.x0) : 210;
  const y = r ? Math.max(r.y1 + 70, 640) : 640;
  if (y > 900) return;
  drawn(c, stage(e, 0.2, 0.5), x0, 1760, () => {
    label(c, pick(e, '字高 h', '字高 h', 'HEIGHT h'), x0, y + 10, LETTER(26), t, 0);
    line(c, t, 1.5, (g) => { g.moveTo(x0 + 120, y); g.lineTo(Math.min(1760, (r?.x1 ?? 1700)), y); }, [4, 10]);
    label(c, pick(e, '線の太さ', '筆畫粗', 'STROKE'), x0, y + 95, LETTER(26), t, 0);
    for (let i = 0; i < 8; i++) line(c, t, 2 + i * 1.5, (g) => { const x = x0 + 160 + i * 90; g.moveTo(x, y + 50); g.lineTo(x, y + 120); });
  });
});

/** d: notes 1 and 2 under their heading at the left; one bar in elevation at the right with its two dimensions. */
const notes: HandGround = (e) => frame(e, (c) => {
  base(c, e);
  const t = e.slots.ink;
  const r = e.rect;
  label(c, pick(e, '注記', '說明', 'NOTES'), 170, 250, LETTER(44, 700), t, 0);
  line(c, t, 3, (g) => { g.moveTo(170, 266); g.lineTo(330, 266); });
  label(c, '1.', 180, 382, LETTER(64, 700), t, 0);
  if (r && r.y1 > 520) label(c, '2.', 180, 617, LETTER(64, 700), t, 0);
  const [x, y, Wd, Hd, ch] = [1600, 170, 56, 560, 8];
  drawn(c, stage(e, 0, 0.2), x - 30, x + Wd + 30, () => line(c, t, 1.5, (g) => { g.moveTo(x + Wd / 2, y - 80); g.lineTo(x + Wd / 2, y + Hd + 30); }, CENTRE));
  drawn(c, stage(e, 0.12, 0.42), x - 20, x + Wd + 20, () => {
    line(c, t, 3.5, (g) => { g.moveTo(x + ch, y); g.lineTo(x + Wd - ch, y); g.lineTo(x + Wd, y + ch); g.lineTo(x + Wd, y + Hd - ch); g.lineTo(x + Wd - ch, y + Hd); g.lineTo(x + ch, y + Hd); g.lineTo(x, y + Hd - ch); g.lineTo(x, y + ch); g.closePath(); });
    line(c, t, 1.5, (g) => { g.moveTo(x, y + ch); g.lineTo(x + Wd, y + ch); g.moveTo(x, y + Hd - ch); g.lineTo(x + Wd, y + Hd - ch); });
    line(c, t, 1.5, (g) => { g.moveTo(x + Wd / 2 - 7, y + 6); g.lineTo(x + Wd / 2 - 7, y + 60); g.moveTo(x + Wd / 2 + 7, y + 6); g.lineTo(x + Wd / 2 + 7, y + 60); }, [8, 6]);
    line(c, t, 3, (g) => g.ellipse(x + Wd / 2, y - 34, 12, 24, 0, 0, Math.PI * 2));
  });
  drawn(c, stage(e, 0.38, 0.65), x - 80, x + Wd + 220, () => {
    vdim(c, t, y, y + Hd, x + Wd + 70, x + Wd + 10, '300');
    const yy = y + Hd + 60;
    line(c, t, 1.5, (g) => { g.moveTo(x, y + Hd + 10); g.lineTo(x, yy + 12); g.moveTo(x + Wd, y + Hd + 10); g.lineTo(x + Wd, yy + 12); g.moveTo(x - 60, yy); g.lineTo(x + Wd + 60, yy); });
    c.fillStyle = t;
    c.beginPath(); c.moveTo(x, yy); c.lineTo(x - 22, yy - 6); c.lineTo(x - 22, yy + 6); c.closePath(); c.moveTo(x + Wd, yy); c.lineTo(x + Wd + 22, yy - 6); c.lineTo(x + Wd + 22, yy + 6); c.closePath(); c.fill();
    label(c, '⌀30', x + Wd + 76, yy + 9, LETTER(26), t, 0);
    label(c, pick(e, '立面図', '立面', 'ELEVATION'), x + Wd / 2, yy + 70, LETTER(26), t, 0, 'center');
  });
});

const Gs: Record<string, HandGround> = { 'blueprint/part': part, 'blueprint/construct': construct, 'blueprint/lettering': lettering, 'blueprint/notes': notes };

/** The words' box, frame px (a default when there are none): a piece is drawn round it, in the room the page leaves there. */
const boxOf = (e: WorldEnv): Box => e.rect ?? { x0: W * 0.3, y0: H * 0.35, x1: W * 0.7, y1: H * 0.65 };

const INS: Record<string, HandIn> = {
  // the next sheet is drawn out from under a blank one, right to left, the blank's edge leading; never over the line
  'sheet-turn': { sec: 0.4, draw: (e, q) => frame(e, (c) => {
    if (q >= 1) return;
    const r = e.rect;
    const x = W * (1 - ease(q, 3));
    c.save();
    c.beginPath();
    if (r) { c.rect(0, 0, W, H); c.rect(r.x0 - 24, r.y0 - 24, r.x1 - r.x0 + 48, r.y1 - r.y0 + 48); c.clip('evenodd'); c.beginPath(); }
    c.rect(0, 0, x, H);
    c.clip();
    c.drawImage(sheet(e), 0, 0);
    line(c, e.slots.ink, 4, (g) => { g.moveTo(x - 4, 40); g.lineTo(x - 4, 1040); });
    c.restore();
  }) },
};

// (each piece is drawn round the note itself, in the room every page leaves round its words: never over them, and never
// over the page's own drawing, which keeps its distance from the note)
const PIECES: Record<string, Piece> = {
  // the drafter swings a compass arc at each corner of the note, locating it, one corner after another
  'compass-arc': { sec: 1.6, clear: 0, draw: (e, q) => frame(e, (c) => {
    const b = boxOf(e);
    const t = e.slots.ink;
    const m = 30;
    const corners: [number, number, number][] = [[b.x0 - m, b.y0 - m, Math.PI], [b.x1 + m, b.y0 - m, -Math.PI / 2], [b.x1 + m, b.y1 + m, 0], [b.x0 - m, b.y1 + m, Math.PI / 2]];
    corners.forEach(([x, y, a0], i) => {
      const k = ease(clamp01(q * 1.6 - i * 0.22), 2);
      if (k <= 0 || q > 0.92) return;
      line(c, t, 2.5, (g) => g.arc(x, y, 22, a0, a0 + k * Math.PI * 0.5));
      line(c, t, 1.5, (g) => { g.moveTo(x - 10, y); g.lineTo(x + 10, y); g.moveTo(x, y - 10); g.lineTo(x, y + 10); });
    });
  }) },
  // the note is measured: a dimension the length of the line snaps out above it, its value the length drawn
  'dim-span': { sec: 1.2, clear: 0, draw: (e, q) => frame(e, (c) => {
    const b = boxOf(e);
    const y = b.y0 - 40;
    if (y < 90) return;
    const k = ease(clamp01(q / 0.4), 3);
    const mid = (b.x0 + b.x1) / 2;
    const half = ((b.x1 - b.x0) / 2) * k;
    if (half < 40 || q > 0.94) return;
    dim(c, e.slots.ink, mid - half, mid + half, y, y + 26, String(Math.round((half * 2) / 4) * 4));
  }) },
  // a revision cloud is drawn round the note and its delta set at the corner: this line was changed
  'revision-cloud': { sec: 1.5, clear: 0, draw: (e, q) => frame(e, (c) => {
    const b = boxOf(e);
    const m = 34;
    const [x, y, w, h] = [b.x0 - m, b.y0 - m, b.x1 - b.x0 + 2 * m, b.y1 - b.y0 + 2 * m];
    const t = e.slots.ink;
    const k = ease(clamp01(q / 0.6), 2);
    if (q > 0.94) return;
    const r = 18;
    const sides: [number, number, number, number, number][] = [[x, y, 1, 0, w], [x + w, y, 0, 1, h], [x + w, y + h, -1, 0, w], [x, y + h, 0, -1, h]];
    const total = sides.reduce((n, s) => n + Math.max(1, Math.round(s[4] / (2 * r))), 0);
    let done = 0;
    line(c, t, 2.5, (g) => {
      for (const [sx, sy, dx, dy, len] of sides) {
        const n = Math.max(1, Math.round(len / (2 * r)));
        const rr = len / n / 2;
        for (let i = 0; i < n && done < total * k; i++, done++) {
          const [mx, my] = [sx + dx * (i + 0.5) * 2 * rr, sy + dy * (i + 0.5) * 2 * rr];
          const a0 = Math.atan2(dy, dx) + Math.PI;
          g.moveTo(mx + Math.cos(a0) * rr, my + Math.sin(a0) * rr);
          g.arc(mx, my, rr, a0, a0 + Math.PI);
        }
      }
    });
    if (k >= 1 && y > 110) {
      line(c, t, 2.5, (g) => { g.moveTo(x + w - 8, y - 64); g.lineTo(x + w + 26, y - 8); g.lineTo(x + w - 42, y - 8); g.closePath(); });
      label(c, '1', x + w - 8, y - 16, LETTER(28, 700), t, 0, 'center');
    }
  }) },
};

export const BLUEPRINT = { grounds: Gs, ins: INS, pieces: PIECES, objects: {} };
