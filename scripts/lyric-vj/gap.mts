// Gap analysis: our lyric VJ next to the designer-made VJ of the same song (frames at the same moments + a motion
// strip around the first drop), scored by Claude per dimension with concrete gaps and techniques to adopt.
// npx tsx scripts/lyric-vj/gap.mts --plan out/gap/plan.json --out out/gap
import Anthropic from '@anthropic-ai/sdk';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

const { values: a } = parseArgs({
  options: {
    plan: { type: 'string' },
    out: { type: 'string' },
    model: { type: 'string', default: 'claude-opus-5-5' },
  },
});
const env = join(homedir(), '.config/vjflow/anthropic.env');
if (!process.env['ANTHROPIC_API_KEY'] && existsSync(env))
  for (const line of readFileSync(env, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].trim();
  }

export const DIMENSIONS = {
  typography: '字體設計：字型選擇與搭配、字重、字距、排版層級、字與畫面的整合',
  kinetic: '文字動態：進出場、逐字／逐詞節奏、與歌聲和節拍的同步、變化量',
  layout: '構圖與版面：留白、視覺重心、每個畫面的設計感、版面多樣性',
  graphics: '設計元素：線條、圖形、框、紋理、主題物件（motif）等非文字的動態圖形',
  color: '配色與調色：色彩計畫、對比、與歌曲情緒的對應、各段落的色彩變化',
  concept: '概念一致性：是否有貫穿整首的視覺概念與主題，和歌詞、曲風的契合度',
  peaks: '起伏與爆點：副歌、落ちサビ等段落的轉場與高潮處理',
  craft: '整體完成度與「不像 AI」：細節、精緻度，是否有 AI 生成感',
} as const;
type Dim = keyof typeof DIMENSIONS;

const scorePair = { type: 'object', additionalProperties: false, required: ['designer', 'ours', 'gap'], properties: { designer: { type: 'integer' }, ours: { type: 'integer' }, gap: { type: 'string', description: '具體差距（繁體中文）' } } };
const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['designerConcept', 'scores', 'techniques', 'aiFeel', 'oursStrengths', 'overallDesigner', 'overallOurs'],
  properties: {
    designerConcept: { type: 'string', description: '設計師版的視覺概念一句話（主題物件、字體、色彩、動態語言）' },
    scores: { type: 'object', additionalProperties: false, required: Object.keys(DIMENSIONS), properties: Object.fromEntries(Object.keys(DIMENSIONS).map((k) => [k, scorePair])) },
    techniques: { type: 'array', description: '設計師版用了、我們沒有，值得做成模板或規則的具體手法（3–8 項）', items: { type: 'object', additionalProperties: false, required: ['name', 'how', 'where'], properties: { name: { type: 'string' }, how: { type: 'string', description: '怎麼做（可程式化的描述）' }, where: { type: 'string', description: '在哪個時間點看得到' } } } },
    aiFeel: { type: 'string', description: '我們的版本哪裡讓人覺得是 AI 做的' },
    oursStrengths: { type: 'string', description: '我們的版本比較好或值得保留的地方' },
    overallDesigner: { type: 'integer', description: '設計師版總分（以 100 分為滿分的觀感，參考值）' },
    overallOurs: { type: 'integer', description: '我們的總分，以設計師版為 100 分的相對分數' },
  },
};

interface Plan { points: [string, number][]; drop: number; ours: string; designer: string }
const plans: Record<string, Plan> = JSON.parse(readFileSync(a.plan!, 'utf8'));
const results: Record<string, unknown> = existsSync(join(a.out!, 'scores.json')) ? JSON.parse(readFileSync(join(a.out!, 'scores.json'), 'utf8')) : {};
const client = new Anthropic();
let cost = 0;
for (const [vid, p] of Object.entries(plans)) {
  if (results[vid]) continue;
  const meta = JSON.parse(readFileSync(join(homedir(), 'vjanalytics/out/results', `${vid}.json`), 'utf8'));
  const img = (f: string) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data: readFileSync(join(a.out!, f)).toString('base64') } });
  const content = [
    { type: 'text' as const, text: `歌曲：${meta.source.artist}〈${meta.source.title}〉。\n第一張圖：每一列是同一個時間點，左邊是專業設計師做的歌詞 VJ，右邊是我們系統自動生成的版本（純圖片版：背景是靜態圖加運鏡，不是影片）。列的時間點依序是：${p.points.map(([k, t]) => `${k} ${t}s`).join('、')}。\n第二張圖：第一次副歌爆點（${p.drop.toFixed(2)}s）前 0.5 秒到後 1 秒，每 0.25 秒一格；上排設計師、下排我們。` },
    img(`${vid}_sheet.jpg`),
    img(`${vid}_motion.jpg`),
    { type: 'text' as const, text: `依下列面向，各給設計師版與我們的版本 1–10 分，寫出具體差距；再列出設計師用了、我們沒有、值得做成模板或規則的手法。設計師版若是直式或特殊比例，不要因為比例扣分。\n${Object.entries(DIMENSIONS).map(([k, v]) => `- ${k}：${v}`).join('\n')}` },
  ];
  const message = await client.beta.messages
    .stream({
      model: a.model!, max_tokens: 16000, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
      output_config: { effort: 'high', format: { type: 'json_schema', schema: SCHEMA } },
      system: '你是日本偶像歌詞 VJ 的資深動態設計總監。用專業設計師的眼光，誠實比較兩個版本，不客氣也不誇大。只根據看到的畫面判斷。',
      messages: [{ role: 'user', content }],
    } as Anthropic.Beta.Messages.MessageStreamParams)
    .finalMessage();
  if (message.stop_reason === 'refusal') throw new Error(`Refused: ${JSON.stringify(message.stop_details)}`);
  const text = message.content.find((b) => b.type === 'text')?.text;
  if (!text) throw new Error(`No text in response (stop_reason ${message.stop_reason})`);
  results[vid] = { title: `${meta.source.artist}〈${meta.source.title}〉`, ...JSON.parse(text) };
  cost += (message.usage.input_tokens * 4 + message.usage.output_tokens * 20) / 1e6;
  writeFileSync(join(a.out!, 'scores.json'), JSON.stringify(results, null, 1));
  console.log(`${vid} scored (${(cost).toFixed(2)} USD so far)`);
}
// averages per dimension
const rows = Object.values(results) as { scores: Record<Dim, { designer: number; ours: number }>; overallOurs: number }[];
const avg = Object.fromEntries((Object.keys(DIMENSIONS) as Dim[]).map((k) => [k, { designer: +(rows.reduce((s, r) => s + r.scores[k].designer, 0) / rows.length).toFixed(1), ours: +(rows.reduce((s, r) => s + r.scores[k].ours, 0) / rows.length).toFixed(1) }]));
console.log(JSON.stringify({ songs: rows.length, overallOurs: +(rows.reduce((s, r) => s + r.overallOurs, 0) / rows.length).toFixed(0), avg, costUSD: +cost.toFixed(2) }, null, 1));
