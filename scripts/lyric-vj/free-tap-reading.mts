// The reading rules on tapped lines: starts from the stored timing with a person's jitter, or far too fast, go through the
// free flow's songFromLines and freeJob, and the real engine measures every line (no frames written).
// npx tsx --tsconfig tsconfig.json scripts/lyric-vj/free-tap-reading.mts --out <dir>
import { copyFileSync, createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { extname, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import * as esbuild from 'esbuild';
import { chromium } from 'playwright';
import { BEAT_RATE, detectBeats } from '../../src/app/lyric-vj/beat-detect';
import { freeJob } from '../../src/app/lyric-vj/free-plan';
import { songFromLines } from '../../src/app/lyric-vj/free-song';
import { startTap, tapLine, linesOf } from '../../src/app/lyric-vj/free-tap';
import { placeLines } from '../../src/app/lyric-vj/free-lyrics';
import { fontCache } from './font-cache.mts';

const { values: a } = parseArgs({ options: { out: { type: 'string' } } });
const out = a.out!;
mkdirSync(out, { recursive: true });
await esbuild.build({ entryPoints: ['src/app/lyric-vj/render/main.ts'], bundle: true, format: 'esm', target: 'es2022', outfile: join(out, 'render.js'), logLevel: 'warning' });
copyFileSync('scripts/lyric-vj/render.html', join(out, 'render.html'));
const ROOT = process.cwd();
const server = createServer((req, res) => {
  const path = join(ROOT, decodeURIComponent(new URL(req.url!, 'http://x').pathname));
  if (!existsSync(path)) return void res.writeHead(404).end();
  res.writeHead(200, { 'content-type': { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' }[extname(path)] ?? 'application/octet-stream' });
  createReadStream(path).pipe(res);
}).listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
const browser = await chromium.launch({ channel: 'chromium', args: ['--force-device-scale-factor=1', '--ignore-gpu-blocklist'] });
const getFont = fontCache(resolve('out/font-cache'));

type M = { id: string; text: string; ok: boolean; readableSec: number; requiredSec: number; restSize?: number; start?: number; end?: number };
async function measure(job: unknown, tag: string) {
  const file = join(out, `${tag}.job.json`);
  writeFileSync(file, JSON.stringify(job));
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errors: string[] = [];
  await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, async (route) => {
    const u = route.request().url();
    const font = await getFont(u, route.request().headers()['user-agent'] ?? '');
    return font ? route.fulfill({ body: font.body, contentType: font.type, headers: { 'access-control-allow-origin': '*' } }) : route.abort();
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/${relative(ROOT, resolve(out))}/render.html?job=/${relative(ROOT, resolve(file))}`);
  await page.waitForSelector('body[data-ready="1"]', { timeout: 120000 });
  const cues = await page.evaluate('window.vjMetrics().cues') as M[];
  await page.close();
  return { cues, errors };
}

const pcm = (file: string) => {
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(BEAT_RATE), '-f', 'f32le', '-'], { maxBuffer: 2 ** 31 - 1 });
  return new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
};
let seed = 11;
const jitter = () => (((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1) * 0.08;
const rows: unknown[] = [];
const run = async (tag: string, id: string, starts: (c: { start: number }, i: number) => number) => {
  const stored = JSON.parse(readFileSync(`out/db/${id}/song.json`, 'utf8'));
  const cues = stored.cues as { start: number; text: string }[];
  let s = startTap(cues.map((c) => ({ text: c.text })));
  cues.forEach((c, i) => (s = tapLine(s, starts(c, i))));
  const song = songFromLines(placeLines(linesOf(s), stored.duration)!, { title: stored.title, bpm: 120, duration: stored.duration, exact: true, rhythm: detectBeats(pcm(stored.audio.mix), BEAT_RATE) });
  const { job } = freeJob(song);
  const m = await measure(job, tag);
  const bad = m.cues.filter((c) => !c.ok);
  const row = { tag, lines: m.cues.length, tempo: song.tempo, readFail: bad.map((c) => `${c.id} ${c.readableSec?.toFixed(2)}/${c.requiredSec?.toFixed(2)}`), minRest: Math.min(...m.cues.map((c) => c.restSize ?? 999)), errors: m.errors };
  rows.push(row);
  console.log(JSON.stringify(row));
};
for (const [tag, id] of [['tsuzuki', 'yt_b3GCfyNKeLs'], ['nun', 'yt_w_fCuUR3lEs'], ['choroin', 'yt_hCCskTJwvuc']] as const) await run(`${tag}-tapped`, id, (c) => c.start + jitter());
// control: the same song through the same engine with its stored timing, untouched by this flow
{
  const stored = JSON.parse(readFileSync('out/db/yt_w_fCuUR3lEs/song.json', 'utf8'));
  const m = await measure(freeJob(stored).job, 'nun-control');
  const ids = new Set(m.cues.map((c) => c.id));
  console.log(JSON.stringify({ tag: 'nun-control', lines: m.cues.length, missing: stored.cues.filter((c: { id: string }) => !ids.has(c.id)).map((c: { id: string; text: string }) => `${c.id} ${c.text}`), readFail: m.cues.filter((c) => !c.ok).map((c) => `${c.id} ${c.readableSec?.toFixed(2)}/${c.requiredSec?.toFixed(2)}`) }));
}
// too fast to read: the same lines a second apart
await run('fast', 'yt_w_fCuUR3lEs', (_, i) => 10 + i);
await browser.close();
server.close();
