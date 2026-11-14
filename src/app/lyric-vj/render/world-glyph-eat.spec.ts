import { describe, expect, it } from 'vitest';
import { eat, EAT_MOST } from './world-glyph';

/** A w × h alpha-only canvas context: fillRect under destination-out clears, image data round-trips. */
const fake = (w: number, h: number, ink: (x: number, y: number) => boolean) => {
  let a = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (ink(x, y)) a[(y * w + x) * 4 + 3] = 255;
  const g = {
    save() {}, restore() {}, globalCompositeOperation: 'source-over',
    getImageData: () => ({ data: new Uint8ClampedArray(a) }),
    putImageData: (img: { data: Uint8ClampedArray }) => void (a = new Uint8ClampedArray(img.data)),
    fillRect(x0: number, y0: number, fw: number, fh: number) {
      for (let y = Math.max(0, Math.floor(y0)); y < Math.min(h, Math.ceil(y0 + fh)); y++) for (let x = Math.max(0, Math.floor(x0)); x < Math.min(w, Math.ceil(x0 + fw)); x++) a[(y * w + x) * 4 + 3] = 0;
    },
  };
  return { g: g as unknown as CanvasRenderingContext2D, ink: () => { let n = 0; for (let i = 3; i < a.length; i += 4) n += a[i]; return n; } };
};

describe('static eats a character, never all of it', () => {
  it('a full character loses a little; a thin mark the bands would take most of is kept whole', () => {
    const full = fake(100, 100, () => true);
    const before = full.ink();
    eat(full.g, 100, 100, 100, 3);
    expect(full.ink()).toBeLessThan(before);
    expect(full.ink()).toBeGreaterThanOrEqual(before * (1 - EAT_MOST));
    // ︕: a 2 px stroke the bands cross: whole
    for (let seed = 0; seed < 20; seed++) {
      const thin = fake(100, 100, (x, y) => x >= 49 && x < 51 && y >= 10 && y < 14);
      const b = thin.ink();
      eat(thin.g, 100, 100, 100, seed);
      expect(thin.ink()).toBeGreaterThanOrEqual(b * (1 - EAT_MOST));
      expect(thin.ink()).toBeGreaterThan(0);
    }
  });
});
