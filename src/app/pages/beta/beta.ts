// What the beta pages read from scripts/lyric-vj/beta/server.mts, and where a song stands.
import { STATUS_CHIP, StatusChip, StatusKind } from './ui/status';

export type BetaTier = 'none' | 'img' | 'hybrid';
export interface BetaMe { id: string; name: string; admin: boolean; disabled?: boolean; limitUsd: number; spentUsd: number }
export interface BetaSong { id: string; userId: string; title: string; artist: string; language: string; createdAt: string; confirmedAt?: string }
export interface BetaJob { id: string; songId: string; kind: 'prep' | 'concept' | 'make' | 'fix'; tier?: BetaTier; status: 'queued' | 'running' | 'done' | 'failed' | 'admin'; phase?: string; createdAt: string; startedAt?: string; endedAt?: string; steps?: { phase: string; at: string }[]; priceUsd?: number; costUsd?: number; retryOf?: string; auto?: boolean; style?: string; decision?: 'accepted' | 'adjusted' | 'redone' }

/** The fee when a song is uploaded (vocals split, lyric timing); mirrors PRICE.prep in scripts/lyric-vj/beta/store.mts. */
export const PREP_PRICE = 0.5;

/** The three versions; `price` mirrors PRICE in scripts/lyric-vj/beta/store.mts. */
export const TIER_INFO: Record<BetaTier, { name: string; about: string; price: number; minutes: string }> = {
  none: { name: '文字動態版', about: '只有歌詞文字與圖形動態，沒有插圖。', price: 4, minutes: '約 25 分鐘' },
  img: { name: '插圖版', about: '文字動態加上配合歌詞的插圖道具。', price: 6, minutes: '約 30 分鐘' },
  hybrid: { name: '故事版', about: '依歌詞編出故事，有角色與畫面。', price: 16, minutes: '約 45 分鐘' },
};

/** One step of a job as the person reads it; `phases` are the ##PHASE labels its script prints for it. */
export interface JobStep { phases: string[]; label: string; min: number }

const step = (label: string, min: number, ...phases: string[]): JobStep => ({ label, min, phases });
// ponytail: minutes are estimates (the 導演 steps and prep measured once, on 行星, 2026-10-27; the rest split the tier's
// total); record each phase's start time in queue.mts and average past jobs when the estimates drift
const DIRECT = [
  step('導演正在讀歌詞、規劃段落與故事', 3, '導演設計', '導演規劃段落與故事'),
  step('導演正在修正故事草稿', 3, '導演修正故事草稿'),
  step('導演正在選風格、設計畫面', 3, '導演設計視覺風格'),
];
const TEXT = step('正在編排歌詞文字動態', 4, '編排文字動態');
const TAIL = [step('正在畫背景剪影', 2, '畫背景剪影'), step('正在繪製並輸出影片', 10, '輸出影片')];

/** The steps of each job, in the order its script (prep.sh, make.sh) runs them. */
export const JOB_STEPS: Record<'prep' | BetaTier, JobStep[]> = {
  prep: [step('讀取音檔', 0.5, '讀取音檔'), step('分離人聲與伴奏', 5, '分離人聲'), step('對齊歌詞時間', 8, '對齊歌詞時間'), step('檢查錯字', 3, '檢查錯字')],
  none: [...DIRECT, TEXT, ...TAIL],
  img: [...DIRECT, step('正在設計並畫出插圖道具', 5, '畫道具'), TEXT, ...TAIL],
  hybrid: [...DIRECT, TEXT, step('導演正在寫故事、設計角色', 8, '寫故事、畫角色'), step('正在畫故事畫面', 12, '畫故事畫面'), ...TAIL],
};

export interface JobProgress { label: string; index: number; steps: JobStep[]; pct: number; leftMin: number }

/**
 * How far a running job is: the steps before its current phase count in full, the current one by the time since
 * its recorded start (else since the job started, beyond them), held under 90 % of its estimate so the bar never claims a step is done early.
 */
