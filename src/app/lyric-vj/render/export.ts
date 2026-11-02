// A finished video from the browser: the engine's frames scaled to 720p through WebCodecs, the song's audio with them,
// in an MP4 file. Nothing leaves the machine.
import { ArrayBufferTarget, Muxer } from 'mp4-muxer';
import type { LyricVjEngine } from './engine';
import { exportBlocker } from './export-check';

export interface ExportCodecs { video: string; audio: 'aac' | 'opus' | null }
export interface ExportOptions {
  engine: Pick<LyricVjEngine, 'renderAt'>;
  canvas: HTMLCanvasElement;
  duration: number;
  fps?: number;
  /** The song's audio file; unset, a silent video. */
  audio?: ArrayBuffer;
  from?: number;
  /** A solid ground under a transparent picture (a text-layer engine): green or black for keying in an editor. */
  matte?: string;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}

const WIDTH = 1280;
const HEIGHT = 720;
const VIDEO_BITRATE = 6_000_000;
const AUDIO_BITRATE = 192_000;
/** H.264 profiles to try, Chrome's hardware encoder takes these at 720p. */
const VIDEO_CODECS = ['avc1.640020', 'avc1.4d0020', 'avc1.42e020'];
const QUEUE = 6;
const AUDIO_RATE = 48000;
/** Samples of priming in Chrome's AAC encoder, measured on an exported file (44 ms). */
const AAC_DELAY = 2112;

/** The H.264 profile and audio codec this browser can encode, or a message saying it cannot. */
export async function pickCodecs(fps = 30): Promise<ExportCodecs | string> {
  const blocked = exportBlocker();
  if (blocked) return blocked;
  let video = '';
  for (const codec of VIDEO_CODECS) {
    const { supported } = await VideoEncoder.isConfigSupported({ codec, width: WIDTH, height: HEIGHT, bitrate: VIDEO_BITRATE, framerate: fps });
    if (supported) {
      video = codec;
      break;
    }
  }
  if (!video) return '這個瀏覽器沒有 H.264 編碼器，無法匯出 MP4。請改用桌面版 Chrome 或 Edge。';
  if (typeof AudioEncoder === 'undefined') return { video, audio: null };
  const can = async (codec: string) => (await AudioEncoder.isConfigSupported({ codec, sampleRate: AUDIO_RATE, numberOfChannels: 2, bitrate: AUDIO_BITRATE })).supported;
  return { video, audio: (await can('mp4a.40.2')) ? 'aac' : (await can('opus')) ? 'opus' : null };
}

/** Lets the page breathe, and stops feeding the encoder while it is behind. */
const waitFor = async (busy: () => boolean) => {
  while (busy()) await new Promise((r) => setTimeout(r, 2));
};

/** Encoded audio from a song file, at 48 kHz stereo, cut to the part being exported. */
async function encodeAudio(file: ArrayBuffer, codec: 'aac' | 'opus', muxer: Muxer<ArrayBufferTarget>, from: number, duration: number) {
  const rate = AUDIO_RATE;
  // (an offline context decodes to its own rate, whatever the file's)
  const decoded = await new OfflineAudioContext(2, 1, rate).decodeAudioData(file.slice(0));
  const channels = [0, 1].map((c) => decoded.getChannelData(Math.min(c, decoded.numberOfChannels - 1)));
  // an AAC stream starts with its encoder's silence and the MP4 keeps it: the song starts that much further in to stay on the picture
  const start = Math.round(from * rate) + (codec === 'aac' ? AAC_DELAY : 0);
  const total = Math.min(decoded.length - start, Math.round(duration * rate));
  let failed: Error | undefined;
  const enc = new AudioEncoder({ output: (chunk, meta) => muxer.addAudioChunk(chunk, meta), error: (e) => (failed = e) });
  enc.configure({ codec: codec === 'aac' ? 'mp4a.40.2' : 'opus', sampleRate: rate, numberOfChannels: 2, bitrate: AUDIO_BITRATE });
  const size = 4096;
  for (let at = 0; at < total && !failed; at += size) {
    const n = Math.min(size, total - at);
    const data = new Float32Array(n * 2);
    data.set(channels[0].subarray(start + at, start + at + n), 0);
    data.set(channels[1].subarray(start + at, start + at + n), n);
    const frame = new AudioData({ format: 'f32-planar', sampleRate: rate, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((at / rate) * 1e6), data });
    enc.encode(frame);
    frame.close();
    if (enc.encodeQueueSize > 32) await waitFor(() => enc.encodeQueueSize > 8);
  }
  await enc.flush();
  enc.close();
  if (failed) throw failed;
}

