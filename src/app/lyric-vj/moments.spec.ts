import { describe, expect, it } from 'vitest';
import { fxAt, levelAt, validateMoments } from './moments';
import { SongTimeline } from './timeline';

const song: SongTimeline = {
  title: 't', duration: 60, tempo: 120, beats: [], downbeats: [20, 22, 24, 40], energy: [], energyFps: 10, sections: [],
  cues: [{ id: 'c001', start: 30.4, end: 33, text: 'x', timingSource: 'lrclib', confidence: 'verified' }],
  audio: { mix: 'm' },
};
const win = { start: 0, end: 60 };

describe('validateMoments', () => {
  it('snaps to downbeats, clamps lengths and drops a drop that shares a beat with the finale', () => {
    const r = validateMoments(
      [
        { kind: 'drop', at: 20.2 },
        { kind: 'build', at: 20, dur: 20 },
        { kind: 'finale', at: 40.1 },
        { kind: 'drop', at: 40 },
        { kind: 'nope' as never, at: 5 },
      ],
      [{ start: 20, level: 7 }],
      song,
      win,
    );
    expect(r.moments.map((m) => [m.kind, m.at, m.dur])).toEqual([['build', 20, 8], ['drop', 20, undefined], ['finale', 40, undefined]]);
    expect(r.errors.join()).toMatch(/nope/);
    expect(r.arc).toEqual([{ start: 0, level: 3 }, { start: 20, level: 3 }]);
  });
});

describe('fxAt', () => {
  const moments = validateMoments(
    [{ kind: 'build', at: 20, dur: 4 }, { kind: 'drop', at: 20 }, { kind: 'break', at: 30, dur: 8 }, { kind: 'build', at: 40, dur: 4 }, { kind: 'hold', at: 40, dur: 0.6 }, { kind: 'finale', at: 40 }],
    [{ start: 0, level: 1 }, { start: 20, level: 2 }, { start: 30, level: 0 }, { start: 40, level: 3 }],
    song,
    win,
  );
  const fx = (t: number) => fxAt(t, moments.moments, moments.arc);

  it('builds up before the drop and hits on it', () => {
    expect(fx(17).zoom).toBeGreaterThan(fx(16.5).zoom);
    expect(fx(20.05).rays).toBeGreaterThan(0.4);
    expect(fx(20.05).exposure).toBeGreaterThan(fx(19).exposure);
    expect(fx(20.6).zoom).toBeGreaterThan(1.03); // still visibly punched in half a second later
    expect(fx(26).rays).toBeLessThan(0.05);
  });

  it('stays within the caps: exposure ≤ +80 %, zoom ≤ 14 %', () => {
    for (let t = 15; t < 45; t += 0.02) {
      expect(fx(t).exposure).toBeLessThanOrEqual(1.8);
      expect(fx(t).zoom).toBeLessThanOrEqual(1.14);
    }
  });

  it('goes quiet in the break and dark in the hold, then the finale is the biggest hit', () => {
    expect(fx(33).saturation).toBeLessThan(fx(25).saturation);
    expect(fx(39.7).black).toBeGreaterThan(0.8);
    expect(fx(40.02).black).toBe(0);
    expect(fx(40.05).bloom).toBeGreaterThan(fx(20.05).bloom);
  });

  it('keeps the mote clock moving forward', () => {
    for (let t = 15; t < 45; t += 0.1) expect(t + fx(t).moteTime).toBeGreaterThan(t - 0.1 + fx(t - 0.1).moteTime - 1e-9);
  });

  it('jumps the arc level on a drop, eases it elsewhere', () => {
    expect(levelAt(moments.arc, moments.moments, 19.9)).toBeCloseTo(1);
    expect(levelAt(moments.arc, moments.moments, 20.2)).toBeCloseTo(2);
    expect(levelAt(moments.arc, moments.moments, 29.8)).toBeGreaterThan(0.5);
  });
});
