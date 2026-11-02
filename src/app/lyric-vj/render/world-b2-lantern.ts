// paper-lantern: a tunnel book lit from behind. Seven sheets stand one behind the other, dark at the front and glowing at the
// back, and the words are the shape cut in the layer nearest the lamp. The sheets rise to make room for the words: what is
// being read always stands on the lit paper. The depth is real: each sheet is a picture of its own moving at its own rate.
import type { Piece } from './world-pieces';
import { clamp01, ease, easeIn, fibred, flood, H, hash, HandGround, HandIn, kept, lifted, mixHex, ObjectPaint, Pt, TAU, trace, W, WorldEnv, atBase } from './world-craft';

const LW = W + 460;
const LH = 760;
const N = 6;
/** Depth 0 is the front sheet. */
const toneAt = (e: WorldEnv, d: number) => mixHex(e.slots.ink2, e.slots.faint, (d / (N - 1)) ** 1.6);
const ridgeY = (x: number, d: number, seed: number) => { let y = 0; [[1, 90], [2.3, 56], [4.1, 30], [7.7, 14]].forEach(([f, a], i) => { y += a * Math.sin(((x / LW) * TAU * f) + hash(i + d, seed) * TAU); }); return y; };
type Kind = 'hill' | 'pine' | 'roof' | 'reed';
const KIND_OF: Kind[][] = [['reed', 'pine', 'hill', 'roof', 'pine', 'hill'], ['hill', 'roof', 'pine', 'hill', 'roof', 'pine'], ['pine', 'hill', 'reed', 'pine', 'hill', 'roof']];
function edgeOf(d: number, seed: number): Pt[] {
  const kind = KIND_OF[seed % 3][d];
  const pts: Pt[] = [];
  const base = 150;
  if (kind === 'hill') { for (let x = 0; x <= LW; x += 10) pts.push([x, base + ridgeY(x, d, seed)]); return pts; }
  if (kind === 'roof') {
    let x = 0; let i = 0;
    while (x < LW) { const w = 90 + 110 * hash(i, seed + d); const h = base - 30 - 70 * hash(i, seed + d + 1); pts.push([x, h + 40], [x + w * 0.5, h - 26 * (i % 2 ? 1 : 0.4)], [x + w, h + 40], [x + w, h + 90]); x += w; i++; }
    return pts;
  }
  const tall = kind === 'pine' ? 130 : 70;
  const gap = kind === 'pine' ? 66 : 15;
  for (let x = 0, i = 0; x <= LW; x += gap, i++) {
    const h = base + ridgeY(x, d, seed) * 0.5;
    if (kind === 'pine') { const t = tall * (0.5 + 0.8 * hash(i, seed + d)); pts.push([x, h], [x + gap * 0.26, h - t * 0.4], [x + gap * 0.12, h - t * 0.4], [x + gap * 0.5, h - t], [x + gap * 0.88, h - t * 0.4], [x + gap * 0.74, h - t * 0.4]); } else pts.push([x, h], [x + gap * 0.5, h - tall * (0.4 + hash(i, seed + d))]);
  }
  return pts;
}
/** One sheet: cut along its top edge, fibre showing where the lamp comes through, the rim catching light, a shadow thrown back. */
const sheet = (e: WorldEnv, d: number) => { const seed = e.seed % 3; return kept(`pl|${e.slots.ink2}|${e.slots.faint}|${e.paper}|${d}|${seed}`, LW, LH, (o) => {
  const tone = toneAt(e, d);
  const body = [...edgeOf(d, seed), [LW, LH], [0, LH]] as Pt[];
  const cv = new OffscreenCanvas(LW, LH);
  const c = cv.getContext('2d')!;
  c.drawImage(fibred(`pl-${LW}`, tone, mixHex(tone, e.paper, 0.5), 1500, LW, LH), 0, 0);
  const lit = c.createLinearGradient(0, 0, 0, 340);
  lit.addColorStop(0, `${mixHex(tone, e.paper, 0.14)}`);
  lit.addColorStop(1, `${tone}00`);
  c.fillStyle = lit;
  c.fillRect(0, 0, LW, 340);
  c.globalCompositeOperation = 'destination-in';
  trace(c, body);
  c.fill();
  c.globalCompositeOperation = 'source-over';
  o.shadowColor = 'rgba(0,0,0,0.5)';
  o.shadowBlur = 44 - d * 3;
  o.shadowOffsetY = -14;
  o.drawImage(cv, 0, 0);
  o.shadowColor = 'transparent';
  // the lamp catches the cut edge only along the broad shapes: on fine cuts a rim would be a scribble
  if (KIND_OF[seed][d] === 'hill' || KIND_OF[seed][d] === 'roof') { o.strokeStyle = mixHex(tone, e.paper, 0.5); o.lineWidth = 2; o.lineJoin = 'round'; trace(o, edgeOf(d, seed), false); o.stroke(); }
}); };
const hanging = (e: WorldEnv, d: number) => kept(`pl-top|${e.slots.ink2}|${e.slots.faint}|${e.paper}|${d}`, LW, 300, (o) => {
  const tone = toneAt(e, d);
  o.shadowColor = 'rgba(0,0,0,0.5)';
  o.shadowBlur = 36;
  o.shadowOffsetY = 12;
  o.fillStyle = tone;
  o.beginPath();
  o.moveTo(0, 0);
  o.lineTo(LW, 0);
  o.lineTo(LW, 60);
  const r = 90 + d * 26;
  for (let x = LW; x > -r; x -= r * 1.5) o.arc(x - r * 0.75, 60 + 30 * Math.sin(x * 0.004 + d), r * 0.78, 0, Math.PI);
  o.closePath();
  o.fill();
});
const glow = (e: WorldEnv, x: number, y: number, breath: number) => {
  const c = e.ctx;
  c.fillStyle = e.paper;
  c.fillRect(-W * 0.2, -H * 0.2, W * 1.4, H * 1.4);
  const r = 760 + 90 * breath;
  const g = c.createRadialGradient(x, y, 10, x, y, r);
  g.addColorStop(0, mixHex(e.paper, e.slots.plate, 0.7));
  g.addColorStop(0.5, e.paper);
  g.addColorStop(1, mixHex(e.paper, e.slots.accent, 0.55));
  c.fillStyle = g;
  c.fillRect(-W * 0.2, -H * 0.2, W * 1.4, H * 1.4);
};
const breathOf = (e: WorldEnv) => 0.5 + 0.5 * Math.sin(e.now * 1.3) * (0.6 + 0.4 * e.level) + 0.3 * e.pulse;
/** Where the lit opening has to stay: sheets stop under the words and over them. */
const keepOut = (e: WorldEnv) => { const r = e.rect && e.weight > 0 ? e.rect : undefined; return { low: r ? r.y1 + 44 : H * 0.72, high: r ? r.y0 - 40 : H * 0.14 }; };
function tunnel(e: WorldEnv, opt: { x?: number; rise?: number; count?: number } = {}) {
  atBase(e, (c) => {
    const { low, high } = keepOut(e);
    const sway = Math.sin(e.now * 0.27 + e.seed) * (1 + e.level);
    const b = breathOf(e);
    glow(e, W / 2 + sway * 50, Math.min(H * 0.56, (low + high) / 2), b);
    const n = opt.count ?? N;
    for (let d = n - 1; d >= 0; d--) {
      const near = 1 - d / (N - 1);
      const px = sway * (20 + 100 * near) + (opt.x ?? 0) * (d % 2 ? 1 : -1) * (0.6 + near);
      // the sheets stand at different heights, the nearest lowest, never into the words; they keep to the bottom third
      // and the hangings to the top edge, so the lit opening holds the middle of the frame
      const top = Math.max(low, H * (0.66 + 0.06 * (d === N - 1 ? 0 : N - 1 - d)) ) + (opt.rise ?? 0) * (1 + d * 0.2);
      const k = ease((e.age - d * 0.04) / 0.5, 3);
      const y = top + (1 - k) * 60 + 3 * Math.sin(e.now * 0.8 + d);
      c.drawImage(sheet(e, d), -230 + px, y - 100);
      if (d < 4) { const ty = Math.min(high, H * (0.14 - 0.03 * (3 - d))) - 300 - (opt.rise ?? 0); c.drawImage(hanging(e, d), -230 - px * 0.7, ty + 16 * Math.sin(e.now * 0.5 + d)); }
    }
    const sides = (Math.sin(e.now * 0.2) + 1) * 8;
    const g = c.createLinearGradient(0, 0, 150, 0);
    g.addColorStop(0, e.slots.ink2);
    g.addColorStop(1, `${e.slots.ink2}00`);
    c.fillStyle = g;
    c.fillRect(0, 0, 150 + sides, H);
    c.save(); c.translate(W, 0); c.scale(-1, 1); c.fillRect(0, 0, 150 + sides, H); c.restore();
  });
}
const GROUNDS: Record<string, HandGround> = {
  'paper-lantern/tunnel': (e) => tunnel(e),
  'paper-lantern/low-lamp': (e) => { tunnel(e, { count: 4 }); },
  'paper-lantern/full-layers': (e) => { tunnel(e, { rise: -30 }); },
  'paper-lantern/warm-pulse': (e) => { tunnel(e); flood(e, e.slots.accent, 0.1 * e.pulse); },
  'paper-lantern/one-layer': (e) => { tunnel(e, { count: 2 }); },
  'paper-lantern/all-lamps': (e) => { tunnel(e, { rise: -50 }); atBase(e, (c) => { c.save(); c.globalCompositeOperation = 'lighter'; const g = c.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, 900); g.addColorStop(0, e.slots.accent); g.addColorStop(1, `${e.slots.accent}00`); c.globalAlpha = 0.34 + 0.2 * e.pulse; c.fillStyle = g; c.fillRect(0, 0, W, H); c.restore(); }); },
  'paper-lantern/ember': (e) => { tunnel(e, { count: 3 }); },
};
const INS: Record<string, HandIn> = {
  'lamp-change': { sec: 0.44, draw: (e, q) => { flood(e, e.slots.ink2, 1 - ease(q, 2)); } },
};
const PIECES: Record<string, Piece> = {
  // the room is dark; the lamp comes up behind the last sheet and the light works forward through them
  'lamp-bloom': { sec: 2.4, clear: 0.9, draw: (e, q) => {
    const c = e.ctx;
    const k = q < 0.16 ? 1 : 1 - ease((q - 0.16) / 0.7, 2);
    const r = 60 + (1 - k) * 1500;
    const g = c.createRadialGradient(W / 2, H * 0.5, r * 0.2, W / 2, H * 0.5, r);
    g.addColorStop(0, `${e.slots.ink2}00`);
    g.addColorStop(1, e.slots.ink2);
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    c.save();
    c.globalCompositeOperation = 'lighter';
    const h = c.createRadialGradient(W / 2, H * 0.5, 10, W / 2, H * 0.5, r * 0.8);
    h.addColorStop(0, e.slots.accent);
    h.addColorStop(1, `${e.slots.accent}00`);
    c.globalAlpha = 0.7 * Math.sin(q * Math.PI);
    c.fillStyle = h;
    c.fillRect(0, 0, W, H);
    c.restore();
  } },
  // the camera goes in: each sheet swells and slides past, the lamp ahead getting nearer
  'depth-rush': { sec: 2.2, clear: 0.95, draw: (e, q) => {
    const c = e.ctx;
    glow(e, W / 2, H * 0.52, 1);
    for (let d = N - 1; d >= -6; d--) {
      const at = d / 3 + 2 - q * 4.6;
      if (at <= 0.02) continue;
      const s = 1 / at;
      if (s > 7) continue;
      const seedd = ((d % N) + N) % N;
      c.save();
      c.translate(W / 2, H * 0.5);
      c.scale(s, s);
      c.globalAlpha = clamp01((at - 0.12) / 0.2) * clamp01(4 - at * 0.8);
      c.drawImage(sheet(e, seedd), -LW / 2, 90);
      c.drawImage(hanging(e, seedd), -LW / 2, -400);
      c.restore();
    }
  } },
  'layers-part': { sec: 2.2, clear: 0.92, draw: (e, q) => {
    // the top sheets let down one behind the other like stage cloths, then taken up again
    const c = e.ctx;
    const k = (d: number) => { const t = (q - (N - 1 - d) * 0.05); return t < 0.46 ? ease(t / 0.46, 3) : 1 - easeIn((t - 0.46) / 0.5, 3); };
    for (let d = N - 1; d >= 0; d--) {
      const y = -360 + k(d) * (H * (0.62 + 0.09 * (N - 1 - d)) + 360) * (1 - d * 0.03);
      const top = hanging(e, d);
      c.fillStyle = toneAt(e, d);
      c.fillRect(-20, -20, W + 40, y + 80);
      c.drawImage(top, -230, y);
    }
  } },
  'pop-rise': { sec: 2, clear: 0.9, draw: (e, q) => {
    const c = e.ctx;
    glow(e, W / 2, H * 0.5, 1);
    for (let d = N - 1; d >= 0; d--) {
      const t = clamp01((q - (N - d) * 0.09) / 0.34);
      const spring = 1 - Math.exp(-5 * t) * Math.cos(t * 12);
      const fall = easeIn((q - 0.74) / 0.26, 2);
      const y = H + 40 - spring * (620 - d * 86) + fall * 700 * (1 + d * 0.1);
      c.drawImage(sheet(e, d), -230, y - 40);
    }
  } },
};
const panel: ObjectPaint = (c, w, h, s, seed, look) => {
  // lit paper in a cut frame: hottest in the middle, the frame's scallops throwing their shadow in
  lifted(c, 30, 0, 10, 0.5, () => { c.fillStyle = s.plate; c.fillRect(0, 0, w, h); });
  const g = c.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, Math.max(w, h) * 0.7);
  g.addColorStop(0, s.plate);
  g.addColorStop(1, mixHex(s.plate, s.accent, 0.55));
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
  c.drawImage(fibred('pl-p', s.plate, s.accent, 900, Math.ceil(w), Math.ceil(h)), 0, 0, w, h);
  c.fillStyle = g;
  c.globalAlpha = 0.6;
  c.fillRect(0, 0, w, h);
  c.globalAlpha = 1;
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.45)';
  c.shadowBlur = 22;
  c.shadowOffsetY = 8;
  c.fillStyle = s.ink2;
  const r = [26, 34, 20][look];
  c.beginPath();
  c.rect(0, 0, w, 12); c.rect(0, h - 12, w, 12); c.rect(0, 0, 12, h); c.rect(w - 12, 0, 12, h);
  for (let x = r; x < w; x += r * 2) { c.moveTo(x + r, 10); c.arc(x, 10, r, 0, Math.PI); c.moveTo(x + r, h - 10); c.arc(x, h - 10, r, 0, Math.PI, true); }
  c.fill();
  c.restore();
  void seed;
};
export const LANTERN = { grounds: GROUNDS, ins: INS, pieces: PIECES, objects: { 'lit-paper': panel } as Record<string, ObjectPaint> };
