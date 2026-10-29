import { acceptance, AdminJob, clockTime, conceptAttempt, fileSize, jobName, jobState, kpis, margin, mmss, needHelp, parseLimit, retryLabel, shortDate, signedMoney, songMoney, stepRows, styleCounts, styleFilterCounts } from './admin';
import { BetaMe, BetaSong } from './beta';

const iso = (minAgo: number, now = Date.parse('2026-10-28T05:40:00Z')) => new Date(now - minAgo * 60e3).toISOString();
const NOW = Date.parse('2026-10-28T05:40:00Z');
const job = (o: Partial<AdminJob> & { id: string }): AdminJob =>
  ({ songId: 's1', userId: 'u1', kind: 'make', tier: 'img', status: 'done', createdAt: iso(100), reservedUsd: 0, priceUsd: 6, chargedUsd: 6, ...o }) as AdminJob;
const song = (o: Partial<BetaSong> & { id: string }): BetaSong => ({ userId: 'u1', title: o.id, artist: '', language: 'zh', createdAt: iso(600), confirmedAt: iso(590), ...o });
const users: BetaMe[] = [
  { id: 'u1', name: 'Sei', admin: true, limitUsd: 25, spentUsd: 7.42 },
  { id: 'u2', name: '小明', admin: false, limitUsd: 10, spentUsd: 2.1 },
  { id: 'u3', name: 'Ann', admin: false, disabled: true, limitUsd: 10, spentUsd: 0 },
];

describe('money helpers', () => {
  it('signs a margin and never prints -0', () => {
    expect(signedMoney(3.21)).toBe('+$3.21');
    expect(signedMoney(-1.5)).toBe('-$1.50');
    expect(signedMoney(0)).toBe('$0.00');
    expect(signedMoney(-0.001)).toBe('$0.00');
  });
  it('margin is paid minus cost, red only when negative', () => {
    expect(margin(6.5, 4.83)).toEqual({ value: '+$1.67', tone: 'ok' });
    expect(margin(0, 1.2)).toEqual({ value: '-$1.20', tone: 'bad' });
    expect(margin(2, 2)).toEqual({ value: '$0.00', tone: 'ok' });
  });
  it('sums a song: failed jobs charge 0 but still cost the platform', () => {
    const m = songMoney([job({ id: 'a', chargedUsd: 6, costUsd: 3.62 }), job({ id: 'b', status: 'failed', chargedUsd: 0, costUsd: 1.2 }), job({ id: 'c', kind: 'prep', chargedUsd: 0.5, costUsd: 0.01 })]);
    expect(m.paid).toBeCloseTo(6.5);
    expect(m.cost).toBeCloseTo(4.83);
    expect(m.margin).toEqual({ value: '+$1.67', tone: 'ok' });
  });
  it('counts a queued or running job at no less than its price, like the site-wide platformSpent', () => {
    expect(songMoney([job({ id: 'r', status: 'running', priceUsd: 13.5, chargedUsd: 13.5, costUsd: 3.1 })]).cost).toBe(13.5);
    expect(songMoney([job({ id: 'r', status: 'running', priceUsd: 2, chargedUsd: 2, costUsd: 3.1 })]).cost).toBe(3.1);
    expect(songMoney([job({ id: 'q', status: 'queued', priceUsd: undefined, reservedUsd: 0.5, chargedUsd: 0.5 })]).cost).toBe(0.5);
    expect(songMoney([job({ id: 'd', status: 'done', priceUsd: 13.5, chargedUsd: 13.5, costUsd: 3.1 })]).cost).toBe(3.1);
  });
});

