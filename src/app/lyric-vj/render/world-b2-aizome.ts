// aizome: a length of cloth just out of the vat. All pattern is what the dye did not reach: bound, clamped, stitched, wrapped
// round a pole. It is cloth, so it hangs and moves as cloth, in folds that run across the frame; the words are resist, bare
// cloth with the blue creeping in along the threads.
import type { Piece } from './world-pieces';
import { atBase, boxOf, clamp01, ease, easeIn, flood, H, hash, HandGround, HandIn, inOut, kept, lifted, mixHex, ObjectPaint, Pt, span, TAU, trace, W, WorldEnv } from './world-craft';
import { smoothNoise } from './world-ink';

type G = OffscreenCanvasRenderingContext2D;
const CW = W + 320;
const CH = H + 320;
type Tie = 'arashi' | 'kumo' | 'itajime' | 'kanoko' | 'mokume' | 'dip';
const weave = (e: WorldEnv) => kept(`az-w|${e.paper}|${e.slots.ink2}`, 8, 8, (c) => { c.fillStyle = e.slots.ink2; c.globalAlpha = 0.12; c.fillRect(0, 0, 8, 1); c.fillRect(0, 4, 8, 1); c.fillStyle = 'white'; c.globalAlpha = 0.05; c.fillRect(0, 0, 1, 8); c.fillRect(4, 0, 1, 8); });
/** Vat mottling: the dye never takes evenly. */
const mottle = (e: WorldEnv, seed: number) => kept(`az-m|${e.paper}|${e.slots.ink2}|${e.slots.faint}|${seed}`, 320, 200, (c) => {
  const img = c.createImageData(320, 200);
  const [a, b] = [e.slots.ink2, e.slots.faint].map((t) => [1, 3, 5].map((i) => parseInt(t.slice(i, i + 2), 16)));
  for (let y = 0; y < 200; y++) for (let x = 0; x < 320; x++) {
    const n = 0.6 * smoothNoise(x / 46, y / 34, seed) + 0.3 * smoothNoise(x / 14, y / 16, seed + 1) + 0.1 * hash(x, y);
    const t = clamp01((n - 0.32) * 2.8);
    img.data.set([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, 80 + 90 * Math.abs(t - 0.5)], (y * 320 + x) * 4);
  }
  c.putImageData(img, 0, 0);
});
function resist(c: G, kind: Tie, tone: string, seed: number) {
  c.strokeStyle = tone;
  c.fillStyle = tone;
  c.lineCap = 'round';
  if (kind === 'arashi') {
    // wrapped on a pole: storm lines, close and leaning, breaking where the thread slipped
    for (let i = 0; i < 260; i++) {
      c.lineWidth = 1.4 + 3.4 * hash(i, seed);
      c.globalAlpha = 0.4 + 0.5 * hash(i, seed + 1);
      const x = hash(i, seed + 2) * (CW + CH) - CH;
      const [from, to] = [hash(i, seed + 3) * 0.5, 0.5 + hash(i, seed + 4) * 0.5];
      c.beginPath();
      for (let t = from; t <= to; t += 0.04) { const px = x + t * CH * 0.74 + 8 * Math.sin(t * 24 + i); const py = t * CH; if (t === from) c.moveTo(px, py); else c.lineTo(px, py); }
      c.stroke();
    }
  } else if (kind === 'kumo') {
    // spider webs: cloth pinched and whipped with thread, each a ring of rays
    for (let j = 0; j < 30; j++) {
      const [x, y] = [(j % 6) * 400 + ((Math.floor(j / 6) % 2) ? 200 : 0) + 60 + 60 * hash(j, seed), Math.floor(j / 6) * 300 + 80 + 60 * hash(j, seed + 1)];
      const R = 130 + 60 * hash(j, seed + 2);
      c.lineWidth = 2.6;
      for (let k = 0; k < 44; k++) { const a = (k / 44) * TAU; c.globalAlpha = 0.5 + 0.4 * hash(k, j); c.beginPath(); c.moveTo(x + Math.cos(a) * 16, y + Math.sin(a) * 16); c.lineTo(x + Math.cos(a) * R * (0.7 + 0.3 * hash(k, j + 1)), y + Math.sin(a) * R * (0.7 + 0.3 * hash(k, j + 1))); c.stroke(); }
      for (let r = 40; r < R; r += 26) { c.globalAlpha = 0.5; c.lineWidth = 6; c.beginPath(); c.arc(x, y, r, 0, TAU); c.setLineDash([3, 12]); c.stroke(); c.setLineDash([]); }
    }
  } else if (kind === 'itajime') {
    // folded and clamped between boards: repeating squares with bled rims
    const s = 300;
    for (let j = -1; j * s < CH; j++) for (let i = -1; i * s < CW; i++) {
      const [x, y] = [i * s + (j % 2 ? s / 2 : 0) + s / 2, j * s + s / 2];
      c.save();
      c.translate(x, y);
      c.rotate(Math.PI / 4);
      c.globalAlpha = 0.86;
      c.lineWidth = 16;
      c.strokeRect(-100, -100, 200, 200);
      c.globalAlpha = 0.5;
      c.lineWidth = 5;
      c.strokeRect(-70, -70, 140, 140);
      c.fillRect(-14, -14, 28, 28);
      c.restore();
    }
  } else if (kind === 'kanoko') {
    // fawn spots: thousands of tiny bound points
    for (let j = 0; j * 44 < CH; j++) for (let i = 0; i * 54 < CW; i++) {
      const [x, y] = [i * 54 + (j % 2 ? 27 : 0), j * 44];
      if (smoothNoise(x / 340, y / 260, seed) < 0.36) continue;
      c.globalAlpha = 0.9;
      c.lineWidth = 5;
      c.beginPath();
      c.arc(x, y, 7 + 3 * hash(i, j), 0, TAU);
      c.stroke();
    }
  } else if (kind === 'mokume') {
    // rows of running stitch drawn up tight: wood-grain ripples
    c.lineWidth = 7;
    for (let j = 0; j < 40; j++) {
      c.globalAlpha = 0.74;
      c.setLineDash([16, 14]);
      c.beginPath();
      for (let x = -20; x <= CW + 20; x += 24) { const y = j * 40 + 60 * smoothNoise(x / 340, j / 7, seed) + 16 * Math.sin(x * 0.02 + j); if (x < 0) c.moveTo(x, y); else c.lineTo(x, y); }
      c.stroke();
    }
    c.setLineDash([]);
  }
  c.globalAlpha = 1;
}
/** One length of cloth, dyed and patterned; the resist bleeds at its edge. */
const cloth = (e: WorldEnv, kind: Tie) => kept(`az|${kind}|${e.paper}|${e.ink}|${e.seed % 3}`, CW, CH, (c) => {
  const seed = e.seed % 3;
  c.fillStyle = e.paper;
  c.fillRect(0, 0, CW, CH);
  c.drawImage(mottle(e, seed), 0, 0, CW, CH);
  if (kind === 'dip') {
    // laid in the vat in steps: each dip leaves its tide line
    for (let i = 0; i < 6; i++) { const y = (i / 6) * CH; const g = c.createLinearGradient(0, y, 0, y + CH / 6); g.addColorStop(0, `${e.slots.ink2}00`); g.addColorStop(1, `${e.slots.ink2}55`); c.fillStyle = g; c.beginPath(); c.moveTo(0, y); for (let x = 0; x <= CW; x += 30) c.lineTo(x, y + 30 * smoothNoise(x / 90, i, seed)); c.lineTo(CW, CH); c.lineTo(0, CH); c.closePath(); c.fill(); }
  } else {
    const r = new OffscreenCanvas(CW, CH);
    resist(r.getContext('2d')!, kind, e.ink, seed + 1);
    c.save();
    c.filter = 'blur(5px)';
    c.globalAlpha = 0.7;
    c.drawImage(r, 0, 0);
    c.filter = 'blur(1.2px)';
    c.globalAlpha = 0.86;
    c.drawImage(r, 0, 0);
    c.restore();
  }
  c.fillStyle = c.createPattern(weave(e), 'repeat')!;
  c.fillRect(0, 0, CW, CH);
});
/** Cloth hanging in the air: vertical slices lifted by a travelling swell, each lit by its slope. */
function hang(e: WorldEnv, cv: OffscreenCanvas, amp: number, speed = 1) {
  atBase(e, (c) => {
    const [step, t] = [18, e.now * speed];
    const off = (x: number) => amp * (Math.sin(x * 0.0042 + t * 0.9) + 0.5 * Math.sin(x * 0.0093 - t * 1.3 + 2));
    for (let x = -18; x < W + 18; x += step) {
      const y = off(x);
      c.drawImage(cv, x + 160, 0, step + 1, CH, x, y - 160, step + 1, CH);
      const slope = (off(x + step) - y) / step;
      c.fillStyle = slope > 0 ? `rgba(0,0,0,${Math.min(0.42, slope * 1.1)})` : `rgba(255,255,255,${Math.min(0.2, -slope * 0.6)})`;
      c.fillRect(x, -10, step + 1, H + 20);
    }
  });
}
/** Plain dyed cloth round the words, where nothing was bound: the pattern stops at a crisp, slightly wandering dye line (no glow). */
export function plainRound(e: WorldEnv) {
  if (!e.rect || e.weight <= 0) return;
  // (as wide as the old feathered clearing reached: the ties' pattern stays a hand off the strokes)
  const b = boxOf(e, 150, 110);
  atBase(e, (c) => {
    c.save();
    c.globalAlpha = Math.min(1, e.weight * 3);
    c.fillStyle = e.paper;
    c.beginPath();
    const wob = (i: number) => 9 * Math.sin(i * 1.7 + e.seed) + 5 * Math.sin(i * 4.3);
    const n = 24;
    for (let i = 0; i <= n; i++) c.lineTo(b.x0 + ((b.x1 - b.x0) * i) / n, b.y0 + wob(i));
    for (let i = 0; i <= n / 4; i++) c.lineTo(b.x1 + wob(i + 40), b.y0 + ((b.y1 - b.y0) * i * 4) / n);
    for (let i = n; i >= 0; i--) c.lineTo(b.x0 + ((b.x1 - b.x0) * i) / n, b.y1 + wob(i + 80));
    for (let i = n / 4; i >= 0; i--) c.lineTo(b.x0 + wob(i + 120), b.y0 + ((b.y1 - b.y0) * i * 4) / n);
    c.closePath();
    c.fill();
    c.restore();
  });
}
const plainG = (kind: Tie, amp: number): HandGround => (e) => { hang(e, cloth(e, kind), amp * (0.5 + e.level)); plainRound(e); };
const GROUNDS: Record<string, HandGround> = {
  'aizome/arashi': plainG('arashi', 24),
  'aizome/kumo': plainG('kumo', 18),
  'aizome/itajime': plainG('itajime', 20),
  'aizome/kanoko': plainG('kanoko', 18),
  'aizome/mokume': plainG('mokume', 22),
  'aizome/dip-lines': plainG('dip', 12),
  'aizome/whole-cloth': (e) => { hang(e, cloth(e, 'arashi'), 34, 1.6); plainRound(e); },
  'aizome/still-vat': (e) => { hang(e, cloth(e, 'dip'), 5, 0.4); },
};
const INS: Record<string, HandIn> = {
  'cloth-lift': { sec: 0.46, draw: (e, q) => { const c = e.ctx; atBase(e, () => { const y = -H * easeIn(q, 2) * 1.2; lifted(c, 40, 0, 20, 0.5, () => { c.fillStyle = e.slots.ink2; c.beginPath(); c.moveTo(-20, y - 20); c.lineTo(W + 20, y - 20); for (let x = W + 20; x >= -20; x -= 40) c.lineTo(x, y + H + 40 * Math.sin(x * 0.008 + q * 6)); c.closePath(); c.fill(); }); }); } },
};
let shot: OffscreenCanvas | undefined;
const grab = (e: WorldEnv) => { const cv = (shot ??= new OffscreenCanvas(W, H)); const g = cv.getContext('2d')!; g.globalCompositeOperation = 'copy'; g.drawImage(e.ctx.canvas as CanvasImageSource, 0, 0, W, H); return cv; };
const PIECES: Record<string, Piece> = {
  // the cloth goes under: deep blue climbs it with a wicking edge, drains back paler
  'vat-dip': { sec: 2.6, clear: 0.9, draw: (e, q) => {
    const c = e.ctx;
    const up = q < 0.5 ? ease(q / 0.5, 2) : 1 - easeIn((q - 0.5) / 0.5, 2);
    const y = H * 1.12 - up * H * 1.3;
    const edge: Pt[] = [[-20, H + 20]];
    for (let x = -20; x <= W + 20; x += 8) edge.push([x, y + 46 * smoothNoise(x / 120, q * 2, 3) + 14 * smoothNoise(x / 18, 1, 4) + 26 * Math.sin(x * 0.006 + q * 7)]);
    edge.push([W + 20, H + 20]);
    trace(c, edge);
    c.fillStyle = e.slots.ink2;
    c.fill();
    c.save();
    c.clip();
    c.globalAlpha = 0.5;
    c.drawImage(cloth(e, 'dip'), -160, -160);
    c.restore();
    c.strokeStyle = e.slots.faint;
    c.lineWidth = 5;
    c.globalAlpha = 0.8;
    trace(c, edge.slice(1, -1), false);
    c.stroke();
    c.globalAlpha = 1;
  } },
  // a gust under the whole width: the swell is as high as the frame
  'cloth-billow': { sec: 2.3, clear: 0.9, draw: (e, q) => {
    const c = e.ctx;
    const cv = grab(e);
    const a = span(q, 0.3, 0.7) * 170;
    const off = (x: number) => a * Math.sin(x * 0.0058 + q * 12);
    flood(e, e.slots.ink2);
    for (let x = 0; x < W; x += 12) { const y = off(x); c.drawImage(cv, x, 0, 13, H, x, y, 13, H); const s = (off(x + 12) - y) / 12; c.fillStyle = s > 0 ? `rgba(0,0,0,${Math.min(0.6, s * 0.5)})` : `rgba(255,255,255,${Math.min(0.3, -s * 0.34)})`; c.fillRect(x, 0, 12.5, H); }
  } },
  // threads cut: every bound point opens at once, the undyed cloth blooming out of it
  'bind-bloom': { sec: 2.4, clear: 0.9, draw: (e, q) => {
    const c = e.ctx;
    const k = ease(q / 0.5, 2);
    const fade = 1 - easeIn((q - 0.7) / 0.3, 2);
    c.save();
    for (let j = 0; j < 22; j++) {
      const [x, y] = [(j % 6) * 390 + ((Math.floor(j / 6) % 2) ? 195 : 0) + 40, Math.floor(j / 6) * 350 + 110];
      const R = (120 + 180 * hash(j, 2)) * clamp01(k * 1.6 - hash(j, 3) * 0.6);
      if (R <= 0) continue;
      c.globalAlpha = 0.86 * fade;
      c.strokeStyle = e.ink;
      c.lineWidth = 3;
      for (let i = 0; i < 60; i++) { const a = (i / 60) * TAU; const l = R * (0.7 + 0.3 * hash(i, j)); c.beginPath(); c.moveTo(x + Math.cos(a) * R * 0.14, y + Math.sin(a) * R * 0.14); c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke(); }
      c.lineWidth = 8;
      c.beginPath(); c.arc(x, y, R, 0, TAU); c.setLineDash([6, 14]); c.stroke(); c.setLineDash([]);
    }
    c.restore();
    c.globalAlpha = 1;
  } },
  // the wet length wrung: the storm lines slide along it and tighten
  'wring-twist': { sec: 2.2, clear: 0.92, draw: (e, q) => {
    const c = e.ctx;
    const k = span(q, 0.36, 0.64);
    const cv = cloth(e, 'arashi');
    const bands = 16;
    c.globalAlpha = Math.min(1, k * 2);
    for (let i = 0; i < bands; i++) {
      const y = (i * H) / bands;
      const t = (i % 2 ? 1 : -1) * (q * 1200 + 240 * Math.sin(i));
      const cover = 1 - 0.5 * Math.abs(Math.sin((i / bands) * Math.PI * 2 + q * 6)) * k;
      c.save();
      c.translate(W / 2, y + H / bands / 2);
      c.scale(1, cover);
      c.drawImage(cv, 160 + ((t % 800) + 800) % 800 / 8, y, W, H / bands + 1, -W / 2, -H / bands / 2, W, H / bands + 1);
      c.restore();
      c.fillStyle = `rgba(0,0,0,${0.34 * k * Math.abs(Math.sin((i / bands) * Math.PI * 4 + q * 6))})`;
      c.fillRect(0, y, W, H / bands + 1);
    }
    c.globalAlpha = 1;
  } },
};
const stitches = (c: G, w: number, h: number, tone: string, inset: number) => { c.strokeStyle = tone; c.lineWidth = 5; c.lineCap = 'round'; c.setLineDash([26, 18]); c.strokeRect(inset, inset, w - inset * 2, h - inset * 2); c.setLineDash([]); };
const patch: ObjectPaint = (c, w, h, s, seed, look) => {
  lifted(c, 22, 4, 12, 0.5, () => { c.fillStyle = s.plate; c.fillRect(0, 0, w, h); });
  stitches(c, w, h, s.plateInk, 18);
  if (look !== 1) stitches(c, w, h, s.plateInk, 42);
  // sashiko crosses at the corners, what mended cloth really wears
  c.strokeStyle = s.plateInk;
  c.lineWidth = 4;
  for (const [x, y] of [[0, 0], [w, 0], [0, h], [w, h]] as Pt[]) for (let i = 0; i < 4; i++) { const [px, py] = [x + (x ? -1 : 1) * (70 + i * 26), y + (y ? -1 : 1) * 70]; c.beginPath(); c.moveTo(px - 8, py - 8); c.lineTo(px + 8, py + 8); c.moveTo(px + 8, py - 8); c.lineTo(px - 8, py + 8); c.stroke(); }
  void seed;
};
const towel: ObjectPaint = (c, w, h, s) => {
  lifted(c, 26, 0, 10, 0.5, () => { c.fillStyle = s.plate; c.fillRect(0, 0, w, h); });
  c.strokeStyle = s.plateInk;
  c.globalAlpha = 0.5;
  c.lineWidth = 1.4;
  for (let x = 0; x < 34; x += 5) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.moveTo(w - x, 0); c.lineTo(w - x, h); c.stroke(); }
  c.globalAlpha = 1;
};
export const AIZOME = { grounds: GROUNDS, ins: INS, pieces: PIECES, objects: { 'mend-patch': patch, tenugui: towel } as Record<string, ObjectPaint> };
void inOut;
