import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { stubCanvas2d } from '../testdata/canvas-stub';

let sets: typeof import('./world-sets');
let objects: typeof import('./world-objects');
let restore: () => void;
afterAll(() => restore());
beforeAll(async () => {
  restore = stubCanvas2d();
  [sets, objects] = await Promise.all([import('./world-sets'), import('./world-objects')]);
});

describe('carriers (words on their own opaque object get no room cut round them)', () => {
  it('are objects some set really carries its line on', () => {
    const used = new Set(Object.values(sets.SET_SPECS).map((s) => s.object).filter(Boolean));
    for (const o of objects.CARRIERS) expect(used.has(o as never), o).toBe(true);
  });
  it('leave the approved worlds and the ones being rebuilt as they are', () => {
    for (const o of ['shikishi', 'cartouche', 'noshi', 'fold-kite', 'ink-stroke', 'lancet', 'twin-lancet', 'transom']) expect(objects.CARRIERS.has(o), o).toBe(false);
  });
});
