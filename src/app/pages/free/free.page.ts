import { Component, computed, inject, isDevMode, OnDestroy, OnInit, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer } from '@angular/platform-browser';
import { songFromLines } from '../../lyric-vj/free-song';
import { audioProblem, audioReadingOf, decodeMono } from '../../lyric-vj/free-audio';
import { decodeLyricFile, draftLines, fitToAudio, formatLines, LyricLine, parseLyrics, placeLines } from '../../lyric-vj/free-lyrics';
import { estimateStarts, Stretch } from '../../lyric-vj/free-sung';
import { appliedLines, editorSeed, lastWork, LastWork, LineMark, loadWork, marksOf, saveWork, Work } from '../../lyric-vj/free-timing';
import { BEAT_RATE, Rhythm } from '../../lyric-vj/beat-detect';
import { LyricHit, searchLyrics, syncedMatch, titleParts } from '../../lyric-vj/lyric-lookup';
import type { Meaning } from '../../lyric-vj/lineplan-core';
import type { SongTimeline, TimelineCue } from '../../lyric-vj/timeline';
import { LyricSearch } from './lyric-search';
import { InstantStage, StageSong } from './instant-stage';
import { LocalTiming, TimingPage } from '../timing/timing.page';
import { peaksOf } from '../timing/timing-view';

interface SongRow { id: string; title: string; duration: number; lines: number; reading: boolean }

/** How long typing rests before the picture follows it, ms. */
const TYPING_REST = 250;
/** How long the title rests before it is searched for, ms. */
const LOOKUP_REST = 800;
const LOOKUP_RETRY = 3000;
/** How far an entry's length may be from the audio's before it is probably another edit, s. */
const LOOKUP_FAR = 3;

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/**
 * `/free`, dev builds only: the free tier on this machine. Lyrics alone make a video at once, on draft times; an audio
 * file puts them where the song seems to sing them, and LRC or the timing editor makes them exact. The composer, the
 * preview and the export all run in the tab. The audio is never uploaded; the only servers are the read-only test data
 * (scripts/lyric-vj/free-local.mts) and the public lyric search (title and artist), which stays dev-only: LRCLIB states
 * no licence for its lyric data. Only the form is here: the picture, the versions, the styles and the export are the
 * InstantStage the song page uses too.
 */
@Component({
  selector: 'app-free-page',
  imports: [FormsModule, LyricSearch, InstantStage, TimingPage],
  templateUrl: './free.page.html',
  styleUrl: './free.page.scss',
})
export class FreePage implements OnInit, OnDestroy {
  private readonly sanitizer = inject(DomSanitizer);
  protected readonly clock = clock;
  protected readonly songs = signal<SongRow[]>([]);
  protected readonly songId = signal('');
  protected readonly paste = signal(true);
  protected readonly lrc = signal('');
  protected readonly title = signal('');
  /** The pace lines are spaced at until a song's tempo is known. */
  private readonly bpm = signal(110);
  protected readonly audioName = signal('');
  protected readonly audioSeconds = signal(0);
  protected readonly audioNote = signal('');
  protected readonly rhythm = signal<Rhythm | undefined>(undefined);
  /** No file, or one with no pulse to find: the tempo field is the fallback. */
  protected readonly analysing = signal(false);
  protected readonly searching = signal(false);
  /** How the lines got their times, when no person or LRC gave them. */
  protected readonly estimate = signal<'' | 'draft' | 'audio'>('');
  /** The song open in the timing editor; the rest of the page waits under it. */
  protected readonly editing = signal<LocalTiming | undefined>(undefined);
  /** Where each line's time came from, by its place in the lyric box. */
  private readonly marks = signal<LineMark[]>([]);
  /** Times are not finished until a person says so, and the page says that wherever a video can leave it. */
  protected readonly timingNote = computed(() => {
    if (!this.parsed().lines.length) return '';
    if (this.estimate() === 'draft') return '時間是估算的。選音檔後才能編輯，對到歌。';
    if (this.estimate() === 'audio') return '時間是估算的，可能差好幾秒，還不是完成品。';
    const left = this.marks().filter((m) => m === 'guess').length;
    return left ? `時間是估算的：還有 ${left} 句沒對過。` : '';
  });
  /** A synced entry of the public lyric database that matches the lyrics, waiting for the person to read it. */
  protected readonly offer = signal<LyricHit | undefined>(undefined);
  protected readonly offerFar = computed(() => {
    const [hit, seconds] = [this.offer(), this.audioSeconds()];
    return hit?.duration && seconds ? Math.round(Math.abs(hit.duration - seconds)) : 0;
  });
  protected readonly lookupFar = LOOKUP_FAR;
  protected readonly lookupNote = signal('');
  /** The box holds a database entry's times: nobody has listened to them yet. */
  protected readonly fromLibrary = signal(false);
  /** Stored work for this audio that differs from what is in the box: the person chooses. */
  protected readonly resume = signal<Work | undefined>(undefined);
  /** The audio file to pick again after a reload. */
  protected readonly last = signal<LastWork | undefined>(undefined);
  protected readonly unsaved = signal(false);
  /** What the lyric box holds right now: the lines, or what is wrong with them. */
  protected readonly parsed = computed(() => {
    try {
      return { ...parseLyrics(this.lrc()), problem: '' };
    } catch (e) {
      return { lines: [] as LyricLine[], skipped: 0, title: undefined, artist: undefined, problem: e instanceof Error ? e.message : String(e) };
    }
  });
  protected readonly timedLines = computed(() => this.parsed().lines.filter((l) => l.start !== undefined).length);
  /** The timed lyrics as a file, for another browser and for the next video of this song. */
  protected readonly lrcHref = computed(() => this.sanitizer.bypassSecurityTrustUrl(this.lrcUrl()));
  private readonly lrcUrl = computed(() => (this.timedLines() ? `data:text/plain;charset=utf-8,${encodeURIComponent(this.lrc())}` : ''));
  protected readonly stage = viewChild.required(InstantStage);
  private file?: File;
  private stretches?: Stretch[];
  private peaks?: Float32Array;
  private typing = 0;
  private lookupRest = 0;
  private lookedUp = '';
  private pasted = false;
  private objectUrl = '';

