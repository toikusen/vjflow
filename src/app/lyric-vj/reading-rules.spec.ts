import { describe, expect, it } from 'vitest';
import { countMoment, emptyCounts, readMoment, regressions } from './reading-rules';

const [W, H] = [160, 90];
type Px = [number, number, number];
/** A frame of one tone with rectangles painted on it. */
function frame(ground: Px, rects: { x: number; y: number; w: number; h: number; c: Px }[] = []) {
  const d = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) d.set([...ground, 255], i * 4);
  for (const r of rects) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (x >= 0 && y >= 0 && x < W && y < H) d.set([...r.c, 255], (y * W + x) * 4);
  return d;
}
/** "Strokes": a row of bars standing for a line of words. */
const strokes = (x: number, y: number, n: number, c: Px, size = 10) => Array.from({ length: n }, (_, i) => ({ x: x + i * size * 1.4, y, w: Math.max(2, size * 0.4), h: size, c }));
const PAPER: Px = [240, 232, 214];
const INK: Px = [20, 20, 30];

describe('readMoment', () => {
  it('passes plain dark words in the middle of a busy enough paper frame', () => {
    const back = frame(PAPER, [{ x: 0, y: 0, w: 40, h: 90, c: [180, 60, 50] }]);
    const m = readMoment(frame(PAPER, [{ x: 0, y: 0, w: 40, h: 90, c: [180, 60, 50] }, ...strokes(50, 38, 6, INK, 14)]), back, W, H)!;
    expect(m.clip).toBe(false);
    expect(m.plate).toBe(0);
    expect(m.cross).toBeLessThan(0.08);
    expect(m.low).toBe(0);
  });
  it('is undefined when the line is not on screen', () => {
    expect(readMoment(frame(PAPER), frame(PAPER), W, H)).toBeUndefined();
  });
  it('finds words cut by the frame', () => {
    const m = readMoment(frame(PAPER, strokes(120, 40, 6, INK, 12)), frame(PAPER), W, H)!;
    expect(m.clip).toBe(true);
  });
  it('finds a dark plate laid under the words and not one that is the whole ground', () => {
    const plate = { x: 40, y: 30, w: 80, h: 26, c: [40, 40, 50] as Px };
    const light: Px = [235, 235, 235];
    const m = readMoment(frame(PAPER, [plate, ...strokes(46, 36, 5, light, 14)]), frame(PAPER, [plate]), W, H)!;
    expect(m.plate).toBe(-1);
    const dark = readMoment(frame([30, 30, 40], strokes(46, 36, 5, light, 14)), frame([30, 30, 40]), W, H)!;
    expect(dark.plate).toBe(0);
  });
  it('finds small words on an empty frame, not small words in a full picture', () => {
    const lonely = readMoment(frame(PAPER, strokes(6, 6, 3, INK, 6)), frame(PAPER), W, H)!;
    expect(lonely.small).toBe(true);
    const busy = [{ x: 40, y: 20, w: 110, h: 60, c: [60, 90, 140] as Px }];
    const held = readMoment(frame(PAPER, [...busy, ...strokes(6, 6, 3, INK, 6)]), frame(PAPER, busy), W, H)!;
    expect(held.small).toBe(false);
  });
  it('finds lines of the picture running under the strokes', () => {
    const lines = Array.from({ length: 12 }, (_, i) => ({ x: 30 + i * 9, y: 0, w: 2, h: 90, c: [90, 40, 40] as Px }));
    const m = readMoment(frame(PAPER, [...lines, ...strokes(40, 38, 6, INK, 14)]), frame(PAPER, lines), W, H)!;
    expect(m.cross).toBeGreaterThan(0.08);
  });
  it('finds ink that misses 4.5:1 against what is behind it', () => {
    const m = readMoment(frame([120, 120, 120], strokes(40, 38, 6, [70, 70, 70], 14)), frame([120, 120, 120]), W, H)!;
    expect(m.low).toBeGreaterThan(0.5);
  });
});

describe('rule counts', () => {
  it('count failing moments and name the rules that got worse', () => {
    const bad = readMoment(frame(PAPER, strokes(120, 40, 6, INK, 12)), frame(PAPER), W, H)!;
    const good = readMoment(frame(PAPER, strokes(40, 40, 6, INK, 12)), frame(PAPER), W, H)!;
    const before = [good, good, good, good].reduce((c, m) => countMoment(c, m, false), emptyCounts());
    const after = [good, bad, good, good].reduce((c, m) => countMoment(c, m, true), emptyCounts());
    expect(after.clip).toBe(1);
    expect(regressions(before, after)).toEqual(['glow', 'clip']);
    expect(regressions(after, before)).toEqual([]);
  });
});
