// citypop: a record sleeve from a summer that never ends. An airbrushed sky, a pool throwing light, a white wall in hard
// sun, palms at the edge, the sea and a striped sun on the horizon. The words are the sleeve's title: they come up out of
// the air and stay a long time. Uses the air engine (world-air.ts). Almost nothing moves; what moves, moves slowly.
import type { Piece } from './world-pieces';
import { atBase, clamp01, ease, easeIn, H, hash, HandGround, HandIn, inOut, isLight, lifted, mixHex, ObjectPaint, span, TAU, W, WorldEnv } from './world-craft';
import { airSky, caustics, cloud, haze, palm, seaBand, stripedSun, sunlitBlock } from './world-air';

const CW = W + 240;
const CH = H + 240;
/** The sky of this scheme: ground at the zenith, lighter toward the horizon, the second ink's warmth at the bottom. */
const skyOf = (e: WorldEnv) => airSky(e.paper, mixHex(e.paper, e.slots.ink2, 0.3), mixHex(e.paper, e.slots.faint, 0.55));
const sky = (e: WorldEnv) => e.ctx.drawImage(skyOf(e), -120, -120);
/** The pale tone of what stands in this light: the sleeve's white. */
const white = (e: WorldEnv) => (isLight(e.slots.plate) ? e.slots.plate : e.slots.ink2);
const shade = (e: WorldEnv) => mixHex(e.paper, e.ink, 0.45);
const clouds = (e: WorldEnv, n: number, a = 0.85) => { for (let i = 0; i < n; i++) cloud(e.ctx, ((hash(i, e.seed) * CW + e.now * (6 + 10 * hash(i, 2))) % (CW + 600)) - 420, CH * (0.12 + 0.3 * hash(i, e.seed + 1)), 90 + 140 * hash(i, e.seed + 2), white(e), i + e.seed, a); };
const horizon = (e: WorldEnv) => CH * (0.58 + 0.08 * hash(e.seed, 5));

const Gs: Record<string, HandGround> = {
  'citypop/empty-sky': (e) => { sky(e); clouds(e, 1, 0.7); haze(e.ctx, CH * 0.4, CH, white(e), 0.18); },
  'citypop/sky-gradient': (e) => { sky(e); clouds(e, 3); haze(e.ctx, CH * 0.5, CH, white(e), 0.14); },
  // the pool fills the lower half; the coping is a white line; the water throws its lines
  'citypop/pool': (e) => {
    sky(e);
    clouds(e, 2, 0.7);
    const c = e.ctx;
    const y = CH * 0.56 - 120;
    c.fillStyle = white(e);
    c.fillRect(-120, y - 22, CW, 22);
    c.fillStyle = e.slots.faint;
    c.fillRect(-120, y, CW, CH);
    caustics(c, -120, CW, y + 20, CH, white(e), e.now, e.seed, 0.42);
    haze(c, y, CH, white(e), 0.06);
  },
  // the shore: sea bands to the horizon, palms at one side, their fronds swaying a little
  'citypop/palm-shore': (e) => {
    sky(e);
    const c = e.ctx;
    const y = horizon(e) - 120;
    haze(c, y - 300, y, white(e), 0.3);
    seaBand(c, y, y + 60, mixHex(e.slots.faint, white(e), 0.3), white(e), e.now, e.seed);
    seaBand(c, y + 60, CH, e.slots.faint, white(e), e.now, e.seed + 1);
    const side = hash(e.seed, 6) > 0.5 ? 1 : -1;
    for (let i = 0; i < 3; i++) palm(c, W * 0.5 + side * (W * 0.46 - i * 150) + (hash(i, e.seed) - 0.5) * 80, y + 120 + 60 * i, 360 + 120 * hash(i, e.seed + 2), shade(e), 0.08 * Math.sin(e.now * 0.7 + i), i + e.seed);
  },
  // a sun low on the horizon, cut by the air's stripes
  'citypop/sun-stripes': (e) => {
    sky(e);
    const c = e.ctx;
    const y = horizon(e) - 120;
    haze(c, y - 400, y, white(e), 0.2);
    stripedSun(c, W * (0.3 + 0.4 * hash(e.seed, 8)), y - 40, 300, e.slots.accent);
    seaBand(c, y, CH, e.slots.faint, white(e), e.now, e.seed + 2);
  },
  // white walls in hard noon light: each block throws one cold shadow, all the same way
  'citypop/white-walls': (e) => {
    sky(e);
    clouds(e, 2, 0.7);
    const c = e.ctx;
    const base = CH - 120;
    for (let i = 0; i < 6; i++) { const [x, w, h] = [-200 + i * 420 + hash(i, e.seed) * 120, 260 + 200 * hash(i, e.seed + 1), 160 + 420 * hash(i, e.seed + 2)]; sunlitBlock(c, x, base - h, w, h + 200, white(e), shade(e), 34, 30); }
    haze(c, base - 500, base, white(e), 0.1);
  },
  // the peak: the sun fills the picture, its stripes the whole lower half
  'citypop/sun-rise': (e) => {
    sky(e);
    const c = e.ctx;
    const y = CH * 0.62 - 120;
    stripedSun(c, W * 0.5, y + 40, 760, e.slots.accent, 1);
    haze(c, y - 500, y, white(e), 0.25);
    seaBand(c, y + 120, CH, e.slots.faint, white(e), e.now, e.seed + 3);
  },
};

