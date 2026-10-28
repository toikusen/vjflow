import { Component, DestroyRef, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BetaJob, BetaMe, BetaSong, jobProgress, PREP_PRICE, songStage, songView } from './beta';

const POLL_MS = 5000;

/** What a confirmation pop-up shows before money is set aside. */
export interface Ask {
  title: string;
  body: string;
  cost: number;
  go: () => void;
}
const LANGS: Record<string, string> = { ja: '日文', zh: '中文', en: '英文', ko: '韓文' };

/** A tester's songs (served by scripts/lyric-vj/beta/server.mts): add one; each card opens its song page. */
@Component({
  selector: 'app-beta-page',
  imports: [FormsModule],
  templateUrl: './beta.page.html',
  styleUrl: './beta.page.scss',
  host: { '(document:keydown.escape)': 'ask() && answer(false)' },
})
export class BetaPage {
  protected readonly me = signal<BetaMe | null>(null);
  protected readonly songs = signal<BetaSong[]>([]);
  protected readonly jobs = signal<BetaJob[]>([]);
  protected readonly message = signal('');
  protected readonly busy = signal(false);
  protected readonly loaded = signal(false);
  protected readonly stage = (s: BetaSong) => songStage(s, this.jobs());
  protected readonly view = (s: BetaSong) => songView(s, this.jobs());
  protected readonly progress = (j: BetaJob) => jobProgress(j);
  protected readonly fileName = signal('');
  protected readonly ask = signal<Ask | null>(null);
  protected readonly prepPrice = PREP_PRICE;
  protected readonly langs = Object.entries(LANGS);
  protected readonly langName = (l: string) => LANGS[l] ?? l;
  protected readonly left = (m: BetaMe) => Math.max(0, m.limitUsd - m.spentUsd);
  protected readonly usedPct = (m: BetaMe) => (m.limitUsd ? Math.min(100, (m.spentUsd / m.limitUsd) * 100) : 100);
  protected form = { title: '', artist: '', language: 'ja', lyrics: '' };
  private file: File | null = null;
  private fileInput: HTMLInputElement | null = null;

  constructor() {
    const timer = setInterval(() => this.poll(), POLL_MS);
    // leaving mid-upload cuts the audio off; once it is on the server the work goes on without this page
    const stay = (e: BeforeUnloadEvent) => this.busy() && e.preventDefault();
    addEventListener('beforeunload', stay);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(timer);
      removeEventListener('beforeunload', stay);
    });
    this.poll();
  }

  protected confirmAdd() {
    if (!this.file) return this.message.set('請選擇音檔');
    this.ask.set({
      title: `上傳「${this.form.title}」`,
      body: '上傳後會開始準備歌曲（分離人聲、自動對歌詞時間）。上傳過程中請勿關閉或離開這個頁面，上傳完成後就可以離開。',
      cost: PREP_PRICE,
      go: () => this.add(),
    });
  }

  protected answer(yes: boolean) {
    const a = this.ask();
    this.ask.set(null);
    if (yes) a?.go();
  }

  protected pick(e: Event) {
    this.fileInput = e.target as HTMLInputElement;
    this.file = this.fileInput.files?.[0] ?? null;
    this.fileName.set(this.file?.name ?? '');
  }

  private async add() {
    if (!this.file) return this.message.set('請選擇音檔');
    this.busy.set(true);
    this.message.set('上傳中，請勿關閉或離開這個頁面…');
    try {
      const made = await fetch('/beta/songs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(this.form) });
      const song = await made.json();
      if (!made.ok) throw new Error(song.error);
      const up = await fetch(`/beta/songs/${song.id}/audio`, { method: 'PUT', headers: { 'content-type': this.file.type || 'audio/mpeg' }, body: this.file });
      if (!up.ok) throw new Error((await up.json()).error);
      this.form = { title: '', artist: '', language: this.form.language, lyrics: '' };
      this.file = null;
      this.fileName.set('');
      if (this.fileInput) this.fileInput.value = '';
      this.message.set('已上傳，現在可以離開頁面。系統正在準備歌詞時間（約 5–10 分鐘），完成後請回來「確認時間」。');
      await this.poll();
    } catch (e) {
      this.message.set(`上傳失敗：${(e as Error).message}`);
    } finally {
      this.busy.set(false);
    }
  }

  protected async poll() {
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
      this.loaded.set(true);
    } catch (e) {
      this.message.set((e as Error).message);
    }
  }
}
