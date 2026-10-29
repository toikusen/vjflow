// ffmpeg helpers shared by the lyric-VJ scripts.
import { execFileSync, spawn } from 'node:child_process';
import { renameSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import sharp from 'sharp';

/** Decodes any audio file to mono float32 PCM at `sampleRate` (ffmpeg handles mp3 encoder delay consistently). */
export function decode(path: string, sampleRate: number): Float32Array {
  const raw = execFileSync('ffmpeg', ['-loglevel', 'error', '-i', path, '-vn', '-ac', '1', '-ar', String(sampleRate), '-f', 'f32le', '-'], {
    maxBuffer: 1 << 30,
  });
  return new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength)); // copy: byteOffset may be unaligned
}

/** The black spans ffmpeg's blackdetect printed, as [start, end] seconds. */
export function blackSpans(log: string): [number, number][] {
  return [...log.matchAll(/black_start:([\d.]+) black_end:([\d.]+)/g)].map((m) => [+m[1], +m[2]]);
}

/**
 * The drawn band as a mask: dark is shape, light is sky, cropped to the shape's top. Black on transparent, so the
 * renderer can fill it with any colour.
 */
export async function keyStrip(src: string, dst: string) {
  const { data, info } = await sharp(src).greyscale().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const rgba = Buffer.alloc(w * h * 4);
  let top = h;
  for (let i = 0; i < w * h; i++) {
    // a soft threshold keeps the edge anti-aliased: 90 and darker is solid, 170 and lighter is sky
    const v = Math.max(0, Math.min(255, Math.round(((170 - data[i]) / 80) * 255)));
    rgba[i * 4 + 3] = v;
    if (v > 128) top = Math.min(top, Math.floor(i / w));
  }
  await sharp(rgba, { raw: { width: w, height: h, channels: 4 } }).extract({ left: 0, top: Math.max(0, top - 4), width: w, height: h - Math.max(0, top - 4) }).png().toFile(dst);
}

/** Runs a command to completion, rejecting on a non-zero exit. */
export function run(cmd: string, args: string[]) {
  return new Promise((r, j) => spawn(cmd, args, { stdio: 'inherit' }).on('close', (c) => (c ? j(new Error(`${cmd} ${c}`)) : r(null))));
}

/**
 * The silent video with `audio` from `start` for `length` seconds, written to `file`. ffmpeg writes a hidden temporary
 * beside it (same extension, so the container is the same) that is renamed into place only when it finished: a mux
 * killed midway leaves no file under the final name, which the pipeline would take for a finished video.
 */
export async function mux(video: string, audio: string, file: string, offset: number, start: number, length: number) {
  // delay as a filter: asetpts would reset an input offset (-itsoffset) to zero
  const pre = offset > 0 ? `adelay=${(offset * 1000).toFixed(1)}:all=1,` : '';
  const af = `${pre}atrim=start=${start + Math.max(0, -offset)}:duration=${length},asetpts=PTS-STARTPTS`;
  const tmp = join(dirname(file), `.tmp-${basename(file)}`);
  await run('ffmpeg', ['-loglevel', 'error', '-y', '-i', video, '-i', audio, '-map', '0:v', '-map', '1:a', '-af', af,
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-shortest', ...(file.endsWith('.mp4') ? ['-movflags', '+faststart'] : []), tmp]);
  renameSync(tmp, file);
}
