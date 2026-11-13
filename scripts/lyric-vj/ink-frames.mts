// Frames of named moments with each glyph's measured reading (the measured ink gate's page side, gate-ink-page.mts): for
// showing a case before and after a change, from the worktree it runs in. Writes <out>/<world>-<song>-<cue>-<t>.jpg and
// <out>/<world>-<song>.json (per glyph: the worst ninth's median, the median, its ink and ground).
//   npx tsx --tsconfig tsconfig.json scripts/lyric-vj/ink-frames.mts --out out/research/ink/frames/after --world y2k --song choroin [--font Huninn] c006@12.91 c006@13.3
import { copyFileSync, createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import * as esbuild from 'esbuild';
import { chromium } from 'playwright';
import { freeJob } from '../../src/app/lyric-vj/free-plan';
import { FREE_STYLES } from '../../src/app/lyric-vj/free-styles';
import { fontCache } from './font-cache.mts';
import type { Read } from './gate-ink-page.mts';

const IDS: Record<string, string> = { nun: 'yt_w_fCuUR3lEs', snow: 'yt_5i50aTB7JFo', tsuzuki: 'yt_b3GCfyNKeLs', choroin: 'yt_hCCskTJwvuc', tenmon: 'yt_iwYXfOhcsYI' };
const { values: a, positionals } = parseArgs({ allowPositionals: true, options: { out: { type: 'string' }, world: { type: 'string' }, song: { type: 'string' }, font: { type: 'string' }, seed: { type: 'string', default: '0' }, init: { type: 'string' }, tag: { type: 'string', default: '' } } });
const out = resolve(a.out!);
const work = join(out, 'work');
mkdirSync(work, { recursive: true });
await esbuild.build({ entryPoints: ['src/app/lyric-vj/render/main.ts'], bundle: true, format: 'esm', target: 'es2022', outfile: join(work, 'render.js'), logLevel: 'warning' });
copyFileSync('scripts/lyric-vj/render.html', join(work, 'render.html'));
await esbuild.build({ entryPoints: ['scripts/lyric-vj/gate-ink-page.mts'], bundle: true, format: 'iife', target: 'es2022', outfile: join(work, 'gate-ink-page.js'), logLevel: 'warning' });
const ROOT = process.cwd();
const server = createServer((req, res) => {
  const asked = decodeURIComponent(new URL(req.url!, 'http://x').pathname);
  const path = join(ROOT, asked.startsWith('/fonts/') ? join('out', asked) : asked);
  if (!existsSync(path)) return void res.writeHead(404).end();
  res.writeHead(200, { 'content-type': { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' }[extname(path)] ?? 'application/octet-stream' });
  createReadStream(path).pipe(res);
}).listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const browser = await chromium.launch({ channel: 'chromium', args: ['--force-device-scale-factor=1', '--ignore-gpu-blocklist'] });
const getFont = fontCache(resolve('out/font-cache'));
const song = JSON.parse(readFileSync(`out/db/${IDS[a.song!]}/song.json`, 'utf8'));
const meaning = JSON.parse(readFileSync(`out/research/instant/plans/${a.song}/meaning.json`, 'utf8'));
const { job } = freeJob(song, { style: FREE_STYLES.find((s) => s.id === a.world)!, seed: Number(a.seed), meaning, ...(a.font ? { font: a.font } : {}) });
const file = join(work, `${a.world}-${a.song}.job.json`);
writeFileSync(file, JSON.stringify({ ...job, live: true }));
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.addInitScript({ path: join(work, 'gate-ink-page.js') });
await page.addInitScript('window.__vjInkRings = true');
// (--init: a QA switch set before the page runs, an ablation: window.__vjFinalOff = ['uVignette'])
if (a.init) await page.addInitScript(a.init);
await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, async (route) => {
  const font = await getFont(route.request().url(), route.request().headers()['user-agent'] ?? '');
  return font ? route.fulfill({ body: font.body, contentType: font.type, headers: { 'access-control-allow-origin': '*' } }) : route.abort();
});
await page.goto(`http://127.0.0.1:${(server.address() as { port: number }).port}/${relative(ROOT, work)}/render.html?job=/${relative(ROOT, file)}`);
await page.waitForSelector('body[data-ready="1"]', { timeout: 200000 });
const rows: unknown[] = [];
for (const p of positionals) {
  const [cue, t] = p.split('@');
  const text = [...((song.cues as { id: string; text: string }[]).find((c) => c.id === cue)?.text ?? '').replace(/[\s　]+/g, ' ').trim()];
  const reads = (await page.evaluate(`window.inkPage.moment(${t}, ${JSON.stringify([cue])})`)) as Read[];
  const url = (await page.evaluate(`window.inkPage.still(${t})`)) as string;
  writeFileSync(join(out, `${a.world}-${a.song}-${cue}-${Number(t).toFixed(2)}${a.tag}.jpg`), Buffer.from(url.split(',')[1], 'base64'));
  const glyphs = reads.map((r) => ({ i: r.i, ch: text[r.i] ?? '', ...(r.skip ? { skip: r.skip } : { low: r.r!.low, median: r.r!.median, ink: r.r!.ink, ground: r.r!.ground }) }));
  const read = glyphs.filter((g) => 'low' in g) as { low: number }[];
  rows.push({ cue, t: Number(t), least: read.length ? Math.min(...read.map((g) => g.low)) : null, glyphs });
  console.log(cue, t, 'least', read.length ? Math.min(...read.map((g) => g.low)) : '-');
}
writeFileSync(join(out, `${a.world}-${a.song}${a.tag}.json`), JSON.stringify(rows, null, 1));
await browser.close();
server.close();
