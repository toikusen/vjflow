// The final-composite ink gate's numbers (gate v2, docs/research/2026-11-13-ink-table-gate-design.md §1): glyph IDs as
// colours, every ink pixel's WCAG contrast against the same pixel of the same final composite without the words, and
// each glyph's verdict. No averages decide: a glyph passes only when its worst core pixel reads at INK_MIN. DOM-free.
import { INK_MIN, lumOf } from './measured-ink';

/** A glyph's ID: the line's slot on this moment (1..255) and its index in the line, 24 bits, 0 for no glyph. */
export const idOf = (lineSlot: number, glyph: number) => ((lineSlot & 255) << 16) | ((glyph + 1) & 0xffff);
export const lineOfId = (id: number) => (id >> 16) & 255;
export const glyphOfId = (id: number) => (id & 0xffff) - 1;
/** The ID as an sRGB triple 0..255 (drawn with no colour management: what is written is what is read back). */
export const idRgb = (id: number): [number, number, number] => [(id >> 16) & 255, (id >> 8) & 255, id & 255];
export const rgbId = (r: number, g: number, b: number) => (r << 16) | (g << 8) | b;

export type InkStatus = 'pass' | 'fail' | 'unverified:no-core' | 'unverified:all-mixed' | 'unverified:field-drift' | 'unverified:nondeterministic' | 'unverified:layer-2d';
/** Where a glyph is in its life on this moment: only to sort the fixes, never to skip it. */
export type InkPhase = 'enter' | 'exit' | 'rest' | 'hold' | 'fade' | 'unsung';

/**
 * A glyph's part drawn in the parts mask (ruling 2026-11-13 §1, docs/research/2026-11-13-ink-halo-codex.md), by reading
 * role: `extrude` a declared same- or near-colour extrude merged into the reading glyph (world-layout READING_EXTRUDE,
 * never merged after a fail); `outline` a ring under the whole letter, its reading underlay; `copy` a misprint, an echo,
 * a ghost, a shine, an undeclared extrude: interference, read like any ground.
 */
export type PartRole = 'extrude' | 'outline' | 'copy';
const ROLES: PartRole[] = ['extrude', 'outline', 'copy'];
/** A part's ID in the parts mask: its glyph's ID with the role in the glyph field's top 4 bits (a line under 4095 glyphs). */
export const partIdOf = (lineSlot: number, glyph: number, role: PartRole) => idOf(lineSlot, glyph) | ((ROLES.indexOf(role) + 1) << 12);
const partRole = (id: number): PartRole | undefined => ROLES[((id >> 12) & 15) - 1];
const partBase = (id: number) => id & ~0xf000;

/** What the worst pixel of a glyph was read against: `off` the same pixel without the words (see-through ink). */
export type PairRole = 'ground' | 'outline' | 'copy' | 'part' | 'off';

export interface GlyphVerdict {
  id: number;
  /** Core pixels: every sample point the final pass read the glyph's place from was this glyph (and its declared extrude). */
  n: number;
  min: number;
  p01: number;
  median: number;
  /** The worst core pixel: x, y (in the read box), its luminance and what it was read against. */
  minAt: [number, number, number, number];
  /** The worst pair, both ends: the glyph's pixel (face or its declared extrude) and what it was read against. */
  pair?: { p: [number, number, 'face' | 'extrude']; q: [number, number, PairRole] };
  /** Mixed pixels (some sample points another glyph or none): diagnosis only, listed when under INK_MIN. */
  edge?: { n: number; min: number };
  /**
   * The shape gate (ruling §1): the reading glyph against its own face as the reference: `joins` it touches another
   * glyph's reading glyph; with a declared extrude, `bridge` (two strokes joined), `counter-closed`, `opening-sealed`,
   * `gap-narrowed` (a counter under 2 px wide where the face left it wider). Any of them fails the glyph.
   */
  shape?: string[];
  /** The narrowest counter, px: the face's and the merged reading glyph's (a declared extrude only). */
  gap?: { face: number; glyph: number };
  status: InkStatus;
}

/** How far round an opaque face its visible surroundings are read, px (the face against what borders it on screen). */
export const RIM = 3;
/** An extrude pixel differs from the frame without the words by at least this ratio to be drawn visibly (else ground). */
export const EXTRUDE_SHOWS = 1.1;
/** At or over this drawn opacity a glyph's face hides what is under it: it is read against its visible surroundings. */
export const OPAQUE = 0.99;

