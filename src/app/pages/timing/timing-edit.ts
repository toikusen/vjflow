/** A line being edited: just its times (the editor keeps everything else). */
export interface Span {
  start: number;
  end: number;
}

/** Lines closer than this are back to back: moving the shared edge moves both. */
const JOIN = 0.05;
const MIN = 0.1;

/**
 * Moves one edge of line i. A back-to-back neighbour keeps sharing that edge (lengthen line 1 from 1–5 to 1–6 and
 * line 2 starts at 6 instead of blocking it); a neighbour with a gap only yields when the line would overlap it.
 */
export function moveEdge<T extends Span>(list: T[], i: number, edge: 'start' | 'end', to: number, duration: number): T[] {
  const out = list.map((c) => ({ ...c }));
  const c = out[i];
  const prev = out[i - 1];
  const next = out[i + 1];
  if (edge === 'start') {
    const joined = !!prev && Math.abs(prev.end - c.start) < JOIN;
    const lo = prev ? prev.start + MIN : 0;
    c.start = Math.max(lo, Math.min(to, c.end - MIN));
    if (prev && (joined || prev.end > c.start)) prev.end = c.start;
  } else {
    const joined = !!next && Math.abs(next.start - c.end) < JOIN;
    const hi = next ? (joined ? next.end - MIN : next.start) : duration;
    c.end = Math.max(c.start + MIN, Math.min(to, hi));
    if (next && joined) next.start = c.end;
  }
  for (const x of [prev, c, next]) if (x) Object.assign(x, { start: +x.start.toFixed(3), end: +x.end.toFixed(3) });
  return out;
}

/** The candidate nearest t if it is within `within` seconds, else t (Shift-drag snapping). */
export function snapTo(t: number, candidates: number[], within: number): number {
  const near = candidates.reduce((best, x) => (Math.abs(x - t) < Math.abs(best - t) ? x : best), Infinity);
  return Math.abs(near - t) <= within ? near : t;
}

/** A line the split/merge/shift edits understand: per-character times are indexed by code point of `text`. */
export interface EditLine extends Span {
  id: string;
  text: string;
  charStarts?: number[];
  charTimed?: boolean;
}

export type EditResult<T> = { ok: true; lines: T[] } | { ok: false; message: string };

const graphemes = (text: string) => [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].map((s) => s.segment);

/** The last grapheme boundary at or before a UTF-16 caret position (an input's selectionStart), as a grapheme count. */
export function graphemeIndexAt(text: string, caret: number): number {
  let k = 0;
  let at = 0;
  for (const g of graphemes(text)) {
    if (at + g.length > caret) break;
    at += g.length;
    k++;
  }
  return k;
}

/**
 * Splits line `id` after `at` graphemes, at `time` (the playhead: there are no per-word times to guess one from).
 * The left half keeps the id, the right half gets `newId`; per-character times go with their characters.
 */
export function splitLine<T extends EditLine>(list: readonly T[], id: string, at: number, time: number, newId: string): EditResult<T> {
  const i = list.findIndex((c) => c.id === id);
  if (i < 0) return { ok: false, message: '找不到這一句' };
  const c = list[i];
  const g = graphemes(c.text);
  if (!(at > 0 && at < g.length)) return { ok: false, message: '先在歌詞文字裡點出要切開的位置（不能在頭尾）' };
  if (!(time > c.start && time < c.end)) return { ok: false, message: '把播放位置移到這一句的時間裡面，從那裡切開' };
  const raw = g.slice(0, at).join('');
  const left = raw.trimEnd();
  const right = g.slice(at).join('').trimStart();
  if (!left || !right) return { ok: false, message: '切開後兩邊都要有歌詞' };
  // a space at the cut belongs to neither half; per-character times skip it too
  const rightFrom = [...c.text].length - [...right].length;
  const chars = (from: number, to?: number) => (c.charStarts ? { charStarts: c.charStarts.slice(from, to) } : {});
  const a = { ...c, end: time, text: left, ...chars(0, [...left].length) } as T;
  const b = { ...c, id: newId, start: time, text: right, ...chars(rightFrom) } as T;
  return { ok: true, lines: [...list.slice(0, i), a, b, ...list.slice(i + 1)] };
}

const LATIN_EDGE = /[\p{Script=Latin}\p{N}]/u;

/** Merges line `id` with the next one: first id and start, last end, the words joined (a space only between Latin words). */
export function mergeLines<T extends EditLine>(list: readonly T[], id: string): EditResult<T> {
  const i = list.findIndex((c) => c.id === id);
  const a = list[i];
  const b = list[i + 1];
  if (!a || !b) return { ok: false, message: '最後一句沒有下一句可以合併' };
  const space = LATIN_EDGE.test(a.text.at(-1) ?? '') && LATIN_EDGE.test(b.text[0] ?? '') ? ' ' : '';
  const merged = { ...a, end: b.end, text: a.text + space + b.text } as T;
  delete merged.charStarts;
  delete merged.charTimed;
  if (a.charStarts && b.charStarts) Object.assign(merged, { charStarts: [...a.charStarts, ...(space ? [b.start] : []), ...b.charStarts], charTimed: !!(a.charTimed && b.charTimed) });
  return { ok: true, lines: [...list.slice(0, i), merged, ...list.slice(i + 2)] };
}

/** Moves every line by `delta` seconds; refused as a whole if any line would leave [0, duration] (no clamping). */
export function shiftAll<T extends Span & { charStarts?: number[] }>(list: readonly T[], delta: number, duration: number): EditResult<T> {
  if (!Number.isFinite(delta) || delta === 0) return { ok: false, message: '請輸入要平移的秒數' };
  if (list.some((c) => c.start + delta < 0 || c.end + delta > duration)) return { ok: false, message: '平移後有句子超出歌曲範圍，整批沒有套用' };
  const r = (t: number) => +(t + delta).toFixed(3);
  return { ok: true, lines: list.map((c) => ({ ...c, start: r(c.start), end: r(c.end), ...(c.charStarts ? { charStarts: c.charStarts.map(r) } : {}) })) };
}