export function jobProgress(job: BetaJob, now = Date.now()): JobProgress {
  const steps = JOB_STEPS[job.kind === 'prep' ? 'prep' : job.tier!];
  const total = steps.reduce((s, x) => s + x.min, 0);
  const at = steps.findIndex((x) => x.phases.includes(job.phase ?? ''));
  const index = Math.max(0, at);
  if (job.status !== 'running') return { label: '排隊中', index: 0, steps, pct: 0, leftMin: Math.ceil(total) };
  const before = steps.slice(0, index).reduce((s, x) => s + x.min, 0);
  // the recorded start of the current step (the last entry of its phase: a restart can repeat one); else the old estimate
  const stepAt = job.steps?.filter((x) => x.phase === job.phase).at(-1)?.at;
  const elapsed = job.startedAt ? (now - Date.parse(job.startedAt)) / 60_000 : 0;
  const into = Math.min(Math.max(0, stepAt ? (now - Date.parse(stepAt)) / 60_000 : elapsed - before), steps[index].min * 0.9);
  const doneMin = before + into;
  return { label: steps[index].label, index, steps, pct: Math.min(99, Math.round((doneMin / total) * 100)), leftMin: Math.max(1, Math.ceil(total - doneMin)) };
}

export type SongStage =
  | { step: 'preparing'; label: string; job?: BetaJob }
  | { step: 'prepFailed' }
  | { step: 'timing' }
  | { step: 'ready'; making: { tier: BetaTier; label: string; job: BetaJob }[]; done: BetaTier[]; held: BetaTier[]; failed: BetaTier[]; videos: { tier: BetaTier; jobId: string }[] };

