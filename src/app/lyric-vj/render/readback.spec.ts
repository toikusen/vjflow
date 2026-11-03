import { readBack } from './readback';

describe('readBack', () => {
  it('reads a context with no canvas to copy straight from it', () => {
    const data = new Uint8ClampedArray([1, 2, 3, 255]);
    const asked: number[][] = [];
    const ctx = { getImageData: (...a: number[]) => (asked.push(a), { data }) } as unknown as CanvasRenderingContext2D;
    expect(readBack(ctx, 4, 5, 1, 1)).toBe(data);
    expect(asked).toEqual([[4, 5, 1, 1]]);
  });
});
