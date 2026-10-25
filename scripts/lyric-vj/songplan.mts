// The whole song planned once, before any segment is drawn: its story, the people who carry it (drawn once, in the
// song's style, and shared by every segment), and the song cut into segments of one event each. Each segment is then
// made by codelayer.mts --states (scripts/lyric-vj/songrun.sh); merge.mts joins them.
// npx tsx scripts/lyric-vj/songplan.mts --song song.json --treatment treatment.json --sprites props/library --out <dir>
import Anthropic from '@anthropic-ai/sdk';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { LANGUAGES, LanguageId } from '../../src/app/lyric-vj/languages';

const { values: a } = parseArgs({ options: { song: { type: 'string' }, treatment: { type: 'string' }, sprites: { type: 'string' }, out: { type: 'string' }, model: { type: 'string', default: 'claude-opus-5-5' } } });
const env = join(homedir(), '.config/vjflow/anthropic.env');
for (const line of existsSync(env) ? readFileSync(env, 'utf8').split('\n') : []) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const out = a.out!;
mkdirSync(out, { recursive: true });
const song = JSON.parse(readFileSync(a.song!, 'utf8'));
const t = JSON.parse(readFileSync(a.treatment!, 'utf8'));
const lang = LANGUAGES[t.design?.language as LanguageId];
const client = new Anthropic({ maxRetries: 8 });
let usd = 0;
const cueText = (id: string) => song.cues.find((c: { id: string }) => c.id === id)?.text ?? '';
const shots = t.shots.map((s: { id: string; start: number; end: number }) => ({ id: s.id, from: +s.start.toFixed(1), to: +s.end.toFixed(1), lyrics: t.cues.filter((c: { shot: string }) => c.shot === s.id).map((c: { cueId: string }) => cueText(c.cueId)).join(' / ') }));

const propList = (JSON.parse(readFileSync(join(a.sprites!, 'library.json'), 'utf8')).sprites as { id: string; what: string }[]);
const PLAN = {
  type: 'object', additionalProperties: false, required: ['story', 'characters', 'props', 'segments'],
  properties: {
    story: { type: 'string', description: '整首的故事：誰、在哪、發生了什麼變化，從歌詞來，3–5 句繁體中文' },
    characters: { type: 'array', description: '1–2 個人物，整首共用', items: { type: 'object', additionalProperties: false, required: ['id', 'who', 'poses'], properties: {
      id: { type: 'string', description: '英文小寫，例 me、kimi' },
      who: { type: 'string', description: '英文：性別與年紀（例 a teenage boy）、髮型、髮色、服裝，和另一個人物的區別' },
      poses: { type: 'array', description: '3–4 個整首最常用的姿勢（停著的姿勢、背影、側臉、半身；不要走路或騎車的動作）', items: { type: 'object', additionalProperties: false, required: ['id', 'what'], properties: { id: { type: 'string', description: '例 me.back_bike' }, what: { type: 'string', description: '英文：姿勢、角度、取景' } } } },
    } } },
    props: { type: 'array', description: '道具庫裡故事真的需要的道具 id；人物姿勢已經畫了的東西（例如他身邊的腳踏車）不要選', items: { type: 'string', enum: propList.map((x) => x.id) } },
    segments: { type: 'array', description: '把全曲切成 8–12 段，依序、連續、蓋滿所有鏡頭；每段一個事件', items: { type: 'object', additionalProperties: false, required: ['first', 'last', 'event', 'reuse'], properties: {
      first: { type: 'string', description: '這段第一個鏡頭的 id' }, last: { type: 'string', description: '這段最後一個鏡頭的 id' },
      event: { type: 'string', description: '這段要演出的一個事件（歌詞講的事；沒有歌詞的段落是故事裡的過場），繁體中文一句' },
      reuse: { type: 'integer', description: '重複的副歌沿用前面第幾段（從 1 起算）的畫面，只換歌詞；兩段鏡頭數要一樣。不沿用填 0' },
    } } },
  },
};
type Plan = { story: string; props: string[]; characters: { id: string; who: string; poses: { id: string; what: string }[] }[]; segments: { first: string; last: string; event: string; reuse: number }[] };

async function ask<T>(messages: Anthropic.Messages.MessageParam[], schema: object): Promise<T> {
  const msg = await client.messages.stream({ model: a.model!, max_tokens: 32000, messages, output_config: { effort: 'high', format: { type: 'json_schema', schema } } } as Anthropic.Messages.MessageStreamParams).finalMessage();
  usd += (msg.usage.input_tokens * 4 + msg.usage.output_tokens * 20) / 1e6;
  messages.push({ role: 'assistant', content: msg.content as Anthropic.Messages.ContentBlockParam[] });
  return JSON.parse(msg.content.find((b) => b.type === 'text')?.text ?? '{}') as T;
}

