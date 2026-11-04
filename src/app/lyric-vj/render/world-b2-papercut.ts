// papercut: one sheet of coloured paper and what scissors took out of it. All detail is holes (crescents, saw-teeth, lens cuts);
// a light moves behind the sheet, so the holes are what is alive. The words are holes too: the far side's colour, the sheet's
// own edge shading them. Detail comes from folding and cutting, so every figure is symmetric.
import type { Piece } from './world-pieces';
import { atBase, boxOf, clamp01, ease, easeIn, fibred, flood, H, hash, HandGround, HandIn, inOut, kept, lifted, mixHex, ObjectPaint, Pt, span, TAU, trace, W, WorldEnv } from './world-craft';

type G = OffscreenCanvasRenderingContext2D;
/** A crescent hole, the oldest cut there is. */
const moon = (c: G, x: number, y: number, r: number, a: number) => { c.beginPath(); c.arc(x, y, r, a - 1.25, a + 1.25); c.quadraticCurveTo(x + Math.cos(a) * r * 0.3, y + Math.sin(a) * r * 0.3, x + Math.cos(a - 1.25) * r, y + Math.sin(a - 1.25) * r); c.fill(); };
/** A pointed oval from two snips. */
const lens = (c: G, x: number, y: number, l: number, w: number, a: number) => { c.save(); c.translate(x, y); c.rotate(a); c.beginPath(); c.moveTo(-l, 0); c.quadraticCurveTo(0, -w, l, 0); c.quadraticCurveTo(0, w, -l, 0); c.fill(); c.restore(); };
/** Saw teeth along a line, pointing to its left. */
function teeth(c: G, a: Pt, b: Pt, n: number, d: number) {
  const [dx, dy] = [(b[0] - a[0]) / n, (b[1] - a[1]) / n];
  const l = Math.hypot(dx, dy) || 1;
  const [nx, ny] = [-dy / l, dx / l];
  c.beginPath();
  for (let i = 0; i < n; i++) { const [x, y] = [a[0] + dx * i, a[1] + dy * i]; c.moveTo(x, y); c.lineTo(x + dx * 0.5 + nx * d, y + dy * 0.5 + ny * d); c.lineTo(x + dx * 0.92, y + dy * 0.92); c.closePath(); }
  c.fill();
}
const toothRing = (c: G, x: number, y: number, r: number, n: number, d: number) => { c.beginPath(); for (let i = 0; i < n; i++) { const [a0, a1] = [(i / n) * TAU, ((i + 0.9) / n) * TAU]; const am = (a0 + a1) / 2; c.moveTo(x + Math.cos(a0) * r, y + Math.sin(a0) * r); c.lineTo(x + Math.cos(am) * (r + d), y + Math.sin(am) * (r + d)); c.lineTo(x + Math.cos(a1) * r, y + Math.sin(a1) * r); c.closePath(); } c.fill(); };
/** A window flower: rings of cuts round a centre, the same in every fold. */
function rosette(c: G, x: number, y: number, R: number, seed: number) {
  const f = [8, 12, 6][seed % 3];
  for (let i = 0; i < f; i++) { const a = (i / f) * TAU; lens(c, x + Math.cos(a) * R * 0.2, y + Math.sin(a) * R * 0.2, R * 0.13, R * 0.055, a); }
  toothRing(c, x, y, R * 0.38, f * 6, R * 0.05);
  for (let i = 0; i < f * 2; i++) { const a = ((i + 0.5) / (f * 2)) * TAU; moon(c, x + Math.cos(a) * R * 0.56, y + Math.sin(a) * R * 0.56, R * 0.1, a); }
  for (let i = 0; i < f * 2; i++) { const a = (i / (f * 2)) * TAU; lens(c, x + Math.cos(a) * R * 0.76, y + Math.sin(a) * R * 0.76, R * 0.075, R * 0.022, a); }
  toothRing(c, x, y, R * 0.88, f * 9, R * 0.06);
}
/** The sheet with its holes, on a transparent canvas, its shadow baked in: lay it over any light. */
const sheetOf = (name: string, tone: string, fibre: string, cut: (c: G) => void, w = W + 200, h = H + 200) => kept(`pc|${name}|${tone}`, w, h, (out) => {
  const cv = new OffscreenCanvas(w, h);
  const c = cv.getContext('2d')!;
  c.drawImage(fibred(`pc-${w}`, tone, fibre, 1800, w, h), 0, 0);
  c.globalCompositeOperation = 'destination-out';
  c.fillStyle = 'black';
  cut(c);
  c.globalCompositeOperation = 'source-over';
  out.shadowColor = 'rgba(0,0,0,0.42)';
  out.shadowBlur = 9;
  out.shadowOffsetX = 5;
  out.shadowOffsetY = 7;
  out.drawImage(cv, 0, 0);
});
const CELL = 372;
const lattice = (e: WorldEnv, v: number) => sheetOf(`lattice${v}`, e.slots.plate, e.slots.ink2, (c) => {
  for (let j = -1; j < 5; j++) for (let i = -1; i < 7; i++) {
    const [x, y] = [100 + i * CELL + (j % 2 ? CELL / 2 : 0), 100 + j * CELL * 0.86];
    rosette(c, x, y, CELL * 0.5, v + (i & 1));
    moon(c, x + CELL / 2, y, 20, 0);
  }
});
/** The light behind the sheet, travelling. */
function backing(e: WorldEnv, far = 1) {
  const c = e.ctx;
  flood(e, e.paper);
  const [x, y] = [W * (0.5 + 0.42 * Math.sin(e.now * 0.4 + e.seed)), H * (0.5 + 0.34 * Math.cos(e.now * 0.31 + e.seed))];
  const g = c.createRadialGradient(x, y, 40, x, y, 900 * far);
  g.addColorStop(0, e.slots.accent);
  g.addColorStop(1, `${e.slots.accent}00`);
  c.fillStyle = g;
  c.fillRect(-W * 0.2, -H * 0.2, W * 1.4, H * 1.4);
}
/** Uncut sheet kept round the words, its edge a row of teeth: the words are holes in it. */
export function uncut(e: WorldEnv, f = 1) {
  // (words on their own carrier read on it: no room of plain paper is cut round them)
  if (!e.rect || e.weight <= 0 || e.rect.carried) return;
  const b = boxOf(e, 44, 30);
  // (a tall narrow line on its own banner is carried and gets none, above; one set free still needs its sheet: on the
  // hanging strips it lay across red and gold strips at once, and its ink read on neither, 2026-11-04 audit)
  atBase(e, (c0) => {
    const c = c0 as unknown as G;
    const [w, h] = [b.x1 - b.x0, b.y1 - b.y0];
    const edge: Pt[] = [];
    const n = Math.round(w / 34);
    const m = Math.round(h / 34);
    for (let i = 0; i < n; i++) edge.push([b.x0 + (i / n) * w, b.y0], [b.x0 + ((i + 0.5) / n) * w, b.y0 - 22]);
    for (let i = 0; i < m; i++) edge.push([b.x1, b.y0 + (i / m) * h], [b.x1 + 22, b.y0 + ((i + 0.5) / m) * h]);
    for (let i = 0; i < n; i++) edge.push([b.x1 - (i / n) * w, b.y1], [b.x1 - ((i + 0.5) / n) * w, b.y1 + 22]);
    for (let i = 0; i < m; i++) edge.push([b.x0, b.y1 - (i / m) * h], [b.x0 - 22, b.y1 - ((i + 0.5) / m) * h]);
    c.globalAlpha = Math.min(1, e.weight * 4) * f;
    lifted(c, 12, 5, 8, 0.4, () => { trace(c, edge); c.fillStyle = e.slots.plate; c.fill(); });
    c.globalAlpha = 1;
  });
}
const creases = (e: WorldEnv) => kept(`pc-crease|${e.slots.plate}|${e.slots.ink2}|${e.slots.faint}`, W + 200, H + 200, (c) => {
  c.drawImage(fibred(`pc-${W + 200}`, e.slots.plate, e.slots.ink2, 1800, W + 200, H + 200), 0, 0);
  const [cx, cy] = [(W + 200) / 2, (H + 200) / 2];
  for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU; const g = c.createLinearGradient(cx, cy, cx + Math.cos(a) * 1400, cy + Math.sin(a) * 1400); c.lineWidth = i % 2 ? 2 : 3; g.addColorStop(0, i % 2 ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.2)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.strokeStyle = g; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a) * 1400, cy + Math.sin(a) * 1400); c.stroke(); }
});
/** A frame of cuts: the plain middle stays whole, the holes show the light through a second, paler sheet. */
const border = (e: WorldEnv) => kept(`pc-border|${e.paper}|${e.slots.accent}|${e.slots.plate}|${e.seed % 3}`, W + 200, H + 200, (c) => {
  const [w, h] = [W + 200, H + 200];
  c.fillStyle = e.slots.accent;
  c.beginPath(); c.rect(0, 0, w, h); c.rect(250, 230, w - 500, h - 460); c.fill('evenodd');
  const s = sheetOf(`frame${e.seed % 3}`, e.slots.plate, e.slots.ink2, (g) => {
    for (let i = 0; i < 9; i++) { rosette(g, 180 + i * 200, 170, 96, i); rosette(g, 180 + i * 200, h - 170, 96, i + 1); }
    for (let j = 1; j < 5; j++) { rosette(g, 180, 170 + j * 176, 90, j); rosette(g, w - 180, 170 + j * 176, 90, j + 1); }
    teeth(g, [270, 262], [w - 270, 262], 80, 24);
    teeth(g, [w - 270, h - 262], [270, h - 262], 80, 24);
    // rows of crescents across the plain field: a sheet is never left whole in this craft
    for (let j = 0; j < 7; j++) for (let i = 0; i < 16; i++) moon(g, 320 + i * 110 + (j % 2 ? 55 : 0), 340 + j * 96, 20, (j % 2 ? 1 : -1) * Math.PI / 2);
  });
  c.drawImage(s, 0, 0);
});
/** One hanging strip, its cuts down the middle, a swallow tail at the foot. */
const strip = (e: WorldEnv, i: number, w: number, h: number) => kept(`pc-strip|${e.slots.plate}|${e.slots.accent}|${i}|${h}`, w + 30, h + 30, (out) => {
  const cv = new OffscreenCanvas(w, h);
  const c = cv.getContext('2d')!;
  c.drawImage(fibred(`pc-${W + 200}`, i % 3 === 2 ? e.slots.accent : e.slots.plate, e.slots.ink2, 1800, W + 200, H + 200), 0, 0);
  c.globalCompositeOperation = 'destination-out';
  c.fillStyle = 'black';
  for (let k = 0; k * (w * 0.9) < h - w; k++) { const y = w * 0.6 + k * w * 0.9; rosette(c, w / 2, y, w * 0.42, i + k); teeth(c, [10, y + w * 0.45], [w - 10, y + w * 0.45], 9, 14); }
  c.beginPath(); c.moveTo(0, h); c.lineTo(w / 2, h - w * 0.5); c.lineTo(w, h); c.closePath(); c.fill();
  out.shadowColor = 'rgba(0,0,0,0.4)'; out.shadowBlur = 10; out.shadowOffsetX = 6; out.shadowOffsetY = 8;
  out.drawImage(cv, 0, 0);
});
const scallopRow = (e: WorldEnv, row: number) => sheetOf(`scallop${row}`, row % 2 ? e.slots.ink2 : e.slots.plate, row % 2 ? e.slots.plate : e.slots.ink2, (c) => {
  const r = 150 + row * 16;
  // the shape itself: everything above a row of scallops is cut away
  c.beginPath();
  c.rect(0, 0, W + 200, 220);
  for (let x = -r; x < W + 300; x += r * 1.6) c.arc(x, 260, r * 0.84, Math.PI, 0);
  c.fill();
  for (let x = -r; x < W + 300; x += r * 1.6) { for (let k = 0; k < 7; k++) { const a = Math.PI + ((k + 0.5) / 7) * Math.PI; moon(c, x + Math.cos(a) * r * 0.55, 270 + Math.sin(a) * r * 0.55, 24, a); } lens(c, x, 330, 54, 16, Math.PI / 2); teeth(c, [x - r * 0.7, 410], [x + r * 0.7, 410], 12, 20); }
}, W + 200, 700);

