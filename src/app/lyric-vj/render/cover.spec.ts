import { beforeEach, describe, expect, it } from 'vitest';
import { coverOf, covers, resetCover, watchCover } from './cover';

describe('cover', () => {
  beforeEach(resetCover);

  it('covers: a big picture across the lyric, or a small one sitting on its words', () => {
    expect([covers(0.09, 0.1), covers(0.02, 0.6), covers(0.02, 0.4), covers(0.08, 0.5)]).toEqual([true, true, false, false]);
  });

  it('watchCover reports the first cover, then a share grown by another 2 % or crossing the hold line: the log holds the maximum', () => {
    const log: string[] = [];
    const w = (share: number, t: number) => watchCover('cat@3', 'cat', share, 0.9, t, 'shot 3', (l) => log.push(l));
    expect(w(0.09, 1)).toMatch(/cat hides 9% of the lyric box \(90% of it inside\) at 1.0 s \(shot 3\)/);
    expect(w(0.1, 1.1)).toBeUndefined();
    expect(w(0.12, 1.2)).toMatch(/hides 12%/);
    expect(w(0.6, 2)).toMatch(/hides 60%/);
    expect(w(0.6, 2.1)).toBeUndefined();
    expect(log).toHaveLength(3);
    // 39 % then 40.5 %: under a 2 % step, but over the hold line, so it is on record as over it
    const h = (share: number) => watchCover('dog@1', 'dog', share, 0.9, 5, 'cut 5.0', (l) => log.push(l));
    expect(h(0.39)).toMatch(/hides 39%/);
    expect(h(0.405)).toMatch(/hides 41%/);
    // another place of the same picture is its own record; a share under the thresholds is never a line
    expect(watchCover('cat@4', 'cat', 0.09, 0.9, 3, 'cut 10.0', (l) => log.push(l))).toMatch(/cut 10.0/);
    expect(watchCover('cat@4', 'cat', 0.01, 0.1, 3, 'cut 10.0', (l) => log.push(l))).toBeUndefined();
  });

  it('coverOf measures the picture\'s opaque cells inside the box through the draw transform', () => {
    // without a canvas the mask counts the whole picture as opaque: a 100×100 draw at (0,0) wholly inside a 200×100 box
    const img = { width: 10, height: 10 } as unknown as CanvasImageSource & { width: number; height: number };
    const m = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 } as DOMMatrix;
    const [share, inside] = coverOf(img, m, 0, 0, 100, 100, { x0: 0, y0: 0, x1: 200, y1: 100 });
    expect(share).toBeCloseTo(0.5, 2);
    expect(inside).toBeCloseTo(1, 2);
    // shifted half out of the box by the transform
    const [share2, inside2] = coverOf(img, { ...m, e: 150 } as DOMMatrix, 0, 0, 100, 100, { x0: 0, y0: 0, x1: 200, y1: 100 });
    expect(share2).toBeCloseTo(0.25, 2);
    expect(inside2).toBeCloseTo(0.5, 2);
  });
});
