// psychedelic, redrawn from its board (2026-11-04, 風格第3批設計稿/psychedelic a–d): the title of a seventies screen-printed
// concert poster. The words are a sign: cream letters closed in a plum keyline with a colour band grown out of it
// (world-glyph-loud's poster rings, laid under the letters). Under them nested rainbow arches, a target sun, a rounded
// op-art tunnel or flowing vertical bands, all flat inks, hard edges. Paper005 (CC0) multiplied, grain, a plum vignette.
import type { Piece } from './world-pieces';
import { clamp01, ease, H, HandGround, HandIn, mixHex, W, WorldEnv } from './world-craft';
import { artistBy, label, titleOf } from './world-b3-shared';
import { paperOver } from './world-b3-tex';
import { B3 } from './b3-inks';

// (the board's inks: plum, orange, pink, mustard, cream, teal)
const PL = B3.x3A1B55;
const OR = B3.xF2672E;
const PK = B3.xF59AC0;
const MU = B3.xF3BC3E;
const CR = B3.xF7E8C9;
const TE = B3.x1E8C86;
const SHR = (px: number) => `400 ${px}px Shrikhand, "Shippori Antique B1", sans-serif`;

const page = (e: WorldEnv, f: (c: CanvasRenderingContext2D) => void) => { const c = e.ctx; c.save(); if (e.base) c.setTransform(e.base); f(c); c.restore(); };
/** The beat count the bands step on: colours move outward one band a beat, the shapes stay. */
const step = (e: WorldEnv) => Math.floor(e.now * 2);
/** The poster's finish: Paper005 multiplied at half, and the board's plum vignette (transparent to 58 %, 32 % at the edge). */
function finish(c: CanvasRenderingContext2D) {
  paperOver(c, 0.5);
  const g = c.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.hypot(W, H) / 2);
  g.addColorStop(0.58, 'rgba(20,6,30,0)');
  g.addColorStop(1, 'rgba(20,6,30,0.32)');
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
}
/** A colour from a cycle, stepped by the beat so the colour travels outward. */
const cyc = (cols: string[], i: number, s: number) => cols[(((i - s) % cols.length) + cols.length) % cols.length];

/** a: rainbow arches rising from below the frame, the title floating above them. */
const arches: HandGround = (e) => page(e, (c) => {
  c.fillStyle = e.paper;
  c.fillRect(0, 0, W, H);
  const cols = [MU, OR, PK, CR, TE, e.paper];
  const s = step(e);
  const rise = ease(clamp01(e.age / 0.8), 3);
  for (let i = 13; i >= 0; i--) {
    c.beginPath();
    c.arc(960, 1240 + (1 - rise) * 500, 120 + i * 58, 0, Math.PI * 2);
    c.fillStyle = cyc(cols, i, s);
    c.fill();
  }
  finish(c);
  label(c, [artistBy(e), titleOf(e)].filter(Boolean).join(' · '), 120, 104, SHR(30), CR, 1.2);
});

/** b: a calm target sun low right, its rings breathing; the line on the left, the title small below. */
const sun: HandGround = (e) => page(e, (c) => {
  c.fillStyle = e.paper;
  c.fillRect(0, 0, W, H);
  const k = 1 + 0.02 * Math.sin(e.now * 1.3);
  const rings: [number, string][] = [[560, mixHex(e.paper, B3.xFFFFFF, 0.07)], [470, TE], [400, e.paper], [330, PK], [270, e.paper], [210, MU], [150, OR], [90, CR]];
  for (const [r, tone] of rings) { c.beginPath(); c.arc(1480, 760, r * k, 0, Math.PI * 2); c.fillStyle = tone; c.fill(); }
  finish(c);
  label(c, titleOf(e), 150, H - 110, SHR(28), MU, 1.1);
});

/** c: the op-art tunnel, rounded rectangles stepping in to the vanishing point where the line sits. */
const tunnel: HandGround = (e) => page(e, (c) => {
  const cols = [OR, PL, PK, PL, MU, PL, TE, PL].map((x) => (x === PL ? e.paper : x));
  const s = step(e);
  for (let i = 26; i >= 0; i--) {
    const k = 1.17 ** i;
    const [w, h] = [150 * k, 84 * k];
    c.beginPath();
    c.roundRect(960 - w / 2, 540 - h / 2, w, h, h * 0.42);
    c.fillStyle = cyc(cols, i, s * 2);
    c.fill();
  }
  finish(c);
});

