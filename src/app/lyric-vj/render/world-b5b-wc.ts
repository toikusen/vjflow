// watercolor, from its board (2026-11-06, 風格第5批設計稿/watercolor a–d; source out/research/boards-b5/boards/watercolor.html),
// with the review's note answered: every page carries real watercolour, not "words on colour blobs". A sheet of cold-press
// paper taped down on four sides; transparent washes, each computed per pixel from its own shape (no blur anywhere):
// - a wash's density rises toward its edge as the pigment pools at the drying rim (+0.42 e^(−d / 3.5 px)): the hard,
//   darker wet edge;
// - granulation: pigment settling into the paper's tooth, a fine break-up of the density;
// - a slow flow of density and a second pigment drifting through it (wet-in-wet), never at the edge;
// - glazes laid one over another multiply, so an overlap shows a third colour;
// - backrun blooms: a cauliflower edge where water crept back into a drying wash, a darker hard ring;
// - a tide line where a wash dried in two stages, and a dry-brush end where the brush ran out over the tooth;
// - splatter, each drop its own small wash with its own rim; the paper's tooth in the white.
// The words are painted (world-glyph-b5b `wc-paint`) or reserved white with masking fluid, the wash pooled dark against
// them (`wc-reserve`, `wc-pool`). Kept apart from ink-wash (one ink, calligraphy) and crayon (wax). JIZURA's 手帖 style is a
// diary page; this is a single taped sheet with no ruled lines, no stickers, no handwriting.
import type { Piece } from './world-pieces';
import { clamp01, ease, HandGround, HandIn, kept, mixHex, WorldEnv } from './world-craft';
import { mirrorGround, onPage, rng, still } from './world-b3-shared';
import { distanceTo } from './world-glyph-loud';
import { B5B } from './b5b-inks';
import { B5B_MIRRORED } from './world-b5b-sets';
import { dataLine, frame, H, isJa, meets, page, small, W } from './world-b5b-shared';

type Pt = [number, number];
type Buf = Float32Array;
const SM = (px: number, ja: boolean) => `500 ${px}px ${ja ? '"Shippori Mincho B1"' : '"Noto Serif HK"'}, "Noto Serif TC", serif`;

const fract = (x: number) => x - Math.floor(x);
const hash = (a: number, b: number) => fract(Math.sin(a * 127.1 + b * 311.7) * 43758.5453);
const vnoise = (x: number, y: number, s: number) => {
  const [xi, yi] = [Math.floor(x), Math.floor(y)];
  const [u, v] = [x - xi, y - yi].map((t) => t * t * (3 - 2 * t));
  const h = (i: number, j: number) => hash(i + s * 17.3, j - s * 9.1);
  const [a, b, c, d] = [h(xi, yi), h(xi + 1, yi), h(xi, yi + 1), h(xi + 1, yi + 1)];
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};
const fbm = (x: number, y: number, s: number) => (vnoise(x, y, s) * 0.55 + vnoise(x * 2.03, y * 2.03, s + 1) * 0.3 + vnoise(x * 4.1, y * 4.1, s + 2) * 0.15);
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);

