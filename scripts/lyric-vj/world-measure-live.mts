// The comparison method of measure-video.mts on frames straight from the engine, nothing written: for when the disk cannot
// take a clip. Frames go down two ffmpeg pipes, one for the scene score, one for grey pixels.
// npx tsx --tsconfig tsconfig.json scripts/lyric-vj/world-measure-live.mts --out dir --song nun --from 76 terminal led-board
import { spawn } from 'node:child_process';
import { copyFileSync, createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import * as esbuild from 'esbuild';
import { chromium } from 'playwright';
import { freeJob } from '../../src/app/lyric-vj/free-plan';
import { FREE_STYLES } from '../../src/app/lyric-vj/free-styles';
import { fontCache } from './font-cache.mts';

const IDS: Record<string, string> = { nun: 'yt_w_fCuUR3lEs', snow: 'yt_5i50aTB7JFo', tsuzuki: 'yt_b3GCfyNKeLs', choroin: 'yt_hCCskTJwvuc', tenmon: 'yt_iwYXfOhcsYI' };
const { values: a, positionals } = parseArgs({ allowPositionals: true, options: { out: { type: 'string' }, song: { type: 'string' }, from: { type: 'string' }, secs: { type: 'string', default: '25' }, seed: { type: 'string', default: '0' } } });
const [FW, FH, FPS] = [960, 540, 30];
const out = a.out!;
const work = join(out, `work-${a.song}`);
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
const song = JSON.parse(readFileSync(`out/db/${IDS[a.song!]}/song.json`, 'utf8'));
const meaning = JSON.parse(readFileSync(`out/research/instant/plans/${a.song}/meaning.json`, 'utf8'));

function inkGrid(f: Uint8Array) {
  const hist = new Uint32Array(32);
  for (let i = 0; i < f.length; i += 7) hist[f[i] >> 3]++;
  const bg = (hist.indexOf(Math.max(...hist)) << 3) + 4;
  const c = new Uint32Array(40);
  for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) if (Math.abs(f[y * FW + x] - bg) > 40) c[Math.floor((y * 5) / FH) * 8 + Math.floor((x * 8) / FW)]++;
  const cell = (FW / 8) * (FH / 5);
  return { grid: Uint8Array.from(c, (v) => (v / cell > 0.04 ? 1 : 0)), bg };
}
const hamming = (x: Uint8Array, y: Uint8Array) => x.reduce((s, v, i) => s + (v !== y[i] ? 1 : 0), 0);

