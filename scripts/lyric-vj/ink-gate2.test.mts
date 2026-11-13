// The ink gate v2's page-side smoke test (docs/research/2026-11-13-ink-table-gate-design.md §1.8), in a real page:
//  1. analytic: a world line on an empty look with every final effect at rest but uFlicker 0.97: the worst glyph's worst
//     pixel equals the WCAG ratio of that pixel's two colours at uFlicker 1, both scaled by 0.97 (±1 %);
//  2. a fail is caught: the same line with the look's darkness lifted to the ink (uLift) reads under 4.5;
//  3. frozen controls: the field outside the words does not move when the words go (offDrift ≤ 2). (No free world uses a
//     medium that keeps the words by their text mask, so the run without the freeze, __vjInkNoFreeze, is printed, not held.)
//   nice -n 19 npx tsx --tsconfig tsconfig.json scripts/lyric-vj/ink-gate2.test.mts   (exit 1 on a failed check)
import { copyFileSync, createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, relative, resolve } from 'node:path';
import * as esbuild from 'esbuild';
import { chromium, type Page } from 'playwright';
import { freeJob } from '../../src/app/lyric-vj/free-plan';
import { FREE_STYLES } from '../../src/app/lyric-vj/free-styles';
import { fontCache } from './font-cache.mts';

