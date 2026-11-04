// woodcut: a block being cut while the song runs. Ink is the block, white is only what the knife took out, and a hand can only
// cut so many gouges: the fields hold still a few frames, then the next state of the block replaces them, as a cut animation
// would. Every gouge is a tapered wedge following the form. The one extra colour is a second block printed on the white.
import type { Piece } from './world-pieces';
import { atBase, boxOf, clamp01, ease, easeIn, fibred, flood, H, hash, HandGround, HandIn, isLight, kept, lifted, mixHex, ObjectPaint, Pt, TAU, trace, W, WorldEnv } from './world-craft';
import { smoothNoise } from './world-ink';

type G = OffscreenCanvasRenderingContext2D;
const CW = W + 240;
const CH = H + 240;
/** One cut: a wedge, sharp where the blade enters. */
const gouge = (c: G | CanvasRenderingContext2D, x: number, y: number, a: number, l: number, w: number) => { c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + Math.cos(a + 0.24) * l * 0.55, y + Math.sin(a + 0.24) * l * 0.55, x + Math.cos(a) * l, y + Math.sin(a) * l); c.lineTo(x + Math.cos(a) * l + Math.cos(a + 1.57) * w * 0.3, y + Math.sin(a) * l + Math.sin(a + 1.57) * w * 0.3); c.quadraticCurveTo(x + Math.cos(a - 0.2) * l * 0.5 + Math.cos(a + 1.57) * w, y + Math.sin(a - 0.2) * l * 0.5 + Math.sin(a + 1.57) * w, x, y); c.fill(); };
/** The block: ink with its wood grain lifting faintly through. */
const block = (e: WorldEnv) => kept(`wc-b|${e.paper}|${e.ink}`, CW, CH, (c) => {
  c.fillStyle = e.paper;
  c.fillRect(0, 0, CW, CH);
  c.strokeStyle = e.ink;
  c.lineCap = 'round';
  for (let i = 0; i < 300; i++) {
    c.globalAlpha = 0.02 + 0.05 * hash(i, 1);
    c.lineWidth = 1 + 2 * hash(i, 2);
    const y0 = hash(i, 3) * CH;
    c.beginPath();
    for (let x = 0; x <= CW; x += 60) { const y = y0 + 30 * Math.sin(x * 0.002 + i) + 16 * smoothNoise(x / 200, i, 2); x ? c.lineTo(x, y) : c.moveTo(x, y); }
    c.stroke();
  }
  c.globalAlpha = 1;
});
type Flow = (x: number, y: number) => { a: number; v: number };
/** A sheet of gouges over the block: `flow` gives each its direction and how much white it wants there (0 none, 1 dense). */
const field = (name: string, e: WorldEnv, state: number, flow: Flow, n = 16000) => kept(`wc-f|${name}|${e.paper}|${e.ink}|${e.seed % 3}|${state}`, CW, CH, (c) => {
  c.drawImage(block(e), 0, 0);
  c.fillStyle = e.ink;
  for (let i = 0; i < n; i++) {
    const [x, y] = [hash(i, 11 + state * 0.0) * CW, hash(i, 12) * CH];
    const { a, v } = flow(x, y);
    // white where it is wanted; the next state of the block moves a share of the cuts, so it boils and does not flash
    if (hash(i, 13) > v) continue;
    const j = hash(i, 14 + state);
    if (j < 0.12) continue;
    gouge(c, x, y, a + (hash(i, 15 + state) - 0.5) * 0.16, 26 + 100 * hash(i, 16), 2 + 9 * hash(i, 17) * (0.5 + v));
  }
});
const stateOf = (e: WorldEnv) => Math.floor(e.now * 5) % 3;
const drawField = (e: WorldEnv, cv: OffscreenCanvas) => atBase(e, (c) => c.drawImage(cv, -120, -120));
const whirl = (cx: number, cy: number, seed: number): Flow => (x, y) => {
  const [dx, dy] = [x - cx, y - cy];
  const r = Math.hypot(dx, dy);
  const band = 0.5 + 0.5 * Math.sin(r * 0.016 - Math.atan2(dy, dx) * 2 + smoothNoise(x / 300, y / 300, seed) * 5);
  return { a: Math.atan2(dy, dx) + 1.45, v: 0.2 + 0.8 * band ** 2.2 };
};
const sea: (seed: number) => Flow = (seed) => (x, y) => {
  const h = smoothNoise(x / 420, y / 160, seed) * 3;
  const crest = 0.5 + 0.5 * Math.sin(y * 0.024 + h * 3);
  return { a: Math.sin(x * 0.004 + h) * 0.5, v: crest ** 3 };
};
const grain: (seed: number) => Flow = (seed) => (x, y) => {
  // contour lines of a knotty plank
  const f = (u: number, w: number) => smoothNoise(u / 520, w / 260, seed) * 7 + 2.4 * Math.exp(-(((u - CW * 0.3) / 240) ** 2 + ((w - CH * 0.6) / 170) ** 2)) * 3;
  const v = f(x, y);
  const a = Math.atan2(f(x, y + 8) - v, f(x + 8, y) - v) + Math.PI / 2;
  return { a, v: (0.5 + 0.5 * Math.sin(v * 8.5)) ** 4 };
};
const burst: (cx: number, cy: number) => Flow = (cx, cy) => (x, y) => { const r = Math.hypot(x - cx, y - cy); const a = Math.atan2(y - cy, x - cx); const spoke = 0.5 + 0.5 * Math.sin(a * 22); return { a, v: r < 150 ? 1 : (0.15 + 0.85 * spoke ** 3) * clamp01(1.3 - r / 1400) }; };
const strata: (seed: number) => Flow = (seed) => (x, y) => { const h = y + 180 * smoothNoise(x / 500, 3, seed) + 60 * smoothNoise(x / 90, 5, seed); const band = Math.floor(h / 170); const dark = hash(band, seed) ; return { a: (band % 2 ? 0.5 : -0.5) + 0.02 * band, v: 0.08 + 0.8 * dark ** 2 }; };

