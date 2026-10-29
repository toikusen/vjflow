// Pure rules of the 製作新版本 form; the limits mirror scripts/lyric-vj/beta/server.mts and store.mts.
import { BetaJob, BetaTier, CONCEPT_PRICE, TIER_INFO } from './beta';
import { formatPrice } from './ui/price';

export const MAX_FEELING = 500;
export const MAX_REFS = 5;
export const MAX_REF_BYTES = 10_000_000;
export const MAX_CONCEPTS = 3;
export const REF_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const TIERS: BetaTier[] = ['none', 'img', 'hybrid'];

/** What the person chose; `style: null` is 交給導演. */
export interface MakeForm { tier: BetaTier; feeling: string; style: string | null; refs: readonly string[] }
/** The JSON of `POST /beta/songs/:id/make`. */
export interface MakeBody { tier: BetaTier; concept?: string; style?: string; refs: string[] }
export interface MakeState { songId: string; tier: BetaTier; jobs: readonly BetaJob[]; active: boolean; left: number | null; uploading: boolean; submitting: boolean; feeling: string }

/** The make request: an empty feeling and 交給導演 are left out, the refs are copied. */
export function makeBody(f: MakeForm): MakeBody {
  const concept = f.feeling.trim();
  return { tier: f.tier, ...(concept ? { concept } : {}), ...(f.style ? { style: f.style } : {}), refs: [...f.refs] };
}

/** Characters, not UTF-16 units, as the server counts them. */
export const feelingLength = (s: string) => [...s].length;

/** The id of the job a retry chain started from: `retryOf` followed to its end (a retry of a retry included). */
export function rootOf(jobs: readonly BetaJob[], job: BetaJob): string {
  const byId = new Map(jobs.map((j) => [j.id, j]));
  const seen = new Set<string>();
  let j = job;
  while (j.retryOf && byId.has(j.retryOf) && !seen.has(j.id)) {
    seen.add(j.id);
    j = byId.get(j.retryOf)!;
  }
  return j.id;
}

/**
 * Concept attempts for a song and tier, as store.mts counts them: a concept job with every retry of it (and of those)
 * counts once, unless the whole chain failed (a system failure never uses up an attempt).
 */
export function conceptAttempts(jobs: readonly BetaJob[], songId: string, tier: BetaTier): number {
  const chains = new Map<string, BetaJob[]>();
  for (const j of jobs) {
    if (j.kind !== 'concept' || j.songId !== songId || j.tier !== tier) continue;
    const root = rootOf(jobs, j);
    chains.set(root, [...(chains.get(root) ?? []), j]);
  }
  return [...chains.values()].filter((chain) => chain.some((j) => j.status !== 'failed')).length;
}

/**
 * The finished concepts of this song nobody has decided on yet, newest first. The server keeps one pending per
 * version, so a song can have up to three (a 文字動態版 and a 插圖版 concept at once, say), each paid for.
 */
export const pendingConcepts = (jobs: readonly BetaJob[], songId: string): BetaJob[] =>
  jobs.filter((j) => j.kind === 'concept' && j.songId === songId && j.status === 'done' && !j.decision).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

/** The newest finished concept of this song nobody has decided on yet, if any. */
export const pendingConcept = (jobs: readonly BetaJob[], songId: string): BetaJob | undefined => pendingConcepts(jobs, songId)[0];

export interface TimingSaveWarning { title: string; body: string }

/**
 * The warning before a timing save when finished concepts of the song await a decision: the make reuses the concept's
 * snapshot of the timing, so once the timing changes the server refuses the accept and every pending concept has to be
 * produced again (another attempt at the concept fee each). Saving itself charges nothing. Null when none is pending.
 */
