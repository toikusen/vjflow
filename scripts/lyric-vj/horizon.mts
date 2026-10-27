// A song's own horizons: the renderer's code skyline knows four shapes (city, hills, trees, peaks), so every song with
// skylines showed the same few. Here the song's concept and lyrics pick three silhouettes of its world (a kung-fu
// song: temple eaves, bamboo, a mountain gate), an image model draws each as a flat black band, and the band is keyed
// to a mask the skyline layer fills with the section's own colours (graphics.ts: skyline `art`).
// npx tsx scripts/lyric-vj/horizon.mts --song song.json --treatment treatment.json --out <dir> [--apply <plan dir>]
//   --apply: <plan dir>/treatment.json's skylines use the strips (assets.json gets them); a plan without skylines
//   spends nothing. The strips stay in <dir>, so every version of a song shares them.
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { isTransient } from './cutout.mts';
import { keyStrip } from './media.mts';

const { values: a } = parseArgs({ options: { song: { type: 'string' }, treatment: { type: 'string' }, out: { type: 'string' }, apply: { type: 'string' }, 'image-model': { type: 'string', default: 'gemini-3.1-flash-image' } } });
for (const f of ['anthropic.env', 'gemini.env']) {
  const p = join(homedir(), '.config/vjflow', f);
  for (const line of existsSync(p) ? readFileSync(p, 'utf8').split('\n') : []) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}
const out = a.out!;
mkdirSync(out, { recursive: true });
const skylines = (plan: { graphics?: { sections: { layers: { kind: string }[] }[] } }) => (plan.graphics?.sections ?? []).flatMap((s) => s.layers).filter((l) => l.kind === 'skyline');
if (a.apply && !skylines(JSON.parse(readFileSync(join(a.apply, 'treatment.json'), 'utf8'))).length) {
  console.log('horizon: no skylines in this plan, nothing drawn, $0.000');
  process.exit(0);
}
const song = JSON.parse(readFileSync(a.song!, 'utf8')) as { title: string; cues: { text: string }[] };
const tr = JSON.parse(readFileSync(a.treatment!, 'utf8')) as { concept?: string };
let usd = 0;

export interface Strip { id: string; shows: string; file: string }
const planFile = join(out, 'horizon.json');
let strips: Strip[] = existsSync(planFile) ? JSON.parse(readFileSync(planFile, 'utf8')).strips : [];
if (!strips.length) {
  const msg = await new Anthropic({ maxRetries: 8 }).messages.create({ model: 'claude-haiku-5-5', max_tokens: 800, messages: [{ role: 'user', content: `A music video's backgrounds show a silhouetted horizon along the bottom of the frame, in layers. Pick 3 horizons that belong to this song's world (places and things its lyrics and concept name; not generic city, hills, trees or mountains unless the song is about them). Each is one wide panorama of silhouette shapes, readable as a single flat black shape: describe its skyline in one English sentence (what stands along it, left to right).
Song: ${song.title}
Concept: ${tr.concept ?? ''}
Lyrics: ${song.cues.map((c) => c.text).join(' / ').slice(0, 2500)}
id: short snake_case.` }], output_config: { format: { type: 'json_schema', schema: { type: 'object', additionalProperties: false, required: ['horizons'], properties: { horizons: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'shows'], properties: { id: { type: 'string' }, shows: { type: 'string' } } } } } } } } } as Anthropic.Messages.MessageCreateParamsNonStreaming);
  usd += (msg.usage.input_tokens * 1 + msg.usage.output_tokens * 5) / 1e6;
  const text = (msg.content.find((c) => c.type === 'text') as { text: string }).text;
  const picked = (JSON.parse(text) as { horizons: { id: string; shows: string }[] }).horizons;
  strips = picked.slice(0, 3).map((p) => ({ id: p.id.replace(/\W+/g, '_').slice(0, 30), shows: p.shows, file: join(out, `hz_${p.id.replace(/\W+/g, '_').slice(0, 30)}.png`) }));
  writeFileSync(planFile, JSON.stringify({ strips }, null, 1));
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
for (const s of strips) {
  if (existsSync(s.file)) continue;
  const raw = s.file.replace('.png', '.jpg');
  if (!existsSync(raw)) {
    const text = `A wide panoramic horizon silhouette for a cut-paper poster: ${s.shows} One solid flat pure black shape filling the lower half of the picture: its top edge is the varied skyline, everything below it is solid black down to the bottom edge, and it runs off both the left and right edges. Pure white above. No gradients, no texture, no outlines, no inner detail, no reflections, no people. Absolutely no text, letters, numbers, signs or watermarks.`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let r: any;
    for (let k = 0; k < 5 && !r?.output_image?.data; k++)
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        r = await (ai as any).interactions.create({ model: a['image-model'], input: [{ type: 'text', text }], response_format: { type: 'image', mime_type: 'image/jpeg', aspect_ratio: '16:9', image_size: '2K' } });
      } catch (e) {
        if (!isTransient(e) || k === 4) throw e;
        await new Promise((go) => setTimeout(go, 5000 * (k + 1)));
      }
    if (!r?.output_image?.data) throw new Error(`no image for ${s.id}`);
    writeFileSync(raw, Buffer.from(r.output_image.data, 'base64'));
    usd += 0.101;
  }
  await keyStrip(raw, s.file);
}

if (a.apply) {
  const plan = JSON.parse(readFileSync(join(a.apply, 'treatment.json'), 'utf8'));
  const assetsFile = join(a.apply, 'assets.json');
  const assets = existsSync(assetsFile) ? JSON.parse(readFileSync(assetsFile, 'utf8')) : {};
  for (const s of strips) assets[`hz:${s.id}`] = { kind: 'image', url: resolve(s.file) };
  // each skyline starts its layers on the next strip, so neighbouring sections do not repeat one horizon
  skylines(plan).forEach((l, n) => Object.assign(l, { art: strips.map((_, k) => `hz:${strips[(k + n) % strips.length].id}`) }));
  writeFileSync(join(a.apply, 'treatment.json'), JSON.stringify(plan, null, 1));
  writeFileSync(assetsFile, JSON.stringify(assets, null, 1));
  console.log(`horizon: ${skylines(plan).length} skylines use the song's strips`);
}
console.log(`horizon: ${strips.map((s) => s.id).join(', ')}, $${usd.toFixed(3)}`);
