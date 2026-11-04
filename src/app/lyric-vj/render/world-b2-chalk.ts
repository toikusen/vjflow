// chalkboard, its board redrawn from the round-2 design board (2026-11-04, 風格設計稿_第二輪/chalkboard a–d): a deep green
// board after class, years of faint eraser arcs on it, the aluminium tray at its foot with two sticks and a felt eraser. No
// stray stars, swirls or colour fields: the only chalk lines are the ones a teacher draws for a reason, each kept clear of
// the words — a key phrase underlined, a short line ringed with an arrow at it, a long rule under a calm line, a rule
// between columns with the song's title written small beside them. Dust falls from a line once it is written.
import type { Piece } from './world-pieces';
import { atBase, clamp01, dryMark, ease, easeIn, flood, H, hash, HandGround, HandIn, kept, mixHex, partOf, Pt, shaken, strokePts, TAU, W, WorldEnv } from './world-craft';
import { smoothNoise } from './world-ink';
import { titleOnly } from './world-b3-shared';
import { R2 } from './r2-inks';

const HAND = (px: number) => `400 ${px}px Iansui, Yomogi, sans-serif`;
/** The slate: its own green, a low cloud of lighter patches (the board's mottle), and four long faint eraser arcs; kept. */
const slate = (e: WorldEnv) => kept(`cb2|${e.paper}|${e.seed % 3}`, W, H, (c) => {
  c.fillStyle = e.paper;
  c.fillRect(0, 0, W, H);
  const [w, h] = [240, 135];
  const m = new OffscreenCanvas(w, h);
  const g = m.getContext('2d')!;
  const img = g.createImageData(w, h);
  const lift = mixHex(e.paper, e.ink, 0.16);
  const [lr, lg, lb] = [1, 3, 5].map((i) => parseInt(lift.slice(i, i + 2), 16));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const n = 0.6 * smoothNoise(x / 31, y / 10, e.seed % 3) + 0.4 * smoothNoise(x / 9, y / 4, 7);
    const i = (y * w + x) * 4;
    img.data[i] = lr; img.data[i + 1] = lg; img.data[i + 2] = lb;
    img.data[i + 3] = 255 * clamp01(n * 0.9 - 0.25);
  }
  g.putImageData(img, 0, 0);
  c.globalAlpha = 0.35;
  c.drawImage(m, 0, 0, W, H);
  // eraser passes: a wide faint band and a bundle of fine streaks along each of four long arcs
  c.strokeStyle = e.ink;
  c.lineCap = 'butt';
  for (let k = 0; k < 4; k++) {
    const [cx, cy, r, a0, sweep] = [hash(k, 11 + (e.seed % 3)) * W, hash(k, 12) * 900, 300 + 400 * hash(k, 13), hash(k, 14) * TAU, 0.9 + 0.8 * hash(k, 15)];
    const a = 0.02 + 0.02 * hash(k, 16);
    c.globalAlpha = a * 0.9;
    c.lineWidth = 150;
    c.beginPath(); c.arc(cx, cy, r + 70, a0, a0 + sweep); c.stroke();
    for (let i = 0; i < 10; i++) { c.globalAlpha = a * (0.6 + 0.4 * hash(i, k)); c.lineWidth = 1 + 2 * hash(i, k + 1); c.beginPath(); c.arc(cx, cy, r + 140 * hash(i, k + 2), a0, a0 + sweep); c.stroke(); }
  }
  c.globalAlpha = 1;
});
/** The tray along the foot: aluminium with a lit lip and a shadowed underside, chalk dust in it, two sticks and a felt eraser. */
const tray = (e: WorldEnv) => kept(`cb2-tray|${e.paper}|${e.seed % 3}`, W, 120, (c) => {
  const y = 52;
  c.fillStyle = e.slots.plate; c.fillRect(0, y, W, 68);
  c.fillStyle = R2.lip; c.fillRect(0, y, W, 10);
  c.fillStyle = R2.under; c.fillRect(0, y + 58, W, 10);
  c.fillStyle = e.ink;
  c.globalAlpha = 0.5;
  for (let i = 0; i < 500; i++) c.fillRect(hash(i, 1) * W, y + 10 + hash(i, 2) * 12, 1 + 3 * hash(i, 3), 1 + 2 * hash(i, 4));
  c.globalAlpha = 1;
  const sx = 300 + 300 * hash(e.seed % 3, 5);
  c.fillStyle = e.ink; c.beginPath(); c.roundRect(sx, y - 12, 120, 18, 8); c.fill();
  c.fillStyle = e.slots.ink2; c.beginPath(); c.roundRect(760 + 200 * hash(e.seed % 3, 6), y - 10, 80, 16, 7); c.fill();
  const ex = 1300 + 300 * hash(e.seed % 3, 7);
  c.fillStyle = R2.felt; c.beginPath(); c.roundRect(ex, y - 40, 230, 46, 6); c.fill();
  c.fillStyle = R2.pad; c.fillRect(ex, y - 8, 230, 14);
});
const board = (e: WorldEnv) => atBase(e, (c) => { c.drawImage(slate(e), 0, 0); c.drawImage(tray(e), 0, H - 120); });

