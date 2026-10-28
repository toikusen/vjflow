import { Component, computed, effect, ElementRef, input, output, signal, viewChild } from '@angular/core';
import { BetaFeedback, BetaJob, BetaSong, BetaTier, FEEDBACK_CATEGORIES, FeedbackAction, FeedbackCategory, FIX_PRICE, fixAllowed, fixBlock, fixKindFor, JOB_STEPS, NOT_FIXABLE, TIER_INFO } from './beta';
import { jobTitle, stamp } from './song';
import { Ask } from './ui/confirm';
import { ConfirmDialogComponent } from './ui/confirm-dialog.component';
import { PriceComponent } from './ui/price.component';

const MAX_TEXT = 1000;
const MAX_MARKS = 20;
/** Same slack as the server: the browser's and the pipeline's video lengths can differ slightly. */
const END_SLACK = 0.5;
/** Marker badge colours, by the mark's place on the timeline (the 2d artboard: coral, then amber). */
const MARK_COLORS = ['var(--accent)', 'var(--warn)', 'var(--info)', 'var(--ok)'];
const FIX_MIN = Math.round(JOB_STEPS.fix.reduce((s, x) => s + x.min, 0));

/** A mark being written: the category is picked after the time is marked. */
export interface DraftMark { at: number; end?: number; category: FeedbackCategory | null; note: string }
export interface ReportDraft { ok: boolean; marks: DraftMark[]; suggestion: string; action: FeedbackAction }
interface FormMark extends DraftMark { key: number }
/** What a 重做 hands the page: the result's tier and the suggestion, for 製作新版本. */
export interface RedoRequest { tier: BetaTier; feeling: string }

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
 * `duration` (seconds) bounds the marks when the video's length is known; `tier` decides whether a fix is allowed.
 */
export function validateReport(r: ReportDraft, duration?: number, tier?: BetaTier): string | null {
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
  if (r.action === 'fix' && !fixAllowed(r.marks, tier)) return NOT_FIXABLE;
  return null;
}

/** The 送出 button's words for each way of handling the report. */
export function sendLabel(action: FeedbackAction, ok: boolean): string {
  if (ok || action === 'none') return '送出回報';
  return action === 'fix' ? '送出回報並修正' : '送出回報，去製作新版本';
}

/** The confirm dialog's explanation of a fix, by what it does. */
export const fixBody = (kind: 'picture' | 'timing' | undefined) =>
  kind === 'timing'
    ? `會用你改好的歌詞時間重新輸出一支新影片，畫面不變，原本的版本保留。約 ${FIX_MIN} 分鐘，可以離開頁面。`
    : `會把標記範圍裡的圖片拿掉，其餘照舊，重新輸出一支新影片，原本的版本保留。約 ${FIX_MIN} 分鐘，可以離開頁面。`;

/**
 * 回報這個作品 (2d), opened inside a result card: the video with a mark timeline on the left; on the right ① 沒問題／有問題,
 * ② the marks with a category each, ③ a suggestion and how to handle it (修正 $1 through the confirm dialog, 重做 → 製作新版本, 只回報 · 免費).
 */
@Component({
  selector: 'app-report-form',
  imports: [ConfirmDialogComponent, PriceComponent],
  templateUrl: './report-form.component.html',
  styleUrl: './report-form.component.scss',
  host: { '[hidden]': '!open()' },
})
export class ReportFormComponent {
  readonly job = input.required<BetaJob>();
  readonly song = input.required<BetaSong>();
  /** Whether the card shows the form; a closed form keeps its draft but stops its video. */
  readonly open = input(true);
  /** Whether a job of this song is queued or running (a fix cannot be queued then). */
  readonly active = input(false);
  /** What the person has left; null while unknown. */
  readonly left = input<number | null>(null);
  /** The song's length from its timing, used for the timeline until the video reports its own. */
  readonly duration = input<number | null>(null);

  /** Every report on this video, emitted after a report went through. */
  readonly reported = output<BetaFeedback[]>();
  /** A fix was queued; the text is for the page's toast (the page then polls). */
  readonly started = output<string>();
  /** A 重做 report went through: the page opens 製作新版本 with these. */
  readonly redo = output<RedoRequest>();
  /** The person folded the form. */
  readonly closed = output<void>();

  protected readonly categories = FEEDBACK_CATEGORIES;
  protected readonly maxMarks = MAX_MARKS;
  protected readonly maxText = MAX_TEXT;
  protected readonly fixPrice = FIX_PRICE;
  protected readonly time = formatTime;
  protected readonly stamp = stamp;
  protected readonly verdict = signal<'ok' | 'issue' | null>(null);
  protected readonly marks = signal<FormMark[]>([]);
  protected readonly suggestion = signal('');
  protected readonly action = signal<FeedbackAction>('none');
  protected readonly error = signal('');
  /** The report is on its way; 送出 stays off so a second click sends nothing. */
  protected readonly submitting = signal(false);
  /** Every report on this video, newest first; set once a report went through. */
  protected readonly past = signal<BetaFeedback[] | null>(null);
  /** What the last sent report asked for, for the line under 已收到回報. */
  protected readonly sent = signal<FeedbackAction>('none');
  protected readonly ask = signal<Ask | null>(null);
  /** The video's current time and length, as its events report them. */
  protected readonly now = signal(0);
  protected readonly videoLength = signal<number | null>(null);
  private readonly vid = viewChild<ElementRef<HTMLVideoElement>>('vid');
  private nextKey = 0;

