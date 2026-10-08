// A song's prop library: the
// director lists the concrete things its scenes need, the image model draws them as green-screen sheets in the song's
// palette (the first sheet anchors the style of the rest), they are keyed and split, and the director names what came
// out and drops the misdrawn ones. Writes <out>/library (sprite_library.py: library.json, assets.json, contact.jpg).
// npx tsx scripts/lyric-vj/props.mts --song song.json --treatment treatment.json --out <dir>/props
import Anthropic from '@anthropic-ai/sdk';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { LANGUAGES, LanguageId } from '../../src/app/lyric-vj/languages';

const { values: a } = parseArgs({ options: { song: { type: 'string' }, treatment: { type: 'string' }, out: { type: 'string' }, model: { type: 'string', default: 'claude-opus-5-5' } } });
const env = join(homedir(), '.config/vjflow/anthropic.env');
for (const line of existsSync(env) ? readFileSync(env, 'utf8').split('\n') : []) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const out = a.out!;
mkdirSync(out, { recursive: true });
const song = JSON.parse(readFileSync(a.song!, 'utf8'));
const t = JSON.parse(readFileSync(a.treatment!, 'utf8'));
// overloaded (529) and rate limits: the SDK retries with backoff; a long design run should ride them out
const client = new Anthropic({ maxRetries: 8 });
const usage = { input: 0, output: 0, images: 0 };

// the song's palette: its colour script, plus cream and ink for faces and details
const palette = [...new Set([...(t.design?.colorScript ?? []).flatMap((c: { shadow: string; highlight: string; accent: string }) => [c.shadow, c.highlight, c.accent]), '#FFF8EC', '#1B1B22'].map((x: string) => x.toUpperCase()))].slice(0, 14);

async function ask<T>(content: Anthropic.Messages.MessageParam['content'], schema: object, effort = 'medium'): Promise<T> {
  const msg = await client.messages
    .stream({ model: a.model!, max_tokens: 16000, messages: [{ role: 'user', content }], output_config: { effort, format: { type: 'json_schema', schema } } } as Anthropic.Messages.MessageStreamParams)
    .finalMessage();
  usage.input += msg.usage.input_tokens;
  usage.output += msg.usage.output_tokens;
  return JSON.parse(msg.content.find((b) => b.type === 'text')?.text ?? '{}');
}

// 1. what the scenes need
type Plan = { sheets: { id: string; items: { id: string; what: string }[] }[] };
const plan = await ask<Plan>(`你是這支歌詞 MV 的美術指導。背景、天空、地面、雲、光、幾何造型由程式畫；「具體的東西」（動物、食物、交通工具、招牌、道具、小物）由生圖模型設計成素材，程式再讓它們在鏡頭裡演出。列出這首歌的場景需要的具體物件，分成 3–4 張素材表，每張 8 個。
規則：只列歌詞或概念裡真的會出現、能讓觀眾一眼認出的東西；不要人物或擬人角色（少量動作格的角色動畫看起來單調）；動物可以給同一種的不同姿勢或花色；不要程式就能畫好的東西（太陽、彩虹、星星、雲、房子剪影、圖樣）；每個物件是單獨一個、完整入框；id 用英文小寫加點（例如 cat.white_sit），what 用英文寫給生圖模型的具體描述（形狀、顏色、姿勢），不要寫文字或字母在物件上。
這首歌：${song.title}
概念：${t.concept}
設計語言：${t.design?.language}
歌詞：
${song.cues.map((c: { text: string }) => c.text).join('\n')}`, {
  type: 'object', additionalProperties: false, required: ['sheets'],
  properties: { sheets: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'items'], properties: { id: { type: 'string' }, items: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'what'], properties: { id: { type: 'string' }, what: { type: 'string' } } } } } } } },
});
writeFileSync(join(out, 'plan.json'), JSON.stringify(plan, null, 1));
console.log(`props: ${plan.sheets.map((s) => `${s.id}(${s.items.length})`).join(', ')}`);