/** d: vertical bands flowing down the left two thirds; the columns stand on the plum to their right. */
const flow: HandGround = (e) => page(e, (c) => {
  c.fillStyle = e.paper;
  c.fillRect(0, 0, W, H);
  const cols = [OR, PK, MU, TE, CR, e.paper, OR, PK, MU, TE, e.paper];
  const t = e.now * 0.6;
  for (let i = cols.length - 1; i >= 0; i--) {
    const x0 = -60 + i * 112;
    c.beginPath();
    c.moveTo(-200, -20);
    for (let y = -20; y <= 1100; y += 10) c.lineTo(x0 + Math.sin(y / 160 + i * 0.5 - t) * 70, y);
    c.lineTo(-200, 1100);
    c.closePath();
    c.fillStyle = cols[i];
    c.fill();
  }
  finish(c);
});

const Gs: Record<string, HandGround> = { 'psychedelic/arches': arches, 'psychedelic/sun': sun, 'psychedelic/tunnel': tunnel, 'psychedelic/flow': flow };

const INS: Record<string, HandIn> = {
  // the next poster is pulled up from below in colour bands, plum last, like the arches rising
  'band-rise': { sec: 0.5, draw: (e, q) => page(e, (c) => {
    const cols = [MU, OR, PK, TE, e.paper];
    cols.forEach((tone, i) => {
      const k = ease(clamp01(q * 1.6 - i * 0.12), 3);
      c.fillStyle = tone;
      c.fillRect(0, H * (1 - k), W, H * k);
    });
  }) },
};

/** The lyric box with a margin: a piece keeps out of it. */
const keepOut = (e: WorldEnv, m: number) => { const r = e.rect ?? { x0: W * 0.3, y0: H * 0.35, x1: W * 0.7, y1: H * 0.65 }; return { x0: r.x0 - m, y0: r.y0 - m, x1: r.x1 + m, y1: r.y1 + m }; };

const PIECES: Record<string, Piece> = {
  // the colour pushes outward through the bands faster for a moment: rings round the frame's edge, kept off the words
  'colour-push': { sec: 1.6, clear: 0, draw: (e, q) => page(e, (c) => {
    const b = keepOut(e, 70);
    const cols = [OR, PK, MU, TE, CR];
    const n = Math.floor(q * 12);
    c.save();
    c.beginPath();
    c.rect(0, 0, W, H);
    c.rect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
    c.clip('evenodd');
    for (let i = 0; i < 5; i++) {
      c.lineWidth = 34;
      c.strokeStyle = cols[(i + n) % cols.length];
      c.strokeRect(17 + i * 34, 17 + i * 34, W - 34 - i * 68, H - 34 - i * 68);
    }
    c.restore();
  }) },
  // a sun of rings rises behind a free corner and sets again
  'sun-bloom': { sec: 2.2, clear: 0, draw: (e, q) => page(e, (c) => {
    const b = keepOut(e, 60);
    const x = b.x1 < W * 0.55 ? W - 260 : 260;
    const k = Math.sin(clamp01(q) * Math.PI);
    [[260, TE], [200, PK], [150, MU], [100, OR], [55, CR]].forEach(([r, tone]) => { c.beginPath(); c.arc(x, H + 40 - k * 300, (r as number) * k, 0, Math.PI * 2); c.fillStyle = tone as string; c.fill(); });
  }) },
  // the bands ripple: a wave of colour runs along the bottom of the poster
  'wave-swell': { sec: 1.8, clear: 0, draw: (e, q) => page(e, (c) => {
    const cols = [OR, PK, MU, TE];
    const k = Math.sin(clamp01(q) * Math.PI);
    cols.forEach((tone, i) => {
      c.beginPath();
      c.moveTo(0, H);
      for (let x = 0; x <= W; x += 20) c.lineTo(x, H - (4 - i) * 34 * k - Math.sin(x / 140 + q * 8 + i) * 18 * k);
      c.lineTo(W, H);
      c.closePath();
      c.fillStyle = tone;
      c.fill();
    });
  }) },
};

export const PSYCHEDELIC = { grounds: Gs, ins: INS, pieces: PIECES, objects: {} };
