// Custom scene generator: the director model writes a procedural Three.js background for one key moment (a chorus
// drop, an interlude) instead of an AI picture. Each draft is smoke-tested in node, rendered to stills and reviewed
// by the model with the frames in front of it; it rewrites until the review passes or the rounds run out.
// npx tsx scripts/lyric-vj/scene.mts --song out/db/<id>/song.json --treatment <in> --assets <assets.json> \
//   --start 36.5 --end 48 --id chorus1 --out <out-dir> [--rounds 3]
import Anthropic from '@anthropic-ai/sdk';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import * as THREE from 'three';
import { colorAt, DEFAULT_DESIGN } from '../../src/app/lyric-vj/design';
import { MEDIA } from '../../src/app/lyric-vj/medium';
import { CustomSceneSpec, SceneApi, SceneInstance, sceneState } from '../../src/app/lyric-vj/render/custom-scene';
import type { SongTimeline } from '../../src/app/lyric-vj/timeline';
import type { TreatmentV3 } from '../../src/app/lyric-vj/treatment';

// glyphs.ts measures text with a DOM canvas at import time, so its hash is restated here for the node smoke test
const hash = (x: number, y = 0) => {
  const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return v - Math.floor(v);
};

const { values: a } = parseArgs({
  options: {
    song: { type: 'string' }, treatment: { type: 'string' }, assets: { type: 'string' }, out: { type: 'string' },
    start: { type: 'string' }, end: { type: 'string' }, id: { type: 'string', default: 'scene1' },
    rounds: { type: 'string', default: '3' }, model: { type: 'string', default: 'claude-opus-5-5' },
  },
});
const env = join(homedir(), '.config/vjflow/anthropic.env');
if (!process.env['ANTHROPIC_API_KEY'] && existsSync(env))
  for (const line of readFileSync(env, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].trim();
  }

const song: SongTimeline = JSON.parse(readFileSync(a.song!, 'utf8'));
const base: TreatmentV3 = JSON.parse(readFileSync(a.treatment!, 'utf8'));
const start = Number(a.start);
const end = Number(a.end);
const out = a.out!;
mkdirSync(out, { recursive: true });
const design = base.design ?? DEFAULT_DESIGN;
const stop = colorAt(design.colorScript, start + 0.5);
const api: SceneApi = {
  W: 1920, H: 1080, start, end, palette: { shadow: stop.shadow, highlight: stop.highlight, accent: stop.accent },
  beats: song.beats, beatStrength: song.beatStrength ?? [], hash,
};
const lines = song.cues.filter((c) => c.end > start && c.start < end).map((c) => `${(c.start - start).toFixed(2)}s ${c.text}`);
const beatsRel = song.beats.filter((b) => b >= start && b < end).map((b) => (b - start).toFixed(2));
const moments = (base.moments ?? []).filter((m) => m.at >= start - 1 && m.at < end).map((m) => `${m.kind} @${(m.at - start).toFixed(2)}s`);

const SYSTEM = `你是頂尖的動態圖像設計師，也是 Three.js 工程師。你要為一支日本偶像歌詞 VJ 的一個關鍵段落，親手寫一段程式化的背景動畫（不用任何圖片），取代原本的 AI 背景圖。歌詞文字、主題物件與後製特效會由引擎疊在你的畫面上，你只畫背景。

程式契約（必須遵守）：
- 你寫的是函式本體：function (THREE, api) { ...; return { group, update(t, s) }; }，只輸出本體，不要寫 function 宣告、import 或 export。
- 座標：正交相機，畫面中心 (0,0)，x 在 ±api.W/2（±960）、y 在 ±api.H/2（±540），單位是像素。z 用來排前後（-100..100）。
- group 是 THREE.Group，所有物件加在裡面。update(t, s) 每格呼叫一次，t 是歌曲絕對秒數，s = { since, progress(0..1), beat(拍號), phase(0..1 到下一拍), pulse(拍點後衰減 1→0), kick(這拍大鼓強度 0..1) }。
- 決定性：同一個 t 一定畫出同一張畫面（逐格離線渲染、可能跳著算）。不准用 Math.random、Date、performance；隨機用 api.hash(a, b) 回傳 0..1。所有狀態由 t 直接算出，不要累加。
- 可用：THREE 的幾何、MeshBasicMaterial、LineBasicMaterial、ShaderMaterial、Points、InstancedMesh、CanvasTexture（document.createElement('canvas') 可以用）。不要載入外部資源、不要畫任何文字。
- 效能：物件總數 < 3000，ShaderMaterial 片段程式要輕。
- api.palette = { shadow, highlight, accent }（#rrggbb）是這段的色彩計畫：shadow 當底、highlight 當主要線面、accent 只用在少量重點。api.beats 是全曲拍點秒數。

設計要求：
- 要像資深設計師的作品：有明確的構圖與層次（前中後景）、克制的配色、有意圖的留白，不要通用的粒子噴泉、霓虹隧道、雷射放射光、彩虹漸層、鏡頭光暈這些模板感元素。
- 從這首歌的概念與歌詞轉譯出具體的圖形語言（形狀、節奏、材質），整段要隨 progress 演變，不是單一循環。
- 動態要跟音樂：重拍有反應（pulse、kick），但不要整個畫面閃爍；爆點時刻要有一個明確的變化。
- 歌詞會壓在畫面中央偏下（y -250..250），那一帶不要放高對比的細碎圖案；整體偏暗，讓白字清楚。
- 媒材：${MEDIA[design.medium ?? 'clean'].label}；畫面質感要和媒材一致。`;

