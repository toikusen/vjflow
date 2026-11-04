// gameshow: a rhythm-quiz studio in flat candy vector. One saturated set colour a part with its pattern backdrop and a
// glossy floor, thick ink lines, hard shadows that never blur, everything landing on the beat. The words are the question
// card; when the line is sung the judgement lands. Nothing glows, nothing blurs: a studio is lit flat.
import type { Piece } from './world-pieces';
import { atBase, clamp01, ease, easeIn, flood, H, hash, HandGround, HandIn, isLight, mixHex, ObjectPaint, span, TAU, W, WorldEnv } from './world-craft';
import { checkerTile, dotTile, hardShadow, starPath, stripeTile, tileGround } from './world-b3-shared';

const LINE = 9;
const key = (e: WorldEnv) => (isLight(e.paper) ? e.ink : e.slots.plateInk);
// the backdrop's second tone stays close to the set colour: a printed pattern, not a second picture
const pale = (e: WorldEnv) => mixHex(e.paper, e.slots.faint, 0.5);
/** The studio floor: a darker band with a sheen, and the set's edge line above it. */
function floor(e: WorldEnv) {
  atBase(e, (c) => {
    const y = H * 0.8;
    c.fillStyle = mixHex(e.paper, e.ink, 0.22);
    c.fillRect(-20, y, W + 40, H);
    const g = c.createLinearGradient(0, y, 0, H);
    g.addColorStop(0, 'rgba(255,255,255,0.28)');
    g.addColorStop(0.5, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(-20, y, W + 40, H - y);
    c.fillStyle = key(e);
    c.fillRect(-20, y - LINE, W + 40, LINE);
  });
}
/** The backdrop with a scrolling pattern, kept flat: one candy colour and its paler step. */
const backdrop = (e: WorldEnv, tile: OffscreenCanvas, dx: number, dy: number) => { flood(e, e.paper); tileGround(e.ctx, tile, e.now * dx, e.now * dy, 1); };
/** The set split in two: each half its own tint and pattern, a slanted ink band between them with its hard shadow. `k` is how far the band has come across. */
function splitSet(e: WorldEnv, k = 1) {
  atBase(e, (c) => {
    const x = W * 0.5 + 90;
    const slant = 120;
    const reach = -H * 1.2 + (H * 1.2 + 40) * k;
    c.save();
    c.beginPath();
    c.moveTo(x + slant, -20);
    c.lineTo(W + 20, -20);
    c.lineTo(W + 20, H + 20);
    c.lineTo(x - slant, H + 20);
    c.closePath();
    c.clip();
    c.fillStyle = mixHex(e.paper, e.slots.accent, 0.55);
    c.fillRect(-20, -20, W + 40, H + 40);
    tileGround(c, dotTile(mixHex(e.paper, e.slots.accent, 0.55), mixHex(e.paper, e.slots.accent, 0.7), 90, 0.5), 0, e.now * 20, 1);
    c.restore();
    const band = () => { c.beginPath(); c.moveTo(x + slant + 24, -20); c.lineTo(x + slant - 24, -20); c.lineTo(x - slant - 24, H + 20); c.lineTo(x - slant + 24, H + 20); c.closePath(); };
    c.save();
    c.translate(0, reach);
    hardShadow(c, key(e), 12, 12, () => { band(); c.fill(); });
    c.fillStyle = e.slots.plate;
    band();
    c.fill();
    c.lineWidth = LINE;
    c.strokeStyle = key(e);
    c.stroke();
    c.restore();
  });
}
function rays(c: CanvasRenderingContext2D, cx: number, cy: number, a: string, b: string, n: number, spin: number, r = 2200) {
  c.save();
  for (let i = 0; i < n; i++) { const t0 = spin + (i / n) * TAU; const t1 = spin + ((i + 1) / n) * TAU; c.fillStyle = i % 2 ? a : b; c.beginPath(); c.moveTo(cx, cy); c.arc(cx, cy, r, t0, t1); c.closePath(); c.fill(); }
  c.restore();
}

const Gs: Record<string, HandGround> = {
  'gameshow/quiet-set': (e) => { backdrop(e, checkerTile(e.paper, pale(e), 120), 10, 0); floor(e); },
  'gameshow/checker-set': (e) => { backdrop(e, checkerTile(e.paper, pale(e), 90), 36, 0); floor(e); },
  'gameshow/stripe-set': (e) => { backdrop(e, stripeTile(e.paper, pale(e), 44), 50, 0); floor(e); },
  'gameshow/dot-set': (e) => { backdrop(e, dotTile(e.paper, pale(e), 110, 0.5), 0, 26); floor(e); },
  'gameshow/split-screen': (e) => { backdrop(e, checkerTile(e.paper, pale(e), 110), 20, 0); splitSet(e); floor(e); },
  // the judgement: the set's own rays turn behind, stars round the edge
  'gameshow/judge-rays': (e) => {
    flood(e, e.paper);
    rays(e.ctx, W * 0.5, H * 0.5, e.paper, pale(e), 20, e.now * 0.6);
    const c = e.ctx;
    for (let i = 0; i < 8; i++) { const [x, y] = [hash(i, e.seed) * W, hash(i, e.seed + 1) * H * 0.75]; hardShadow(c, key(e), 8, 8, () => { starPath(c, x, y, 36 + 30 * hash(i, 3), 16 + 12 * hash(i, 3), e.now * 1.2 + i); c.fill(); }); c.fillStyle = e.slots.accent; starPath(c, x, y, 36 + 30 * hash(i, 3), 16 + 12 * hash(i, 3), e.now * 1.2 + i); c.fill(); }
    floor(e);
  },
};

const INS: Record<string, HandIn> = {
  // a circle pops open from the middle and the new set is inside it
  'iris-pop': { sec: 0.26, draw: (e, q) => atBase(e, (c) => { const r = ease(q, 2) * 1300; c.fillStyle = e.slots.plate; c.beginPath(); c.rect(-20, -20, W + 40, H + 40); c.arc(W / 2, H / 2, r, 0, TAU, true); c.fill(); c.lineWidth = LINE; c.strokeStyle = key(e); c.beginPath(); c.arc(W / 2, H / 2, r, 0, TAU); c.stroke(); }) },
};

const PIECES: Record<string, Piece> = {
  // the judgement: a huge star slams in past its size and the rays spin up behind it
  'judge-star': { sec: 1.4, clear: 0.85, draw: (e, q) => {
    const c = e.ctx;
    const k = q < 0.18 ? ease(q / 0.18, 3) * (1 + 0.35 * Math.sin((q / 0.18) * Math.PI)) : q < 0.78 ? 1 : 1 - easeIn((q - 0.78) / 0.22, 2);
    if (k <= 0) return;
    c.save();
    c.globalAlpha = 0.9 * k;
    rays(c, W * 0.5, H * 0.5, e.slots.faint, e.paper, 24, q * 9);
    c.restore();
    const r = 700 * k;
    hardShadow(c, key(e), 18, 18, () => { starPath(c, W / 2, H / 2, r, r * 0.46, -Math.PI / 2 + q * 0.4); c.fill(); });
    c.fillStyle = e.slots.accent;
    starPath(c, W / 2, H / 2, r, r * 0.46, -Math.PI / 2 + q * 0.4);
    c.fill();
    c.lineWidth = LINE * 1.3;
    c.strokeStyle = key(e);
    c.stroke();
  } },
  // the contestants' panels come down from the rig and shuffle places
  'panel-shuffle': { sec: 1.8, clear: 0.7, draw: (e, q) => { splitSet(e, ease(Math.min(1, q * 2), 3)); } },
  // two bands run across top and bottom in opposite directions, striped, no bulbs
  'marquee-run': { sec: 2.2, clear: 0.5, draw: (e, q) => {
    const c = e.ctx;
    const k = span(q, 0.2, 0.8);
    const t = stripeTile(e.slots.accent, e.slots.faint, 30);
    for (const [y, dir] of [[40, 1], [H - 150, -1]] as [number, number][]) {
      hardShadow(c, key(e), 10, 10, () => c.fillRect(-20, y, (W + 40) * k, 110));
      c.save();
      c.beginPath();
      c.rect(-20, y, (W + 40) * k, 110);
      c.clip();
      tileGround(c, t, dir * q * 600, 0);
      c.restore();
      c.lineWidth = LINE;
      c.strokeStyle = key(e);
      c.strokeRect(-20, y, (W + 40) * k, 110);
    }
  } },
  // confetti from the rig: flat rectangles in the set's three tones, turning as they fall
  'confetti-drop': { sec: 2.4, clear: 0.6, draw: (e, q) => {
    const c = e.ctx;
    const tones = [e.slots.accent, e.slots.ink2, e.slots.faint, e.slots.plate];
    for (let i = 0; i < 140; i++) {
      const t = (q * 1.3 - hash(i, e.seed) * 0.4);
      if (t <= 0 || t > 1) continue;
      const [x, y] = [hash(i, e.seed + 1) * W + 60 * Math.sin(t * 6 + i), -60 + t * (H + 120)];
      c.save();
      c.translate(x, y);
      c.rotate(t * 7 + i);
      c.scale(1, Math.sin(t * 9 + i));
      hardShadow(c, key(e), 4, 4, () => c.fillRect(-16, -10, 32, 20));
      c.fillStyle = tones[i % 4];
      c.fillRect(-16, -10, 32, 20);
      c.restore();
    }
  } },
};

/** The question card: white, round-cornered, a key line, a colour tab along the top, the shadow hard. */
const quizCard: ObjectPaint = (c, w, h, s, seed, look) => {
  const k = isLight(s.plate) ? s.plateInk : s.ink;
  hardShadow(c, k, 14, 14, () => { c.beginPath(); c.roundRect(0, 0, w, h, 34); c.fill(); });
  c.fillStyle = s.plate;
  c.beginPath();
  c.roundRect(0, 0, w, h, 34);
  c.fill();
  c.save();
  c.clip();
  c.fillStyle = s.accent;
  c.fillRect(0, 0, w, 26 + 8 * look);
  c.restore();
  c.lineWidth = LINE;
  c.strokeStyle = k;
  c.stroke();
  void seed;
};
/** The strip across the set: a band with striped ends, outlined, the shadow hard. */
const marqueeStrip: ObjectPaint = (c, w, h, s) => {
  const k = isLight(s.plate) ? s.plateInk : s.ink;
  hardShadow(c, k, 12, 12, () => c.fillRect(0, 0, w, h));
  c.fillStyle = s.plate;
  c.fillRect(0, 0, w, h);
  const t = stripeTile(s.accent, s.faint, 22);
  for (const x of [0, w - 90]) { c.save(); c.beginPath(); c.rect(x, 0, 90, h); c.clip(); c.fillStyle = c.createPattern(t, 'repeat')!; c.fillRect(x, 0, 90, h); c.restore(); }
  c.lineWidth = LINE;
  c.strokeStyle = k;
  c.strokeRect(0, 0, w, h);
};
/** The score chip: a rounded plate in the accent with the key line. */
const scorePlate: ObjectPaint = (c, w, h, s) => {
  const k = isLight(s.plate) ? s.plateInk : s.ink;
  hardShadow(c, k, 10, 10, () => { c.beginPath(); c.roundRect(0, 0, w, h, h * 0.4); c.fill(); });
  c.fillStyle = s.plate;
  c.beginPath();
  c.roundRect(0, 0, w, h, h * 0.4);
  c.fill();
  c.lineWidth = LINE;
  c.strokeStyle = k;
  c.stroke();
};
export const GAMESHOW = { grounds: Gs, ins: INS, pieces: PIECES, objects: { 'quiz-card': quizCard, 'marquee-strip': marqueeStrip, 'score-plate': scorePlate } as Record<string, ObjectPaint> };
