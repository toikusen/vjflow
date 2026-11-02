// Lyrics really on screen while they should be read: the same frame with and without the lyric layer, at the middle and near
// the end of every line's readable time. A line that adds almost nothing to its frame is invisible, whatever the metrics say
// (dark words left on a dark ground after a line moved off its paper). No video written.
// npx tsx --tsconfig tsconfig.json scripts/lyric-vj/style-gate-reading.mts --out out/research/styles/gate/reading [--songs nun,snow] terminal ink-wash
import { copyFileSync, createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import * as esbuild from 'esbuild';
import { chromium, Page } from 'playwright';
import { freeJob } from '../../src/app/lyric-vj/free-plan';
import { FREE_STYLES } from '../../src/app/lyric-vj/free-styles';
import { fontCache } from './font-cache.mts';

const IDS: Record<string, string> = { nun: 'yt_w_fCuUR3lEs', snow: 'yt_5i50aTB7JFo', tsuzuki: 'yt_b3GCfyNKeLs', choroin: 'yt_hCCskTJwvuc', tenmon: 'yt_iwYXfOhcsYI' };
const { values: a, positionals } = parseArgs({ allowPositionals: true, options: { out: { type: 'string', default: 'out/research/styles/gate/reading' }, songs: { type: 'string', default: 'nun,snow,tsuzuki,choroin,tenmon' }, seed: { type: 'string', default: '0' } } });
/** Share of a frame a line must change, and how hard, to count as there. */
export const READ = { minShare: 0.002, minDelta: 40 };
const [GW, GH] = [320, 180];
const work = join(a.out!, 'work', positionals.join('-').slice(0, 30));
mkdirSync(work, { recursive: true });
await esbuild.build({ entryPoints: ['src/app/lyric-vj/render/main.ts'], bundle: true, format: 'esm', target: 'es2022', outfile: join(work, 'render.js'), logLevel: 'warning' });
copyFileSync('scripts/lyric-vj/render.html', join(work, 'render.html'));
const ROOT = process.cwd();
const server = createServer((req, res) => {
  const path = join(ROOT, decodeURIComponent(new URL(req.url!, 'http://x').pathname));
  if (!existsSync(path)) return void res.writeHead(404).end();
  res.writeHead(200, { 'content-type': { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' }[extname(path)] ?? 'application/octet-stream' });
  createReadStream(path).pipe(res);
}).listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const browser = await chromium.launch({ channel: 'chromium', args: ['--force-device-scale-factor=1', '--ignore-gpu-blocklist'] });
const getFont = fontCache(resolve('out/font-cache'));
const grey = (p: Page, t: number) => p.evaluate(async ({ t, w, h }) => {
  const url = await window.grabAt(t, 0.7);
  const img = new Image();
  img.src = url;
  await img.decode();
  const c = new OffscreenCanvas(w, h).getContext('2d', { willReadFrequently: true })!;
  c.drawImage(img, 0, 0, w, h);
  const d = c.getImageData(0, 0, w, h).data;
  return Array.from({ length: w * h }, (_, i) => Math.round(0.3 * d[i * 4] + 0.59 * d[i * 4 + 1] + 0.11 * d[i * 4 + 2]));
}, { t, w: GW, h: GH });
const fails: string[] = [];
const fill: number[] = [];
let checked = 0;
for (const id of positionals) {
  const style = FREE_STYLES.find((s) => s.id === id)!;
  for (const name of a.songs!.split(',')) {
    const song = JSON.parse(readFileSync(`out/db/${IDS[name]}/song.json`, 'utf8'));
    const meaning = JSON.parse(readFileSync(`out/research/instant/plans/${name}/meaning.json`, 'utf8'));
    const { job } = freeJob(song, { style, seed: Number(a.seed), meaning });
    const file = join(work, `${id}-${name}.job.json`);
    writeFileSync(file, JSON.stringify({ ...job, live: true }));
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, async (route) => {
      const font = await getFont(route.request().url(), route.request().headers()['user-agent'] ?? '');
      return font ? route.fulfill({ body: font.body, contentType: font.type, headers: { 'access-control-allow-origin': '*' } }) : route.abort();
    });
    await page.goto(`http://127.0.0.1:${(server.address() as { port: number }).port}/${relative(ROOT, resolve(work))}/render.html?job=/${relative(ROOT, resolve(file))}`);
    await page.waitForSelector('body[data-ready="1"]', { timeout: 200000 });
    const cues = await page.evaluate(() => window.vjMetrics().cues.map((c) => ({ id: c.id, from: c.readableFrom, to: c.readableTo, text: c.text })));
    for (const c of cues) {
      // the video's own ending fade takes the last line with it, in every style
      const ending = c === cues.at(-1);
      for (const t of ending ? [(c.from + c.to) / 2 - 1] : [(c.from + c.to) / 2, c.to - 0.08]) {
        await page.evaluate(() => window.vjLyrics(true));
        const on = await grey(page, t);
        await page.evaluate(() => window.vjLyrics(false));
        const off = await grey(page, t);
        await page.evaluate(() => window.vjLyrics(true));
        let [n, sum, x0, x1, y0, y1] = [0, 0, GW, 0, GH, 0];
        on.forEach((v, i) => { const d = Math.abs(v - off[i]); if (d > 20) { n++; sum += d; const [x, y] = [i % GW, Math.floor(i / GW)]; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } });
        const share = n / on.length;
        checked++;
        if (share >= READ.minShare) fill.push(((x1 - x0) * (y1 - y0)) / (GW * GH));
        if (share < READ.minShare || sum / Math.max(1, n) < READ.minDelta) fails.push(`${id} ${name} ${c.id} ${t.toFixed(2)} share ${share.toFixed(4)} delta ${(sum / Math.max(1, n)).toFixed(0)} ${c.text.slice(0, 10)}`);
      }
    }
    await page.close();
    console.log(id, name, 'fails so far', fails.length);
  }
}
await browser.close();
server.close();
const sorted = [...fill].sort((x, y) => x - y);
const out = { checked, fails, fillMedian: +sorted[Math.floor(sorted.length / 2)].toFixed(3), fillP10: +sorted[Math.floor(sorted.length * 0.1)].toFixed(3) };
writeFileSync(join(a.out!, `${positionals.join('-').slice(0, 40)}.json`), JSON.stringify(out, null, 1));
console.log(JSON.stringify({ ...out, fails: out.fails.length }), out.fails.slice(0, 6));
process.exitCode = fails.length ? 1 : 0;
