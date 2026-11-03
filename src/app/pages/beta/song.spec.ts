import { BetaJob } from './beta';
import { canReupload, clock, DELETE_BODY, draftsToReopen, FAILURE_NOTE, PREP_FAILED_NOTE, failureCard, fitsViewport, heldLines, heroTone, hhmm, nextHeld, SKIP_TIMING_BODY, jobTitle, jobTotal, resultConcept, safeName, stepClocks, nextSteps, timingNote, versionOf, videoFileName } from './song';

const job = (o: Partial<BetaJob>): BetaJob => ({ id: 'j', songId: 's', kind: 'make', tier: 'hybrid', status: 'done', createdAt: '2026-10-27T00:00:00Z', ...o });

describe('heroTone', () => {
  it('is blue while preparing, red when help is needed, else the cover tint', () => {
    expect(heroTone('preparing')).toBe('info');
    expect(heroTone('help')).toBe('bad');
    expect(heroTone('prepFailed')).toBe('bad');
    expect(heroTone('noAudio')).toBe('bad');
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

describe('resultConcept', () => {
  const summary = { language: 'ink', languageName: '墨', font: 'F', palette: ['#000'], concept: 'story', stills: [] };
  const concept = job({ id: 'c', kind: 'concept', decision: 'accepted', concept: summary });
  it('finds the accepted concept of a make or fix by conceptOf, of an older fix through its source run, and nothing for a make without one', () => {
    expect(resultConcept(job({ id: 'm', conceptOf: 'c' }), [concept])).toBe(concept);
    expect(resultConcept(job({ id: 'f', kind: 'fix', conceptOf: 'c' }), [concept])).toBe(concept);
    // the make ran in the concept's run, so a fix's `from` is the concept's id
    expect(resultConcept(job({ id: 'f', kind: 'fix', inputs: { from: 'c' } }), [concept])).toBe(concept);
    const fix1 = job({ id: 'f1', kind: 'fix', inputs: { from: 'c' } });
    expect(resultConcept(job({ id: 'f2', kind: 'fix', inputs: { from: 'f1' } }), [concept, fix1])).toBe(concept);
    expect(resultConcept(job({ id: 'm' }), [concept])).toBeUndefined();
    expect(resultConcept(job({ id: 'f', kind: 'fix', inputs: { from: 'gone' } }), [concept])).toBeUndefined();
  });
  it('ignores a concept job whose summary the server did not return', () => {
    expect(resultConcept(job({ id: 'm', conceptOf: 'c' }), [job({ id: 'c', kind: 'concept' })])).toBeUndefined();
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

describe('versionOf', () => {
  const a = job({ id: 'a', tier: 'none', createdAt: '2026-10-30T01:00:00Z' });
  const b = job({ id: 'b', tier: 'none', kind: 'fix', createdAt: '2026-10-30T02:00:00Z' });
  const other = job({ id: 'o', tier: 'img', createdAt: '2026-10-30T00:00:00Z' });
  const held = job({ id: 'h', tier: 'none', status: 'admin', createdAt: '2026-10-30T03:00:00Z' });
  const running = job({ id: 'r', tier: 'none', status: 'running', createdAt: '2026-10-30T04:00:00Z' });
  const jobs = [running, held, b, a, other];
  it('numbers finished makes and fixes of one tier by creation, oldest first; other tiers and unfinished jobs do not count', () => {
    expect(versionOf(a, jobs)).toBe(1);
    expect(versionOf(b, jobs)).toBe(2);
    expect(versionOf(held, jobs)).toBe(3);
    expect(versionOf(other, jobs)).toBe(1);
    expect(versionOf(running, jobs)).toBeUndefined();
    expect(versionOf(a)).toBeUndefined();
    expect(jobTitle(b, jobs)).toEqual({ name: '文字動態版', tag: '依回報修正', version: 2 });
    expect(videoFileName({ title: '歌' }, b, jobs)).toBe('歌-文字動態版-v2-修正.mp4');
  });
});

describe('nextSteps', () => {
  it('puts another take of the own tier first, upgrades as primary, a step down not, each at the rest price', () => {
    const fromNone = nextSteps('none');
    expect(fromNone.map((s) => [s.tier, s.price, s.primary])).toEqual([['none', 1.5, false], ['img', 3.5, true], ['hybrid', 13.5, true]]);
    expect(fromNone[0].title).toBe('同概念再做一版');
    const fromHybrid = nextSteps('hybrid');
    expect(fromHybrid.map((s) => s.tier)).toEqual(['hybrid', 'none', 'img']);
    expect(fromHybrid[0].title).toBe('同概念再做一版');
    expect(fromHybrid[1]).toMatchObject({ title: '做文字動態版', primary: false });
  });
});

describe('videoFileName', () => {
  it('names a download by song and version, a fix marked, with path characters replaced and an empty title covered', () => {
    expect(videoFileName({ title: '行星' }, job({ tier: 'img' }))).toBe('行星-插圖版.mp4');
    expect(videoFileName({ title: 'a/b:c?' }, job({ kind: 'fix', tier: 'none' }))).toBe('a_b_c_-文字動態版-修正.mp4');
    expect(videoFileName({ title: '  ' }, job({ tier: 'hybrid' }))).toBe('video-故事版.mp4');
    expect(safeName('x<y>|z')).toBe('x_y__z');
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
    const j = job({ kind: 'concept', tier: 'none', status: 'running', phase: '導演設計視覺風格', startedAt: '2026-10-27T00:00:00Z', steps });
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
    const j = job({ kind: 'concept', tier: 'none', status: 'running', phase: '編排文字動態', startedAt: '2026-10-27T00:00:00Z', steps: [{ phase: '編排文字動態', at: '2026-10-27T00:10:00Z' }] });
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
    expect(failureCard(retry, [first, retry])).toEqual({ title: '文字動態版製作失敗，自動重試也沒成功', price: 4, stamps: ['10-28 07:44 失敗', '10-28 07:50 重試失敗'], note: FAILURE_NOTE });
    expect(failureCard(first, [first])).toEqual({ title: '文字動態版製作失敗', price: 4, stamps: ['10-28 07:44 失敗'], note: FAILURE_NOTE });
  });
  it('says only what is true about what happens next: the failure is on record for the admin, nobody was notified', () => {
    expect(failureCard(first, [first]).note).toBe('這次失敗已記錄，管理者會在後台看到。需要協助請聯絡邀請你的人。');
    expect(FAILURE_NOTE).not.toContain('通知');
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

describe('re-upload after a failed or missing upload (mirrors taken() in server.mts)', () => {
  it('is offered when the audio never arrived or the preparation failed, not while it runs or after', () => {
    expect(canReupload({ stage: 'preparing', noAudio: true })).toBe(true);
    expect(canReupload({ stage: 'prepFailed' })).toBe(true);
    expect(canReupload({ stage: 'preparing' })).toBe(false);
    expect(canReupload({ stage: 'timing' })).toBe(false);
    expect(canReupload({ stage: 'ready' })).toBe(false);
  });

  it('the prepFailed line states what is true and what the person can do, with no promise of help', () => {
    expect(PREP_FAILED_NOTE).toBe('準備失敗，這次失敗已記錄；可以重新上傳音檔再試一次。需要協助請聯絡邀請你的人。');
    expect(FAILURE_NOTE).toBe('這次失敗已記錄，管理者會在後台看到。需要協助請聯絡邀請你的人。');
    for (const line of [PREP_FAILED_NOTE, FAILURE_NOTE]) expect(line).not.toMatch(/會協助|已通知|會聯絡|聯絡管理者/);
  });
});

describe('draftsToReopen', () => {
  const results = [job({ id: 'a' }), job({ id: 'b' }), job({ id: 'c', status: 'running' })];
  const has = (id: string) => id !== 'b';

  it('reopens the viewer’s own results that have a draft, once each', () => {
    expect(draftsToReopen(results, true, new Set(), has)).toEqual(['a']);
    expect(draftsToReopen(results, true, new Set(['a']), has)).toEqual([]);
  });

  it('never reopens a form on someone else’s song', () => {
    expect(draftsToReopen(results, false, new Set(), has)).toEqual([]);
  });
});

describe('fitsViewport', () => {
  it('needs the panel plus both 24px margins to fit the window', () => {
    expect(fitsViewport(620, 668)).toBe(true);
    expect(fitsViewport(621, 668)).toBe(false);
  });
});

describe('hhmm', () => {
  // local times, so the day check holds in any time zone
  const now = new Date(2026, 9, 30, 15, 0).getTime();
  it('gives the time alone today and adds the date on another day', () => {
    expect(hhmm(new Date(2026, 9, 30, 9, 5).toISOString(), now)).toBe('09:05');
    expect(hhmm(new Date(2026, 9, 31, 0, 10).toISOString(), now)).toBe('10-31 00:10');
    expect(hhmm(undefined, now)).toBe('');
  });
});

describe('heldLines', () => {
  const now = new Date(2026, 9, 30, 15, 0).getTime();
  const ended = new Date(2026, 9, 30, 14, 20).toISOString();
  it('says what the result waits on and since when, falling back to 品質檢查, then who to contact', () => {
    expect(heldLines({ endedAt: ended }, now)).toEqual(['正在等管理者確認：品質檢查', '從 14:20 起', '需要協助請聯絡邀請你的人']);
    expect(heldLines({ phase: '關鍵畫面', endedAt: ended }, now)[0]).toBe('正在等管理者確認：關鍵畫面');
  });

  it('adds the auto release time when the server gives one, with the date on another day', () => {
    const at = new Date(2026, 9, 31, 2, 0).toISOString();
    expect(heldLines({ endedAt: ended, autoReleaseAt: at }, now)).toContain('預計 10-31 02:00 起自動放行（每 5 分鐘檢查一次）');
    expect(heldLines({}, now)).toEqual(['正在等管理者確認：品質檢查', '需要協助請聯絡邀請你的人']);
  });
});

describe('nextHeld', () => {
  it('holds 接著做 only while the base version waits for the admin', () => {
    expect(nextHeld({ status: 'admin' })).toBe('等管理者放行後才能接著做');
    expect(nextHeld({ status: 'done' })).toBeNull();
  });
});

describe('SKIP_TIMING_BODY', () => {
  it('states the risk and the fees of changing the timing later', () => {
    expect(SKIP_TIMING_BODY).toBe('歌詞時間是自動對的，沒有檢查的話，影片裡可能有歌詞和歌聲對不上的地方。之後改時間本身免費；已做好的影片要套用新時間要另付修正費 $1；還沒確認的概念要重新產生（$2.5）。');
  });
});

describe('DELETE_BODY', () => {
  it('says what leaves the person\'s view, and nothing about the files the server keeps', () => {
    expect(DELETE_BODY).toBe('刪除後，這首歌和它的影片都會從你的列表消失。');
  });
});
