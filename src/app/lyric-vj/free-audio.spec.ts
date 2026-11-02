import { describe, expect, it } from 'vitest';
import { audioProblem } from './free-audio';

describe('audioProblem', () => {
  it('passes a song', () => {
    expect(audioProblem(240, 8e6)).toBe('');
  });
  it('refuses too short, too long and too big, saying which', () => {
    expect(audioProblem(4)).toContain('太短');
    expect(audioProblem(1000)).toContain('太長');
    expect(audioProblem(240, 4e8)).toContain('太大');
  });
  it('waits for the decoded length when the header gives none', () => {
    expect(audioProblem(Infinity)).toBe('');
  });
});
