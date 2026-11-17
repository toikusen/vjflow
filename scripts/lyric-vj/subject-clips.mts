// Subject-video tier, phase 2b: one Veo clip per video shot from its chroma still (the still is the first frame, so the
// clip stays on its chroma screen), locked camera, then the cleanest seconds keyed frame by frame (key_frames.py) into a sprite
// clip at the language's frame rate. A clip that exists is kept; delete it to generate again.
// npx tsx scripts/lyric-vj/subject-clips.mts --script run2/script.json --out run2 [--only S03] [--in 0.5 --len 1.5] [--fps 12]
//   [--video-model veo-3.1-generate-001]
import { GoogleGenAI } from '@google/genai';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import type { SubjectScript } from '../../src/app/lyric-vj/subject-script';
import { SCREENS, type ScreenName } from './chroma-screen.mts';

const { values: a } = parseArgs({
  options: {
    script: { type: 'string' }, out: { type: 'string' }, only: { type: 'string' }, in: { type: 'string', default: '0.5' }, len: { type: 'string', default: '1.5' },
    fps: { type: 'string', default: '12' }, 'video-model': { type: 'string', default: 'veo-3.1-generate-001' }, height: { type: 'string', default: '720' },
  },
});
// Vertex Veo 3.1 video-only 1080p $0.20/s, Fast $0.12/s (cloud.google.com/vertex-ai/generative-ai/pricing, 2026-11)
const VIDEO_PRICE_PER_SEC: Record<string, number> = { 'veo-3.1-generate-001': 0.2, 'veo-3.1-fast-generate-001': 0.12 };
const CLIP_SEC = 8;
const out = a.out!;
const script: SubjectScript = JSON.parse(readFileSync(a.script!, 'utf8'));
const only = a.only ? new Set(a.only.split(',')) : undefined;
mkdirSync(join(out, 'clips'), { recursive: true });
const ledgerPath = join(out, 'costs.json');
const ledger = (): { item: string; usd: number; at: string; model: string }[] => (existsSync(ledgerPath) ? JSON.parse(readFileSync(ledgerPath, 'utf8')) : []);
const charge = (item: string, usd: number, model: string) => writeFileSync(ledgerPath, JSON.stringify([...ledger(), { item, usd: +usd.toFixed(4), at: new Date().toISOString(), model }], null, 1));
const spent = () => ledger().reduce((s, x) => s + x.usd, 0);
for (const f of [join(homedir(), '.config/vjflow/gemini.env'), join(homedir(), '.config/vjflow/vertex.env')]) if (existsSync(f)) for (const line of readFileSync(f, 'utf8').split('\n')) { const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; }
const videoAi = new GoogleGenAI({ vertexai: true, project: process.env['GOOGLE_CLOUD_PROJECT'], location: process.env['GOOGLE_CLOUD_LOCATION'] ?? 'us-central1' });

// the screen each still was drawn on (subject-stills.mts screens.json; stills from before it are on green)
const screensPath = join(out, 'screens.json');
const screenOf = (id: string): ScreenName => (existsSync(screensPath) ? (JSON.parse(readFileSync(screensPath, 'utf8')) as Record<string, ScreenName>)[`${id}.jpg`] : undefined) ?? 'green';
// (no word for camera gear: "on a tripod" put a tripod under Tokyo Drift's S04 car, 2026-11-17)
const LOCKED = (screen: ScreenName) => `Static shot: the view does not move at all, no zoom, no pan, no cut. The flat ${screen} background stays exactly as it is: nothing enters it, no shadows appear on it, no new objects.`;
const NEGATIVE = 'camera movement, zoom, pan, people walking in, extra limbs, extra fingers, deformed hands, morphing, text, letters, logo, shadow on the ground, background change';

/** One Veo clip from the shot's chroma still (first frame), video only, 1080p 16:9. */
async function clip(file: string, prompt: string, first: string) {
  if (existsSync(file)) return;
  const model = a['video-model']!;
  const usd = (VIDEO_PRICE_PER_SEC[model] ?? 0.2) * CLIP_SEC;
  writeFileSync(file.replace(/\.mp4$/, '.txt'), prompt);
  let op;
  for (let attempt = 0; ; attempt++) {
    try {
      op = await videoAi.models.generateVideos({
        model, prompt,
        image: { imageBytes: readFileSync(first).toString('base64'), mimeType: 'image/jpeg' },
        config: { aspectRatio: '16:9', resolution: '1080p', durationSeconds: CLIP_SEC, generateAudio: false, negativePrompt: NEGATIVE },
      });
      break;
    } catch (e) {
      if (!/429|RESOURCE_EXHAUSTED/.test(String(e)) || attempt >= 3) throw e;
      console.log('  Veo rate limit, waiting 65 s');
      await new Promise((r) => setTimeout(r, 65_000));
    }
  }
  const began = Date.now();
  while (!op.done) {
    await new Promise((r) => setTimeout(r, 10_000));
    op = await videoAi.operations.getVideosOperation({ operation: op });
  }
  const v = op.response?.generatedVideos?.[0]?.video;
  if (!v) throw new Error(`no video for ${file}: ${JSON.stringify(op.error ?? op.response).slice(0, 400)}`);
  if (v.videoBytes) writeFileSync(file, Buffer.from(v.videoBytes, 'base64'));
  else await videoAi.files.download({ file: v, downloadPath: file });
  charge(`video ${file.split('/').pop()}`, usd, model);
  console.log(`video ${file} (${Math.round((Date.now() - began) / 1000)} s)`);
}

/** Contact sheet (4 fps, 4 across) of a clip for the eye. */
function sheet(mp4: string) {
  const jpg = mp4.replace(/\.mp4$/, '_sheet.jpg');
  if (!existsSync(jpg)) execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', mp4, '-vf', 'fps=4,scale=480:-1,tile=4x8', '-q:v', '3', jpg]);
}

const usd0 = spent();
for (const s of script.shots.filter((x) => x.kind === 'video' && (!only || only.has(x.id)))) {
  const still = join(out, 'stills', `${s.id}.jpg`);
  if (!existsSync(still)) throw new Error(`${s.id}: still missing, draw it first`);
  const mp4 = join(out, 'clips', `${s.id}.mp4`);
  const screen = SCREENS.find((x) => x.name === screenOf(s.id))!;
  // a close shot's square still is padded to the clip's 16:9 with the same chroma screen: sent as is, Veo pillarboxed it in black
  const first = join(out, 'clips', `${s.id}_first.jpg`);
  if (!existsSync(first)) execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', still, '-vf', `scale=w=1920:h=1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x${screen.hex.slice(1)}`, '-q:v', '2', first]);
  await clip(mp4, `${s.subject} ${LOCKED(screen.name)} Keep every subject exactly as in the first frame: same design, same colours, same halftone print look; it is a risograph print that moves, not a photo. Only the described motion, slow and contained.`, first);
  sheet(mp4);
  // the cleanest seconds, keyed frame by frame at the language's frame rate
  const dir = join(out, 'clips', `${s.id}_f`);
  if (!existsSync(join(dir, 'frames.json'))) {
    const r = execFileSync('uv', ['run', '--with', 'numpy', '--with', 'pillow', '--with', 'scipy', 'python', 'scripts/lyric-vj/key_frames.py', mp4, dir, '--in', a.in!, '--len', a.len!, '--fps', a.fps!, '--height', a.height!, '--screen', screen.name]).toString().trim();
    console.log(`keyed ${s.id}: ${r}`);
  }
}
console.log(JSON.stringify({ spentUSD: +spent().toFixed(3), thisRunUSD: +(spent() - usd0).toFixed(3) }));
