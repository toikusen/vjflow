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
