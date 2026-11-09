// Composition cuts per 10 s on the two fixed clips (雙截棍 76–101, 三年後的大雪 67–92), seed 0, every offered world
// (Q1, docs/research/2026-11-09-q1-phase2.md). Per world and clip:
//   before — the cuts the job drew before the scheduler was wired (freeJob worldEvents:false), counted on the job as the
//            renderer sets it (world-events-adapter.ts currentEvents: real show times, line-shows.ts);
//   dryRun — the phase-1 dry run (derived caps, planWorldEvents on the before job): reference only;
//   wired  — the event table the wired job carries (treatment.worldEvents), plan level, and the same job read back as
//            drawn (`drawn`, the plan's cuts the job really lays: a cut planned but not laid is `unlaid`);
//   frames — with --frames: every wired cut looked at in the render page (the reading gate's page, gate-page.mts): the
//            lyric's box on a stable frame before the switch and after it; a switch whose box neither moved 8 % of
//            the frame nor turned is `unrealized`. verifiedCompositionCutsPer10 = (plan cuts − unrealized) per 10 s.
// Plan counts (planCutsPer10) are the plan's own: they are not "verified" until --frames looked at them.
//   npx tsx --tsconfig tsconfig.json scripts/lyric-vj/measure-world-events.mts [--world chalkboard] [--frames] [--out out/research/q1-1109/wired.json]
import { execSync } from 'node:child_process';
import { copyFileSync, createReadStream, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { freeJob } from '../../src/app/lyric-vj/free-plan';
import { OFFERED_STYLES } from '../../src/app/lyric-vj/free-styles';
import { countCuts, planWorldEvents, type WorldEvent } from '../../src/app/lyric-vj/world-events';
import { capsOf, currentEvents, fromJob, ONE_PAGE_WORLDS } from '../../src/app/lyric-vj/world-events-adapter';

const WINDOWS = [
  { name: 'fast', song: 'nun', db: 'yt_w_fCuUR3lEs', window: [76, 101] as [number, number] },
  { name: 'calm', song: 'snow', db: 'yt_5i50aTB7JFo', window: [67, 92] as [number, number] },
];
const { values: a } = parseArgs({ options: { world: { type: 'string' }, seed: { type: 'string', default: '0' }, out: { type: 'string' }, frames: { type: 'boolean', default: false } } });
const seed = Number(a.seed);
const styles = OFFERED_STYLES.filter((s) => !a.world || a.world.split(',').includes(s.id));
const median = (xs: number[]) => { const s = [...xs].sort((x, y) => x - y); const m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : 0; };
const per10 = (n: number, w: [number, number]) => +((n * 10) / (w[1] - w[0])).toFixed(2);
const inWin = (e: WorldEvent, w: [number, number]) => e.kind !== 'keep' && e.at > w[0] + 1 / 30 && e.at < w[1];

/** The frame check's page: the reading gate's own (render page + gate-page.mts), one per job. */
async function framesOf() {
  const esbuild = await import('esbuild');
  const { chromium } = await import('playwright');
  const { fontCache } = await import('./font-cache.mts');
  const work = join('.q1-frames-work');
  mkdirSync(work, { recursive: true });
  await esbuild.build({ entryPoints: ['src/app/lyric-vj/render/main.ts'], bundle: true, format: 'esm', target: 'es2022', outfile: join(work, 'render.js'), logLevel: 'warning' });
  copyFileSync('scripts/lyric-vj/render.html', join(work, 'render.html'));
  await esbuild.build({ entryPoints: ['scripts/lyric-vj/gate-page.mts'], bundle: true, format: 'iife', target: 'es2022', outfile: join(work, 'gate-page.js'), logLevel: 'warning' });
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
  const [GW, GH] = [320, 180];
  /** Each cut's box before and after on stable frames, and whether it changed as a composition does. */
  const check = async (key: string, job: unknown, events: WorldEvent[], lines: { id: string; start: number; end: number; show: number }[]) => {
    const file = join(work, `${key}.job.json`);
    writeFileSync(file, JSON.stringify({ ...(job as object), live: true }));
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.addInitScript({ path: join(work, 'gate-page.js') });
    await page.addInitScript('window.__carriers = true');
    await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, async (route) => {
      const font = await getFont(route.request().url(), route.request().headers()['user-agent'] ?? '');
      return font ? route.fulfill({ body: font.body, contentType: font.type, headers: { 'access-control-allow-origin': '*' } }) : route.abort();
    });
    await page.goto(`http://127.0.0.1:${(server.address() as { port: number }).port}/${relative(ROOT, resolve(work))}/render.html?job=/${relative(ROOT, resolve(file))}`);
    await page.waitForSelector('body[data-ready="1"]', { timeout: 200000 });
    const box = async (t: number) => {
      const m = (await page.evaluate(`window.gatePage.moment(${t}, ${GW}, ${GH})`)) as { n: number; x0: number; x1: number; y0: number; y1: number };
      return m.n / (GW * GH) >= 0.002 ? { cx: +((m.x0 + m.x1) / 2 / GW).toFixed(3), cy: +((m.y0 + m.y1) / 2 / GH).toFixed(3), wide: (m.x1 - m.x0) * 9 >= (m.y1 - m.y0) * 16, t: +t.toFixed(2) } : undefined;
    };
    // a stable frame: the nearest with words up, stepping away from the switch
    const stable = async (t: number, step: number, n: number) => { for (let k = 0; k < n; k++) { const b = await box(t + k * step); if (b) return b; } return undefined; };
    const out: { at: number; kind: string; lineIds: string[]; realized: boolean; why: string; before?: unknown; after?: unknown }[] = [];
    for (const e of events) {
      const ln = lines.find((l) => l.id === e.lineIds.at(-1));
      const before = await stable(e.from - 0.12, -0.1, 6);
      const after = await stable(Math.min(e.to + 0.3, (ln?.end ?? e.to + 1) - 0.05), 0.1, 6);
      if (!before || !after) { out.push({ at: e.at, kind: e.kind, lineIds: e.lineIds, realized: false, why: 'no words on a stable frame either side' }); continue; }
      const moved = Math.hypot(before.cx - after.cx, before.cy - after.cy);
      const realized = moved >= 0.08 || before.wide !== after.wide;
      out.push({ at: e.at, kind: e.kind, lineIds: e.lineIds, realized, why: realized ? `box moved ${moved.toFixed(3)}${before.wide !== after.wide ? ', turned' : ''}` : `box moved ${moved.toFixed(3)} < 0.08`, before, after });
    }
    await page.close();
    rmSync(file, { force: true });
    return out;
  };
  const close = async () => { await browser.close(); server.close(); rmSync(work, { recursive: true, force: true }); };
  return { check, close };
}

