import { describe, expect, it } from 'vitest';
import { atLength, quoteParts, rectEdge } from './layouts';

describe('quoteParts', () => {
  it('strips the marks of a line that is one quoted phrase and keeps the big brackets', () => {
    expect(quoteParts('「あと一曲」')).toEqual({ text: 'あと一曲', marks: true });
    expect(quoteParts(' “see you” ')).toEqual({ text: 'see you', marks: true });
  });
  it('keeps a line that quotes part of itself whole, without the big brackets', () => {
    expect(quoteParts('「またね！」って笑って 手を振ろう')).toEqual({ text: '「またね！」って笑って 手を振ろう', marks: false });
    expect(quoteParts('まだ足りない 「ありがとう」')).toEqual({ text: 'まだ足りない 「ありがとう」', marks: false });
  });
  it('a plain line gets the big brackets', () => {
    expect(quoteParts('ライトが消えても  夢は消えない')).toEqual({ text: 'ライトが消えても 夢は消えない', marks: true });
  });
});

describe('ribbon curve', () => {
  it('finds the x at an arc length on a sampled curve', () => {
    // a straight line at 45°: length √2 per unit of x
    const xs = [0, 1, 2, 3];
    const ls = xs.map((x) => x * Math.SQRT2);
    expect(atLength(xs, ls, 1.5 * Math.SQRT2)).toBeCloseTo(1.5);
    expect(atLength(xs, ls, 0)).toBeCloseTo(0);
  });
});

describe('tunnel walls', () => {
  it('walks the rectangle clockwise from the top-left, text facing the centre', () => {
    expect(rectEdge(0, 100, 50)).toEqual([-100, 50, 0]);
    expect(rectEdge(250, 100, 50)).toEqual([100, 0, -Math.PI / 2]);
    expect(rectEdge(400, 100, 50)).toEqual([0, -50, Math.PI]);
    expect(rectEdge(550, 100, 50)).toEqual([-100, 0, Math.PI / 2]);
    // wraps around
    expect(rectEdge(600, 100, 50)).toEqual([-100, 50, 0]);
  });
});
