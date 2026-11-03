// What the song page shows that is not the song's state itself: hero tone, result names and totals, step clocks, the failure card.
import { BetaJob, BetaTier, CONCEPT_PRICE, FIX_PRICE, jobProgress, SongView, OFFERED_TIERS, TIER_INFO } from './beta';
import { formatPrice } from './ui/price';
import { StatusKind } from './ui/status';

/** The hero's colour: blue while preparing (3a), red when help is needed (3b) or the audio never arrived, else a shade of the cover tint (1b-2). */
export type HeroTone = 'info' | 'bad' | 'cover';
export const heroTone = (k: StatusKind): HeroTone => (k === 'preparing' ? 'info' : k === 'help' || k === 'prepFailed' || k === 'noAudio' ? 'bad' : 'cover');

/**
 * Whether the song page offers 重新上傳音檔: the audio never arrived, or the preparation failed. Mirrors the server,
 * which takes a new PUT /audio while no prep job other than a failed one stands.
 */
export const canReupload = (v: Pick<SongView, 'stage' | 'noAudio'>): boolean => v.stage === 'prepFailed' || (v.stage === 'preparing' && !!v.noAudio);

/**
 * The hero's note beside 歌詞時間已確認 while concepts await a decision: a conditional, since the timing may well stay as
 * it is (the server refuses to accept a pending concept once the timing changed). Empty when none is pending.
 */
export function timingNote(pending: number): string {
  if (pending <= 0) return '';
  return pending === 1 ? '（若再改時間，待確認的概念要重新產生）' : `（若再改時間，${pending} 個待確認的概念都要重新產生）`;
}

/**
 * A result's number among the song's finished results of its tier (makes and fixes, oldest first): v1, v2 … so two
 * 文字動態版 cards read apart. Undefined for anything not a finished result, or when the jobs are not given.
 */
export function versionOf(j: BetaJob, jobs?: readonly BetaJob[]): number | undefined {
  if (!jobs) return undefined;
  const results = jobs.filter((x) => x.songId === j.songId && (x.tier ?? 'none') === (j.tier ?? 'none') && (x.kind === 'make' || x.kind === 'fix') && (x.status === 'done' || x.status === 'admin'))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const i = results.findIndex((x) => x.id === j.id);
  return i < 0 ? undefined : i + 1;
}

/** A job as a card names it: its tier, its version among the song's results when the jobs are given, plus a tag for a fix (依回報修正) or a concept run. */
export function jobTitle(j: BetaJob, jobs?: readonly BetaJob[]): { name: string; tag?: string; version?: number } {
  const name = TIER_INFO[j.tier ?? 'none'].name;
  const version = versionOf(j, jobs);
  const v = version ? { version } : {};
  if (j.kind === 'fix') return { name, tag: '依回報修正', ...v };
  if (j.kind === 'concept') return { name, tag: '概念' };
  return { name, ...v };
}

