// A page's whole layout under Q3's scale composition (docs/research/2026-11-10-phase4-codex.md §4, the screentone
// re-opening contract): when a line of a page that draws its own carriers (a `ground:` carrier, screentone) is set
// large, the page is laid again whole round it, never a big balloon pasted over the old panels. One pure function,
// `pageLayout`, from the glyphs as finally drawn (each glyph's em box, frame px, y down), every line present at that
// moment and the edge the event declares; the scheduler (policy-candidates scaleMissOf, on the shaped measure), the
// renderer (world-layout, before it commits the pose; world-b5-screentone, every frame) and the verifier
// (world-events-adapter verifyWorldEvents; `verifyPage` on every drawn frame) all read this one result.
//
// The page it lays: one panel (the board's single wide panel, b), open on the declared edge in `bleed` mode so the
// panel and the balloon run off together; the scaled line's balloon round its glyphs (spiky for the shout and burst
// pages, a rounded balloon with the short wide wedge tail for the balloons page, a narration box for the narration and
// caption pages); every other present line in a narration box of its own inside the panel. No other panel survives: a
// panel with no words is never drawn. Where no such page is legal the result is a refusal (`noPageSolution`) and the
// caller keeps the line's original page and pose whole.
// Pure: no DOM, no THREE.
import { pageCapOf, WORLD_PAGES, type PageCarrierKind, type ScaleEdge, type WorldPage } from '../world-shared';
import { emBox, grow, meets, unionOf as union, type Box } from './world-b5-shared';
import { SAFE_X, SAFE_Y } from './world-sets';

export type Pt = [number, number];
export type { Box };
export { emBox };

export const PAGE_W = 1920;
export const PAGE_H = 1080;
/** The declared safe area, frame px y down (world-sets SAFE_X / SAFE_Y). */
export const PAGE_SAFE: Box = { x0: SAFE_X, y0: SAFE_Y, x1: PAGE_W - SAFE_X, y1: PAGE_H - SAFE_Y };
/** screentone's one wide panel (world-shared WORLD_PAGES; the board's B_PANEL) and its frame line. */
export const PAGE_PANEL: Box = WORLD_PAGES['screentone'].panel;
/** How far an open panel and a bleeding balloon run past the frame on the declared edge. */
export const BLEED_OVER = 40;
/** Least white between a panel frame line and any text box, px (beyond half the rim). */
export const TEXT_CLEAR = 12;
/** Least gutter between a panel and the frame's edge, or between two panels, px. */
export const GUTTER = 40;
/**
 * The scaled line's carrier, px: its padding round the glyphs (the oval's 24 px to spare, world-b5-screentone round), its
 * outline stroke (5, as the board's balloons), the spikes' reach and spacing, a corner's radius; a narration box's
 * padding across and down (the board's caption box, 44 / 34).
 */
export const BALLOON = { pad: 24, stroke: 5, spike: 44, step: 104, corner: 60, oval: 110, boxPad: [44, 34] as [number, number] };
/** A present line's narration box, px round its glyphs (the board's narration box, 46 / 40). */
export const NARRATION_PAD: [number, number] = [46, 40];
/** screentone's tail (world-shared WORLD_PAGES): a short wedge on a wide root. */
export const TAIL = WORLD_PAGES['screentone'].tail;

export type CarrierKind = PageCarrierKind;
/** The carrier a page lays round its scaled line, as its world declares it (world-shared WORLD_PAGES); undefined for a page none declares. */
export const carrierKindOf = (page: string): CarrierKind | undefined => pageCapOf(page)?.kind;
const capsOf = (page: string): WorldPage => pageCapOf(page)?.world ?? WORLD_PAGES['screentone'];