/**
 * Every glyph's verdict from three equal boxes read back from one moment (RGBA rows of width `w`): the final composite with
 * the words (`on`), the same without them on the same controls (`off`), and the warped ID mask (rgb: the ID, a: 255 for a
 * core pixel, else mixed); `parts`, when given, the glyphs' parts by role (partIdOf). No pixel is averaged; by reading
 * role (ruling 2026-11-13 §1):
 * - a glyph whose drawn opacity is under OPAQUE shows the ground through its ink: each core pixel against the same pixel
 *   of `off`;
 * - an opaque glyph is read as its reading glyph, its face and its declared extrude: each core pixel against every pixel
 *   within RIM px of it in `on` that is not its own (the joints with its own extrude are not read), and not past its own
 *   outline (a full keyline separates; the face is read against it, never against the ground beyond it): the ground
 *   with its counters and gaps, copies, ghosts, other parts;
 * - another glyph's reading glyph is not its ground: a neighbour counts only where it touches (shape `joins`).
 * `shown`: IDs drawn on this moment whatever the mask holds (shown with no pixel: unverified:no-core; only mixed pixels:
 * unverified:all-mixed; never a pass). `opacity`: each ID's drawn opacity (missing: opaque).
 */
export function reduceGlyphs(on: ArrayLike<number>, off: ArrayLike<number>, mask: ArrayLike<number>, w: number, shown: number[] = [], opacity: Record<number, number> = {}, parts?: ArrayLike<number>): GlyphVerdict[] {
  const h = Math.floor(mask.length / 4 / w);
  const N = w * h;
  const owner = new Int32Array(N);
  const core = new Uint8Array(N);
  const pOwner = new Int32Array(N);
  const pRole = new Int8Array(N); // 0 none, 1 extrude, 2 outline, 3 copy
  for (let i = 0; i < N; i++) {
    owner[i] = rgbId(mask[i * 4], mask[i * 4 + 1], mask[i * 4 + 2]);
    core[i] = mask[i * 4 + 3] === 255 ? 1 : 0;
    if (!parts) continue;
    const pid = rgbId(parts[i * 4], parts[i * 4 + 1], parts[i * 4 + 2]);
    const role = pid ? partRole(pid) : undefined;
    if (role) [pOwner[i], pRole[i]] = [partBase(pid), ROLES.indexOf(role) + 1];
  }
  // (the reading glyph a pixel belongs to: a face, or a declared extrude showing outside every face; an extrude pixel not
  // drawn visibly, the same as the frame without the words (a pressed edge in the paper's own tone), is ground: the face
  // is read against it, nothing is merged)
  const L0 = (a: ArrayLike<number>, k: number) => lumOf(a[k], a[k + 1], a[k + 2]);
  const shows = (i: number) => { const [p, q] = [L0(on, i * 4), L0(off, i * 4)]; return (Math.max(p, q) + 0.05) / (Math.min(p, q) + 0.05) >= EXTRUDE_SHOWS; };
  const reader = new Int32Array(N);
  for (let i = 0; i < N; i++) reader[i] = owner[i] || (pRole[i] === 1 && shows(i) ? pOwner[i] : 0);
  const L = (a: ArrayLike<number>, k: number) => lumOf(a[k], a[k + 1], a[k + 2]);
  const ratio = (x: number, y: number) => (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  // the rim, each offset with the pixels between it and the centre (an outline on the way blocks what lies beyond it)
  const ring: { dx: number; dy: number; via: [number, number][] }[] = [];
  for (let dy = -RIM; dy <= RIM; dy++) for (let dx = -RIM; dx <= RIM; dx++) {
    if (!(dx || dy) || dx * dx + dy * dy > RIM * RIM) continue;
    const n = Math.max(Math.abs(dx), Math.abs(dy));
    const via: [number, number][] = [];
    for (let k = 1; k < n; k++) via.push([Math.round((dx * k) / n), Math.round((dy * k) / n)]);
    ring.push({ dx, dy, via });
  }
  type Acc = { xs: number[]; worst: number; at: [number, number, number, number]; pair?: GlyphVerdict['pair']; edge?: { n: number; min: number }; any: boolean };
  const acc = new Map<number, Acc>();
  const get = (id: number) => acc.get(id) ?? (acc.set(id, { xs: [], worst: Infinity, at: [NaN, NaN, NaN, NaN], any: false }), acc.get(id)!);
  const roleOf = (q: number, id: number): PairRole => (pRole[q] === 2 ? (pOwner[q] === id ? 'outline' : 'part') : pRole[q] === 3 ? 'copy' : pRole[q] === 1 ? 'part' : 'ground');
  for (let i = 0; i < N; i++) {
    const id = reader[i];
    if (!id) continue;
    const k = i * 4;
    const a = get(id);
    a.any = true;
    const face = owner[i] === id;
    if (face && !core[i]) {
      const r = ratio(L(on, k), L(off, k));
      a.edge = { n: (a.edge?.n ?? 0) + 1, min: Math.min(a.edge?.min ?? Infinity, r) };
      continue;
    }
    // (an extrude pixel the parts pass saw mixed decides nothing)
    if (!face && parts && parts[k + 3] < 255) continue;
    const [x, y] = [i % w, Math.floor(i / w)];
    const lp = L(on, k);
    const pr = face ? 'face' : 'extrude';
    if ((opacity[id] ?? 1) < OPAQUE) {
      const lq = L(off, k);
      const r = ratio(lp, lq);
      a.xs.push(r);
      if (r < a.worst) [a.worst, a.at, a.pair] = [r, [x, y, lp, lq], { p: [x, y, pr], q: [x, y, 'off'] }];
      continue;
    }
    let best = Infinity;
    let lb = NaN;
    let bq = -1;
    for (const { dx, dy, via } of ring) {
      const [qx, qy] = [x + dx, y + dy];
      if (qx < 0 || qy < 0 || qx >= w || qy >= h) continue;
      const q = qy * w + qx;
      // (its own reading glyph, and another glyph's: the joints are not read, a neighbour is the shape gate's)
      if (reader[q]) continue;
      const outline = (j: number) => pRole[j] === 2 && pOwner[j] === id;
      if (!outline(q) && via.some(([vx, vy]) => outline((y + vy) * w + x + vx))) continue;
      const lq = L(on, q * 4);
      const r = ratio(lp, lq);
      if (r < best) [best, lb, bq] = [r, lq, q];
    }
    if (best === Infinity) continue;
    a.xs.push(best);
    if (best < a.worst) [a.worst, a.at, a.pair] = [best, [x, y, lp, lb], { p: [x, y, pr], q: [bq % w, Math.floor(bq / w), roleOf(bq, id)] }];
  }
  const ids = [...new Set([...acc.keys(), ...shown])];
  return ids.map((id) => {
    const a = acc.get(id);
    const xs = (a?.xs ?? []).sort((p, q) => p - q);
    let status: InkStatus = !a || !a.any ? 'unverified:no-core' : !xs.length ? 'unverified:all-mixed' : xs[0] >= INK_MIN ? 'pass' : 'fail';
    const v: GlyphVerdict = { id, n: xs.length, min: xs[0] ?? NaN, p01: xs[Math.floor(xs.length * 0.01)] ?? NaN, median: xs[xs.length >> 1] ?? NaN, minAt: a?.at ?? [NaN, NaN, NaN, NaN], status };
    if (a?.pair) v.pair = a.pair;
    if (a?.edge) v.edge = { n: a.edge.n, min: +a.edge.min.toFixed(3) };
    if (a?.any) {
      const s = shapeOf(id, reader, owner, w, h, core);
      if (s.bad.length) v.shape = s.bad;
      if (s.gap) v.gap = s.gap;
      if (s.bad.length && (status === 'pass' || status === 'unverified:all-mixed')) status = v.status = 'fail';
    }
    return v;
  });
}

/**
 * The shape gate for one glyph (ruling §1): its reading glyph M (`reader` = id) against its face F (`owner` = id) as the
 * reference. Every glyph: M touching another glyph's reading glyph (4-adjacent) is `joins`. With a declared extrude
 * (M larger than F): a part of M holding two of F's strokes is a `bridge`, a counter of F with nothing of it left open in
 * M `counter-closed`, a hole of M that F does not have `opening-sealed`, a counter left under 2 px wide where F's was
 * wider `gap-narrowed`; the narrowest counter's width is returned either way.
 * ponytail: the face as drawn stands in for the approved reference mask; a reference drawn at the smallest delivery size
 * per font is the upgrade when one is declared.
 */
export function shapeOf(id: number, reader: Int32Array, owner: Int32Array, w: number, h: number, core?: Uint8Array): { bad: string[]; gap?: { face: number; glyph: number } } {
  let [x0, y0, x1, y1] = [w, h, -1, -1];
  for (let i = 0; i < w * h; i++) if (reader[i] === id) { const [x, y] = [i % w, Math.floor(i / w)]; [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)]; }
  if (x1 < 0) return { bad: [] };
  const bad: string[] = [];
  let joins = false;
  for (let y = y0; y <= y1 && !joins; y++) for (let x = x0; x <= x1 && !joins; x++) {
    // (a touch is ink to ink: a face's mixed pixel is where the final pass's samples disagree, two glyphs 1–2 px apart
    // under the aberration split share a mixed seam without touching; review 2026-11-15, 113 joins)
    if (reader[y * w + x] !== id || (core && owner[y * w + x] === id && !core[y * w + x])) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const [qx, qy] = [x + dx, y + dy];
      if (qx < 0 || qy < 0 || qx >= w || qy >= h) continue;
      const q = qy * w + qx;
      const o = reader[q];
      if (o && o !== id && !(core && owner[q] === o && !core[q])) { joins = true; break; }
    }
  }
  if (joins) bad.push('joins');
  let merged = false;
  for (let i = 0; i < w * h; i++) if (reader[i] === id && owner[i] !== id) { merged = true; break; }
  if (!merged) return { bad };
  // the box grown by one: what touches its border is outside, the rest of the not-glyph is a counter
  const [bx, by] = [x0 - 1, y0 - 1];
  const [bw, bh] = [x1 - x0 + 3, y1 - y0 + 3];
  const inF = (x: number, y: number) => { const [X, Y] = [x + bx, y + by]; return X >= 0 && Y >= 0 && X < w && Y < h && owner[Y * w + X] === id; };
  const inM = (x: number, y: number) => { const [X, Y] = [x + bx, y + by]; return X >= 0 && Y >= 0 && X < w && Y < h && reader[Y * w + X] === id; };
  const label = (inside: (x: number, y: number) => boolean, eight: boolean) => {
    const lab = new Int32Array(bw * bh).fill(-1);
    const sets: number[][] = [];
    const nb = eight ? [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] : [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let s = 0; s < bw * bh; s++) {
      if (lab[s] >= 0 || !inside(s % bw, Math.floor(s / bw))) continue;
      const set: number[] = [];
      const stack = [s];
      lab[s] = sets.length;
      while (stack.length) {
        const c = stack.pop()!;
        set.push(c);
        const [cx, cy] = [c % bw, Math.floor(c / bw)];
        for (const [dx, dy] of nb) {
          const [nx, ny] = [cx + dx, cy + dy];
          if (nx < 0 || ny < 0 || nx >= bw || ny >= bh) continue;
          const n = ny * bw + nx;
          if (lab[n] < 0 && inside(nx, ny)) { lab[n] = sets.length; stack.push(n); }
        }
      }
      sets.push(set);
    }
    return { lab, sets };
  };
  const holes = (inside: (x: number, y: number) => boolean) => label((x, y) => !inside(x, y), false).sets.filter((set) => set.every((c) => { const [x, y] = [c % bw, Math.floor(c / bw)]; return x > 0 && y > 0 && x < bw - 1 && y < bh - 1; }));
  // bridges: a part of M holding two of F's strokes
  const F = label(inF, true);
  const M = label(inM, true);
  const strokesIn = M.sets.map(() => new Set<number>());
  F.sets.forEach((set, k) => set.forEach((c) => strokesIn[M.lab[c]]?.add(k)));
  if (strokesIn.some((s) => s.size > 1)) bad.push('bridge');
  // counters: each of F's holes, how wide it stays open in M (twice the deepest step to M, less one: 1 px open is 1)
  const width = (cells: number[], solid: (x: number, y: number) => boolean) => {
    const open = cells.filter((c) => !solid(c % bw, Math.floor(c / bw)));
    if (!open.length) return 0;
    const set = new Set(open);
    const dist = new Map<number, number>();
    let front = open.filter((c) => { const [x, y] = [c % bw, Math.floor(c / bw)]; return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !set.has((y + dy) * bw + x + dx)); });
    front.forEach((c) => dist.set(c, 1));
    let d = 1;
    while (front.length) {
      const next: number[] = [];
      for (const c of front) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = c + dy * bw + dx; if (set.has(n) && !dist.has(n)) { dist.set(n, d + 1); next.push(n); } }
      if (next.length) d++;
      front = next;
    }
    return 2 * d - 1;
  };
  const fHoles = holes(inF);
  let gap: { face: number; glyph: number } | undefined;
  let open = 0;
  for (const hole of fHoles) {
    const [wf, wm] = [width(hole, inF), width(hole, inM)];
    if (!wm) bad.push('counter-closed');
    else { open++; if (wm < 2 && wm < wf) bad.push('gap-narrowed'); }
    if (!gap || wm < gap.glyph) gap = { face: wf, glyph: wm };
  }
  if (holes(inM).length > open) bad.push('opening-sealed');
  return { bad: [...new Set(bad)], ...(gap ? { gap } : {}) };
}

