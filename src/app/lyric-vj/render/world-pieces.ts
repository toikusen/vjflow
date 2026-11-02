// Each world's set pieces: the big event a song gets a few times, on a change of part or a key line, that fills the frame and
// that nothing else in the song does. They lie over the ground and under the words, so reading stays as it was; none of them
// changes the whole frame's light more than a couple of times a second.
import { drawUiWindow, UiLayer } from './graphics';
import { brushStroke, inkWash, smoothNoise, spatter } from './world-ink';
import { mixHex, Pt } from './material';
import type { WorldEnv } from './world-grounds';
import { handPieces } from './world-packs';

const W = 1920;
const H = 1080;
const TAU = Math.PI * 2;
const fract = (x: number) => x - Math.floor(x);
const hash = (a: number, b = 0) => fract(Math.sin(a * 127.1 + b * 311.7) * 43758.5453);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const ease = (x: number, p = 3) => 1 - (1 - clamp01(x)) ** p;
const easeIn = (x: number, p = 3) => clamp01(x) ** p;
const inOut = (x: number) => { const k = clamp01(x); return k * k * (3 - 2 * k); };

export interface PieceEnv extends WorldEnv { words: string; title: string; /** How far the line being sung has run, 0..1, when one is. */ sung?: number }
export interface Piece { sec: number; /** How far the ground is cleared round the words while it runs. */ clear?: number; /** Keep the words on bare paper with a torn edge instead of a soft clearing. */ reserve?: boolean; draw: (e: PieceEnv, q: number, age: number) => void }

let shot: OffscreenCanvas | undefined;
/** The frame as it stands, to cut up. */
function grab(e: PieceEnv) {
  const cv = (shot ??= new OffscreenCanvas(W, H));
  const g = cv.getContext('2d')!;
  g.globalCompositeOperation = 'copy';
  g.drawImage(e.ctx.canvas as CanvasImageSource, 0, 0, W, H);
  return cv;
}
const fill = (e: PieceEnv, tone: string, a = 1) => { const c = e.ctx; c.globalAlpha = a; c.fillStyle = tone; c.fillRect(0, 0, W, H); c.globalAlpha = 1; };

function arcBolt(c: CanvasRenderingContext2D, a: Pt, b: Pt, seed: number, tone: string, w: number) {
  const n = 18;
  const pts: Pt[] = Array.from({ length: n + 1 }, (_, i) => { const k = i / n; const off = i && i < n ? 70 * (hash(i, seed) - 0.5) : 0; return [a[0] + (b[0] - a[0]) * k + off, a[1] + (b[1] - a[1]) * k + off * 0.6]; });
  c.save();
  c.lineJoin = 'round';
  c.globalCompositeOperation = 'lighter';
  [[w * 7, 0.2], [w * 2.4, 0.5], [w, 1]].forEach(([lw, al]) => { c.strokeStyle = tone; c.globalAlpha = al; c.lineWidth = lw; c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.stroke(); });
  c.restore();
}

function tubeRun(c: CanvasRenderingContext2D, pts: Pt[], k: number, tone: string, core: string) {
  const total = pts.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);
  let left = total * k;
  c.save();
  c.lineJoin = 'round';
  c.lineCap = 'round';
  const trace = () => {
    c.beginPath();
    let l = left;
    c.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length && l > 0; i++) {
      const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      const f = Math.min(1, l / d);
      c.lineTo(pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f);
      l -= d;
    }
  };
  c.globalCompositeOperation = 'lighter';
  [[64, 0.12], [22, 0.34], [9, 1]].forEach(([lw, a]) => { c.strokeStyle = tone; c.globalAlpha = a; c.lineWidth = lw; trace(); c.stroke(); });
  c.strokeStyle = core;
  c.globalAlpha = 1;
  c.lineWidth = 3;
  trace();
  c.stroke();
  c.restore();
  left = 0;
}

