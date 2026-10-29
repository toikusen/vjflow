import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { AdminJob, clockTime, fileSize, jobName, jobsChanged, jobState, mmss, shortDate, songMoney, stepRows } from './admin';
import { ACTION, BetaEvent, BetaFeedback, BetaMe, BetaSong, FEEDBACK_CATEGORIES, timeline } from './beta';
import { PriceComponent } from './ui/price.component';
import { StatusChipComponent } from './ui/status-chip.component';

const POLL_MS = 10000;
const LOG_LINES = 2000;
interface LogFile { path: string; bytes: number }
export type SongSection = 'jobs' | 'timeline' | 'logs' | 'reports';

/** Admin view of one song (3d, /my/admin/song?id=): job cards with steps and costs, the event timeline, logs and the person's reports. */
@Component({
  selector: 'app-beta-admin-song-page',
  imports: [PriceComponent, StatusChipComponent],
  templateUrl: './admin-song.page.html',
  styleUrl: './admin-song.page.scss',
  host: { '[attr.data-section]': 'section()' },
})
export class BetaAdminSongPage {
  protected readonly id = new URLSearchParams(location.search).get('id') ?? '';
  protected readonly song = signal<BetaSong | undefined>(undefined);
  protected readonly owner = signal('');
  protected readonly jobs = signal<AdminJob[]>([]);
  protected readonly events = signal<BetaEvent[]>([]);
  protected readonly logs = signal<LogFile[]>([]);
  protected readonly feedback = signal<BetaFeedback[]>([]);
  protected readonly message = signal('');
  protected readonly openLog = signal<{ path: string; text: string; cut: boolean } | undefined>(undefined);
  /** Which job cards are expanded; the newest job opens on load. */
  protected readonly open = signal<Set<string>>(new Set());
  /** The phone's segmented control: one section at a time (desktop shows them all). */
  protected readonly section = signal<SongSection>('jobs');
  protected readonly action = ACTION;
  protected readonly rows = computed(() => timeline(this.events()));
  protected readonly newest = computed(() => [...this.jobs()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  protected readonly money = computed(() => songMoney(this.jobs()));
  protected readonly sections = computed((): { id: SongSection; label: string }[] => [
    { id: 'jobs', label: `工作 ${this.jobs().length}` },
    { id: 'timeline', label: '時間線' },
    { id: 'logs', label: 'Log' },
    { id: 'reports', label: `回報 ${this.feedback().length}` },
  ]);

  constructor() {
    this.load();
    const timer = setInterval(() => this.refresh(), POLL_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  private readonly key = encodeURIComponent(this.id);
  protected readonly name = jobName;
  protected readonly state = (j: AdminJob) => jobState(this.jobs(), j);
  protected readonly when = shortDate;
  protected readonly clock = clockTime;
  protected readonly mmss = mmss;
  protected readonly size = fileSize;
  protected readonly steps = stepRows;
  protected category = (id: string) => FEEDBACK_CATEGORIES.find((c) => c.id === id)?.label ?? id;
  protected costRows = (j: AdminJob) => j.costs ?? [];
  protected logUrl = (path: string) => `/beta/admin/songs/${this.key}/logs/${path.split('/').map(encodeURIComponent).join('/')}`;
  protected jobLabel = (id: string) => {
    const j = this.jobs().find((x) => x.id === id);
    return j ? `${id} ${jobName(j)}` : id;
  };

  /** The small note after a job's status: where it stopped, the error, a skipped auto-retry, what it re-ran. */
  protected note(j: AdminJob): string {
    const skipped = this.events().some((e) => e.type === 'job.autoretry.skipped' && e['retryOf'] === j.id);
    return [
      j.unsettled ? `中斷於 ${j.unsettled}` : '',
      j.error ?? '',
      skipped ? '略過自動重試（全站額度不足）' : '',
      j.auto ? '自動重試' : '',
      j.retryOf ? `重跑自 ${j.retryOf}` : '',
      j.fused ? '保險絲' : '',
    ].filter(Boolean).join(' · ');
  }

  /** The phone card's one note line: the status detail and the note, whichever exist. */
  protected headNote(j: AdminJob): string {
    return [this.state(j).detail, this.note(j)].filter(Boolean).join(' · ');
  }

  protected toggle(id: string) {
    this.open.update((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  protected async showLog(path: string) {
    try {
      const r = await fetch(this.logUrl(path), { cache: 'no-store' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const lines = (await r.text()).split('\n');
      const cut = lines.length > LOG_LINES;
      this.openLog.set({ path, text: (cut ? lines.slice(-LOG_LINES) : lines).join('\n'), cut });
    } catch (e) {
      this.message.set(`讀取 log 失敗：${(e as Error).message}`);
    }
  }

  private async get(p: string) {
    const r = await fetch(p, { cache: 'no-store' });
    if (!r.ok) throw new Error(r.status === 403 ? '只有管理者可以使用' : r.status === 401 ? '請用邀請連結登入' : `HTTP ${r.status}`);
    return r.json();
  }

  /**
   * Every tick re-reads the jobs and events (two cheap GETs), whether or not something runs: a job the person queues
   * after the page opened must show up. When a job came, went, changed status or ended, or an event was added (a
   * report is one), the logs and reports are read again too.
   */
  private async refresh() {
    try {
      const [jobs, events] = await Promise.all([this.get('/beta/admin/jobs'), this.get(`/beta/admin/songs/${this.key}/events`)]);
      const next = (jobs as AdminJob[]).filter((j) => j.songId === this.id);
      const more = jobsChanged(this.jobs(), next) || (events as BetaEvent[]).length !== this.events().length;
      this.jobs.set(next);
      this.events.set(events);
      if (!more) return;
      const [feedback, logs] = await Promise.all([this.get('/beta/admin/feedback'), this.get(`/beta/admin/songs/${this.key}/logs`)]);
      this.feedback.set((feedback as BetaFeedback[]).filter((f) => f.songId === this.id));
      this.logs.set(logs);
    } catch (e) {
      this.message.set((e as Error).message);
    }
  }

  private async load() {
    const get = (p: string) => this.get(p);
    try {
      const [songs, users, jobs, feedback, events, logs] = await Promise.all([
        get('/beta/songs'), get('/beta/admin/users'), get('/beta/admin/jobs'), get('/beta/admin/feedback'),
        get(`/beta/admin/songs/${this.key}/events`), get(`/beta/admin/songs/${this.key}/logs`),
      ]);
      const song = (songs as BetaSong[]).find((s) => s.id === this.id);
      this.song.set(song);
      this.owner.set((users.users as BetaMe[]).find((u) => u.id === song?.userId)?.name ?? song?.userId ?? '');
      this.jobs.set((jobs as AdminJob[]).filter((j) => j.songId === this.id));
      this.feedback.set((feedback as BetaFeedback[]).filter((f) => f.songId === this.id));
      this.events.set(events);
      this.logs.set(logs);
      const first = this.newest()[0];
      if (first) this.open.set(new Set([first.id]));
      if (!song) this.message.set('找不到這首歌');
    } catch (e) {
      this.message.set((e as Error).message);
    }
  }
}
