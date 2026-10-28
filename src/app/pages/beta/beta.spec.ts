import { BetaEvent, BetaFeedback, failedNotice, feedbackLine, retriedBy, BetaJob, BetaSong, jobProgress, JOB_STEPS, minutesBetween, PREP_PRICE, songChip, songStage, songView, SongView, timeline, TIER_INFO } from './beta';
import { pageFor } from './route';

const song: BetaSong = { id: 's', userId: 'u', title: 'T', artist: '', language: 'ja', createdAt: '2026-10-27T00:00:00Z' };
const job = (o: Partial<BetaJob>): BetaJob => ({ id: 'j', songId: 's', kind: 'prep', status: 'done', createdAt: '2026-10-27T00:00:00Z', ...o });

describe('songStage', () => {
  it('waits for the preparation, then the timing', () => {
    expect(songStage(song, [])).toEqual({ step: 'preparing', label: '等待上傳' });
    const running = job({ status: 'running', phase: '分離人聲' });
    expect(songStage(song, [running])).toEqual({ step: 'preparing', label: '分離人聲', job: running });
    expect(songStage(song, [job({ status: 'failed' })])).toEqual({ step: 'prepFailed' });
    expect(songStage(song, [job({})])).toEqual({ step: 'timing' });
  });

  it('a confirmed song shows each version by its latest job', () => {
    const s = { ...song, confirmedAt: '2026-10-27T01:00:00Z' };
    const jobs = [
      job({}),
      job({ id: 'a', kind: 'make', tier: 'img', status: 'failed', createdAt: '2026-10-27T02:00:00Z' }),
      job({ id: 'b', kind: 'make', tier: 'img', status: 'done', createdAt: '2026-10-27T03:00:00Z' }),
      job({ id: 'c', kind: 'make', tier: 'hybrid', status: 'running', phase: '畫故事畫面', createdAt: '2026-10-27T04:00:00Z' }),
      job({ id: 'd', kind: 'make', tier: 'none', status: 'admin', createdAt: '2026-10-27T05:00:00Z' }),
    ];
    expect(songStage(s, jobs)).toEqual({ step: 'ready', making: [{ tier: 'hybrid', label: '畫故事畫面', job: jobs[3] }], done: ['img'], held: ['none'], failed: [], videos: [{ tier: 'img', jobId: 'b' }] });
  });
});

describe('jobProgress', () => {
  const start = Date.parse('2026-10-27T00:00:00Z');
  const make = (phase: string, minutes: number) => jobProgress(job({ kind: 'make', tier: 'img', status: 'running', phase, startedAt: '2026-10-27T00:00:00Z' }), start + minutes * 60_000);
  const total = JOB_STEPS.img.reduce((s, x) => s + x.min, 0);

  it('counts earlier steps in full and the current one by time spent past them', () => {
    expect(make('導演規劃段落與故事', 0)).toMatchObject({ index: 0, pct: 0, leftMin: total, label: '導演正在讀歌詞、規劃段落與故事' });
    expect(make('畫道具', 11)).toMatchObject({ index: 3, pct: Math.round((11 / total) * 100), leftMin: Math.ceil(total - 11) });
  });

  it('times the current step from its recorded start (the last entry of the phase after a restart)', () => {
    const j = job({ kind: 'make', tier: 'img', status: 'running', phase: '畫道具', startedAt: '2026-10-27T00:00:00Z',
      steps: [{ phase: '導演規劃段落與故事', at: '2026-10-27T00:00:00Z' }, { phase: '畫道具', at: '2026-10-27T00:20:00Z' }] });
    expect(jobProgress(j, Date.parse('2026-10-27T00:21:00Z')).pct).toBe(Math.round(((9 + 1) / 30) * 100));
    const again = { ...j, steps: [...j.steps!, { phase: '畫道具', at: '2026-10-27T00:30:00Z' }] };
    expect(jobProgress(again, Date.parse('2026-10-27T00:31:00Z')).pct).toBe(Math.round(((9 + 1) / 30) * 100));
  });

  it('holds a slow step under its estimate, never reaches 100, and reads old phase labels', () => {
    const slow = make('畫道具', 60);
    expect(slow.pct).toBe(Math.round(((9 + 4.5) / total) * 100));
    expect(slow.leftMin).toBeGreaterThanOrEqual(1);
    expect(make('導演設計', 1).index).toBe(0);
    expect(make('輸出影片', 999).pct).toBeLessThan(100);
  });

  it('a queued job has not started', () => {
    expect(jobProgress(job({ kind: 'make', tier: 'none', status: 'queued' }))).toMatchObject({ label: '排隊中', pct: 0 });
  });
});

