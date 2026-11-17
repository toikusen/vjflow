import { describe, expect, it } from 'vitest';
import { EXIT_MIN, exitAfterSung, exitFloor, handsOver, lastSungChar, MIN_TAIL, mustShare, nextShowAfter, READ_FLOOR, settleExit, showByOnset, SUNG_TAIL, sungTailCheck } from './sung-tail';

describe('exitAfterSung', () => {
  it('holds a line that would leave on its last sung character until the tail has passed', () => {
    expect(exitAfterSung(22.22, 22.34)).toBeCloseTo(22.34 + SUNG_TAIL, 5);
  });
  it('leaves an exit alone that already starts after the tail', () => {
    expect(exitAfterSung(23.5, 22.34)).toBe(23.5);
  });
  it('keeps the tail even when the next line presses: the next one waits instead', () => {
    expect(exitAfterSung(22.22, 22.34)).toBeCloseTo(22.64, 5);
  });
  it('a line with no sung times keeps its exit', () => {
    expect(exitAfterSung(22.22, undefined)).toBe(22.22);
  });
});

describe('nextShowAfter', () => {
  it('leaves the next line where the exit is over before it shows', () => {
    expect(nextShowAfter(22.0, 0.28, 23.0, 0.02)).toEqual({ show: 23.0, exitDur: 0.28 });
  });
  it('shortens the exit toward the next line, down to a blink', () => {
    const r = nextShowAfter(22.64, 0.28, 22.8, 0.02);
    expect(r.exitDur).toBeCloseTo(0.14, 5);
    expect(r.show).toBeCloseTo(22.8, 5);
  });
  it('makes the next line wait when even a blink would run into it (v4 c004: いい天気 → 絞り出した)', () => {
    const r = nextShowAfter(22.64, 0.28, 22.44, 0.02);
    expect(r.exitDur).toBe(EXIT_MIN);
    expect(r.show).toBeCloseTo(22.64 + EXIT_MIN + 0.02, 5);
  });
  it('a cut exit shows the next line as the last one is gone', () => {
    expect(nextShowAfter(22.64, 0, 22.44, 0.02)).toEqual({ show: 22.66, exitDur: 0 });
  });
});

describe('the next line shows by its first sung character (Codex: 10.0 s / 10.0–10.25 s was shown at 10.4 s)', () => {
  it('invents no tail past the end of a line with no character times', () => {
    expect(exitAfterSung(9.9, 10.0, 0)).toBe(10.0);
  });
  it('caps a wait at the next line\'s sung onset: the two are up together for the exit\'s blink', () => {
    const exitAt = exitAfterSung(9.9, 10.0, 0);
    const waited = nextShowAfter(exitAt, 0.28, 10.0, 0.02);
    expect(waited.show).toBeGreaterThan(10.0);
    expect(showByOnset(waited.show, 10.0, 10.0)).toBe(10.0);
  });
  it('still waits where the onset leaves room, and never moves a show earlier than planned', () => {
    expect(showByOnset(22.74, 22.44, 23.1)).toBe(22.74);
    expect(showByOnset(22.74, 22.44, 22.6)).toBe(22.6);
    expect(showByOnset(22.74, 22.44, 22.3)).toBe(22.44);
  });
});

describe('exitFloor: a line never leaves before its last sung character has rung, nor before it can be glimpsed', () => {
  it('is past the last sung character on a timed line', () => {
    expect(exitFloor({ start: 9, end: 10.1, charStarts: [9, 9.5, 10.05] }, 8.9)).toBeCloseTo(10.05 + MIN_TAIL, 6);
  });
  it('is the reading floor after its show on a line that starts with the next (same start: A would exit at 9.9)', () => {
    expect(exitFloor({ start: 10, end: 11, charStarts: [10] }, 10)).toBeCloseTo(10 + READ_FLOOR, 6);
  });
  it('lets an untimed (LRC) line blink out over the last moment of its stated end, so back to back is a clean handover', () => {
    const f = exitFloor({ start: 8, end: 10 }, 7.9);
    expect(handsOver(f, 10, 0.02)).toBe(true);
  });
});

