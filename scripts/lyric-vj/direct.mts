// Director: Claude writes a treatment v3 for a window of the song; the program validates it and feeds errors back.
// npx tsx --tsconfig tsconfig.json scripts/lyric-vj/direct.mts --song out/indigo/song.json --start 68.6 --end 89.2 \
//   --style "..." --db ~/vjanalytics/out/results --out out/indigo/director
import Anthropic from '@anthropic-ai/sdk';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { TEMPLATES } from '../../src/app/lyric-vj/templates';
import { SongTimeline } from '../../src/app/lyric-vj/timeline';
import { CAMERAS, cuesIn, EMPHASIS_METHODS, ENTER_KINDS, EXIT_KINDS, TRANSITIONS, ParamValue, TreatmentV3, validateTreatment } from '../../src/app/lyric-vj/treatment';
import { checkStyle, STYLES } from '../../src/app/lyric-vj/styles';
import { sceneCount, Tier, TIERS } from '../../src/app/lyric-vj/tiers';
import { phraseBoundaries, phrases } from '../../src/app/lyric-vj/phrases';
import { loadDb, references } from './references.mts';

const { values: a } = parseArgs({
  options: {
    song: { type: 'string' }, start: { type: 'string' }, end: { type: 'string' }, style: { type: 'string', default: '' },
    db: { type: 'string' }, out: { type: 'string' }, model: { type: 'string', default: 'claude-opus-5-5' },
    'style-id': { type: 'string', default: 'emotional' }, tier: { type: 'string', default: 'standard' },
  },
});
const env = join(homedir(), '.config/vjflow/anthropic.env');
if (!process.env['ANTHROPIC_API_KEY'] && existsSync(env)) {
  for (const line of readFileSync(env, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].trim();
  }
}
const PRICES: Record<string, [number, number]> = { 'claude-opus-5-5': [4, 20], 'claude-fable-5-1': [10, 50] };
const song: SongTimeline = JSON.parse(readFileSync(a.song!, 'utf8'));
const win = { start: Number(a.start), end: Number(a.end) };
const out = a.out!;
mkdirSync(out, { recursive: true });

// ---- schema (structured output): only vocabulary the engine has
// params are a list of {key, value} pairs: one optional field per template parameter would exceed the API's limit
// on optional schema fields; values arrive as strings and are coerced back (the validator checks them per template)
const paramKeys = [...new Set(Object.values(TEMPLATES).flatMap((t) => Object.keys(t.params)))];
const coerce = (v: string): ParamValue => (v === 'true' ? true : v === 'false' ? false : /^-?\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : v);
const str = { type: 'string' };
const SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['concept', 'styleAnchor', 'assets', 'shots', 'cues'],
  properties: {
    concept: { type: 'string', description: '繁體中文，一兩句：這段畫面的視覺故事' },
    styleAnchor: {
      type: 'object', additionalProperties: false, required: ['prompt', 'palette'],
      properties: {
        prompt: { type: 'string', description: 'English image-generation style prompt shared by every asset. Must say: no text, no letters, no logos.' },
        palette: { type: 'object', additionalProperties: false, required: ['background', 'text', 'accent', 'line', 'glow'],
          properties: Object.fromEntries(['background', 'text', 'accent', 'line', 'glow'].map((k) => [k, { type: 'string', description: '#rrggbb' }])) },
      },
    },
    assets: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'kind', 'prompt'],
      properties: { id: str, kind: { type: 'string', enum: ['image', 'video'] }, prompt: { type: 'string', description: 'English. Scene only, never any text.' },
        from: { type: 'string', description: 'video: id of the image used as its first frame' }, layering: { type: 'string', enum: ['single'] } } } },
    shots: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'start', 'end', 'template', 'params', 'camera', 'transitionIn'],
      properties: { id: str, start: { type: 'number' }, end: { type: 'number' }, template: { type: 'string', enum: Object.keys(TEMPLATES) },
        params: { type: 'array', description: '只列要改變預設值的參數', items: { type: 'object', additionalProperties: false, required: ['key', 'value'],
          properties: { key: { type: 'string', enum: paramKeys }, value: { type: 'string', description: '數字、true/false 或選項名稱' } } } },
        asset: str,
        camera: { type: 'string', enum: CAMERAS }, transitionIn: { type: 'string', enum: TRANSITIONS } } } },
    cues: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['cueId', 'shot', 'enter', 'exit'],
      properties: { cueId: str, shot: str, rows: { type: 'array', items: { type: 'integer' } },
        emphasis: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['from', 'to', 'method'],
          properties: { from: { type: 'integer' }, to: { type: 'integer' }, method: { type: 'string', enum: EMPHASIS_METHODS } } } },
        accents: { type: 'array', items: { type: 'integer' } },
        enter: { type: 'string', enum: ENTER_KINDS }, exit: { type: 'string', enum: EXIT_KINDS } } } },
  },
};

