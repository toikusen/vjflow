// Pure rules of the 製作新版本 form; the limits mirror scripts/lyric-vj/beta/server.mts and store.mts.
import { BetaJob, BetaTier, CONCEPT_PRICE } from './beta';

export const MAX_FEELING = 500;
export const MAX_REFS = 5;
export const MAX_REF_BYTES = 10_000_000;
export const MAX_CONCEPTS = 3;
export const REF_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

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

/** Concept attempts for a song and tier, as store.mts counts them: not retries, and not one that failed with all its retries. */
export function conceptAttempts(jobs: readonly BetaJob[], songId: string, tier: BetaTier): number {
  const failedForGood = (j: BetaJob) => j.status === 'failed' && jobs.filter((r) => r.retryOf === j.id).every((r) => r.status === 'failed');
  return jobs.filter((j) => j.kind === 'concept' && j.songId === songId && j.tier === tier && !j.retryOf && !failedForGood(j)).length;
}

/** Why 產生概念 is off right now (the line under the button), or null when the person may go ahead. */
export function makeBlock(s: MakeState): string | null {
  if (s.active) return '目前有工作在進行，完成後才能再製作。';
  const undecided = s.jobs.some((j) => j.kind === 'concept' && j.songId === s.songId && j.tier === s.tier && j.status === 'done' && !j.decision);
  if (undecided) return '這個版本有一個概念還沒決定';
  if (conceptAttempts(s.jobs, s.songId, s.tier) >= MAX_CONCEPTS) return '這個版本已試過 3 次概念，請聯絡管理者';
  // in cents, so float noise never makes a balance look short
  if (s.left !== null && Math.round(CONCEPT_PRICE * 100) > Math.round(s.left * 100)) return '餘額不足，請聯絡管理者';
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
