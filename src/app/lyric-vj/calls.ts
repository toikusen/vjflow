// Calls and backing lines inside a lyric line — "(幹什麼? 幹什麼?) 呼吸吐納心自在", "愛してる（Hey!）": the part in
// brackets is sung by someone else (a chorus, the crowd, a second voice). Set inside the main line it reads as
// clutter; designer VJs give it a second, smaller track of its own. This splits a line into the main text and its
// calls and maps character indexes from the full line to the main text (emphasis and line breaks are given against
// the full line).

export interface Call {
  text: string;
  /** Share of the line's characters before and through this call: when in the line it is sung (0..1). */
  from: number;
  to: number;
}

export interface SplitLine {
  main: string;
  calls: Call[];
  /** For each character index of the full line, its index in `main` (-1 inside a call). */
  map: number[];
}

const OPEN = '(（';
const CLOSE = ')）';

/** Splits off bracketed calls; a line that is all call (or has no closed bracket) stays as it is. */
export function splitCalls(text: string): SplitLine {
  const chars = [...text];
  const map: number[] = [];
  const calls: Call[] = [];
  let main = '';
  let k = 0;
  for (let i = 0; i < chars.length; i++) {
    if (OPEN.includes(chars[i])) {
      const j = chars.findIndex((c, x) => x > i && CLOSE.includes(c));
      if (j < 0) return { main: text, calls: [], map: chars.map((_, x) => x) };
      const inner = chars.slice(i + 1, j).join('').trim();
      if (inner) calls.push({ text: inner, from: i / chars.length, to: (j + 1) / chars.length });
      for (let x = i; x <= j; x++) map.push(-1);
      i = j;
      continue;
    }
    map.push(k++);
    main += chars[i];
  }
  // tidy the seams the brackets left (double or edge spaces) without moving any kept character's index
  if (!calls.length || !main.trim()) return { main: text, calls: [], map: chars.map((_, x) => x) };
  const lead = main.length - main.trimStart().length;
  const trimmed = main.trim();
  return { main: trimmed, calls, map: map.map((m) => (m < 0 ? -1 : m - lead >= 0 && m - lead < trimmed.length ? m - lead : -1)) };
}

/** A [from, to) range of the full line in main-text indexes, or undefined when it lies inside a call. */
export function mapRange(map: number[], from: number, to: number): [number, number] | undefined {
  const kept = map.slice(from, to).filter((m) => m >= 0);
  return kept.length ? [kept[0], kept[kept.length - 1] + 1] : undefined;
}

/** A call as shouted: its text and when (s). */
export interface TimedCall {
  text: string;
  at: number;
  cueId: string;
}

/**
 * Every bracketed call in the cues with the time it is shouted: the sung time of its opening bracket when the line
 * has character timings, else its share of the line.
 */
export function callTimes(cues: { id: string; start: number; end: number; text: string; charStarts?: number[] }[]): TimedCall[] {
  return cues.flatMap((c) => {
    const n = [...c.text].length;
    return splitCalls(c.text).calls.map((k) => {
      const i = Math.round(k.from * n);
      const at = c.charStarts?.[i] ?? c.start + k.from * (c.end - c.start);
      return { text: k.text, at: Math.max(c.start, Math.min(c.end, at)), cueId: c.id };
    });
  });
}

/**
 * Call words set side by side in rows centred on 0: each beside the last by its own width plus `gap`, a row that
 * would pass `room` starting another (row 1 above row 0). Alternating sides at a fixed step put キタ and the second
 * drift of Tokyo Drift's chorus on the same spot.
 */
export function lineUp(widths: number[], room: number, gap: number): { x: number; row: number }[] {
  const rows: number[][] = [[]];
  widths.forEach((w, i) => {
    const r = rows[rows.length - 1];
    if (r.length && r.reduce((a, j) => a + widths[j] + gap, 0) + w > room) rows.push([i]);
    else r.push(i);
  });
  const out: { x: number; row: number }[] = [];
  rows.forEach((r, row) => {
    let x = -(r.reduce((a, j) => a + widths[j], 0) + gap * (r.length - 1)) / 2;
    for (const j of r) {
      out[j] = { x: x + widths[j] / 2, row };
      x += widths[j] + gap;
    }
  });
  return out;
}

