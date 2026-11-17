import { describe, expect, it } from 'vitest';
import { EXIT_MIN, exitAfterSung, nextShowAfter, SUNG_TAIL } from './sung-tail';

describe('exitAfterSung', () => {
  it('holds a line that would leave on its last sung character until the tail has passed', () => {
    expect(exitAfterSung(22.22, 22.34)).toBeCloseTo(22.34 + SUNG_TAIL, 5);
  });
  it('leaves an exit alone that already starts after the tail', () => {
    expect(exitAfterSung(23.5, 22.34)).toBe(23.5);
  });
  it('keeps the tail even when the next line presses: the next one waits instead', () => {
    expect(exitAfterSung(22.22, 22.34)).toBeCloseTo(22.64, 5);
  });
  it('a line with no sung times keeps its exit', () => {
    expect(exitAfterSung(22.22, undefined)).toBe(22.22);
  });
});

describe('nextShowAfter', () => {
  it('leaves the next line where the exit is over before it shows', () => {
    expect(nextShowAfter(22.0, 0.28, 23.0, 0.02)).toEqual({ show: 23.0, exitDur: 0.28 });
  });
  it('shortens the exit toward the next line, down to a blink', () => {
    const r = nextShowAfter(22.64, 0.28, 22.8, 0.02);
    expect(r.exitDur).toBeCloseTo(0.14, 5);
    expect(r.show).toBeCloseTo(22.8, 5);
  });
  it('makes the next line wait when even a blink would run into it (v4 c004: いい天気 → 絞り出した)', () => {
    const r = nextShowAfter(22.64, 0.28, 22.44, 0.02);
    expect(r.exitDur).toBe(EXIT_MIN);
    expect(r.show).toBeCloseTo(22.64 + EXIT_MIN + 0.02, 5);
  });
  it('a cut exit shows the next line as the last one is gone', () => {
    expect(nextShowAfter(22.64, 0, 22.44, 0.02)).toEqual({ show: 22.66, exitDur: 0 });
  });
});
