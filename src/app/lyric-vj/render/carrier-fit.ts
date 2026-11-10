// Words on a band or plate their page prints at a fixed place (a mid-century sleeve's colour bars, a clay strip, a
// scrapbook card): the carrier containment rule (phase 4d round 2, critic 2026-11-10-q1-phase4d-critic.md fig. 6–8). A
// part of a line read on a band keeps its ink, everything printed with its letters (a second plate out of register, a
// sticker's backing and shadow, a clay letter's drop) and a named inner padding inside the band, and keeps clear of the
// lines the band's page draws (a key plate's registration line). world-sets blockOf sets the line smaller until it fits,
// down to the type floor, and marks it missed past that (the composer then takes another set); a band its set lets grow is
// grown instead. The pages draw their lines with `strokeClear`, which never lets one come near the line's ink, and
// `declareCarrier` tells the reading gate what each line is read on (reading-rules carrier-overflow, rule-crosses-text).
import type { Block, SetSpec } from './world-sets';

type Box = { x0: number; y0: number; x1: number; y1: number };
/** A band in frame fractions [x0, y0, x1, y1], y down. */
export type FracBox = [number, number, number, number];

/**
 * A carrier the page prints at a fixed place under one part of a line: its box, the part it carries (the whole line or a
 * split line's hero: `main`; the split line's small part: `small`), the inner padding the ink keeps (ems), the lines the
 * page draws with it (thin boxes: a key plate's edges) and, where the page draws the band round the words, how far it may grow.
 */
export interface Band { box: FracBox; part?: 'main' | 'small'; inset?: number; lines?: FracBox[]; grow?: FracBox }

/** The inner padding a part keeps inside its band, ems (critic round 2: ≥ 0.35 em unless the set declares its own). */
export const CARRIER_INSET = 0.35;
/** How near a page's declared line may come to the words' ink, px at 1080p (the gold-rule pattern: a rule never meets a letter). */
export const LINE_CLEAR = 12;

/**
 * How far past the letters' own box what is printed with them reaches, ems [left, top, right, bottom], by `under` kind
 * (world-glyph-b5b: REGISTER, STICKER, CLAY; restated here so the layout reads them without the drawing code).
 */
export const UNDER_REACH: Record<string, [number, number, number, number]> = {
  'mc-reg': [0, 0, 0.03, 0.022],
  'scrap-back': [0.085, 0.085, 0.085, 0.085],
  'scrap-cut': [0.1, 0.1, 0.1, 0.1],
  'scrap-drop': [0.1, 0.1, 0.118, 0.124],
  'clay-drop': [0, 0, 0.045, 0.06],
};

/** The farthest every `under` layer of a set reaches past its letters, ems. */
export const reachOf = (spec: Pick<SetSpec, 'under'>): [number, number, number, number] =>
  (spec.under ?? []).reduce<[number, number, number, number]>((m, u) => { const r = UNDER_REACH[u.kind] ?? [0, 0, 0, 0]; return [0, 1, 2, 3].map((i) => Math.max(m[i], r[i])) as [number, number, number, number]; }, [0, 0, 0, 0]);

/** A box in frame fractions as frame px. */
export const toPx = ([x0, y0, x1, y1]: FracBox): Box => ({ x0: x0 * 1920, y0: y0 * 1080, x1: x1 * 1920, y1: y1 * 1080 });
const inside = (a: Box, b: Box) => a.x0 >= b.x0 - 1e-6 && a.y0 >= b.y0 - 1e-6 && a.x1 <= b.x1 + 1e-6 && a.y1 <= b.y1 + 1e-6;
/** The gap between two boxes, px (0 when they meet). */
export const gapOf = (a: Box, b: Box) => Math.max(0, a.x0 - b.x1, b.x0 - a.x1, a.y0 - b.y1, b.y0 - a.y1);
const union = (bs: Box[]): Box => ({ x0: Math.min(...bs.map((b) => b.x0)), y0: Math.min(...bs.map((b) => b.y0)), x1: Math.max(...bs.map((b) => b.x1)), y1: Math.max(...bs.map((b) => b.y1)) });

