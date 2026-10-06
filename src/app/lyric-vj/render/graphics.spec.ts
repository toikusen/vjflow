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
