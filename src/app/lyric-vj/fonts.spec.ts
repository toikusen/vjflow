import { describe, expect, it } from 'vitest';
import { googleFontsUrl, nearestWeight, resolveFonts } from './fonts';

describe('fonts', () => {
  it('lets the user override the director, and ignores families outside the catalog or role', () => {
    const f = resolveFonts({ script: 'Yomogi', body: 'Comic Sans' }, { display: 'Dela Gothic One', body: 'Klee One', script: 'Zen Kurenaido' });
    expect(f).toEqual({ display: 'Dela Gothic One', body: 'Klee One', script: 'Yomogi' });
    expect(resolveFonts({ display: 'Yomogi' }).display).toBe('Dela Gothic One'); // Yomogi is script only
  });

  it('maps weights to what the family has', () => {
    expect(nearestWeight('Zen Kurenaido', 900)).toBe(400);
    expect(nearestWeight('Zen Kaku Gothic New', 800)).toBe(700);
    expect(nearestWeight('Unknown', 900)).toBe(900);
  });

  it('builds one stylesheet URL with weights', () => {
    expect(googleFontsUrl()).toContain('family=Zen+Kaku+Gothic+New:wght@700;900');
    expect(googleFontsUrl()).toContain('family=Klee+One:wght@600');
    expect(googleFontsUrl()).toContain('family=Yomogi&');
  });
});