/**
 * A block's parts as the renderer lays them, frame px, y down, with each part's type size: the whole block, or a split
 * line's hero rows and small rows (seat-geometry laidSeat's own row geometry).
 */
export function partBoxes(b: Block): { part: 'main' | 'small'; box: Box; size: number }[] {
  if (!b.lines?.length) return [{ part: 'main', size: b.size, box: { x0: 960 + b.cx - b.w / 2, x1: 960 + b.cx + b.w / 2, y0: 540 - b.cy - b.h / 2, y1: 540 - b.cy + b.h / 2 } }];
  const rows = b.lines.map((r, i) => ({ part: (b.small ?? []).includes(i) ? ('small' as const) : ('main' as const), size: r.size, box: r.v ? { x0: 960 + b.cx + r.x0, x1: 960 + b.cx + r.x0 + r.bw, y0: 540 - b.cy - r.y, y1: 540 - b.cy - r.y + r.size } : { x0: 960 + b.cx + r.x0, x1: 960 + b.cx + r.x0 + r.bw, y0: 540 - b.cy - r.y - r.size / 2, y1: 540 - b.cy - r.y + r.size / 2 } }));
  return (['main', 'small'] as const).flatMap((part) => { const rs = rows.filter((r) => r.part === part); return rs.length ? [{ part, size: Math.max(...rs.map((r) => r.size)), box: union(rs.map((r) => r.box)) }] : []; });
}

export interface BandFit {
  ok: boolean;
  /** Each part on a band: its ink with what is printed with it, the room it needs (ink and padding), its band as drawn (grown or not) and what failed. */
  parts: { part: 'main' | 'small'; ink: Box; need: Box; band: Box; grown?: boolean; miss?: 'band' | 'line' }[];
}

/** Whether every part of a block read on a band fits it with its padding and keeps clear of the band's lines. */
export function bandFit(b: Block, spec: Pick<SetSpec, 'bands' | 'under'>): BandFit {
  const [rl, rt, rr, rb] = reachOf(spec);
  const parts = partBoxes(b).flatMap(({ part, box, size }) => {
    const band = (spec.bands ?? []).find((x) => (x.part ?? 'main') === part);
    if (!band) return [];
    const ink = { x0: box.x0 - rl * size, y0: box.y0 - rt * size, x1: box.x1 + rr * size, y1: box.y1 + rb * size };
    const pad = (band.inset ?? CARRIER_INSET) * size;
    const need = { x0: ink.x0 - pad, y0: ink.y0 - pad, x1: ink.x1 + pad, y1: ink.y1 + pad };
    const drawn = toPx(band.box);
    const grows = !inside(need, drawn) && !!band.grow && inside(need, toPx(band.grow));
    const at = grows ? union([drawn, need]) : drawn;
    const lineMiss = (band.lines ?? []).some((l) => gapOf(ink, toPx(l)) < LINE_CLEAR);
    const miss = !inside(need, at) ? ('band' as const) : lineMiss && !grows ? ('line' as const) : undefined;
    return [{ part, ink, need, band: at, ...(grows ? { grown: true } : {}), ...(miss ? { miss } : {}) }];
  });
  return { ok: parts.every((p) => !p.miss), parts };
}