/** A line on the page: its glyphs' em boxes as drawn, its type size, when it shows and when it is gone. */
export interface PageLine { id: string; boxes: Box[]; size: number; show?: number; end?: number; scaled?: boolean }
export interface PageInput {
  /** The page (the set's ground, `screentone/shout`, …): its world's declaration names the carrier kind. */
  page: string;
  /** The edge the scale event declares: the only side the page may bleed through. */
  edge: ScaleEdge;
  lines: PageLine[];
  /** The moment the page is laid for: a line not shown yet (show > at) or gone (end ≤ at) is not present and is carried by nothing. */
  at?: number;
  seed?: number;
}
/** Whether a line stands on the page at `at` (no time given: every line handed is present). */
export const presentAt = (l: PageLine, at?: number) => at === undefined || ((l.show === undefined || l.show <= at + 1e-6) && (l.end === undefined || l.end > at));
export interface PagePanel { pts: Pt[]; open?: 'top' | 'bottom'; carries: string[] }
export interface PageCarrier {
  line: string;
  kind: CarrierKind | 'narration';
  /** One closed outline, frame px, y down (a tail is part of it: no separate piece). */
  outline: Pt[];
  /** The tail: its root's two ends on the outline, its tip, and the tip's index in the outline. */
  tail?: { root: [Pt, Pt]; tip: Pt; at: number };
}
export interface PageSolution { ok: true; mode: 'closed' | 'bleed'; edge: ScaleEdge; panels: PagePanel[]; carriers: PageCarrier[]; foot: 'top' | 'bottom' }
export interface PageRefusal { ok: false; why: string[] }
export type PageLayout = PageSolution | PageRefusal;

// ---- geometry ----

const inBox = (p: Pt, b: Box, e = 1e-6) => p[0] >= b.x0 - e && p[0] <= b.x1 + e && p[1] >= b.y0 - e && p[1] <= b.y1 + e;
const rectPts = (b: Box): Pt[] => [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]];
/** A small seeded hash in [0, 1). */
const rnd = (seed: number, i: number) => { const x = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453; return x - Math.floor(x); };

/** Whether a point is inside a closed polygon (even-odd). */
export function inside(poly: Pt[], [x, y]: Pt): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
/** Whether two segments cross (touching at a shared end is not crossing). */
export function segmentsCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const [d1, d2, d3, d4] = [cross(c, d, a), cross(c, d, b), cross(a, b, c), cross(a, b, d)];
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}
const edges = (poly: Pt[]) => poly.map((p, i) => [p, poly[(i + 1) % poly.length]] as [Pt, Pt]);
/** Whether a closed polygon's own edges cross each other (non-adjacent edges only). */
export function selfCrosses(poly: Pt[]): boolean {
  const es = edges(poly);
  for (let i = 0; i < es.length; i++)
    for (let j = i + 2; j < es.length; j++) {
      if (i === 0 && j === es.length - 1) continue;
      if (segmentsCross(es[i][0], es[i][1], es[j][0], es[j][1])) return true;
    }
  return false;
}
/** Whether a polygon's outline meets a box (an edge crosses it or a vertex is in it). */
export function outlineMeets(poly: Pt[], b: Box): boolean {
  if (poly.some((p) => inBox(p, b, 0))) return true;
  const sides = edges(rectPts(b));
  return edges(poly).some(([p, q]) => sides.some(([r, s]) => segmentsCross(p, q, r, s)));
}
/** Whether a polygon and a box share any area. */
const polyMeetsBox = (poly: Pt[], b: Box) => outlineMeets(poly, b) || rectPts(b).some((p) => inside(poly, p));
/** Whether a box lies wholly inside a polygon. */
const boxInside = (poly: Pt[], b: Box) => rectPts(b).every((p) => inside(poly, p)) && !outlineMeets(poly, b);
/** Whether a glyph's em box, as drawn, lies wholly inside its carrier's outline (engine.ts checks every frame by it). */
export const boxInsideOutline = (outline: Pt[], b: Box) => boxInside(outline, b);

/**
 * The perimeter of a rounded rectangle, clockwise from the top-left corner's end (y down), as points every `step` px of
 * its length with their outward normals.
 */
