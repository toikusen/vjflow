// What the beta pages read from scripts/lyric-vj/beta/server.mts, and where a song stands.

export type BetaTier = 'none' | 'img' | 'hybrid';
export interface BetaMe { id: string; name: string; admin: boolean; disabled?: boolean; limitUsd: number; spentUsd: number }
export interface BetaSong { id: string; userId: string; title: string; artist: string; language: string; createdAt: string; confirmedAt?: string }
export interface BetaJob { id: string; songId: string; kind: 'prep' | 'make'; tier?: BetaTier; status: 'queued' | 'running' | 'done' | 'failed' | 'admin'; phase?: string; createdAt: string; startedAt?: string; endedAt?: string }

/** The three versions; `reserve` mirrors RESERVE in scripts/lyric-vj/beta/store.mts. */
export const TIER_INFO: Record<BetaTier, { name: string; about: string; reserve: number; minutes: string }> = {
  none: { name: '文字動態版', about: '只有歌詞文字與圖形動態，沒有插圖。', reserve: 4, minutes: '約 25 分鐘' },
  img: { name: '插圖版', about: '文字動態加上配合歌詞的插圖道具。', reserve: 6, minutes: '約 30 分鐘' },
  hybrid: { name: '故事版', about: '依歌詞編出故事，有角色與畫面。', reserve: 16, minutes: '約 45 分鐘' },
};

export type SongStage =
  | { step: 'preparing'; label: string }
  | { step: 'prepFailed' }
  | { step: 'timing' }
  | { step: 'ready'; making: { tier: BetaTier; label: string }[]; done: BetaTier[]; held: BetaTier[]; failed: BetaTier[] };

/** Where a song stands: being prepared, waiting for its timing, or ready with its versions' states. */
export function songStage(song: BetaSong, jobs: BetaJob[]): SongStage {
  const mine = jobs.filter((j) => j.songId === song.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const prep = mine.filter((j) => j.kind === 'prep').at(-1);
  if (!prep || prep.status === 'queued') return { step: 'preparing', label: prep ? '排隊中' : '等待上傳' };
  if (prep.status === 'running') return { step: 'preparing', label: prep.phase ?? '準備中' };
  if (prep.status === 'failed') return { step: 'prepFailed' };
  if (!song.confirmedAt) return { step: 'timing' };
  // the latest job of each version decides its state
  const last = new Map<BetaTier, BetaJob>();
  for (const j of mine) if (j.kind === 'make' && j.tier) last.set(j.tier, j);
  const all = [...last.values()];
  const tiers = (s: BetaJob['status'][]) => all.filter((j) => s.includes(j.status)).map((j) => j.tier!);
  return {
    step: 'ready',
    making: all.filter((j) => j.status === 'queued' || j.status === 'running').map((j) => ({ tier: j.tier!, label: j.status === 'queued' ? '排隊中' : (j.phase ?? '製作中') })),
    done: tiers(['done']),
    held: tiers(['admin']),
    failed: tiers(['failed']),
  };
}