export function timingSaveWarning(jobs: readonly BetaJob[], songId: string): TimingSaveWarning | null {
  const pending = pendingConcepts(jobs, songId);
  if (!pending.length) return null;
  const fee = formatPrice(CONCEPT_PRICE, 'short');
  const names = pending.map((j) => TIER_INFO[j.tier ?? 'none'].name).join('、');
  const which = pending.length === 1 ? `一個${names}的概念` : ` ${pending.length} 個概念（${names}）`;
  const those = pending.length === 1 ? '那個概念' : '那些概念';
  const each = pending.length === 1 ? `$${fee}` : `每個 $${fee}`;
  return {
    title: '儲存後，待確認的概念要重新產生',
    body: `這首歌有${which}還在等你決定。歌詞時間儲存後，${those}就不能再接受，要重新產生概念（${each}）才能製作。現在儲存不會扣款。`,
  };
}

/**
 * The form's default tier: the one whose concept awaits a decision (so the button shows that reason rather than a
 * second, live 產生概念), else the first tier the song has no result for.
 */
export function defaultTier(jobs: readonly BetaJob[], songId: string, made: readonly (BetaTier | undefined)[]): BetaTier {
  const pending = pendingConcept(jobs, songId)?.tier;
  if (pending) return pending;
  const have = new Set(made);
  return TIERS.find((t) => !have.has(t)) ?? TIERS[0];
}

/** Why 產生概念 is off right now (the line under the button), or null when the person may go ahead. */
export function makeBlock(s: MakeState): string | null {
  if (s.active) return '目前有工作在進行，完成後才能再製作。';
  const undecided = s.jobs.some((j) => j.kind === 'concept' && j.songId === s.songId && j.tier === s.tier && j.status === 'done' && !j.decision);
  if (undecided) return '這個版本有一個概念還沒決定';
  if (conceptAttempts(s.jobs, s.songId, s.tier) >= MAX_CONCEPTS) return '這個版本已試過 3 次概念，請聯絡管理者';
  // the whole version (concept and make), in cents so float noise never makes a balance look short: a balance that
  // covers the concept alone would leave the person with a concept they cannot accept
  const price = TIER_INFO[s.tier].price;
  if (s.left !== null && Math.round(price * 100) > Math.round(s.left * 100)) return `餘額不足以完成這個版本（需 $${formatPrice(price, 'short')}），請聯絡管理者`;
  if (s.submitting) return '送出中…';
  if (s.uploading) return '參考圖上傳中，請稍候。';
  if (feelingLength(s.feeling) > MAX_FEELING) return '想要的感覺最多 500 字';
  return null;
}

/** Why a picked reference file cannot be uploaded (the server's own words), or null; `count` is how many the song has. */
export function refProblem(file: { type: string; size: number }, count: number): string | null {
  if (count >= MAX_REFS) return '參考圖最多 5 張';
  if (!REF_TYPES.includes(file.type)) return '請上傳 jpg、png 或 webp 圖片';
  if (file.size > MAX_REF_BYTES) return '圖片太大（上限 10 MB）';
  if (!file.size) return '沒有收到圖片';
  return null;
}

export interface StripGrid { cols: number; rows: number }

/**
 * The frame grid of a style's picture: kits are 4×2 and samples 5×1 frames of 480×270, so rows come from 270 px
 * and columns from the 16:9 frame width; any other shape is treated as one frame.
 */
export function stripGrid(w: number, h: number): StripGrid {
  const rows = Math.round(h / 270);
  if (!(w > 0) || rows < 1) return { cols: 1, rows: 1 };
  const frameW = ((h / rows) * 16) / 9;
  const cols = Math.round(w / frameW);
  return cols >= 1 && Math.abs(cols * frameW - w) <= w * 0.02 ? { cols, rows } : { cols: 1, rows: 1 };
}

/** The three frames a style card's collage shows: the first three, row by row, repeating when there are fewer. */
export function stripTiles(g: StripGrid): { col: number; row: number }[] {
  const n = g.cols * g.rows;
  return [0, 1, 2].map((i) => ({ col: (i % n) % g.cols, row: Math.floor((i % n) / g.cols) }));
}