  protected readonly url = computed(() => `/beta/jobs/${this.job().id}/video`);
  protected readonly meta = computed(() => {
    const j = this.job();
    const t = jobTitle(j);
    return [t.name + (t.tag ? ` · ${t.tag}` : ''), j.style, j.endedAt ? `完成於 ${stamp(j.endedAt)}` : ''].filter(Boolean).join(' · ');
  });
  protected readonly length = computed(() => this.videoLength() ?? this.duration() ?? 0);
  protected readonly pct = computed(() => (this.length() > 0 ? Math.min(100, (this.now() / this.length()) * 100) : 0));
  protected readonly pos = (m: DraftMark) => (this.length() > 0 ? Math.min(100, (m.at / this.length()) * 100) : 0);
  protected readonly color = (i: number) => MARK_COLORS[i % MARK_COLORS.length];
  protected readonly fixKind = computed(() => fixKindFor(this.marks()));
  /** Why 修正 is off right now, or null. */
  protected readonly fixWhy = computed(() => fixBlock({ marks: this.marks(), tier: this.job().tier, active: this.active(), left: this.left() }));
  protected readonly label = computed(() => sendLabel(this.action(), this.verdict() === 'ok'));
  protected readonly timingUrl = computed(() => `/timing?beta=${this.song().id}`);

  constructor() {
    effect(() => {
      if (!this.open()) this.vid()?.nativeElement.pause();
    });
    // a fix the marks no longer allow falls back to 只回報
    effect(() => {
      if (this.fixWhy() && this.action() === 'fix') this.action.set('none');
    });
  }

  private current() {
    const v = this.vid()?.nativeElement;
    const t = tenth(v?.currentTime ?? 0);
    // rounding up near the end must not land past the video's length
    return v && isSec(v.duration) ? Math.min(t, v.duration) : t;
  }

  protected tick(v: HTMLVideoElement) {
    this.now.set(v.currentTime);
  }

  protected measured(v: HTMLVideoElement) {
    if (isSec(v.duration)) this.videoLength.set(v.duration);
  }

  protected pick(v: 'ok' | 'issue') {
    this.verdict.set(v);
    this.error.set('');
  }

  protected choose(a: FeedbackAction) {
    if (a === 'fix' && this.fixWhy()) return;
    this.action.set(a);
    this.error.set('');
  }

  /** Adds a mark at the video's current time; the video keeps playing. Marking is itself the answer 有問題. */
  protected markNow() {
    if (this.marks().length >= MAX_MARKS) return;
    if (this.verdict() !== 'issue') this.verdict.set('issue');
    const m: FormMark = { key: this.nextKey++, at: this.current(), category: null, note: '' };
    this.marks.update((l) => [...l, m].sort((a, b) => a.at - b.at));
    this.error.set('');
  }

  protected patch(key: number, p: Partial<DraftMark>) {
    this.marks.update((l) => l.map((m) => (m.key === key ? { ...m, ...p } : m)));
    this.error.set('');
  }

  protected setEnd(m: FormMark) {
    const t = this.current();
    if (t <= m.at) return this.error.set('結束時間要晚於標記的時間');
    this.patch(m.key, { end: t });
  }

  protected remove(key: number) {
    this.marks.update((l) => l.filter((m) => m.key !== key));
    this.error.set('');
  }

  protected seek(m: DraftMark) {
    const v = this.vid()?.nativeElement;
    if (v) v.currentTime = m.at;
  }

  protected again() {
    this.verdict.set(null);
    this.marks.set([]);
    this.suggestion.set('');
    this.action.set('none');
    this.error.set('');
    this.past.set(null);
  }

  private draft(): ReportDraft {
    if (this.verdict() === 'ok') return { ok: true, marks: [], suggestion: this.suggestion(), action: 'none' };
    const marks = this.marks().map(({ at, end, category, note }) => ({ at, ...(end !== undefined ? { end } : {}), category, note }));
    return { ok: false, marks, suggestion: this.suggestion(), action: this.action() };
  }

  /** Checks the draft; a fix goes through the confirm dialog ($1), anything else is sent at once. */
  protected send() {
    if (this.submitting() || !this.verdict()) return;
    const body = this.draft();
    const d = this.vid()?.nativeElement.duration;
    const problem = validateReport(body, d !== undefined && isSec(d) ? d : undefined, this.job().tier);
    if (problem) return this.error.set(problem);
    if (body.action !== 'fix') return void this.post(body);
    const why = this.fixWhy();
    if (why) return this.error.set(why);
    this.ask.set({
      eyebrow: `${this.song().title} · ${TIER_INFO[this.job().tier ?? 'none'].name}`,
      title: '修正這個版本',
      body: fixBody(this.fixKind()),
      cost: FIX_PRICE,
      go: () => void this.post(body),
    });
  }

  private async post(body: ReportDraft) {
    if (this.submitting()) return;
    this.submitting.set(true);
    this.error.set('');
    const url = `/beta/jobs/${this.job().id}/feedback`;
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      // a proxy error page (502) is not JSON
      const res = (await r.json().catch(() => null)) as (BetaFeedback & { error?: string }) | null;
      if (!r.ok) return this.error.set(res?.error ?? `無法送出（HTTP ${r.status}）`);
      const all = await fetch(url).then((x) => (x.ok ? (x.json() as Promise<BetaFeedback[]>) : null)).catch(() => null);
      this.sent.set(body.action);
      this.past.set(all ?? (res ? [res] : []));
      this.reported.emit(this.past()!);
      if (body.action === 'fix') this.started.emit(`「${this.song().title}」的修正已排隊，完成後會出現在成品。`);
      if (body.action === 'redo') this.redo.emit({ tier: this.job().tier ?? 'none', feeling: body.suggestion.trim() });
    } catch {
      this.error.set('無法連線，請稍後再試');
    } finally {
      this.submitting.set(false);
    }
  }
}
