import { afterEach, describe, expect, it } from 'vitest';
import { readingExtrude, READING_EXTRUDE, stepA } from './world-layout';

describe('the opaque reveal and the declared extrudes (owner 2026-11-14; ruling 2026-11-13 §1)', () => {
  afterEach(() => void delete (globalThis as { __vjFadeReveal?: boolean }).__vjFadeReveal);

  it('a world glyph is there from its fade\'s middle or not at all, never see-through', () => {
    expect([0, 0.01, 0.49, 0.5, 0.75, 1].map(stepA)).toEqual([0, 0, 0, 1, 1, 1]);
    // (QA only: the fades as they were, for the timing comparison)
    (globalThis as { __vjFadeReveal?: boolean }).__vjFadeReveal = true;
    expect(stepA(0.3)).toBe(0.3);
  });

  it('only a declared extrude merges into the reading glyph: its world, its steps, its faces, its sizes', () => {
    const d = READING_EXTRUDE[0];
    expect(readingExtrude('popart', 'extrude', d.steps, 'Noto Serif JP', 300)).toBe(true);
    expect(readingExtrude('dark-glitch', 'extrude', d.steps, 'Noto Serif JP', 300)).toBe(false);
    expect(readingExtrude('popart', 'plate', d.steps, 'Noto Serif JP', 300)).toBe(false);
    expect(readingExtrude('popart', 'extrude', d.steps.slice(1), 'Noto Serif JP', 300)).toBe(false);
    expect(readingExtrude('popart', 'extrude', d.steps, 'Huninn', 300)).toBe(false);
    expect(readingExtrude('popart', 'extrude', d.steps, 'Noto Serif JP', 60)).toBe(false);
  });
});
