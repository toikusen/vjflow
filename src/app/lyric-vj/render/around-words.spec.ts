import { describe, expect, it } from 'vitest';
import { aroundWords, WorldEnv } from './world-grounds';

/** A context that records what is drawn on it. */
function recorder() {
  const calls: string[] = [];
  const m = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 } as DOMMatrix;
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (_, k: string) => (k === 'getTransform' ? () => m : (...args: unknown[]) => void calls.push(`${k}${k === 'clip' ? `(${args[0]})` : ''}`)),
    set: () => true,
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}
const envOf = (ctx: CanvasRenderingContext2D): WorldEnv => ({ ctx, age: 1, now: 40, seed: 1, paper: '#f4e2c0', ink: '#203040', slots: {} as WorldEnv['slots'], rect: { x0: 600, y0: 400, x1: 1300, y1: 640 }, weight: 1, pulse: 0, level: 0.5 });

describe('a set piece round the words being read', () => {
  it('is cut round them, never papered over with a flat plate', () => {
    const { ctx, calls } = recorder();
    let drawn = 0;
    aroundWords(envOf(ctx), 0.55, () => { drawn++; });
    expect(drawn).toBe(1);
    expect(calls).toContain('clip(evenodd)');
    expect(calls.filter((c) => c === 'fillRect')).toEqual([]);
  });
  it('is drawn whole when it asks for no clearing or no line is up', () => {
    for (const [strength, rect] of [[0, { x0: 600, y0: 400, x1: 1300, y1: 640 }], [0.55, undefined]] as const) {
      const { ctx, calls } = recorder();
      let drawn = 0;
      aroundWords({ ...envOf(ctx), rect }, strength, () => { drawn++; });
      expect(drawn).toBe(1);
      expect(calls).not.toContain('clip(evenodd)');
    }
  });
});
