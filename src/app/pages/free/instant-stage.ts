import { Component, computed, ElementRef, inject, input, OnDestroy, OnInit, output, signal, viewChild } from '@angular/core';
import { FREE_STYLES, styleGroups } from '../../lyric-vj/free-styles';
import type { Meaning } from '../../lyric-vj/lineplan-core';
import type { SongTimeline } from '../../lyric-vj/timeline';
import type { LivePlayer, LiveStats } from '../../lyric-vj/render/live';
import { exportBlocker } from '../../lyric-vj/render/export-check';
import { songLrc } from '../../lyric-vj/free-lyrics';
import { StylePicker } from './style-picker';

/** Under this a wait is not worth showing, ms. */
const QUIET_WAIT = 300;
/** How much of a song's lead-in a first play skips to, s before the first line: the picture answers the click at once. */
const LEAD_IN = 1;

/** What an export makes: the video, the lyrics alone on a key colour, or each layer's frames into a folder. */
export type ExportKind = 'mp4' | 'green' | 'black' | 'layers';
const MATTE = { green: '#00b140', black: '#000000' } as const;
/** A name a file system takes. */
const fileSafe = (s: string) => s.replace(/[\\/:*?"<>|]/g, ' ').trim() || 'video';

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** The song a page gives the stage: `silent` when there is no audio, and the page's own clock runs the draft. */
export interface StageSong { song: SongTimeline; meaning?: Meaning; silent?: boolean }

/** What a person's page shows of an export; the engine figures are for /free. */
export const exportNote = (bytes: number, plain: boolean, x: { seconds: number; realtime: number; video: string; audio: string | null }) =>
  plain ? `720p，${(bytes / 1e6).toFixed(0)} MB` : `720p，${(bytes / 1e6).toFixed(0)} MB，花了 ${x.seconds.toFixed(0)} 秒（${x.realtime.toFixed(1)} 倍速），影像 ${x.video}，聲音 ${x.audio ?? '無'}`;

/**
 * The instant video: picture, transport, 換一版, style cards and the 720p export, all in the tab. The composer, the
 * preview and the encoder run here; a page only says what song this is (`source`) and where its audio file is
 * (`audioFile`), and puts the audio on `audio`. Used by the song page's flow and the dev-only /free.
 */
@Component({
  selector: 'app-instant-stage',
  imports: [StylePicker],
  templateUrl: './instant-stage.html',
  styleUrl: './instant-stage.scss',
  host: { '(window:beforeunload)': 'stay($event)' },
})
export class InstantStage implements OnInit, OnDestroy {
  /** The song as it stands now; called for every generate. A thrown message is shown to the person. */
  readonly source = input.required<() => Promise<StageSong>>();
  /** The audio to mux into the export; undefined makes a silent video. */
  readonly audioFile = input.required<() => Promise<ArrayBuffer | undefined>>();
  /** What the file is named after, when known; else the song's own title. */
  readonly title = input('');
  /** Shown over the transport: why these times are not to be trusted yet. */
  readonly timingNote = input('');
  /** Why the export waits, in the person's words: the button stays off and says so. */
  readonly exportHold = input('');
  /** A person's page: the style cards beside the picture on a wide screen, no engine figures. */
  readonly plain = input(false);
  /** The seed or style changed: a page that stores them does so now. */
  readonly changed = output<void>();
  /** A new song is wanted from the page: nothing was on screen when a style was picked, or a generate had to wait. */
  readonly again = output<void>();

  protected readonly clock = clock;
  protected readonly styleGroups = styleGroups();
  readonly styles = FREE_STYLES;
  readonly styleId = signal('');
  readonly seed = signal<number | undefined>(undefined);
  readonly busy = signal('');
  /** Busy for longer than a person would not notice. */
  protected readonly slow = signal(false);
  readonly error = signal('');
  readonly warn = signal('');
  readonly ready = signal(false);
  protected readonly playing = signal(false);
  protected readonly t = signal(0);
  protected readonly duration = signal(0);
  protected readonly note = signal('');
  protected readonly stats = signal<LiveStats | undefined>(undefined);
  /** What a layered export left on disk, in words. */
  protected readonly saved = signal('');
  protected readonly exported = signal<{ url: string; name: string; note: string } | undefined>(undefined);
  protected readonly progress = signal(0);
  /** Why this browser cannot export; the button says so instead of failing halfway. */
  protected readonly exportBlocked = exportBlocker();
  protected readonly exporting = computed(() => this.busy() === '匯出中');
  /** No style picked is the picker's 依歌曲配色: the composer's own look for the song. */
  readonly styleName = computed(() => this.styles.find((s) => s.id === this.styleId())?.name ?? '依歌曲配色');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly stage = viewChild.required<ElementRef<HTMLElement>>('stage');
  private readonly audioEl = viewChild.required<ElementRef<HTMLAudioElement>>('audio');
  private player?: LivePlayer;
  private song?: SongTimeline;
  private meaning?: Meaning;
  private silent = false;
  private autoplayed = false;
  private job?: Parameters<LivePlayer['load']>[0];
  /** What to do again once the stage is free: the song changed, or only its style. */
  private pending?: 'song' | 'picture';
  private abort?: AbortController;
  private ticker = 0;

  get audio() {
    return this.audioEl().nativeElement;
  }

  ngOnInit() {
    // the composer and engine ahead of time, so the first generate does not wait for them
    void import('../../lyric-vj/free-plan');
    void import('../../lyric-vj/render/live');
    this.ticker = window.setInterval(() => this.stats.set(this.player?.stats()), 1000);
  }

  ngOnDestroy() {
    clearInterval(this.ticker);
    this.player?.dispose();
    this.audio.pause();
    this.abort?.abort();
    this.dropExport();
  }

  protected stay(e: BeforeUnloadEvent) {
    if (this.exporting()) e.preventDefault();
  }

  /** The picture goes (the timing editor wants the frame budget and the song to itself). */
  clear() {
    this.player?.dispose();
    this.player = undefined;
    this.ready.set(false);
    this.dropExport();
    this.audio.pause();
  }

  private dropExport() {
    const old = this.exported();
    if (old) URL.revokeObjectURL(old.url);
    this.exported.set(undefined);
    this.saved.set('');
  }

  /** Song and form to picture: the rules take milliseconds, the rest is the engine's first frame. */
  private async build() {
    const [{ freeJob }, { LivePlayer }] = await Promise.all([import('../../lyric-vj/free-plan'), import('../../lyric-vj/render/live')]);
    this.player ??= new LivePlayer(this.stage().nativeElement, this.audio);
    this.player.setSilent(this.silent);
    this.player.onFrame = (t) => {
      this.t.set(t);
      this.playing.set(this.player!.playing);
      // a draft with no audio has no end to stop at: it plays round, for reading it through
      if (this.silent && this.player!.playing && t >= this.duration()) this.player!.seek(0);
    };
    const t0 = performance.now();
    const { job, palette } = freeJob(this.song!, { seed: this.seed(), meaning: this.meaning, style: this.styles.find((s) => s.id === this.styleId()) });
    const planMs = performance.now() - t0;
    this.job = job;
    const first = job.cues[0];
    this.player.poster = first && (first.start + first.end) / 2;
    const startMs = await this.player.load(job);
    this.duration.set(job.window.end);
    this.ready.set(true);
    this.note.set(`配色 ${palette}，第 ${this.seed() ?? 0} 版。編排 ${planMs.toFixed(0)} ms，到第一格 ${(startMs / 1000).toFixed(2)} 秒`);
  }

  private async guard(what: string, run: () => Promise<void>) {
    if (this.busy()) return;
    this.busy.set(what);
    this.error.set('');
    const quiet = window.setTimeout(() => this.slow.set(true), QUIET_WAIT);
    try {
      await run();
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : String(e));
    } finally {
      clearTimeout(quiet);
      this.slow.set(false);
      this.busy.set('');
      const next = this.pending;
      this.pending = undefined;
      if (next === 'song') this.again.emit();
      if (next === 'picture') void this.guard('換風格中', () => this.build());
    }
  }

  /** A generate now, or once the stage is free. */
  request(start?: 'first') {
    if (this.busy()) this.pending = 'song';
    else void this.generate(start);
  }

  /** @param start `first` plays from just before the first line, `silent` plays a song with no audio, once per page. */
  generate(start?: 'first') {
    return this.guard('生成中', async () => {
      this.dropExport();
      this.warn.set('');
      const { song, meaning, silent } = await this.source()();
      [this.song, this.meaning, this.silent] = [song, meaning, !!silent];
      await this.build();
      // lyrics alone are a draft to watch: there is no song to wait for a person to start
      if ((this.silent || start) && !this.autoplayed) {
        this.autoplayed = true;
        if (start) this.player!.seek(Math.max(0, (this.job?.cues[0]?.start ?? 0) - LEAD_IN));
        // a browser may refuse sound without a fresh click: the picture stands and the play button works
        void this.player!.play().catch(() => undefined);
      }
    });
  }

  /** Another version of the same song, from where the song is playing. */
  /** 換一版: another style, picked at random, in a new version; the picker shows where it went. */
  reroll() {
    return this.guard('換版中', async () => {
      this.dropExport();
      const others = this.styles.filter((s) => s.id !== this.styleId());
      this.styleId.set(others[Math.floor(Math.random() * others.length)].id);
      this.seed.update((s) => (s ?? 0) + 1);
      this.changed.emit();
      await this.build();
      this.host.nativeElement.querySelector('.card.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    });
  }

  setStyle(id: string) {
    if (this.exporting()) return;
    this.styleId.set(id);
    this.changed.emit();
    if (!this.ready()) return this.again.emit();
    this.dropExport();
    if (this.busy()) this.pending ??= 'picture';
    else void this.guard('換風格中', () => this.build());
  }

  protected toggle() {
    if (!this.player) return;
    if (this.player.playing) this.player.pause();
    else void this.player.play();
  }

  seek(t: number) {
    this.player?.seek(t);
  }

  protected cancelExport() {
    this.abort?.abort();
  }

  private baseName() {
    return `${fileSafe(this.title() || this.song?.title || 'video')}_v${this.seed() ?? 0}`;
  }

  /** The song's lines with their times, as an .lrc download. */
  protected exportLrc() {
    if (!this.song) return;
    const url = URL.createObjectURL(new Blob([songLrc(this.song)], { type: 'text/plain;charset=utf-8' }));
    Object.assign(document.createElement('a'), { href: url, download: `${this.baseName()}.lrc` }).click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /**
   * Made here, in the tab; the files are the person's and go nowhere. A video downloads; the layers are written into a
   * folder the person picks (asked first, while the click still counts): the lyrics as numbered PNGs with alpha in
   * front/, the rest as an MP4 with the song (it has no alpha to keep, and a song of PNGs of it is over 10 GB).
   */
  async export(from?: number, to?: number, kind: ExportKind = 'mp4') {
    let root: FileSystemDirectoryHandle | undefined;
    if (kind === 'layers') {
      const pick = (window as unknown as { showDirectoryPicker?: (o: object) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker;
      if (!pick) return this.error.set('這個瀏覽器不能寫入資料夾，透明 PNG 請改用桌面版 Chrome 或 Edge。');
      try {
        root = await pick({ mode: 'readwrite', id: 'vjflow-layers' });
      } catch {
        return; // the person closed the picker
      }
    }
    return this.guard('匯出中', async () => {
      const { exportFrames, exportVideo } = await import('../../lyric-vj/render/export');
      const player = this.player!;
      await player.settled;
      player.pause();
      this.abort = new AbortController();
      this.progress.set(0);
      const start = from ?? 0;
      const seconds = (to ?? this.duration()) - start;
      const onProgress = (d: number, n: number) => this.progress.set(d / n);
      const base = this.baseName();
      // the preview stops for any export: a layer's own engine would share the machine with it
      const held = player.hold();
      const extra = kind === 'mp4' ? [] : kind === 'layers' ? [await player.layerEngine('text'), await player.layerEngine('back')] : [await player.layerEngine('text')];
      const { engine, canvas } = kind === 'mp4' ? held : extra[0];
      try {
        if (kind === 'layers') {
          const [front, back] = extra;
          const dir = await root!.getDirectoryHandle(base, { create: true });
          const write = async (name: string, data: Blob | string) => {
            const file = await (await dir.getFileHandle(name, { create: true })).createWritable();
            await file.write(data);
            await file.close();
          };
          // half the bar each: the frames, then the back video
          const half = (k: number) => (d: number, n: number) => this.progress.set((k + d / n) / 2);
          await exportFrames({ layers: [{ ...front, dir: await dir.getDirectoryHandle('front', { create: true }), name: 'front' }], duration: seconds, from: start, fps: 30, signal: this.abort.signal, onProgress: half(0) });
          const behind = await exportVideo({ ...back, duration: seconds, from: start, audio: await this.audioFile()(), fps: 30, signal: this.abort.signal, onProgress: half(1) });
          await write(`${base}_back.mp4`, behind.blob);
          if (this.song) await write(`${base}.lrc`, songLrc(this.song));
          this.dropExport();
          this.saved.set(`已寫入資料夾「${base}」：front 資料夾是歌詞（透明背景，${Math.round(seconds * 30)} 張 720p PNG，每秒 30 張），${base}_back.mp4 是背景和音樂，另附歌詞 LRC。把 front 疊在 back 上就是原本的畫面。`);
          return;
        }
        const audio = await this.audioFile()();
        const out = await exportVideo({ engine, canvas, duration: seconds, from: start, audio, fps: 30, matte: kind === 'mp4' ? undefined : MATTE[kind], signal: this.abort.signal, onProgress });
        const name = `${base}${kind === 'mp4' ? '' : `_${kind}`}.mp4`;
        this.dropExport();
        const note = exportNote(out.blob.size, this.plain(), { seconds: out.seconds, realtime: seconds / out.seconds, video: out.codecs.video, audio: out.codecs.audio });
        this.exported.set({ url: URL.createObjectURL(out.blob), name, note });
      } finally {
        for (const x of extra) x.engine.dispose(false);
        player.resume();
      }
    });
  }
}
