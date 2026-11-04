// y2k, redrawn from its board (2026-11-04, 風格第3批設計稿/y2k a–d): the title of a CD single sleeve around 2000. Vector
// crescent blades in hard-edged gradients, thin orbit lines (one dashed), four-point sparkles in a white-lime-aqua
// gradient, a 48 px dot grid on the ice sheet; the night sleeves are navy gradients. No glow, no scanlines, no chrome
// blobs: the vectors are the material. A ground follows its scheme's band, so a night scheme prints the same sleeve dark.
import type { Piece } from './world-pieces';
import { clamp01, ease, easeIn, fract, H, HandGround, HandIn, isLight, kept, mixHex, W, WorldEnv } from './world-craft';
import { artistOf, C, label, sparklePath, titleOnly } from './world-b3-shared';
import { B3 } from './b3-inks';

const AQUA = B3.x5FE0D3;
const PERI = B3.x7C8CFF;
const LILAC = B3.xC4A8FF;
const LIME = B3.xD6FF4F;
const SILVER = B3.xB9C3DA;
const ORBIT_NIGHT = B3.xBFC8FF;
const MICRO = (px: number) => `400 ${px}px Michroma, "Noto Sans TC", "Zen Kaku Gothic New", sans-serif`;

const night = (e: WorldEnv) => !isLight(e.paper);
/** The line colour of orbits and keylines: navy on ice, pale periwinkle at night. */
const lineTone = (e: WorldEnv) => (night(e) ? ORBIT_NIGHT : e.ink);

/** A crescent blade between two tips: an outer and an inner quadratic arc, bulging `b1` and `b2` px off the chord. */
function blade(c: C, x1: number, y1: number, x2: number, y2: number, b1: number, b2: number) {
  const [mx, my, dx, dy] = [(x1 + x2) / 2, (y1 + y2) / 2, x2 - x1, y2 - y1];
  const L = Math.max(1, Math.hypot(dx, dy));
  const [nx, ny] = [-dy / L, dx / L];
  c.beginPath();
  c.moveTo(x1, y1);
  c.quadraticCurveTo(mx + nx * b1, my + ny * b1, x2, y2);
  c.quadraticCurveTo(mx + nx * b2, my + ny * b2, x1, y1);
  c.closePath();
}
/** A gradient across a box whose stops slide by `slide` (0..1) and wrap: the coating turning. Hard-edged shapes carry it. */
function sheen(c: C, x0: number, y0: number, x1: number, y1: number, stops: string[], slide = 0) {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  const n = stops.length;
  if (!slide) { stops.forEach((s, i) => g.addColorStop(i / (n - 1), s)); return g; }
  // the stops travel along the axis; the end colours are mixed so the band wraps without a seam
  for (let i = 0; i <= n; i++) {
    const at = fract(i / n + slide);
    g.addColorStop(at, stops[i % n]);
  }
  g.addColorStop(0, mixHex(stops[0], stops[n - 1], 0.5));
  g.addColorStop(1, mixHex(stops[0], stops[n - 1], 0.5));
  return g;
}
/** The four-point sparkle: white through lime to aqua with a navy keyline on ice; white to periwinkle at night. */
function spark(c: C, e: WorldEnv, x: number, y: number, r: number, rot = 0) {
  if (r < 1) return;
  sparklePath(c, x, y, r, rot);
  const g = c.createLinearGradient(x - r, y - r, x + r, y + r);
  g.addColorStop(0, B3.xFFFFFF);
  if (night(e)) g.addColorStop(1, ORBIT_NIGHT);
  else { g.addColorStop(0.5, LIME); g.addColorStop(1, AQUA); }
  c.fillStyle = g;
  c.fill();
  if (!night(e)) { c.lineWidth = 2; c.strokeStyle = e.ink; c.stroke(); }
}
/** The board's sparkle motion: on each beat it swells a little and turns 45°. */
const beatSpark = (e: WorldEnv, i: number): [number, number] => { const k = Math.exp(-fract(e.now * 2 + i * 0.25) * 5); return [1 + 0.16 * k, (Math.PI / 4) * k]; };

