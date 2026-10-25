import { describe, expect, it } from 'vitest';
import { lineOrder, lineStage, LINE_DRAW_SEC, LINE_STAGES } from './print';

describe('line art from a cut-out', () => {
  // a 20×20 picture: an opaque white square 6..13 with a black bar inside it at rows 9..10
  const w = 20, h = 20;
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 6; y < 14; y++)
    for (let x = 6; x < 14; x++) d.set(y === 9 || y === 10 ? [0, 0, 0, 255] : [255, 255, 255, 255], (y * w + x) * 4);

  it('draws the silhouette edge and the strong folds inside, nothing outside or on flat areas', () => {
    const o = lineOrder(d, w, h);
    expect(o[6 * w + 9]).toBeGreaterThan(0); // the top edge
    expect(o[8 * w + 9]).toBeGreaterThan(0); // the bar's edge inside
    expect(o[3 * w + 3]).toBe(0); // outside
    expect(o[12 * w + 9]).toBe(0); // the flat white inside
  });

  it('draws top to bottom and is whole by its draw time', () => {
    const o = lineOrder(d, w, h);
    expect(o[6 * w + 9]).toBeLessThan(o[13 * w + 9] + 0.25);
    expect(lineStage(0)).toBe(0);
    expect(lineStage(LINE_DRAW_SEC)).toBe(LINE_STAGES - 1);
  });
});
