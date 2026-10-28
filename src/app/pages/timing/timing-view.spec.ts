import { describe, expect, it } from 'vitest';
import { clock, clockShort, hint, lineTag, playingLabel, remaining, rowNumber, sec, SHORTCUTS } from './timing-view';

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
    expect(lineTag('red', { listening: true, verified: false })).toEqual({ icon: '●', label: '選中 · 正在聽', tone: 'now' });
    expect(lineTag('red', { listening: false, verified: false })).toEqual({ icon: '!', label: '必須修正', tone: 'bad' });
    expect(lineTag('yellow', { listening: false, verified: false })).toEqual({ icon: '?', label: '建議確認', tone: 'warn' });
    expect(lineTag('ok', { listening: false, verified: false })).toEqual({ icon: '✓', label: '已確認', tone: 'ok' });
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
    expect(remaining(2, 5)).toBe('還有 2 句必須修正');
    expect(remaining(0, 3)).toBe('還有 3 句建議確認');
    expect(remaining(0, 0)).toBe('每一句都確認好了');
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