/** Segments in order, contiguous, covering every shot exactly once. */
function planErrors(p: Plan): string[] {
  const ids: string[] = t.shots.map((s: { id: string }) => s.id);
  const errs: string[] = [];
  let next = 0;
  for (const [k, s] of p.segments.entries()) {
    const i = ids.indexOf(s.first), j = ids.indexOf(s.last);
    if (i !== next) errs.push(`第 ${k + 1} 段應該從 ${ids[next]} 開始（現在是 ${s.first}）`);
    if (j < i) errs.push(`第 ${k + 1} 段的 last ${s.last} 在 first 之前或不存在`);
    next = Math.max(next, j + 1);
    const src = p.segments[s.reuse - 1];
    if (s.reuse && (s.reuse > k || src.reuse || ids.indexOf(src.last) - ids.indexOf(src.first) !== j - i)) errs.push(`第 ${k + 1} 段的 reuse ${s.reuse} 不成立：要沿用的是前面、本身沒有沿用別段、鏡頭數一樣的段落，不然填 0`);
  }
  if (next !== ids.length) errs.push(`最後一段要結束在 ${ids[ids.length - 1]}`);
  if (p.segments.length < 6 || p.segments.length > 14) errs.push(`分成 8–12 段（現在 ${p.segments.length} 段）`);
  if (!p.characters.length || p.characters.some((c) => !/\b(boy|girl|man|woman)\b/i.test(c.who))) errs.push('每個人物的 who 都要寫清楚性別（boy／girl／man／woman）');
  return errs;
}

const messages: Anthropic.Messages.MessageParam[] = [{ role: 'user', content: `你是這首歌的歌詞 MV 導演。先為整首歌寫一個故事、決定撐起故事的人物（整首共用，會用這首歌的畫風畫出來），再把歌切成段，每段演一個事件（之後每段會單獨設計畫面）。
規則：故事從歌詞來；「誰」用人物演，不要用物件代替；人物之間外型要明顯不同（性別、髮型、服裝），主角的性別照歌詞（例如「僕」）；道具只選故事需要的，人物姿勢已經畫了的東西（腳踏車、照片）不要再選一個單獨的道具，同一樣東西出現兩次很突兀；姿勢都是停著的（背影、側臉、半身、坐著），不要走路或騎車的動作；每段一個事件，事件之間要有發展（不是每段都一樣），副歌回到同一個畫面是好的記憶點：重複的副歌如果情境相同、鏡頭數一樣，就用 reuse 沿用第一次的畫面（只換歌詞），每段重做都很花錢；故事在副歌有新的發展時才重做。
歌名：${song.title}
概念：${t.concept}
設計語言：${lang?.name ?? t.design?.language}
道具庫（id 說明）：
${propList.map((x) => `${x.id} ${x.what}`).join('\n')}
鏡頭（id、時間、歌詞）：
${shots.map((s: { id: string; from: number; to: number; lyrics: string }) => `${s.id} ${s.from}–${s.to}s ${s.lyrics || '（沒有歌詞）'}`).join('\n')}` }];
let plan = await ask<Plan>(messages, PLAN);
for (let k = 0; k < 2; k++) {
  const errs = planErrors(plan);
  if (!errs.length) break;
  console.log(`plan: ${errs.join(' | ')}`);
  messages.push({ role: 'user', content: `請修正後輸出完整的規劃：\n${errs.map((e) => `- ${e}`).join('\n')}` });
  plan = await ask<Plan>(messages, PLAN);
}
console.log(`story: ${plan.story}`);
console.log(`props: ${plan.props.join(' ')}`);
console.log(`segments: ${plan.segments.map((s) => `${s.first}-${s.last}${s.reuse ? ` (reuse ${s.reuse})` : ''} ${s.event}`).join(' | ')}`);

