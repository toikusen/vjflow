// cyanotype, from its board (2026-11-05, 風格第4批設計稿/cyanotype a–d; source out/research/boards-b4/boards/cyanotype.html):
// a sun print. A patch of sensitiser brushed onto white watercolour paper in Prussian blue, its left and right edges
// running out in dry-brush streaks that grow from the edge and break once, overlapping passes leaving darker bands; what
// lay on it in the sun stays white: Barnsley ferns, grass stems with seed heads, a lace doily, pinholes for stars. A
// silhouette only registers where there is sensitiser (source-atop); a frond lifted off the paper prints at half. The
// words are white, as if written on the transparency exposed with the plants. No straight technical line, no grid (that
// is blueprint), no cloth (that is aizome). Printed words: the song's title in pencil, in its opening only (world-title.ts).
import type { Piece } from './world-pieces';
import { clamp01, ease, H, HandGround, HandIn, kept, mixHex, W, WorldEnv } from './world-craft';
import { artistBy, C, label, rng, titleOf } from './world-b3-shared';
import { B4B } from './b4b-inks';

type Box = { x0: number; y0: number; x1: number; y1: number };
/** Draws in the frame's own coordinates (the page does not slide). */
const frame = (e: WorldEnv, f: (c: CanvasRenderingContext2D) => void) => { const c = e.ctx; c.save(); if (e.base) c.setTransform(e.base); f(c); c.restore(); };
const PENCIL = (px: number) => `400 ${px}px "Courier Prime", "Noto Serif TC", monospace`;

/** The board's value noise for the brushed edges. */
const vn = (seed: number) => { const r = rng(seed); const t = Array.from({ length: 512 }, () => r()); return (x: number) => { const i = Math.floor(x); const f = x - i; const s = f * f * (3 - 2 * f); return t[i & 511] * (1 - s) + t[(i + 1) & 511] * s; }; };
/** The coat's three blues from the scheme's: lighter where the brush laid more, deeper where it lifted (board #1B4682, #173C72, #14335F). */
const blues = (g: string): [string, string, string] => [mixHex(g, B4B.x2A62B0, 0.22), g, mixHex(g, B4B.x000000, 0.13)];

/**
 * A brushed patch of sensitiser (board `coat`): horizontal strokes, so the left and right edges run out in bristle streaks;
 * top and bottom edges ragged; six overlapping passes leave darker bands. Into `c` at its place.
 */
function coat(c: C, x: number, y: number, w: number, h: number, seed: number, ground: string) {
  const [n1, n2, n3, r] = [vn(seed), vn(seed + 1), vn(seed + 5), rng(seed + 2)];
  const [light, mid, deep] = blues(ground);
  const g = c.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, light);
  g.addColorStop(0.55, mid);
  g.addColorStop(1, deep);
  c.fillStyle = g;
  for (let yy = y; yy < y + h; yy += 2) {
    const l = x + 34 * n1(yy / 61) + 10 * n1(yy / 13) - 22;
    const rr = x + w - 34 * n2(yy / 57) - 10 * n2(yy / 11) + 22;
    c.fillRect(l, yy, rr - l, 2);
    // dry-brush run-out: streaks grow out of the edge where the bristles dragged, thinning and breaking once
    const run = (x0: number, dir: number, k: number) => {
      if (n3(yy / 7 + k) < 0.7 || r() < 0.45) return;
      const L = 14 + r() * 60 * (n3(yy / 7 + k) - 0.6) * 3;
      const gp = 0.4 + r() * 0.4;
      c.fillRect(dir > 0 ? x0 : x0 - L * gp, yy, L * gp, 2);
      c.fillRect(dir > 0 ? x0 + L * gp + 4 : x0 - L - 4, yy + 0.5, L * (1 - gp), 1);
    };
    run(l, -1, 0);
    run(rr, 1, 40);
  }
  for (let xx = x - 10; xx < x + w + 10; xx += 2) {
    const t = 12 * n1(xx / 83 + 50) + 4 * n1(xx / 17 + 90);
    const b = 12 * n2(xx / 91 + 70) + 4 * n2(xx / 19 + 30);
    c.fillRect(xx, y - t, 2, t + 1);
    c.fillRect(xx, y + h - 1, 2, b);
  }
  // overlapping brush passes leave slightly denser bands, on the coat only
  c.save();
  c.globalCompositeOperation = 'source-atop';
  c.fillStyle = B4B.x0A1E46;
  for (let i = 0; i < 6; i++) { const yy = y + r() * h; const hh = 30 + r() * 90; c.globalAlpha = 0.05 + r() * 0.06; c.fillRect(x - 200, yy, w + 400, hh); }
  c.restore();
}