const ui = (e: PieceEnv, l: Partial<UiLayer> & { type: UiLayer['type'] }, age: number) => {
  e.ctx.save();
  drawUiWindow(e.ctx, { kind: 'ui', color: e.ink, alert: e.slots.accent, plain: true, skin: e.ink.startsWith('#F') ? 'mac' : 'term', ...l } as UiLayer, age, { index: Math.floor(e.now * 2), pulse: e.pulse, since: 1 } as never);
  e.ctx.restore();
};
/** A window only where it leaves the words alone: a share of a frame that is full of windows is worth less than one clear line. */
const openFor = (e: PieceEnv, l: { x: number; y: number; w: number; h: number }) => {
  if (!e.rect || e.weight <= 0) return true;
  const [hw, hh] = [(l.w * W) / 2, (l.h * H) / 2];
  const [cx, cy] = [Math.min(W - hw - 24, Math.max(hw + 24, W / 2 + (l.x * W) / 2)), Math.min(H - hh - 24, Math.max(hh + 24, H / 2 - (l.y * H) / 2))];
  const m = 60;
  return cx + hw < e.rect.x0 - m || cx - hw > e.rect.x1 + m || cy + hh < e.rect.y0 - m || cy - hh > e.rect.y1 + m;
};
const wordsOf = (e: PieceEnv) => e.words.split(/\s+/).filter(Boolean);

interface Shard { pts: Pt[]; cx: number; cy: number; dx: number; dy: number; spin: number; tone: number }
const shards = new Map<number, Shard[]>();
function shardsOf(seed: number) {
  const hit = shards.get(seed);
  if (hit) return hit;
  const [cols, rows, out] = [9, 6, [] as Shard[]];
  const pt = (i: number, j: number): Pt => [(i + (i && i < cols ? (hash(i * 3 + 1, j + seed) - 0.5) * 0.7 : 0)) * (W / cols), (j + (j && j < rows ? (hash(i + 5, j * 3 + seed) - 0.5) * 0.7 : 0)) * (H / rows)];
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const [a, b, d, f] = [pt(i, j), pt(i + 1, j), pt(i + 1, j + 1), pt(i, j + 1)];
    (hash(i, j + seed) > 0.5 ? [[a, b, d], [a, d, f]] : [[a, b, f], [b, d, f]]).forEach((tri, k) => {
      const cx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3;
      const cy = (tri[0][1] + tri[1][1] + tri[2][1]) / 3;
      const a2 = Math.atan2(cy - H / 2, cx - W / 2) + (hash(i * k, j) - 0.5);
      const far = 500 + 700 * hash(i + k, j + 3);
      out.push({ pts: tri as Pt[], cx, cy, dx: Math.cos(a2) * far, dy: Math.sin(a2) * far + 200, spin: (hash(i, k + j) - 0.5) * 3.4, tone: Math.floor(hash(i + 2 * k, j + 7) * 5) });
    });
  }
  shards.set(seed, out);
  return out;
}

