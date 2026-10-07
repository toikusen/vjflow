// The director writes the song's own drawing code — one Canvas2D layer (graphics.ts kind 'code') that
// joins each section's library layers — then checks it on test stills (errors, slowness, its own look at the frames)
// and revises. Writes <out>/treatment.json (the song's treatment with the code layer; --out may be --dir itself) and
// <out>/codelayer.json; the test renders go to <out>/codelayer/.
// npx tsx scripts/lyric-vj/codelayer.mts --song out/db/<id>/song.json --dir out/db/<id>/studio --out <dir>
import Anthropic from '@anthropic-ai/sdk';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

const { values: a } = parseArgs({ options: { song: { type: 'string' }, dir: { type: 'string' }, out: { type: 'string' }, model: { type: 'string', default: 'claude-opus-5-5' } } });
const env = join(homedir(), '.config/vjflow/anthropic.env');
for (const line of existsSync(env) ? readFileSync(env, 'utf8').split('\n') : []) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const out = a.out!;
const work = join(out, 'codelayer');
mkdirSync(work, { recursive: true });
const song = JSON.parse(readFileSync(a.song!, 'utf8'));
const base = JSON.parse(readFileSync(join(a.dir!, 'treatment.json'), 'utf8'));
// a rerun replaces the previous drawing
for (const s of base.graphics.sections) s.layers = s.layers.filter((l: { kind: string }) => l.kind !== 'code');
const sections: { start: number; layers: { kind: string }[]; text?: string }[] = base.graphics.sections;

const brief = {
  title: song.title, duration: +song.duration.toFixed(1), bpm: +song.tempo.toFixed(1),
  concept: base.concept, language: base.design.language, font: base.design.font,
  arc: base.arc, moments: base.moments,
  sections: sections.map((s, i) => ({ index: i, start: s.start, end: sections[i + 1]?.start ?? +song.duration.toFixed(1), lyricColor: s.text ?? 'auto', layers: s.layers.map((l, j) => ({ index: j, ...l })) })),
  lyrics: song.cues.map((c: { start: number; text: string }) => `${c.start.toFixed(1)} ${c.text}`),
};

const SYSTEM = `你是頂尖的動態設計師，正在為一首日本偶像歌曲的歌詞 VJ 寫「這首歌專屬的背景動畫」。其他圖層來自共用元件庫，看起來像模板；你寫的這一層要讓這首歌一看就知道是設計師為它量身做的。`;
const RULES = `
寫一個 JavaScript 函式本體（不含 function 宣告），會被 new Function('ctx', 'f', src) 編譯，每一格呼叫一次：
- ctx：1920×1080 的 CanvasRenderingContext2D，已經畫好你下面保留的圖層；畫完會自動 restore。
- f.t：歌曲秒數；f.age：本段開始後的秒數；f.w、f.h：1920、1080。
- f.beat：{ since: 距上一拍秒數, pulse: 1→0 衰減的打拍力道, index: 第幾拍 }。BPM 和段落、高潮時間在下面的資料裡，可以直接寫死在程式裡。
- f.lyric：此刻歌詞在畫面上的矩形 {x0,y0,x1,y1}（像素），沒有歌詞時是 null。歌詞會畫在你上面。
- f.hash(a, b)：決定性雜訊 [0,1)。
規則：
1. 完全決定性：只依 f 的值畫，不能用 Math.random、Date、requestAnimationFrame、全域狀態累積（每一格可能單獨被畫、也可能跳著畫）。
2. 效能：每格 10 毫秒內（不要每格建上萬個路徑、不要 getImageData、不要 filter: blur 大面積）。
3. 歌詞要看得清楚：f.lyric 範圍內（外擴 40px）只能留低對比、低細節的東西，主要的動態避開它或在它後面變安靜。歌詞顏色見每段 lyricColor（auto＝系統依底色挑深或淺）。
4. 要和整首歌的概念、語言、配色一致，跟著段落和能量變化：主歌克制、副歌和高潮（moments 的 drop/finale）全開、間奏要有明顯變化。
5. 不要畫文字標題、歌名、人名。可以有裝飾性的字元或符號。
6. 每一段決定要保留哪些原本的元件庫圖層（layers 的 index），以及你的圖層放在哪裡：order 是由下到上的順序，-1 代表你的圖層。第一個必須是原本的底色 fill/paper（index 0）。可以拿掉看起來像模板、和你的動畫衝突的圖層。
7. 避開最常見的「AI 動態設計」樣子：瑞士網格加 UI 雜訊、時間碼、霓虹光暈、粒子場。要像這首歌的設計師才會想到的東西。`;

const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['idea', 'src', 'sections'],
  properties: {
    idea: { type: 'string', description: '這一層的設計想法，2–4 句繁體中文' },
    src: { type: 'string', description: '函式本體' },
    sections: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['index', 'order'], properties: { index: { type: 'integer' }, order: { type: 'array', items: { type: 'integer' } } } } },
  },
};
type Reply = { idea: string; src: string; sections: { index: number; order: number[] }[] };

