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
    expect(validateDesign({ ...validateDesign(undefined, win).design, medium: 'riso' }, win).design.medium).toBe('riso');
    expect(validateDesign({ ...validateDesign(undefined, win).design, medium: 'oil' as never }, win).design.medium).toBe('clean');
  });
});

describe('section medium', () => {
  it('switches hard at the section start and falls back to the song medium', async () => {
    const { colorAt } = await import('./design');
    const base = { shadow: '#000000', highlight: '#ffffff', accent: '#ff0000', duotone: 0, image: 1 };
    const script = [{ ...base, start: 0 }, { ...base, start: 10, medium: 'xerox' as const }, { ...base, start: 20 }];
    expect(colorAt(script, 5).medium).toBeUndefined();
    expect(colorAt(script, 10.01).medium).toBe('xerox');
    expect(colorAt(script, 21).medium).toBeUndefined();
  });
});
