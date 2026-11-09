// The renderer's own measure, read in the renderer's own browser (Playwright's Chromium, the self-hosted faces of
// fonts.ts): each character's advance at size 100 in a family at the weight the world layout measures with
// (world-layout measureOf: nearestWeight(family, 700)), exactly as glyphs.ts advanceOf takes it. Shared by the advance
// table (advance-table.mts) and the checks that compare the plan's measure with the real one (q1 phase 3c).
import { existsSync, createReadStream } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve } from 'node:path';
import { fontSlug, nearestWeight } from '../../src/app/lyric-vj/fonts';

/** Opens a page with every self-hosted face; `advances(family, chars)` gives each character's advance at size 100. */
export async function realAdvances() {
  const { chromium } = await import('playwright');
  const ROOT = process.cwd();
  const server = createServer((req, res) => {
    const asked = decodeURIComponent(new URL(req.url!, 'http://x').pathname);
    if (asked === '/') return void res.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html><meta charset="utf-8"><body></body>');
    const path = join(ROOT, 'out', asked);
    if (!asked.startsWith('/fonts/') || !existsSync(path)) return void res.writeHead(404).end();
    res.writeHead(200, { 'content-type': { '.css': 'text/css', '.woff2': 'font/woff2' }[extname(path)] ?? 'application/octet-stream' });
    createReadStream(path).pipe(res);
  }).listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  // (the render's own browser and flags: render.mts)
  const browser = await chromium.launch({ channel: 'chromium', args: ['--force-device-scale-factor=1', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${(server.address() as { port: number }).port}/`);
  const loaded = new Set<string>();
  const advances = async (family: string, chars: string[]): Promise<number[]> => {
    if (!existsSync(resolve(ROOT, 'out/fonts', `${fontSlug(family)}.css`))) throw new Error(`no self-hosted face for ${family}`);
    if (!loaded.has(family)) {
      // (string scripts: tsx names its functions with a helper the page does not have)
      await page.evaluate(`new Promise((ok, bad) => { const l = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: ${JSON.stringify(`/fonts/${fontSlug(family)}.css`)}, onload: () => ok(), onerror: bad }); document.head.append(l); })`);
      loaded.add(family);
    }
    const font = `${nearestWeight(family, 700)} 100px "${family}"`;
    // (a face split by unicode-range loads only the slices asked for: every character is asked for before measuring)
    return page.evaluate(`(async () => {
      const font = ${JSON.stringify(font)}, chars = ${JSON.stringify(chars)};
      for (let i = 0; i < chars.length; i += 400) await document.fonts.load(font, chars.slice(i, i + 400).join(''));
      const ctx = document.createElement('canvas').getContext('2d');
      ctx.font = font;
      return chars.map((c) => ctx.measureText(c).width);
    })()`) as Promise<number[]>;
  };
  const close = async () => { await browser.close(); server.close(); };
  return { advances, close };
}