function perimeter(b: Box, r: number): { at: (s: number) => { p: Pt; n: Pt }; length: number } {
  const [w, h] = [b.x1 - b.x0, b.y1 - b.y0];
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  const [sw, sh, arc] = [w - 2 * r, h - 2 * r, (Math.PI / 2) * r];
  const segs: ((u: number) => { p: Pt; n: Pt })[] = [
    (u) => ({ p: [b.x0 + r + u, b.y0], n: [0, -1] }),
    (u) => { const t = -Math.PI / 2 + u / Math.max(1e-9, r); return { p: [b.x1 - r + Math.cos(t) * r, b.y0 + r + Math.sin(t) * r], n: [Math.cos(t), Math.sin(t)] }; },
    (u) => ({ p: [b.x1, b.y0 + r + u], n: [1, 0] }),
    (u) => { const t = u / Math.max(1e-9, r); return { p: [b.x1 - r + Math.cos(t) * r, b.y1 - r + Math.sin(t) * r], n: [Math.cos(t), Math.sin(t)] }; },
    (u) => ({ p: [b.x1 - r - u, b.y1], n: [0, 1] }),
    (u) => { const t = Math.PI / 2 + u / Math.max(1e-9, r); return { p: [b.x0 + r + Math.cos(t) * r, b.y1 - r + Math.sin(t) * r], n: [Math.cos(t), Math.sin(t)] }; },
    (u) => ({ p: [b.x0, b.y1 - r - u], n: [-1, 0] }),
    (u) => { const t = Math.PI + u / Math.max(1e-9, r); return { p: [b.x0 + r + Math.cos(t) * r, b.y0 + r + Math.sin(t) * r], n: [Math.cos(t), Math.sin(t)] }; },
  ];
  const lens = [sw, arc, sh, arc, sw, arc, sh, arc];
  const length = lens.reduce((a, x) => a + x, 0);
  return {
    length,
    at: (s) => {
      s = ((s % length) + length) % length;
      for (let k = 0; k < 8; k++) {
        if (s <= lens[k] || k === 7) return segs[k](Math.min(s, lens[k]));
        s -= lens[k];
      }
      return segs[0](0);
    },
  };
}
/** How far a rounded corner of radius r cuts inside the rectangle it rounds, so the base is grown by it. */
const cornerCut = (r: number) => r * (1 - Math.SQRT1_2);

/** The base rectangle a kind's outline runs on, round the padded glyphs, in a mode on an edge. */
function baseOf(kind: CarrierKind, g: Box, mode: 'closed' | 'bleed', edge: ScaleEdge): { base: Box; r: number } {
  const [px, py] = kind === 'box' ? BALLOON.boxPad : [BALLOON.pad, BALLOON.pad];
  const r = kind === 'spiky' ? BALLOON.corner : kind === 'oval' ? BALLOON.oval : 0;
  const c = cornerCut(r);
  const b = grow(g, px + c, py + c);
  if (mode === 'closed') return { base: b, r };
  // (bleeding: the side on the declared edge runs past the frame, its spikes and corners with it)
  const off = BLEED_OVER + BALLOON.spike * 1.3 + r;
  return { base: edge === 'top' ? { ...b, y0: -off } : edge === 'bottom' ? { ...b, y1: PAGE_H + off } : edge === 'left' ? { ...b, x0: -off } : { ...b, x1: PAGE_W + off }, r };
}

/** A kind's outline on its base: spikes out every `step` px for the spiky balloon, the smooth outline else. */
function outlineOf(kind: CarrierKind, base: Box, r: number, seed: number): Pt[] {
  if (kind === 'box') return rectPts(base);
  const per = perimeter(base, r);
  if (kind === 'oval') {
    const n = Math.max(24, Math.round(per.length / 12));
    return Array.from({ length: n }, (_, i) => per.at((i * per.length) / n).p);
  }
  const n = Math.max(8, Math.round(per.length / BALLOON.step));
  return Array.from({ length: 2 * n }, (_, i) => {
    const { p, n: nn } = per.at((i * per.length) / (2 * n));
    const k = i % 2 ? BALLOON.spike * (0.8 + 0.4 * rnd(seed, i)) : 0;
    return [p[0] + nn[0] * k, p[1] + nn[1] * k] as Pt;
  });
}

/**
 * The oval balloon's tail spliced into its outline: a wedge on a root TAIL.root px wide along the side away from the
 * declared edge, TAIL.len long, leaning toward the nearer corner of the panel. Tried along that side, then the two
 * sides across; the first that keeps clear of every text box and inside the panel and the safe area.
 */
