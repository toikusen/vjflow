import { describe, expect, it } from 'vitest';
import { checkWordSync, meaningUnits, SYNC_SHARE, syncCap, unitTimes, WordSyncAsk } from './word-sync';

const cues = [
  { id: 'c020', start: 76.32, end: 79.3, text: '快使用雙截棍 哼哼哈兮' },
  { id: 'c021', start: 79.7, end: 82.8, text: '快使用雙截棍 哼哼哈兮' },
  { id: 'c022', start: 84, end: 86, text: '哈!' },
  { id: 'c023', start: 87, end: 87.9, text: '一二三四五六七八九十' },
  { id: 'c024', start: 90, end: 94, text: '夜晚的橋邊在飄雪' },
  { id: 'c025', start: 94.2, end: 97, text: '算不清過了幾個冬天' },
];
/** Every character 0.2 s apart from the line's start, from a voted alignment unless said otherwise. */
const sungOf = (source = 'vote', step = 0.2) => (id: string) => {
  const c = cues.find((x) => x.id === id);
  return c && { times: [...c.text].map((_, i) => +(c.start + step * i).toFixed(3)), source };
};
const ask = (cue: string, why = '口令一拍一字'): WordSyncAsk => ({ cue, why });

describe('checkWordSync', () => {
  it('keeps a line the director asked for when its alignment is exact and it has time', () => {
    const { kept, dropped } = checkWordSync([ask('c020')], cues, sungOf());
    expect(dropped).toEqual([]);
    expect(kept[0]).toMatchObject({ cue: 'c020', source: 'vote' });
    expect(kept[0].times).toHaveLength([...'快使用雙截棍 哼哼哈兮'].length);
  });
  it('refuses a line whose alignment only spread the characters, and one without times', () => {
    expect(checkWordSync([ask('c020')], cues, sungOf('even')).dropped[0].reason).toMatch(/not exact enough/);
    expect(checkWordSync([ask('c020')], cues, sungOf('voice')).dropped[0].reason).toMatch(/not exact enough/);
    expect(checkWordSync([ask('c020')], cues, () => undefined).dropped[0].reason).toMatch(/no sung times/);
    expect(checkWordSync([ask('c099')], cues, sungOf()).dropped[0].reason).toMatch(/no such line/);
  });
  it('refuses a line too short, one sung too fast to read, and one whose characters land as one', () => {
    expect(checkWordSync([ask('c022')], cues, sungOf()).dropped[0].reason).toMatch(/too few/);
    expect(checkWordSync([ask('c023')], cues, sungOf()).dropped[0].reason).toMatch(/too fast/);
    expect(checkWordSync([ask('c024')], cues, sungOf('song', 0.02)).dropped[0].reason).toMatch(/land as one/);
  });
  it('refuses a line the next one cuts off before its last word is seen', () => {
    // c024's last character lands at 90 + 0.2 * 7 = 91.4 with a 0.2 s step; a 0.55 s step puts it at 93.85, 0.35 s before c025
    expect(checkWordSync([ask('c024')], cues, sungOf('song', 0.55)).dropped[0].reason).toMatch(/next line comes/);
  });
  it('leaves split layouts, lines set together and handoffs on their own timing', () => {
    const lineOf = (id: string) => (id === 'c020' ? { split: true } : id === 'c021' ? { together: true } : id === 'c024' ? { handoff: true } : undefined);
    const { kept, dropped } = checkWordSync([ask('c020'), ask('c021'), ask('c024'), ask('c025')], cues, sungOf(), lineOf);
    expect(kept.map((k) => k.cue)).toEqual(['c025']);
    expect(dropped.map((d) => d.reason)).toEqual([expect.stringMatching(/own pieces/), expect.stringMatching(/timed as one/), expect.stringMatching(/handoff/)]);
  });
  it('caps word sync at its share of the song, in song order, and refuses a line asked twice', () => {
    expect(syncCap(6)).toBe(Math.ceil(6 * SYNC_SHARE));
    const { kept, dropped } = checkWordSync([ask('c025'), ask('c024'), ask('c021'), ask('c020'), ask('c020')], cues, sungOf());
    expect(kept.map((k) => k.cue)).toEqual(['c020', 'c021', 'c024']);
    expect(dropped.map((d) => d.reason)).toEqual([expect.stringMatching(/asked twice/), expect.stringMatching(/more than 3 lines/)]);
  });
});