describe('settleExit: the next line shows by its onset; one seat shows one line; a line never leaves before its floor', () => {
  const lead = 0.02;
  it('hands over cleanly where the floor leaves room: this line gone before the next shows', () => {
    const floor = exitFloor({ start: 8, end: 10.1, charStarts: [8, 9.9] }, 7.9);
    const s = settleExit(exitAfterSung(9.9, 9.9), 0.28, 10.05, 10.2, lead, floor);
    expect(s.show).toBeCloseTo(10.2, 6);
    expect(s.exitAt).toBeGreaterThanOrEqual(floor - 1e-9);
    expect(s.exitAt + s.exitDur).toBeLessThanOrEqual(s.show - lead + 1e-9);
    expect(s).toMatchObject({ capped: true, overlap: false });
  });
  it('fast rap: A sung to 10.05, B from 10.1 — no handover leaves A its last character: they must share the frame', () => {
    const cue = { start: 9, end: 10.1, text: '快使用雙截棍', charStarts: [9, 10.05] };
    expect(mustShare(cue, { start: 10.1 })).toBe(true);
    const s = settleExit(exitAfterSung(9.9, 10.05), 0.28, 10.0, 10.1, lead, exitFloor(cue, 8.9));
    expect(s.exitAt).toBeGreaterThan(10.05);
    expect(s.overlap).toBe(true);
  });
  it('a next line sung before this one\'s floor (an unshared duet): both lit as briefly as the floor allows, flagged', () => {
    const floor = exitFloor({ start: 9, end: 10.5, charStarts: [9, 10.4] }, 8.9);
    const s = settleExit(exitAfterSung(9.9, 10.4), 0.28, 10.0, 10.1, lead, floor);
    expect(s).toMatchObject({ exitAt: floor, overlap: true });
  });
  it('is the plain wait where the onset leaves room: the tail kept, nothing capped', () => {
    const s = settleExit(22.64, 0.28, 22.44, 23.1, lead, 22.5);
    const w = nextShowAfter(22.64, 0.28, 22.44, lead);
    expect(s).toEqual({ show: w.show, exitAt: 22.64, exitDur: w.exitDur, capped: false, overlap: false });
  });
});

describe('settleExit: the last character is read for one character\'s time, never a sub-frame flash (opus review)', () => {
  it('A\'s last character 0.02 s before B\'s first cannot hand over: the two must share the frame', () => {
    const cue = { start: 123.78, end: 125.64, text: '神様、一生のお願いだ', charStarts: [123.78, 125.62] };
    expect(mustShare(cue, { start: 125.64 })).toBe(true);
    const s = settleExit(125.92, 0.28, 125.44, 125.64, 0.02, exitFloor(cue, 123.58));
    expect(s.overlap).toBe(true);
  });
  it('a line whose next comes MIN_TAIL after its last character hands over, its last character up that long', () => {
    const cue = { start: 120, end: 125.64, charStarts: [120, 125.5] };
    const s = settleExit(125.8, 0.28, 125.4, 125.5 + MIN_TAIL, 0.02, exitFloor(cue, 119.8));
    expect(s.overlap).toBe(false);
    expect(s.exitAt).toBeGreaterThanOrEqual(125.5 + MIN_TAIL - 1e-9);
  });
});

describe('a merged duet\'s character times are not in order: its last sung character is the latest', () => {
  it('exitFloor reads the latest character, not the last listed (a nested duet cut the first voice while it sang)', () => {
    const merged = { start: 10, end: 15, charStarts: [10, 11, 14.6, 15, 12, 12.5, 13] };
    expect(lastSungChar(merged.charStarts)).toBe(15);
    expect(exitFloor(merged, 9.8)).toBeCloseTo(15 + MIN_TAIL, 6);
  });
});

describe('sungTailCheck: only a real regression fails the sung-tail metric', () => {
  const cue = (tail: string, exitAt: number) => ({ id: 'c1', text: 'x', lastSung: 10, exitAt, tail });
  it('passes a line capped on purpose (its tail gave way to the next line\'s onset), with its reason kept', () => {
    expect(sungTailCheck([{ ...cue('capped', 10.12), tailWhy: "gives way to c2's sung onset" }]).ok).toBe(true);
  });
  it('fails a kept line that left inside its tail, and an overlap of two lines on one seat', () => {
    expect(sungTailCheck([cue('kept', 10.12)]).ok).toBe(false);
    expect(sungTailCheck([cue('kept', 10.4)], [], [{ id: 'c1', next: 'c2', from: 10.1, to: 10.5 }]).ok).toBe(false);
    expect(sungTailCheck([cue('kept', 10.4)]).ok).toBe(true);
  });
});