describe('prices', () => {
  it('shows the fixed price of each version', () => {
    expect(PREP_PRICE).toBe(0.5);
    expect([TIER_INFO.none.price, TIER_INFO.img.price, TIER_INFO.hybrid.price]).toEqual([4, 6, 16]);
  });
});

describe('songView', () => {
  const prep = job({ id: 'p' });
  const confirmed = { ...song, confirmedAt: '2026-10-27T01:00:00Z' };
  const make = (id: string, o: Partial<BetaJob> = {}) => job({ id, kind: 'make', tier: 'none', createdAt: `2026-10-27T0${id}:00:00Z`, ...o });

  it('follows the preparation and the timing', () => {
    expect(songView(song, []).stage).toBe('preparing');
    expect(songView(song, [job({ status: 'running' })]).stage).toBe('preparing');
    expect(songView(song, [job({ status: 'failed' })]).stage).toBe('prepFailed');
    expect(songView(song, [prep]).stage).toBe('timing');
    expect(songView(confirmed, [prep])).toEqual({ stage: 'ready', prep, retrying: false, results: [], active: undefined, failedFor: undefined });
  });
  it('shows the running job, and an automatic retry', () => {
    const run = make('2', { status: 'running' });
    expect(songView(confirmed, [prep, run]).active).toBe(run);
    expect(songView(confirmed, [prep, run]).retrying).toBe(false);
    const retry = make('3', { status: 'queued', auto: true });
    expect(songView(confirmed, [prep, make('2', { status: 'failed' }), retry]).retrying).toBe(true);
  });
  it('reports a failure only when nothing is active', () => {
    expect(songView(confirmed, [prep, make('2', { status: 'failed', tier: 'img' })]).failedFor).toBe('img');
    expect(songView(confirmed, [prep, make('2', { status: 'failed' }), make('3', { status: 'running' })]).failedFor).toBeUndefined();
  });
  it('lists results newest first, held ones included', () => {
    const [a, b, c] = [make('1'), make('2', { status: 'admin' }), make('3', { status: 'failed' })];
    expect(songView(confirmed, [prep, a, b, c]).results).toEqual([b, a]);
  });
});

describe('minutesBetween', () => {
  it('rounds up to whole minutes', () => {
    expect(minutesBetween('2026-10-27T00:00:00Z', '2026-10-27T00:20:10Z')).toBe(21);
    expect(minutesBetween(undefined, 'x')).toBeUndefined();
  });
});

describe('pageFor', () => {
  it('picks the page by path, the longer beta paths first', () => {
    expect(pageFor('/my/song')).toBe('beta-song');
    expect(pageFor('/my/admin/song')).toBe('beta-admin-song');
    expect(pageFor('/my/admin')).toBe('beta-admin');
    expect(pageFor('/my')).toBe('beta');
    expect(pageFor('/admin')).toBe('admin');
    expect(pageFor('/timing')).toBe('timing');
    expect(pageFor('/studio')).toBe('studio');
    expect(pageFor('/')).toBe('home');
  });
});

describe('songChip', () => {
  const base: SongView = { stage: 'ready', retrying: false, results: [] };
  const active = job({ kind: 'make', tier: 'img', status: 'running' });
  it('names each stage with its tone', () => {
    expect(songChip({ ...base, stage: 'preparing' })).toEqual({ label: '準備中', tone: 'live' });
    expect(songChip({ ...base, stage: 'prepFailed' })).toEqual({ label: '準備失敗', tone: 'bad' });
    expect(songChip({ ...base, stage: 'timing' })).toEqual({ label: '待確認時間', tone: 'warn' });
    expect(songChip({ ...base, active })).toEqual({ label: '製作中', tone: 'live' });
    expect(songChip({ ...base, active: { ...active, status: 'queued' } })).toEqual({ label: '製作中', tone: 'live' });
    expect(songChip({ ...base, active, retrying: true })).toEqual({ label: '自動重試中', tone: 'warn' });
    expect(songChip({ ...base, failedFor: 'img' })).toEqual({ label: '需要協助', tone: 'bad' });
    expect(songChip(base)).toEqual({ label: '可製作', tone: 'ok' });
  });
});