describe('kpis', () => {
  const songs = [song({ id: 'a', title: '行星' }), song({ id: 'b', title: 'プラトニックチョロイン' })];
  const jobs = [
    job({ id: 'p1', kind: 'prep', songId: 'a', status: 'done', createdAt: iso(600) }),
    job({ id: 'p2', kind: 'prep', songId: 'b', status: 'done', createdAt: iso(600) }),
    job({ id: 'm1', songId: 'a', tier: 'hybrid', status: 'running', phase: '畫故事畫面', createdAt: iso(30), startedAt: iso(30) }),
    job({ id: 'm2', songId: 'b', tier: 'none', status: 'failed', auto: true, chargedUsd: 0, costUsd: 1.2, createdAt: iso(20) }),
    job({ id: 'q1', songId: 'b', kind: 'prep', status: 'queued', createdAt: iso(1) }),
  ];
  it('builds the five cards from the totals, people, jobs and songs', () => {
    const k = kpis(users, jobs, songs, { globalLimitUsd: 100, spentUsd: 9.52, platformSpentUsd: 6.31 }, NOW);
    expect(k.map((x) => x.label)).toEqual(['使用者已付', '平台成本', '測試者', '進行中工作', '需要協助']);
    expect(k[0]).toEqual({ label: '使用者已付', value: '$9.52', sub: '毛利 +$3.21', tone: 'ok' });
    expect(k[1]).toEqual({ label: '平台成本', value: '$6.31', sub: '總額度 $100 · 6.3%' });
    expect(k[2]).toEqual({ label: '測試者', value: '3', sub: '1 停用' });
    expect(k[3].value).toBe('1');
    expect(k[3].sub).toMatch(/^1 排隊 · 約等 \d+ 分$/);
    expect(k[4]).toEqual({ label: '需要協助', value: '0', sub: '沒有卡住的歌', tone: undefined });
  });
  it('counts a song whose last job failed for good, naming it and why', () => {
    const stuck = jobs.filter((j) => j.id !== 'q1');
    const k = kpis(users, stuck, songs, { globalLimitUsd: 100, spentUsd: 9.52, platformSpentUsd: 6.31 }, NOW);
    expect(k[4]).toEqual({ label: '需要協助', value: '1', sub: 'プラトニックチョ… 重試失敗', tone: 'bad' });
    expect(needHelp(songs, stuck)).toEqual([{ id: 'b', title: 'プラトニックチョロイン', why: '重試失敗' }]);
  });
  it('names a failed preparation and a plain failure', () => {
    expect(needHelp([song({ id: 'c' })], [job({ id: 'p', kind: 'prep', songId: 'c', status: 'failed' })])).toEqual([{ id: 'c', title: 'c', why: '準備失敗' }]);
    expect(needHelp([song({ id: 'a' })], [job({ id: 'p', kind: 'prep', songId: 'a' }), job({ id: 'm', songId: 'a', status: 'failed' })])[0].why).toBe('製作失敗');
  });
  it('counts a video held for the admin’s release (the person waits on it), a failure first when both apply', () => {
    const prep = job({ id: 'p', kind: 'prep', songId: 'a' });
    expect(needHelp([song({ id: 'a' })], [prep, job({ id: 'h', songId: 'a', status: 'admin', tier: 'hybrid' })])).toEqual([{ id: 'a', title: 'a', why: '等你放行' }]);
    expect(needHelp([song({ id: 'a' })], [prep, job({ id: 'h', songId: 'a', status: 'admin', createdAt: iso(50) }), job({ id: 'f', songId: 'a', status: 'failed', createdAt: iso(10) })])[0].why).toBe('製作失敗');
    expect(needHelp([song({ id: 'a' })], [prep, job({ id: 'd', songId: 'a', status: 'done' })])).toEqual([]);
  });
  it('measures the limit by the platform’s cost, as the server does, not by what the people paid', () => {
    const k = kpis([], [], [], { globalLimitUsd: 100, spentUsd: 0, platformSpentUsd: 31.2 }, NOW);
    expect(k[1].sub).toBe('總額度 $100 · 31.2%');
    expect(k[0]).toEqual({ label: '使用者已付', value: '$0.00', sub: '毛利 -$31.20', tone: 'bad' });
  });
  it('handles no limit and no people without dividing by zero', () => {
    const k = kpis([], [], [], { globalLimitUsd: 0, spentUsd: 0, platformSpentUsd: 0 }, NOW);
    expect(k[1].sub).toBe('總額度 $0 · —');
    expect(k[2].sub).toBe('全部啟用');
    expect(k[3].sub).toBe('0 排隊');
  });
});