/** The part of the block never cut, round the words: its edge the last row of gouges, so it is not a box. */
export function uncutRound(e: WorldEnv, tone = e.paper) {
  // (words on their own carrier read on it: no room of plain paper is cut round them)
  if (!e.rect || e.weight <= 0 || e.rect.carried) return;
  const b = boxOf(e, 34, 22);
  atBase(e, (c) => {
    const edge: Pt[] = [];
    const [w, h] = [b.x1 - b.x0, b.y1 - b.y0];
    const step = 54;
    const jag = (x: number, y: number, i: number, nx: number, ny: number): Pt => [x + nx * (10 + 34 * hash(i, 3)), y + ny * (10 + 34 * hash(i, 3))];
    let i = 0;
    for (let x = 0; x < w; x += step) edge.push(jag(b.x0 + x, b.y0, i++, 0, -1));
    for (let y = 0; y < h; y += step) edge.push(jag(b.x1, b.y0 + y, i++, 1, 0));
    for (let x = 0; x < w; x += step) edge.push(jag(b.x1 - x, b.y1, i++, 0, 1));
    for (let y = 0; y < h; y += step) edge.push(jag(b.x0, b.y1 - y, i++, -1, 0));
    c.globalAlpha = Math.min(1, e.weight * 4);
    trace(c, edge);
    c.fillStyle = tone;
    c.fill();
    c.globalAlpha = 1;
  });
}
const Gs: Record<string, HandGround> = {
  'woodcut/whirl': (e) => { drawField(e, field('whirl', e, stateOf(e), whirl(CW * (0.3 + 0.4 * hash(e.seed % 3, 2)), CH * 0.44, e.seed % 3))); uncutRound(e); },
  'woodcut/sea': (e) => { drawField(e, field('sea', e, stateOf(e), sea(e.seed % 3), 20000)); uncutRound(e); },
  'woodcut/plank': (e) => { drawField(e, field('plank', e, stateOf(e), grain(e.seed % 3), 24000)); uncutRound(e); },
  'woodcut/sun-cut': (e) => { drawField(e, field('sun', e, stateOf(e), burst(CW * (e.seed % 2 ? 0.2 : 0.8), CH * 0.3), 16000)); uncutRound(e); },
  'woodcut/strata': (e) => { drawField(e, field('strata', e, stateOf(e), strata(e.seed % 3), 20000)); uncutRound(e); },
  'woodcut/bare-block': (e) => { atBase(e, (c) => c.drawImage(block(e), -120, -120)); const c = e.ctx; c.fillStyle = e.ink; for (let i = 0; i < 40; i++) gouge(c, hash(i, 1 + e.seed % 3) * W, H * (0.04 + 0.1 * hash(i, 2)) + (i % 2 ? H * 0.8 : 0), 0.05 * i, 80 + 200 * hash(i, 3), 3 + 8 * hash(i, 4)); },
  'woodcut/colour-plate': (e) => {
    const c = e.ctx;
    drawField(e, field('whirl2', e, stateOf(e), whirl(CW * 0.5, CH * 0.5, 7)));
    atBase(e, () => { c.save(); c.globalCompositeOperation = isLight(e.paper) ? 'multiply' : 'multiply'; c.fillStyle = e.slots.accent; c.fillRect(0, 0, W, H); c.restore(); });
    uncutRound(e);
  },
  'woodcut/one-line': (e) => { GROUNDSbare(e); },
};
const GROUNDSbare = (e: WorldEnv) => { Gs['woodcut/bare-block'](e); };

