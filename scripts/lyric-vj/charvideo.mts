// Character video tier (experiment): one consistent character in many short AI clips and stills under the kinetic type.
// A per-song plan (plan.json) names the character, the style and every shot (a still prompt, a motion prompt for the
// clips, which side the lyric takes, which clip seconds to use); this script draws the character sheet, every shot's
// still with the sheet as reference, a Veo clip for every video shot from its still, then edits: cuts on the song's own
// beat grid and energy (char-cuts.ts), each clip's chosen seconds as a frames directory (a longer cut holds its last
// frame), step-printed big-motion clips, stills under the renderer's plate camera, and a treatment over a base kinetic
// plan whose cuts are quieted so the pictures carry the frame. Costs go to costs.json.
// npx tsx scripts/lyric-vj/charvideo.mts --plan out/research/video-tier/plan.json --out out/research/video-tier/run1 --stage all
//   [--only S01,S03] [--image-model gemini-3-pro-image] [--video-model veo-3.1-generate-001] [--budget 150]
import { GoogleGenAI } from '@google/genai';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { cutGrid, energyReader, stillShare, type Cut, type CutPlanLine } from '../../src/app/lyric-vj/char-cuts';
import type { TreatmentV3 } from '../../src/app/lyric-vj/treatment';

export interface PlanShot {
  id: string;
  kind: 'still' | 'video';
  /** The side the lyric takes; the picture keeps it quiet. */
  side: 'left' | 'right';
  /** Still shots: the renderer's plate camera (push/pan/parallax); video shots are static (the clip's own motion). */
  camera?: 'static' | 'push' | 'pan' | 'parallax';
  /** The shot's still (the clip's first frame when video). Absent when the still is a frozen frame of another clip. */
  still?: string;
  /** A still taken from another shot's clip at `at` seconds (a frozen frame, moved by the plate camera). */
  from?: string;
  at?: number;
  /** Nobody in the frame (an object or place insert): the character sheet is not a reference. */
  nobody?: boolean;
  /** Video shots: what moves (the raw camera is always locked). */
  motion?: string;
  /** Big-motion clips are step-printed (10 fps held to 30) so missing in-betweens read as style. */
  step?: boolean;
  /** Which seconds of the clip each showing uses (cycled); default the first 1.5 s after a half-second settle. */
  use?: { in: number; len: number }[];
}

export interface Plan {
  song: string;
  base: string;
  window: [number, number];
  medium?: string;
  style: string;
  character: string;
  negative: string;
  shots: PlanShot[];
  /** Per line (or a span of it, `from`/`to`), the shots in order; `beats` holds the song's own call for the cut length. */
  lines: { cue: string; shots: string[]; from?: number; to?: number; beats?: number }[];
}

const { values: a } = parseArgs({
  options: {
    plan: { type: 'string' }, out: { type: 'string' }, stage: { type: 'string', default: 'all' }, only: { type: 'string' },
    'image-model': { type: 'string', default: 'gemini-3-pro-image' }, 'video-model': { type: 'string', default: 'veo-3.1-generate-001' },
    budget: { type: 'string', default: '150' }, fps: { type: 'string', default: '30' },
  },
});
// list prices 2026-11: Gemini 3 Pro Image $0.134 per 1K/2K image (aistudio.google.com/docs/pricing); Flash Image 2K $0.101;
// Vertex Veo 3.1 video-only 1080p $0.20/s, Fast $0.12/s (cloud.google.com/vertex-ai/generative-ai/pricing)
const IMAGE_PRICE: Record<string, number> = { 'gemini-3-pro-image': 0.134, 'gemini-3-pro-image-preview': 0.134, 'gemini-3.1-flash-image': 0.101 };
const VIDEO_PRICE_PER_SEC: Record<string, number> = { 'veo-3.1-generate-001': 0.2, 'veo-3.1-fast-generate-001': 0.12 };
const CLIP_SEC = 8;

