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
