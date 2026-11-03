import { describe, expect, it } from 'vitest';
import { cleanText, decodeLyricFile, draftLines, fitToAudio, formatLines, MAX_LINES, parseLyrics, placeLines, stamp } from './free-lyrics';

const enc = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;

describe('parseLyrics', () => {
  it('takes plain text as lines with no times', () => {
    const { lines } = parseLyrics('第一句\n\n第二句\r\n  第三句  ');
    expect(lines).toEqual([{ text: '第一句' }, { text: '第二句' }, { text: '第三句' }]);
  });

  it('reads stamps in every usual shape', () => {
    const { lines } = parseLyrics('[00:12.50]甲\n[0:18]乙\n[01:02:25]丙\n[1:03.5]丁\n[01:04.123] 戊');
    expect(lines.map((l) => l.start)).toEqual([12.5, 18, 62.25, 63.5, 64.123]);
    expect(lines[4].text).toBe('戊');
  });

  it('reads tags, applies the offset, and leaves tags out of the lines', () => {
    const got = parseLyrics('[ti:歌名]\n[ar:歌手]\n[offset:+500]\n[00:10.00]甲\n[00:00.20]乙');
    expect(got.title).toBe('歌名');
    expect(got.artist).toBe('歌手');
    expect(got.lines.map((l) => [l.text, l.start])).toEqual([['乙', 0], ['甲', 9.5]]);
  });

  it('keeps an unstamped line after the line it followed, however the stamps sort', () => {
    const { lines } = parseLyrics('前奏說明\n[00:20.00]乙\n乙之後\n[00:10.00]甲\n甲之後');
    expect(lines.map((l) => l.text)).toEqual(['前奏說明', '甲', '甲之後', '乙', '乙之後']);
  });

  it('sings a line stamped twice at both moments', () => {
    const { lines } = parseLyrics('[00:30.00][01:10.25]副歌\n[00:40.00]主歌');
    expect(lines.map((l) => [l.text, l.start])).toEqual([['副歌', 30], ['主歌', 40], ['副歌', 70.25]]);
  });

  it('keeps the first of two lines at one moment (original and translation) and counts the other', () => {
    const got = parseLyrics('[00:05.00]原文\n[00:05.00]譯文\n[00:09.00]下一句');
    expect(got.lines.map((l) => l.text)).toEqual(['原文', '下一句']);
    expect(got.skipped).toBe(1);
  });

  it('takes an empty stamp as the end of the line above', () => {
    const { lines } = parseLyrics('[00:05.00]甲\n[00:08.00]\n[00:30.00]乙');
    expect(lines).toEqual([{ text: '甲', start: 5, end: 8 }, { text: '乙', start: 30 }]);
  });

  it('drops section labels and word stamps, keeps brackets inside a line', () => {
    const got = parseLyrics('[Chorus]\n[00:01.00]<00:01.00>你<00:01.50>好\n我[愛]你');
    expect(got.lines.map((l) => l.text)).toEqual(['你好', '我[愛]你']);
    expect(got.skipped).toBe(1);
  });

  it('names the line and shows the stamp it cannot read', () => {
    expect(() => parseLyrics('[00:01.00]甲\n[00:75.00]乙')).toThrow(/第 2 行.*\[00:75\.00\]/);
    expect(() => parseLyrics('[1:2:3:4]甲')).toThrow(/第 1 行/);
    expect(() => parseLyrics('[12:3x]甲')).toThrow(/第 1 行/);
  });

  it('refuses what cannot be one song', () => {
    expect(() => parseLyrics('x'.repeat(40001))).toThrow('太長');
    expect(() => parseLyrics('字'.repeat(201))).toThrow('第 1 行太長');
    expect(() => parseLyrics(Array.from({ length: MAX_LINES + 1 }, (_, i) => `第${i}句`).join('\n'))).toThrow('太多行');
  });

  it('removes controls and direction overrides from text', () => {
    expect(parseLyrics('好\u0007聽‮的歌').lines[0].text).toBe('好聽的歌');
    expect(cleanText('a﻿b')).toBe('ab');
  });
});

describe('formatLines', () => {
  it('comes back the same through parseLyrics', () => {
    const lines = [{ text: '前' }, { text: '甲', start: 5 }, { text: '中' }, { text: '乙', start: 9.5, end: 12 }, { text: '丙', start: 60 }];
    expect(parseLyrics(formatLines(lines)).lines).toEqual(lines);
  });
  it('carries seconds into minutes when rounding', () => {
    expect(stamp(59.996)).toBe('[01:00.00]');
  });
});

