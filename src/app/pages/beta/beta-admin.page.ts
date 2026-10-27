import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BetaJob, BetaMe, BetaSong, TIER_INFO } from './beta';

const POLL_MS = 5000;
const STATUS: Record<BetaJob['status'], string> = { queued: '排隊中', running: '執行中', done: '完成', failed: '失敗', admin: '等你確認' };
type AdminJob = BetaJob & { userId: string; reservedUsd: number; costUsd?: number; error?: string };

/** The beta admin: invite people, set limits, watch the queue, retry failed jobs, release held videos. */
@Component({
  selector: 'app-beta-admin-page',
  imports: [FormsModule],
  templateUrl: './beta-admin.page.html',
  styleUrl: './beta.page.scss',
})
export class BetaAdminPage {
  protected readonly users = signal<BetaMe[]>([]);
  protected readonly jobs = signal<AdminJob[]>([]);
  protected readonly songs = signal<BetaSong[]>([]);
  protected readonly total = signal({ globalLimitUsd: 0, spentUsd: 0 });
  protected readonly message = signal('');
  protected readonly loginUrl = signal('');
  protected readonly sorted = computed(() => [...this.jobs()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  protected readonly status = STATUS;
  protected invite = { name: '', limitUsd: 25 };
  protected globalLimit = 0;

  constructor() {
    const timer = setInterval(() => this.poll(), POLL_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
    this.poll().then(() => (this.globalLimit = this.total().globalLimitUsd));
  }

  protected userName = (id: string) => this.users().find((u) => u.id === id)?.name ?? id;
  protected songTitle = (id: string) => this.songs().find((s) => s.id === id)?.title ?? id;
  protected what = (j: AdminJob) => (j.kind === 'prep' ? '準備歌曲' : TIER_INFO[j.tier!]?.name ?? j.tier);

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
    return this.send('POST', `/beta/admin/jobs/${j.id}/retry`);
  }

  protected approve(j: AdminJob) {
    return this.send('POST', `/beta/admin/jobs/${j.id}/approve`);
  }

  protected video(j: AdminJob) {
    return `/beta/songs/${j.songId}/video/${j.tier}`;
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
      this.total.set({ globalLimitUsd: u.globalLimitUsd, spentUsd: u.spentUsd });
      this.jobs.set(jobs);
      this.songs.set(songs);
    } catch (e) {
      this.message.set((e as Error).message);
    }
  }
}
