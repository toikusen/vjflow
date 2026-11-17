// Audit: every glyph a frame draws lies inside the box the renderer reports for its line (the box props, story
// figures (f.lines), the keep-clear and the cover measurement all trust). A render job (render.mts writes job.json)
// is stepped through each line's reading time; each drawn glyph (vjGlyphs: the engine's glyph planes, a signature
// moment's characters) is checked against the reported boxes up then (vjLineBoxes), 2 px slack. Exit 1 on any miss.
//   nice -n 19 npx tsx --tsconfig tsconfig.json scripts/lyric-vj/linebox-audit.mts --job out/research/story-clear/sekai-after/job.json [--from 130 --to 150] [--per-line 4]
import { copyFileSync, createReadStream, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import * as esbuild from 'esbuild';
import { chromium } from 'playwright';
import { fontCache } from './font-cache.mts';

type Rect = { x0: number; y0: number; x1: number; y1: number };
/** How far a glyph may reach past its line's box (px). */
export const SLACK = 2;
/** Jobs known not to load in the audit's page, with why: never audited, never counted as a pass either. */
export const KNOWN_UNLOADABLE: Record<string, string> = {
  // (the only saved job with the phone templates chat / input / notify; its 32 assets under phone-story-tenmon and
  // phone-story2-tenmon were swept, so the page waits on 404s forever: 2026-11-17)
  'out/research/style-refs/phone/job.json': 'all 32 of its assets were deleted (404), the page never gets ready',
};
/** The opacity from which a glyph is read (engine.ts INK_READ). */
export const INK_READ = 0.5;

/** The part of a glyph box outside every box (px, the largest reach past an edge), 0 when inside one of them. */
export function reachOut(g: Rect, boxes: Rect[]): number {
  if (!boxes.length) return Infinity;
  return Math.min(...boxes.map((b) => Math.max(0, b.x0 - g.x0, b.y0 - g.y0, g.x1 - b.x1, g.y1 - b.y1)));
}

if (process.argv[1]?.endsWith('linebox-audit.mts')) {
  const { values: a } = parseArgs({ options: { 'debug-id': { type: 'string' }, why: { type: 'boolean', default: false }, job: { type: 'string', multiple: true }, jobs: { type: 'string' }, from: { type: 'string' }, to: { type: 'string' }, 'per-line': { type: 'string', default: '3' } } });
  const jobFiles = [...(a.job ?? []), ...(a.jobs ? readFileSync(a.jobs, 'utf8').split('\n').filter((l) => l.trim() && !l.startsWith('#')) : [])].map((f) => resolve(f));
  const work = resolve('out/research/linebox-audit');
  mkdirSync(work, { recursive: true });
  await esbuild.build({ entryPoints: ['src/app/lyric-vj/render/main.ts'], bundle: true, format: 'esm', target: 'es2022', outfile: join(work, 'render.js'), logLevel: 'warning' });
  copyFileSync('scripts/lyric-vj/render.html', join(work, 'render.html'));
  const ROOT = process.cwd();
  const server = createServer((req, res) => { const asked = decodeURIComponent(new URL(req.url!, 'http://x').pathname); const path = asked.startsWith('/fonts/') ? join(ROOT, 'out', asked) : asked.startsWith('/@abs/') ? asked.slice(5) : join(ROOT, asked); if (!existsSync(path)) return void res.writeHead(404).end(); res.writeHead(200, { 'content-type': { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' }[extname(path)] ?? 'application/octet-stream' }); createReadStream(path).pipe(res); }).listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const browser = await chromium.launch({ channel: 'chromium', args: ['--force-device-scale-factor=1', '--ignore-gpu-blocklist'] });
  const getFont = fontCache(resolve('out/font-cache'));
  const [lo, hi] = [Number(a.from ?? -Infinity), Number(a.to ?? Infinity)];
  const n = Number(a['per-line']);
  const r0 = (b?: Rect) => b && [b.x0, b.y0, b.x1, b.y1].map(Math.round).join(',');
  const byTemplate = new Map<string, { glyphs: number; misses: number; worst: number }>();
  let total = 0, failed = 0, loadFailed = 0;
  for (const jobFile of jobFiles) {
    // (a job file that is gone or broken fails the run like one that does not load)
    let jobText = '';
    try { jobText = readFileSync(jobFile, 'utf8'); } catch (e) { console.log(`FAIL ${relative(ROOT, jobFile)}: cannot read (${(e as Error).message.split('\n')[0]})`); loadFailed++; continue; }
    const job = JSON.parse(jobText) as { window?: { start: number; end: number }; cues: { id: string; start: number; end: number }[]; treatment: { shots: { id: string; template: string }[]; cues: { cueId: string; shot: string; world?: { set?: string } }[] } };
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    try {
      await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, async (route) => { const font = await getFont(route.request().url(), route.request().headers()['user-agent'] ?? ''); return font ? route.fulfill({ body: font.body, contentType: font.type }) : route.continue(); });
      const rel = relative(ROOT, jobFile);
      await page.goto(`http://127.0.0.1:${(server.address() as { port: number }).port}/${relative(ROOT, work)}/render.html?job=/${rel.startsWith('..') ? `@abs${jobFile}` : rel}`);
      await page.waitForSelector('body[data-ready="1"]', { timeout: 300000 });
      // (a page whose setup threw is reported, never audited as if it were whole)
      const ready = await page.evaluate('window.vjReady.then(() => "ok", (e) => String(e && e.stack || e))');
      if (ready !== 'ok') throw new Error(`setup failed: ${ready}`);
      if (a['debug-id']) console.log('debug', JSON.stringify(await page.evaluate(`(() => { const e = window.vjEngine; const c = e.cueLayers.find((x) => x.rt.cue.id === '${a['debug-id']}'); return { template: c.rt.shot.template, readable: c.layer.readable(), boxes: e.lyricRects.filter((r) => r.id === '${a['debug-id']}').map((r) => ({ from: r.from, to: r.to, y0: r.rect.y0, y1: r.rect.y1 })), now: window.vjInkNow('${a['debug-id']}').ink }; })()`)));
    } catch (e) {
      // a job that does not load is a failure, unless it is a known one (KNOWN_UNLOADABLE, with its reason)
      const known = KNOWN_UNLOADABLE[relative(ROOT, jobFile)];
      console.log(`${known ? 'skip (known)' : 'FAIL'} ${relative(ROOT, jobFile)}: did not load (${(e as Error).message.split('\n')[0]})${known ? `: ${known}` : ''}${errors.length ? ` — page errors: ${errors.slice(0, 3).join(' | ').slice(0, 400)}` : ''}`);
      if (!known) loadFailed++;
      await page.close();
      continue;
    }
    // (the template, and a world's set family, each line is laid in)
    const kindOf = new Map(job.treatment.cues.map((c) => [c.cueId, `${job.treatment.shots.find((s) => s.id === c.shot)?.template ?? '?'}${c.world?.set ? `:${c.world.set.split('/')[0]}` : ''}`]));
    const win = job.window ?? { start: -Infinity, end: Infinity };
    const misses: { t: number; id: string; kind: string; px: number; g: Rect; boxes: Rect[]; why: string }[] = [];
    for (const c of job.cues.filter((x) => x.end > Math.max(lo, win.start) && x.start < Math.min(hi, win.end))) {
      for (let k = 0; k < n; k++) {
        const t = +(Math.max(c.start, win.start) + 0.35 + ((Math.min(c.end, win.end) - Math.max(c.start, win.start) - 0.45) * k) / Math.max(1, n - 1)).toFixed(3);
        const r = (await page.evaluate(`window.vjFrame(${t}).then(() => { const glyphs = window.vjGlyphs(); return { glyphs, boxes: window.vjLineBoxes(${t}), readable: Object.fromEntries(glyphs.map((l) => [l.id, window.vjReadable(l.id)])) }; })`)) as { glyphs: { id: string; glyphs: (Rect & { a: number; preview?: boolean })[] }[]; boxes: { id: string; rect: Rect }[]; readable: Record<string, [number, number] | null> };
        for (const line of r.glyphs) {
          // (only while the engine counts the line as read, layer.readable: a line still flying in before it, or left
          // over after it, is not read; the box is for the reading)
          const rd = r.readable[line.id];
          if (rd && (t < rd[0] || t > (rd[1] ?? Infinity))) continue;
          // (a signature moment's characters belong to whichever of its lines is up; the engine's to their own line)
          const boxes = r.boxes.filter((b) => line.id === 'signature' || b.id === line.id || b.id === `${line.id}:call`).map((b) => b.rect);
          const kind = line.id === 'signature' ? `signature/${kindOf.get(c.id) ?? '?'}` : kindOf.get(line.id) ?? '?';
          const tally = byTemplate.get(kind) ?? { glyphs: 0, misses: 0, worst: 0 };
          byTemplate.set(kind, tally);
          for (const g of line.glyphs) {
            // (a readable glyph on the frame: a line fading out on its exit is not read, the frame's edge clips what is off it)
            if (g.a < INK_READ || g.preview) continue;
            const cg = { x0: Math.max(0, g.x0), y0: Math.max(0, g.y0), x1: Math.min(1920, g.x1), y1: Math.min(1080, g.y1) };
            if (cg.x1 <= cg.x0 || cg.y1 <= cg.y0) continue;
            tally.glyphs++;
            const px = reachOut(cg, boxes);
            if (px <= SLACK) continue;
            tally.misses++;
            tally.worst = Math.max(tally.worst, px);
            let why = '';
            if (a.why && line.id !== 'signature' && !misses.some((m) => m.id === line.id)) {
              // (which motion carries it past: the type layer's drift and kick, the line's own beat motion, or neither)
              const w = (await page.evaluate(`window.vjGlyphsWhy('${line.id}', ${t})`)) as { drawn: number[][]; moving: number[][]; rest: number[][]; root: { x: number; y: number; s: number } } | undefined;
              const worstOf = (gs: number[][]) => Math.round(Math.max(0, ...gs.map(([x0, y0, x1, y1]) => reachOut({ x0: Math.max(0, x0), y0: Math.max(0, y0), x1: Math.min(1920, x1), y1: Math.min(1080, y1) }, boxes))));
              if (w) why = ` ink now ${JSON.stringify(await page.evaluate(`window.vjInkNow('${line.id}')`))} why: drawn ${worstOf(w.drawn)} px, type layer unmoved ${worstOf(w.moving)} px, at rest ${worstOf(w.rest)} px (root ${w.root.x.toFixed(1)},${w.root.y.toFixed(1)} ×${w.root.s.toFixed(3)})`;
            }
            misses.push({ t, id: line.id === 'signature' ? `signature@${c.id}` : line.id, kind, px: Math.round(px), g: cg, boxes, why });
          }
        }
      }
    }
    await page.close();
    const worst = new Map<string, (typeof misses)[number] & { n: number }>();
    for (const m of misses) { const w = worst.get(m.id); if (!w || m.px > w.px) worst.set(m.id, { ...m, n: (w?.n ?? 0) + 1 }); else w.n++; }
    for (const w of [...worst.values()].sort((x, y) => y.px - x.px).slice(0, 6)) console.log(`miss ${relative(ROOT, jobFile)} ${w.id} (${w.kind}): ${w.n} glyphs past the box, worst ${w.px === Infinity ? 'no box at all' : `${w.px} px`} at ${w.t} s (glyph ${r0(w.g)}; boxes ${w.boxes.map(r0).join(' ')})${misses.find((m) => m.id === w.id && m.why)?.why ?? ''}`);
    total += misses.length;
    if (misses.length) failed++;
  }
  for (const [k, v] of [...byTemplate].sort()) console.log(`template ${k}: ${v.glyphs} glyphs, ${v.misses} past the box${v.misses ? `, worst ${v.worst === Infinity ? 'no box' : `${Math.round(v.worst)} px`}` : ''}`);
  console.log(`linebox audit: ${jobFiles.length} jobs, ${loadFailed} failed to load, ${failed} with glyphs past their line's box, ${total} glyphs past it by more than ${SLACK} px`);
  await browser.close();
  server.close();
  process.exit(total || loadFailed ? 1 : 0);
}
