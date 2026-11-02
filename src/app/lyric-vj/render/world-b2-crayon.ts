// crayon: the page of a picture book a child is colouring in. Wax drags over rough paper and skips its tooth; the hand goes back
// and forth, so a colour is always hatching; a thin wash runs over everything and the wax refuses it. Nothing is drawn in order
// to depict: hills, sky, scribble, stars, the marks a child makes first. Eight drawings a second, each a little different.
import type { Piece } from './world-pieces';
import { atBase, boxOf, clamp01, dryMark, ease, easeIn, fibred, flood, H, hash, HandGround, HandIn, inOut, kept, lifted, mixHex, ObjectPaint, partOf, Pt, shaken, strokePts, TAU, W, WorldEnv } from './world-craft';
import { smoothNoise } from './world-ink';

type D = OffscreenCanvasRenderingContext2D;
/** A field coloured in: back and forth over a shape, the strokes overlapping, the hand tiring toward the end. */
function hatch(d: D, shape: (c: D) => void, x0: number, y0: number, x1: number, y1: number, tone: string, seed: number, width = 26, pitch = 20, lean = 0.5) {
  d.save();
  shape(d);
  d.clip();
  d.strokeStyle = tone;
  d.lineWidth = width;
  d.lineCap = 'round';
  d.lineJoin = 'round';
  d.beginPath();
  const n = Math.ceil((y1 - y0 + (x1 - x0) * lean) / pitch);
  for (let i = 0; i < n; i++) {
    const y = y0 - (x1 - x0) * lean + i * pitch + (hash(i, seed) - 0.5) * pitch * 0.8;
    const [a, b]: Pt[] = i % 2 ? [[x0 - 20, y + (x1 - x0) * lean], [x1 + 20, y]] : [[x1 + 20, y], [x0 - 20, y + (x1 - x0) * lean]];
    if (i) d.lineTo(a[0], a[1]); else d.moveTo(a[0], a[1]);
    d.lineTo(b[0], b[1]);
  }
  d.stroke();
  d.restore();
}
const wobbleArc = (cx: number, cy: number, r: number, a0: number, a1: number, seed: number): Pt[] => Array.from({ length: 80 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / 79; const k = r + 12 * smoothNoise(i / 9, 2, seed); return [cx + Math.cos(a) * k, cy + Math.sin(a) * k * 0.92]; });
const hill = (y: number, amp: number, seed: number): Pt[] => { const p: Pt[] = []; for (let x = -60; x <= W + 60; x += 40) p.push([x, y + amp * Math.sin(x * 0.003 + seed) + amp * 0.5 * Math.sin(x * 0.0071 + seed * 2) + 6 * hash(x, seed)]); return p; };
const star = (cx: number, cy: number, r: number, a0 = 0): Pt[] => Array.from({ length: 6 }, (_, i) => [cx + Math.cos(a0 - Math.PI / 2 + (i * 4 * Math.PI) / 5) * r, cy + Math.sin(a0 - Math.PI / 2 + (i * 4 * Math.PI) / 5) * r]);
const scribble = (cx: number, cy: number, r: number, turns: number, seed: number): Pt[] => Array.from({ length: turns * 22 }, (_, i) => { const a = (i / 22) * TAU; const k = r * (0.5 + 0.5 * smoothNoise(i / 6, 2, seed)); return [cx + Math.cos(a) * k * 1.5 + i * 0.6, cy + Math.sin(a) * k]; });
const pageOf = (e: WorldEnv) => fibred('cr-page', e.paper, e.slots.ink, 2600);
/** A picture: `draw` runs under the tooth once for each of three states of the hand. */
const drawing = (name: string, e: WorldEnv, draw: (d: D, st: number) => void, wash?: (c: D) => void) => { const st = Math.floor(e.now * 8) % 3; return kept(`cr|${name}|${e.paper}|${e.slots.ink2}|${e.slots.accent}|${e.seed % 3}|${st}`, W, H, (c) => {
  c.drawImage(pageOf(e), 0, 0);
  wash?.(c);
  dryMark(c as unknown as CanvasRenderingContext2D, (d) => draw(d, st), 3, 1);
}); };
const washOf = (e: WorldEnv, tone: string, y0: number, y1: number, a = 0.5) => (c: D) => { const g = c.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, `${tone}${Math.round(a * 255).toString(16).padStart(2, '0')}`); g.addColorStop(1, `${tone}00`); c.fillStyle = g; c.fillRect(0, y0, W, y1 - y0); void e; };
const margin = (d: D, e: WorldEnv, st: number) => { const m = 34 + st * 2; strokePts(d, shaken([[m, m], [W / 2, m + 3], [W - m, m], [W - m + 4, H / 2], [W - m, H - m], [W / 2, H - m - 3], [m, H - m], [m - 2, H / 2], [m, m]], 5, st), 12, e.slots.ink2); };
/** A bubble of clean paper round the words, its edge one pressed wobbling line. */
export function bubble(e: WorldEnv) {
  if (!e.rect || e.weight <= 0) return;
  const b = boxOf(e, 50, 34);
  atBase(e, (c) => {
    const [cx, cy, rx, ry] = [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.x1 - b.x0) / 2 + 26, (b.y1 - b.y0) / 2 + 26];
    const st = Math.floor(e.now * 8) % 3;
    const pts: Pt[] = Array.from({ length: 90 }, (_, i) => { const a = (i / 90) * TAU; const [ca, sa] = [Math.cos(a), Math.sin(a)]; const sq = (v: number) => Math.sign(v) * Math.abs(v) ** 0.42; return [cx + sq(ca) * rx + 6 * Math.sin(i * 0.9 + st * 2), cy + sq(sa) * ry + 6 * Math.cos(i * 0.7 + st)]; });
    c.globalAlpha = Math.min(1, e.weight * 4);
    c.fillStyle = e.paper;
    c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); c.fill();
    dryMark(c, (d) => { strokePts(d, [...pts, pts[0]], 14, e.slots.ink2); }, 3, 0.9);
    c.globalAlpha = 1;
  });
}
const GROUNDS: Record<string, HandGround> = {
  'crayon/hills': (e) => {
    e.ctx.drawImage(drawing('hills', e, (d, st) => {
      const s = (e.seed % 3) + st * 0.03;
      const [a, b] = [hill(H * 0.62, 70, s), hill(H * 0.8, 50, s + 2)];
      hatch(d, (c) => { c.beginPath(); a.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.lineTo(W + 60, H); c.lineTo(-60, H); c.closePath(); }, 0, H * 0.45, W, H, e.slots.ink2, st + 3);
      hatch(d, (c) => { c.beginPath(); b.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.lineTo(W + 60, H); c.lineTo(-60, H); c.closePath(); }, 0, H * 0.6, W, H, e.slots.accent, st + 5, 26, 18, -0.5);
      strokePts(d, scribble(W * 0.84, H * 0.2, 90, 9, st), 26, e.slots.accent);
      for (let i = 0; i < 3; i++) strokePts(d, scribble(W * (0.12 + 0.2 * i), H * (0.14 + 0.06 * i), 42, 5, st + i), 18, e.slots.faint);
      margin(d, e, st);
    }, washOf(e, e.slots.faint, 0, H * 0.6)), 0, 0);
    bubble(e);
  },
  'crayon/rainbow': (e) => {
    e.ctx.drawImage(drawing('rainbow', e, (d, st) => {
      [e.slots.accent, e.slots.ink2, e.slots.faint, e.ink].forEach((t, i) => strokePts(d, wobbleArc(W / 2, H * 1.16, H * (1.08 - i * 0.14), Math.PI * 1.02, Math.PI * 1.98, st + i), 90, t));
      for (let i = 0; i < 2; i++) strokePts(d, scribble(i ? W * 0.86 : W * 0.1, H * 0.88, 70, 8, st + i), 22, e.slots.ink2);
    }), 0, 0);
    bubble(e);
  },
  'crayon/hatch-field': (e) => {
    e.ctx.drawImage(drawing('hatch', e, (d, st) => {
      hatch(d, (c) => { c.beginPath(); c.rect(0, 0, W, H); }, 0, 0, W, H, e.slots.ink2, st, 42, 34, 0.34);
      hatch(d, (c) => { c.beginPath(); c.ellipse(W * 0.2, H * 0.3, 420, 300, 0.2, 0, TAU); c.ellipse(W * 0.82, H * 0.76, 500, 330, -0.2, 0, TAU); }, 0, 0, W, H, e.slots.accent, st + 2, 34, 30, -0.4);
    }), 0, 0);
    bubble(e);
  },
  'crayon/wax-night': (e) => {
    // white wax laid first, then the dark wash the wax refuses
    e.ctx.drawImage(drawing('night', e, () => undefined, (c) => {
      c.fillStyle = e.slots.ink2;
      c.globalAlpha = 0.94;
      c.fillRect(0, 0, W, H);
      c.globalAlpha = 1;
      c.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 40; i++) { const [x, y, r] = [hash(i, 1) * W, hash(i, 2) * H, 100 + 260 * hash(i, 3)]; const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `${e.slots.accent}22`); g.addColorStop(1, `${e.slots.accent}00`); c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); }
      c.globalCompositeOperation = 'source-over';
      dryMark(c as unknown as CanvasRenderingContext2D, (d) => {
        for (let i = 0; i < 26; i++) strokePts(d, star(hash(i, 4) * W, hash(i, 5) * H, 28 + 46 * hash(i, 6), hash(i, 7)), 9, e.slots.plate);
        for (let i = 0; i < 6; i++) strokePts(d, scribble(hash(i, 8) * W, hash(i, 9) * H, 54, 6, i), 8, e.slots.faint);
      }, 3, 0.9);
    }), 0, 0);
    bubble(e);
  },
  'crayon/loops': (e) => {
    e.ctx.drawImage(drawing('loops', e, (d, st) => {
      for (let j = 0; j < 5; j++) { const p: Pt[] = Array.from({ length: 330 }, (_, i) => { const t = i / 330; return [t * (W + 200) - 100 + Math.cos(t * 44 + j) * 70, H * (0.1 + j * 0.2) + Math.sin(t * 44 + j) * 80 + 26 * Math.sin(t * 7)]; }); strokePts(d, p, 18, [e.slots.ink2, e.slots.accent, e.slots.faint, e.ink, e.slots.ink2][j]); }
      void st;
    }), 0, 0);
    bubble(e);
  },
  'crayon/plain-page': (e) => {
    e.ctx.drawImage(drawing('plain', e, (d, st) => { margin(d, e, st); strokePts(d, scribble(W * 0.9, H * 0.86, 56, 7, st), 18, e.slots.accent); strokePts(d, star(W * 0.1, H * 0.16, 56, st * 0.03), 12, e.slots.ink2); }, washOf(e, e.slots.faint, H * 0.5, 0, 0.3)), 0, 0);
  },
  'crayon/everything': (e) => { GROUNDS['crayon/rainbow'](e); },
  'crayon/one-star': (e) => { GROUNDS['crayon/plain-page'](e); },
};
const INS: Record<string, HandIn> = {
  // the new page is coloured in by hand, sweep by sweep: slower than a cut, so the change keeps coming after the line lands
  'colour-over': { sec: 0.56, draw: (e, q) => { const c = e.ctx; atBase(e, () => dryMark(c, (d) => { const k = q; const pts: Pt[] = []; for (let i = 0; i <= 12; i++) pts.push([i % 2 ? W + 80 : -80, (i / 12) * H]); d.globalAlpha = 1; strokePts(d, partOf(pts, 1).map(([x, y]) => [x + k * (W + 300) * (x > 0 ? 1 : 1), y]), 120, e.paper); }, 4, 0.2)); } },
};
const wax = (e: WorldEnv) => kept(`cr-wax|${e.slots.plate}|${e.slots.faint}`, W, H, (c) => {
  dryMark(c as unknown as CanvasRenderingContext2D, (d) => { for (let i = 0; i < 34; i++) strokePts(d, star(hash(i, 14) * W, hash(i, 15) * H, 50 + 60 * hash(i, 16), hash(i, 17)), 14, e.slots.plate); for (let i = 0; i < 8; i++) strokePts(d, scribble(hash(i, 18) * W, hash(i, 19) * H, 70, 6, i), 12, e.slots.plate); }, 3, 0.8);
});
let shot: OffscreenCanvas | undefined;
const PIECES: Record<string, Piece> = {
  // a whole page scribbled over, faster and faster, one crayon then the other
  'scribble-flood': { sec: 2.4, clear: 0.94, draw: (e, q) => {
    const c = e.ctx;
    const out = 1 - easeIn((q - 0.8) / 0.2, 2);
    const path = (seed: number): Pt[] => Array.from({ length: 420 }, (_, i) => { const t = i / 420; return [W / 2 + Math.cos(t * 90 + seed) * (W * 0.56) * (0.25 + 0.75 * smoothNoise(t * 8, seed, 3)) , H * t + Math.sin(t * 130 + seed) * 150]; });
    dryMark(c, (d) => { strokePts(d, partOf(path(1), ease(q * 1.7, 1.3)), 72, e.slots.ink2); strokePts(d, partOf(path(4), ease((q - 0.2) * 1.8, 1.3)), 58, e.slots.accent); }, 3, 0.8, out);
  } },
  // a brush of thin colour goes over the page and the wax that was there all along stands out white
  'wash-resist': { sec: 2.6, clear: 0.9, draw: (e, q) => {
    const c = e.ctx;
    const x = -160 + ease(q / 0.7, 1.7) * (W + 340);
    const out = 1 - easeIn((q - 0.82) / 0.18, 2);
    c.save();
    c.globalAlpha = out;
    c.beginPath();
    c.moveTo(-10, -10);
    for (let y = -10; y <= H + 20; y += 20) c.lineTo(x + 40 * Math.sin(y * 0.02 + q * 9) + 26 * smoothNoise(y / 30, 2, 5), y);
    c.lineTo(-10, H + 10);
    c.closePath();
    c.clip();
    c.fillStyle = mixHex(e.slots.ink2, e.slots.accent, 0.3);
    c.fillRect(0, 0, W, H);
    for (let i = 0; i < 5; i++) { const g = c.createRadialGradient(W * (0.1 + 0.2 * i), H * (0.3 + 0.1 * i), 40, W * (0.1 + 0.2 * i), H * (0.3 + 0.1 * i), 500); g.addColorStop(0, `${e.slots.faint}88`); g.addColorStop(1, `${e.slots.faint}00`); c.fillStyle = g; c.fillRect(0, 0, W, H); }
    c.drawImage(wax(e), 0, 0);
    c.restore();
  } },
  // the page turns: the book's own weight, the next page under it
  'page-turn': { sec: 2.3, clear: 0.88, draw: (e, q) => {
    const c = e.ctx;
    const cv = (shot ??= new OffscreenCanvas(W, H));
    const g = cv.getContext('2d')!;
    g.globalCompositeOperation = 'copy';
    g.drawImage(c.canvas as CanvasImageSource, 0, 0, W, H);
    const k = q < 0.6 ? easeIn(q / 0.6, 1.6) : 1;
    const a = k * Math.PI;
    const front = Math.cos(a);
    c.drawImage(pageOf(e), 0, 0);
    const shade = c.createLinearGradient(0, 0, 200, 0);
    shade.addColorStop(0, 'rgba(0,0,0,0.3)');
    shade.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = shade;
    c.fillRect(0, 0, 200, H);
    if (q >= 0.6) { c.globalAlpha = 1 - clamp01((q - 0.6) / 0.14); c.fillStyle = e.paper; c.fillRect(0, 0, W, H); c.globalAlpha = 1; c.drawImage(cv, 0, 0); return; }
    c.save();
    c.transform(front, Math.sin(a) * 0.14, 0, 1, 0, 0);
    if (front > 0) c.drawImage(cv, 0, 0); else { c.fillStyle = mixHex(e.paper, e.slots.ink2, 0.3); c.fillRect(0, 0, W, H); }
    c.fillStyle = `rgba(0,0,0,${0.3 * Math.sin(a)})`;
    c.fillRect(0, 0, W, H);
    c.restore();
  } },
  // the big arcs drawn one at a time, the hand pressing hard, from corner to corner
  'rainbow-arc': { sec: 2.5, clear: 0.92, draw: (e, q) => {
    const c = e.ctx;
    const out = 1 - easeIn((q - 0.8) / 0.2, 2);
    dryMark(c, (d) => { [e.slots.accent, e.slots.ink2, e.slots.faint, e.ink, e.slots.accent, e.slots.ink2].forEach((t, i) => strokePts(d, partOf(wobbleArc(W / 2, H * 1.2, H * (1.14 - i * 0.16), Math.PI * 1.0, Math.PI * 2, i), ease((q - i * 0.07) * 2.6, 1.6)), 92, t)); }, 3, 0.8, out);
  } },
};
const speechPaper: ObjectPaint = (c, w, h, s, seed, look) => {
  // torn out of the pad and pasted on: rough edge, a strip of tape
  const n = 30;
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) pts.push([(i / n) * w, 8 + 12 * hash(i, seed)]);
  for (let i = 0; i < n; i++) pts.push([w - 6 - 12 * hash(i, seed + 1), (i / n) * h]);
  for (let i = 0; i < n; i++) pts.push([w - (i / n) * w, h - 8 - 12 * hash(i, seed + 2)]);
  for (let i = 0; i < n; i++) pts.push([6 + 12 * hash(i, seed + 3), h - (i / n) * h]);
  lifted(c, 16, 4, 8, 0.3, () => { c.fillStyle = s.plate; c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); c.fill(); });
  c.save();
  c.translate(w / 2, 6);
  c.rotate(look * 0.03 - 0.03);
  c.fillStyle = s.faint;
  c.globalAlpha = 0.7;
  c.fillRect(-90, -18, 180, 36);
  c.restore();
};
export const CRAYON = { grounds: GROUNDS, ins: INS, pieces: PIECES, objects: { 'pad-sheet': speechPaper } as Record<string, ObjectPaint> };
void flood; void inOut;
