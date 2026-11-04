// popart: a page of a sixties comic. Panels with thick ink gutters, three process colours and black on cream, shading
// as Ben-Day dots big enough to see, the words in a balloon, a caption box or a burst. Every colour is a printing plate:
// the black key goes on last and a hair off register.
import type { Piece } from './world-pieces';
import { atBase, boxOf, clamp01, ease, easeIn, fibred, flood, H, hash, HandGround, HandIn, isLight, kept, mixHex, ObjectPaint, span, TAU, trace, W, WorldEnv } from './world-craft';
import { burstPath, dotTile, hardShadow, stripeTile, tileGround } from './world-b3-shared';

const CW = W + 240;
const CH = H + 240;
const KEY = 14;
const key = (e: WorldEnv) => (isLight(e.paper) ? e.ink : e.slots.plateInk);
/** The sheet: cream stock with its fibres, or the dark scheme's black plate. */
const stock = (e: WorldEnv) => e.ctx.drawImage(fibred('pop', e.paper, mixHex(e.paper, e.ink, 0.5), 1400, CW, CH), -120, -120);
/** Ben-Day dots growing toward a corner: a field of them kept once per tone and corner. */
const dotField = (tone: string, corner: number, cell: number) => kept(`benday|${tone}|${corner}|${cell}`, CW, CH, (c) => {
  c.fillStyle = tone;
  const [cx, cy] = [corner % 2 ? CW : 0, corner < 2 ? 0 : CH];
  for (let y = 0, row = 0; y < CH + cell; y += cell * 0.5, row++)
    for (let x = row % 2 ? cell / 2 : 0; x < CW + cell; x += cell) {
      const d = Math.hypot(x - cx, y - cy) / Math.hypot(CW, CH);
      const r = cell * 0.46 * clamp01(1.15 - d * 1.6);
      if (r < 1) continue;
      c.beginPath();
      c.arc(x, y, r, 0, TAU);
      c.fill();
    }
});
/** The page's frame: a thick key-black border a little inside the edge. */
function border(e: WorldEnv) {
  atBase(e, (c) => { c.lineWidth = KEY; c.strokeStyle = key(e); c.strokeRect(KEY, KEY, W - KEY * 2, H - KEY * 2); });
}
/** Panels across the page: each tinted, gutters of stock between, ink lines round them. */
function panels(e: WorldEnv, n: number) {
  atBase(e, (c) => {
    const tints = [e.slots.faint, e.slots.accent, e.slots.ink2];
    const xs = Array.from({ length: n + 1 }, (_, i) => KEY + ((W - KEY * 2) * i) / n + (i && i < n ? (hash(i, e.seed) - 0.5) * 160 : 0));
    for (let i = 0; i < n; i++) {
      const t = tints[(i + e.seed) % 3];
      c.fillStyle = mixHex(e.paper, t, 0.34);
      c.fillRect(xs[i] + 6, KEY + 6, xs[i + 1] - xs[i] - 12, H - KEY * 2 - 12);
      c.save();
      c.beginPath();
      c.rect(xs[i] + 6, KEY + 6, xs[i + 1] - xs[i] - 12, H - KEY * 2 - 12);
      c.clip();
      c.globalAlpha = 0.5;
      c.drawImage(dotField(t, (i + e.seed) % 4, 30), -120, -120);
      c.restore();
      c.lineWidth = KEY * 0.7;
      c.strokeStyle = key(e);
      c.strokeRect(xs[i] + 6, KEY + 6, xs[i + 1] - xs[i] - 12, H - KEY * 2 - 12);
    }
  });
}
function speedLines(c: CanvasRenderingContext2D, cx: number, cy: number, tone: string, n: number, inner: number, outer: number, seed: number, k = 1) {
  c.save();
  c.fillStyle = tone;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + hash(i, seed) * 0.1;
    const r0 = inner * (0.8 + 0.5 * hash(i, seed + 1));
    const r1 = r0 + (outer - r0) * k * (0.6 + 0.4 * hash(i, seed + 2));
    const w = 0.004 + 0.012 * hash(i, seed + 3);
    trace(c, [[cx + Math.cos(a - w) * r1, cy + Math.sin(a - w) * r1], [cx + Math.cos(a + w) * r1, cy + Math.sin(a + w) * r1], [cx + Math.cos(a) * r0, cy + Math.sin(a) * r0]]);
    c.fill();
  }
  c.restore();
}

