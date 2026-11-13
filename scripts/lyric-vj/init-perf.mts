// Init and whole-song time of a free job, non-live (every line built at init), from the worktree it runs in: a cold page
// (first in a fresh browser), a warm one (same browser again), and the whole song stepped frame by frame at --fps.
//   npx tsx --tsconfig tsconfig.json scripts/lyric-vj/init-perf.mts --world y2k --song choroin [--fps 10] --out out/research/ink/perf/after
import { copyFileSync, createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { execSync } from 'node:child_process';
import * as esbuild from 'esbuild';
import { chromium } from 'playwright';
import { freeJob } from '../../src/app/lyric-vj/free-plan';
import { FREE_STYLES } from '../../src/app/lyric-vj/free-styles';
import { fontCache } from './font-cache.mts';

const IDS: Record<string, string> = { nun: 'yt_w_fCuUR3lEs', snow: 'yt_5i50aTB7JFo', tsuzuki: 'yt_b3GCfyNKeLs', choroin: 'yt_hCCskTJwvuc', tenmon: 'yt_iwYXfOhcsYI' };
const { values: a } = parseArgs({ options: { world: { type: 'string' }, song: { type: 'string' }, fps: { type: 'string', default: '10' }, out: { type: 'string' } } });
const out = resolve(a.out!);
const work = join(out, 'work');
mkdirSync(work, { recursive: true });
await esbuild.build({ entryPoints: ['src/app/lyric-vj/render/main.ts'], bundle: true, format: 'esm', target: 'es2022', outfile: join(work, 'render.js'), logLevel: 'warning' });
copyFileSync('scripts/lyric-vj/render.html', join(work, 'render.html'));
const ROOT = process.cwd();
const server = createServer((req, res) => { const asked = decodeURIComponent(new URL(req.url!, 'http://x').pathname); const path = join(ROOT, asked.startsWith('/fonts/') ? join('out', asked) : asked); if (!existsSync(path)) return void res.writeHead(404).end(); res.writeHead(200, { 'content-type': { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' }[extname(path)] ?? 'application/octet-stream' }); createReadStream(path).pipe(res); }).listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const browser = await chromium.launch({ channel: 'chromium', args: ['--force-device-scale-factor=1', '--ignore-gpu-blocklist'] });
const getFont = fontCache(resolve('out/font-cache'));
const song = JSON.parse(readFileSync(`out/db/${IDS[a.song!]}/song.json`, 'utf8'));
const meaning = JSON.parse(readFileSync(`out/research/instant/plans/${a.song}/meaning.json`, 'utf8'));
const { job } = freeJob(song, { style: FREE_STYLES.find((s) => s.id === a.world)!, seed: 0, meaning });
const file = join(work, 'job.json');
writeFileSync(file, JSON.stringify(job));
const load = async () => {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, async (route) => { const font = await getFont(route.request().url(), route.request().headers()['user-agent'] ?? ''); return font ? route.fulfill({ body: font.body, contentType: font.type, headers: { 'access-control-allow-origin': '*' } }) : route.abort(); });
  const t0 = Date.now();
  await page.goto(`http://127.0.0.1:${(server.address() as { port: number }).port}/${relative(ROOT, work)}/render.html?job=/${relative(ROOT, file)}`);
  await page.waitForSelector('body[data-ready="1"]', { timeout: 3_600_000 });
  return { page, ms: Date.now() - t0 };
};
const cold = await load();
await cold.page.close();
const warm = await load();
const fps = Number(a.fps);
const t0 = Date.now();
const frames = (await warm.page.evaluate(`(async () => { let n = 0; for (let t = ${job.window.start}; t < ${job.window.end}; t += ${1 / fps}) { await window.renderAt(t); n++; } return n; })()`)) as number;
const res = { commit: execSync('git rev-parse --short HEAD').toString().trim(), world: a.world, song: a.song, live: false, coldInitMs: cold.ms, warmInitMs: warm.ms, fps, frames, wholeSongMs: Date.now() - t0 };
writeFileSync(join(out, `${a.world}-${a.song}.json`), JSON.stringify(res, null, 1));
console.log(JSON.stringify(res));
await browser.close();
server.close();