/** A song title as a file name: the characters no file system takes are replaced. */
export const safeName = (title: string): string => title.replace(/[\\/:*?"<>|]/g, '_').trim();

/**
 * The name a downloaded video saves as: `<title>-<version>[-修正].mp4` (the URL ends in `video`, and Safari adds no
 * extension), so several songs and versions do not overwrite each other.
 */
export function videoFileName(song: { title: string }, j: BetaJob, jobs?: readonly BetaJob[]): string {
  const t = jobTitle(j, jobs);
  return `${safeName(song.title) || 'video'}-${t.name}${t.version ? `-v${t.version}` : ''}${j.kind === 'fix' ? '-修正' : ''}.mp4`;
}

/** What the person paid for a job: a make job made from a concept adds that concept's fee (so 故事版 reads $16, not $13.5). */
export function jobTotal(j: BetaJob, jobs: BetaJob[]): number | undefined {
  if (j.priceUsd === undefined) return undefined;
  const concept = j.kind === 'make' && j.conceptOf ? jobs.find((x) => x.id === j.conceptOf) : undefined;
  return j.priceUsd + (concept?.priceUsd ?? 0);
}

/**
 * The concept a result was made from (its accepted concept job, found by `conceptOf`), so the card can keep showing
 * the director's design after the decision; a retry carries its original's `conceptOf`. Undefined for a fix or an
 * older make with no concept.
 */
export function resultConcept(j: BetaJob, jobs: readonly BetaJob[], depth = 0): BetaJob | undefined {
  if (j.kind !== 'make' && j.kind !== 'fix') return undefined;
  if (j.conceptOf) return jobs.find((x) => x.id === j.conceptOf && x.kind === 'concept' && !!x.concept);
  // an older fix names no concept: its source run (`inputs.from`, a run id = that job's id) leads to it
  if (j.kind !== 'fix' || !j.inputs?.from || depth > 8) return undefined;
  const src = jobs.find((x) => x.id === j.inputs!.from);
  if (!src) return undefined;
  return src.kind === 'concept' ? (src.concept ? src : undefined) : resultConcept(src, jobs, depth + 1);
}

/** One row of 接著做: what another make from this version does at the target tier (no concept fee in any case). */
export interface NextStep { tier: BetaTier; title: string; desc: string; action: string; price: number; primary: boolean }

/**
 * The 接著做 rows for a version of `own` tier: another take in the same tier first, then the other offered tiers on
 * the same concept, an upgrade being the primary action. A withdrawn tier (文字動態版) gets no new take.
 */
export function nextSteps(own: BetaTier): NextStep[] {
  const rows: Partial<Record<BetaTier, Omit<NextStep, 'tier' | 'price'>>> = {
    img: { title: '升級成插圖版', desc: '沿用概念和這版的鏡頭，導演再畫插圖道具放進去', action: '做插圖版', primary: true },
    hybrid: { title: '升級成故事版', desc: '以這版的鏡頭為底寫故事、畫角色；完成前可能要管理者看一眼', action: '做故事版', primary: true },
  };
  const same: Omit<NextStep, 'tier' | 'price'> = { title: '同概念再做一版', desc: '風格、配色、字型和故事不變，文字動態重新編排', action: '再做一版', primary: false };
  return [...OFFERED_TIERS].sort((a, b) => (a === own ? -1 : b === own ? 1 : 0))
    .map((tier) => ({ tier, price: TIER_INFO[tier].rest, ...(tier === own ? same : rows[tier]!) }));
}

/** Seconds as `m:ss`. */
export const clock = (sec: number) => {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export interface StepClock { state: 'done' | 'now' | 'next'; time: string }

/**
 * Each step's state and time from the job's recorded phase starts: a done step lasts until the next recorded start,
 * the current one shows the time since its start, later ones (and steps with no record) a dash.
 */
export function stepClocks(j: BetaJob, now = Date.now()): StepClock[] {
  const p = jobProgress(j, now);
  const starts = (j.steps ?? []).map((x) => ({ phase: x.phase, at: Date.parse(x.at) })).sort((a, b) => a.at - b.at);
  return p.steps.map((step, i): StepClock => {
    if (j.status !== 'running' || i > p.index) return { state: 'next', time: '—' };
    const start = starts.filter((x) => step.phases.includes(x.phase)).at(-1)?.at;
    if (i === p.index) return { state: 'now', time: clock((now - (start ?? (j.startedAt ? Date.parse(j.startedAt) : now))) / 1000) };
    const end = start === undefined ? undefined : starts.find((x) => x.at > start)?.at;
    return { state: 'done', time: start !== undefined && end !== undefined ? clock((end - start) / 1000) : '—' };
  });
}

const pad = (n: number) => String(n).padStart(2, '0');
/** `MM-DD HH:mm` in local time; empty when missing. */
export function stamp(iso?: string) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** `HH:mm` in local time, with `MM-DD` in front when it falls on another day than `now`; empty when missing. */
export function hhmm(iso: string | undefined, now = Date.now()): string {
  if (!iso) return '';
  const d = new Date(iso);
  const t = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return d.toDateString() === new Date(now).toDateString() ? t : `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${t}`;
}

/** The lines of a finished result held for the admin ('admin'): what it waits on, since when, and when it frees itself. */
export function heldLines(j: Pick<BetaJob, 'phase' | 'endedAt' | 'autoReleaseAt'>, now = Date.now()): string[] {
  return [
    `正在等管理者確認：${j.phase || '品質檢查'}`,
    ...(j.endedAt ? [`從 ${hhmm(j.endedAt, now)} 起`] : []),
    ...(j.autoReleaseAt ? [`預計 ${hhmm(j.autoReleaseAt, now)} 起自動放行（每 5 分鐘檢查一次）`] : []),
    '需要協助請聯絡邀請你的人',
  ];
}

/** Why 接著做 is off as a whole, or null: a base version still held for the admin cannot be built on yet. */
export const nextHeld = (base: Pick<BetaJob, 'status'>): string | null => (base.status === 'admin' ? '等管理者放行後才能接著做' : null);

/** The confirm body of 略過檢查，直接製作: what an unchecked timing risks and what changing it later costs. */
export const SKIP_TIMING_BODY = `歌詞時間是自動對的，沒有檢查的話，影片裡可能有歌詞和歌聲對不上的地方。之後改時間本身免費；已做好的影片要套用新時間要另付修正費 $${formatPrice(FIX_PRICE, 'short')}；還沒確認的概念要重新產生（$${formatPrice(CONCEPT_PRICE, 'short')}）。`;

/** The confirm body of 刪除歌曲: what goes from the person's view (the server keeps the record and the files aside). */
export const DELETE_BODY = '刪除後，這首歌和它的影片都會從你的列表消失。';

/** The line a fix with nothing to remove shows in place of the refund line (the server sends only the flag, not its error). */
export const NOTHING_TO_REMOVE_LINE = '標記的範圍裡沒有找到可以拿掉的圖，這次沒有收費。';

/**
 * What happens next after a failure: the truth, no more. Nothing is sent anywhere; the failed job shows up in the
 * admin's 需要協助 list when the admin opens the admin page.
 */
export const FAILURE_NOTE = '這次失敗已記錄，管理者會在後台看到。需要協助請聯絡邀請你的人。';

/** The prepFailed card's line: on record, and the one thing the person can do (the server takes a new PUT /audio). */
export const PREP_FAILED_NOTE = '準備失敗，這次失敗已記錄；可以重新上傳音檔再試一次。需要協助請聯絡邀請你的人。';

/**
 * The results whose report form opens by itself on load: a half-written report (a draft in this tab) on the viewer's
 * own song, each once. Someone else's song (an admin looking) never opens one, as it cannot be sent from there.
 */
export const draftsToReopen = (results: readonly Pick<BetaJob, 'id' | 'status'>[], mine: boolean, checked: ReadonlySet<string>, has: (id: string) => boolean): string[] =>
  mine ? results.filter((j) => j.status === 'done' && !checked.has(j.id) && has(j.id)).map((j) => j.id) : [];

/**
 * The 3b failure card for the latest failed make, concept or fix: what failed (and whether the automatic retry did too),
 * the refunded price, when, the note on what happens next, and for a fix with nothing to remove the reason in place of
 * the refund line.
 */
export function failureCard(failed: BetaJob, jobs: BetaJob[]): { title: string; price?: number; stamps: string[]; note: string; reason?: string } {
  const name = TIER_INFO[failed.tier ?? 'none'].name;
  const what = failed.kind === 'concept' ? `${name}的概念產生失敗` : failed.kind === 'fix' ? '修正失敗' : `${name}製作失敗`;
  const first = failed.auto && failed.retryOf ? jobs.find((x) => x.id === failed.retryOf) : undefined;
  const stamps = first ? [`${stamp(first.endedAt)} 失敗`, `${stamp(failed.endedAt)} 重試失敗`] : [`${stamp(failed.endedAt)} 失敗`];
  return {
    title: failed.auto ? `${what}，自動重試也沒成功` : what,
    price: failed.priceUsd,
    stamps,
    note: FAILURE_NOTE,
    ...(failed.nothingToRemove ? { reason: NOTHING_TO_REMOVE_LINE } : {}),
  };
}

/** Whether a pinned panel fits the window with its 24px margin above and below. */
export const fitsViewport = (panel: number, viewport: number) => panel + 48 <= viewport;
