// Technique library: the design patterns observed across the VJ database (vjanalytics results, one list per video)
// merged and ranked into a library of techniques we can implement as engine modules. Learns the moves, never a
// single video's composition.
// npx tsx scripts/lyric-vj/techniques.mts --db ~/vjanalytics/out/results --out out/techniques
import Anthropic from '@anthropic-ai/sdk';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

const { values: a } = parseArgs({
  options: { db: { type: 'string' }, out: { type: 'string', default: 'out/techniques' }, model: { type: 'string', default: 'claude-opus-5-5' } },
});
const env = join(homedir(), '.config/vjflow/anthropic.env');
if (!process.env['ANTHROPIC_API_KEY'] && existsSync(env))
  for (const line of readFileSync(env, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].trim();
  }

// what the engine already has, so the library says what is new
const HAVE = `我們的引擎已有：
- 版型：punch（置中大字＋上下小字）、frame-split（細框＋角括號）、typewriter（游標打字）、vertical（直排 1–3 欄）、scatter（詞組沿對角線散佈）、handwrite（手寫逐字顯現）、beat-cut（每唱一個詞就以巨字換位置切入、整句小字在底部）、title-card（歌名卡）
- 文字：一句以固定速度載出、強調詞換色或放大、踩拍彈跳、重拍時整層文字跟著大鼓跳動、字落定後微幅波動
- 主題物件（程式畫的發光細線：時鐘／多邊形／軌道），形態 center/bleed/nested/tunnel/mask/shards，物件形狀轉場（iris）
- 爆點：放射光、斜向光束、黑場抽空再爆亮、物件圈爆開；build/drop/break/hold/finale 段落動態；閃白、衝擊波
- 色彩計畫：每段雙色調＋一個強調色；媒材後製層（底片、紙、蠟筆、剪紙、像素）
- 背景：AI 生成圖＋運鏡，可壓暗、雙色調、模糊`;

const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['techniques', 'summary'],
  properties: {
    summary: { type: 'string', description: '整體觀察：資料庫設計師最常用、最能區分「設計感」與「AI 感」的方向（繁體中文，5–8 句）' },
    techniques: {
      type: 'array', description: '合併後的手法，依優先順序排列（最值得先做的在前），25–35 項',
      items: {
        type: 'object', additionalProperties: false,
        required: ['name', 'category', 'when', 'how', 'videos', 'videoCount', 'value', 'legibility', 'status', 'existing', 'effort', 'why'],
        properties: {
          name: { type: 'string', description: '手法名稱（繁體中文，短）' },
          category: { type: 'string', enum: ['typography', 'layout', 'motion', 'graphics', 'color', 'transition', 'structure', 'background'] },
          when: { type: 'string', description: '用在什麼段落、什麼樣的歌詞或音樂條件' },
          how: { type: 'string', description: '可以寫成程式的具體做法（參數、時間、構圖），不要描述某一支影片的特定畫面' },
          videos: { type: 'array', items: { type: 'string' }, description: '出現這個手法的 video id' },
          videoCount: { type: 'integer' },
          value: { type: 'integer', description: '1–5：做出來後降低 AI 感、提升設計感的程度' },
          legibility: { type: 'string', enum: ['safe', 'caution', 'risky'], description: '對歌詞可讀性的風險' },
          status: { type: 'string', enum: ['new', 'partial', 'have'], description: '對照我們已有的功能' },
          existing: { type: 'string', description: 'partial/have 時，對應我們的哪個功能、還缺什麼' },
          effort: { type: 'string', enum: ['S', 'M', 'L'] },
          why: { type: 'string', description: '為什麼值得做（設計理由）' },
        },
      },
    },
  },
};

const rows = readdirSync(a.db!).filter((f) => f.endsWith('.json')).flatMap((f) => {
  const d = JSON.parse(readFileSync(join(a.db!, f), 'utf8'));
  return (d.design_patterns ?? []).map((p: Record<string, unknown>) => ({
    video: d.video_id, song: `${d.source?.artist}〈${d.source?.title}〉`, when: p['observed_condition'], action: p['observed_action'],
    why: p['design_hypothesis'], adapt: p['adaptation_suggestion'], limits: p['limitations'], confidence: p['confidence'],
  }));
});
console.log(`${rows.length} patterns`);
mkdirSync(a.out!, { recursive: true });

const client = new Anthropic();
const message = await client.beta.messages
  .stream({
    model: a.model!, max_tokens: 32000, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
    output_config: { effort: 'high', format: { type: 'json_schema', schema: SCHEMA } },
    system: '你是日本偶像歌詞 VJ 的資深動態設計總監，也懂程式化動態圖像。你要把一個資料庫裡觀察到的設計模式，整理成可以實作的手法庫。只整理手法（可重用的設計觀念與技巧），不要複製任何一支影片的特定構圖或圖案。',
    messages: [{ role: 'user', content: `以下是 50 支專業歌詞 VJ 的 ${rows.length} 條設計模式觀察（JSON）。請合併意思相同的模式，整理成 25–35 個手法，依「降低 AI 感、提升設計感的效果」與「出現頻率」排序。只出現在單一支影片、或依賴人物立繪／成員代表色等我們沒有的素材的手法，排到後面並在 why 說明。\n\n${HAVE}\n\n${JSON.stringify(rows)}` }],
  } as Anthropic.Beta.Messages.MessageStreamParams)
  .finalMessage();
if (message.stop_reason === 'refusal') throw new Error('refused');
const text = message.content.find((b) => b.type === 'text')?.text;
if (!text) throw new Error(`no text (stop_reason ${message.stop_reason})`);
const lib = JSON.parse(text);
const u = message.usage;
const costUSD = +((u.input_tokens * 4 + u.output_tokens * 20) / 1e6).toFixed(3);
writeFileSync(join(a.out!, 'techniques.json'), JSON.stringify({ ...lib, costUSD, patterns: rows.length }, null, 1));
console.log(JSON.stringify({ techniques: lib.techniques.length, costUSD }));
