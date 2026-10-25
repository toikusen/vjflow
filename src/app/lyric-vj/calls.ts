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
