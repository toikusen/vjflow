// Subject-video tier, phase 2a: the pictures of a cast script. Cut-out shots are drawn on a flat chroma screen (green,
// or blue/magenta when the palette has inks near green: chroma-screen.mts; screens.json says which picture is on which) with the
// decided members' sheets as reference and keyed (key_sprites.py, the largest figure); scene shots are full pictures in
// the language; props are drawn from their look and keyed. Every file that exists is kept (delete it to draw again);
// --tries N draws N versions of a shot (S10_1.jpg, S10_2.jpg) for a pose check, then the one copied to S10.jpg wins.
// npx tsx scripts/lyric-vj/subject-stills.mts --script run2/script.json --fixed run2/fixed.json --language risograph \
//   --out run2 [--only S10] [--tries 2] [--image-model gemini-3-pro-image]
import { GoogleGenAI } from '@google/genai';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { LANGUAGES, type LanguageId } from '../../src/app/lyric-vj/languages';
import { STYLE_WORLDS } from '../../src/app/lyric-vj/style-worlds';
import type { FixedMember, SubjectScript, SubjectShot } from '../../src/app/lyric-vj/subject-script';
import { screenFor, type ScreenName } from './chroma-screen.mts';

const { values: a } = parseArgs({
  options: {
    script: { type: 'string' }, fixed: { type: 'string' }, language: { type: 'string', default: 'risograph' }, out: { type: 'string' }, only: { type: 'string' },
    tries: { type: 'string', default: '1' }, 'image-model': { type: 'string', default: 'gemini-3-pro-image' }, props: { type: 'boolean', default: true },
  },
  allowNegative: true,
});
const IMAGE_PRICE: Record<string, number> = { 'gemini-3-pro-image': 0.134, 'gemini-3.1-flash-image': 0.101 };
const out = a.out!;
const lang = LANGUAGES[a.language as LanguageId];
const world = STYLE_WORLDS.find((w) => w.language === a.language)!;
const script: SubjectScript = JSON.parse(readFileSync(a.script!, 'utf8'));
const fixed: FixedMember[] = JSON.parse(readFileSync(a.fixed!, 'utf8'));
const only = a.only ? new Set(a.only.split(',')) : undefined;
for (const d of ['stills', 'spr']) mkdirSync(join(out, d), { recursive: true });
const ledgerPath = join(out, 'costs.json');
const ledger = (): { item: string; usd: number; at: string; model: string }[] => (existsSync(ledgerPath) ? JSON.parse(readFileSync(ledgerPath, 'utf8')) : []);
const charge = (item: string, usd: number, model: string) => writeFileSync(ledgerPath, JSON.stringify([...ledger(), { item, usd: +usd.toFixed(4), at: new Date().toISOString(), model }], null, 1));
const spent = () => ledger().reduce((s, x) => s + x.usd, 0);
// which screen each picture was drawn on: pictures drawn before screens were chosen per palette are on green
const screensPath = join(out, 'screens.json');
const screens = (): Record<string, ScreenName> => (existsSync(screensPath) ? JSON.parse(readFileSync(screensPath, 'utf8')) : {});
export const screenOf = (file: string): ScreenName => screens()[file.split('/').pop()!] ?? 'green';
const noteScreen = (file: string, name: ScreenName) => writeFileSync(screensPath, JSON.stringify({ ...screens(), [file.split('/').pop()!]: name }, null, 1));

for (const f of [join(homedir(), '.config/vjflow/gemini.env')]) if (existsSync(f)) for (const line of readFileSync(f, 'utf8').split('\n')) { const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; }
const ai = new GoogleGenAI({ apiKey: process.env['GEMINI_API_KEY'] });
const img = (f: string) => ({ type: 'image', mime_type: 'image/jpeg', data: readFileSync(f).toString('base64') });

