// psychedelic: a seventies poster, warm and a little faded. Thick wavy stripes flowing, a sun with soft rays, colour that
// melts; the type round, with a second ink that rounds its corners and a thick offset below. The words ride the wave.
// Nothing glows, nothing is cold; the paper shows through everything.
import type { Piece } from './world-pieces';
import { atBase, boxOf, clamp01, ease, easeIn, fibred, H, hash, HandGround, HandIn, mixHex, ObjectPaint, span, TAU, W, WorldEnv } from './world-craft';

type C = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
const CW = W + 240;
const CH = H + 240;
const paper = (e: WorldEnv) => e.ctx.drawImage(fibred('psy', e.paper, mixHex(e.paper, e.ink, 0.6), 1600, CW, CH), -120, -120);
const tones = (e: WorldEnv) => [e.slots.ink2, e.slots.accent, e.slots.plate, mixHex(e.paper, e.slots.faint, 0.8)];
/** Wavy stripes: each a thick sine band, the colours in turn, phase running with time; `amp` sets how far they wave. */
function waves(c: C, ts: string[], pitch: number, amp: number, phase: number, angle: number, wl = 1.6, y0 = -CH, y1 = CH * 2) {
  c.save();
  c.translate(W / 2, H / 2);
  c.rotate(angle);
  c.translate(-W / 2, -H / 2);
  c.lineWidth = pitch * 0.52;
  c.lineCap = 'butt';
  let j = 0;
  for (let y = y0; y < y1; y += pitch, j++) {
    c.strokeStyle = ts[j % ts.length];
    c.beginPath();
    for (let x = -CW; x <= CW * 2; x += 24) { const yy = y + amp * Math.sin((x / (pitch * wl)) + phase + j * 0.4); x === -CW ? c.moveTo(x, yy) : c.lineTo(x, yy); }
    c.stroke();
  }
  c.restore();
}
/** A sun: a disc and soft rays round it, two tones in turn, turning slowly. */
function sun(c: C, x: number, y: number, r: number, disc: string, a: string, b: string, spin: number, reach = 2.2, n = 24) {
  c.save();
  for (let i = 0; i < n; i++) { const t0 = spin + (i / n) * TAU; const t1 = spin + ((i + 0.72) / n) * TAU; c.fillStyle = i % 2 ? a : b; c.beginPath(); c.moveTo(x + Math.cos(t0) * r, y + Math.sin(t0) * r); c.arc(x, y, r * reach, t0, t1); c.lineTo(x + Math.cos(t1) * r, y + Math.sin(t1) * r); c.closePath(); c.fill(); }
  c.fillStyle = disc;
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
  c.fill();
  c.restore();
}
/** Lava: soft blobs that drift and merge, drawn blurred over each other. */
function lava(e: WorldEnv, n: number, a = 1, drop = 0) {
  const c = e.ctx;
  c.save();
  c.globalAlpha = a;
  c.lineWidth = 9;
  c.strokeStyle = mixHex(e.paper, e.ink, 0.75);
  for (let i = 0; i < n; i++) {
    const t = e.now * (0.08 + 0.1 * hash(i, 1));
    const [x, y] = [hash(i, e.seed) * W + 120 * Math.sin(t + i), hash(i, e.seed + 1) * H + 90 * Math.cos(t * 1.3 + i) + drop * (200 + 400 * hash(i, 4))];
    const [rx, ry] = [140 + 180 * hash(i, 2), 120 + 160 * hash(i, 3)];
    c.fillStyle = tones(e)[i % 3];
    c.beginPath();
    // a blob: an ellipse pushed out of round by three slow bulges
    for (let k = 0; k <= 40; k++) { const th = (k / 40) * TAU; const bulge = 1 + 0.16 * Math.sin(th * 3 + t * 2 + i) + 0.08 * Math.sin(th * 5 - t); const px = x + Math.cos(th) * rx * bulge; const py = y + Math.sin(th) * ry * bulge; k ? c.lineTo(px, py) : c.moveTo(px, py); }
    c.closePath();
    c.fill();
    c.stroke();
  }
  c.restore();
}
/** The paper laid back round the words so the stripes never run through a line being read. */
function clearing(e: WorldEnv) {
  if (!e.rect || e.weight <= 0) return;
  const b = boxOf(e, 50, 36);
  atBase(e, (c) => {
    c.globalAlpha = 0.85 * e.weight;
    c.fillStyle = e.paper;
    c.beginPath();
    c.roundRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0, Math.min(90, (b.y1 - b.y0) / 2));
    c.fill();
    c.globalAlpha = 1;
  });
}

