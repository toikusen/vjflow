// The technique knowledge base: every technique the lyric-video database analysis found (vjtech.py, one JSON per
// video) merged into canonical techniques per category — what it is, how to build it, when designers use it, how
// common it is, examples — and checked against what this renderer already does. Writes out/knowledge/:
// techniques.json (all), README.md (for people), toolbox.md (the condensed part the director reads).
// npx tsx scripts/lyric-vj/knowledge.mts --in ~/vjanalytics/out_tech
import Anthropic from '@anthropic-ai/sdk';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { TEMPLATES } from '../../src/app/lyric-vj/templates';
import { EMPHASIS_METHODS, ENTER_KINDS, EXIT_KINDS } from '../../src/app/lyric-vj/treatment';

const { values: a } = parseArgs({ options: { in: { type: 'string' }, out: { type: 'string', default: 'out/knowledge' }, model: { type: 'string', default: 'claude-opus-5-5' },
  // rebuild toolbox.md from an existing techniques.json (no model calls)
  'toolbox-only': { type: 'boolean', default: false } } });
const env = join(homedir(), '.config/vjflow/anthropic.env');
for (const line of existsSync(env) ? readFileSync(env, 'utf8').split('\n') : []) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const client = new Anthropic({ maxRetries: 8 });
const usage = { input: 0, output: 0 };
mkdirSync(a.out!, { recursive: true });

type Raw = { category: string; name: string; how: string; when: string; at_sec: number; frequency: string; on_beat: boolean; why: string };
type Video = { _video: { id: string; artist: string; title: string; url: string }; can_see_video: boolean; summary: string; techniques: Raw[]; design_score: number };
const videos: Video[] = readdirSync(a.in!.replace(/^~/, homedir()))
  .filter((f) => f.startsWith('yt_') && f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(a.in!.replace(/^~/, homedir()), f), 'utf8')))
  .filter((v: Video) => v.can_see_video && v.techniques?.length);
console.log(`${videos.length} videos`);

// every technique with where it came from, numbered for the model to cite
const items = videos.flatMap((v, vi) => v.techniques.map((t) => ({ ...t, v: vi })));
const byCat = new Map<string, typeof items>();
for (const t of items) byCat.set(t.category, [...(byCat.get(t.category) ?? []), t]);

/** What this renderer can already do, for marking each technique have / partial / new. */
const CAPABILITIES = `我們的歌詞 VJ 引擎目前能做：
- 版型：${Object.values(TEMPLATES).map((t) => `${t.id}（${t.description.slice(0, 40)}）`).join('；')}
- 進場：${ENTER_KINDS.join('、')}（ink＝先描邊再填滿，flap＝翻牌看板，slot＝拉霸轉輪，focus＝模糊對焦，rise＝從底線後升起）；退場：${EXIT_KINDS.join('、')}（glitch＝訊號崩壞，slash＝光刃斬切）；逐字或整句出現
- 強調：${EMPHASIS_METHODS.join('、')}（hollow 空心、face 換對比字體、mark 手繪底線、symbol 字旁小符號、liquid 空心字灌滿顏色）；巨大回聲字；曲名固定字樣
- 括號應援／和聲自動成第二字軌；演唱者代表色；依背景留白自動選邊；歌名卡（前奏／間奏／尾奏）
- 背景：每首歌的程式繪製圖層（運鏡、場景圖滿版、素材道具演出、網格變形讓軟物件擺動）＋元件庫（色面、紙紋、圖樣、照片框、光暈、放射線、膠帶、形狀）
- 色彩：每段一組雙色調＋強調色；爆點（drop／finale）亮閃、電影遮幅；每秒 12 格的定格感`;

