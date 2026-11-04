import { describe, expect, it } from 'vitest';
import { beatOfLine, BEAT_MIN_LINE } from './lineplan-core';
import { STYLE_WORLDS } from './style-worlds';
import { sharedOf, WORLD_SHARED } from './world-shared';
import { beatProgress, WORLD_BEATS } from './render/world-beats';
import { readingSec } from './render/reading-window';

const cue = (start: number, end: number, text = '我再也不在你身邊') => ({ id: 'c1', start, end, text });
const halfBeats = Array.from({ length: 400 }, (_, i) => i * 0.5);

describe('shared world moves', () => {
  it('give every world its own two or three held beats and two stresses', () => {
    for (const w of STYLE_WORLDS) {
      const s = sharedOf(w);
      expect(s.beats.length, w.id).toBeGreaterThanOrEqual(2);
      expect(s.beats.length, w.id).toBeLessThanOrEqual(3);
      expect(s.stress.length, w.id).toBe(2);
      expect(WORLD_SHARED[w.id], `${w.id} has a row of its own`).toBeDefined();
    }
  });
  it('places a held beat in the held stretch of a long line, on a beat', () => {
    const c = cue(10, 14);
    const b = beatOfLine(c, ['ink-run', 'echo'], halfBeats, [], '', 0)!;
    expect(b).toBeDefined();
    expect(b.at).toBeGreaterThan(c.start + 0.5);
    expect(b.at + WORLD_BEATS[b.kind].sec).toBeLessThanOrEqual(c.end + 0.1 + 1e-6);
    expect(halfBeats).toContain(b.at);
  });
  it('gives a short line none', () => {
    expect(beatOfLine(cue(10, 10 + BEAT_MIN_LINE - 0.1), ['ink-run'], halfBeats, [], '', 0)).toBeUndefined();
  });
  it('makes a beat that dims or turns characters wait for the reading', () => {
    const c = cue(10, 14.5);
    const b = beatOfLine(c, ['roll'], halfBeats, [], '', 0)!;
    expect(b.at).toBeGreaterThanOrEqual(c.start + readingSec(c.text, c.start, c.end) - 1e-6);
  });
  it('keeps clear of a change of set and of the line before', () => {
    const c = cue(10, 14);
    const b = beatOfLine(c, ['ink-run', 'echo'], halfBeats, [{ at: 12 }], 'ink-run', 0)!;
    expect(b.kind).toBe('echo');
    expect(Math.abs(b.at - 12)).toBeGreaterThanOrEqual(0.35);
  });
  it('runs a stepped world in steps and nothing outside the event', () => {
    expect(beatProgress(1, 0.6, 0.9, false)).toBeUndefined();
    expect(beatProgress(1, 0.6, 1.6, false)).toBeUndefined();
    expect(beatProgress(1, 0.6, 1.25, true)! * 6 % 1).toBe(0);
  });
  it('never dims a character below half', () => {
    for (let q = 0; q <= 1; q += 0.05) for (let i = 0; i < 8; i++) expect(WORLD_BEATS.flicker.glyph!({ q, i, n: 8, u: i / 7, v: 0, seed: 3, age: 2, sung: 1 }).tone!).toBeGreaterThanOrEqual(0.55);
  });
});
