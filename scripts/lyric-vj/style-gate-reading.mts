// Lyrics really on screen while they should be read: the same frame with and without the lyric layer, at the middle and near
// the end of every line's readable time. A line that adds almost nothing to its frame is invisible, whatever the metrics say
// (dark words left on a dark ground after a line moved off its paper). No video written.
// The same moments are read against the shared reading rules (src/app/lyric-vj/reading-rules.ts): words cut by the frame,
// a dark plate under them, small words on an empty frame, the picture's lines under the strokes, ink under 4.5:1, and a
// soft glow laid behind them. Counts per world go to <out>/<worlds>.json; --baseline fails a world that got worse.
// npx tsx --tsconfig tsconfig.json scripts/lyric-vj/style-gate-reading.mts --out out/research/styles/gate/reading [--songs nun,snow] [--baseline f.json] [--write-baseline f.json] terminal ink-wash
// (no worlds named: every world not held)
import { copyFileSync, createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import * as esbuild from 'esbuild';
import { chromium, Page } from 'playwright';
import { freeJob } from '../../src/app/lyric-vj/free-plan';
import { FREE_STYLES, HELD_WORLDS } from '../../src/app/lyric-vj/free-styles';
import { countMoment, emptyCounts, RuleCounts, RuleMoment, regressions } from '../../src/app/lyric-vj/reading-rules';
import { fontCache } from './font-cache.mts';

const IDS: Record<string, string> = { nun: 'yt_w_fCuUR3lEs', snow: 'yt_5i50aTB7JFo', tsuzuki: 'yt_b3GCfyNKeLs', choroin: 'yt_hCCskTJwvuc', tenmon: 'yt_iwYXfOhcsYI' };
const { values: a, positionals } = parseArgs({ allowPositionals: true, options: { out: { type: 'string', default: 'out/research/styles/gate/reading' }, songs: { type: 'string', default: 'nun,snow,tsuzuki,choroin,tenmon' }, seed: { type: 'string', default: '0' }, baseline: { type: 'string' }, 'write-baseline': { type: 'string' } } });
if (!positionals.length) positionals.push(...FREE_STYLES.filter((s) => !HELD_WORLDS.has(s.id)).map((s) => s.id));
/** Share of a frame a line must change, and how hard, to count as there. */
export const READ = { minShare: 0.002, minDelta: 40 };
const [GW, GH] = [320, 180];
const work = join(a.out!, 'work', positionals.join('-').slice(0, 30));
mkdirSync(work, { recursive: true });
await esbuild.build({ entryPoints: ['src/app/lyric-vj/render/main.ts'], bundle: true, format: 'esm', target: 'es2022', outfile: join(work, 'render.js'), logLevel: 'warning' });
copyFileSync('scripts/lyric-vj/render.html', join(work, 'render.html'));
await esbuild.build({ entryPoints: ['scripts/lyric-vj/gate-page.mts'], bundle: true, format: 'iife', target: 'es2022', outfile: join(work, 'gate-page.js'), logLevel: 'warning' });
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
/** One moment, read in the page (gate-page.mts): the reading measure, the rules and whether a soft clearing was drawn. */
const moment = (p: Page, t: number) => p.evaluate(`window.gatePage.moment(${t}, ${GW}, ${GH})`) as Promise<{ n: number; sum: number; x0: number; x1: number; y0: number; y1: number; rules?: RuleMoment; soft: boolean }>;
const fails: string[] = [];
const fill: number[] = [];
let checked = 0;
const counts: Record<string, RuleCounts> = {};
const moments: string[] = [];
for (const id of positionals) {
  const style = FREE_STYLES.find((s) => s.id === id)!;
  for (const name of a.songs!.split(',')) {
    const song = JSON.parse(readFileSync(`out/db/${IDS[name]}/song.json`, 'utf8'));
    const meaning = JSON.parse(readFileSync(`out/research/instant/plans/${name}/meaning.json`, 'utf8'));
    const { job } = freeJob(song, { style, seed: Number(a.seed), meaning });
    const file = join(work, `${id}-${name}.job.json`);
    writeFileSync(file, JSON.stringify({ ...job, live: true }));
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.addInitScript({ path: join(work, 'gate-page.js') });
    await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, async (route) => {
      const font = await getFont(route.request().url(), route.request().headers()['user-agent'] ?? '');
      return font ? route.fulfill({ body: font.body, contentType: font.type, headers: { 'access-control-allow-origin': '*' } }) : route.abort();
    });
    await page.goto(`http://127.0.0.1:${(server.address() as { port: number }).port}/${relative(ROOT, resolve(work))}/render.html?job=/${relative(ROOT, resolve(file))}`);
    await page.waitForSelector('body[data-ready="1"]', { timeout: 200000 });
    const cues = await page.evaluate(() => window.vjMetrics().cues.map((c) => ({ id: c.id, from: c.readableFrom, to: c.readableTo, text: c.text })));
    for (const c of cues) {
      // the video's own ending fade takes the last line with it, in every style
      const ending = c === cues.at(-1);
      for (const t of ending ? [(c.from + c.to) / 2 - 1] : [(c.from + c.to) / 2, c.to - 0.08]) {
        const { n, sum, x0, x1, y0, y1, rules: r, soft } = await moment(page, t);
        const share = n / (GW * GH);
        checked++;
        if (share >= READ.minShare) fill.push(((x1 - x0) * (y1 - y0)) / (GW * GH));
        if (share < READ.minShare || sum / Math.max(1, n) < READ.minDelta) fails.push(`${id} ${name} ${c.id} ${t.toFixed(2)} share ${share.toFixed(4)} delta ${(sum / Math.max(1, n)).toFixed(0)} ${c.text.slice(0, 10)}`);
        if (!r) continue;
        const m = r;
        counts[id] = countMoment(counts[id] ?? emptyCounts(), m, soft);
        const why = [soft && 'glow', m.clip && 'clip', m.plate < 0 && 'plate', m.small && 'small', m.cross > 0.08 && `cross ${m.cross.toFixed(2)}`, m.low > 0.5 && `low ${m.low.toFixed(2)}`].filter(Boolean);
        if (why.length) moments.push(`${id} ${name} ${c.id} ${t.toFixed(2)} ${why.join(' ')} ${c.text.slice(0, 10)}`);
      }
    }
    await page.close();
    console.log(id, name, 'fails so far', fails.length);
  }
}
await browser.close();
server.close();
const sorted = [...fill].sort((x, y) => x - y);
const out = { checked, fails, fillMedian: +sorted[Math.floor(sorted.length / 2)].toFixed(3), fillP10: +sorted[Math.floor(sorted.length * 0.1)].toFixed(3), rules: counts, ruleMoments: moments };
writeFileSync(join(a.out!, `${positionals.join('-').slice(0, 40)}.json`), JSON.stringify(out, null, 1));
console.log(JSON.stringify({ ...out, fails: out.fails.length, ruleMoments: moments.length }), out.fails.slice(0, 6));
// the rules against a world's recorded counts: a world that got worse on any rule fails
const worse: string[] = [];
if (a.baseline && existsSync(a.baseline)) {
  const base = JSON.parse(readFileSync(a.baseline, 'utf8')) as Record<string, RuleCounts>;
  for (const [id, c] of Object.entries(counts)) if (base[id]) for (const k of regressions(base[id], c)) worse.push(`${id}: ${k} ${c[k]}/${c.moments} (was ${base[id][k]}/${base[id].moments})`);
  console.log('rule regressions', worse.length, worse);
}
if (a['write-baseline']) {
  const file = a['write-baseline'];
  const base = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  writeFileSync(file, JSON.stringify({ ...base, ...counts }, null, 1) + '\n');
}
process.exitCode = fails.length || worse.length ? 1 : 0;