  async ngOnInit() {
    const rows = await fetch('/free-data/songs').then((r) => (r.ok ? (r.json() as Promise<SongRow[]>) : [])).catch(() => []);
    this.songs.set(rows);
    this.last.set(lastWork());
    // the check scripts' handle: the stage, with the form's signals they read on it
    (window as unknown as { vjFree?: unknown }).vjFree = Object.assign(this.stage(), { lrc: this.lrc, marks: this.marks, estimate: this.estimate, analysing: this.analysing });
  }

  ngOnDestroy() {
    clearTimeout(this.typing);
    clearTimeout(this.lookupRest);
  }

  /** A local file on the audio element and analysed here; it is never sent anywhere. */
  protected async pickFile(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.stage().error.set('');
    const { audio } = this.stage();
    const seconds = await this.putOnElement(file, audio);
    const problem = seconds === undefined ? '這個檔案無法播放，請換 MP3、M4A 或 WAV。' : audioProblem(seconds, file.size);
    if (problem) {
      this.dropFile(audio);
      this.stage().error.set(problem);
      (e.target as HTMLInputElement).value = '';
      return;
    }
    this.file = file;
    this.audioName.set(file.name);
    this.audioSeconds.set(seconds!);
    this.rhythm.set(undefined);
    this.stretches = undefined;
    this.peaks = undefined;
    this.offer.set(undefined);
    this.lookedUp = '';
    this.restore(file);
    // the title seeds the plan: once a picture is up, naming it after the file would change the version on screen
    if (!this.title() && !this.stage().ready()) this.title.set(file.name.replace(/\.[^.]+$/, ''));
    this.refresh();
    void this.analyse(file);
  }

  /** The file's length as the element reads it, undefined if the element cannot play it. */
  private async putOnElement(file: File, audio: HTMLAudioElement) {
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = URL.createObjectURL(file);
    audio.src = this.objectUrl;
    return new Promise<number | undefined>((r) => {
      audio.onloadedmetadata = () => r(audio.duration);
      audio.onerror = () => r(undefined);
    });
  }

  private dropFile(audio: HTMLAudioElement) {
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = '';
    this.file = undefined;
    this.audioName.set('');
    this.audioSeconds.set(0);
    this.rhythm.set(undefined);
    this.stretches = undefined;
    this.peaks = undefined;
    this.analysing.set(false);
    audio.removeAttribute('src');
    audio.load();
  }

  private async analyse(file: File) {
    this.analysing.set(true);
    this.audioNote.set('分析歌曲中');
    try {
      const { samples, seconds } = await decodeMono(file);
      if (file !== this.file) return;
      // a file whose header gives no length: the decoded audio does
      if (!Number.isFinite(this.audioSeconds())) this.audioSeconds.set(seconds);
      const problem = audioProblem(seconds);
      if (problem) {
        this.dropFile(this.stage().audio);
        this.stage().error.set(problem);
        return;
      }
      const { rhythm: found, stretches } = await audioReadingOf(samples);
      if (file !== this.file) return;
      this.rhythm.set(found);
      this.stretches = stretches;
      this.peaks = peaksOf(samples, BEAT_RATE);
      this.audioNote.set(found ? `約 ${Math.round(found.tempo)} BPM，${found.beats.length} 拍` : '抓不到穩定的節拍，改用下面的每分鐘拍數');
      // the picture went up on the draft: the times and the beats of the song take over now
      this.analysing.set(false);
      this.refresh();
    } catch {
      if (file === this.file) this.audioNote.set('這個檔案分析不了拍點，改用下面的每分鐘拍數');
    } finally {
      if (file === this.file) this.analysing.set(false);
    }
  }

