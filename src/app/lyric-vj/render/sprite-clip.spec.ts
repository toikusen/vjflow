import { clipFrame } from './sprite-clip';

describe('clipFrame', () => {
  const c = { count: 36, fps: 12, start: 10, loop: false };
  it('starts at frame 0 when the clock starts and holds the first frame before it', () => {
    expect(clipFrame(c, 9)).toBe(0);
    expect(clipFrame(c, 10)).toBe(0);
    expect(clipFrame(c, 10.5)).toBe(6);
  });
  it('runs on through cuts drawn under it: the frame depends on song time, not on the cut', () => {
    expect(clipFrame(c, 11)).toBe(12);
    expect(clipFrame(c, 12.999)).toBe(35);
  });
  it('holds its last frame after the end, or loops', () => {
    expect(clipFrame(c, 20)).toBe(35);
    expect(clipFrame({ ...c, loop: true }, 13)).toBe(0);
    expect(clipFrame({ ...c, loop: true }, 13.25)).toBe(3);
  });
  it('an empty clip is frame 0', () => {
    expect(clipFrame({ ...c, count: 0 }, 12)).toBe(0);
  });
});
