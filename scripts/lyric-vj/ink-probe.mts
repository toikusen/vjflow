// A few moments of a world × song, each glyph's drawn ink as the renderer laid it (vjGlyphs) and the effects box the
// renderer decided its inks through (__vjInkFx): a quick check of the ink decision, not a gate.
//   nice -n 19 npx tsx --tsconfig tsconfig.json scripts/lyric-vj/ink-probe.mts --world dark-glitch --song choroin 153.3 73.4
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
const { values: a, positionals } = parseArgs({ allowPositionals: true, options: { world: { type: 'string' }, song: { type: 'string' }, seed: { type: 'string', default: '0' } } });
const work = resolve('out/research/ink/probe');
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
const { job } = freeJob(song, { style: FREE_STYLES.find((s) => s.id === a.world)!, seed: Number(a.seed), meaning });
const file = join(work, 'job.json');
writeFileSync(file, JSON.stringify({ ...job, live: true }));
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, async (route) => { const font = await getFont(route.request().url(), route.request().headers()['user-agent'] ?? ''); return font ? route.fulfill({ body: font.body, contentType: font.type, headers: { 'access-control-allow-origin': '*' } }) : route.abort(); });
await page.goto(`http://127.0.0.1:${(server.address() as { port: number }).port}/${relative(ROOT, work)}/render.html?job=/${relative(ROOT, file)}`);
await page.waitForSelector('body[data-ready="1"]', { timeout: 600000 });
console.log('fx', JSON.stringify(await page.evaluate(() => (globalThis as { __vjInkFx?: unknown }).__vjInkFx)));
for (const t of positionals) {
  const lines = (await page.evaluate(`window.vjFrame(${t}).then(() => window.vjGlyphs().map((l) => ({ id: l.id, inks: [...new Set(l.glyphs.map((g) => g.ink))], tone: [...new Set(l.glyphs.map((g) => g.alpha && g.alpha.tone))] })))`)) as unknown[];
  console.log(t, JSON.stringify(lines));
}
for (const id of ['c059', 'c031']) { const c = (job.treatment.cues as { cueId: string; world?: { slots?: unknown; set?: string } }[]).find((x) => x.cueId === id); console.log(id, c?.world?.set, JSON.stringify(c?.world?.slots)); }
await browser.close();
server.close();
