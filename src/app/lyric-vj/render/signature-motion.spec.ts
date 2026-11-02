import { describe, expect, it } from 'vitest';
import { barsAt, barSplit, crackPath, fallAt, hitSide, jolt, joltAt, rng, strikeAngle, SWING, swingPoses, waveAt } from './signature-motion';

describe('strikeAngle', () => {
  it('winds back from the entrance, snaps up on the sung verb and recoils after', () => {
    expect(strikeAngle(0, 1, 3)).toBe(0);
    expect(strikeAngle(2, 1, 3)).toBeGreaterThan(5);
    expect(strikeAngle(3, 1, 3)).toBeCloseTo(-25, 0);
    expect(strikeAngle(4.5, 1, 3)).toBeGreaterThan(-16);
    expect(strikeAngle(4.5, 1, 3)).toBeLessThan(-10);
  });
});

describe('swingPoses and barsAt', () => {
  const hits = [10, 10.3, 10.6, 10.9];
  it('lands each hit on one bar, up then down, the bars taking turns', () => {
    const poses = swingPoses(hits, 1);
    expect(poses[0]).toEqual([9.88, 0, 0]);
    // a landed bar recoils off the hit a little while it holds there
    const near = (x: number, want: number) => { expect(Math.sign(x)).toBe(Math.sign(want)); expect(Math.abs(x)).toBeGreaterThan(0.6 * SWING); };
    near(barsAt(poses, 10.0).left, SWING);
    near(barsAt(poses, 10.3).left, -SWING);
    near(barsAt(poses, 10.6).right, -SWING);
    near(barsAt(poses, 10.9).right, SWING);
    expect(Math.abs(barsAt(poses, 10.6).left)).toBeLessThan(0.2 * SWING);
    expect(barsAt(poses, 12)).toEqual({ left: 0, right: 0 });
  });
  it('swings the other way on the second pass and says where each tip landed', () => {
    expect(barsAt(swingPoses(hits, -1), 10.0).left).toBeLessThan(-0.8 * SWING);
    expect(hitSide(0, 1)).toEqual({ left: true, top: true });
    expect(hitSide(2, 1)).toEqual({ left: false, top: true });
    expect(hitSide(0, -1)).toEqual({ left: true, top: false });
  });
  it('rests with no hits', () => {
    expect(swingPoses([], 1)).toEqual([]);
    expect(barsAt([], 5)).toEqual({ left: 0, right: 0 });
  });
});

describe('barSplit', () => {
  it('keeps the named thing whole on one bar, the bars as even as can be', () => {
    expect(barSplit([...'快使用雙截棍'], 3, 3)).toBe(3);
    expect(barSplit([...'這條鏈子很長'], 2, 1)).toBe(3);
    expect(barSplit([...'鏈子'], 0, 1)).toBe(1);
  });
});

describe('joltAt and fall', () => {
  it('shakes the frame only after a hit and settles within a second', () => {
    const j = [jolt(5, 1)];
    expect(joltAt(j, 4.9)).toEqual({ dx: 0, dy: 0, rot: 0, zoom: 1 });
    expect(Math.abs(joltAt(j, 5.01).dx)).toBeGreaterThan(10);
    expect(Math.abs(joltAt(j, 5.8).dx)).toBeLessThan(0.01);
  });
  it('a character waits above, drops before its time and lands on it', () => {
    expect(fallAt(1, 3, 300)).toEqual({ dy: -300, squash: 1, falling: false });
    expect(fallAt(2.8, 3, 300).falling).toBe(true);
    expect(fallAt(3, 3, 300).dy).toBeCloseTo(0, 3);
    expect(fallAt(3.05, 3, 300).squash).toBeLessThan(1);
  });
  it('the wave travels and the crack and paper are the same every frame', () => {
    expect(waveAt(0, 0, 50, 900, 2).dy).toBeCloseTo(0, 6);
    expect(waveAt(0, 0.5, 50, 900, 2).dy).toBeCloseTo(-50, 6);
    expect(crackPath(300, 200, 7)).toEqual(crackPath(300, 200, 7));
    expect(crackPath(300, 200, 7)[0][1]).toBe(200);
    expect(rng(3)()).toBe(rng(3)());
  });
});