/** Cold-press paper: a soft tooth and a fine speckle, a float RGB buffer. */
const paperOf = (tone: string) => {
  const P = rgb(tone).map((v) => v * 255);
  const b = new Float32Array(W * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = (fbm(x * 0.045, y * 0.045, 3) - 0.5) * 0.03 + (hash(x, y) - 0.5) * 0.022;
    const i = (y * W + x) * 3;
    b[i] = P[0] * (1 + t); b[i + 1] = P[1] * (1 + t); b[i + 2] = P[2] * (1 + t);
  }
  return b;
};
/** A shape as a 0/1 mask, from a canvas drawing. */
function maskOf(draw: (c: OffscreenCanvasRenderingContext2D) => void) {
  const cv = new OffscreenCanvas(W, H);
  const c = cv.getContext('2d', { willReadFrequently: true })!;
  c.fillStyle = c.strokeStyle = B5B.xFFFFFF;
  draw(c);
  const d = c.getImageData(0, 0, W, H).data;
  const m = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) m[i] = d[i * 4 + 3] > 127 ? 1 : 0;
  return m;
}
/** A wet edge: a polygon walked with low-frequency noise, the way a loaded brush leaves a puddle's outline. */
function wet(pts: Pt[], amp: number, seed: number, step = 6): Pt[] {
  const out: Pt[] = [];
  pts.forEach(([x0, y0], k) => {
    const [x1, y1] = pts[(k + 1) % pts.length];
    const L = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(1, Math.round(L / step));
    const [nx, ny] = [-(y1 - y0) / L, (x1 - x0) / L];
    for (let i = 0; i < n; i++) { const t = i / n; const [x, y] = [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]; const o = (fbm(x * 0.006, y * 0.006, seed) - 0.5) * 2 * amp + (vnoise(x * 0.04, y * 0.04, seed + 4) - 0.5) * amp * 0.3; out.push([x + nx * o, y + ny * o]); }
  });
  return out;
}
const fillPts = (c: OffscreenCanvasRenderingContext2D, pts: Pt[]) => { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); c.fill(); };
const poly = (pts: Pt[], amp: number, seed: number) => maskOf((c) => fillPts(c, wet(pts, amp, seed)));
const sub = (a: Uint8Array, b: Uint8Array) => Uint8Array.from(a, (v, i) => (v && !b[i] ? 1 : 0));
const blobPts = (cx: number, cy: number, rx: number, ry: number, n = 3.2): Pt[] => Array.from({ length: 90 }, (_, i) => { const t = (i / 90) * Math.PI * 2; const [c, s] = [Math.cos(t), Math.sin(t)]; return [cx + Math.sign(c) * Math.abs(c) ** (2 / n) * rx, cy + Math.sign(s) * Math.abs(s) ** (2 / n) * ry]; });

interface WashOpt { a0?: number; rim?: number; rr?: number; gran?: number; flow?: number; col2?: string; seed?: number; blooms?: [number, number, number][] }
/**
 * Pigment laid where `mask` is 1, multiplied onto the paper: density = base × slow flow + rim × e^(−d / rr), broken by
 * granulation; a second pigment drifts through; a bloom thins the wash inside a cauliflower edge and darkens that edge.
 */