const Gs: Record<string, HandGround> = {
  'popart/plain-plate': (e) => { stock(e); e.ctx.globalAlpha = 0.5; e.ctx.drawImage(dotField(e.slots.faint, e.seed % 4, 34), -120, -120); e.ctx.globalAlpha = 1; border(e); },
  'popart/one-panel': (e) => { stock(e); e.ctx.globalAlpha = 0.35; e.ctx.drawImage(dotField(e.slots.accent, (e.seed + 2) % 4, 40), -120, -120); e.ctx.globalAlpha = 1; border(e); },
  'popart/benday-field': (e) => { stock(e); e.ctx.drawImage(dotField(e.slots.accent, (e.seed + 1) % 4, 44), -120, -120); border(e); },
  'popart/panel-grid': (e) => { stock(e); panels(e, 2 + (e.seed % 2)); },
  'popart/stripe-plate': (e) => { stock(e); tileGround(e.ctx, stripeTile(e.paper, mixHex(e.paper, e.slots.ink2, 0.3), 22), e.now * 30, 0, 0.9); border(e); },
  'popart/speedlines': (e) => { stock(e); const [cx, cy] = [W * (0.2 + 0.6 * hash(e.seed, 1)), H * (0.3 + 0.4 * hash(e.seed, 2))]; e.ctx.globalAlpha = 0.5; e.ctx.drawImage(dotField(e.slots.ink2, (e.seed + 3) % 4, 36), -120, -120); e.ctx.globalAlpha = 1; speedLines(e.ctx, cx, cy, key(e), 70, 420, 1600, e.seed); border(e); },
  // the peak: a burst in the second colour fills the page, dots and lines round it
  'popart/blast': (e) => {
    stock(e);
    const c = e.ctx;
    c.drawImage(dotField(e.slots.ink2, e.seed % 4, 44), -120, -120);
    hardShadow(c, key(e), 16, 16, () => { burstPath(c, W * 0.5, H * 0.5, 760 + 20 * Math.sin(e.now * 6), e.seed, 18); c.fill(); });
    c.fillStyle = e.slots.faint;
    burstPath(c, W * 0.5, H * 0.5, 760 + 20 * Math.sin(e.now * 6), e.seed, 18);
    c.fill();
    c.lineWidth = KEY;
    c.strokeStyle = key(e);
    c.stroke();
    speedLines(c, W * 0.5, H * 0.5, key(e), 40, 820, 1800, e.seed + 2);
    border(e);
  },
};

const INS: Record<string, HandIn> = {
  // the next panel slides over the last: stock with a key-black edge, then the picture is the new one
  'panel-flip': { sec: 0.26, draw: (e, q) => atBase(e, (c) => { const x = ease(q, 3) * (W + 40); c.fillStyle = e.paper; c.fillRect(x, -20, W + 60, H + 40); c.fillStyle = key(e); c.fillRect(x - KEY, -20, KEY, H + 40); }) },
};

const PIECES: Record<string, Piece> = {
  // the burst: it pops open past its size, snaps back, and stays a beat
  'pow-burst': { sec: 1.6, clear: 0.85, draw: (e, q) => {
    const c = e.ctx;
    const b = boxOf(e, 0, 0);
    const [cx, cy] = [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];
    const k = q < 0.2 ? ease(q / 0.2, 3) * (1 + 0.3 * Math.sin((q / 0.2) * Math.PI)) : q < 0.8 ? 1 : 1 - easeIn((q - 0.8) / 0.2, 2);
    const r = Math.max(b.x1 - b.x0, b.y1 - b.y0) * 0.75 * k + 120 * k;
    if (r < 2) return;
    hardShadow(c, key(e), 14, 14, () => { burstPath(c, cx, cy, r, e.seed, 16); c.fill(); });
    c.fillStyle = e.slots.faint;
    burstPath(c, cx, cy, r, e.seed, 16);
    c.fill();
    c.lineWidth = KEY * 0.8;
    c.strokeStyle = key(e);
    c.stroke();
    c.save();
    c.clip();
    c.globalAlpha = 0.5;
    c.drawImage(dotField(e.slots.ink2, 1, 28), -120, -120);
    c.restore();
  } },
  // the page turns a panel at a time: each is covered by stock in turn, left to right, and the next one shows
  'panel-turn': { sec: 2.0, clear: 0.6, draw: (e, q) => {
    const c = e.ctx;
    const n = 3;
    for (let i = 0; i < n; i++) {
      const k = clamp01((q - i * 0.22) / 0.34);
      const [x0, x1] = [(W * i) / n, (W * (i + 1)) / n];
      const cover = (x1 - x0) * Math.sin(k * Math.PI);
      c.fillStyle = e.paper;
      c.fillRect(x0, -10, cover, H + 20);
      c.fillStyle = key(e);
      c.fillRect(x0 + cover - KEY * 0.6, -10, KEY * 0.6, H + 20);
    }
  } },
  // the dots grow out from the middle until the page is all tone, then fall back
  'dot-flood': { sec: 2.0, clear: 0.7, draw: (e, q) => {
    const c = e.ctx;
    const b = boxOf(e, 0, 0);
    const [cx, cy] = [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];
    const reach = (q < 0.55 ? ease(q / 0.55, 2) : 1 - easeIn((q - 0.55) / 0.45, 2)) * 1500;
    const cell = 48;
    c.fillStyle = e.slots.ink2;
    for (let y = 0, row = 0; y < H + cell; y += cell * 0.5, row++)
      for (let x = row % 2 ? cell / 2 : 0; x < W + cell; x += cell) {
        const d = Math.hypot(x - cx, y - cy);
        const r = cell * 0.48 * clamp01((reach - d) / 500);
        if (r < 1) continue;
        c.beginPath();
        c.arc(x, y, r, 0, TAU);
        c.fill();
      }
  } },
  // the speed lines come in from the edge and reach for the words
  'speed-rush': { sec: 1.6, clear: 0.8, draw: (e, q) => {
    const b = boxOf(e, 0, 0);
    const k = span(q, 0.4, 0.75);
    speedLines(e.ctx, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, key(e), 90, Math.max(b.x1 - b.x0, b.y1 - b.y0) * 0.6 + 60, 1900, e.seed + 4, k);
  } },
};

