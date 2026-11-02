import { describe, expect, it } from 'vitest';
import { freeJob } from './free-plan';
import { placeLines, parseLyrics } from './free-lyrics';
import { songFromLines } from './free-song';
import { canUndo, isDone, linesOf, restartAt, rewindAfterUndo, rewindFor, startTap, tapLine, timedCount, undoTap } from './free-tap';

const lines = (n: number) => Array.from({ length: n }, (_, i) => ({ text: `這是第${i + 1}句歌詞` }));

describe('tap state', () => {
  it('stamps one line a tap and moves on', () => {
    let s = startTap(lines(3));
    s = tapLine(s, 5);
    s = tapLine(s, 9.5);
    expect(s.at).toBe(2);
    expect(s.starts).toEqual([5, 9.5, undefined]);
    expect(timedCount(s)).toBe(2);
    expect(isDone(tapLine(s, 12))).toBe(true);
  });

  it('ignores a tap past the last line', () => {
    const s = tapLine(startTap(lines(1)), 5);
    expect(tapLine(s, 9)).toBe(s);
  });

  it('never lets a line land before the one above', () => {
    const s = tapLine(tapLine(startTap(lines(2)), 5), 3);
    expect(s.starts[1]).toBeCloseTo(5.15);
    expect(tapLine(startTap(lines(1)), -0.2).starts[0]).toBe(0);
  });

  it('undoes taps one at a time, back to nothing', () => {
    let s = tapLine(tapLine(startTap(lines(3)), 5), 9);
    s = undoTap(s);
    expect(s.at).toBe(1);
    expect(s.starts).toEqual([5, undefined, undefined]);
    s = undoTap(s);
    expect(s.at).toBe(0);
    expect(canUndo(s)).toBe(false);
    expect(undoTap(s)).toBe(s);
  });

  it('restarts from a line keeping every earlier one', () => {
    let s = startTap(lines(4));
    for (const t of [5, 9, 13, 17]) s = tapLine(s, t);
    s = restartAt(s, 2);
    expect(s.at).toBe(2);
    expect(s.starts).toEqual([5, 9, 13, 17]);
    s = tapLine(s, 14);
    expect(s.starts).toEqual([5, 9, 14, 17]);
    expect(s.at).toBe(3);
  });

  it('clears later old times a new tap has passed, and undo brings them back', () => {
    let s = startTap(lines(3));
    for (const t of [5, 9, 13]) s = tapLine(s, t);
    s = tapLine(restartAt(s, 1), 14);
    expect(s.starts).toEqual([5, 14, undefined]);
    expect(undoTap(s).starts).toEqual([5, 9, 13]);
  });

  it('undoes a restart too', () => {
    const s = tapLine(startTap(lines(3)), 5);
    expect(undoTap(restartAt(s, 0)).at).toBe(1);
  });

  it('opens on the first line without a time, and keeps what LRC gave', () => {
    expect(startTap([{ text: '甲', start: 1 }, { text: '乙' }]).at).toBe(1);
    expect(startTap([{ text: '甲', start: 1 }]).at).toBe(0);
    expect(linesOf(startTap([{ text: '甲', start: 1 }, { text: '乙' }]))).toEqual([{ text: '甲', start: 1 }, { text: '乙', start: undefined }]);
  });

  it('rewinds to before the line, never before the song', () => {
    const s = tapLine(tapLine(startTap(lines(3)), 5), 20);
    expect(rewindFor(s, 1)).toBe(17);
    expect(rewindFor(s, 2)).toBe(17);
    expect(rewindFor(startTap(lines(2)), 0)).toBe(0);
    expect(rewindAfterUndo(2)).toBe(0);
  });
});

describe('tapped lines on the composer', () => {
  const plan = (starts: (number | undefined)[], duration: number) => {
    const placed = placeLines(starts.map((start, i) => ({ text: `這是第${i + 1}句比較長的歌詞內容`, start })), duration)!;
    return songFromLines(placed, { title: 'x', bpm: 120, duration, exact: true });
  };

  it('takes a normal tapped song', () => {
    const song = plan(Array.from({ length: 12 }, (_, i) => 8 + i * 4), 70);
    expect(song.duration).toBe(70);
    expect(freeJob(song).job.treatment.cues.length).toBe(12);
  });

  it('takes lines tapped far too fast for reading, in order and with none lost', () => {
    const song = plan([5, 5.2, 5.4, 5.6, 5.8, 20, 20.1, 20.2], 40);
    const { job } = freeJob(song);
    expect(job.treatment.cues.length).toBe(8);
    expect(song.cues.every((c, i) => c.end > c.start && (i === 0 || c.start > song.cues[i - 1].start))).toBe(true);
  });

  it('takes a half-tapped song', () => {
    expect(freeJob(plan([6, 10, undefined, undefined, undefined], 30)).job.treatment.cues.length).toBe(5);
  });

  it('takes a one-line song and a very short one', () => {
    expect(freeJob(plan([1], 10)).job.treatment.cues.length).toBe(1);
    expect(freeJob(plan([0, 3, 6, 9], 10)).job.treatment.cues.length).toBe(4);
  });

  it('takes a very long song', () => {
    expect(freeJob(plan(Array.from({ length: 300 }, (_, i) => 5 + i * 2.9), 880)).job.treatment.cues.length).toBe(300);
  });

  it('takes LRC stamped to the last moment of the audio', () => {
    const { lines: got } = parseLyrics('[00:01.00]第一句歌詞的內容\n[00:09.80]最後一句歌詞的內容');
    expect(freeJob(songFromLines(got, { title: 'x', bpm: 120, duration: 10, exact: true })).job.treatment.cues.length).toBe(2);
  });
});
