import { Component, DestroyRef, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BetaJob, BetaMe, BetaSong, BetaTier, songStage, TIER_INFO } from './beta';

const POLL_MS = 5000;

/** A tester's songs (served by scripts/lyric-vj/beta/server.mts): add one, confirm its timing, pick a version, download. */
@Component({
  selector: 'app-beta-page',
  imports: [FormsModule],
  templateUrl: './beta.page.html',
  styleUrl: './beta.page.scss',
})
export class BetaPage {
  protected readonly me = signal<BetaMe | null>(null);
  protected readonly songs = signal<BetaSong[]>([]);
  protected readonly jobs = signal<BetaJob[]>([]);
  protected readonly message = signal('');
  protected readonly busy = signal(false);
  protected readonly tiers = Object.entries(TIER_INFO) as [BetaTier, (typeof TIER_INFO)[BetaTier]][];
  protected readonly stage = (s: BetaSong) => songStage(s, this.jobs());
  protected form = { title: '', artist: '', language: 'ja', lyrics: '' };
  private file: File | null = null;

  constructor() {
    const timer = setInterval(() => this.poll(), POLL_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
    this.poll();
  }

  protected pick(e: Event) {
    this.file = (e.target as HTMLInputElement).files?.[0] ?? null;
  }

  protected async add() {
    if (!this.file) return this.message.set('請選擇音檔');
    this.busy.set(true);
    this.message.set('上傳中…');
    try {
      const made = await fetch('/beta/songs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(this.form) });
      const song = await made.json();
      if (!made.ok) throw new Error(song.error);
      const up = await fetch(`/beta/songs/${song.id}/audio`, { method: 'PUT', headers: { 'content-type': this.file.type || 'audio/mpeg' }, body: this.file });
      if (!up.ok) throw new Error((await up.json()).error);
      this.form = { title: '', artist: '', language: this.form.language, lyrics: '' };
      this.file = null;
      this.message.set('已上傳，系統正在準備歌詞時間，完成後請到「確認時間」。');
      await this.poll();
    } catch (e) {
      this.message.set(`上傳失敗：${(e as Error).message}`);
    } finally {
      this.busy.set(false);
    }
  }

  protected async make(song: BetaSong, tier: BetaTier) {
    const r = await fetch(`/beta/songs/${song.id}/make`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tier }) });
    this.message.set(r.ok ? `「${song.title}」已開始排隊製作${TIER_INFO[tier].name}。` : `無法開始：${(await r.json()).error}`);
    await this.poll();
  }

  protected video(song: BetaSong, tier: BetaTier) {
    return `/beta/songs/${song.id}/video/${tier}`;
  }

  private async poll() {
    const get = async <T,>(path: string): Promise<T> => {
      const r = await fetch(path, { cache: 'no-store' });
      if (r.status === 401) throw new Error('請用邀請連結登入');
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    };
    try {
      const [me, songs, jobs] = await Promise.all([get<BetaMe>('/beta/me'), get<BetaSong[]>('/beta/songs'), get<BetaJob[]>('/beta/jobs')]);
      this.me.set(me);
      this.songs.set([...songs].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      this.jobs.set(jobs);
    } catch (e) {
      this.message.set((e as Error).message);
    }
  }
}