function wash(buf: Buf, mask: Uint8Array, col: string, o: WashOpt = {}) {
  const { a0 = 0.55, rim = 0.42, rr = 3.5, gran = 0.12, flow = 0.45, seed = 0 } = o;
  const D = distanceTo((i) => !mask[i], W, H);
  const [C, C2] = [rgb(col), rgb(o.col2 ?? col)];
  for (let y = 30; y < H - 30; y++) for (let x = 30; x < W - 30; x++) {
    const j = y * W + x;
    if (!mask[j]) continue;
    const f = fbm(x * 0.0035 + seed, y * 0.0035 - seed, seed);
    const h = clamp01((fbm(x * 0.003 - seed, y * 0.003 + seed, seed + 3) - 0.35) * 2.2);
    let a = a0 * (1 - flow / 2 + flow * f) + rim * Math.exp(-D[j] / rr);
    a *= 1 - gran + gran * 2 * vnoise(x * 0.5, y * 0.5, seed + 9);
    for (const [bx, by, br] of o.blooms ?? []) {
      const d = Math.hypot(x - bx, y - by) - br * (1 + (vnoise(x * 0.05, y * 0.05, seed + 13) - 0.5) * 0.55);
      if (d < 0) a *= 0.62;
      else if (d < 3.2) a = a * 1.35 + 0.08;
    }
    a = clamp01(a);
    const i = j * 3;
    for (let k = 0; k < 3; k++) buf[i + k] *= 1 - a * (1 - (C[k] + (C2[k] - C[k]) * h));
  }
}
/** A brush stroke from (x0, y0) to (x1, y1), `w` wide, tapering at both ends; `dry` < 1 runs out in bristle streaks from there. */
function stroke(x0: number, y0: number, x1: number, y1: number, w: number, seed: number, dry = 1) {
  const L = Math.hypot(x1 - x0, y1 - y0);
  const [ux, uy] = [(x1 - x0) / L, (y1 - y0) / L];
  const [px, py] = [-uy, ux];
  return maskOf((c) => {
    const pts: Pt[] = [];
    const ww = (t: number, s: number) => w * Math.sqrt(Math.max(0.02, 1 - Math.pow(2 * t - 1, 10))) * (1 + (vnoise(t * 6, s, seed) - 0.5) * 0.12);
    for (let i = 0; i <= 60; i++) { const t = i / 60; const k = ww(t, 1) / 2; pts.push([x0 + ux * L * t + px * k, y0 + uy * L * t + py * k]); }
    for (let i = 60; i >= 0; i--) { const t = i / 60; const k = ww(t, 5) / 2; pts.push([x0 + ux * L * t - px * k, y0 + uy * L * t - py * k]); }
    fillPts(c, wet(pts, 9, seed, 5));
    if (dry >= 1) return;
    // dry-brush: the bristles run out over the tooth, leaving paper between hard streaks
    c.globalCompositeOperation = 'destination-out';
    for (let k = 0; k < 14; k++) {
      const off = (k / 13 - 0.5 + (hash(k, seed + 4) - 0.5) * 0.05) * w * 0.95;
      const s = dry + hash(k, seed) * 0.2;
      const wd = 2 + hash(k, seed + 2) * 6;
      // (a gap opens from a point and widens toward the end the brush ran dry)
      const [ax, ay] = [x0 + ux * L * s + px * off, y0 + uy * L * s + py * off];
      const [bx, by] = [x1 + ux * 80 + px * off, y1 + uy * 80 + py * off];
      c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx + px * wd, by + py * wd); c.lineTo(bx - px * wd, by - py * wd); c.closePath(); c.fill();
    }
  });
}
/** Splatter: crisp drops flicked off the brush, each a small wash with its own rim. */
function splat(buf: Buf, cx: number, cy: number, spread: number, n: number, col: string, seed: number, avoid?: { x0: number; y0: number; x1: number; y1: number }, rmax = 9) {
  const r = rng(seed);
  const m = maskOf((c) => { for (let i = 0; i < n; i++) { const a = r() * 7; const d = Math.pow(r(), 1.6) * spread; const rr = 1.5 + Math.pow(r(), 3) * rmax; const [x, y] = [cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.6]; if (avoid && meets({ x0: x - rr, y0: y - rr, x1: x + rr, y1: y + rr }, avoid, 30)) continue; c.beginPath(); c.arc(x, y, rr, 0, 7); c.fill(); } });
  wash(buf, m, col, { a0: 0.7, rim: 0.25, rr: 2, seed });
}
/** The buffer as a picture. */
function picture(buf: Buf) {
  const cv = new OffscreenCanvas(W, H);
  const c = cv.getContext('2d')!;
  const img = c.createImageData(W, H);
  for (let j = 0; j < W * H; j++) { img.data[j * 4] = buf[j * 3]; img.data[j * 4 + 1] = buf[j * 3 + 1]; img.data[j * 4 + 2] = buf[j * 3 + 2]; img.data[j * 4 + 3] = 255; }
  c.putImageData(img, 0, 0);
  return cv;
}
/** The sheet taped down on four sides with masking tape, translucent cream, torn ends. */
function tapes(c: OffscreenCanvasRenderingContext2D) {
  const T = (x: number, y: number, w: number, h: number, s: number) => {
    c.fillStyle = 'rgba(232,220,190,0.88)';
    fillPts(c, wet([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], 2.5, s, 6));
    c.fillStyle = 'rgba(160,140,100,0.12)';
    c.fillRect(x, y + h - 4, w, 4);
  };
  T(-20, 30, 1960, 64, 3); T(-20, 986, 1960, 64, 4); T(30, -20, 64, 1120, 5); T(1826, -20, 64, 1120, 6);
}
/** A page: the paper, its washes, the tapes and the small print (the data in the opening, then part and time). */
function sheetOf(e: WorldEnv, id: string, paint: (b: Buf) => void, at: [number, number, 'left' | 'right'], brushed = false) {
  const s = e.slots;
  const layer = kept(`wc|${id}|${s.ground}|${s.ink}|${s.ink2}|${s.accent}|${s.plateInk}|${boxKey(e)}`, W, H, (c) => { const b = paperOf(s.ground); paint(b); c.drawImage(picture(b), 0, 0); tapes(c); });
  const draw = () => page(e, `wc-${id}`, (c) => {
    c.drawImage(layer, 0, 0);
    small(c, dataLine(e), at[0], at[1], SM(24, isJa(e)), 24, s.faint, 1, at[2]);
  }, `${e.item?.part}|${e.item?.at}|${boxKey(e)}`);
  // (a page of painted words is brushed in as the cut opens: its washes laid left to right in six passes over the bare
  // taped sheet, the board's "layers brushed in"; a page of reserved words is never bare, its words would be paper on paper)
  const k = brushed ? Math.floor(clamp01(e.age / BRUSH_SEC) * 6) / 6 : 1;
  if (k >= 1) return draw();
  onPage(e, kept(`wc-bare|${s.ground}`, W, H, (c) => { c.drawImage(picture(paperOf(s.ground)), 0, 0); tapes(c); }));
  const c = e.ctx;
  c.save();
  const m = c.getTransform();
  if (e.base) c.setTransform(e.base);
  c.beginPath();
  c.rect(-W * 0.1, -H * 0.1, W * 0.1 + W * k, H * 1.2);
  c.clip();
  c.setTransform(m);
  draw();
  c.restore();
}
/** How long a painted page takes to be brushed in as its cut opens, s. */
const BRUSH_SEC = 0.6;
const boxKey = (e: WorldEnv) => (e.rect ? [e.rect.x0, e.rect.x1].map((v) => Math.round(v / 160)).join(',') : '-');

