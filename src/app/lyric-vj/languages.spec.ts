import { describe, expect, it } from 'vitest';
import { FONTS } from './fonts';
import { LANGUAGES } from './languages';
import { TEMPLATES } from './templates';

describe('design languages', () => {
  it('use only catalog fonts and real templates, and each says how to draw it', () => {
    const fonts = new Set(FONTS.map((f) => f.family));
    for (const [id, l] of Object.entries(LANGUAGES)) {
      expect(l.fonts.filter((f) => !fonts.has(f)), id).toEqual([]);
      expect(l.templates.filter((t) => !(t in TEMPLATES)), id).toEqual([]);
      expect(l.craft.length, id).toBeGreaterThan(200);
    }
  });
});
