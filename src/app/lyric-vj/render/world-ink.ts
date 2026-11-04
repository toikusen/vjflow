// Sumi on paper, worked out rather than airbrushed. Water does not spread as a blur: it runs along fibres, so its front is
// feathered and uneven, and it leaves its load at the line where it stops. Here a first-passage field over a sheet of random
// fibres gives each cell the moment water reaches it; the wash, its dark drying edge, pooling and granulation all read from
// that. A loaded brush is laid separately, bristle by bristle, running dry along its stroke.
import { mixHex, Pt } from './material';

const W = 1920;
const H = 1080;
const [GW, GH] = [640, 360];
const fract = (x: number) => x - Math.floor(x);
const hash = (a: number, b = 0) => fract(Math.sin(a * 127.1 + b * 311.7) * 43758.5453);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

// (the grid work below runs once per sheet and pour, on the frame that first needs it: written without tuples or
// closures, the same arithmetic in the same order, so a new wash costs a hitch and not a frozen picture)
export const smoothNoise = (x: number, y: number, seed: number) => {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const u = x - ix;
  const v = y - iy;
  const su = u * u * (3 - 2 * u);
  const sv = v * v * (3 - 2 * v);
  const s2 = seed * 2;
  return hash(ix + seed, iy - s2) * (1 - su) * (1 - sv) + hash(ix + 1 + seed, iy - s2) * su * (1 - sv) + hash(ix + seed, iy + 1 - s2) * (1 - su) * sv + hash(ix + 1 + seed, iy + 1 - s2) * su * sv;
};

interface Sheet { cost: Float32Array; pool: Float32Array }
const sheets = new Map<number, Sheet>();
/** How hard water finds each cell, and where it pools: long fibres are channels, the rest is slow going. */
function sheetOf(seed: number): Sheet {
  const hit = sheets.get(seed);
  if (hit) return hit;
  const cost = new Float32Array(GW * GH);
  const pool = new Float32Array(GW * GH);
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    const i = y * GW + x;
    const coarse = smoothNoise(x / 46, y / 46, seed) * 0.6 + smoothNoise(x / 15, y / 15, seed + 1) * 0.4;
    cost[i] = 0.55 + 2.6 * coarse ** 2 + 0.5 * hash(i, seed);
    pool[i] = smoothNoise(x / 22, y / 22, seed + 2) * 0.62 + smoothNoise(x / 7, y / 7, seed + 3) * 0.38;
  }
  for (let f = 0; f < 9000; f++) {
    let [x, y] = [hash(f, seed + 4) * GW, hash(f, seed + 5) * GH];
    let a = hash(f, seed + 6) * Math.PI * 2;
    const n = 10 + 44 * hash(f, seed + 7) ** 2;
    for (let k = 0; k < n; k++) {
      a += (hash(k, f) - 0.5) * 0.5;
      x += Math.cos(a);
      y += Math.sin(a);
      const i = Math.floor(y) * GW + Math.floor(x);
      if (i >= 0 && i < cost.length) cost[i] *= 0.46;
    }
  }
  if (sheets.size > 4) sheets.delete(sheets.keys().next().value!);
  sheets.set(seed, { cost, pool });
  return sheets.get(seed)!;
}

/** Water closes round a slow speck of paper: left in, the sheet's specks read as a rash of round white dots inside a wash. */
function closeIslands(T: Float32Array, r = 4) {
  // a round reach: a square one prints its corners into the wash's edge as stairs
  const offsets: number[] = [];
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r + 1) offsets.push(dy * GW + dx);
  const disc = Int32Array.from(offsets);
  for (const least of [true, false]) {
    const S = T.slice();
    for (let y = r; y < GH - r; y++) for (let x = r; x < GW - r; x++) {
      const i = y * GW + x;
      let v = S[i];
      if (least) for (let k = 0; k < disc.length; k++) v = Math.min(v, S[i + disc[k]]);
      else for (let k = 0; k < disc.length; k++) v = Math.max(v, S[i + disc[k]]);
      T[i] = v;
    }
  }
}