describe('placeLines', () => {
  it('says so when nothing has a time', () => {
    expect(placeLines([{ text: '甲' }, { text: '乙' }])).toBeUndefined();
  });

  it('puts unstamped lines between neighbours by length, and marks them', () => {
    const got = placeLines([{ text: '甲甲甲甲甲甲甲甲甲甲', start: 10 }, { text: '乙乙乙乙乙乙乙乙乙乙' }, { text: '丙丙丙丙丙丙丙丙丙丙', start: 16 }])!;
    expect(got[1].start).toBeCloseTo(13);
    expect(got.map((l) => l.placed)).toEqual([false, true, false]);
  });

  it('keeps starts rising with lines before the first stamp and after the last', () => {
    const got = placeLines([{ text: '一' }, { text: '二' }, { text: '三', start: 2 }, { text: '四' }, { text: '五' }], 5)!;
    const s = got.map((l) => l.start!);
    expect(s.every((v, i) => i === 0 || v > s[i - 1])).toBe(true);
    expect(s[0]).toBe(0);
    expect(s[4]).toBeLessThan(5);
  });
});

describe('fitToAudio', () => {
  it('leaves out lines past the end and counts them', () => {
    const got = fitToAudio([{ text: '甲', start: 10 }, { text: '乙', start: 19.95 }, { text: '丙', start: 40 }], 20);
    expect(got.kept.map((l) => l.text)).toEqual(['甲']);
    expect(got.dropped).toBe(2);
  });
});

describe('decodeLyricFile', () => {
  it('reads UTF-8 and UTF-16', () => {
    expect(decodeLyricFile(enc('[00:01.00]甲'))).toContain('甲');
    expect(decodeLyricFile(Uint8Array.from([0xff, 0xfe, 0x32, 0x75]).buffer)).toBe('甲'.replace('甲', '甲'[0]) && '甲');
  });
  it('explains anything else', () => {
    expect(() => decodeLyricFile(Uint8Array.from([0xa5, 0xd2, 0xff, 0x00, 0xc0]).buffer)).toThrow('UTF-8');
    expect(() => decodeLyricFile(new ArrayBuffer(1e6 + 1))).toThrow('太大');
  });
});

describe('draftLines', () => {
  const lines = [{ text: '一二三' }, { text: '一二三四五六七八九十一二三四五六' }, { text: '一二三' }];
  it('times every line, in order, longer lines longer', () => {
    const d = draftLines(lines, 120).map((l) => l.start!);
    expect(d[0]).toBeGreaterThan(0);
    expect(d[2] - d[1]).toBeGreaterThan(d[1] - d[0]);
  });
  it('keeps a line on whole beats of the assumed tempo', () => {
    const [a, b] = draftLines(lines, 120).map((l) => l.start!);
    expect(((b - a) / 0.5) % 1).toBeCloseTo(0);
  });
  it('fits the lines inside a known length', () => {
    const many = Array.from({ length: 80 }, () => ({ text: '一二三四五六七八' }));
    expect(draftLines(many, 100, 30).at(-1)!.start!).toBeLessThan(30);
  });
});

describe('songLrc', () => {
  it('writes each line at its start, a break where a line stops before the next', async () => {
    const { songLrc, parseLyrics } = await import('./free-lyrics');
    const lrc = songLrc({ title: 'X', cues: [{ text: '一', start: 1, end: 2.9 }, { text: '二', start: 3, end: 4 }, { text: '三', start: 20.5, end: 22 }] });
    expect(lrc.split('\n')[0]).toBe('[ti:X]');
    expect(lrc).toContain('[00:01.00]一');
    expect(lrc).toContain('[00:04.00]\n[00:20.50]三');
    expect(parseLyrics(lrc).lines.filter((l) => l.text).map((l) => [l.text, l.start])).toEqual([['一', 1], ['二', 3], ['三', 20.5]]);
  });
  it('for a part, keeps the lines sung in it, timed from its start', async () => {
    const { songLrc } = await import('./free-lyrics');
    const lrc = songLrc({ title: 'X', cues: [{ text: '一', start: 1, end: 2.9 }, { text: '二', start: 3, end: 4 }, { text: '三', start: 20.5, end: 22 }] }, 2.5, 10);
    expect(lrc).not.toContain('三');
    expect(lrc).toContain('[00:00.00]一');
    expect(lrc).toContain('[00:00.50]二');
  });
});

describe('a heading line', () => {
  it('names the song and is never a sung line; section tags and spoken lines read as before', async () => {
    const { parseLyrics } = await import('./free-lyrics');
    const r = parseLyrics('# エラー！えらいこっちゃ！\n\n[Intro - 8-bit game startup]\n[Spoken, playful female voice]\n「システム起動っ！」\n[Verse 1]\n朝からアラーム　鳴りっぱなし\n「再起動！」（まだだよ！）\n[End]');
    expect(r.title).toBe('エラー！えらいこっちゃ！');
    expect(r.lines.map((l) => l.text)).toEqual(['「システム起動っ！」', '朝からアラーム　鳴りっぱなし', '「再起動！」（まだだよ！）']);
    expect(parseLyrics('[ti:LRC title]\n# heading\nline').title).toBe('LRC title');
    expect(parseLyrics('#hashtag line').lines.map((l) => l.text)).toEqual(['#hashtag line']);
  });
});