const GROUNDS: Record<string, HandGround> = {
  'papercut/lattice': (e) => { backing(e); const c = e.ctx; atBase(e, () => c.drawImage(lattice(e, e.seed % 3), -100 + 16 * Math.sin(e.now * 0.3), -100 + 10 * Math.cos(e.now * 0.26))); uncut(e); },
  'papercut/banners': (e) => {
    backing(e, 1.3);
    const c = e.ctx;
    atBase(e, () => {
      for (let i = 0; i < 8; i++) {
        const h = 760 + 240 * hash(i, 3 + e.seed % 3);
        const x = 40 + i * 270;
        c.save();
        c.translate(x + 120, -10);
        c.rotate(Math.sin(e.now * 0.9 + i * 1.3) * 0.03 + e.pulse * 0.006 * (i % 2 ? 1 : -1));
        c.drawImage(strip(e, i, 240, Math.round(h / 40) * 40), -120, 0);
        c.restore();
      }
      c.drawImage(sheetOf('rail', e.slots.plate, e.slots.ink2, () => undefined, W + 200, 44), -100, -14);
    });
    uncut(e);
  },
  'papercut/scallops': (e) => {
    backing(e, 1.2);
    const c = e.ctx;
    atBase(e, () => [0, 1, 2, 3].forEach((row) => c.drawImage(scallopRow(e, row), -100 + (row % 2 ? 1 : -1) * 44 * Math.sin(e.now * 0.5 + row), -90 + row * 200 + 16 * Math.sin(e.now * 1.1 + row * 2))));
    uncut(e);
  },
  'papercut/fold-sheet': (e) => {
    backing(e, 1);
    const c = e.ctx;
    // the sheet still folded in eight: creases, and a deep border of cuts round the frame
    atBase(e, () => { c.drawImage(creases(e), -100, -100); c.drawImage(border(e), -100, -100); });
    uncut(e);
  },
  'papercut/deep-sheet': (e) => {
    backing(e, 0.7);
    const c = e.ctx;
    atBase(e, () => c.drawImage(sheetOf(`big${e.seed % 3}`, e.slots.plate, e.slots.ink2, (g) => { rosette(g, (W + 200) / 2, (H + 200) / 2, 900, e.seed); }), -100, -100));
    uncut(e);
  },
  'papercut/all-lit': (e) => { backing(e, 2); flood(e, e.slots.accent, 0.16 + 0.1 * e.pulse); const c = e.ctx; atBase(e, () => c.drawImage(lattice(e, 1), -100, -100)); uncut(e); },
  'papercut/one-moon': (e) => {
    const c = e.ctx;
    atBase(e, () => {
      c.drawImage(creases(e), -100, -100);
      const k = (Math.sin(e.now * 0.3) + 1) / 2;
      const g = c.createRadialGradient(W * 0.8, H * 0.24, 10, W * 0.8, H * 0.24, 240);
      g.addColorStop(0, e.slots.accent);
      g.addColorStop(1, `${e.slots.accent}00`);
      c.globalAlpha = 0.4 + 0.3 * k;
      c.fillStyle = g;
      c.fillRect(W * 0.6, 0, 700, 500);
      c.globalAlpha = 1;
    });
  },
};

