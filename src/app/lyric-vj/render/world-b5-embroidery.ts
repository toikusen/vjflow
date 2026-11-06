// embroidery, from its boards (2026-11-06, 風格第5批設計稿/embroidery a–d; source out/research/boards-b5/boards/embroidery.html):
// cloth stretched in a wooden hoop on a wall. Plain-weave linen (threads 3.4 px apart, each with its own tone, a rounded
// cross profile and slubs), the hoop's beech rim with its grain and the brass screw of its clamp; on the night cloth gold
// French knots for stars and four rows of running stitch for the sea; a sampler on aida with a stitched border and a red
// diamond chain. The letters are thread (world-glyph-b5 satin, cross-stitch). The hoop is always drawn round the words as
// they were set (their cells), never cut through them. Printed words: the song's title and artist in its opening only,
// and the time the cut began, in a small stitched-label grey.
import type { Piece } from './world-pieces';
import { clamp01, ease, H, HandGround, HandIn, kept, mixHex, W, WorldEnv } from './world-craft';
import { C, rng } from './world-b3-shared';
import { B5 } from './b5-inks';
import { Box, cutTime, frame, grow, openingData, outside, small, smallEnd, smallStart, wordsBox } from './world-b5-shared';

const SANS = (px: number) => `500 ${px}px "Noto Sans HK", "Noto Sans JP", sans-serif`;
const [rgb, hexRgb] = [(c: number[]) => `rgb(${c.map((v) => Math.round(Math.max(0, Math.min(255, v)))).join(',')})`, (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))];

/** Smooth value noise along one axis, 0..1. */
const vn = (seed: number) => { const r = rng(seed); const t = Array.from({ length: 512 }, () => r()); return (x: number) => { const i = Math.floor(x); const f = x - i; const s = f * f * (3 - 2 * f); return t[i & 511] * (1 - s) + t[(i + 1) & 511] * s; }; };

/**
 * Plain-weave linen over the whole frame (board `linen`): over and under cells alternate, each thread its own tone, a
 * rounded profile across it and slubs along it. Made once a colour.
 */
const linen = (tone: string, seed: number) => kept(`b5-linen|${tone}|${seed}`, W, H, (c) => {
  const pitch = 3.4;
  const B = hexRgb(tone);
  const R = rng(seed);
  const hv = Array.from({ length: 400 }, () => 0.95 + R() * 0.07);
  const vv = Array.from({ length: 600 }, () => 0.95 + R() * 0.07);
  const n = vn(seed + 3);
  const img = c.createImageData(W, H);
  const d = img.data;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const [tx, ty] = [Math.floor(x / pitch), Math.floor(y / pitch)];
      const [fx, fy] = [x / pitch - tx, y / pitch - ty];
      const over = (tx + ty) & 1;
      const prof = over ? Math.sin(Math.PI * fy) : Math.sin(Math.PI * fx);
      const slub = 1 + (n(over ? x * 0.004 + ty * 0.7 : y * 0.004 + tx * 0.7) - 0.5) * 0.12;
      const k = (over ? hv[ty % 400] : vv[tx % 600]) * (0.88 + 0.12 * prof) * slub;
      const i = (y * W + x) * 4;
      d[i] = Math.min(255, B[0] * k);
      d[i + 1] = Math.min(255, B[1] * k);
      d[i + 2] = Math.min(255, B[2] * k);
      d[i + 3] = 255;
    }
  c.putImageData(img, 0, 0);
});

/** The hoop's centre and inner radius: at least the board's, and always round the words with room to spare. */
function hoopFor(words: Box, cx: number, cy: number, least: number, room = 70) {
  const far = Math.max(...[[words.x0, words.y0], [words.x1, words.y0], [words.x0, words.y1], [words.x1, words.y1]].map(([x, y]) => Math.hypot(x - cx, y - cy)));
  return Math.max(least, far + room);
}

