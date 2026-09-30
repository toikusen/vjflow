import { Injectable } from '@angular/core';
import { PlayRange } from '../vj/generation-policy';
import { LyricCue } from './lyric.model';
import { alignLyrics, basicNormalize, guessLanguage, Normalizer, TimedWord } from './lyric-alignment';
import { WhisperRequest, WhisperResponse } from './whisper-protocol';

const ASR_SAMPLE_RATE = 16000;
/** A stretch this long without any recognized word is re-transcribed on its own. */
const HOLE_SECONDS = 8;
const HOLE_PADDING = 1;

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
  private readonly cache = new Map<string, LyricCue[]>();
  private nextId = 0;

  async align(cacheKey: string, buffer: AudioBuffer, lines: string[], window: PlayRange, onProgress: (p: AlignProgress) => void): Promise<LyricCue[]> {
    const key = `${cacheKey}|${window.start}-${window.end}|${lines.join('\n')}`;
    const cached = this.cache.get(key);
    if (cached) return cached;

    const [audio, normalize] = await Promise.all([resample(buffer, window), this.loadNormalizer()]);
    const language = guessLanguage(lines.join(''));
    const words = await this.transcribeFilled(audio, language, onProgress);
    const shifted = words.map((w) => ({ ...w, start: w.start + window.start, end: w.end + window.start }));
    const cues = alignLyrics(lines, shifted, normalize, window);
    this.cache.set(key, cues);
    return cues;
  }

  /**
   * Whisper's long-form decoding sometimes hallucinates and then skips a whole 30 s chunk,
   * leaving a silent hole. Re-transcribing each hole on its own usually recovers it.
   * Times are relative to `audio`.
   */
  private async transcribeFilled(audio: Float32Array, language: string | undefined, onProgress: (p: AlignProgress) => void): Promise<TimedWord[]> {
    const duration = audio.length / ASR_SAMPLE_RATE;
    const words = await this.transcribe({ id: ++this.nextId, audio: audio.slice(), language }, onProgress);
    for (const [from, to] of findHoles(words, duration)) {
      const offset = Math.max(0, from - HOLE_PADDING);
      const slice = audio.slice(Math.floor(offset * ASR_SAMPLE_RATE), Math.ceil(Math.min(duration, to + HOLE_PADDING) * ASR_SAMPLE_RATE));
      const retry = await this.transcribe({ id: ++this.nextId, audio: slice, language }, onProgress);
      for (const w of retry) {
        const start = w.start + offset;
        if (start > from && start < to) words.push({ text: w.text, start, end: w.end + offset });
      }
    }
    return words.sort((a, b) => a.start - b.start);
  }

  private transcribe(request: WhisperRequest, onProgress: (p: AlignProgress) => void): Promise<TimedWord[]> {
    this.worker ??= new Worker(new URL('./whisper.worker', import.meta.url), { type: 'module' });
    const worker = this.worker;
    return new Promise((resolve, reject) => {
      const onMessage = ({ data }: MessageEvent<WhisperResponse>) => {
        if (data.id !== request.id) return;
        if (data.type === 'progress') return onProgress(data);
        worker.removeEventListener('message', onMessage);
        if (data.type === 'result') resolve(data.words);
        else reject(new Error(data.message));
      };
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
