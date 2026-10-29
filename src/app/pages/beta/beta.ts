// What the beta pages read from scripts/lyric-vj/beta/server.mts, and where a song stands.
import { STATUS_CHIP, StatusChip, StatusKind } from './ui/status';

export type BetaTier = 'none' | 'img' | 'hybrid';
export interface BetaMe { id: string; name: string; admin: boolean; disabled?: boolean; limitUsd: number; spentUsd: number }
export interface BetaSong { id: string; userId: string; title: string; artist: string; language: string; createdAt: string; confirmedAt?: string }
export interface BetaJob { id: string; songId: string; kind: 'prep' | 'concept' | 'make' | 'fix'; tier?: BetaTier; status: 'queued' | 'running' | 'done' | 'failed' | 'admin'; phase?: string; createdAt: string; startedAt?: string; endedAt?: string; steps?: { phase: string; at: string }[]; priceUsd?: number; retryOf?: string; auto?: boolean; style?: string; decision?: 'accepted' | 'adjusted' | 'redone'; conceptOf?: string; nothingToRemove?: boolean; inputs?: BetaJobInputs; concept?: ConceptSummary }

/** What a concept job was asked for (`job.inputs` on the server). */
export interface BetaJobInputs { concept?: string; style?: string; refs?: string[]; note?: string; from?: string }

/**
 * A finished concept as the gate shows it; mirrors ConceptSummary in scripts/lyric-vj/beta/concept-summary.mts
 * (the server leaves `candidateReason` out for the person). `concept` is the story text, `stills` file names under stills/.
 */
export interface ConceptSummary {
  language: string; languageName: string; font: string; palette: string[];
  concept: string; briefReading?: string; concerns?: string; stills: string[];
  interludes?: { start: number; end: number; mode: 'backdrop' | 'pictures'; reason?: string }[];
}

/** The fee when a song is uploaded (vocals split, lyric timing); mirrors PRICE.prep in scripts/lyric-vj/beta/store.mts. */
export const PREP_PRICE = 0.5;

/** The audio upload limit; mirrors MAX_AUDIO in scripts/lyric-vj/beta/server.mts. */
export const MAX_AUDIO_BYTES = 80_000_000;
/** The content types `PUT /beta/songs/:id/audio` takes (AUDIO in server.mts). */
const AUDIO_TYPES = new Set(['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/flac', 'audio/x-flac', 'audio/mp4', 'audio/x-m4a', 'audio/aac']);
/** The type sent for a file the browser left untyped or typed oddly (Safari and .flac, say), by its extension. */
const AUDIO_BY_EXT: Record<string, string> = { mp3: 'audio/mpeg', wav: 'audio/wav', flac: 'audio/flac', m4a: 'audio/mp4', aac: 'audio/aac' };
/** The server's own refusals (server.mts), shown before the upload starts. */
export const AUDIO_TOO_BIG = '音檔太大（上限 80 MB）';
export const AUDIO_WRONG_TYPE = '請上傳 mp3、wav、flac、m4a 或 aac';
export const AUDIO_EMPTY = '沒有收到音檔';

/**
 * The content type to send for an audio file: its own when the server takes it, else by its extension. Null (the
 * server would answer 415) only when the type or the extension is known and not allowed; a file with neither (no type,
 * no extension) goes as mp3, as before, and the server decides.
 */
export function audioType(file: { name: string; type: string }): string | null {
  const own = file.type.split(';')[0].trim().toLowerCase();
  if (AUDIO_TYPES.has(own)) return own;
  const dot = file.name.lastIndexOf('.');
  const ext = dot > 0 ? file.name.slice(dot + 1).toLowerCase() : '';
  if (ext) return AUDIO_BY_EXT[ext] ?? null;
  const untyped = !own || own === 'application/octet-stream';
  return untyped ? 'audio/mpeg' : null;
}

/** The error line of a failed answer: the server's `error`, else the status, so no toast ever reads 「undefined」. */
export const errorOf = (body: { error?: unknown } | null | undefined, status: number): string =>
  typeof body?.error === 'string' && body.error ? body.error : `HTTP ${status}`;

