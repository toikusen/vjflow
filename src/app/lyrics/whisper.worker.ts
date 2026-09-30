/// <reference lib="webworker" />
import { AutomaticSpeechRecognitionPipeline, pipeline, ProgressInfo } from '@huggingface/transformers';
import type { WhisperRequest, WhisperResponse } from './whisper-protocol';

/** Multilingual Whisper exported with alignment heads, required for word-level timestamps. */
const MODEL_ID = 'onnx-community/whisper-small_timestamped';

let asr: Promise<AutomaticSpeechRecognitionPipeline> | null = null;
/** Languages Whisper writes without spaces; their word timestamps must be split per token. */
const UNSPACED = ['chinese', 'japanese', 'thai', 'lao', 'myanmar'];
let currentId = 0;
const post = (msg: DistributiveOmit<WhisperResponse, 'id'>) => postMessage({ ...msg, id: currentId });
type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

function loadModel(): Promise<AutomaticSpeechRecognitionPipeline> {
  asr ??= pipeline('automatic-speech-recognition', MODEL_ID, {
    // ponytail: WASM + int8 only; add a WebGPU path when alignment speed becomes the bottleneck.
    device: 'wasm',
    dtype: 'q8',
    progress_callback: (p: ProgressInfo) => {
      if (p.status === 'progress_total') post({ type: 'progress', stage: 'download', progress: p.progress / 100 });
    },
  }) as Promise<AutomaticSpeechRecognitionPipeline>;
  return asr;
}

/**
 * transformers.js loses the language token before grouping tokens into words and falls back to
 * splitting on spaces, which merges whole CJK phrases into one "word" with one timestamp.
 * ponytail: patch the tokenizer to use the known language; drop once fixed upstream.
 */
function forceWordSplitting(transcriber: AutomaticSpeechRecognitionPipeline, language: string | undefined): void {
  type Collate = (tokens: unknown, timestamps: unknown, language?: string) => unknown;
  const tokenizer = transcriber.tokenizer as unknown as { collateWordTimestamps: Collate; __original?: Collate };
  tokenizer.__original ??= tokenizer.collateWordTimestamps.bind(tokenizer);
  const original = tokenizer.__original;
  tokenizer.collateWordTimestamps = (tokens, timestamps, detected) =>
    original(tokens, timestamps, language && UNSPACED.includes(language) ? language : detected);
}

addEventListener('message', async ({ data }: MessageEvent<WhisperRequest>) => {
  currentId = data.id;
  try {
    const transcriber = await loadModel();
    forceWordSplitting(transcriber, data.language);
    post({ type: 'progress', stage: 'transcribe' });
    const output = await transcriber(data.audio, {
      return_timestamps: 'word',
      chunk_length_s: 30,
      stride_length_s: 5,
      language: data.language,
      task: 'transcribe',
    });
    const chunks = (Array.isArray(output) ? output[0] : output).chunks ?? [];
    post({
      type: 'result',
      words: chunks.map((c) => ({ text: c.text, start: c.timestamp[0], end: c.timestamp[1] ?? c.timestamp[0] })),
    });
  } catch (err) {
    asr = null;
    console.error('[whisper.worker]', err);
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
});
