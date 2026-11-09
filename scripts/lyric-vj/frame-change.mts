// Whether a planned composition switch is really seen (Q1 phase 3a, docs/research/2026-11-09-q1-phase3a.md): two stable
// frames, one before the switch and one after, each read three ways (frame-page.mts: with the words, without them with
// their carriers kept, with the carriers gone too). Read off them: where the words stand (anchor-tolerant, so a longer
// line in the same seat is not a move), how big their type is (row or column thickness, not the ink's area, so other
// words are not a change of scale), which way they run, what they stand on (the page and carrier without the words)
// and where the words sit on their carrier. Pure numbers; the thresholds were grid-searched on 28 frames Claude labelled
// (out/research/q1-1109/calib/labels.json, scripts/lyric-vj/q1-calib.mts), no hold-out: provisional until checked on
// held-out or owner-labelled samples. What counts as seen (SEEN) and the move maths are shared with the scheduler
// (src/app/lyric-vj/render/seat-geometry.ts).
import { anchorMove, centreMove, SEEN } from '../../src/app/lyric-vj/render/seat-geometry';
export { SEEN };

/** The check's grid, px (a 1920 × 1080 frame scaled down). */
export const GRID = { w: 320, h: 180 };

/** Grey difference that counts as a pixel changed. */
const DIFF = 20;

interface Box { x0: number; y0: number; x1: number; y1: number; n: number }
export interface FrameRead {
  /** The words' box, frame fractions, and their ink share. */
  words?: { x0: number; y0: number; x1: number; y1: number; share: number };
  /** Rows (across) or columns (down) and their median thickness, a share of the frame height. */
  runs?: { across: boolean; n: number; size: number; /** Largest run over smallest: a blown-up word among small ones. */ spread: number };
  /** The carriers' box (what the words stand on that goes with them), frame fractions. */
  carrier?: { x0: number; y0: number; x1: number; y1: number };
}
export interface FrameChange {
  seen: boolean;
  why: string;
  /** The words' least move over the anchors, frame fractions. */
  shift: number;
  /** The old check's number: the box centre's move. */
  centre: number;
  /** The type size ratio, larger over smaller (1 when either side has no runs). */
  scale: number;
  /** How the spread of sizes inside the words changed (a blown-up word came or went), larger over smaller. */
  relation: number;
  turned: boolean;
  /** Share of the frame (words excluded) whose ground changed. */
  page: number;
  /** How far the words' centre moved on their carrier, a share of the carrier's size (0 off a carrier). */
  onCarrier: number;
}

const maskOf = (a: number[], b: number[]) => a.map((v, i) => Math.abs(v - b[i]) > DIFF);
/** Where the grey changes sharply: a drawn edge (a line, an outline, a texture's dots). */
const edges = (g: number[], w: number, h: number) => g.map((v, i) => { const [x, y] = [i % w, Math.floor(i / w)]; return x + 1 < w && y + 1 < h && Math.max(Math.abs(v - g[i + 1]), Math.abs(v - g[i + w])) > DIFF; });
/** A mask grown by r px. */
function grown(m: boolean[], w: number, h: number, r: number): boolean[] {
  const out = [...m];
  m.forEach((on, i) => { if (!on) return; const [x, y] = [i % w, Math.floor(i / w)]; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const [u, v] = [x + dx, y + dy]; if (u >= 0 && v >= 0 && u < w && v < h) out[v * w + u] = true; } });
  return out;
}
function boxOf(m: boolean[], w: number, h: number): Box | undefined {
  let [x0, y0, x1, y1, n] = [w, h, -1, -1, 0];
  m.forEach((on, i) => { if (!on) return; const [x, y] = [i % w, Math.floor(i / w)]; n++; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); });
  return n ? { x0, y0, x1, y1, n } : undefined;
}

/** Runs of ink along one axis inside the box: bands with some ink, separated by empty lines. */
function bands(m: boolean[], w: number, b: Box, across: boolean): number[] {
  const [from, to, len] = across ? [b.y0, b.y1, b.x1 - b.x0 + 1] : [b.x0, b.x1, b.y1 - b.y0 + 1];
  const least = Math.max(1, Math.round(len * 0.02));
  const out: number[] = [];
  let run = 0;
  for (let k = from; k <= to + 1; k++) {
    let c = 0;
    if (k <= to) for (let j = across ? b.x0 : b.y0; j <= (across ? b.x1 : b.y1); j++) c += m[across ? k * w + j : j * w + k] ? 1 : 0;
    if (k <= to && c >= least) run++;
    else if (run) { out.push(run); run = 0; }
  }
  return out;
}

/** One stable frame read: the words' box and runs, and the carrier's box. */
export function readFrame(f: { on: number[]; off: number[]; bare: number[] }, w = GRID.w, h = GRID.h): FrameRead {
  const m = maskOf(f.on, f.off);
  const b = boxOf(m, w, h);
  const c = boxOf(maskOf(f.off, f.bare), w, h);
  const out: FrameRead = {};
  if (b && b.n / (w * h) >= 0.002) {
    out.words = { x0: b.x0 / w, y0: b.y0 / h, x1: (b.x1 + 1) / w, y1: (b.y1 + 1) / h, share: b.n / (w * h) };
    // (the axis the words run along is the one whose bands are text lines: more, thinner bands across a wide block)
    const wide = (b.x1 - b.x0) * h >= (b.y1 - b.y0) * w * 0.9;
    const rows = bands(m, w, b, true);
    const cols = bands(m, w, b, false);
    const across = wide || !(cols.length >= 1 && (b.y1 - b.y0) > 2.2 * Math.max(...cols));
    const runs = across ? rows : cols;
    const med = [...runs].sort((x, y) => x - y)[runs.length >> 1] ?? 0;
    // (a column's thickness is measured across x: back to a share of the frame height on the same pixel scale)
    out.runs = { across, n: runs.length, size: med / h, spread: runs.length ? Math.max(...runs) / Math.max(1, Math.min(...runs)) : 1 };
  }
  if (c && c.n / (w * h) >= 0.004) out.carrier = { x0: c.x0 / w, y0: c.y0 / h, x1: (c.x1 + 1) / w, y1: (c.y1 + 1) / h };
  return out;
}

