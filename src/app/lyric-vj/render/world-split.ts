// One line in two type sizes, or in two containers (style batch 3's boards a and c, 2026-11-04): the line breaks at a
// space the lyric itself has, one part is the hero, set big, the other set small above or below it, or at a place of its
// own on the page (the burst beside a comic's balloon, the red band of a poster). A line with no space, or with a part of
// one character, is laid out as one block as before.
import { balancedRows } from '../phrases';
import type { Slots } from './world-objects';
import type { Block, Measure, SetSpec } from './world-sets';

export interface SplitSpec {
  /** Which part is set small: the line's first phrase (over the hero) or its last (under it, or away from it). */
  small: 'lead' | 'tail';
  /** The small part's size, a share of the hero's (never under the type floor). */
  scale: number;
  /** The small part's tracking in ems, when not the set's. */
  track?: number;
  /** The small part's own ink, a slot (a red line under the title, white words on a red band). */
  ink?: keyof Slots;
  /** The small part may wrap into this many rows (a narrow burst). */
  rows?: number;
  /** The small part's own place, its centre in frame fractions: a second container on the page. */
  at?: [number, number];
  /** Its widest row there, a share of the frame width. */
  share?: number;
  /** The hero's widest row while the line is split, a share of the frame (a hero that cannot break wider than the set's rows). */
  wide?: number;
  /** The hero's height limit while the line is split, a share of the frame (room kept for the small part). */
  tall?: number;
  /** Which side of the small part sits on `at` across: -1 its left edge (a band's text from its left), 0 its centre. */
  ax?: -1 | 0;
}

/** A row's place in a split block, relative to the block's centre, y up: its box's left edge and width, its centre line. */
export interface RowBox { x0: number; bw: number; y: number; size: number; track: number; flush: -1 | 0 | 1; /** A column read down: `y` is its top. */ v?: boolean }

const [W, H, SAFE_X, SAFE_Y] = [1920, 1080, 64, 48];
const clampTo = (x: number, r: number) => Math.min(r, Math.max(-r, x));
const bare = (s: string) => [...s.replace(/[\s\p{P}\p{S}]/gu, '')].length;
/** Characters a row may not start with (small kana, the long mark, closing punctuation). */
const NO_START = /[ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶんンー、。，．！？!?）」』〉》】…・ゝゞヽヾ]/;

/**
 * `text` in `rows` rows: at its phrases when they balance, else cut by characters as evenly as can be with no row starting
 * on a character that may not start one. A part with no phrase break (信じてみるんだ) stayed one row past its container.
 */
export function wrapRows(text: string, rows: number): string[] {
  const phrased = balancedRows(text, rows).filter(Boolean);
  if (phrased.length >= rows) return phrased;
  const cs = [...text.replace(/\s+/g, '')];
  const out: string[] = [];
  let from = 0;
  for (let r = rows; r > 1; r--) {
    let cut = from + Math.ceil((cs.length - from) / r);
    while (cut < cs.length - 1 && NO_START.test(cs[cut])) cut++;
    if (cut >= cs.length) break;
    out.push(cs.slice(from, cut).join(''));
    from = cut;
  }
  out.push(cs.slice(from).join(''));
  return out.filter(Boolean);
}

/** The two parts of a line at its own spaces: [hero, small, small comes first]. Undefined when it has no such break. */
export function splitParts(text: string, small: SplitSpec['small'], even = false): [string, string, boolean] | undefined {
  const segs = text.split(' ').filter(Boolean);
  if (segs.length < 2) return undefined;
  // two containers of one size take the space nearest the middle; a small part is the last (or first) phrase
  const mid = even ? segs.map((_, i) => i).slice(1).sort((a, b) => Math.abs(bare(segs.slice(0, a).join('')) - bare(text) / 2) - Math.abs(bare(segs.slice(0, b).join('')) - bare(text) / 2))[0] : small === 'tail' ? segs.length - 1 : 1;
  const [lead, tail] = [segs.slice(0, mid).join(' '), segs.slice(mid).join(' ')];
  if (bare(lead) < 2 || bare(tail) < 2) return undefined;
  return small === 'tail' ? [lead, tail, false] : [tail, lead, true];
}