/** The sheet: ice with the 48 px dot grid, or the night gradient. Kept per scheme. */
const sheet = (e: WorldEnv, angle: number) => kept(`y2k-sheet|${e.paper}|${e.ink}|${angle}`, W, H, (c) => {
  if (night(e)) {
    const a = (angle * Math.PI) / 180;
    const g = c.createLinearGradient(W / 2 - Math.sin(a) * 700, H / 2 + Math.cos(a) * 700, W / 2 + Math.sin(a) * 700, H / 2 - Math.cos(a) * 700);
    g.addColorStop(0, mixHex(e.paper, B3.x000000, 0.42));
    g.addColorStop(0.7, e.paper);
    g.addColorStop(1, mixHex(e.paper, PERI, 0.32));
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    return;
  }
  c.fillStyle = e.paper;
  c.fillRect(0, 0, W, H);
  c.fillStyle = e.ink;
  c.globalAlpha = 0.18;
  for (let x = 48; x < W; x += 48) for (let y = 48; y < H; y += 48) c.fillRect(x - 1, y - 1, 2, 2);
  c.globalAlpha = 1;
});
/** Draws in frame coordinates (the sleeve does not slide). */
const page = (e: WorldEnv, f: (c: CanvasRenderingContext2D) => void) => { const c = e.ctx; c.save(); if (e.base) c.setTransform(e.base); f(c); c.restore(); };
/** An ellipse outline, turned, optionally dashed and flowing. */
function orbit(c: C, x: number, y: number, rx: number, ry: number, rot: number, tone: string, w: number, dash?: [number, number], flow = 0) {
  if (rx < 1 || ry < 1) return;
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  c.beginPath();
  c.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  c.lineWidth = w;
  c.strokeStyle = tone;
  if (dash) { c.setLineDash(dash); c.lineDashOffset = -flow; }
  c.stroke();
  c.restore();
}
/** The small Michroma label (real data only: the song's title, its artist). */
const micro = (c: C, e: WorldEnv, text: string, x: number, y: number, px = 17, align: 'left' | 'right' = 'left') => label(c, text, x, y, MICRO(px), night(e) ? ORBIT_NIGHT : e.ink, px * 0.32, align);
/** A blade sweeping in along its own arc at a cut's start: 0..1 over 0.7 s. */
const swept = (e: WorldEnv, delay = 0) => ease(clamp01((e.age - delay) / 0.7), 3);

/** a: the hook. Two crescent blades cut in from the lower right, an orbit round them, three sparkles; the title up left. */
const hook: HandGround = (e) => page(e, (c) => {
  c.drawImage(sheet(e, 160), 0, 0);
  const k = swept(e);
  const slide = fract(e.now * 0.05);
  const tip = (x: number, y: number, x0: number, y0: number) => [x0 + (x - x0) * k, y0 + (y - y0) * k] as const;
  const [ax, ay] = tip(2080, 40, 980, 1180);
  blade(c, 980, 1180, ax, ay, -520 * k, -300 * k);
  c.fillStyle = sheen(c, 980, 1180, 2080, 40, [AQUA, PERI, LILAC], slide);
  c.fill();
  c.lineWidth = 2;
  c.strokeStyle = lineTone(e);
  c.stroke();
  const [bx, by] = tip(2080, 240, 1140, 1180);
  blade(c, 1140, 1180, bx, by, -360 * k, -250 * k);
  c.fillStyle = sheen(c, 1140, 1180, 2080, 240, [B3.xFFFFFF, SILVER]);
  c.fill();
  orbit(c, 1500, 560, 420, 120, -0.489, lineTone(e), 1.6);
  orbit(c, 1500, 560, 300, 70, -0.489, lineTone(e), 1.2, [2, 9], e.now * 30);
  [[1590, 300, 92], [1260, 840, 46], [1760, 700, 30]].forEach(([x, y, r], i) => { const [s, rot] = beatSpark(e, i); spark(c, e, x, y, r * s, rot); });
  micro(c, e, titleOnly(e.title), 150, 135);
  const who = artistOf(e.title);
  if (who) {
    c.font = MICRO(15);
    const w = c.measureText(who).width + who.length * 4.8 + 44;
    c.beginPath();
    c.roundRect(W - 150 - w, 104, w, 38, 19);
    c.lineWidth = 2;
    c.strokeStyle = lineTone(e);
    c.stroke();
    micro(c, e, who, W - 150 - w + 22, 129, 15);
  }
});

