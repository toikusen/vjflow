// The layered outputs against the opaque frame (phase 4d round 6): one job rendered three ways at given times — the
// opaque frame, `--layer back` and `--layer text` (alpha) — the text layer composited over the back one, and the ink of
// the words read on the ground under them in both: the composite must read at 4.5:1 like the opaque frame does (an
// overlay that read its inks off the cleared canvas picked cream on cream over the back layer).
//   npx tsx --tsconfig tsconfig.json scripts/lyric-vj/layer-composite.mts <world> <song> <t,...> [--out dir]
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { freeJob } from '../../src/app/lyric-vj/free-plan';
import { FREE_STYLES } from '../../src/app/lyric-vj/free-styles';
import { contrast } from '../../src/app/lyric-vj/contrast';

const IDS: Record<string, string> = { nun: 'yt_w_fCuUR3lEs', snow: 'yt_5i50aTB7JFo', tsuzuki: 'yt_b3GCfyNKeLs', choroin: 'yt_hCCskTJwvuc', tenmon: 'yt_iwYXfOhcsYI' };
const [world, name, times] = process.argv.slice(2);
const out = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : `out/research/q1-1109/layer-composite/${world}-${name}`;
mkdirSync(out, { recursive: true });
const song = `out/db/${IDS[name]}/song.json`;
const meaning = JSON.parse(readFileSync(`out/research/instant/plans/${name}/meaning.json`, 'utf8'));
const { treatment } = freeJob(JSON.parse(readFileSync(song, 'utf8')), { style: FREE_STYLES.find((s) => s.id === world)!, seed: 0, meaning });
writeFileSync(join(out, 'treatment.json'), JSON.stringify(treatment));
const render = (layer: string) => { const dir = join(out, layer || 'full'); mkdirSync(dir, { recursive: true }); execSync(`nice -n 10 npx tsx --tsconfig tsconfig.json scripts/lyric-vj/render.mts --song ${song} --treatment ${join(out, 'treatment.json')} --out ${dir} --stills ${times} --unconfirmed ${layer ? `--layer ${layer}` : ''}`, { stdio: 'ignore' }); return dir; };
const [full, back, text] = ['', 'back', 'text'].map(render);
const rgba = (file: string) => execSync(`ffmpeg -loglevel error -i ${file} -f rawvideo -pix_fmt rgba -`, { maxBuffer: 1920 * 1080 * 4 + 1024 });
const hex = (p: number[]) => '#' + p.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[s.length >> 1] ?? 0; };
const rows: Record<string, unknown>[] = [];
for (const t of times.split(',').map(Number)) {
  const f = `still_${t.toFixed(2)}.png`;
  const comp = join(out, `composite_${t.toFixed(2)}.png`);
  execSync(`ffmpeg -loglevel error -y -i ${join(back, f)} -i ${join(text, f)} -filter_complex overlay ${comp}`);
  const [o, b, a, c] = [join(full, f), join(back, f), join(text, f), comp].map(rgba);
  // (the words: the text layer's solid pixels, their strongest third by distance from the back layer under them)
  const idx: number[] = [];
  for (let i = 0; i < 1920 * 1080; i += 3) if (a[i * 4 + 3] > 240) idx.push(i);
  // (each word pixel's contrast against the back layer under it; the strokes' own ink is the upper fifth: a ghosted earlier
  // line or an antialiased edge lies below it)
  const read = (img: Buffer) => {
    const cs = idx.filter((_, k) => k % 7 === 0).map((i) => contrast(hex([0, 1, 2].map((ch) => img[i * 4 + ch])), hex([0, 1, 2].map((ch) => b[i * 4 + ch])))).sort((x, y) => x - y);
    return { p80: +cs[Math.floor(cs.length * 0.8)].toFixed(2), median: +median(cs).toFixed(2) };
  };
  const [op, co] = [read(o), read(c)];
  rows.push({ t, words: idx.length, opaque: op, composite: co, ok: co.p80 >= 4.5 && co.p80 >= op.p80 * 0.9 });
}
writeFileSync(join(out, 'composite.json'), JSON.stringify(rows, null, 1));
console.log(JSON.stringify(rows));
if (rows.some((r) => !r.ok)) process.exitCode = 1;
