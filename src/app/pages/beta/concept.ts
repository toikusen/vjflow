// Pure rules of the concept card (2a); the limits and refusals mirror scripts/lyric-vj/beta/server.mts.
import { BetaJob, CONCEPT_PRICE, ConceptSummary, TIER_INFO } from './beta';
import { feelingLength, MAX_CONCEPTS, conceptAttempts } from './make';
import { clock } from './song';

/** An adjust note's limit, in characters (MAX_CONCEPT on the server). */
export const MAX_NOTE = 500;

export interface ConceptHead { title: string; attempt: number; more: boolean; rest: number }

/**
 * The card head: 「{方案}的概念」, which attempt this is (counted as store.mts counts them, up to this concept),
 * whether adjust / redo may still run (the server refuses a 4th attempt), and what accepting charges.
 */
export function conceptHead(c: BetaJob, jobs: readonly BetaJob[]): ConceptHead {
  const tier = c.tier ?? 'none';
  const upTo = jobs.filter((j) => j.createdAt <= c.createdAt);
  return {
    title: `${TIER_INFO[tier].name}的概念`,
    attempt: Math.max(1, conceptAttempts(upTo, c.songId, tier)),
    more: conceptAttempts(jobs, c.songId, tier) < MAX_CONCEPTS,
    rest: TIER_INFO[tier].rest,
  };
}

/** 「示意 n」, plus the still's time when its name is render.mts's `still_<seconds>.png`. */
export function stillLabel(name: string, i: number): string {
  const t = /^still_(\d+(?:\.\d+)?)\.(png|jpe?g)$/.exec(name);
  return t ? `示意 ${i + 1} · ${clock(Number(t[1]))}` : `示意 ${i + 1}`;
}

/**
 * The 間奏處理 lines: each pictures window with its reason; 「間奏只做背景變換」 when none has pictures;
 * nothing when the summary does not record the interludes (an older concept), so no claim is made.
 */
export function interludeLines(s: ConceptSummary): string[] {
  if (!s.interludes) return [];
  const pictures = s.interludes.filter((e) => e.mode === 'pictures');
  if (!pictures.length) return ['間奏只做背景變換'];
  return pictures.map((e) => `${clock(e.start)}–${clock(e.end)} 放插圖${e.reason ? `：${e.reason}` : ''}`);
}

interface Common { active: boolean; left: number | null; submitting: boolean }

/** The first reason shared by every decision: a running job (the server's words), a short balance in cents, a request on its way. */
function common(s: Common, cost: number): string | null {
  if (s.active) return '這首歌已經在排隊或製作中';
  if (s.left !== null && Math.round(cost * 100) > Math.round(s.left * 100)) return '餘額不足，請聯絡管理者';
  if (s.submitting) return '送出中…';
  return null;
}

/** Why 接受 is off (the line under it), or null. */
export function acceptBlock(s: Common & { concerns: boolean; confirmed: boolean; rest: number }): string | null {
  if (s.concerns && !s.confirmed) return '勾選上方「我了解」後才能接受';
  return common(s, s.rest);
}

/** Why 依意見調整 is off (its button's text), or null. */
export function adjustBlock(s: Common & { note: string }): string | null {
  const n = feelingLength(s.note.trim());
  if (!n) return '填一句意見後才能送出';
  if (n > MAX_NOTE) return '意見最多 500 字';
  return common(s, CONCEPT_PRICE);
}

/** Why 換一個方向 is off, or null. */
export const redoBlock = (s: Common): string | null => common(s, CONCEPT_PRICE);
