// Where each of our techniques comes from: every kinetic move, transition, line motion, emphasis, layout and finish is
// matched against the 535-video knowledge base (out/knowledge/techniques.json) in one Opus call, then graded by how
// many of those videos use it. A technique few videos use, or one we learned from one creator, reads as copying them.
//
// npx tsx scripts/lyric-vj/origins.mts [--out out/knowledge/origins.json] [--plan <origins.json: regrade, no call>]
//   [--keep <origins.json: keep its matches, ask only about techniques it lacks (a full rerun drifts old rows)>]
import Anthropic from '@anthropic-ai/sdk';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { parseArgs } from 'node:util';
import { TRANSITION_KINDS, TRANSITION_MOOD } from '../../src/app/lyric-vj/render/transition';
import { GLYPH_FINISHES } from '../../src/app/lyric-vj/design';
import { MORE } from '../../src/app/lyric-vj/render/kinetic-more';
import { REVISE_LOOKS } from '../../src/app/lyric-vj/treatment';
import { EMPH_HELP, ENTER_HELP, EXIT_HELP, FX_HELP, IDLE_HELP, TEMPLATES } from './typehelp.mts';

const { values: a } = parseArgs({ options: { out: { type: 'string', default: 'out/knowledge/origins.json' }, plan: { type: 'string' }, keep: { type: 'string' }, model: { type: 'string', default: 'claude-opus-5-5' } } });
for (const line of existsSync(`${homedir()}/.config/vjflow/anthropic.env`) ? readFileSync(`${homedir()}/.config/vjflow/anthropic.env`, 'utf8').split('\n') : []) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

type Tech = { name: string; how: string; category: string; videos: number; examples: { video: string }[] };
const kb = JSON.parse(readFileSync('out/knowledge/techniques.json', 'utf8')) as Tech[];

const FINISH_HELP: Record<string, string> = { dots: '歌詞字點陣質感', extrude: '歌詞字立體擠出', chalk: '歌詞字粉筆質感', distress: '歌詞字做舊磨損', stripes: '歌詞字斜線填充', gradient: '歌詞字漸層' };
const EXTRA: Record<string, string> = {
  'device:document': '文件感：角落標 FIG. 章名、LINE 080/126 第幾句、REV. 修訂標籤（像設計圖、報告）',
  'device:chapters': '分章：歌被切成有名字的章節，每章固定一種畫面狀態',
  'device:print-line': '人物線稿一筆筆畫出來',
  'device:print-halftone': '人物印成網點（報紙、大字報）',
  'device:print-duo': '人物印成雙色平面印刷，當貼紙站在圖形上',
  'device:subtitle': '歌詞下方小字中文翻譯',
  'device:kinetic-format': '整支 MV 的版型：嚴格三色、一個固定的去背角色、每 0.5–1 秒踩拍換一刀背景招式',
  'device:cam': '背景鏡頭動作：急推、翻滾回正、天地倒置、震動、慢傾斜',
  'device:flash': '換刀時閃兩格：黑幀、白幀、反相',
  'pace:quick': '換刀節奏：每 0.5–1 秒踩拍換一刀背景',
  'pace:held': '換刀節奏：一個畫面停 2–4 拍以上才換，字和背景慢慢動',
  'pace:mixed': '換刀節奏：主歌慢、副歌快，依段落切換',
  'ground:flat': '背景紙是一整片純色',
  'ground:grain': '背景紙有纖維和細點，像印刷紙或報紙',
  'ground:gradient': '背景紙往下漸深的漸層',
  'revise:tape': '改寫：錯的詞被修正帶抹白，再出現正確的詞',
  'revise:scribble': '改寫：錯的詞被筆亂塗掉，再出現正確的詞',
  'revise:stamp': '改寫：錯的詞被蓋上 VOID 作廢章，再出現正確的詞',
  'doc:slate': '文件感：角落是電影場記板（SCENE、TAKE、斜紋條）',
  'doc:casefile': '文件感：角落是機密檔案（CASE No.、CONFIDENTIAL 框、頁碼）',
  'doc:notebook': '文件感：筆記本頁（No.、DATE 欄、紅色邊線、頁碼）',
  'doc:ticket': '文件感：票券（打孔虛線、目的地、SEAT 座位號）',
};
// each move's variants are techniques of their own (a mahjong tile is not a keycap)
for (const [id, m] of Object.entries(MORE)) m.styles?.forEach((x, i) => i && (EXTRA[`fx:${id}#${i}`] = `${m.help.split('：')[0]}的變化：${x}`));
void REVISE_LOOKS;
/** Ours, by kind: id → what it does (the planner's own words). */
const ours: { id: string; kind: string; what: string }[] = [
  ...Object.entries(FX_HELP).map(([id, what]) => ({ id: `fx:${id}`, kind: '背景招式', what: what.replace(/［.*?］/g, '') })),
  ...TRANSITION_KINDS.map((id) => ({ id: `tr:${id}`, kind: '轉場', what: TRANSITION_MOOD[id] })),
  ...Object.entries(ENTER_HELP).map(([id, what]) => ({ id: `enter:${id}`, kind: '歌詞進場', what })),
  ...Object.entries(EXIT_HELP).map(([id, what]) => ({ id: `exit:${id}`, kind: '歌詞退場', what })),
  ...Object.entries(IDLE_HELP).map(([id, what]) => ({ id: `idle:${id}`, kind: '歌詞停留', what })),
  ...Object.entries(EMPH_HELP).map(([id, what]) => ({ id: `emph:${id}`, kind: '強調', what })),
  ...Object.entries(TEMPLATES).map(([id, what]) => ({ id: `layout:${id}`, kind: '歌詞排法', what })),
  ...GLYPH_FINISHES.map((id) => ({ id: `finish:${id}`, kind: '字的質感', what: FINISH_HELP[id] ?? id })),
  ...Object.entries(EXTRA).map(([id, what]) => ({ id, kind: '整體手法', what })),
];
/**
 * Learned from one named creator (2026-10-19 Threads posts; ゆのん's video the kinetic format was built from), and
 * whether the form we use is that creator's own (`own`) or a common technique we happened to learn there.
 */