/** a: an ochre flat wash crossing the sheet, its right end run dry; a rose glaze over part of it (the overlap a third
 * colour); a cyan wash with a backrun bloom at the top right, a tide line inside it; splatter. The line painted over. */
const washPage: HandGround = (e) => { sheetOf(e, 'wash', (b) => {
  const s = e.slots;
  // (the flat wash's right end runs dry: the bristles left paper between hard streaks)
  // (each bristle's gap opens from a point and widens as the brush ran out, at its own place and length)
  const dry = maskOf((c) => { for (let y = 440; y < 820; y += 5 + hash(y, 9) * 9) { const k = hash(y, 3); if (k < 0.4) continue; const [x, w] = [1420 + k * 260, 1.5 + hash(y, 5) * 5]; c.beginPath(); c.moveTo(x, y); c.lineTo(W, y - w / 2 + (hash(y, 7) - 0.5) * 6); c.lineTo(W, y + w / 2 + (hash(y, 7) - 0.5) * 6); c.closePath(); c.fill(); } });
  wash(b, sub(poly([[140, 520], [1500, 470], [1690, 500], [1700, 770], [150, 790]], 22, 1), dry), B5B.xEDB54E, { a0: 0.42, rim: 0.5, col2: B5B.xE88E58, seed: 1, blooms: [[520, 600, 70]] });
  // a tide line: the wash dried in two stages, the second edge hard inside the first
  wash(b, poly([[700, 560], [1240, 540], [1260, 740], [690, 760]], 30, 14), B5B.xEDB54E, { a0: 0.12, rim: 0.35, seed: 15 });
  wash(b, stroke(1180, 650, 1860, 610, 300, 7, 0.82), B5B.xD96A7A, { a0: 0.36, rim: 0.5, seed: 3 });
  wash(b, poly(blobPts(1520, 300, 300, 190), 40, 6), B5B.x7FB3C2, { a0: 0.38, rim: 0.5, col2: B5B.xA9B6E0, seed: 2, blooms: [[1560, 300, 90]] });
  wash(b, poly(blobPts(1470, 330, 170, 110), 30, 16), B5B.x7FB3C2, { a0: 0.16, rim: 0.4, seed: 4 });
  splat(b, 1620, 230, 220, 60, s.ink, 5, e.rect);
}, [236, 1028, 'left'], true); };

/** b: night glazes over the sky, wet into wet, a darker glaze laid over its top; a bloom where water crept back; the sea a
 * separate wash under a hard horizon, five dry strokes across it; stars reserved white. The line reserved white in the sky. */
