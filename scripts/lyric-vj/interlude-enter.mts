// Does a line come in before its own picture? For every line, the time its entrance starts (the engine's showFrom) against
// the start of the picture it is planned on (its shot's first cut, the graphics section that starts with it). A negative
// lead is a line printing on the picture before it. Lines after an interlude (the shot before has no line) are reported on
// their own: that is where the picture before is a different page (the thermal receipt's 雙截棍 02:32, 2026-11-05).
// --strip <cue>: frames from 0.4 s before that line's entrance to 0.3 s after its start, one every 0.1 s, to <out>.
// npx tsx --tsconfig tsconfig.json scripts/lyric-vj/interlude-enter.mts --songs nun,snow,tsuzuki --out out/research/interlude-enter document neon-stage
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
const { values: a, positionals } = parseArgs({ allowPositionals: true, options: { songs: { type: 'string', default: 'nun,snow,tsuzuki' }, seed: { type: 'string', default: '0' }, out: { type: 'string', default: 'out/research/interlude-enter' }, strip: { type: 'string' } } });
const out = a.out!;
const work = join(out, 'work');
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
type Row = { id: string; text: string; start: number; show: number; picture: number; lead: number; afterGap: boolean };
const report: Record<string, Record<string, { cuts: number; short: number; dropped: number; all: { n: number; early: number; worst: number }; afterGap: { n: number; early: number; worst: number; leads: number[] }; rows: Row[] }>> = {};
for (const world of positionals) {
  for (const key of a.songs!.split(',')) {
    const song = JSON.parse(readFileSync(`out/db/${IDS[key]}/song.json`, 'utf8'));
    const meaning = JSON.parse(readFileSync(`out/research/instant/plans/${key}/meaning.json`, 'utf8'));
    const style = FREE_STYLES.find((s) => s.id === world)!;
    const { job } = freeJob(song, { style, seed: Number(a.seed), meaning });
    const file = join(work, `job-${world}-${key}.json`);
    writeFileSync(file, JSON.stringify({ ...job, live: true }));
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.addInitScript('window.__name = (f) => f');
    await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, async (route) => {
      const font = await getFont(route.request().url(), route.request().headers()['user-agent'] ?? '');
      return font ? route.fulfill({ body: font.body, contentType: font.type, headers: { 'access-control-allow-origin': '*' } }) : route.abort();
    });
    page.on('pageerror', (e) => console.log('pageerror', e.message.slice(0, 300)));
    await page.goto(`http://127.0.0.1:${(server.address() as { port: number }).port}/${relative(ROOT, resolve(work))}/render.html?job=/${relative(ROOT, resolve(file))}`);
    await page.waitForSelector('body[data-ready="1"]', { timeout: 300000 });
    const got = await page.evaluate(() => {
      const w = window as any;
      w.vjMetrics();
      const e = w.vjEngine;
      const shots = e.job.treatment.shots as { id: string; start: number }[];
      const secs = ((e.job.treatment.graphics?.sections ?? []) as { start: number }[]).map((s) => s.start);
      const lines = (e.cueLayers as { rt: any }[]).map(({ rt }) => ({ id: rt.cue.id, text: rt.cue.text, start: rt.cue.start, end: rt.cue.end, show: rt.showFrom, shot: rt.shot.id }));
      return { shots, secs, lines };
    });
    const lines = [...got.lines].sort((x, y) => x.show - y.show);
    const rows: Row[] = lines.map((l, i) => {
      const shot = got.shots.find((s) => s.id === l.shot)!;
      // the first line of its shot only: a later line of a stack comes in on a picture already its own
      const first = lines.findIndex((x) => x.shot === l.shot) === i;
      // its own picture: the last section starting by the shot's start (a world's first cut lands on the shot's start)
      const picture = Math.max(...got.secs.filter((s) => s <= shot.start + 1e-3), 0);
      const afterGap = i > 0 && l.start - lines[i - 1].end > 3;
      return { id: l.id, text: l.text, start: +l.start.toFixed(3), show: +l.show.toFixed(3), picture: +picture.toFixed(3), lead: first ? +(l.show - picture).toFixed(3) : 0, afterGap };
    });
    // the picture's cuts as played: how many, how many the engine dropped to bring a picture forward (picture-lead.ts: a cut
    // with no room left), and how many are up under 0.3 s (the planner's own short ones included)
    const dropped = (job.treatment.graphics?.sections.length ?? 0) - got.secs.length;
    const cuts = got.secs.length;
    const short = got.secs.filter((x, i) => (got.secs[i + 1] ?? Infinity) - x < 0.3 - 1e-3).length;
    const sum = (xs: Row[]) => ({ n: xs.length, early: xs.filter((r) => r.lead < -0.005).length, worst: +Math.min(0, ...xs.map((r) => r.lead)).toFixed(3) });
    const gaps = rows.filter((r) => r.afterGap);
    (report[world] ??= {})[key] = { cuts, short, dropped, all: sum(rows), afterGap: { ...sum(gaps), leads: gaps.map((r) => r.lead) }, rows };
    console.log(world, key, 'cuts', cuts, 'short', short, 'dropped', dropped, 'all', JSON.stringify(sum(rows)), 'afterGap', JSON.stringify(gaps.map((r) => `${r.id}@${r.start}:${r.lead}`)));
    if (a.strip) {
      const r = rows.find((x) => x.id === a.strip);
      if (r) {
        const dir = join(out, 'strip', `${world}-${key}-${r.id}`);
        mkdirSync(dir, { recursive: true });
        for (let t = Math.min(r.show, r.picture) - 0.2; t <= r.start + 0.31; t += 0.1) {
          const url: string = await page.evaluate((t) => (window as any).grabAt(t, 0.8), t);
          writeFileSync(join(dir, `${t.toFixed(2)}.jpg`), Buffer.from(url.split(',')[1], 'base64'));
        }
      }
    }
    await page.close();
  }
}
await browser.close();
server.close();
writeFileSync(join(out, `seed${a.seed}.json`), JSON.stringify(report, null, 1));