const SNAKE = '@snakenxx 大字報 MV', YUNON = 'ゆのん「のうないお祭り」';
const KNOWN: Record<string, { from: string; own: boolean }> = {
  ...Object.fromEntries(['emph:revise', 'device:document', 'fx:ecg', 'fx:tiles', 'fx:blueprint'].map((x) => [x, { from: SNAKE, own: true }])),
  ...Object.fromEntries(['device:print-line', 'device:print-halftone', 'device:subtitle', 'device:chapters'].map((x) => [x, { from: SNAKE, own: false }])),
  'device:kinetic-format': { from: YUNON, own: true },
  ...Object.fromEntries(['paperfold', 'glass', 'cardstack', 'scrapbook', 'unveil', 'splash'].map((x) => [`fx:${x}`, { from: '@ai_yunon_ai 開場合集', own: false }])),
  'layout:lanes': { from: '@aicreataro 歌詞片', own: false },
  'pace:quick': { from: YUNON, own: true },
  'ground:flat': { from: YUNON, own: false },
  ...Object.fromEntries(['device:print-duo', ...['wall', 'ring', 'tunnel', 'bars', 'stack', 'split', 'rays', 'boxes', 'grid', 'dots'].map((x) => `fx:${x}`)].map((x) => [x, { from: YUNON, own: false }])),
};

/** Matched too narrowly (a shake on the beat is in every editor's kit): graded as common whatever the count. */
const GENERIC = new Set(['tr:shakecut']);

