// The opaque reveal's timing against the fades it replaced (owner 2026-11-14): every output frame round every line, each
// line's first frame a glyph shows (over 0.01), first frame it is whole and opaque (every glyph it shows at 0.99), last
// opaque frame and last shown frame, with the fades (QA __vjFadeReveal) and without, and against the line's sung start.
//   nice -n 19 npx tsx --tsconfig tsconfig.json scripts/lyric-vj/reveal-timing.mts --world dark-glitch --song choroin --out DIR
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
const { values: a } = parseArgs({ options: { out: { type: 'string' }, world: { type: 'string' }, song: { type: 'string' }, seed: { type: 'string', default: '0' } } });
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
const { job } = freeJob(song, { style: FREE_STYLES.find((s) => s.id === a.world)!, seed: Number(a.seed), meaning });
const file = join(work, 'job.json');
writeFileSync(file, JSON.stringify({ ...job, live: true }));
const fps = job.fps ?? 30;
type Times = { show?: number; whole?: number; lastWhole?: number; last?: number; max: number };
const result: Record<string, Record<string, Times>> = {};
for (const mode of ['fade', 'opaque']) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  if (mode === 'fade') await page.addInitScript('window.__vjFadeReveal = true');
  await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, async (route) => { const font = await getFont(route.request().url(), route.request().headers()['user-agent'] ?? ''); return font ? route.fulfill({ body: font.body, contentType: font.type, headers: { 'access-control-allow-origin': '*' } }) : route.abort(); });
  await page.goto(`http://127.0.0.1:${(server.address() as { port: number }).port}/${relative(ROOT, work)}/render.html?job=/${relative(ROOT, file)}`);
  await page.waitForSelector('body[data-ready="1"]', { timeout: 600000 });
  const cues = (await page.evaluate(() => window.vjMetrics().cues.map((c) => ({ from: c.readableFrom, to: c.readableTo })))) as { from: number; to: number }[];
  const frames = new Set<number>();
  for (const c of cues) for (let f = Math.round((c.from - 1) * fps); f <= Math.round((c.to + 1) * fps); f++) frames.add(f);
  const times: Record<string, Times> = (result[mode] = {});
  for (const f of [...frames].sort((x, y) => x - y)) {
    const t = f / fps;
    const lines = (await page.evaluate(`window.vjFrame(${t}).then(() => window.vjGlyphs().map((l) => ({ id: l.id, a: l.glyphs.map((g) => g.a) })))`)) as { id: string; a: number[] }[];
    for (const l of lines) {
      const shown = l.a.filter((x) => x > 0.01);
      if (!shown.length) continue;
      const x = (times[l.id] ??= { max: 0 });
      x.show ??= t;
      x.last = t;
      x.max = Math.max(x.max, shown.length);
      // (whole: as many glyphs as the line ever shows at once, every one opaque)
      if (shown.length >= x.max && shown.every((v) => v >= 0.99)) { x.whole ??= t; x.lastWhole = t; }
    }
  }
  await page.close();
}
const start = new Map((song.cues as { id: string; start: number }[]).map((c) => [c.id, c.start]));
const rows = Object.keys(result['fade']).filter((id) => start.has(id)).map((id) => {
  const [f, o] = [result['fade'][id], result['opaque'][id] ?? { max: 0 }];
  const d = (x?: number, y?: number) => (x === undefined || y === undefined ? null : +(y - x).toFixed(3));
  return { id, sung: start.get(id), showLater: d(f.show, o.show), wholeLater: d(f.whole, o.whole), lastWholeLater: d(f.lastWhole, o.lastWhole), lastLater: d(f.last, o.last), wholeVsSung: { fade: d(start.get(id), f.whole), opaque: d(start.get(id), o.whole) } };
});
const later = (k: 'showLater' | 'wholeLater') => rows.filter((r) => (r[k] ?? 0) > 1e-6).map((r) => `${r.id} +${r[k]}`);
const summary = { lines: rows.length, showLater: later('showLater'), wholeLater: later('wholeLater'), wholeEarlierMean: +(rows.reduce((s, r) => s + (r.wholeLater ?? 0), 0) / Math.max(1, rows.length)).toFixed(3) };
writeFileSync(join(out, `${a.world}-${a.song}.json`), JSON.stringify({ summary, rows, result }, null, 1));
console.log(JSON.stringify(summary));
await browser.close();
server.close();