/** b: night sleeve. An iridescent ring low right with thin circles and a turned orbit; the line on the left. */
const ring: HandGround = (e) => page(e, (c) => {
  c.drawImage(sheet(e, 160), 0, 0);
  const [cx, cy] = [1500, 540];
  const grow = swept(e);
  c.beginPath();
  c.arc(cx, cy, 430, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * grow);
  c.lineWidth = 64;
  c.strokeStyle = sheen(c, cx - 430, cy - 430, cx + 430, cy + 430, [AQUA, PERI, LILAC, B3.xFFFFFF], fract(e.now * 0.04));
  c.stroke();
  orbit(c, cx, cy, 340, 340, 0, lineTone(e), 1.5);
  orbit(c, cx, cy, 520, 520, 0, lineTone(e), 1.5, [2, 10], e.now * 24);
  orbit(c, cx, cy, 700, 150, -0.244, lineTone(e), 1.5);
  [[1500, 540, 64], [1760, 190, 26], [1080, 170, 18], [1230, 880, 22], [880, 760, 12], [1820, 900, 14]].forEach(([x, y, r], i) => { const [s, rot] = beatSpark(e, i); spark(c, e, x, y, r * s, rot); });
  const r = e.rect;
  if (r) micro(c, e, titleOnly(e.title), r.x0 + 6, r.y0 - 44);
});

/** c: the fan. Gradient blades open from the lower right corner, one a beat; sparkles and an orbit up top. */
const fan: HandGround = (e) => page(e, (c) => {
  c.drawImage(sheet(e, 180), 0, 0);
  const stops = [[AQUA, PERI], [LILAC, B3.xFFFFFF], [PERI, LILAC], [B3.xFFFFFF, AQUA]];
  const [cx, cy, n] = [1980, 1160, 11];
  const open = Math.min(n, Math.floor(e.age * 4) + 1);
  for (let i = 0; i < open; i++) {
    const a0 = Math.PI * (1.02 + i * 0.047);
    const L = 1250 - i * 28;
    const [x2, y2] = [cx + Math.cos(a0) * L, cy + Math.sin(a0) * L];
    blade(c, cx, cy, x2, y2, -120 - i * 4, -30);
    c.fillStyle = sheen(c, cx, cy, x2, y2, stops[i % 4]);
    c.fill();
    c.lineWidth = 2;
    c.strokeStyle = night(e) ? mixHex(e.paper, B3.x000000, 0.45) : e.ink;
    c.stroke();
  }
  [[1180, 180, 46], [760, 150, 22], [1500, 120, 18]].forEach(([x, y, r], i) => { const [s, rot] = beatSpark(e, i); spark(c, e, x, y, r * s, rot); });
  orbit(c, 1180, 180, 160, 36, -0.21, lineTone(e), 1.5);
  const r = e.rect;
  if (r) micro(c, e, titleOnly(e.title), r.x0 + 8, Math.min(H - 80, r.y1 + 90));
});

/** d: a tall blade down the left, sparkles, the lines as columns on the right with a turned Michroma label beside them. */
const column: HandGround = (e) => page(e, (c) => {
  c.drawImage(sheet(e, 160), 0, 0);
  const k = swept(e);
  blade(c, 620, -80, 620, -80 + 1240 * k, -560 * k, -260 * k);
  c.fillStyle = sheen(c, 0, -80, 0, 1160, [LILAC, PERI, AQUA], fract(e.now * 0.05));
  c.fill();
  c.lineWidth = 2;
  c.strokeStyle = lineTone(e);
  c.stroke();
  blade(c, 700, -80, 700, -80 + 1240 * k, -250 * k, -110 * k);
  c.fillStyle = sheen(c, 500, -80, 700, 1160, [B3.xFFFFFF, SILVER]);
  c.fill();
  [[1600, 820, 70], [1720, 640, 28], [300, 240, 34]].forEach(([x, y, r], i) => { const [s, rot] = beatSpark(e, i); spark(c, e, x, y, r * s, rot); });
  orbit(c, 1600, 820, 190, 44, -0.349, lineTone(e), 1.5);
  const r = e.rect;
  if (r) {
    c.save();
    c.translate(Math.min(W - 60, r.x1 + 70), r.y0 + 4);
    c.rotate(Math.PI / 2);
    micro(c, e, titleOnly(e.title), 0, 0, 15);
    c.restore();
  }
});

