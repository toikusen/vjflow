// The final-composite ink gate, v2 (docs/research/2026-11-13-ink-table-gate-design.md §1): every glyph shown, read off
// the final composite through its ID mask (not an on/off difference), against the same composite without the words on
// the words-on pass's own controls. No glyph is skipped for moving, fading, being small or unsung: a glyph that cannot be
// read is `unverified`, never a pass. One browser, one bundle, one job (world × song) at a time, JSONL checkpoints that
// resume.
//   nice -n 19 npx tsx --tsconfig tsconfig.json scripts/lyric-vj/ink-gate2.mts --run <id> --jobs dark-glitch:choroin[,...] [--frames sample:10|all] [--seed 0] [--font F] [--limit-sec N]
// Writes out/research/ink/gate2/<run>/<world>__<song>__s<seed>__live__off.jsonl (meta, a row a moment, done) and
// summary.json. The forced replays (scripts/lyric-vj/ink-replays.json) are read in every job they belong to.
// Not yet: the export-mode pairing (§1.7), the 2D layers' ID pass (signature, mini moments: counted unverified:layer-2d),
// the GPU compare (the three boxes are read back and compared on the CPU, ink-verify reduceGlyphs).
import { execSync } from 'node:child_process';
import { appendFileSync, copyFileSync, createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import * as esbuild from 'esbuild';
import { chromium } from 'playwright';
import { freeJob } from '../../src/app/lyric-vj/free-plan';
import { FREE_STYLES } from '../../src/app/lyric-vj/free-styles';
import { resumePoint, type GateRow } from '../../src/app/lyric-vj/ink-verify';
import { FX_VERSION } from '../../src/app/lyric-vj/render/final-warp.glsl';
import { fontCache } from './font-cache.mts';
import type { Read } from './ink-gate2-page.mts';

const IDS: Record<string, string> = { nun: 'yt_w_fCuUR3lEs', snow: 'yt_5i50aTB7JFo', tsuzuki: 'yt_b3GCfyNKeLs', choroin: 'yt_hCCskTJwvuc', tenmon: 'yt_iwYXfOhcsYI' };
const { values: a } = parseArgs({ options: { run: { type: 'string' }, jobs: { type: 'string' }, frames: { type: 'string', default: 'sample:10' }, seed: { type: 'string', default: '0' }, font: { type: 'string' }, 'limit-sec': { type: 'string' }, determinism: { type: 'string', default: '50' } } });
const out = resolve('out/research/ink/gate2', a.run!);
const work = join(out, 'work');
mkdirSync(work, { recursive: true });
await esbuild.build({ entryPoints: ['src/app/lyric-vj/render/main.ts'], bundle: true, format: 'esm', target: 'es2022', outfile: join(work, 'render.js'), logLevel: 'warning' });
copyFileSync('scripts/lyric-vj/render.html', join(work, 'render.html'));
await esbuild.build({ entryPoints: ['scripts/lyric-vj/ink-gate2-page.mts'], bundle: true, format: 'iife', target: 'es2022', outfile: join(work, 'ink-gate2-page.js'), logLevel: 'warning' });
const ROOT = process.cwd();
const server = createServer((req, res) => { const asked = decodeURIComponent(new URL(req.url!, 'http://x').pathname); const path = join(ROOT, asked.startsWith('/fonts/') ? join('out', asked) : asked); if (!existsSync(path)) return void res.writeHead(404).end(); res.writeHead(200, { 'content-type': { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' }[extname(path)] ?? 'application/octet-stream' }); createReadStream(path).pipe(res); }).listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const browser = await chromium.launch({ channel: 'chromium', args: ['--force-device-scale-factor=1', '--ignore-gpu-blocklist'] });
const getFont = fontCache(resolve('out/font-cache'));
const replays = JSON.parse(readFileSync('scripts/lyric-vj/ink-replays.json', 'utf8')) as { world: string; song: string; cue: string; t?: number; why: string }[];
const commit = execSync('git rev-parse --short HEAD').toString().trim();
const dirty = execSync('git status --porcelain -- src scripts').toString().trim().length > 0;
const summary: Record<string, unknown> = existsSync(join(out, 'summary.json')) ? JSON.parse(readFileSync(join(out, 'summary.json'), 'utf8')) : {};

type Beat = { kind: string; at: number; sec?: number; stays?: boolean };
for (const spec of a.jobs!.split(',')) {
  const [world, name] = spec.split(':');
  const file = join(out, `${world}__${name}__s${a.seed}__live__off.jsonl`);
  const resume = existsSync(file) ? resumePoint(readFileSync(file, 'utf8').split('\n')) : { done: false as const, after: -1 };
  if (resume.done) { console.log(world, name, 'done already'); continue; }
  const started = Date.now();
  const song = JSON.parse(readFileSync(`out/db/${IDS[name]}/song.json`, 'utf8'));
  const meaning = JSON.parse(readFileSync(`out/research/instant/plans/${name}/meaning.json`, 'utf8'));
  const { job } = freeJob(song, { style: FREE_STYLES.find((s) => s.id === world)!, seed: Number(a.seed), meaning, ...(a.font ? { font: a.font } : {}) });
  const jobFile = join(work, `${world}-${name}.job.json`);
  writeFileSync(jobFile, JSON.stringify({ ...job, live: true }));
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.addInitScript({ path: join(work, 'ink-gate2-page.js') });
  await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, async (route) => { const font = await getFont(route.request().url(), route.request().headers()['user-agent'] ?? ''); return font ? route.fulfill({ body: font.body, contentType: font.type, headers: { 'access-control-allow-origin': '*' } }) : route.abort(); });
  await page.goto(`http://127.0.0.1:${(server.address() as { port: number }).port}/${relative(ROOT, work)}/render.html?job=/${relative(ROOT, jobFile)}`);
  await page.waitForSelector('body[data-ready="1"]', { timeout: 600000 });
  const ready = Date.now();
  const cues = (await page.evaluate(() => window.vjMetrics().cues.map((c) => ({ id: c.id, from: c.readableFrom, to: c.readableTo, template: (c as { template?: string }).template })))) as { id: string; from: number; to: number; template?: string }[];
  const beats = new Map((job.treatment.cues as { cueId: string; world?: { beat?: Beat } }[]).flatMap((c) => (c.world?.beat ? [[c.cueId, c.world.beat] as const] : [])));
  const fps = job.fps ?? 30;
  // the moments: every output frame where a line is up (`all`), or the stratified sample (`sample:N`: every hold at its
  // middle and after it, every k-th line's middle), and the forced replays of this world × song, in time order
  const times = new Set<number>();
  const frameOf = (t: number) => Math.round(t * fps);
  if (a.frames === 'all') {
    for (const c of cues) for (let f = frameOf(c.from - 0.6); f <= frameOf(c.to + 0.6); f++) times.add(f);
  } else {
    const n = Number(a.frames!.split(':')[1] ?? 10);
    const order = (song.cues as { id: string }[]).map((c) => c.id);
    const k = Math.max(1, Math.ceil(order.length / n));
    for (const c of cues) {
      if (c.template === 'signature' || order.indexOf(c.id) % k === 0) times.add(frameOf((c.from + c.to) / 2));
      const b = beats.get(c.id);
      if (b) { times.add(frameOf(b.at + (b.sec ?? 0.5) / 2)); if (b.stays) times.add(frameOf(b.at + (b.sec ?? 0.5) + 0.15)); }
    }
  }
  for (const r of replays.filter((r) => r.world === world && r.song === name)) {
    const c = cues.find((x) => x.id === r.cue);
    if (r.t !== undefined) times.add(frameOf(r.t));
    else if (c) times.add(frameOf((c.from + c.to) / 2));
  }
  const frames = [...times].sort((x, y) => x - y).filter((f) => f > resume.after);
  const row = (r: GateRow) => appendFileSync(file, JSON.stringify(r) + '\n');
  if (resume.after < 0) row({ kind: 'meta', commit, dirty, fxVersion: FX_VERSION, font: job.fonts?.family ?? '', size: [1920, 1080], fps, seed: Number(a.seed), mode: 'live', scheduled: process.env['VJ_WORLD_EVENTS'] === '1', frames: a.frames!, world, song: name });
  let [moments, glyphs, fails, worst] = [0, 0, 0, Infinity];
  const unverified: Record<string, number> = {};
  let stopped = '';
  for (const [k, f] of frames.entries()) {
    if (a['limit-sec'] && (Date.now() - started) / 1000 > Number(a['limit-sec'])) { stopped = 'timeout'; break; }
    const t = f / fps;
    const m = (await page.evaluate(`window.inkGate.moment(${t})`)) as { reads: Read[]; drift: number; driftAt?: number[]; layer2d: number; hash?: number };
    // (determinism: the first moment and one in every N drawn again must give the same ink pixels)
    if (m.hash !== undefined && (k === 0 || k % Number(a.determinism) === 0)) {
      const again = (await page.evaluate(`window.inkGate.moment(${t})`)) as { hash?: number };
      if (again.hash !== m.hash) { unverified['nondeterministic'] = (unverified['nondeterministic'] ?? 0) + m.reads.length; stopped = 'nondeterministic'; }
    }
    moments++;
    const lines: Record<number, string> = {};
    const out: unknown[] = [];
    for (const r of m.reads) {
      glyphs++;
      const b = beats.get(r.cue);
      const phase = r.moving ? 'enter' : b && t >= b.at && t <= b.at + (b.sec ?? 0.5) + (b.stays ? 0.3 : 0) ? 'hold' : 'rest';
      if (r.v.status === 'fail') fails++;
      else if (r.v.status !== 'pass') unverified[r.v.status] = (unverified[r.v.status] ?? 0) + 1;
      if (Number.isFinite(r.v.min)) worst = Math.min(worst, r.v.min);
      // (a passing glyph in short: cue, index, its worst core pixel)
      out.push(r.v.status === 'pass' ? [r.cue, r.i, +r.v.min.toFixed(3)] : { cue: r.cue, i: r.i, phase, status: r.v.status, min: r.v.min, p01: r.v.p01, median: r.v.median, n: r.v.n, minAt: r.v.minAt, edge: r.v.edge });
    }
    if (m.layer2d) unverified['layer-2d'] = (unverified['layer-2d'] ?? 0) + m.layer2d;
    row({ kind: 'moment', t: +t.toFixed(4), frame: f, lines, offDrift: m.drift, ...(m.driftAt ? { driftAt: m.driftAt } : {}), glyphs: m.layer2d ? [...out, { layer2d: m.layer2d, status: 'unverified:layer-2d' }] : out });
    if (stopped) break;
  }
  await page.close();
  const done = { kind: 'done' as const, moments, glyphs, fails, unverified: stopped ? { ...unverified, [stopped]: frames.length - moments } : unverified, worst: Number.isFinite(worst) ? +worst.toFixed(3) : NaN, wallSec: Math.round((Date.now() - started) / 1000) };
  if (!stopped) row(done);
  summary[`${world}:${name}`] = { ...done, complete: !stopped, loadSec: Math.round((ready - started) / 1000), sPerMoment: +((Date.now() - ready) / 1000 / Math.max(1, moments)).toFixed(2) };
  writeFileSync(join(out, 'summary.json'), JSON.stringify(summary, null, 1));
  console.log(world, name, JSON.stringify(summary[`${world}:${name}`]));
}
await browser.close();
server.close();
