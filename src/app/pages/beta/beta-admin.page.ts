import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminJob, AdminTotals, jobName, jobState, kpis, needHelp, retryLabel } from './admin';
import { AdminStylesComponent } from './admin-styles.component';
import { BetaMe, BetaSong, songChip, songView } from './beta';
import { PriceComponent } from './ui/price.component';
import { StatusChipComponent } from './ui/status-chip.component';

const POLL_MS = 5000;
/** How many of the newest jobs the overview's queue card lists; the 工作 tab has them all. */
const RECENT = 8;
export type AdminTab = 'overview' | 'songs' | 'jobs' | 'styles';
export const ADMIN_TABS: { id: AdminTab; label: string }[] = [
  { id: 'overview', label: '總覽' },
  { id: 'songs', label: '歌曲' },
  { id: 'jobs', label: '工作' },
  { id: 'styles', label: '風格' },
];

/** The beta admin (3c): KPIs, invites and limits, accounts and the job queue; the 歌曲, 工作 and 風格 tabs. */
@Component({
  selector: 'app-beta-admin-page',
  imports: [NgTemplateOutlet, FormsModule, PriceComponent, StatusChipComponent, AdminStylesComponent],
  templateUrl: './beta-admin.page.html',
  styleUrl: './beta-admin.page.scss',
})
export class BetaAdminPage {
  protected readonly tabs = ADMIN_TABS;
  protected readonly tab = signal<AdminTab>(this.tabFromUrl());
  protected readonly users = signal<BetaMe[]>([]);
  protected readonly jobs = signal<AdminJob[]>([]);
  protected readonly songs = signal<BetaSong[]>([]);
  protected readonly totals = signal<AdminTotals>({ globalLimitUsd: 0, spentUsd: 0, platformSpentUsd: 0 });
  protected readonly message = signal('');
  protected readonly loginUrl = signal('');
  protected readonly kpis = computed(() => kpis(this.users(), this.jobs(), this.songs(), this.totals()));
  protected readonly stuck = computed(() => needHelp(this.songs(), this.jobs()));
  protected readonly sorted = computed(() => [...this.jobs()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  protected readonly recent = computed(() => this.sorted().slice(0, RECENT));
  protected readonly queueNote = computed(() => {
    const running = this.jobs().filter((j) => j.status === 'running').length;
    const queued = this.jobs().filter((j) => j.status === 'queued').length;
    return `一次一個 · ${running} 個在跑 · ${queued} 個排隊`;
  });
  protected readonly songRows = computed(() =>
    this.songs().map((s) => {
      const mine = this.jobs().filter((j) => j.songId === s.id);
      const last = [s.createdAt, ...mine.map((j) => j.endedAt ?? j.startedAt ?? j.createdAt)].sort().at(-1)!;
      return { id: s.id, title: s.title, owner: this.userName(s.userId), last, jobs: mine.length, chip: songChip(songView(s, mine)) };
    }).sort((a, b) => b.last.localeCompare(a.last)),
  );
  /** The job whose 重跑 or 放行 is on its way to the server; its buttons are off until the answer. */
  protected readonly acting = signal<string | null>(null);
  protected invite = { name: '', limitUsd: 25 };
  protected globalLimit = 0;

  constructor() {
    const timer = setInterval(() => this.poll(), POLL_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
    this.poll().then(() => (this.globalLimit = this.totals().globalLimitUsd));
  }

  protected readonly name = jobName;
  protected readonly retryLabel = retryLabel;
  protected readonly state = (j: AdminJob) => jobState(this.jobs(), j);
  protected userName = (id: string) => this.users().find((u) => u.id === id)?.name ?? id;
  protected songTitle = (id: string) => this.songs().find((s) => s.id === id)?.title ?? id;
  protected songHref = (id: string) => `/my/admin/song?id=${encodeURIComponent(id)}`;
  protected when = (iso: string) => iso.slice(5, 16).replace('T', ' ');
  protected video = (j: AdminJob) => `/beta/jobs/${j.id}/video`;
  protected retried = (j: AdminJob) => this.jobs().some((x) => x.retryOf === j.id);

  protected show(tab: AdminTab) {
    this.tab.set(tab);
    const url = new URL(location.href);
    if (tab === 'overview') url.searchParams.delete('tab');
    else url.searchParams.set('tab', tab);
    history.replaceState(null, '', url);
  }

  protected async addUser() {
    const r = await this.send('POST', '/beta/admin/users', this.invite);
    if (r) {
      this.loginUrl.set(r.loginUrl);
      this.message.set(`已建立 ${this.invite.name}。把下面的登入連結私下傳給對方（只會顯示這一次）。`);
      this.invite = { name: '', limitUsd: 25 };
    }
  }

  protected setLimit(u: BetaMe, value: string) {
    return this.send('PATCH', `/beta/admin/users/${u.id}`, { limitUsd: Number(value) });
  }

  protected async newLink(u: BetaMe) {
    const r = await this.send('PATCH', `/beta/admin/users/${u.id}`, { newLink: true });
    if (r?.loginUrl) {
      this.loginUrl.set(r.loginUrl);
      this.message.set(`${u.name} 的新登入連結（舊連結已失效，只會顯示這一次）：`);
    }
  }

  protected toggle(u: BetaMe) {
    return this.send('PATCH', `/beta/admin/users/${u.id}`, { disabled: !u.disabled });
  }

  protected saveGlobal() {
    return this.send('PUT', '/beta/admin/limit', { globalLimitUsd: this.globalLimit });
  }

  protected retry(j: AdminJob) {
    return this.act(j, 'retry');
  }

  protected approve(j: AdminJob) {
    return this.act(j, 'approve');
  }

  /** One admin action on a job at a time: a second click while the first is on its way would re-run or release it twice. */
  private async act(j: AdminJob, what: 'retry' | 'approve') {
    if (this.acting()) return null;
    this.acting.set(j.id);
    try {
      return await this.send('POST', `/beta/admin/jobs/${j.id}/${what}`);
    } finally {
      this.acting.set(null);
    }
  }

  protected async copyLink() {
    try {
      await navigator.clipboard.writeText(this.loginUrl());
      this.message.set('已複製登入連結');
    } catch {
      this.message.set('無法複製，請手動選取連結');
    }
  }

  private tabFromUrl(): AdminTab {
    const t = new URLSearchParams(location.search).get('tab');
    return ADMIN_TABS.some((x) => x.id === t) ? (t as AdminTab) : 'overview';
  }

  private async send(method: string, path: string, body?: unknown) {
    const r = await fetch(path, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) this.message.set(`失敗：${data.error ?? r.status}`);
    await this.poll();
    return r.ok ? data : null;
  }

  private async poll() {
    try {
      const get = async (p: string) => {
        const r = await fetch(p, { cache: 'no-store' });
        if (!r.ok) throw new Error(r.status === 403 ? '只有管理者可以使用' : r.status === 401 ? '請用邀請連結登入' : `HTTP ${r.status}`);
        return r.json();
      };
      const [u, jobs, songs] = await Promise.all([get('/beta/admin/users'), get('/beta/admin/jobs'), get('/beta/songs')]);
      this.users.set(u.users);
      this.totals.set({ globalLimitUsd: u.globalLimitUsd, spentUsd: u.spentUsd, platformSpentUsd: u.platformSpentUsd ?? 0 });
      this.jobs.set(jobs);
      this.songs.set(songs);
    } catch (e) {
      this.message.set((e as Error).message);
    }
  }
}