// ---- prompt
const cues = cuesIn(song, win);
const beatsIn = (s: number, e: number) => song.beats.filter((b) => b >= s && b < e);
const cueLines = cues.map((c) => {
  const chars = [...c.text].map((ch, i) => `${i}:${ch}`).join(' ');
  const b = [...phraseBoundaries(c.text)].sort((x, y) => x - y).join(',');
  return `${c.id}｜${c.start.toFixed(2)}–${c.end.toFixed(2)}s｜拍數 ${beatsIn(c.start, c.end).length}｜時間可信度 ${c.confidence}｜「${c.text}」\n    字元索引：${chars}\n    詞：${phrases(c.text).join('／')}（強調與換行只能落在 ${b}）`;
}).join('\n');
const catalog = Object.values(TEMPLATES).map((t) =>
  `- ${t.id}：${t.description}\n  參數：${Object.entries(t.params).map(([k, p]) => `${k}（${p.description}；${p.type === 'number' ? `${p.min}–${p.max}` : p.type === 'enum' ? p.values.join('/') : 'true/false'}，預設 ${p.default}）`).join('；')}`).join('\n');
const sections = song.sections.filter((s) => s.end > win.start && s.start < win.end).map((s) => `${s.start.toFixed(1)}–${s.end.toFixed(1)}s ${s.type ?? ''} 能量 ${s.energy.toFixed(2)}`).join('\n');
const db = a.db ? references(loadDb(a.db), a.style + cues.map((c) => c.text).join('')) : { text: '（無）', ids: [] };

const style = STYLES[a['style-id']!];
if (!style) throw new Error(`未知風格 ${a['style-id']}`);
const tier = a.tier as Tier;
if (!TIERS[tier]) throw new Error(`未知版本 ${a.tier}（still | standard | rich）`);
const scenes = sceneCount(tier, win);
const SYSTEM = `你是日本地下偶像 Live House 的歌詞 VJ 導演兼動態設計師。你為一段歌曲寫「企劃 v3」JSON，引擎會照著逐格渲染。
這次的風格是「${style.name}」：${style.description}

風格規則（必須遵守）：
${style.rules.map((r) => `- ${r}`).join('\n')}

版本「${TIERS[tier].name}」的素材規則（必須遵守）：
- ${TIERS[tier].rule}

一般原則：
- 歌詞文字與時間由程式擁有，你只決定呈現方式；cueId 必須來自清單。
- 鏡頭邊界放在某句歌詞開始或強拍上；鏡頭必須連續覆蓋整個範圍 ${win.start}–${win.end} 秒。可用的模板只有：${style.templates.join('、')}。
- 強調範圍用字元索引 [from, to)，選真正的關鍵字，而且必須是完整的詞，不可把一個詞切開（切開的會被自動擴展）；短句（12 字以內）不要換行；踩拍 accents 是該句開始後第幾拍（0 起算，必須小於該句拍數），挑重拍、不要每拍都踩。
- 時間可信度為 interpolated 的句子不要踩拍、用 fade。
- 素材描述用英文，畫面不可有任何文字。這個範圍${TIERS[tier].video ? `要 ${tier === 'rich' ? Math.ceil(scenes * 0.6) : 1}–${scenes} 組素材（每組 1 image + 1 video）` : `要 1–${scenes} 張 image，不要 video`}。`;