/** Where a song stands: being prepared, waiting for its timing, or ready with its versions' states. */
export function songStage(song: BetaSong, jobs: BetaJob[]): SongStage {
  const mine = jobs.filter((j) => j.songId === song.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const prep = mine.filter((j) => j.kind === 'prep').at(-1);
  if (!prep) return { step: 'preparing', label: '等待上傳' };
  if (prep.status === 'queued') return { step: 'preparing', label: '排隊中', job: prep };
  if (prep.status === 'running') return { step: 'preparing', label: prep.phase ?? '準備中', job: prep };
  if (prep.status === 'failed') return { step: 'prepFailed' };
  if (!song.confirmedAt) return { step: 'timing' };
  // the latest job of each version decides its state
  const last = new Map<BetaTier, BetaJob>();
  for (const j of mine) if (j.kind === 'make' && j.tier) last.set(j.tier, j);
  const all = [...last.values()];
  const tiers = (s: BetaJob['status'][]) => all.filter((j) => s.includes(j.status)).map((j) => j.tier!);
  return {
    step: 'ready',
    making: all.filter((j) => j.status === 'queued' || j.status === 'running').map((j) => ({ tier: j.tier!, label: j.status === 'queued' ? '排隊中' : (j.phase ?? '製作中'), job: j })),
    done: tiers(['done']),
    held: tiers(['admin']),
    failed: tiers(['failed']),
    videos: (['none', 'img', 'hybrid'] as BetaTier[]).flatMap((tier) => {
      const j = mine.filter((x) => x.kind === 'make' && x.tier === tier && x.status === 'done').at(-1);
      return j ? [{ tier, jobId: j.id }] : [];
    }),
  };
}

export type FeedbackCategory = 'lyrics' | 'timing' | 'picture' | 'empty' | 'style' | 'rhythm' | 'other';
export type FeedbackAction = 'fix' | 'redo' | 'none';
export interface FeedbackMark { at: number; end?: number; category: FeedbackCategory; note: string }
export interface BetaFeedback { id: string; jobId: string; songId: string; userId: string; ok: boolean; marks: FeedbackMark[]; suggestion: string; action: FeedbackAction; createdAt: string; tier?: BetaTier; style?: string }
export const FEEDBACK_CATEGORIES: { id: FeedbackCategory; label: string }[] = [
  { id: 'lyrics', label: '歌詞看不清' },
  { id: 'timing', label: '時間不準' },
  { id: 'picture', label: '圖片不搭' },
  { id: 'empty', label: '畫面空' },
  { id: 'style', label: '風格不對' },
  { id: 'rhythm', label: '節奏轉場' },
  { id: 'other', label: '其他' },
];

export interface SongView {
  stage: 'preparing' | 'prepFailed' | 'timing' | 'ready';
  prep?: BetaJob;
  active?: BetaJob;
  retrying: boolean;
  failedFor?: BetaTier;
  /** True when the last failed job was the system's own automatic retry (so "the system retried" is true). */
  failedAuto?: boolean;
  results: BetaJob[];
  /** The newest finished concept the person has not accepted, adjusted or redone yet. */
  concept?: BetaJob;
}

/** One song as the detail page shows it: its stage, the running make, concept or fix job, and the finished (or held) results, newest first. */
export function songView(song: BetaSong, jobs: BetaJob[]): SongView {
  const mine = jobs.filter((j) => j.songId === song.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const prep = mine.filter((j) => j.kind === 'prep').at(-1);
  const base = { prep, retrying: false, results: [] as BetaJob[] };
  if (!prep || prep.status === 'queued' || prep.status === 'running') return { ...base, stage: 'preparing' };
  if (prep.status === 'failed') return { ...base, stage: 'prepFailed' };
  if (!song.confirmedAt) return { ...base, stage: 'timing' };
  const makes = mine.filter((j) => j.kind === 'make');
  // a concept or fix run is work in progress too: the song is busy until it ends
  const active = mine.find((j) => j.kind !== 'prep' && (j.status === 'queued' || j.status === 'running'));
  const last = makes.at(-1);
  return {
    ...base,
    stage: 'ready',
    active,
    retrying: active?.auto === true,
    failedFor: !active && last?.status === 'failed' ? last.tier : undefined,
    failedAuto: !active && last?.status === 'failed' ? last.auto === true : undefined,
    results: makes.filter((j) => j.status === 'done' || j.status === 'admin').reverse(),
    concept: mine.filter((j) => j.kind === 'concept' && j.status === 'done' && !j.decision).at(-1),
  };
}

/** The notice under a song whose last make job failed for good; claims an automatic retry only when one really failed. */
export const failedNotice = (auto?: boolean) => (auto ? '上一次製作失敗，系統已自動重試仍未成功，管理者會協助處理' : '上一次製作失敗，管理者會協助處理');

/** Job status as the admin pages read it. */
export const STATUS: Record<BetaJob['status'], string> = { queued: '排隊中', running: '製作中', done: '完成', failed: '失敗', admin: '等你確認' };
/** What a feedback report asked for, as the admin pages read it. */
export const ACTION: Record<FeedbackAction, string> = { none: '只回報', fix: '修正', redo: '重做' };

/** The id of the job that already re-ran `j` (its automatic or admin retry), if any. */
export const retriedBy = (jobs: { id: string; retryOf?: string }[], j: { id: string }) => jobs.find((x) => x.retryOf === j.id)?.id;

/** One line under a result card summarising the reports on it; empty when none. */
export function feedbackLine(list: Pick<BetaFeedback, 'ok' | 'createdAt'>[]): string {
  const last = [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).at(-1);
  if (!last) return '';
  const d = new Date(last.createdAt);
  const day = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return `已回報 ${list.length} 次・最近：${last.ok ? '沒問題' : '有問題'}・${day}`;
}

/** Whole minutes from `a` to `b`, rounded up; undefined when either is missing. */
export const minutesBetween = (a?: string, b?: string): number | undefined => (a && b ? Math.ceil((Date.parse(b) - Date.parse(a)) / 60000) : undefined);

export type SongChip = StatusChip;

/** Which state a song is in, as its chip names it; a running job first, then a concept waiting for the person, then a failure. */
export function songKind(v: SongView): StatusKind {
  if (v.stage !== 'ready') return v.stage;
  if (v.active) return v.retrying ? 'retrying' : 'making';
  if (v.concept) return 'concept';
  if (v.failedFor) return 'help';
  return 'ready';
}

/** The status chip a song shows on its card and its page. */
export const songChip = (v: SongView): SongChip => STATUS_CHIP[songKind(v)];

/** The 「下一步 →」 link on a song card: its words, and whether it opens the timing editor or the song page. */
export interface NextStep { label: string; to: 'song' | 'timing' }

/** What the person does next with a song; `progress` is the running job's (prep or make), for the minutes left. */
export function nextStep(v: SongView, progress?: Pick<JobProgress, 'leftMin'>): NextStep {
  const song = (label: string): NextStep => ({ label, to: 'song' });
  switch (songKind(v)) {
    case 'preparing':
    case 'making':
    case 'retrying':
      return song(progress ? `約剩 ${progress.leftMin} 分` : '看進度');
    case 'timing': return { label: '確認時間', to: 'timing' };
    case 'concept': return song('看概念');
    case 'help':
    case 'prepFailed': return song('聯絡管理者');
    default: return song('製作新版本');
  }
}

/** The list's filter chips: 要你處理 waits on the person (or the admin, after a failure), 進行中 is running, 有成品 has a video. */
export type SongFilter = 'all' | 'todo' | 'running' | 'made';
export const SONG_FILTERS: { id: SongFilter; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'todo', label: '要你處理' },
  { id: 'running', label: '進行中' },
  { id: 'made', label: '有成品' },
];
const FILTER_KINDS: Partial<Record<SongFilter, StatusKind[]>> = { todo: ['timing', 'concept', 'help', 'prepFailed'], running: ['preparing', 'making', 'retrying'] };

export function inFilter(f: SongFilter, v: SongView): boolean {
  if (f === 'all') return true;
  if (f === 'made') return v.results.length > 0;
  return FILTER_KINDS[f]!.includes(songKind(v));
}

export const filterCounts = (views: SongView[]): Record<SongFilter, number> =>
  Object.fromEntries(SONG_FILTERS.map(({ id }) => [id, views.filter((v) => inFilter(id, v)).length])) as Record<SongFilter, number>;

/** Stripe tints for song covers (the 1b artboard's five, plus three in the same muted range). */
export const COVER_TINTS = ['#2a4a5a', '#5a3a8a', '#3a4a6a', '#6a3a4a', '#2a5a4a', '#5a4a2a', '#4a3a6a', '#2a5a5a'];

/** A song's cover tint, fixed by its id (FNV-1a hash), so it stays the same on every visit. */
export function coverTint(id: string): string {
  let h = 0x811c9dc5;
  for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193);
  return COVER_TINTS[(h >>> 0) % COVER_TINTS.length];
}