const INS: Record<string, HandIn> = {
  'block-push': { sec: 0.32, draw: (e, q) => { const c = e.ctx; atBase(e, () => { const x = (1 - ease(q, 2)) * (W + 120); c.save(); c.drawImage(block(e), 120 - W - 120, -120); c.translate(x - W, 0); c.fillStyle = e.paper; c.fillRect(x - W * 2, -40, W * 2, H + 80); c.restore(); void x; }); } },
};

/**
 * A solid area printed off the block is never flat: the grain of the plank shows through the ink as long paler
 * streaks, and the paper bites through where the roller ran thin.
 */
function printGrain(c: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, tone: string, seed: number) {
  if (w <= 4 || h <= 4) return;
  c.save();
  c.beginPath();
  c.rect(x0, y0, w, h);
  c.clip();
  c.strokeStyle = tone;
  c.lineCap = 'round';
  const n = Math.round(40 + 50 * Math.min(1, (w * h) / (W * H)));
  for (let i = 0; i < n; i++) {
    const y = y0 + hash(i, seed) * h;
    const xs = x0 - 40 + hash(i, seed + 3) * w * 0.7;
    const len = w * (0.3 + 0.7 * hash(i, seed + 4));
    c.globalAlpha = 0.07 + 0.13 * hash(i, seed + 1);
    c.lineWidth = 1.5 + 5 * hash(i, seed + 2) ** 2;
    c.beginPath();
    c.moveTo(xs, y);
    c.bezierCurveTo(xs + len * 0.33, y + 14 * (hash(i, seed + 5) - 0.5), xs + len * 0.66, y - 14 * (hash(i, seed + 6) - 0.5), xs + len, y + 6 * (hash(i, seed + 7) - 0.5));
    c.stroke();
  }
  c.fillStyle = tone;
  for (let i = 0; i < n * 3; i++) { c.globalAlpha = 0.18 * hash(i, seed + 8); c.fillRect(x0 + hash(i, seed + 9) * w, y0 + hash(i, seed + 10) * h, 2 + 7 * hash(i, seed + 11), 1.5 + 2 * hash(i, seed + 12)); }
  c.restore();
}

