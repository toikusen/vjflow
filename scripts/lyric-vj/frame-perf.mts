// Frame time of a world × song: N consecutive frames drawn after a warm-up, ms per frame (median and mean), with the
// job as it is and with a QA init script given (--init): a before/after for a render-path change.
//   nice -n 19 npx tsx --tsconfig tsconfig.json scripts/lyric-vj/frame-perf.mts --world dark-glitch --song choroin --at 150 --frames 90 [--init '...']
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
const { values: a } = parseArgs({ options: { world: { type: 'string' }, song: { type: 'string' }, at: { type: 'string', default: '150' }, frames: { type: 'string', default: '90' }, init: { type: 'string' } } });
const work = resolve('out/research/ink/perf');
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
writeFileSync(file, JSON.stringify({ ...job, live: true }));
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
if (a.init) await page.addInitScript(a.init);
await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, async (route) => { const font = await getFont(route.request().url(), route.request().headers()['user-agent'] ?? ''); return font ? route.fulfill({ body: font.body, contentType: font.type, headers: { 'access-control-allow-origin': '*' } }) : route.abort(); });
await page.goto(`http://127.0.0.1:${(server.address() as { port: number }).port}/${relative(ROOT, work)}/render.html?job=/${relative(ROOT, file)}`);
await page.waitForSelector('body[data-ready="1"]', { timeout: 600000 });
const ms = (await page.evaluate(`(async () => { const t0 = ${a.at}; for (let k = 0; k < 15; k++) await window.renderAt(t0 + k / 30); const ts = []; for (let k = 0; k < ${a.frames}; k++) { const s = performance.now(); await window.renderAt(t0 + 0.5 + k / 30); window.vjEngine.renderer?.getContext().finish?.(); ts.push(performance.now() - s); } return ts; })()`)) as number[];
const sorted = [...ms].sort((x, y) => x - y);
console.log(JSON.stringify({ world: a.world, init: a.init ?? '', median: +sorted[sorted.length >> 1].toFixed(2), mean: +(ms.reduce((s, v) => s + v, 0) / ms.length).toFixed(2) }));
await browser.close();
server.close();