function withTail(outline: Pt[], base: Box, edge: ScaleEdge, room: Box, texts: Box[], TAIL: WorldPage['tail']): { outline: Pt[]; tail: NonNullable<PageCarrier['tail']> } | undefined {
  const away: 'top' | 'bottom' | 'left' | 'right' = edge === 'top' ? 'bottom' : edge === 'bottom' ? 'top' : edge === 'left' ? 'right' : 'left';
  const tries: { side: typeof away; f: number }[] = [0.72, 0.28, 0.5].map((f) => ({ side: away, f }));
  for (const side of (['left', 'right', 'top', 'bottom'] as const).filter((s) => s !== away && s !== edge)) tries.push({ side, f: 0.6 });
  const half = TAIL.root / 2;
  for (const { side, f } of tries) {
    const across = side === 'top' || side === 'bottom';
    const [a0, a1] = across ? [base.x0 + BALLOON.oval, base.x1 - BALLOON.oval] : [base.y0 + BALLOON.oval, base.y1 - BALLOON.oval];
    if (a1 - a0 < TAIL.root + 8) continue;
    const c = a0 + half + (a1 - a0 - TAIL.root) * f;
    const line = side === 'top' ? base.y0 : side === 'bottom' ? base.y1 : side === 'left' ? base.x0 : base.x1;
    const out = side === 'top' || side === 'left' ? -1 : 1;
    const toward = (across ? c < (base.x0 + base.x1) / 2 : c < (base.y0 + base.y1) / 2) ? -1 : 1;
    const [r0, r1]: [Pt, Pt] = across ? [[c - half, line], [c + half, line]] : [[line, c - half], [line, c + half]];
    const dir = across ? [toward * TAIL.lean, out] : [out, toward * TAIL.lean];
    const k = TAIL.len / Math.hypot(dir[0], dir[1]);
    const tip: Pt = across ? [c + dir[0] * k, line + dir[1] * k] : [line + dir[0] * k, c + dir[1] * k];
    const tri: Pt[] = [r0, tip, r1];
    const triBox = union(tri.map(([x, y]) => ({ x0: x, y0: y, x1: x, y1: y })));
    if (!inBox([triBox.x0 - BALLOON.stroke / 2, triBox.y0 - BALLOON.stroke / 2], room) || !inBox([triBox.x1 + BALLOON.stroke / 2, triBox.y1 + BALLOON.stroke / 2], room)) continue;
    if (texts.some((t) => polyMeetsBox(tri, grow(t, TEXT_CLEAR)))) continue;
    // splice: drop the outline's points strictly between the root's ends on that side, put root, tip, root in their place
    const onSide = (p: Pt) => Math.abs((across ? p[1] : p[0]) - line) < 0.5 && (across ? p[0] : p[1]) > c - half - 1e-6 && (across ? p[0] : p[1]) < c + half + 1e-6;
    const kept = outline.filter((p) => !onSide(p));
    // the insertion point: the first kept point after which the outline passes the root (clockwise)
    const at = kept.findIndex((p, i) => { const q = kept[(i + 1) % kept.length]; return onLineBetween(p, q, across, line, c); });
    if (at < 0) continue;
    // (clockwise, y down: along the bottom the outline runs right to left, along the top left to right, etc.)
    const forward = side === 'top' || side === 'right';
    const seq: Pt[] = forward ? [r0, tip, r1] : [r1, tip, r0];
    const spliced = [...kept.slice(0, at + 1), ...seq, ...kept.slice(at + 1)];
    return { outline: spliced, tail: { root: [r0, r1], tip, at: at + 2 } };
  }
  return undefined;
}
/** Whether the outline's step from p to q passes the root centre `c` on the side line. */
function onLineBetween(p: Pt, q: Pt, across: boolean, line: number, c: number): boolean {
  const [pu, pv, qu, qv] = across ? [p[0], p[1], q[0], q[1]] : [p[1], p[0], q[1], q[0]];
  if (Math.abs(pv - line) > 0.5 || Math.abs(qv - line) > 0.5) return false;
  return (pu - c) * (qu - c) <= 0;
}

// ---- the layout ----

/**
 * The room a page carrier needs round the scaled line's ink box on every side but its declared edge, px: what the fitter
 * (scale-policy fitOf) keeps clear for a `ground:` carrier, so the page can close its carrier round the words. The
 * declared edge keeps the safe area's own line: the carrier bleeds through it.
 */
export function pageRoom(page: string): number {
  const kind = carrierKindOf(page);
  const reach = kind === 'spiky' ? BALLOON.pad + cornerCut(BALLOON.corner) + BALLOON.spike * 1.2 : kind === 'oval' ? BALLOON.pad + cornerCut(BALLOON.oval) : BALLOON.boxPad[0];
  return Math.ceil(reach + BALLOON.stroke / 2 + 2);
}
/**
 * Where a page-carried composition's ink box may stand, px y down: the safe area within the panel, less the carrier's
 * room on all four sides for a `closed` carrier (the page's first choice: its whole outline in frame), or on every side
 * but the declared edge for a `bleed` one (the fallback, run off through that edge).
 */
