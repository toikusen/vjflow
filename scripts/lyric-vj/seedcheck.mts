// One-click reroll, proved on real layout: every song at the default plan and at each seed, plans compared and every
// line measured by the real engine (no frames written). npx tsx --tsconfig tsconfig.json scripts/lyric-vj/seedcheck.mts --out out/research/instant/seed [--seeds 1,2,3,4,5] [--style id]
import assert from 'node:assert/strict';
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import * as esbuild from 'esbuild';
import { chromium } from 'playwright';
import { freeJob, isCalm } from '../../src/app/lyric-vj/free-plan';
import { FREE_STYLES } from '../../src/app/lyric-vj/free-styles';
import { setWordSafe, wordBreaks } from '../../src/app/lyric-vj/phrases';
import { REST_FLOOR } from '../../src/app/lyric-vj/render/reading-window';
import { spoken } from '../../src/app/lyric-vj/render/line-space';
import { fontCache } from './font-cache.mts';

export const SONGS: Record<string, string> = { nun: 'yt_w_fCuUR3lEs', snow: 'yt_5i50aTB7JFo', tsuzuki: 'yt_b3GCfyNKeLs', choroin: 'yt_hCCskTJwvuc', tenmon: 'yt_iwYXfOhcsYI' };
const { values: a } = parseArgs({ options: { out: { type: 'string' }, seeds: { type: 'string', default: '1,2,3,4,5' }, style: { type: 'string' }, plans: { type: 'string', default: 'out/research/instant/plans' }, 'no-engine': { type: 'boolean', default: false } } });
const out = a.out!;
mkdirSync(out, { recursive: true });
const seeds = a.seeds!.split(',').map(Number);
type Plan = { shots: { lyric: { template: string }; lines: { cue: string; enter: string; exit: string; idle: string; method?: string; textCam?: { kind?: string } }[]; cuts: { fx: string; cam?: string; transition?: string }[] }[] };
const linesOf = (p: Plan) => new Map(p.shots.flatMap((s) => s.lines.map((l) => [l.cue, { t: s.lyric.template, e: l.enter, x: l.exit, i: l.idle, c: l.textCam?.kind, m: l.method }] as const)));
const fxOf = (p: Plan) => new Set(p.shots.flatMap((s) => s.cuts.map((c) => c.fx)));
const share = <T,>(xs: T[], f: (x: T) => boolean) => xs.filter(f).length / Math.max(1, xs.length);
const jaccard = <T,>(x: Set<T>, y: Set<T>) => [...x].filter((v) => y.has(v)).length / new Set([...x, ...y]).size;

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
const browser = a['no-engine'] ? undefined : await chromium.launch({ channel: 'chromium', args: ['--force-device-scale-factor=1', '--ignore-gpu-blocklist'] });
const getFont = fontCache(resolve('out/font-cache'));
async function measure(job: unknown, tag: string) {
  const file = join(out, `${tag}.job.json`);
  writeFileSync(file, JSON.stringify(job));
  const page = await browser!.newPage({ viewport: { width: 1920, height: 1080 } });
  const errors: string[] = [];
  await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, async (route) => {
    const u = route.request().url();
    const font = await getFont(u, route.request().headers()['user-agent'] ?? '');
    return font ? route.fulfill({ body: font.body, contentType: font.type, headers: { 'access-control-allow-origin': '*' } }) : route.abort();
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/${relative(ROOT, resolve(out))}/render.html?job=/${relative(ROOT, resolve(file))}`);
  await page.waitForSelector('body[data-ready="1"]', { timeout: 120000 });
  const m = await page.evaluate(() => { const x = window.vjMetrics(); return { rows: window.vjRows(), cues: x.cues.map((c) => ({ id: c.id, text: c.text, ok: c.ok, readableSec: c.readableSec, requiredSec: c.requiredSec, restSize: c.restSize, floored: c.floored, template: c.template, plannedEnter: c.plannedEnter, enter: c.enter })) }; });
  await page.close();
  return { ...m, errors };
}
/** A row break inside a word: not at a stop the composer keeps, nor beside a space or a mark. */
function midWord(text: string, breaks: number[]) {
  setWordSafe(true);
  const stops = wordBreaks(text);
  // a run between marks has stops of its own (keyOf cuts a key phrase at them): 一生のお願い|だから is a word edge there
  const runs: [number, Set<number>][] = [];
  let at = 0;
  for (const run of text.split(/(?<=[\s，,、。!！?？︕︖])/)) {
    runs.push([at, wordBreaks(run.trim())]);
    at += [...run].length;
  }
  setWordSafe(false);
  const cs = [...text];
  return breaks.filter((b) => !stops.has(b) && !runs.some(([from, r]) => r.has(b - from)) && !/[\s，,、。!！?？︕︖…～()（）]/.test(`${cs[b - 1] ?? ' '}${cs[b] ?? ' '}`));
}
const report: Record<string, unknown>[] = [];
for (const [name, id] of Object.entries(SONGS)) {
  const song = JSON.parse(readFileSync(`out/db/${id}/song.json`, 'utf8'));
  const meaning = JSON.parse(readFileSync(join(a.plans!, name, 'meaning.json'), 'utf8'));
  const style = FREE_STYLES.find((x) => x.id === a.style);
  if (a.style && !style) throw new Error(`no style ${a.style}`);
  const font = style ? undefined : isCalm(song.cues) ? 'Noto Serif TC' : 'Chiron Hei HK';
  const make = (seed?: number) => freeJob(song, { meaning, font, seed, style });
  const own = make();
  const rolled = seeds.map((seed) => {
    const t0 = performance.now();
    const x = make(seed);
    const ms = performance.now() - t0;
    assert.equal(JSON.stringify(make(seed).job), JSON.stringify(x.job), `${name} seed ${seed} not deterministic`);
    return { seed, ms, ...x };
  });
  assert.notEqual(new Set(rolled.map((r) => JSON.stringify(r.plan.shots))).size, 1, `${name}: seeds gave one plan`);
  const ownLines = linesOf(own.plan as Plan);
  for (const r of rolled) {
    const l = linesOf(r.plan as Plan);
    const ids = [...ownLines.keys()].filter((k) => l.has(k));
    const row = {
      song: name, seed: r.seed, palette: r.palette, ownPalette: own.palette, planMs: +r.ms.toFixed(1),
      layoutChanged: +share(ids, (k) => l.get(k)!.t !== ownLines.get(k)!.t).toFixed(2),
      enterChanged: +share(ids, (k) => l.get(k)!.e !== ownLines.get(k)!.e).toFixed(2),
      exitChanged: +share(ids, (k) => l.get(k)!.x !== ownLines.get(k)!.x).toFixed(2),
      camChanged: +share(ids, (k) => l.get(k)!.c !== ownLines.get(k)!.c).toFixed(2),
      groundOverlap: +jaccard(fxOf(r.plan as Plan), fxOf(own.plan as Plan)).toFixed(2),
      layouts: new Set([...l.values()].map((x) => x.t)).size,
    };
    report.push(row);
  }
  const pairs = rolled.flatMap((x, i) => rolled.slice(i + 1).map((y) => { const [p, q] = [linesOf(x.plan as Plan), linesOf(y.plan as Plan)]; const ids = [...p.keys()].filter((k) => q.has(k)); return share(ids, (k) => p.get(k)!.t !== q.get(k)!.t); }));
  console.log(`${name}: seed pairs differ in layout on ${(pairs.reduce((s, v) => s + v, 0) / pairs.length * 100).toFixed(0)} % of lines; palettes ${rolled.map((r) => r.palette).join(' ')}`);
  if (a['no-engine']) continue;
  const baseline = await measure(own.job, `${name}-own`);
  for (const r of [{ seed: undefined as number | undefined, m: baseline }, ...(await Promise.all(rolled.map(async (x) => ({ seed: x.seed as number | undefined, m: await measure(x.job, `${name}-${x.seed}`) }))))]) {
    const bad = r.m.cues.filter((c) => !c.ok);
    const under = r.m.cues.filter((c) => (c.restSize ?? 99) < REST_FLOOR && !c.floored);
    const mid = r.m.rows.flatMap((x) => { const b = midWord(spoken(x.text) === x.text ? x.text : x.text, x.breaks); return b.length ? [`${x.id} ${x.template} ${x.text.slice(0, 16)}@${b}`] : []; });
    const row = { song: name, seed: r.seed ?? 'own', lines: r.m.cues.length, readFail: bad.map((c) => `${c.id} ${c.readableSec.toFixed(2)}/${c.requiredSec.toFixed(2)}`), floored: r.m.cues.filter((c) => c.floored).length, underFloor: under.map((c) => `${c.id}:${c.restSize}`), minRest: Math.min(...r.m.cues.map((c) => c.restSize ?? 999)), midWord: mid, entranceKept: +share(r.m.cues, (c) => c.plannedEnter === c.enter).toFixed(2), errors: r.m.errors };
    report.push(row);
    console.log(`  ${String(row.seed).padEnd(4)} read fails ${bad.length}${bad.length ? ` (${row.readFail.slice(0, 3).join(', ')})` : ''}, floored ${row.floored}, under floor ${under.length}, min rest ${row.minRest}, mid-word ${mid.length}${mid.length ? ` ${mid.slice(0, 2).join(' | ')}` : ''}, errors ${r.m.errors.length}`);
  }
}
writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 1));
await browser?.close();
server.close();