/**
 * A switch read off its two stable frames. `sameText`: the same words on both (a switch inside a line), so the box's own
 * centre is the move; across lines the least move over the anchors is, so a longer line in the same seat is no move.
 */
export function frameChange(before: { on: number[]; off: number[]; bare: number[] }, after: { on: number[]; off: number[]; bare: number[] }, sameText = false, seen: typeof SEEN = SEEN, w = GRID.w, h = GRID.h): FrameChange {
  const [a, b] = [readFrame(before, w, h), readFrame(after, w, h)];
  if (!a.words || !b.words) return { seen: false, why: 'no words on a stable frame either side', shift: 0, centre: 0, scale: 1, relation: 1, turned: false, page: 0, onCarrier: 0 };
  const [p, q] = [a.words, b.words];
  const shift = anchorMove(p, q);
  const centre = centreMove(p, q);
  const sa = a.runs?.size ?? 0;
  const sb = b.runs?.size ?? 0;
  const scale = sa > 0 && sb > 0 ? Math.max(sa, sb) / Math.min(sa, sb) : 1;
  const turned = !!a.runs && !!b.runs && a.runs.across !== b.runs.across;
  // the words' own scale relation: one size throughout on one side, a blown-up word among small ones on the other
  const relation = a.runs && b.runs ? Math.max(a.runs.spread, b.runs.spread) / Math.min(a.runs.spread, b.runs.spread) : 1;
  // what the words stand on (their carriers kept), by its drawn edges, not its colours: outside both word masks (grown a
  // little), the share of the frame where an edge is on one side and not the other. A ground that only changes colour
  // keeps its edges; a new page, panel or carrier outline does not.
  const words = grown(maskOf(before.on, before.off).map((x, i) => x || Math.abs(after.on[i] - after.off[i]) > DIFF), w, h, 2);
  const [ea, eb] = [edges(before.off, w, h), edges(after.off, w, h)];
  let [changed, all] = [0, 0];
  ea.forEach((x, i) => { if (words[i]) return; all++; if (x !== eb[i]) changed++; });
  const page = all ? changed / all : 0;
  // where the words sit on their carrier, as a share of the carrier's size (a carrier that moved with the words: 0)
  const rel = (x: FrameRead) => (x.carrier && x.words ? [((x.words.x0 + x.words.x1) / 2 - x.carrier.x0) / Math.max(0.02, x.carrier.x1 - x.carrier.x0), ((x.words.y0 + x.words.y1) / 2 - x.carrier.y0) / Math.max(0.02, x.carrier.y1 - x.carrier.y0)] : undefined);
  const [ra, rb] = [rel(a), rel(b)];
  const onCarrier = ra && rb ? Math.hypot(ra[0] - rb[0], ra[1] - rb[1]) : 0;
  const n = (x: number) => +x.toFixed(3);
  return judge({ shift: n(sameText ? centre : shift), centre: n(centre), scale: n(scale), relation: n(relation), turned, page: n(page), onCarrier: n(onCarrier) }, seen);
}

/** Whether a switch's numbers are seen at these thresholds, and why. */
export function judge(m: Omit<FrameChange, 'seen' | 'why'>, seen: typeof SEEN = SEEN): FrameChange {
  const why = [m.shift >= seen.shift && `moved ${m.shift.toFixed(3)}`, m.scale >= seen.scale && `type ×${m.scale.toFixed(2)}`, m.relation >= seen.relation && `scale relation ×${m.relation.toFixed(2)}`, m.turned && 'turned', m.page >= seen.page && `ground changed ${m.page.toFixed(2)}`, m.onCarrier >= seen.onCarrier && `moved on its carrier ${m.onCarrier.toFixed(2)}`].filter(Boolean) as string[];
  return { ...m, seen: why.length > 0, why: why.length ? why.join(', ') : `still: moved ${m.shift.toFixed(3)}, type ×${m.scale.toFixed(2)}, relation ×${m.relation.toFixed(2)}, ground ${m.page.toFixed(2)}` };
}

/**
 * The two stable frames a switch is read on, inside reading windows (the engine's readable times): before, the seat the
 * words leave, still being read (a switch at a line's show: the line before, short of its exit; inside a line: just
 * before the switch); after, the seat they land in, once its entrance is over. Undefined when a side has no reading time.
 */
export function stableTimes(e: { at: number; from: number; to: number; scope: string; lineIds: string[] }, cues: { id: string; from: number; to: number }[]): { before: number; after: number } | undefined {
  const k = cues.findIndex((c) => c.id === e.lineIds.at(-1));
  if (k < 0) return undefined;
  const line = cues[k];
  const prev = e.scope === 'in-line' ? line : cues.slice(0, k).reverse().find((c) => c.to <= e.at + 0.5) ?? cues[k - 1];
  if (!prev) return undefined;
  const before = Math.max(prev.from + 0.05, Math.min(prev.to - 0.1, e.from - 0.12));
  const after = Math.min(line.to - 0.05, Math.max(e.to + 0.3, e.scope === 'in-line' ? e.to + 0.3 : line.from + 0.15));
  return before < e.at && after > e.at ? { before: +before.toFixed(2), after: +after.toFixed(2) } : undefined;
}
