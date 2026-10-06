import { describe, expect, it } from 'vitest';
import { drawLook, GraphicsLook, sectionAt } from './graphics';

const look: GraphicsLook = {
  sections: [
    { start: 0, layers: [{ kind: 'fill', color: '#000000' }] },
    { start: 30, layers: [{ kind: 'sunburst', color: '#ff0000' }, { kind: 'shapes', type: 'star', color: '#ffffff' }], text: '#111111' },
  ],
};

describe('graphics look', () => {
  it('picks the section by time', () => {
    expect(sectionAt(look, 10).layers[0].kind).toBe('fill');
    expect(sectionAt(look, 31).text).toBe('#111111');
  });

  it('draws every layer kind without throwing (canvas stubbed)', () => {
    const calls: string[] = [];
    const ctx = new Proxy({} as CanvasRenderingContext2D, {
      get: (_, k) => (k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : (...args: unknown[]) => calls.push(String(k)) && args && undefined),
      set: () => true,
    });
    drawLook(ctx, look, 35, { since: 0.1, pulse: 0.5, index: 3 }, () => undefined);
    expect(calls).toContain('fill');
  });
});

describe('avoid', () => {
  it('slides a photo inset off the lyrics, shrinking it when the side is too narrow', async () => {
    const { avoid, layerRect } = await import('./graphics');
    const lyrics = { x0: 500, y0: 400, x1: 1420, y1: 680 };
    const photo = { kind: 'photo' as const, mode: 'inset' as const, x: 0, y: 0, w: 0.3, h: 0.3 };
    const moved = avoid(photo, lyrics);
    const r = layerRect(moved)!;
    expect(r.x1 <= 476 || r.x0 >= 1444 || r.y1 <= 376 || r.y0 >= 704).toBe(true);
    const free = { kind: 'blob' as const, x: 0.8, y: 0.8, r: 0.1, color: '#fff' };
    expect(avoid(free, lyrics)).toBe(free);
  });
});

describe('code layer', () => {
  const stub = (calls: string[]) =>
    new Proxy({} as CanvasRenderingContext2D, { get: (_, k) => (...args: unknown[]) => calls.push(String(k)) && args && undefined, set: () => true });

  it('runs the director\'s drawing with the frame state, and a broken one draws nothing instead of throwing', async () => {
    const { avoidAll } = await import('./graphics');
    const seen: unknown[] = [];
    (globalThis as Record<string, unknown>)['__seen'] = seen;
    const ok = { kind: 'code' as const, src: 'globalThis.__seen.push([f.t, f.beat.index, f.lyric]); ctx.fillRect(0, 0, f.w, f.h);' };
    const lyrics = { x0: 1, y0: 2, x1: 3, y1: 4 };
    const calls: string[] = [];
    drawLook(stub(calls), { sections: [{ start: 0, layers: [ok] }] }, 5, { since: 0, pulse: 1, index: 9 }, () => undefined, (ls) => avoidAll(ls, lyrics));
    expect(seen).toEqual([[5, 9, lyrics]]);
    expect(calls).toContain('fillRect');
    const broken = { sections: [{ start: 0, layers: [{ kind: 'code' as const, src: 'nope(' }, { kind: 'code' as const, src: 'missing()' }] }] };
    expect(() => drawLook(stub([]), broken, 1, { since: 0, pulse: 0, index: 0 }, () => undefined)).not.toThrow();
  });
});
