// The five shared reading rules of the 2026-11-04 style audit, measured on one moment of a line: the frame with its
// lyrics and the same frame without them (RGBA, small). DOM-free, so the gate (scripts/lyric-vj/style-gate-reading.mts)
// runs it in the page and the spec runs it on hand-made frames.
//   clip   — a glyph touches the frame's edge (cut by the frame)
//   plate  — a flat dark patch sits under the words, apart from what is round them (an underlay or a pill)
//   small  — small words and an empty frame round them
//   cross  — lines or edges of the picture run under the strokes being read
//   low    — the ink misses 4.5:1 against what is really behind it
// The fifth rule, no soft glow laid behind the words, is counted where the clearing is drawn (the gate watches gradients).

/** Thresholds, calibrated on the 2026-11-04 audit's own examples (out/research/rules-1104). */
export const RULES = {
  /** A pixel is the words' where any channel moves this much between the two frames. */
  textDelta: 40,
  /** Under this share of the frame the line is not on screen at all (the reading gate's own business). */
  minText: 0.0015,
  /** Glyph pixels on the frame's outermost two pixels that make a cut. */
  clipPixels: 4,
  /** A plate: the median under the words this far from the median round them, and flat (spread under this). */
  plateDelta: 32,
  plateFlat: 20,
  /** Small: the words' box under this share of the frame and its longer side under this share of the frame's. */
  smallArea: 0.03,
  smallSide: 0.3,
  /** Empty: under this share of the frame stands off its commonest tone. */
  emptyInk: 0.12,
  /** An edge of the picture: this much change across a pixel's neighbours (grey levels). */
  edge: 56,
  /** Crossing: this share of the pixels under and round the strokes are the picture's edges. */
  cross: 0.08,
  /** The owner's contrast floor, against what is actually behind. */
  minContrast: 4.5,
  /** Low: this share of the strokes' solid pixels miss the floor. */
  lowShare: 0.5,
};

export interface RuleMoment {
  /** Share of the frame the words cover. */
  text: number;
  /** The words' box, 0..1 of the frame (1st to 99th percentile of their pixels). */
  box: [number, number, number, number];
  clip: boolean;
  /** -1: a dark plate under the words; 1: a light one; 0: none. */
  plate: -1 | 0 | 1;
  small: boolean;
  /** Share of the picture standing off its commonest tone. */
  ink: number;
  cross: number;
  /** Share of the strokes' solid pixels under the contrast floor. */
  low: number;
}

const lumAt = (d: ArrayLike<number>, i: number) => 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
const lin = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const relLum = (d: ArrayLike<number>, i: number) => 0.2126 * lin(d[i * 4]) + 0.7152 * lin(d[i * 4 + 1]) + 0.0722 * lin(d[i * 4 + 2]);
const median = (v: number[]) => { if (!v.length) return 0; const s = [...v].sort((a, b) => a - b); return s[s.length >> 1]; };
const pct = (v: number[], p: number) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))]; };

