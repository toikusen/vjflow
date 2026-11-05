// Is the line the focus of the document world's receipt? At every line's middle and near the end of its readable time, three
// frames: as shown, without the lyric (what it stands on kept), and without the receipt's small print as well
// (globalThis.vjDocBare, world-doc-receipt.ts). Lyric ink = pixels the lyric changes; other ink = pixels the small print
// (rows, shop block, rules, barcode, the torn slip, the tail) changes. Share = lyric / (lyric + other). Size = the tallest
// run of lyric ink rows (one printed row of the line, px) against the largest small type on the frame (its size, px).
// Targets (owner, 2026-11-05): share >= 0.5, size >= 2.5.
// npx tsx --tsconfig tsconfig.json scripts/lyric-vj/doc-focus.mts --song nun [--seed 0] [--out out/research/doc-v2/focus]
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
const { values: a } = parseArgs({ options: { song: { type: 'string', default: 'nun' }, seed: { type: 'string', default: '0' }, out: { type: 'string', default: 'out/research/doc-v2/focus' }, shots: { type: 'boolean', default: false } } });
const out = a.out!;
const work = join(out, `work-${a.song}`);
mkdirSync(work, { recursive: true });
await esbuild.build({ entryPoints: ['src/app/lyric-vj/render/main.ts'], bundle: true, format: 'esm', target: 'es2022', outfile: join(work, 'render.js'), logLevel: 'warning' });
copyFileSync('scripts/lyric-vj/render.html', join(work, 'render.html'));
const ROOT = process.cwd();
const server = createServer((req, res) => {
  const asked = decodeURIComponent(new URL(req.url!, 'http://x').pathname);
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
const style = FREE_STYLES.find((s) => s.id === 'document')!;
const { job } = freeJob(song, { style, seed: Number(a.seed), meaning });
const sets = new Map((job.treatment.cues as { cueId: string; world?: { set: string } }[]).map((c) => [c.cueId, c.world?.set ?? '']));
const file = join(work, 'job.json');
writeFileSync(file, JSON.stringify({ ...job, live: true }));
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
// (tsx names the arrow functions it passes to the page)
await page.addInitScript('window.__name = (f) => f');
await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, async (route) => {
  const font = await getFont(route.request().url(), route.request().headers()['user-agent'] ?? '');
  return font ? route.fulfill({ body: font.body, contentType: font.type, headers: { 'access-control-allow-origin': '*' } }) : route.abort();
});
page.on('pageerror', (e) => console.log('pageerror', e.message.slice(0, 300)));
await page.goto(`http://127.0.0.1:${(server.address() as { port: number }).port}/${relative(ROOT, resolve(work))}/render.html?job=/${relative(ROOT, resolve(file))}`);
await page.waitForSelector('body[data-ready="1"]', { timeout: 200000 });
const cues = await page.evaluate(() => (window as any).vjMetrics().cues.map((c: any) => ({ id: c.id, from: c.readableFrom, to: c.readableTo })));

/** One moment, measured in the page at full size. */
const measure = (t: number) => page.evaluate(async (t) => {
  const w = window as any;
  const grab = async (lyrics: boolean, bare: boolean) => {
    w.vjLyrics(lyrics, true);
    w.vjDocBare = bare;
    w.grabAt(t, 0.1);
    const img = new Image();
    img.src = await w.grabAt(t, 0.7);
    await img.decode();
    const c = new OffscreenCanvas(1920, 1080).getContext('2d', { willReadFrequently: true })!;
    c.drawImage(img, 0, 0);
    const d = c.getImageData(0, 0, 1920, 1080).data;
    const largest = (globalThis as any).vjDocPrint?.largest ?? 0;
    return { d, largest };
  };
  const on = await grab(true, false);
  const off = await grab(false, false);
  const bare = await grab(false, true);
  w.vjLyrics(true);
  w.vjDocBare = false;
  const differs = (p: Uint8ClampedArray, q: Uint8ClampedArray, i: number) => Math.abs(p[i] - q[i]) + Math.abs(p[i + 1] - q[i + 1]) + Math.abs(p[i + 2] - q[i + 2]) > 120;
  let lyric = 0;
  let other = 0;
  const rows = new Uint8Array(1080);
  for (let i = 0; i < 1920 * 1080; i++) {
    if (differs(on.d, off.d, i * 4)) { lyric++; rows[Math.floor(i / 1920)] = 1; }
    if (differs(off.d, bare.d, i * 4)) other++;
  }
  // (the tallest run of rows holding lyric ink: one printed row of the line)
  let run = 0;
  let best = 0;
  for (let y = 0; y < 1080; y++) { run = rows[y] ? run + 1 : 0; best = Math.max(best, run); }
  return { lyric, other, lyricRow: best, smallLargest: on.largest };
}, t);

const rows: { id: string; set: string; t: number; share: number; size: number; lyric: number; other: number; lyricRow: number; smallLargest: number }[] = [];
for (const c of cues) {
  if (!(c.to > c.from)) continue;
  for (const q of [0.5, 0.85]) {
    const t = +(c.from + (c.to - c.from) * q).toFixed(3);
    const m = await measure(t);
    if (!m.lyric) continue;
    rows.push({ id: c.id, set: sets.get(c.id) ?? '', t, share: +(m.lyric / (m.lyric + m.other)).toFixed(3), size: +(m.lyricRow / Math.max(1, m.smallLargest)).toFixed(2), ...m });
  }
}
await browser.close();
server.close();
const doc = rows.filter((r) => r.set.startsWith('document/'));
const pct = (xs: number[], p: number) => { const s = [...xs].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0; };
const summary = {
  song: a.song, seed: Number(a.seed), moments: doc.length,
  share: { min: pct(doc.map((r) => r.share), 0), p10: pct(doc.map((r) => r.share), 0.1), median: pct(doc.map((r) => r.share), 0.5), under50: doc.filter((r) => r.share < 0.5).length },
  size: { min: pct(doc.map((r) => r.size), 0), median: pct(doc.map((r) => r.size), 0.5), under25: doc.filter((r) => r.size < 2.5).length },
};
writeFileSync(join(out, `${a.song}-s${a.seed}.json`), JSON.stringify({ summary, rows }, null, 1));
console.log(JSON.stringify(summary));
for (const r of doc.filter((r) => r.share < 0.5 || r.size < 2.5)) console.log('below', r.id, r.set, r.t, r.share, r.size);
