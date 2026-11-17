import { describe, expect, it } from 'vitest';
import { mustShare } from './sung-tail';
import { requiredReading } from './reading-window';

describe('mustShare: two lines whose handover cannot be clean are shown together, never one hidden', () => {
  it('a line starting with the next (same start) shares', () => {
    expect(mustShare({ start: 10, end: 11, text: 'あいうえお' }, { start: 10, end: 12, text: 'かきくけこ' })).toBe(true);
  });
  it('a duet overlap (B in at 9.5 while A sings to 10.05) shares', () => {
    expect(mustShare({ start: 8, end: 10.1, text: 'あいうえお', charStarts: [8, 8.5, 9, 9.5, 10.05] }, { start: 9.5, end: 11, text: 'かきくけこ', charStarts: [9.5, 9.8, 10, 10.4, 10.6] })).toBe(true);
  });
  it('lines back to back (LRC, or timed with a gap) do not', () => {
    expect(mustShare({ start: 8, end: 10, text: 'あいうえお' }, { start: 10, end: 12, text: 'かきくけこ' })).toBe(false);
    expect(mustShare({ start: 8, end: 10.1, text: 'あいうえお', charStarts: [8, 8.5, 9, 9.5, 9.9] }, { start: 10.2, end: 12, text: 'かきくけこ' })).toBe(false);
  });
});

describe('requiredReading: a negative or too-short window fails, never passes as ok', () => {
  it('asks the reading floor at least, whatever the window', () => {
    expect(requiredReading(2, -0.1)).toBeGreaterThan(0);
    expect(requiredReading(2, 0.2)).toBeGreaterThan(0.2 * 0.95);
    expect(requiredReading(2, 10)).toBe(2);
    expect(requiredReading(0.3, 0.2)).toBeCloseTo(0.3, 6);
  });
});