/** The whole song (or from `from` on) as an MP4 blob. Throws if aborted or if the encoder fails. */
export async function exportVideo(o: ExportOptions): Promise<{ blob: Blob; codecs: ExportCodecs; seconds: number }> {
  const fps = o.fps ?? 30;
  const codecs = await pickCodecs(fps);
  if (typeof codecs === 'string') throw new Error(codecs);
  const began = performance.now();
  const audio = o.audio && codecs.audio ? codecs.audio : null;
  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width: WIDTH, height: HEIGHT, frameRate: fps },
    ...(audio ? { audio: { codec: audio, numberOfChannels: 2, sampleRate: AUDIO_RATE } } : {}),
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
  });
  let failed: Error | undefined;
  const video = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => (failed = e) });
  video.configure({ codec: codecs.video, width: WIDTH, height: HEIGHT, bitrate: VIDEO_BITRATE, framerate: fps, latencyMode: 'quality' });
  const from = o.from ?? 0;
  const frames = Math.round(o.duration * fps);
  try {
    const small = new OffscreenCanvas(WIDTH, HEIGHT);
    const ctx = small.getContext('2d', { alpha: false })!;
    ctx.imageSmoothingQuality = 'high';
    const send = async (f: number) => {
      const frame = new VideoFrame(small, { timestamp: Math.round((f / fps) * 1e6), duration: Math.round(1e6 / fps) });
      video.encode(frame, { keyFrame: f % (fps * 2) === 0 });
      frame.close();
      await waitFor(() => video.encodeQueueSize > QUEUE);
      if (f % 15 === 0) {
        o.onProgress?.(f, frames);
        await new Promise((r) => setTimeout(r));
      }
    };
    const stopped = () => {
      if (o.signal?.aborted) throw new DOMException('匯出已取消', 'AbortError');
      if (failed) throw failed;
    };
    for (let f = 0; f < frames; f++) {
      stopped();
      await o.engine.renderAt(from + f / fps);
      if (o.matte) {
        ctx.fillStyle = o.matte;
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
      }
      ctx.drawImage(o.canvas, 0, 0, WIDTH, HEIGHT);
      await send(f);
    }
    await video.flush();
  } finally {
    // cancelled or failed, the encoder is let go of too
    if (video.state !== 'closed') video.close();
  }
  if (failed) throw failed;
  if (audio) await encodeAudio(o.audio!, audio, muxer, from, o.duration);
  muxer.finalize();
  o.onProgress?.(frames, frames);
  return { blob: new Blob([muxer.target.buffer], { type: 'video/mp4' }), codecs, seconds: (performance.now() - began) / 1000 };
}

/** One layer's engine and the folder its frames go to. */
export interface FrameLayer { engine: Pick<LyricVjEngine, 'renderAt'>; canvas: HTMLCanvasElement; dir: FileSystemDirectoryHandle; name: string }

/** `name_000123.png`: numbered so an editor reads the folder as an image sequence. */
export const frameName = (name: string, f: number) => `${name}_${String(f).padStart(6, '0')}.png`;

/**
 * 720p PNG frames, with alpha, of each layer into its own folder: every layer is drawn at the same moment before the
 * next frame, so the folders line up frame for frame. Written straight to disk: a song's frames do not fit in memory.
 */
export async function exportFrames(o: { layers: FrameLayer[]; duration: number; from?: number; fps?: number; onProgress?: (done: number, total: number) => void; signal?: AbortSignal }) {
  const fps = o.fps ?? 30;
  const from = o.from ?? 0;
  const frames = Math.round(o.duration * fps);
  const small = new OffscreenCanvas(WIDTH, HEIGHT);
  const ctx = small.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  for (let f = 0; f < frames; f++) {
    if (o.signal?.aborted) throw new DOMException('匯出已取消', 'AbortError');
    for (const l of o.layers) {
      await l.engine.renderAt(from + f / fps);
      ctx.clearRect(0, 0, WIDTH, HEIGHT);
      ctx.drawImage(l.canvas, 0, 0, WIDTH, HEIGHT);
      const file = await (await l.dir.getFileHandle(frameName(l.name, f), { create: true })).createWritable();
      await file.write(await small.convertToBlob({ type: 'image/png' }));
      await file.close();
    }
    if (f % 15 === 0) o.onProgress?.(f, frames);
  }
  o.onProgress?.(frames, frames);
}