/** The block of a split set's line, or undefined to lay it out whole. `floor` is the least type a part may take. */
export function splitBlock(text: string, spec: SetSpec, measure: Measure, floor: number): Block | undefined {
  const sp = spec.split;
  if (!sp || (spec.vertical && !sp.at)) return undefined;
  const parts = splitParts(text, sp.small, sp.scale >= 0.9 && !!sp.at);
  if (!parts) return undefined;
  const [hero, small, smallFirst] = parts;
  if (spec.vertical) return columnsApart(hero, small, smallFirst, spec, sp, floor);
  const em = (rows: string[], track: number) => Math.max(...rows.map((r) => measure(r) / 100 + ([...r].length - 1) * track));
  const sTrack = sp.track ?? spec.track;
  let smallRows = (sp.rows ?? 1) > 1 && bare(small) >= 4 ? balancedRows(small, sp.rows!).filter(Boolean) : [small];
  let sEm = em(smallRows, sTrack);
  const k = sp.scale;
  const options: { rows: string[]; size: number }[] = [];
  // (stacked, the small part takes one of the set's rows; apart, the hero has them all)
  for (let n = 1; n <= Math.max(1, spec.rows[1] - (sp.at ? 0 : 1)); n++) {
    const rows = n === 1 ? [hero] : balancedRows(hero, n).filter(Boolean);
    if (n > 1 && rows.some((r) => bare(r) < 2)) continue;
    const hEm = em(rows, spec.track);
    const size = sp.at
      ? Math.min(spec.hi, ((sp.wide ?? spec.share) * W) / hEm, ((sp.tall ?? spec.tall) * H) / (rows.length * spec.lead))
      : Math.min(spec.hi, ((sp.wide ?? spec.share) * W) / Math.max(hEm, k * sEm), ((sp.tall ?? spec.tall) * H) / ((rows.length + k * smallRows.length) * spec.lead));
    options.push({ rows, size });
  }
  if (!options.length) return undefined;
  const best = Math.max(...options.map((o) => o.size));
  const pick = options.find((o) => o.size >= best * 0.95)!;
  let size = Math.max(spec.lo, Math.round(Math.min(spec.hi, pick.size)));
  let ss = Math.max(floor, Math.round(Math.min(size * k, sp.at ? ((sp.share ?? 0.3) * W) / sEm : Infinity)));
  // a part in its own container is held to the container's width: wrapped when it may take more rows, then set smaller.
  // The floor let 信じてみるんだ run one row across popart's burst and over its spikes (2026-11-04)
  if (sp.at) {
    const room = (sp.share ?? 0.3) * W;
    if (ss * sEm > room && (sp.rows ?? 1) > smallRows.length && bare(small) >= 4) {
      smallRows = wrapRows(small, sp.rows!);
      sEm = em(smallRows, sTrack);
      ss = Math.max(floor, Math.round(Math.min(size * k, room / sEm)));
    }
    ss = Math.min(ss, Math.floor(room / sEm));
  }
  // two sizes that are not clearly two (a long hero already at the floor) read as a mistake: the line is laid out whole
  if (ss > size * 0.85 && k < 0.9) return undefined;
  const hEm = em(pick.rows, spec.track);
  // the frame wins over the floor: a split line too big for the frame is set smaller, both parts together
  const fit = (f: number) => {
    const [hs, s2] = [Math.floor(size * f), Math.floor(ss * f)];
    const [hw, hh, sw, sh] = [hEm * hs, pick.rows.length * hs * spec.lead, sEm * s2, smallRows.length * s2 * spec.lead];
    return { hs, s2, hw, hh, sw, sh };
  };
  let g = fit(1);
  const over = sp.at
    ? Math.max(g.hw / ((sp.wide ?? spec.share) * W), g.sw / (W - 2 * SAFE_X), 1)
    : Math.max(Math.max(g.hw, g.sw) / (W - 2 * SAFE_X), (g.hh + g.sh) / (H - 2 * SAFE_Y), 1);
  if (over > 1) g = fit(1 / over);
  [size, ss] = [g.hs, g.s2];
  const rowsOrdered = smallFirst ? [...smallRows, ...pick.rows] : [...pick.rows, ...smallRows];
  const smallIdx = smallRows.map((_, i) => (smallFirst ? i : pick.rows.length + i));
  const flush = (spec.flush ?? 0) as -1 | 0 | 1;
  if (!sp.at) {
    const [w, h] = [Math.max(g.hw, g.sw), g.hh + g.sh];
    let top = h / 2;
    const lines: RowBox[] = rowsOrdered.map((_, r) => {
      const isSmall = smallIdx.includes(r);
      const s = isSmall ? ss : size;
      const y = top - (s * spec.lead) / 2;
      top -= s * spec.lead;
      return { x0: -w / 2, bw: w, y, size: s, track: isSmall ? sTrack : spec.track, flush };
    });
    const heroTop = smallFirst ? h / 2 - g.sh : h / 2;
    const cx = spec.at[0] * W - W / 2 - (spec.ax * w) / 2;
    const cy = H / 2 - spec.at[1] * H + (spec.ay * h) / 2;
    const [px, py] = spec.pad ?? [0, 0];
    const reach = (half: number, edge: number, pad: number) => Math.max(0, edge - half - pad);
    return { rows: rowsOrdered, size, w, h, cx: clampTo(cx, reach(w / 2, W / 2 - SAFE_X, px)), cy: clampTo(cy, reach(h / 2, H / 2 - SAFE_Y, py)), lines, small: smallIdx, hero: { cx: 0, cy: heroTop - g.hh / 2, w: g.hw, h: g.hh } };
  }
  // apart: the hero where the set stands, the small part centred on its own place; the block is the box round both
  const [px, py] = spec.pad ?? [0, 0];
  const reach = (half: number, edge: number, pad: number) => Math.max(0, edge - half - pad);
  const hcx = clampTo(spec.at[0] * W - W / 2 - (spec.ax * g.hw) / 2, reach(g.hw / 2, W / 2 - SAFE_X, px));
  const hcy = clampTo(H / 2 - spec.at[1] * H + (spec.ay * g.hh) / 2, reach(g.hh / 2, H / 2 - SAFE_Y, py));
  const scx = clampTo(sp.at[0] * W - W / 2 - ((sp.ax ?? 0) * g.sw) / 2, reach(g.sw / 2, W / 2 - SAFE_X, 0));
  const scy = clampTo(H / 2 - sp.at[1] * H, reach(g.sh / 2, H / 2 - SAFE_Y, 0));
  const x0 = Math.min(hcx - g.hw / 2, scx - g.sw / 2), x1 = Math.max(hcx + g.hw / 2, scx + g.sw / 2);
  const y0 = Math.min(hcy - g.hh / 2, scy - g.sh / 2), y1 = Math.max(hcy + g.hh / 2, scy + g.sh / 2);
  const [cx, cy, w, h] = [(x0 + x1) / 2, (y0 + y1) / 2, x1 - x0, y1 - y0];
  const lines: RowBox[] = [];
  let hTop = hcy + g.hh / 2 - cy, sTop = scy + g.sh / 2 - cy;
  rowsOrdered.forEach((_, r) => {
    if (smallIdx.includes(r)) { lines.push({ x0: scx - g.sw / 2 - cx, bw: g.sw, y: sTop - (ss * spec.lead) / 2, size: ss, track: sTrack, flush: (sp.ax ?? 0) as -1 | 0 }); sTop -= ss * spec.lead; }
    else { lines.push({ x0: hcx - g.hw / 2 - cx, bw: g.hw, y: hTop - (size * spec.lead) / 2, size, track: spec.track, flush }); hTop -= size * spec.lead; }
  });
  return { rows: rowsOrdered, size, w, h, cx, cy, lines, small: smallIdx, hero: { cx: hcx - cx, cy: hcy - cy, w: g.hw, h: g.hh } };
}

