// ffmpeg helpers shared by the lyric-VJ scripts.
import { execFileSync } from 'node:child_process';

/** Decodes any audio file to mono float32 PCM at `sampleRate` (ffmpeg handles mp3 encoder delay consistently). */
export function decode(path: string, sampleRate: number): Float32Array {
  const raw = execFileSync('ffmpeg', ['-loglevel', 'error', '-i', path, '-vn', '-ac', '1', '-ar', String(sampleRate), '-f', 'f32le', '-'], {
    maxBuffer: 1 << 30,
  });
  return new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength)); // copy: byteOffset may be unaligned
}
