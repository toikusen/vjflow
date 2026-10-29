import { BetaJob } from './beta';
import { clock, failureCard, heroTone, jobTitle, jobTotal, stepClocks, timingNote } from './song';

const job = (o: Partial<BetaJob>): BetaJob => ({ id: 'j', songId: 's', kind: 'make', tier: 'hybrid', status: 'done', createdAt: '2026-10-27T00:00:00Z', ...o });

describe('heroTone', () => {
  it('is blue while preparing, red when help is needed, else the cover tint', () => {
    expect(heroTone('preparing')).toBe('info');
    expect(heroTone('help')).toBe('bad');
    expect(heroTone('prepFailed')).toBe('bad');
    for (const k of ['making', 'retrying', 'ready', 'timing', 'concept'] as const) expect(heroTone(k)).toBe('cover');
  });
});

describe('timingNote', () => {
  it('states the condition (若再改時間) rather than a fact, counts several pending concepts, and is empty with none', () => {
    expect(timingNote(1)).toBe('（若再改時間，待確認的概念要重新產生）');
    expect(timingNote(2)).toBe('（若再改時間，2 個待確認的概念都要重新產生）');
    expect(timingNote(0)).toBe('');
  });
});

describe('jobTitle and jobTotal', () => {
  it('names a result by its tier, and marks a fix', () => {
    expect(jobTitle(job({}))).toEqual({ name: '故事版' });
    expect(jobTitle(job({ kind: 'fix', tier: 'img' }))).toEqual({ name: '插圖版', tag: '依回報修正' });
    expect(jobTitle(job({ kind: 'concept', tier: 'none' }))).toEqual({ name: '文字動態版', tag: '概念' });
    expect(jobTitle(job({ tier: undefined }))).toEqual({ name: '文字動態版' });
  });
  it('a make job adds the price of the concept it came from', () => {
    const concept = job({ id: 'c', kind: 'concept', priceUsd: 2.5 });
    const make = job({ id: 'm', priceUsd: 13.5, conceptOf: 'c' });
    expect(jobTotal(make, [concept, make])).toBe(16);
    expect(jobTotal(job({ priceUsd: 4 }), [])).toBe(4);
    expect(jobTotal(job({ kind: 'fix', priceUsd: 1, conceptOf: 'c' }), [concept])).toBe(1);
    expect(jobTotal(job({}), [])).toBeUndefined();
  });
});

describe('clock', () => {
  it('reads seconds as m:ss', () => {
    expect(clock(0)).toBe('0:00');
    expect(clock(65.4)).toBe('1:05');
    expect(clock(3725)).toBe('62:05');
  });
});

describe('stepClocks', () => {
  const steps = [
    { phase: '導演規劃段落與故事', at: '2026-10-27T00:00:00Z' },
    { phase: '導演修正故事草稿', at: '2026-10-27T00:02:10Z' },
    { phase: '導演設計視覺風格', at: '2026-10-27T00:03:15Z' },
  ];
  it('done steps last until the next recorded start, the current one shows its time so far, later ones a dash', () => {
    const j = job({ tier: 'none', status: 'running', phase: '導演設計視覺風格', startedAt: '2026-10-27T00:00:00Z', steps });
    expect(stepClocks(j, Date.parse('2026-10-27T00:04:00Z'))).toEqual([
      { state: 'done', time: '2:10' },
      { state: 'done', time: '1:05' },
      { state: 'now', time: '0:45' },
      { state: 'next', time: '—' },
      { state: 'next', time: '—' },
      { state: 'next', time: '—' },
    ]);
  });
  it('a done step with no recorded start shows a dash; a queued job has only later steps', () => {
    const j = job({ tier: 'none', status: 'running', phase: '編排文字動態', startedAt: '2026-10-27T00:00:00Z', steps: [{ phase: '編排文字動態', at: '2026-10-27T00:10:00Z' }] });
    expect(stepClocks(j, Date.parse('2026-10-27T00:11:00Z')).slice(0, 4)).toEqual([
      { state: 'done', time: '—' },
      { state: 'done', time: '—' },
      { state: 'done', time: '—' },
      { state: 'now', time: '1:00' },
    ]);
    expect(stepClocks(job({ tier: 'none', status: 'queued' })).every((x) => x.state === 'next')).toBe(true);
  });
});

describe('failureCard', () => {
  const first = job({ id: 'a', tier: 'none', status: 'failed', priceUsd: 4, endedAt: '2026-10-28T07:44:00' });
  const retry = job({ id: 'b', tier: 'none', status: 'failed', priceUsd: 4, auto: true, retryOf: 'a', endedAt: '2026-10-28T07:50:00' });
  it('names the tier, says whether the automatic retry also failed, and refunds that job’s price', () => {
    expect(failureCard(retry, [first, retry])).toEqual({ title: '文字動態版製作失敗，自動重試也沒成功', price: 4, stamps: ['10-28 07:44 失敗', '10-28 07:50 重試失敗'] });
    expect(failureCard(first, [first])).toEqual({ title: '文字動態版製作失敗', price: 4, stamps: ['10-28 07:44 失敗'] });
  });
  it('names a failed concept by its tier and a failed fix as 修正', () => {
    const concept = job({ id: 'c', kind: 'concept', tier: 'hybrid', status: 'failed', priceUsd: 2.5, auto: true, retryOf: 'x', endedAt: '2026-10-28T07:50:00' });
    expect(failureCard(concept, [concept])).toMatchObject({ title: '故事版的概念產生失敗，自動重試也沒成功', price: 2.5 });
    expect(failureCard({ ...concept, auto: undefined, retryOf: undefined }, []).title).toBe('故事版的概念產生失敗');
    const fix = job({ id: 'f', kind: 'fix', tier: 'img', status: 'failed', priceUsd: 1, auto: true, retryOf: 'x', endedAt: '2026-10-28T07:50:00' });
    expect(failureCard(fix, [fix])).toMatchObject({ title: '修正失敗，自動重試也沒成功', price: 1 });
    expect(failureCard({ ...fix, auto: undefined, retryOf: undefined }, []).title).toBe('修正失敗');
  });
  it('a fix with nothing to remove says so, and that it cost nothing', () => {
    const fix = job({ id: 'f', kind: 'fix', tier: 'img', status: 'failed', priceUsd: 1, nothingToRemove: true, endedAt: '2026-10-28T07:50:00' });
    expect(failureCard(fix, [fix])).toMatchObject({ title: '修正失敗', reason: '標記的範圍裡沒有找到可以拿掉的圖，這次沒有收費。' });
    expect(failureCard({ ...fix, nothingToRemove: undefined }, []).reason).toBeUndefined();
  });
});