const CANON_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['techniques'],
  properties: {
    techniques: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['name', 'how', 'when', 'why', 'sources', 'status', 'gap'],
        properties: {
          name: { type: 'string', description: '標準名稱（繁體中文，短）' },
          how: { type: 'string', description: '怎麼做：綜合各例子，寫成工程師能照做的規格（時長、方向、比例、緩動、與節拍的關係），3–6 句' },
          when: { type: 'string', description: '設計師在什麼歌、什麼段落、什麼歌詞用它' },
          why: { type: 'string', description: '為什麼有效' },
          sources: { type: 'array', items: { type: 'integer' }, description: '歸到這個手法的原始條目編號' },
          status: { type: 'string', enum: ['have', 'partial', 'new'], description: '對照我們的能力：已有／部分有／沒有' },
          gap: { type: 'string', description: 'partial 或 new 時：我們還缺什麼；have 時填空字串' },
        },
      },
    },
  },
};
type Canon = { name: string; how: string; when: string; why: string; sources: number[]; status: string; gap: string };

async function ask<T>(prompt: string, schema: object): Promise<T> {
  for (let k = 0; k < 4; k++) {
    try {
      const msg = await client.messages
        .stream({ model: a.model!, max_tokens: 64000, messages: [{ role: 'user', content: prompt }], output_config: { effort: 'medium', format: { type: 'json_schema', schema } } } as Anthropic.Messages.MessageStreamParams)
        .finalMessage();
      usage.input += msg.usage.input_tokens;
      usage.output += msg.usage.output_tokens;
      return JSON.parse(msg.content.find((b) => b.type === 'text')?.text ?? '{}');
    } catch (e) {
      console.log(`retry (${(e as Error).message.slice(0, 80)})`);
      await new Promise((r) => setTimeout(r, 20_000 * (k + 1)));
    }
  }
  throw new Error('knowledge: the model kept failing');
}

/**
 * For the director: what designers do most that this engine can build (have / partial), a few per category, one line
 * each — the whole base would cost every design call ~15k tokens and offer things the renderer cannot draw.
 */
function writeToolbox(list: { category: string; name: string; how: string; when: string; status: string; videos: number }[]) {
  const names: Record<string, string> = { typography: '字型', text_motion: '字的動態', entrance: '進場', exit: '退場', emphasis: '強調', layout: '排版', transition: '轉場', interlude: '過門／間奏', intro_outro: '片頭片尾', background: '背景', color: '配色', rhythm_sync: '節拍同步', structure: '整首結構', graphic_element: '圖形元素', camera: '鏡頭' };
  const text = Object.keys(names)
    .map((cat) => {
      const top = list.filter((t) => t.category === cat && t.status !== 'new').sort((x, y) => y.videos - x.videos).slice(0, 6);
      return top.length ? `【${names[cat]}】\n${top.map((t) => `- ${t.name}：${t.how.split('。')[0].slice(0, 90)}。用在：${t.when.split('。')[0].slice(0, 50)}`).join('\n')}` : '';
    })
    .filter(Boolean)
    .join('\n');
  writeFileSync(join(a.out!, 'toolbox.md'), text);
  console.log(`toolbox: ${text.length} chars`);
}
if (a['toolbox-only']) {
  writeToolbox(JSON.parse(readFileSync(join(a.out!, 'techniques.json'), 'utf8')));
  process.exit(0);
}