const client = new Anthropic();
const usage = { input: 0, output: 0 };
const messages: Anthropic.Messages.MessageParam[] = [{ role: 'user', content: `${RULES}\n\n這首歌的資料：\n${JSON.stringify(brief)}` }];
async function ask(): Promise<Reply> {
  const msg = await client.messages
    .stream({ model: a.model!, max_tokens: 64000, system: SYSTEM, messages, output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } } } as Anthropic.Messages.MessageStreamParams)
    .finalMessage();
  usage.input += msg.usage.input_tokens;
  usage.output += msg.usage.output_tokens;
  if (msg.stop_reason === 'max_tokens') throw new Error('director ran out of tokens');
  messages.push({ role: 'assistant', content: msg.content as Anthropic.Messages.ContentBlockParam[] });
  const text = msg.content.find((b) => b.type === 'text')?.text ?? '';
  return JSON.parse(text);
}

/** The treatment with the code layer placed per section. */
function apply(r: Reply) {
  const t = structuredClone(base);
  t.graphics.sections = sections.map((s, i) => {
    const order = r.sections.find((x) => x.index === i)?.order ?? [0, -1, ...s.layers.slice(1).map((_, j) => j + 1)];
    const field = order[0] === 0 ? order : [0, ...order.filter((x) => x !== 0)];
    const layers = field.map((j) => (j === -1 ? { kind: 'code', src: r.src } : s.layers[j])).filter(Boolean);
    return { ...s, layers: layers.some((l) => l.kind === 'code') ? layers : [...layers, { kind: 'code', src: r.src }] };
  });
  return t;
}

// stills across the song: a verse, the first drop, an interlude, the finale
const drop = base.moments.find((m: { kind: string }) => m.kind === 'drop')?.at ?? song.duration * 0.3;
const fin = base.moments.find((m: { kind: string }) => m.kind === 'finale')?.at ?? song.duration * 0.75;
const times = [song.duration * 0.12, drop + 0.6, drop + 6, song.duration * 0.6, fin + 0.6, fin + 8].map((x) => +Math.min(song.duration - 1, x).toFixed(2));

// pictures may still be generating (Studio runs both at once): test renders go without them then
const pics = join(a.dir!, 'assets', 'assets.json');

function test(r: Reply, round: number) {
  const file = join(work, `treatment_r${round}.json`);
  writeFileSync(file, JSON.stringify(apply(r)));
  const dir = join(work, `stills_r${round}`);
  let log = '';
  try {
    log = execFileSync('npx', ['tsx', 'scripts/lyric-vj/render.mts', '--song', a.song!, '--treatment', file, ...(existsSync(pics) ? ['--assets', pics] : []), '--start', '0', '--end', String(song.duration), '--stills', times.join(','), '--out', dir], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    log = String((e as { stderr?: string }).stderr ?? e);
  }
  const problems = [...new Set(log.split('\n').filter((l) => /code layer:|page error:/.test(l)))];
  const images = times.map((x) => {
    const jpg = join(dir, `s_${x.toFixed(2)}.jpg`);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', join(dir, `still_${x.toFixed(2)}.png`), '-vf', 'scale=960:-1', '-q:v', '4', jpg]);
    return readFileSync(jpg).toString('base64');
  });
  return { file, problems, images };
}

const began = Date.now();
let reply = await ask();
console.log('idea:', reply.idea);
for (let round = 1; round <= 3; round++) {
  const r = test(reply, round);
  console.log(`round ${round}: ${r.problems.length ? r.problems.join(' | ') : 'no errors'}`);
  if (round === 3) break;
  messages.push({
    role: 'user',
    content: [
      { type: 'text', text: `${r.problems.length ? `渲染時的問題（必須修）：\n${r.problems.join('\n')}\n\n` : '渲染沒有錯誤。\n\n'}以下是成品截圖（歌詞已疊上），時間依序為 ${times.join('、')} 秒。用設計總監的眼光嚴格審視：歌詞是否清楚、和概念是否一致、是否夠獨特有設計感、段落之間有沒有變化、有沒有像模板或 AI 的地方。${round === 2 ? '這是最後一次修改機會。' : ''}如果已經達到你滿意的水準且沒有錯誤，原樣回傳同一份；否則回傳修改後的完整版本。` },
      ...r.images.map((data) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data } })),
    ],
  });
  const next = await ask();
  if (next.src === reply.src && JSON.stringify(next.sections) === JSON.stringify(reply.sections) && !r.problems.length) break;
  reply = next;
  console.log('revised:', reply.idea);
}
writeFileSync(join(out, 'treatment.json'), JSON.stringify(apply(reply)));
const usd = (usage.input * 4 + usage.output * 20) / 1e6;
writeFileSync(join(out, 'codelayer.json'), JSON.stringify({ ...reply, seconds: Math.round((Date.now() - began) / 1000), ...usage, costUSD: +usd.toFixed(3) }, null, 1));
console.log(`done: ${Math.round((Date.now() - began) / 1000)}s, $${usd.toFixed(3)}`);
