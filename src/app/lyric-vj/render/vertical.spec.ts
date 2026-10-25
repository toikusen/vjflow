import { beforeAll, describe, expect, it } from 'vitest';
import type { CueRuntime } from './runtime';

// no canvas here: every 2D call is a no-op and every character measures 30 px
beforeAll(() => {
  const metrics = { width: 30, actualBoundingBoxAscent: 30, actualBoundingBoxDescent: 6, actualBoundingBoxLeft: 0, actualBoundingBoxRight: 30 };
  const stub = new Proxy({} as CanvasRenderingContext2D, {
    get: (_, k) => (k === 'measureText' ? () => metrics : k === 'getImageData' ? (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }) : () => ({ addColorStop: () => undefined })),
    set: () => true,
  });
  HTMLCanvasElement.prototype.getContext = (() => stub) as never;
});

const rt = (text: string, exit = 'fade') =>
  ({
    cue: { text, start: 1, end: 3 }, style: { enter: 'cut', exit, reveal: 'line', idle: 'still' }, params: { position: 'center', step: 0, lift: 0 },
    palette: { background: '#000000', text: '#ffffff', accent: '#ff3366' }, fonts: { body: 'x', display: 'x', script: 'x' },
    showFrom: 1, exitAt: 3, exitDur: 0.8, accentTimes: [], pace: 1,
  }) as unknown as CueRuntime;

const glyphsOf = async (text: string, exit?: string) => {
  const { vertical } = await import('./vertical');
  const l = vertical.cue(rt(text, exit));
  return { l, gs: l.group.children as unknown as { position: { x: number; y: number }; rotation: { z: number }; userData: Record<string, unknown> }[] };
};

describe('vertical text', () => {
  it('keeps a line with English words in its side column rather than across the middle', async () => {
    const { vertical } = await import('./vertical');
    const l = vertical.cue({ ...rt('大家看到我都對我喊yes sir 因為我是公認最屌的rapper'), params: { position: 'right', step: 0, lift: 0 } } as unknown as CueRuntime);
    l.update(2.9, { flash: 0, hit: 0, shake: 0 });
    const xs = (l.group.children as unknown as { position: { x: number } }[]).map((g) => g.position.x).filter((x) => x !== 0);
    expect(Math.min(...xs)).toBeGreaterThan(0);
  });

  it('sets a two-digit number upright side by side in one cell (tate-chu-yoko)', async () => {
    const { l, gs } = await glyphsOf('10月');
    l.update(2, { flash: 0, hit: 0, shake: 0 });
    const [one, zero, month] = gs;
    expect(one.position.y).toBeCloseTo(zero.position.y);
    expect(zero.position.x).toBeGreaterThan(one.position.x);
    expect([one.rotation.z, zero.rotation.z]).toEqual([0, 0]);
    expect(month.position.y).toBeLessThan(one.position.y - 50);
  });

  it('turns three digits and long marks sideways, and nudges small kana up and right', async () => {
    const { l, gs } = await glyphsOf('123ーきっと');
    l.update(2, { flash: 0, hit: 0, shake: 0 });
    expect(gs.slice(0, 4).every((g) => Math.abs(g.rotation.z + Math.PI / 2) < 1e-9)).toBe(true);
    const [ki, small] = gs.slice(4, 6);
    expect(small.position.x).toBeGreaterThan(ki.position.x);
  });

  it('keeps the motion\'s turn on top of a glyph\'s own (a domino falls in a column too)', async () => {
    const { l, gs } = await glyphsOf('あい', 'domino');
    l.update(3.79, { flash: 0, hit: 0, shake: 0 });
    expect(Math.abs(gs[0].rotation.z)).toBeGreaterThan(1);
  });

  it('drops a column in from above and melts it downward (y is up)', async () => {
    const { vertical } = await import('./vertical');
    const at = (enter: string, exit: string, t: number) => {
      const l = vertical.cue({ ...rt('あい', exit), style: { enter, exit, reveal: 'line', idle: 'still' } } as unknown as CueRuntime);
      l.update(t, { flash: 0, hit: 0, shake: 0 });
      return (l.group.children[0] as unknown as { position: { y: number } }).position.y;
    };
    const rest = at('cut', 'fade', 2);
    expect(at('drop', 'fade', 1.05)).toBeGreaterThan(rest + 100);
    expect(at('cut', 'melt', 3.6)).toBeLessThan(rest - 20);
  });
});
