import { describe, expect, it } from 'vitest';
import { readFix, revealAt, settledAt, CueRuntime } from './runtime';

const rt = (showFrom: number, exitAt: number) =>
  ({ showFrom, exitAt, pace: 1, cue: { text: 'abcd', charStarts: [0, 9, 9.1, 9.2] }, style: { reveal: 'word', enter: 'cut' } }) as unknown as CueRuntime;

describe('revealAt', () => {
  it('spreads a line evenly over its first quarter, ignoring sung character times', () => {
    expect(revealAt(rt(10, 12), 0)).toBe(10);
    expect(revealAt(rt(10, 12), 0.5)).toBeCloseTo(10.25);
    expect(settledAt(rt(10, 12), 4, 0)).toBeCloseTo(10.5);
  });

  it('keeps the reveal between 0.2 and 0.8 s', () => {
    expect(revealAt(rt(0, 0.4), 1)).toBeCloseTo(0.2);
    expect(revealAt(rt(0, 10), 1)).toBeCloseTo(0.8);
  });
});

describe('readFix', () => {
  const line = { showFrom: 10, exitAt: 12, exitDur: 0.3, style: { reveal: 'word', enter: 'flap', exit: 'fade' } } as unknown as CueRuntime;

  it('leaves a line that reads alone', () => {
    expect(readFix(line, [10.5, 12], 1.4, 20)).toBeUndefined();
  });

  it('holds a short line into free time after it', () => {
    expect(readFix(line, [10.5, 12], 2, 20)).toMatchObject({ exitAt: 12.5, exitDur: 0.3, style: { enter: 'flap' } });
  });

  it('lands and cuts a line with no time to spare', () => {
    const f = readFix(line, [11, 12], 2, 12.4)!;
    expect(f.style).toMatchObject({ reveal: 'line', enter: 'cut', exit: 'cut' });
    expect(f.exitAt).toBeCloseTo(12.32);
  });
});
