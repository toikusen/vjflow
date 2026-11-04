// idol-live: a live house. The stage is black, the rig throws the member's colour down in beams, the floor is a sea of
// penlights swaying, and the singer stands in the one white spot. The words are what the singer sings: lit, with the
// member colour on their rim, the stage kept dark round them so the light never swallows them.
import type { Piece } from './world-pieces';
import { atBase, clamp01, ease, easeIn, flood, H, hash, HandGround, HandIn, isLight, mixHex, ObjectPaint, span, TAU, W, WorldEnv } from './world-craft';
import { roomBehind } from './world-b3-legacy';
import { lightOf } from './world-craft';

type C = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
/** A beam from the rig: a cone of light added to the room, brightest along its axis. */
function beam(c: C, x: number, y: number, a: number, len: number, width: number, tone: string, al: number, lit = false) {
  c.save();
  c.translate(x, y);
  c.rotate(a);
  const g = c.createLinearGradient(0, 0, 0, len);
  g.addColorStop(0, tone);
  g.addColorStop(1, `${tone}00`);
  c.globalCompositeOperation = lit ? 'source-over' : 'lighter';
  c.globalAlpha = lit ? al * 0.3 : al;
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(-8, 0);
  c.lineTo(8, 0);
  c.lineTo(width, len);
  c.lineTo(-width, len);
  c.closePath();
  c.fill();
  c.restore();
}
/** The penlights: a crowd of small lights in the lower part of the room, each swaying on its own arm. */
function penlights(e: WorldEnv, tones: string[], n: number, y0: number, al: number, wave = 0) {
  const c = e.ctx;
  c.save();
  // in a lit house the arms are paint, not light: fewer, thinner, in the member colour rather than white
  const lit = litRoom(e);
  c.globalCompositeOperation = lit ? 'source-over' : 'lighter';
  if (lit) { al *= 0.4; tones = tones.map((t) => (t === e.slots.plate ? e.slots.accent : t)); }
  for (let i = 0; i < n; i++) {
    const [u, v] = [hash(i, e.seed + 1), hash(i, e.seed + 2)];
    const x = u * (W + 200) - 100;
    const y = y0 + v * (H - y0 + 40);
    const sway = Math.sin(e.now * 2.2 + u * 9 + v * 3) * 16;
    const bright = 0.5 + 0.5 * Math.sin(e.now * 3 + i) + wave * Math.exp(-(((u - wave) * 6) ** 2));
    const tone = tones[i % tones.length];
    c.globalAlpha = al * (0.4 + 0.6 * bright) * (0.5 + 0.5 * v);
    c.fillStyle = tone;
    c.fillRect(x + sway - 3, y - 50, 6, 52);
    const g = c.createRadialGradient(x + sway, y - 50, 0, x + sway, y - 50, 26);
    g.addColorStop(0, tone);
    g.addColorStop(1, `${tone}00`);
    c.fillStyle = g;
    c.fillRect(x + sway - 26, y - 76, 52, 52);
  }
  c.restore();
}
/** The white follow-spot: a cone from the rig and the pool it leaves on the floor. */
function spot(e: WorldEnv, x: number, al: number, tone = e.slots.plate) {
  const c = e.ctx;
  beam(c, x, -40, 0, H * 0.9, 240, tone, al * 0.5, litRoom(e));
  c.save();
  c.globalCompositeOperation = 'lighter';
  c.globalAlpha = al * 0.35;
  const g = c.createRadialGradient(x, H * 0.82, 0, x, H * 0.82, 320);
  g.addColorStop(0, tone);
  g.addColorStop(1, `${tone}00`);
  c.fillStyle = g;
  c.save();
  c.translate(x, H * 0.82);
  c.scale(1, 0.3);
  c.translate(-x, -H * 0.82);
  c.fillRect(x - 320, H * 0.82 - 320, 640, 640);
  c.restore();
  c.restore();
}
const litRoom = (e: WorldEnv) => isLight(e.paper) || lightOf(e.paper) > 0.12;
const stage = (e: WorldEnv) => { flood(e, e.paper); atBase(e, (c) => { c.fillStyle = mixHex(e.paper, e.slots.faint, 0.4); c.fillRect(-20, H * 0.84, W + 40, H); c.fillStyle = mixHex(e.paper, e.slots.plate, 0.12); c.fillRect(-20, H * 0.84, W + 40, 3); }); };
const members = (e: WorldEnv) => [e.slots.accent, e.slots.ink2, e.slots.plateInk];
const dark = (e: WorldEnv) => roomBehind(e, e.paper, 0.9, 170, 120);