  protected async pickLyricFile(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.stage().error.set('');
    try {
      this.useLyrics(decodeLyricFile(await file.arrayBuffer()));
    } catch (err) {
      this.stage().error.set(err instanceof Error ? err.message : String(err));
    }
  }

  private useLyrics(text: string, title?: string) {
    this.lrc.set(text);
    this.marks.set([]);
    this.fromLibrary.set(false);
    const named = this.parsed();
    if (!this.title() || title) this.title.set(title ?? [named.artist, named.title].filter(Boolean).join(' - '));
    this.refresh();
  }

  /** A paste shows at once; typing waits for a rest. */
  protected typed(text: string) {
    this.lrc.set(text);
    const now = this.pasted;
    this.pasted = false;
    // a paste of other lyrics, not a fix to a word: the old marks describe lines that are gone
    if (now && this.parsed().lines.length !== this.marks().length) {
      this.marks.set([]);
      this.fromLibrary.set(false);
    }
    if (now) this.refresh();
    else this.refreshSoon();
  }

  protected noteTheRest() {
    this.pasted = true;
  }

  protected refreshSoon() {
    clearTimeout(this.typing);
    this.typing = window.setTimeout(() => this.refresh(), TYPING_REST);
  }

  /** The picture follows the form: my-song lyrics are all it takes. */
  protected refresh() {
    clearTimeout(this.typing);
    const { lines, problem } = this.parsed();
    this.remember();
    this.queueLookup();
    if (!this.paste() || this.editing() || problem || !lines.length) return;
    this.stage().request();
  }

  protected useHit(h: LyricHit) {
    this.searching.set(false);
    this.useLyrics(h.synced ?? h.plain ?? '', [h.artist, h.track].filter(Boolean).join(' - '));
  }

  /** No stamps in the lyrics: the database may have this song's times. Only the title and artist leave the tab. */
  private queueLookup() {
    clearTimeout(this.lookupRest);
    const { track, artist } = titleParts(this.title());
    const query = `${track}\n${artist}`;
    if (!isDevMode() || !this.paste() || !this.file || !track || query === this.lookedUp || this.timedLines() || !this.parsed().lines.length) return;
    this.lookupRest = window.setTimeout(() => void this.lookup(query, track, artist), LOOKUP_REST);
  }

  private async lookup(query: string, track: string, artist: string) {
    const { file } = this;
    this.lookedUp = query;
    this.lookupNote.set('正在查公開歌詞庫 LRCLIB。只有歌名和歌手會離開這個瀏覽器，音檔和歌詞都不會。');
    try {
      // the database answers 503 when busy, and nobody is here to press a button again
      const hits = await searchLyrics(track, artist).catch(async () => {
        await new Promise((r) => setTimeout(r, LOOKUP_RETRY));
        return searchLyrics(track, artist);
      });
      if (file !== this.file || query !== this.lookedUp || this.timedLines()) return this.lookupNote.set('');
      const hit = syncedMatch(hits, this.parsed().lines.map((l) => l.text), this.audioSeconds());
      this.offer.set(hit);
      this.lookupNote.set(hit ? '' : '公開歌詞庫沒有對得上這份歌詞的時間。');
    } catch (e) {
      this.lookupNote.set(e instanceof Error ? e.message : String(e));
    }
  }

  protected useOffer() {
    const hit = this.offer();
    this.offer.set(undefined);
    if (!hit?.synced) return;
    this.useLyrics(hit.synced);
    this.fromLibrary.set(true);
  }

  /** The editor on the lines as they stand, with the file and the waveform this tab already has. */
  protected async openEditor() {
    if (!this.file || this.stage().busy() || this.analysing()) return;
    this.stage().error.set('');
    try {
      const song = await this.timedSong();
      const { lines } = this.parsed();
      const marks = song.cues.map((_, i) => this.marks()[i] || (lines[i]?.start === undefined ? 'guess' : ''));
      const seed = editorSeed(this.rhythm() ? song : { ...song, beats: [], downbeats: [] }, marks);
      this.stage().clear();
      this.resume.set(undefined);
      this.editing.set({ ...seed, audioUrl: this.objectUrl, peaks: this.peaks, keep: (cues, settled) => this.keepEdit(cues, settled) });
    } catch (e) {
      this.stage().error.set(e instanceof Error ? e.message : String(e));
    }
  }

