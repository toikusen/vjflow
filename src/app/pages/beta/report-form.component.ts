import { Component, input, output, signal } from '@angular/core';
import { BetaFeedback, BetaJob, FEEDBACK_CATEGORIES, FeedbackAction, FeedbackCategory } from './beta';

const MAX_TEXT = 1000;
const MAX_MARKS = 20;
/** Same slack as the server: the browser's and the pipeline's video lengths can differ slightly. */
const END_SLACK = 0.5;
const ACTIONS: { id: FeedbackAction; label: string }[] = [
  { id: 'fix', label: '修正' },
  { id: 'redo', label: '重做' },
  { id: 'none', label: '只回報' },
];

/** A mark being written: the category is picked after the time is marked. */
export interface DraftMark { at: number; end?: number; category: FeedbackCategory | null; note: string }
export interface ReportDraft { ok: boolean; marks: DraftMark[]; suggestion: string; action: FeedbackAction }
interface FormMark extends DraftMark { key: number }

const isSec = (v: number) => Number.isFinite(v) && v >= 0;
const pad = (n: number) => String(n).padStart(2, '0');
const tenth = (s: number) => Math.round(s * 10) / 10;

/** Seconds as `m:ss`; anything negative or not a number shows as `0:00`. */
export function formatTime(seconds: number): string {
  const s = isSec(seconds) ? Math.floor(seconds) : 0;
  return `${Math.floor(s / 60)}:${pad(s % 60)}`;
}

/**
 * Mirrors the server's `parseFeedback` (scripts/lyric-vj/beta/feedback.mts) so most mistakes show before sending.
 * Returns the first problem in Traditional Chinese, or null when the report can be sent.
 * `duration` (seconds) bounds the marks when the video's length is known.
 */
export function validateReport(r: ReportDraft, duration?: number): string | null {
  if (r.action !== 'none') return '修正與重做即將開放';
  if (r.marks.length > MAX_MARKS) return `最多標 ${MAX_MARKS} 處`;
  const suggestion = r.suggestion.trim();
  if (suggestion.length > MAX_TEXT) return `建議最多 ${MAX_TEXT} 字`;
  for (const m of r.marks) {
    if (!isSec(m.at)) return '標記的時間不正確';
    if (m.end !== undefined && (!isSec(m.end) || m.end < m.at)) return '標記的時間不正確';
    if (duration !== undefined && (m.end ?? m.at) > duration + END_SLACK) return '標記超出影片長度';
    if (!m.category) return '每個標記請選一個類別';
    if (m.note.trim().length > MAX_TEXT) return `備註最多 ${MAX_TEXT} 字`;
  }
  if (!r.ok && !r.marks.length && !suggestion) return '請標出哪裡有問題，或寫下建議';
  return null;
}

/** `MM-DD HH:mm` in local time. */
const stamp = (iso: string) => {
  const d = new Date(iso);
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** The problem-report form under a finished video: 沒問題 with a note, or time marks + a suggestion. */
@Component({
  selector: 'app-report-form',
  templateUrl: './report-form.component.html',
  styleUrl: './report-form.component.scss',
})
export class ReportFormComponent {
  readonly job = input.required<BetaJob>();
  /** The card's video: marks read its current time and clicking a mark seeks it. */
  readonly video = input<HTMLVideoElement | null>(null);

  /** Every report on this video, emitted after a report went through. */
  readonly reported = output<BetaFeedback[]>();

  protected readonly categories = FEEDBACK_CATEGORIES;
  protected readonly actions = ACTIONS;
  protected readonly maxMarks = MAX_MARKS;
  protected readonly maxText = MAX_TEXT;
  protected readonly time = formatTime;
  protected readonly stamp = stamp;
  protected readonly choice = signal<'ok' | 'bad' | null>(null);
  protected readonly okNote = signal('');
  protected readonly marks = signal<FormMark[]>([]);
  protected readonly suggestion = signal('');
  protected readonly error = signal('');
  protected readonly sending = signal(false);
  /** Every report on this video, newest first; set once a report went through. */
  protected readonly past = signal<BetaFeedback[] | null>(null);
  private nextKey = 0;

  private now() {
    const v = this.video();
    const t = tenth(v?.currentTime ?? 0);
    // rounding up near the end must not land past the video's length
    return v && isSec(v.duration) ? Math.min(t, v.duration) : t;
  }

  protected pick(c: 'ok' | 'bad') {
    this.choice.set(c);
    this.error.set('');
  }

  protected markNow() {
    if (this.marks().length >= MAX_MARKS) return;
    const m: FormMark = { key: this.nextKey++, at: this.now(), category: null, note: '' };
    this.marks.update((l) => [...l, m].sort((a, b) => a.at - b.at));
    this.error.set('');
  }

  protected patch(key: number, p: Partial<DraftMark>) {
    this.marks.update((l) => l.map((m) => (m.key === key ? { ...m, ...p } : m)));
  }

  protected setEnd(m: FormMark) {
    const t = this.now();
    if (t <= m.at) return this.error.set('結束時間要晚於標記的時間');
    this.patch(m.key, { end: t });
    this.error.set('');
  }

  protected remove(key: number) {
    this.marks.update((l) => l.filter((m) => m.key !== key));
  }

  protected seek(m: FormMark) {
    const v = this.video();
    if (v) v.currentTime = m.at;
  }

  protected again() {
    this.choice.set(null);
    this.okNote.set('');
    this.marks.set([]);
    this.suggestion.set('');
    this.error.set('');
    this.past.set(null);
  }

  private draft(): ReportDraft {
    if (this.choice() === 'ok') return { ok: true, marks: [], suggestion: this.okNote(), action: 'none' };
    const marks = this.marks().map(({ at, end, category, note }) => ({ at, ...(end !== undefined ? { end } : {}), category, note }));
    return { ok: false, marks, suggestion: this.suggestion(), action: 'none' };
  }

  protected async send() {
    const body = this.draft();
    const d = this.video()?.duration;
    const problem = validateReport(body, d !== undefined && isSec(d) ? d : undefined);
    if (problem) return this.error.set(problem);
    this.sending.set(true);
    this.error.set('');
    const url = `/beta/jobs/${this.job().id}/feedback`;
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      // a proxy error page (502) is not JSON
      const res = (await r.json().catch(() => null)) as (BetaFeedback & { error?: string }) | null;
      if (!r.ok) return this.error.set(`無法送出：${res?.error ?? `HTTP ${r.status}`}`);
      const all = await fetch(url).then((x) => (x.ok ? (x.json() as Promise<BetaFeedback[]>) : null)).catch(() => null);
      this.past.set(all ?? (res ? [res] : []));
      this.reported.emit(this.past()!);
    } catch {
      this.error.set('無法送出：網路連線失敗');
    } finally {
      this.sending.set(false);
    }
  }
}