const work = resolve('out/research/ink/gate2/smoke');
mkdirSync(work, { recursive: true });
await esbuild.build({ entryPoints: ['src/app/lyric-vj/render/main.ts'], bundle: true, format: 'esm', target: 'es2022', outfile: join(work, 'render.js'), logLevel: 'warning' });
copyFileSync('scripts/lyric-vj/render.html', join(work, 'render.html'));
await esbuild.build({ entryPoints: ['scripts/lyric-vj/ink-gate2-page.mts'], bundle: true, format: 'iife', target: 'es2022', outfile: join(work, 'ink-gate2-page.js'), logLevel: 'warning' });
const ROOT = process.cwd();
const server = createServer((req, res) => { const asked = decodeURIComponent(new URL(req.url!, 'http://x').pathname); const path = join(ROOT, asked.startsWith('/fonts/') ? join('out', asked) : asked); if (!existsSync(path)) return void res.writeHead(404).end(); res.writeHead(200, { 'content-type': { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' }[extname(path)] ?? 'application/octet-stream' }); createReadStream(path).pipe(res); }).listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const browser = await chromium.launch({ channel: 'chromium', args: ['--force-device-scale-factor=1', '--ignore-gpu-blocklist'] });
const getFont = fontCache(resolve('out/font-cache'));
const song = JSON.parse(readFileSync('out/db/yt_hCCskTJwvuc/song.json', 'utf8'));
const meaning = JSON.parse(readFileSync('out/research/instant/plans/choroin/meaning.json', 'utf8'));
const REST = ['uVignette', 'uVigBase', 'uFade', 'uGrain', 'uPaper', 'uBoil', 'uLift', 'uTooth', 'uPixel', 'uScan', 'uGlitch', 'uAberration', 'uFlash', 'uHit', 'uZoomHit', 'uTileHit', 'uRays', 'uBeams', 'uShock', 'uSweep', 'uShockR', 'uGlass', 'uFlicker'];
const open = async (world: string, edit: (j: Record<string, unknown>) => void, init: string): Promise<Page> => {
  const { job } = freeJob(song, { style: FREE_STYLES.find((s) => s.id === world)!, seed: 0, meaning });
  const j = { ...job, live: true } as Record<string, unknown>;
  edit(j);
  const file = join(work, `${world}.job.json`);
  writeFileSync(file, JSON.stringify(j));
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.addInitScript({ path: join(work, 'ink-gate2-page.js') });
  await page.addInitScript(init);
  await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, async (route) => { const font = await getFont(route.request().url(), route.request().headers()['user-agent'] ?? ''); return font ? route.fulfill({ body: font.body, contentType: font.type, headers: { 'access-control-allow-origin': '*' } }) : route.abort(); });
  await page.goto(`http://127.0.0.1:${(server.address() as { port: number }).port}/${relative(ROOT, work)}/render.html?job=/${relative(ROOT, file)}`);
  await page.waitForSelector('body[data-ready="1"]', { timeout: 600000 });
  return page;
};
type Read = { cue: string; i: number; v: { status: string; min: number; n: number } };
const fails: string[] = [];
const check = (ok: boolean, what: string) => { console.log(ok ? 'ok  ' : 'FAIL', what); if (!ok) fails.push(what); };

// 1–2: a black, empty look; the first glyph read of a line in its middle
const empty = (j: Record<string, unknown>) => { const tr = j['treatment'] as { graphics?: { sections: { layers: unknown[] }[] } }; for (const s of tr.graphics?.sections ?? []) s.layers = []; };
const t = 6.2;
const lum = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const flat = await open('xerox', empty, `window.__vjFinalOff = ${JSON.stringify(REST)};`);
// (the three boxes at uFlicker 1, then the gate's reading at 0.97: its worst glyph's worst pixel must be the WCAG ratio of
// that pixel's two colours at 1, both scaled by 0.97 the way the final pass scales them, the ground read as its 5 × 5 mean)
const A = (await flat.evaluate(`(async () => { const m = await window.vjEngine.inkMoment(${t}); return m && { box: m.box, on: Array.from(m.on), off: Array.from(m.off) }; })()`)) as { box: number[]; on: number[]; off: number[] } | null;
check(!!A, `a line on the empty look at ${t}s`);
if (A) {
  await flat.evaluate(`window.__vjFinalSet = { uFlicker: 0.97 }`);
  const r = (await flat.evaluate(`window.inkGate.moment(${t})`)) as { reads: (Read & { v: { minAt: number[] } })[] };
  const worst = r.reads.filter((x) => x.v.n > 0).sort((p, q) => p.v.min - q.v.min)[0];
  const [w, h] = [A.box[2], A.box[3]];
  const [x, y] = worst.v.minAt;
  const k = (y * w + x) * 4;
  const mean = (c: number) => { let [s, n] = [0, 0]; for (let yy = Math.max(0, y - 2); yy <= Math.min(h - 1, y + 2); yy++) for (let xx = Math.max(0, x - 2); xx <= Math.min(w - 1, x + 2); xx++) { s += A.off[(yy * w + xx) * 4 + c]; n++; } return s / n; };
  const Lof = (v: number[]) => 0.2126 * lum(v[0]) + 0.7152 * lum(v[1]) + 0.0722 * lum(v[2]);
  const [Lon, Loff] = [Lof([0, 1, 2].map((c) => Math.round(A.on[k + c] * 0.97))), Lof([0, 1, 2].map((c) => Math.round(Math.round(mean(c)) * 0.97)))];
  const expect = (Math.max(Lon, Loff) + 0.05) / (Math.min(Lon, Loff) + 0.05);
  check(Math.abs(worst.v.min - expect) <= 0.01 * expect + 0.02, `flicker 0.97: worst pixel ${worst.v.min.toFixed(3)} vs analytic ${expect.toFixed(3)}`);
  await flat.evaluate(`window.__vjFinalSet = { uLift: 1 }`);
  const lifted = (await flat.evaluate(`window.inkGate.moment(${t})`)) as { reads: Read[] };
  check(lifted.reads.some((x) => x.v.status === 'fail'), 'the ground lifted to the ink is caught (a fail)');
}
await flat.close();

// 3: frozen controls on crayon's paper tooth
const toothAt = 40;
const tooth = await open('crayon', () => {}, '');
const frozen = (await tooth.evaluate(`window.inkGate.moment(${toothAt})`)) as { drift: number; reads: Read[] };
await tooth.evaluate('window.__vjInkNoFreeze = true');
const loose = (await tooth.evaluate(`window.inkGate.moment(${toothAt})`)) as { drift: number };
check(frozen.reads.length > 0 && frozen.drift <= 2, `crayon ${toothAt}s: field still with the controls frozen (drift ${frozen.drift})`);
console.log('     without the freeze, drift', loose.drift);
await tooth.close();
await browser.close();
server.close();
process.exitCode = fails.length ? 1 : 0;
