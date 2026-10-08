// Character directions on one frame: the image model
// draws each candidate character into a reference frame of the song's own scene, keeping its style, so the user picks
// one before any sprite sheet is made. People are drawn by the image model; code only composites them (see notes).
// npx tsx scripts/lyric-vj/character.mts --ref frame.jpg --directions dirs.json --out <dir>
import { GoogleGenAI } from '@google/genai';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

const { values: a } = parseArgs({ options: { ref: { type: 'string' }, directions: { type: 'string' }, out: { type: 'string' }, model: { type: 'string', default: 'gemini-3.1-flash-image' },
  // the instruction that frames every direction (default: add the character into the reference scene); a sprite sheet uses its own
  instruction: { type: 'string' } } });
const PRICE = 0.101;
const ai = new GoogleGenAI({ apiKey: process.env['GEMINI_API_KEY'] });
// a reference is optional (the first prop sheet of a song has none; later sheets use it as their style anchor)
const ref = a.ref ? readFileSync(a.ref).toString('base64') : undefined;
const dirs: { id: string; prompt: string }[] = JSON.parse(readFileSync(a.directions!, 'utf8'));
mkdirSync(a.out!, { recursive: true });
const KEEP = 'Keep the reference image exactly: same composition, same objects in the same places and sizes, same flat candy-colour pictogram style, same palette, same paper grain. Only add the character described below, drawn in exactly the same flat style (no outlines unless the scene has them, same shading level), standing on the riverbank in the lower left third, about one quarter of the frame tall. Absolutely no text, no letters, no logos.';
const frame = a.instruction ? readFileSync(a.instruction, 'utf8').trim() : KEEP;
const results = await Promise.all(dirs.map(async (d) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let r: any;
  for (let tries = 0; tries < 3 && !r?.output_image?.data; tries++)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    r = await (ai as any).interactions.create({
      model: a.model, input: [{ type: 'text', text: `${frame}\n\nCharacter: ${d.prompt}` }, ...(ref ? [{ type: 'image', mime_type: 'image/jpeg', data: ref }] : [])],
      response_format: { type: 'image', mime_type: 'image/jpeg', aspect_ratio: '16:9', image_size: '2K' },
    });
  if (!r?.output_image?.data) return { id: d.id, error: JSON.stringify(r).slice(0, 300) };
  const file = join(a.out!, `${d.id}.jpg`);
  writeFileSync(file, Buffer.from(r.output_image.data, 'base64'));
  return { id: d.id, file };
}));
const made = results.filter((x) => 'file' in x).length;
writeFileSync(join(a.out!, 'results.json'), JSON.stringify({ results, costUSD: +(made * PRICE).toFixed(3) }, null, 1));
console.log(JSON.stringify(results), `$${(made * PRICE).toFixed(3)}`);