const PIECES: Record<string, Piece> = {
  // one long pull of the V-tool across the whole block, the chips thrown off ahead of it
  'great-gouge': { sec: 2.1, clear: 0, draw: (e, q) => {
    const c = e.ctx;
    const paths: [Pt, Pt][] = [[[-60, H * 0.14], [W + 60, H * 0.32]], [[W + 60, H * 0.56], [-60, H * 0.44]], [[-60, H * 0.82], [W + 60, H * 0.96]]];
    const fade = 1 - easeIn((q - 0.76) / 0.24, 2);
    c.fillStyle = e.ink;
    paths.forEach(([a, b], i) => {
      const k = ease((q - i * 0.14) * 2.6, 2);
      if (k <= 0) return;
      const [x, y] = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
      c.globalAlpha = fade;
      // the cut itself, with ragged sides
      c.beginPath();
      c.moveTo(a[0], a[1]);
      const n = 60;
      for (let j = 0; j <= n; j++) { const t = (j / n) * k; c.lineTo(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - (40 + 70 * Math.sin(t * Math.PI)) * (0.8 + 0.4 * hash(j, i))); }
      for (let j = n; j >= 0; j--) { const t = (j / n) * k; c.lineTo(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t + (40 + 70 * Math.sin(t * Math.PI)) * (0.8 + 0.4 * hash(j + 40, i))); }
      c.closePath();
      c.fill();
      c.globalAlpha = 1;
      // chips, curled, flying off the tool
      if (k < 1) for (let j = 0; j < 40; j++) { const t = (q * 8 + hash(j, i)) % 1; const [dx, dy] = [(hash(j, i + 2) - 0.3) * 460 * t, (hash(j, i + 3) - 0.8) * 420 * t + 500 * t * t]; gouge(c, x + dx, y + dy, hash(j, 4) * TAU + t * 5, 22 + 40 * hash(j, 5), 8); }
    });
    uncutRound(e);
  } },
  // the brayer comes over the block and lays it black again
  'ink-roller': { sec: 2.1, clear: 0, draw: (e, q) => {
    const c = e.ctx;
    const k = q < 0.56 ? ease(q / 0.56, 2) : 1;
    const x = -300 + k * (W + 700);
    const off = q > 0.62 ? clamp01((q - 0.62) / 0.38) : 0;
    // it lays the other tone: the frame's polarity turns over behind the words, then the block comes back
    c.fillStyle = e.ink;
    const [ix, iw] = [off > 0 ? W * easeIn(off, 2) : 0, Math.max(0, Math.min(x, W))];
    c.fillRect(ix, 0, iw, H);
    printGrain(c, ix, 0, iw - ix, H, e.paper, 5);
    if (x < W + 300) {
      lifted(c, 40, -20, 0, 0.6, () => { c.fillStyle = mixHex(e.paper, e.ink, 0.1); c.fillRect(x, -30, 240, H + 60); });
      const g = c.createLinearGradient(x, 0, x + 240, 0);
      g.addColorStop(0, 'rgba(0,0,0,0.5)');
      g.addColorStop(0.42, 'rgba(255,255,255,0.28)');
      g.addColorStop(1, 'rgba(0,0,0,0.65)');
      c.fillStyle = g;
      c.fillRect(x, -30, 240, H + 60);
    }
    uncutRound(e);
  } },
  // the print pulled off the block: the corner lifts and the sheet comes away with the opposite picture on it
  'print-peel': { sec: 2.3, clear: 0, draw: (e, q) => {
    const c = e.ctx;
    const k = q < 0.7 ? easeIn(q / 0.7, 2) : 1;
    const off = (1 - k) * (W + H);
    const out = easeIn((q - 0.7) / 0.3, 2);
    c.save();
    c.beginPath();
    c.moveTo(W + 10, -10);
    c.lineTo(W + 10, H + 10);
    c.lineTo(-10 + W * 0, H + 10);
    c.closePath();
    c.restore();
    // what is lifted: a paper sheet still on the block over the part not yet peeled
    const line = (W + H) * k;
    const tone = e.slots.plate;
    c.save();
    c.globalAlpha = 1 - out;
    c.fillStyle = tone;
    trace(c, [[-10, -10], [W + 10, -10], [W + 10, H + 10], [-10, H + 10]]);
    c.fill();
    printGrain(c, 0, 0, W, H, mixHex(tone, e.paper, 0.6), 9);
    c.fillStyle = e.paper;
    trace(c, [[W + 10, H + 10], [W + 10 - line, H + 10], [W + 10, H + 10 - line]]);
    c.fill();
    c.fillStyle = mixHex(e.slots.plate, e.ink, 0.2);
    lifted(c, 40, -20, -20, 0.5, () => { trace(c, [[W + 10 - line, H + 10], [W + 10, H + 10 - line], [W + 10 - line * 0.5, H + 10 - line * 0.5 - 60 * Math.sin(k * Math.PI)]]); c.fill(); });
    c.restore();
    void off;
    uncutRound(e);
  } },
  // cuts run outwards from the words until the block is all white, then ink closes back
  'carve-out': { sec: 2.2, clear: 0, draw: (e, q) => {
    const c = e.ctx;
    const b = boxOf(e, 0, 0);
    const [cx, cy] = [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];
    const r = (q < 0.6 ? ease(q / 0.6, 2) : 1 - easeIn((q - 0.6) / 0.4, 2)) * 1300;
    c.fillStyle = e.ink;
    for (let i = 0; i < 1400; i++) {
      const a = hash(i, 2) * TAU;
      const d = 80 + hash(i, 3) ** 0.6 * 1200;
      if (d > r) continue;
      gouge(c, cx + Math.cos(a) * d, cy + Math.sin(a) * d, a + (hash(i, 4) - 0.5) * 0.3, 40 + 130 * hash(i, 5), 8 + 22 * hash(i, 6));
    }
    uncutRound(e);
  } },
};

