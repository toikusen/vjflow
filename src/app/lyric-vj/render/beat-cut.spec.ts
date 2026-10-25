import { describe, expect, it } from 'vitest';
import { balancedRows } from '../phrases';
import { cutPieces, planCut, timedPieces, wrapRows } from './beat-cut';

describe('cutPieces', () => {
  it('cuts a line into sung pieces of two or more characters, with their positions', () => {
    const p = cutPieces('今が一番若いの 第六感、六感またがって');
    expect(p.length).toBeGreaterThanOrEqual(2);
    expect(p.length).toBeLessThanOrEqual(6);
    expect(p.every((x) => [...x.text].length >= 2)).toBe(true);
    expect(p[0].from).toBe(0);
    expect(p.map((x) => x.text).join('').replace(/\s/g, '')).toBe('今が一番若いの第六感、六感またがって');
  });

  it('splits long phrases so no big piece is longer than 6 characters', () => {
    const p = cutPieces('今日は年甲斐ないことしたいの');
    expect(p.every((x) => [...x.text].length <= 6)).toBe(true);
    expect(p.map((x) => x.text).join('')).toBe('今日は年甲斐ないことしたいの');
  });

  it('never cuts inside a kanji run', () => {
    const p = cutPieces('今が一番若いの 第六感、六感またがって');
    expect(p.map((x) => x.text.trim())).toContain('またがって');
    const kanji = /\p{Script=Han}/u;
    const joined = p.map((x) => x.text);
    for (let i = 1; i < joined.length; i++) expect(kanji.test(joined[i - 1].trim().slice(-1)) && kanji.test(joined[i].trim()[0])).toBe(false);
  });
});

describe('timedPieces', () => {
  it('cuts each piece in when it is sung and merges pieces too short to read', () => {
    const pieces = [{ text: '今が', from: 0 }, { text: '一番', from: 2 }, { text: '若いの', from: 4 }];
    const starts = [10, 10.2, 10.3, 10.5, 11.5, 11.7, 11.9];
    const p = timedPieces(pieces, starts, 9.9, 13);
    expect(p.map((x) => x.text)).toEqual(['今が一番', '若いの']); // 一番 held 1.0 s alone would be fine, 今が only 0.35 s
    expect(p[1].at).toBeCloseTo(11.45, 2);
  });
});

describe('planCut', () => {
  const timed = [{ text: '今が一番', from: 0, at: 10 }, { text: '若いの', from: 4, at: 11.45 }];

  it('cuts the sung pieces in, then brings the whole line back big', () => {
    const p = planCut('今が一番 若いの', timed, 9.9, 12, 14);
    expect(p.pieces.map((x) => x.text)).toEqual(['今が一番', '若いの', '今が一番 若いの']);
    expect(p.recapAt).toBeCloseTo(12.3, 5);
  });

  it('shows the line whole when there is no time to bring it back', () => {
    const p = planCut('今が一番 若いの', timed, 9.9, 12, 12.8);
    expect(p.pieces.map((x) => x.text)).toEqual(['今が一番 若いの']);
    expect(p.recapAt).toBe(9.9);
  });
});

describe('beat-cut in Chinese', () => {
  it('cuts a Chinese line into words', async () => {
    const { cutPieces } = await import('./beat-cut');
    const p = cutPieces('快使用雙截棍 哼哼哈兮').map((x) => x.text);
    expect(p.length).toBeGreaterThan(1);
    expect(p.join('')).toBe('快使用雙截棍哼哼哈兮');
  });

  it('wraps a long whole line into balanced rows instead of one small row', () => {
    const line = '我愛台妹 台妹愛我 對我來說 林志玲算什麼?!';
    expect([wrapRows('我愛台妹'), wrapRows(line), wrapRows('我的阿妹妹 快來跟我跳阿哥哥 Go 我知道你看到是我')]).toEqual([1, 2, 3]);
    const rows = balancedRows(line, wrapRows(line));
    expect(rows.join('').replace(/ /g, '')).toBe(line.replace(/ /g, ''));
    expect(rows.length).toBe(2);
    expect(Math.max(...rows.map((r) => [...r.replace(/ /g, '')].length))).toBeLessThanOrEqual(12);
  });
});