/** The rules on one moment; undefined when the line is not on screen (nothing to judge). */
export function readMoment(on: ArrayLike<number>, off: ArrayLike<number>, w: number, h: number): RuleMoment | undefined {
  const n = w * h;
  const text = new Uint8Array(n);
  const delta = new Float32Array(n);
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < n; i++) {
    const d = Math.max(Math.abs(on[i * 4] - off[i * 4]), Math.abs(on[i * 4 + 1] - off[i * 4 + 1]), Math.abs(on[i * 4 + 2] - off[i * 4 + 2]));
    delta[i] = d;
    if (d > RULES.textDelta) { text[i] = 1; xs.push(i % w); ys.push(Math.floor(i / w)); }
  }
  if (xs.length < RULES.minText * n) return undefined;
  const [x0, x1, y0, y1] = [pct(xs, 0.01), pct(xs, 0.99) + 1, pct(ys, 0.01), pct(ys, 0.99) + 1];
  // clip: glyph pixels on the outermost two pixels of the frame
  let edgeHits = 0;
  for (let i = 0; i < xs.length; i++) if (xs[i] <= 1 || ys[i] <= 1 || xs[i] >= w - 2 || ys[i] >= h - 2) edgeHits++;
  // what is behind the words, and what is round them
  const inside: number[] = [];
  const ring: number[] = [];
  const [p0, p1] = [Math.round(h * 0.05), Math.round(h * 0.13)];
  for (let y = Math.max(0, y0 - p1); y < Math.min(h, y1 + p1); y++)
    for (let x = Math.max(0, x0 - p1); x < Math.min(w, x1 + p1); x++) {
      const v = lumAt(off, y * w + x);
      if (x >= x0 && x < x1 && y >= y0 && y < y1) inside.push(v);
      else if (x < x0 - p0 || x >= x1 + p0 || y < y0 - p0 || y >= y1 + p0) ring.push(v);
    }
  const [mIn, mRing] = [median(inside), median(ring)];
  const spread = pct(inside, 0.84) - pct(inside, 0.16);
  const plate: -1 | 0 | 1 = ring.length > 20 && Math.abs(mIn - mRing) > RULES.plateDelta && spread < RULES.plateFlat ? (mIn < mRing ? -1 : 1) : 0;
  // the picture's ink: what stands off its commonest tone
  const hist = new Array(32).fill(0);
  const lum = new Float32Array(n);
  for (let i = 0; i < n; i++) { lum[i] = lumAt(off, i); hist[Math.min(31, lum[i] >> 3)]++; }
  const bg = (hist.indexOf(Math.max(...hist)) << 3) + 4;
  let inkPx = 0;
  for (let i = 0; i < n; i++) if (Math.abs(lum[i] - bg) > 30) inkPx++;
  const area = ((x1 - x0) * (y1 - y0)) / n;
  const small = area < RULES.smallArea && Math.max((x1 - x0) / w, (y1 - y0) / h) < RULES.smallSide && inkPx / n < RULES.emptyInk;
  // crossing: the picture's edges under the strokes and two pixels round them
  let [under, edges] = [0, 0];
  for (let y = Math.max(1, y0 - 2); y < Math.min(h - 1, y1 + 2); y++)
    for (let x = Math.max(1, x0 - 2); x < Math.min(w - 1, x1 + 2); x++) {
      let near = false;
      for (let dy = -2; dy <= 2 && !near; dy++) for (let dx = -2; dx <= 2 && !near; dx++) { const yy = y + dy, xx = x + dx; if (yy >= 0 && yy < h && xx >= 0 && xx < w && text[yy * w + xx]) near = true; }
      if (!near) continue;
      under++;
      const i = y * w + x;
      if (Math.abs(lum[i + 1] - lum[i - 1]) + Math.abs(lum[i + w] - lum[i - w]) > RULES.edge) edges++;
    }
  // contrast on the strokes' solid pixels (the strongest third of the change), ink against what is behind it there
  const strong = pct(xs.map((x, k) => delta[ys[k] * w + x]), 0.66);
  let [solid, miss] = [0, 0];
  for (let k = 0; k < xs.length; k++) {
    const i = ys[k] * w + xs[k];
    if (delta[i] < strong) continue;
    solid++;
    const [a, b] = [relLum(on, i), relLum(off, i)];
    if ((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) < RULES.minContrast) miss++;
  }
  return { text: xs.length / n, box: [x0 / w, y0 / h, x1 / w, y1 / h], clip: edgeHits >= RULES.clipPixels, plate, small, ink: inkPx / n, cross: edges / Math.max(1, under), low: miss / Math.max(1, solid) };
}

/** Per-rule counts of failing moments, the gate's unit (a world's before and after are compared on these). */
export interface RuleCounts { moments: number; glow: number; clip: number; plate: number; small: number; cross: number; low: number }
export const emptyCounts = (): RuleCounts => ({ moments: 0, glow: 0, clip: 0, plate: 0, small: 0, cross: 0, low: 0 });
/** Adds one moment (and whether a soft clearing was drawn for it) to the counts. */
export function countMoment(c: RuleCounts, m: RuleMoment, glow: boolean): RuleCounts {
  return { moments: c.moments + 1, glow: c.glow + (glow ? 1 : 0), clip: c.clip + (m.clip ? 1 : 0), plate: c.plate + (m.plate < 0 ? 1 : 0), small: c.small + (m.small ? 1 : 0), cross: c.cross + (m.cross > RULES.cross ? 1 : 0), low: c.low + (m.low > RULES.lowShare ? 1 : 0) };
}
/** The rules a world got worse on against its recorded counts (shares of its moments, so a changed line count is fair). */
export function regressions(before: RuleCounts, after: RuleCounts, slack = 0.02): string[] {
  const keys = ['glow', 'clip', 'plate', 'small', 'cross', 'low'] as const;
  const share = (c: RuleCounts, k: (typeof keys)[number]) => c[k] / Math.max(1, c.moments);
  return keys.filter((k) => share(after, k) > share(before, k) + slack);
}
