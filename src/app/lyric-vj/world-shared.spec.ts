import { describe, expect, it } from 'vitest';
import { beatOfLine, BEAT_MIN_LINE, blowOf, BLOW_MAX, REPOSE_CALM_LINE } from './lineplan-core';
import { blowPose, stressInk } from './render/world-layout';
import { SET_SPECS } from './render/world-sets';
import { contrast } from './contrast';
import type { Glyph } from './render/glyphs';
import { freeJob } from './free-plan';
import { FREE_STYLES } from './free-styles';
import { wordBreaks } from './phrases';
import type { SongTimeline } from './timeline';
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
  it('splits a long calm line at a word break into a second set', () => {
    const text = '無盡的思念總是破碎在冬天';
    const n = [...text].length;
    const cues = Array.from({ length: 12 }, (_, i) => ({ id: `c${i + 1}`, start: 4 + i * 5, end: 4 + i * 5 + 4.6, text, charStarts: Array.from({ length: n }, (_, k) => 4 + i * 5 + (4.2 * k) / n) }));
    const end = 4 + 12 * 5 + 2;
    const song = { title: 'calm', duration: end, tempo: 70, beats: Array.from({ length: Math.ceil(end / 0.857) }, (_, i) => i * 0.857), downbeats: [], sections: [{ start: 0, end, type: 'verse', energy: 0.3 }], energy: [], energyFps: 1, cues, audio: { mix: '' } } as unknown as SongTimeline;
    const { treatment, calm } = freeJob(song, { style: FREE_STYLES.find((s) => s.id === 'silk-cold')!, seed: 0 });
    expect(calm).toBe(true);
    const breaks = [...wordBreaks(text)];
    const split = treatment.cues.filter((c) => (c as { world?: { repose?: { at: number }[] } }).world?.repose?.length);
    expect(split.length).toBeGreaterThan(6);
    for (const c of split) {
      const cue = cues.find((x) => x.id === c.cueId)!;
      expect(cue.end - cue.start).toBeGreaterThanOrEqual(REPOSE_CALM_LINE);
      for (const r of (c as unknown as { world: { repose: { at: number }[] } }).world.repose) {
        // on the break, or on the song beat nearest it (within 0.3 s)
        const near = breaks.filter((k) => k > 0 && k < n).map((k) => Math.abs(cue.charStarts[k] - r.at));
        expect(Math.min(...near), `${r.at} lands at a word break`).toBeLessThanOrEqual(0.3 + 1e-6);
      }
    }
  });
  it('blows up a whole short word of the line, the named one first', () => {
    const word = (t: string, named?: string) => { const b = blowOf({ id: 'x', start: 0, end: 3, text: t }, named); return b && [...t].slice(b.from, b.to).join(''); };
    expect(word('習武之人切記 "仁者無敵"')).toBe('仁者無敵');
    expect(word('三年後的大雪', '大雪')).toBe('大雪');
    expect(word('三年後的大雪')!.length).toBeLessThanOrEqual(BLOW_MAX);
    expect(word('雪', undefined)).toBeUndefined();
    expect(blowOf({ id: 'x', start: 0, end: 1, text: '三年後的大雪' })).toBeUndefined();
  });
  it('sets the key word at least 1.6 times the line, inside the frame, the rest small and in reading order', () => {
    const text = '三年後的今天';
    const gs = [...text].map((char, i) => ({ char, advance: 100, src: i }) as unknown as Glyph);
    const p = blowPose(gs, 4, 6, 120, 100, SET_SPECS[Object.keys(SET_SPECS)[0]])!;
    const size = (i: number) => p.sizes![i] * 100;
    expect(size(4)).toBeGreaterThanOrEqual(120 * 1.6);
    expect(size(0)).toBeLessThan(size(4));
    expect(size(0)).toBeGreaterThanOrEqual(40);
    expect(p.block.w).toBeLessThanOrEqual(0.9 * 1920);
    expect(p.y[0]).toBeGreaterThan(p.y[4]);
    expect(p.x[1]).toBeGreaterThan(p.x[0]);
  });
  it('draws a stress only in an ink the words read on and the ground shows', () => {
    const slots = { ground: '#F2EEE4', ink: '#1A1A1A', ink2: '#C8462E', accent: '#2A6FB0', plate: '#FFFFFF', plateInk: '#111111', faint: '#E8E4DA' };
    for (const kind of ['extrude', 'plate', 'outline'] as const) {
      const c = stressInk(kind, slots.ink, slots.ground, slots as never, slots.accent);
      if (!c) continue;
      expect(contrast(c, slots.ground)).toBeGreaterThanOrEqual(1.4);
      if (kind !== 'outline') expect(contrast(slots.ink, c)).toBeGreaterThanOrEqual(3);
    }
  });
});