/** A plate of the second colour, knife-edged: the words stand on it. */
const plate: ObjectPaint = (c, w, h, s, seed, look) => {
  const pts: Pt[] = [];
  const n = 26;
  for (let i = 0; i < n; i++) pts.push([(i / n) * w, 6 + 14 * hash(i, seed)]);
  for (let i = 0; i < n; i++) pts.push([w - 4 - 14 * hash(i, seed + 2), (i / n) * h]);
  for (let i = 0; i < n; i++) pts.push([w - (i / n) * w, h - 6 - 14 * hash(i, seed + 3)]);
  for (let i = 0; i < n; i++) pts.push([4 + 14 * hash(i, seed + 4), h - (i / n) * h]);
  trace(c, pts);
  c.fillStyle = s.plate;
  c.fill();
  c.save();
  c.clip();
  printGrain(c, 0, 0, w, h, mixHex(s.plate, s.plateInk, 0.5), seed + 13);
  c.fillStyle = s.plateInk;
  c.globalAlpha = 0.5;
  // the plate's own uncleared ridges, left round the edge
  for (let i = 0; i < 90; i++) { const edge = i % 4; const [x, y] = edge === 0 ? [hash(i, 2) * w, 30] : edge === 1 ? [hash(i, 2) * w, h - 30] : edge === 2 ? [30, hash(i, 3) * h] : [w - 30, hash(i, 3) * h]; gouge(c, x, y, look * 0.8 + hash(i, 4), 40, 3); }
  c.restore();
};
export const WOODCUT = { grounds: Gs, ins: INS, pieces: PIECES, objects: { 'colour-plate': plate } as Record<string, ObjectPaint> };
void flood; void fibred;
