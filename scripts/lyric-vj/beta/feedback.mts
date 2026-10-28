// A tester's report on a finished video: marked moments, a suggestion, and whether the video was fine.
// Every submission is kept forever; a second report on the same video is a new record.
import { Db, Job, newId, Tier } from './store.mts';

export type FeedbackCategory = 'lyrics' | 'timing' | 'picture' | 'empty' | 'style' | 'rhythm' | 'other';
/** `fix` queues a fix job for the kinds a fix can do (fixKindFor); `redo` is only stored: the person then makes a new version at the normal price. */
export type FeedbackAction = 'fix' | 'redo' | 'none';
/** What a fix job does: remove the pictures in the marked ranges (img tier only), or re-apply the song's new timing. */
export type FixKind = 'picture' | 'timing';
/** A marked stretch a fix works on, in seconds. */
export interface FixRange { at: number; end: number }
export interface FeedbackMark { at: number; end?: number; category: FeedbackCategory; note: string }
export interface Feedback {
  id: string; jobId: string; songId: string; userId: string; ok: boolean; marks: FeedbackMark[]; suggestion: string; action: FeedbackAction;
  createdAt: string;
  /** Copied from the job at submission so the record stays meaningful later. */
  tier?: Tier; style?: string;
  /** The fix job this report queued (action `fix`). */
  fixJobId?: string;
}

export const MAX_TEXT = 1000;
export const MAX_MARKS = 20;
/** The browser's video length and the pipeline's song length can differ slightly; a mark at the very end must still fit. */
export const END_SLACK = 0.5;
const CATEGORIES: FeedbackCategory[] = ['lyrics', 'timing', 'picture', 'empty', 'style', 'rhythm', 'other'];
const ACTIONS: FeedbackAction[] = ['fix', 'redo', 'none'];

type Parsed = { ok: true; value: Pick<Feedback, 'ok' | 'marks' | 'suggestion' | 'action'> } | { ok: false; error: string };
const fail = (error: string): Parsed => ({ ok: false, error });
/** A point mark covers this many seconds from its start when a fix works on it. */
export const POINT_SPAN = 2;
const NOT_FIXABLE = '這類問題目前只能重做或只回報';

/** The fix a report's marks allow: `picture` or `timing` when every mark (at least one) is that category, else none. */
export function fixKindFor(marks: Pick<FeedbackMark, 'category'>[]): FixKind | undefined {
  const kind = marks[0]?.category;
  return (kind === 'picture' || kind === 'timing') && marks.every((m) => m.category === kind) ? kind : undefined;
}
/** The marks as the ranges a fix job works on (a point mark covers POINT_SPAN seconds). */
export const fixRanges = (marks: FeedbackMark[]): FixRange[] => marks.map((m) => ({ at: m.at, end: m.end ?? m.at + POINT_SPAN }));

const isSec = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

/**
 * Validates a posted report against the limits; `duration` (seconds) bounds the marks when known. A fix is accepted
 * only when the marks allow one (fixKindFor) and, for pictures, the video's `tier` is `img`.
 */
export function parseFeedback(body: unknown, duration?: number, tier?: Tier): Parsed {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const ok = b.ok === true;
  const action = (b.action ?? 'none') as FeedbackAction;
  if (!ACTIONS.includes(action)) return fail('動作不正確');
  const rawMarks = b.marks ?? [];
  if (!Array.isArray(rawMarks)) return fail('標記格式不正確');
  if (rawMarks.length > MAX_MARKS) return fail(`最多標 ${MAX_MARKS} 處`);
  const suggestionRaw = b.suggestion ?? '';
  if (typeof suggestionRaw !== 'string') return fail('建議格式不正確');
  const suggestion = suggestionRaw.trim();
  if (suggestion.length > MAX_TEXT) return fail(`建議最多 ${MAX_TEXT} 字`);
  const marks: FeedbackMark[] = [];
  for (const m of rawMarks as Record<string, unknown>[]) {
    if (!m || typeof m !== 'object') return fail('標記格式不正確');
    if (!isSec(m.at)) return fail('標記的時間不正確');
    if (m.end !== undefined && (!isSec(m.end) || m.end < m.at)) return fail('標記的時間不正確');
    const last = m.end ?? m.at;
    if (duration !== undefined && last > duration + END_SLACK) return fail('標記超出影片長度');
    if (!CATEGORIES.includes(m.category as FeedbackCategory)) return fail('標記的類別不正確');
    const note = typeof (m.note ?? '') === 'string' ? String(m.note ?? '').trim() : null;
    if (note === null) return fail('備註格式不正確');
    if (note.length > MAX_TEXT) return fail(`備註最多 ${MAX_TEXT} 字`);
    marks.push({ at: m.at, ...(m.end !== undefined ? { end: m.end as number } : {}), category: m.category as FeedbackCategory, note });
  }
  if (!ok && !marks.length && !suggestion) return fail('請標出哪裡有問題，或寫下建議');
  if (action === 'fix') {
    const kind = fixKindFor(marks);
    if (!kind || (kind === 'picture' && tier !== 'img')) return fail(NOT_FIXABLE);
  }
  return { ok: true, value: { ok, marks, suggestion, action } };
}

/** Appends a new record for a finished video; never replaces an earlier one. `link` gives a preassigned id and the fix job it queued. */
export function addFeedback(db: Db, job: Job, value: Extract<Parsed, { ok: true }>['value'], userId: string, style?: string, link: { id?: string; fixJobId?: string } = {}): Feedback {
  const f: Feedback = { id: link.id ?? newId(), jobId: job.id, songId: job.songId, userId, ...value, createdAt: new Date().toISOString(), tier: job.tier, style, ...(link.fixJobId ? { fixJobId: link.fixJobId } : {}) };
  db.feedback.push(f);
  return f;
}
