// y2k: the year two thousand as it was sold. A saturated pearl gradient, soap bubbles going up, a few chrome stars (never
// more than three), translucent plastic with a highlight arc, glints that come and go. The words are chrome stickers and
// the labels of glossy windows. Bright, shiny, round; no black ground, no grid, no nostalgia.
import type { Piece } from './world-pieces';
import { atBase, clamp01, ease, easeIn, flood, H, hash, HandGround, HandIn, kept, mixHex, ObjectPaint, span, TAU, W, WorldEnv } from './world-craft';
import { roomBehind, starPath } from './world-b3-legacy';

type C = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
const CW = W + 240;
const CH = H + 240;
/** The pearl gradient: the ground tone to the faint one, diagonally, with a soft lighter band through it. */
const pearl = (e: WorldEnv) => kept(`pearl|${e.paper}|${e.slots.faint}`, CW, CH, (c) => {
  const g = c.createLinearGradient(0, 0, CW, CH);
  g.addColorStop(0, e.paper);
  g.addColorStop(0.48, mixHex(e.paper, e.slots.faint, 0.55));
  g.addColorStop(0.56, mixHex(e.paper, e.slots.faint, 0.7));
  g.addColorStop(1, e.slots.faint);
  c.fillStyle = g;
  c.fillRect(0, 0, CW, CH);
  const img = c.getImageData(0, 0, CW, CH);
  for (let i = 0; i < img.data.length; i += 4) { const n = (hash(i, 0.3) - 0.5) * 5; img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n; }
  c.putImageData(img, 0, 0);
});
/** Chrome: the reflection band through a shape, then a light lip and a dark lip. Call with the path already set. */
function chromeFill(c: C, x0: number, y0: number, x1: number, y1: number, tone: string, dark: string) {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, tone);
  g.addColorStop(0.38, mixHex(tone, dark, 0.25));
  g.addColorStop(0.5, dark);
  g.addColorStop(0.6, mixHex(tone, dark, 0.3));
  g.addColorStop(1, tone);
  c.fillStyle = g;
  c.fill();
  c.lineWidth = 3;
  c.strokeStyle = tone;
  c.stroke();
}
/** A soap bubble: a thin rim, a highlight arc, a faint second colour low on one side. */
function bubble(c: C, x: number, y: number, r: number, rim: string, tint: string, a = 1) {
  c.save();
  c.globalAlpha = a;
  c.lineWidth = Math.max(1.2, r * 0.03);
  c.strokeStyle = rim;
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
  c.stroke();
  c.globalAlpha = a * 0.22;
  c.fillStyle = tint;
  c.beginPath();
  c.arc(x, y, r, 0.3, 2.2);
  c.lineTo(x, y);
  c.fill();
  c.globalAlpha = a;
  c.lineWidth = Math.max(2, r * 0.06);
  c.lineCap = 'round';
  c.strokeStyle = rim;
  c.beginPath();
  c.arc(x, y, r * 0.78, -2.4, -1.5);
  c.stroke();
  c.restore();
}
/** A glint: four thin arms, bright at the middle. */
function glint(c: C, x: number, y: number, r: number, tone: string, a: number) {
  c.save();
  c.globalAlpha = a;
  c.fillStyle = tone;
  starPath(c, x, y, r, r * 0.08, 0, 4);
  c.fill();
  c.globalAlpha = a * 0.6;
  starPath(c, x, y, r * 0.5, r * 0.06, Math.PI / 4, 4);
  c.fill();
  c.restore();
}
/** A translucent plastic blob with the highlight arc of a capsule. */
function plastic(c: C, x: number, y: number, w: number, h: number, tone: string, rim: string, a = 0.7) {
  c.save();
  c.globalAlpha = a;
  c.fillStyle = tone;
  c.beginPath();
  c.ellipse(x, y, w, h, 0, 0, TAU);
  c.fill();
  c.globalAlpha = a * 0.9;
  c.fillStyle = rim;
  c.beginPath();
  c.ellipse(x - w * 0.1, y - h * 0.46, w * 0.52, h * 0.24, 0, 0, TAU);
  c.fill();
  c.restore();
}
const base = (e: WorldEnv) => e.ctx.drawImage(pearl(e), -120, -120);
const glints = (e: WorldEnv, n: number) => { for (let i = 0; i < n; i++) { const t = 0.5 + 0.5 * Math.sin(e.now * (1.3 + hash(i, 2)) + i * 2); if (t < 0.5) continue; glint(e.ctx, hash(i, e.seed) * W, hash(i, e.seed + 1) * H, 26 + 60 * hash(i, 3) * (t - 0.5) * 2, e.slots.plate, (t - 0.5) * 2); } };
const rising = (e: WorldEnv, n: number, a = 1) => { for (let i = 0; i < n; i++) { const v = (hash(i, e.seed) + e.now * (0.02 + 0.05 * hash(i, 1))) % 1; const r = 18 + 90 * hash(i, 2); bubble(e.ctx, hash(i, e.seed + 2) * W + 40 * Math.sin(e.now + i), H * 1.1 - v * H * 1.3, r, e.slots.plate, e.slots.accent, a * (0.5 + 0.5 * hash(i, 3))); } };
const chromeStar = (c: C, x: number, y: number, r: number, rot: number, tone: string, dark: string) => { starPath(c, x, y, r, r * 0.5, rot); chromeFill(c, x - r, y - r, x + r * 0.6, y + r, tone, dark); glint(c, x - r * 0.3, y - r * 0.3, r * 0.5, tone, 0.9); };
const keep = (e: WorldEnv) => roomBehind(e, e.paper, 0.75, 130, 90);