/** Why a picked audio file cannot be uploaded (the server's words), or null when the upload may start. */
export function audioProblem(file: { name: string; type: string; size: number }): string | null {
  if (!audioType(file)) return AUDIO_WRONG_TYPE;
  if (file.size > MAX_AUDIO_BYTES) return AUDIO_TOO_BIG;
  if (!file.size) return AUDIO_EMPTY;
  return null;
}
/** The concept fee every version starts with; mirrors PRICE.concept in scripts/lyric-vj/beta/store.mts. */
export const CONCEPT_PRICE = 2.5;

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
const PROPS = step('正在設計並畫出插圖道具', 5, '畫道具');
const STORY = [step('導演正在寫故事、設計角色', 8, '寫故事、畫角色'), step('正在畫故事畫面', 12, '畫故事畫面')];

/**
 * The steps of each job, in the order its script (prep.sh, concept.sh, fix, make.sh) runs them. A make starts from an
 * accepted concept, whose run already holds the director's treatment and the text plan of the 文字動態版 and 故事版
 * (make.sh skips those on sight), so they are neither counted nor shown; the 插圖版 plans its text again with the props.
 */
export const JOB_STEPS: Record<'prep' | 'concept' | 'fix' | BetaTier, JobStep[]> = {
  concept: [...DIRECT, TEXT, step('正在準備示意畫面', 2, '準備示意畫面'), step('正在整理概念', 0.5, '整理概念')],
  fix: [step('套用修正', 1, '套用修正'), ...TAIL],
  prep: [step('讀取音檔', 0.5, '讀取音檔'), step('分離人聲與伴奏', 5, '分離人聲'), step('對齊歌詞時間', 8, '對齊歌詞時間'), step('檢查錯字', 3, '檢查錯字')],
  none: [...TAIL],
  img: [PROPS, TEXT, ...TAIL],
  hybrid: [...STORY, ...TAIL],
};

/** The whole minutes a job kind is estimated to take, as every 約 N 分鐘 in a confirm dialog states it. */
export const stepsMin = (kind: keyof typeof JOB_STEPS): number => Math.round(JOB_STEPS[kind].reduce((s, x) => s + x.min, 0));

const tierInfo = (tier: BetaTier, name: string, about: string, rest: number) =>
  ({ name, about, concept: CONCEPT_PRICE, rest, price: CONCEPT_PRICE + rest, min: stepsMin('concept') + stepsMin(tier) });

/**
 * The three versions. `concept` and `rest` mirror PRICE.concept and PRICE[tier] in scripts/lyric-vj/beta/store.mts;
 * `price` is what the person pays in all (TIER_TOTAL there); `min` is the minutes from concept to video, the concept
 * steps plus the make steps, each rounded as its dialog states it, so the card's 約 N 分 is the two dialogs' sum.
 */
export const TIER_INFO: Record<BetaTier, { name: string; about: string; concept: number; rest: number; price: number; min: number }> = {
  none: tierInfo('none', '文字動態版', '只有歌詞文字與圖形動態，沒有插圖。', 1.5),
  img: tierInfo('img', '插圖版', '文字動態加上配合歌詞的插圖道具。', 3.5),
  hybrid: tierInfo('hybrid', '故事版', '依歌詞編出故事，有角色與畫面。', 13.5),
};

/** The step list for a job: by its kind, and for a make job by its tier; anything unknown reads as the text version. */
const jobSteps = (job: BetaJob): JobStep[] =>
  (job.kind === 'make' ? JOB_STEPS[job.tier ?? 'none'] : JOB_STEPS[job.kind]) ?? JOB_STEPS.none;

export interface JobProgress { label: string; index: number; steps: JobStep[]; pct: number; leftMin: number }

/**
 * How far a running job is: the steps before its current phase count in full, the current one by the time since
 * its recorded start (else since the job started, beyond them), held under 90 % of its estimate so the bar never claims a step is done early.
 */
