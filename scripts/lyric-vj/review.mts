// AI review (spec 5.2): keyframes + frame strips (+ database reference frames) → Claude scores against the rubric and
// proposes param / cue-style edits only; the edited treatment is re-validated.
// npx tsx --tsconfig tsconfig.json scripts/lyric-vj/review.mts --song out/indigo/song.json --treatment T.json \
//   --assets out/indigo/assets/assets.json --start 68.6 --end 89.2 --out out/indigo/review [--refs dir-of-jpgs]
import Anthropic from '@anthropic-ai/sdk';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { applyEdits, ReviewResult } from '../../src/app/lyric-vj/review';
import { TEMPLATES } from '../../src/app/lyric-vj/templates';
import { SongTimeline } from '../../src/app/lyric-vj/timeline';
import { cuesIn, EMPHASIS_METHODS, ENTER_KINDS, EXIT_KINDS, TreatmentV3, validateTreatment } from '../../src/app/lyric-vj/treatment';

const { values: a } = parseArgs({
  options: {
    song: { type: 'string' }, treatment: { type: 'string' }, assets: { type: 'string' }, start: { type: 'string' }, end: { type: 'string' },
    out: { type: 'string' }, refs: { type: 'string' }, model: { type: 'string', default: 'claude-opus-5-5' },
    reuse: { type: 'boolean', default: false }, // re-apply an existing review.json without calling the model
  },
});
const env = join(homedir(), '.config/vjflow/anthropic.env');
if (!process.env['ANTHROPIC_API_KEY'] && existsSync(env))
  for (const line of readFileSync(env, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].trim();
  }
const song: SongTimeline = JSON.parse(readFileSync(a.song!, 'utf8'));
const win = { start: Number(a.start), end: Number(a.end) };
const t: TreatmentV3 = JSON.parse(readFileSync(a.treatment!, 'utf8'));
const out = a.out!;
mkdirSync(out, { recursive: true });

// ---- frames to look at: 2 keyframes per shot; 8-frame strips over 0.6 s for every cue entrance and shot change
const LEAD = 0.12;
const keyframes = t.shots.flatMap((s) => [s.start + (s.end - s.start) * 0.4, s.start + (s.end - s.start) * 0.8].map((x) => ({ label: `鏡頭 ${s.id} 關鍵畫面 ${x.toFixed(2)}s`, times: [x] })));
const strips = [
  ...cuesIn(song, win).map((c) => ({ label: `歌詞 ${c.id} 進場（${(c.start - LEAD - 0.05).toFixed(2)}s 起 0.6 秒，8 格）`, t0: c.start - LEAD - 0.05 })),
  ...t.shots.slice(1).map((s) => ({ label: `轉場到鏡頭 ${s.id}（${(s.start - 0.15).toFixed(2)}s 起 0.6 秒，8 格）`, t0: s.start - 0.15 })),
].map((x) => ({ label: x.label, times: Array.from({ length: 8 }, (_, i) => +(x.t0 + i * 0.075).toFixed(3)) }));
const all = [...new Set([...keyframes, ...strips].flatMap((x) => x.times))].filter((x) => x >= win.start && x < win.end);
execFileSync('npx', ['tsx', '--tsconfig', 'tsconfig.json', 'scripts/lyric-vj/render.mts', '--song', a.song!, '--treatment', a.treatment!,
  ...(a.assets ? ['--assets', a.assets] : []), '--start', String(win.start), '--end', String(win.end), '--out', out, '--stills', all.join(',')], { stdio: 'inherit' });
const still = (x: number) => join(out, `still_${x.toFixed(2)}.png`);
const images: { label: string; file: string }[] = [];
keyframes.forEach((k, i) => {
  const f = join(out, `key_${i}.jpg`);
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', still(k.times[0]), '-vf', 'scale=1280:-2', '-q:v', '3', f]);
  images.push({ label: k.label, file: f });
});
strips.forEach((s, i) => {
  const f = join(out, `strip_${i}.jpg`);
  const ins = s.times.filter((x) => existsSync(still(x)));
  if (ins.length < 8) return;
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...ins.flatMap((x) => ['-i', still(x)]), '-filter_complex',
    `${ins.map((_, j) => `[${j}]scale=480:-2[v${j}]`).join(';')};${ins.map((_, j) => `[v${j}]`).join('')}xstack=inputs=8:layout=0_0|w0_0|w0+w1_0|w0+w1+w2_0|0_h0|w0_h0|w0+w1_h0|w0+w1+w2_h0`, '-q:v', '3', f]);
  images.push({ label: s.label + '（左上→右上→左下→右下）', file: f });
});
const refs = a.refs && existsSync(a.refs) ? readdirSync(a.refs).filter((f) => f.endsWith('.jpg')).slice(0, 6).map((f) => ({ label: `資料庫參考畫面 ${f}`, file: join(a.refs!, f) })) : [];

// ---- ask
const RUBRIC = `1. 段落與鏡頭邊界落在歌詞句首或明顯的能量變化上；副歌從副歌第一句開始。
2. 副歌的畫面家族一致而且逐次加強。
3. 畫面對應歌詞的意象和情緒。
4. 相鄰鏡頭有足夠對比，整體有起伏。
5. 歌詞清楚可讀，不被亮處吃掉。（文字壓在人物或主體上不算缺點，不要為此移動文字。）
6. 構圖：主體位置、地平線合理，沒有過曝或全黑。
7. 每一幕都有設計過的版面，而不是字放在中央。
8. 素材風格一致（畫風、配色）。
9. 對照資料庫參考畫面，質感不明顯落後（沒有參考畫面時依一般專業歌詞 VJ 判斷）。
10. 持續動態：畫面不能長時間靜止；靜態插畫只靠慢推鏡、人物不動，視為明顯缺點。不要為了克制而減少閃光、踩拍或動態。`;
const paramProps: Record<string, object> = {};
for (const tp of Object.values(TEMPLATES))
  for (const [k, p] of Object.entries(tp.params)) paramProps[k] = p.type === 'number' ? { type: 'number' } : p.type === 'boolean' ? { type: 'boolean' } : p.type === 'text' ? { type: 'string' } : { type: 'string', enum: p.values };
