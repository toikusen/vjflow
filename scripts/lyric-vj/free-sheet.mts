// A per-line mid-cue sheet of the free path, from the live engine, no video written.
// npx tsx --tsconfig tsconfig.json scripts/lyric-vj/free-sheet.mts --song <id> --reading <meaning.json> --style <id> --seed 2 --out sheet.jpg
import { execFileSync } from 'node:child_process';
import { copyFileSync, createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import * as esbuild from 'esbuild';
import { chromium } from 'playwright';
import { freeJob } from '../../src/app/lyric-vj/free-plan';
import { FREE_STYLES } from '../../src/app/lyric-vj/free-styles';
import { fontCache } from './font-cache.mts';

const { values: a } = parseArgs({ options: { song: { type: 'string' }, reading: { type: 'string' }, style: { type: 'string' }, seed: { type: 'string' }, out: { type: 'string' }, width: { type: 'string', default: '480' }, from: { type: 'string' }, to: { type: 'string' }, every: { type: 'string' }, cols: { type: 'string', default: '6' }, full: { type: 'string' } } });
const song = JSON.parse(readFileSync(`out/db/${a.song}/song.json`, 'utf8'));
const pageErrors: string[] = [];
const style = FREE_STYLES.find((s) => s.id === a.style);
const { job, palette } = freeJob(song, { seed: a.seed === undefined ? undefined : Number(a.seed), style, meaning: a.reading ? JSON.parse(readFileSync(a.reading, 'utf8')) : undefined });
const work = `out/research/styles/sheet-work/${a.style ?? 'x'}-${a.song}`;
mkdirSync(work, { recursive: true });
writeFileSync(join(work, 'job.json'), JSON.stringify({ ...job, live: true }));
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
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, async (route) => {
  const font = await getFont(route.request().url(), route.request().headers()['user-agent'] ?? '');
  return font ? route.fulfill({ body: font.body, contentType: font.type, headers: { 'access-control-allow-origin': '*' } }) : route.abort();
});
page.on('pageerror', (e) => pageErrors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) pageErrors.push(m.text()); });
await page.goto(`http://127.0.0.1:${(server.address() as { port: number }).port}/${relative(ROOT, resolve(work))}/render.html?job=/${relative(ROOT, resolve(work))}/job.json`);
await page.waitForSelector('body[data-ready="1"]', { timeout: 120000 });
const cues = await page.evaluate(() => window.vjMetrics().cues.map((c) => ({ id: c.id, at: (c.readableFrom + c.readableTo) / 2, ok: c.ok, rest: c.restSize })));
const dir = mkdtempSync(join(tmpdir(), 'sheet-'));
// a window of the song at a fixed step, for consecutive frames; otherwise the middle of every line
const stops = a.every ? Array.from({ length: Math.ceil((Number(a.to) - Number(a.from)) / Number(a.every)) }, (_, i) => Number(a.from) + i * Number(a.every)) : cues.filter((c) => (a.from === undefined || c.at >= Number(a.from)) && (a.to === undefined || c.at <= Number(a.to))).map((c) => c.at);
for (const [i, t] of stops.entries()) {
  const url = await page.evaluate((x) => window.grabAt(x, 0.8), t);
  writeFileSync(join(dir, `${String(i).padStart(3, '0')}.jpg`), Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
}
mkdirSync(dirname(a.out!), { recursive: true });
for (const t of (a.full ?? '').split(',').filter(Boolean)) {
  const url = await page.evaluate((x) => window.grabAt(x, 0.9), Number(t));
  writeFileSync(a.out!.replace(/\.jpg$/, `-at${t}.jpg`), Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
}
await browser.close();
server.close();
mkdirSync(dirname(a.out!), { recursive: true });
const cols = Number(a.cols);
const rows = Math.ceil(stops.length / cols);
execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', '1', '-i', join(dir, '%03d.jpg'), '-vf', `scale=${a.width}:-1,tile=${cols}x${rows}:padding=4:color=gray`, '-frames:v', '1', '-q:v', '4', a.out!]);
rmSync(dir, { recursive: true });
if (pageErrors.length) console.log('page errors:', [...new Set(pageErrors)].slice(0, 5));
console.log(`${a.out}: ${cues.length} lines, palette ${palette}, read fails ${cues.filter((c) => !c.ok).length}, min rest ${Math.min(...cues.map((c) => c.rest ?? 999))}`);
