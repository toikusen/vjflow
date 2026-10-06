import { describe, expect, it } from 'vitest';
import { motifStateAt, validateMotif } from './motif';

describe('validateMotif', () => {
  it('clamps sides, drops unknown forms, starts at the window', () => {
    const r = validateMotif(
      { kind: 'polygon', sides: 40, sections: [{ start: 30, form: 'tunnel', intensity: 2 }, { start: 50, form: 'spiral' as never, intensity: 1 }] },
      { start: 0, end: 60 },
    );
    expect(r.errors).toEqual([]);
    expect(r.motif!.sides).toBe(12);
    expect(r.motif!.sections).toEqual([{ start: 0, form: 'off', intensity: 0 }, { start: 30, form: 'tunnel', intensity: 1 }]);
    expect(validateMotif({ kind: 'cube' as never, sides: 4, sections: [] }, { start: 0, end: 60 }).errors.length).toBe(2);
  });
});

describe('motifStateAt', () => {
  const m = { kind: 'clock' as const, sides: 6, sections: [{ start: 0, form: 'center' as const, intensity: 0.5 }, { start: 10, form: 'tunnel' as const, intensity: 1 }] };
  it('returns the current form, the previous one and the crossfade', () => {
    expect(motifStateAt(m, 5).cur.form).toBe('center');
    const s = motifStateAt(m, 10.3);
    expect(s.cur.form).toBe('tunnel');
    expect(s.prev?.form).toBe('center');
    expect(s.k).toBeCloseTo(0.5);
  });
});

describe('motif variants', () => {
  it('keeps a known variant and render, drops unknown ones', async () => {
    const { validateMotif } = await import('./motif');
    const win = { start: 0, end: 60 };
    const sections = [{ start: 0, form: 'center' as const, intensity: 1 }];
    expect(validateMotif({ kind: 'orbit', sides: 6, variant: 'saturn', render: 'flat', sections }, win).motif).toMatchObject({ variant: 'saturn', render: 'flat' });
    expect(validateMotif({ kind: 'orbit', sides: 6, variant: 'roman', render: 'glow' as never, sections }, win).motif).toMatchObject({ variant: undefined, render: undefined });
  });
});
