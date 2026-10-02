// Assets (spec 3.2/3.3): style-anchor image first, other images with it as reference, then Veo clips from their images.
// Cached by a hash of model + prompt + reference; a per-song budget stops generation before it is exceeded.
// npx tsx --tsconfig tsconfig.json scripts/lyric-vj/assets.mts --treatment out/indigo/hand/treatment.json --out out/indigo/assets [--budget 10]
import { GoogleGenAI } from '@google/genai';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import type { AssetSource } from '../../src/app/lyric-vj/render/engine';
import { TreatmentV3 } from '../../src/app/lyric-vj/treatment';

const { values: a } = parseArgs({
  options: {
    treatment: { type: 'string' }, out: { type: 'string' }, budget: { type: 'string', default: '10' }, fps: { type: 'string', default: '30' },
    'image-model': { type: 'string', default: 'gemini-3.1-flash-image' }, 'video-model': { type: 'string', default: 'veo-3.1-fast-generate-preview' },
  },
});
// official list prices (2026-10): Flash Image 2K $0.101/image; Veo 3.1 Fast 1080p $0.12/s
const PRICE = { image: 0.101, videoPerSec: 0.12 };
const NO_TEXT = 'Absolutely no text, no letters, no characters, no subtitles, no logos, no watermark.';
const t: TreatmentV3 = JSON.parse(readFileSync(a.treatment!, 'utf8'));
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
const hash = (...parts: string[]) => createHash('sha1').update(parts.join('\u0000')).digest('hex').slice(0, 12);

async function image(id: string, prompt: string, ref?: Buffer): Promise<string> {
  const key = hash(a['image-model']!, prompt, ref ? hash(ref.toString('base64')) : '');
  const file = join(out, `${id}_${key}.jpg`);
  if (existsSync(file)) return file;
  afford(`image ${id}`, PRICE.image);
  const input: object[] = [{ type: 'text', text: prompt }];
  if (ref) input.push({ type: 'image', mime_type: 'image/jpeg', data: ref.toString('base64') });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r: any = await (ai as any).interactions.create({
    model: a['image-model'], input,
    response_format: { type: 'image', mime_type: 'image/jpeg', aspect_ratio: '16:9', image_size: '2K' },
  });
  if (!r.output_image?.data) throw new Error(`圖片 ${id} 沒有產出：${JSON.stringify(r).slice(0, 400)}`);
  writeFileSync(file, Buffer.from(r.output_image.data, 'base64'));
  charge(`image ${id}`, PRICE.image);
  return file;
}

async function video(id: string, prompt: string, first: string): Promise<string> {
  const key = hash(a['video-model']!, prompt, hash(readFileSync(first).toString('base64')));
  const file = join(out, `${id}_${key}.mp4`);
  if (existsSync(file)) return file;
  afford(`video ${id}`, PRICE.videoPerSec * 8);
  let op = await ai.models.generateVideos({
    model: a['video-model']!, prompt,
    image: { imageBytes: readFileSync(first).toString('base64'), mimeType: 'image/jpeg' },
    config: { aspectRatio: '16:9', resolution: '1080p', durationSeconds: 8, negativePrompt: 'text, letters, subtitles, captions, watermark, logo' },
  });
  const began = Date.now();
  while (!op.done) {
    await new Promise((r) => setTimeout(r, 10_000));
    op = await ai.operations.getVideosOperation({ operation: op });
    process.stdout.write(`\r  video ${id}: ${Math.round((Date.now() - began) / 1000)}s`);
  }
  console.log();
  const v = op.response?.generatedVideos?.[0]?.video;
  if (!v) throw new Error(`影片 ${id} 沒有產出：${JSON.stringify(op.error ?? op.response).slice(0, 400)}`);
  await ai.files.download({ file: v, downloadPath: file });
  charge(`video ${id}`, PRICE.videoPerSec * 8);
  return file;
}

const manifest: Record<string, AssetSource> = {};
const images = t.assets.filter((x) => x.kind === 'image');
let anchor: Buffer | undefined;
for (const img of images) {
  // the first image is the style anchor; every later image is generated with it as a reference (spec 3.3)
  const prompt = `${t.styleAnchor.prompt}. ${img.prompt}. Cinematic 16:9 background plate for a lyric video, leave calm space for typography. ${NO_TEXT}`;
  const file = await image(img.id, prompt, anchor);
  anchor ??= readFileSync(file);
  manifest[img.id] = { kind: 'image', url: file };
  console.log(`image ${img.id} → ${file}`);
}
for (const vid of t.assets.filter((x) => x.kind === 'video')) {
  const from = manifest[vid.from!];
  if (!from) throw new Error(`影片 ${vid.id} 的 from ${vid.from} 不是已生成的圖片`);
  const file = await video(vid.id, `${t.styleAnchor.prompt}. ${vid.prompt}. Smooth cinematic motion, seamless, no cuts. ${NO_TEXT}`, from.url);
  const dir = file.replace(/\.mp4$/, '_frames');
  if (!existsSync(dir)) {
    mkdirSync(dir);
    execFileSync('ffmpeg', ['-loglevel', 'error', '-i', file, '-vf', `fps=${a.fps},scale=1920:1080`, '-q:v', '2', join(dir, '%05d.jpg')]);
  }
  const count = readdirSync(dir).filter((f) => f.endsWith('.jpg')).length;
  manifest[vid.id] = { kind: 'video', url: from.url, frames: { pattern: join(dir, '%05d.jpg'), count, fps: Number(a.fps) } };
  console.log(`video ${vid.id} → ${file} (${count} frames)`);
}
writeFileSync(join(out, 'assets.json'), JSON.stringify(manifest, null, 1));
console.log(JSON.stringify({ spentUSD: +spent().toFixed(3), budgetUSD: Number(a.budget), assets: Object.keys(manifest) }, null, 1));
