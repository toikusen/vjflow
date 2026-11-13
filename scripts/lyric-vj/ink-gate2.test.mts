// The ink gate v2's page-side smoke test (docs/research/2026-11-13-ink-table-gate-design.md §1.8), in a real page:
//  1. a readable line (dark-glitch's light ink on an empty, black look, every final effect at rest) passes; at uFlicker
//     0.97 its worst glyph equals the rule worked here on the frame at 1 scaled by 0.97, ±1 %;
//  2. the same line with the ground under it lifted toward the ink (uLift) fails;
//  3. frozen controls on a scene whose text mask is not empty (the pixel medium, the mask forced on): without the freeze the
//     words-off frame differs under the words; with it the field round the words holds still (offDrift ≤ 2).
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

// 1–2: dark-glitch's light ink on an empty look (black): a readable line at rest
const empty = (j: Record<string, unknown>) => { const tr = j['treatment'] as { graphics?: { sections: { layers: unknown[] }[] } }; for (const s of tr.graphics?.sections ?? []) s.layers = []; };
const t = 6.2;
const lum = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const flat = await open('dark-glitch', empty, `window.__vjFinalOff = ${JSON.stringify(REST)};`);
const base = (await flat.evaluate(`window.inkGate.moment(${t})`)) as { reads: Read[] };
const read = base.reads.filter((x) => x.v.n > 0);
check(read.length > 0 && read.every((x) => x.v.status === 'pass'), `a readable line at ${t}s passes (${read.length} glyphs, worst ${Math.min(...read.map((x) => x.v.min)).toFixed(2)})`);
// (uFlicker 0.97 scales the whole frame in the final pass: the gate's worst glyph must equal the same rule worked here
// on the frame at 1 with every channel scaled by 0.97, ±1 %)
const A = (await flat.evaluate(`(async () => { const m = await window.vjEngine.inkMoment(${t}); return m && { w: m.box[2], h: m.box[3], on: Array.from(m.on), mask: Array.from(m.mask) }; })()`)) as { w: number; h: number; on: number[]; mask: number[] } | null;
if (A) {
  const Lp = (k: number) => 0.2126 * lum(Math.round(A.on[k] * 0.97)) + 0.7152 * lum(Math.round(A.on[k + 1] * 0.97)) + 0.0722 * lum(Math.round(A.on[k + 2] * 0.97));
  const own = (i: number) => (A.mask[i * 4] << 16) | (A.mask[i * 4 + 1] << 8) | A.mask[i * 4 + 2];
  let expect = Infinity;
  for (let i = 0; i < A.w * A.h; i++) {
    if (!own(i) || A.mask[i * 4 + 3] < 255) continue;
    const [x, y] = [i % A.w, Math.floor(i / A.w)];
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const [qx, qy] = [x + dx, y + dy];
      if ((!dx && !dy) || dx * dx + dy * dy > 9 || qx < 0 || qy < 0 || qx >= A.w || qy >= A.h || own(qy * A.w + qx) === own(i)) continue;
      const [p, q] = [Lp(i * 4), Lp((qy * A.w + qx) * 4)];
      expect = Math.min(expect, (Math.max(p, q) + 0.05) / (Math.min(p, q) + 0.05));
    }
  }
  await flat.evaluate(`window.__vjFinalSet = { uFlicker: 0.97 }`);
  const r = (await flat.evaluate(`window.inkGate.moment(${t})`)) as { reads: Read[] };
  const got = Math.min(...r.reads.filter((x) => x.v.n > 0).map((x) => x.v.min));
  check(expect >= 4.5 && Math.abs(got - expect) <= 0.01 * expect, `flicker 0.97: worst ${got.toFixed(3)} vs worked ${expect.toFixed(3)} (a readable pair)`);
  // the ground under the words lifted toward the ink (the paper's lift on the darks): the same line must now fail
  await flat.evaluate(`window.__vjFinalSet = { uLift: 1.4 }`);
  const lifted = (await flat.evaluate(`window.inkGate.moment(${t})`)) as { reads: Read[] };
  check(lifted.reads.some((x) => x.v.status === 'fail'), `the ground lifted to the ink flips the line to fail (worst ${Math.min(...lifted.reads.filter((x) => x.v.n > 0).map((x) => x.v.min)).toFixed(2)})`);
}
await flat.close();

// 3: frozen controls on a scene whose final pass keeps the words by their text mask: the pixel medium with the mask forced
// on, a line on no carrier. Without the freeze the words-off pass loses the mask and the dither reaches the ground under
// the words the words-on pass kept: the two words-off frames differ there; with the freeze, the field holds still.
const toothAt = 153.3;
const tooth = await open('dark-glitch', () => {}, `window.__vjForceTextMask = true; window.__vjFinalSet = { uPixel: 1 };`);
const offOf = `(async () => { const m = await window.vjEngine.inkMoment(${toothAt}); return m && { off: Array.from(m.off), on: Array.from(m.on), mask: Array.from(m.mask), w: m.box[2], h: m.box[3] }; })()`;
const F = (await tooth.evaluate(offOf)) as { off: number[]; on: number[]; mask: number[]; w: number; h: number } | null;
await tooth.evaluate('window.__vjInkNoFreeze = true');
const N = (await tooth.evaluate(offOf)) as { off: number[] } | null;
check(!!F && !!N, `a line off any carrier on dark-glitch at ${toothAt}s`);
if (F && N) {
  let differ = 0;
  for (let k = 0; k < F.off.length; k += 4) if (Math.abs(F.off[k] - N.off[k]) + Math.abs(F.off[k + 1] - N.off[k + 1]) + Math.abs(F.off[k + 2] - N.off[k + 2]) > 6) differ++;
  check(differ > 0, `the frozen text mask holds the words-off ground the words-on pass kept (${differ} px differ without the freeze)`);
  await tooth.evaluate('window.__vjInkNoFreeze = false');
  const frozen = (await tooth.evaluate(`window.inkGate.moment(${toothAt})`)) as { drift: number; reads: Read[] };
  check(frozen.reads.length > 0 && frozen.drift <= 2, `with the freeze the field round the words holds still (drift ${frozen.drift})`);
}
await tooth.close();
await browser.close();
server.close();
process.exitCode = fails.length ? 1 : 0;
