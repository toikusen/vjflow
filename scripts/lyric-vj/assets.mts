// Assets (spec 3.2/3.3): style-anchor image first, other images with it as reference, then Veo clips from their images.
// Cached by a hash of model + prompt + reference; a per-song budget stops generation before it is exceeded.
// npx tsx --tsconfig tsconfig.json scripts/lyric-vj/assets.mts --treatment out/indigo/hand/treatment.json --out out/indigo/assets [--budget 10]
import { MEDIA } from '../../src/app/lyric-vj/medium';
import { GoogleGenAI } from '@google/genai';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { neededAssets } from '../../src/app/lyric-vj/look';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { LANGUAGES, LanguageId } from '../../src/app/lyric-vj/languages';
import type { AssetSource } from '../../src/app/lyric-vj/render/engine';
import { STYLES } from '../../src/app/lyric-vj/styles';
import { Tier, TIERS } from '../../src/app/lyric-vj/tiers';
import { jobIdFor, jobStatus, outPath } from './status.mts';
import { TreatmentV3 } from '../../src/app/lyric-vj/treatment';

const { values: a } = parseArgs({
  options: {
    treatment: { type: 'string' }, out: { type: 'string' }, budget: { type: 'string' }, tier: { type: 'string', default: 'standard' }, job: { type: 'string' }, fps: { type: 'string', default: '30' },
    'image-model': { type: 'string', default: 'gemini-3.1-flash-image' }, 'style-id': { type: 'string', default: 'emotional' }, 'video-model': { type: 'string' },
    // vertex: Google Cloud project quota (no 10-clips/day cap); gemini: Gemini API key
    'video-backend': { type: 'string' },
    // scenes for the song's own drawing: every picture, full-bleed (the drawing uses them as its worlds)
    scenes: { type: 'boolean', default: false },
    // pictures asked for by name (a board's photos, boardplan.mts): made whatever the look shows
    ids: { type: 'string' },
  },
});
// official list prices (2026-10): Flash Image 2K $0.101/image; Veo 3.1 Fast 1080p $0.12/s
const PRICE = { image: 0.101, videoPerSec: 0.12 };
const NO_TEXT = `${STYLES[a['style-id']!]?.assetSuffix ?? ''} Absolutely no text, no letters, no subtitles, no logos, no watermark.`;
const t: TreatmentV3 = JSON.parse(readFileSync(a.treatment!, 'utf8'));
a.budget ??= String(TIERS[a.tier as Tier]?.budgetUSD ?? 20);
const out = a.out!;
mkdirSync(out, { recursive: true });
const ledgerPath = join(out, 'costs.json');
const ledger: { item: string; usd: number; at: string }[] = existsSync(ledgerPath) ? JSON.parse(readFileSync(ledgerPath, 'utf8')) : [];
const spent = () => ledger.reduce((s, x) => s + x.usd, 0);
const afford = (item: string, usd: number) => {
  if (spent() + usd > Number(a.budget)) throw new Error(`素材費用上限 US$${a.budget}：已花 ${spent().toFixed(2)}，${item} 需要 ${usd.toFixed(2)}`);
};
/** Recorded only after a successful generation (failed requests are not billed as outputs). */
const charge = (item: string, usd: number) => {
  ledger.push({ item, usd, at: new Date().toISOString() });
  writeFileSync(ledgerPath, JSON.stringify(ledger, null, 1));
};
const ai = new GoogleGenAI({ apiKey: process.env['GEMINI_API_KEY'] });
// Vertex settings (project id, region) live in ~/.config/vjflow/vertex.env; auth is gcloud application-default credentials
const vertexEnv = join(homedir(), '.config/vjflow/vertex.env');
if (existsSync(vertexEnv)) {
  for (const line of readFileSync(vertexEnv, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
const backend = a['video-backend'] ?? (process.env['GOOGLE_CLOUD_PROJECT'] ? 'vertex' : 'gemini');
const videoModel = a['video-model'] ?? (backend === 'vertex' ? 'veo-3.1-fast-generate-001' : 'veo-3.1-fast-generate-preview');
const videoAi =
  backend === 'vertex'
    ? new GoogleGenAI({ vertexai: true, project: process.env['GOOGLE_CLOUD_PROJECT'], location: process.env['GOOGLE_CLOUD_LOCATION'] ?? 'us-central1' })
    : ai;
if (backend === 'vertex' && !process.env['GOOGLE_CLOUD_PROJECT']) throw new Error(`Vertex AI 需要 GOOGLE_CLOUD_PROJECT（寫在 ${vertexEnv}）`);
const hash = (...parts: string[]) => createHash('sha1').update(parts.join('\u0000')).digest('hex').slice(0, 12);

async function image(id: string, prompt: string, ref?: Buffer): Promise<string> {
  const key = hash(a['image-model']!, prompt, ref ? hash(ref.toString('base64')) : '');
  const file = join(out, `${id}_${key}.jpg`);
  if (existsSync(file)) return file;
  afford(`image ${id}`, PRICE.image);
  const input: object[] = [{ type: 'text', text: prompt }];
  if (ref) input.push({ type: 'image', mime_type: 'image/jpeg', data: ref.toString('base64') });
  // the model sometimes completes with no picture: ask again (up to three times) before giving up
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let r: any;
  for (let tries = 0; tries < 3 && !r?.output_image?.data; tries++) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      r = await (ai as any).interactions.create({
        model: a['image-model'], input,
        response_format: { type: 'image', mime_type: 'image/jpeg', aspect_ratio: '16:9', image_size: '2K' },
      });
    } catch (e) {
      // rate limits and server hiccups pass; billing (402) and bad requests do not, so they fail at once
      const status = Number((e as { status?: number }).status);
      if (tries >= 2 || !(status === 429 || status >= 500 || !status)) throw e;
      await new Promise((ok) => setTimeout(ok, 8000 * 3 ** tries));
    }
  }
  if (!r.output_image?.data) throw new Error(`圖片 ${id} 沒有產出：${JSON.stringify(r).slice(0, 400)}`);
  writeFileSync(file, Buffer.from(r.output_image.data, 'base64'));
  charge(`image ${id}`, PRICE.image);
  return file;
}

async function video(id: string, prompt: string, first: string): Promise<string> {
  const ref = hash(readFileSync(first).toString('base64'));
  // the same Veo model under its Gemini API (preview) and Vertex (-001) names shares one cache entry
  const family = videoModel.replace(/-(preview|\d{3})$/, '');
  const file = join(out, `${id}_${hash(family, prompt, ref)}.mp4`);
  if (existsSync(file)) return file;
  const legacy = join(out, `${id}_${hash(`${family}-preview`, prompt, ref)}.mp4`);
  if (existsSync(legacy)) return legacy;
  afford(`video ${id}`, PRICE.videoPerSec * 8);
  let op;
  for (let attempt = 0; ; attempt++) {
    try {
      op = await videoAi.models.generateVideos({
    model: videoModel, prompt,
    image: { imageBytes: readFileSync(first).toString('base64'), mimeType: 'image/jpeg' },
    config: { aspectRatio: '16:9', resolution: '1080p', durationSeconds: 8, negativePrompt: 'text, letters, subtitles, captions, watermark, logo' },
  });
      break;
    } catch (e) {
      // Gemini API Tier 1: 2 requests/min and 10/day; Vertex: per-minute project quota. Wait out the minute twice.
      if (!/429|RESOURCE_EXHAUSTED/.test(String(e)) || attempt >= 2) {
        throw new Error(attempt >= 2 ? `Veo 額度用完（${backend === 'vertex' ? 'Vertex 專案配額' : 'Gemini API 每日約 10 段'}）：${String(e).slice(0, 160)}` : String(e));
      }
      console.log(`  Veo 限流，${65}s 後重試…`);
      await new Promise((r) => setTimeout(r, 65_000));
    }
  }
  const began = Date.now();
  while (!op.done) {
    await new Promise((r) => setTimeout(r, 10_000));
    op = await videoAi.operations.getVideosOperation({ operation: op });
    process.stdout.write(`\r  video ${id}: ${Math.round((Date.now() - began) / 1000)}s`);
  }
  console.log();
  const v = op.response?.generatedVideos?.[0]?.video;
  if (!v) throw new Error(`影片 ${id} 沒有產出：${JSON.stringify(op.error ?? op.response).slice(0, 400)}`);
  // Vertex returns the clip inline (no outputGcsUri); the Gemini API returns a file to download
  if (v.videoBytes) writeFileSync(file, Buffer.from(v.videoBytes, 'base64'));
  else await videoAi.files.download({ file: v, downloadPath: file });
  charge(`video ${id}`, PRICE.videoPerSec * 8);
  return file;
}

const manifest: Record<string, AssetSource> = {};
// with a graphic look the pictures show only through its photo layers (the engine hides the full-frame plates), so
// only those are generated; a photo layer without an asset shows the shot's picture
// scenes only for a handmade medium (languages.ts): elsewhere the drawing paints its own world
const sceneLang = t.design?.language ? LANGUAGES[t.design.language as LanguageId] : undefined;
const asked = a.ids ? new Set(a.ids.split(',')) : undefined;
if (a.scenes && !asked && !sceneLang?.scenes) {
  console.log(`no scene pictures for ${t.design?.language ?? 'this design'}: its medium does not carry pictures`);
  process.exit(0);
}
const needed = asked ?? (a.scenes ? new Set(t.assets.map((x) => x.id)) : neededAssets(t));
const unused = t.assets.filter((x) => !needed.has(x.id)).map((x) => x.id);
if (unused.length) console.log(`skip ${unused.length} pictures the graphic look never shows: ${unused.join(', ')}`);
t.assets = t.assets.filter((x) => needed.has(x.id));
const images = t.assets.filter((x) => x.kind === 'image');
const status = jobStatus(a.job ?? jobIdFor(dirname(a.treatment!)), { tier: a.tier, style: STYLES[a['style-id']!]?.name });
const usdOf = (id: string) => ledger.filter((x) => x.item.endsWith(` ${id}`)).reduce((s, x) => s + x.usd, 0) || undefined;
status.stage('assets', { state: 'running', done: 0, total: t.assets.length, costUSD: +spent().toFixed(3) });
for (const x of t.assets) status.item('assets', { id: x.id, kind: x.kind, state: 'pending' });
// observes (does not handle) crashes, including rejected top-level awaits
process.on('uncaughtExceptionMonitor', (e) => status.stage('assets', { state: 'failed', message: String(e).slice(0, 300) }));
// the song's medium decides how every picture is rendered (medium.ts)
const look = MEDIA[t.design?.medium ?? 'clean'].look;
let anchor: Buffer | undefined;
const failedImages: string[] = [];
for (const img of images) {
  // the first image is the style anchor; every later image is generated with it as a reference (spec 3.3)
  // as a drawing's world the picture fills the frame and is drawn in the same medium as the song's props
  const lang = t.design?.language ? LANGUAGES[t.design.language as LanguageId] : undefined;
  const sceneRules = a.scenes ? ` Full-bleed scene filling the whole frame edge to edge: not a model on a table, no visible tabletop, base, frame or border. No signboards with writing.${lang?.props ? ` Drawn as ${lang.props.style}.` : ''}` : '';
  const prompt = `${look}. ${t.styleAnchor.prompt}. ${img.prompt}. 16:9 background plate for a lyric video, leave calm space for typography.${sceneRules} ${NO_TEXT}`;
  status.item('assets', { id: img.id, kind: 'image', state: 'running' });
  let file: string;
  try {
    file = await image(img.id, prompt, anchor);
  } catch (e) {
    // the song goes on without this picture (a photo layer with no picture draws nothing; the graphic look carries
    // the frame): a paying user gets a video, not an error (cel80s died here when the image credits ran out)
    const msg = (e as Error).message;
    console.error(`圖片 ${img.id} 生成失敗，這張圖先不用：${msg.slice(0, 200)}`);
    if (/402|prepayment|credits|billing/i.test(msg)) console.error('##ALERT 生圖額度用完，請到 AI Studio 儲值');
    failedImages.push(img.id);
    status.item('assets', { id: img.id, kind: 'image', state: 'failed', note: msg.slice(0, 200) });
    continue;
  }
  anchor ??= readFileSync(file);
  status.item('assets', { id: img.id, kind: 'image', state: 'done', file: outPath(file), usd: usdOf(img.id) });
  status.stage('assets', { costUSD: +spent().toFixed(3) });
  manifest[img.id] = { kind: 'image', url: file };
  console.log(`image ${img.id} → ${file}`);
}
const missing: string[] = [];
for (const vid of t.assets.filter((x) => x.kind === 'video')) {
  const from = manifest[vid.from!];
  if (!from && failedImages.includes(vid.from!)) continue; // its picture failed: the clip goes too
  if (!from) throw new Error(`影片 ${vid.id} 的 from ${vid.from} 不是已生成的圖片`);
  let file: string;
  status.item('assets', { id: vid.id, kind: 'video', state: 'running', file: outPath(from.url) });
  try {
    file = await video(vid.id, `${look}. ${t.styleAnchor.prompt}. ${vid.prompt}. Smooth cinematic motion, seamless, no cuts. ${NO_TEXT}`, from.url);
  } catch (e) {
    // keep going with the still (rendered with camera moves); a later run fills the clip from the cache-miss
    console.error(`影片 ${vid.id} 生成失敗，先用圖片 ${vid.from} 代替：${(e as Error).message.slice(0, 200)}`);
    manifest[vid.id] = { kind: 'image', url: from.url };
    missing.push(vid.id);
    status.item('assets', { id: vid.id, kind: 'video', state: 'failed', file: outPath(from.url), note: `改用靜態圖：${(e as Error).message.slice(0, 200)}` });
    continue;
  }
  const dir = file.replace(/\.mp4$/, '_frames');
  if (!existsSync(dir)) {
    mkdirSync(dir);
    execFileSync('ffmpeg', ['-loglevel', 'error', '-i', file, '-vf', `fps=${a.fps},scale=1920:1080`, '-q:v', '2', join(dir, '%05d.jpg')]);
  }
  const count = readdirSync(dir).filter((f) => f.endsWith('.jpg')).length;
  manifest[vid.id] = { kind: 'video', url: from.url, frames: { pattern: join(dir, '%05d.jpg'), count, fps: Number(a.fps) } };
  console.log(`video ${vid.id} → ${file} (${count} frames)`);
  status.item('assets', { id: vid.id, kind: 'video', state: 'done', file: outPath(file), usd: usdOf(vid.id) });
  status.stage('assets', { costUSD: +spent().toFixed(3) });
}
writeFileSync(join(out, 'assets.json'), JSON.stringify(manifest, null, 1));
console.log(JSON.stringify({ spentUSD: +spent().toFixed(3), budgetUSD: Number(a.budget), assets: Object.keys(manifest), stillInsteadOfVideo: missing, failedImages }, null, 1));
status.stage('assets', { state: 'done', costUSD: +spent().toFixed(3), message: [missing.length ? `${missing.length} 段影片改用靜態圖：${missing.join(', ')}` : '', failedImages.length ? `${failedImages.length} 張圖沒有生成：${failedImages.join(', ')}` : ''].filter(Boolean).join('；') || undefined });
if (missing.length) process.exitCode = 3;