export function pageGlyphRoom(page: string, edge: ScaleEdge, mode: 'closed' | 'bleed' = 'bleed'): Box {
  const m = pageRoom(page);
  const { panel, rim } = capsOf(page);
  const inner = { x0: Math.max(PAGE_SAFE.x0, panel.x0 + rim / 2), y0: Math.max(PAGE_SAFE.y0, panel.y0 + rim / 2), x1: Math.min(PAGE_SAFE.x1, panel.x1 - rim / 2), y1: Math.min(PAGE_SAFE.y1, panel.y1 - rim / 2) };
  const open = (e: ScaleEdge) => mode === 'bleed' && edge === e;
  return { x0: open('left') ? PAGE_SAFE.x0 : inner.x0 + m, y0: open('top') ? PAGE_SAFE.y0 : inner.y0 + m, x1: open('right') ? PAGE_SAFE.x1 : inner.x1 - m, y1: open('bottom') ? PAGE_SAFE.y1 : inner.y1 - m };
}

/** The single panel of the re-laid page: its world's widest panel, open past the frame on the declared edge in bleed. */
function panelOf(caps: WorldPage, mode: 'closed' | 'bleed', edge: ScaleEdge): PagePanel {
  const b = { ...caps.panel };
  if (mode === 'bleed') {
    if (edge === 'top') b.y0 = -BLEED_OVER;
    if (edge === 'bottom') b.y1 = PAGE_H + BLEED_OVER;
  }
  return { pts: rectPts(b), ...(mode === 'bleed' && (edge === 'top' || edge === 'bottom') ? { open: edge } : {}), carries: [] };
}
/** The panel's inside, less half its frame line: where every carrier and every word stays. */
const panelInner = (p: PagePanel, rim: number): Box => grow(ptsBox(p.pts), -rim / 2);
const ptsBox = (pts: Pt[]): Box => union(pts.map(([x, y]) => ({ x0: x, y0: y, x1: x, y1: y })));
/** Where a carrier's outline (with its stroke) may run: the safe area within the panel, past the frame only on the bleed edge. */
function outlineRoom(panel: PagePanel, mode: 'closed' | 'bleed', edge: ScaleEdge, rim: number): Box {
  const p = panelInner(panel, rim);
  const s = BALLOON.stroke / 2;
  const r = { x0: Math.max(PAGE_SAFE.x0, p.x0) + s, y0: Math.max(PAGE_SAFE.y0, p.y0) + s, x1: Math.min(PAGE_SAFE.x1, p.x1) - s, y1: Math.min(PAGE_SAFE.y1, p.y1) - s };
  if (mode === 'closed') return r;
  return { ...r, ...(edge === 'top' ? { y0: -Infinity } : edge === 'bottom' ? { y1: Infinity } : edge === 'left' ? { x0: -Infinity } : { x1: Infinity }) };
}

/**
 * The whole page round a scaled line and every line present with it: one panel (open on the declared edge when the
 * carrier bleeds), the scaled line's carrier closed inside the safe area when it fits there, else bleeding through the
 * declared top or bottom only; each other present line in a narration box of its own. A refusal (`noPageSolution: …`)
 * when no legal page exists, and never a solution its own verifier (`verifyPage`) would fail.
 */
