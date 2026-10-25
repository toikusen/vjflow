import { readsDark } from './kinetic';

const under = (v: number) => ({ getImageData: () => ({ data: [v, v, v, 255] }) }) as unknown as CanvasRenderingContext2D;

describe('readsDark', () => {
  it('prints a card in the darker ink over a light picture and the lighter ink over a dark one', () => {
    expect(readsDark(under(240), '#5F7486', '#FBEFD6')).toBe(true);
    expect(readsDark(under(30), '#5F7486', '#FBEFD6')).toBe(false);
  });

  it('keeps the dark ink when the canvas gives no pixels', () => {
    const blind = { getImageData: () => { throw new Error('tainted'); } } as unknown as CanvasRenderingContext2D;
    expect(readsDark(blind, '#000000', '#FFFFFF')).toBe(true);
  });
});
