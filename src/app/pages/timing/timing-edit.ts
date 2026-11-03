/** A line being edited: just its times (the editor keeps everything else). */
export interface Span {
  start: number;
  end: number;
}

/** Lines closer than this are back to back: lengthening one into the other pushes the shared edge. */
const JOIN = 0.05;
const MIN = 0.1;

/**
 * Moves one edge of line i. Neighbours are pushed, never pulled: lengthen line 1 from 1–5 to 1–6 and a back-to-back
 * line 2 starts at 6 instead of blocking it, but shorten it to 1–4 and line 2 keeps its start (a gap opens, e.g. for
 * an interlude). To move a shared edge earlier, drag the later line's start. A neighbour with a gap blocks the end.
 */
export function moveEdge<T extends Span>(list: T[], i: number, edge: 'start' | 'end', to: number, duration: number): T[] {
  const out = list.map((c) => ({ ...c }));
  const c = out[i];
  const prev = out[i - 1];
  const next = out[i + 1];
  if (edge === 'start') {
    const lo = prev ? prev.start + MIN : 0;
    c.start = Math.max(lo, Math.min(to, c.end - MIN));
    if (prev && prev.end > c.start) prev.end = c.start;
  } else {
    const joined = !!next && Math.abs(next.start - c.end) < JOIN;
    const hi = next ? (joined ? next.end - MIN : next.start) : duration;
    c.end = Math.max(c.start + MIN, Math.min(to, hi));
    if (next && next.start < c.end) next.start = c.end;
  }
  for (const x of [prev, c, next]) if (x) Object.assign(x, { start: +x.start.toFixed(3), end: +x.end.toFixed(3) });
  return out;
}

/** The song's last moments stay clear of a line's start, and lines this close cannot both be read, s. */
const REFLOW_GAP = 0.15;

/**
 * Lines back in order and inside the song after a large move: estimated times can be seconds off, so one tap may carry a
 * run of lines past the next line a person fixed, or past the end of the audio. A line that overran goes back in front of
 * the next `pinned` line, a line left behind is pushed on, and no line is ever dropped.
 */
export function reflow<T extends Span>(list: readonly T[], duration: number, pinned: (line: T) => boolean = () => false): T[] {
  const out = list.map((c) => ({ ...c }));
  const gap = Math.min(REFLOW_GAP, duration / (out.length + 2));
  const last = duration - 2 * gap;
  out.reduceRight((cap, c) => {
    c.start = Math.max(0, Math.min(c.start, cap));
    return (pinned(c) ? c.start : cap) - gap;
  }, last);
  out.forEach((c, i) => (c.start = Math.max(c.start, i ? out[i - 1].start + gap : 0)));
  out.reduceRight((cap, c) => (c.start = Math.min(c.start, cap)) - gap, last);
  out.forEach((c, i) => {
    c.start = +c.start.toFixed(3);
    c.end = +Math.min(out[i + 1]?.start ?? duration, Math.max(c.end, c.start + MIN)).toFixed(3);
  });
  return out;
}

/** A tap lands about this long after the sound it answers (reaction time), s. */
export const TAP_REACTION = 0.12;

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

/** Space kept between a moved line and its new neighbours, s. */
const MOVE_PAD = 0.05;
/** A gap shorter than this cannot hold a line: it takes half of a neighbour instead (as 插入 does), s. */
const MOVE_MIN_GAP = 0.6;
/** A moved line fills its gap up to this long: a longer gap is an interlude, not the line's time, s. */
const MOVE_MAX = 8;

/** Whether gap `toIndex` (see moveLine) is right next to line `id`: moving there changes nothing. */
export function sameGap(list: readonly { id: string }[], id: string, toIndex: number): boolean {
  const i = list.findIndex((c) => c.id === id);
  return toIndex === i || toIndex === i + 1;
}

/**
 * Moves line `id` whole to gap `toIndex` of the list as it is now (0 = before the first line, `list.length` = after the
 * last), for a line the alignment put out of order. It takes the free time there: from the previous line's end to the
 * next line's start (the song's end after the last), at most MOVE_MAX; with no room it takes the second half of the
 * previous line (the first half of the next one at the very start). Its old place is left empty, its per-character
 * times are dropped (they belonged to the old time) and everything else stays with it.
 */
export function moveLine<T extends EditLine>(list: readonly T[], id: string, toIndex: number, duration: number): EditResult<T> {
  const i = list.findIndex((c) => c.id === id);
  if (i < 0) return { ok: false, message: '找不到這一句' };
  if (!(Number.isInteger(toIndex) && toIndex >= 0 && toIndex <= list.length)) return { ok: false, message: '移動的位置不在列表裡' };
  if (sameGap(list, id, toIndex)) return { ok: true, lines: [...list] };
  const rest = list.filter((_, j) => j !== i).map((c) => ({ ...c }));
  const at = toIndex > i ? toIndex - 1 : toIndex;
  const prev = rest[at - 1];
  const next = rest[at];
  const r = (t: number) => +t.toFixed(3);
  let start = prev ? prev.end + MOVE_PAD : 0;
  let end = Math.min(next ? next.start - MOVE_PAD : duration, start + MOVE_MAX);
  if (end - start < MOVE_MIN_GAP && prev) {
    start = r((prev.start + prev.end) / 2);
    end = prev.end;
    prev.end = start;
  } else if (end - start < MOVE_MIN_GAP && next) {
    end = r((next.start + next.end) / 2);
    start = next.start;
    next.start = end;
  }
  const moved = { ...list[i], start: r(start), end: r(end) } as T;
  delete moved.charStarts;
  delete moved.charTimed;
  return { ok: true, lines: [...rest.slice(0, at), moved, ...rest.slice(at)] };
}

/** Moves every line by `delta` seconds; refused as a whole if any line would leave [0, duration] (no clamping). */
export function shiftAll<T extends Span & { charStarts?: number[] }>(list: readonly T[], delta: number, duration: number): EditResult<T> {
  if (!Number.isFinite(delta) || delta === 0) return { ok: false, message: '請輸入要平移的秒數' };
  if (list.some((c) => c.start + delta < 0 || c.end + delta > duration)) return { ok: false, message: '平移後有句子超出歌曲範圍，整批沒有套用' };
  const r = (t: number) => +(t + delta).toFixed(3);
  return { ok: true, lines: list.map((c) => ({ ...c, start: r(c.start), end: r(c.end), ...(c.charStarts ? { charStarts: c.charStarts.map(r) } : {}) })) };
}
