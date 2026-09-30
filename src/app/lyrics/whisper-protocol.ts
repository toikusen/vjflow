import { TimedWord } from './lyric-alignment';

export interface WhisperRequest {
  id: number;
  /** 16 kHz mono PCM. */
  audio: Float32Array;
  language?: string;
}

export type WhisperResponse =
  | { id: number; type: 'progress'; stage: 'download' | 'transcribe'; progress?: number }
  /** `language` is the one actually used (detected when the request had none). */
  | { id: number; type: 'result'; words: TimedWord[]; language: string }
  | { id: number; type: 'error'; message: string };