const fields = new Map<string, Float32Array>();
/** When water reaches each cell from these pours, in frame fractions. A binary heap over the grid: Dijkstra, eight-way. */
function arrival(seed: number, pours: Pt[]): Float32Array {
  const key = `${seed}|${pours.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(';')}`;
  const hit = fields.get(key);
  if (hit) return hit;
  const { cost } = sheetOf(seed);
  const T = new Float32Array(GW * GH).fill(Infinity);
  // a binary heap in typed arrays (the keys stay doubles: they are compared against the float32 field as before)
  let heap = new Int32Array(1 << 16);
  let keys = new Float64Array(1 << 16);
  let size = 0;
  const push = (i: number, t: number) => {
    if (size === heap.length) {
      const [h, k] = [new Int32Array(size * 2), new Float64Array(size * 2)];
      h.set(heap);
      k.set(keys);
      [heap, keys] = [h, k];
    }
    let n = size++;
    heap[n] = i;
    keys[n] = t;
    while (n > 0) {
      const p = (n - 1) >> 1;
      if (keys[p] <= t) break;
      const hi = heap[n];
      heap[n] = heap[p];
      heap[p] = hi;
      const ki = keys[n];
      keys[n] = keys[p];
      keys[p] = ki;
      n = p;
    }
  };
  for (const [x, y] of pours) { const i = Math.floor(y * (GH - 1)) * GW + Math.floor(x * (GW - 1)); T[i] = 0; push(i, 0); }
  while (size) {
    const i = heap[0];
    const t = keys[0];
    size--;
    if (size) {
      heap[0] = heap[size];
      keys[0] = keys[size];
      let n = 0;
      for (;;) {
        const l = 2 * n + 1;
        const r = l + 1;
        let m = n;
        if (l < size && keys[l] < keys[m]) m = l;
        if (r < size && keys[r] < keys[m]) m = r;
        if (m === n) break;
        const hi = heap[n];
        heap[n] = heap[m];
        heap[m] = hi;
        const ki = keys[n];
        keys[n] = keys[m];
        keys[m] = ki;
        n = m;
      }
    }
    if (t > T[i]) continue;
    const x = i % GW;
    const y = Math.floor(i / GW);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
      const j = ny * GW + nx;
      const nt = t + cost[j] * (dx && dy ? 1.41 : 1);
      if (nt < T[j]) { T[j] = nt; push(j, nt); }
    }
  }
  closeIslands(T);
  // first-passage times run in steps of whole cells: two soft passes take the stairs out of the front, not its feathers
  for (let pass = 0; pass < 2; pass++) {
    const S = T.slice();
    for (let y = 1; y < GH - 1; y++) for (let x = 1; x < GW - 1; x++) { const i = y * GW + x; T[i] = (S[i] * 4 + S[i - 1] + S[i + 1] + S[i - GW] + S[i + GW]) / 8; }
  }
  if (fields.size > 8) fields.delete(fields.keys().next().value!);
  fields.set(key, T);
  return T;
}

let wash: OffscreenCanvas | undefined;
/**
 * A pour of ink as it stands. `reach` runs from 0 towards 1 of the sheet (past 1 it has soaked everything); `load` how much
 * pigment it carries; `lift` takes it back out of the paper, for a wash being blotted away.
 */