/**
 * A Barnsley fern as a contact silhouette, kept once a size: drawn upright from its stem's foot at (0, 0) of a 6 × 11 unit
 * box. A frond lifted off the paper (`tone` under 1) lets light creep under each leaflet: its points print at that tone and
 * build up where they crowd, as the board's do.
 */
const fernSprite = (sc: number, n: number, tone: number) => kept(`cyan-fern|${sc}|${n}|${tone}`, Math.ceil(6.2 * sc), Math.ceil(10.4 * sc), (g) => {
  const r = rng(Math.round(sc * 31 + n));
  let [x, y] = [0, 0];
  g.fillStyle = B4B.xFFFFFF;
  g.globalAlpha = tone;
  const d = 2.2;
  for (let i = 0; i < n; i++) {
    const p = r();
    const [nx, ny] = p < 0.01 ? [0, 0.16 * y] : p < 0.86 ? [0.85 * x + 0.04 * y, -0.04 * x + 0.85 * y + 1.6] : p < 0.93 ? [0.2 * x - 0.26 * y, 0.23 * x + 0.22 * y + 1.6] : [-0.15 * x + 0.28 * y, 0.26 * x + 0.24 * y + 0.44];
    [x, y] = [nx, ny];
    if (i > 20) g.fillRect((x + 2.4) * sc, (10.2 - y) * sc, d, d);
  }
});
/** A fern laid on the print at (ox, oy) (its stem's foot), turned `ang`, mirrored by `flip`, in the silhouette white at `tone`. */
function fern(c: C, ox: number, oy: number, sc: number, ang: number, tone: number, flip = 1, n = 260000) {
  const s = fernSprite(sc, n, tone);
  c.save();
  c.translate(ox, oy);
  c.rotate(ang);
  c.scale(flip, 1);
  c.drawImage(s, -2.4 * sc, -10.2 * sc);
  c.restore();
}
/** A grass stem with a seed head (board `grass`), white at `tone`. */
function grass(c: C, x: number, y: number, len: number, bend: number, tone: number, seed: number, white: string) {
  const r = rng(seed);
  c.save();
  c.globalAlpha = tone;
  c.strokeStyle = c.fillStyle = white;
  c.lineCap = 'round';
  const pts = Array.from({ length: 41 }, (_, i) => { const t = i / 40; return [x + bend * t * t, y - len * t] as [number, number]; });
  for (let i = 0; i < 40; i++) { c.lineWidth = 5 * (1 - i / 40) + 1.2; c.beginPath(); c.moveTo(...pts[i]); c.lineTo(...pts[i + 1]); c.stroke(); }
  for (let i = 18; i < 40; i++) {
    const [px, py] = pts[i];
    const s = (1 - Math.abs(i - 30) / 14) * 9 + 3;
    for (const sd of [-1, 1]) { c.save(); c.translate(px, py); c.rotate(sd * (0.5 + r() * 0.3) - Math.atan2(bend, len) * 0.5); c.beginPath(); c.ellipse(sd * s * 0.9, -s * 0.4, s, s * 0.38, 0, 0, 7); c.fill(); c.restore(); }
  }
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(x, y);
  c.quadraticCurveTo(x - bend * 0.3, y - len * 0.4, x - bend * 0.6 - 40, y - len * 0.55);
  c.stroke();
  c.restore();
}
/** The lace doily (board c): a scalloped ring of cloth, three rounds of eyelets, an open centre; and its thin picot ring. */
function doily(c: C, cx: number, cy: number, k: number, white: string) {
  const o = new OffscreenCanvas(W, H);
  const d = o.getContext('2d')!;
  d.fillStyle = white;
  d.beginPath();
  for (let i = 0; i <= 720; i++) { const a = (i / 720) * Math.PI * 2; const rr = (500 + 18 * Math.abs(Math.sin(a * 24))) * k; d.lineTo(cx + Math.cos(a) * rr * 1.55, cy + Math.sin(a) * rr * 0.98); }
  d.closePath();
  d.fill();
  d.globalCompositeOperation = 'destination-out';
  const E = (rx: number, ry: number, n: number, s: number, sk = 0) => { for (let i = 0; i < n; i++) { const a = ((i + sk) / n) * Math.PI * 2; d.beginPath(); d.ellipse(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, s, s * 0.62, a, 0, 7); d.fill(); } };
  E(475 * 1.55 * k, 475 * 0.98 * k, 110, 8 * k);
  E(442 * 1.55 * k, 442 * 0.98 * k, 56, 17 * k, 0.5);
  E(410 * 1.55 * k, 410 * 0.98 * k, 110, 5 * k);
  d.beginPath();
  d.ellipse(cx, cy, 392 * 1.55 * k, 392 * 0.98 * k, 0, 0, 7);
  d.fill();
  d.globalCompositeOperation = 'source-over';
  d.fillStyle = white;
  for (let i = 0; i < 160; i++) { const a = (i / 160) * Math.PI * 2; d.beginPath(); d.arc(cx + Math.cos(a) * 380 * 1.55 * k, cy + Math.sin(a) * 380 * 0.98 * k, 4 * k, 0, 7); d.fill(); }
  c.save();
  c.globalCompositeOperation = 'source-atop';
  c.drawImage(o, 0, 0);
  c.restore();
}