/** A chalk line along points, a little off true, the board's tooth showing through it (crisp holes, never a blur). */
function chalkLine(c: CanvasRenderingContext2D, pts: Pt[], tone: string, width: number, seed: number, k = 1) {
  if (k <= 0) return;
  dryMark(c, (d) => strokePts(d, shaken(partOf(pts, k), 3, seed), width, tone), 2, 0.75);
}
const ellipse = (cx: number, cy: number, rx: number, ry: number): Pt[] => Array.from({ length: 45 }, (_, i) => { const a = -1.9 + (i / 44) * TAU * 1.1; const r = 1 + 0.04 * Math.sin(i * 0.7); return [cx + rx * r * Math.cos(a), cy + ry * r * Math.sin(a)]; });
/** Dust off a line just written: hard specks falling a little below it, toward the tray. */
function dust(e: WorldEnv, c: CanvasRenderingContext2D, x0: number, x1: number, y: number) {
  c.fillStyle = e.ink;
  const fall = Math.min(40, e.age * 10);
  for (let i = 0; i < (x1 - x0) / 22; i++) { c.globalAlpha = 0.55 * hash(i, e.seed + 9); c.fillRect(x0 + hash(i, e.seed) * (x1 - x0), y + hash(i, e.seed + 1) * 60 + fall * hash(i, e.seed + 2), 1 + 2.5 * hash(i, 3), 1 + 2.5 * hash(i, 4)); }
  c.globalAlpha = 1;
}
/** Text written in chalk on the board itself (the song's title beside the lesson): the hand's face, the tooth through it. */
function written(c: CanvasRenderingContext2D, text: string, x: number, y: number, px: number, tone: string, vertical = false) {
  dryMark(c, (d) => {
    d.font = HAND(px);
    d.fillStyle = tone;
    d.textBaseline = 'alphabetic';
    if (vertical) { d.textAlign = 'center'; [...text].forEach((ch, i) => d.fillText(ch, x, y + (i + 1) * px)); d.textAlign = 'left'; }
    else d.fillText(text, x, y);
  }, 2, 0.6);
}

/**
 * The teacher's mark for the line on the board, from the shape the line takes (a set's own place, world-r2-sets.ts): a
 * column gets a rule beside it and the title written small; a short loud line is ringed with an arrow at it and the title
 * boxed over it; a calm line a long rule under it; any other its key phrase (the end of its first row) underlined.
 */
