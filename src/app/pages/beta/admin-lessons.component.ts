import { Component, effect, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BetaLesson, LESSON_SCOPES, LessonScope } from './beta';

/** What a report hands the form: a first draft of the rule and the report it came from. */
export interface LessonSeed { text: string; feedbackId?: string }

/**
 * 管理 · 規則: the rules the admin wrote from people's reports, read by the director and the type planner on every later
 * song (`GET/POST /beta/admin/lessons`, `DELETE /beta/admin/lessons/:id`). A `seed` from a report fills the form; the admin
 * rewrites it as a rule for every song — a report never reaches a prompt as it was written.
 */
@Component({
  selector: 'app-admin-lessons',
  imports: [FormsModule],
  templateUrl: './admin-lessons.component.html',
  styleUrl: './admin-lessons.component.scss',
})
export class AdminLessonsComponent {
  readonly seed = input<LessonSeed | undefined>(undefined);
  /** The list changed here, for a page that shows the rules beside their reports. */
  readonly changed = output<void>();
  /** The rule being edited, and its text so far. */
  protected readonly editing = signal<string | null>(null);
  protected readonly draftText = signal('');
  protected readonly lessons = signal<BetaLesson[]>([]);
  protected readonly text = signal('');
  protected readonly scope = signal<LessonScope>('both');
  protected readonly feedbackId = signal<string | undefined>(undefined);
  protected readonly message = signal('');
  protected readonly busy = signal(false);
  protected readonly scopes = LESSON_SCOPES;
  protected readonly scopeLabel = (id: LessonScope) => LESSON_SCOPES.find((s) => s.id === id)?.label ?? id;

  constructor() {
    this.load();
    effect(() => {
      const s = this.seed();
      if (!s) return;
      this.text.set(s.text);
      this.feedbackId.set(s.feedbackId);
    });
  }

  async load() {
    try {
      const r = await fetch('/beta/admin/lessons', { cache: 'no-store' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      this.lessons.set((await r.json()) as BetaLesson[]);
    } catch (e) {
      this.message.set(`規則讀不到：${(e as Error).message}`);
    }
  }

  protected async add() {
    const text = this.text().trim();
    if ([...text].length < 4 || this.busy()) return;
    this.busy.set(true);
    try {
      const r = await fetch('/beta/admin/lessons', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, scope: this.scope(), feedbackId: this.feedbackId() }) });
      if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${r.status}`);
      const made = (await r.json()) as BetaLesson;
      this.lessons.update((list) => [made, ...list]);
      this.changed.emit();
      this.text.set('');
      this.feedbackId.set(undefined);
      this.message.set('');
    } catch (e) {
      this.message.set(`規則沒有存成功：${(e as Error).message}`);
    } finally {
      this.busy.set(false);
    }
  }

  protected startEdit(l: BetaLesson) {
    this.editing.set(l.id);
    this.draftText.set(l.text);
  }

  protected async saveEdit(l: BetaLesson) {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      const r = await fetch(`/beta/admin/lessons/${encodeURIComponent(l.id)}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: this.draftText() }) });
      if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${r.status}`);
      const next = (await r.json()) as BetaLesson;
      this.lessons.update((list) => list.map((x) => (x.id === l.id ? next : x)));
      this.editing.set(null);
      this.message.set('');
      this.changed.emit();
    } catch (e) {
      this.message.set(`規則沒有改成功：${(e as Error).message}`);
    } finally {
      this.busy.set(false);
    }
  }

  protected async remove(l: BetaLesson) {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      const r = await fetch(`/beta/admin/lessons/${encodeURIComponent(l.id)}`, { method: 'DELETE' });
      if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${r.status}`);
      this.lessons.update((list) => list.filter((x) => x.id !== l.id));
      this.changed.emit();
      this.message.set('');
    } catch (e) {
      this.message.set(`規則沒有刪掉：${(e as Error).message}`);
    } finally {
      this.busy.set(false);
    }
  }
}
