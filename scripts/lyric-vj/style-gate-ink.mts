// The measured ink gate: every glyph's ink reads at 4.5:1 on the ground it actually stands on (owner: legibility is
// absolute), measured on the frames, not on what a set declares (2026-11-12: y2k/strips' roll ran grey on a pink foil
// cell at 3.12:1 and cel80s/ending-l's second part stood cream on a lilac sky at 2.53:1, neither declared anywhere).
// Every line of every world × song (seed 0, the scheduler off unless VJ_WORLD_EVENTS=1) is drawn with and without its
// words (what they stand on kept, as the reading gate does) at the moments it is read:
//   - base: the middle of its readable time and 0.08 s before its end (the last line: a second before its middle, the
//     video's ending fade takes it);
//   - each hold (world beat): 0.15 s before it, at 25 / 50 / 75 % of it, and 0.15 s after it when its ink stays;
//   - a signature moment's line: the base moments, on the characters its own layer drew.
// Each glyph's ink pixels (near its commonest text colour) are read against the same pixels without the words; the
// glyph's reading is the low end of them (its box cut 3 × 3, the worst cell's median: measured-ink CELLS; a stitched or
// grained ink's light threads do not fail it, a third of it standing on another ground does). Any glyph under 4.5:1 fails.
// The rings a set lays under its letters (a keyline, a poster band, a misprint) stay in the frame without the words: they
// are what the letters are read on (taken away, psychedelic's keylined letters read against the sky behind the band).
// Not read, and counted apart: a glyph whose own entrance or exit is running on the frame (`moving`: not yet or no
// longer being read; a sung reveal brings each glyph in at its own voice), one drawn under 0.35 opacity (`faint`: nearly
// gone in the line's own fade; a glyph see-through by design, paper-lantern's lit paper, is read as drawn), a signature
// character not yet sung (`unsung`:
// its ghost tone, faint by design), and one with under 40 ink pixels (`small`). A moment outside the line's readable
// time is not taken.
//   npx tsx --tsconfig tsconfig.json scripts/lyric-vj/style-gate-ink.mts --out out/research/ink/before [--songs nun,snow] [--shots] [--font Huninn] [--sample 20] [world ...]
// --sample N: every hold (at its middle, and after it when its ink stays) and every signature line, and the middle of every
// k-th line in the song's order (k = ⌈lines / N⌉) only: a stratified sample, the same on both sides of a change.
// (no worlds named: all 45). Writes <out>/<first world…>.json; exits non-zero on any failing glyph.
import { execSync } from 'node:child_process';
import { copyFileSync, createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import * as esbuild from 'esbuild';
import { chromium, Page } from 'playwright';
import { freeJob } from '../../src/app/lyric-vj/free-plan';
import { FREE_STYLES } from '../../src/app/lyric-vj/free-styles';
import { INK_MIN } from '../../src/app/lyric-vj/measured-ink';
import { fontCache } from './font-cache.mts';
import type { Read } from './gate-ink-page.mts';

const IDS: Record<string, string> = { nun: 'yt_w_fCuUR3lEs', snow: 'yt_5i50aTB7JFo', tsuzuki: 'yt_b3GCfyNKeLs', choroin: 'yt_hCCskTJwvuc', tenmon: 'yt_iwYXfOhcsYI' };
const { values: a, positionals } = parseArgs({ allowPositionals: true, options: { out: { type: 'string', default: 'out/research/ink/gate' }, songs: { type: 'string', default: 'nun,snow,tsuzuki,choroin,tenmon' }, seed: { type: 'string', default: '0' }, shots: { type: 'boolean', default: false }, font: { type: 'string' }, sample: { type: 'string' } } });
if (!positionals.length) positionals.push(...FREE_STYLES.map((s) => s.id));
/** Hold moments, as shares of the hold's own time, and the margins before and after it, s. */
export const HOLD = { before: 0.15, at: [0.25, 0.5, 0.75], after: 0.15 };
const out = resolve(a.out!);
const work = join(out, 'work', positionals.join('-').slice(0, 30));
mkdirSync(work, { recursive: true });
await esbuild.build({ entryPoints: ['src/app/lyric-vj/render/main.ts'], bundle: true, format: 'esm', target: 'es2022', outfile: join(work, 'render.js'), logLevel: 'warning' });
copyFileSync('scripts/lyric-vj/render.html', join(work, 'render.html'));
await esbuild.build({ entryPoints: ['scripts/lyric-vj/gate-ink-page.mts'], bundle: true, format: 'iife', target: 'es2022', outfile: join(work, 'gate-ink-page.js'), logLevel: 'warning' });
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
const moment = (p: Page, t: number, ids: string[]) => p.evaluate(`window.inkPage.moment(${t}, ${JSON.stringify(ids)})`) as Promise<Read[]>;

type Row = { world: string; song: string; cue: string; t: number; at: string; i: number; ch: string; low: number; median: number; ink: string; ground: string; box: number[] };
const fails: Row[] = [];
/** The inks the renderer took on the ground it measured (world-layout measuredInks), line by line. */
const fixes: { world: string; song: string; cue: string; fixes: unknown[] }[] = [];
const per: Record<string, { moments: number; glyphs: number; fails: number; failMoments: number; lines: Set<string>; skip: Record<string, number>; worst: number }> = {};
/** Every signature moment's characters, read (the echo's answer line among them): their medians. */
const signature: { world: string; song: string; cue: string; t: number; n: number; median: number; low: number }[] = [];
for (const id of positionals) {
  const style = FREE_STYLES.find((s) => s.id === id)!;
  const w = (per[id] = { moments: 0, glyphs: 0, fails: 0, failMoments: 0, lines: new Set<string>(), skip: {}, worst: Infinity });
  for (const name of a.songs!.split(',')) {
    const song = JSON.parse(readFileSync(`out/db/${IDS[name]}/song.json`, 'utf8'));
    const meaning = JSON.parse(readFileSync(`out/research/instant/plans/${name}/meaning.json`, 'utf8'));
    const { job } = freeJob(song, { style, seed: Number(a.seed), meaning, ...(a.font ? { font: a.font } : {}) });
    const beats = new Map((job.treatment.cues as { cueId: string; world?: { beat?: { kind: string; at: number; sec?: number; stays?: boolean } } }[]).flatMap((c) => (c.world?.beat ? [[c.cueId, c.world.beat] as const] : [])));
    const file = join(work, `${id}-${name}.job.json`);
    writeFileSync(file, JSON.stringify({ ...job, live: true }));
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.addInitScript({ path: join(work, 'gate-ink-page.js') });
    // (the rings a set lays under its letters, a keyline, a band, a misprint, stay when the words are taken away: what each letter is read on)
    await page.addInitScript('window.__vjInkRings = true');
    await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, async (route) => {
      const font = await getFont(route.request().url(), route.request().headers()['user-agent'] ?? '');
      return font ? route.fulfill({ body: font.body, contentType: font.type, headers: { 'access-control-allow-origin': '*' } }) : route.abort();
    });
    await page.goto(`http://127.0.0.1:${(server.address() as { port: number }).port}/${relative(ROOT, resolve(work))}/render.html?job=/${relative(ROOT, resolve(file))}`);
    await page.waitForSelector('body[data-ready="1"]', { timeout: 200000 });
    const cues = await page.evaluate(() => window.vjMetrics().cues.map((c) => ({ id: c.id, from: c.readableFrom, to: c.readableTo, text: c.text, template: (c as { template?: string }).template, inkFixes: (c as { inkFixes?: unknown[] }).inkFixes })));
    for (const c of cues) if (c.inkFixes) fixes.push({ world: id, song: name, cue: c.id, fixes: c.inkFixes });
    for (const c of cues) {
      const sig = c.template === 'signature';
      const base: [number, string][] = c === cues.at(-1) ? [[(c.from + c.to) / 2 - 1, 'base']] : [[(c.from + c.to) / 2, 'base'], [c.to - 0.08, 'base-end']];
      const b = sig ? undefined : beats.get(c.id);
      const sec = b?.sec ?? 0.5;
      const hold: [number, string][] = b ? [[b.at - HOLD.before, `${b.kind}:before`], ...HOLD.at.map((q): [number, string] => [b.at + sec * q, `${b.kind}:${q * 100}%`]), ...(b.stays ? [[b.at + sec + HOLD.after, `${b.kind}:after`] as [number, string]] : [])] : [];
      // (--sample N: every hold and signature moment, the plain reading moments of every k-th line of the song only, k so
      // that about N lines are read: the same lines on both sides of a change, picked from the song's own line order)
      const order = (song.cues as { id: string }[]).findIndex((x) => x.id === c.id);
      const k = a.sample ? Math.max(1, Math.ceil(song.cues.length / Number(a.sample))) : 1;
      const keepBase = sig || order % k === 0;
      // (sampled: a line's middle only, and a hold at its middle and, when its ink stays, after it)
      const sampled = (xs: [number, string][]) => (a.sample ? xs.filter(([, at]) => at === 'base' || /:(50%|after)$/.test(at)) : xs);
      const times = sampled([...(keepBase ? base : []), ...hold]).filter(([t]) => t >= c.from && t <= c.to);
      const chars = [...c.text.replace(/[\s　]+/g, ' ').trim()];
      for (const [t, at] of times) {
        const reads = await moment(page, t, [sig ? 'signature' : c.id]);
        w.moments++;
        let bad = 0;
        const sigReads: number[] = [];
        for (const r of reads) {
          if (r.skip) { const k = sig && r.skip === 'moving' ? 'unsung' : r.skip; w.skip[k] = (w.skip[k] ?? 0) + 1; continue; }
          w.glyphs++;
          w.worst = Math.min(w.worst, r.r!.low);
          if (sig) sigReads.push(r.r!.median);
          if (r.r!.low >= INK_MIN) continue;
          bad++;
          fails.push({ world: id, song: name, cue: c.id, t: +t.toFixed(3), at: sig ? 'signature' : at, i: r.i, ch: sig ? '' : chars[r.i] ?? '', low: r.r!.low, median: r.r!.median, ink: r.r!.ink, ground: r.r!.ground, box: r.box });
        }
        if (sig && sigReads.length) { const s = [...sigReads].sort((x, y) => x - y); signature.push({ world: id, song: name, cue: c.id, t: +t.toFixed(3), n: s.length, median: s[s.length >> 1], low: s[0] }); }
        if (!bad) continue;
        w.fails += bad;
        w.failMoments++;
        w.lines.add(`${name}/${c.id}`);
        if (a.shots) {
          const dir = join(out, 'shots', id);
          mkdirSync(dir, { recursive: true });
          const url = (await page.evaluate(`window.inkPage.still(${t})`)) as string;
          writeFileSync(join(dir, `${name}-${c.id}-${t.toFixed(2)}.jpg`), Buffer.from(url.split(',')[1], 'base64'));
        }
      }
    }
    await page.close();
    console.log(id, name, 'moments', w.moments, 'fails', w.fails);
  }
}
await browser.close();
server.close();
const worlds = Object.fromEntries(Object.entries(per).map(([k, v]) => [k, { moments: v.moments, glyphs: v.glyphs, fails: v.fails, failMoments: v.failMoments, lines: [...v.lines], skip: v.skip, worst: +v.worst.toFixed(2) }]));
const res = { commit: execSync('git rev-parse --short HEAD').toString().trim(), sample: a.sample ? Number(a.sample) : null, scheduled: process.env['VJ_WORLD_EVENTS'] === '1', seed: Number(a.seed), min: INK_MIN, worlds, fails, signature, fixes };
writeFileSync(join(out, `${positionals.join('-').slice(0, 40)}.json`), JSON.stringify(res, null, 1));
console.log(JSON.stringify(Object.fromEntries(Object.entries(worlds).map(([k, v]) => [k, `${v.fails}/${v.glyphs} in ${v.failMoments} moments, worst ${v.worst}`]))));
process.exitCode = fails.length ? 1 : 0;
