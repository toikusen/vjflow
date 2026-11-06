// A board beside the engine: the board's own lines put on the board's own page, so each board can be compared full size with
// what the engine draws (style batch 5, 2026-11-06). For each `cue=set[@scheme]` the line keeps its own timing; its set, the
// page under it and, if named, the scheme are the board's (no beat event, part camera or set piece). One frame at the line's reading middle, and one near its end.
// npx tsx --tsconfig tsconfig.json scripts/lyric-vj/world-board-match.mts --out dir --song nun --style scrapbook --force c019=scrapbook/card@sage-page,c006=scrapbook/index [--seed 0]
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
const { values: a } = parseArgs({ options: { out: { type: 'string' }, song: { type: 'string', default: 'nun' }, style: { type: 'string' }, seed: { type: 'string', default: '0' }, lines: { type: 'string', default: '0' }, at: { type: 'string', default: '' }, pieces: { type: 'boolean', default: false }, only: { type: 'string', default: '' }, frames: { type: 'string', default: '6' }, force: { type: 'string', default: '' } } });
const out = a.out!;
const work = join(out, `work-${a.style}-${a.song}`);
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
const browser = await chromium.launch({ channel: 'chromium', args: ['--force-device-scale-factor=1', '--ignore-gpu-blocklist'] });
const getFont = fontCache(resolve('out/font-cache'));
const song = JSON.parse(readFileSync(`out/db/${IDS[a.song!]}/song.json`, 'utf8'));
const meaning = JSON.parse(readFileSync(`out/research/instant/plans/${a.song}/meaning.json`, 'utf8'));
const style = FREE_STYLES.find((s) => s.id === a.style)!;
const { job } = freeJob(song, { style, seed: Number(a.seed), meaning });
const sections = job.treatment.graphics!.sections as { start: number; layers: { fx?: string; world?: { slots?: unknown } }[] }[];
const cues = job.treatment.cues as { cueId: string; world?: { set: string; slots?: unknown } }[];
const forced = a.force!.split(',').filter(Boolean).map((f) => { const [id, rest] = f.split('='); const [set, scheme] = rest.split('@'); return { id, set, scheme }; });
for (const f of forced) {
  const cue = cues.find((c) => c.cueId === f.id)!;
  const line = style.world.layouts.lines.find((l) => l.set === f.set)!;
  const start = (song.cues as { id: string; start: number }[]).find((c) => c.id === f.id)!.start;
  const slots = f.scheme ? style.world.palette.find((p) => p.id === f.scheme) : undefined;
  // (layout only, as batch 4 compared it: no beat event, part camera or set piece on the line)
  const { beat: _b, cam: _c, ...rest } = cue.world as Record<string, unknown>;
  cue.world = { ...(rest as { set: string }), set: f.set, ...(slots ? { slots } : {}) };
  const sec = sections[sections.findLastIndex((s) => s.start <= start + 0.02)];
  sec.layers[0].fx = line.ground;
  const { piece: _p, ...was } = (sec.layers[0].world ?? {}) as Record<string, unknown>;
  sec.layers[0].world = { ...was, ...(slots ? { slots } : {}) };
}
const shots: [string, number][] = [];
const file = join(work, 'job.json');
writeFileSync(file, JSON.stringify({ ...job, live: true }));
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, async (route) => {
  const font = await getFont(route.request().url(), route.request().headers()['user-agent'] ?? '');
  return font ? route.fulfill({ body: font.body, contentType: font.type, headers: { 'access-control-allow-origin': '*' } }) : route.abort();
});
page.on('pageerror', (e) => console.log('pageerror', e.message.slice(0, 300)));
await page.goto(`http://127.0.0.1:${(server.address() as { port: number }).port}/${relative(ROOT, resolve(work))}/render.html?job=/${relative(ROOT, resolve(file))}`);
await page.waitForSelector('body[data-ready="1"]', { timeout: 200000 });
{
  const m = await page.evaluate(() => window.vjMetrics().cues.map((c) => ({ id: c.id, from: c.readableFrom, to: c.readableTo })));
  for (const f of forced) { const c = m.find((x) => x.id === f.id)!; shots.push([`${f.id}-${f.set.split('/')[1]}-mid`, (c.from + c.to) / 2], [`${f.id}-${f.set.split('/')[1]}-late`, c.from + (c.to - c.from) * 0.85]); }
}
const tag = `${a.style}-${a.song}${a.seed === '0' ? '' : `-s${a.seed}`}`;
for (const [name, t] of shots) {
  // (a jump lands before the line there is built: the frame after it has the words' box)
  await page.evaluate((x) => window.grabAt(x, 0.1), t);
  const url = await page.evaluate((x) => window.grabAt(x, 0.9), t);
  writeFileSync(join(out, `${tag}-${name}.jpg`), Buffer.from(url.split(',')[1], 'base64'));
}
console.log(shots.length, 'frames', tag);
await browser.close();
server.close();
