// Before/after crops of the glyph pictures' edges (2026-11-15: straight alpha ran a stroke edge toward black;
// premultiplied now): the same world × song × moment drawn with the old upload (__vjStraightGlyphs) and the new one,
// the words' first glyphs cropped and shown 3× (nearest), old above new, one PNG a world.
//   nice -n 19 npx tsx --tsconfig tsconfig.json scripts/lyric-vj/glyph-edge-compare.mts --out DIR --song choroin dark-glitch popart riso neon-stage card screentone
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
const { values: a, positionals } = parseArgs({ allowPositionals: true, options: { out: { type: 'string' }, song: { type: 'string', default: 'choroin' }, cue: { type: 'string', default: '8' }, before: { type: 'string', default: 'window.__vjStraightGlyphs = true' } } });
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
type Box = { x0: number; y0: number; x1: number; y1: number; a: number };
for (const world of positionals) {
  const { job } = freeJob(song, { style: FREE_STYLES.find((s) => s.id === world)!, seed: 0, meaning });
  const file = join(work, `${world}.job.json`);
  writeFileSync(file, JSON.stringify({ ...job, live: true }));
  const shots: string[] = [];
  let at: { t: number; crop: [number, number, number, number] } | undefined;
  for (const straight of [true, false]) {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    // (tsx names the helpers of any function it serialises into the page: give the page the name helper)
    await page.addInitScript('globalThis.__name = (f) => f');
    // (the "before": what --before sets, the old upload by default)
    if (straight) await page.addInitScript(a.before!);
    await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, async (route) => { const font = await getFont(route.request().url(), route.request().headers()['user-agent'] ?? ''); return font ? route.fulfill({ body: font.body, contentType: font.type, headers: { 'access-control-allow-origin': '*' } }) : route.abort(); });
    await page.goto(`http://127.0.0.1:${(server.address() as { port: number }).port}/${relative(ROOT, work)}/render.html?job=/${relative(ROOT, file)}`);
    await page.waitForSelector('body[data-ready="1"]', { timeout: 600000 });
    if (!at) {
      // (the moment: the middle of the `cue`-th line's reading; the crop: its first three glyphs and a margin)
      const cues = (await page.evaluate(() => window.vjMetrics().cues.map((c) => ({ id: c.id, from: c.readableFrom, to: c.readableTo })))) as { id: string; from: number; to: number }[];
      const c = cues[Math.min(cues.length - 1, Number(a.cue))];
      const t = (c.from + c.to) / 2;
      const gs = (await page.evaluate(`window.vjFrame(${t}).then(() => window.vjGlyphs().find((l) => l.id === '${c.id}')?.glyphs ?? [])`)) as Box[];
      const g = gs.filter((x) => x.a > 0.5).slice(0, 3);
      const [x0, y0, x1, y1] = g.length ? [Math.min(...g.map((b) => b.x0)), Math.min(...g.map((b) => b.y0)), Math.max(...g.map((b) => b.x1)), Math.max(...g.map((b) => b.y1))] : [760, 440, 1160, 640];
      const [w, h] = [Math.min(400, Math.ceil(x1 - x0) + 24), Math.min(220, Math.ceil(y1 - y0) + 24)];
      at = { t, crop: [Math.max(0, Math.floor(x0 - 12)), Math.max(0, Math.floor(y0 - 12)), w, h] };
    }
    const png = (await page.evaluate(`window.vjFrame(${at.t}).then((c) => { const [x, y, w, h] = ${JSON.stringify(at.crop)}; const o = document.createElement('canvas'); o.width = w * 3; o.height = h * 3; const g = o.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(c, x, y, w, h, 0, 0, w * 3, h * 3); return o.toDataURL('image/png'); })`)) as string;
    shots.push(png);
    await page.close();
  }
  const pair = await browser.newPage();
  await pair.addInitScript('globalThis.__name = (f) => f');
  // (a string, not a function: tsx names the helpers of a serialised function, and the page has no __name)
  const both = (await pair.evaluate(`(async ([p, q]) => {
    const load = (s) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = s; });
    const [i, j] = [await load(p), await load(q)];
    const c = document.createElement('canvas');
    c.width = i.width; c.height = i.height * 2 + 6;
    const g = c.getContext('2d');
    g.fillStyle = '#888';
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(i, 0, 0);
    g.drawImage(j, 0, i.height + 6);
    return c.toDataURL('image/png');
  })(${JSON.stringify(shots)})`)) as string;
  await pair.close();
  writeFileSync(join(out, `${world}_上改前_下改後.png`), Buffer.from(both.split(',')[1], 'base64'));
  console.log(world, at);
}
await browser.close();
server.close();