const INS: Record<string, HandIn> = {
  // the old sheet is pulled away downwards and the new one is there under it
  'sheet-lay': { sec: 0.34, draw: (e, q) => { const c = e.ctx; atBase(e, () => { c.save(); c.translate(W / 2, easeIn(q, 2) * H * 1.2); c.rotate(easeIn(q, 2) * 0.05); lifted(c, 26, 0, 18, 0.5, () => { c.fillStyle = e.slots.plate; c.fillRect(-W * 0.6, -H * 0.1, W * 1.2, H * 1.08); }); c.restore(); }); } },
};

const PIECES: Record<string, Piece> = {
  // the fold undone: one wedge, then its mirror, round the circle, until the whole flower stands open past the frame
  'unfold-flower': { sec: 2.6, clear: 0, draw: (e, q) => {
    const c = e.ctx;
    const n = 16;
    const R = 1180;
    const flower = sheetOf(`flower${e.seed % 3}`, e.slots.plate, e.slots.ink2, (g) => { rosette(g, R, R, R, e.seed + 1); rosette(g, R, R, R * 0.5, e.seed + 2); }, R * 2, R * 2);
    const out = easeIn((q - 0.76) / 0.24, 2);
    backing(e, 1.5);
    c.save();
    c.translate(W / 2, H / 2);
    c.rotate(q * 0.5);
    c.scale(1 + out * 1.5, 1 + out * 1.5);
    c.globalAlpha = 1 - out;
    for (let i = 0; i < n; i++) {
      const k = clamp01((q - 0.03 * i) / 0.22);
      if (k <= 0) continue;
      c.save();
      c.rotate((i / n) * TAU);
      c.scale(1, Math.cos((1 - ease(k, 2)) * Math.PI * 0.5));
      c.beginPath();
      c.moveTo(0, 0);
      c.arc(0, 0, R, -0.01, TAU / n + 0.01);
      c.closePath();
      c.clip();
      c.drawImage(flower, -R, -R);
      c.restore();
    }
    c.restore();
    uncut(e);
  } },
  'snip-fall': { sec: 2.4, clear: 0, draw: (e, q) => {
    const c = e.ctx;
    const b = boxOf(e, 90, 66);
    const cover = ease(q / 0.16, 3);
    const fall = easeIn((q - 0.56) / 0.44, 2);
    const sheet = lattice(e, e.seed % 3);
    // the piece of sheet round the words is cut free along a line that runs round them, and the rest drops
    if (fall <= 0) { c.save(); c.translate(0, -H * (1 - cover)); backing(e, 1.4); c.drawImage(sheet, -100, -100); c.restore(); } else {
      const parts: [number, number, number, number, number][] = [[0, 0, W, b.y0, -1], [0, b.y1, W, H - b.y1, 1], [0, b.y0, b.x0, b.y1 - b.y0, -1], [b.x1, b.y0, W - b.x1, b.y1 - b.y0, 1]];
      parts.forEach(([x, y, w, h, d], i) => { c.save(); c.translate(x + w / 2 + d * fall * 240, y + h / 2 + fall * fall * H * 1.5 * (1 + i * 0.12)); c.rotate(d * fall * 0.3); c.drawImage(sheet, x + 100, y + 100, w, h, -w / 2, -h / 2, w, h); c.restore(); });
    }
    const run = clamp01((q - 0.16) / 0.4);
    if (run > 0 && fall < 1) {
      const per = 2 * (b.x1 - b.x0 + b.y1 - b.y0);
      c.save();
      c.strokeStyle = e.slots.plateInk;
      c.lineWidth = 7;
      c.globalAlpha = 1 - fall;
      c.setLineDash([per * run, per]);
      c.strokeRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
      c.restore();
    }
    uncut(e);
  } },
  backlight: { sec: 2.2, clear: 0, draw: (e, q) => {
    // the room goes dark and a lamp comes up behind the sheet: the sheet turns to a silhouette and every hole burns
    const c = e.ctx;
    const k = span(q, 0.42, 0.74);
    const dark = mixHex(e.slots.ink2, e.paper, 0.05);
    c.globalAlpha = Math.min(1, k * 2.4);
    const g = c.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, 300 + 1200 * k);
    g.addColorStop(0, e.slots.plateInk);
    g.addColorStop(0.4, e.slots.accent);
    g.addColorStop(1, mixHex(e.slots.accent, e.slots.plate, 0.7));
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    c.drawImage(sheetOf('shade', dark, e.slots.plate, (s) => { for (let j = -1; j < 3; j++) for (let i = -1; i < 4; i++) rosette(s, 200 + i * 620 + (j % 2 ? 310 : 0), 160 + j * 530, 310, i & 1); }), -100, -100);
    c.globalAlpha = 1;
    uncut(e, Math.min(1, k * 4));
  } },
  'ribbon-rain': { sec: 2.3, clear: 0, draw: (e, q) => {
    const c = e.ctx;
    for (let i = 0; i < 40; i++) {
      const lag = hash(i, 2) * 0.36;
      const k = clamp01((q - lag) / (1 - lag));
      if (k <= 0 || k >= 1) continue;
      const x0 = hash(i, 3) * W;
      const y0 = -760 + easeIn(k, 1.5) * (H + 1600);
      const w = 40 + 46 * hash(i, 4);
      const seg = 90;
      for (let j = 0; j < seg; j++) {
        const t = j / seg;
        const face = Math.cos(t * 9 + k * 8 + i);
        const [x, y] = [x0 + Math.sin(t * 5 + i) * 74, y0 + t * 720];
        c.fillStyle = mixHex(i % 3 === 0 ? e.slots.accent : e.slots.plate, face > 0 ? e.paper : e.slots.ink2, 0.08 + 0.34 * (1 - Math.abs(face)));
        c.fillRect(x - (w * Math.abs(face)) / 2, y, Math.max(2, w * Math.abs(face)), 720 / seg + 1);
      }
    }
    uncut(e);
  } },
};

