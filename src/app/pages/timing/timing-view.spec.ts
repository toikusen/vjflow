import { describe, expect, it } from 'vitest';
import { busyLock, clock, clockShort, confirmBlocker, countChips, hint, leaveGuard, lineTag, LineStatus, nextProblemIndex, playingLabel, readFlag, remaining, rowNumber, sec, SHORTCUTS, singleFlight, songPageHref, stepRow, timingChanged, visibleRows, writeFlag } from './timing-view';

describe('leaveGuard', () => {
  it('asks before leaving only while there are unsaved changes', () => {
    let dirty = false;
    const guard = leaveGuard(() => dirty);
    const event = () => { const e = { prevented: false, preventDefault() { this.prevented = true; } }; return e; };
    const clean = event(); guard(clean); expect(clean.prevented).toBe(false);
    dirty = true;
    const unsaved = event(); guard(unsaved); expect(unsaved.prevented).toBe(true);
  });
});

describe('clock', () => {
  it('splits minutes:seconds from the hundredths and keeps the width', () => {
    expect(clock(27.824)).toEqual({ main: '0:27', frac: '.82' });
    expect(clock(0)).toEqual({ main: '0:00', frac: '.00' });
    expect(clock(232.5)).toEqual({ main: '3:52', frac: '.50' });
    expect(clock(-1)).toEqual({ main: '0:00', frac: '.00' });
    expect(clockShort(232.9)).toBe('3:52');
  });
});

describe('sec / rowNumber', () => {
  it('prints three decimals without a thousands separator and two-digit row numbers', () => {
    expect(sec(27.8)).toBe('27.800');
    expect(sec(1234.5678)).toBe('1234.568');
    expect(rowNumber(0)).toBe('01');
    expect(rowNumber(11)).toBe('12');
  });
});

describe('lineTag', () => {
  it('reads the selected playing line first, then the check, then who confirmed', () => {
    expect(lineTag('red', { listening: true, verified: false })).toEqual({ icon: '●', label: '選取 · 正在聽', tone: 'now' });
    expect(lineTag('red', { listening: false, verified: false })).toEqual({ icon: '!', label: '需要你確認', tone: 'bad' });
    expect(lineTag('yellow', { listening: false, verified: false })).toEqual({ icon: '?', label: '建議確認', tone: 'warn' });
    expect(lineTag('ok', { listening: false, verified: false })).toEqual({ icon: '✓', label: '系統未發現問題', tone: 'ok' });
    expect(lineTag('ok', { listening: false, verified: true })).toEqual({ icon: '✓', label: '已人工確認', tone: 'ok' });
  });
});

describe('hint', () => {
  it('is empty for a confirmed line', () => {
    expect(hint({ start: 10 }, { issues: [], suggestedStart: 9 }, 'ok', '')).toBeNull();
  });
  it('offers what the checker heard with the distance to the sheet', () => {
    expect(hint({ start: 36.51 }, { issues: ['late'], suggestedStart: 37.61 }, 'yellow', '字幕比歌聲早')).toEqual({
      before: '系統聽到的開始時間是 ', value: 37.61, after: '，和歌詞排版差 1.1 秒', take: '改成 37.61', keep: '保留現在的',
    });
  });
  it('offers the other aligner when the checker has nothing, and a red line asks for a stronger confirmation', () => {
    expect(hint({ start: 10, altStart: 10.35 }, { issues: ['silent'] }, 'red', '這段時間沒有歌聲')).toEqual({
      before: '另一個對齊結果的開始時間是 ', value: 10.35, after: '，差 0.35 秒', take: '試 10.35', keep: '我確認沒問題',
    });
  });
  it('falls back to the reason alone', () => {
    expect(hint({ start: 10 }, undefined, 'yellow', '兩個對齊結果不一致')).toEqual({ before: '兩個對齊結果不一致', after: '', keep: '保留現在的' });
  });
});

describe('remaining / playingLabel', () => {
  it('names the worst thing left', () => {
    expect(remaining(2, 5)).toBe('還有 2 句需要你確認');
    expect(remaining(0, 3)).toBe('還有 3 句建議確認');
    expect(remaining(0, 0)).toBe('目前沒有需要確認的句子');
  });
  it('says which line is being heard and the length', () => {
    expect(playingLabel(1, true, 232)).toBe('正在聽第 2 句 · 3:52');
    expect(playingLabel(1, false, 232)).toBe('停在第 2 句 · 3:52');
    expect(playingLabel(-1, false, 232)).toBe('還沒開始 · 3:52');
  });
});

describe('SHORTCUTS', () => {
  it('lists every key the editor handles', () => {
    const keys = SHORTCUTS.map((s) => s.keys).join(' ');
    for (const k of ['Space', 'Enter', 'N', '← →', 'Shift ← →', 'Alt ← →', '↑ ↓', 'Q W', 'E D', 'L', '[ ]', '⌘ Z']) expect(keys).toContain(k);
  });
});

describe('songPageHref', () => {
  it('points at the tester song page and escapes the id', () => {
    expect(songPageHref('abc-1')).toBe('/my/song?id=abc-1');
    expect(songPageHref('a b&c')).toBe('/my/song?id=a%20b%26c');
  });
});

