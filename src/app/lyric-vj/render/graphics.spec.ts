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