describe('timeline', () => {
  const ev = (type: string, o: Partial<BetaEvent> = {}): BetaEvent => ({ at: '2026-10-27T00:00:00Z', type, ...o });

  it('titles each event in Chinese with a tone and the job id', () => {
    const rows = timeline([
      ev('song.created'),
      ev('timing.saved', { confirmed: true }),
      ev('timing.saved'),
      ev('job.phase', { jobId: 'j', phase: '分離人聲' }),
      ev('job.cost', { jobId: 'j', key: 'gemini', usd: 0.12345 }),
      ev('job.ended', { jobId: 'j', status: 'failed', error: 'boom' }),
      ev('job.ended', { jobId: 'j', status: 'done' }),
      ev('job.fused', { jobId: 'j' }),
      ev('job.autoretry', { jobId: 'k', retryOf: 'j' }),
      ev('job.autoretry.skipped', { retryOf: 'j', reason: 'budget' }),
      ev('queue.orphan.timeout', { pids: [1, 2] }),
      ev('weird.type'),
    ]);
    expect(rows.map((r) => [r.title, r.tone])).toEqual([
      ['建立歌曲', 'info'],
      ['確認時間', 'info'],
      ['儲存時間', 'info'],
      ['步驟：分離人聲', 'info'],
      ['費用 $0.123（gemini）', 'info'],
      ['結束：failed', 'bad'],
      ['結束：done', 'ok'],
      ['保險絲觸發', 'bad'],
      ['自動重試', 'warn'],
      ['略過自動重試（全站額度不足）', 'warn'],
      ['殘留程序未結束', 'bad'],
      ['weird.type', 'info'],
    ]);
    expect(rows[3].jobId).toBe('j');
    expect(rows[5].detail).toBe('boom');
    expect(rows[8].detail).toBe('重試 j');
  });
});

describe('failure copy, retries and report summary', () => {
  const confirmed = { ...song, confirmedAt: '2026-10-27T01:00:00Z' };
  const prep = job({});
  const mk = (id: string, o: Partial<BetaJob>) => job({ id, kind: 'make', tier: 'img', createdAt: `2026-10-27T0${id}:00:00Z`, ...o });

  it('failedAuto is true only when the last failed job was an automatic retry', () => {
    expect(songView(confirmed, [prep, mk('2', { status: 'failed', auto: true })]).failedAuto).toBe(true);
    expect(songView(confirmed, [prep, mk('2', { status: 'failed' })]).failedAuto).toBe(false);
    expect(songView(confirmed, [prep, mk('2', { status: 'failed' }), mk('3', { status: 'running' })]).failedAuto).toBeUndefined();
  });

  it('claims an automatic retry only when there was one', () => {
    expect(failedNotice(true)).toBe('上一次製作失敗，系統已自動重試仍未成功，管理者會協助處理');
    expect(failedNotice(false)).toBe('上一次製作失敗，管理者會協助處理');
  });

  it('finds the job that superseded a failed one', () => {
    expect(retriedBy([{ id: 'a' }, { id: 'b', retryOf: 'a' }], { id: 'a' })).toBe('b');
    expect(retriedBy([{ id: 'a' }], { id: 'a' })).toBeUndefined();
  });

  it('titles an automatic queue entry as such', () => {
    expect(timeline([{ at: '2026-10-27T00:00:00Z', type: 'job.queued', auto: true }])[0].title).toBe('排隊（自動重試）');
    expect(timeline([{ at: '2026-10-27T00:00:00Z', type: 'job.queued' }])[0].title).toBe('排隊');
  });

  it('summarises reports by count, latest verdict and date', () => {
    const f = (ok: boolean, createdAt: string): Pick<BetaFeedback, 'ok' | 'createdAt'> => ({ ok, createdAt });
    expect(feedbackLine([])).toBe('');
    expect(feedbackLine([f(true, '2026-10-27T12:00:00'), f(false, '2026-10-28T12:00:00')])).toBe('已回報 2 次・最近：有問題・10-28');
    expect(feedbackLine([f(true, '2026-10-27T12:00:00')])).toBe('已回報 1 次・最近：沒問題・10-27');
  });
});
