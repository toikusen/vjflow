// Other ways to print a cut-out character in a cut's inks (kinetic.ts prints a two-ink duotone by default):
// - line: its outlines and folds as ink lines, drawn on stroke by stroke over the cut's first second (the traced
//   line art of the 大字報 MVs, made from our own cut-outs instead of generated pictures)
// - halftone: a dot screen in ink over a paper silhouette (newsprint, the green 大字報 MV)
// Each picture is made once per sprite and inks, then cached.
type Pic = CanvasImageSource & { width: number; height: number };

const cache = new Map<string, HTMLCanvasElement[] | HTMLCanvasElement>();
/** Stages of a line drawing being drawn on (the last is the whole drawing). */
export const LINE_STAGES = 10;
/** How long the drawing takes to draw itself, seconds. */
export const LINE_DRAW_SEC = 0.9;

const rgb = (h: string) => {
  const x = h.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16) || 0);
};
const hash = (a: number, b: number) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

function pixels(pic: Pic, maxH = 900) {
  const s = Math.min(1, maxH / pic.height);
  const w = Math.max(1, Math.round(pic.width * s)), h = Math.max(1, Math.round(pic.height * s));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  if (!g) return undefined;
  g.drawImage(pic, 0, 0, w, h);
  return { w, h, d: g.getImageData(0, 0, w, h).data };
}

/**
 * Where the drawing has lines: the silhouette's edge and strong changes of brightness inside it (a Sobel edge on
 * luminance). Returns per pixel 0 (none) or the order 0..1 in which a pen would reach it.
 */
export function lineOrder(d: Uint8ClampedArray, w: number, h: number): Float32Array {
  const lum = new Float32Array(w * h), alpha = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    alpha[i] = d[i * 4 + 3] / 255;
    lum[i] = (0.3 * d[i * 4] + 0.59 * d[i * 4 + 1] + 0.11 * d[i * 4 + 2]) / 255;
  }
  const out = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (alpha[i] < 0.5) continue;
      const at = (dx: number, dy: number) => lum[i + dy * w + dx] * alpha[i + dy * w + dx];
      const gx = at(1, -1) + 2 * at(1, 0) + at(1, 1) - at(-1, -1) - 2 * at(-1, 0) - at(-1, 1);
      const gy = at(-1, 1) + 2 * at(0, 1) + at(1, 1) - at(-1, -1) - 2 * at(0, -1) - at(1, -1);
      const rim = alpha[i - 1] < 0.5 || alpha[i + 1] < 0.5 || alpha[i - w] < 0.5 || alpha[i + w] < 0.5;
      if (!rim && Math.hypot(gx, gy) < 0.55) continue;
      // top to bottom in patches, as a hand would work down the figure
      out[i] = Math.min(0.999, 0.001 + 0.75 * (y / h) + 0.25 * hash(Math.floor(x / 48), Math.floor(y / 48)));
    }
  return out;
}

/** The line drawing in `ink`, in LINE_STAGES cumulative stages. */
export function lineArt(pic: Pic, key: string, ink: string): HTMLCanvasElement[] | undefined {
  const k = `line|${key}|${ink}`;
  const hit = cache.get(k);
  if (hit) return hit as HTMLCanvasElement[];
  if (typeof document === 'undefined') return undefined;
  const px = pixels(pic);
  if (!px) return undefined;
  const order = lineOrder(px.d, px.w, px.h);
  const [r, g, b] = rgb(ink);
  const stages = Array.from({ length: LINE_STAGES }, (_, s) => {
    const c = document.createElement('canvas');
    c.width = px.w;
    c.height = px.h;
    const cx = c.getContext('2d')!;
    const img = cx.createImageData(px.w, px.h);
    const upto = (s + 1) / LINE_STAGES;
    for (let i = 0; i < order.length; i++) {
      if (!order[i] || order[i] > upto) continue;
      img.data.set([r, g, b, 255], i * 4);
    }
    cx.putImageData(img, 0, 0);
    // thicken the one-pixel edge a little, like a fine pen
    cx.globalCompositeOperation = 'source-over';
    cx.drawImage(c, 1, 0);
    cx.drawImage(c, 0, 1);
    return c;
  });
  cache.set(k, stages);
  return stages;
}

/** The stage of the line drawing to show `age` seconds into the cut. */
export const lineStage = (age: number) => Math.min(LINE_STAGES - 1, Math.floor((Math.max(0, age) / LINE_DRAW_SEC) * LINE_STAGES));

/** The character as a dot screen: ink dots sized by darkness on a paper silhouette. */
export function halftone(pic: Pic, key: string, ink: string, paper: string, cell = 9): HTMLCanvasElement | undefined {
  const k = `dots|${key}|${ink}|${paper}|${cell}`;
  const hit = cache.get(k);
  if (hit) return hit as HTMLCanvasElement;
  if (typeof document === 'undefined') return undefined;
  const px = pixels(pic);
  if (!px) return undefined;
  const c = document.createElement('canvas');
  c.width = px.w;
  c.height = px.h;
  const g = c.getContext('2d')!;
  // the silhouette in paper
  g.drawImage(pic, 0, 0, px.w, px.h);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = paper;
  g.fillRect(0, 0, px.w, px.h);
  g.globalCompositeOperation = 'source-over';
  g.fillStyle = ink;
  for (let y = cell / 2, row = 0; y < px.h; y += cell, row++)
    for (let x = row % 2 ? cell : cell / 2; x < px.w; x += cell) {
      const i = (Math.floor(y) * px.w + Math.floor(x)) * 4;
      if (px.d[i + 3] < 128) continue;
      const l = (0.3 * px.d[i] + 0.59 * px.d[i + 1] + 0.11 * px.d[i + 2]) / 255;
      const r = (cell / 2) * 1.15 * Math.sqrt(1 - l);
      if (r < 0.4) continue;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
  cache.set(k, c);
  return c;
}