const plan: Plan = JSON.parse(readFileSync(a.plan!, 'utf8'));
const out = a.out!;
const only = a.only ? new Set(a.only.split(',')) : undefined;
for (const d of ['stills', 'clips', 'edit']) mkdirSync(join(out, d), { recursive: true });
const ledgerPath = join(out, 'costs.json');
// the ledger is read fresh on every use: two stages (stills and clips) may run at once on one output dir
const ledger = (): { item: string; usd: number; at: string; model: string }[] => (existsSync(ledgerPath) ? JSON.parse(readFileSync(ledgerPath, 'utf8')) : []);
const spent = () => ledger().reduce((s, x) => s + x.usd, 0);
const afford = (item: string, usd: number) => {
  if (spent() + usd > Number(a.budget)) throw new Error(`budget US$${a.budget}: spent ${spent().toFixed(2)}, ${item} needs ${usd.toFixed(2)}`);
};
const charge = (item: string, usd: number, model: string) => {
  writeFileSync(ledgerPath, JSON.stringify([...ledger(), { item, usd, at: new Date().toISOString(), model }], null, 1));
};

const vertexEnv = join(homedir(), '.config/vjflow/vertex.env');
for (const f of [join(homedir(), '.config/vjflow/gemini.env'), vertexEnv]) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
const ai = new GoogleGenAI({ apiKey: process.env['GEMINI_API_KEY'] });
const videoAi = new GoogleGenAI({ vertexai: true, project: process.env['GOOGLE_CLOUD_PROJECT'], location: process.env['GOOGLE_CLOUD_LOCATION'] ?? 'us-central1' });

const img = (f: string) => ({ type: 'image', mime_type: 'image/jpeg', data: readFileSync(f).toString('base64') });
const wanted = (id: string) => !only || only.has(id);

/** Draws one picture with the reference images; a file that exists is kept (delete it to draw again). */
async function draw(file: string, text: string, refs: string[], ratio = '16:9') {
  if (existsSync(file)) return;
  const model = a['image-model']!;
  afford(file, IMAGE_PRICE[model] ?? 0.134);
  writeFileSync(file.replace(/\.jpg$/, '.txt'), text);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let r: any;
  for (let k = 0; k < 3 && !r?.output_image?.data; k++) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      r = await (ai as any).interactions.create({ model, input: [{ type: 'text', text }, ...refs.map(img)], response_format: { type: 'image', mime_type: 'image/jpeg', aspect_ratio: ratio, image_size: '2K' } });
    } catch (e) {
      const status = Number((e as { status?: number }).status);
      if (k >= 2 || !(status === 429 || status >= 500 || !status)) throw e;
      await new Promise((ok) => setTimeout(ok, 8000 * 3 ** k));
    }
  }
  if (!r?.output_image?.data) throw new Error(`no image for ${file}: ${JSON.stringify(r).slice(0, 300)}`);
  writeFileSync(file, Buffer.from(r.output_image.data, 'base64'));
  charge(`image ${file.split('/').pop()}`, IMAGE_PRICE[model] ?? 0.134, model);
  console.log(`image ${file}`);
}

