// M4, the sampled tone table (docs/research/2026-11-13-ink-table-gate-design.md §2.3; render/ink-tones.ts): offline, one
// world at a time, one browser. For each world:
// - grounds: free jobs on the songs and seeds given, every `step`-th frame a world line is up; under each line's glyph
//   box, with the words off (carriers kept) and the final pass at rest, the ground's darkest and lightest tones, merged
//   per set × scheme;
// - surfaces: its glyph material on each scheme's inks, how far it draws a tint down at its darkest part.
// Writes src/app/lyric-vj/render/ink-tones.json on the current FX_VERSION (merging into what is there).
//   nice -n 19 npx tsx --tsconfig tsconfig.json scripts/lyric-vj/ink-tones.mts --worlds dark-glitch[,popart] [--songs choroin,nun] [--seeds 0] [--step 4]
import { execSync } from 'node:child_process';
import { copyFileSync, createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import * as esbuild from 'esbuild';
import { chromium } from 'playwright';
import { freeJob } from '../../src/app/lyric-vj/free-plan';
import { FREE_STYLES } from '../../src/app/lyric-vj/free-styles';
import { STYLE_WORLDS } from '../../src/app/lyric-vj/style-worlds';
// (page side: the ground within the reading rim of each line at rest, ink-tones-page.mts)
import { FX_VERSION } from '../../src/app/lyric-vj/render/final-warp.glsl';
import type { ToneTable } from '../../src/app/lyric-vj/render/ink-tones';
import { fontCache } from './font-cache.mts';

const IDS: Record<string, string> = { nun: 'yt_w_fCuUR3lEs', snow: 'yt_5i50aTB7JFo', tsuzuki: 'yt_b3GCfyNKeLs', choroin: 'yt_hCCskTJwvuc', tenmon: 'yt_iwYXfOhcsYI' };
const { values: a } = parseArgs({ options: { worlds: { type: 'string' }, songs: { type: 'string', default: 'choroin,nun' }, seeds: { type: 'string', default: '0' }, step: { type: 'string', default: '4' } } });
const FILE = 'src/app/lyric-vj/render/ink-tones.json';
const work = resolve('out/research/ink/tones/work');
mkdirSync(work, { recursive: true });
await esbuild.build({ entryPoints: ['src/app/lyric-vj/render/main.ts'], bundle: true, format: 'esm', target: 'es2022', outfile: join(work, 'render.js'), logLevel: 'warning' });
copyFileSync('scripts/lyric-vj/render.html', join(work, 'render.html'));
await esbuild.build({ entryPoints: ['scripts/lyric-vj/ink-tones-page.mts'], bundle: true, format: 'iife', target: 'es2022', outfile: join(work, 'ink-tones-page.js'), logLevel: 'warning' });
const ROOT = process.cwd();
const server = createServer((req, res) => { const asked = decodeURIComponent(new URL(req.url!, 'http://x').pathname); const path = join(ROOT, asked.startsWith('/fonts/') ? join('out', asked) : asked); if (!existsSync(path)) return void res.writeHead(404).end(); res.writeHead(200, { 'content-type': { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' }[extname(path)] ?? 'application/octet-stream' }); createReadStream(path).pipe(res); }).listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const browser = await chromium.launch({ channel: 'chromium', args: ['--force-device-scale-factor=1', '--ignore-gpu-blocklist'] });
const getFont = fontCache(resolve('out/font-cache'));
const old = existsSync(FILE) ? (JSON.parse(readFileSync(FILE, 'utf8')) as ToneTable) : undefined;
// (restOnly: every ground read with its line at rest, so a carried set's entry is its carrier as the words stand on it)
const table: ToneTable = old && old.fx === FX_VERSION && old.restOnly && old.inside ? old : { v: 1, fx: FX_VERSION, commit: '', built: '', restOnly: true, inside: true, grounds: {}, surfaces: {} };
const open = async (job: unknown, name: string) => {
  // (no '+' or space in a job file name: the page reads the job's URL as a query)
  const file = join(work, `${name.replace(/[^a-z0-9-]/gi, '_')}.job.json`);
  writeFileSync(file, JSON.stringify(job));
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.addInitScript({ path: join(work, 'ink-tones-page.js') });
  await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, async (route) => { const font = await getFont(route.request().url(), route.request().headers()['user-agent'] ?? ''); return font ? route.fulfill({ body: font.body, contentType: font.type, headers: { 'access-control-allow-origin': '*' } }) : route.abort(); });
  await page.goto(`http://127.0.0.1:${(server.address() as { port: number }).port}/${relative(ROOT, work)}/render.html?job=/${relative(ROOT, file)}`);
  await page.waitForSelector('body[data-ready="1"]', { timeout: 600000 });
  return page;
};
type Cue = { cueId: string; world?: { set: string; slots?: { id?: string }; repose?: { at: number; set: string }[] } };
for (const world of a.worlds!.split(',')) {
  const style = FREE_STYLES.find((s) => s.id === world)!;
  const sw = STYLE_WORLDS.find((w) => w.id === world)!;
  const reads = new Map<string, { lo: string; hi: string }[]>();
  let surfaced = false;
  for (const name of a.songs!.split(','))
    for (const seed of a.seeds!.split(',').map(Number)) {
      const song = JSON.parse(readFileSync(`out/db/${IDS[name]}/song.json`, 'utf8'));
      const meaning = JSON.parse(readFileSync(`out/research/instant/plans/${name}/meaning.json`, 'utf8'));
      const { job } = freeJob(song, { style, seed, meaning });
      const page = await open({ ...job, live: true }, `${world}-${name}-${seed}`);
      // (the surfaces once a world, on the face its job sets)
      if (!surfaced && sw.material.surface) {
        surfaced = true;
        for (const scheme of sw.palette as unknown as Record<string, string>[]) {
          const core = scheme[sw.material.core];
          // (toward black: a white tint's darkest parts; toward white: a black tint's lightest)
          const share = (t: string) => page.evaluate(([k, t2, c, f]) => (window as unknown as { vjSurfaceShare: (...x: string[]) => { lo: number; hi: number } }).vjSurfaceShare(k, t2, c, f, '永國あア！の'), [sw.material.surface!, t, core, job.fonts?.family ?? '']) as Promise<{ lo: number; hi: number }>;
          const [w, b] = [await share('#ffffff'), await share('#000000')];
          table.surfaces[`${sw.material.surface}|${core.toLowerCase()}`] = { black: +(1 - w.lo).toFixed(3), white: +b.hi.toFixed(3) };
        }
      }
      const cues = new Map(((job.treatment.cues as Cue[]) ?? []).filter((c) => c.world).map((c) => [c.cueId, c.world!]));
      const shown = (await page.evaluate(() => window.vjMetrics().cues.map((c) => ({ id: c.id, from: c.readableFrom, to: c.readableTo })))) as { id: string; from: number; to: number }[];
      const fps = job.fps ?? 30;
      const frames = new Map<number, string[]>();
      for (const c of shown) if (cues.has(c.id)) for (let f = Math.ceil(c.from * fps); f <= Math.floor(c.to * fps); f += Number(a.step)) frames.set(f, [...(frames.get(f) ?? []), c.id]);
      for (const [f, ids] of [...frames].sort((x, y) => x[0] - y[0])) {
        const t = f / fps;
        const got = (await page.evaluate(([t, ids]) => (window as unknown as { inkTonesPage: { read(t: number, ids: string[]): Promise<unknown> } }).inkTonesPage.read(t as number, ids as string[]), [t, ids] as const)) as { id: string; lo: string; hi: string }[];
        for (const g of got) {
          const w = cues.get(g.id)!;
          const set = [...(w.repose ?? [])].filter((r) => r.at <= t).at(-1)?.set ?? w.set;
          const key = `${set}|${w.slots?.id ?? ''}`;
          reads.set(key, [...(reads.get(key) ?? []), { lo: g.lo, hi: g.hi }]);
        }
      }
      await page.close();
    }
  // (across the moments, the worst: the darkest of their darkest tones and the lightest of their lightest)
  const lumHex = (c: string) => { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(parseInt(c.slice(1, 3), 16)) + 0.7152 * f(parseInt(c.slice(3, 5), 16)) + 0.0722 * f(parseInt(c.slice(5, 7), 16)); };
  const end = (cs: string[], dark: boolean) => [...cs].sort((x, y) => (dark ? 1 : -1) * (lumHex(x) - lumHex(y)))[0];
  for (const [key, rs] of reads) { const was = table.grounds[key]; const all = [...rs, ...(was ? [was] : [])]; table.grounds[key] = { lo: end(all.map((r) => r.lo), true), hi: end(all.map((r) => r.hi), false), n: rs.length + (was?.n ?? 0) }; }
  table.commit = execSync('git rev-parse --short HEAD').toString().trim();
  table.built = new Date().toISOString();
  writeFileSync(FILE, JSON.stringify(table, null, 1));
  console.log(world, 'grounds', reads.size, 'surfaces', Object.keys(table.surfaces).length);
}
await browser.close();
server.close();