const Gs: Record<string, HandGround> = {
  'psychedelic/band-sunset': (e) => { paper(e); waves(e.ctx, tones(e), 150, 22, e.now * 0.5, 0, 2.2, H * 0.3, CH); clearing(e); },
  'psychedelic/one-wave': (e) => { paper(e); waves(e.ctx, tones(e), 180, 40, e.now * 0.4, 0.04, 2.4, H * 0.5, H * 0.5 + 180 * 4); clearing(e); },
  'psychedelic/wave-stripes': (e) => { paper(e); waves(e.ctx, tones(e), 120 + 20 * (e.seed % 3), 60, e.now * 0.8, -0.2 + 0.4 * hash(e.seed, 2)); clearing(e); },
  'psychedelic/liquid': (e) => { paper(e); lava(e, 9); clearing(e); },
  'psychedelic/sun-rays': (e) => { paper(e); const t = tones(e); sun(e.ctx, W * (0.3 + 0.4 * hash(e.seed, 3)), H * 0.72, 220, t[1], t[0], t[2], e.now * 0.15, 4); clearing(e); },
  // the peak: the sun fills the frame, its rays turning faster
  'psychedelic/full-sun': (e) => { paper(e); const t = tones(e); sun(e.ctx, W * 0.5, H * 0.5, 300, t[1], t[0], t[2], e.now * 0.5, 6, 28); clearing(e); },
};

const INS: Record<string, HandIn> = {
  // the new picture comes in under a wavy edge sweeping down
  'wave-wash': { sec: 0.46, draw: (e, q) => atBase(e, (c) => { const y = -200 + ease(q, 2) * (H + 500); c.fillStyle = e.slots.plate; c.beginPath(); c.moveTo(-20, -20); c.lineTo(W + 20, -20); c.lineTo(W + 20, y); for (let x = W + 20; x >= -20; x -= 30) c.lineTo(x, y + 60 * Math.sin(x * 0.012 + q * 6)); c.closePath(); c.fill(); }) },
};

const PIECES: Record<string, Piece> = {
  // the colours melt: blobs drop down the page and pool at the bottom
  'lava-melt': { sec: 2.4, clear: 0.8, draw: (e, q) => { lava(e, 8, span(q, 0.25, 0.75), easeIn(q, 1.5)); } },
  // the stripes swell to their full wave and settle again
  'wave-swell': { sec: 2.0, clear: 0.85, draw: (e, q) => { const k = Math.sin(q * Math.PI); waves(e.ctx, tones(e), 130, 30 + 160 * k, e.now * 0.8 + q * 4, -0.1 + 0.2 * hash(e.seed, 5)); } },
  // the sun comes up from below and its rays grow
  'sun-bloom': { sec: 2.2, clear: 0.75, draw: (e, q) => { const t = tones(e); const k = span(q, 0.4, 0.75); const y = H * 1.2 - ease(Math.min(1, q / 0.5), 2) * H * 0.55; sun(e.ctx, W * 0.5, y, 240 * k, t[1], t[0], t[2], q * 2, 1 + 3.5 * k); } },
  // ribbons fly across, each a short wave in one tone
  'ribbon-fly': { sec: 2.0, clear: 0.7, draw: (e, q) => {
    const c = e.ctx;
    const t = tones(e);
    c.save();
    c.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const k = clamp01((q - i * 0.1) / 0.6);
      const fade = 1 - easeIn((q - 0.7) / 0.3, 2);
      const y = H * (0.15 + 0.22 * i);
      const x0 = -500 + ease(k, 2) * (W + 1000);
      c.strokeStyle = t[i % 3];
      c.globalAlpha = fade;
      c.lineWidth = 70;
      c.beginPath();
      for (let s = 0; s <= 30; s++) { const x = x0 - s * 24; c.lineTo(x, y + 50 * Math.sin(x * 0.014 + q * 8 + i)); }
      c.stroke();
    }
    c.restore();
  } },
};

/** The ribbon the words ride: a wavy band with round ends, the second ink round it. */
const ribbonWave: ObjectPaint = (c, w, h, s, seed, look) => {
  const path = () => { c.beginPath(); const amp = h * 0.12; for (let x = -30; x <= w + 30; x += 12) { const y = amp * Math.sin((x / w) * TAU * 0.8 + look); x === -30 ? c.moveTo(x, y) : c.lineTo(x, y); } for (let x = w + 30; x >= -30; x -= 12) { const y = h + amp * Math.sin((x / w) * TAU * 0.8 + look); c.lineTo(x, y); } c.closePath(); };
  c.lineJoin = 'round';
  c.save();
  c.translate(10, 14);
  c.fillStyle = s.plateInk;
  path();
  c.fill();
  c.restore();
  c.fillStyle = s.plate;
  path();
  c.fill();
  c.lineWidth = 7;
  c.strokeStyle = s.plateInk;
  c.stroke();
  void seed;
};
/** The sun face the words sit on: a disc with a rim of short soft rays in two tones. */
const sunDisc: ObjectPaint = (c, w, h, s, seed, look) => {
  const [cx, cy, r] = [w / 2, h / 2, Math.max(w, h) / 2 + 30];
  sun(c, cx, cy, r, s.plate, s.accent, s.ink2, look * 0.3, 1.5, 20 + 4 * (seed % 2));
  c.lineWidth = 7;
  c.strokeStyle = s.plateInk;
  c.beginPath();
  c.arc(cx, cy, r, 0, TAU);
  c.stroke();
};
export const PSYCHEDELIC = { grounds: Gs, ins: INS, pieces: PIECES, objects: { 'ribbon-wave': ribbonWave, 'sun-disc': sunDisc } as Record<string, ObjectPaint> };
