// What the beta pages read from scripts/lyric-vj/beta/server.mts, and where a song stands.

export type BetaTier = 'none' | 'img' | 'hybrid';
export interface BetaMe { id: string; name: string; admin: boolean; disabled?: boolean; limitUsd: number; spentUsd: number }
export interface BetaSong { id: string; userId: string; title: string; artist: string; language: string; createdAt: string; confirmedAt?: string }
export interface BetaJob { id: string; songId: string; kind: 'prep' | 'make'; tier?: BetaTier; status: 'queued' | 'running' | 'done' | 'failed' | 'admin'; phase?: string; createdAt: string; startedAt?: string; endedAt?: string; steps?: { phase: string; at: string }[]; priceUsd?: number; costUsd?: number; retryOf?: string; auto?: boolean; style?: string }

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
  results: BetaJob[];
}

/** One song as the detail page shows it: its stage, the running make job, and the finished (or held) results, newest first. */
export function songView(song: BetaSong, jobs: BetaJob[]): SongView {
  const mine = jobs.filter((j) => j.songId === song.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const prep = mine.filter((j) => j.kind === 'prep').at(-1);
  const base = { prep, retrying: false, results: [] as BetaJob[] };
  if (!prep || prep.status === 'queued' || prep.status === 'running') return { ...base, stage: 'preparing' };
  if (prep.status === 'failed') return { ...base, stage: 'prepFailed' };
  if (!song.confirmedAt) return { ...base, stage: 'timing' };
  const makes = mine.filter((j) => j.kind === 'make');
  const active = makes.find((j) => j.status === 'queued' || j.status === 'running');
  const last = makes.at(-1);
  return {
    ...base,
    stage: 'ready',
    active,
    retrying: active?.auto === true,
    failedFor: !active && last?.status === 'failed' ? last.tier : undefined,
    results: makes.filter((j) => j.status === 'done' || j.status === 'admin').reverse(),
  };
}

/** Whole minutes from `a` to `b`, rounded up; undefined when either is missing. */
export const minutesBetween = (a?: string, b?: string): number | undefined => (a && b ? Math.ceil((Date.parse(b) - Date.parse(a)) / 60000) : undefined);