function marks(e: WorldEnv) {
  const r = e.rect;
  if (!r || e.weight <= 0.05) return;
  const k = ease((e.age - 0.35) / 0.7, 2);
  if (k <= 0) return;
  const [w, h] = [r.x1 - r.x0, r.y1 - r.y0];
  const title = titleOnly(e.title).slice(0, 8);
  atBase(e, (c) => {
    c.save();
    c.globalAlpha = Math.min(1, e.weight * 2);
    // (each of the chalk sets stands in a band of its own: the ring low and short, the calm line under the lesson's place)
    const ringed = h <= w * 1.3 && h < 300 && r.y0 > 400 && w < 1150;
    if (h > w * 1.3) {
      const x = r.x0 - 70;
      chalkLine(c, [[x, r.y0 + 10], [x - 3, (r.y0 + r.y1) / 2], [x + 2, r.y1 - 10]], e.ink, 5, 8, k);
      if (title && x - 120 > 60) written(c, title, x - 110, r.y0 + 20, 72, e.ink, true);
      dust(e, c, r.x0, r.x1, r.y1 + 10);
    } else if (ringed) {
      const [cx, cy] = [(r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2];
      chalkLine(c, ellipse(cx, cy, w / 2 + 120, h / 2 + 80), e.slots.accent, 8, 4, k);
      const ax = r.x0 - 40;
      if (ax > 300) chalkLine(c, [[ax - 260, r.y0 - 200], [ax - 120, r.y0 - 150], [ax - 40, r.y0 - 80]], e.ink, 7, 6, ease((e.age - 0.9) / 0.4, 2));
      if (title && r.y0 - 240 > 60) {
        const [bx, by] = [Math.max(120, r.x0 - 340), r.y0 - 330];
        written(c, title, bx + 32, by + 90, 84, e.ink);
        chalkLine(c, [[bx, by], [bx + 60 + title.length * 88, by - 4], [bx + 63 + title.length * 88, by + 114], [bx + 3, by + 118], [bx, by]], e.ink, 5, 1, k);
      }
      dust(e, c, r.x0, r.x1, r.y1 + 90);
    } else if (r.y0 >= 260) {
      const y = Math.min(H - 150, r.y1 + 36);
      chalkLine(c, [[r.x0 + 10, y], [r.x0 + 400, y + 3], [r.x0 + 800, y - 1], [Math.max(r.x1, 1740), y + 2]], e.ink, 6, 9, k);
      dust(e, c, r.x0, Math.min(r.x1, 1600), y + 14);
    } else {
      const n = h - 28 > 1.7 * 196 * 1.12 ? 2 : 1;
      const size = (h - 28) / (n * 1.7);
      const w1 = w - 28 - 0.26 * size * (n - 1);
      // (a row stands in the middle of its lead: the line runs just under the first row's strokes)
      const y = r.y0 + 14 + size * 0.85 + size * 0.5 + 14;
      chalkLine(c, [[r.x0 + 14 + w1 * 0.5, y + 4], [r.x0 + 14 + w1 * 0.75, y], [r.x0 + 14 + w1, y - 5]], e.slots.ink2, 9, 3, k);
      dust(e, c, r.x0, r.x1, r.y1 + 10);
    }
    c.restore();
  });
}
/** The light of an empty classroom: pale window shapes moving slowly across the board. */
const lightOn = (e: WorldEnv) => atBase(e, (c) => { c.save(); c.globalCompositeOperation = 'lighter'; for (let i = 0; i < 3; i++) { const x = ((e.now * 16 + i * 620) % (W + 900)) - 500; c.fillStyle = mixHex(e.paper, e.ink, 0.06); c.beginPath(); c.moveTo(x, -20); c.lineTo(x + 340, -20); c.lineTo(x + 380, H - 130); c.lineTo(x + 40, H - 130); c.closePath(); c.fill(); } c.restore(); });

const Gs: Record<string, HandGround> = {
  'chalkboard/slate': (e) => { board(e); marks(e); },
  // the same board worn greyer by a day of lessons: a wider haze of old wiping low across it
  'chalkboard/worn': (e) => { board(e); atBase(e, (c) => { c.save(); c.globalAlpha = 0.05; c.strokeStyle = e.ink; c.lineWidth = 220; for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(W * (0.2 + 0.3 * i), H * 1.25, 640 + 90 * i, -2.5, -0.7); c.stroke(); } c.restore(); }); marks(e); },
  'chalkboard/after-class': (e) => { board(e); lightOn(e); },
};
const INS: Record<string, HandIn> = {
  // a change of part: the eraser goes right to left across the board, the last lesson gone behind it but for a grey trace
  'wipe-pass': { sec: 0.5, draw: (e, q) => atBase(e, (c) => {
    const x = W + 120 - ease(q, 2) * (W + 400);
    c.save();
    c.beginPath(); c.rect(x + 60, 0, W, H - 120); c.clip();
    c.drawImage(slate(e), 0, 0);
    c.globalAlpha = 0.05; c.strokeStyle = e.ink; c.lineWidth = 180; c.beginPath(); c.arc(x + 700, H * 1.1, 900, -2.6, -0.6); c.stroke();
    c.restore();
    c.fillStyle = R2.felt; c.fillRect(x, H * 0.18, 70, 230);
    c.fillStyle = R2.pad; c.fillRect(x + 56, H * 0.18, 14, 230);
  }) },
};
const PIECES: Record<string, Piece> = {
  // the eraser goes round in big arcs through a board gone grey with dust
  'eraser-arcs': { sec: 2.4, clear: 0.92, draw: (e, q) => {
    const c = e.ctx;
    const haze = Math.min(ease(q / 0.14, 2), 1 - easeIn((q - 0.86) / 0.14, 2));
    flood(e, e.ink, 0.3 * haze);
    dryMark(c, (d) => { const arcs: Pt[] = []; for (let i = 0; i <= 200; i++) { const t = i / 200; arcs.push([W * (0.04 + 0.92 * t), H * 0.5 + Math.sin(t * 24) * H * 0.52]); } strokePts(d, partOf(arcs, ease((q - 0.12) * 1.6, 1.2)), 200, e.paper, 'square'); }, 5, 0.3);
    const k = clamp01((q - 0.12) * 1.6);
    const [x, y] = [W * (0.04 + 0.92 * k), H * 0.5 + Math.sin(k * 24) * H * 0.52];
    if (k < 1) { c.save(); c.translate(x, y); c.rotate(Math.cos(k * 24) * 0.7); c.fillStyle = R2.felt; c.fillRect(-60, -130, 120, 260); c.fillStyle = R2.pad; c.fillRect(46, -130, 14, 260); c.restore(); }
  } },
  // the teacher's hand: ring it, underline it, arrows at it from both sides
  'ring-word': { sec: 2.5, clear: 0, draw: (e, q) => {
    const c = e.ctx;
    const r = e.rect ?? { x0: W * 0.3, y0: H * 0.4, x1: W * 0.7, y1: H * 0.6 };
    const b = { x0: r.x0 - 70, y0: r.y0 - 60, x1: r.x1 + 70, y1: r.y1 + 60 };
    const [cx, cy, rx, ry] = [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.x1 - b.x0) / 2 + 40, (b.y1 - b.y0) / 2 + 40];
    const out = 1 - easeIn((q - 0.84) / 0.16, 2);
    const low = Math.min(H - 150, b.y1 + 60);
    const line = (x0: number, x1: number, y: number): Pt[] => Array.from({ length: 30 }, (_, i) => [x0 + ((x1 - x0) * i) / 29, y + 6 * Math.sin(i * 0.5)]);
    dryMark(c, (d) => {
      strokePts(d, shaken(partOf(ellipse(cx, cy, rx, ry), ease(q * 2.2, 1.6)), 3, 1), 12, e.slots.accent);
      strokePts(d, partOf(line(b.x0, b.x1, low), ease((q - 0.42) * 5, 1.5)), 10, e.slots.ink2);
      for (const [x, s] of [[40, 1], [W - 40, -1]] as [number, number][]) { const k = ease((q - 0.6) * 5, 2); strokePts(d, [[x, cy - 140], [x + s * 180 * k, cy - 20], [x + s * 90 * k, cy - 34], [x + s * 180 * k, cy - 20], [x + s * 140 * k, cy - 110 * k]], 10, e.ink); }
    }, 2, 0.8, out);
  } },
  // the upper board slid up on its rails: the same wall, another slate under it
  'board-slide': { sec: 2.1, clear: 0.9, draw: (e, q) => {
    const c = e.ctx;
    const k = q < 0.5 ? ease(q / 0.5, 3) : 1 - easeIn((q - 0.56) / 0.44, 2);
    const y = H - k * H * 1.02;
    atBase(e, () => {
      c.fillStyle = 'rgba(0,0,0,0.35)';
      c.fillRect(0, y - 16, W, 16);
      c.drawImage(slate(e), 0, 0, W, H, 0, y, W, H);
      c.fillStyle = e.slots.plate;
      c.fillRect(0, y - 12, W, 24);
    });
  } },
};
export const CHALK = { grounds: Gs, ins: INS, pieces: PIECES, objects: {} };