const brief = `【歌曲】${song.title}
【概念】${base.concept}
【主題物件】${base.motif ? `${base.motif.kind}${base.motif.kind === 'polygon' ? `（${base.motif.sides} 邊形）` : ''}，引擎會另外畫發光線框疊在上面，你的背景可以呼應它的形狀，但不要重畫一樣的線框` : '無'}
【段落】${start.toFixed(2)}–${end.toFixed(2)} 秒（共 ${(end - start).toFixed(1)} 秒）；爆點：${moments.join('、') || '無'}
【色彩】shadow ${stop.shadow}、highlight ${stop.highlight}、accent ${stop.accent}
【BPM】約 ${song.tempo.toFixed(0)}；段落內拍點（相對秒數）：${beatsRel.join(' ')}
【這段的歌詞】（相對秒數）
${lines.join('\n') || '（間奏，無歌詞）'}`;

const SCHEMA = { type: 'object', additionalProperties: false, required: ['description', 'code'], properties: { description: { type: 'string', description: '畫面概念一兩句（繁體中文）' }, code: { type: 'string' } } };
const REVIEW = {
  type: 'object', additionalProperties: false, required: ['score', 'pass', 'problems', 'fixes'],
  properties: {
    score: { type: 'integer', description: '1–10，以專業 VJ 設計師作品為 10' },
    pass: { type: 'boolean', description: '7 分以上且沒有可讀性問題才算通過' },
    problems: { type: 'array', items: { type: 'string' } },
    fixes: { type: 'string', description: '給設計師的具體修改指示（繁體中文）' },
  },
};

const client = new Anthropic();
let usage = { input: 0, output: 0 };
async function ask<T>(system: string, content: Anthropic.Beta.Messages.BetaContentBlockParam[], schema: object, history: Anthropic.Beta.Messages.BetaMessageParam[] = []): Promise<{ data: T; raw: Anthropic.Beta.Messages.BetaMessage }> {
  const raw = await client.beta.messages
    .stream({
      model: a.model!, max_tokens: 32000, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
      thinking: { type: 'adaptive' }, output_config: { effort: 'high', format: { type: 'json_schema', schema } },
      system, messages: [...history, { role: 'user', content }],
    } as Anthropic.Beta.Messages.MessageStreamParams)
    .finalMessage();
  usage = { input: usage.input + raw.usage.input_tokens, output: usage.output + raw.usage.output_tokens };
  if (raw.stop_reason === 'refusal') throw new Error('refused');
  const text = raw.content.find((b) => b.type === 'text')?.text;
  if (!text) throw new Error(`no text (stop_reason ${raw.stop_reason})`);
  return { data: JSON.parse(text) as T, raw };
}

/** Runs the scene code in node across the range: catches exceptions, non-determinism hints and object blow-ups. */
function smoke(code: string): string | undefined {
  try {
    const g = globalThis as unknown as { document?: unknown };
    g.document ??= { createElement: () => ({ getContext: () => new Proxy({}, { get: () => () => ({ addColorStop() {} }) }), width: 0, height: 0 }) };
    const inst = new Function('THREE', 'api', code)(THREE, api) as SceneInstance;
    if (!inst?.group || typeof inst.update !== 'function') return '回傳值必須是 { group, update }';
    for (let k = 0; k <= 24; k++) {
      const t = start + ((end - start) * k) / 24;
      inst.update(t, sceneState(t, { start, end }, api));
    }
    let n = 0;
    inst.group.traverse(() => n++);
    if (n > 3500) return `物件太多（${n}），請 < 3000`;
    if (/Math\.random|Date\.now|performance\./.test(code)) return '不可使用 Math.random / Date / performance';
    return undefined;
  } catch (e) {
    return `執行錯誤：${String(e).slice(0, 400)}`;
  }
}