describe('timingChanged', () => {
  const a = { start: 1, end: 2, text: 'x' };
  const b = { start: 3, end: 4, text: 'y', singer: 'A' };
  it('sees a moved edge, a retyped line, a changed singer or a different line count; nothing else', () => {
    expect(timingChanged([a, b], [{ ...a }, { ...b }])).toBe(false);
    expect(timingChanged([a], [{ ...a, singer: undefined }])).toBe(false);
    expect(timingChanged([a, b], [a, { ...b, start: 3.05 }])).toBe(true);
    expect(timingChanged([a, b], [a, { ...b, end: 5 }])).toBe(true);
    expect(timingChanged([a, b], [a, { ...b, text: 'z' }])).toBe(true);
    expect(timingChanged([a, b], [a, { ...b, singer: 'B' }])).toBe(true);
    expect(timingChanged([a, b], [a])).toBe(true);
  });
});

describe('countChips / confirmBlocker', () => {
  it('counts what needs the person, what is suggested and what the check found clean', () => {
    expect(countChips({ red: 2, yellow: 3, ok: 7 }).map((c) => c.label)).toEqual(['2 句需要你確認', '3 句建議確認', '7 句未發現問題']);
    expect(countChips({ red: 0, yellow: 0, ok: 1 }).map((c) => c.tone)).toEqual(['bad', 'warn', 'ok']);
  });
  it('says why confirming is off, and nothing once every red line is handled', () => {
    expect(confirmBlocker(3)).toBe('還有 3 句需要你確認');
    expect(confirmBlocker(0)).toBe('');
  });
});

describe('busyLock', () => {
  const job = (kind: string, status: string, songId = 's1') => ({ songId, kind, status });
  it('locks while a concept, video or fix for this song is queued or running, naming it', () => {
    expect(busyLock([job('concept', 'running')], 's1')).toEqual({ kind: '概念', message: '概念製作中，完成後才能改時間' });
    expect(busyLock([job('make', 'queued')], 's1')).toEqual({ kind: '影片', message: '影片製作中，完成後才能改時間' });
    expect(busyLock([job('fix', 'running')], 's1')?.message).toBe('修正製作中，完成後才能改時間');
  });
  it('ignores preparation, finished jobs and other songs', () => {
    expect(busyLock([], 's1')).toBeNull();
    expect(busyLock([job('prep', 'running')], 's1')).toBeNull();
    expect(busyLock([job('make', 'done'), job('concept', 'failed'), job('fix', 'admin')], 's1')).toBeNull();
    expect(busyLock([job('make', 'running', 's2')], 's1')).toBeNull();
  });
});

describe('readFlag / writeFlag', () => {
  it('reads a stored flag and treats missing or throwing storage as unset', () => {
    expect(readFlag(() => '1')).toBe(true);
    expect(readFlag(() => null)).toBe(false);
    expect(readFlag(() => { throw new Error('SecurityError'); })).toBe(false);
  });
  it('writes when it can and swallows a refusal', () => {
    let stored = '';
    writeFlag(() => { stored = '1'; });
    expect(stored).toBe('1');
    expect(() => writeFlag(() => { throw new Error('QuotaExceededError'); })).not.toThrow();
  });
});

describe('singleFlight', () => {
  it('skips a call while the previous one is still running, then runs again', async () => {
    const done: (() => void)[] = [];
    let runs = 0;
    const poll = singleFlight(() => { runs++; return new Promise<void>((r) => done.push(r)); });
    const first = poll();
    await poll(); // a tick while the first read is in flight does nothing
    expect(runs).toBe(1);
    done[0]();
    await first;
    const second = poll();
    expect(runs).toBe(2);
    done[1]();
    await second;
  });
  it('frees the slot after a failure', async () => {
    let runs = 0;
    const poll = singleFlight(async () => { runs++; throw new Error('offline'); });
    await expect(poll()).rejects.toThrow('offline');
    await expect(poll()).rejects.toThrow('offline');
    expect(runs).toBe(2);
  });
});

describe('visibleRows', () => {
  const st: LineStatus[] = ['ok', 'red', 'ok', 'yellow', 'ok'];
  it('shows every row with the filter off', () => {
    expect(visibleRows(st, 0, false)).toEqual([true, true, true, true, true]);
  });
  it('shows only red and yellow lines plus the selected one with the filter on', () => {
    expect(visibleRows(st, 1, true)).toEqual([false, true, false, true, false]);
    expect(visibleRows(st, 4, true)).toEqual([false, true, false, true, true]);
  });
  it('shows nothing when no line is left to check (the list says so instead)', () => {
    expect(visibleRows(['ok', 'ok'], 1, true)).toEqual([false, false]);
    expect(visibleRows(['ok', 'ok'], 1, false)).toEqual([true, true]);
  });
});

describe('nextProblemIndex', () => {
  it('takes red before yellow, after the selected line, wrapping around', () => {
    expect(nextProblemIndex(['yellow', 'ok', 'red', 'ok'], 0)).toBe(2);
    expect(nextProblemIndex(['red', 'yellow', 'ok', 'ok'], 1)).toBe(0);
    expect(nextProblemIndex(['ok', 'yellow', 'ok'], 1)).toBe(1);
    expect(nextProblemIndex(['ok', 'ok'], 0)).toBeUndefined();
  });
  it('skips hidden rows', () => {
    expect(nextProblemIndex(['ok', 'red', 'yellow'], 0, [true, false, true])).toBe(2);
    expect(nextProblemIndex(['ok', 'red'], 0, [true, false])).toBeUndefined();
  });
});

describe('stepRow', () => {
  const shown = [true, false, false, true, false];
  it('moves to the nearest shown row up or down', () => {
    expect(stepRow(shown, 0, 1)).toBe(3);
    expect(stepRow(shown, 3, -1)).toBe(0);
    expect(stepRow(shown, 4, -1)).toBe(3);
  });
  it('stays put at either end', () => {
    expect(stepRow(shown, 3, 1)).toBe(3);
    expect(stepRow(shown, 0, -1)).toBe(0);
  });
});