/** A print: its coats and what lay on them, painted once a scheme on a layer of its own (the paper shows round it). */
const print = (e: WorldEnv, id: string, coats: [number, number, number, number, number][], laid: (c: OffscreenCanvasRenderingContext2D) => void) =>
  kept(`cyan|${id}|${e.slots.ground}|${e.slots.ink}`, W, H, (c) => { coats.forEach(([x, y, w, h, s]) => coat(c, x, y, w, h, s, e.slots.ground)); c.save(); c.globalCompositeOperation = 'source-atop'; laid(c); c.restore(); });
/** The paper, the print on it, and the pencil label (the song's title and artist, in its opening only). */
function sheet(e: WorldEnv, c: CanvasRenderingContext2D, layer: OffscreenCanvas, at: [number, number, 'left' | 'right']) {
  c.fillStyle = e.slots.plate;
  c.fillRect(-W * 0.1, -H * 0.1, W * 1.2, H * 1.2);
  c.drawImage(layer, 0, 0);
  const t = titleOf(e);
  if (!t) return;
  const who = artistBy(e);
  label(c, who ? `${t} — ${who}` : t, at[0], at[1], PENCIL(24), e.slots.faint, 24 * 0.08, at[2]);
}
const clearOf = (r: Box | undefined, x: number, y: number, m: number) => !r || x < r.x0 - m || x > r.x1 + m || y < r.y0 - m || y > r.y1 + m;

/** a: two fronds sweep in from the lower corners; the title sits between them, high. */
const fernPage: HandGround = (e) => frame(e, (c) => {
  const layer = print(e, 'fern', [[110, 90, 1700, 880, 3]], (g) => { fern(g, 190, 1000, 52, 0.62, 1); fern(g, 1730, 1000, 52, -0.62, 1, -1); });
  sheet(e, c, layer, [120, 1032, 'left']);
});

/** The board's pinholes: big stars, and a seeded scatter of fine ones, all clear of the words. */
const STARS: [number, number, number][] = [[260, 190, 7], [520, 260, 3], [760, 150, 4], [1180, 210, 3], [1460, 160, 6], [1660, 300, 3], [330, 700, 3], [1590, 720, 4], [930, 120, 2.5], [1720, 190, 2.5], [180, 420, 2.5], [1750, 520, 3]];
function pinholes(c: CanvasRenderingContext2D, e: WorldEnv, open = 1) {
  const r = e.rect;
  c.fillStyle = e.slots.ink;
  STARS.forEach(([x, y, rad], i) => { if (i / STARS.length < open && clearOf(r, x, y, 30)) { c.beginPath(); c.arc(x, y, rad, 0, 7); c.fill(); } });
  const R = rng(11);
  for (let i = 0; i < 160; i++) {
    const [x, y, a] = [140 + R() * 1640, 110 + R() * 610, 0.4 + R() * 0.6];
    if (i / 160 >= open || !clearOf(r, x, y, 24)) continue;
    c.globalAlpha = a;
    c.fillRect(x, y, 1.6, 1.6);
  }
  c.globalAlpha = 1;
}
/** b: a calm night print; the lower part of the coat took less light under a sheet of glass: a paler sea with a hard horizon. */
const starsPage: HandGround = (e) => frame(e, (c) => {
  const layer = print(e, 'stars', [[110, 80, 1700, 780, 9]], (g) => {
    g.fillStyle = mixHex(e.slots.ground, B4B.x78A0D7, 0.3);
    g.fillRect(0, 720, W, 400);
    g.globalAlpha = 0.5;
    g.fillStyle = e.slots.ink;
    g.fillRect(0, 718, W, 3);
    g.globalAlpha = 1;
  });
  sheet(e, c, layer, [1672, 1032, 'right']);
  pinholes(c, e);
});

/** c: a ring doily laid on the print; its open centre holds the line; two lifted fronds print at half. */
const doilyPage: HandGround = (e) => frame(e, (c) => {
  const layer = print(e, 'doily', [[80, 60, 1760, 950, 21]], (g) => {
    doily(g, 960, 530, 1, e.slots.ink);
    fern(g, 200, 1040, 34, 0.5, 0.5, 1, 120000);
    fern(g, 1760, 40, 30, -2.6, 0.5, -1, 120000);
  });
  sheet(e, c, layer, [120, 1052, 'left']);
});

