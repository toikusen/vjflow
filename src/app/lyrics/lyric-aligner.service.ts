import { Injectable } from '@angular/core';
import { PlayRange } from '../vj/generation-policy';
import { LyricCue } from './lyric.model';
import { alignLyrics, basicNormalize, guessLanguage, Normalizer, TimedWord, trimLongOnsets, wordsToCues } from './lyric-alignment';
import { WhisperRequest, WhisperResponse } from './whisper-protocol';

const ASR_SAMPLE_RATE = 16000;
/** A stretch this long without any recognized word is re-transcribed on its own. */
const HOLE_SECONDS = 8;
const HOLE_PADDING = 1;

/** Thrown into a superseded align() call; callers treat it as "ignore", not as a failure. */
export class AlignmentCancelledError extends Error {
  constructor() {
    super('Lyric alignment was superseded');
    this.name = 'AlignmentCancelledError';
  }
}

export type AlignProgress = { stage: 'download' | 'transcribe'; progress?: number };

/**
 * Automatic lyric timing: Whisper (in a Web Worker, fully in-browser) hears the vocals,
 * then the user's own lyric lines are aligned onto the recognized words.
 * Only the given window (the project's play range) is transcribed.
 */
@Injectable({ providedIn: 'root' })
export class LyricAlignerService {
  private worker?: Worker;
  private normalizer?: Promise<Normalizer>;
  private toTraditional?: Promise<(text: string) => string>;
  private readonly cache = new Map<string, LyricCue[]>();
  private nextId = 0;
  /** Bumped by every align()/cancel(); a run whose generation is stale stops at its next step. */
  private generation = 0;
  private readonly pending = new Set<(err: Error) => void>();

  /**
   * Latest call wins: starting a new alignment cancels the one in flight.
   * With no `lines`, the lyrics themselves come from what Whisper hears (auto-detected language).
   */
  async align(cacheKey: string, buffer: AudioBuffer, lines: string[], window: PlayRange, onProgress: (p: AlignProgress) => void): Promise<LyricCue[]> {
    this.cancel();
    const generation = this.generation;
    const key = `${cacheKey}|${window.start}-${window.end}|${lines.join('\n')}`;
    const cached = this.cache.get(key);
    if (cached) return cached;

    // ponytail: the Traditional converter is fetched even for non-Chinese songs; it's small and lazy.
    const [audio, normalize, toTraditional] = await Promise.all([resample(buffer, window), this.loadNormalizer(), lines.length ? undefined : this.loadToTraditional()]);
    const language = lines.length ? guessLanguage(lines.join('')) : undefined;
    const heard = await this.transcribeFilled(audio, language, onProgress, generation);
    const words = heard.words;
    const shifted = trimLongOnsets(words.map((w) => ({ ...w, start: w.start + window.start, end: w.end + window.start })));
    const cues = lines.length
      ? alignLyrics(lines, shifted, normalize, window)
      : wordsToCues(shifted, window).map((c) => (heard.language === 'chinese' ? { ...c, text: toTraditional!(c.text) } : c));
    this.cache.set(key, cues);
    return cues;
  }

  /**
   * Whisper's long-form decoding sometimes hallucinates and then skips a whole 30 s chunk,
   * leaving a silent hole. Re-transcribing each hole on its own usually recovers it.
   * Times are relative to `audio`.
   */
  private async transcribeFilled(audio: Float32Array, language: string | undefined, onProgress: (p: AlignProgress) => void, generation: number): Promise<{ words: TimedWord[]; language: string }> {
    const duration = audio.length / ASR_SAMPLE_RATE;
    const first = await this.transcribe({ id: ++this.nextId, audio: audio.slice(), language }, onProgress, generation);
    const words = first.words;
    // Short hole slices would detect the language poorly; reuse the one heard over the whole window.
    language = first.language;
    for (const [from, to] of findHoles(words, duration)) {
      const offset = Math.max(0, from - HOLE_PADDING);
      const slice = audio.slice(Math.floor(offset * ASR_SAMPLE_RATE), Math.ceil(Math.min(duration, to + HOLE_PADDING) * ASR_SAMPLE_RATE));
      const retry = await this.transcribe({ id: ++this.nextId, audio: slice, language }, onProgress, generation);
      for (const w of retry.words) {
        const start = w.start + offset;
        if (start > from && start < to) words.push({ text: w.text, start, end: w.end + offset });
      }
    }
    return { words: words.sort((a, b) => a.start - b.start), language: first.language };
  }

  /**
   * Stops any alignment in flight. The worker is terminated rather than drained, because a
   * superseded full-song transcription could otherwise block the next request for minutes.
   */
  cancel(): void {
    this.generation++;
    if (!this.pending.size) return;
    this.worker?.terminate();
    this.worker = undefined;
    this.pending.forEach((reject) => reject(new AlignmentCancelledError()));
    this.pending.clear();
  }

  protected createWorker(): Worker {
    return new Worker(new URL('./whisper.worker', import.meta.url), { type: 'module' });
  }

  private transcribe(request: WhisperRequest, onProgress: (p: AlignProgress) => void, generation: number): Promise<{ words: TimedWord[]; language: string }> {
    if (generation !== this.generation) return Promise.reject(new AlignmentCancelledError());
    this.worker ??= this.createWorker();
    const worker = this.worker;
    return new Promise((resolve, reject) => {
      const settle = () => {
        worker.removeEventListener('message', onMessage);
        this.pending.delete(reject);
      };
      const onMessage = ({ data }: MessageEvent<WhisperResponse>) => {
        if (data.id !== request.id) return;
        if (data.type === 'progress') return onProgress(data);
        settle();
        if (data.type === 'result') resolve(data);
        else reject(new Error(data.message));
      };
      this.pending.add(reject);
      worker.addEventListener('message', onMessage);
      worker.postMessage(request, [request.audio.buffer]);
    });
  }

  /** Traditional → Simplified before comparing, since Whisper may answer in either script. */
  private loadNormalizer(): Promise<Normalizer> {
    this.normalizer ??= import('opencc-js/t2cn').then((OpenCC) => {
      const toCn = OpenCC.Converter({ from: 'tw', to: 'cn' });
      return (text: string) => basicNormalize(toCn(text));
    });
    return this.normalizer;
  }

  /** Whisper often answers Chinese in Simplified script; recognized lyrics are shown in Taiwan Traditional. */
  private loadToTraditional(): Promise<(text: string) => string> {
    this.toTraditional ??= import('opencc-js/cn2t').then((OpenCC) => OpenCC.Converter({ from: 'cn', to: 'tw' }));
    return this.toTraditional;
  }
}

/** Stretches of at least HOLE_SECONDS with no recognized word, including before the first / after the last. */
export function findHoles(words: TimedWord[], duration: number): [number, number][] {
  const sorted = [...words].sort((a, b) => a.start - b.start);
  const holes: [number, number][] = [];
  let cursor = 0;
  for (const w of [...sorted, { text: '', start: duration, end: duration }]) {
    if (w.start - cursor >= HOLE_SECONDS) holes.push([cursor, w.start]);
    cursor = Math.max(cursor, w.end);
  }
  return holes;
}

/** Mono 16 kHz slice of `buffer` via the browser's own resampler. */
async function resample(buffer: AudioBuffer, window: PlayRange): Promise<Float32Array> {
  const duration = Math.max(0.1, window.end - window.start);
  const ctx = new OfflineAudioContext(1, Math.ceil(duration * ASR_SAMPLE_RATE), ASR_SAMPLE_RATE);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.start(0, window.start, duration);
  const rendered = await ctx.startRendering();
  return rendered.getChannelData(0);
}
