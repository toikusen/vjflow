// The style picker's thumbnails: a real frame of each style, made by the page itself from a sample lyric written for
// this, so no song's words ship in the app. Takes the frame with the type's largest share among a few reading moments,
// and writes it under public/free-styles as small WebP (under 30 KB).
// Needs the dev page: ng serve --port 4399 with /free; npx tsx scripts/lyric-vj/free-thumbs.mts [--url u] [id ...]
import { mkdirSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';

const { values: a, positionals: only } = parseArgs({ allowPositionals: true, options: { url: { type: 'string', default: 'http://127.0.0.1:4399/free' } } });
const OUT = 'public/free-styles';
const LYRICS = '夜色慢慢落下來\n我們還在路上走\n把昨天留給風吧\n今晚不要回頭\n一起唱到天亮\n光就在前面';
const MAX_BYTES = 30000;
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
await page.addInitScript('window.__name = (f) => f');
await page.goto(a.url!);
await page.waitForFunction(() => (window as never as { vjFree?: unknown }).vjFree);
const ids: string[] = only.length ? only : await page.evaluate(() => (window as any).vjFree.styles.map((s: { id: string }) => s.id));
await page.evaluate((text) => (window as any).vjFree.lrc.set(text), LYRICS);
for (const id of ids) {
  const shot = await page.evaluate(async ({ id, max }) => {
    const f = (window as any).vjFree;
    f.styleId.set(id);
    await f.generate();
    await f.player.settled;
    const pl = f.player;
    pl.pause();
    pl.stop();
    const e = pl.engine;
    const small = Object.assign(document.createElement('canvas'), { width: 320, height: 180 });
    const g = small.getContext('2d', { willReadFrequently: true })!;
    const read = () => { g.drawImage(pl.canvas, 0, 0, 320, 180); return g.getImageData(0, 0, 320, 180).data.slice(); };
    let best = { share: -1, t: 0 };
    for (const c of f.job.cues) {
      const t = c.start + 0.7 * (c.end - c.start);
      await e.renderAt(t); await e.renderAt(t);
      const on = read();
      e.textRoot.visible = false;
      await e.renderAt(t);
      const off = read();
      e.textRoot.visible = true;
      let n = 0;
      for (let i = 0; i < on.length; i += 4) if (Math.abs(on[i] - off[i]) + Math.abs(on[i + 1] - off[i + 1]) + Math.abs(on[i + 2] - off[i + 2]) > 60) n++;
      if (n > best.share) best = { share: n, t };
    }
    await e.renderAt(best.t); await e.renderAt(best.t);
    g.drawImage(pl.canvas, 0, 0, 320, 180);
    for (let q = 0.7; q > 0.1; q -= 0.1) {
      const url = small.toDataURL('image/webp', q);
      if (url.length * 0.75 < max) return { url, share: best.share, t: best.t, q };
    }
    return { url: '', share: 0, t: 0, q: 0 };
  }, { id, max: MAX_BYTES });
  if (!shot.url) throw new Error(`${id}: no thumbnail under ${MAX_BYTES} bytes`);
  const bytes = Buffer.from(shot.url.split(',')[1], 'base64');
  writeFileSync(`${OUT}/${id}.webp`, bytes);
  console.log(`${id} ${bytes.length} bytes, frame ${shot.t.toFixed(1)} s, type ${shot.share} px`);
}
await browser.close();
