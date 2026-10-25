import { describe, expect, it } from 'vitest';
import { LOOPS, QUIET_LOOPS } from './kinetic-loops';
import type { Env } from './kinetic-more';

// no canvas here: every 2D call is a no-op, and the words a move prints are recorded
const env = (age: number, printed: string[]): Env => ({
  ctx: new Proxy({} as CanvasRenderingContext2D, { get: () => () => undefined, set: () => true }),
  age, k: 1, pulse: 0, since: 0, bpm: 100, ink: '#111111', paper: '#eeeeee', accent: '#dd3322',
  word: (i) => ['回憶', '夜市', '墾丁', '海邊'][i % 4], txt: (s) => { printed.push(s); }, cx: 960, seed: 3, W: 1920, H: 1080, style: 0, song: 42, mood: 0.4, count: 3,
});

describe('the third set of moves', () => {
  it('draws every move from its first frame to long after, in any song', () => {
    for (const [name, move] of Object.entries(LOOPS))
      for (const age of [0, 0.2, 0.7, 1.5, 4, 12]) expect(() => move.draw(env(age, [])), `${name} at ${age}`).not.toThrow();
  });

  it('openers and devices print the cut\'s words once they have landed; quiet loops print none', () => {
    for (const [name, move] of Object.entries(LOOPS)) {
      const printed: string[] = [];
      move.draw(env(4, printed));
      if (QUIET_LOOPS.includes(name)) expect(printed, name).toEqual([]);
      else expect(printed.length, name).toBeGreaterThan(0);
    }
  });
});

describe('loop names', () => {
  it('never reuse a core move name (a clash replaced the old move)', async () => {
    const { CORE_FX } = await import('./kinetic');
    const { LOOPS } = await import('./kinetic-loops');
    expect(Object.keys(LOOPS).filter((k) => (CORE_FX as readonly string[]).includes(k))).toEqual([]);
  });
});
