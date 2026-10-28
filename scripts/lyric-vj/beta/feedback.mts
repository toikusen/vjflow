// A tester's report on a finished video: marked moments, a suggestion, and whether the video was fine.
// Every submission is kept forever; a second report on the same video is a new record.
import { Db, Job, newId, Tier } from './store.mts';

export type FeedbackCategory = 'lyrics' | 'timing' | 'picture' | 'empty' | 'style' | 'rhythm' | 'other';
/** `fix` and `redo` are stored types for later plans; the form only sends `none`. */
export type FeedbackAction = 'fix' | 'redo' | 'none';
export interface FeedbackMark { at: number; end?: number; category: FeedbackCategory; note: string }
export interface Feedback {
  id: string; jobId: string; songId: string; userId: string; ok: boolean; marks: FeedbackMark[]; suggestion: string; action: FeedbackAction;
  createdAt: string;
  /** Copied from the job at submission so the record stays meaningful later. */
  tier?: Tier; style?: string;
}

export const MAX_TEXT = 1000;
export const MAX_MARKS = 20;
const CATEGORIES: FeedbackCategory[] = ['lyrics', 'timing', 'picture', 'empty', 'style', 'rhythm', 'other'];
const ACTIONS: FeedbackAction[] = ['fix', 'redo', 'none'];

type Parsed = { ok: true; value: Pick<Feedback, 'ok' | 'marks' | 'suggestion' | 'action'> } | { ok: false; error: string };
const fail = (error: string): Parsed => ({ ok: false, error });
const isSec = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

/** Validates a posted report against the limits; `duration` (seconds) bounds the marks when known. */
export function parseFeedback(body: unknown, duration?: number): Parsed {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const ok = b.ok === true;
  const action = (b.action ?? 'none') as FeedbackAction;
  if (!ACTIONS.includes(action)) return fail('動作不正確');
  if (action !== 'none') return fail('修正與重做即將開放');
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
    if (duration !== undefined && last > duration) return fail('標記超出影片長度');
    if (!CATEGORIES.includes(m.category as FeedbackCategory)) return fail('標記的類別不正確');
    const note = typeof (m.note ?? '') === 'string' ? String(m.note ?? '').trim() : null;
    if (note === null) return fail('備註格式不正確');
    if (note.length > MAX_TEXT) return fail(`備註最多 ${MAX_TEXT} 字`);
    marks.push({ at: m.at, ...(m.end !== undefined ? { end: m.end as number } : {}), category: m.category as FeedbackCategory, note });
  }
  if (!ok && !marks.length && !suggestion) return fail('請標出哪裡有問題，或寫下建議');
  return { ok: true, value: { ok, marks, suggestion, action } };
}

/** Appends a new record for a finished make job; never replaces an earlier one. */
export function addFeedback(db: Db, job: Job, value: Extract<Parsed, { ok: true }>['value'], userId: string, style?: string): Feedback {
  const f: Feedback = { id: newId(), jobId: job.id, songId: job.songId, userId, ...value, createdAt: new Date().toISOString(), tier: job.tier, style };
  db.feedback.push(f);
  return f;
}