describe('parseLimit', () => {
  it('takes a number from 0 up, and refuses an empty, negative or non-numeric field (a cleared field is not 0)', () => {
    expect(parseLimit('25')).toBe(25);
    expect(parseLimit(' 0 ')).toBe(0);
    expect(parseLimit('12.5')).toBe(12.5);
    expect(parseLimit('')).toBeNull();
    expect(parseLimit('   ')).toBeNull();
    expect(parseLimit('-1')).toBeNull();
    expect(parseLimit('abc')).toBeNull();
    expect(parseLimit('Infinity')).toBeNull();
  });
});

describe('jobName and jobState', () => {
  it('names jobs by kind and tier', () => {
    expect(jobName(job({ id: 'a', kind: 'prep' }))).toBe('準備歌曲');
    expect(jobName(job({ id: 'a', kind: 'concept', tier: 'hybrid' }))).toBe('概念');
    expect(jobName(job({ id: 'a', kind: 'fix' }))).toBe('修正');
    expect(jobName(job({ id: 'a', tier: 'hybrid' }))).toBe('故事版');
  });
  it('shows the step and percent of a running job', () => {
    const s = jobState([], job({ id: 'a', tier: 'hybrid', status: 'running', phase: '畫故事畫面', createdAt: iso(30), startedAt: iso(30), steps: [{ phase: '畫故事畫面', at: iso(5) }] }), NOW);
    expect(s.chip).toEqual({ icon: '●', label: '製作中', tone: 'making' });
    expect(s.detail).toMatch(/^畫故事畫面 \d+%$/);
  });
  it('marks queued, held and finished jobs', () => {
    expect(jobState([], job({ id: 'a', status: 'queued' }), NOW)).toEqual({ chip: { icon: '◷', label: '排隊', tone: 'muted' }, detail: '' });
    expect(jobState([], job({ id: 'a', status: 'queued', auto: true }), NOW).detail).toBe('自動重試');
    expect(jobState([], job({ id: 'a', status: 'admin' }), NOW)).toEqual({ chip: { icon: '?', label: '等確認', tone: 'warn' }, detail: '等管理者放行' });
    expect(jobState([], job({ id: 'a' }), NOW)).toEqual({ chip: { icon: '✓', label: '完成', tone: 'ok' }, detail: '' });
  });
  it('explains a failure: retried, auto-retry failed with refund, or plain', () => {
    const failed = job({ id: 'a', status: 'failed', auto: true, priceUsd: 16, chargedUsd: 0 });
    expect(jobState([failed], failed, NOW)).toEqual({ chip: { icon: '!', label: '失敗', tone: 'bad' }, detail: '重試失敗 · 已退款' });
    expect(jobState([failed, job({ id: 'b', retryOf: 'a' })], failed, NOW).detail).toBe('已重跑 → b');
    expect(jobState([], job({ id: 'c', status: 'failed', priceUsd: 0 }), NOW).detail).toBe('失敗');
  });
  it('shows a concept waiting for the person with its attempt number, and its decision after', () => {
    const c1 = job({ id: 'c1', kind: 'concept', tier: 'img', createdAt: iso(50), decision: 'adjusted' });
    const c2 = job({ id: 'c2', kind: 'concept', tier: 'img', createdAt: iso(40) });
    expect(conceptAttempt([c1, c2], c2)).toBe(2);
    expect(jobState([c1, c2], c2, NOW)).toEqual({ chip: { icon: '?', label: '等確認', tone: 'warn' }, detail: '第 2 次' });
    expect(jobState([c1, c2], c1, NOW)).toEqual({ chip: { icon: '✓', label: '完成', tone: 'ok' }, detail: '要求調整' });
  });
});

