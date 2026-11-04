// The similarity gate, level 3 of docs/research/2026-11-01-style-standard.md §3.3: colour taken away. Real engine frames, no
// video written, no model call. Same song, seed and time: 24 grey frames per style, compared by ink position, ink area and
// edge density; a recoloured copy of each style against its nearest neighbour; and the shape of each line's arrival.
// npx tsx --tsconfig tsconfig.json scripts/lyric-vj/style-gate-visual.mts --out out/research/styles/gate [--styles a,b] [--songs nun,snow]
import { copyFileSync, createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import * as esbuild from 'esbuild';
import { chromium, Page } from 'playwright';
import { freeJob } from '../../src/app/lyric-vj/free-plan';
import { FREE_STYLES } from '../../src/app/lyric-vj/free-styles';
import { fontCache } from './font-cache.mts';

const { values: a } = parseArgs({ options: { out: { type: 'string', default: 'out/research/styles/gate' }, styles: { type: 'string' }, songs: { type: 'string', default: 'nun,snow' }, frames: { type: 'string', default: '24' } } });
const IDS: Record<string, [string, number]> = { nun: ['yt_w_fCuUR3lEs', 76], snow: ['yt_5i50aTB7JFo', 67], choroin: ['yt_hCCskTJwvuc', 60], tsuzuki: ['yt_b3GCfyNKeLs', 60] };
/** Calibrated on batch 1: see the progress file. */
export const LEVEL3 = { inkIou: 0.25, curveCorr: 0.97 };
const [GW, GH] = [240, 135];
const work = join(a.out!, 'visual-work');
mkdirSync(work, { recursive: true });
await esbuild.build({ entryPoints: ['src/app/lyric-vj/render/main.ts'], bundle: true, format: 'esm', target: 'es2022', outfile: join(work, 'render.js'), logLevel: 'warning' });
copyFileSync('scripts/lyric-vj/render.html', join(work, 'render.html'));
const ROOT = process.cwd();
const server = createServer((req, res) => {
  const asked = decodeURIComponent(new URL(req.url!, 'http://x').pathname);
  // the self-hosted fonts live in out/fonts and are asked for at /fonts/ (as in render.mts)
  const path = join(ROOT, asked.startsWith('/fonts/') ? join('out', asked) : asked);
  if (!existsSync(path)) return void res.writeHead(404).end();
  res.writeHead(200, { 'content-type': { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json' }[extname(path)] ?? 'application/octet-stream' });
  createReadStream(path).pipe(res);
}).listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
const browser = await chromium.launch({ channel: 'chromium', args: ['--force-device-scale-factor=1', '--ignore-gpu-blocklist'] });
const getFont = fontCache(resolve('out/font-cache'));

async function open(job: unknown, tag: string): Promise<Page> {
  const file = join(work, `${tag}.job.json`);
  writeFileSync(file, JSON.stringify({ ...(job as object), live: true }));
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, async (route) => {
    const font = await getFont(route.request().url(), route.request().headers()['user-agent'] ?? '');
    return font ? route.fulfill({ body: font.body, contentType: font.type, headers: { 'access-control-allow-origin': '*' } }) : route.abort();
  });
  await page.goto(`${base}/${relative(ROOT, resolve(work))}/render.html?job=/${relative(ROOT, resolve(file))}`);
  await page.waitForSelector('body[data-ready="1"]', { timeout: 120000 });
  return page;
}
/** Grey pixels of the frame at t, small. */
const grey = (p: Page, t: number) => p.evaluate(async ({ t, w, h }) => {
  const url = await (window as never as { grabAt(t: number, q: number): Promise<string> }).grabAt(t, 0.7);
  const img = new Image();
  img.src = url;
  await img.decode();
  const c = new OffscreenCanvas(w, h).getContext('2d', { willReadFrequently: true })!;
  c.drawImage(img, 0, 0, w, h);
  const d = c.getImageData(0, 0, w, h).data;
  return Array.from({ length: w * h }, (_, i) => Math.round(0.3 * d[i * 4] + 0.59 * d[i * 4 + 1] + 0.11 * d[i * 4 + 2]));
}, { t, w: GW, h: GH });

/** Ink: what stands off the frame's commonest tone, light or dark. A polarity flip or a recolour leaves this alone. */
function features(f: number[]) {
  const hist = new Array(32).fill(0);
  for (const v of f) hist[v >> 3]++;
  const bg = (hist.indexOf(Math.max(...hist)) << 3) + 4;
  const ink = f.map((v) => (Math.abs(v - bg) > 36 ? 1 : 0));
  let edge = 0;
  for (let y = 1; y < GH - 1; y++) for (let x = 1; x < GW - 1; x++) edge += Math.abs(f[y * GW + x + 1] - f[y * GW + x - 1]) + Math.abs(f[(y + 1) * GW + x] - f[(y - 1) * GW + x]) > 60 ? 1 : 0;
  return { ink, area: ink.reduce((s, v) => s + v, 0) / ink.length, edge: edge / f.length };
}
type F = ReturnType<typeof features>;
const iou = (x: number[], y: number[]) => { let a = 0, b = 0; x.forEach((v, i) => { a += v & y[i]; b += v | y[i]; }); return b ? a / b : 0; };
const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / Math.max(1, v.length);
const compare = (p: F[], q: F[]) => ({ iou: +mean(p.map((x, i) => iou(x.ink, q[i].ink))).toFixed(3), area: +mean(p.map((x, i) => Math.abs(x.area - q[i].area))).toFixed(3), edge: +mean(p.map((x, i) => Math.abs(x.edge - q[i].edge))).toFixed(3) });
const corr = (x: number[], y: number[]) => { const [mx, my] = [mean(x), mean(y)]; let [s, a, b] = [0, 0, 0]; x.forEach((v, i) => { s += (v - mx) * (y[i] - my); a += (v - mx) ** 2; b += (y[i] - my) ** 2; }); return s / Math.sqrt(a * b || 1); };

const styles = FREE_STYLES.filter((s) => !a.styles || a.styles.split(',').includes(s.id));
const songs = a.songs!.split(',');
const N = Number(a.frames);
const seen: Record<string, Record<string, F[]>> = {};
const again: Record<string, Record<string, F[]>> = {};
const curves: Record<string, Record<string, number[]>> = {};
const load = (name: string) => [JSON.parse(readFileSync(`out/db/${IDS[name][0]}/song.json`, 'utf8')), JSON.parse(readFileSync(`out/research/instant/plans/${name}/meaning.json`, 'utf8'))];
for (const name of songs) {
  const [song, meaning] = load(name);
  const times = Array.from({ length: N }, (_, i) => IDS[name][1] + (25 * (i + 0.5)) / N);
  const starts = song.cues.filter((c: { start: number }) => c.start >= IDS[name][1] && c.start < IDS[name][1] + 25).slice(0, 5).map((c: { start: number }) => c.start);
  seen[name] = {};
  again[name] = {};
  curves[name] = {};
  for (const s of styles) {
    const { job } = freeJob(song, { style: s, seed: 0, meaning });
    let page = await open(job, `${s.id}-${name}`);
    const fs: F[] = [];
    for (const t of times) fs.push(features(await grey(page, t)));
    seen[name][s.id] = fs;
    // arrival energy: frames round each line's start, the shape of how much changes and when
    const curve = new Array(7).fill(0);
    for (const st of starts) {
      let prev = await grey(page, st - 0.2);
      for (let k = 0; k < 7; k++) {
        const f = await grey(page, st - 0.13 + k * 0.1);
        curve[k] += mean(f.map((v, i) => (Math.abs(v - prev[i]) > 12 ? 1 : 0)));
        prev = f;
      }
    }
    curves[name][s.id] = curve.map((v) => v / Math.max(1e-6, Math.max(...curve)));
    await page.close();
    // the same style's next version: how far a reroll goes, the yardstick for how far a style must go
    page = await open(freeJob(song, { style: s, seed: 1, meaning }).job, `${s.id}-${name}-1`);
    const gs: F[] = [];
    for (const t of times) gs.push(features(await grey(page, t)));
    again[name][s.id] = gs;
    await page.close();
    console.log(name, s.id);
  }
}
const pairs: Record<string, Record<string, number>> = {};
const fails: string[] = [];
const within = Object.fromEntries(styles.map((s) => [s.id, +mean(songs.map((n) => compare(seen[n][s.id], again[n][s.id]).iou)).toFixed(3)]));
styles.forEach((x, i) => styles.slice(i + 1).forEach((y) => {
  const r = songs.map((n) => compare(seen[n][x.id], seen[n][y.id]));
  const v = { iou: +mean(r.map((c) => c.iou)).toFixed(3), area: +mean(r.map((c) => c.area)).toFixed(3), edge: +mean(r.map((c) => c.edge)).toFixed(3), curve: +mean(songs.map((n) => corr(curves[n][x.id], curves[n][y.id]))).toFixed(3) };
  pairs[`${x.id}/${y.id}`] = v;
  if (v.iou > LEVEL3.inkIou) fails.push(`${x.id}/${y.id}: ink position ${v.iou}`);
  if (v.curve > LEVEL3.curveCorr && v.iou > 0.15) fails.push(`${x.id}/${y.id}: same arrival shape ${v.curve} with ink ${v.iou}`);
}));
// the recolour test: the nearest pair, one wearing the other's colours by a plain swap in its job
const nearest = Object.entries(pairs).sort((p, q) => q[1].iou - p[1].iou)[0];
const recolour: Record<string, unknown> = {};
if (nearest) {
  const [xid, yid] = nearest[0].split('/');
  const [x, y] = [styles.find((s) => s.id === xid)!, styles.find((s) => s.id === yid)!];
  const name = songs[0];
  const [song, meaning] = load(name);
  let text = JSON.stringify(freeJob(song, { style: x, seed: 0, meaning }).job);
  x.world.palette.forEach((p, k) => { const q = y.world.palette[k % y.world.palette.length]; for (const slot of ['ground', 'ink', 'ink2', 'accent', 'plate', 'plateInk', 'faint'] as const) text = text.split(p[slot]).join(q[slot]); });
  const page = await open(JSON.parse(text), `recolour-${name}`);
  const times = Array.from({ length: N }, (_, i) => IDS[name][1] + (25 * (i + 0.5)) / N);
  const fs: F[] = [];
  for (const t of times) fs.push(features(await grey(page, t)));
  await page.close();
  const swapped = compare(fs, seen[name][yid]);
  recolour['pair'] = nearest[0];
  recolour['iou'] = swapped.iou;
  recolour['plain'] = nearest[1].iou;
  if (swapped.iou > LEVEL3.inkIou) fails.push(`recolour ${nearest[0]}: still reads alike ${swapped.iou}`);
}
await browser.close();
server.close();
writeFileSync(join(a.out!, 'level3.json'), JSON.stringify({ thresholds: LEVEL3, within, recolour, fails, pairs }, null, 1));
const top = Object.entries(pairs).sort((p, q) => q[1].iou - p[1].iou).slice(0, 5);
console.log('nearest', JSON.stringify(top));
console.log('reroll ink overlap', JSON.stringify(within));
console.log('recolour', JSON.stringify(recolour));
console.log('level 3 fails', fails.length, fails.slice(0, 10));
process.exitCode = fails.length ? 1 : 0;
