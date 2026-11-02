import { describe, expect, it } from 'vitest';
import { checkMoments, lastSung, MomentAsk, MOMENTS_APART, overusedForms, recordMoments, thinHits } from './signature-moments';

const cues = [
  { id: 'c018', start: 70.54, end: 73.22, text: '(幹什麼? 幹什麼?) 東亞病夫的招牌' },
  { id: 'c019', start: 73.32, end: 76.03, text: '(幹什麼? 幹什麼?) 已被我一腳踢開 哈!' },
  { id: 'c020', start: 76.32, end: 78.56, text: '快使用雙截棍 哼哼哈兮' },
  { id: 'c021', start: 78.7, end: 80.8, text: '快使用雙截棍 哼哼哈兮' },
  { id: 'c030', start: 120, end: 123, text: '夜晚的橋邊在飄雪' },
];
/** Every character a tenth of a second apart from the line's start. */
const sungOf = (id: string) => {
  const c = cues.find((x) => x.id === id);
  return c && { times: [...c.text].map((_, i) => +(c.start + 0.1 * i).toFixed(3)), source: 'vote' };
};
const ask = (over: Partial<MomentAsk>): MomentAsk => ({ cues: ['c019'], form: 'strike', variant: 'tear', word: '踢', why: '一腳踢開', ...over });

describe('checkMoments', () => {
  it('keeps the spike: the signboard line struck by the kicking line on 踢', () => {
    const { kept, dropped } = checkMoments([ask({ cues: ['c018', 'c019'] })], cues, sungOf);
    expect(dropped).toEqual([]);
    expect(kept[0].at).toBeCloseTo(73.32 + 1.7, 3);
    expect(Object.keys(kept[0].sung)).toEqual(['c018', 'c019']);
  });
  it('needs the word in the striking line, outside its calls, and of the variant\'s kind', () => {
    expect(checkMoments([ask({ word: '幹什麼' })], cues, sungOf).dropped[0].reason).toMatch(/not in the line/);
    expect(checkMoments([ask({ word: '一腳' })], cues, sungOf).dropped[0].reason).toMatch(/not a strike\/tear word/);
    expect(checkMoments([ask({ word: '' })], cues, sungOf).dropped[0].reason).toMatch(/not in the line/);
  });
  it('refuses forms and variants not drawn, and unknown or non-adjacent lines', () => {
    expect(checkMoments([ask({ form: 'echo' })], cues, sungOf).dropped[0].reason).toMatch(/no such form/);
    expect(checkMoments([ask({ variant: 'burn', word: '踢' })], cues, sungOf).dropped[0].reason).toMatch(/not drawn yet/);
    expect(checkMoments([ask({ cues: ['c099'] })], cues, sungOf).dropped[0].reason).toMatch(/known lines/);
    expect(checkMoments([ask({ cues: ['c018', 'c020'], word: '雙截棍', form: 'shape', variant: 'chain' })], cues, sungOf).dropped[0].reason).toMatch(/line before/);
  });
  it('drops a moment whose struck line cannot be read before the strike', () => {
    // the signboard's last character sung a second before the kick: 東亞病夫的招牌 needs 1.58 s
    const early = (id: string) => (id === 'c018' ? { times: [...cues[0].text].map(() => 74.0), source: 'even' } : sungOf(id));
    expect(checkMoments([ask({ cues: ['c018', 'c019'] })], cues, early).dropped[0].reason).toMatch(/struck before it can be read/);
  });
  it('keeps moments 30 s apart and at most three, in song order', () => {
    const asks = [ask({ cues: ['c030'], form: 'shape', variant: 'fall', word: '雪' }), ask({ cues: ['c020'], form: 'shape', variant: 'chain', word: '雙截棍' }), ask({ cues: ['c021'], form: 'shape', variant: 'chain', word: '雙截棍' })];
    const { kept, dropped } = checkMoments(asks, cues, sungOf);
    expect(kept.map((k) => k.cues[0])).toEqual(['c020', 'c030']);
    expect(dropped[0].reason).toContain(`${MOMENTS_APART} s`);
  });
  it('needs sung times for every line involved', () => {
    expect(checkMoments([ask({ cues: ['c018', 'c019'] })], cues, (id) => (id === 'c018' ? undefined : sungOf(id))).dropped[0].reason).toMatch(/no sung times for c018/);
  });
});

describe('helpers', () => {
  it('lastSung is the last letter\'s time, not the mark\'s', () => {
    expect(lastSung('哈! ', [1, 1, 1])).toBe(1);
    expect(lastSung('ab!', [1, 2, 2.5])).toBe(2);
  });
  it('thinHits keeps three jolts a second', () => {
    expect(thinHits([0, 0.2, 0.4, 0.6, 0.8, 1.5])).toEqual([0, 0.2, 0.4, 1.5]);
  });
  it('records a song\'s forms and finds the overused ones', () => {
    const h = recordMoments([{ song: 'a', moments: ['strike/tear'] }, { song: 'b' }], 'b', [{ form: 'strike', variant: 'tear' }]);
    expect(h[1].moments).toEqual(['strike/tear']);
    expect(recordMoments(h, 'c', [{ form: 'shape', variant: 'chain' }]).at(-1)).toEqual({ song: 'c', moments: ['shape/chain'] });
    expect(overusedForms(h, 'c')).toEqual(['strike/tear']);
    expect(overusedForms(h, 'a')).toEqual([]);
  });
});

describe('a line sung again', () => {
  it('is the moment\'s second pass, with its own sung times', () => {
    const { kept } = checkMoments([ask({ cues: ['c020'], form: 'shape', variant: 'chain', word: '雙截棍' })], cues, sungOf);
    expect(kept[0].repeat).toBe('c021');
    expect(Object.keys(kept[0].sung)).toEqual(['c020', 'c021']);
  });
});