/** The beech rim (board `hoop`): the band, its inner and outer edges, grain arcs, and the clamp with its brass screw at `ang`. */
function hoop(c: C, cx: number, cy: number, r: number, ang: number, seed: number, band = 46) {
  const R = rng(seed);
  c.save();
  c.lineWidth = band;
  c.strokeStyle = B5.xC69A62;
  c.beginPath();
  c.arc(cx, cy, r + band / 2, 0, Math.PI * 2);
  c.stroke();
  c.lineWidth = 6;
  c.strokeStyle = B5.xA97C47;
  c.beginPath();
  c.arc(cx, cy, r + 4, 0, Math.PI * 2);
  c.stroke();
  c.lineWidth = 4;
  c.strokeStyle = B5.xE2BD86;
  c.beginPath();
  c.arc(cx, cy, r + band - 6, 0, Math.PI * 2);
  c.stroke();
  for (let k = 0; k < 26; k++) {
    const [a0, l, rr] = [R() * 7, 0.2 + R() * 0.5, r + 10 + R() * (band - 20)];
    c.strokeStyle = R() < 0.5 ? 'rgba(140,96,50,0.55)' : 'rgba(232,196,140,0.5)';
    c.lineWidth = 1.5 + R() * 1.5;
    c.beginPath();
    c.arc(cx, cy, rr, a0, a0 + l);
    c.stroke();
  }
  // the clamp: two blocks across the split and a brass screw
  const [ox, oy] = [cx + Math.cos(ang) * (r + band), cy + Math.sin(ang) * (r + band)];
  c.translate(ox, oy);
  c.rotate(ang);
  c.scale(1.5, 1.5);
  c.fillStyle = B5.xB98C55;
  c.fillRect(-6, -34, 44, 26);
  c.fillRect(-6, 8, 44, 26);
  c.fillStyle = B5.x8A6234;
  c.fillRect(-6, -8, 44, 16);
  c.fillStyle = B5.xC9A24A;
  c.fillRect(38, -10, 38, 20);
  c.fillStyle = B5.xE8CB7A;
  c.fillRect(38, -10, 38, 6);
  c.fillStyle = B5.xB78E3A;
  c.beginPath();
  c.arc(80, 0, 20, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = B5.xE8CB7A;
  c.beginPath();
  c.arc(76, -5, 8, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

/** A French knot (board `knot`): its shadow, the wrapped thread in three turns, a light on its top. */
function knot(c: C, x: number, y: number, r: number, col: string) {
  const C0 = hexRgb(col);
  c.fillStyle = rgb(C0.map((v) => v * 0.6));
  c.beginPath();
  c.arc(x + 1.5, y + 2, r, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = col;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = rgb(C0.map((v) => v * 0.7));
  c.lineWidth = 1.4;
  for (let k = 0; k < 3; k++) { c.beginPath(); c.arc(x, y, r * (0.35 + k * 0.22), k, k + 3.6); c.stroke(); }
  c.fillStyle = rgb(C0.map((v) => v + (255 - v) * 0.5));
  c.beginPath();
  c.arc(x - r * 0.3, y - r * 0.35, r * 0.3, 0, Math.PI * 2);
  c.fill();
}

/** Running stitch along a path (board `running`): dashes of `len` with gaps of `gap`, each with its shadow. Up to `upto` of its length. */
function running(c: C, pts: [number, number][], col: string, len = 24, gap = 13, w = 4.5, upto = Infinity) {
  const C0 = hexRgb(col);
  const shade = rgb(C0.map((v) => v * 0.65));
  let [acc, on, done] = [0, true, 0];
  c.lineCap = 'round';
  c.lineWidth = w;
  for (let i = 1; i < pts.length; i++) {
    const [[ax, ay], [bx, by]] = [pts[i - 1], pts[i]];
    const L = Math.hypot(bx - ax, by - ay);
    let t = 0;
    while (t < L) {
      const step = Math.min((on ? len : gap) - acc, L - t);
      if (done + step > upto) return;
      if (on) {
        const [sx, sy, ex, ey] = [ax + ((bx - ax) * t) / L, ay + ((by - ay) * t) / L, ax + ((bx - ax) * (t + step)) / L, ay + ((by - ay) * (t + step)) / L];
        c.strokeStyle = shade;
        c.beginPath();
        c.moveTo(sx + 1, sy + 2);
        c.lineTo(ex + 1, ey + 2);
        c.stroke();
        c.strokeStyle = col;
        c.beginPath();
        c.moveTo(sx, sy);
        c.lineTo(ex, ey);
        c.stroke();
      }
      acc += step;
      t += step;
      done += step;
      if (acc >= (on ? len : gap) - 0.01) { acc = 0; on = !on; }
    }
  }
}

/** Linen inside a circle, the rim round it, on the wall. */
function hooped(c: C, e: WorldEnv, cx: number, cy: number, r: number, cloth: string, ang: number) {
  c.fillStyle = e.slots.ground;
  c.fillRect(0, 0, W, H);
  c.save();
  c.beginPath();
  c.arc(cx, cy, r, 0, Math.PI * 2);
  c.clip();
  c.drawImage(linen(cloth, 3 + (e.seed % 3)), 0, 0);
  c.restore();
  hoop(c, cx, cy, r, ang, 31 + (e.seed % 5));
}
/** The small stitched-label print under the words: the opening's title and artist, and the cut's time. */
function caption(c: C, e: WorldEnv, x: number, y: number, tone: string, px = 34) {
  const d = openingData(e, '　');
  small(c, [d, cutTime(e)].filter(Boolean).join('　'), x, y, px, SANS, tone, 1, 'center');
}

/** a: a big hoop cropping the frame top and bottom, its clamp up at the left; two threads; the label under the words. */
const bigHoop: HandGround = (e) => frame(e, (c) => {
  smallStart();
  const w = wordsBox(e);
  const [cx, cy] = [960, 560];
  const r = hoopFor(w, cx, cy, 760);
  hooped(c, e, cx, cy, r, e.slots.plate, Math.PI * 1.13);
  if (w.y1 + 110 < H - 40) caption(c, e, 960, w.y1 + 100, mixHex(e.slots.plateInk, e.slots.plate, 0.38));
  smallEnd();
});
/** a, held lower: a whole hoop on the wall, its clamp at the top, one thread. */
const lowHoop: HandGround = (e) => frame(e, (c) => {
  smallStart();
  const w = wordsBox(e);
  const [cx, cy] = [960, 540];
  const r = Math.min(500, hoopFor(w, cx, cy, 420, 60));
  hooped(c, e, cx, cy, r, e.slots.plate, -Math.PI / 2);
  if (w.y1 + 80 < cy + r - 50) caption(c, e, 960, w.y1 + 74, mixHex(e.slots.plateInk, e.slots.plate, 0.38), 30);
  smallEnd();
});

/** b: night linen in a small hoop; gold knots for stars above the words (one at a time as the page opens), the running-stitch sea below. */
const KNOTS: [number, number, number][] = [[-200, -0.62, 9], [50, -0.82, 7], [220, -0.5, 10], [-80, -0.42, 6], [150, -0.3, 5], [-320, -0.3, 6]];
const night: HandGround = (e) => frame(e, (c) => {
  smallStart();
  const w = wordsBox(e);
  const [cx, cy] = [960, 540];
  const r = Math.min(520, hoopFor(w, cx, cy, 486, 60));
  hooped(c, e, cx, cy, r, e.slots.ink2, -Math.PI / 2);
  c.save();
  c.beginPath();
  c.arc(cx, cy, r - 24, 0, Math.PI * 2);
  c.clip();
  outside(c, grow(w, 26));
  // the knots, one every third of a second, in the sky above the words (calm motion: they are tied one by one)
  const shown = Math.min(KNOTS.length, Math.floor(e.age / 0.33) + 1);
  KNOTS.slice(0, shown).forEach(([dx, fy, kr]) => { const y = cy + fy * r; if (y < w.y0 - 20) knot(c, cx + dx, y, kr, B5.xE3B758); });
  // the sea: four rows of running stitch under the words, inside the hoop
  for (let k = 0; k < 4; k++) {
    const y0 = Math.max(w.y1 + 100, cy + 190) + k * 40;
    const pts: [number, number][] = [];
    for (let x = cx - 440; x <= cx + 440; x += 8) { const yy = y0 + Math.sin(x * 0.018 + k) * 9; if ((x - cx) ** 2 + (yy - cy) ** 2 < (r - 30) ** 2) pts.push([x, yy]); }
    running(c, pts, k % 2 ? B5.x7FA6CF : B5.xA9C6E3);
  }
  c.restore();
  if (w.y1 + 70 < cy + 150) caption(c, e, 960, w.y1 + 66, mixHex(e.slots.faint, e.slots.ink2, 0.3), 30);
  smallEnd();
});

/** The sampler's cross (board c `X`), on a grid of `P`. */
function cross(c: C, x: number, y: number, P: number, col: string) {
  const C0 = hexRgb(col);
  c.lineCap = 'round';
  c.lineWidth = 4.2;
  c.strokeStyle = rgb(C0.map((v) => v * 0.65));
  c.beginPath();
  c.moveTo(x + 2, y + P - 2);
  c.lineTo(x + P - 2, y + 2);
  c.stroke();
  c.strokeStyle = col;
  c.beginPath();
  c.moveTo(x + 2, y + 2);
  c.lineTo(x + P - 2, y + P - 2);
  c.stroke();
  c.strokeStyle = rgb(C0.map((v) => v + (255 - v) * 0.3));
  c.lineWidth = 1.4;
  c.beginPath();
  c.moveTo(x + 4, y + 4);
  c.lineTo(x + P - 5, y + P - 5);
  c.stroke();
}
/** c: a cross-stitch sampler on aida: two green rows for a border three cells in, a red diamond chain inside it. */
const sampler: HandGround = (e) => frame(e, (c) => {
  smallStart();
  const P = 14;
  const [GX, GY] = [Math.floor(W / P), Math.floor(H / P)];
  c.drawImage(kept(`b5-aida|${e.slots.plate}`, W, H, (g) => {
    g.fillStyle = e.slots.plate;
    g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(120,108,88,0.38)';
    for (let y = 0; y < H; y += P) for (let x = 0; x < W; x += P) g.fillRect(x - 1, y - 1, 3, 3);
    g.fillStyle = 'rgba(255,255,255,0.5)';
    for (let y = 0; y < H; y += P) g.fillRect(0, y + 5, W, 2);
    for (let gx = 3; gx < GX - 3; gx++) for (const gy of [3, GY - 4]) cross(g, gx * P, gy * P, P, B5.x2F6B4F);
    for (let gy = 3; gy < GY - 3; gy++) for (const gx of [3, GX - 4]) cross(g, gx * P, gy * P, P, B5.x2F6B4F);
  }), 0, 0);
  // the diamond chain, kept off the words (a long word reaches nearer the border)
  const w = grow(wordsBox(e), 28);
  const dia = (ox: number, oy: number) => {
    const cells: [number, number, string][] = [];
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) if (Math.abs(i) + Math.abs(j) === 2) cells.push([ox + i, oy + j, B5.xA82A24]);
    cells.push([ox, oy, B5.xD9A23A]);
    if (cells.some(([x, y]) => x * P + P > w.x0 && x * P < w.x1 && y * P + P > w.y0 && y * P < w.y1)) return;
    cells.forEach(([x, y, col]) => cross(c, x * P, y * P, P, col));
  };
  // (stitched one diamond after another as the page opens, in the reading order of the border)
  const n = Math.floor(e.age / 0.05) + 1;
  let k = 0;
  for (let gx = 9; gx < GX - 7; gx += 8) { if (k++ < n) dia(gx, 8); if (k++ < n) dia(gx, GY - 9); }
  for (let gy = 16; gy < GY - 12; gy += 8) { if (k++ < n) dia(8, gy); if (k++ < n) dia(GX - 9, gy); }
  if (w.y1 + 60 < H - 160) caption(c, e, 960, Math.max(w.y1 + 80, 860), B5.x2F6B4F, 38);
  smallEnd();
});

/** d: a hoop on the wall, its clamp at the top; two columns of thread; the cut's time small beside them. */
const columns: HandGround = (e) => frame(e, (c) => {
  smallStart();
  const w = wordsBox(e);
  const [cx, cy] = [960, 540];
  const r = hoopFor(w, cx, cy, 470, 56);
  hooped(c, e, cx, cy, r, e.slots.plate, -Math.PI / 2);
  const t = cutTime(e);
  const tone = mixHex(e.slots.plateInk, e.slots.plate, 0.45);
  if (w.x1 + 170 < cx + r - 40) small(c, t, w.x1 + 40, cy - 40, 30, SANS, tone, 1, 'left');
  const d = openingData(e, '　');
  if (d && w.y1 + 60 < cy + r - 60) small(c, d, 960, w.y1 + 56, 28, SANS, tone, 1, 'center');
  smallEnd();
});

const Gs: Record<string, HandGround> = { 'embroidery/hoop': bigHoop, 'embroidery/hoop-low': lowHoop, 'embroidery/night': night, 'embroidery/sampler': sampler, 'embroidery/columns': columns };

const INS: Record<string, HandIn> = {
  // the hoop slides out to the left and the next cloth comes in behind it: the wall's edge and a rim sweep across, never over the words
  'hoop-swap': { sec: 0.45, draw: (e, q) => frame(e, (c) => {
    if (q >= 1) return;
    const x = W * (1 - ease(q, 2)) - 40;
    c.save();
    if (e.rect) outside(c, grow(wordsBox(e), 24));
    c.fillStyle = e.slots.ground;
    c.fillRect(x, 0, W - x + 40, H);
    c.fillStyle = B5.xC69A62;
    c.fillRect(x - 46, 0, 46, H);
    c.fillStyle = B5.xA97C47;
    c.fillRect(x - 6, 0, 6, H);
    c.fillStyle = B5.xE2BD86;
    c.fillRect(x - 44, 0, 4, H);
    c.restore();
  }) },
};

const PIECES: Record<string, Piece> = {
  // gold French knots tied one after another round the words, and they stay
  'knot-stars': { sec: 1.4, clear: 0, draw: (e, q) => frame(e, (c) => {
    const w = grow(wordsBox(e), 40);
    const R = rng(e.seed + 17);
    c.save();
    outside(c, w);
    const n = Math.floor(clamp01(q / 0.7) * 9);
    for (let i = 0; i < n; i++) {
      const a = R() * Math.PI * 2;
      const [x, y] = [(w.x0 + w.x1) / 2 + Math.cos(a) * ((w.x1 - w.x0) / 2 + 60 + R() * 120), (w.y0 + w.y1) / 2 + Math.sin(a) * ((w.y1 - w.y0) / 2 + 40 + R() * 90)];
      if (x > 60 && x < W - 60 && y > 50 && y < H - 50) knot(c, x, y, 5 + R() * 5, B5.xE3B758);
    }
    c.restore();
  }) },
  // three rows of running stitch run along under the words, a wave each, left to right
  'running-wave': { sec: 1.6, clear: 0, draw: (e, q) => frame(e, (c) => {
    const w = grow(wordsBox(e), 30);
    const y0 = w.y1 + 50 < H - 160 ? w.y1 + 50 : w.y0 - 150;
    if (y0 < 40) return;
    c.save();
    outside(c, w);
    for (let k = 0; k < 3; k++) {
      const pts: [number, number][] = [];
      for (let x = 160; x <= W - 160; x += 8) pts.push([x, y0 + k * 34 + Math.sin(x * 0.016 + k * 1.3) * 10]);
      running(c, pts, k % 2 ? B5.x7FA6CF : B5.xA9C6E3, 24, 13, 4.5, (W - 320) * 1.2 * ease(q / 0.8, 2));
    }
    c.restore();
  }) },
  // one thread is drawn along the cloth from the left under the words, its needle at the tip
  'thread-line': { sec: 1.3, clear: 0, draw: (e, q) => frame(e, (c) => {
    const w = grow(wordsBox(e), 30);
    const y = w.y1 + 36 < H - 60 ? w.y1 + 36 : w.y0 - 36;
    const k = ease(clamp01(q / 0.75), 2);
    const x1 = 120 + (W - 240) * k;
    const pts: [number, number][] = [];
    for (let x = 120; x <= x1; x += 10) pts.push([x, y + Math.sin(x * 0.01 + e.seed) * 6]);
    c.save();
    outside(c, w);
    running(c, pts, e.slots.accent, 20, 10, 4);
    if (q < 0.85 && pts.length) {
      const [nx, ny] = pts[pts.length - 1];
      c.strokeStyle = B5.x786C58;
      c.lineWidth = 3;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(nx, ny);
      c.lineTo(nx + 54, ny - 14);
      c.stroke();
    }
    c.restore();
  }) },
};

export const EMBROIDERY = { grounds: Gs, ins: INS, pieces: PIECES, objects: {} };