// the characters, one sheet each, in the song's style (a prop sheet of the song as the reference), checked once
const castDir = join(out, 'cast');
mkdirSync(castDir, { recursive: true });
const styleRef = readdirSync(join(a.sprites!, '..')).filter((f) => /^sheet.*\.jpg$/.test(f)).map((f) => join(a.sprites!, '..', f))[0];
const drawn: { id: string; w: number; h: number; what: string; file: string }[] = [];
for (const c of plan.characters.slice(0, 2)) {
  const poses = c.poses.slice(0, 4);
  const instr = join(castDir, `instruction_${c.id}.txt`);
  writeFileSync(instr, `CHARACTER SHEET for a music video. The reference image is a prop sheet of this video: draw the character below in exactly its drawing style, inks, halftone and grain, so they belong to the same print.
Draw the same character in ${poses.length} poses, each one separate, in a ${poses.length} columns x 1 row grid, all at the same scale, with generous empty space around every pose, on a perfectly flat chroma-key green background #00B140 (no gradient, no floor, no cast shadows, no borders, no extra objects). Every pose is an isolated cut-out figure: never paint a scene, sky, ground, water or panel behind it (things the character touches, like a bicycle or a railing, are drawn, nothing else). Do not use any green close to #00B140 in the drawing.
The character is designed, not generic: clear silhouette, simple confident shapes, a face drawn with few strokes (no realistic rendering, no glossy anime shading), identical face, hair and clothes in every pose.
Absolutely no text, letters, numbers or labels anywhere.`);
  const dirs = join(castDir, `dirs_${c.id}.json`);
  writeFileSync(dirs, JSON.stringify([{ id: c.id, prompt: `The character: ${c.who}. Poses: ${poses.map((p, i) => `${i + 1} ${p.what}`).join('; ')}` }]));
  execFileSync('npx', ['tsx', 'scripts/lyric-vj/character.mts', '--ref', styleRef, '--directions', dirs, '--instruction', instr, '--out', castDir], { stdio: ['ignore', 'ignore', 'inherit'] });
  usd += 0.101;
  const keyed = join(castDir, c.id);
  execFileSync('uv', ['run', '-q', '--with', 'numpy', '--with', 'pillow', '--with', 'scipy', 'python', 'scripts/lyric-vj/key_sprites.py', join(castDir, `${c.id}.jpg`), keyed, '--min', '0.003'], { stdio: ['ignore', 'ignore', 'inherit'] });
  const frames = JSON.parse(readFileSync(join(keyed, 'frames.json'), 'utf8')).frames as { file: string; w: number; h: number; x?: number; sheetIndex: number }[];
  const big = [...frames].sort((x, y) => y.w * y.h - x.w * x.h).slice(0, poses.length).sort((x, y) => (x.x ?? x.sheetIndex) - (y.x ?? y.sheetIndex));
  big.forEach((fr, i) => drawn.push({ id: poses[i].id, w: fr.w, h: fr.h, what: `${c.who}; ${poses[i].what}`, file: resolve(keyed, fr.file) }));
  if (big.length < poses.length) console.log(`cast ${c.id}: ${big.length} of ${poses.length} poses came out`);
}

// the song's library: its props plus the characters, with a labelled overview for the segment directors
const lib = join(out, 'library');
mkdirSync(lib, { recursive: true });
const props = JSON.parse(readFileSync(join(a.sprites!, 'library.json'), 'utf8'));
const assets = JSON.parse(readFileSync(join(a.sprites!, 'assets.json'), 'utf8'));
for (const d of drawn) {
  copyFileSync(d.file, join(lib, `${d.id}.png`));
  assets[`spr:${d.id}`] = { kind: 'image', url: resolve(lib, `${d.id}.png`) };
}
const sprites = [...props.sprites.filter((x: { id: string }) => plan.props.includes(x.id)), ...drawn.map(({ id, w, h, what }) => ({ id, w, h, what }))];
writeFileSync(join(lib, 'library.json'), JSON.stringify({ ...props, sprites }, null, 1));
writeFileSync(join(lib, 'assets.json'), JSON.stringify(assets, null, 1));
const files = sprites.map((x: { id: string }) => [x.id, (assets[`spr:${x.id}`] as { url: string }).url]);
writeFileSync(join(lib, 'contact.list.json'), JSON.stringify(files));
execFileSync('uv', ['run', '-q', '--with', 'pillow', 'python', '-c', `
import json,sys
from PIL import Image, ImageDraw
items=json.load(open(sys.argv[1])); cell=260; cols=8; rows=(len(items)+cols-1)//cols
sheet=Image.new('RGB',(cols*cell,rows*(cell+28)),(245,239,228)); d=ImageDraw.Draw(sheet)
for k,(i,f) in enumerate(items):
  im=Image.open(f).convert('RGBA'); im.thumbnail((cell-16,cell-16)); x=(k%cols)*cell; y=(k//cols)*(cell+28)
  sheet.paste(im,(x+(cell-im.width)//2,y+(cell-im.height)//2),im); d.text((x+6,y+cell+4),i,fill=(40,40,60))
sheet.save(sys.argv[2],quality=85)`, join(lib, 'contact.list.json'), join(lib, 'contact.jpg')]);
// the characters together: the reference every segment's extra drawings keep these people identical to
execFileSync('ffmpeg', ['-v', 'error', '-y', ...plan.characters.slice(0, 2).flatMap((c) => ['-i', join(castDir, `${c.id}.jpg`)]), '-filter_complex', plan.characters.length > 1 ? 'vstack=2' : 'null', '-q:v', '3', join(out, 'cast_ref.jpg')]);
writeFileSync(join(out, 'plan.json'), JSON.stringify({ ...plan, costUSD: +usd.toFixed(3) }, null, 1));
console.log(`plan done: ${plan.segments.length} segments, ${drawn.length} poses, $${usd.toFixed(3)}`);