/** Draws one picture with the reference images; a file that exists is kept. */
async function draw(file: string, text: string, refs: string[], ratio: string, chroma = false) {
  if (existsSync(file)) return;
  const model = a['image-model']!;
  writeFileSync(file.replace(/\.jpg$/, '.txt'), text);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let r: any;
  for (let k = 0; k < 3 && !r?.output_image?.data; k++) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      r = await (ai as any).interactions.create({ model, input: [{ type: 'text', text }, ...refs.map(img)], response_format: { type: 'image', mime_type: 'image/jpeg', aspect_ratio: ratio, image_size: '2K' } });
    } catch (e) {
      if (k >= 2) throw e;
      await new Promise((ok) => setTimeout(ok, 8000 * 3 ** k));
    }
  }
  if (!r?.output_image?.data) throw new Error(`no image for ${file}: ${JSON.stringify(r).slice(0, 300)}`);
  writeFileSync(file, Buffer.from(r.output_image.data, 'base64'));
  if (chroma) noteScreen(file, SCREEN.name);
  charge(`image ${file.split('/').pop()}`, IMAGE_PRICE[model] ?? 0.134, model);
  console.log(`image ${file}`);
}

/** The largest keyed figure of a chroma picture as a transparent PNG; its width/height returned. */
export function key(jpg: string, png: string, merge = false): number {
  if (!existsSync(png)) {
    const tmp = png.replace(/\.png$/, '_k');
    execFileSync('uv', ['run', '--with', 'numpy', '--with', 'pillow', '--with', 'scipy', 'python', 'scripts/lyric-vj/key_sprites.py', jpg, tmp, '--min', '0.02', '--screen', screenOf(jpg), ...(merge ? ['--merge'] : [])], { stdio: 'ignore' });
    const frames = JSON.parse(readFileSync(join(tmp, 'frames.json'), 'utf8')).frames as { file: string; w: number; h: number }[];
    const big = frames.sort((x, y) => y.w * y.h - x.w * x.h)[0];
    if (!big) return 0;
    copyFileSync(join(tmp, big.file), png);
    return big.w / big.h;
  }
  const r = JSON.parse(execFileSync('uv', ['run', '--with', 'pillow', 'python', '-c', `import sys,json;from PIL import Image;im=Image.open(sys.argv[1]);print(json.dumps(im.size))`, png]).toString()) as [number, number];
  return r[0] / r[1];
}

const scheme = world.palette.find((p) => p.id === fixed[0]?.scheme) ?? world.palette[0];
// the keying screen, far from every ink of the palette (a green screen keyed out silk-pine's green-painted car)
const SCREEN = screenFor([scheme.ink, scheme.ground, scheme.accent, scheme.ink2]);
console.log(`screen: ${SCREEN.name} ${SCREEN.hex} (palette ${scheme.id})`);
const screenText = `on a flat pure chroma ${SCREEN.name} (${SCREEN.hex}) background`;
const noScreenInk = `Nothing in the subject is ${SCREEN.name} or close to it (no ${SCREEN.name} paint, cloth, light or shadow); keep to the inks.`;
const inks = `Inks: ${scheme.what} — only ink ${scheme.ink}, ink ${scheme.accent} and their overprint; no other colours, no black outlines, no gradients.`;
const member = (id: string) => script.cast.find((m) => m.id === id);
/** A decided member's reference pictures for a shot: single-view crops when it has them (a whole sheet made the model copy the sheet), else its sheet. */
const refsOf = (id: string): string[] => { const f = fixed.find((x) => x.id === id); return f ? (f.refs?.length ? f.refs : [f.sheet]).filter(existsSync) : []; };
const who = (s: SubjectShot) => {
  let n = 0;
  return s.cast.map((id) => {
    const m = member(id)!;
    const k = refsOf(id).length;
    const nums = Array.from({ length: k }, (_, i) => n + i + 1);
    n += k;
    return `${m.what}${k ? ` — exactly the design shown in reference image${k > 1 ? 's' : ''} ${nums.join(' and ')} (same design, proportions and ink placement; the references show the design only, not the picture to draw)` : m.look ? ` (${m.look})` : ''}`;
  }).join('; and ');
};
const NO = 'No text, no letters, no labels, no logo, no watermark, no frame, no panel borders.';
const ratioOf = (s: SubjectShot) => (s.size === 'wide' ? '16:9' : '1:1');