const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['scores', 'issues', 'edits', 'assetUnusable'],
  properties: {
    scores: { type: 'object', additionalProperties: false, required: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'], properties: Object.fromEntries(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'].map((k) => [k, { type: 'integer' }])) },
    issues: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['target', 'criterion', 'problem'], properties: { target: { type: 'string' }, criterion: { type: 'integer' }, problem: { type: 'string' } } } },
    edits: { type: 'object', additionalProperties: false, required: ['shots', 'cues'], properties: {
      shots: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'params'], properties: { id: { type: 'string' }, params: { type: 'object', additionalProperties: false, properties: paramProps } } } },
      cues: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['cueId'], properties: {
        cueId: { type: 'string' }, enter: { type: 'string', enum: ENTER_KINDS }, exit: { type: 'string', enum: EXIT_KINDS }, accents: { type: 'array', items: { type: 'integer' } }, rows: { type: 'array', items: { type: 'integer' } },
        emphasis: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['from', 'to', 'method'], properties: { from: { type: 'integer' }, to: { type: 'integer' }, method: { type: 'string', enum: EMPHASIS_METHODS } } } } } } } } },
    assetUnusable: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'reason'], properties: { id: { type: 'string' }, reason: { type: 'string' } } } },
  },
};
const metrics = existsSync(join(out, '..', 'metrics.json')) ? readFileSync(join(out, '..', 'metrics.json'), 'utf8') : '（無）';
const content: Anthropic.Beta.Messages.BetaContentBlockParam[] = [];
for (const im of [...images, ...refs]) {
  content.push({ type: 'text', text: im.label });
  content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: readFileSync(im.file).toString('base64') } });
}
content.push({ type: 'text', text: `以上是歌詞 VJ 的關鍵畫面與動態幀序列。依評分標準每項打 1–5 分，指出具體問題（target 寫鏡頭或歌詞 ID），並提出修改。
修改只能改模板參數與歌詞樣式（不可改時間、鏡頭結構或素材）；只有素材根本不能用時才列在 assetUnusable 並寫理由。
注意：幀序列只能看出大致動態，踩拍與可讀時間以自動量測為準。

【評分標準】\n${RUBRIC}\n\n【企劃】\n${JSON.stringify(t)}\n\n【歌詞時間軸】\n${cuesIn(song, win).map((c) => `${c.id} ${c.start.toFixed(2)}–${c.end.toFixed(2)}s「${c.text}」`).join('\n')}\n\n【自動量測】\n${metrics}\n\n【模板參數範圍】\n${Object.values(TEMPLATES).map((x) => `${x.id}: ${Object.entries(x.params).map(([k, p]) => `${k} ${p.type === 'number' ? `${p.min}–${p.max}` : p.type === 'enum' ? p.values.join('/') : p.type === 'text' ? 'text' : 'bool'}`).join(', ')}`).join('\n')}`});

const began = Date.now();
let review: ReviewResult;
let cost = 0;
if (a.reuse) {
  review = JSON.parse(readFileSync(join(out, 'review.json'), 'utf8'));
} else {
const message = await new Anthropic().beta.messages
  .stream({
    model: a.model!, max_tokens: 32000, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
    output_config: { effort: 'high', format: { type: 'json_schema', schema: SCHEMA } },
    system: '你是嚴格的歌詞 VJ 藝術總監，以日本地下偶像 Live House 的專業歌詞 VJ 為標準審片。只根據看到的畫面與資料判斷。',
    messages: [{ role: 'user', content }],
  } as Anthropic.Beta.Messages.MessageStreamParams)
  .finalMessage();
if (message.stop_reason === 'refusal') throw new Error(`Refused: ${JSON.stringify(message.stop_details)}`);
const text = message.content.find((b) => b.type === 'text')?.text;
if (!text) throw new Error(`No text in response (stop_reason ${message.stop_reason})`);
review = JSON.parse(text) as ReviewResult;
cost = (message.usage.input_tokens * 4 + message.usage.output_tokens * 20) / 1e6;
}
// a review may only use params the shot's template has; drop the rest instead of failing the whole edit
const dropped: string[] = [];
for (const e of review.edits.shots) {
  const spec = TEMPLATES[t.shots.find((s) => s.id === e.id)?.template ?? ''];
  for (const k of Object.keys(e.params)) if (!spec || !(k in spec.params)) {
    dropped.push(`鏡頭 ${e.id} 的參數 ${k} 不屬於其模板，已忽略`);
    delete e.params[k];
  }
}
const { treatment, ignored } = applyEdits(t, review.edits);
ignored.push(...dropped);
const checked = validateTreatment(treatment, song, win, TEMPLATES);
writeFileSync(join(out, 'treatment.reviewed.json'), JSON.stringify(checked.treatment, null, 1));
const log = { ...review, ignored, validationErrors: checked.errors, fixes: checked.fixes, images: images.length + refs.length, seconds: Math.round((Date.now() - began) / 1000), costUSD: +cost.toFixed(3) };
writeFileSync(join(out, 'review.json'), JSON.stringify(log, null, 1));
console.log(JSON.stringify({ scores: review.scores, issues: review.issues.length, edits: review.edits, assetUnusable: review.assetUnusable, validationErrors: checked.errors, costUSD: log.costUSD }, null, 1));
