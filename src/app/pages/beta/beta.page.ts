import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { audioProblem, audioType, BetaJob, BetaMe, BetaSong, coverTint, errorOf, filterCounts, inFilter, jobProgress, jsonOrError, nextStep, pollOrder, pollToast, PREP_PRICE, songChip, SongFilter, SONG_FILTERS, songView, SongView } from './beta';
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
  /** The song whose audio this page is sending now: its card says so instead of 等音檔 until the poll after the upload. */
  private readonly uploadingId = signal<string | null>(null);
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
        next: song.id === this.uploadingId() ? { label: '上傳中…', to: 'song' as const } : nextStep(view, progress),
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
  /** The toast the last failed poll wrote, cleared by the next poll that succeeds. */
  private readonly toast = pollToast();

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
    // the server's own checks, before a song is created for a file it would refuse
    const why = audioProblem(this.file);
    if (why) return this.message.set(why);
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
    const why = this.file && audioProblem(this.file);
    if (why) this.message.set(why);
  }

  /**
   * Sends a song's audio (`PUT /beta/songs/:id/audio`); the server starts the preparation on success. Throws with the
   * server's words when it refuses, or a connection line when the upload broke off.
   */
  protected async uploadAudio(songId: string, file: File): Promise<void> {
    let up: Response;
    try {
      up = await fetch(`/beta/songs/${songId}/audio`, { method: 'PUT', headers: { 'content-type': audioType(file) ?? 'audio/mpeg' }, body: file });
    } catch {
      throw new Error('連線中斷，請確認網路後再試');
    }
    if (!up.ok) throw new Error(errorOf(await jsonOrError(up), up.status));
  }

  private clearComposer() {
    this.form = { title: '', artist: '', language: this.form.language, lyrics: '' };
    this.file = null;
    this.fileName.set('');
    if (this.fileInput) this.fileInput.value = '';
    this.composing.set(false);
  }

  private async add() {
    if (!this.file) return this.message.set('請選擇音檔');
    const why = audioProblem(this.file);
    if (why) return this.message.set(why);
    this.busy.set(true);
    this.message.set('上傳中，請勿關閉或離開這個頁面…');
    const title = this.form.title;
    let songId: string | null = null;
    try {
      const made = await fetch('/beta/songs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(this.form) });
      const song = await jsonOrError<{ id: string }>(made);
      if (!made.ok) throw new Error(errorOf(song, made.status));
      songId = song.id;
      this.uploadingId.set(song.id);
      await this.uploadAudio(song.id, this.file);
      this.clearComposer();
      this.message.set('已上傳，現在可以離開頁面。系統正在準備歌詞時間（約 5–10 分鐘），完成後請回來「確認時間」。');
    } catch (e) {
      // the song exists once the audio failed: the form is cleared so a second try does not make a second song, and
      // the song page offers 重新上傳音檔
      if (songId) this.clearComposer();
      this.message.set(songId ? `上傳失敗：${(e as Error).message}。歌曲「${title}」已建立，請到歌曲頁重新上傳音檔。` : `上傳失敗：${(e as Error).message}`);
    } finally {
      this.busy.set(false);
      await this.poll();
      this.uploadingId.set(null);
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
        this.message.update((m) => this.toast.ok(m));
      } catch (e) {
        if (this.polls.latest(n)) this.message.set(this.toast.failed((e as Error).message));
      }
    };
    const p = run().finally(() => {
      if (this.polling === p) this.polling = null;
    });
    return (this.polling = p);
  }
}