const frames = a.frames ? await framesOf() : undefined;
const rows = [];
for (const w of WINDOWS) {
  const song = JSON.parse(readFileSync(`out/db/${w.db}/song.json`, 'utf8'));
  const meaning = JSON.parse(readFileSync(`out/research/instant/plans/${w.song}/meaning.json`, 'utf8'));
  for (const style of styles) {
    const legacy = freeJob(song, { style, seed, meaning, worldEvents: false });
    // (the scheduler is opt-in: the measurement takes the declared worlds over)
    const wired = freeJob(song, { style, seed, meaning, worldEvents: true });
    const before = countCuts(currentEvents(legacy, song, style.world), w.window);
    const dry = planWorldEvents(fromJob(legacy.job, song, style.world, { seed, derived: true }));
    const dryRun = countCuts(dry.events, w.window);
    const table = wired.treatment.worldEvents!;
    const plan = countCuts(table.events, w.window);
    const drawnEvents = currentEvents(wired, song, style.world);
    const drawn = countCuts(drawnEvents, w.window);
    // (a switch the job lays on the same line within 0.3 s is the same switch: a camera's start and its line's show)
    const unlaid = plan.at.filter((t) => { const e = table.events.find((x) => x.kind !== 'keep' && Math.abs(x.at - t) < 0.05)!; return !drawnEvents.some((x) => Math.abs(x.at - t) < 0.3 && x.lineIds.at(-1) === e.lineIds.at(-1)); });
    const cutEvents = [...new Map(table.events.filter((e) => inWin(e, w.window)).map((e) => [e.id, e])).values()].sort((x, y) => x.at - y.at).filter((e, i, xs) => i === 0 || e.at - xs[i - 1].at >= 0.05);
    const warnings = table.warnings.filter((x) => x.inputs.some((i) => { const m = /@([\d.]+)/.exec(i); return !m || (Number(m[1]) > w.window[0] - 1 && Number(m[1]) < w.window[1] + 1); }));
    const row: Record<string, unknown> = {
      world: style.id, window: w.name, song: w.song, range: w.window, seed, onePage: ONE_PAGE_WORLDS.includes(style.id), caps: { kinds: capsOf(style.world).kinds, source: table.source },
      before: { cuts: before.cuts, planCutsPer10: before.planCutsPer10, byKind: before.byKind },
      dryRun: { cuts: dryRun.cuts, planCutsPer10: dryRun.planCutsPer10 },
      wired: { cuts: plan.cuts, planCutsPer10: plan.planCutsPer10, planSeatChangesPer10: plan.planSeatChangesPer10, byKind: plan.byKind, drawnCutsPer10: drawn.planCutsPer10, unlaid, warnings: warnings.length, warningKinds: [...new Set(warnings.map((x) => x.reason.split(':')[0]))] },
    };
    if (frames) {
      const lines = fromJob(wired.job, song, style.world, { window: w.window }).lines;
      const seen = await frames.check(`${style.id}-${w.song}`, wired.job, cutEvents, lines);
      const un = seen.filter((x) => !x.realized);
      Object.assign(row['wired'] as object, { unrealized: un.length, verifiedCompositionCutsPer10: per10(plan.cuts - un.length, w.window), frames: seen });
      console.error(style.id, w.name, 'plan', plan.cuts, 'unrealized', un.length);
    }
    rows.push(row);
  }
}
await frames?.close();