export function pageLayout(input: PageInput): PageLayout {
  const why: string[] = [];
  const scaled = input.lines.filter((l) => l.scaled);
  if (scaled.length !== 1) return { ok: false, why: [`noPageSolution: ${scaled.length} scaled lines on the page (one is laid round)`] };
  const hero = scaled[0];
  if (!hero.boxes.length) return { ok: false, why: ['noPageSolution: the scaled line has no glyphs'] };
  if (input.edge !== 'top' && input.edge !== 'bottom') return { ok: false, why: [`noPageSolution: a page bleeds through its top or bottom only, not ${input.edge}`] };
  const cap = pageCapOf(input.page);
  if (!cap) return { ok: false, why: [`noPageSolution: no world declares the page ${input.page} (world-shared WORLD_PAGES)`] };
  const kind = cap.kind;
  if (!presentAt(hero, input.at)) return { ok: false, why: ['noPageSolution: the scaled line is not on the page at this moment'] };
  // (only the lines present now: a line not shown yet never fills the page, one gone is carried by nothing)
  const present = input.lines.filter((l) => presentAt(l, input.at));
  const g = union(hero.boxes);
  const texts = present.flatMap((l) => l.boxes);
  for (const mode of ['closed', 'bleed'] as const) {
    const panel = panelOf(cap.world, mode, input.edge);
    const room = outlineRoom(panel, mode, input.edge, cap.world.rim);
    const { base, r } = baseOf(kind, g, mode, input.edge);
    let outline = outlineOf(kind, base, r, input.seed ?? 7);
    let tail: PageCarrier['tail'];
    if (kind === 'oval') {
      const t = withTail(outline, base, input.edge, room, texts, cap.world.tail);
      if (!t) { why.push(`${mode}: no wedge tail clear of the words inside the panel`); continue; }
      ({ outline, tail } = t);
    }
    const carriers: PageCarrier[] = [{ line: hero.id, kind, outline, ...(tail ? { tail } : {}) }];
    // the other lines present, each in a narration box of its own inside the panel, clear of the balloon and each other
    let placed = true;
    for (const l of present.filter((x) => !x.scaled)) {
      const b = grow(union(l.boxes), ...NARRATION_PAD);
      const clash = !inBox([b.x0, b.y0], room) || !inBox([b.x1, b.y1], room) ? 'outside the panel' : polyMeetsBox(outline, grow(b, BALLOON.stroke)) ? `over the scaled line's ${kind}` : carriers.slice(1).some((c) => meets(union(c.outline.map(([x, y]) => ({ x0: x, y0: y, x1: x, y1: y }))), b)) ? 'over another line' : '';
      if (clash) { why.push(`${mode}: present line ${l.id} has no narration box (${clash})`); placed = false; break; }
      carriers.push({ line: l.id, kind: 'narration', outline: rectPts(b) });
    }
    if (!placed) continue;
    const sol: PageSolution = { ok: true, mode, edge: input.edge, panels: [{ ...panel, carries: present.map((l) => l.id) }], carriers, foot: mode === 'bleed' && input.edge === 'bottom' ? 'top' : 'bottom' };
    const bad = verifyPage(sol, input);
    if (!bad.length) return sol;
    why.push(...bad.map((b) => `${mode}: ${b.invariant} (${b.detail})`));
  }
  return { ok: false, why: [`noPageSolution: ${why.join('; ')}`] };
}

// ---- the verifier ----

/** The invariants of the page contract (docs/research/2026-11-10-screentone-page-layout.md, Codex §4). */
export const PAGE_INVARIANTS = ['oneCarrier', 'balloonHolds', 'glyphsInSafe', 'closedInSafe', 'bleedOnlyDeclared', 'pathSimple', 'bleedClip', 'noEmptyPanel', 'noInnerPanelLine', 'panelSpacing', 'panelLineClear', 'readingOrder', 'hierarchy', 'tailAttached', 'tailWedge', 'tailClear', 'carrierClear'] as const;
export type PageInvariant = (typeof PAGE_INVARIANTS)[number];
export interface PageViolation { invariant: PageInvariant; detail: string }

/**
 * Every invariant of the page contract checked on a laid page against the lines present: run by `pageLayout` before it
 * returns, and by the renderer on every frame it draws (the lines present then), so a frame that breaks one is counted.
 */
