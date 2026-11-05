// The five shared reading rules of the 2026-11-04 style audit, measured on one moment of a line: the frame with its
// lyrics and the same frame without them (RGBA, small). DOM-free, so the gate (scripts/lyric-vj/style-gate-reading.mts)
// runs it in the page and the spec runs it on hand-made frames.
//   clip   — a glyph touches the frame's edge (cut by the frame)
//   plate  — a flat dark patch sits under the words, apart from what is round them (an underlay or a pill). A world's own
//            object the words stand on (silent-film's title card, ink-wash's brush swash, ukiyoe's cartouche) is allowed by
//            the 2026-11-04 rule (c), so the plate is read on the ground under the carrier when the gate gives it.
//   small  — small words and an empty frame round them
//   cross  — lines or edges of the picture run under the strokes being read (oriented ones: a fine dot screen or grain is
//            texture, not a line; popart's halftone counted 70 of 489 moments though every word read, 2026-11-05)
//   low    — the ink misses 4.5:1 against what is really behind it (or against its own keyline, when it has one)
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
  /** An edge is a line's or a shape's when its gradients agree in direction over this window (structure-tensor coherence). */
  coherWin: 5,
  coherence: 0.5,
  /** Crossing: this share of the pixels under and round the strokes are the picture's edges. */
  cross: 0.08,
  /** The owner's contrast floor, against what is actually behind. */
  minContrast: 4.5,
  /** A keyline: lyric-layer pixels this near a core pixel (at 480 px wide, about 12 px of 1080p), a tenth of them at the floor. */
  keylineReach: 3,
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

/**
 * The rules on one moment; undefined when the line is not on screen (nothing to judge).
 * `ground`: the frame with the words' carriers taken away too; when given, the plate is read on it (a carrier is the
 * world's object, not an underlay), every other rule still against `off`, what is really behind the strokes.
 */
export function readMoment(on: ArrayLike<number>, off: ArrayLike<number>, w: number, h: number, ground: ArrayLike<number> = off): RuleMoment | undefined {
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
      const v = lumAt(ground, y * w + x);
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
  // crossing: the picture's edges under the strokes and two pixels round them; an edge counts where the gradients round it
  // agree in direction (a line or a shape's side), not where they point every way (a dot screen, grain)
  const gx = new Float32Array(n);
  const gy = new Float32Array(n);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; gx[i] = lum[i + 1] - lum[i - 1]; gy[i] = lum[i + w] - lum[i - w]; }
  const integral = (f: (i: number) => number) => {
    const s = new Float64Array((w + 1) * (h + 1));
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) s[(y + 1) * (w + 1) + x + 1] = f(y * w + x) + s[y * (w + 1) + x + 1] + s[(y + 1) * (w + 1) + x] - s[y * (w + 1) + x];
    return s;
  };
  const [sxx, syy, sxy] = [integral((i) => gx[i] * gx[i]), integral((i) => gy[i] * gy[i]), integral((i) => gx[i] * gy[i])];
  const r = RULES.coherWin >> 1;
  const coherent = (x: number, y: number) => {
    const [ax, ay, bx, by] = [Math.max(0, x - r), Math.max(0, y - r), Math.min(w, x + r + 1), Math.min(h, y + r + 1)];
    const box = (s: Float64Array) => s[by * (w + 1) + bx] - s[ay * (w + 1) + bx] - s[by * (w + 1) + ax] + s[ay * (w + 1) + ax];
    const [jxx, jyy, jxy] = [box(sxx), box(syy), box(sxy)];
    return Math.sqrt((jxx - jyy) ** 2 + 4 * jxy * jxy) / (jxx + jyy + 1e-6) > RULES.coherence;
  };
  let [under, edges] = [0, 0];
  for (let y = Math.max(1, y0 - 2); y < Math.min(h - 1, y1 + 2); y++)
    for (let x = Math.max(1, x0 - 2); x < Math.min(w - 1, x1 + 2); x++) {
      let near = false;
      for (let dy = -2; dy <= 2 && !near; dy++) for (let dx = -2; dx <= 2 && !near; dx++) { const yy = y + dy, xx = x + dx; if (yy >= 0 && yy < h && xx >= 0 && xx < w && text[yy * w + xx]) near = true; }
      if (!near) continue;
      under++;
      const i = y * w + x;
      if (Math.abs(gx[i]) + Math.abs(gy[i]) > RULES.edge && coherent(x, y)) edges++;
    }
  // contrast on the strokes' solid pixels (the strongest third of the change), ink against what is behind it there, or
  // against the glyph's own keyline: a stroke pixel whose surround within a few pixels holds the lyric layer's own band at
  // 4.5:1 reads on that band (psychedelic's sticker type, cream on a purple keyline, counted 23 of 489 moments low though
  // every word read, 2026-11-05). Only a relief: a stroke that reads on what is behind it is never failed by it
  const layer = new Uint8Array(n);
  for (let i = 0; i < n; i++) layer[i] = delta[i] > RULES.textDelta / 2 ? 1 : 0;
  const strong = pct(xs.map((x, k) => delta[ys[k] * w + x]), 0.66);
  const rl = RULES.keylineReach;
  let [solid, miss] = [0, 0];
  for (let k = 0; k < xs.length; k++) {
    const i = ys[k] * w + xs[k];
    if (delta[i] < strong) continue;
    solid++;
    const [a, b] = [relLum(on, i), relLum(off, i)];
    if ((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) >= RULES.minContrast) continue;
    const round: number[] = [];
    for (let y = Math.max(0, ys[k] - rl); y <= Math.min(h - 1, ys[k] + rl); y++)
      for (let x = Math.max(0, xs[k] - rl); x <= Math.min(w - 1, xs[k] + rl); x++) {
        const j = y * w + x;
        if (!layer[j]) continue;
        const q = relLum(on, j);
        round.push((Math.max(a, q) + 0.05) / (Math.min(a, q) + 0.05));
      }
    if (!round.length || pct(round, 0.9) < RULES.minContrast) miss++;
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
