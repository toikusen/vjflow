// The ink halo compared on named moments (ruling 2026-11-13 §2, docs/research/2026-11-13-ink-halo-codex.md): the same
// world × song × seed × time drawn four ways: A as now, B the 4 + 2 px halo, C a larger halo (8 + 4), D every effect off
// (the final pass's controls at rest, no scene snow, no halo: a diagnosis, not a candidate). Per moment and way: the full
// frame (PNG), the words' box at full size (PNG), and the gate's numbers: worst glyph, the failing glyphs with their worst
// pair's two ends, and the protected area (px of the box within the halo's clean and ramp distances of a glyph's mask).
//   nice -n 19 npx tsx --tsconfig tsconfig.json scripts/lyric-vj/ink-halo-compare.mts --out DIR --world dark-glitch --song choroin 153.3 120.5
import { appendFileSync, copyFileSync, createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import * as esbuild from 'esbuild';
import { chromium } from 'playwright';
import { freeJob } from '../../src/app/lyric-vj/free-plan';
import { FREE_STYLES } from '../../src/app/lyric-vj/free-styles';
import { fontCache } from './font-cache.mts';
import type { Read } from './ink-gate2-page.mts';

const IDS: Record<string, string> = { nun: 'yt_w_fCuUR3lEs', snow: 'yt_5i50aTB7JFo', tsuzuki: 'yt_b3GCfyNKeLs', choroin: 'yt_hCCskTJwvuc', tenmon: 'yt_iwYXfOhcsYI' };
const { values: a, positionals } = parseArgs({ allowPositionals: true, options: { out: { type: 'string' }, world: { type: 'string' }, song: { type: 'string' }, seed: { type: 'string', default: '0' } } });
const out = resolve(a.out!);
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
const song = JSON.parse(readFileSync(`out/db/${IDS[a.song!]}/song.json`, 'utf8'));
const meaning = JSON.parse(readFileSync(`out/research/instant/plans/${a.song}/meaning.json`, 'utf8'));
const { job } = freeJob(song, { style: FREE_STYLES.find((s) => s.id === a.world)!, seed: Number(a.seed), meaning });
const REST = ['uVignette', 'uVigBase', 'uFade', 'uGrain', 'uPaper', 'uBoil', 'uLift', 'uTooth', 'uPixel', 'uScan', 'uGlitch', 'uAberration', 'uFlash', 'uHit', 'uZoomHit', 'uTileHit', 'uRays', 'uBeams', 'uShock', 'uSweep', 'uShockR', 'uGlass', 'uFlicker'];
const WAYS: { id: string; halo?: [number, number] | false; init?: string }[] = [
  { id: 'A-now', halo: false },
  { id: 'B-halo4+2', halo: [4, 6] },
  { id: 'C-halo8+4', halo: [8, 12] },
  { id: 'D-effects-off', halo: false, init: `window.__vjFinalOff = ${JSON.stringify(REST)}; window.__vjNoSnow = true;` },
];
/** Each pixel's distance to the nearest glyph pixel of the mask (exact, separable, rows then columns). */
const edt = (mask: number[], w: number, h: number) => {
  const INF = 1e6;
  const g = new Float64Array(w * h);
  for (let y = 0; y < h; y++) {
    let last = -INF;
    for (let x = 0; x < w; x++) { const i = y * w + x; if (mask[i * 4] | mask[i * 4 + 1] | mask[i * 4 + 2]) last = x; g[i] = x - last; }
    last = INF;
    for (let x = w - 1; x >= 0; x--) { const i = y * w + x; if (mask[i * 4] | mask[i * 4 + 1] | mask[i * 4 + 2]) last = x; g[i] = Math.min(g[i], last - x); }
  }
  const d = new Float64Array(w * h).fill(INF);
  const R = 16;
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) for (let k = -R; k <= R; k++) { const yy = y + k; if (yy < 0 || yy >= h) continue; const v = g[yy * w + x]; if (v < INF) d[y * w + x] = Math.min(d[y * w + x], Math.sqrt(v * v + k * k)); }
  return d;
};
const report: Record<string, unknown> = {};
for (const way of WAYS) {
  const file = join(work, `${way.id}.job.json`);
  writeFileSync(file, JSON.stringify({ ...job, live: true, treatment: { ...job.treatment, ...(way.halo !== undefined ? { inkHalo: way.halo } : {}) } }));
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.addInitScript({ path: join(work, 'ink-gate2-page.js') });
  if (way.init) await page.addInitScript(way.init);
  await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, async (route) => { const font = await getFont(route.request().url(), route.request().headers()['user-agent'] ?? ''); return font ? route.fulfill({ body: font.body, contentType: font.type, headers: { 'access-control-allow-origin': '*' } }) : route.abort(); });
  // (what the page says, for a page that never gets ready: the halo pass stalled once on a busy machine)
  page.on('console', (m) => appendFileSync(join(out, `${way.id}.console.log`), `${m.type()} ${m.text()}\n`));
  page.on('pageerror', (e) => appendFileSync(join(out, `${way.id}.console.log`), `pageerror ${e.message}\n`));
  await page.goto(`http://127.0.0.1:${(server.address() as { port: number }).port}/${relative(ROOT, work)}/render.html?job=/${relative(ROOT, file)}`);
  await page.waitForSelector('body[data-ready="1"]', { timeout: 600000 });
  for (const ts of positionals) {
    const t = Number(ts);
    const frame = (await page.evaluate(`window.vjFrame(${t}).then((c) => c.toDataURL('image/png'))`)) as string;
    writeFileSync(join(out, `${a.world}-${a.song}-${ts}-${way.id}-frame.png`), Buffer.from(frame.split(',')[1], 'base64'));
    const m = (await page.evaluate(`window.inkGate.moment(${t})`)) as { reads: Read[]; box?: [number, number, number, number] };
    const raw = (await page.evaluate(`(async () => { await window.vjFrame(${t}); const m = await window.vjEngine.inkMoment(${t}, 24); if (!m) return null; const c = new OffscreenCanvas(m.box[2], m.box[3]); const img = c.getContext('2d').createImageData(m.box[2], m.box[3]); img.data.set(m.on); c.getContext('2d').putImageData(img, 0, 0); const b = await c.convertToBlob({ type: 'image/png' }); const s = await new Promise((r) => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); }); return { box: m.box, png: s, mask: Array.from(m.mask) }; })()`)) as { box: [number, number, number, number]; png: string; mask: number[] } | null;
    if (!raw || !m.box) { report[`${ts}/${way.id}`] = { lines: 0 }; continue; }
    writeFileSync(join(out, `${a.world}-${a.song}-${ts}-${way.id}-words.png`), Buffer.from(raw.png.split(',')[1], 'base64'));
    const [, , bw, bh] = raw.box;
    const d = edt(raw.mask, bw, bh);
    const [clean, ramp] = way.halo || [0, 0];
    let [cleanPx, rampPx] = [0, 0];
    for (let i = 0; i < bw * bh; i++) { if (d[i] > 0 && d[i] <= clean) cleanPx++; else if (d[i] > clean && d[i] <= ramp) rampPx++; }
    const fails = m.reads.filter((r) => r.v.status !== 'pass').map((r) => ({ cue: r.cue, i: r.i, phase: r.phase, status: r.v.status, min: +r.v.min.toFixed(2), shape: r.v.shape, p: r.v.pair && [r.v.pair.p[0] + m.box![0], r.v.pair.p[1] + m.box![1], r.v.pair.p[2]], q: r.v.pair && [r.v.pair.q[0] + m.box![0], r.v.pair.q[1] + m.box![1], r.v.pair.q[2]] }));
    const mins = m.reads.filter((r) => Number.isFinite(r.v.min)).map((r) => r.v.min);
    report[`${ts}/${way.id}`] = { glyphs: m.reads.length, worst: mins.length ? +Math.min(...mins).toFixed(2) : null, fails: fails.length, failing: fails, box: m.box, protectedPx: { clean: cleanPx, ramp: rampPx }, extrudeGlyphs: m.reads.filter((r) => r.v.pair?.p[2] === 'extrude').length };
    console.log(ts, way.id, JSON.stringify({ worst: (report[`${ts}/${way.id}`] as { worst: number }).worst, fails: fails.length, glyphs: m.reads.length }));
  }
  await page.close();
}
writeFileSync(join(out, `${a.world}-${a.song}.json`), JSON.stringify(report, null, 1));
await browser.close();
server.close();