const INS: Record<string, HandIn> = {
  // the sleeve pulled off: the old picture slides up and away, slowly, the way a record is taken out
  'sleeve-pull': { sec: 0.7, draw: (e, q) => atBase(e, (c) => { const y = -inOut(q) * (H + 200); lifted(c, 40, 0, 20, 0.35, () => { c.fillStyle = white(e); c.fillRect(-20, y, W + 40, H + 120); }); c.fillStyle = e.slots.faint; c.fillRect(-20, y + H * 0.56, W + 40, H * 0.44 + 120); }) },
};

const PIECES: Record<string, Piece> = {
  // the sun comes up over the horizon, stripes last, and sets back
  'sun-up': { sec: 3.0, clear: 0.5, draw: (e, q) => {
    const c = e.ctx;
    const y = H * 0.66;
    const k = q < 0.5 ? ease(q / 0.5, 2) : 1 - easeIn((q - 0.5) / 0.5, 2);
    c.save();
    c.beginPath();
    c.rect(-10, -10, W + 20, y + 10);
    c.clip();
    stripedSun(c, W * 0.5, y + 420 - 480 * k, 360, e.slots.accent);
    c.restore();
    haze(c, y - 200, y, white(e), 0.3 * k);
  } },
  // the sea rolls: each band lifts in turn and settles
  'wave-roll': { sec: 2.6, clear: 0.6, draw: (e, q) => {
    const c = e.ctx;
    const k = span(q, 0.25, 0.75);
    const y0 = H * 0.6;
    for (let i = 0; i < 4; i++) { const lift = 40 * Math.sin(q * 6 - i * 0.9) * k; seaBand(c, y0 + i * 90 + lift, y0 + (i + 1) * 90 + lift + 60, mixHex(e.slots.faint, white(e), i * 0.12), white(e), e.now, i + e.seed); }
  } },
  // clouds cross the sky: three, at three speeds
  'cloud-drift': { sec: 3.2, clear: 0.4, draw: (e, q) => {
    const k = span(q, 0.2, 0.8);
    for (let i = 0; i < 3; i++) cloud(e.ctx, -300 + (W + 600) * (q * (0.6 + 0.4 * i) % 1), H * (0.12 + 0.2 * i), 120 + 80 * hash(i, e.seed), white(e), i + e.seed + 8, 0.9 * k);
  } },
  // the light on the water comes up to full and settles
  'pool-shimmer': { sec: 2.2, clear: 0.5, draw: (e, q) => {
    const c = e.ctx;
    const k = span(q, 0.3, 0.7);
    const y = H * 0.56;
    c.save();
    c.globalAlpha = 0.55 * k;
    c.fillStyle = e.slots.faint;
    c.fillRect(-10, y, W + 20, H);
    c.restore();
    caustics(c, -10, W + 10, y + 10, H, white(e), e.now * 1.6, e.seed, 0.8 * k);
  } },
};

/** The sleeve: a square of white card with a thin printed border and a soft shadow, a small colour mark in one corner. */
const sleeveCard: ObjectPaint = (c, w, h, s, seed, look) => {
  lifted(c, 36, 10, 22, 0.4, () => { c.fillStyle = s.plate; c.fillRect(0, 0, w, h); });
  // the sleeve's printed band: the one strong colour on the card, along its lower edge
  const band = 26 + 10 * look;
  c.fillStyle = s.accent;
  c.fillRect(0, h - band, w, band);
  c.fillStyle = s.plateInk;
  c.globalAlpha = 0.85;
  c.fillRect(0, h - band - 4, w, 4);
  c.globalAlpha = 0.6;
  c.lineWidth = 1.6;
  c.strokeStyle = s.plateInk;
  c.strokeRect(22, 22, w - 44, h - 44 - band);
  c.globalAlpha = 1;
  void seed; void TAU;
};
export const CITYPOP = { grounds: Gs, ins: INS, pieces: PIECES, objects: { 'sleeve-card': sleeveCard } as Record<string, ObjectPaint> };
void clamp01;
