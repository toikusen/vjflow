import { BetaEvent, BetaFeedback, COVER_TINTS, coverTint, failedNotice, filterCounts, inFilter, nextStep, songKind, feedbackLine, retriedBy, BetaJob, BetaSong, jobProgress, JOB_STEPS, minutesBetween, PREP_PRICE, songChip, songStage, songView, SongView, timeline, TIER_INFO, FeedbackCategory, FIX_PRICE, fixAllowed, fixBlock, fixKindFor, NOT_FIXABLE } from './beta';
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

  it('a concept job runs its own steps, so its ETA covers the concept only, not a whole make', () => {
    expect(JOB_STEPS.concept.map((x) => x.label)).toEqual(['導演正在讀歌詞、規劃段落與故事', '導演正在修正故事草稿', '導演正在選風格、設計畫面', '正在編排歌詞文字動態', '正在準備示意畫面', '正在整理概念']);
    const c = job({ kind: 'concept', tier: 'hybrid', status: 'running', phase: '準備示意畫面', startedAt: '2026-10-27T00:00:00Z', steps: [{ phase: '準備示意畫面', at: '2026-10-27T00:13:00Z' }] });
    // 13 min of earlier steps + 1 min into this one, of 15.5
    expect(jobProgress(c, Date.parse('2026-10-27T00:14:00Z'))).toMatchObject({ index: 4, label: '正在準備示意畫面', pct: 90, leftMin: 2 });
  });

  it('a fix job applies its edit, then re-renders', () => {
    expect(JOB_STEPS.fix.map((x) => x.label)).toEqual(['套用修正', '正在畫背景剪影', '正在繪製並輸出影片']);
    const f = job({ kind: 'fix', tier: 'img', status: 'running', phase: '輸出影片', startedAt: '2026-10-27T00:00:00Z' });
    expect(jobProgress(f, Date.parse('2026-10-27T00:05:00Z'))).toMatchObject({ index: 2, pct: 38, leftMin: 8 });
  });

  it('a job with no tier falls back to the text version and does not throw', () => {
    const p = jobProgress(job({ kind: 'make', status: 'running', phase: '輸出影片', startedAt: '2026-10-27T00:00:00Z' }), start);
    expect(p.steps).toBe(JOB_STEPS.none);
    expect(() => jobProgress(job({ kind: 'other' as BetaJob['kind'], status: 'running' }))).not.toThrow();
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
  it('holds the newest finished concept nobody has decided on yet', () => {
    const c = (id: string, o: Partial<BetaJob> = {}) => job({ id, kind: 'concept', tier: 'hybrid', createdAt: `2026-10-27T0${id}:00:00Z`, ...o });
    expect(songView(confirmed, [prep, c('2')]).concept?.id).toBe('2');
    expect(songView(confirmed, [prep, c('2', { decision: 'accepted' })]).concept).toBeUndefined();
    expect(songView(confirmed, [prep, c('2', { status: 'running' })]).concept).toBeUndefined();
    expect(songView(confirmed, [prep, c('2', { decision: 'adjusted' }), c('3')]).concept?.id).toBe('3');
    expect(songView(confirmed, [prep, c('2')]).results).toEqual([]);
  });
  it('keeps a pending concept (with its summary and concerns) beside older results, on the 3rd attempt too', () => {
    const c = (id: string, o: Partial<BetaJob> = {}) => job({ id, kind: 'concept', tier: 'hybrid', createdAt: `2026-10-27T0${id}:00:00Z`, ...o });
    const summary = { language: 'neon', languageName: '霓虹城市', font: 'Noto Sans TC', palette: ['#112233'], concept: '港口', concerns: '節奏慢', stills: ['still_10.00.png'] };
    const made = make('2');
    const third = c('5', { concept: summary });
    const v = songView(confirmed, [prep, made, c('3', { decision: 'adjusted' }), c('4', { decision: 'redone' }), third]);
    expect([v.concept, v.concept?.concept?.concerns, v.results, songKind(v)]).toEqual([third, '節奏慢', [made], 'concept']);
  });
  it('lists results newest first, held ones included', () => {
    const [a, b, c] = [make('1'), make('2', { status: 'admin' }), make('3', { status: 'failed' })];
    expect(songView(confirmed, [prep, a, b, c]).results).toEqual([b, a]);
  });
});

