import { BetaJob, BetaSong, jobProgress, JOB_STEPS, PREP_PRICE, songStage, TIER_INFO } from './beta';

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