const Gs: Record<string, HandGround> = {
  'y2k/gradient-sky': (e) => { base(e); glints(e, 5); keep(e); },
  'y2k/one-bubble': (e) => { base(e); bubble(e.ctx, W * (0.2 + 0.6 * hash(e.seed, 4)), H * 0.5 + 20 * Math.sin(e.now), 300, e.slots.plate, e.slots.accent, 0.9); keep(e); },
  'y2k/bubbles': (e) => { base(e); rising(e, 26); glints(e, 4); keep(e); },
  'y2k/chrome-stars': (e) => { base(e); const c = e.ctx; for (let i = 0; i < 3; i++) chromeStar(c, W * (0.15 + 0.35 * i) + 30 * Math.sin(e.now * 0.7 + i), H * (0.25 + 0.5 * hash(i, e.seed)) + 14 * Math.sin(e.now + i * 2), 90 + 70 * hash(i, e.seed + 1), e.now * 0.3 + i, e.slots.plate, e.slots.ink2); keep(e); },
  'y2k/plastic-blobs': (e) => { base(e); for (let i = 0; i < 6; i++) plastic(e.ctx, hash(i, e.seed) * W, hash(i, e.seed + 1) * H + 12 * Math.sin(e.now * 0.8 + i), 120 + 160 * hash(i, 2), 80 + 100 * hash(i, 3), [e.slots.accent, e.slots.plate][i % 2], e.slots.plate, 0.55); glints(e, 3); keep(e); },
  'y2k/sparkle-field': (e) => { base(e); rising(e, 16, 0.7); glints(e, 18); keep(e); },
  // the peak: a chrome star the size of the frame with glints at its points
  'y2k/star-blast': (e) => { base(e); const c = e.ctx; chromeStar(c, W * 0.5, H * 0.5, 720, e.now * 0.2, e.slots.plate, e.slots.ink2); for (let i = 0; i < 5; i++) glint(c, W * 0.5 + Math.cos(-Math.PI / 2 + e.now * 0.2 + (i * TAU) / 5) * 720, H * 0.5 + Math.sin(-Math.PI / 2 + e.now * 0.2 + (i * TAU) / 5) * 720, 90, e.slots.plate, 0.8 + 0.2 * Math.sin(e.now * 5 + i)); rising(e, 12, 0.6); keep(e); },
};

const INS: Record<string, HandIn> = {
  // a chrome disc shrinks away from the middle and the new picture is behind it
  'chrome-iris': { sec: 0.3, draw: (e, q) => atBase(e, (c) => { const r = (1 - ease(q, 2)) * 900; if (r < 2) return; c.beginPath(); c.arc(W / 2, H / 2, r, 0, TAU); chromeFill(c, W / 2 - r, H / 2 - r, W / 2 + r * 0.6, H / 2 + r, e.slots.plate, mixHex(e.slots.plate, e.slots.ink2, 0.5)); }) },
};

