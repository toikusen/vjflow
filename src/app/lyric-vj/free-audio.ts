// The visitor's audio file: read in this tab and nowhere else. Limits, decoding and the rhythm found in it.
import { BEAT_RATE, detectBeats, Rhythm } from './beat-detect';
import { sungStretches, Stretch } from './free-sung';

/** Under this a song has nothing to compose; past the upper limit an export would not fit in a tab's memory. */
export const MIN_AUDIO_SECONDS = 10;
export const MAX_AUDIO_SECONDS = 15 * 60;
export const MAX_AUDIO_BYTES = 300 * 1e6;

/** What is wrong with this audio for the free tier, if anything. */
export function audioProblem(seconds: number, bytes = 0) {
  if (bytes > MAX_AUDIO_BYTES) return `音檔太大（${Math.round(bytes / 1e6)} MB），上限 ${MAX_AUDIO_BYTES / 1e6} MB。`;
  if (!Number.isFinite(seconds)) return '';
  if (seconds < MIN_AUDIO_SECONDS) return `音檔太短（${seconds.toFixed(1)} 秒），至少要 ${MIN_AUDIO_SECONDS} 秒。`;
  if (seconds > MAX_AUDIO_SECONDS) return `音檔太長（${Math.round(seconds / 60)} 分鐘），上限 ${MAX_AUDIO_SECONDS / 60} 分鐘。`;
  return '';
}

/** A file to one channel at the detector's rate. Throws if the browser cannot decode it. */
export async function decodeMono(file: Blob): Promise<{ samples: Float32Array; seconds: number }> {
  // (an offline context decodes to its own rate, whatever the file's)
  const decoded = await new OfflineAudioContext(1, 1, BEAT_RATE).decodeAudioData(await file.arrayBuffer());
  const samples = new Float32Array(decoded.length);
  for (let c = 0; c < decoded.numberOfChannels; c++) {
    const data = decoded.getChannelData(c);
    for (let i = 0; i < data.length; i++) samples[i] += data[i] / decoded.numberOfChannels;
  }
  return { samples, seconds: decoded.duration };
}

export interface AudioReading { rhythm?: Rhythm; stretches: Stretch[] }

export const readAudio = (samples: Float32Array): AudioReading => ({ rhythm: detectBeats(samples, BEAT_RATE), stretches: sungStretches(samples, BEAT_RATE) });

/** Rhythm and sung stretches off the page's thread; if a worker cannot start, here. */
export function audioReadingOf(samples: Float32Array): Promise<AudioReading> {
  return new Promise((resolve) => {
    const here = () => resolve(readAudio(samples));
    let worker: Worker;
    try {
      worker = new Worker(new URL('./beat.worker', import.meta.url), { type: 'module' });
    } catch {
      return here();
    }
    worker.onmessage = ({ data }: MessageEvent<AudioReading>) => {
      worker.terminate();
      resolve(data);
    };
    worker.onerror = () => {
      worker.terminate();
      here();
    };
    worker.postMessage(samples);
  });
}
