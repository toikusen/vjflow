import { Component, computed, input, signal, viewChild } from '@angular/core';
import { AdminJob, filterReports, isPendingReport, lessonSeed, mmss, ReportFilter, ruleFrom, shortDate, startOutcomes } from './admin';
import { AdminLessonsComponent, LessonSeed } from './admin-lessons.component';
import { BetaFeedback, BetaJob, BetaLesson, BetaMe, BetaProposalItem, BetaSong, categoryLabel, TRIAGE_OUTCOMES, TriageOutcome } from './beta';
import { jobTitle } from './song';

/**
 * 管理 · 回報: every report in one queue. Each is filed where it went (改程式 / 寫規則 / 加檢查 / 只屬於這首); a suggested
 * handling from proposals.json sits beside it, and nothing applies until the admin clicks. The rules live here too:
 * a report reaches a prompt only as a rule written for every song.
 */
@Component({
  selector: 'app-admin-reports',
  imports: [AdminLessonsComponent],
  templateUrl: './admin-reports.component.html',
  styleUrl: './admin-reports.component.scss',
})
export class AdminReportsComponent {
  readonly songs = input.required<readonly BetaSong[]>();
  readonly jobs = input.required<readonly AdminJob[]>();
  readonly users = input.required<readonly BetaMe[]>();

  protected readonly reports = signal<BetaFeedback[]>([]);
  protected readonly lessons = signal<BetaLesson[]>([]);
  protected readonly filter = signal<ReportFilter>('pending');
  protected readonly message = signal('');
  protected readonly busy = signal(false);
  /** The outcomes ticked and the note written per report, until it is filed. */
  protected readonly picks = signal<Readonly<Record<string, TriageOutcome[]>>>({});
  protected readonly notes = signal<Readonly<Record<string, string>>>({});
  protected readonly seed = signal<LessonSeed | undefined>(undefined);
  private readonly rules = viewChild(AdminLessonsComponent);

  protected readonly outcomes = TRIAGE_OUTCOMES;
  protected readonly filters = computed((): { id: ReportFilter; label: string }[] => [
    { id: 'pending', label: `待處理 ${this.reports().filter(isPendingReport).length}` },
    { id: 'done', label: `已處理 ${this.reports().filter((f) => f.triage).length}` },
    { id: 'all', label: `全部 ${this.reports().length}` },
  ]);
  protected readonly shown = computed(() => filterReports(this.reports(), this.filter()));
  protected readonly category = categoryLabel;
  protected readonly mmss = mmss;
  protected readonly when = shortDate;
  protected readonly label = (o: TriageOutcome) => TRIAGE_OUTCOMES.find((x) => x.id === o)?.label ?? o;
  protected readonly songTitle = (id: string) => this.songs().find((s) => s.id === id)?.title ?? id;
  protected readonly songHref = (id: string) => `/my/admin/song?id=${encodeURIComponent(id)}`;
  protected readonly userName = (id: string) => this.users().find((u) => u.id === id)?.name ?? id;
  protected readonly videoAt = (f: BetaFeedback, at: number) => `/beta/jobs/${f.jobId}/video#t=${at}`;
  /** 「文字動態版 v2」 of the video reported on; the bare tier when the job is gone. */
  protected readonly version = (f: BetaFeedback) => {
    const j = this.jobs().find((x) => x.id === f.jobId) as BetaJob | undefined;
    if (!j) return f.tier ?? '';
    const t = jobTitle(j, this.jobs() as unknown as BetaJob[]);
    return `${t.name}${t.version ? ` v${t.version}` : ''}`;
  };
  protected readonly picked = (f: BetaFeedback) => this.picks()[f.id] ?? startOutcomes(f);
  /** The rule this suggestion became, if it was adopted (and not cancelled since). */
  protected readonly ruleOf = (f: BetaFeedback, i: BetaProposalItem) => ruleFrom(this.lessons(), f.id, i.text);
  /** The adopted rule being edited beside its suggestion, and its text so far. */
  protected readonly editing = signal<string | null>(null);
  protected readonly editText = signal('');

  constructor() {
    void this.load();
  }

