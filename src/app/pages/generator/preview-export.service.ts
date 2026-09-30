import { Injectable } from '@angular/core';

const CANDIDATE_TYPES = [
  { mime: 'video/webm;codecs=vp9,opus', ext: 'webm' },
  { mime: 'video/webm;codecs=vp8,opus', ext: 'webm' },
  { mime: 'video/webm', ext: 'webm' },
  // Safari has no WebM recording; MP4 is the only thing it can produce client-side.
  { mime: 'video/mp4', ext: 'mp4' },
];

export interface RecorderFormat {
  mime: string;
  ext: string;
}

export class ExportUnsupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExportUnsupportedError';
  }
}

/** Picks the first recording format this browser supports, or null. */
export function detectRecorderFormat(): RecorderFormat | null {
  if (typeof MediaRecorder === 'undefined' || typeof HTMLCanvasElement.prototype.captureStream !== 'function') return null;
  return CANDIDATE_TYPES.find((c) => MediaRecorder.isTypeSupported(c.mime)) ?? null;
}

/**
 * Records canvas frames plus the audio element's output into a video Blob, in real time.
 * The caller drives playback; this only wires streams and the recorder.
 */
@Injectable()
export class PreviewExportService {
  private audioCtx?: AudioContext;
  private audioDest?: MediaStreamAudioDestinationNode;
  private monitor?: GainNode;
  private restoreVolume?: () => void;
  private wiredElement?: HTMLMediaElement;
  private recorder?: MediaRecorder;

  /**
   * Starts recording; resolves with the video Blob once stop() is called.
   * `monitorVolume` is what the user hears; the recording always gets the full-level track.
   */
  async start(canvas: HTMLCanvasElement, audio: HTMLMediaElement, monitorVolume: number): Promise<{ done: Promise<Blob>; format: RecorderFormat }> {
    const format = detectRecorderFormat();
    if (!format) throw new ExportUnsupportedError('此瀏覽器無法錄製影片（不支援 MediaRecorder / canvas.captureStream）。');

    const stream = canvas.captureStream(60);
    const audioTrack = await this.audioTrackFor(audio);
    if (audioTrack && this.monitor) {
      // Element volume is applied before Web Audio, so keep it at 1 and attenuate only the speakers.
      audio.volume = 1;
      this.monitor.gain.value = monitorVolume;
      this.restoreVolume = () => {
        audio.volume = monitorVolume;
        if (this.monitor) this.monitor.gain.value = 1;
      };
    }
    if (audioTrack) stream.addTrack(audioTrack);

    const recorder = new MediaRecorder(stream, { mimeType: format.mime, videoBitsPerSecond: 12_000_000 });
    this.recorder = recorder;
    const chunks: Blob[] = [];
    const done = new Promise<Blob>((resolve, reject) => {
      recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      recorder.onstop = () => {
        stream.getVideoTracks().forEach((t) => t.stop());
        resolve(new Blob(chunks, { type: format.mime.split(';')[0] }));
      };
      recorder.onerror = (e) => reject((e as ErrorEvent).error ?? new Error('影片錄製失敗'));
    });
    recorder.start(1000);
    return { done, format };
  }

  stop(): void {
    if (this.recorder?.state === 'recording') this.recorder.stop();
    this.recorder = undefined;
    this.restoreVolume?.();
    this.restoreVolume = undefined;
  }

  /**
   * Routes the element through Web Audio once (createMediaElementSource can only be called once per element)
   * so it keeps playing to the speakers and also feeds the recorder.
   */
  private async audioTrackFor(audio: HTMLMediaElement): Promise<MediaStreamTrack | null> {
    try {
      if (this.wiredElement !== audio) {
        this.audioCtx ??= new AudioContext();
        const source = this.audioCtx.createMediaElementSource(audio);
        this.audioDest = this.audioCtx.createMediaStreamDestination();
        this.monitor = this.audioCtx.createGain();
        source.connect(this.monitor).connect(this.audioCtx.destination);
        source.connect(this.audioDest);
        this.wiredElement = audio;
      }
      await this.audioCtx?.resume();
      return this.audioDest?.stream.getAudioTracks()[0] ?? null;
    } catch (err) {
      console.error('[export] audio capture unavailable, exporting video only', err);
      return null;
    }
  }

  dispose(): void {
    this.stop();
    void this.audioCtx?.close();
  }
}
