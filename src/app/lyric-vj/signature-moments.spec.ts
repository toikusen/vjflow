import { describe, expect, it } from 'vitest';
import { checkMoments, lastSung, MomentAsk, MOMENT_FORMS, MOMENTS_APART, overusedForms, ownCues, recordMoments, thinHits, WORD_LISTS, WORDS_OF } from './signature-moments';

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
    expect(checkMoments([ask({ form: 'spin' })], cues, sungOf).dropped[0].reason).toMatch(/no such form/);
    expect(checkMoments([ask({ variant: 'spiral', word: '踢' })], cues, sungOf).dropped[0].reason).toMatch(/not drawn yet/);
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

describe('the new forms and variants', () => {
  const more = [
    { id: 'c040', start: 200, end: 203, text: '那些悲傷融化了從前' },
    { id: 'c041', start: 203.5, end: 206, text: '在夢中看見你身影的那一瞬間' },
    { id: 'c042', start: 240, end: 243, text: '三年後的今天才想起大雪的那一天' },
    { id: 'c043', start: 280, end: 283, text: '停不下來的我' },
  ];
  const all = [...cues, ...more];
  const sung = (id: string) => {
    const c = all.find((x) => x.id === id);
    return c && { times: [...c.text].map((_, i) => +(c.start + 0.1 * i).toFixed(3)), source: 'vote' };
  };
  it('keeps a strike of each new variant on its own verb and refuses a verb of another', () => {
    expect(checkMoments([ask({ cues: ['c040'], variant: 'melt', word: '融化' })], all, sung).kept).toHaveLength(1);
    expect(checkMoments([ask({ cues: ['c040'], variant: 'burn', word: '融化' })], all, sung).dropped[0].reason).toMatch(/not a strike\/burn word/);
  });
  it('refuses a circle for a line too long to go round it', () => {
    const long = [{ id: 'c050', start: 300, end: 309, text: '知らない小径の途中 錆びた踏切の向こうで笑う 君の輪郭' }];
    const s50 = (id: string) => ({ times: [...long[0].text].map((_, i) => 300 + 0.2 * i), source: 'vote' });
    expect(checkMoments([ask({ cues: ['c050'], form: 'shape', variant: 'circle', word: '輪郭' })], long, s50).dropped[0].reason).toMatch(/too long for shape\/circle/);
  });
  it('takes two lines only for the tear', () => {
    const pair = checkMoments([ask({ cues: ['c018', 'c019'], variant: 'burn', word: '踢' })], cues, sungOf);
    expect(pair.dropped[0].reason).toMatch(/takes one line/);
  });
  it('freezes on a stopping word', () => {
    const { kept } = checkMoments([ask({ cues: ['c041'], form: 'freeze', variant: 'stop', word: '瞬間' })], all, sung);
    expect(kept[0].form).toBe('freeze');
    expect(kept[0].at).toBeCloseTo(203.5 + 1.1, 3);
  });
  it('echoes an earlier line through a word both sing, and only that', () => {
    const ok = checkMoments([ask({ cues: ['c031', 'c042'], form: 'echo', variant: 'ghost', word: '大雪' })], [...all, { id: 'c031', start: 120, end: 123, text: '期盼著那三年大雪下的一瞬間' }], (id) => sung(id) ?? sungOf(id));
    expect(ok.dropped).toEqual([]);
    expect(Object.keys(ok.kept[0].sung)).toEqual(['c042']);
    const late = checkMoments([ask({ cues: ['c042', 'c040'], form: 'echo', variant: 'ghost', word: '從前' })], all, sung);
    expect(late.dropped[0].reason).toMatch(/sung before/);
    const missing = checkMoments([ask({ cues: ['c040', 'c042'], form: 'echo', variant: 'ghost', word: '大雪' })], all, sung);
    expect(missing.dropped[0].reason).toMatch(/not in the earlier line/);
    const short = checkMoments([ask({ cues: ['c041', 'c042'], form: 'echo', variant: 'ghost', word: '的' })], all, sung);
    expect(short.dropped[0].reason).toMatch(/too short/);
    const again = checkMoments([ask({ cues: ['c020', 'c021'], form: 'echo', variant: 'ghost', word: '雙截棍' })], cues, sungOf);
    expect(again.dropped[0].reason).toMatch(/repeat, not an echo/);
  });
  it('an echo draws only its answering line; the earlier one stays the engine\'s', () => {
    expect(ownCues({ form: 'echo', cues: ['c031', 'c042'] })).toEqual(['c042']);
    expect(ownCues({ form: 'strike', cues: ['c018', 'c019'] })).toEqual(['c018', 'c019']);
    expect(ownCues({ form: 'shape', cues: ['c020'], repeat: 'c021' })).toEqual(['c020', 'c021']);
  });
  it('matches latin words at a word start and lists every variant\'s words', () => {
    expect(WORDS_OF.shape['circle'].test('rings')).toBe(true);
    expect(WORDS_OF.shape['circle'].test('bring')).toBe(false);
    expect(WORDS_OF.strike['fly'].test('飛んで')).toBe(true);
    for (const [form, vs] of Object.entries(MOMENT_FORMS)) for (const v of vs) expect(WORD_LISTS[form as keyof typeof WORD_LISTS][v]).toBeDefined();
  });
});