export function jobProgress(job: BetaJob, now = Date.now()): JobProgress {
  const steps = jobSteps(job);
  const total = steps.reduce((s, x) => s + x.min, 0);
  const at = steps.findIndex((x) => x.phases.includes(job.phase ?? ''));
  // a phase outside the list (a step make.sh skipped, 等你確認概念, 完成) keeps the bar on the last step recorded
  const known = (job.steps ?? []).map((x) => steps.findIndex((y) => y.phases.includes(x.phase))).filter((i) => i >= 0);
  const index = at >= 0 ? at : Math.max(0, ...known);
  if (job.status !== 'running') return { label: '排隊中', index: 0, steps, pct: 0, leftMin: Math.ceil(total) };
  const before = steps.slice(0, index).reduce((s, x) => s + x.min, 0);
  // the recorded start of the current step (the last entry of its phase: a restart can repeat one); else the old estimate
  const stepAt = job.steps?.filter((x) => x.phase === job.phase).at(-1)?.at;
  const elapsed = job.startedAt ? (now - Date.parse(job.startedAt)) / 60_000 : 0;
  const into = Math.min(Math.max(0, stepAt ? (now - Date.parse(stepAt)) / 60_000 : elapsed - before), steps[index].min * 0.9);
  const doneMin = before + into;
  return { label: steps[index].label, index, steps, pct: Math.min(99, Math.round((doneMin / total) * 100)), leftMin: Math.max(1, Math.ceil(total - doneMin)) };
}

/**
 * Orders overlapping polls: `begin()` numbers a request and `latest(n)` stays true until a newer one began, so a slow
 * answer never overwrites a fresher one.
 */
export function pollOrder(): { begin: () => number; latest: (n: number) => boolean } {
  let n = 0;
  return { begin: () => ++n, latest: (k) => k === n };
}

/**
 * The toast a failed poll wrote (「HTTP 502」 while the tunnel blinks): `failed` records it, and `ok` on the next poll
 * that succeeds clears it, and only it, so a toast an action wrote meanwhile stays.
 */
export function pollToast(): { failed: (why: string) => string; ok: (current: string) => string } {
  let last: string | null = null;
  return {
    failed: (why) => (last = why),
    ok: (current) => {
      const clear = last !== null && current === last;
      last = null;
      return clear ? '' : current;
    },
  };
}

/**
 * A response's JSON; a proxy's error page (a 502 while the tunnel is down) is not JSON and then reads as
 * `{ error: 'HTTP 502' }`, so the caller shows a line instead of a SyntaxError nobody sees.
 */
