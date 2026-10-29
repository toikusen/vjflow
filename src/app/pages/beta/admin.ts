// What the admin pages (3c 總覽, 3d 歌曲製作紀錄, 3e 風格表) compute from the server's admin routes.
import { BetaJob, BetaMe, BetaSong, jobProgress, retriedBy, songKind, songView, TIER_INFO } from './beta';
import { formatPrice } from './ui/price';
import { StatusChip } from './ui/status';

/** A job as `GET /beta/admin/jobs` returns it: the public job plus who, the platform cost and what was charged. */
export type AdminJob = BetaJob & { userId: string; reservedUsd: number; costUsd?: number; chargedUsd?: number; costs?: { key: string; usd: number; phase?: string }[]; fused?: boolean; unsettled?: string; error?: string };

export interface Kpi { label: string; value: string; sub: string; tone?: 'ok' | 'bad' }
export interface AdminTotals { globalLimitUsd: number; spentUsd: number; platformSpentUsd: number }

const money = (n: number) => `$${formatPrice(n)}`;
/** `+$1.67` / `-$0.50` / `$0.00`: a margin with its sign (the design writes gains with a plus). */
export const signedMoney = (n: number): string => (Math.round(n * 100) > 0 ? `+${money(n)}` : Math.round(n * 100) < 0 ? `-${money(-n)}` : money(0));

/** Gross margin: what the people paid minus what the platform spent; green when positive, red when negative. */
export function margin(paidUsd: number, costUsd: number): { value: string; tone: 'ok' | 'bad' } {
  const m = paidUsd - costUsd;
  return { value: signedMoney(m), tone: Math.round(m * 100) < 0 ? 'bad' : 'ok' };
}

const isActive = (j: BetaJob) => j.status === 'queued' || j.status === 'running';
const short = (s: string, n = 8) => (s.length > n ? `${s.slice(0, n)}…` : s);

/**
 * The 3c KPI cards: 使用者已付（毛利） / 平台成本（對總額度） / 測試者 / 進行中工作 / 需要協助. The limit is measured against
 * the platform's cost, as the server does (platformSpent against globalLimitUsd in store.mts), not against what the
 * people were charged: a failed job charges 0 and still cost the platform.
 */
export function kpis(users: BetaMe[], jobs: AdminJob[], songs: BetaSong[], t: AdminTotals, now = Date.now()): Kpi[] {
  const pct = t.globalLimitUsd > 0 ? `${Math.round((t.platformSpentUsd / t.globalLimitUsd) * 1000) / 10}%` : '—';
  const m = margin(t.spentUsd, t.platformSpentUsd);
  const off = users.filter((u) => u.disabled).length;
  const running = jobs.filter((j) => j.status === 'running');
  const queued = jobs.filter((j) => j.status === 'queued');
  const wait = [...running, ...queued].reduce((s, j) => s + jobProgress(j, now).leftMin, 0);
  const help = needHelp(songs, jobs);
  return [
    { label: '使用者已付', value: money(t.spentUsd), sub: `毛利 ${m.value}`, tone: m.tone },
    { label: '平台成本', value: money(t.platformSpentUsd), sub: `總額度 $${formatPrice(t.globalLimitUsd, 'short')} · ${pct}` },
    { label: '測試者', value: String(users.length), sub: off ? `${off} 停用` : '全部啟用' },
    { label: '進行中工作', value: String(running.length), sub: `${queued.length} 排隊${wait ? ` · 約等 ${wait} 分` : ''}` },
    { label: '需要協助', value: String(help.length), sub: help[0] ? `${short(help[0].title)} ${help[0].why}` : '沒有卡住的歌', tone: help.length ? 'bad' : undefined },
  ];
}

