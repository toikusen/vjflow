import { describe, expect, it } from 'vitest';
import { MEDIA, stepTime } from './medium';
import { validateDesign } from './design';

describe('medium', () => {
  it('holds background time to the medium frame rate', () => {
    expect(stepTime(1.26, 12)).toBeCloseTo(1.25);
    expect(stepTime(1.2499, 8)).toBeCloseTo(1.125);
    expect(stepTime(1.26, 0)).toBe(1.26);
  });

  it('every medium has a label and clean adds nothing', () => {
    expect(Object.values(MEDIA).every((m) => m.label)).toBe(true);
    const { label, boilRate, ...rest } = MEDIA.clean;
    expect(Object.values(rest).every((v) => v === 0)).toBe(true);
  });

  it('design keeps a known medium and falls back to clean', () => {
    const win = { start: 0, end: 10 };
    expect(validateDesign({ ...validateDesign(undefined, win).design, medium: 'paper' }, win).design.medium).toBe('paper');
    expect(validateDesign({ ...validateDesign(undefined, win).design, medium: 'oil' as never }, win).design.medium).toBe('clean');
  });
});
