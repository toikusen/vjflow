// Covers for songs made before the song page saved one: one frame of the free video the song page would open with (its
// recommended style, first version) at the cover moment (cover-moment.ts), rendered by the offline render page in
// headless Chromium, 480×270 JPEG, written as songs/<id>/cover.jpg. The list reads a cover's time from its file, so
// db.json is never written (a running server keeps its own copy of it).
// npx tsx --tsconfig tsconfig.json scripts/lyric-vj/beta/covers-backfill.mts [--root out/beta] [--apply]
//   Without --apply it only lists what it would do. Songs still being prepared (no song.json) are skipped: their
//   draft needs the upload decoded in a browser; the song page covers them when opened.
import { createReadStream, existsSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';
import { coverMoment } from '../../../src/app/lyric-vj/cover-moment';
import type { SongTimeline } from '../../../src/app/lyric-vj/timeline';
import { songDir, type Db, type Song } from './store.mts';

const COVER = 'cover.jpg';
const [WIDTH, HEIGHT, QUALITY] = [480, 270, 0.8];

export interface BackfillItem { song: Pick<Song, 'id' | 'title'>; action: 'render' | 'skip'; why?: string }

/** What the backfill would do for each song of a root: render a cover, or skip it and why. Deleted songs are left out. */
export function backfillPlan(root: string, db: Pick<Db, 'songs'>): BackfillItem[] {
  return db.songs
    .filter((s) => !s.deletedAt)
    .map((s): BackfillItem => {
      const dir = songDir(root, s.id);
      const song = { id: s.id, title: s.title };
      if (existsSync(join(dir, COVER))) return { song, action: 'skip', why: '已有封面' };
      if (!existsSync(join(dir, 'song.json'))) return { song, action: 'skip', why: '還在準備中（沒有 song.json）' };
      const timeline = readTimeline(join(dir, 'song.json'));
      if (!timeline || coverMoment(timeline.cues ?? [], timeline.sections ?? []) === undefined) return { song, action: 'skip', why: '沒有可用的歌詞時間' };
      return { song, action: 'render' };
    });
}

const readTimeline = (file: string) => {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as SongTimeline;
  } catch {
    return undefined;
  }
};

async function render(root: string, items: BackfillItem[]) {
  const cwd = process.cwd();
  const [{ freeJob }, { FREE_STYLES, recommendStyle }, esbuild, { chromium }] = await Promise.all([
    import('../../../src/app/lyric-vj/free-plan'),
    import('../../../src/app/lyric-vj/free-styles'),
    import('esbuild'),
    import('playwright'),
  ]);
  const work = mkdtempSync(join(tmpdir(), 'covers-'));
  await esbuild.build({ entryPoints: ['src/app/lyric-vj/render/main.ts'], bundle: true, format: 'esm', target: 'es2022', outfile: join(work, 'render.js'), logLevel: 'warning' });
  const jobs = new Map<string, string>();
  const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
  // the render page and its job from here; the self-hosted fonts from out/fonts at /fonts/ (as render.mts); anything
  // else the page asks for from the worktree
  const server = createServer((req, res) => {
    const asked = decodeURIComponent(new URL(req.url!, 'http://x').pathname);
    if (asked === '/render.html') return void res.writeHead(200, { 'content-type': 'text/html' }).end(readFileSync('scripts/lyric-vj/render.html'));
    if (asked === '/render.js') return void res.writeHead(200, { 'content-type': 'text/javascript' }).end(readFileSync(join(work, 'render.js')));
    const job = /^\/job\/([\w-]+)\.json$/.exec(asked);
    if (job && jobs.has(job[1])) return void res.writeHead(200, { 'content-type': 'application/json' }).end(jobs.get(job[1]));
    const path = resolve(cwd, '.' + (asked.startsWith('/fonts/') ? '/out' + asked : asked));
    if (!path.startsWith(cwd + sep) || !existsSync(path) || !statSync(path).isFile()) return void res.writeHead(404).end();
    res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' });
    createReadStream(path).pipe(res);
  }).listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const browser = await chromium.launch({ channel: 'chromium', args: ['--force-device-scale-factor=1', '--ignore-gpu-blocklist'] });
  let made = 0;
  try {
    for (const { song } of items.filter((i) => i.action === 'render')) {
      const dir = songDir(root, song.id);
      const timeline = readTimeline(join(dir, 'song.json'))!;
      // the picture the song page opens with when its person has picked nothing: the recommended style, version 0
      const style = FREE_STYLES.find((s) => s.id === recommendStyle(timeline))!;
      const { job } = freeJob(timeline, { style, seed: 0 });
      const t = coverMoment(job.cues, timeline.sections ?? [])!;
      jobs.set(song.id, JSON.stringify({ ...job, live: true }));
      const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
      try {
        page.on('pageerror', (e) => console.error(`  page error: ${e.message.slice(0, 200)}`));
        await page.goto(`${base}/render.html?job=/job/${song.id}.json`);
        await page.waitForSelector('body[data-ready="1"]', { timeout: 120_000 });
        const bytes = await page.evaluate(
          async ([at, w, h, q]) => {
            // (a jump lands before the line there is built: the second frame has it)
            await window.renderAt(at);
            await window.renderAt(at);
            const small = new OffscreenCanvas(w, h);
            const ctx = small.getContext('2d', { alpha: false })!;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(document.getElementById('stage') as HTMLCanvasElement, 0, 0, w, h);
            return [...new Uint8Array(await (await small.convertToBlob({ type: 'image/jpeg', quality: q })).arrayBuffer())];
          },
          [t, WIDTH, HEIGHT, QUALITY] as const,
        );
        // written aside and moved in, so the server never serves half a picture; a cover saved meanwhile is kept
        if (existsSync(join(dir, COVER))) continue;
        const tmp = join(dir, `.cover-backfill.jpg`);
        writeFileSync(tmp, Buffer.from(bytes));
        renameSync(tmp, join(dir, COVER));
        made++;
        console.log(`  ✓ ${song.id} ${song.title} · ${style.name} · ${t.toFixed(1)} s · ${(bytes.length / 1024).toFixed(0)} KB`);
      } catch (e) {
        console.error(`  ✗ ${song.id} ${song.title}: ${(e as Error).message.split('\n')[0]}`);
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
    server.close();
    rmSync(work, { recursive: true, force: true });
  }
  return made;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { values: a } = parseArgs({ options: { root: { type: 'string', default: 'out/beta' }, apply: { type: 'boolean', default: false } } });
  const root = resolve(a.root!);
  const db = JSON.parse(readFileSync(join(root, 'db.json'), 'utf8')) as Db;
  const plan = backfillPlan(root, db);
  for (const i of plan) console.log(`${i.action === 'render' ? '要做' : '略過'}  ${i.song.id}  ${i.song.title}${i.why ? `（${i.why}）` : ''}`);
  const todo = plan.filter((i) => i.action === 'render').length;
  if (!a.apply) console.log(`\n${todo} 首要做封面（試跑，沒有寫入；加 --apply 才會寫）`);
  else console.log(`\n寫入 ${await render(root, plan)} / ${todo} 張封面`);
}
