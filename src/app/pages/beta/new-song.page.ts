import { Component, computed, DestroyRef, effect, ElementRef, inject, signal, untracked, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { audioReadingOf, decodeMono, AudioReading } from '../../lyric-vj/free-audio';
import { parseLyrics } from '../../lyric-vj/free-lyrics';
import type { SongTimeline } from '../../lyric-vj/timeline';
import { peaksOf } from '../timing/timing-view';
import { BEAT_RATE } from '../../lyric-vj/beat-detect';
import { InstantStage, StageSong } from '../free/instant-stage';
import { audioProblem, audioType, errorOf, jobProgress, songView } from './beta';
import { BetaPage } from './beta.page';
import { canSave, clock, fileTitle, guessLanguage, guessTitle, putWithProgress, SAVE_REST, sheetRows, SongLanguage, stripSteps } from './new-song';
import { DRAFT_HOLD, draftSong, readProblem, songAudioUrl, songTimingUrl } from './song-flow';
import { BalanceComponent } from './ui/balance.component';
import { signedOutBy } from './ui/session';

/** How long typing rests before the picture follows it, ms. */
const TYPING_REST = 300;
const LANGS: { id: SongLanguage; name: string }[] = [{ id: 'ja', name: '日文' }, { id: 'zh', name: '中文' }, { id: 'en', name: '英文' }, { id: 'ko', name: '韓文' }];
const ACCEPT = '.mp3,.wav,.flac,.m4a,.aac,audio/mpeg,audio/wav,audio/x-wav,audio/flac,audio/x-flac,audio/mp4,audio/x-m4a,audio/aac';

/**
 * 做一支新影片 (`/my/new`): the picture is where the audio goes; the lyrics are a sheet beside it. With both, the video
 * runs at once from the local file on guessed times; the song is saved and its audio sent in the background once the
 * lyrics have rested, and the picture moves to the server's timing when the preparation is done. The page is the song
 * page from then on (the address changes under it), so nothing on screen is interrupted.
 */
@Component({
  selector: 'app-new-song-page',
  imports: [FormsModule, InstantStage, BalanceComponent],
  templateUrl: './new-song.page.html',
  styleUrl: './new-song.page.scss',
})
export class NewSongPage extends BetaPage {
  protected readonly accept = ACCEPT;
  protected readonly langOptions = LANGS;
  protected readonly clock = clock;
  protected readonly lyrics = signal('');
  protected readonly title = signal('');
  protected readonly artist = signal('');
  protected readonly language = signal<SongLanguage | ''>('');
  /** The person typed a name or picked a language: the guesses stop overwriting it. */
  private titleOwn = false;
  private languageOwn = false;
  protected readonly file = signal<File | null>(null);
  protected readonly seconds = signal(0);
  protected readonly peaks = signal<Float32Array | undefined>(undefined);
  protected readonly dragging = signal(false);
  protected readonly parsed = computed(() => {
    try {
      const p = parseLyrics(this.lyrics());
      return { lines: p.lines.length, skipped: p.skipped, problem: '' };
    } catch (e) {
      return { lines: 0, skipped: 0, problem: e instanceof Error ? e.message : String(e) };
    }
  });
  protected readonly rows = computed(() => sheetRows(this.lyrics()));
  protected readonly songId = signal('');
  protected readonly saved = computed(() => !!this.songId());
  protected readonly uploadPct = signal<number | null>(null);
  protected readonly uploadError = signal('');
  protected readonly uploaded = signal(false);
  private readonly view = computed(() => {
    const s = this.songs().find((x) => x.id === this.songId());
    return s ? songView(s, this.jobs()) : undefined;
  });
  protected readonly aligned = computed(() => {
    const v = this.view();
    return !!v && (v.stage === 'timing' || v.stage === 'ready');
  });
  protected readonly strip = computed(() => {
    const v = this.view();
    const prep = v?.prep && v.stage === 'preparing' ? jobProgress(v.prep) : undefined;
    return stripSteps({ uploadPct: this.uploadPct(), uploadError: this.uploadError(), uploaded: this.uploaded(), prepLeftMin: prep?.leftMin, prepFailed: v?.stage === 'prepFailed', aligned: this.aligned() });
  });
  protected readonly exportHold = computed(() => (this.aligned() ? '' : DRAFT_HOLD));
  protected readonly timingHref = computed(() => `/timing?beta=${this.songId()}`);
  protected readonly stage = viewChild.required(InstantStage);
  private readonly sheet = viewChild<ElementRef<HTMLElement>>('sheet');
  private readonly wave = viewChild<ElementRef<HTMLCanvasElement>>('wave');
  /** The file as the tab reads it, once per file; a generate, 換一版 and a style change share it. */
  private read?: Promise<{ seconds: number; reading: AudioReading }>;
  private objectUrl = '';
  private typing = 0;
  private rest = 0;
  private saving = false;
  private moved = false;

  constructor() {
    super();
    // the picture and the save follow the lyrics: the first soon, the second once they rest
    effect(() => {
      this.lyrics();
      this.file();
      this.title();
      untracked(() => this.schedule());
    });
    // the server's timing is in: the picture moves to it, once
    effect(() => {
      if (!this.aligned() || this.moved) return;
      this.moved = true;
      untracked(() => this.stage().request());
    });
    effect(() => {
      const [canvas, peaks] = [this.wave()?.nativeElement, this.peaks()];
      if (canvas && peaks) untracked(() => this.drawWave(canvas, peaks));
    });
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.typing);
      clearTimeout(this.rest);
      if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    });
  }

  protected typed(text: string) {
    if (this.saved()) return;
    this.lyrics.set(text);
    if (!this.titleOwn) this.title.set(guessTitle(text, this.file()?.name ?? ''));
    if (!this.languageOwn) this.language.set(guessLanguage(text));
  }

  protected nameTyped(text: string) {
    this.titleOwn = true;
    this.title.set(text);
  }

  protected pickLanguage(id: SongLanguage) {
    this.languageOwn = true;
    this.language.set(id);
  }

  /** The mirror under the box scrolls with it, so the marks stay on their lines. */
  protected scrolled(box: HTMLTextAreaElement) {
    const sheet = this.sheet()?.nativeElement;
    if (sheet) sheet.scrollTop = box.scrollTop;
  }

  protected pickInput(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) void this.take(file);
  }

  protected over(e: DragEvent) {
    e.preventDefault();
    if (!this.saved()) this.dragging.set(true);
  }

  protected drop(e: DragEvent) {
    e.preventDefault();
    this.dragging.set(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) void this.take(file);
  }

  /** A local file: on the audio element and read in the tab; it is sent only when the song is saved. */
  private async take(file: File) {
    if (this.saved()) return;
    const why = audioProblem(file);
    if (why) return this.message.set(why);
    this.stage().error.set('');
    this.message.set('');
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = URL.createObjectURL(file);
    this.stage().audio.src = this.objectUrl;
    this.file.set(file);
    this.seconds.set(0);
    this.peaks.set(undefined);
    if (!this.titleOwn) this.title.set(guessTitle(this.lyrics(), file.name));
    this.read = decodeMono(file).then(async ({ samples, seconds }) => {
      if (file === this.file()) {
        this.seconds.set(seconds);
        this.peaks.set(peaksOf(samples, BEAT_RATE));
      }
      return { seconds, reading: await audioReadingOf(samples) };
    });
    this.read.catch(() => {
      if (file !== this.file()) return;
      this.file.set(null);
      this.message.set('這個檔案無法解碼，請換 mp3、m4a 或 wav。');
    });
  }

  /** The picture soon after a change, the save once the lyrics rest (SAVE_REST). */
  private schedule() {
    clearTimeout(this.typing);
    clearTimeout(this.rest);
    if (!this.file() || !this.parsed().lines || this.saved()) return;
    this.typing = window.setTimeout(() => this.stage().request('first'), TYPING_REST);
    this.rest = window.setTimeout(() => void this.save(), SAVE_REST);
  }

  protected readonly source = async (): Promise<StageSong> => {
    if (this.aligned()) {
      const id = this.songId();
      const r = await fetch(songTimingUrl(id), { cache: 'no-store' });
      if (!r.ok) throw new Error(readProblem(r.status));
      const song = (await r.json()) as SongTimeline;
      const { audio } = this.stage();
      if (!audio.src.endsWith(songAudioUrl(id))) audio.src = songAudioUrl(id);
      return { song };
    }
    if (!this.file() || !this.read) throw new Error('請先選擇音檔');
    const { seconds, reading } = await this.read;
    return { song: draftSong(this.lyrics(), this.title() || fileTitle(this.file()!.name), seconds, reading) };
  };

  protected readonly audioFile = async (): Promise<ArrayBuffer | undefined> => {
    if (this.aligned()) {
      const r = await fetch(songAudioUrl(this.songId()));
      if (!r.ok) throw new Error(readProblem(r.status));
      return r.arrayBuffer();
    }
    return this.file()?.arrayBuffer();
  };

  /** Creates the song, moves the address to its page and sends the audio; no button, no dialog. */
  private async save() {
    const file = this.file();
    const state = { file: !!file, lines: this.parsed().lines, title: this.title(), problem: this.parsed().problem, saved: this.saved() };
    if (!file || this.saving || !canSave(state)) return;
    this.saving = true;
    try {
      const body = { title: this.title().trim(), artist: this.artist().trim(), language: this.language() || 'en', lyrics: this.lyrics() };
      const made = await fetch('/beta/songs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (signedOutBy(made.status)) return this.signedOut.set(true);
      const song = (await made.json().catch(() => null)) as { id?: string; error?: string } | null;
      if (!made.ok || !song?.id) return this.message.set(`存檔失敗：${errorOf(song, made.status)}`);
      this.songId.set(song.id);
      history.replaceState(null, '', `/my/song?id=${song.id}`);
      // the sheet reads from its top once it is locked (a paste leaves the box scrolled to its end)
      const sheet = this.sheet()?.nativeElement;
      if (sheet) sheet.scrollTop = 0;
      await this.upload(file);
    } catch {
      this.message.set('存檔失敗：連線中斷，請確認網路後再試');
    } finally {
      this.saving = false;
    }
  }

  /** The audio to the saved song, with progress; a failure stays on the strip with 重試. */
  protected async upload(file: File | null = this.file()) {
    if (!file || !this.songId() || this.uploaded()) return;
    this.uploadError.set('');
    this.uploadPct.set(0);
    // leaving mid-upload cuts the audio off: BetaPage asks the browser to warn while busy
    this.busy.set(true);
    try {
      const r = await putWithProgress(`/beta/songs/${this.songId()}/audio`, file, audioType(file) ?? 'audio/mpeg', (pct) => this.uploadPct.set(pct));
      if (signedOutBy(r.status)) return this.signedOut.set(true);
      if (r.status < 200 || r.status >= 300) {
        let body: { error?: string } | null = null;
        try { body = JSON.parse(r.body); } catch { /* not JSON: the status speaks */ }
        throw new Error(errorOf(body, r.status));
      }
      this.uploadPct.set(100);
      this.uploaded.set(true);
    } catch (e) {
      this.uploadError.set((e as Error).message);
    } finally {
      this.busy.set(false);
      await this.poll();
    }
  }

  private drawWave(canvas: HTMLCanvasElement, peaks: Float32Array) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = (canvas.width = canvas.clientWidth * devicePixelRatio || 600);
    const h = (canvas.height = canvas.clientHeight * devicePixelRatio || 80);
    const bars = Math.max(1, Math.floor(w / (4 * devicePixelRatio)));
    const per = Math.max(1, Math.floor(peaks.length / bars));
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = getComputedStyle(canvas).color;
    for (let i = 0; i < bars; i++) {
      let m = 0;
      for (let j = i * per; j < (i + 1) * per && j < peaks.length; j++) m = Math.max(m, peaks[j]);
      const bh = Math.max(1, m * h * 0.9);
      ctx.fillRect(i * 4 * devicePixelRatio, (h - bh) / 2, 2 * devicePixelRatio, bh);
    }
  }
}
