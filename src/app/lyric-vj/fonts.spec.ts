import { describe, expect, it } from 'vitest';
import { googleFontsUrl, nearestWeight, readingLatin, resolveFonts } from './fonts';

describe('fonts', () => {
  it('uses one family for the whole video', () => {
    expect(resolveFonts()).toEqual({ display: 'Zen Kaku Gothic New', body: 'Zen Kaku Gothic New', script: 'Zen Kaku Gothic New' });
    expect(resolveFonts({ family: 'Klee One' })).toEqual({ display: 'Klee One', body: 'Klee One', script: 'Klee One' });
    expect(resolveFonts({ family: 'Comic Sans' }).body).toBe('Zen Kaku Gothic New');
  });

  it('keeps valid per-role overrides', () => {
    expect(resolveFonts({ display: 'Mochiy Pop One', script: 'Yomogi' })).toEqual({ display: 'Mochiy Pop One', body: 'Zen Kaku Gothic New', script: 'Yomogi' });
    // one family everywhere, even a display-only one
    expect(resolveFonts({ family: 'Mochiy Pop One' }).body).toBe('Mochiy Pop One');
    expect(resolveFonts({ display: 'Yomogi' }).display).toBe('Zen Kaku Gothic New'); // Yomogi is not a display face
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

describe('readingLatin', () => {
  it('swaps decorative scripts for a clean sans on English lyric lines', () => {
    expect(readingLatin('Great Vibes')).toBe('Montserrat');
    expect(readingLatin('Cormorant Garamond')).toBe('Cormorant Garamond');
  });
});
