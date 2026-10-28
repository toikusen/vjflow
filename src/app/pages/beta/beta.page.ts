import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BetaJob, BetaMe, BetaSong, coverTint, filterCounts, inFilter, jobProgress, nextStep, pollOrder, PREP_PRICE, songChip, SongFilter, SONG_FILTERS, songView, SongView } from './beta';
import { balance } from './ui/balance';
import { BalanceComponent } from './ui/balance.component';
import { Ask } from './ui/confirm';
import { ConfirmDialogComponent } from './ui/confirm-dialog.component';
import { PriceComponent } from './ui/price.component';
import { BetaSession } from './ui/session';
import { StatusChipComponent } from './ui/status-chip.component';

const POLL_MS = 5000;

export type { Ask } from './ui/confirm';
const LANGS: Record<string, string> = { ja: '日文', zh: '中文', en: '英文', ko: '韓文' };

/** A tester's songs (served by scripts/lyric-vj/beta/server.mts): add one; each card opens its song page. */
@Component({
  selector: 'app-beta-page',
  imports: [FormsModule, BalanceComponent, ConfirmDialogComponent, PriceComponent, StatusChipComponent],
  templateUrl: './beta.page.html',
  styleUrl: './list.page.scss',
  host: { '[class.composing]': 'composing()' },
})
export class BetaPage {
  /** Shared with the shell, so its balance pill follows this page's poll. */
  protected readonly me = inject(BetaSession).me;
  protected readonly songs = signal<BetaSong[]>([]);
  protected readonly jobs = signal<BetaJob[]>([]);
  protected readonly message = signal('');
  protected readonly busy = signal(false);
  protected readonly loaded = signal(false);
  protected readonly chip = (v: SongView) => songChip(v);
  protected readonly progress = (j: BetaJob) => jobProgress(j);
  protected readonly filters = SONG_FILTERS;
  protected readonly filter = signal<SongFilter>('all');
  /** Phones show the add-song form as its own full page, opened from an entry row. */
  protected readonly composing = signal(false);
  /** Each song as its card shows it: state, chip, cover tint, subtitle, progress (while something runs) and next step. */
  protected readonly cards = computed(() =>
    this.songs().map((song) => {
      const view = songView(song, this.jobs());
      const job = view.active ?? (view.stage === 'preparing' ? view.prep : undefined);
      const progress = job ? jobProgress(job) : undefined;
      const made = view.results.length;
      return {
        song,
        view,
        chip: songChip(view),
        tint: coverTint(song.id),
        meta: [song.artist, this.langName(song.language), made ? `${made} 個成品` : '尚無成品'].filter(Boolean).join(' · '),
        pct: progress?.pct,
        next: nextStep(view, progress),
      };
    }),
  );
  protected readonly counts = computed(() => filterCounts(this.cards().map((c) => c.view)));
  protected readonly shown = computed(() => this.cards().filter((c) => inFilter(this.filter(), c.view)));
  protected readonly fileName = signal('');
  protected readonly ask = signal<Ask | null>(null);
  protected readonly prepPrice = PREP_PRICE;
  protected readonly langs = Object.entries(LANGS);
  protected readonly langName = (l: string) => LANGS[l] ?? l;
  /** What the signed-in person has left, null until `/beta/me` answers. */
  protected readonly left = () => {
    const m = this.me();
    return m ? balance(m).left : null;
  };
  protected form = { title: '', artist: '', language: 'ja', lyrics: '' };
  private file: File | null = null;
  private fileInput: HTMLInputElement | null = null;
  /** The poll in flight, if any, and the order of polls: a tick waits while one runs, a late answer is dropped. */
  private polling: Promise<void> | null = null;
  private readonly polls = pollOrder();

  constructor() {
    const timer = setInterval(() => void (this.polling ?? this.poll()), POLL_MS);
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
      eyebrow: this.form.title,
      title: '上傳並準備',
      body: '上傳後會開始準備歌曲（分離人聲、自動對歌詞時間）。上傳過程中請勿關閉或離開這個頁面，上傳完成後就可以離開。',
      cost: PREP_PRICE,
      go: () => this.add(),
    });
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
      this.composing.set(false);
      this.message.set('已上傳，現在可以離開頁面。系統正在準備歌詞時間（約 5–10 分鐘），完成後請回來「確認時間」。');
      await this.poll();
    } catch (e) {
      this.message.set(`上傳失敗：${(e as Error).message}`);
    } finally {
      this.busy.set(false);
    }
  }

  protected poll(): Promise<void> {
    const run = async () => {
      const n = this.polls.begin();
      const get = async <T,>(path: string): Promise<T> => {
        const r = await fetch(path, { cache: 'no-store' });
        if (r.status === 401) throw new Error('請用邀請連結登入');
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      };
      try {
        const [me, songs, jobs] = await Promise.all([get<BetaMe>('/beta/me'), get<BetaSong[]>('/beta/songs'), get<BetaJob[]>('/beta/jobs')]);
        // a newer poll (after an action) began meanwhile: its answer is the fresher one
        if (!this.polls.latest(n)) return;
        this.me.set(me);
        this.songs.set([...songs].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
        this.jobs.set(jobs);
        this.loaded.set(true);
      } catch (e) {
        if (this.polls.latest(n)) this.message.set((e as Error).message);
      }
    };
    const p = run().finally(() => {
      if (this.polling === p) this.polling = null;
    });
    return (this.polling = p);
  }
}
