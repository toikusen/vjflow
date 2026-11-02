// The paid path against its saved baseline with nothing written to disk but a bundle: same job, today's engine, sampled frames
// against the baseline video, and the line metrics field by field. For when a --clip render cannot be afforded.
// npx tsx --tsconfig tsconfig.json scripts/lyric-vj/paid-frames-check.mts --base out/research/lineplan/review/paid/base-48-56 --from 48 --to 56 --out out/research/styles/paid-check
import { execFileSync } from 'node:child_process';
import { copyFileSync, createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import * as esbuild from 'esbuild';
import { chromium } from 'playwright';
import { fontCache } from './font-cache.mts';

const { values: a } = parseArgs({ options: { base: { type: 'string' }, from: { type: 'string' }, to: { type: 'string' }, out: { type: 'string' }, n: { type: 'string', default: '8' } } });
const out = a.out!;
mkdirSync(out, { recursive: true });
await esbuild.build({ entryPoints: ['src/app/lyric-vj/render/main.ts'], bundle: true, format: 'esm', target: 'es2022', outfile: join(out, 'render.js'), logLevel: 'warning' });
copyFileSync('scripts/lyric-vj/render.html', join(out, 'render.html'));
copyFileSync(join(a.base!, 'job.json'), join(out, 'job.json'));
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
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, async (route) => {
  const font = await getFont(route.request().url(), route.request().headers()['user-agent'] ?? '');
  return font ? route.fulfill({ body: font.body, contentType: font.type, headers: { 'access-control-allow-origin': '*' } }) : route.abort();
});
await page.goto(`http://127.0.0.1:${(server.address() as { port: number }).port}/${relative(ROOT, resolve(out))}/render.html?job=/${relative(ROOT, resolve(out))}/job.json`);
await page.waitForSelector('body[data-ready="1"]', { timeout: 300000 });
const metrics = await page.evaluate(() => window.vjMetrics());
const base = JSON.parse(readFileSync(join(a.base!, 'metrics.json'), 'utf8'));
const shape = (c: Record<string, unknown>) => JSON.stringify(c);
const same = metrics.cues.filter((c: Record<string, unknown>, i: number) => shape(c) === shape(base.cues[i])).length;
const [t0, t1, n] = [Number(a.from), Number(a.to), Number(a.n)];
const video = `${a.base}/lyric-vj_vocal_48-56s.mp4`;
const raw = (args: string[], input?: Buffer) => execFileSync('ffmpeg', ['-v', 'error', ...args, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { input, maxBuffer: 1 << 24 });
const psnrs: number[] = [];
for (let i = 0; i < n; i++) {
  const frame = Math.round(((t1 - t0) * 30 * (i + 0.5)) / n);
  const t = t0 + frame / 30;
  const url = await page.evaluate((x) => window.grabAt(x, 0.98), t);
  const mine = raw(['-i', 'pipe:0'], Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
  const theirs = raw(['-i', video, '-vf', `select=eq(n\\,${frame})`]);
  let s = 0;
  for (let k = 0; k < mine.length; k++) s += (mine[k] - theirs[k]) ** 2;
  psnrs.push(+(10 * Math.log10(255 ** 2 / (s / mine.length))).toFixed(1));
}
await browser.close();
server.close();
const result = { cues: metrics.cues.length, baseCues: base.cues.length, sameCues: same, errors, rendererErrors: base.rendererErrors, psnrs, meanPsnr: +(psnrs.reduce((x, y) => x + y, 0) / n).toFixed(1) };
writeFileSync(join(out, 'result.json'), JSON.stringify(result, null, 1));
console.log(JSON.stringify(result));
