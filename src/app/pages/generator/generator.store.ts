import { computed, inject, Injectable, signal } from '@angular/core';
import { AudioAnalysis } from '../../audio/audio-analysis.model';
import { AudioAnalyzerService } from '../../audio/audio-analyzer.service';
import { AudioLoaderService, LoadedAudio } from '../../audio/audio-loader.service';
import { LyricCue, LyricPreset, LyricTiming } from '../../lyrics/lyric.model';
import { AlignProgress, LyricAlignerService } from '../../lyrics/lyric-aligner.service';
import { LyricParserService } from '../../lyrics/lyric-parser.service';
import { GENERATION_POLICY, GenerationMode, GenerationQuote, PlayRange } from '../../vj/generation-policy';
import { VjEngineService } from '../../vj/vj-engine.service';
import { VJProject, VJStyleId } from '../../vj/vj-project.model';

/** Default playback volume (0..1); full scale is too loud for most mastered tracks. */
export const DEFAULT_VOLUME = 0.4;

export type AlignmentStatus =
  | { status: 'idle' }
  | ({ status: 'running' } & AlignProgress)
  | { status: 'done' }
  | { status: 'error'; message: string };

export type GeneratorState = 'EMPTY' | 'AUDIO_LOADING' | 'ANALYZING' | 'READY' | 'GENERATING' | 'PREVIEW_READY' | 'PLAYING' | 'EXPORTING' | 'ERROR';

/** Page-scoped state machine for the generator flow. All audio work stays in the browser. */
@Injectable()
export class GeneratorStore {
  private readonly loader = inject(AudioLoaderService);
  private readonly analyzer = inject(AudioAnalyzerService);
  private readonly engine = inject(VjEngineService);
  private readonly lyricParser = inject(LyricParserService);
  private readonly aligner = inject(LyricAlignerService);
  private readonly policy = inject(GENERATION_POLICY);
  /** `${audioKey}|${mode}` already paid for / unlocked, so style changes never charge twice. */
  private readonly authorized = new Set<string>();
  private range: PlayRange = { start: 0, end: 0 };
  private audioKey = '';
  /** Cues currently shown; plain-text lyrics stay hidden until alignment finishes. */
  private lyricCues: LyricCue[] | undefined;
  private alignRun = 0;
  /** `${audioKey}|${lyrics}` + range the aligned cues cover, so style/mode changes reuse them without flicker. */
  private alignedFor = '';
  private alignedRange: PlayRange = { start: 0, end: 0 };
  private aligningFor = '';
  private aligningRange: PlayRange = { start: 0, end: 0 };

  readonly state = signal<GeneratorState>('EMPTY');
  readonly audio = signal<LoadedAudio | null>(null);
  readonly analysis = signal<AudioAnalysis | null>(null);
  readonly analysisProgress = signal(0);
  readonly styleId = signal<VJStyleId>('edm');
  readonly mode = signal<GenerationMode>('preview');
  /** Price/coverage of each mode for the loaded track, for the mode picker. */
  readonly quotes = computed(() => {
    const duration = this.analysis()?.duration;
    return duration ? { preview: this.policy.quote('preview', duration), full: this.policy.quote('full', duration) } : null;
  });
  readonly lyricsText = signal('');
  readonly lyricPreset = signal<LyricPreset | 'auto'>('auto');
  /** With no lyrics entered, recognize them from the vocals. */
  readonly autoLyrics = signal(true);
  readonly lyricTiming = signal<LyricTiming | null>(null);
  readonly alignment = signal<AlignmentStatus>({ status: 'idle' });
  readonly project = signal<VJProject | null>(null);
  readonly error = signal<string | null>(null);
  /** Shared by the source player and the preview player. */
  readonly volume = signal(DEFAULT_VOLUME);

  readonly isLoading = computed(() => ['AUDIO_LOADING', 'ANALYZING'].includes(this.state()));
  readonly canGenerate = computed(() => !!this.analysis() && !this.isLoading() && !['GENERATING', 'EXPORTING'].includes(this.state()));
  readonly canUpload = computed(() => !this.isLoading() && this.state() !== 'EXPORTING');

  async loadFile(file: File): Promise<void> {
    this.loader.release(this.audio());
    this.audio.set(null);
    this.analysis.set(null);
    this.project.set(null);
    this.error.set(null);
    this.alignRun++;
    this.aligner.cancel();
    this.alignedFor = '';
    this.lyricCues = undefined;
    this.lyricTiming.set(null);
    this.alignment.set({ status: 'idle' });
    this.analysisProgress.set(0);
    this.state.set('AUDIO_LOADING');
    try {
      const audio = await this.loader.load(file);
      this.audio.set(audio);
      this.state.set('ANALYZING');
      this.audioKey = `${file.name}|${file.size}|${file.lastModified}`;
      const analysis = await this.analyzer.analyze(this.audioKey, audio.buffer, (p) => this.analysisProgress.set(p));
      this.analysis.set(analysis);
      this.state.set('READY');
    } catch (err) {
      this.fail(err);
    }
  }