describe('songView with concept and fix jobs', () => {
  const prep = job({ id: 'p' });
  const confirmed = { ...song, confirmedAt: '2026-10-27T01:00:00Z' };
  const at = (id: string, o: Partial<BetaJob>) => job({ id, tier: 'img', createdAt: `2026-10-27T0${id}:00:00Z`, ...o });
  it('a queued or running concept or fix job is the active one', () => {
    for (const kind of ['concept', 'fix'] as const)
      for (const status of ['queued', 'running'] as const) {
        const j = at('2', { kind, status });
        expect(songView(confirmed, [prep, j]).active).toBe(j);
      }
    expect(songView(confirmed, [prep, at('2', { kind: 'concept', status: 'done' })]).active).toBeUndefined();
  });
  it('an automatic retry of a concept counts as retrying, and hides an older failure', () => {
    const v = songView(confirmed, [prep, at('2', { kind: 'make', status: 'failed' }), at('3', { kind: 'concept', status: 'queued', auto: true })]);
    expect(v.retrying).toBe(true);
    expect(v.failedFor).toBeUndefined();
  });
  it('a finished fix is a result too, and counts for 有成品', () => {
    const fix = at('3', { kind: 'fix', status: 'done' });
    const v = songView(confirmed, [prep, at('2', { kind: 'make', status: 'done' }), fix, at('4', { kind: 'fix', status: 'failed' })]);
    expect(v.results.map((j) => j.id)).toEqual(['3', '2']);
    expect(inFilter('made', songView(confirmed, [prep, fix]))).toBe(true);
  });
  it('keeps the failed make job for the failure card', () => {
    const failed = at('2', { kind: 'make', status: 'failed' });
    expect(songView(confirmed, [prep, failed]).failed).toBe(failed);
    expect(songView(confirmed, [prep, failed, at('3', { kind: 'make', status: 'running' })]).failed).toBeUndefined();
  });
  it('a failed concept or fix is the failure too, when it is the latest non-prep job', () => {
    for (const kind of ['concept', 'fix'] as const) {
      const failed = at('3', { kind, status: 'failed', auto: true });
      const v = songView(confirmed, [prep, at('2', { kind: 'make', status: 'done' }), failed]);
      expect([v.failed, v.failedFor, v.failedAuto, songKind(v)]).toEqual([failed, 'img', true, 'help']);
    }
    // a later success clears an older failure
    const v = songView(confirmed, [prep, at('2', { kind: 'concept', status: 'failed' }), at('3', { kind: 'concept', status: 'done', decision: 'accepted' })]);
    expect(v.failed).toBeUndefined();
  });
});

describe('songKind, nextStep and the list filters', () => {
  const base: SongView = { stage: 'ready', retrying: false, results: [] };
  const active = job({ kind: 'make', tier: 'img', status: 'running' });
  const concept = job({ id: 'c', kind: 'concept', tier: 'hybrid', status: 'done' });
  const result = job({ id: 'r', kind: 'make', tier: 'none', status: 'done' });
  const views: Record<string, SongView> = {
    preparing: { ...base, stage: 'preparing' },
    prepFailed: { ...base, stage: 'prepFailed' },
    timing: { ...base, stage: 'timing' },
    concept: { ...base, concept },
    making: { ...base, active },
    retrying: { ...base, active, retrying: true },
    help: { ...base, failedFor: 'img', results: [result] },
    ready: base,
    readyMade: { ...base, results: [result] },
  };
  it('names the state as the chip does', () => {
    expect(Object.fromEntries(Object.entries(views).map(([k, v]) => [k, songKind(v)]))).toEqual({
      preparing: 'preparing', prepFailed: 'prepFailed', timing: 'timing', concept: 'concept', making: 'making', retrying: 'retrying', help: 'help', ready: 'ready', readyMade: 'ready',
    });
  });
  it('says what to do next in each state', () => {
    expect(nextStep(views['preparing'], { leftMin: 4 })).toEqual({ label: '約剩 4 分', to: 'song' });
    expect(nextStep(views['preparing'])).toEqual({ label: '看進度', to: 'song' });
    expect(nextStep(views['timing'])).toEqual({ label: '確認時間', to: 'timing' });
    expect(nextStep(views['concept'])).toEqual({ label: '看概念', to: 'song' });
    expect(nextStep(views['making'], { leftMin: 21 })).toEqual({ label: '約剩 21 分', to: 'song' });
    expect(nextStep(views['retrying'], { leftMin: 9 })).toEqual({ label: '約剩 9 分', to: 'song' });
    expect(nextStep(views['help'])).toEqual({ label: '聯絡管理者', to: 'song' });
    expect(nextStep(views['prepFailed'])).toEqual({ label: '聯絡管理者', to: 'song' });
    expect(nextStep(views['ready'])).toEqual({ label: '製作新版本', to: 'song' });
    expect(nextStep(views['readyMade'])).toEqual({ label: '製作新版本', to: 'song' });
  });
  it('sorts songs into 要你處理, 進行中 and 有成品', () => {
    const pick = (f: Parameters<typeof inFilter>[0]) => Object.keys(views).filter((k) => inFilter(f, views[k]));
    expect(pick('all')).toEqual(Object.keys(views));
    expect(pick('todo')).toEqual(['prepFailed', 'timing', 'concept', 'help']);
    expect(pick('running')).toEqual(['preparing', 'making', 'retrying']);
    expect(pick('made')).toEqual(['help', 'readyMade']);
    expect(filterCounts(Object.values(views))).toEqual({ all: 9, todo: 4, running: 3, made: 2 });
    expect(filterCounts([])).toEqual({ all: 0, todo: 0, running: 0, made: 0 });
  });
});