const BATCH = 300;
const all: (Canon & { category: string; videos: number; examples: { video: string; url: string; at: number }[] })[] = [];
/** One category: merged in batches, then the batches merged. */
async function category(cat: string, list: typeof items) {
  // merge in batches, then merge the batches' results (a category can hold well over a thousand entries)
  const batches: Canon[][] = [];
  for (let i = 0; i < list.length; i += BATCH) {
    const part = list.slice(i, i + BATCH);
    const lines = part.map((t, k) => `${i + k}. ${t.name}｜${t.how}｜用在：${t.when}${t.on_beat ? '｜踩拍' : ''}`).join('\n');
    const r = await ask<{ techniques: Canon[] }>(`${CAPABILITIES}\n\n以下是從 ${videos.length} 支設計師做的歌詞 MV 分析出來、類別「${cat}」的手法條目（編號. 名稱｜做法｜用途）。把做的是同一件事的條目合併成一個標準手法（不同做法就分開），每個標準手法綜合各例子寫出可照做的規格，並列出歸入的條目編號（每個條目都要歸到某個手法）。對照我們的能力標 status 與 gap。\n\n${lines}`, CANON_SCHEMA);
    batches.push(r.techniques);
    console.log(`${cat} ${i + part.length}/${list.length}: ${r.techniques.length} techniques`);
  }
  let merged = batches[0];
  if (batches.length > 1) {
    const flat = batches.flat();
    const lines = flat.map((t, k) => `${k}. ${t.name}｜${t.how}｜用在：${t.when}｜狀態：${t.status} ${t.gap}`).join('\n');
    const r = await ask<{ techniques: Canon[] }>(`${CAPABILITIES}\n\n以下是類別「${cat}」分批整理出來的標準手法，批次之間有重複。把同一件事合併，綜合寫出規格，sources 填歸入的編號（這裡的編號），對照我們的能力重新判斷 status 與 gap。\n\n${lines}`, CANON_SCHEMA);
    // map the second-level sources back to the original entries
    merged = r.techniques.map((t) => ({ ...t, sources: [...new Set(t.sources.flatMap((k) => flat[k]?.sources ?? []))] }));
  }
  for (const t of merged) {
    const src = t.sources.map((k) => list[k]).filter(Boolean);
    const vids = [...new Set(src.map((x) => x.v))];
    all.push({ ...t, category: cat, videos: vids.length, examples: vids.slice(0, 5).map((vi) => ({ video: `${videos[vi]._video.artist}「${videos[vi]._video.title}」`, url: videos[vi]._video.url, at: src.find((x) => x.v === vi)!.at_sec })) });
  }
  writeFileSync(join(a.out!, 'techniques.json'), JSON.stringify(all, null, 1));
}
// four categories at a time (largest first, so the long ones start early)
const queue = [...byCat.entries()].sort((x, y) => y[1].length - x[1].length);
await Promise.all(Array.from({ length: 4 }, async () => {
  for (let next = queue.shift(); next; next = queue.shift()) await category(...next);
}));
all.sort((x, y) => y.videos - x.videos);
writeFileSync(join(a.out!, 'techniques.json'), JSON.stringify(all, null, 1));

// for people: by category, most common first
const CAT_NAME: Record<string, string> = { typography: '字型', text_motion: '字的動態', entrance: '進場', exit: '退場', emphasis: '強調', layout: '排版', transition: '轉場', interlude: '過門／間奏', intro_outro: '片頭片尾', background: '背景', color: '配色', rhythm_sync: '節拍同步', structure: '整首結構', graphic_element: '圖形元素', camera: '鏡頭' };
const STATUS: Record<string, string> = { have: '已有', partial: '部分有', new: '還沒有' };
const md = [`# 歌詞 VJ 手法知識庫\n\n${videos.length} 支設計師製作的歌詞 MV 分析出 ${items.length} 個手法條目，合併成 ${all.length} 個標準手法。括號內是用到的影片數。\n`];
for (const cat of Object.keys(CAT_NAME)) {
  const list = all.filter((t) => t.category === cat);
  if (!list.length) continue;
  md.push(`\n## ${CAT_NAME[cat]}（${list.length}）\n`);
  for (const t of list) md.push(`### ${t.name}（${t.videos}）— ${STATUS[t.status]}\n- 做法：${t.how}\n- 用在：${t.when}\n- 理由：${t.why}${t.gap ? `\n- 我們還缺：${t.gap}` : ''}\n- 例子：${t.examples.map((e) => `[${e.video}](${e.url}&t=${Math.floor(e.at)}s)`).join('、')}\n`);
}
writeFileSync(join(a.out!, 'README.md'), md.join('\n'));
writeToolbox(all);
const usd = (usage.input * 4 + usage.output * 20) / 1e6;
console.log(`done: ${all.length} techniques ($${usd.toFixed(2)})`);
