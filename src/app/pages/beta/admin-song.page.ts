import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { BetaEvent, BetaFeedback, BetaJob, BetaMe, BetaSong, FEEDBACK_CATEGORIES, TIER_INFO, timeline } from './beta';

const STATUS: Record<BetaJob['status'], string> = { queued: '排隊中', running: '執行中', done: '完成', failed: '失敗', admin: '等你確認' };
const POLL_MS = 10000;
const LOG_LINES = 2000;
type AdminJob = BetaJob & { userId: string; reservedUsd: number; unsettled?: string; error?: string; fused?: boolean; costs?: { key: string; usd: number; phase?: string }[]; chargedUsd: number };
interface LogFile { path: string; bytes: number }

/** Admin view of one song (/my/admin/song?id=): jobs, steps, costs, event timeline, logs and user reports. */
@Component({
  selector: 'app-beta-admin-song-page',
  templateUrl: './admin-song.page.html',
  styleUrls: ['./beta.page.scss', './admin-song.page.scss'],
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
  protected readonly status = STATUS;
  protected readonly rows = computed(() => timeline(this.events()));
  protected readonly newest = computed(() => [...this.jobs()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  protected readonly charged = computed(() => this.jobs().reduce((s, j) => s + j.chargedUsd, 0));
  protected readonly platform = computed(() => this.jobs().reduce((s, j) => s + (j.costUsd ?? 0), 0));

  constructor() {
    this.load();
    const timer = setInterval(() => this.refresh(), POLL_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  private readonly key = encodeURIComponent(this.id);
  protected what = (j: AdminJob) => (j.kind === 'prep' ? '準備歌曲' : TIER_INFO[j.tier!]?.name ?? j.tier);
  protected clock = (iso?: string) => (iso ? iso.slice(5, 19).replace('T', ' ') : '');
  protected category = (id: string) => FEEDBACK_CATEGORIES.find((c) => c.id === id)?.label ?? id;
  protected costRows = (j: AdminJob) => j.costs ?? [];
  protected logUrl = (path: string) => `/beta/admin/songs/${this.key}/logs/${path.split('/').map(encodeURIComponent).join('/')}`;
  protected kb = (bytes: number) => (bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`);

  /** Seconds from each step to the next one (the last step runs until the job ended). */
  protected steps(j: AdminJob) {
    const list = j.steps ?? [];
    return list.map((s, i) => {
      const end = list[i + 1]?.at ?? j.endedAt;
      const secs = end ? Math.round((Date.parse(end) - Date.parse(s.at)) / 1000) : undefined;
      return { phase: s.phase, at: s.at, secs };
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

  /** While one of this song's jobs is queued or running, re-read the jobs and events (logs and reports load on open or click). */
  private async refresh() {
    if (!this.jobs().some((j) => j.status === 'queued' || j.status === 'running')) return;
    try {
      const [jobs, events] = await Promise.all([this.get('/beta/admin/jobs'), this.get(`/beta/admin/songs/${this.key}/events`)]);
      this.jobs.set((jobs as AdminJob[]).filter((j) => j.songId === this.id));
      this.events.set(events);
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
      if (!song) this.message.set('找不到這首歌');
    } catch (e) {
      this.message.set((e as Error).message);
    }
  }
}