/** A call split at its spaces into phrases of up to `max` characters each. */
export function callPhrases(text: string, max = 14): string[] {
  const out: string[] = [];
  for (const w of text.split(/[\s　]+/).filter(Boolean)) {
    const last = out[out.length - 1];
    if (last !== undefined && [...last].length + 1 + [...w].length <= max) out[out.length - 1] = `${last} ${w}`;
    else out.push(w);
  }
  return out;
}

/** A box in frame px, origin at the frame's centre, y up (the text root's own space). */
export interface CallBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** What `placeCalls` places: each call unit's width and height in frame px (tilt and keyline included). */
export interface CallUnit {
  w: number;
  h: number;
}

export interface CallRoom {
  /** The call's own line where it is read (empty frame middle when undefined). */
  line?: CallBox;
  /** Every lyric glyph box on screen while the call is: its own line's places and the other lines'. */
  avoid: CallBox[];
  W: number;
  H: number;
  /** Clear space kept between a call and any lyric (px). */
  gap?: number;
  /** Space kept to the frame's edge (px). */
  edge?: number;
  /** Space between calls set side by side (px). */
  between?: number;
}

const hits = (a: CallBox, b: CallBox, gap: number) => a.x0 < b.x1 + gap && b.x0 < a.x1 + gap && a.y0 < b.y1 + gap && b.y0 < a.y1 + gap;

/**
 * Where each call goes: over its line, else under it, else beside it (right, then left), each unit's box kept `gap`
 * clear of every lyric box and inside the frame. A vertical line that runs the frame's height left no room over or
 * under it, and the clamp to the frame's foot put 幹什麼? on its last characters (psychedelic, brutalist 2026-11-04);
 * a call never stands on lyric glyphs: with no free spot it is dropped (`undefined`).
 */
export function placeCalls(units: CallUnit[], room: CallRoom): { x: number; y: number }[] | undefined {
  if (!units.length) return [];
  const { W, H, line } = room;
  const gap = room.gap ?? 28;
  const edge = room.edge ?? 30;
  const between = room.between ?? 56;
  const step = Math.max(...units.map((u) => u.h)) + 18;
  const half = step / 2;
  const top = line?.y1 ?? H * 0.2;
  const bottom = line?.y0 ?? -H * 0.2;
  const cx = line ? (line.x0 + line.x1) / 2 : 0;
  const cy = line ? (line.y0 + line.y1) / 2 : 0;
  const widths = units.map((u) => u.w);
  const fits = (at: { x: number; y: number }[]) =>
    at.every((p, j) => {
      const b = { x0: p.x - units[j].w / 2, x1: p.x + units[j].w / 2, y0: p.y - units[j].h / 2, y1: p.y + units[j].h / 2 };
      if (b.x0 < -W / 2 + edge || b.x1 > W / 2 - edge || b.y0 < -H / 2 + edge || b.y1 > H / 2 - edge) return false;
      return room.avoid.every((o) => !hits(b, o, gap));
    });
  // rows wrapped at `wrap`, centred on `centre`, each unit held inside `span`
  const row = (wrap: number, span: [number, number], centre: number, ys: (rows: number, r: number) => number) => {
    if (span[1] - span[0] <= 0) return undefined;
    const at = lineUp(widths, wrap, between);
    const rows = Math.max(1, ...at.map((a) => a.row + 1));
    return at.map(({ x, row: r }, j) => {
      const h = widths[j] / 2;
      return { x: Math.min(span[1] - h, Math.max(span[0] + h, centre + x)), y: ys(rows, r) };
    });
  };
  const wide = Math.min(W * 0.9, Math.max(W * 0.5, line ? line.x1 - line.x0 : 0));
  const frame: [number, number] = [-W / 2 + edge, W / 2 - edge];
  const candidates = [
    // the first row read first: on top above the line, nearest the line below it
    row(wide, frame, cx, (rows, r) => top + gap + half + (rows - 1 - r) * step),
    row(wide, frame, cx, (_, r) => bottom - gap - half - r * step),
  ];
  if (line) {
    const right: [number, number] = [line.x1 + gap, W / 2 - edge];
    const left: [number, number] = [-W / 2 + edge, line.x0 - gap];
    const side = (span: [number, number]) => row(span[1] - span[0], span, (span[0] + span[1]) / 2, (rows, r) => cy + ((rows - 1) / 2 - r) * step);
    candidates.push(side(right), side(left));
  }
  return candidates.find((c) => c && fits(c));
}