export function inkWash(c: CanvasRenderingContext2D, seed: number, pours: Pt[], reach: number, load: number, tone: string, blend: GlobalCompositeOperation, lift = 0, edgeOnly = false) {
  const T = arrival(seed, pours);
  const { pool } = sheetOf(seed);
  const front = reach * 330;
  const cv = (wash ??= new OffscreenCanvas(GW, GH));
  const g = cv.getContext('2d')!;
  const img = g.createImageData(GW, GH);
  const [r, gg, b] = [1, 3, 5].map((i) => parseInt(tone.slice(i, i + 2), 16));
  const d = img.data;
  for (let i = 0; i < T.length; i++) {
    const t = T[i] + 16 * (pool[i] - 0.5); // the fibres feather the front
    if (t >= front) continue;
    const u = clamp01(t / front);
    // thin in the belly of the wash, heaviest where the brush came down and where the water stopped
    const belly = 0.42 * (1 - u) ** 1.6 + 0.16;
    const edge = (front - t) < 10 ? 0.44 * ((front - t) / 10) : 0.44 * Math.exp(-(front - t - 10) / 16);
    const grain = 0.5 + pool[i];
    const a = clamp01(((edgeOnly ? 0 : belly * grain) + edge) * load * clamp01((front - t) / 2.4) * (1 - lift * (0.6 + 0.8 * pool[i])));
    const k = i * 4;
    d[k] = r; d[k + 1] = gg; d[k + 2] = b; d[k + 3] = 255 * a;
  }
  g.putImageData(img, 0, 0);
  c.save();
  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = 'high';
  c.globalCompositeOperation = blend;
  c.filter = 'blur(3px)';
  c.drawImage(cv, 0, 0, W, H);
  c.filter = 'none';
  c.restore();
}

const strokes = new Map<string, OffscreenCanvas>();
/**
 * One stroke of a loaded brush, run along `path` (left to right or back, frame px), worked out pixel by pixel: across the
 * stroke the hairs make a fine irregular profile, along it the ink runs out, and where it is short only the paper's high
 * points take it. So the belly is wet and whole, the edge wanders, and the tail breaks into dry-brush the way sumi does.
 */
export function brushStroke(seed: number, path: Pt[], width: number, tone: string, w = W, h = H, dryAt = 0.5) {
  const key = `${seed}|${tone}|${width}|${path.join()}|${w}|${h}|${dryAt}`;
  const hit = strokes.get(key);
  if (hit) return hit;
  const scale = 0.5;
  const [cw, ch] = [Math.ceil(w * scale), Math.ceil(h * scale)];
  const low = new OffscreenCanvas(cw, ch);
  const g = low.getContext('2d')!;
  const img = g.createImageData(cw, ch);
  const [r, gg, b] = [1, 3, 5].map((i) => parseInt(tone.slice(i, i + 2), 16));
  const flip = path[path.length - 1][0] < path[0][0];
  const pts = flip ? [...path].reverse() : path;
  const [x0, x1] = [pts[0][0], pts[pts.length - 1][0]];
  // the stroke's middle line: through the path's points, smoothly
  const yAt = (x: number) => {
    let i = 0;
    while (i < pts.length - 2 && x > pts[i + 1][0]) i++;
    const k = clamp01((x - pts[i][0]) / Math.max(1, pts[i + 1][0] - pts[i][0]));
    const sm = k * k * (3 - 2 * k);
    return pts[i][1] + (pts[i + 1][1] - pts[i][1]) * sm;
  };
  const half = width / 2;
  for (let py = 0; py < ch; py++) for (let px = 0; px < cw; px++) {
    const [x, y] = [px / scale, py / scale];
    const along = clamp01((x - x0) / Math.max(1, x1 - x0));
    const s = flip ? 1 - along : along;
    const v = (y - yAt(x)) / half;
    const wander = 0.1 * (smoothNoise(x / 140, 3.1, seed) - 0.5) + 0.03 * (smoothNoise(x / 44, 9.1, seed) - 0.5);
    // the brush lands blunt and lifts narrowing
    const width1 = (0.86 + 0.14 * clamp01(s / 0.06) ** 0.5) * (1 - 0.34 * clamp01((s - 0.7) / 0.3) ** 2);
    const d = Math.abs(v + wander * 2) / width1;
    if (d > 1.04 || x < x0) continue;
    const hair = smoothNoise((v + 3) * 42 + 3 * smoothNoise(x / 240, 1, seed), x / 500, seed + 1) * 0.6 + smoothNoise((v + 3) * 120, x / 260, seed + 2) * 0.4;
    const tooth = hash(px, py + seed) * 0.5 + smoothNoise(x / 5, y / 5, seed + 3) * 0.5;
    const dry = clamp01((s - dryAt) / (1 - dryAt)) ** 1.3 + 0.1 * d ** 10 * clamp01(s * 3);
    const take = hair * 0.62 + tooth * 0.38 - dry * 1.04 + 0.42;
    const landed = clamp01((s - 0.012 - 0.05 * smoothNoise(y / 34, 2.2, seed)) * 90);
    const a = clamp01((take - 0.12) * 7) * clamp01((1.04 - d) * 14) * landed;
    if (a <= 0) continue;
    const body = 0.96 + 0.04 * smoothNoise(x / 300, y / 200, seed + 4);
    const k = (py * cw + px) * 4;
    img.data[k] = r; img.data[k + 1] = gg; img.data[k + 2] = b; img.data[k + 3] = 255 * a * body;
  }
  g.putImageData(img, 0, 0);
  const cv = new OffscreenCanvas(w, h);
  const c = cv.getContext('2d')!;
  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = 'high';
  c.drawImage(low, 0, 0, w, h);
  if (strokes.size > 16) strokes.delete(strokes.keys().next().value!);
  strokes.set(key, cv);
  return cv;
}