export const WORLD_PIECES: Record<string, Piece> = {
  // dark-glitch: what a weak signal does to a picture
  'strip-tear': { sec: 1.4, draw: (e, q) => {
    const cv = grab(e); const c = e.ctx; const n = 15; const sway = Math.sin(q * Math.PI);
    fill(e, e.paper);
    for (let i = 0; i < n; i++) { const y = (i * H) / n; const dx = (hash(i, Math.floor(q * 7) + e.seed) - 0.5) * 1500 * sway; c.drawImage(cv, 0, y, W, H / n, dx, y, W, H / n + 1); c.fillStyle = e.slots.ink2; c.globalAlpha = 0.4 * sway; c.fillRect(dx - 2000 * Math.sign(dx || 1) * 0, y, 3, H / n); c.globalAlpha = 1; }
  } },
  'crt-collapse': { sec: 1.2, draw: (e, q) => {
    const cv = grab(e); const c = e.ctx; const s = q < 0.42 ? 1 - ease(q / 0.42, 4) : ease((q - 0.58) / 0.42, 4);
    fill(e, e.paper);
    const h = Math.max(4, H * s);
    c.drawImage(cv, 0, (H - h) / 2, W, h);
    const line = 1 - Math.abs(q - 0.5) * 2;
    c.fillStyle = e.ink; c.globalAlpha = line; c.fillRect(W * 0.5 * (1 - ease(1 - Math.abs(q - 0.5) * 2)), H / 2 - 3, W * ease(1 - Math.abs(q - 0.5) * 2), 6); c.globalAlpha = 1;
  } },
  'wave-wall': { sec: 1.8, draw: (e, q, age) => {
    const c = e.ctx; const a = Math.sin(q * Math.PI);
    c.save(); c.lineWidth = 22; c.lineJoin = 'round';
    for (let k = 0; k < 7; k++) { c.strokeStyle = k % 2 ? e.slots.ink2 : e.ink; c.globalAlpha = (k % 2 ? 0.9 : 0.5) * a; c.beginPath(); for (let x = -20; x <= W + 20; x += 8) { const y = H * (0.14 + 0.12 * k) + Math.sin(x * 0.006 + age * 9 + k) * 150 * a * Math.sin(x * 0.0017 + k + age * 2) + Math.sin(x * 0.03 - age * 18) * 18 * a; x < 0 ? c.moveTo(x, y) : c.lineTo(x, y); } c.stroke(); }
    c.restore();
  } },
  'tape-spool': { sec: 1.6, draw: (e, q) => {
    const c = e.ctx;
    for (let i = 0; i < 9; i++) {
      const y = H * (i + 0.5) / 9; const lag = hash(i, e.seed) * 0.34; const k = clamp01((q - lag) / (1 - lag));
      const dir = i % 2 ? 1 : -1; const x = dir > 0 ? -W * 1.3 + k * W * 2.8 : W * 1.3 - k * W * 2.8;
      c.save(); c.translate(x, y); c.rotate(-0.04 * dir);
      c.shadowColor = 'rgba(0,0,0,0.7)'; c.shadowBlur = 20; c.fillStyle = e.slots.plate; c.fillRect(-W * 0.65, -H * 0.05, W * 1.3, H * 0.1); c.shadowBlur = 0;
      c.fillStyle = e.slots.plateInk; c.globalAlpha = 0.5; for (let j = 0; j < 40; j++) c.fillRect(-W * 0.6 + j * 58, -12, 30 + 20 * hash(j, i), 24 * (0.4 + 0.6 * hash(i, j))); c.restore();
    }
  } },
  // neon-stage: the wiring behind the sign
  'short-circuit': { sec: 1.8, draw: (e, q, age) => {
    const c = e.ctx; const tick = Math.floor(age * 12); const a = q < 0.7 ? 1 : 1 - (q - 0.7) / 0.3;
    fill(e, e.paper, 0.72 * Math.sin(q * Math.PI));
    if (a <= 0) return;
    for (let i = 0; i < 7; i++) { const seed = tick + i * 11; arcBolt(c, [hash(seed, 1) * W, hash(seed, 2) * H * 0.4], [hash(seed, 3) * W, H * (0.6 + 0.4 * hash(seed, 4))], seed, i % 2 ? e.slots.accent : e.ink, 2.4); }
    c.save(); c.fillStyle = e.slots.plateInk; for (let i = 0; i < 80; i++) { const t = fract(age * 1.4 + hash(i, 5)); const [x, y] = [hash(i, 6) * W + (hash(i, 7) - 0.5) * 300 * t, H * 0.3 + t ** 2 * H]; c.globalAlpha = a * (1 - t); c.fillRect(x, y, 3, 10); } c.restore();
  } },
  rewire: { sec: 2.2, draw: (e, q) => {
    const c = e.ctx;
    fill(e, e.paper, 0.6 * Math.sin(q * Math.PI));
    const m = 56;
    const routes: Pt[][] = [
      [[-20, H * 0.14], [W * 0.3, H * 0.14], [W * 0.3, H - m], [W * 0.72, H - m], [W * 0.72, m], [W + 20, m]],
      [[-20, H - m], [W * 0.14, H - m], [W * 0.14, m], [W * 0.52, m], [W * 0.52, H * 0.5], [W - m, H * 0.5], [W - m, H + 20]],
      [[W + 20, H * 0.82], [W * 0.84, H * 0.82], [W * 0.84, H * 0.2], [W * 0.42, H * 0.2], [W * 0.42, -20]],
    ];
    routes.forEach((r, i) => tubeRun(c, r, ease(q * 1.5 - i * 0.16, 2), [e.ink, e.slots.ink2, e.slots.accent][i], e.slots.plateInk));
  } },
  surge: { sec: 1.7, draw: (e, q) => {
    const c = e.ctx;
    fill(e, e.paper, 0.55 * Math.sin(q * Math.PI));
    for (let i = 0; i < 9; i++) {
      const k = clamp01(q * 2.4 - i * 0.12) * (1 - clamp01((q - 0.76) / 0.24));
      if (k <= 0) continue;
      const y = H - (i + 0.5) * (H / 9);
      tubeRun(c, [[-20, y], [W + 20, y]], ease(k * 2), i % 2 ? e.slots.ink2 : e.ink, e.slots.plateInk);
    }
  } },
  // terminal: the machine losing control of itself; every word on screen is the song's
  'error-cascade': { sec: 2.2, clear: 0, draw: (e, q, age) => {
    const list = wordsOf(e);
    // dialogs up one after another, each with air round it
    for (let i = 0; i < 12; i++) {
      const l = { x: -0.72 + 0.48 * (i % 4), y: 0.68 - 0.68 * Math.floor(i / 4) - 0.04 * (i % 4), w: 0.22, h: 0.22 };
      if (openFor(e, l)) ui(e, { type: 'error', ...l, title: e.title.slice(0, 24), lines: [list[i % list.length] ?? e.title], delay: i * 0.1 }, age);
    }
    fill(e, e.slots.accent, 0.1 * Math.sin(q * Math.PI));
  } },
  'kernel-stop': { sec: 1.9, clear: 0, draw: (e, q, age) => {
    const c = e.ctx; const rows = 19; const on = Math.floor(ease(q * 1.4, 1) * rows);
    fill(e, e.paper, 0.9);
    c.font = '32px "Space Mono", "Noto Sans TC", monospace'; c.fillStyle = e.ink; c.textBaseline = 'top';
    const text = `${e.title}  ${e.words}  `.repeat(6);
    // the dump keeps to the rows the words do not stand on
    for (let i = 0; i < on; i++) { const y = 30 + i * 56; if (e.rect && y + 40 > e.rect.y0 - 24 && y < e.rect.y1 + 24) continue; c.fillText([...text].slice(i * 3, i * 3 + 60).join(''), 48, y); }
    if (q > 0.66) { const k = (q - 0.66) / 0.34; c.fillStyle = e.paper; c.fillRect(0, 0, W * ease(k), H); c.fillStyle = e.ink; if (Math.floor(age * 3) % 2 === 0) c.fillRect(46, 40, 26, 44); }
  } },
  reboot: { sec: 2.1, clear: 0, draw: (e, _q, age) => {
    fill(e, e.paper, 0.86);
    const high = e.rect ? (e.rect.y0 + e.rect.y1) / 2 > H / 2 : false;
    const bar = { x: 0, y: high ? 0.62 : -0.62, w: 0.7, h: 0.22 };
    if (openFor(e, bar)) ui(e, { type: 'progress', ...bar, title: e.title.slice(0, 30), lines: [wordsOf(e)[0] ?? e.title] }, age * 3.6);
    const a = { x: -0.5, y: high ? 0.1 : -0.1, w: 0.36, h: 0.22 };
    const b = { x: 0.5, y: high ? 0.1 : -0.1, w: 0.44, h: 0.3 };
    if (openFor(e, a)) ui(e, { type: 'loading', ...a, title: e.title.slice(0, 20), delay: 0.5 }, age);
    if (openFor(e, b)) ui(e, { type: 'terminal', ...b, lines: wordsOf(e).slice(0, 4), delay: 0.8 }, age);
  } },
  'window-storm': { sec: 2.1, clear: 0, draw: (e, _q, age) => {
    const list = wordsOf(e);
    // a grid the storm fills in, gaps kept between the windows
    for (let i = 0; i < 12; i++) {
      const l = { x: -0.72 + 0.48 * (i % 4), y: 0.66 - 0.66 * Math.floor(i / 4), w: 0.22, h: 0.28 };
      if (openFor(e, l)) ui(e, { type: (['terminal', 'files', 'log', 'code'] as const)[i % 4], ...l, title: list[i % list.length] ?? e.title, lines: list.length ? list : [e.title], delay: i * 0.1 }, age);
    }
  } },
  // led-board: what the whole wall can do at once
  'wall-word': { sec: 2.2, draw: (e, q) => {
    const c = e.ctx; const cv = wallCanvas(); const g = cv.getContext('2d')!;
    g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, 214, 120);
    g.fillStyle = e.slots.accent; g.font = '900 104px sans-serif'; g.textBaseline = 'middle';
    // only the line being sung, run across the wall in the time it is sung; between lines the wall stands empty
    const t = e.words.replace(/\s+/g, ' '); const w = g.measureText(t).width;
    if (t) g.fillText(t, 214 - (w + 214) * inOut(e.sung ?? q), 62);
    c.save(); fill(e, e.paper, 0.9); c.imageSmoothingEnabled = false; c.drawImage(cv, 0, 0, 214 * 9, 120 * 9); lampHoles(e); c.restore();
  } },
  'lamp-fall': { sec: 1.9, draw: (e, q) => {
    const c = e.ctx; const cols = 107; const cell = 18;
    fill(e, e.paper, 0.86);
    c.fillStyle = e.slots.ink2;
    for (let i = 0; i < cols; i++) {
      const lag = hash(i, e.seed) * 0.5; const k = easeIn(clamp01((q - lag) / 0.5), 2);
      const pile = Math.floor(16 + 18 * hash(i, 3)) * cell * inOut(q * 1.2) * (1 - easeIn((q - 0.75) / 0.25, 2));
      const drop = k * (H - pile);
      for (let j = 0; j < 6; j++) { const y = drop - j * cell * 2; if (y > 0 && y < H - pile) { c.beginPath(); c.arc(i * cell + 9, y, 7, 0, TAU); c.fill(); } }
      for (let y = H - 9; y > H - pile; y -= cell) { c.beginPath(); c.arc(i * cell + 9, y, 7, 0, TAU); c.fill(); }
    }
  } },
  'module-flip': { sec: 1.7, draw: (e, q) => {
    const c = e.ctx; const [n, m] = [8, 4];
    for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
      const k = clamp01(q * 2 - ((i + j) / (n + m)) * 1.1);
      const flip = Math.abs(Math.cos(k * Math.PI));
      if (k <= 0 || k >= 1) continue;
      const [w, h] = [W / n, H / m];
      c.fillStyle = k < 0.5 ? e.slots.accent : e.slots.ink2;
      c.globalAlpha = 0.9;
      c.fillRect(i * w + 6, j * h + (h * (1 - flip)) / 2, w - 12, h * flip);
      c.globalAlpha = 1;
    }
  } },
  // ink-wash: more water than the paper wanted
  'ink-flood': { sec: 2.6, clear: 0.9, reserve: true, draw: (e, q) => {
    const pours: Pt[] = [[0.14 + 0.2 * hash(e.seed, 1), 0.2], [0.84, 0.72]];
    const reach = q < 0.5 ? ease(q / 0.5, 2) * 1.3 : 1.3;
    inkWash(e.ctx, e.seed % 5, pours, reach, 1.5, mixHex(e.paper, e.ink, 0.95), 'multiply', q > 0.55 ? (q - 0.55) / 0.45 : 0);
  } },
  'great-sweep': { sec: 1.8, clear: 0.9, reserve: true, draw: (e, q) => {
    const c = e.ctx; const tone = mixHex(e.paper, e.ink, 0.96);
    const a = brushStroke(e.seed % 3, [[-120, H * 0.16], [W * 0.4, H * 0.26], [W * 0.8, H * 0.16], [W + 160, H * 0.3]], 300, tone);
    const b = brushStroke((e.seed % 3) + 4, [[W + 120, H * 0.74], [W * 0.6, H * 0.84], [W * 0.2, H * 0.72], [-160, H * 0.86]], 240, tone);
    // the brush's own front, ragged: each band of hairs arrives at its own moment
    const reveal = (cv: OffscreenCanvas, k: number, right: boolean) => { const rows = 270; for (let j = 0; j < rows; j++) { const y = (j * H) / rows; const edge = W * (k * 1.25 - 0.25 * (0.7 * smoothNoise(j / 24, 1, e.seed) + 0.3 * hash(j, e.seed))); if (edge <= 0) continue; const [sx, sw] = right ? [W - edge, edge] : [0, edge]; c.drawImage(cv, sx, y, sw, H / rows + 1, sx, y, sw, H / rows + 1); } };
    // the wet stroke sinks into the sheet instead of switching off
    c.globalAlpha = 1 - ease((q - 0.78) / 0.22, 2);
    reveal(a, ease(q * 2.4, 2), false);
    if (q > 0.3) reveal(b, ease((q - 0.3) * 2.6, 2), true);
  } },
  'ink-throw': { sec: 2, clear: 0.9, reserve: true, draw: (e, q) => {
    const c = e.ctx; const tone = mixHex(e.paper, e.ink, 0.94);
    inkWash(c, (e.seed % 5) + 1, [[0.1, 0.84]], 0.18 + 0.5 * ease(q, 2), 1.2, tone, 'multiply');
    spatter(c, e.seed, W * 0.1, H * 0.84, -0.42, 1700, tone, ease(q * 3, 2));
  } },
  // silent-film: the print itself giving out
  'film-burn': { sec: 2, draw: (e, q) => {
    // the frame stuck in the gate: a hole eats out from where the lamp is hottest, its rim glowing, then the next frame
    const c = e.ctx; const r = 0.1 + 1.05 * ease(q / 0.72, 2);
    const k = 1 - clamp01((q - 0.76) / 0.24);
    const pours: Pt[] = [[0.3 + 0.4 * hash(e.seed, 3), 0.62]];
    inkWash(c, e.seed % 5, pours, r, 4 * k, e.slots.plate, 'source-over');
    inkWash(c, e.seed % 5, pours, r, 2.2 * k, e.slots.accent, 'lighter', 0, true);
    inkWash(c, e.seed % 5, pours, r * 0.985, 1.4 * k, e.slots.plateInk, 'lighter', 0, true);
  } },
  'iris-slam': { sec: 1.9, draw: (e, q) => {
    const c = e.ctx; const [x, y] = e.rect ? [(e.rect.x0 + e.rect.x1) / 2, (e.rect.y0 + e.rect.y1) / 2] : [W / 2, H / 2];
    const small = e.rect ? Math.max(e.rect.x1 - e.rect.x0, e.rect.y1 - e.rect.y0) * 0.56 + 40 : 240;
    const r = q < 0.3 ? 1300 - (1300 - small) * ease(q / 0.3, 3) : q < 0.72 ? small : small + (1300 - small) * easeIn((q - 0.72) / 0.28, 2);
    c.save(); c.fillStyle = e.slots.plate; c.beginPath(); c.rect(0, 0, W, H); c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU, true); c.shadowColor = e.slots.plate; c.shadowBlur = 36; c.fill('evenodd'); c.restore();
  } },
  'reel-jump': { sec: 1.7, draw: (e, q) => {
    const cv = grab(e); const c = e.ctx; const jump = Math.floor(q * 5) % 2 ? 1 : 0; const y = (Math.sin(q * Math.PI) * H * 0.9 * (1 - q * 0.2) + jump * 70) % H;
    fill(e, e.slots.plate);
    c.drawImage(cv, 110, y, W - 220, H); c.drawImage(cv, 110, y - H - 26, W - 220, H);
    c.fillStyle = e.paper;
    for (let i = -1; i < 9; i++) for (const x of [32, W - 76]) { c.beginPath(); c.roundRect(x, ((i * 150 + y) % (H + 150)) - 40, 44, 74, 10); c.fill(); }
  } },
  'hand-card': { sec: 2.2, draw: (e, q) => {
    const c = e.ctx; const k = ease(q * 1.5, 2); const out = 1 - clamp01((q - 0.8) / 0.2);
    c.save(); c.globalAlpha = out; fill(e, e.slots.plate, out * 0.92); c.strokeStyle = e.slots.plateInk; c.lineCap = 'round'; c.lineWidth = 7;
    const inset = 70; c.setLineDash([(W + H) * 2 * k, 1e5]); c.strokeRect(inset, inset, W - inset * 2, H - inset * 2); c.setLineDash([]);
    for (const [x, y, sx, sy] of [[inset, inset, 1, 1], [W - inset, inset, -1, 1], [W - inset, H - inset, -1, -1], [inset, H - inset, 1, -1]]) {
      c.save(); c.translate(x, y); c.scale(sx, sy); c.beginPath();
      for (let i = 0; i < 3; i++) { c.moveTo(0, 0); c.bezierCurveTo(90 + i * 60, 10, 200 - i * 30, 90 + i * 20, 90 + i * 40, 160 + i * 40); }
      c.lineWidth = 5; c.setLineDash([700 * k, 1e4]); c.stroke(); c.setLineDash([]); c.restore();
    }
    c.restore();
  } },
  // stained-glass: the window itself moves
  shatter: { sec: 2.6, clear: 0, draw: (e, q) => {
    const c = e.ctx; const list = shardsOf(e.seed % 3); const s = e.slots;
    const tones = [mixHex(s.plate, s.accent, 0.5), mixHex(s.plate, s.ink2, 0.5), s.plate, mixHex(s.accent, s.plate, 0.2), mixHex(s.ink2, s.plate, 0.2)];
    const k = q < 0.5 ? easeIn(q / 0.5, 2) : 1 - ease((q - 0.5) / 0.5, 3);
    fill(e, e.paper, Math.sin(q * Math.PI) * 0.9);
    c.save(); c.lineJoin = 'round';
    list.forEach((p, i) => {
      const local = clamp01(k * 1.3 - 0.3 * hash(i, 4));
      c.save();
      c.translate(p.cx + p.dx * local, p.cy + p.dy * local + 500 * local * local);
      c.rotate(p.spin * local);
      c.beginPath(); p.pts.forEach(([x, y], n) => (n ? c.lineTo(x - p.cx, y - p.cy) : c.moveTo(x - p.cx, y - p.cy))); c.closePath();
      c.fillStyle = tones[p.tone]; c.fill(); c.strokeStyle = e.ink; c.lineWidth = 6; c.stroke();
      c.restore();
    });
    c.restore();
    // the light the words are leaded into holds while the rest goes: a pale pane in its own came, so no shard crosses a stroke
    if (e.rect && e.weight > 0) { const r = e.rect; const m = 34; c.save(); c.beginPath(); c.roundRect(r.x0 - m, r.y0 - m, r.x1 - r.x0 + m * 2, r.y1 - r.y0 + m * 2, 14); c.fillStyle = e.paper; c.globalAlpha = Math.min(1, e.weight * 3); c.fill(); c.strokeStyle = e.ink; c.lineWidth = 10; c.stroke(); c.restore(); }
  } },
  'rose-open': { sec: 2.2, draw: (e, q) => {
    const c = e.ctx; const R = H * 0.95 * ease(q * 1.5, 3) * (1 - easeIn((q - 0.8) / 0.2, 2)); const s = e.slots;
    c.save(); c.translate(W / 2, H / 2); c.rotate(q * 0.8);
    for (let ring = 3; ring >= 0; ring--) {
      const n = 8 + ring * 4; const [r0, r1] = [(R * ring) / 4, (R * (ring + 1)) / 4];
      for (let i = 0; i < n; i++) {
        const [a, b] = [(i / n) * TAU, ((i + 1) / n) * TAU];
        c.beginPath(); c.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); c.quadraticCurveTo(Math.cos((a + b) / 2) * r1 * 1.08, Math.sin((a + b) / 2) * r1 * 1.08, Math.cos(b) * r0, Math.sin(b) * r0); c.lineTo(Math.cos((a + b) / 2) * r1, Math.sin((a + b) / 2) * r1); c.closePath();
        c.fillStyle = [mixHex(s.plate, s.accent, 0.6), mixHex(s.plate, s.ink2, 0.6), s.plate][(i + ring) % 3]; c.fill(); c.strokeStyle = e.ink; c.lineWidth = 5; c.stroke();
      }
    }
    c.restore();
  } },
  'sun-sweep': { sec: 2, draw: (e, q) => {
    const c = e.ctx; const x = -300 + q * (W + 600);
    c.save(); c.globalCompositeOperation = 'multiply';
    [[0, e.slots.accent], [260, e.slots.ink2], [520, e.slots.faint]].forEach(([off, tone]) => { const g = c.createLinearGradient(x - Number(off) - 200, 0, x - Number(off) + 200, 0); g.addColorStop(0, `${tone}00`); g.addColorStop(0.5, tone as string); g.addColorStop(1, `${tone}00`); c.fillStyle = g; c.fillRect(0, 0, W, H); });
    c.restore();
  } },
  // gothic-lolita: the theatre of a story book
  'curtain-fall': { sec: 2.6, draw: (e, q) => {
    const c = e.ctx; const s = e.slots; const y = q < 0.45 ? ease(q / 0.45, 2) * H : q < 0.6 ? H : H * (1 - easeIn((q - 0.6) / 0.4, 2));
    c.save(); c.translate(0, y - H);
    const tone = mixHex(s.faint, s.accent, 0.12);
    for (let i = 0; i < 26; i++) { const [x, w] = [(i / 26) * W, W / 26 + 2]; const g = c.createLinearGradient(x, 0, x + w, 0); g.addColorStop(0, mixHex(tone, e.paper, 0.75)); g.addColorStop(0.5, mixHex(tone, s.ink, 0.1)); g.addColorStop(1, mixHex(tone, e.paper, 0.85)); c.fillStyle = g; c.fillRect(x, 0, w, H + 40); }
    c.fillStyle = s.accent; c.fillRect(0, H + 10, W, 18);
    for (let x = 0; x < W; x += 48) { c.beginPath(); c.arc(x + 24, H + 30, 22, 0, Math.PI); c.fill(); }
    c.restore();
  } },
  'book-open': { sec: 2.3, draw: (e, q) => {
    const c = e.ctx; const s = e.slots; const open = ease(q * 1.6, 3); const out = 1 - clamp01((q - 0.82) / 0.18);
    fill(e, e.paper, 0.5 * out);
    c.save(); c.globalAlpha = out; c.translate(W / 2, H / 2); const [pw, ph] = [W * 0.46, H * 0.9];
    [-1, 1].forEach((side) => { c.save(); c.scale(side * Math.max(0.02, open), 1); c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = 40; c.fillStyle = s.plate; c.fillRect(0, -ph / 2, pw, ph); c.shadowBlur = 0; const g = c.createLinearGradient(0, 0, 120, 0); g.addColorStop(0, 'rgba(0,0,0,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, -ph / 2, 120, ph); c.strokeStyle = s.accent; c.lineWidth = 3; c.strokeRect(36, -ph / 2 + 30, pw - 72, ph - 60); c.restore(); });
    c.restore();
  } },
  'thorn-rush': { sec: 2.4, draw: (e, q) => {
    const c = e.ctx; const g = q < 0.55 ? ease(q / 0.55, 2) : 1 - easeIn((q - 0.55) / 0.45, 2);
    c.save(); c.strokeStyle = e.slots.accent; c.fillStyle = e.slots.accent; c.lineCap = 'round';
    for (let v = 0; v < 22; v++) {
      const side = v % 4; let [x, y, a] = side === 0 ? [-20, H * hash(v, 1), 0.2] : side === 1 ? [W + 20, H * hash(v, 2), Math.PI - 0.2] : side === 2 ? [W * hash(v, 3), H + 20, -1.4] : [W * hash(v, 4), -20, 1.5];
      const n = Math.floor(70 * g);
      for (let i = 0; i < n; i++) {
        a += (hash(i, v) - 0.5) * 0.46 + 0.05 * Math.sin(i * 0.3 + v);
        const [nx, ny] = [x + Math.cos(a) * 15, y + Math.sin(a) * 15];
        c.lineWidth = 11 * (1 - i / 90); c.beginPath(); c.moveTo(x, y); c.lineTo(nx, ny); c.stroke();
        if (i % 4 === 2) { const d = i % 8 === 2 ? 1 : -1; c.beginPath(); c.moveTo(nx - Math.cos(a) * 7, ny - Math.sin(a) * 7); c.lineTo(nx + Math.cos(a + d * 1.3) * 30, ny + Math.sin(a + d * 1.3) * 30); c.lineTo(nx + Math.cos(a) * 7, ny + Math.sin(a) * 7); c.fill(); }
        [x, y] = [nx, ny];
      }
    }
    c.restore();
  } },
};

let wall: OffscreenCanvas | undefined;
const wallCanvas = () => (wall ??= new OffscreenCanvas(214, 120));
/** The lamp grid over a picture drawn cell for cell. */
const holes = () => {
  const cv = new OffscreenCanvas(36, 36);
  const g = cv.getContext('2d')!;
  g.fillStyle = 'rgba(0,0,0,1)';
  g.fillRect(0, 0, 36, 36);
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { g.beginPath(); g.arc(4.5 + i * 9, 4.5 + j * 9, 4, 0, TAU); g.fill(); }
  return cv;
};
let hole: OffscreenCanvas | undefined;
function lampHoles(e: PieceEnv) { const c = e.ctx; c.fillStyle = c.createPattern((hole ??= holes()), 'repeat')!; c.fillRect(0, 0, W, H); }

Object.assign(WORLD_PIECES, handPieces);
export const pieceAt = (id: string | undefined, age: number) => { const p = id ? WORLD_PIECES[id] : undefined; return p && age < p.sec ? { p, q: age / p.sec } : undefined; };
