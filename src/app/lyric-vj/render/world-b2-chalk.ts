// chalkboard: a real board. Chalk sits on the slate's tooth, the side of the stick fills a field, the eraser leaves arcs of pale
// smear, the dust falls. Writing and wiping are the world's only two acts, and the words can be written by wiping too.
import type { Piece } from './world-pieces';
import { atBase, boxOf, clamp01, dryMark, ease, easeIn, flood, H, hash, HandGround, HandIn, kept, lifted, mixHex, ObjectPaint, partOf, Pt, shaken, span, strokePts, TAU, W, WorldEnv } from './world-craft';
import { smoothNoise } from './world-ink';

const board = (e: WorldEnv, smear: number) => kept(`cb|${e.paper}|${e.slots.faint}|${smear}|${e.seed % 3}`, W + 240, H + 240, (c) => {
  c.fillStyle = e.paper;
  c.fillRect(0, 0, W + 240, H + 240);
  // years of wiping: broad arcs of grey, one over the other
  c.strokeStyle = e.slots.faint;
  c.lineCap = 'round';
  c.filter = 'blur(10px)';
  for (let i = 0; i < 14 + smear * 10; i++) {
    c.globalAlpha = 0.05 + 0.09 * hash(i, 2);
    c.lineWidth = 70 + 110 * hash(i, 3);
    const [x, y] = [hash(i, 4 + e.seed % 3) * (W + 240), hash(i, 5) * (H + 240)];
    c.beginPath();
    c.arc(x, y + 500, 520 + 300 * hash(i, 6), -2.3, -0.9);
    c.stroke();
  }
  c.filter = 'none';
  c.globalAlpha = 1;
  const img = c.getImageData(0, 0, W + 240, H + 240);
  for (let i = 0; i < img.data.length; i += 4) { const k = (hash(i, 7) - 0.5) * 7; img.data[i] += k; img.data[i + 1] += k; img.data[i + 2] += k; }
  c.putImageData(img, 0, 0);
});
const ledge = (e: WorldEnv) => atBase(e, (c) => {
  // the tray at the foot, sticks lying in it, the shadow it throws up the slate
  const y = H - 54;
  lifted(c, 18, 0, -10, 0.5, () => { c.fillStyle = mixHex(e.paper, e.slots.ink2, 0.28); c.fillRect(-10, y, W + 20, 70); });
  c.fillStyle = 'rgba(0,0,0,0.3)';
  c.fillRect(-10, y, W + 20, 8);
  [[260, e.ink, 150], [470, e.slots.ink2, 90], [1490, e.slots.accent, 120]].forEach(([x, tone, l]) => { c.save(); c.translate(x as number, y + 28); c.rotate(-0.04); lifted(c, 6, 0, 4, 0.5, () => { c.fillStyle = tone as string; c.beginPath(); c.roundRect(0, -9, l as number, 18, 7); c.fill(); }); c.restore(); });
  c.fillStyle = mixHex(e.paper, e.slots.ink2, 0.5);
  c.fillRect(1650, y - 26, 170, 44);
});
const stave = (e: WorldEnv) => kept(`cb-st|${e.ink}|${e.seed % 3}`, W, H, (c) => {
  const g = c as unknown as CanvasRenderingContext2D;
  dryMark(g, (d) => {
    [0.16, 0.5, 0.84].forEach((y, s) => { for (let l = 0; l < 5; l++) { const pts: Pt[] = []; for (let x = -40; x <= W + 40; x += 30) pts.push([x, H * y + l * 40 - 80 + 12 * Math.sin(x * 0.002 + s) + 6 * smoothNoise(x / 90, l, s)]); strokePts(d, pts, 7, e.ink); } });
  }, 2, 1, 0.7);
});
/** The side of a stick dragged over a field, with the hand's overlap showing. */
const sideFill = (e: WorldEnv, tone: string, seed: number) => kept(`cb-sf|${tone}|${seed}|${e.seed % 3}`, W, H, (c) => {
  dryMark(c as unknown as CanvasRenderingContext2D, (d) => {
    for (let i = 0; i < 6; i++) { const y0 = 130 + i * 170; const pts: Pt[] = []; for (let x = -100; x <= W + 100; x += 40) pts.push([x, y0 + 70 * Math.sin(x * 0.003 + i + seed)]); strokePts(d, pts, 130, tone); }
  }, 4, 1, 0.5);
});
const doodlePaths = (seed: number): Pt[][] => {
  const star = (cx: number, cy: number, r: number): Pt[] => Array.from({ length: 6 }, (_, i) => [cx + Math.cos(-Math.PI / 2 + (i * 4 * Math.PI) / 5) * r, cy + Math.sin(-Math.PI / 2 + (i * 4 * Math.PI) / 5) * r]);
  const spiral = (cx: number, cy: number, r: number): Pt[] => Array.from({ length: 70 }, (_, i) => { const t = i / 70; return [cx + Math.cos(t * 16) * r * t, cy + Math.sin(t * 16) * r * t]; });
  const arrow = (x: number, y: number, l: number): Pt[] => [[x, y], [x + l, y - 10], [x + l - 34, y - 38], [x + l, y - 10], [x + l - 30, y + 22]];
  const loops = (x: number, y: number, l: number): Pt[] => Array.from({ length: 90 }, (_, i) => { const t = i / 90; return [x + t * l + Math.cos(t * 28) * 36, y + Math.sin(t * 28) * 36]; });
  return [[star(170, 170, 110), spiral(1760, 200, 100), arrow(90, 900, 260), loops(1300, 960, 480)], [spiral(150, 880, 110), star(1750, 860, 120), loops(120, 150, 480), arrow(1490, 130, 300)], [loops(1250, 120, 560), star(1770, 520, 90), star(150, 520, 90), spiral(960, 980, 70)]][seed % 3];
};
function doodles(e: WorldEnv, k: number, a = 0.9) {
  atBase(e, (c) => dryMark(c, (d) => { doodlePaths(e.seed).forEach((p, i) => strokePts(d, shaken(partOf(p, clamp01(k * 1.4 - i * 0.14)), 3, i), 13, [e.ink, e.slots.ink2, e.slots.accent, e.ink][i])); }, 2, 0.9, a));
}
/** The patch wiped clean for the words: the eraser's strokes side by side, each a crisp band ending raggedly (no glow). */
export function wiped(e: WorldEnv) {
  if (!e.rect || e.weight <= 0) return;
  const b = boxOf(e, 110, 80);
  atBase(e, (c) => {
    c.save();
    c.globalAlpha = Math.min(1, e.weight * 3);
    c.fillStyle = e.paper;
    const band = 46;
    for (let y = b.y0, i = 0; y < b.y1; y += band - 4, i++) {
      const [l, r] = [b.x0 - 20 - 40 * hash(i, e.seed), b.x1 + 20 + 40 * hash(i, e.seed + 1)];
      c.fillRect(l, y, r - l, Math.min(band, b.y1 - y));
    }
    c.restore();
  });
}
const lightOn = (e: WorldEnv) => atBase(e, (c) => { c.save(); c.globalCompositeOperation = 'lighter'; for (let i = 0; i < 3; i++) { const x = (e.now * 16 + i * 620) % (W + 900) - 500; c.fillStyle = mixHex(e.paper, e.slots.plate, 0.1); c.globalAlpha = 0.4; c.beginPath(); c.moveTo(x, -20); c.lineTo(x + 340, -20); c.lineTo(x + 40 + 340, H + 20); c.lineTo(x + 40, H + 20); c.closePath(); c.fill(); } c.restore(); });
const Gs: Record<string, HandGround> = {
  'chalkboard/slate': (e) => { e.ctx.drawImage(board(e, 0), -120, -120); wiped(e); ledge(e); },
  'chalkboard/smeared': (e) => { e.ctx.drawImage(board(e, 1), -120, -120); atBase(e, (c) => c.drawImage(sideFill(e, e.slots.faint, 1), 0, 0)); wiped(e); ledge(e); },
  'chalkboard/stave': (e) => { e.ctx.drawImage(board(e, 0), -120, -120); atBase(e, (c) => c.drawImage(stave(e), 0, 0)); wiped(e); ledge(e); },
  'chalkboard/sun-patches': (e) => { e.ctx.drawImage(board(e, 1), -120, -120); lightOn(e); wiped(e); ledge(e); },
  'chalkboard/colour-field': (e) => { e.ctx.drawImage(board(e, 1), -120, -120); atBase(e, (c) => { c.drawImage(sideFill(e, e.slots.ink2, 2), 0, 0); c.drawImage(sideFill(e, e.slots.accent, 3), 0, 180); }); wiped(e); ledge(e); },
  'chalkboard/doodled': (e) => { e.ctx.drawImage(board(e, 0), -120, -120); doodles(e, ease(e.age / 1.2, 1.4)); wiped(e); ledge(e); },
  'chalkboard/all-chalk': (e) => { e.ctx.drawImage(board(e, 1), -120, -120); atBase(e, (c) => { c.drawImage(sideFill(e, e.slots.ink2, 2), 0, -100); c.drawImage(sideFill(e, e.ink, 4), 0, 90); c.drawImage(sideFill(e, e.slots.accent, 3), 0, 280); }); wiped(e); ledge(e); },
  'chalkboard/after-class': (e) => { e.ctx.drawImage(board(e, 1), -120, -120); lightOn(e); ledge(e); },
};
const INS: Record<string, HandIn> = {
  // one pass of the eraser takes the last picture off
  'wipe-pass': { sec: 0.36, draw: (e, q) => { const c = e.ctx; atBase(e, () => { c.fillStyle = e.paper; for (let i = 0; i < 4; i++) { const x = W * (1 - ease(q + i * 0.08, 2) * 1.4); c.fillRect(x - W * 0.2, (i * H) / 4, W, H / 4 + 2); } }); } },
};
const puff = (e: WorldEnv) => kept(`cb-p|${e.ink}`, 400, 400, (c) => { const g = c.createRadialGradient(200, 200, 10, 200, 200, 200); g.addColorStop(0, e.ink); g.addColorStop(1, `${e.ink}00`); c.fillStyle = g; c.fillRect(0, 0, 400, 400); });
const zig = (n: number, seed: number): Pt[] => { const pts: Pt[] = []; for (let i = 0; i <= n; i++) pts.push([i % 2 ? W + 80 : -80, (i / n) * (H + 80) - 40 + (hash(i, seed) - 0.5) * 30]); return pts; };
const PIECES: Record<string, Piece> = {
  // the side of the stick hauled back and forth till the board is colour, three sticks one after another
  'chalk-storm': { sec: 2.5, clear: 0.94, draw: (e, q) => {
    const c = e.ctx;
    const out = 1 - easeIn((q - 0.8) / 0.2, 2);
    dryMark(c, (d) => {
      strokePts(d, partOf(zig(11, 1), ease(q * 1.8, 1.4)), 120, e.slots.ink2);
      strokePts(d, partOf(zig(8, 2), ease((q - 0.16) * 2, 1.4)), 90, e.slots.accent);
      strokePts(d, partOf(zig(7, 3), ease((q - 0.3) * 2.2, 1.4)), 70, e.ink);
    }, 3, 0.7, out);
  } },
  // the eraser goes round in big arcs through a board gone grey with dust
  'eraser-arcs': { sec: 2.4, clear: 0.92, draw: (e, q) => {
    const c = e.ctx;
    const haze = span(q, 0.14, 0.86);
    flood(e, e.ink, 0.46 * haze);
    dryMark(c, (d) => { const arcs: Pt[] = []; for (let i = 0; i <= 200; i++) { const t = i / 200; arcs.push([W * (0.04 + 0.92 * t), H * 0.5 + Math.sin(t * 24) * H * 0.52]); } strokePts(d, partOf(arcs, ease((q - 0.12) * 1.6, 1.2)), 200, e.paper, 'square'); }, 5, 0.3);
    const k = clamp01((q - 0.12) * 1.6);
    const [x, y] = [W * (0.04 + 0.92 * k), H * 0.5 + Math.sin(k * 24) * H * 0.52];
    if (k < 1) { c.save(); c.translate(x, y); c.rotate(Math.cos(k * 24) * 0.7); lifted(c, 20, 6, 10, 0.5, () => { c.fillStyle = mixHex(e.slots.plate, e.paper, 0.7); c.beginPath(); c.roundRect(-60, -130, 120, 260, 12); c.fill(); }); c.restore(); }
  } },
  // two erasers clapped: a cloud rolls out and settles
  'dust-clap': { sec: 2.4, clear: 0.9, draw: (e, q) => {
    const c = e.ctx;
    const k = ease(q * 1.2, 2);
    const fade = 1 - easeIn((q - 0.5) / 0.5, 1.6);
    const sprite = puff(e);
    for (let i = 0; i < 60; i++) {
      const a = hash(i, 2) * TAU;
      const d = k * (160 + 900 * hash(i, 3));
      const r = 260 + 520 * hash(i, 4) * k;
      c.globalAlpha = 0.22 * fade;
      c.drawImage(sprite, W / 2 + Math.cos(a) * d * 1.3 - r / 2, H * 0.55 + Math.sin(a) * d * 0.7 - r / 2 + q * 120, r, r);
    }
    c.fillStyle = e.ink;
    for (let i = 0; i < 700; i++) { const a = hash(i, 5) * TAU; const d = k * (120 + 1100 * hash(i, 6)); c.globalAlpha = 0.8 * fade * hash(i, 7); c.fillRect(W / 2 + Math.cos(a) * d * 1.3, H * 0.55 + Math.sin(a) * d * 0.7 + q * q * 500 * hash(i, 8), 2 + 4 * hash(i, 9), 2 + 4 * hash(i, 10)); }
    c.globalAlpha = 1;
  } },
  // the teacher's hand: ring it, underline it twice, arrows at it from both sides
  'ring-word': { sec: 2.5, clear: 0, draw: (e, q) => {
    const c = e.ctx;
    const b = boxOf(e, 70, 60);
    const [cx, cy, rx, ry] = [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.x1 - b.x0) / 2 + 40, (b.y1 - b.y0) / 2 + 40];
    const ring: Pt[] = Array.from({ length: 150 }, (_, i) => { const t = (i / 150) * TAU * 2.1 - 1; const g = 1 + 0.05 * Math.sin(t * 1.3) + 0.02 * i / 150; return [cx + Math.cos(t) * rx * g, cy + Math.sin(t) * ry * g]; });
    const out = 1 - easeIn((q - 0.84) / 0.16, 2);
    const line = (x0: number, x1: number, y: number): Pt[] => Array.from({ length: 30 }, (_, i) => [x0 + ((x1 - x0) * i) / 29, y + 6 * Math.sin(i * 0.5)]);
    const low = Math.min(H - 70, b.y1 + 60);
    dryMark(c, (d) => {
      strokePts(d, shaken(partOf(ring, ease(q * 2.2, 1.6)), 3, 1), 16, e.slots.ink2);
      strokePts(d, partOf(line(b.x0, b.x1, low), ease((q - 0.42) * 5, 1.5)), 12, e.slots.accent);
      strokePts(d, partOf(line(b.x1, b.x0 + 60, low + 26), ease((q - 0.54) * 5, 1.5)), 12, e.slots.accent);
      for (const [x, s] of [[40, 1], [W - 40, -1]] as [number, number][]) { const k = ease((q - 0.6) * 5, 2); strokePts(d, [[x, cy - 140], [x + s * 180 * k, cy - 20], [x + s * 90 * k, cy - 34], [x + s * 180 * k, cy - 20], [x + s * 140 * k, cy - 110 * k]], 14, e.ink); }
    }, 2, 0.8, out);
  } },
  // the upper board slid up on its rails: the same wall, another slate under it
  'board-slide': { sec: 2.1, clear: 0.9, draw: (e, q) => {
    const c = e.ctx;
    const k = q < 0.5 ? ease(q / 0.5, 3) : 1 - easeIn((q - 0.56) / 0.44, 2);
    const y = H - k * H * 1.02;
    atBase(e, () => {
      lifted(c, 40, 0, 16, 0.6, () => { c.fillStyle = e.paper; c.fillRect(0, y, W, H); });
      c.drawImage(board(e, 1), 0, 120, W + 240, H, 0, y, W + 240, H);
      c.drawImage(sideFill(e, e.slots.ink2, 2), 0, y);
      c.fillStyle = mixHex(e.paper, e.slots.ink2, 0.28);
      c.fillRect(0, y - 16, W, 30);
    });
  } },
};
/** A block of chalk laid on with the side of the stick: the words are wiped out of it with a finger. */
const rub: ObjectPaint = (c, w, h, s, seed, look) => {
  const sc = new OffscreenCanvas(Math.ceil(w), Math.ceil(h));
  const g = sc.getContext('2d')!;
  g.strokeStyle = s.plate;
  g.lineCap = 'round';
  const n = 7;
  g.lineWidth = (h / n) * 1.5;
  for (let i = 0; i < n; i++) { const y = ((i + 0.5) / n) * h; const [a, b] = [g.lineWidth * 0.6 + 40 * hash(i, seed), w - g.lineWidth * 0.6 - 40 * hash(i, seed + 1)]; g.beginPath(); g.moveTo(a, y); g.bezierCurveTo(w * 0.3, y - 10, w * 0.7, y + 10, b, y); g.stroke(); }
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < w * h * 0.002; i++) { g.globalAlpha = 0.5; g.fillRect(hash(i, seed + 101 + look) * w, hash(i, seed + 2) * h, 1 + 4 * hash(i, 3), 1 + 2 * hash(i, 4)); }
  c.drawImage(sc, 0, 0);
};
export const CHALK = { grounds: Gs, ins: INS, pieces: PIECES, objects: { 'chalk-rub': rub } as Record<string, ObjectPaint> };
