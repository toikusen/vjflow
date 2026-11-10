// Every line the signature layer takes over, every offered world × the five gate songs, seed 0 (phase 4d round 5): read
// at the middle and near the end of its readable time like the reading gate does (gate-page moment, with and without
// the lyrics), counting the moments where it shows no ink. Writes out/research/q1-1109/sig-scan.json.
//   npx tsx --tsconfig tsconfig.json scripts/lyric-vj/sig-scan.mts [--worlds a,b] [--songs nun,snow]
import { copyFileSync, createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import * as esbuild from 'esbuild';
import { chromium } from 'playwright';
import { freeJob } from '../../src/app/lyric-vj/free-plan';
import { OFFERED_STYLES } from '../../src/app/lyric-vj/free-styles';
import { fontCache } from './font-cache.mts';

const IDS: Record<string, string> = { nun: 'yt_w_fCuUR3lEs', snow: 'yt_5i50aTB7JFo', tsuzuki: 'yt_b3GCfyNKeLs', choroin: 'yt_hCCskTJwvuc', tenmon: 'yt_iwYXfOhcsYI' };
const { values: a } = parseArgs({ options: { worlds: { type: 'string' }, songs: { type: 'string', default: 'nun,snow,tsuzuki,choroin,tenmon' }, out: { type: 'string', default: 'out/research/q1-1109/sig-scan.json' } } });
const worlds = a.worlds ? a.worlds.split(',') : OFFERED_STYLES.map((s) => s.id);
const work = 'out/research/q1-1109/sig-scan';
mkdirSync(work, { recursive: true });
await esbuild.build({ entryPoints: ['src/app/lyric-vj/render/main.ts'], bundle: true, format: 'esm', target: 'es2022', outfile: join(work, 'render.js'), logLevel: 'warning' });
copyFileSync('scripts/lyric-vj/render.html', join(work, 'render.html'));
await esbuild.build({ entryPoints: ['scripts/lyric-vj/gate-page.mts'], bundle: true, format: 'iife', target: 'es2022', outfile: join(work, 'gate-page.js'), logLevel: 'warning' });
const ROOT = process.cwd();
const server = createServer((req, res) => { const asked = decodeURIComponent(new URL(req.url!, 'http://x').pathname); const path = join(ROOT, asked.startsWith('/fonts/') ? join('out', asked) : asked); if (!existsSync(path)) return void res.writeHead(404).end(); res.writeHead(200, { 'content-type': { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' }[extname(path)] ?? 'application/octet-stream' }); createReadStream(path).pipe(res); }).listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const browser = await chromium.launch({ channel: 'chromium', args: ['--force-device-scale-factor=1', '--ignore-gpu-blocklist'] });
const getFont = fontCache(resolve('out/font-cache'));
const rows: { world: string; song: string; cue: string; t: number; share: number }[] = [];
let moments = 0;
for (const name of a.songs!.split(',')) {
  const song = JSON.parse(readFileSync(`out/db/${IDS[name]}/song.json`, 'utf8'));
  const meaning = JSON.parse(readFileSync(`out/research/instant/plans/${name}/meaning.json`, 'utf8'));
  for (const id of worlds) {
    const { job } = freeJob(song, { style: OFFERED_STYLES.find((s) => s.id === id)!, seed: 0, meaning });
    if (!((job.treatment as { signature?: unknown[] }).signature ?? []).length) continue;
    const file = join(work, `${id}-${name}.job.json`);
    writeFileSync(file, JSON.stringify({ ...job, live: true }));
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.addInitScript({ path: join(work, 'gate-page.js') });
    await page.addInitScript('window.__carriers = true');
    await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, async (route) => { const font = await getFont(route.request().url(), route.request().headers()['user-agent'] ?? ''); return font ? route.fulfill({ body: font.body, contentType: font.type, headers: { 'access-control-allow-origin': '*' } }) : route.abort(); });
    await page.goto(`http://127.0.0.1:${(server.address() as { port: number }).port}/${relative(ROOT, resolve(work))}/render.html?job=/${relative(ROOT, resolve(file))}`);
    await page.waitForSelector('body[data-ready="1"]', { timeout: 200000 });
    const cues = (await page.evaluate(() => window.vjMetrics().cues.map((c) => ({ id: c.id, from: c.readableFrom, to: c.readableTo, template: (c as { template?: string }).template })))).filter((c) => c.template === 'signature');
    for (const c of cues)
      for (const t of [(c.from + c.to) / 2, c.to - 0.08]) {
        const m = (await page.evaluate(`window.gatePage.moment(${t}, 320, 180)`)) as { n: number; sum: number };
        moments++;
        const share = m.n / (320 * 180);
        if (share < 0.002 || m.sum / Math.max(1, m.n) < 40) rows.push({ world: id, song: name, cue: c.id, t: +t.toFixed(2), share: +share.toFixed(4) });
      }
    await page.close();
  }
  console.log(name, 'blank so far', rows.length, 'of', moments);
}
await browser.close();
server.close();
writeFileSync(a.out!, JSON.stringify({ moments, blank: rows.length, rows }, null, 1));
console.log(JSON.stringify({ moments, blank: rows.length }), rows.slice(0, 10));
