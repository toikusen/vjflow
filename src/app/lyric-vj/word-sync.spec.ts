import { describe, expect, it } from 'vitest';
import { checkWordSync, SYNC_SHARE, syncCap, WordSyncAsk } from './word-sync';

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
