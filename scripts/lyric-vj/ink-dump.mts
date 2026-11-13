// One glyph's evidence from the ink gate v2 (ink-gate2-page dump): words-on, words-off and mask-overlay crops (magenta:
// core pixels the two passes paint alike), from the worktree it runs in.
//   npx tsx --tsconfig tsconfig.json scripts/lyric-vj/ink-dump.mts --world dark-glitch --song choroin --out out/research/ink/dump c059@153.3333@11
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
const { values: a, positionals } = parseArgs({ allowPositionals: true, options: { world: { type: 'string' }, song: { type: 'string' }, out: { type: 'string' }, init: { type: 'string' } } });
const out = resolve(a.out!);
const work = join(out, 'work');
mkdirSync(work, { recursive: true });
await esbuild.build({ entryPoints: ['src/app/lyric-vj/render/main.ts'], bundle: true, format: 'esm', target: 'es2022', outfile: join(work, 'render.js'), logLevel: 'warning' });
copyFileSync('scripts/lyric-vj/render.html', join(work, 'render.html'));
await esbuild.build({ entryPoints: ['scripts/lyric-vj/ink-gate2-page.mts'], bundle: true, format: 'iife', target: 'es2022', outfile: join(work, 'ink-gate2-page.js'), logLevel: 'warning' });
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
await page.addInitScript({ path: join(work, 'ink-gate2-page.js') });
if (a.init) await page.addInitScript(a.init);
await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, async (route) => { const font = await getFont(route.request().url(), route.request().headers()['user-agent'] ?? ''); return font ? route.fulfill({ body: font.body, contentType: font.type, headers: { 'access-control-allow-origin': '*' } }) : route.abort(); });
await page.goto(`http://127.0.0.1:${(server.address() as { port: number }).port}/${relative(ROOT, work)}/render.html?job=/${relative(ROOT, file)}`);
await page.waitForSelector('body[data-ready="1"]', { timeout: 600000 });
for (const p of positionals) {
  const [cue, t, i] = p.split('@');
  const d = (await page.evaluate(`window.inkGate.dump(${t}, ${JSON.stringify(cue)}, ${i})`)) as { box: number[]; same: number; sameFirst: number[][]; on: string; off: string; mask: string } | undefined;
  if (!d) { console.log(p, 'no glyph'); continue; }
  for (const k of ['on', 'off', 'mask'] as const) writeFileSync(join(out, `${a.world}-${a.song}-${cue}-${t}-${i}.${k}.png`), Buffer.from(d[k].split(',')[1], 'base64'));
  console.log(p, JSON.stringify({ box: d.box, same: d.same, sameFirst: d.sameFirst }));
}
await browser.close();
server.close();
