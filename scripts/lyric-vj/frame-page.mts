// The render page a frame check reads (the reading gate's own: render page + gate-page.mts), opened once and shared by
// the job checks that look at frames (measure-world-events.mts --frames, q1-calib.mts). No video written.
import { copyFileSync, createReadStream, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, relative, resolve } from 'node:path';

/** One frame, grey at the check's size: with the words, without them (carriers kept), and with the carriers gone too. */
export interface FrameLayers { on: number[]; off: number[]; bare: number[]; jpeg?: string }

/** Opens the page: `job(key, job)` loads a render job and gives its frames; `close()` ends it all. */
export async function framePage(work = '.frame-page-work') {
  const esbuild = await import('esbuild');
  const { chromium } = await import('playwright');
  const { fontCache } = await import('./font-cache.mts');
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
  const job = async (key: string, j: unknown) => {
    const file = join(work, `${key}.job.json`);
    writeFileSync(file, JSON.stringify({ ...(j as object), live: true }));
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.addInitScript({ path: join(work, 'gate-page.js') });
    await page.addInitScript('window.__carriers = true');
    await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, async (route) => {
      const font = await getFont(route.request().url(), route.request().headers()['user-agent'] ?? '');
      return font ? route.fulfill({ body: font.body, contentType: font.type, headers: { 'access-control-allow-origin': '*' } }) : route.abort();
    });
    await page.goto(`http://127.0.0.1:${(server.address() as { port: number }).port}/${relative(ROOT, resolve(work))}/render.html?job=/${relative(ROOT, resolve(file))}`);
    await page.waitForSelector('body[data-ready="1"]', { timeout: 200000 });
    return {
      /** Each line's readable window as the engine computes it (the reading gate's). */
      cues: () => page.evaluate(() => window.vjMetrics().cues.map((c) => ({ id: c.id, from: c.readableFrom, to: c.readableTo }))) as Promise<{ id: string; from: number; to: number }[]>,
      /** The engine's own record of each line (vjMetrics): a composer line it floored to plain rows says so (`floored`). */
      metrics: () => page.evaluate('window.vjMetrics().cues') as Promise<{ id: string; floored?: boolean; restSize?: number; template?: string }[]>,
      layers: (t: number, gw: number, gh: number, jpeg = false) => page.evaluate(`window.gatePage.layers(${t}, ${gw}, ${gh}, ${jpeg})`) as Promise<FrameLayers>,
      close: async () => { await page.close(); rmSync(file, { force: true }); },
    };
  };
  const close = async () => { await browser.close(); server.close(); rmSync(work, { recursive: true, force: true }); };
  return { job, close };
}