  /** Every edit, at once: the lyric box stays the one copy of the times, and a reload loses nothing. */
  private keepEdit(cues: TimelineCue[], settled: ReadonlySet<string>) {
    this.lrc.set(formatLines(appliedLines(cues, this.editing()!.song.duration)));
    this.marks.set(marksOf(cues, settled));
    this.fromLibrary.set(false);
    return this.remember();
  }

  /** Same seed and style, new times, from where the person stopped listening. */
  protected async closeEditor(at: number) {
    this.editing.set(undefined);
    await this.stage().generate();
    this.stage().seek(at);
  }

  protected remember() {
    const { file } = this;
    if (!file || this.resume() || !this.lrc().trim()) return true;
    const kept = saveWork({ name: file.name, size: file.size }, { lrc: this.lrc(), title: this.title(), styleId: this.stage().styleId(), seed: this.stage().seed(), marks: this.marks() });
    this.unsaved.set(!kept);
    return kept;
  }

  /** Stored work for this file comes back by itself into an empty box, and by choice over lyrics already there. */
  private restore(file: File) {
    this.last.set(undefined);
    const work = loadWork({ name: file.name, size: file.size });
    this.resume.set(undefined);
    if (!work) return;
    if (this.lrc().trim() && work.lrc !== this.lrc()) return this.resume.set(work);
    this.applyWork(work);
  }

  private applyWork(work: Work) {
    this.lrc.set(work.lrc);
    this.title.set(work.title);
    this.stage().styleId.set(work.styleId);
    this.stage().seed.set(work.seed);
    this.marks.set(work.marks);
  }

  protected takeResume(yes: boolean) {
    const work = this.resume();
    this.resume.set(undefined);
    if (yes && work) this.applyWork(work);
    this.refresh();
  }

  /** The lines as the composer gets them; throws what a person should do next. */
  private async timedSong() {
    const { lines, problem } = this.parsed();
    if (problem) throw new Error(problem);
    if (!lines.length) throw new Error('先貼上歌詞，或匯入 .lrc');
    const seconds = this.file && Number.isFinite(this.audioSeconds()) ? this.audioSeconds() : undefined;
    const placed = placeLines(lines, seconds);
    if (!placed) return this.estimatedSong(lines, seconds);
    this.estimate.set('');
    const { kept, dropped } = seconds ? fitToAudio(placed, seconds) : { kept: placed, dropped: 0 };
    if (!kept.length) throw new Error('所有歌詞的時間都超過音檔長度。這份歌詞可能是另一個版本，請到「編輯歌詞時間」重新對過。');
    this.stage().warn.set(dropped ? `有 ${dropped} 句的時間超過音檔長度，已略過。` : placed.some((l) => l.placed) ? `有 ${placed.filter((l) => l.placed).length} 句沒有時間，是依前後句估計的。` : '');
    return this.songOf(kept, seconds);
  }

  /** Lyrics with no time at all: over the song's sung stretches once they are known, a draft until then. */
  private estimatedSong(lines: LyricLine[], seconds?: number) {
    const { file, stretches } = this;
    this.estimate.set(file ? 'audio' : 'draft');
    if (!file || !stretches) return this.songOf(draftLines(lines, this.rhythm()?.tempo ?? this.bpm(), seconds), seconds);
    const starts = estimateStarts(lines.map((l) => l.text), stretches, this.rhythm());
    return this.songOf(lines.map((l, i) => ({ text: l.text, start: starts[i] })), seconds);
  }

  private songOf(lines: LyricLine[], seconds?: number) {
    return songFromLines(lines, { title: this.title() || '未命名', bpm: this.bpm(), duration: seconds, exact: !!seconds, rhythm: this.file ? this.rhythm() : undefined });
  }

  /** The song the form describes, its audio on the element. */
  protected readonly source = async (): Promise<StageSong> => {
    const { audio } = this.stage();
    if (this.paste()) {
      const song = await this.timedSong();
      if (audio.src !== this.objectUrl) {
        audio.pause();
        if (this.objectUrl) audio.src = this.objectUrl;
        else audio.removeAttribute('src');
      }
      return { song, silent: !this.file };
    }
    const id = this.songId();
    if (!id) throw new Error('先選一首歌');
    const got = (await (await fetch(`/free-data/song/${id}`)).json()) as { song: SongTimeline; meaning?: Meaning };
    audio.src = `/free-data/audio/${id}`;
    audio.load();
    return got;
  };

  protected readonly audioFile = async () => (this.paste() ? this.file?.arrayBuffer() : (await fetch(`/free-data/audio/${this.songId()}`)).arrayBuffer());
  protected readonly fileTitle = computed(() => this.title() || this.audioName().replace(/\.[^.]+$/, ''));
}
