import { describe, expect, it } from 'vitest';
import { barsAt, barSplit, beatNear, circleLayout, crackPath, dripOf, easeOut, fallAt, feelOf, flutterAt, flyDrift, forceOf, freezeSpan, hashOf, hitSide, jolt, joltAt, riseAt, rng, sliceShift, strikeAngle, SWING, swingPoses, tickAt, waveAt } from './signature-motion';

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

describe('a line\'s feel', () => {
  it('lands a smash harder than a kick, a kick harder than a rip, a rip harder than a wipe', () => {
    expect(forceOf('碎')).toBeGreaterThan(forceOf('踢'));
    expect(forceOf('踢')).toBeGreaterThan(forceOf('撕'));
    expect(forceOf('撕')).toBeGreaterThan(forceOf('消えて'));
  });
  it('reads a rapped line as quick and a held one as slow', () => {
    expect(feelOf('踢', [0, 0.1, 0.2, 0.3, 0.4]).pace).toBe(1);
    expect(feelOf('踢', [0, 1, 2, 3]).pace).toBe(0);
    expect(feelOf('踢', [0, 1, 2, 3]).length).toBe(4);
  });
  it('a kick keeps the approved crack; a rip leans and a smash breaks rougher', () => {
    expect(crackPath(300, 200, 7, 1, 0)).toEqual(crackPath(300, 200, 7));
    const lean = crackPath(300, 200, 7, 1, 120);
    expect(lean.at(-1)![0] - lean[0][0]).toBeGreaterThan(60);
    expect(crackPath(300, 200, 7, 1.15).length).toBeGreaterThanOrEqual(crackPath(300, 200, 7, 0.6).length);
  });
});

describe('the new forms\' motion', () => {
  it('a snowflake sways down and settles on its time; rain drops on a quick line fall shorter', () => {
    expect(flutterAt(9, 10, 260, 0).dy).toBeCloseTo(-260, 3);
    expect(flutterAt(9.6, 10, 260, 0).dy).toBeCloseTo(-260 * (1 - easeOut(0.5 / 0.9)), 3);
    expect(Math.abs(flutterAt(9.6, 10, 260, 0).dx)).toBeGreaterThan(1);
    expect(flutterAt(10, 10, 260, 0).dy).toBe(0);
    expect(Math.abs(flutterAt(12, 10, 260, 0).dx)).toBeLessThan(0.1);
    expect(fallAt(2.75, 3, 160, 0.28).falling).toBe(true);
    expect(fallAt(2.7, 3, 160, 0.28).falling).toBe(false);
  });
  it('lays a line along the top of a circle, no wider than the arc, smaller when long', () => {
    const short = circleLayout(6);
    expect(short.angles[0] + short.angles[5]).toBeCloseTo(-Math.PI, 6);
    const long = circleLayout(22);
    expect(long.size).toBeLessThan(short.size);
    expect(long.r).toBeLessThanOrEqual(430);
  });
  it('takes a long line round both rims, the lower one reading left to right', () => {
    const two = circleLayout(9, 8);
    expect(two.under).toEqual([...Array(9).fill(false), ...Array(8).fill(true)]);
    expect(Math.cos(two.angles[9])).toBeLessThan(0);
    expect(Math.cos(two.angles[16])).toBeGreaterThan(0);
    expect(two.size).toBeGreaterThan(circleLayout(17).size);
  });
  it('a clock ticks only on beats it has reached', () => {
    expect(tickAt(10, 9, [9.5, 10.5])).toBeGreaterThan(0);
    expect(tickAt(9.4, 9, [9.5, 10.5])).toBe(0);
  });
  it('a risen character pops and sways, never before its time', () => {
    expect(riseAt(4, 5, 0, 40, 10)).toEqual({ dy: 0, dx: 0, scale: 1 });
    expect(riseAt(5, 5, 0, 40, 10).scale).toBeCloseTo(1.15, 6);
    expect(riseAt(7, 5, 0, 40, 10).dy).toBeLessThan(0);
  });
  it('melts most strokes a little and a few long, more for a harder verb', () => {
    expect(dripOf(0, 0.5, 100, 0.5)).toBe(0);
    expect(dripOf(2, 0.95, 100, 0.5)).toBeGreaterThan(dripOf(2, 0.3, 100, 0.5) * 3);
    expect(dripOf(0.5, 0.5, 100, 1)).toBeGreaterThan(dripOf(0.5, 0.5, 100, 0.3));
  });
  it('slides a slice further for a harder cut and holds it', () => {
    expect(sliceShift(-0.1, 1)).toBe(0);
    expect(sliceShift(1, 1)).toBeGreaterThan(sliceShift(1, 0.3));
    expect(sliceShift(1, 1)).toBeGreaterThan(20);
  });
  it('a throw winds up before the verb and lurches after; a let-go only drifts', () => {
    expect(flyDrift(-0.05, true, 0, 5).dx).toBeLessThan(0);
    expect(flyDrift(-0.05, false, 0, 5).dx).toBe(0);
    expect(flyDrift(0.3, true, 0, 5).dx).toBeGreaterThan(100);
    expect(Math.abs(flyDrift(0.3, false, 0, 5).dx)).toBeLessThan(20);
  });
  it('holds the frame a beat at least, through the line, 2.5 s at most', () => {
    expect(freezeSpan(10, 10.2, [10.5, 11])).toEqual([10, 10.5]);
    expect(freezeSpan(10, 11.5, [10.5])[1]).toBeCloseTo(11.8, 6);
    expect(freezeSpan(10, 20, [])).toEqual([10, 12.5]);
  });
  it('reads the beat from the song\'s beats', () => {
    expect(beatNear([0, 0.5, 1, 1.5, 2], 1)).toBeCloseTo(0.5, 6);
    expect(beatNear([], 1)).toBe(0.5);
    expect(hashOf('雪')).toBe(hashOf('雪'));
  });
});