describe('time and size formats', () => {
  it('prints dates, clocks, marks and sizes', () => {
    const d = new Date(2026, 9, 28, 7, 54, 9).toISOString();
    expect(shortDate(d)).toBe('10-28 07:54');
    expect(clockTime(d)).toBe('07:54:09');
    expect(shortDate(undefined)).toBe('');
    expect(mmss(83.4)).toBe('1:23');
    expect(mmss(101.2)).toBe('1:41');
    expect(fileSize(133)).toBe('133 B');
    expect(fileSize(2527)).toBe('2.5 KB');
    expect(fileSize(3 * 1024 * 1024)).toBe('3.0 MB');
  });
  it('measures each step to the next, the last to the end, and leaves a running one open', () => {
    const j = job({ id: 'a', endedAt: iso(0), steps: [{ phase: '導演規劃段落與故事', at: iso(10) }, { phase: '輸出影片', at: iso(4) }] });
    expect(stepRows(j).map((r) => r.dur)).toEqual(['360 秒', '240 秒']);
    expect(stepRows({ ...j, endedAt: undefined }).map((r) => r.dur)).toEqual(['360 秒', '—']);
    expect(stepRows(job({ id: 'b' }))).toEqual([]);
  });
});

describe('style table', () => {
  const concept = (id: string, language: string, decision?: AdminJob['decision']) =>
    job({ id, kind: 'concept', decision, concept: { language, languageName: language, font: '', palette: [], concept: '', stills: [] } });
  it('counts decisions per style from concept jobs only', () => {
    const c = styleCounts([concept('a', 'silkscreen', 'accepted'), concept('b', 'silkscreen', 'adjusted'), concept('c', 'silkscreen'), concept('d', 'risograph', 'redone'), job({ id: 'e', style: 'silkscreen', decision: 'accepted' } as Partial<AdminJob> & { id: string })]);
    expect(c).toEqual({ silkscreen: { accepted: 1, adjusted: 1, redone: 0 }, risograph: { accepted: 0, adjusted: 0, redone: 1 } });
  });
  it('acceptance is accepted over all decisions, a dash before any', () => {
    expect(acceptance({ accepted: 12, adjusted: 3, redone: 1 })).toEqual({ pct: 75, label: '75%' });
    expect(acceptance({ accepted: 4, adjusted: 3, redone: 2 })).toEqual({ pct: 44, label: '44%' });
    expect(acceptance({ accepted: 0, adjusted: 0, redone: 0 })).toEqual({ pct: 0, label: '—' });
  });
  it('counts the filter chips', () => {
    const s = (id: string, tier: 'proven' | 'candidate' | 'unlisted') => ({ id, name: id, suits: '', proven: tier === 'proven', tier, image: null });
    expect(styleFilterCounts([s('a', 'proven'), s('b', 'candidate'), s('c', 'unlisted'), s('d', 'unlisted')])).toEqual({ all: 4, proven: 1, candidate: 1, unlisted: 2 });
  });
});

describe('retryLabel', () => {
  it('names what a re-run charges the person again: the price, else the reserve, else nothing', () => {
    expect(retryLabel(job({ id: 'a', priceUsd: 2.5 }))).toBe('重跑（再扣 $2.5）');
    expect(retryLabel(job({ id: 'b', priceUsd: 13.5 }))).toBe('重跑（再扣 $13.5）');
    expect(retryLabel(job({ id: 'c', priceUsd: undefined, reservedUsd: 4 }))).toBe('重跑（再扣 $4）');
    expect(retryLabel(job({ id: 'd', priceUsd: 0, reservedUsd: 0 }))).toBe('重跑');
  });
});