/** Songs the admin has to act on: the last job failed for good (no retry running), or a video waits for the admin's release. */
export function needHelp(songs: BetaSong[], jobs: AdminJob[]): { id: string; title: string; why: string }[] {
  return songs.flatMap((s) => {
    const v = songView(s, jobs);
    const kind = songKind(v);
    if (kind === 'prepFailed') return [{ id: s.id, title: s.title, why: '準備失敗' }];
    if (kind === 'help') return [{ id: s.id, title: s.title, why: v.failedAuto ? '重試失敗' : '製作失敗' }];
    // a video held for a look (a kept key shot, a covered lyric): the person waits until the admin releases it
    if (v.results.some((j) => j.status === 'admin')) return [{ id: s.id, title: s.title, why: '等你放行' }];
    return [];
  });
}

/**
 * An admin's limit field as a number, or null when it should not be sent: empty (a cleared field is not 0, which would
 * stop the person at once), not a number, or negative.
 */
export function parseLimit(value: string): number | null {
  if (!value.trim()) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Whether a poll's jobs differ from the last ones in a way the admin song page's other lists depend on: a job came or
 * went, or one changed status or ended (then there are new logs, and maybe a new report).
 */
export function jobsChanged(before: readonly BetaJob[], after: readonly BetaJob[]): boolean {
  if (before.length !== after.length) return true;
  const was = new Map(before.map((j) => [j.id, j]));
  return after.some((j) => {
    const b = was.get(j.id);
    return !b || b.status !== j.status || b.endedAt !== j.endedAt;
  });
}

/** What a job does, as the admin tables name it. */
/** The 重跑 button's words: a re-run charges the person the job's price again, so the button says so. */
export const retryLabel = (j: Pick<AdminJob, 'priceUsd' | 'reservedUsd'>): string => {
  const price = j.priceUsd ?? j.reservedUsd;
  return price > 0 ? `重跑（再扣 $${formatPrice(price, 'short')}）` : '重跑';
};

export const jobName = (j: BetaJob): string =>
  j.kind === 'prep' ? '準備歌曲' : j.kind === 'concept' ? '概念' : j.kind === 'fix' ? '修正' : (TIER_INFO[j.tier!]?.name ?? j.tier ?? '製作');

/** Which concept attempt of its song and tier a concept job is (1-based, by creation time). */
export const conceptAttempt = (jobs: BetaJob[], j: BetaJob): number =>
  jobs.filter((x) => x.kind === 'concept' && x.songId === j.songId && x.tier === j.tier && x.createdAt <= j.createdAt).length;

export interface JobState { chip: StatusChip; detail: string }

/**
 * A job's status chip and the small detail after it, as the 3c queue and the 3d cards show them:
 * ● 製作中 + step and percent, ◷ 排隊, ✓ 完成, ! 失敗 + why, ? 等確認 for a held video or a concept awaiting the person.
 */
export function jobState(jobs: BetaJob[], j: AdminJob, now = Date.now()): JobState {
  if (j.status === 'running') {
    const p = jobProgress(j, now);
    return { chip: { icon: '●', label: '製作中', tone: 'making' }, detail: `${j.phase ?? p.label} ${p.pct}%` };
  }
  if (j.status === 'queued') return { chip: { icon: '◷', label: '排隊', tone: 'muted' }, detail: j.auto ? '自動重試' : '' };
  if (j.status === 'admin') return { chip: { icon: '?', label: '等確認', tone: 'warn' }, detail: j.phase ?? '等管理者放行' };
  if (j.status === 'failed') {
    const again = retriedBy(jobs, j);
    const why = again ? `已重跑 → ${again}` : j.auto ? '重試失敗' : j.fused ? '保險絲' : '失敗';
    return { chip: { icon: '!', label: '失敗', tone: 'bad' }, detail: (j.priceUsd ?? 0) > 0 && !again ? `${why} · 已退款` : why };
  }
  if (j.kind === 'concept' && !j.decision) return { chip: { icon: '?', label: '等確認', tone: 'warn' }, detail: `第 ${conceptAttempt(jobs, j)} 次` };
  const note = j.kind === 'concept' ? { accepted: '已接受', adjusted: '要求調整', redone: '換了方向' }[j.decision!] : (j.autoReleased ?? '');
  return { chip: { icon: '✓', label: '完成', tone: 'ok' }, detail: note ?? '' };
}

/** `MM-DD HH:mm` from an ISO time, in the viewer's zone. */
export function shortDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** `HH:mm:ss` from an ISO time (step starts on the 3d cards). */
export function clockTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** `m:ss` from seconds (report marks). */
export const mmss = (s: number): string => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** Seconds from each step to the next one (the last step runs until the job ended; `—` while it still runs). */
export function stepRows(j: BetaJob): { phase: string; start: string; dur: string }[] {
  const list = j.steps ?? [];
  return list.map((s, i) => {
    const end = list[i + 1]?.at ?? j.endedAt;
    const secs = end ? Math.max(0, Math.round((Date.parse(end) - Date.parse(s.at)) / 1000)) : undefined;
    return { phase: s.phase, start: clockTime(s.at), dur: secs === undefined ? '—' : `${secs} 秒` };
  });
}

/** Bytes as the log chips print them: `133 B`, `2.5 KB`, `1.2 MB`. */
export const fileSize = (bytes: number): string => (bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

/**
 * What a job has cost the platform: while it is queued or running, at least its price (mirrors platformSpent in
 * scripts/lyric-vj/beta/store.mts, so 3c's 全站 number and 3d's agree); once it ended, what it really cost.
 */
export const jobCost = (j: AdminJob): number => (isActive(j) ? Math.max(j.costUsd ?? 0, j.priceUsd ?? j.reservedUsd ?? 0) : j.costUsd ?? 0);

/** What the people paid and what the platform spent on a song's jobs, and the margin between them. */
export function songMoney(jobs: AdminJob[]): { paid: number; cost: number; margin: ReturnType<typeof margin> } {
  const paid = jobs.reduce((s, j) => s + (j.chargedUsd ?? 0), 0);
  const cost = jobs.reduce((s, j) => s + jobCost(j), 0);
  return { paid, cost, margin: margin(paid, cost) };
}

// 3e 風格表

export type StyleTier = 'proven' | 'candidate' | 'unlisted';
/** A style as `GET /beta/admin/styles` lists it. */
export interface AdminStyle { id: string; name: string; suits: string; proven: boolean; tier: StyleTier; image: string | null }
export interface StyleCounts { accepted: number; adjusted: number; redone: number }

export const TIER_LABEL: Record<StyleTier, { icon: string; label: string; tone: 'ok' | 'warn' | 'muted' }> = {
  proven: { icon: '✓', label: '已驗證', tone: 'ok' },
  candidate: { icon: '?', label: '候選', tone: 'warn' },
  unlisted: { icon: '—', label: '未上架', tone: 'muted' },
};
export const TIERS: StyleTier[] = ['proven', 'candidate', 'unlisted'];

/** How often each style's concepts were accepted, adjusted or redone (from the concept jobs that carry a decision). */
export function styleCounts(jobs: BetaJob[]): Record<string, StyleCounts> {
  const out: Record<string, StyleCounts> = {};
  for (const j of jobs) {
    const id = j.concept?.language;
    if (j.kind !== 'concept' || !id || !j.decision) continue;
    const c = (out[id] ??= { accepted: 0, adjusted: 0, redone: 0 });
    c[j.decision] += 1;
  }
  return out;
}

/** Acceptance = accepted ÷ all decisions; `—` and an empty bar before any decision. */
export function acceptance(c: StyleCounts): { pct: number; label: string } {
  const total = c.accepted + c.adjusted + c.redone;
  if (!total) return { pct: 0, label: '—' };
  const pct = Math.round((c.accepted / total) * 100);
  return { pct, label: `${pct}%` };
}

export type StyleFilter = 'all' | StyleTier;
export const styleFilterCounts = (styles: AdminStyle[]): Record<StyleFilter, number> => ({
  all: styles.length,
  proven: styles.filter((s) => s.tier === 'proven').length,
  candidate: styles.filter((s) => s.tier === 'candidate').length,
  unlisted: styles.filter((s) => s.tier === 'unlisted').length,
});

export const EMPTY_COUNTS: StyleCounts = { accepted: 0, adjusted: 0, redone: 0 };
