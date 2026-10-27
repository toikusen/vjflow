// ffmpeg helpers shared by the lyric-VJ scripts.
import { execFileSync } from 'node:child_process';
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