const nightPage: HandGround = (e) => { sheetOf(e, 'night', (b) => {
  const s = e.slots;
  const stars = maskOf((c) => { for (const [x, y, r] of [[1500, 180, 7], [1620, 260, 4], [1400, 300, 3], [260, 160, 5], [420, 220, 3], [1700, 130, 3], [1180, 160, 4]]) { if (meets({ x0: x - 20, y0: y - 20, x1: x + 20, y1: y + 20 }, e.rect)) continue; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); } });
  wash(b, sub(poly([[60, 60], [1860, 60], [1860, 700], [60, 680]], 6, 2), stars), s.plateInk, { a0: 0.82, col2: mixHex(s.plateInk, B5B.x1E4A6E, 0.6), flow: 0.3, seed: 5, blooms: [[300, 560, 80], [1640, 520, 60]] });
  wash(b, sub(poly([[60, 60], [1860, 60], [1860, 300], [60, 330]], 10, 8), stars), mixHex(s.plateInk, B5B.x000000, 0.1), { a0: 0.45, seed: 6 });
  wash(b, poly([[60, 700], [1860, 690], [1860, 1020], [60, 1020]], 6, 4), mixHex(s.plateInk, B5B.x2C5A6E, 0.4), { a0: 0.62, col2: B5B.x2C5A6E, seed: 7 });
  for (let k = 0; k < 5; k++) wash(b, stroke(80, 760 + k * 52, 1840, 750 + k * 50, 16, 20 + k, 0.7), B5B.x0F2340, { a0: 0.3, flow: 0.2, seed: 20 + k });
}, [236, 1029, 'left']); };

/** c: two pale glazes laid side by side, overlapping in the middle (a third colour), each with a bloom; splatter thrown across. */
const bloomPage: HandGround = (e) => { sheetOf(e, 'bloom', (b) => {
  const s = e.slots;
  wash(b, poly(blobPts(600, 560, 470, 360), 40, 11), B5B.xB7D6D0, { a0: 0.38, col2: B5B.xD6E3C2, seed: 8, blooms: [[480, 420, 110]] });
  wash(b, poly(blobPts(1330, 560, 480, 360), 40, 12), B5B.xEFD49C, { a0: 0.36, col2: B5B.xF2C6B0, seed: 9, blooms: [[1460, 700, 90]] });
  splat(b, 960, 500, 900, 140, s.ink, 9, e.rect, 7);
}, [1680, 1028, 'right'], true); };

/** d: two vertical strokes, one a phrase, their lower ends run dry over the tooth; a bloom in each; splatter beside. The
 * phrases reserved white in them. A line with one phrase gets one stroke. */
const strokesPage: HandGround = (e) => { sheetOf(e, 'strokes', (b) => {
  const s = e.slots;
  const two = !e.rect || e.rect.x0 < 0.52 * W;
  wash(b, stroke(1150, 70, 1166, 1060, 236, 31, 0.86), s.ink2, { a0: 0.92, flow: 0.25, col2: mixHex(s.ink2, B5B.x8E2A1E, 0.5), seed: 12, blooms: [[1160, 860, 60]] });
  if (two) wash(b, stroke(870, 60, 860, 1060, 236, 32, 0.9), s.plateInk, { a0: 0.92, flow: 0.25, col2: mixHex(s.plateInk, B5B.x1E4A6E, 0.5), seed: 13, blooms: [[866, 180, 50]] });
  splat(b, 1500, 300, 220, 50, s.ink2, 33, e.rect, 7);
}, [236, 1028, 'left']); };

const Gs: Record<string, HandGround> = { 'watercolor/wash': washPage, 'watercolor/night': nightPage, 'watercolor/bloom': bloomPage, 'watercolor/strokes': strokesPage };
for (const [id, page] of Object.entries(B5B_MIRRORED)) if (Gs[page]) Gs[id] = mirrorGround(Gs[page]);

/** A glaze band as a picture, kept: a pale wash with its rim, the leading edge hard. */
const glazeBand = (tone: string) => kept(`wc-glaze|${tone}`, 520, H, (c) => {
  const g = c.createImageData(520, H);
  const C = rgb(tone);
  for (let y = 0; y < H; y++) for (let x = 0; x < 520; x++) {
    const d = 520 - 40 * fbm(y * 0.01, 0, 3) - x;
    if (d < 0) continue;
    const a = clamp01(0.3 + 0.4 * Math.exp(-d / 4) + (vnoise(x * 0.5, y * 0.5, 7) - 0.5) * 0.06);
    const i = (y * 520 + x) * 4;
    for (let k = 0; k < 3; k++) g.data[i + k] = 255 * C[k];
    g.data[i + 3] = a * 255;
  }
  c.putImageData(g, 0, 0);
});
const INS: Record<string, HandIn> = {
  // a change of part: a pale glaze is brushed across the sheet left to right and lifts off, its leading edge hard
  'glaze-sweep': { sec: 0.55, draw: (e, q) => frame(e, (c) => {
    const x = -520 + (W + 520) * ease(q, 2);
    c.drawImage(glazeBand(e.slots.plateInk), x, 0);
  }) },
};