/** A column line split in two columns, each on its own strip: the hero where the set stands, the other at `at`, tops level. */
function columnsApart(hero: string, small: string, smallFirst: boolean, spec: SetSpec, sp: SplitSpec, floor: number): Block | undefined {
  const len = (t: string) => [...t.replace(/\s/g, '')].length;
  const step = 1 + spec.track;
  let size = Math.max(spec.lo, Math.round(Math.min(spec.hi, ((sp.tall ?? spec.tall) * H) / (len(hero) * step), (spec.share * W) / spec.lead)));
  let ss = Math.max(floor, Math.round(Math.min(size * sp.scale, ((sp.tall ?? spec.tall) * H) / (len(small) * step))));
  // the frame wins over the floor: a column too long for the frame is set smaller
  const top = clampTo(H / 2 - spec.at[1] * H, H / 2 - SAFE_Y);
  const over = Math.max(1, (Math.max(len(hero) * size, len(small) * ss) * step) / (top + H / 2 - SAFE_Y));
  [size, ss] = [Math.floor(size / over), Math.floor(ss / over)];
  // a column that would go under the floor is not split: the line is laid out whole
  if (ss < floor) return undefined;
  const [hh, sh] = [len(hero) * size * step, len(small) * ss * step];
  // (a column runs down from the set's top; one too long for that is raised until its foot is in the frame)
  const hTop = Math.min(H / 2 - SAFE_Y, Math.max(top, -H / 2 + SAFE_Y + hh));
  // (the second column runs from its own top when its container stands lower or higher on the page: a staggered pair)
  const sTop = Math.min(H / 2 - SAFE_Y, Math.max(clampTo(H / 2 - sp.at![1] * H, H / 2 - SAFE_Y), -H / 2 + SAFE_Y + sh));
  const [hcx, scx] = [spec.at[0] * W - W / 2, sp.at![0] * W - W / 2];
  const x0 = Math.min(hcx - (size * spec.lead) / 2, scx - (ss * spec.lead) / 2), x1 = Math.max(hcx + (size * spec.lead) / 2, scx + (ss * spec.lead) / 2);
  const y1 = Math.max(hTop, sTop), y0 = Math.min(hTop - hh, sTop - sh);
  const [cx, cy, w, h] = [(x0 + x1) / 2, (y0 + y1) / 2, x1 - x0, y1 - y0];
  const heroBox: RowBox = { x0: hcx - size / 2 - cx, bw: size, y: hTop - cy, size, track: spec.track, flush: 0, v: true };
  const smallBox: RowBox = { x0: scx - ss / 2 - cx, bw: ss, y: sTop - cy, size: ss, track: spec.track, flush: 0, v: true };
  return {
    rows: smallFirst ? [small, hero] : [hero, small], size, w, h, cx, cy,
    lines: smallFirst ? [smallBox, heroBox] : [heroBox, smallBox], small: [smallFirst ? 0 : 1],
    hero: { cx: hcx - cx, cy: hTop - hh / 2 - cy, w: size * spec.lead, h: hh },
  };
}
