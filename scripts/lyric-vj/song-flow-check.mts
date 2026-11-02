// Drives the real song page in headless Chrome against a seeded test server (never out/beta; the seed and a stubbed queue
// are in out/research/song-flow/seed.mts): the instant flow, read-only and unconfirmed states, a phone, the paid form, /free.
// npx tsx scripts/lyric-vj/song-flow-check.mts --out <dir> [--base http://127.0.0.1:4398] [--tokens out/research/song-flow/tokens.json] [--stub out/research/song-flow/stub-commands.log] [--only a,b,...]
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

const { values: a } = parseArgs({ options: { out: { type: 'string' }, base: { type: 'string', default: 'http://127.0.0.1:4398' }, tokens: { type: 'string', default: 'out/research/song-flow/tokens.json' }, stub: { type: 'string', default: 'out/research/song-flow/stub-commands.log' }, only: { type: 'string', default: '' } } });
const out = resolve(a.out!);
mkdirSync(out, { recursive: true });
const tokens = JSON.parse(readFileSync(a.tokens!, 'utf8')) as Record<'owner' | 'admin' | 'broke', string>;
const report: Record<string, unknown> = {};
const failures: string[] = [];
const check = (name: string, ok: boolean, detail?: unknown) => {
  report[name] = detail === undefined ? ok : { ok, detail };
  if (!ok) failures.push(name);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail === undefined ? '' : ` ${JSON.stringify(detail)}`}`);
};
const browser: Browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const steps = a.only ? a.only.split(',') : ['states', 'flow', 'admin', 'phone', 'broke', 'free', 'paid', 'busy', 'full'];
const wanted = (s: string) => steps.includes(s);

type Stage = { seed: () => number | undefined; styleId: () => string; busy: () => string; ready: () => boolean; player?: { canvas?: HTMLCanvasElement; playing: boolean; time: () => number }; audio: HTMLAudioElement; job?: { cues: { start: number }[] } };
const stage = <T,>(p: Page, f: (s: Stage) => T) => p.evaluate(`(${f.toString()})(ng.getComponent(document.querySelector('app-instant-stage')))`) as Promise<T>;
const idle = (p: Page) => p.waitForFunction(() => !(window as never as { ng: { getComponent: (e: Element) => { busy: () => string } } }).ng.getComponent(document.querySelector('app-instant-stage')!).busy(), undefined, { timeout: 120000 });
const shot = (p: Page, name: string, fullPage = false) => p.screenshot({ path: join(out, `${name}.png`), fullPage });

const session = async (who: keyof typeof tokens, options: Parameters<Browser['newContext']>[0] = { viewport: { width: 1440, height: 900 } }) => {
  const ctx: BrowserContext = await browser.newContext({ acceptDownloads: true, ...options });
  const page = await ctx.newPage();
  await page.addInitScript('window.__name = (f) => f');
  const errors: string[] = [];
  const writes: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  page.on('request', (r) => { if (r.method() !== 'GET' && !r.url().includes('/@')) writes.push(`${r.method()} ${r.url()}`); });
  await page.goto(`${a.base}/beta/login?t=${tokens[who]}`);
  return { ctx, page, errors, writes };
};
const me = (p: Page) => p.evaluate(async () => (await fetch('/beta/me')).json()) as Promise<{ spentUsd: number; limitUsd: number; admin: boolean }>;
const pictureHash = async (p: Page) => createHash('sha1').update(await p.locator('.frame').screenshot()).digest('hex').slice(0, 10);

if (wanted('states')) {
  const { ctx, page, errors } = await session('owner');
  await page.goto(`${a.base}/my/song?id=unconfirmed`);
  await page.waitForSelector('.callout');
  check('unconfirmed: says what is needed, links the editor, no flow', /檢查後確認/.test(await page.locator('.callout').innerText()) && (await page.locator('.callout a').getAttribute('href')) === '/timing?beta=unconfirmed' && !(await page.locator('app-song-flow').count()));
  await shot(page, '11-unconfirmed');
  await page.goto(`${a.base}/my/song?id=preparing`);
  await page.waitForSelector('.progress-card');
  check('preparing: says what comes next, no flow', /確認每句歌詞的時間/.test(await page.locator('.progress-card').innerText()) && !(await page.locator('app-song-flow').count()));
  await shot(page, '12-preparing');
  await page.goto(`${a.base}/my`);
  await page.waitForSelector('.card');
  await shot(page, '13-list');
  check('states page errors', !errors.length, errors);
  await ctx.close();
}

if (wanted('flow')) {
  const { ctx, page, errors, writes } = await session('owner');
  await page.goto(`${a.base}/my/song?id=ready`);
  await page.waitForSelector('app-song-flow');
  const before = await me(page);
  await shot(page, '01-song-empty');
  await shot(page, '01-song-empty-whole', true);
  check('flow is above the paid part', await page.evaluate(() => { const f = document.querySelector('app-song-flow')!, m = document.querySelector('app-make-form')!; return !!(f.compareDocumentPosition(m) & Node.DOCUMENT_POSITION_FOLLOWING); }));
  await page.getByRole('button', { name: '立即生成' }).click();
  await page.waitForSelector('.frame canvas', { timeout: 120000 });
  await idle(page);
  await page.waitForTimeout(2500);
  const started = await stage(page, (s) => ({ t: s.audio.currentTime, src: s.audio.src, paused: s.audio.paused, first: s.job!.cues[0].start }));
  check('generate plays the song\'s own audio from the first line', !started.paused && started.src.endsWith('/beta/songs/ready/audio/mix') && started.t >= started.first - 1.1, started);
  await shot(page, '02-generated');
  await page.locator('.seek').evaluate((el: HTMLInputElement) => { el.value = '45'; el.dispatchEvent(new Event('input')); });
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: '暫停' }).click();
  await page.waitForTimeout(300);
  const seed0 = await stage(page, (s) => s.seed());
  const hash0 = await pictureHash(page);
  await page.getByRole('button', { name: '換一版' }).click();
  await idle(page);
  await page.waitForTimeout(800);
  const seed1 = await stage(page, (s) => s.seed());
  const hash1 = await pictureHash(page);
  check('reroll changes the version and the picture', seed1 === (seed0 ?? 0) + 1 && hash0 !== hash1, { seed0, seed1, hash0, hash1 });
  await shot(page, '03-rerolled');
  const card = page.locator('app-style-picker .card').nth(3);
  const style = await card.locator('strong').innerText();
  await card.scrollIntoViewIfNeeded();
  await card.click();
  await idle(page);
  await page.waitForTimeout(1500);
  const hash2 = await pictureHash(page);
  const styleId = await stage(page, (s) => s.styleId());
  check('style change shows at once', !!styleId && hash2 !== hash1, { style, styleId, hash2 });
  await shot(page, '04-style');
  await page.getByRole('button', { name: '匯出 720p 影片' }).click();
  const done = page.locator('.done a');
  await done.waitFor({ timeout: 300000 });
  await shot(page, '05-exported');
  const note = await page.locator('.done').innerText();
  const [download] = await Promise.all([page.waitForEvent('download'), done.click()]);
  const mp4 = join(out, 'export.mp4');
  await download.saveAs(mp4);
  const streams = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,duration,width,height', '-of', 'json', mp4]).toString()).streams as { codec_type: string; codec_name: string; duration: string; width?: number; height?: number }[];
  const v = streams.find((s) => s.codec_type === 'video'), au = streams.find((s) => s.codec_type === 'audio');
  const volume = (from: number, to: number) => /mean_volume: ([-\d.]+|-inf)/.exec(spawnSync('ffmpeg', ['-hide_banner', '-ss', String(from), '-to', String(to), '-i', mp4, '-af', 'volumedetect', '-vn', '-f', 'null', '-'], { encoding: 'utf8' }).stderr)?.[1];
  const sung = volume(30, 40), tail = volume(62.1, 63.4);
  check('export is 720p with the song and the 1.5 s credit', v?.height === 720 && Math.abs(Number(v?.duration) - 63.5) < 0.1 && !!au && Number(sung) > -40 && (tail === undefined || tail === '-inf' || Number(tail) < -70), { name: download.suggestedFilename(), note, streams, sung, tail });
  for (const [t, n] of [[61.5, 'song-end'], [62.1, 'credit-in'], [62.8, 'credit'], [63.4, 'credit-out']] as const) execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(t), '-i', mp4, '-frames:v', '1', join(out, `frame-${n}.png`)]);
  check('nothing but GETs in the whole flow', !writes.length, writes);
  const after = await me(page);
  check('no credit spent', after.spentUsd === before.spentUsd, { before: before.spentUsd, after: after.spentUsd });
  await page.reload();
  await page.waitForSelector('app-song-flow');
  await page.waitForTimeout(500);
  check('style and version come back on return', (await stage(page, (s) => s.styleId())) === styleId && (await stage(page, (s) => s.seed())) === seed1);
  check('no page errors', !errors.length, errors);
  await ctx.close();
}

if (wanted('admin')) {
  const { ctx, page, errors, writes } = await session('admin');
  await page.goto(`${a.base}/my/song?id=ready`);
  await page.waitForSelector('.read-only');
  check('admin on someone else\'s song: no flow, no paid form', !(await page.locator('app-song-flow').count()) && !(await page.locator('app-make-form').count()) && !(await page.getByRole('button', { name: '立即生成' }).count()));
  check('admin says why', /只能檢視/.test(await page.locator('.read-only').innerText()));
  await shot(page, '10-admin-readonly');
  await page.goto(`${a.base}/my/song?id=unconfirmed`);
  await page.waitForSelector('.callout');
  check('admin is not promised a free video', !/免費/.test(await page.locator('.callout').innerText()));
  check('admin wrote nothing', !writes.length, writes);
  check('admin page errors', !errors.length, errors);
  await ctx.close();
}

if (wanted('phone')) {
  const { ctx, page, errors, writes } = await session('owner', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  await page.goto(`${a.base}/my/song?id=ready`);
  await page.waitForSelector('app-song-flow');
  await shot(page, '20-phone-empty');
  await page.getByRole('button', { name: '立即生成' }).tap();
  await page.waitForSelector('.frame canvas', { timeout: 120000 });
  await idle(page);
  await page.waitForTimeout(2000);
  await shot(page, '21-phone-generated');
  await shot(page, '21-phone-whole', true);
  check('phone: no sideways page', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]));
  const box = await page.getByRole('button', { name: '匯出 720p 影片' }).boundingBox();
  check('phone: export reachable and big enough', !!box && box.height >= 40, box);
  check('phone: nothing but GETs', !writes.length, writes);
  check('phone page errors', !errors.length, errors);
  await ctx.close();
}

if (wanted('broke')) {
  const { ctx, page, errors, writes } = await session('broke');
  await page.goto(`${a.base}/my/song?id=broke`);
  await page.waitForSelector('app-song-flow');
  await page.locator('app-style-picker .card').first().click();
  await page.waitForSelector('.frame canvas', { timeout: 120000 });
  await idle(page);
  check('a style picked first generates by itself', !!(await stage(page, (s) => s.styleId())));
  check('no balance still makes a video', !!(await stage(page, (s) => s.ready())) && !(await page.locator('app-instant-stage .error').count()));
  check('no balance: paid form still says why not', /餘額不足/.test(await page.locator('app-make-form').innerText()));
  check('broke writes and errors', !writes.length && !errors.length, { writes, errors });
  await ctx.close();
}

if (wanted('free')) {
  const { ctx, page, errors } = await session('owner');
  await page.goto(`${a.base}/free`);
  await page.waitForFunction(() => (window as never as { vjFree?: unknown }).vjFree);
  await page.locator('textarea').fill(['第一句歌詞在這裡', '第二句跟著出現', '第三句慢慢消失', '第四句留在心裡', '第五句回到開頭', '第六句再唱一次'].join('\n'));
  await page.waitForSelector('.frame canvas', { timeout: 120000 });
  await page.waitForFunction(() => !(window as never as { vjFree: { busy: () => string } }).vjFree.busy());
  await page.waitForTimeout(1000);
  await shot(page, '30-free');
  const s0 = await page.evaluate(() => (window as never as { vjFree: { seed: () => number } }).vjFree.seed());
  await page.getByRole('button', { name: '換一版' }).click();
  await page.waitForFunction(() => !(window as never as { vjFree: { busy: () => string } }).vjFree.busy());
  const s1 = await page.evaluate(() => (window as never as { vjFree: { seed: () => number } }).vjFree.seed());
  await page.locator('app-style-picker .card').nth(2).click();
  await page.waitForFunction(() => !(window as never as { vjFree: { busy: () => string } }).vjFree.busy());
  await page.waitForTimeout(800);
  await shot(page, '31-free-style');
  check('/free still generates, rerolls, restyles on the shared stage', s1 === (s0 ?? 0) + 1, { s0, s1 });
  check('/free page errors', !errors.length, errors);
  await ctx.close();
}

if (wanted('paid')) {
  const { ctx, page, errors, writes } = await session('owner');
  await page.goto(`${a.base}/my/song?id=ready`);
  await page.waitForSelector('app-song-flow');
  const before = await me(page);
  await page.getByRole('button', { name: '看付費方案' }).click();
  await page.waitForTimeout(900);
  const tier = page.locator('app-make-form .tier').nth(1);
  check('one click reaches the paid tiers', await tier.isVisible() && await page.evaluate(() => { const r = document.querySelector('app-make-form .tier')!.getBoundingClientRect(); return r.top >= 0 && r.top < innerHeight; }));
  await shot(page, '40-paid');
  await tier.click();
  const [post] = await Promise.all([
    page.waitForRequest((r) => r.method() === 'POST' && r.url().endsWith('/make')),
    (async () => {
      await page.locator('app-make-form .go').click();
      await shot(page, '41-paid-confirm');
      await page.locator('app-make-form dialog .button.primary').click();
    })(),
  ]);
  const body = post.postDataJSON();
  check('產生概念 posts the same request as before', JSON.stringify(body) === JSON.stringify({ tier: 'img', refs: [] }), { url: post.url(), body });
  await page.waitForSelector('.progress-card', { timeout: 15000 });
  await shot(page, '42-paid-queued');
  const jobs = (await page.evaluate(async () => (await fetch('/beta/jobs')).json())) as { kind: string; tier?: string; songId: string; priceUsd?: number; status: string }[];
  const concept = jobs.find((j) => j.kind === 'concept' && j.songId === 'ready');
  check('the concept job stands at its price', concept?.tier === 'img' && concept.priceUsd === 2.5, concept);
  const after = await me(page);
  check('paid charges the concept only', Math.abs(after.spentUsd - before.spentUsd - 2.5) < 1e-9, { before: before.spentUsd, after: after.spentUsd });
  check('only the make was written', writes.length === 1, writes);
  check('paid page errors', !errors.length, errors);
  await ctx.close();
  report['stub'] = existsSync(a.stub!) ? readFileSync(a.stub!, 'utf8') : '(none)';
}

if (wanted('busy')) {
  // the paid step above left a concept running on this song: the flow does not wait for it, and the editor stays locked
  const { ctx, page, errors, writes } = await session('owner');
  await page.goto(`${a.base}/my/song?id=ready`);
  await page.waitForSelector('.progress-card');
  await page.getByRole('button', { name: '立即生成' }).click();
  await page.waitForSelector('.frame canvas', { timeout: 120000 });
  await idle(page);
  check('flow works while a paid job runs', !!(await stage(page, (s) => s.ready())) && !writes.length, writes);
  await shot(page, '50-while-paid-runs');
  await page.locator('app-song-flow a.timing').click();
  await page.waitForURL(/\/timing\?beta=ready/);
  await page.waitForTimeout(6500);
  await shot(page, '51-timing-locked');
  check('timing editor keeps its lock', await page.locator('.wave.locked').count() === 1);
  check('busy page errors', !errors.length, errors);
  await ctx.close();
}

if (wanted('full')) {
  const { ctx, page, errors, writes } = await session('owner');
  await page.goto(`${a.base}/my/song?id=full`);
  await page.waitForSelector('app-song-flow');
  const t0 = Date.now();
  await page.getByRole('button', { name: '立即生成' }).click();
  await page.waitForSelector('.frame canvas', { timeout: 120000 });
  await idle(page);
  const firstFrame = Date.now() - t0;
  await page.getByRole('button', { name: '暫停' }).click();
  const t1 = Date.now();
  await page.getByRole('button', { name: '匯出 720p 影片' }).click();
  const done = page.locator('.done a');
  await done.waitFor({ timeout: 590000 });
  const exportMs = Date.now() - t1;
  const [download] = await Promise.all([page.waitForEvent('download'), done.click()]);
  const mp4 = join(out, 'export-full.mp4');
  await download.saveAs(mp4);
  const streams = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,duration', '-of', 'json', mp4]).toString()).streams as { codec_type: string; duration: string }[];
  check('whole song exports with sound', streams.length === 2 && Math.abs(Number(streams[0].duration) - 296.5) < 0.2, { firstFrame, exportMs, streams, note: await page.locator('.done').innerText() });
  check('full writes and errors', !writes.length && !errors.length, { writes, errors });
  await ctx.close();
}

await browser.close();
writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 1));
console.log(failures.length ? `FAILED: ${failures.join(', ')}` : 'all passed');
process.exit(failures.length ? 1 : 0);