const freeSpot = (e: WorldEnv, spots: Pt[], r: number) => spots.find(([x, y]) => !meets({ x0: x - r, y0: y - r, x1: x + r, y1: y + r }, e.rect, 24));
/** A small wash as a picture, kept: a disc or a flower of pigment with its rim and granulation. */
const smallWash = (key: string, tone: string, draw: (c: OffscreenCanvasRenderingContext2D) => void) => kept(`wc-piece|${key}|${tone}`, W, H, (c) => {
  const b = new Float32Array(W * H * 3).fill(255);
  wash(b, maskOf(draw), tone, { a0: 0.55, rim: 0.45, seed: 41 });
  const img = c.createImageData(W, H);
  for (let j = 0; j < W * H; j++) { const k = (255 - b[j * 3 + 1]) / 255; if (k <= 0.004) continue; img.data[j * 4] = b[j * 3]; img.data[j * 4 + 1] = b[j * 3 + 1]; img.data[j * 4 + 2] = b[j * 3 + 2]; img.data[j * 4 + 3] = 255; }
  c.putImageData(img, 0, 0);
});
const PIECES: Record<string, Piece> = {
  // a flick of the brush: splatter thrown across a free part of the sheet, drop by drop
  'splatter': { sec: 1.6, clear: 0, draw: (e, q) => frame(e, (c) => {
    const at = freeSpot(e, [[1600, 820], [320, 820], [1600, 240], [320, 240]], 160);
    if (!at) return;
    const R = rng(e.seed + 9);
    c.fillStyle = e.slots.ink;
    for (let i = 0; i < 40; i++) { const [a, d, r] = [R() * 7, Math.pow(R(), 1.5) * 150, 1.5 + Math.pow(R(), 3) * 8]; if (i / 40 > q * 2.5) break; c.globalAlpha = 0.75 * (1 - clamp01((q - 0.85) / 0.15)); c.beginPath(); c.arc(at[0] + Math.cos(a) * d, at[1] + Math.sin(a) * d * 0.6, r, 0, 7); c.fill(); }
    c.globalAlpha = 1;
  }) },
  // a flower dropped in wet: five petals of pigment spreading in a free corner, each with its dark rim
  'bloom-open': { sec: 2.2, clear: 0, draw: (e, q) => frame(e, (c) => {
    const at = freeSpot(e, [[1640, 800], [280, 800], [1640, 260], [280, 260]], 170);
    if (!at) return;
    const pic = smallWash(`flower${at.join()}`, B5B.xD96A7A, (g) => { for (let k = 0; k < 5; k++) { const a = (k / 5) * 6.28; g.beginPath(); g.ellipse(at[0] + Math.cos(a) * 60, at[1] + Math.sin(a) * 60, 62, 40, a, 0, 7); g.fill(); } });
    c.save();
    c.globalAlpha = Math.min(ease(q / 0.4, 2), 1 - clamp01((q - 0.85) / 0.15));
    c.globalCompositeOperation = 'multiply';
    c.drawImage(pic, 0, 0);
    c.restore();
  }) },
  // a moon reserved white in a round dark wash laid beside the words
  'glaze-moon': { sec: 2.4, clear: 0, draw: (e, q) => frame(e, (c) => {
    const at = freeSpot(e, [[1620, 230], [300, 230], [1620, 820], [300, 820]], 150);
    if (!at) return;
    const pic = smallWash(`moon${at.join()}`, e.slots.plateInk, (g) => { g.beginPath(); g.arc(at[0], at[1], 130, 0, 7); g.fill(); g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(at[0] + 18, at[1] - 10, 62, 0, 7); g.fill(); });
    c.save();
    c.globalAlpha = Math.min(ease(q / 0.4, 2), 1 - clamp01((q - 0.85) / 0.15));
    c.globalCompositeOperation = 'multiply';
    c.drawImage(pic, 0, 0);
    c.restore();
  }) },
};

export const WC = { grounds: Gs, ins: INS, pieces: PIECES, objects: {} };
