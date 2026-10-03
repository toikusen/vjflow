import { describe, expect, it } from 'vitest';
import { revealAt, settledAt, CueRuntime } from './runtime';

const rt = (showFrom: number, exitAt: number) =>
  ({ showFrom, exitAt, pace: 1, cue: { text: 'abcd', charStarts: [0, 9, 9.1, 9.2] }, style: { reveal: 'word', enter: 'cut' } }) as unknown as CueRuntime;

describe('revealAt', () => {
  it('spreads a line evenly over its first 45 %, ignoring sung character times', () => {
    expect(revealAt(rt(10, 12), 0)).toBe(10);
    expect(revealAt(rt(10, 12), 0.5)).toBeCloseTo(10.45);
    expect(settledAt(rt(10, 12), 4, 0)).toBeCloseTo(10.9);
  });

  it('keeps the reveal between 0.3 and 1.5 s', () => {
    expect(revealAt(rt(0, 0.4), 1)).toBeCloseTo(0.3);
    expect(revealAt(rt(0, 10), 1)).toBeCloseTo(1.5);
  });
});