/** One line of a song's event log, as written by scripts/lyric-vj/beta/events.mts. */
export type BetaEvent = { at: string; type: string; jobId?: string; by?: string; [k: string]: unknown };
export interface TimelineRow { jobId?: string; title: string; at: string; detail?: string; tone: 'ok' | 'warn' | 'bad' | 'info' }

/** Turn raw song events into readable rows (one per event, Chinese titles, tone for the colour). */
export function timeline(events: BetaEvent[]): TimelineRow[] {
  return events.map((e): TimelineRow => {
    const row = (title: string, tone: TimelineRow['tone'] = 'info', detail?: string): TimelineRow => ({ jobId: e.jobId, title, at: e.at, tone, ...(detail ? { detail } : {}) });
    const retry = e['retryOf'] ? `重試 ${e['retryOf']}` : undefined;
    switch (e.type) {
      case 'song.created': return row('建立歌曲');
      case 'audio.uploaded': return row('上傳音檔');
      case 'timing.saved': return row(e['confirmed'] ? '確認時間' : '儲存時間');
      case 'job.queued': return row(e['auto'] ? '排隊（自動重試）' : '排隊');
      case 'job.started': return row('開始');
      case 'job.phase': return row(`步驟：${e['phase']}`);
      case 'job.cost': return row(`費用 $${Number(e['usd']).toFixed(3)}（${e['key']}）`);
      case 'job.ended': {
        const status = String(e['status']);
        const tone = status === 'done' ? 'ok' : status === 'failed' || status === 'timeout' || status === 'fused' ? 'bad' : 'info';
        return row(`結束：${status}`, tone, [e['error'], e['unsettled'] ? `中斷於 ${e['unsettled']}` : ''].filter(Boolean).join('；') || undefined);
      }
      case 'job.fused': return row('保險絲觸發', 'bad');
      case 'job.requeued': return row('重開機後重新排隊', 'warn');
      case 'job.autoretry': return row('自動重試', 'warn', retry);
      case 'job.autoretry.skipped': return row('略過自動重試（全站額度不足）', 'warn', retry);
      case 'admin.retry': return row('管理者重跑', 'info', retry);
      case 'admin.approve': return row('管理者放行');
      case 'feedback.submitted': return row('使用者回報', 'info', e['action'] ? `處理：${ACTION[e['action'] as FeedbackAction] ?? e['action']}` : undefined);
      case 'queue.orphan.timeout': return row('殘留程序未結束', 'bad');
      default: return row(e.type);
    }
  });
}