const PIECES: Record<string, Piece> = {
  // a chrome star blooms from the middle, overshoots, and shrinks to a glint
  'star-flare': { sec: 1.6, clear: 0.85, draw: (e, q) => {
    const c = e.ctx;
    const k = q < 0.3 ? ease(q / 0.3, 3) * (1 + 0.25 * Math.sin((q / 0.3) * Math.PI)) : q < 0.7 ? 1 : 1 - easeIn((q - 0.7) / 0.3, 2);
    const r = 620 * k;
    if (r > 4) chromeStar(c, W / 2, H / 2, r, q * 1.2, e.slots.plate, e.slots.ink2);
    glint(c, W / 2, H / 2, 160 * (1 - k) + 120 * k, e.slots.plate, 0.9);
  } },
  // bubbles pour up from the bottom all at once
  'bubble-storm': { sec: 2.2, clear: 0.6, draw: (e, q) => { for (let i = 0; i < 60; i++) { const t = clamp01(q * 1.5 - 0.5 * hash(i, e.seed)); if (t <= 0) continue; const r = 14 + 80 * hash(i, 2); bubble(e.ctx, hash(i, e.seed + 2) * W + 60 * Math.sin(t * 5 + i), H * 1.1 - t * H * 1.4, r, e.slots.plate, e.slots.accent, 1 - easeIn(t, 3)); } } },
  // glossy windows open one after another, each a plate of plastic, and shrink away
  'window-cascade': { sec: 2.0, clear: 0.75, draw: (e, q) => {
    const c = e.ctx;
    for (let i = 0; i < 5; i++) {
      const k = clamp01((q - i * 0.1) / 0.3);
      const out = easeIn((q - 0.7) / 0.3, 2);
      const s = ease(k, 3) * (1 - out);
      if (s <= 0) continue;
      const [x, y, w, h] = [W * (0.12 + 0.16 * i), H * (0.18 + 0.1 * (i % 3)), 360 * s, 220 * s];
      c.save();
      c.globalAlpha = 0.8;
      c.fillStyle = e.slots.plate;
      c.beginPath();
      c.roundRect(x, y, w, h, 28 * s);
      c.fill();
      c.globalAlpha = 0.9;
      c.fillStyle = e.slots.accent;
      c.beginPath();
      c.roundRect(x, y, w, 36 * s, [28 * s, 28 * s, 0, 0]);
      c.fill();
      c.restore();
      glint(c, x + w - 30 * s, y + 18 * s, 30 * s, e.slots.plate, 0.9);
    }
  } },
  // a glint band crosses the whole picture corner to corner, the way light runs over a sticker
  'glint-sweep': { sec: 1.4, clear: 0.4, draw: (e, q) => {
    const c = e.ctx;
    const x = -600 + ease(q, 1.2) * (W + 1200);
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = 0.6 * span(q, 0.2, 0.8);
    const g = c.createLinearGradient(x - 220, 0, x + 220, 0);
    g.addColorStop(0, `${e.slots.plate}00`);
    g.addColorStop(0.5, e.slots.plate);
    g.addColorStop(1, `${e.slots.plate}00`);
    c.fillStyle = g;
    c.transform(1, 0, -0.5, 1, 0, 0);
    c.fillRect(x - 220, -10, 440, H + 20);
    c.restore();
    for (let i = 0; i < 4; i++) glint(c, x - 300 + hash(i, e.seed) * 500, hash(i, e.seed + 1) * H, 50 + 50 * hash(i, 2), e.slots.plate, span(q, 0.2, 0.8) * 0.9);
  } },
};

/** A glossy window: translucent plastic, a colour bar along the top, a highlight arc, a chrome bead at one corner. */
const glassWindow: ObjectPaint = (c, w, h, s, seed, look) => {
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.25)';
  c.shadowBlur = 30;
  c.shadowOffsetY = 12;
  c.globalAlpha = 0.86;
  c.fillStyle = s.plate;
  c.beginPath();
  c.roundRect(0, 0, w, h, 34);
  c.fill();
  c.restore();
  c.save();
  c.beginPath();
  c.roundRect(0, 0, w, h, 34);
  c.clip();
  c.fillStyle = s.accent;
  c.fillRect(0, 0, w, 40 + 10 * look);
  c.globalAlpha = 0.5;
  c.fillStyle = s.plate;
  c.beginPath();
  c.ellipse(w * 0.5, h * 0.18, w * 0.46, h * 0.1, 0, 0, TAU);
  c.fill();
  c.restore();
  c.beginPath();
  c.arc(w - 24, 24 + 5 * look, 16, 0, TAU);
  chromeFill(c, w - 40, 8, w - 8, 40, s.plate, s.plateInk);
  void seed;
};
/** A chrome sticker: a rounded plate with a chrome rim and a white centre, one glint. */
const chromeSticker: ObjectPaint = (c, w, h, s, seed, look) => {
  c.beginPath();
  c.roundRect(-14, -14, w + 28, h + 28, 44);
  chromeFill(c, -14, -14, w * 0.7, h + 14, s.plate, s.plateInk);
  c.fillStyle = s.plate;
  c.beginPath();
  c.roundRect(2, 2, w - 4, h - 4, 32);
  c.fill();
  glint(c, look % 2 ? 10 : w - 10, 6, 36, s.plate, 1);
  void seed;
};
export const Y2K = { grounds: Gs, ins: INS, pieces: PIECES, objects: { 'glass-window': glassWindow, 'chrome-sticker': chromeSticker } as Record<string, ObjectPaint> };
void flood;