async function one(id: string) {
  const style = FREE_STYLES.find((s) => s.id === id)!;
  const { job } = freeJob(song, { style, seed: Number(a.seed), meaning });
  const file = join(work, `${id}.job.json`);
  writeFileSync(file, JSON.stringify({ ...job, live: true }));
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, async (route) => {
    const font = await getFont(route.request().url(), route.request().headers()['user-agent'] ?? '');
    return font ? route.fulfill({ body: font.body, contentType: font.type, headers: { 'access-control-allow-origin': '*' } }) : route.abort();
  });
  await page.goto(`http://127.0.0.1:${(server.address() as { port: number }).port}/${relative(ROOT, resolve(work))}/render.html?job=/${relative(ROOT, resolve(file))}`);
  await page.waitForSelector('body[data-ready="1"]', { timeout: 200000 });
  const input = ['-hide_banner', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', 'pipe:0'];
  const scene = (thr: number) => spawn('ffmpeg', [...input, '-vf', `scale=640:360,select='gt(scene,${thr})',showinfo`, '-an', '-f', 'null', '-']);
  const [s03, s015] = [scene(0.3), scene(0.15)];
  const logOf = (p: ReturnType<typeof spawn>) => { let log = ''; p.stderr!.on('data', (d) => (log += String(d))); return new Promise<string>((r) => p.on('close', () => r(log))); };
  const [l03, l015] = [logOf(s03), logOf(s015)];
  const grey = spawn('ffmpeg', ['-v', 'error', ...input.slice(1), '-vf', `scale=${FW}:${FH},format=gray`, '-f', 'rawvideo', '-']);
  const size = FW * FH;
  let buf = Buffer.alloc(0);
  let prev: Uint8Array | undefined;
  const changed: number[] = [];
  const turns: number[] = [];
  const frames: { share: number; grid: Uint8Array }[] = [];
  const masks: Uint8Array[] = [];
  let count = 0;
  grey.stdout!.on('data', (d: Buffer) => {
    buf = buf.length ? Buffer.concat([buf, d]) : d;
    let at = 0;
    while (buf.length - at >= size) {
      const f = new Uint8Array(buf.subarray(at, at + size));
      at += size;
      let n = 0;
      if (prev) for (let i = 0; i < size; i++) if (Math.abs(f[i] - prev[i]) > 12) n++;
      if (prev) changed.push(n / size);
      // luminance transitions over a quarter of the frame, the way a flash count sees them (WCAG: 10 % of full range)
      if (prev) { let [up, down] = [0, 0]; for (let i = 0; i < size; i += 4) { const d = f[i] - prev[i]; if (d > 25) up++; else if (d < -25) down++; } const m = size / 4; turns.push(up / m >= 0.25 && up > down ? 1 : down / m >= 0.25 && down > up ? -1 : 0); }
      const { grid, bg } = inkGrid(f);
      frames.push({ share: n / size, grid });
      if (count % 15 === 0) masks.push(Uint8Array.from({ length: (FW >> 2) * (FH >> 2) }, (_, i) => (Math.abs(f[((i / (FW >> 2)) | 0) * 4 * FW + (i % (FW >> 2)) * 4] - bg) > 40 ? 1 : 0)));
      prev = f;
      count++;
    }
    buf = buf.subarray(at);
  });
  const done = new Promise<void>((r) => grey.on('close', () => r()));
  const total = Math.round(Number(a.secs) * FPS);
  for (let i = 0; i < total; i++) {
    const url = await page.evaluate((t) => window.grabAt(t, 0.92), Number(a.from) + i / FPS);
    const jpg = Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
    for (const p of [s03, s015, grey]) if (!p.stdin!.write(jpg)) await new Promise((r) => p.stdin!.once('drain', r));
  }
  for (const p of [s03, s015, grey]) p.stdin!.end();
  const errs = await page.evaluate(() => window.vjMetrics().cues.filter((c) => !c.ok).map((c) => c.id));
  await page.close();
  const [log03, log015] = await Promise.all([l03, l015]);
  await done;
  const times = (s: string) => [...s.matchAll(/pts_time:([\d.]+)/g)].map((m) => Number(m[1]));
  const marks = times(log015).map((x) => Math.round(x * FPS));
  const stills: Uint8Array[] = [];
  let start = 0;
  for (const m of [...marks, frames.length]) {
    const seg = frames.slice(start, m);
    if (seg.length) stills.push([...seg].sort((x, y) => x.share - y.share)[0].grid);
    start = m;
  }
  const groups: Uint8Array[] = [];
  for (const g of stills) if (!groups.some((x) => hamming(x, g) <= 6)) groups.push(g);
  const secs = frames.length / FPS;
  // a flash: a rise and the fall that answers it; the most in any one second
  const events = turns.flatMap((d, i) => (d ? [{ i, d }] : []));
  const flashes = events.flatMap((e, k) => (k && events[k - 1].d !== e.d ? [e.i] : []));
  const flashMax = flashes.reduce((m, f) => Math.max(m, flashes.filter((x) => x >= f && x < f + FPS).length), 0);
  const report = { cuts03_per10: +((times(log03).length * 10) / Number(a.secs)).toFixed(1), cuts015_per10: +((times(log015).length * 10) / Number(a.secs)).toFixed(1), changed_px_mean: +(changed.reduce((s, v) => s + v, 0) / changed.length).toFixed(4), layouts_per30: +((groups.length * 30) / secs).toFixed(1), flashMax, readFails: errs };
  writeFileSync(join(out, `${id}-${a.song}.json`), JSON.stringify(report));
  writeFileSync(join(out, `${id}-${a.song}.ink`), Buffer.concat(masks.map((m) => Buffer.from(m))));
  console.log(id, a.song, JSON.stringify(report));
}
for (const id of positionals) await one(id);
await browser.close();
server.close();