export async function jsonOrError<T = unknown>(r: { status: number; json(): Promise<unknown> }): Promise<T & { error?: string }> {
  try {
    return (await r.json()) as T & { error?: string };
  } catch {
    return { error: `HTTP ${r.status}` } as T & { error?: string };
  }
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

/** The fix fee; mirrors PRICE.fix in scripts/lyric-vj/beta/store.mts. */
export const FIX_PRICE = 1;
/** What a fix job does: take the pictures out of the marked stretches, or re-apply the song's new timing. */
export type FixKind = 'picture' | 'timing';
/** Mirrors fixKindFor in scripts/lyric-vj/beta/feedback.mts: `picture` or `timing` when every mark (at least one) is that category, else undefined. */
export function fixKindFor(marks: readonly { category: FeedbackCategory | null }[]): FixKind | undefined {
  const kind = marks[0]?.category;
  return (kind === 'picture' || kind === 'timing') && marks.every((m) => m.category === kind) ? kind : undefined;
}
/** Whether the server's parseFeedback accepts a fix for these marks on this tier: pictures come out of 插圖版 only, timing on any tier. */
export const fixAllowed = (marks: readonly { category: FeedbackCategory | null }[], tier?: BetaTier): boolean => {
  const kind = fixKindFor(marks);
  return !!kind && (kind !== 'picture' || tier === 'img');
};
/** The server's answer to a fix it cannot do (NOT_FIXABLE in feedback.mts). */
export const NOT_FIXABLE = '這類問題目前只能重做或只回報';

export interface FixState { marks: readonly { category: FeedbackCategory | null }[]; tier?: BetaTier; active?: boolean; left?: number | null }

/** Why the 修正 card is off (one line), or null when the server would take the fix: the marks' kind and the tier first, then the song being busy, then the fee against the balance. */
export function fixBlock(s: FixState): string | null {
  if (!s.marks.length) return '先標出有問題的地方';
  if (s.marks.some((m) => !m.category)) return '每個標記請選一個類別';
  if (!fixAllowed(s.marks, s.tier)) return fixKindFor(s.marks) === 'picture' ? '只有插圖版能拿掉圖片' : NOT_FIXABLE;
  if (s.active) return '這首歌已經在排隊或製作中';
  // in cents, so float noise never makes a balance look short
  if (s.left !== undefined && s.left !== null && Math.round(FIX_PRICE * 100) > Math.round(s.left * 100)) return '餘額不足，請聯絡管理者';
  return null;
}

export interface SongView {
  stage: 'preparing' | 'prepFailed' | 'timing' | 'ready';
  /** Preparing with no prep job at all: the song was created but its audio never arrived (a refused or broken upload). */
  noAudio?: boolean;
  prep?: BetaJob;
  active?: BetaJob;
  retrying: boolean;
  failedFor?: BetaTier;
  /** True when the last failed job was the system's own automatic retry (so "the system retried" is true). */
  failedAuto?: boolean;
  results: BetaJob[];
  /** The failed make, concept or fix job behind `failedFor`, for the failure card. */
  failed?: BetaJob;
  /** The newest finished concept the person has not accepted, adjusted or redone yet (the first of `concepts`). */
  concept?: BetaJob;
  /** Every finished concept awaiting a decision, newest first: the server keeps one pending per version, each paid for. */
  concepts: BetaJob[];
}

/** One song as the detail page shows it: its stage, the running make, concept or fix job, and the finished (or held) make and fix results, newest first. */
export function songView(song: BetaSong, jobs: BetaJob[]): SongView {
  const mine = jobs.filter((j) => j.songId === song.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const prep = mine.filter((j) => j.kind === 'prep').at(-1);
  const base = { prep, retrying: false, results: [] as BetaJob[], concepts: [] as BetaJob[] };
  if (!prep) return { ...base, stage: 'preparing', noAudio: true };
  if (prep.status === 'queued' || prep.status === 'running') return { ...base, stage: 'preparing' };
  if (prep.status === 'failed') return { ...base, stage: 'prepFailed' };
  if (!song.confirmedAt) return { ...base, stage: 'timing' };
  // a concept or fix run is work in progress too: the song is busy until it ends
  const active = mine.find((j) => j.kind !== 'prep' && (j.status === 'queued' || j.status === 'running'));
  // the latest make, concept or fix decides whether the song needs help; a later success clears an older failure
  const last = mine.filter((j) => j.kind !== 'prep').at(-1);
  const failed = !active && last?.status === 'failed' ? last : undefined;
  const concepts = mine.filter((j) => j.kind === 'concept' && j.status === 'done' && !j.decision).reverse();
  return {
    ...base,
    stage: 'ready',
    active,
    retrying: active?.auto === true,
    failedFor: failed ? (failed.tier ?? 'none') : undefined,
    failedAuto: failed ? failed.auto === true : undefined,
    failed,
    // a fix re-renders a result into a new video, so it is a result of its own
    results: mine.filter((j) => (j.kind === 'make' || j.kind === 'fix') && (j.status === 'done' || j.status === 'admin')).reverse(),
    concept: concepts[0],
    concepts,
  };
}

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
  if (v.stage === 'preparing' && v.noAudio) return 'noAudio';
  if (v.stage !== 'ready') return v.stage;
  if (v.active) return v.retrying ? 'retrying' : 'making';
  if (v.concept) return 'concept';
  if (v.failed ?? v.failedFor) return 'help';
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
    case 'noAudio': return song('重新上傳音檔');
    // the page shows what failed and that it is on record; there is no contact action to name
    case 'help':
    case 'prepFailed': return song('看失敗原因');
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
const FILTER_KINDS: Partial<Record<SongFilter, StatusKind[]>> = { todo: ['noAudio', 'timing', 'concept', 'help', 'prepFailed'], running: ['preparing', 'making', 'retrying'] };

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
