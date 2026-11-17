import { describe, expect, it } from 'vitest';
import { beatOfLine, BEAT_MIN_LINE, blowOf, BLOW_MAX, HoldPlan, REPOSE_CALM_LINE } from './lineplan-core';
import { blowPose, stressInk } from './render/world-layout';
import { SET_SPECS } from './render/world-sets';
import { contrast } from './contrast';
import type { Glyph } from './render/glyphs';
import { freeJob, freeMoments, FREE_MOMENTS_MAX } from './free-plan';
import { CAM_EDGE, camReach, worldCam } from './render/world-cam';
import { FREE_STYLES } from './free-styles';
import { wordBreaks } from './phrases';
import type { SongTimeline } from './timeline';
import { STYLE_WORLDS } from './style-worlds';
import { sharedOf, WORLD_SHARED } from './world-shared';
import { beatProgress, ROLL_LEAST, WORLD_BEATS } from './render/world-beats';
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
    const b = beatOfLine(c, ['ink-run', 'echo'], halfBeats, [], '', 0) as HoldPlan;
    expect(b.kind).toBeDefined();
    expect(b.at).toBeGreaterThan(c.start + 0.5);
    expect(b.at + WORLD_BEATS[b.kind].sec).toBeLessThanOrEqual(c.end - 0.12 + 1e-6);
    expect(halfBeats).toContain(b.at);
  });
  it('gives a line too short to hold none, and says why', () => {
    expect(beatOfLine(cue(10, 10 + BEAT_MIN_LINE - 0.1), ['ink-run'], halfBeats, [], '', 0)).toEqual({ skip: 'under 0.6 s' });
  });
  it('makes a beat that dims or turns characters wait for the reading', () => {
    const c = cue(10, 14.5);
    const b = beatOfLine(c, ['roll'], halfBeats, [], '', 0) as HoldPlan;
    expect(b.at).toBeGreaterThanOrEqual(c.start + readingSec(c.text, c.start, c.end) - 1e-6);
  });
  it('keeps clear of a change of set and of the line before', () => {
    const c = cue(10, 14);
    const b = beatOfLine(c, ['ink-run', 'echo'], halfBeats, [{ at: 12 }], 'ink-run', 0) as HoldPlan;
    expect(b.kind).toBe('echo');
    expect(Math.abs(b.at - 12)).toBeGreaterThanOrEqual(0.35);
  });
  it('runs a stepped world in steps and nothing outside the event', () => {
    expect(beatProgress(1, 0.6, 0.9, false)).toBeUndefined();
    expect(beatProgress(1, 0.6, 1.6, false)).toBeUndefined();
    expect(beatProgress(1, 0.6, 1.25, true)! * 6 % 1).toBe(0);
  });
  it('never dims a character below half', () => {
    for (let q = 0; q <= 1; q += 0.05) for (let i = 0; i < 8; i++) expect(WORLD_BEATS.flicker.glyph!({ q, i, n: 8, u: i / 7, v: 0, seed: 3, age: 2, sung: 1, span: 0 }).tone!).toBeGreaterThanOrEqual(0.55);
  });
  it('turns a long calm line\'s ground at a sung word break, under words on their own carrier (ukiyoe), the set kept', () => {
    const text = '無盡的思念總是破碎在冬天';
    const n = [...text].length;
    const cues = Array.from({ length: 12 }, (_, i) => ({ id: `c${i + 1}`, start: 4 + i * 5, end: 4 + i * 5 + 4.6, text, charStarts: Array.from({ length: n }, (_, k) => 4 + i * 5 + (4.2 * k) / n) }));
    const end = 4 + 12 * 5 + 2;
    const song = { title: 'calm', duration: end, tempo: 70, beats: Array.from({ length: Math.ceil(end / 0.857) }, (_, i) => i * 0.857), downbeats: [], sections: [{ start: 0, end, type: 'verse', energy: 0.3 }], energy: [], energyFps: 1, cues, audio: { mix: '' } } as unknown as SongTimeline;
    const { treatment, plan, calm } = freeJob(song, { style: FREE_STYLES.find((s) => s.id === 'ukiyoe')!, seed: 0 });
    expect(calm).toBe(true);
    expect(treatment.cues.filter((c) => (c as { world?: { repose?: unknown[] } }).world?.repose?.length)).toEqual([]);
    const breaks = [...wordBreaks(text)];
    const turns = (plan as unknown as { shots: { cuts: { at?: number; repose?: boolean }[] }[] }).shots.flatMap((s) => s.cuts.filter((x) => x.repose));
    expect(turns.length).toBeGreaterThan(6);
    for (const t of turns) {
      const cue = cues.find((x) => t.at! > x.start && t.at! < x.end)!;
      expect(cue.end - cue.start).toBeGreaterThanOrEqual(REPOSE_CALM_LINE);
      // the ground turns on a sung word break, or on the song beat nearest it (within 0.3 s)
      const near = breaks.filter((k) => k > 0 && k < n).map((k) => Math.abs(cue.charStarts[k] - t.at!));
      expect(Math.min(...near), `${t.at} lands at a word break`).toBeLessThanOrEqual(0.3 + 1e-6);
    }
  });

  it('a long calm line keeps its one set; its ground does not turn under words standing on it', () => {
    const text = '無盡的思念總是破碎在冬天';
    const n = [...text].length;
    const cues = Array.from({ length: 12 }, (_, i) => ({ id: `c${i + 1}`, start: 4 + i * 5, end: 4 + i * 5 + 4.6, text, charStarts: Array.from({ length: n }, (_, k) => 4 + i * 5 + (4.2 * k) / n) }));
    const end = 4 + 12 * 5 + 2;
    const song = { title: 'calm', duration: end, tempo: 70, beats: Array.from({ length: Math.ceil(end / 0.857) }, (_, i) => i * 0.857), downbeats: [], sections: [{ start: 0, end, type: 'verse', energy: 0.3 }], energy: [], energyFps: 1, cues, audio: { mix: '' } } as unknown as SongTimeline;
    const { treatment, plan, calm } = freeJob(song, { style: FREE_STYLES.find((s) => s.id === 'silk-cold')!, seed: 0 });
    expect(calm).toBe(true);
    // no change of set while a line is sung (owner 2026-11-10): one set from the first sung character to the end
    expect(treatment.cues.filter((c) => (c as { world?: { repose?: unknown[] } }).world?.repose?.length)).toEqual([]);
    // silk-cold's words stand on the ground: what a new ground draws under them the plan cannot read, so no turn
    // (render/turn-rule.ts; it was the calm line's word-break cut, 2026-11-04, before the review of 2026-11-10)
    const turns = (plan as unknown as { shots: { cuts: { at?: number; repose?: boolean }[] }[] }).shots.flatMap((s) => s.cuts.filter((x) => x.repose));
    expect(turns).toEqual([]);
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
  it('keeps the spaces between the words round the key (Latin lead-in, Tokyo Drift c071)', () => {
    const text = 'ab cd XY';
    const gs = [...text].map((char, i) => ({ char, advance: 100, src: i }) as unknown as Glyph);
    const p = blowPose(gs, 6, 8, 120, 100, SET_SPECS[Object.keys(SET_SPECS)[0]])!;
    const size = p.sizes![0] * 100;
    // b to c: one letter plus one space apart, not one letter
    expect(p.x[3] - p.x[1]).toBeGreaterThan(1.9 * size);
    expect(p.shown[2]).toBe(false);
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
  it('takes each world line through four or more ways in and moving ways out, a rule handed on', () => {
    const texts = ['我走過那條路', '風吹過你的臉不再回頭', '天亮了我還在等', '那些話留給了潮汐'];
    const cues = Array.from({ length: 24 }, (_, i) => ({ id: `c${i + 1}`, start: 4 + i * 2.6, end: 4 + i * 2.6 + 2.5, text: texts[i % 4] }));
    const end = 4 + 24 * 2.6 + 2;
    const song = { title: 'pool', duration: end, tempo: 120, beats: Array.from({ length: Math.ceil(end * 2) }, (_, i) => i * 0.5), downbeats: [], sections: [{ start: 0, end, type: 'verse', energy: 0.7 }], energy: [], energyFps: 1, cues, audio: { mix: '' } } as unknown as SongTimeline;
    for (const id of ['spy', 'terminal', 'ukiyoe', 'silk-cold']) {
      const { treatment } = freeJob(song, { style: FREE_STYLES.find((s) => s.id === id)!, seed: 0 });
      const lines = treatment.cues.map((c) => (c as { world?: { enter: string; exit: string } }).world).filter((w): w is { enter: string; exit: string } => !!w);
      expect(new Set(lines.map((w) => w.enter)).size, id).toBeGreaterThanOrEqual(4);
      expect(lines.some((w) => w.exit === 'squash-line') && lines.some((w) => w.exit === 'slice-out'), id).toBe(true);
      lines.forEach((w, i) => { if (w.enter === 'line-open') expect(lines[i - 1].exit).toBe('squash-line'); });
    }
  });
  it('opens a moment to the free tier only where the reading judged it, on a chorus downbeat, two at most', () => {
    const cue = (id: string, start: number, text: string) => ({ id, start, end: start + 2, text, charStarts: [...text].map((_, k) => start + k * 0.25) });
    const cues = [cue('c1', 10, '把招牌踢開'), cue('c2', 50, '把門踢開了'), cue('c3', 90, '一腳踢開它'), cue('c4', 130, '我們踢開吧')];
    const at = (c: (typeof cues)[number]) => c.charStarts[[...c.text].indexOf('踢')];
    const song = { title: 't', duration: 160, tempo: 120, beats: [], downbeats: cues.map(at), sections: [{ start: 0, end: 40, type: 'verse' }, { start: 40, end: 160, type: 'chorus' }], cues } as unknown as SongTimeline;
    const asks = cues.map((c) => ({ cues: [c.id], form: 'strike', variant: 'tear', word: c.text.includes('踢開') ? '踢開' : '踢', why: '' }));
    const meaning = { palette: 'tea', ground: 'grain', reading: '', parts: [], keys: [], moments: asks };
    const got = freeMoments(song, meaning);
    expect(got.length).toBeLessThanOrEqual(FREE_MOMENTS_MAX);
    expect(got.every((m) => m.cues[0] !== 'c1')).toBe(true);
    expect(freeMoments(song, { ...meaning, moments: [] })).toEqual([]);
    expect(freeMoments({ ...song, downbeats: cues.map((c) => at(c) + 1) } as never, meaning)).toEqual([]);
  });
  it('moves the frame on a world camera into a part, then lands', () => {
    for (const kind of ['push-through', 'diagonal']) {
      expect(worldCam(kind, 0, 1)!.s).toBeGreaterThan(1.2);
      expect(worldCam(kind, 5, 1)).toBeUndefined();
    }
    // the diagonal never shows the frame's edge: its scale covers its offset
    const d = worldCam('diagonal', 0, 1)!;
    expect(((d.s - 1) * 1920) / 2).toBeGreaterThanOrEqual(Math.abs(d.dx));
    expect(((d.s - 1) * 1080) / 2).toBeGreaterThanOrEqual(Math.abs(d.dy));
  });
  it('never carries the line out of the frame nor sets it smaller than it rests', () => {
    // gothic-lolita nun 65.2 s: a two-row line on a card right of centre, cut off at the right edge at 1.9×
    const wide = { x0: 1010, y0: 330, x1: 1700, y1: 740 };
    const small = { x0: 860, y0: 480, x1: 1060, y1: 600 };
    for (const kind of ['push-through', 'diagonal', 'iso-slide'])
      for (const dir of [1, -1])
        for (const room of [wide, small])
          for (let age = 0; age < 0.6; age += 0.02) {
            const m = worldCam(kind, age, dir, room);
            if (!m) continue;
            expect(m.s).toBeGreaterThanOrEqual(1);
            const [c, sn] = [Math.cos(-m.r), Math.sin(-m.r)];
            for (const [x, y] of [[room.x0, room.y0], [room.x1, room.y1], [room.x0, room.y1], [room.x1, room.y0]]) {
              const [px, py] = [(x - 960) * m.s, (y - 540) * m.s];
              const [qx, qy] = [960 + m.dx + px * c - py * sn, 540 - m.dy + px * sn + py * c];
              expect(qx).toBeGreaterThanOrEqual(CAM_EDGE - 0.5);
              expect(qx).toBeLessThanOrEqual(1920 - CAM_EDGE + 0.5);
              expect(qy).toBeGreaterThanOrEqual(CAM_EDGE - 0.5);
              expect(qy).toBeLessThanOrEqual(1080 - CAM_EDGE + 0.5);
            }
          }
    // a small line in the middle keeps the whole move; a wide one keeps part of it, still a move
    expect(camReach('push-through', 1, small)).toBe(1);
    expect(camReach('push-through', 1, wide)).toBeGreaterThan(0.05);
    expect(camReach('push-through', 1, wide)).toBeLessThan(1);
    expect(camReach('push-through', 1)).toBe(1);
  });
  it('never turns a rolling character edge-on', () => {
    for (let q = 0; q <= 1; q += 0.02) for (let u = 0; u <= 1; u += 0.25) expect(WORLD_BEATS.roll.glyph!({ q, i: 0, n: 5, u, v: 0, seed: 1, age: 2, sung: 1, span: 0 }).sy ?? 1).toBeGreaterThanOrEqual(ROLL_LEAST);
  });
});
