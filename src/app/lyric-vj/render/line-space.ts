// The sums behind the reading-space layouts (line-layouts.ts): where a line divides, what two phrases share, how big a
// counterweight must be. Pure numbers, so the line composer asks the same questions the renderer answers.
import { phraseBoundaries } from '../phrases';

const W = 1920;
const H = 1080;

const letters = (s: string) => (s.match(/[\p{L}\p{N}]/gu) ?? []).length;
/** The sung line without its bracketed calls: what a fit is judged on. */
export const spoken = (text: string) => text.replace(/[(（][^)）]*[)）]/g, ' ').trim();

export interface TwoParts { at: number; head: string; tail: string }

/** The line at its semantic break nearest the middle, the singer's own spaces and commas first; none if a side would be under two characters. */
export function twoParts(text: string): TwoParts | undefined {
  const cs = [...text];
  const count = (a: number, b: number) => letters(cs.slice(a, b).join(''));
  const fair = (xs: number[]) => xs.filter((i) => count(0, i) >= 2 && count(i, cs.length) >= 2).sort((a, b) => Math.abs(a - cs.length / 2) - Math.abs(b - cs.length / 2))[0];
  const at = fair(cs.flatMap((c, i) => (/[\s，,、]/.test(c) ? [i + 1] : []))) ?? fair([...phraseBoundaries(text)]);
  return at === undefined ? undefined : { at, head: cs.slice(0, at).join('').trim(), tail: cs.slice(at).join('').trim() };
}

export type Span = [number, number];

/** The line's phrases as character ranges, at most `max`: spaces and commas, else the one break twoParts finds. */
export function phraseSpans(text: string, max = 3): Span[] {
  const cs = [...text];
  const spans: Span[] = [];
  let from = -1;
  cs.forEach((c, i) => {
    const gap = /[\s，,、]/.test(c);
    if (!gap && from < 0) from = i;
    if (gap && from >= 0) {
      spans.push([from, i]);
      from = -1;
    }
  });
  if (from >= 0) spans.push([from, cs.length]);
  const two = twoParts(text);
  const out: Span[] = spans.length < 2 && two ? [[0, two.at], [two.at, cs.length]] : spans;
  while (out.length > 1 && (out.length > max || out.some(([a, b]) => letters(cs.slice(a, b).join('')) < 2))) {
    const size = (k: number) => out[k + 1][1] - out[k][0];
    const k = out.slice(0, -1).reduce((best, _, i) => (size(i) < size(best) ? i : best), 0);
    out.splice(k, 2, [out[k][0], out[k + 1][1]]);
  }
  return out;
}