const Gs: Record<string, HandGround> = { 'y2k/hook': hook, 'y2k/ring': ring, 'y2k/fan': fan, 'y2k/column': column };

const INS: Record<string, HandIn> = {
  // the next sleeve is cut in by one blade sweeping across from the lower right, its gradient leading
  'blade-wipe': { sec: 0.42, draw: (e, q) => page(e, (c) => {
    const x = W * 1.3 - ease(q, 3) * (W * 1.9);
    blade(c, x + 600, H + 200, x + 1400, -200, -700, 700);
    c.fillStyle = sheen(c, x, H, x + 1400, 0, [AQUA, PERI, LILAC]);
    c.fill();
  }) },
};

/** The lyric box with a margin: a piece keeps out of it. */
const keepOut = (e: WorldEnv, m: number) => { const r = e.rect ?? { x0: W * 0.3, y0: H * 0.35, x1: W * 0.7, y1: H * 0.65 }; return { x0: r.x0 - m, y0: r.y0 - m, x1: r.x1 + m, y1: r.y1 + m }; };
const outside = (b: { x0: number; y0: number; x1: number; y1: number }, x: number, y: number, r: number) => x + r < b.x0 || x - r > b.x1 || y + r < b.y0 || y - r > b.y1;

const PIECES: Record<string, Piece> = {
  // sparkles pop on the beat across the free part of the sleeve, each turning 45° as it lands
  'spark-burst': { sec: 1.6, clear: 0, draw: (e, q) => page(e, (c) => {
    const b = keepOut(e, 40);
    for (let i = 0; i < 14; i++) {
      const [x, y] = [120 + fract(Math.sin(i * 91.7 + e.seed) * 999) * (W - 240), 100 + fract(Math.sin(i * 37.3 + e.seed) * 999) * (H - 200)];
      const r = 14 + 40 * fract(i * 0.618 + e.seed * 0.1);
      const k = clamp01((q - i * 0.05) / 0.2) * (1 - easeIn((q - 0.7) / 0.3, 2));
      if (k <= 0 || !outside(b, x, y, r)) continue;
      spark(c, e, x, y, r * k, (Math.PI / 4) * k);
    }
  }) },
  // one long blade sweeps across the bottom of the sleeve along its arc, under the words
  'blade-sweep': { sec: 1.4, clear: 0, draw: (e, q) => page(e, (c) => {
    const x0 = -900 + ease(q, 2) * (W + 1200);
    blade(c, x0, H + 60, x0 + 900, H - 260, -160, -60);
    c.fillStyle = sheen(c, x0, H, x0 + 900, H - 260, [AQUA, PERI, LILAC]);
    c.fill();
    c.lineWidth = 2;
    c.strokeStyle = lineTone(e);
    c.stroke();
  }) },
  // the dashed orbit runs fast round a sparkle in a free corner
  'orbit-flow': { sec: 2, clear: 0, draw: (e, q) => page(e, (c) => {
    const b = keepOut(e, 60);
    const corners: [number, number][] = [[W - 300, 220], [300, H - 220], [W - 300, H - 220], [300, 220]];
    const [x, y] = corners.find(([cx, cy]) => outside(b, cx, cy, 240)) ?? corners[0];
    const k = Math.sin(clamp01(q) * Math.PI);
    orbit(c, x, y, 230 * k, 56 * k, -0.3, lineTone(e), 1.6, [2, 9], q * 600);
    spark(c, e, x, y, 40 * k, q * Math.PI);
  }) },
};

export const Y2K = { grounds: Gs, ins: INS, pieces: PIECES, objects: {} };