const reserves = new Map<string, OffscreenCanvas>();
/** Paper the brush went round (留白): the block of words kept bare with a torn, fibrous edge, where an airbrushed clearing would show. */
export function reservePaper(c: CanvasRenderingContext2D, seed: number, rect: { x0: number; y0: number; x1: number; y1: number }, tone: string, alpha: number) {
  if (alpha <= 0) return;
  const snap = (v: number) => Math.round(v / 8) * 8;
  const [x0, y0, x1, y1] = [rect.x0, rect.y0, rect.x1, rect.y1].map(snap);
  const key = `${seed}|${tone}|${x0},${y0},${x1},${y1}`;
  let cv = reserves.get(key);
  if (!cv) {
    const [cw, ch, step] = [480, 270, 4];
    cv = new OffscreenCanvas(cw, ch);
    const g = cv.getContext('2d')!;
    const img = g.createImageData(cw, ch);
    const [r, gg, b] = [1, 3, 5].map((i) => parseInt(tone.slice(i, i + 2), 16));
    const [cx, cy, rx, ry] = [(x0 + x1) / 2, (y0 + y1) / 2, ((x1 - x0) / 2) * 1.12 + 80, ((y1 - y0) / 2) * 1.12 + 70];
    for (let py = 0; py < ch; py++) for (let px = 0; px < cw; px++) {
      const [x, y] = [px * step, py * step];
      const d = (Math.abs((x - cx) / rx) ** 4 + Math.abs((y - cy) / ry) ** 4) ** 0.25;
      const torn = 1 + 0.3 * (smoothNoise(x / 110, y / 110, seed) - 0.5) + 0.2 * (smoothNoise(x / 26, y / 26, seed + 1) - 0.5) + 0.07 * (hash(px, py + seed) - 0.5);
      const k = (py * cw + px) * 4;
      img.data[k] = r; img.data[k + 1] = gg; img.data[k + 2] = b; img.data[k + 3] = 255 * clamp01((torn - d) * 48);
    }
    g.putImageData(img, 0, 0);
    if (reserves.size > 8) reserves.delete(reserves.keys().next().value!);
    reserves.set(key, cv);
  }
  c.save();
  c.globalAlpha = alpha;
  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = 'high';
  c.drawImage(cv, 0, 0, W, H);
  c.restore();
}

/** Droplets thrown off a loaded brush: a few heavy ones with feathered rims, a spray of fine ones along the throw. */
export function spatter(c: CanvasRenderingContext2D, seed: number, x: number, y: number, dir: number, reach: number, tone: string, k: number) {
  c.save();
  c.fillStyle = tone;
  for (let i = 0; i < 170; i++) {
    const far = hash(i, seed) ** 1.7 * reach * k;
    const a = dir + (hash(i, seed + 1) - 0.5) * 1.2;
    const r = 0.8 + 9 * hash(i, seed + 2) ** 7 + 1.6 * hash(i, seed + 5);
    c.globalAlpha = 0.5 + 0.5 * hash(i, seed + 3);
    c.beginPath();
    c.ellipse(x + Math.cos(a) * far, y + Math.sin(a) * far, r * (1 + 0.5 * hash(i, 8)), r, a, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
}
export { mixHex };
