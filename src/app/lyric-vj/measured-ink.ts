// Legibility is absolute (owner): every glyph's ink reads at 4.5:1 on the ground it actually stands on. Declared carriers
// (hold-room inkChecks, partGrounds, SetSpec on/rowOn) miss grounds no set declares: y2k's foil strips run a rainbow under
// each glyph, cel80s's split part stands on a lilac sky (2026-11-12 review, 3.12:1 and 2.53:1). This file measures instead:
// the ground under each glyph's box as drawn (the renderer, before it settles a line's inks), and the ink of each glyph on
// a frame against the same frame without the words (the probe gate, style-gate-ink.mts). Numbers only, DOM-free.
import { contrast } from './contrast';
import { inkDistance, readableHue } from './render/key-ink';

/** Every glyph's ink reads at least this on what is under it (WCAG AA). */
export const INK_MIN = 4.5;

const LIN = Array.from({ length: 256 }, (_, v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
/** WCAG relative luminance of an sRGB pixel. */
export const lumOf = (r: number, g: number, b: number) => 0.2126 * LIN[r] + 0.7152 * LIN[g] + 0.0722 * LIN[b];
const ratio = (x: number, y: number) => (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
const hex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

/** A box in a pixel buffer's own px (x right, y down). */
export interface PxBox { x0: number; y0: number; x1: number; y1: number }

/**
 * What a glyph stands on, read from the look under its box (RGBA rows of width `w`): the box cut CELLS × CELLS as the
 * probe gate reads a glyph (readGlyph), each cell's median tone (by luminance); the darkest and the lightest of them. An
 * ink reads on the box when it reads on both: a third of the glyph over another ground (a CD's rim) is one of them, a
 * paper's grain is not; nor the TONE_TAIL at each end of the whole box, which a rim the strokes run along can be.
 * `inner`: the share of the box read (its margin is the neighbour's).
 */
export function groundTones(data: ArrayLike<number>, w: number, box: PxBox, inner = 0.9): { lo: string; hi: string } | undefined {
  const [cx, cy, hw, hh] = [(box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2, ((box.x1 - box.x0) * inner) / 2, ((box.y1 - box.y0) * inner) / 2];
  const h = Math.floor(data.length / 4 / w);
  const [x0, x1, y0, y1] = [Math.max(0, Math.floor(cx - hw)), Math.min(w, Math.ceil(cx + hw)), Math.max(0, Math.floor(cy - hh)), Math.min(h, Math.ceil(cy + hh))];
  if (x1 <= x0 || y1 <= y0) return undefined;
  const step = Math.max(1, Math.floor(Math.min(x1 - x0, y1 - y0) / 30));
  const cells = new Map<number, [number, number, number, number][]>();
  for (let y = y0; y < y1; y += step)
    for (let x = x0; x < x1; x += step) {
      const k = (y * w + x) * 4;
      const c = Math.min(CELLS - 1, Math.floor(((x - x0) / (x1 - x0)) * CELLS)) * CELLS + Math.min(CELLS - 1, Math.floor(((y - y0) / (y1 - y0)) * CELLS));
      cells.set(c, [...(cells.get(c) ?? []), [lumOf(data[k], data[k + 1], data[k + 2]), data[k], data[k + 1], data[k + 2]]]);
    }
  const meds = [...cells.values()].map((px) => px.sort((a, b) => a[0] - b[0])[px.length >> 1]);
  if (!meds.length) return undefined;
  // (and the tenth at each end of the whole box: a rule or a rim a glyph's strokes run along is under more of its ink than
  // of its box, and the probe gate reads the ink)
  const all = [...cells.values()].flat().sort((a, b) => a[0] - b[0]);
  const ends = [all[Math.floor((all.length - 1) * TONE_TAIL)], all[Math.ceil((all.length - 1) * (1 - TONE_TAIL))]];
  const by = [...meds, ...ends].sort((a, b) => a[0] - b[0]);
  const [lo, hi] = [by[0], by[by.length - 1]];
  return { lo: hex(lo[1], lo[2], lo[3]), hi: hex(hi[1], hi[2], hi[3]) };
}

/** The share at each end of a box's tones taken as a tone of its own (groundTones). */
export const TONE_TAIL = 0.1;

/** Whether `ink` reads at `min` on every tone of every ground given (groundTones of each glyph it is drawn on). */
export const readsOn = (ink: string, grounds: ({ lo: string; hi: string } | undefined)[], min = INK_MIN) => grounds.every((g) => !g || (contrast(ink, g.lo) >= min && contrast(ink, g.hi) >= min));
/** The least an ink reads on the grounds given. */
export const leastOn = (ink: string, grounds: ({ lo: string; hi: string } | undefined)[]) => Math.min(Infinity, ...grounds.flatMap((g) => (g ? [contrast(ink, g.lo), contrast(ink, g.hi)] : [])));

/**
 * What the renderer holds an ink to on the measured ground, and what a moved ink aims for: over INK_MIN by what a drawn
 * frame takes off it (a riso ink's grain, a paper's fibres, the strokes' edges: up to 0.2 on the probe gate, 2026-11-12).
 */
export const INK_AIM = 4.8;
/** How far (OKLab) an ink's own hue may be moved to read before the world's own ink is taken instead. */
export const HUE_MOVE = 0.12;
export type Tones = { lo: string; hi: string } | undefined;
/** The darkest and the lightest of several reads of the same box (groundTones at several times). */
export function mergeTones(reads: Tones[]): Tones {
  const ok = reads.filter((r): r is NonNullable<Tones> => !!r);
  if (!ok.length) return undefined;
  const l = (c: string) => contrast(c, '#000000');
  return { lo: ok.map((r) => r.lo).sort((a, b) => l(a) - l(b))[0], hi: ok.map((r) => r.hi).sort((a, b) => l(b) - l(a))[0] };
}

/**
 * The ink a run of glyphs takes so that it reads on what each stands on, as near its own as it can: its own where it reads
 * on all; else its own hue moved in lightness until it reads on all (a key a hair short on the drawn paper); else the
 * world ink that reads best on all, where it does. `ok` false: no one ink reads on every glyph of the run (a run over a
 * white disc and a deep sky): the caller reads it glyph by glyph.
 */
export function inkFor(own: string, grounds: Tones[], world: string[], min = INK_MIN): { ink: string; ok: boolean; moved: boolean } {
  const gs = grounds.filter((g): g is NonNullable<Tones> => !!g);
  if (!gs.length || readsOn(own, gs, min)) return { ink: own, ok: true, moved: false };
  // (the tone it reads worst on decides the way it moves; a second step covers a ground on the other side of it)
  let c = own;
  for (let k = 0; k < 3 && !readsOn(c, gs, INK_AIM); k++) {
    const worst = gs.flatMap((g) => [g.lo, g.hi]).sort((a, b) => contrast(c, a) - contrast(c, b))[0];
    const m = readableHue(c, worst, INK_AIM);
    if (!m) break;
    c = m;
  }
  // (its own hue only a short move away: a big one turns a cream into a brown no one chose, the world's own ink reads better)
  if (readsOn(c, gs, min) && inkDistance(own, c) <= HUE_MOVE) return { ink: c, ok: true, moved: true };
  const best = [...new Set(world.filter((x) => /^#[0-9a-f]{6}$/i.test(x)).map((x) => x.toLowerCase()))].sort((a, b) => leastOn(b, gs) - leastOn(a, gs))[0];
  if (best && leastOn(best, gs) >= min) return { ink: best, ok: true, moved: true };
  if (readsOn(c, gs, min)) return { ink: c, ok: true, moved: true };
  const pole = ['#000000', '#ffffff'].sort((a, b) => leastOn(b, gs) - leastOn(a, gs))[0];
  return { ink: pole, ok: leastOn(pole, gs) >= min, moved: true };
}

/**
 * The ground a glyph's own patch is laid in where no one ink reads on its whole run (world-layout measureInks): of the
 * tones under it, the one its ink reads best on, moved until it reads at INK_AIM; else the world ink that reads best
 * against it; else black or white. The patch is what the glyph then stands on.
 */
export function patchTone(ink: string, under: NonNullable<Tones>, world: string[]): string {
  const near = [under.lo, under.hi].sort((a, b) => contrast(ink, b) - contrast(ink, a))[0];
  if (contrast(ink, near) >= INK_AIM) return near;
  const moved = readableHue(near, ink, INK_AIM);
  if (moved && contrast(ink, moved) >= INK_AIM) return moved;
  const best = world.filter((x) => /^#[0-9a-f]{6}$/i.test(x)).sort((a, b) => contrast(ink, b) - contrast(ink, a))[0];
  if (best && contrast(ink, best) >= INK_AIM) return best;
  return contrast(ink, '#000000') >= contrast(ink, '#ffffff') ? '#000000' : '#ffffff';
}

/**
 * The ink a glyph made of a material is really drawn in (its picture's opaque pixels, [r, g, b]), read as readGlyph reads
 * one on a frame: of the colours covering HINT_SHARE of it, the one nearest its tint; the pixels within INK_NEAR of that;
 * their median by luminance; with `on` (the ground) and each pixel's cell of a 3 × 3 grid as px[3], the cell median that
 * reads worst on it. The tint itself when nothing is there.
 */
export function drawnInk(px: number[][], tint: string, on?: string): string {
  if (!px.length) return tint;
  const h3 = [1, 3, 5].map((i) => parseInt(tint.slice(i, i + 2), 16));
  const bins = new Map<number, number[]>();
  for (const [r, g, b] of px) {
    const q = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const s = bins.get(q) ?? (bins.set(q, [0, 0, 0, 0]), bins.get(q)!);
    s[0] += r; s[1] += g; s[2] += b; s[3]++;
  }
  const far = (s: number[]) => Math.max(...[0, 1, 2].map((c) => Math.abs(s[c] / s[3] - h3[c])));
  const byShare = [...bins.values()].sort((a, b) => b[3] - a[3]);
  const mode = byShare.filter((s) => s[3] >= px.length * HINT_SHARE).sort((a, b) => far(a) - far(b))[0] ?? byShare[0];
  const m = [mode[0] / mode[3], mode[1] / mode[3], mode[2] / mode[3]];
  const near = px.filter((p) => Math.max(...[0, 1, 2].map((c) => Math.abs(p[c] - m[c]))) <= INK_NEAR).sort((a, b) => lumOf(a[0], a[1], a[2]) - lumOf(b[0], b[1], b[2]));
  const med = near[near.length >> 1] ?? m.map(Math.round);
  if (!on || near.length < MIN_INK_PX) return hex(med[0], med[1], med[2]);
  // (with the ground: as readGlyph takes a glyph's worst ninth, the cell (px[3]) whose median reads worst on it)
  const cells = new Map<number, number[][]>();
  for (const p of near) cells.set(p[3] ?? 0, [...(cells.get(p[3] ?? 0) ?? []), p]);
  const least = Math.max(MIN_CELL_PX, near.length * 0.05);
  const meds = [...cells.values()].filter((c) => c.length >= least).map((c) => c[c.length >> 1]);
  const worst = (meds.length ? meds : [med]).map((c) => hex(c[0], c[1], c[2])).sort((a, b) => contrast(a, on) - contrast(b, on))[0];
  return worst;
}

const toLin = (v: number) => LIN[Math.max(0, Math.min(255, Math.round(v)))];
const toSrgb8 = (c: number) => Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055));
/**
 * A glyph picture (RGBA rows of width `w`) as the screen shows it at `f` of its size over `ground`: averaged in linear
 * light block by block, as the GPU filters an sRGB texture, and laid over the ground by its alpha (a material's light and
 * dark threads mix lighter on screen than in the picture's own sRGB). Each pixel kept where the picture covers `cover`
 * of it: [r, g, b, cell of a 3 × 3 grid over the glyph's extent].
 */
export function onScreen(data: ArrayLike<number>, w: number, h: number, f: number, ground: string, cover = 0.25): number[][] {
  const b = Math.max(1, Math.round(1 / Math.max(0.01, f)));
  const g = [1, 3, 5].map((i) => toLin(parseInt(ground.slice(i, i + 2), 16)));
  const [W2, H2] = [Math.floor(w / b), Math.floor(h / b)];
  const out: [number, number, number, number, number][] = [];
  for (let by = 0; by < H2; by++)
    for (let bx = 0; bx < W2; bx++) {
      let [r, gg, bl, a] = [0, 0, 0, 0];
      for (let y = by * b; y < by * b + b; y++)
        for (let x = bx * b; x < bx * b + b; x++) {
          const k = (y * w + x) * 4;
          const al = data[k + 3] / 255;
          r += toLin(data[k]) * al; gg += toLin(data[k + 1]) * al; bl += toLin(data[k + 2]) * al; a += al;
        }
      const n = b * b;
      const A = a / n;
      if (A < cover) continue;
      out.push([toSrgb8(r / n + g[0] * (1 - A)), toSrgb8(gg / n + g[1] * (1 - A)), toSrgb8(bl / n + g[2] * (1 - A)), bx, by]);
    }
  if (!out.length) return [];
  // (folded, not spread: a large glyph's picture has more pixels than a call's arguments may)
  let [x0, x1, y0, y1] = [Infinity, -Infinity, Infinity, -Infinity];
  for (const p of out) [x0, x1, y0, y1] = [Math.min(x0, p[3]), Math.max(x1, p[3] + 1), Math.min(y0, p[4]), Math.max(y1, p[4] + 1)];
  return out.map(([r, gg, bl, x, y]) => [r, gg, bl, Math.min(2, Math.floor(((x - x0) / Math.max(1, x1 - x0)) * 3)) * 3 + Math.min(2, Math.floor(((y - y0) / Math.max(1, y1 - y0)) * 3))]);
}

/** One glyph read on a frame: its ink pixels, their contrast's low end (its worst ninth's median) and median, its ink and ground. */
export interface GlyphRead { n: number; low: number; median: number; ink: string; ground: string }
/** Text pixels: where the frame with the words differs from the frame without them by at least this (sum of channels). */
export const TEXT_DIFF = 60;
/** A glyph's ink pixels: text pixels within this distance (largest channel) of its commonest text colour. */
export const INK_NEAR = 48;
/** A glyph with fewer ink pixels than this is not read (a dot of punctuation, a glyph mostly off the frame). */
export const MIN_INK_PX = 40;
/** The ground under an ink pixel is the frame without the words averaged this many px round it (1080p). */
export const GRAIN = 4;
/** A colour must cover this share of a glyph's text pixels to be taken as its ink by the drawn-ink hint. */
export const HINT_SHARE = 0.1;
/** A glyph is read in a CELLS × CELLS grid: its reading is its worst cell's median (a glyph a third on a ground it misses fails). */
export const CELLS = 3;
/** A cell with fewer ink pixels than this (or a twentieth of the glyph's) is not read on its own. */
export const MIN_CELL_PX = 12;

/**
 * Reads one glyph from the same frame with (`on`) and without (`off`) the words (RGBA rows of width `w`): its text pixels,
 * of them the ink ones (near the commonest text colour: an antialiased edge, a shadow or a ring of another colour is not
 * the glyph's ink), each one's WCAG contrast against the same pixel without the words. Undefined under MIN_INK_PX.
 */
export function readGlyph(on: ArrayLike<number>, off: ArrayLike<number>, w: number, box: PxBox, hint?: string): GlyphRead | undefined {
  const h = Math.floor(on.length / 4 / w);
  const [x0, x1, y0, y1] = [Math.max(0, Math.floor(box.x0)), Math.min(w, Math.ceil(box.x1)), Math.max(0, Math.floor(box.y0)), Math.min(h, Math.ceil(box.y1))];
  const text: number[] = [];
  const bins = new Map<number, number[]>();
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const k = (y * w + x) * 4;
      if (Math.abs(on[k] - off[k]) + Math.abs(on[k + 1] - off[k + 1]) + Math.abs(on[k + 2] - off[k + 2]) < TEXT_DIFF) continue;
      text.push(k);
      const q = ((on[k] >> 4) << 8) | ((on[k + 1] >> 4) << 4) | (on[k + 2] >> 4);
      const b = bins.get(q) ?? (bins.set(q, [0, 0, 0, 0]), bins.get(q)!);
      b[0] += on[k]; b[1] += on[k + 1]; b[2] += on[k + 2]; b[3]++;
    }
  if (text.length < MIN_INK_PX) return undefined;
  // (the glyph's own ink, where the drawing says which: of the colours covering a fair share of its text pixels, the one
  // nearest the ink it was drawn in; a blown-up word's copies behind it can cover more of its box than its strokes do)
  const byShare = [...bins.values()].sort((a, b) => b[3] - a[3]);
  const h3 = hint && /^#[0-9a-f]{6}$/i.test(hint) ? [1, 3, 5].map((i) => parseInt(hint.slice(i, i + 2), 16)) : undefined;
  const far = (b: number[]) => (h3 ? Math.max(...[0, 1, 2].map((c) => Math.abs(b[c] / b[3] - h3[c]))) : 0);
  const mode = h3 ? byShare.filter((b) => b[3] >= text.length * HINT_SHARE).sort((a, b) => far(a) - far(b))[0] ?? byShare[0] : byShare[0];
  const m = [mode[0] / mode[3], mode[1] / mode[3], mode[2] / mode[3]];
  const ink = text.filter((k) => Math.max(Math.abs(on[k] - m[0]), Math.abs(on[k + 1] - m[1]), Math.abs(on[k + 2] - m[2])) <= INK_NEAR);
  if (ink.length < MIN_INK_PX) return undefined;
  // (the ground a pixel is read on is the mean of the frame without the words round it, GRAIN px each way: a paper's
  // grain is not a ground of its own, a band or a cell is)
  const r = GRAIN;
  const [gx0, gy0, gx1, gy1] = [Math.max(0, x0 - r), Math.max(0, y0 - r), Math.min(w, x1 + r), Math.min(h, y1 + r)];
  const gw = gx1 - gx0 + 1;
  const sum = [0, 1, 2].map(() => new Float64Array(gw * (gy1 - gy0 + 1)));
  for (let y = gy0; y < gy1; y++)
    for (let x = gx0; x < gx1; x++) {
      const k = (y * w + x) * 4;
      const [i, up, left, diag] = [(y - gy0 + 1) * gw + (x - gx0 + 1), (y - gy0) * gw + (x - gx0 + 1), (y - gy0 + 1) * gw + (x - gx0), (y - gy0) * gw + (x - gx0)];
      for (let c = 0; c < 3; c++) sum[c][i] = off[k + c] + sum[c][up] + sum[c][left] - sum[c][diag];
    }
  const ground = (k: number) => {
    const [x, y] = [(k / 4) % w, Math.floor(k / 4 / w)];
    const [a0, b0, a1, b1] = [Math.max(gx0, x - r), Math.max(gy0, y - r), Math.min(gx1, x + r + 1), Math.min(gy1, y + r + 1)];
    const n = (a1 - a0) * (b1 - b0);
    const at = (c: number, xx: number, yy: number) => sum[c][(yy - gy0) * gw + (xx - gx0)];
    return [0, 1, 2].map((c) => (at(c, a1, b1) - at(c, a0, b1) - at(c, a1, b0) + at(c, a0, b0)) / n);
  };
  const grounds = ink.map(ground);
  const each = ink.map((k, j) => ratio(lumOf(on[k], on[k + 1], on[k + 2]), lumOf(...(grounds[j].map(Math.round) as [number, number, number]))));
  const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[xs.length >> 1];
  // (its low end: the worst of the medians of a CELLS × CELLS grid over its box, each cell with enough ink to be read: a
  // stitched or grained ink's light threads are not a ground the glyph misses, a part of it standing on another one is)
  const cells = new Map<number, number[]>();
  ink.forEach((k, j) => {
    const [x, y] = [(k / 4) % w, Math.floor(k / 4 / w)];
    const c = Math.min(CELLS - 1, Math.floor(((x - x0) / Math.max(1, x1 - x0)) * CELLS)) * CELLS + Math.min(CELLS - 1, Math.floor(((y - y0) / Math.max(1, y1 - y0)) * CELLS));
    cells.set(c, [...(cells.get(c) ?? []), each[j]]);
  });
  const least = Math.max(MIN_CELL_PX, ink.length * 0.05);
  const lows = [...cells.values()].filter((xs) => xs.length >= least).map(med);
  const g = [0, 0, 0];
  for (const q of grounds) { g[0] += q[0]; g[1] += q[1]; g[2] += q[2]; }
  return { n: ink.length, low: +Math.min(...(lows.length ? lows : [med(each)])).toFixed(2), median: +med(each).toFixed(2), ink: hex(m[0], m[1], m[2]), ground: hex(g[0] / ink.length, g[1] / ink.length, g[2] / ink.length) };
}

/**
 * Glyph-sized cells of the text pixels in a region where no glyph boxes are known (a signature moment drawn on the 2D
 * layer): rows split at empty bands of at least `gap` px, each row split at empty columns of at least `gap` px; a cell is
 * kept at `least` px across. Boxes in the buffer's px.
 */
export function textCells(on: ArrayLike<number>, off: ArrayLike<number>, w: number, region: PxBox, gap = 6, least = 16): PxBox[] {
  const h = Math.floor(on.length / 4 / w);
  const [x0, x1, y0, y1] = [Math.max(0, Math.floor(region.x0)), Math.min(w, Math.ceil(region.x1)), Math.max(0, Math.floor(region.y0)), Math.min(h, Math.ceil(region.y1))];
  const isText = (x: number, y: number) => { const k = (y * w + x) * 4; return Math.abs(on[k] - off[k]) + Math.abs(on[k + 1] - off[k + 1]) + Math.abs(on[k + 2] - off[k + 2]) >= TEXT_DIFF; };
  const runs = (n: number, has: (i: number) => boolean): [number, number][] => {
    const out: [number, number][] = [];
    let [start, last] = [-1, -1];
    for (let i = 0; i < n; i++) {
      if (!has(i)) continue;
      if (start < 0 || i - last > gap) { if (start >= 0) out.push([start, last + 1]); start = i; }
      last = i;
    }
    if (start >= 0) out.push([start, last + 1]);
    return out;
  };
  const cells: PxBox[] = [];
  for (const [ra, rb] of runs(y1 - y0, (i) => { for (let x = x0; x < x1; x++) if (isText(x, y0 + i)) return true; return false; })) {
    for (const [ca, cb] of runs(x1 - x0, (i) => { for (let y = y0 + ra; y < y0 + rb; y++) if (isText(x0 + i, y)) return true; return false; })) {
      if (cb - ca >= least || rb - ra >= least) cells.push({ x0: x0 + ca, y0: y0 + ra, x1: x0 + cb, y1: y0 + rb });
    }
  }
  return cells;
}

/** An sRGB hex colour's WCAG luminance. */
const lumHex = (c: string) => lumOf(parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16));
/**
 * How far a glyph's tone may dim its ink and still read (ruling 2026-11-13 §3: a tone that dims the ink is no see-through
 * multiplier, and no lyric is dimmed below reading either): the renderer draws a dimmed glyph in linear light at
 * `floor + (1 - floor) · tone` of its ink (world-layout: 0.14 for a flat ink, 0.1 for a baked material's tint). Returns
 * the least tone at or over `tone` at which `ink` reads at `aim` on each of `grounds`, or as well as it reads undimmed
 * where even that is under `aim`. Pure, so the plan and the renderer get the same.
 */
export function readableTone(ink: string, grounds: string[], tone: number, floor = 0.14, aim = INK_AIM): number {
  if (tone >= 1 || !/^#[0-9a-f]{6}$/i.test(ink)) return tone;
  const li = lumHex(ink);
  const gs = grounds.filter((g) => /^#[0-9a-f]{6}$/i.test(g)).map(lumHex);
  const ratio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  const at = (t: number) => li * (floor + (1 - floor) * t);
  const needs = gs.map((g) => Math.min(aim, ratio(at(1), g)) - 1e-9);
  const ok = (t: number) => gs.every((g, k) => ratio(at(t), g) >= needs[k]);
  if (ok(tone)) return tone;
  // (contrast against each ground is monotone in t only on one side of it: step up to the first tone that reads)
  for (let t = Math.ceil(tone * 100) / 100; t < 1; t += 0.01) if (ok(t)) return +t.toFixed(2);
  return 1;
}
