// Full-size frames straight from the engine, no video: for looking at a style while it is built.
// npx tsx --tsconfig tsconfig.json scripts/lyric-vj/world-stills.mts --out dir --song nun --style ukiyoe [--lines 8] [--at 12,30] [--pieces] [--seed 0]
// --lines: that many line midpoints, spread over the song. --pieces: every set piece of the style forced onto a sung cut, six frames each.
import { copyFileSync, createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import * as esbuild from 'esbuild';
import { chromium } from 'playwright';
import { freeJob } from '../../src/app/lyric-vj/free-plan';
import { FREE_STYLES } from '../../src/app/lyric-vj/free-styles';
import { WORLD_PIECES } from '../../src/app/lyric-vj/render/world-pieces';
import { fontCache } from './font-cache.mts';

const IDS: Record<string, string> = { nun: 'yt_w_fCuUR3lEs', snow: 'yt_5i50aTB7JFo', tsuzuki: 'yt_b3GCfyNKeLs', choroin: 'yt_hCCskTJwvuc', tenmon: 'yt_iwYXfOhcsYI' };
const { values: a } = parseArgs({ options: { out: { type: 'string' }, song: { type: 'string', default: 'nun' }, style: { type: 'string' }, seed: { type: 'string', default: '0' }, lines: { type: 'string', default: '0' }, at: { type: 'string', default: '' }, pieces: { type: 'boolean', default: false }, only: { type: 'string', default: '' }, frames: { type: 'string', default: '6' } } });
const out = a.out!;
const work = join(out, 'work');
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
const sections = job.treatment.graphics!.sections as { start: number; layers: { world?: { piece?: string; words?: string; title?: string } }[] }[];
const shots: [string, number][] = [];
if (a.pieces) {
  // each piece on a sung cut of its own, the cuts after it cleared for as long as it runs
  const pool = style.world.pieces.filter((p) => !a.only || a.only.split(',').includes(p));
  const cues = song.cues as { start: number; end: number; text: string }[];
  const step = Math.floor(cues.length / (pool.length + 1));
  for (const [i, p] of pool.entries()) {
    const cue = cues[Math.max(2, (i + 1) * step)];
    const at = sections.findLastIndex((s) => s.start <= cue.start + 0.02);
    const sec = sections[at];
    sec.layers[0].world = { ...sec.layers[0].world!, piece: p, words: cue.text, title: song.title };
    const dur = WORLD_PIECES[p].sec;
    const later = sections.filter((s) => s.start > sec.start && s.start < sec.start + dur + 0.05);
    for (const s of later) sections.splice(sections.indexOf(s), 1);
    const n = Number(a.frames);
    for (let f = 0; f < n; f++) shots.push([`${p}-${f}`, sec.start + 0.02 + (dur - 0.04) * (f / (n - 1))]);
  }
}
for (const t of a.at ? a.at.split(',').map(Number) : []) shots.push([`t${t}`, t]);
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
if (Number(a.lines)) {
  const cues = await page.evaluate(() => window.vjMetrics().cues.map((c) => ({ id: c.id, from: c.readableFrom, to: c.readableTo })));
  const n = Number(a.lines);
  for (let i = 0; i < n; i++) { const c = cues[Math.floor(((i + 0.5) * cues.length) / n)]; shots.push([`line-${String(i).padStart(2, '0')}-${c.id}`, (c.from + c.to) / 2]); }
}
const tag = `${a.style}-${a.song}${a.seed === '0' ? '' : `-s${a.seed}`}`;
for (const [name, t] of shots) {
  // (a jump lands before the line there is built: the frame after it has the words' box)
  await page.evaluate((x) => window.grabAt(x, 0.1), t);
  const url = await page.evaluate((x) => window.grabAt(x, 0.9), t);
  writeFileSync(join(out, `${tag}-${name}.jpg`), Buffer.from(url.split(',')[1], 'base64'));
}
console.log(shots.length, 'frames', tag, JSON.stringify(sections.flatMap((s) => (s.layers[0].world?.piece ? [[s.layers[0].world.piece, +s.start.toFixed(1)]] : [])).slice(0, 12)));
await browser.close();
server.close();