  private async load() {
    try {
      const [fb, lessons] = await Promise.all(['/beta/admin/feedback', '/beta/admin/lessons'].map(async (p) => {
        const r = await fetch(p, { cache: 'no-store' });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }));
      this.reports.set(fb as BetaFeedback[]);
      this.lessons.set(lessons as BetaLesson[]);
    } catch (e) {
      this.message.set(`回報讀不到：${(e as Error).message}`);
    }
  }

  protected toggle(f: BetaFeedback, o: TriageOutcome) {
    const now = this.picked(f);
    this.picks.update((m) => ({ ...m, [f.id]: now.includes(o) ? now.filter((x) => x !== o) : [...now, o] }));
  }

  protected setNote(f: BetaFeedback, text: string) {
    this.notes.update((m) => ({ ...m, [f.id]: text }));
  }

  /** One request at a time; a failure says so and leaves the report as it was. */
  private async act(what: string, go: () => Promise<Response>, done: (r: Response) => Promise<void>) {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      const r = await go();
      if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${r.status}`);
      await done(r);
      this.message.set('');
    } catch (e) {
      this.message.set(`${what}失敗：${(e as Error).message}`);
    } finally {
      this.busy.set(false);
    }
  }

  private replace(f: BetaFeedback, next: BetaFeedback) {
    // the answer is the stored report: the proposal is only ever added on the list's GET, so it is kept from before
    this.reports.update((list) => list.map((x) => (x.id === f.id ? { ...next, proposal: f.proposal } : x)));
  }

  protected file(f: BetaFeedback) {
    const body = JSON.stringify({ outcomes: this.picked(f), note: this.notes()[f.id] ?? f.triage?.note ?? '' });
    return this.act('歸類', () => fetch(`/beta/admin/feedback/${f.id}/triage`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body }), async (r) => this.replace(f, (await r.json()) as BetaFeedback));
  }

  protected reopen(f: BetaFeedback) {
    return this.act('改回待處理', () => fetch(`/beta/admin/feedback/${f.id}/triage`, { method: 'DELETE' }), async (r) => this.replace(f, (await r.json()) as BetaFeedback));
  }

  /** 採用: a suggested rule goes in as it stands; the list below reads it again. */
  protected adopt(f: BetaFeedback, i: BetaProposalItem) {
    const body = JSON.stringify({ text: i.text.trim(), scope: i.scope ?? 'both', feedbackId: f.id });
    return this.act('採用規則', () => fetch('/beta/admin/lessons', { method: 'POST', headers: { 'content-type': 'application/json' }, body }), async (r) => {
      const made = (await r.json()) as BetaLesson;
      this.lessons.update((list) => [made, ...list]);
      await this.rules()?.load();
    });
  }

  protected startEdit(l: BetaLesson) {
    this.editing.set(l.id);
    this.editText.set(l.text);
  }

  /** 儲存: the rule with what was added; it stays tied to its suggestion. */
  protected saveEdit(l: BetaLesson) {
    return this.act('修改規則', () => fetch(`/beta/admin/lessons/${l.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: this.editText() }) }), async (r) => {
      const next = (await r.json()) as BetaLesson;
      this.lessons.update((list) => list.map((x) => (x.id === l.id ? next : x)));
      this.editing.set(null);
      await this.rules()?.load();
    });
  }

  /** 取消規則: the rule leaves every later song; the suggestion can be adopted again. */
  protected cancelRule(l: BetaLesson) {
    return this.act('取消規則', () => fetch(`/beta/admin/lessons/${l.id}`, { method: 'DELETE' }), async () => {
      this.lessons.update((list) => list.filter((x) => x.id !== l.id));
      await this.rules()?.load();
    });
  }

  /** The list below changed something: the suggestions read the rules again. */
  protected async reloadLessons() {
    const r = await fetch('/beta/admin/lessons', { cache: 'no-store' });
    if (r.ok) this.lessons.set((await r.json()) as BetaLesson[]);
  }

  /** 寫成規則: the report's words into the form below, to be rewritten for every song. */
  protected draft(f: BetaFeedback) {
    this.seed.set({ text: lessonSeed(f, categoryLabel), feedbackId: f.id });
    document.getElementById('rules')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
