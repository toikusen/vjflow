// What the song page shows that is not the song's state itself: hero tone, result names and totals, step clocks, the failure card.
import { BetaJob, jobProgress, TIER_INFO } from './beta';
import { StatusKind } from './ui/status';

/** The hero's colour: blue while preparing (3a), red when help is needed (3b), else a shade of the cover tint (1b-2). */
export type HeroTone = 'info' | 'bad' | 'cover';
export const heroTone = (k: StatusKind): HeroTone => (k === 'preparing' ? 'info' : k === 'help' || k === 'prepFailed' ? 'bad' : 'cover');

/**
 * The hero's note beside 歌詞時間已確認 while concepts await a decision: a conditional, since the timing may well stay as
 * it is (the server refuses to accept a pending concept once the timing changed). Empty when none is pending.
 */
export function timingNote(pending: number): string {
  if (pending <= 0) return '';
  return pending === 1 ? '（若再改時間，待確認的概念要重新產生）' : `（若再改時間，${pending} 個待確認的概念都要重新產生）`;
}

/** A job as a card names it: its tier, plus a tag for a fix (依回報修正) or a concept run. */
export function jobTitle(j: BetaJob): { name: string; tag?: string } {
  const name = TIER_INFO[j.tier ?? 'none'].name;
  if (j.kind === 'fix') return { name, tag: '依回報修正' };
  if (j.kind === 'concept') return { name, tag: '概念' };
  return { name };
}

/** A song title as a file name: the characters no file system takes are replaced. */
export const safeName = (title: string): string => title.replace(/[\\/:*?"<>|]/g, '_').trim();

/**
 * The name a downloaded video saves as: `<title>-<version>[-修正].mp4` (the URL ends in `video`, and Safari adds no
 * extension), so several songs and versions do not overwrite each other.
 */
export function videoFileName(song: { title: string }, j: BetaJob): string {
  const t = jobTitle(j);
  return `${safeName(song.title) || 'video'}-${t.name}${j.kind === 'fix' ? '-修正' : ''}.mp4`;
}

/** What the person paid for a job: a make job made from a concept adds that concept's fee (so 故事版 reads $16, not $13.5). */
export function jobTotal(j: BetaJob, jobs: BetaJob[]): number | undefined {
  if (j.priceUsd === undefined) return undefined;
  const concept = j.kind === 'make' && j.conceptOf ? jobs.find((x) => x.id === j.conceptOf) : undefined;
  return j.priceUsd + (concept?.priceUsd ?? 0);
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

/** The line a fix with nothing to remove shows in place of the refund line (the server sends only the flag, not its error). */
export const NOTHING_TO_REMOVE_LINE = '標記的範圍裡沒有找到可以拿掉的圖，這次沒有收費。';

/**
 * What happens next after a failure: the truth, no more. Nothing is sent anywhere; the failed job shows up in the
 * admin's 需要協助 list when the admin opens the admin page.
 */
export const FAILURE_NOTE = '這次失敗已記錄，管理者會在後台看到';

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