  async generate(): Promise<void> {
    const analysis = this.analysis();
    if (!analysis || !this.canGenerate()) return;
    const previousState = this.state();
    const wasPlaying = previousState === 'PLAYING';
    this.state.set('GENERATING');
    this.error.set(null);
    // Let the UI paint the loading state before the synchronous planning work.
    await new Promise((r) => setTimeout(r));
    try {
      const quote = this.policy.quote(this.mode(), analysis.duration);
      if (!(await this.ensureAuthorized(quote))) {
        this.state.set(previousState);
        return;
      }
      this.range = quote.range;
      const text = this.lyricsText().trim();
      const lyrics = text ? this.lyricParser.parse(text, analysis.duration) : null;
      const key = `${this.audioKey}|${text}`;
      const inFlight = this.alignment().status === 'running' && this.aligningFor === key && covers(this.aligningRange, this.range);
      const wantsAsr = lyrics ? lyrics.timing === 'provisional' && lyrics.cues.length > 0 : this.autoLyrics();
      const done = this.lyricTiming() === 'aligned' || this.lyricTiming() === 'transcribed';
      const reuseAligned = wantsAsr && (inFlight || (this.alignedFor === key && done && covers(this.alignedRange, this.range)));
      const needsAlignment = wantsAsr && !reuseAligned;
      if (!reuseAligned) {
        this.alignRun++;
        this.aligner.cancel();
        this.lyricCues = needsAlignment ? undefined : lyrics?.cues;
        this.lyricTiming.set(needsAlignment ? null : lyrics?.cues.length ? lyrics.timing : null);
        this.alignment.set({ status: 'idle' });
      }
      this.rebuildProject();
      this.state.set(wasPlaying ? 'PLAYING' : 'PREVIEW_READY');
      if (needsAlignment) void this.alignLyrics(text, lyrics?.cues.map((c) => c.text) ?? []);
    } catch (err) {
      this.fail(err);
    }
  }

  /** Unlock gate: asks the policy once per (track, mode); free modes pass straight through. */
  private async ensureAuthorized(quote: GenerationQuote): Promise<boolean> {
    const key = `${this.audioKey}|${quote.mode}`;
    if (this.authorized.has(key)) return true;
    if (!(await this.policy.authorize(quote))) return false;
    this.authorized.add(key);
    return true;
  }

  /** Builds the project from current inputs; same seed, so scenes don't change when only lyrics do. */
  private rebuildProject(): void {
    const analysis = this.analysis();
    if (!analysis) return;
    this.project.set(this.engine.createProject({ analysis, styleId: this.styleId(), lyrics: this.lyricCues, lyricPreset: this.lyricPreset(), mode: this.mode(), range: this.range }));
  }

  /** Runs automatic alignment (or, with no `lines`, recognition) in the background; the preview keeps playing meanwhile. */
  private async alignLyrics(text: string, lines: string[]): Promise<void> {
    const audio = this.audio();
    const analysis = this.analysis();
    if (!audio || !analysis) return;
    const run = ++this.alignRun;
    const range = this.range;
    this.aligningFor = `${this.audioKey}|${text}`;
    this.aligningRange = range;
    this.alignment.set({ status: 'running', stage: 'transcribe' });
    try {
      const cues = await this.aligner.align(this.audioKey, audio.buffer, lines, range, (p) => {
        if (run === this.alignRun) this.alignment.set({ status: 'running', ...p });
      });
      if (run !== this.alignRun) return;
      this.lyricCues = cues;
      this.lyricTiming.set(lines.length ? 'aligned' : 'transcribed');
      this.alignedFor = `${this.audioKey}|${text}`;
      this.alignedRange = range;
      this.alignment.set({ status: 'done' });
    } catch (err) {
      if (run !== this.alignRun) return;
      console.error('[lyrics] alignment failed, falling back to provisional timing', err);
      this.lyricCues = lines.length ? this.lyricParser.parse(lines.join('\n'), analysis.duration).cues : undefined;
      this.lyricTiming.set(lines.length ? 'provisional' : null);
      this.alignment.set({ status: 'error', message: err instanceof Error ? err.message : String(err) });
    }
    // Swapping the project mid-export would restart the recording's visuals; the next Generate picks it up.
    if (this.state() !== 'EXPORTING') this.rebuildProject();
  }

  /** Switching length regenerates (after the unlock gate) with the same scenes and seed. */
  selectMode(mode: GenerationMode): void {
    if (this.mode() === mode) return;
    this.mode.set(mode);
    if (this.project()) void this.generate();
  }

  /** Switching style re-plans scenes from the cached analysis; audio is never re-analyzed. */
  selectStyle(id: VJStyleId): void {
    if (this.styleId() === id) return;
    this.styleId.set(id);
    if (this.project()) void this.generate();
  }

  setPlaying(playing: boolean): void {
    if (!this.project() || this.state() === 'EXPORTING') return;
    this.state.set(playing ? 'PLAYING' : 'PREVIEW_READY');
  }

  setExporting(exporting: boolean): void {
    if (!this.project()) return;
    this.state.set(exporting ? 'EXPORTING' : 'PREVIEW_READY');
  }

  fail(err: unknown): void {
    console.error('[generator]', err);
    this.error.set(err instanceof Error ? err.message : String(err));
    this.state.set('ERROR');
  }
}

const covers = (outer: PlayRange, inner: PlayRange) => outer.start <= inner.start && outer.end >= inner.end;