const Gs: Record<string, HandGround> = {
  'idol-live/one-spot': (e) => { stage(e); penlights(e, [e.slots.accent], 60, H * 0.62, 0.35); spot(e, W * 0.5, 0.8); dark(e); },
  'idol-live/dim-spot': (e) => { stage(e); penlights(e, [e.slots.accent], 40, H * 0.66, 0.2); spot(e, W * (0.35 + 0.3 * hash(e.seed, 3)), 0.5); dark(e); },
  'idol-live/interlude': (e) => { stage(e); penlights(e, members(e), 120, H * 0.56, 0.45); beam(e.ctx, W * 0.2, -40, 0.25, H, 160, e.slots.accent, 0.12, litRoom(e)); beam(e.ctx, W * 0.8, -40, -0.25, H, 160, e.slots.ink2, 0.12, litRoom(e)); dark(e); },
  'idol-live/penlight-sea': (e) => { stage(e); penlights(e, [e.slots.accent, e.slots.plate], 220, H * 0.5, 0.6); spot(e, W * 0.5, 0.7); dark(e); },
  'idol-live/beams': (e) => {
    stage(e);
    const c = e.ctx;
    for (let i = 0; i < 6; i++) { const x = W * (0.1 + 0.16 * i); const a = 0.5 * Math.sin(e.now * (0.9 + 0.1 * i) + i * 1.3); beam(c, x, -60, a, H * 1.3, 120, i % 2 ? e.slots.accent : e.slots.plate, 0.22, litRoom(e)); }
    penlights(e, [e.slots.accent], 140, H * 0.58, 0.5);
    dark(e);
  },
  'idol-live/full-wash': (e) => {
    flood(e, mixHex(e.paper, e.slots.accent, 0.3));
    atBase(e, (c) => { c.fillStyle = mixHex(e.paper, e.slots.faint, 0.4); c.fillRect(-20, H * 0.84, W + 40, H); });
    const c = e.ctx;
    for (let i = 0; i < 7; i++) { const x = W * (0.05 + 0.15 * i); const a = 0.6 * Math.sin(e.now * 1.4 + i * 0.9); beam(c, x, -60, a, H * 1.3, 140, i % 3 ? e.slots.accent : e.slots.plate, 0.22, litRoom(e)); }
    penlights(e, [e.slots.accent, e.slots.plate], 200, H * 0.5, 0.7);
    dark(e);
  },
  // the encore: every beam, every light, streamers hanging from the rig
  'idol-live/encore': (e) => {
    flood(e, mixHex(e.paper, e.slots.accent, 0.4));
    const c = e.ctx;
    for (let i = 0; i < 9; i++) { const x = W * (0.02 + 0.12 * i); const a = 0.7 * Math.sin(e.now * 2 + i * 0.8); beam(c, x, -60, a, H * 1.3, 160, [e.slots.accent, e.slots.plate, e.slots.ink2][i % 3], 0.34, litRoom(e)); }
    penlights(e, [e.slots.accent, e.slots.plate, e.slots.ink2], 260, H * 0.46, 0.8);
    c.save();
    c.lineWidth = 5;
    for (let i = 0; i < 26; i++) { c.strokeStyle = [e.slots.accent, e.slots.plate, e.slots.ink2][i % 3]; c.globalAlpha = 0.8; const x = hash(i, e.seed) * W; c.beginPath(); for (let y = -20; y < H * 0.7; y += 20) c.lineTo(x + 22 * Math.sin(y * 0.03 + e.now * 3 + i), y); c.stroke(); }
    c.restore();
    dark(e);
  },
};

const INS: Record<string, HandIn> = {
  // the house dips to black for a beat and comes up on the next colour
  'house-dip': { sec: 0.3, draw: (e, q) => flood(e, e.paper, q < 0.45 ? 1 : 1 - ease((q - 0.45) / 0.55, 2)) },
};