// 2. the sheets: the first sets the style, the rest draw with it as reference
const instruction = join(out, 'instruction.txt');
writeFileSync(instruction, `PROP SHEET for a music video.${'{REF}'}
Draw the items listed below, each one separate, in a 4 columns x 2 rows grid with generous empty space around every item, on a perfectly flat chroma-key green background #00B140 (no gradient, no floor, no cast or ground shadows, no grid lines, no borders).
Style rules for every item: flat vector shapes only, each area one solid fill, exactly one hard-edged darker shadow tone per colour, simple rounded construction like Japanese character goods, NO outlines or black edges, no gradients, no airbrush, no glow, no glossy highlights, no texture; colours only from: ${palette.join(', ')}. Do not use any green close to #00B140.
Absolutely no text, letters, numbers or labels anywhere.`);
const sheetFile = (id: string) => join(out, `${id}.jpg`);
// the first sheet takes the video's style from words (a frame of the video as reference made the image model edit that
// frame instead of drawing a sheet); the later sheets take the first one as their reference
const lang = t.design?.language ? LANGUAGES[t.design.language as LanguageId] : undefined;
const styleNote = lang ? ` Art direction of this video: ${lang.name} — ${lang.essence} Colour: ${lang.colour}` : '';
for (const [k, sheet] of plan.sheets.entries()) {
  const dirs = join(out, `dirs_${sheet.id}.json`);
  writeFileSync(dirs, JSON.stringify([{ id: sheet.id, prompt: sheet.items.map((x, i) => `${i + 1} ${x.what}`).join('; ') }]));
  const ref = k ? sheetFile(plan.sheets[0].id) : undefined;
  const instr = join(out, `instruction_${k ? 'ref' : 'first'}.txt`);
  const refNote = k ? ' The reference image is the first prop sheet of this video: draw a NEW sheet of different items, matching its drawing style, proportions and shading exactly.' : styleNote;
  writeFileSync(instr, readFileSync(instruction, 'utf8').replace('{REF}', refNote));
  execFileSync('npx', ['tsx', 'scripts/lyric-vj/character.mts', ...(ref ? ['--ref', ref] : []), '--directions', dirs, '--instruction', instr, '--out', out], { stdio: ['ignore', 'ignore', 'inherit'] });
  if (!existsSync(sheetFile(sheet.id))) throw new Error(`素材表 ${sheet.id} 沒有產出`);
  usage.images++;
}

// 3. keyed and split; 4. the director names what came out, keeps the good ones
const names: Record<string, Record<string, [string, string]>> = {};
for (const sheet of plan.sheets) {
  const dir = join(out, sheet.id);
  execFileSync('uv', ['run', '-q', '--with', 'numpy', '--with', 'pillow', '--with', 'scipy', 'python', 'scripts/lyric-vj/key_sprites.py', sheetFile(sheet.id), dir, '--min', '0.003'], { stdio: ['ignore', 'ignore', 'inherit'] });
  const frames: { file: string }[] = JSON.parse(readFileSync(join(dir, 'frames.json'), 'utf8')).frames;
  // a numbered contact sheet of what was cut out
  const numbered = join(out, `numbered_${sheet.id}.json`);
  writeFileSync(numbered, JSON.stringify({ [dir]: Object.fromEntries(frames.map((_, i) => [String(i), [String(i), '']])) }));
  execFileSync('uv', ['run', '-q', '--with', 'pillow', 'python', 'scripts/lyric-vj/sprite_library.py', numbered, join(out, `numbered_${sheet.id}`)], { stdio: 'ignore' });
  const look = readFileSync(join(out, `numbered_${sheet.id}`, 'contact.jpg')).toString('base64');
  const named = await ask<{ frames: { n: number; keep: boolean; id: string; what: string }[] }>([
    { type: 'text', text: `這張是去背後切出來的素材，每張下面的數字是編號。原本要求畫的是：\n${sheet.items.map((x) => `${x.id}: ${x.what}`).join('\n')}\n逐一判斷每個編號：是不是完整、畫對、可以用的物件（畫壞的、多出來的怪東西、殘缺、黏到雜訊的 keep=false），可以用的給 id（盡量用上面的 id；同一種的其他姿勢加後綴，id 不能重複）和一句中文說明（是什麼、姿勢或方向）。` },
    { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: look } },
  ], {
    type: 'object', additionalProperties: false, required: ['frames'],
    properties: { frames: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['n', 'keep', 'id', 'what'], properties: { n: { type: 'integer' }, keep: { type: 'boolean' }, id: { type: 'string' }, what: { type: 'string' } } } } },
  });
  const used = new Set(Object.values(names).flatMap((x) => Object.values(x).map(([id]) => id)));
  names[dir] = Object.fromEntries(named.frames.filter((f) => f.keep && f.n >= 0 && f.n < frames.length && !used.has(f.id) && /^[a-z0-9._-]+$/.test(f.id)).map((f) => (used.add(f.id), [String(f.n), [f.id, f.what]])));
}
writeFileSync(join(out, 'names.json'), JSON.stringify(names, null, 1));
if (!Object.values(names).some((x) => Object.keys(x).length)) throw new Error('素材表裡沒有可用的物件');
execFileSync('uv', ['run', '-q', '--with', 'pillow', 'python', 'scripts/lyric-vj/sprite_library.py', join(out, 'names.json'), join(out, 'library')], { stdio: ['ignore', 'inherit', 'inherit'] });
const usd = (usage.input * 4 + usage.output * 20) / 1e6 + usage.images * 0.101;
writeFileSync(join(out, 'props.json'), JSON.stringify({ sheets: plan.sheets.length, sprites: Object.values(names).reduce((s, x) => s + Object.keys(x).length, 0), ...usage, costUSD: +usd.toFixed(3) }, null, 1));
console.log(`props done: $${usd.toFixed(3)}`);