/** d: two narrow prints side by side, grasses up the outer edge of each; the sheet's other half, a single frond alone. */
const stripsPage: HandGround = (e) => frame(e, (c) => {
  // (the second print only when the line has a second phrase on it: a print with no words would be a bare shape)
  const two = !e.rect || e.rect.x0 < 0.68 * W;
  const layer = print(e, two ? 'strips2' : 'strips1', [[1380, 80, 290, 900, 31], ...(two ? [[1000, 80, 290, 900, 37] as [number, number, number, number, number]] : []), [160, 160, 640, 760, 41]], (g) => {
    grass(g, 1620, 1000, 780, -60, 1, 4, e.slots.ink);
    grass(g, 1640, 1000, 620, 30, 0.55, 5, e.slots.ink);
    if (two) grass(g, 1240, 1000, 720, -40, 1, 6, e.slots.ink);
    fern(g, 470, 880, 62, 0.05, 1);
  });
  sheet(e, c, layer, [120, 1042, 'left']);
});

const Gs: Record<string, HandGround> = { 'cyanotype/fern': fernPage, 'cyanotype/stars': starsPage, 'cyanotype/doily': doilyPage, 'cyanotype/strips': stripsPage };

const INS: Record<string, HandIn> = {
  // a change of line is a new exposure: the lamp flashes white over the print and the blue develops back, deepening
  'exposure-flash': { sec: 0.7, draw: (e, q) => frame(e, (c) => {
    const a = q < 0.15 ? (q / 0.15) * 0.7 : 0.7 * (1 - ease((q - 0.15) / 0.65, 2));
    if (a <= 0.005) return;
    c.save();
    c.globalAlpha = a;
    c.fillStyle = e.slots.ink;
    c.fillRect(-W * 0.1, -H * 0.1, W * 1.2, H * 1.2);
    c.restore();
  }) },
};

/** Where a set piece may print: the coat, away from the words. */
const freeCorner = (e: WorldEnv, spots: [number, number][], m: number) => spots.find(([x, y]) => clearOf(e.rect, x, y, m));

const PIECES: Record<string, Piece> = {
  // the pinholes open one at a time over the sky, never on the words
  'pinhole-open': { sec: 2.4, clear: 0, draw: (e, q) => frame(e, (c) => {
    const R = rng(e.seed + 17);
    c.fillStyle = e.slots.ink;
    for (let i = 0; i < 26; i++) {
      const [x, y, rad] = [160 + R() * 1600, 120 + R() * 560, 2 + R() * 4];
      if (i / 26 > q * 1.3 || !clearOf(e.rect, x, y, 40)) continue;
      c.beginPath();
      c.arc(x, y, rad, 0, 7);
      c.fill();
    }
  }) },
  // a second frond is laid on in a free corner and develops out of the blue
  'frond-print': { sec: 2.2, clear: 0, draw: (e, q) => frame(e, (c) => {
    const at = freeCorner(e, [[1640, 520], [300, 520], [1640, 240], [300, 240]], 260);
    if (!at) return;
    c.save();
    c.globalAlpha = Math.min(ease(q / 0.5, 2), 1 - clamp01((q - 0.85) / 0.15)) * 0.85;
    fern(c, at[0], at[1] + 300, 30, at[0] > W / 2 ? -0.3 : 0.3, 1, at[0] > W / 2 ? -1 : 1, 120000);
    c.restore();
  }) },
  // a small round of lace is printed beside the words, the way a keepsake is laid on the paper
  'lace-print': { sec: 2.2, clear: 0, draw: (e, q) => frame(e, (c) => {
    const at = freeCorner(e, [[1600, 820], [320, 820], [1600, 260], [320, 260]], 230);
    if (!at) return;
    const a = Math.min(ease(q / 0.45, 2), 1 - clamp01((q - 0.85) / 0.15));
    c.save();
    c.globalAlpha = a * 0.9;
    c.fillStyle = e.slots.ink;
    c.translate(at[0], at[1]);
    for (let ring = 0; ring < 3; ring++) {
      const n = 18 + ring * 12;
      for (let i = 0; i < n; i++) { const t = (i / n) * Math.PI * 2; const rr = 70 + ring * 46; c.beginPath(); c.ellipse(Math.cos(t) * rr, Math.sin(t) * rr * 0.98, 9 + ring * 3, 5 + ring * 2, t, 0, 7); c.fill(); }
    }
    c.restore();
  }) },
};

export const CYAN = { grounds: Gs, ins: INS, pieces: PIECES, objects: {} };
