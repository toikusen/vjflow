import { describe, expect, it } from 'vitest';
import { EXIT_MIN, exitAfterSung, nextShowAfter, showByOnset, SUNG_TAIL } from './sung-tail';

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

describe('the next line shows by its first sung character (Codex: 10.0 s / 10.0–10.25 s was shown at 10.4 s)', () => {
  it('invents no tail past the end of a line with no character times', () => {
    expect(exitAfterSung(9.9, 10.0, 0)).toBe(10.0);
  });
  it('caps a wait at the next line\'s sung onset: the two are up together for the exit\'s blink', () => {
    const exitAt = exitAfterSung(9.9, 10.0, 0);
    const waited = nextShowAfter(exitAt, 0.28, 10.0, 0.02);
    expect(waited.show).toBeGreaterThan(10.0);
    expect(showByOnset(waited.show, 10.0, 10.0)).toBe(10.0);
  });
  it('still waits where the onset leaves room, and never moves a show earlier than planned', () => {
    expect(showByOnset(22.74, 22.44, 23.1)).toBe(22.74);
    expect(showByOnset(22.74, 22.44, 22.6)).toBe(22.6);
    expect(showByOnset(22.74, 22.44, 22.3)).toBe(22.44);
  });
});
