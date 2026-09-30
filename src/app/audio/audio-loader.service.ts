import { Injectable } from '@angular/core';

export const MIN_AUDIO_DURATION = 5;
const MAX_FILE_BYTES = 200 * 1024 * 1024;
const SUPPORTED_EXTENSIONS = ['mp3', 'wav', 'm4a'];
const SUPPORTED_MIME = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac'];

export class AudioLoadError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'AudioLoadError';
  }
}

export interface LoadedAudio {
  file: File;
  buffer: AudioBuffer;
  duration: number;
  /** Object URL for <audio> playback; revoke via AudioLoaderService.release(). */
  url: string;
}

/** Throws AudioLoadError when the file type is not one we accept. */
export function assertSupportedFile(file: Pick<File, 'name' | 'type' | 'size'>): void {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (!SUPPORTED_EXTENSIONS.includes(ext) && !SUPPORTED_MIME.includes(file.type)) {
    throw new AudioLoadError(`不支援的格式「.${ext}」，請上傳 MP3、WAV 或 M4A。`);
  }
  if (file.size === 0) throw new AudioLoadError('檔案是空的。');
  if (file.size > MAX_FILE_BYTES) throw new AudioLoadError('檔案超過 200 MB。');
}

/** Decodes a local audio file in the browser. Nothing is uploaded. */
@Injectable({ providedIn: 'root' })
export class AudioLoaderService {
  async load(file: File): Promise<LoadedAudio> {
    assertSupportedFile(file);
    const bytes = await file.arrayBuffer();
    const ctx = new AudioContext();
    let buffer: AudioBuffer;
    try {
      buffer = await ctx.decodeAudioData(bytes);
    } catch (err) {
      throw new AudioLoadError('瀏覽器無法解碼這個音檔，請改用 MP3 或 WAV。', err);
    } finally {
      void ctx.close();
    }
    if (!buffer.length || !Number.isFinite(buffer.duration) || buffer.duration === 0) {
      throw new AudioLoadError('音檔長度為 0。');
    }
    if (buffer.duration < MIN_AUDIO_DURATION) {
      throw new AudioLoadError(`音檔太短（${buffer.duration.toFixed(1)} 秒），至少需要 ${MIN_AUDIO_DURATION} 秒。`);
    }
    return { file, buffer, duration: buffer.duration, url: URL.createObjectURL(file) };
  }

  release(audio: LoadedAudio | null): void {
    if (audio) URL.revokeObjectURL(audio.url);
  }
}
