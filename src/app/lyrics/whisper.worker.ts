/// <reference lib="webworker" />
import { AutomaticSpeechRecognitionPipeline, pipeline, ProgressInfo, Tensor } from '@huggingface/transformers';
import type { WhisperRequest, WhisperResponse } from './whisper-protocol';

/** Multilingual Whisper exported with alignment heads, required for word-level timestamps. */
const MODEL_ID = 'onnx-community/whisper-small_timestamped';

let asr: Promise<AutomaticSpeechRecognitionPipeline> | null = null;
/** Languages Whisper writes without spaces (code → the name its tokenizer expects); their word timestamps must be split per token. */
const UNSPACED: Record<string, string> = { zh: 'chinese', ja: 'japanese', th: 'thai', lo: 'lao', my: 'myanmar' };
const SAMPLE_RATE = 16000;
/** 30 s windows sampled across the audio for language detection; summing them outweighs an ad-lib or intro. */
const DETECT_WINDOWS = 3;
/** Download progress belongs to whichever request is running; requests run one at a time. */
let activeId = 0;
const post = (msg: WhisperResponse) => postMessage(msg);

function loadModel(): Promise<AutomaticSpeechRecognitionPipeline> {
  asr ??= pipeline('automatic-speech-recognition', MODEL_ID, {
    // ponytail: WASM + int8 only; add a WebGPU path when alignment speed becomes the bottleneck.
    device: 'wasm',
    dtype: 'q8',
    progress_callback: (p: ProgressInfo) => {
      if (p.status === 'progress_total') post({ id: activeId, type: 'progress', stage: 'download', progress: p.progress / 100 });
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
    original(tokens, timestamps, language && Object.values(UNSPACED).includes(language) ? language : detected);
}

/**
 * transformers.js has no language detection: without a `language` it silently transcribes as English
 * (Japanese vocals came out as English words). Ask the decoder for its first token instead,
 * restricted to the language tokens, like openai/whisper's detect_language. Returns a code such as 'ja'.
 */
export async function detectLanguage(transcriber: AutomaticSpeechRecognitionPipeline, audio: Float32Array): Promise<string> {
  const config = transcriber.model.generation_config as unknown as { decoder_start_token_id: number; lang_to_id: Record<string, number> };
  const window = 30 * SAMPLE_RATE;
  const step = Math.max(0, audio.length - window) / Math.max(1, DETECT_WINDOWS - 1);
  const scores = new Map<string, number>();
  for (let k = 0; k < DETECT_WINDOWS; k++) {
    const start = Math.round(k * step);
    const { input_features } = await transcriber.processor(audio.subarray(start, start + window));
    const decoder_input_ids = new Tensor('int64', [BigInt(config.decoder_start_token_id)], [1, 1]);
    const { logits } = (await transcriber.model({ input_features, decoder_input_ids })) as { logits: Tensor };
    const data = logits.data as Float32Array;
    for (const [token, id] of Object.entries(config.lang_to_id)) scores.set(token, (scores.get(token) ?? 0) + data[id]);
    if (audio.length <= window) break;
  }
  const [best] = [...scores].sort((a, b) => b[1] - a[1])[0];
  return best.slice(2, -2);
}

/** Runs one request with its own id fixed for all of its messages. */
async function handle({ id, audio, language }: WhisperRequest): Promise<void> {
  activeId = id;
  try {
    const transcriber = await loadModel();
    language ??= await detectLanguage(transcriber, audio);
    language = UNSPACED[language] ?? language;
    forceWordSplitting(transcriber, language);
    post({ id, type: 'progress', stage: 'transcribe' });
    const output = await transcriber(audio, {
      return_timestamps: 'word',
      chunk_length_s: 30,
      stride_length_s: 5,
      language,
      task: 'transcribe',
    });
    const chunks = (Array.isArray(output) ? output[0] : output).chunks ?? [];
    post({ id, type: 'result', language, words: chunks.map((c: { text: string; timestamp: [number, number | null] }) => ({ text: c.text, start: c.timestamp[0], end: c.timestamp[1] ?? c.timestamp[0] })) });
  } catch (err) {
    asr = null;
    console.error('[whisper.worker]', err);
    post({ id, type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
}

// The model and the patched tokenizer are shared, so never run two requests at once.
let queue = Promise.resolve();
addEventListener('message', ({ data }: MessageEvent<WhisperRequest>) => {
  queue = queue.then(() => handle(data));
});