const PIECES: Record<string, Piece> = {
  // streamers fired from the two front corners: they go up, hang, and fall in curls
  'streamer-cannon': { sec: 2.2, clear: 0.6, draw: (e, q) => {
    const c = e.ctx;
    c.save();
    c.lineWidth = 6;
    c.lineCap = 'round';
    const tones = [e.slots.accent, e.slots.plate, e.slots.ink2];
    for (let i = 0; i < 40; i++) {
      const side = i % 2 ? 1 : -1;
      const t = clamp01((q - 0.05 * hash(i, e.seed)) * 1.3);
      if (t <= 0) continue;
      const vx = side * (300 + 900 * hash(i, e.seed + 1));
      const vy = -(1200 + 900 * hash(i, e.seed + 2));
      const [x, y] = [W * 0.5 - side * W * 0.5 + vx * t, H + vy * t + 1800 * t * t];
      c.strokeStyle = tones[i % 3];
      c.globalAlpha = 0.9 * (1 - easeIn(t, 3));
      c.beginPath();
      for (let s = 0; s < 14; s++) c.lineTo(x - vx * 0.03 * s + 14 * Math.sin(s + t * 20 + i), y - (vy + 3600 * t) * 0.03 * s + 10 * Math.cos(s * 1.3 + i));
      c.stroke();
    }
    c.restore();
  } },
  // the beams swing to one point and open out again
  'beam-chase': { sec: 2.0, clear: 0.75, draw: (e, q) => {
    const c = e.ctx;
    const k = span(q, 0.3, 0.7);
    for (let i = 0; i < 7; i++) { const x = W * (0.05 + 0.15 * i); const toward = Math.atan2(W * 0.5 - x, H * 0.6); beam(c, x, -60, toward * k * 0.9 + 0.3 * Math.sin(e.now * 2 + i) * (1 - k), H * 1.4, 110, i % 2 ? e.slots.accent : e.slots.plate, 0.28 * (0.5 + k), litRoom(e)); }
  } },
  // a wave goes through the crowd: each arm comes up as it passes
  'penlight-wave': { sec: 2.4, clear: 0.5, draw: (e, q) => { penlights(e, [e.slots.accent, e.slots.plate], 240, H * 0.5, 0.7 * span(q, 0.15, 0.85), q * 1.4 - 0.2); } },
  // the follow-spot looks for the singer and finds them
  'spot-search': { sec: 1.8, clear: 0.7, draw: (e, q) => {
    const b = e.rect ?? { x0: W * 0.3, x1: W * 0.7 };
    const target = (b.x0 + b.x1) / 2;
    const k = ease(Math.min(1, q / 0.6), 2);
    const x = W * (0.15 + 0.7 * hash(e.seed, 5)) + (target - W * (0.15 + 0.7 * hash(e.seed, 5))) * k + 120 * Math.sin(q * 14) * (1 - k);
    spot(e, x, 0.9 * span(q, 0.15, 0.8));
  } },
};

/** The pool the spot leaves: a soft oval of light the singer stands in, the words dark against it. */
const spotPool: ObjectPaint = (c, w, h, s) => {
  const [cx, cy] = [w / 2, h / 2];
  c.save();
  c.translate(cx, cy);
  c.scale(1, h / Math.max(w, 1));
  const r = w / 2 + 60;
  const g = c.createRadialGradient(0, 0, 0, 0, 0, r);
  g.addColorStop(0, s.plate);
  g.addColorStop(0.74, s.plate);
  g.addColorStop(1, `${s.plate}00`);
  c.fillStyle = g;
  c.fillRect(-r, -r, r * 2, r * 2);
  c.restore();
};
/** A fan held up in the crowd: the member colour's rim, a white face, a handle below. */
const uchiwa: ObjectPaint = (c, w, h, s, seed, look) => {
  const [cx, cy, r] = [w / 2, h / 2, Math.max(w, h) / 2 + 40];
  c.fillStyle = s.accent;
  c.fillRect(cx - 16, cy + r * 0.6, 32, r * 0.9);
  c.save();
  c.shadowColor = s.accent;
  c.shadowBlur = 40;
  c.fillStyle = s.accent;
  c.beginPath();
  c.ellipse(cx, cy, r, r * 0.96, 0, 0, TAU);
  c.fill();
  c.restore();
  c.fillStyle = s.plate;
  c.beginPath();
  c.ellipse(cx, cy, r - 22, r * 0.96 - 22, 0, 0, TAU);
  c.fill();
  c.strokeStyle = s.accent;
  c.lineWidth = 4;
  c.beginPath();
  c.ellipse(cx, cy, r - 36, r * 0.96 - 36, 0, 0, TAU);
  c.stroke();
  void seed; void look;
};
export const IDOL = { grounds: Gs, ins: INS, pieces: PIECES, objects: { 'spot-pool': spotPool, uchiwa } as Record<string, ObjectPaint> };
