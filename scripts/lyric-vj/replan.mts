// A replan fix: the shots a report's marks fall in are planned again by the director with the person's notes, the
// rest of the type plan stands. Pure helpers for typeplan.mts --replan (which makes the call) and their test.
import { POINT_SPAN } from './beta/feedback.mts';

export interface ReplanMark { at: number; end?: number; category?: string; note?: string }
export interface ShotSpan { id: string; start: number; end: number }
interface PlanShot { shot: string; lyric?: { template: string; side: string }; cuts?: { fx: string }[] }
export const NOTHING_TO_REPLAN = '標記的範圍裡沒有鏡頭可以重排';
/** What the report categories mean, for the director (mirrors FEEDBACK_CATEGORIES in src/app/pages/beta/beta.ts). */
export const CATEGORY_LABELS: Record<string, string> = { lyrics: '歌詞看不清', timing: '時間不準', picture: '圖片不搭', empty: '畫面空', style: '風格不對', rhythm: '節奏轉場', other: '其他' };

const spanOf = (m: ReplanMark) => ({ at: m.at, end: m.end ?? m.at + POINT_SPAN });
/** The shots any mark overlaps, in shot order (a point mark covers POINT_SPAN seconds). */
export function shotsToReplan(shots: readonly ShotSpan[], marks: readonly ReplanMark[]): string[] {
  return shots.filter((s) => marks.some((m) => { const r = spanOf(m); return r.at < s.end && r.end > s.start; })).map((s) => s.id);
}

const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
const describe = (ps: PlanShot | undefined) => (ps ? `版型 ${ps.lyric?.template ?? '?'}/${ps.lyric?.side ?? '?'}；刀 ${(ps.cuts ?? []).map((c) => c.fx).join('、') || '無'}` : '原企劃沒有排');

/**
 * The brief appended to the director's prompt: each shot to re-plan with what it was and the notes on it, the shots
 * around them for continuity, and the instruction to output those shots only.
 */
export function replanBrief(shots: readonly ShotSpan[], plan: { shots: PlanShot[] }, marks: readonly ReplanMark[], ids: readonly string[], note = ''): string {
  const planOf = (id: string) => plan.shots.find((p) => p.shot === id);
  const lines = ids.map((id) => {
    const s = shots.find((x) => x.id === id)!;
    const notes = marks.filter((m) => { const r = spanOf(m); return r.at < s.end && r.end > s.start; })
      .map((m) => `  · ${clock(m.at)}${m.category ? ` ${CATEGORY_LABELS[m.category] ?? m.category}` : ''}${m.note?.trim() ? `：「${m.note.trim()}」` : ''}`);
    return `- ${id} ${s.start.toFixed(1)}–${s.end.toFixed(1)}s（原本：${describe(planOf(id))}）\n${notes.join('\n')}`;
  });
  const around = shots.filter((s, i) => !ids.includes(s.id) && (ids.includes(shots[i - 1]?.id) || ids.includes(shots[i + 1]?.id)))
    .map((s) => `${s.id} ${describe(planOf(s.id))}`);
  return `這首歌已經照這份企劃做出成品，看過的人指出下面這些鏡頭有問題。整首企劃不變，只重排這些鏡頭：意見說到的一定要改掉（被嫌的招式、版型、做法不要再用，字要清楚可讀），沒說到的部分可以留也可以換，但要跟前後鏡頭銜接、符合這首歌的視覺方向。
${lines.join('\n')}
${note.trim() ? `看過的人對整支影片的整體意見（這些鏡頭裡做得到的就照做）：「${note.trim()}」\n` : ''}${around.length ? `前後鏡頭（只供銜接參考，不要輸出）：${around.join('；')}\n` : ''}只輸出這些鏡頭（shots 只含 ${ids.join('、')}，每個都要有刀和它的每一句歌詞），其他欄位照原企劃填。`;
}

/** The old plan with the re-planned shots (those of `ids` the fill returned with cuts) in place; the rest untouched. */
export function mergeShots<P extends { shots: PlanShot[] }>(old: P, fill: { shots?: PlanShot[] }, ids: readonly string[]): { plan: P; got: string[]; kept: string[] } {
  const got = new Map((fill.shots ?? []).filter((p) => ids.includes(p.shot) && p.cuts?.length).map((p) => [p.shot, p]));
  const shots = old.shots.map((p) => got.get(p.shot) ?? p);
  return { plan: { ...old, shots }, got: [...got.keys()], kept: ids.filter((id) => !got.has(id)) };
}
