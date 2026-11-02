// The line composer: a song's whole plan with no director. One cheap reading of the lyrics (or none), then rules.
// npx tsx scripts/lyric-vj/lineplan.mts --song song.json --base base-treatment.json --out <dir> [--no-reading]
// then: npx tsx scripts/lyric-vj/typeplan.mts --song song.json --treatment <dir>/base.json --plan <dir>/plan.json --palette "$(cat <dir>/palette)" --out <dir>/final
import Anthropic from '@anthropic-ai/sdk';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { BACKGROUNDS, composePlan, GROUND_HELP, composerBase, Cue, fallbackParts, Meaning, PALETTES } from './lineplan-core.mts';

const { values: a } = parseArgs({ options: { song: { type: 'string' }, base: { type: 'string' }, out: { type: 'string' }, 'no-reading': { type: 'boolean', default: false } } });
const env = join(homedir(), '.config/vjflow/anthropic.env');
for (const line of existsSync(env) ? readFileSync(env, 'utf8').split('\n') : []) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const out = a.out!;
mkdirSync(out, { recursive: true });
const song = JSON.parse(readFileSync(a.song!, 'utf8'));
const cues = song.cues as Cue[];
const sungSec = cues.reduce((s, c) => s + Math.max(0, c.end - c.start), 0);
const perSec = cues.reduce((s, c) => s + [...c.text.replace(/\s/g, '')].length, 0) / Math.max(1, sungSec);
const calm = perSec < 3;
const pool = [...new Set([...BACKGROUNDS[0], ...BACKGROUNDS[1], ...(calm ? [] : BACKGROUNDS[2])])];
const HELP = readFileSync('src/app/lyric-vj/render/kinetic-more.ts', 'utf8');
const helpOf = (fx: string) => GROUND_HELP[fx] ?? HELP.match(new RegExp(`\\b${fx}: \\{[^\\n]*?help: '([^']{0,40})`))?.[1] ?? fx;
const SCHEMA = { type: 'object', additionalProperties: false, required: ['reading', 'palette', 'ground', 'parts', 'keys'], properties: {
  reading: { type: 'string', description: '這首歌在說什麼、情緒怎麼走（一句，不超過 40 字）' },
  palette: { type: 'string', enum: Object.keys(PALETTES) },
  ground: { type: 'string', enum: ['flat', 'grain', 'gradient'] },
  parts: { type: 'array', description: '依序涵蓋整首的 4 到 10 段', items: { type: 'object', additionalProperties: false, required: ['from', 'tension', 'fx', 'what'], properties: {
    from: { type: 'string', description: '這段第一句的 id' }, tension: { type: 'number', description: '這段的情緒張力 0–1；副歌不一定最高，要看歌詞' },
    fx: { type: 'array', items: { type: 'string', enum: pool }, description: '這段的背景招式，三個，要符合這段的情緒和世界，不是逐詞配圖' }, what: { type: 'string', description: '這段的情緒（一句，引用一個歌詞裡的詞當根據）' },
  } } },
  keys: { type: 'array', description: '值得強調的句子才列，可以很少', items: { type: 'object', additionalProperties: false, required: ['cue', 'phrase'], properties: { cue: { type: 'string' }, phrase: { type: 'string', description: '這句歌詞裡原樣出現的一段，2 到 6 個字' } } } },
} };
const read = async (): Promise<{ meaning?: Meaning; usd: number }> => {
  if (a['no-reading']) return { usd: 0 };
  const prompt = `讀這首歌的歌詞，判斷每段的情緒，替歌詞動態影片選配色和背景。只判斷整段的情緒和重點，不要逐句圖解；比喻、反諷、否定句要照真正的意思理解。\n歌名：${song.title}\n歌詞：\n${cues.map((c) => `${c.id} ${c.text}`).join('\n')}\n\n配色：\n${Object.entries(PALETTES).map(([k, v]) => `${k}：${v.what}`).join('\n')}\n\n背景招式：\n${pool.map((x) => `${x}：${helpOf(x)}`).join('\n')}`;
  const msg = await new Anthropic({ maxRetries: 2 }).messages.create({ model: 'claude-haiku-5-5', max_tokens: 6000, messages: [{ role: 'user', content: prompt }], output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } } } as never) as Anthropic.Message;
  const text = msg.content.find((b) => b.type === 'text');
  const usd = (msg.usage.input_tokens * 0.1 + msg.usage.output_tokens * 0.5) / 1e6;
  return { meaning: text && text.type === 'text' ? JSON.parse(text.text) : undefined, usd };
};
/** Only what the song really has survives: known lines, phrases actually sung, moves on offer, parts in order. */
const valid = (m: Meaning | undefined): Meaning | undefined => {
  if (!m || !PALETTES[m.palette]) return undefined;
  const at = (id: string) => cues.findIndex((c) => c.id === id);
  const parts = m.parts.filter((p) => at(p.from) >= 0).sort((x, y) => at(x.from) - at(y.from)).map((p) => ({ ...p, tension: Math.min(1, Math.max(0, p.tension)), fx: p.fx }));
  if (!parts.length) return undefined;
  parts[0].from = cues[0].id;
  return { ...m, parts, keys: m.keys.filter((k) => cues.find((c) => c.id === k.cue)?.text.includes(k.phrase)) };
};
let got: { meaning?: Meaning; usd: number } = { usd: 0 };
const cached = join(out, 'meaning.json');
if (existsSync(cached)) got.meaning = JSON.parse(readFileSync(cached, 'utf8'));
else try { got = await read(); } catch (e) { console.log(`reading failed, rules only: ${e}`); }
const meaning = valid(got.meaning) ?? { palette: calm ? 'frost' : 'tea', ground: 'grain', reading: '', parts: fallbackParts(cues, song.sections ?? [], calm), keys: [] };
if (!existsSync(cached)) writeFileSync(cached, JSON.stringify(meaning, null, 1));
const { plan, shots } = composePlan(song, meaning, calm);
const base = JSON.parse(readFileSync(a.base!, 'utf8'));
const p = PALETTES[meaning.palette];
const baseOut = composerBase(base, plan, shots, p);
writeFileSync(join(out, 'base.json'), JSON.stringify(baseOut));
writeFileSync(join(out, 'plan.json'), JSON.stringify(plan, null, 1));
writeFileSync(join(out, 'palette'), [p.ink, p.paper, p.accent, p.heart].join(','));
console.log(`lineplan: ${shots.length} shots, ${plan.shots.flatMap((s) => s.cuts).length} cuts, palette ${meaning.palette}, parts ${meaning.parts.length}, reading $${got.usd.toFixed(4)}\n${meaning.reading}`);
