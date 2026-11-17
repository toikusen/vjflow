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
/** The opacity from which a glyph is read (engine.ts INK_READ). */
export const INK_READ = 0.5;

/** The part of a glyph box outside every box (px, the largest reach past an edge), 0 when inside one of them. */
export function reachOut(g: Rect, boxes: Rect[]): number {
  if (!boxes.length) return Infinity;
  return Math.min(...boxes.map((b) => Math.max(0, b.x0 - g.x0, b.y0 - g.y0, g.x1 - b.x1, g.y1 - b.y1)));
}

if (process.argv[1]?.endsWith('linebox-audit.mts')) {
  const { values: a } = parseArgs({ options: { job: { type: 'string', multiple: true }, jobs: { type: 'string' }, from: { type: 'string' }, to: { type: 'string' }, 'per-line': { type: 'string', default: '3' } } });
  const jobFiles = [...(a.job ?? []), ...(a.jobs ? readFileSync(a.jobs, 'utf8').split('\n').filter(Boolean) : [])].map((f) => resolve(f));
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
  let total = 0, failed = 0;
  for (const jobFile of jobFiles) {
    const job = JSON.parse(readFileSync(jobFile, 'utf8')) as { window?: { start: number; end: number }; cues: { id: string; start: number; end: number }[]; treatment: { shots: { id: string; template: string }[]; cues: { cueId: string; shot: string; world?: { set?: string } }[] } };
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    try {
      await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, async (route) => { const font = await getFont(route.request().url(), route.request().headers()['user-agent'] ?? ''); return font ? route.fulfill({ body: font.body, contentType: font.type }) : route.continue(); });
      const rel = relative(ROOT, jobFile);
      await page.goto(`http://127.0.0.1:${(server.address() as { port: number }).port}/${relative(ROOT, work)}/render.html?job=/${rel.startsWith('..') ? `@abs${jobFile}` : rel}`);
      await page.waitForSelector('body[data-ready="1"]', { timeout: 300000 });
    } catch (e) {
      console.log(`skip ${relative(ROOT, jobFile)}: did not load (${(e as Error).message.split('\n')[0]})`);
      await page.close();
      continue;
    }
    // (the template, and a world's set family, each line is laid in)
    const kindOf = new Map(job.treatment.cues.map((c) => [c.cueId, `${job.treatment.shots.find((s) => s.id === c.shot)?.template ?? '?'}${c.world?.set ? `:${c.world.set.split('/')[0]}` : ''}`]));
    const win = job.window ?? { start: -Infinity, end: Infinity };
    const misses: { t: number; id: string; kind: string; px: number; g: Rect; boxes: Rect[] }[] = [];
    for (const c of job.cues.filter((x) => x.end > Math.max(lo, win.start) && x.start < Math.min(hi, win.end))) {
      for (let k = 0; k < n; k++) {
        const t = +(Math.max(c.start, win.start) + 0.35 + ((Math.min(c.end, win.end) - Math.max(c.start, win.start) - 0.45) * k) / Math.max(1, n - 1)).toFixed(3);
        const r = (await page.evaluate(`window.vjFrame(${t}).then(() => ({ glyphs: window.vjGlyphs(), boxes: window.vjLineBoxes(${t}) }))`)) as { glyphs: { id: string; glyphs: (Rect & { a: number; preview?: boolean })[] }[]; boxes: { id: string; rect: Rect }[] };
        for (const line of r.glyphs) {
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
            misses.push({ t, id: line.id === 'signature' ? `signature@${c.id}` : line.id, kind, px: Math.round(px), g: cg, boxes });
          }
        }
      }
    }
    await page.close();
    const worst = new Map<string, (typeof misses)[number] & { n: number }>();
    for (const m of misses) { const w = worst.get(m.id); if (!w || m.px > w.px) worst.set(m.id, { ...m, n: (w?.n ?? 0) + 1 }); else w.n++; }
    for (const w of [...worst.values()].sort((x, y) => y.px - x.px).slice(0, 6)) console.log(`miss ${relative(ROOT, jobFile)} ${w.id} (${w.kind}): ${w.n} glyphs past the box, worst ${w.px === Infinity ? 'no box at all' : `${w.px} px`} at ${w.t} s (glyph ${r0(w.g)}; boxes ${w.boxes.map(r0).join(' ')})`);
    total += misses.length;
    if (misses.length) failed++;
  }
  for (const [k, v] of [...byTemplate].sort()) console.log(`template ${k}: ${v.glyphs} glyphs, ${v.misses} past the box${v.misses ? `, worst ${v.worst === Infinity ? 'no box' : `${Math.round(v.worst)} px`}` : ''}`);
  console.log(`linebox audit: ${jobFiles.length} jobs, ${failed} with glyphs past their line's box, ${total} glyphs past it by more than ${SLACK} px`);
  await browser.close();
  server.close();
  process.exit(total ? 1 : 0);
}