/** A band's box mirrored left to right (the page drawn turned, world-b3-shared mirrorGround). */
export const mirrorBox = ([x0, y0, x1, y1]: FracBox): FracBox => [1 - x1, y0, 1 - x0, y1];
/** A band mirrored, its lines and growth too. */
export const mirrorBand = (b: Band): Band => ({ ...b, box: mirrorBox(b.box), ...(b.lines ? { lines: b.lines.map(mirrorBox) } : {}), ...(b.grow ? { grow: mirrorBox(b.grow) } : {}) });
/** The four edges of a rectangle drawn with a stroke of `lw` px, as thin boxes in frame fractions (a key plate's outline). */
export const edgesOf = (x: number, y: number, w: number, h: number, lw: number): FracBox[] => {
  const [fx, fy] = [(v: number) => v / 1920, (v: number) => v / 1080];
  const k = lw / 2;
  return [[fx(x - k), fy(y - k), fx(x + w + k), fy(y + k)], [fx(x - k), fy(y + h - k), fx(x + w + k), fy(y + h + k)], [fx(x - k), fy(y - k), fx(x + k), fy(y + h + k)], [fx(x + w - k), fy(y - k), fx(x + w + k), fy(y + h + k)]];
};

/** The parts of an axis-aligned thin box left once `cut` is taken out of it (along its long side). */
export function subtractBox(l: Box, cut: Box): Box[] {
  if (!(cut.x0 < l.x1 && cut.x1 > l.x0 && cut.y0 < l.y1 && cut.y1 > l.y0)) return [l];
  const across = l.x1 - l.x0 >= l.y1 - l.y0;
  const out: Box[] = across ? [{ ...l, x1: Math.min(l.x1, cut.x0) }, { ...l, x0: Math.max(l.x0, cut.x1) }] : [{ ...l, y1: Math.min(l.y1, cut.y0) }, { ...l, y0: Math.max(l.y0, cut.y1) }];
  return out.filter((b) => b.x1 - b.x0 > 0.5 && b.y1 - b.y0 > 0.5);
}

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
/**
 * Strokes a page's line (`draw` builds the path and strokes it) everywhere but within `clear` px of the words' box: the
 * one way a set's decorative line is drawn near a line of lyrics. Returns the line's boxes as drawn (for the gate).
 */
export function strokeClear(c: Ctx, draw: () => void, lines: Box[], words: Box | undefined, clear = LINE_CLEAR): Box[] {
  if (!words) { draw(); return lines; }
  const keep = { x0: words.x0 - clear, y0: words.y0 - clear, x1: words.x1 + clear, y1: words.y1 + clear };
  c.save();
  c.beginPath();
  c.rect(-4000, -4000, 12000, 12000);
  c.rect(keep.x0, keep.y0, keep.x1 - keep.x0, keep.y1 - keep.y0);
  c.clip('evenodd');
  draw();
  c.restore();
  return lines.flatMap((l) => subtractBox(l, keep));
}

/** What the reading gate reads a line against, frame px y down: the carriers it should stay on, the lines it should keep clear of, and the region it is judged in. */
export interface Declared { carriers: Box[]; lines: Box[]; scope: Box }
/**
 * Tells the reading gate (scripts/lyric-vj/gate-page.mts, `__vjDeclared`, emptied as each world page is drawn, so the last page's stands) what this frame's line is read on, in the
 * frame's own coordinates (through the page's transform, so a mirrored page declares where it is seen). Nothing when no
 * gate listens.
 */
export function declareCarrier(e: { base?: DOMMatrix; rect?: Box }, carriers: Box[], lines: Box[]) {
  const g = globalThis as { __vjDeclared?: Declared[] };
  if (!g.__vjDeclared || !e.rect) return;
  const m = e.base;
  const map = (b: Box): Box => {
    if (!m) return b;
    const [p, q] = [m.transformPoint(new DOMPoint(b.x0, b.y0)), m.transformPoint(new DOMPoint(b.x1, b.y1))];
    return { x0: Math.min(p.x, q.x), y0: Math.min(p.y, q.y), x1: Math.max(p.x, q.x), y1: Math.max(p.y, q.y) };
  };
  const r = map(e.rect);
  g.__vjDeclared.push({ carriers: carriers.map(map), lines: lines.map(map), scope: { x0: r.x0 - 60, y0: r.y0 - 60, x1: r.x1 + 60, y1: r.y1 + 60 } });
}
