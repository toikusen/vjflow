// The one cheap reading of a song's lyrics (claude-haiku-5-5, low effort): prompt, schema and call, shared by
// lineplan.mts (which caches it as <out>/meaning.json) and meaning-reread.mts (which re-asks without touching caches).
import Anthropic from '@anthropic-ai/sdk';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { momentsHelp, MOMENTS_SCHEMA } from '../../src/app/lyric-vj/signature-moments';
import { BACKGROUNDS, GROUND_HELP, Cue, Meaning, PALETTES } from './lineplan-core.mts';

export const READING_MODEL = 'claude-haiku-5-5';
/** USD per token for READING_MODEL (prompts under 100K tokens). */
export const READING_PRICE = { input: 0.1 / 1e6, output: 0.5 / 1e6 };

/** Loads ~/.config/vjflow/anthropic.env into process.env without overriding what is already set. */
export function loadAnthropicEnv(): void {
  const env = join(homedir(), '.config/vjflow/anthropic.env');
  for (const line of existsSync(env) ? readFileSync(env, 'utf8').split('\n') : []) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

/** A slow song (under 3 sung characters a second) gets the calm palette fallback and no busy backgrounds. */
export const isCalmSong = (cues: Cue[]): boolean => {
  const sungSec = cues.reduce((s, c) => s + Math.max(0, c.end - c.start), 0);
  return cues.reduce((s, c) => s + [...c.text.replace(/\s/g, '')].length, 0) / Math.max(1, sungSec) < 3;
};

/** The reading request for a song: the prompt text and its JSON schema (reading, palette, ground, parts, keys, moments). */
export function readingRequest(song: { title: string; cues: Cue[] }, calm = isCalmSong(song.cues)): { prompt: string; schema: object } {
  const cues = song.cues;
  const pool = [...new Set([...BACKGROUNDS[0], ...BACKGROUNDS[1], ...(calm ? [] : BACKGROUNDS[2])])];
  const HELP = readFileSync('src/app/lyric-vj/render/kinetic-more.ts', 'utf8');
  const helpOf = (fx: string) => GROUND_HELP[fx] ?? HELP.match(new RegExp(`\\b${fx}: \\{[^\\n]*?help: '([^']{0,40})`))?.[1] ?? fx;
  const schema = { type: 'object', additionalProperties: false, required: ['reading', 'palette', 'ground', 'parts', 'keys', 'moments'], properties: {
    reading: { type: 'string', description: '這首歌在說什麼、情緒怎麼走（一句，不超過 40 字）' },
    palette: { type: 'string', enum: Object.keys(PALETTES) },
    ground: { type: 'string', enum: ['flat', 'grain', 'gradient'] },
    parts: { type: 'array', description: '依序涵蓋整首的 4 到 10 段', items: { type: 'object', additionalProperties: false, required: ['from', 'tension', 'fx', 'what'], properties: {
      from: { type: 'string', description: '這段第一句的 id' }, tension: { type: 'number', description: '這段的情緒張力 0–1；副歌不一定最高，要看歌詞' },
      fx: { type: 'array', items: { type: 'string', enum: pool }, description: '這段的背景招式，三個，要符合這段的情緒和世界，不是逐詞配圖' }, what: { type: 'string', description: '這段的情緒（一句，引用一個歌詞裡的詞當根據）' },
    } } },
    moments: MOMENTS_SCHEMA,
    keys: { type: 'array', description: '值得強調的句子才列，可以很少', items: { type: 'object', additionalProperties: false, required: ['cue', 'phrase'], properties: { cue: { type: 'string' }, phrase: { type: 'string', description: '這句歌詞裡原樣出現的一段，2 到 6 個字' } } } },
  } };
  const prompt = `讀這首歌的歌詞，判斷每段的情緒，替歌詞動態影片選配色和背景。只判斷整段的情緒和重點，不要逐句圖解；比喻、反諷、否定句要照真正的意思理解。\n歌名：${song.title}\n歌詞：\n${cues.map((c) => `${c.id} ${c.text}`).join('\n')}\n\n配色：\n${Object.entries(PALETTES).map(([k, v]) => `${k}：${v.what}`).join('\n')}\n\n背景招式：\n${pool.map((x) => `${x}：${helpOf(x)}`).join('\n')}\n\n${momentsHelp()}`;
  return { prompt, schema };
}

/** Asks READING_MODEL once (low effort, structured output) and returns the raw reading with its usage and cost. */
export async function readMeaning(song: { title: string; cues: Cue[] }, calm?: boolean): Promise<{ meaning?: Meaning; usd: number; usage: { input: number; output: number }; stop: string | null }> {
  const { prompt, schema } = readingRequest(song, calm);
  const msg = await new Anthropic({ maxRetries: 2 }).messages.create({ model: READING_MODEL, max_tokens: 6000, messages: [{ role: 'user', content: prompt }], output_config: { effort: 'low', format: { type: 'json_schema', schema } } } as never) as Anthropic.Message;
  const text = msg.content.find((b) => b.type === 'text');
  const usage = { input: msg.usage.input_tokens, output: msg.usage.output_tokens };
  const usd = usage.input * READING_PRICE.input + usage.output * READING_PRICE.output;
  return { meaning: text && text.type === 'text' ? JSON.parse(text.text) : undefined, usd, usage, stop: msg.stop_reason };
}