export function verifyPage(sol: PageSolution, input: PageInput): PageViolation[] {
  const out: PageViolation[] = [];
  const bad = (invariant: PageInvariant, detail: string) => out.push({ invariant, detail });
  const cap = pageCapOf(input.page);
  const { rim, tail: TAIL } = cap?.world ?? WORLD_PAGES['screentone'];
  // (the lines present at the moment checked; one handed but not shown yet, or gone, must be carried by nothing)
  const lines = input.lines.filter((l) => presentAt(l, input.at));
  const absent = input.lines.filter((l) => !presentAt(l, input.at));
  const hero = lines.find((l) => l.scaled);
  const texts = lines.flatMap((l) => l.boxes);
  const s = BALLOON.stroke / 2;
  // every present line has exactly one carrier, and every carrier a present line
  for (const l of lines) { const n = sol.carriers.filter((c) => c.line === l.id).length; if (n !== 1) bad('oneCarrier', `${l.id} has ${n} carriers`); }
  for (const c of sol.carriers) if (!lines.some((l) => l.id === c.line)) bad('oneCarrier', `a carrier for ${c.line}, which is ${absent.some((l) => l.id === c.line) ? 'not shown yet or gone' : 'not on the page'}`);
  for (const p of sol.panels) for (const id of p.carries) if (absent.some((l) => l.id === id)) bad('oneCarrier', `a panel carries ${id}, which is not shown yet or gone`);
  // glyphs inside the safe area
  for (const l of lines) for (const b of l.boxes) if (!inBox([b.x0, b.y0], PAGE_SAFE) || !inBox([b.x1, b.y1], PAGE_SAFE)) { bad('glyphsInSafe', `${l.id} glyph (${b.x0.toFixed(0)}, ${b.y0.toFixed(0)}, ${b.x1.toFixed(0)}, ${b.y1.toFixed(0)})`); break; }
  // each carrier: one closed simple path; it holds its words and their padding
  for (const c of sol.carriers) {
    const o = c.outline;
    if (o.length < 3 || o.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y))) bad('pathSimple', `${c.line}: ${o.length} points`);
    else if (selfCrosses(o)) bad('pathSimple', `${c.line}: the outline crosses itself`);
    const l = lines.find((x) => x.id === c.line);
    if (!l) continue;
    const [px, py] = c.kind === 'box' ? BALLOON.boxPad : c.kind === 'narration' ? NARRATION_PAD : [BALLOON.pad, BALLOON.pad];
    const pad = (b: Box) => grow(b, Math.min(px, py) - 1);
    if (l.boxes.some((b) => !boxInside(o, pad(b)))) bad(c.line === hero?.id ? 'balloonHolds' : 'carrierClear', `${c.line}: a glyph and its padding are not inside its ${c.kind}`);
    // the outline crosses no text box (its own or any other line's)
    if (texts.some((b) => outlineMeets(o, grow(b, s)))) bad(c.line === hero?.id ? 'balloonHolds' : 'carrierClear', `${c.line}: the ${c.kind} outline crosses a text box`);
  }
  // the scaled carrier: closed inside the safe area, or off the frame through the declared edge only
  const main = sol.carriers.find((c) => c.line === hero?.id);
  if (main) {
    const safe = grow(PAGE_SAFE, -s);
    const off = main.outline.filter((p) => !inBox(p, safe));
    if (sol.mode === 'closed' && off.length) bad('closedInSafe', `${off.length} outline points past the safe area`);
    if (sol.mode === 'bleed') {
      const wrong = off.filter(([x, y]) => x < safe.x0 || x > safe.x1 || (sol.edge === 'top' ? y > safe.y1 : y < safe.y0));
      if (wrong.length) bad('bleedOnlyDeclared', `${wrong.length} outline points past the safe area off the ${sol.edge} edge`);
      // the frame cuts the outline only on the declared edge's line (never a spike clipped on another side)
      const frameSides: [Pt, Pt, string][] = [[[0, 0], [PAGE_W, 0], 'top'], [[PAGE_W, 0], [PAGE_W, PAGE_H], 'right'], [[PAGE_W, PAGE_H], [0, PAGE_H], 'bottom'], [[0, PAGE_H], [0, 0], 'left']];
      for (const [a, b, name] of frameSides) if (name !== sol.edge && edges(main.outline).some(([p, q]) => segmentsCross(p, q, a, b))) bad('bleedClip', `the frame's ${name} side cuts the outline`);
      if (!edges(main.outline).some(([p, q]) => segmentsCross(p, q, ...(frameSides.find((f) => f[2] === sol.edge)!.slice(0, 2) as [Pt, Pt])))) bad('bleedClip', `a bleed outline that never crosses the ${sol.edge} edge`);
    }
    // the tail: part of the outline, a short wide wedge, clear of words and of the panel's edge
    if (main.tail) {
      const { root, tip, at } = main.tail;
      const i = main.outline.findIndex((p) => p === tip || (p[0] === tip[0] && p[1] === tip[1]));
      const ends = [main.outline[(i - 1 + main.outline.length) % main.outline.length], main.outline[(i + 1) % main.outline.length]];
      const same = (p: Pt, q: Pt) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.5;
      if (i < 0 || i !== at || !root.every((r) => ends.some((e) => same(e, r)))) bad('tailAttached', 'the tail is not spliced into the outline at its root');
      const w = Math.hypot(root[0][0] - root[1][0], root[0][1] - root[1][1]);
      const mid: Pt = [(root[0][0] + root[1][0]) / 2, (root[0][1] + root[1][1]) / 2];
      const len = Math.hypot(tip[0] - mid[0], tip[1] - mid[1]);
      if (Math.abs(w - TAIL.root) > 1 || len > TAIL.len + 1 || len < TAIL.len * 0.5 || len / w > 1) bad('tailWedge', `root ${w.toFixed(0)} px, length ${len.toFixed(0)} px (fixed tail ${TAIL.root} / ${TAIL.len})`);
      const tri: Pt[] = [root[0], tip, root[1]];
      if (texts.some((b) => polyMeetsBox(tri, grow(b, TEXT_CLEAR)))) bad('tailClear', 'the tail meets a text box');
      const room = outlineRoom(sol.panels[0], sol.mode, sol.edge, rim);
      if (!tri.every((p) => inBox(p, room))) bad('tailClear', 'the tail leaves the panel or the safe area');
    } else if (main.kind === 'oval') bad('tailAttached', 'an oval balloon with no tail');
  }
  // panels: each holds the glyphs of a present line (read off the geometry, not its own list); none inside or across
  // another (an old panel's line left inside the page); gutters to the frame and between them
  const pbox = (p: PagePanel) => ptsBox(p.pts);
  for (const p of sol.panels) {
    const inner = panelInner(p, rim);
    if (!lines.some((l) => l.boxes.length && l.boxes.every((b) => inBox([b.x0, b.y0], inner) && inBox([b.x1, b.y1], inner)))) bad('noEmptyPanel', 'a panel that holds no present line\'s words');
  }
  sol.panels.forEach((p, i) => sol.panels.slice(i + 1).forEach((q) => { if (meets(grow(pbox(p), GUTTER / 2), grow(pbox(q), GUTTER / 2))) bad('noInnerPanelLine', 'two panels overlap or share a frame line'); }));
  for (const p of sol.panels) {
    const b = pbox(p);
    const gaps = [b.x0, b.y0, PAGE_W - b.x1, PAGE_H - b.y1].map((g, k) => (['left', 'top', 'right', 'bottom'][k] === p.open ? Infinity : g));
    if (gaps.some((g) => g < GUTTER)) bad('panelSpacing', `a panel ${Math.min(...gaps).toFixed(0)} px from the frame edge`);
  }
  // panel frame lines, where seen (inside the frame, not under a carrier), keep clear of every text box
  const hidden = (pt: Pt) => pt[0] < 0 || pt[0] > PAGE_W || pt[1] < 0 || pt[1] > PAGE_H || sol.carriers.some((c) => inside(c.outline, pt));
  for (const p of sol.panels)
    for (const [a, b] of edges(p.pts)) {
      const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 4));
      for (let k = 0; k <= n; k++) {
        const pt: Pt = [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n];
        if (hidden(pt)) continue;
        if (texts.some((t) => inBox(pt, grow(t, TEXT_CLEAR + rim / 2), 0))) { bad('panelLineClear', `a panel line at (${pt[0].toFixed(0)}, ${pt[1].toFixed(0)}) runs by a text box`); k = n + 1; }
      }
    }
  // reading order: a line sung earlier never stands wholly below a later one; hierarchy: the scaled line's type is the page's largest
  const byShow = [...lines].filter((l) => l.show !== undefined).sort((a, b) => a.show! - b.show!);
  for (let i = 1; i < byShow.length; i++) if (union(byShow[i - 1].boxes).y0 > union(byShow[i].boxes).y1) bad('readingOrder', `${byShow[i - 1].id} stands below ${byShow[i].id}, sung after it`);
  if (hero) { const big = Math.max(...hero.boxes.map((b) => b.y1 - b.y0)); for (const l of lines) if (l !== hero && Math.max(...l.boxes.map((b) => b.y1 - b.y0)) >= big) bad('hierarchy', `${l.id} set as large as the scaled line`); }
  // narration boxes: inside the panel, clear of the scaled carrier and of each other
  const room = sol.panels[0] ? outlineRoom(sol.panels[0], 'closed', sol.edge, rim) : PAGE_SAFE;
  sol.carriers.filter((c) => c.kind === 'narration').forEach((c, i, all) => {
    if (!c.outline.every((p) => inBox(p, room))) bad('carrierClear', `${c.line}'s narration box leaves the panel`);
    if (main && polyMeetsBox(main.outline, union(c.outline.map(([x, y]) => ({ x0: x, y0: y, x1: x, y1: y }))))) bad('carrierClear', `${c.line}'s narration box meets the scaled line's carrier`);
    all.slice(i + 1).forEach((d) => { if (polyMeetsBox(c.outline, union(d.outline.map(([x, y]) => ({ x0: x, y0: y, x1: x, y1: y }))))) bad('carrierClear', `${c.line} and ${d.line} share a box`); });
  });
  return out;
}

/** The page's lines from glyph cells (centre, size), frame px: each glyph its em box. */
export const boxesOfCells = (cells: { x: number; y: number; s: number }[]): Box[] => cells.map(emBox);