const expectShots = Math.round((win.end - win.start) / ((style.shotSec[0] + style.shotSec[1]) / 2));
const USER = `【輸出要求】shots 大約 ${expectShots} 個（每個 ${style.shotSec[0]}–${style.shotSec[1]} 秒，連續覆蓋整個範圍）；cues 必須包含下列全部 ${cues.length} 句。\n\n【這首歌的補充說明】\n${a.style}\n\n【範圍】${win.start}–${win.end} 秒；BPM 約 ${song.tempo.toFixed(0)}\n【段落】\n${sections}\n【強拍】${song.downbeats.filter((b) => b >= win.start && b < win.end).map((b) => b.toFixed(2)).join(' ')}\n\n【歌詞】\n${cueLines}\n\n【模板】\n${catalog}\n\n【VJ 資料庫參考】（50 支歌詞 VJ 的分析，是觀察與推測，不是規則）\n${db.text}`;
writeFileSync(join(out, 'prompt.txt'), SYSTEM + '\n\n' + USER);

const client = new Anthropic();
const messages: Anthropic.Beta.Messages.BetaMessageParam[] = [{ role: 'user', content: USER }];
let usage = { input: 0, output: 0 };
const began = Date.now();
let result: ReturnType<typeof validateTreatment> | undefined;
for (let attempt = 0; attempt < 3; attempt++) {
  const message = await client.beta.messages
    .stream({
      model: a.model!, max_tokens: 64000, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
      output_config: { effort: 'high', format: { type: 'json_schema', schema: SCHEMA } },
      system: SYSTEM, messages,
    } as Anthropic.Beta.Messages.MessageStreamParams)
    .finalMessage();
  usage = { input: usage.input + message.usage.input_tokens, output: usage.output + message.usage.output_tokens };
  if (message.stop_reason === 'refusal') throw new Error(`Refused: ${JSON.stringify(message.stop_details)}`);
  if (message.stop_reason === 'max_tokens') throw new Error('Output was cut off at max_tokens');
  const text = message.content.find((b) => b.type === 'text')?.text;
  if (!text) throw new Error(`No text in response (stop_reason ${message.stop_reason})`);
  const draft = JSON.parse(text) as TreatmentV3;
  for (const sh of draft.shots) {
    const pairs = sh.params as unknown as { key: string; value: string }[];
    sh.params = Object.fromEntries(pairs.map((x) => [x.key, coerce(x.value)]));
  }
  writeFileSync(join(out, `draft_${attempt}.json`), JSON.stringify(draft, null, 1));
  result = validateTreatment(draft, song, win, TEMPLATES);
  // a short answer that leaves lines unstyled must be sent back, not silently filled with defaults
  const styled = new Set(draft.cues.map((c) => c.cueId));
  const missing = cues.filter((c) => !styled.has(c.id)).map((c) => c.id);
  if (missing.length) result.errors.push(`這些歌詞沒有樣式，每一句都必須在 cues 裡：${missing.join(', ')}`);
  result.errors.push(...checkStyle(result.treatment, style, song, win, tier));
  console.log(`attempt ${attempt}: ${result.errors.length} errors, ${result.fixes.length} fixes`);
  if (!result.errors.length) break;
  messages.push({ role: 'assistant', content: message.content as Anthropic.Beta.Messages.BetaContentBlockParam[] });
  messages.push({ role: 'user', content: `程式驗證未通過，請修正後輸出完整的企劃 JSON：\n${result.errors.map((e) => `- ${e}`).join('\n')}` });
}
if (!result || result.errors.length) throw new Error('導演 3 次仍未通過驗證：\n' + result?.errors.join('\n'));
writeFileSync(join(out, 'treatment.json'), JSON.stringify(result.treatment, null, 1));
const [pin, pout] = PRICES[a.model!] ?? [NaN, NaN];
const report = { model: a.model, seconds: Math.round((Date.now() - began) / 1000), ...usage, costUSD: +((usage.input * pin + usage.output * pout) / 1e6).toFixed(3), references: db.ids, fixes: result.fixes };
writeFileSync(join(out, 'director.json'), JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));