type Row = Record<string, any>;
const of = (name: string, f: (r: Row) => number, only?: boolean) => median((rows as Row[]).filter((r) => r['window'] === name && (!only || r['onePage'])).map(f));
const summary = Object.fromEntries(WINDOWS.map((w) => [w.name, {
  worlds: (rows as Row[]).filter((r) => r['window'] === w.name).length,
  medianBefore: of(w.name, (r) => r['before'].planCutsPer10),
  medianDryRun: of(w.name, (r) => r['dryRun'].planCutsPer10),
  medianWiredPlan: of(w.name, (r) => r['wired'].planCutsPer10),
  medianWiredDrawn: of(w.name, (r) => r['wired'].drawnCutsPer10),
  ...(frames ? { medianVerified: of(w.name, (r) => r['wired'].verifiedCompositionCutsPer10), unrealized: (rows as Row[]).filter((r) => r['window'] === w.name).reduce((s, r) => s + r['wired'].unrealized, 0) } : {}),
  onePage: { medianBefore: of(w.name, (r) => r['before'].planCutsPer10, true), medianWiredPlan: of(w.name, (r) => r['wired'].planCutsPer10, true), ...(frames ? { medianVerified: of(w.name, (r) => r['wired'].verifiedCompositionCutsPer10, true) } : {}) },
}]));
const report = { commit: execSync('git rev-parse --short HEAD').toString().trim(), note: 'plan-level counts (planCutsPer10) unless --frames: verifiedCompositionCutsPer10 = plan cuts less those the frame check found unrealized', date: '2026-11-09', frames: !!frames, summary, rows };
if (a.out) {
  mkdirSync(dirname(a.out), { recursive: true });
  writeFileSync(a.out, JSON.stringify(report, null, 1));
}
console.log(JSON.stringify(summary));
for (const r of rows as Row[]) console.log([r['window'], r['world'].padEnd(14), r['onePage'] ? '1p' : '  ', 'before', r['before'].planCutsPer10, 'dry', r['dryRun'].planCutsPer10, 'wired', r['wired'].planCutsPer10, 'drawn', r['wired'].drawnCutsPer10, 'unlaid', r['wired'].unlaid.length, ...(frames ? ['unreal', r['wired'].unrealized, 'verified', r['wired'].verifiedCompositionCutsPer10] : []), 'warn', r['wired'].warnings].join('\t'));