const corners = (c: G, w: number, h: number) => { [[70, 70], [w - 70, 70], [70, h - 70], [w - 70, h - 70]].forEach(([x, y]) => rosette(c, x, y, 58, 0)); };
const panel = (rows: boolean): ObjectPaint => (o, w, h, s, seed, look) => {
  const cv = new OffscreenCanvas(w, h);
  const c = cv.getContext('2d')!;
  c.drawImage(fibred(`pc-${W + 200}`, s.plate, s.ink2, 1800, W + 200, H + 200), 0, 0);
  c.globalCompositeOperation = 'destination-out';
  c.fillStyle = 'black';
  const d = 18;
  const n = Math.round(w / 30);
  const m = Math.round(h / 30);
  teeth(c, [w, 0], [0, 0], n, d);
  teeth(c, [0, h], [w, h], n, d);
  teeth(c, [0, 0], [0, h], m, d);
  teeth(c, [w, h], [w, 0], m, d);
  if (look !== 1) corners(c, w, h);
  if (look === 2 || rows) { teeth(c, [120, 26], [w - 120, 26], Math.round((w - 240) / 16), 20); teeth(c, [w - 120, h - 26], [120, h - 26], Math.round((w - 240) / 16), 20); }
  c.globalCompositeOperation = 'source-over';
  lifted(o, 16, 6, 12, 0.5, () => o.drawImage(cv, 0, 0));
  void seed;
};

export const PAPERCUT = { grounds: GROUNDS, ins: INS, pieces: PIECES, objects: { 'cut-panel': panel(false), 'cut-banner': panel(true) } as Record<string, ObjectPaint> };
void inOut;
