import { describe, expect, it } from 'vitest';
import { MOTION, MOTION_KINDS } from './motion-transition';
import { TRANSITION_KINDS, TRANSITION_MOOD, TRANSITION_SEC } from './transition';

describe('motion transitions', () => {
  const run = (kind: keyof typeof MOTION, k: number) => {
    const drawn: unknown[] = [];
    const ctx = new Proxy({} as CanvasRenderingContext2D, {
      get: (_, p) => (p === 'drawImage' ? (img: unknown) => drawn.push(img) : p.toString().startsWith('create') ? () => ({ addColorStop: () => undefined }) : () => undefined),
      set: () => true,
    });
    const a = { id: 'a' } as unknown as CanvasImageSource, b = { id: 'b' } as unknown as CanvasImageSource;
    MOTION[kind].draw({ ctx, a, b, k, w: 1920, h: 1080, seed: 3 });
    return drawn.map((x) => (x as { id: string }).id);
  };

  it('starts on the section before and lands on the new one', () => {
    for (const kind of MOTION_KINDS) {
      expect([kind, run(kind, 0).includes('a')]).toEqual([kind, true]);
      expect([kind, run(kind, 1).at(-1)]).toEqual([kind, 'b']);
    }
  });

  it('are listed with the shape reveals, each with a length and a meaning', () => {
    for (const kind of MOTION_KINDS) {
      expect(TRANSITION_KINDS).toContain(kind);
      expect(TRANSITION_SEC[kind]).toBeGreaterThan(0.2);
      expect(TRANSITION_MOOD[kind].length).toBeGreaterThan(4);
    }
  });
});