describe('meaningUnits', () => {
  const pieces = (text: string, u: { ranges: [number, number][] }) => u.ranges.map(([a, b]) => [...text].slice(a, b).join(''));
  it('keeps each name of a roll call whole and calls it a roll call', () => {
    const text = 'はるか！ぴあの！りほ！なみ！とうか！';
    const u = meaningUnits(text);
    expect(pieces(text, u)).toEqual(['はるか！', 'ぴあの！', 'りほ！', 'なみ！', 'とうか！']);
    expect(u.call).toBe(true);
  });
  it('counts a ・ list as a call, but not a sentence parted by commas or spaces', () => {
    expect(meaningUnits('い・く・ぞ').call).toBe(true);
    expect(meaningUnits('君は、僕に、言った').call).toBe(false);
    expect(meaningUnits('快使用雙截棍 哼哼哈兮').call).toBe(false);
  });
  it('splits a long stretch at its words, never inside one', () => {
    const text = '為人耿直不屈一身正氣';
    const got = pieces(text, meaningUnits(text));
    expect(got.join('')).toBe(text);
    expect(got.length).toBeGreaterThan(1);
    expect(got.every((p) => [...p].length >= 2)).toBe(true);
  });
  it("takes the director's units, marks riding with the unit before, and falls back when one is not in the line", () => {
    const text = 'はるか！ぴあの！りほ！なみ！とうか！';
    expect(pieces(text, meaningUnits(text, ['はるか', 'ぴあの', 'りほ', 'なみ', 'とうか']))).toEqual(['はるか！', 'ぴあの！', 'りほ！', 'なみ！', 'とうか！']);
    expect(pieces(text, meaningUnits(text, ['はるか', 'ゆき']))).toEqual(['はるか！', 'ぴあの！', 'りほ！', 'なみ！', 'とうか！']);
    expect(meaningUnits('快使用雙截棍 哼哼哈兮', ['快使用', '雙截棍', '哼哼哈兮'], true).call).toBe(true);
  });
});

describe('unitTimes and the roll call through checkWordSync', () => {
  const text = 'はるか！ぴあの！りほ！なみ！とうか！';
  // チョロイン c006's own character times
  const times = [10.34, 10.34, 10.4, 10.65, 10.9, 11.14, 11.38, 11.5, 11.62, 11.8, 12.01, 12.22, 12.44, 12.89, 13.34, 13.4, 13.46, 13.46];
  it("lands every character of a name on the name's first sung time, and gives each way when the next lands", () => {
    const r = unitTimes(text, times, meaningUnits(text));
    expect(r.lands).toEqual([10.34, 10.9, 11.62, 12.22, 13.34]);
    expect(r.times.slice(4, 8)).toEqual([10.9, 10.9, 10.9, 10.9]);
    expect(r.until!.slice(0, 4)).toEqual([10.9, 10.9, 10.9, 10.9]);
    expect(r.until!.slice(14)).toEqual([0, 0, 0, 0]);
  });
  it('a plain line builds word by word and nothing gives way', () => {
    const r = unitTimes('快使用雙截棍 哼哼哈兮', [...'快使用雙截棍 哼哼哈兮'].map((_, i) => i * 0.2), meaningUnits('快使用雙截棍 哼哼哈兮'));
    expect(r.until).toBeUndefined();
  });
  it('keeps the roll call with turns, and builds instead when the names come too close to read alone', () => {
    const roll = [{ id: 'c006', start: 10.23, end: 14.44, text }, { id: 'c007', start: 15.5, end: 16, text: 'きみの愛するあたしは' }];
    const kept = checkWordSync([{ cue: 'c006', why: '點名' }], roll, () => ({ times, source: 'song' })).kept[0];
    expect(kept.turns).toBe(true);
    expect(kept.times[5]).toBe(10.9);
    expect(kept.until![0]).toBe(10.9);
    const close = times.map((t, i) => +(10.3 + i * 0.07).toFixed(2));
    const built = checkWordSync([{ cue: 'c006', why: '點名' }], roll, () => ({ times: close, source: 'song' })).kept[0];
    expect(built.turns).toBeUndefined();
    expect(built.until).toBeUndefined();
  });
});