const dur = song.duration;
const times = [0.15, 0.4, 0.65, 0.9].map((k) => +(start + (end - start) * k).toFixed(2));
function renderStills(spec: CustomSceneSpec, round: number): string[] {
  const t = { ...base, scenes: [...(base.scenes ?? []).filter((s) => s.id !== spec.id), spec] };
  const file = join(out, `treatment_r${round}.json`);
  writeFileSync(file, JSON.stringify(t, null, 1));
  const dir = join(out, `r${round}`);
  execFileSync('npx', ['tsx', 'scripts/lyric-vj/render.mts', '--song', a.song!, '--treatment', file, '--assets', a.assets!, '--start', '0', '--end', String(dur), '--unconfirmed', '--stills', times.join(','), '--out', dir], { stdio: 'ignore' });
  return times.map((x) => join(dir, `still_${x.toFixed(2)}.png`));
}
const jpeg = (png: string) => {
  const f = png.replace(/\.png$/, '.jpg');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', png, '-vf', 'scale=960:-1', '-q:v', '3', f]);
  return { type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data: readFileSync(f).toString('base64') } };
};

const history: Anthropic.Beta.Messages.BetaMessageParam[] = [];
let request: Anthropic.Beta.Messages.BetaContentBlockParam[] = [{ type: 'text', text: `${brief}\n\n為這段寫背景動畫。` }];
let best: { spec: CustomSceneSpec; score: number } | undefined;
for (let round = 1; round <= Number(a.rounds); round++) {
  const { data, raw } = await ask<{ description: string; code: string }>(SYSTEM, request, SCHEMA, history);
  history.push({ role: 'user', content: request }, { role: 'assistant', content: raw.content as Anthropic.Beta.Messages.BetaContentBlockParam[] });
  writeFileSync(join(out, `code_r${round}.js`), data.code);
  const err = smoke(data.code);
  if (err) {
    console.log(`round ${round}: smoke failed — ${err}`);
    request = [{ type: 'text', text: `程式在測試時失敗：${err}\n請修正後輸出完整的 code。` }];
    continue;
  }
  const spec: CustomSceneSpec = { id: a.id!, start, end, code: data.code, description: data.description };
  const stills = renderStills(spec, round);
  const review = await ask<{ score: number; pass: boolean; problems: string[]; fixes: string }>(
    '你是嚴格的資深 VJ 設計總監，只根據看到的畫面判斷。',
    [{ type: 'text', text: `${brief}\n\n設計師的畫面概念：${data.description}\n以下是這段在 ${times.map((x) => `${(x - start).toFixed(1)}s`).join('、')} 的成品畫面（背景是設計師寫的程式動畫，上面疊了歌詞、主題物件與後製）。評分：設計感、構圖、配色、是否有模板感或 AI 感、歌詞是否清楚、是否符合歌曲概念。` }, ...stills.map(jpeg)],
    REVIEW,
  );
  console.log(`round ${round}: score ${review.data.score} ${review.data.pass ? 'PASS' : ''} — ${review.data.problems.join(' / ')}`);
  writeFileSync(join(out, `review_r${round}.json`), JSON.stringify(review.data, null, 1));
  if (!best || review.data.score > best.score) best = { spec, score: review.data.score };
  if (review.data.pass) break;
  request = [{ type: 'text', text: `成品畫面如下，設計總監的意見：${review.data.problems.join('；')}\n修改指示：${review.data.fixes}\n請依意見修改，輸出完整的 code。` }, ...stills.map(jpeg)];
}
if (!best) throw new Error('沒有通過測試的版本');
const final = { ...base, scenes: [...(base.scenes ?? []).filter((s) => s.id !== best!.spec.id), best.spec] };
writeFileSync(join(out, 'treatment.json'), JSON.stringify(final, null, 1));
const costUSD = +((usage.input * 4 + usage.output * 20) / 1e6).toFixed(3);
writeFileSync(join(out, 'scene.json'), JSON.stringify({ id: best.spec.id, score: best.score, description: best.spec.description, costUSD }, null, 1));
console.log(JSON.stringify({ score: best.score, description: best.spec.description, costUSD }));