/** One Veo clip from a still (its first frame), video only, 1080p 16:9. */
async function clip(file: string, prompt: string, first: string) {
  if (existsSync(file)) return;
  const model = a['video-model']!;
  const usd = (VIDEO_PRICE_PER_SEC[model] ?? 0.2) * CLIP_SEC;
  afford(file, usd);
  writeFileSync(file.replace(/\.mp4$/, '.txt'), prompt);
  let op;
  for (let attempt = 0; ; attempt++) {
    try {
      op = await videoAi.models.generateVideos({
        model, prompt,
        image: { imageBytes: readFileSync(first).toString('base64'), mimeType: 'image/jpeg' },
        config: { aspectRatio: '16:9', resolution: '1080p', durationSeconds: CLIP_SEC, generateAudio: false, negativePrompt: `${plan.negative}, camera movement, zoom, pan, extra limbs, extra fingers, deformed hands, morphing face, lip sync` },
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
    process.stdout.write(`\r  ${file.split('/').pop()}: ${Math.round((Date.now() - began) / 1000)}s`);
  }
  console.log();
  const v = op.response?.generatedVideos?.[0]?.video;
  if (!v) throw new Error(`no video for ${file}: ${JSON.stringify(op.error ?? op.response).slice(0, 400)}`);
  if (v.videoBytes) writeFileSync(file, Buffer.from(v.videoBytes, 'base64'));
  else await videoAi.files.download({ file: v, downloadPath: file });
  charge(`video ${file.split('/').pop()}`, usd, model);
  console.log(`video ${file} (${Math.round((Date.now() - began) / 1000)} s)`);
}

/** Lyric templates that draw furniture of their own across the frame, and the plain template that takes their place over a picture. */
const FURNISHED: Record<string, string> = { couplet: 'stack' };
const sheet = join(out, 'sheet.jpg');
const stillOf = (s: PlanShot) => join(out, 'stills', `${s.id}.jpg`);
const clipOf = (s: PlanShot) => join(out, 'clips', `${s.id}.mp4`);
const LOCKED = 'Locked-off camera on a tripod: no camera movement at all, no zoom, no pan. One continuous shot, no cuts.';

/** Contact sheet (8 fps, 4 across) and 10 fps frames for inspection of a clip. */
function inspect(mp4: string) {
  const sheetJpg = mp4.replace(/\.mp4$/, '_sheet.jpg');
  if (!existsSync(sheetJpg)) execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', mp4, '-vf', 'fps=4,scale=480:-1,tile=4x8', '-q:v', '3', sheetJpg]);
  const dir = mp4.replace(/\.mp4$/, '_f');
  if (!existsSync(dir)) {
    mkdirSync(dir);
    execFileSync('ffmpeg', ['-loglevel', 'error', '-i', mp4, '-vf', 'fps=10,scale=960:-1', '-q:v', '3', join(dir, '%03d.jpg')]);
  }
}

const stage = a.stage!;
const shots = plan.shots.filter((s) => wanted(s.id));

if (stage === 'sheet' || stage === 'all') {
  await draw(sheet, `Character reference sheet for an illustrated music video. Style: ${plan.style}. One character only: ${plan.character}. Draw the same character five times side by side on a plain flat light-grey background, clearly separated: full body front view, full body three-quarter view, full body profile, full body back view, and a large face close-up (front). Same face, hair, clothes and proportions in every view. ${plan.negative}.`, []);
}

if (stage === 'stills' || stage === 'all') {
  for (const s of shots) {
    if (!s.still) continue;
    const quiet = `The ${s.side} third of the frame stays simple and uncluttered (plain sky or a flat surface, no detail, no figure) so lyrics can be set there.`;
    const who = s.nobody ? 'Nobody is in this frame: no people, no faces, no hands.' : `The character is exactly the one in the reference sheet: ${plan.character}. Same face, hair and clothes as the sheet. Hands are out of frame, hidden, or in silhouette; never spread fingers near the camera.`;
    await draw(stillOf(s), `One frame of an illustrated music video. Style: ${plan.style}; match the drawing technique of the reference sheet. ${who}\nShot: ${s.still}\n${quiet} A single continuous full-bleed 16:9 picture, painted edge to edge. ${plan.negative}.`, s.nobody ? [sheet] : [sheet]);
  }
}

if (stage === 'clips' || stage === 'all') {
  for (const s of shots) {
    if (s.kind !== 'video' || !s.motion) continue;
    if (!existsSync(stillOf(s))) throw new Error(`${s.id}: still missing, draw it first`);
    await clip(clipOf(s), `${s.motion} ${LOCKED} Keep the character exactly as in the first frame: same face, hair, clothes and proportions. ${plan.style}.`, stillOf(s));
    inspect(clipOf(s));
  }
}

/** Frames of one clip use at the render fps (step-printed when asked), as the renderer's frames pattern; count returned. */
function frames(s: PlanShot, use: { in: number; len: number }, id: string): { pattern: string; count: number; fps: number } {
  const fps = Number(a.fps);
  const dir = join(out, 'edit', id);
  if (!existsSync(dir)) {
    mkdirSync(dir);
    const vf = `${s.step ? 'fps=10,' : ''}fps=${fps},scale=1920:1080`;
    execFileSync('ffmpeg', ['-loglevel', 'error', '-ss', String(use.in), '-t', String(use.len), '-i', clipOf(s), '-vf', vf, '-q:v', '2', join(dir, '%05d.jpg')]);
  }
  const count = readdirSync(dir).filter((f) => f.endsWith('.jpg')).length;
  if (!count) throw new Error(`${id}: no frames came out of ${clipOf(s)} at ${use.in}+${use.len}`);
  return { pattern: resolve(dir, '%05d.jpg'), count, fps };
}

/** A frozen frame of a clip as a still (the plate camera moves it). */
function frozen(s: PlanShot): string {
  const src = plan.shots.find((x) => x.id === s.from);
  if (!src) throw new Error(`${s.id}: from ${s.from} is not a shot`);
  const file = join(out, 'stills', `${s.id}.jpg`);
  if (!existsSync(file)) execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-ss', String(s.at ?? 0), '-i', clipOf(src), '-frames:v', '1', '-vf', 'scale=1920:1080', '-q:v', '2', file]);
  return file;
}

if (stage === 'edit' || stage === 'all') {
  const song = JSON.parse(readFileSync(plan.song, 'utf8')) as { beats: number[]; energy: number[]; energyFps: number; cues: { id: string; start: number; end: number; text: string }[] };
  const base = JSON.parse(readFileSync(plan.base, 'utf8')) as TreatmentV3;
  const [from, to] = plan.window;
  const byId = new Map(plan.shots.map((s) => [s.id, s]));
  const lines: CutPlanLine[] = plan.lines.map((l) => {
    const cue = song.cues.find((c) => c.id === l.cue);
    if (!cue) throw new Error(`line ${l.cue} is not in the song`);
    for (const id of l.shots) if (!byId.has(id)) throw new Error(`line ${l.cue}: shot ${id} is not in the plan`);
    return { cue: l.cue, start: Math.max(from, l.from ?? cue.start), end: Math.min(to, l.to ?? cue.end), shots: l.shots, ...(l.beats ? { beats: l.beats } : {}) };
  });
  lines[lines.length - 1].end = to;
  const cuts = cutGrid(song.beats, lines, { energyAt: energyReader(song.energy, song.energyFps), minCut: 0.3 });

  // assets: a still per still shot, frames per clip use; a cut continuing the shot before keeps its asset (the run goes on)
  const assets: Record<string, { kind: 'image' | 'video'; url: string; frames?: { pattern: string; count: number; fps: number } }> = {};
  const specs: TreatmentV3['assets'] = [];
  const assetOf = (c: Cut, prev?: { shot: string; asset: string }): string => {
    const s = byId.get(c.shot)!;
    if (prev?.shot === c.shot) return prev.asset;
    if (s.kind === 'still') {
      const file = s.from ? frozen(s) : stillOf(s);
      if (!existsSync(file)) throw new Error(`${s.id}: still missing`);
      if (!assets[s.id]) {
        assets[s.id] = { kind: 'image', url: resolve(file) };
        specs.push({ id: s.id, kind: 'image', prompt: s.still ?? `frozen frame of ${s.from}` });
      }
      return s.id;
    }
    const uses = s.use?.length ? s.use : [{ in: 0.5, len: 1.5 }];
    const k = c.showing % uses.length;
    const id = `${s.id}_u${k}`;
    if (!assets[id]) {
      assets[`${s.id}_still`] ??= { kind: 'image', url: resolve(stillOf(s)) };
      if (!specs.some((x) => x.id === `${s.id}_still`)) specs.push({ id: `${s.id}_still`, kind: 'image', prompt: s.still ?? s.id });
      assets[id] = { kind: 'video', url: resolve(stillOf(s)), frames: frames(s, uses[k], id) };
      specs.push({ id, kind: 'video', prompt: s.motion ?? s.id, from: `${s.id}_still` });
    }
    return id;
  };
  const baseShotAt = (t: number) => base.shots.filter((s) => s.start <= t + 1e-6).at(-1) ?? base.shots[0];
  const cueStart = (id: string) => song.cues.find((c) => c.id === id)!.start;
  let prev: { shot: string; asset: string } | undefined;
  const made = cuts.map((c, i) => {
    const s = byId.get(c.shot)!;
    const asset = assetOf(c, prev);
    prev = { shot: c.shot, asset };
    const b = baseShotAt(cueStart(c.cue));
    // a lyric template that draws its own furniture (couplet's rule line) would cross the picture: the lines alone
    const template = FURNISHED[b.template] ?? b.template;
    return { id: `cv${String(i + 1).padStart(3, '0')}`, start: c.start, end: c.end, template, params: template === b.template ? { ...b.params } : { dim: 0 }, asset, camera: s.kind === 'still' ? (s.camera ?? 'push') : 'static', transitionIn: 'cut' as const };
  });
  // the window's own treatment: the base plan's shots and line styles outside it are left out (a render of the window
  // rejects styles for lines it does not hold, and a shot squeezed to its start)
  const t: TreatmentV3 = structuredClone(base);
  t.shots = made;
  const inWindow = new Set(song.cues.filter((c) => c.start < to && c.end > from).map((c) => c.id));
  t.cues = base.cues.filter((c) => inWindow.has(c.cueId));
  t.assets = [...base.assets, ...specs];
  t.design = { ...t.design!, beatCuts: true, ...(plan.medium ? { medium: plan.medium as never } : {}) };
  // the base plan's cuts inside the window are quieted: no paper, no words, no sprite; the pictures carry the frame
  if (t.graphics) {
    t.graphics.sections = t.graphics.sections.map((sec) => {
      const next = t.graphics!.sections.find((x) => x.start > sec.start)?.start ?? Infinity;
      if (next <= from || sec.start >= to) return sec;
      const k = sec.layers.find((l) => l.kind === 'kinetic') as Record<string, unknown> | undefined;
      if (!k) return sec;
      const quiet = { ...k };
      for (const key of ['sprite', 'board', 'stage', 'meta', 'cam', 'flash', 'label', 'thread', 'world']) delete quiet[key];
      return { ...sec, layers: [{ ...quiet, kind: 'kinetic', fx: 'motes', words: [], bare: true, hush: true } as never] };
    });
  }
  writeFileSync(join(out, 'edit', 'treatment.json'), JSON.stringify(t));
  writeFileSync(join(out, 'edit', 'assets.json'), JSON.stringify(assets, null, 1));
  const isStill = (id: string) => byId.get(id)!.kind === 'still';
  const report = cuts.map((c, i) => ({ ...c, id: made[i].id, kind: isStill(c.shot) ? 'STILL' : 'VIDEO', asset: made[i].asset, len: +(c.end - c.start).toFixed(3) }));
  writeFileSync(join(out, 'edit', 'cuts.json'), JSON.stringify({ stillShare: +stillShare(cuts, isStill).toFixed(3), cuts: report }, null, 1));
  // a cut (or run of cuts) longer than its clip seconds would hold a frame mid-motion: the plan should give it more
  for (let i = 0; i < report.length; i++) {
    const r = report[i];
    if (r.kind !== 'VIDEO' || (i && report[i - 1].asset === r.asset)) continue;
    let j = i, run = 0;
    while (j < report.length && report[j].asset === r.asset) run += report[j++].len;
    const s = byId.get(r.shot)!;
    const use = (s.use?.length ? s.use : [{ in: 0.5, len: 1.5 }])[r.showing % (s.use?.length || 1)];
    if (run > use.len + 0.05) console.warn(`WARN ${r.id} ${r.shot}: ${run.toFixed(2)} s of cuts on a ${use.len} s clip segment (slowed to ${Math.max(0.5, use.len / run).toFixed(2)}x, then held)`);
  }
  const lens = report.map((r) => r.len).sort((x, y) => x - y);
  console.log(`edit: ${cuts.length} cuts, median ${lens[Math.floor(lens.length / 2)]} s, stills ${Math.round(stillShare(cuts, isStill) * 100)} % by count, assets ${Object.keys(assets).length} → ${join(out, 'edit', 'treatment.json')}`);
}
console.log(JSON.stringify({ spentUSD: +spent().toFixed(3), budgetUSD: Number(a.budget) }));
