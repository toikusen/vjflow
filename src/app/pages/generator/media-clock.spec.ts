import { MediaClock } from './media-clock';

describe('MediaClock', () => {
  it('extrapolates between coarse media updates and snaps on seek', () => {
    const clock = new MediaClock(0.08);
    expect(clock.read(1, 0, true)).toBe(1);
    expect(clock.read(1, 16, true)).toBeCloseTo(1.016);
    expect(clock.read(1, 33, true)).toBeCloseTo(1.033);
    expect(clock.read(1.04, 40, true)).toBeCloseTo(1.04);
    expect(clock.read(30, 50, true)).toBe(30);
    expect(clock.read(5, 60, true)).toBe(5);
    expect(clock.read(7, 70, false)).toBe(7);
  });
});
