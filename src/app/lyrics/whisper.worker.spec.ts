import type { WhisperResponse } from './whisper-protocol';

/** Transcriber whose calls resolve only when the test says so, to force overlapping requests. */
const calls: { resolve: () => void; audioLength: number }[] = [];
/** Language-token logits: <|en|> = id 0, <|ja|> = id 1; the decoder "hears" Japanese. */
const langToId = { '<|en|>': 0, '<|ja|>': 1 };
const transcriberOptions: { language?: string }[] = [];
vi.mock('@huggingface/transformers', () => ({
  Tensor: class {},
  pipeline: async () => {
    const transcriber = (audio: Float32Array, options: { language?: string }) =>
      new Promise((resolve) => {
        transcriberOptions.push(options);
        calls.push({ audioLength: audio.length, resolve: () => resolve({ text: '', chunks: [{ text: `len${audio.length}`, timestamp: [0, 1] }] }) });
      });
    const model = Object.assign(async () => ({ logits: { data: new Float32Array([1, 5]) } }), { generation_config: { decoder_start_token_id: 9, lang_to_id: langToId } });
    return Object.assign(transcriber, { tokenizer: { collateWordTimestamps: () => [] }, processor: async () => ({ input_features: {} }), model });
  },
}));

describe('whisper.worker', () => {
  const posted: WhisperResponse[] = [];
  const send = (id: number, length: number) => dispatchEvent(new MessageEvent('message', { data: { id, audio: new Float32Array(length) } }));
  const flush = () => new Promise((r) => setTimeout(r, 0));

  beforeAll(async () => {
    vi.stubGlobal('postMessage', (msg: WhisperResponse) => posted.push(msg));
    await import('./whisper.worker');
  });

  it('keeps each request id and runs overlapping requests one at a time', async () => {
    send(1, 10);
    send(2, 20);
    await flush();
    expect(calls).toHaveLength(1); // second waits for the first

    calls[0].resolve();
    await flush();
    expect(calls).toHaveLength(2);
    calls[1].resolve();
    await flush();

    const results = posted.filter((m) => m.type === 'result');
    expect(results.map((m) => [m.id, m.type === 'result' && m.words[0].text])).toEqual([
      [1, 'len10'],
      [2, 'len20'],
    ]);
    // No language given: detected from the audio instead of transformers.js silently defaulting to English.
    expect(transcriberOptions.map((o) => o.language)).toEqual(['japanese', 'japanese']);
    expect(results.every((m) => m.type === 'result' && m.language === 'japanese')).toBe(true);
  });
});