/** Characters that cannot stand in a column as they are: Latin and digits, long marks, punctuation. */
const NOT_UPRIGHT = /[A-Za-z0-9ー〜～…―!?！？、。，．,."'「」『』()（）]/;
export const upright = (s: string) => !NOT_UPRIGHT.test(s);
/** Latin is not set on any of these layouts: its words would be split across cells and corners. */
export const cjkOnly = (s: string) => !/[A-Za-z]{2}/.test(s);

/** Grammar, not meaning: two phrases sharing one of these share nothing. */
const FUNCTION_CHAR = /[的了著過是在和與跟就也都很之一不個那這有把被のにはをがでとも]/;

export interface Crossing { head: string; tail: string; at: number; i: number; j: number }

/** Two phrases that can cross on a word they both hold: the shared character nearest the middle of each, the second set in a column. */
export function crossingOf(text: string): Crossing | undefined {
  const parts = twoParts(text);
  if (!parts || parts.head === parts.tail || !cjkOnly(text) || !upright(parts.tail.replace(/\s/g, ''))) return undefined;
  const [h, v] = [[...parts.head], [...parts.tail]];
  if (h.length < 3 || v.length < 3 || h.length > 10 || v.length > 9) return undefined;
  const offCentre = (i: number, n: number) => Math.abs(i - (n - 1) / 2);
  const hits = h.flatMap((c, i) => (/\p{Script=Han}/u.test(c) && !FUNCTION_CHAR.test(c) ? v.flatMap((d, j) => (c === d ? [{ i, j }] : [])) : []));
  const best = hits.sort((a, b) => offCentre(a.i, h.length) + offCentre(a.j, v.length) - offCentre(b.i, h.length) - offCentre(b.j, v.length))[0];
  return best && { ...parts, ...best };
}

/** A line that can turn a corner: two phrases, the one that goes down the frame short enough and uprightable. */
export function cornerOf(text: string): (TwoParts & { across: 'head' | 'tail' }) | undefined {
  const parts = twoParts(text);
  if (!parts || !cjkOnly(text)) return undefined;
  const across = [...parts.head].length >= [...parts.tail].length ? 'head' : 'tail';
  const down = across === 'head' ? parts.tail : parts.head;
  const [a, d] = [[...(across === 'head' ? parts.head : parts.tail)].length, [...down].length];
  return upright(down) && d >= 2 && d <= 7 && a >= 3 && a <= 11 ? { ...parts, across } : undefined;
}

export interface Ellipse { x: number; y: number; a: number; b: number }

/**
 * A block of type and one flat ellipse balanced about the frame's centre like weights on a beam: the block sits off to
 * one side, and the ellipse's area times its distance equals the block's. It stays in the free space, clear of the block.
 */
export function counterweight(blockW: number, blockH: number, side: number): { blockX: number; shape: Ellipse } {
  const [margin, air] = [W * 0.05, 120];
  const blockX = side * (W / 2 - margin - blockW / 2);
  const inner = Math.abs(blockX) - blockW / 2;
  const free = W - 2 * margin - blockW - air;
  const [flat, moment] = [0.62, Math.abs(blockX) * blockW * blockH];
  // area × distance = moment, the distance being as far out as the ellipse's own width lets it
  const fitA = [0, 1, 2, 3].reduce((a) => Math.sqrt(moment / (Math.PI * flat * Math.max(1, W / 2 - margin - a))), free / 2);
  const a = Math.max(Math.min(W * 0.07, free / 2), Math.min(free / 2, W * 0.2, H * 0.3 / flat, fitA));
  const b = a * flat;
  const near = a + air - inner;
  const far = W / 2 - margin - a;
  const dist = Math.max(near, Math.min(far, moment / (Math.PI * a * b)));
  return { blockX, shape: { x: -side * dist, y: b < blockH / 2 ? -(blockH / 2 - b) : 0, a, b } };
}

/** The ellipse's outline, about its own centre. */
export function ellipsePoints(s: Ellipse, n = 56): [number, number][] {
  return Array.from({ length: n }, (_, i) => [s.a * Math.cos((i / n) * Math.PI * 2), s.b * Math.sin((i / n) * Math.PI * 2)]);
}

/** A row of cells for a row of characters: phrase breaks are a wide gutter, not one more cell. */
export function cellRow(groups: number[], cell: number, gutter = 0.55): number[] {
  const total = groups.reduce((a, n) => a + n, 0) * cell + (groups.length - 1) * gutter * cell;
  let x = -total / 2 + cell / 2;
  return groups.flatMap((n) => {
    const row = Array.from({ length: n }, (_, i) => x + i * cell);
    x += n * cell + gutter * cell;
    return row;
  });
}

/** Four bars of one cell, none reaching a corner: a manuscript square that never closes. Each [x0, y0, x1, y1]. */
export function cellBars(x: number, y: number, cell: number, weight: number): [number, number, number, number][] {
  const [h, in0] = [cell / 2, cell * 0.14];
  return [[x - h + in0, y + h - weight, x + h - in0, y + h], [x - h + in0, y - h, x + h - in0, y - h + weight], [x - h, y - h + in0, x - h + weight, y + h - in0], [x + h - weight, y - h + in0, x + h, y + h - in0]];
}

/** A panel's outline: left edge square, the bottom edge bowed by `bow` px, unequal in width by its own inset. */
export function panelOutline(x0: number, x1: number, y0: number, y1: number, bow: number, n = 18): [number, number][] {
  const bottom = Array.from({ length: n + 1 }, (_, i) => [x0 + ((x1 - x0) * i) / n, y0 - bow * Math.sin((i / n) * Math.PI)] as [number, number]);
  return [...bottom, [x1, y1], [x0, y1]];
}

/** The columns of a page by their own widths, in reading order, top to bottom; `x` is each column's left edge, `y` its top. */
export function pageColumns(firstW: number, firstH: number, secondW: number, secondH: number, firstIsMain: boolean, side: number) {
  const gap = 40;
  const total = firstH + gap + secondH;
  const left = -W * 0.42;
  const right = W * 0.42;
  // the main column starts at the margin; the aside steps in, so the two never share one left edge
  const step = Math.min(right - secondW - left, firstIsMain ? firstW * 0.42 + W * 0.04 : firstW * 0.5);
  const [x1, x2] = [left, left + step];
  const flip = (x: number, w: number) => (side > 0 ? -x - w : x);
  return { first: { x: flip(x1, firstW), y: total / 2 }, second: { x: flip(x2, secondW), y: total / 2 - firstH - gap } };
}