describe('coverTint', () => {
  it('gives each song a stable tint from the palette', () => {
    expect(COVER_TINTS.length).toBeGreaterThanOrEqual(6);
    expect(coverTint('abc')).toBe(coverTint('abc'));
    expect(COVER_TINTS).toContain(coverTint('abc'));
    expect(COVER_TINTS).toContain(coverTint(''));
    const spread = new Set(Array.from({ length: 40 }, (_, i) => coverTint(`song-${i}`)));
    expect(spread.size).toBeGreaterThanOrEqual(5);
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
    expect(pageFor('/my/styles')).toBe('beta-styles');
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
  const concept = job({ id: 'c', kind: 'concept', tier: 'hybrid', status: 'done' });
  it('names each stage with its icon and tone', () => {
    expect(songChip({ ...base, stage: 'preparing' })).toEqual({ icon: '◐', label: '準備中', tone: 'info' });
    expect(songChip({ ...base, stage: 'prepFailed' })).toEqual({ icon: '!', label: '準備失敗', tone: 'bad' });
    expect(songChip({ ...base, stage: 'timing' })).toEqual({ icon: '◷', label: '待確認時間', tone: 'warn' });
    expect(songChip({ ...base, active })).toEqual({ icon: '●', label: '製作中', tone: 'making' });
    expect(songChip({ ...base, active: { ...active, status: 'queued' } })).toEqual({ icon: '●', label: '製作中', tone: 'making' });
    expect(songChip({ ...base, active, retrying: true })).toEqual({ icon: '↻', label: '自動重試中', tone: 'warn' });
    expect(songChip({ ...base, failedFor: 'img' })).toEqual({ icon: '!', label: '需要協助', tone: 'bad' });
    expect(songChip(base)).toEqual({ icon: '✓', label: '可製作', tone: 'ok' });
  });
  it('a concept waiting for the person wins over an older failure, a running job over the concept', () => {
    expect(songChip({ ...base, concept })).toEqual({ icon: '?', label: '概念待確認', tone: 'warn' });
    expect(songChip({ ...base, concept, failedFor: 'img' }).label).toBe('概念待確認');
    expect(songChip({ ...base, concept, active }).label).toBe('製作中');
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

describe('fix rules (mirror scripts/lyric-vj/beta/feedback.mts)', () => {
  const m = (...cats: (FeedbackCategory | null)[]) => cats.map((category) => ({ category }));

  it('fixKindFor: picture or timing only when every mark agrees', () => {
    expect(fixKindFor([])).toBeUndefined();
    expect(fixKindFor(m('picture', 'picture'))).toBe('picture');
    expect(fixKindFor(m('timing'))).toBe('timing');
    expect(fixKindFor(m('picture', 'timing'))).toBeUndefined();
    expect(fixKindFor(m('lyrics'))).toBeUndefined();
    expect(fixKindFor(m('picture', null))).toBeUndefined();
  });

  it('fixAllowed: pictures on img only, timing on every tier, nothing else', () => {
    expect(fixAllowed(m('picture'), 'img')).toBe(true);
    expect(fixAllowed(m('picture'), 'none')).toBe(false);
    expect(fixAllowed(m('picture'), 'hybrid')).toBe(false);
    expect(fixAllowed(m('picture'), undefined)).toBe(false);
    for (const tier of ['none', 'img', 'hybrid'] as const) expect(fixAllowed(m('timing', 'timing'), tier)).toBe(true);
    expect(fixAllowed(m('empty'), 'img')).toBe(false);
    expect(fixAllowed([], 'img')).toBe(false);
  });

  it('fixBlock gives one reason in order: marks, kind and tier, busy song, balance', () => {
    expect(FIX_PRICE).toBe(1);
    expect(fixBlock({ marks: [], tier: 'img' })).toBe('先標出有問題的地方');
    expect(fixBlock({ marks: m('picture', null), tier: 'img' })).toBe('每個標記先選一個類別');
    expect(fixBlock({ marks: m('lyrics'), tier: 'img' })).toBe(NOT_FIXABLE);
    expect(fixBlock({ marks: m('picture', 'timing'), tier: 'img' })).toBe(NOT_FIXABLE);
    expect(fixBlock({ marks: m('picture'), tier: 'hybrid' })).toBe('只有插圖版能拿掉圖片');
    expect(fixBlock({ marks: m('picture'), tier: 'img', active: true })).toBe('這首歌已經在排隊或製作中');
    expect(fixBlock({ marks: m('timing'), tier: 'none', left: 0.99 })).toBe('餘額不足，請聯絡管理者');
    expect(fixBlock({ marks: m('timing'), tier: 'none', left: 1 })).toBeNull();
    expect(fixBlock({ marks: m('timing'), tier: 'none', left: 0.1 + 0.9 })).toBeNull();
    expect(fixBlock({ marks: m('picture'), tier: 'img', left: null })).toBeNull();
    expect(fixBlock({ marks: m('picture', 'picture'), tier: 'img', left: 14.5 })).toBeNull();
  });
});
