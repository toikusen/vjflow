// The type floor, as drawn (product rule «never set small», 9120f50; docs/research/2026-11-12-type-floor.md): every lyric
// glyph a world line puts on screen, read in the render page at the gate's two moments of the line's readable time (its
// middle and 0.08 s before its end), its size in frame px through every step that decides it (the set, a split part, a
// blown-up word's pose, a scale composition, a shared shot's slot, the frame fit, the camera). A glyph's row type
// (userData.set) under max(the set's lo, TYPE_FLOOR.lo) is counted, by world and set. The typesetter's own particle scale
// inside a row (typeset.ts) and decorative copies (userData.decor: a blown-up word's stress copies, a carrier's keyline
// layer) are reported apart; a line's calls and its echo too. No video written.
//   npx tsx --tsconfig tsconfig.json scripts/lyric-vj/type-floor-scan.mts [--code /path/to/checkout] [--on] [--seeds 0,1,2]
//     [--songs nun,...] [--jobs 2] [--out f.json] [world ...]
// --code: plan and draw with another checkout (the before side); it needs glyphs.ts's userData.set line (one line, no
// pixel changes) or every glyph reads at its picture size. --on: the composition scheduler on (VJ_WORLD_EVENTS=1's
// worldEvents: true); off is the product default.
import { execSync } from 'node:child_process';
import { copyFileSync, createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import * as esbuild from 'esbuild';
import { chromium } from 'playwright';
import { fontCache } from './font-cache.mts';

const { values: a, positionals } = parseArgs({ allowPositionals: true, options: { code: { type: 'string', default: process.cwd() }, on: { type: 'boolean', default: false }, seeds: { type: 'string', default: '0,1,2' }, songs: { type: 'string', default: 'nun,snow,tsuzuki,choroin,tenmon' }, out: { type: 'string', default: '' }, jobs: { type: 'string', default: '2' } } });
const CODE = resolve(a.code!);
const ROOT = process.cwd();
const { freeJob } = await import(`${CODE}/src/app/lyric-vj/free-plan.ts`);
const { FREE_STYLES } = await import(`${CODE}/src/app/lyric-vj/free-styles.ts`);
const { SET_SPECS, TYPE_FLOOR } = await import(`${CODE}/src/app/lyric-vj/render/world-sets.ts`);
const IDS: Record<string, string> = { nun: 'yt_w_fCuUR3lEs', snow: 'yt_5i50aTB7JFo', tsuzuki: 'yt_b3GCfyNKeLs', choroin: 'yt_hCCskTJwvuc', tenmon: 'yt_iwYXfOhcsYI' };
const worlds: string[] = positionals.length ? positionals : FREE_STYLES.map((s: { id: string }) => s.id);
const floorOf = (set: string | undefined) => Math.max(TYPE_FLOOR.lo as number, (set && SET_SPECS[set]?.lo) || 0);

const work = join(ROOT, 'out/research/type-floor/work', `${CODE.split('/').pop()}-${a.on ? 'on' : 'off'}-${process.pid}`);
mkdirSync(work, { recursive: true });
await esbuild.build({ entryPoints: [`${CODE}/src/app/lyric-vj/render/main.ts`], bundle: true, format: 'esm', target: 'es2022', outfile: join(work, 'render.js'), logLevel: 'warning' });
copyFileSync(`${CODE}/scripts/lyric-vj/render.html`, join(work, 'render.html'));
await esbuild.build({ entryPoints: [join(ROOT, 'scripts/lyric-vj/type-floor-page.mts')], bundle: true, format: 'iife', target: 'es2022', outfile: join(work, 'floor-page.js'), logLevel: 'warning' });
const server = createServer((req, res) => {
  const asked = decodeURIComponent(new URL(req.url!, 'http://x').pathname);
  const path = join(ROOT, asked.startsWith('/fonts/') ? join('out', asked) : asked);
  if (!existsSync(path)) return void res.writeHead(404).end();
  res.writeHead(200, { 'content-type': { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' }[extname(path)] ?? 'application/octet-stream' });
  createReadStream(path).pipe(res);
}).listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const browser = await chromium.launch({ channel: 'chromium', args: ['--force-device-scale-factor=1', '--ignore-gpu-blocklist'] });
const getFont = fontCache(resolve('out/font-cache'));

type Read = { set: number; drawn: number; decor: boolean };
/** A line with any body glyph whose row type is under its floor, at either moment. */
interface Under { diag?: unknown; rest?: number; floored?: boolean; world: string; song: string; seed: number; cue: string; set: string; floor: number; least: number; sizes: number[]; text: string; t: number; plan: string; fit?: number; template?: string }
const under: Under[] = [];
const particleRows: unknown[] = [];
const blowReasons: Record<string, number> = {};
let floorMissedLines = 0;
const callsUnder: Under[] = [];
const loUnder: Under[] = [];
const byWorldSet: Record<string, { lines: number; under: number }> = {};
let [lines, glyphs, particle, decorUnder, missing] = [0, 0, 0, 0, 0];
const leastByWorld: Record<string, number> = {};
const extras = { signatureJobs: 0, miniMomentJobs: 0 };
/** One job: planned here, drawn in its own page, every line read at its two moments. */
async function scanJob(id: string, style: unknown, name: string, song: unknown, meaning: unknown, seed: number) {
  const { job } = freeJob(song, { style, seed, meaning, ...(a.on ? { worldEvents: true } : {}) });
  if ((job as { treatment: { signature?: unknown } }).treatment.signature) extras.signatureJobs++;
  if ((job as { treatment: { miniMoments?: unknown[] } }).treatment.miniMoments?.length) extras.miniMomentJobs++;
  type WL = { set?: string; blow?: unknown; scale?: unknown; repose?: unknown[]; cam?: { kind: string } };
  const planOf = new Map<string, WL>((job.treatment.cues as { cueId: string; world?: WL }[]).map((c) => [c.cueId, c.world ?? {}]));
  const file = join(work, `${id}-${name}-${seed}.job.json`);
  writeFileSync(file, JSON.stringify({ ...job, live: true }));
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.addInitScript({ path: join(work, 'floor-page.js') });
  await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, async (route) => {
    const font = await getFont(route.request().url(), route.request().headers()['user-agent'] ?? '');
    return font ? route.fulfill({ body: font.body, contentType: font.type, headers: { 'access-control-allow-origin': '*' } }) : route.abort();
  });
  await page.goto(`http://127.0.0.1:${(server.address() as { port: number }).port}/${relative(ROOT, work)}/render.html?job=/${relative(ROOT, file)}`);
  await page.waitForSelector('body[data-ready="1"]', { timeout: 200000 });
  const cues = await page.evaluate(() => window.vjMetrics().cues.map((c) => ({ id: c.id, from: c.readableFrom, to: c.readableTo, text: c.text, fit: (c as { fitScale?: number }).fitScale ?? 1, template: (c as { template?: string }).template ?? '', rest: (c as { restSize?: number }).restSize, floored: (c as { floored?: boolean }).floored, blowDropped: (c as { blowDropped?: string }).blowDropped, floorMissed: !!(c as { floorMissed?: boolean }).floorMissed })));
  for (const c of cues) if (c.blowDropped) blowReasons[c.blowDropped] = (blowReasons[c.blowDropped] ?? 0) + 1;
  floorMissedLines += cues.filter((c) => c.floorMissed).length;
  for (const c of cues) {
    const ending = c === cues.at(-1);
    const wl = planOf.get(c.id) ?? {};
    const set = wl.set ?? '';
    const floor = floorOf(set);
    let least = Infinity, leastAt = 0, sizes: number[] = [], diag: unknown = null;
    let callLeast = Infinity;
    if (process.env['TRACE_CUE'] === `${id}:${c.id}`) for (let k = 0; k <= 12; k++) {
      const t = c.from + ((c.to - c.from) * k) / 12;
      const r = (await page.evaluate(`window.floorScan.at(${JSON.stringify(c.id)}, ${t})`)) as { line: Read[]; diag: unknown };
      console.log('trace', c.id, t.toFixed(2), JSON.stringify(r.diag), Math.min(...r.line.filter((g) => !g.decor).map((g) => g.set)).toFixed(1), 'from', c.from.toFixed(2), 'to', c.to.toFixed(2));
    }
    for (const t of ending ? [(c.from + c.to) / 2 - 1] : [(c.from + c.to) / 2, c.to - 0.08]) {
      const r = (await page.evaluate(`window.floorScan.at(${JSON.stringify(c.id)}, ${t})`)) as { line: Read[]; calls: Read[]; diag: { fit: number; floor: number; framed: boolean }[] };
      const body = r.line.filter((g) => !g.decor);
      glyphs += body.length;
      // (the product's floor, not the set's own lo: a particle in a row at 110 that is drawn at 89 is a set's taste, counted in loUnder)
      const small = body.filter((g) => g.set >= TYPE_FLOOR.lo && g.drawn < TYPE_FLOOR.lo - 0.5);
      particle += small.length;
      if (small.length) particleRows.push({ world: id, song: name, seed, cue: c.id, set: wl.set ?? '', template: c.template, t, rows: [...new Set(small.map((g) => `${Math.round(g.set)}>${Math.round(g.drawn)}`))].join(' '), diag: r.diag });
      decorUnder += r.line.filter((g) => g.decor && g.set < floor - 0.5).length;
      const m = Math.min(...body.map((g) => g.set));
      if (m < least) [least, leastAt, sizes, diag] = [m, t, [...new Set(body.map((g) => Math.round(g.set)))].sort((x, y) => x - y), r.diag];
      callLeast = Math.min(callLeast, ...r.calls.map((g) => g.set));
    }
    if (!Number.isFinite(least)) { missing++; continue; }
    lines++;
    const key = `${id} ${set || '(no set)'}`;
    byWorldSet[key] ??= { lines: 0, under: 0 };
    byWorldSet[key].lines++;
    leastByWorld[id] = Math.min(leastByWorld[id] ?? Infinity, Math.round(least));
    const plan = [wl.blow && 'blow', wl.scale && 'scale', wl.repose?.length && 'repose', wl.cam && `cam:${wl.cam.kind}`].filter(Boolean).join(',');
    const row = { world: id, song: name, seed, cue: c.id, set, floor, least: Math.round(least * 10) / 10, sizes, text: c.text, t: +leastAt.toFixed(2), plan, fit: c.fit, template: c.template, rest: c.rest, floored: c.floored, diag };
    // (half a pixel: the frame fit's float scale on a glyph laid at the floor; under: TYPE_FLOOR.lo, loUnder: the set's own lo above it)
    if (least < TYPE_FLOOR.lo - 0.5) { under.push(row); byWorldSet[key].under++; }
    else if (least < floor - 0.5) loUnder.push(row);
    if (callLeast < TYPE_FLOOR.lo - 0.5) callsUnder.push({ ...row, least: Math.round(callLeast * 10) / 10, sizes: [] });
  }
  await page.close();
}
const tasks: (() => Promise<void>)[] = [];
for (const id of worlds) {
  const style = FREE_STYLES.find((s: { id: string }) => s.id === id);
  if (!style) continue;
  for (const name of a.songs!.split(',')) {
    const song = JSON.parse(readFileSync(`out/db/${IDS[name]}/song.json`, 'utf8'));
    const meaning = JSON.parse(readFileSync(`out/research/instant/plans/${name}/meaning.json`, 'utf8'));
    for (const seed of a.seeds!.split(',').map(Number)) tasks.push(() => scanJob(id, style, name, song, meaning, seed));
  }
}
let done = 0;
await Promise.all(Array.from({ length: Number(a.jobs) }, async () => {
  for (let task = tasks.shift(); task; task = tasks.shift()) {
    await task();
    if (++done % 15 === 0) console.log(done, 'jobs', 'lines', lines, 'under', under.length, 'calls under', callsUnder.length);
  }
}));
await browser.close();
server.close();
const commit = execSync(`git -C ${CODE} rev-parse --short HEAD`).toString().trim();
const dirty = execSync(`git -C ${CODE} status --porcelain src`).toString().trim().split('\n').filter(Boolean);
const out = {
  commit, dirty, scheduler: a.on ? 'on' : 'off', seeds: a.seeds, songs: a.songs, worlds: worlds.length, lines, glyphs, missing,
  floor: TYPE_FLOOR.lo, blowDropped: blowReasons, floorMissed: floorMissedLines, under: under.length, loUnder: loUnder.length, callsUnder: callsUnder.length,
  particleUnderFloor: particle, decorUnderFloor: decorUnder, extras, leastByWorld,
  byWorldSet: Object.fromEntries(Object.entries(byWorldSet).filter(([, v]) => v.under).sort()),
  lines_under: under, lo_under: loUnder, calls_under: callsUnder, particle_rows: particleRows,
};
if (a.out) writeFileSync(a.out, JSON.stringify(out, null, 1));
console.log(JSON.stringify({ ...out, lines_under: undefined, lo_under: undefined, calls_under: undefined, particle_rows: undefined }, null, 1));