/**
 * The largest channel difference between the two composites outside every glyph's mask grown by `r` px (rows of width
 * `w`, height `h`): turning the words off must not change the rest of the frame (a glow, a trail): over 2/255, the
 * moment's glyphs are unverified:field-drift.
 */
export function offDrift(on: ArrayLike<number>, off: ArrayLike<number>, mask: ArrayLike<number>, w: number, h: number, r: number, where?: number[]): number {
  // (the mask grown by r: a pixel is near a glyph when any glyph pixel lies within r of it, by rows then columns)
  const glyph = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) glyph[i] = mask[i * 4] | mask[i * 4 + 1] | mask[i * 4 + 2] ? 1 : 0;
  const rows = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    let last = -Infinity;
    for (let x = 0; x < w; x++) { if (glyph[y * w + x]) last = x; if (x - last <= r) rows[y * w + x] = 1; }
    last = Infinity;
    for (let x = w - 1; x >= 0; x--) { if (glyph[y * w + x]) last = x; if (last - x <= r) rows[y * w + x] = 1; }
  }
  const near = new Uint8Array(w * h);
  for (let x = 0; x < w; x++) {
    let last = -Infinity;
    for (let y = 0; y < h; y++) { if (rows[y * w + x]) last = y; if (y - last <= r) near[y * w + x] = 1; }
    last = Infinity;
    for (let y = h - 1; y >= 0; y--) { if (rows[y * w + x]) last = y; if (last - y <= r) near[y * w + x] = 1; }
  }
  let most = 0;
  for (let i = 0; i < w * h; i++) {
    if (near[i]) continue;
    const k = i * 4;
    const d = Math.max(Math.abs(on[k] - off[k]), Math.abs(on[k + 1] - off[k + 1]), Math.abs(on[k + 2] - off[k + 2]));
    if (d > most && where) where.splice(0, 4, i % w, Math.floor(i / w), on[k], off[k]);
    most = Math.max(most, d);
  }
  return most;
}
/** Over this (of 255) outside the grown masks, turning the words off changed the field. */
export const DRIFT_MAX = 2;

/** One JSONL row of a gate v2 job. */
export type GateRow =
  | { kind: 'meta'; commit: string; dirty: boolean; fxVersion: string; font: string; size: [number, number]; fps: number; seed: number; mode: 'live' | 'export'; scheduled: boolean; frames: string; world: string; song: string }
  | { kind: 'moment'; t: number; frame: number; lines: Record<number, string>; fx?: Record<string, number>; offDrift: number; driftAt?: number[]; nondeterministic?: boolean; glyphs: unknown[] }
  | { kind: 'done'; moments: number; glyphs: number; fails: number; unverified: Record<string, number>; worst: number; wallSec: number };

/** Where a job's JSONL leaves off: done (skip it), or the last frame written (resume after it), or nothing yet. */
export function resumePoint(lines: string[]): { done: true } | { done: false; after: number } {
  let after = -1;
  for (const l of lines) {
    if (!l.trim()) continue;
    let row: GateRow;
    try { row = JSON.parse(l) as GateRow; } catch { continue; }
    if (row.kind === 'done') return { done: true };
    if (row.kind === 'moment') after = Math.max(after, row.frame);
  }
  return { done: false, after };
}
