// Proofreading a song's lyrics: lyric sites are typed in by fans, and a homophone slip (大雪下得一瞬間 for 下的,
// 不再你身邊 for 不在) sings the same, so no aligner hears it. One model call flags the likely slips; each goes on its
// line as `proof` (with a review note, so the line shows yellow) for the user to accept or dismiss in the timing
// editor. Nothing is changed here: some odd spellings are the writer's own.
//
// npx tsx scripts/lyric-vj/proofread.mts --song out/db/<id>/song.json [--dry]
import Anthropic from '@anthropic-ai/sdk';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { LyricProof, proofNote } from '../../src/app/lyric-vj/timeline';

const { values: a } = parseArgs({ options: { song: { type: 'string' }, dry: { type: 'boolean', default: false }, model: { type: 'string', default: 'claude-opus-5-5' } } });
const env = join(homedir(), '.config/vjflow/anthropic.env');
for (const line of existsSync(env) ? readFileSync(env, 'utf8').split('\n') : []) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

type Cue = { id: string; text: string; review?: string[]; proof?: LyricProof[] };
type Flag = { id: string; wrong: string; right: string; why: string };
export { proofNote };

/** The flags placed on their lines: each found at its first place in the line's text, unplaceable ones dropped. */
export function placeFlags(cues: Cue[], flags: Flag[]): Cue[] {
  return cues.map((c) => {
    const proof = flags
      .filter((f) => f.id === c.id && f.wrong && f.wrong !== f.right)
      .flatMap((f) => {
        const at = [...c.text].join('').indexOf(f.wrong);
        return at < 0 ? [] : [{ at: [...c.text.slice(0, at)].length, wrong: f.wrong, right: f.right, why: f.why }];
      });
    const review = (c.review ?? []).filter((r) => !r.startsWith('疑似錯字：'));
    return { ...c, proof: proof.length ? proof : undefined, review: [...review, ...proof.map(proofNote)] };
  });
}

if (process.argv[1]?.endsWith('proofread.mts')) {
  const song = JSON.parse(readFileSync(a.song!, 'utf8')) as { title: string; cues: Cue[] };
  const prompt = `下面是〈${song.title}〉的歌詞，每行前面是行的 id。歌詞是網友打的，可能有同音或近音的錯字（例如「下得」打成應該是「下的」、「不再」應該是「不在」、「的/得/地」「在/再」「做/作」、日文的漢字變換錯誤）。
只找你很有把握是打錯的地方：唱起來一樣、但意思或文法明顯不對的字。歌手刻意的寫法、方言、口語、外語、押韻用的字、歌名本身的寫法都不要改。沒有就回空陣列。
wrong 抄下那一行裡打錯的那一小段（2–4 個字，要能在那行裡原樣找到），right 是改好的同一段，why 用一句台灣繁體中文說為什麼。

${song.cues.map((c) => `${c.id}｜${c.text}`).join('\n')}`;
  const SCHEMA = { type: 'object', additionalProperties: false, required: ['flags'], properties: { flags: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'wrong', 'right', 'why'], properties: { id: { type: 'string' }, wrong: { type: 'string' }, right: { type: 'string' }, why: { type: 'string' } } } } } };
  const msg = await new Anthropic({ maxRetries: 8 }).messages.stream({ model: a.model!, max_tokens: 8000, messages: [{ role: 'user', content: prompt }], output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } } } as Anthropic.Messages.MessageStreamParams).finalMessage();
  const flags = (JSON.parse(msg.content.find((b) => b.type === 'text')?.text ?? '{"flags":[]}') as { flags: Flag[] }).flags;
  const usd = (msg.usage.input_tokens * 4 + msg.usage.output_tokens * 20) / 1e6;
  const cues = placeFlags(song.cues, flags);
  const found = cues.flatMap((c) => (c.proof ?? []).map((p) => `${c.id} ${p.wrong}→${p.right}（${p.why}）`));
  console.log(`proofread: ${found.length} suspected typo${found.length === 1 ? '' : 's'}, $${usd.toFixed(3)}${found.length ? `\n  ${found.join('\n  ')}` : ''}`);
  if (!a.dry) writeFileSync(a.song!, JSON.stringify({ ...song, cues }, null, 1));
}