/** A cut-out shot's picture: the cast alone on the flat chroma screen, compact, nothing else. */
const cutoutText = (s: SubjectShot) => `Draw ONE new picture: ${s.subject}${s.note ? ` ${s.note}` : ''}\nThe reference images are design sheets of the subjects (several views of the same design): take only the design from them — never copy the sheet layout, never draw more than one of anything. Exactly ${s.cast.map((id) => `one ${member(id)?.what.split(',')[0]}`).join(' and ')} in the picture${fixed.filter((f) => !s.cast.includes(f.id)).map((f) => `; no ${f.what.split(',')[0]} at all`).join('')}.\nSubjects: ${who(s)}.\n${lang.props?.style ?? ''} ${inks}\nOne compact group in the middle of the picture, large, ${screenText}: no ground, no floor, no shadow on the ground, no scene, no sky, nothing else in the picture, no sticker border or white outline, no glow: every edge meets the ${SCREEN.name} directly. ${noScreenInk} ${s.cast.some((id) => member(id)?.kind === 'person') ? 'Any person: hands hidden (inside sleeves, in pockets, behind the body) or resting small on the handlebar; no fingers spread; face turned away or in profile, calm.' : ''} ${NO}`;
/** A scene shot: a full picture in the language. */
const sceneText = (s: SubjectShot) => `One full-bleed 16:9 picture for a ${lang.name} music video. ${lang.props?.style ?? ''} ${inks} Bare paper ${scheme.ground} shows through the lightest areas.\n${s.place}\n${s.cast.length ? `In it: ${who(s)}. ${s.subject}` : s.subject}\nSimple shapes, large flat areas, a lot of bare paper; the ${s.side === 'left' ? 'right' : s.side === 'right' ? 'left' : 'upper'} part of the picture stays plain for lyrics. ${NO}`;
/** A prop: drawn from its look, keyed. */
const propText = (look: string) => `${lang.props?.style ?? ''} ${inks}\nOne object cut-out: ${look}\nAlone, compact, in the middle of the picture, ${screenText}: no ground, no shadow, nothing else, no outline or glow around it; its edge meets the ${SCREEN.name} directly. ${noScreenInk} ${NO}`;

const tries = Number(a.tries);
const wanted = (id: string) => !only || only.has(id);
let usd0 = spent();

// props first: their looks are the director's, the decided sheets anchor the style
if (a.props) {
  for (const m of script.cast.filter((x) => x.tier === 'prop' && wanted(x.id))) {
    const jpg = join(out, 'spr', `${m.id}.jpg`);
    await draw(jpg, propText(m.look), fixed.map((f) => f.sheet).filter(existsSync), '1:1', true);
    const r = key(jpg, join(out, 'spr', `${m.id}.png`));
    console.log(`prop ${m.id}: keyed ${r.toFixed(2)} wide`);
  }
}

for (const s of script.shots.filter((x) => wanted(x.id))) {
  const refs = [...s.cast.flatMap(refsOf), ...s.cast.filter((id) => member(id)?.tier === 'prop' && existsSync(join(out, 'spr', `${id}.jpg`))).map((id) => join(out, 'spr', `${id}.jpg`))];
  if (s.frame === 'scene') {
    await draw(join(out, 'stills', `${s.id}.jpg`), sceneText(s), refs, '16:9');
    continue;
  }
  for (let k = 1; k <= tries; k++) {
    const jpg = join(out, 'stills', tries > 1 ? `${s.id}_${k}.jpg` : `${s.id}.jpg`);
    await draw(jpg, cutoutText(s), refs, ratioOf(s), true);
    if (tries === 1) {
      // (a shot of more than one subject is one picture: its figures are kept together, not the largest alone)
      const r = key(jpg, join(out, 'spr', `${s.id}.png`), s.cast.length > 1);
      console.log(`cut-out ${s.id}: keyed ${r.toFixed(2)} wide`);
    }
  }
}
console.log(JSON.stringify({ spentUSD: +spent().toFixed(3), thisRunUSD: +(spent() - usd0).toFixed(3) }));