type Match = { id: string; matches: number[]; note: string };
let matched: Match[];
let usd = 0;
if (a.plan) matched = (JSON.parse(readFileSync(a.plan, 'utf8')) as { items: { id: string; matches: { i: number }[]; note: string }[] }).items.map((x) => ({ id: x.id, matches: x.matches.map((m) => m.i), note: x.note }));
else {
  const kept: Match[] = a.keep ? (JSON.parse(readFileSync(a.keep, 'utf8')) as { items: { id: string; matches: { i: number }[]; note: string }[] }).items.map((x) => ({ id: x.id, matches: x.matches.map((m) => m.i), note: x.note })) : [];
  const ask = ours.filter((o) => !kept.some((k) => k.id === o.id));
  const prompt = `下面有兩份清單。A 是一個歌詞 MV 產生器自己的手法，B 是從 535 支別人的歌詞 MV 整理出來的手法知識庫（每條有編號、類別和幾支影片用過）。
替 A 的每一條找出 B 裡「是同一種手法」的條目（0–3 條，最像的放前面）。同一種手法＝觀眾看起來是同一個效果，不是只有同類別。B 裡沒有同一種手法就給空陣列。note 用一句話說明差別或為什麼沒有對應（台灣繁體中文）。

A：
${ask.map((x) => `${x.id}｜${x.kind}｜${x.what}`).join('\n')}

B：
${kb.map((t, i) => `${i}｜${t.category}｜${t.videos}支｜${t.name}：${t.how.slice(0, 70)}`).join('\n')}

A 的每一條都要輸出，id 照抄。`;
  const SCHEMA = { type: 'object', additionalProperties: false, required: ['items'], properties: { items: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'matches', 'note'], properties: { id: { type: 'string' }, matches: { type: 'array', items: { type: 'integer' } }, note: { type: 'string' } } } } } };
  if (!ask.length) matched = kept;
  else {
    const msg = await new Anthropic({ maxRetries: 8 }).messages.stream({ model: a.model!, max_tokens: 64000, messages: [{ role: 'user', content: prompt }], output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } } } as Anthropic.Messages.MessageStreamParams).finalMessage();
    usd = (msg.usage.input_tokens * 4 + msg.usage.output_tokens * 20) / 1e6;
    matched = [...kept, ...(JSON.parse(msg.content.find((b) => b.type === 'text')?.text ?? '{"items":[]}') as { items: Match[] }).items];
  }
}

/** How many of the 535 videos use it: common (5+), rare (2–4), single (1), none (not in lyric videos at all). */
export const grade = (videos: number) => (videos >= 5 ? 'common' : videos >= 2 ? 'rare' : videos === 1 ? 'single' : 'none');
/**
 * How much it reads as someone's: high = a creator's own form we learned from them, or a form only one video has;
 * medium = rare, or a common technique we learned from one creator (fine alone, telling in their combination).
 */
export const risk = (videos: number, known?: { own: boolean }) => (known?.own || videos === 1 ? 'high' : known || (videos >= 2 && videos <= 4) ? 'medium' : 'low');
const items = ours.map((o) => {
  const m = matched.find((x) => x.id === o.id);
  const hits = (m?.matches ?? []).filter((i) => kb[i]).map((i) => ({ i, name: kb[i].name, videos: kb[i].videos, examples: kb[i].examples.slice(0, 3).map((e) => e.video) }));
  const videos = GENERIC.has(o.id) ? 99 : Math.max(0, ...hits.map((h) => h.videos));
  return { ...o, grade: grade(videos), risk: risk(videos, KNOWN[o.id]), videos, known: KNOWN[o.id]?.from ?? '', matches: hits, note: m?.note ?? '' };
});
writeFileSync(a.out!, JSON.stringify({ costUSD: +usd.toFixed(3), items }, null, 1));
// the table the planner caps by (committed: a technique without a row fails origins.spec.ts)
const rows = items.map((x) => `  '${x.id}': { videos: ${x.videos}, risk: '${x.risk}'${x.known ? `, from: '${x.known}', own: ${!!KNOWN[x.id]?.own}` : ''} },`);
writeFileSync('src/app/lyric-vj/origins.ts', `// Generated by scripts/lyric-vj/origins.mts from the 535-video audit (out/knowledge/origins.json); do not edit by hand.
// videos: how many of the 535 lyric videos use the technique; risk: how much it reads as someone else's.
export interface Origin { videos: number; risk: 'low' | 'medium' | 'high'; from?: string; own?: boolean }
export const ORIGINS: Record<string, Origin> = {
${rows.join('\n')}
};
`);
const n = (k: 'grade' | 'risk', g: string) => items.filter((x) => x[k] === g).length;
console.log(`origins: ${items.length} techniques — common ${n('grade', 'common')}, rare ${n('grade', 'rare')}, single ${n('grade', 'single')}, none ${n('grade', 'none')}; risk high ${n('risk', 'high')}, medium ${n('risk', 'medium')}, low ${n('risk', 'low')}${usd ? `, $${usd.toFixed(3)}` : ''}`);