/** A speech balloon: white, a key-black line, a tail toward the singer, the shadow printed hard. */
const speechBalloon: ObjectPaint = (c, w, h, s, seed, look) => {
  const k = isLight(s.plate) ? s.plateInk : s.ink;
  const r = Math.min(w, h) * 0.3;
  const tail = (g: OffscreenCanvasRenderingContext2D) => { const x = w * (look % 2 ? 0.72 : 0.22); g.beginPath(); g.moveTo(x - 36, h - 4); g.lineTo(x + 30, h - 4); g.lineTo(x + (look % 2 ? 90 : -70), h + 70); g.closePath(); g.fill(); };
  hardShadow(c, k, 12, 12, () => { c.beginPath(); c.roundRect(0, 0, w, h, r); c.fill(); tail(c); });
  c.fillStyle = s.plate;
  c.beginPath();
  c.roundRect(0, 0, w, h, r);
  c.fill();
  c.strokeStyle = k;
  c.lineWidth = 8;
  c.stroke();
  c.fillStyle = s.plate;
  tail(c);
  c.strokeStyle = k;
  c.lineWidth = 8;
  c.lineJoin = 'round';
  const x = w * (look % 2 ? 0.72 : 0.22);
  c.beginPath();
  c.moveTo(x - 36, h - 2);
  c.lineTo(x + (look % 2 ? 90 : -70), h + 70);
  c.lineTo(x + 30, h - 2);
  c.stroke();
  void seed;
};
/** The burst the shouted word sits in: the loud plate colour, a key line, printed hard. */
const powPlate: ObjectPaint = (c, w, h, s, seed) => {
  const k = isLight(s.plate) ? s.plateInk : s.ink;
  const [cx, cy, r] = [w / 2, h / 2, Math.hypot(w, h) * 0.52];
  hardShadow(c, k, 14, 14, () => { burstPath(c, cx, cy, r, seed, 16, 0.66); c.fill(); });
  c.fillStyle = isLight(s.faint) ? s.faint : s.plate;
  burstPath(c, cx, cy, r, seed, 16, 0.66);
  c.fill();
  c.lineWidth = 9;
  c.strokeStyle = k;
  c.stroke();
};
/** The narrator's caption: a flat box in the loud plate colour with the key line, top left of the panel. */
const captionBox: ObjectPaint = (c, w, h, s) => {
  const k = isLight(s.plate) ? s.plateInk : s.ink;
  hardShadow(c, k, 10, 10, () => c.fillRect(0, 0, w, h));
  c.fillStyle = s.plate;
  c.fillRect(0, 0, w, h);
  c.lineWidth = 7;
  c.strokeStyle = k;
  c.strokeRect(0, 0, w, h);
};
export const POPART = { grounds: Gs, ins: INS, pieces: PIECES, objects: { 'speech-balloon': speechBalloon, 'pow-plate': powPlate, 'caption-box': captionBox } as Record<string, ObjectPaint> };
void flood; void dotTile;
