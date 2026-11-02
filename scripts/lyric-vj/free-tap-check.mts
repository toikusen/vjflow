// Drives the real /free page in headless Chrome: picks an audio file, pastes lyrics, sets lines in the timing editor with
// key presses, closes it, seeks the video to the new times, reloads and picks the file again. Then the same on a
// phone-sized screen with the big button. Needs ng serve; spends nothing, and nothing is sent to the page's servers.
// --mock-lookup answers the lyric search here, with a hostile entry among the results; without it the search is live.
// npx tsx scripts/lyric-vj/free-tap-check.mts --out <dir> [--base http://127.0.0.1:4399] [--id yt_b3GCfyNKeLs] [--to 60] [--mock-lookup]
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium, type Page } from 'playwright';

const { values: a } = parseArgs({ options: { out: { type: 'string' }, base: { type: 'string', default: 'http://127.0.0.1:4399' }, id: { type: 'string', default: 'yt_b3GCfyNKeLs' }, to: { type: 'string' }, 'mock-lookup': { type: 'boolean' } } });
const out = resolve(a.out!);
mkdirSync(out, { recursive: true });
const song = JSON.parse(readFileSync(`out/db/${a.id}/song.json`, 'utf8'));
const audioFile = resolve(`out/db/${a.id}/mix.mp3`);
const cues = song.cues as { start: number; end: number; text: string }[];
const lyrics = cues.map((c) => c.text).join('\n');
const report: Record<string, unknown> = {};
const shot = (p: Page, name: string) => p.screenshot({ path: join(out, `${name}.png`) });

type Line = { id: string; start: number; end: number; text: string };
/** The editor's lines, playhead and selection, through Angular's dev-mode handle (its audio is not in the DOM). */
const editor = (p: Page) => p.evaluate(() => {
  const c = (window as unknown as { ng: { getComponent: (e: Element) => { cues: () => Line[]; touched: () => Set<string>; selected: () => number; audio: HTMLAudioElement } } }).ng.getComponent(document.querySelector('app-timing-page')!);
  return { cues: c.cues(), touched: [...c.touched()], selected: c.selected(), time: c.audio.currentTime, paused: c.audio.paused };
});
const seekEditor = (p: Page, t: number) => p.evaluate(async (at) => {
  const c = (window as unknown as { ng: { getComponent: (e: Element) => { audio: HTMLAudioElement } } }).ng.getComponent(document.querySelector('app-timing-page')!);
  c.audio.currentTime = at;
  await new Promise((r) => c.audio.addEventListener('seeked', r, { once: true }));
}, t);
const whenEditorAt = (p: Page, t: number) => p.waitForFunction((at) => {
  const c = (window as unknown as { ng: { getComponent: (e: Element) => { audio: HTMLAudioElement } } }).ng.getComponent(document.querySelector('app-timing-page')!);
  return c.audio.currentTime >= at;
}, t, { polling: 5 });
type Free = { song?: { cues: Line[] }; seed: () => number | undefined; styleId: () => string; lrc: () => string; marks: () => string[]; t: () => number; player?: { seek: (t: number) => void; playing: boolean }; job?: { cues: Line[] } };
const free = <T,>(p: Page, f: (x: Free) => T) => p.evaluate(`(${f.toString()})(window.vjFree)`) as Promise<T>;
const pickAudio = async (p: Page) => {
  await p.locator('input[type=file][accept="audio/*"]').setInputFiles(audioFile);
  await p.waitForFunction(() => /BPM|節拍|拍點/.test(document.querySelector('.form')?.textContent ?? ''), undefined, { timeout: 60000 });
  await p.getByRole('button', { name: '編輯歌詞時間' }).waitFor({ timeout: 60000 }).catch(() => undefined);
};
const pasteLyrics = async (p: Page, text: string) => {
  await p.locator('textarea').evaluate((el, value) => {
    const box = el as HTMLTextAreaElement;
    box.dispatchEvent(new ClipboardEvent('paste', { bubbles: true }));
    box.value = value;
    box.dispatchEvent(new Event('input', { bubbles: true }));
  }, text);
};
const openEditor = async (p: Page) => {
  await p.waitForFunction(() => !(window as unknown as { vjFree: { busy: () => string; analysing: () => boolean } }).vjFree.busy() && !(window as unknown as { vjFree: { analysing: () => boolean } }).vjFree.analysing(), undefined, { timeout: 60000 });
  await p.getByRole('button', { name: '編輯歌詞時間' }).click();
  await p.waitForSelector('app-timing-page .rows li');
};

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const errors: string[] = [];
const uploads: string[] = [];
const local: string[] = [];
const foreign: string[] = [];
const watch = (p: Page) => {
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  p.on('request', (r) => {
    if (r.method() !== 'GET' && r.method() !== 'OPTIONS') uploads.push(`${r.method()} ${r.url()}`);
    if (r.url().startsWith('data:') || r.url().startsWith('blob:')) return;
    if (r.url().includes('fonts.g')) return;
    if (!r.url().startsWith(a.base!)) foreign.push(r.url());
    else if (/^\/(beta|lyric-vj)\//.test(new URL(r.url()).pathname)) local.push(r.url());
  });
};

/** Sets `n` lines with Enter, each at the moment the real song sings it. */
async function enterLines(p: Page, from: number, n: number) {
  for (const i of Array.from({ length: n }, (_, k) => from + k)) {
    await seekEditor(p, Math.max(0, cues[i].start - 0.4));
    await whenEditorAt(p, cues[i].start + 0.12);
    await p.keyboard.press('Enter');
  }
}

// ---- desktop
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
watch(page);
await page.goto(`${a.base}/free`);
await page.waitForSelector('.page');
await shot(page, '01-start');
if (a['mock-lookup']) await page.route('https://lrclib.net/**', (route) => route.fulfill({
  contentType: 'application/json',
  headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'lrclib-client' },
  body: JSON.stringify([
    { id: 1, trackName: '<img src=x onerror="window.pwned=1">壞資料', artistName: 'x', albumName: '', duration: song.duration, instrumental: false, plainLyrics: '<script>window.pwned=1</script>', syncedLyrics: null },
    { id: 2, trackName: '世界のつづき', artistName: 'Ado', albumName: 'x', duration: song.duration, instrumental: false, plainLyrics: 'a', syncedLyrics: cues.map((c) => `[${String(Math.floor(c.start / 60)).padStart(2, '0')}:${(c.start % 60).toFixed(2).padStart(5, '0')}]${c.text}`).join('\n') },
    { id: 3, trackName: 'wrong shape', duration: 'x' }, 7,
  ]),
}));

await pickAudio(page);
await pasteLyrics(page, lyrics);
await page.waitForSelector('.frame canvas', { timeout: 120000 });
await page.waitForSelector('text=時間是估算的');
report['label'] = await page.locator('.estimate').first().innerText();
await page.waitForTimeout(1500);
report['lookupForFileName'] = { asked: [...foreign], note: await page.locator('.form .hint').allInnerTexts() };
await shot(page, '02-draft');

await page.getByPlaceholder('歌手 - 歌名').fill('Ado - 世界のつづき');
await page.waitForFunction(() => !document.querySelector('.form')?.textContent?.includes('正在查公開歌詞庫'), undefined, { timeout: 25000 }).catch(() => undefined);
await page.waitForTimeout(500);
report['lookup'] = { requests: [...foreign], offer: await page.locator('.offer').allInnerTexts(), notes: await page.locator('.form .hint').allInnerTexts(), pwned: await page.evaluate(() => 'pwned' in window) };
await shot(page, '03-offer');
if (await page.locator('.offer').count()) await page.getByRole('button', { name: '不用', exact: true }).click();

await page.locator('app-style-picker button').nth(1).click();
await page.getByRole('button', { name: '換一版' }).click();
await page.waitForFunction(() => { const f = (window as unknown as { vjFree: { busy: () => string; seed: () => number } }).vjFree; return !f.busy() && f.seed() === 1; });
const before = { seed: await free(page, (f) => f.seed()), style: await free(page, (f) => f.styleId()), starts: await free(page, (f) => f.song!.cues.map((c) => c.start)) };
report['beforeEditor'] = { seed: before.seed, style: before.style, firstStarts: before.starts.slice(0, 6) };

await openEditor(page);
await page.waitForTimeout(600);
await shot(page, '04-editor');
const opened = await editor(page);
report['editorOpened'] = { lines: opened.cues.length, seededSameAsPicture: opened.cues.every((c, i) => c.start === before.starts[i]), selected: opened.selected, keyHint: await page.locator('.key-hint').innerText(), chips: await page.locator('.counts').innerText(), peaks: await page.evaluate(() => { const cv = document.querySelector('canvas.wave') as HTMLCanvasElement; const d = cv.getContext('2d')!.getImageData(0, 0, cv.width, cv.height).data; let lit = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) lit++; return lit; }) };

// Space on the play button just clicked: one toggle, not one from the key and one from the button
await page.locator('button.play').click();
await page.waitForFunction(() => document.querySelector('button.play')?.getAttribute('aria-label') === '暫停');
await page.keyboard.press('Space');
await page.waitForTimeout(300);
report['spaceOnFocusedPlay'] = { paused: (await editor(page)).paused };
await page.keyboard.press('Space');
await page.waitForFunction(() => document.querySelector('button.play')?.getAttribute('aria-label') === '暫停');
const firstSet = 0;
await enterLines(page, firstSet, 5);
await shot(page, '05-set-5');
const after5 = await editor(page);
const off = after5.cues.slice(0, 5).map((c, i) => +(c.start - cues[i].start).toFixed(3));
report['setFive'] = { offBy: off, maxOff: Math.max(...off.map(Math.abs)), selected: after5.selected, touched: after5.touched, line6: { was: opened.cues[5].start, now: after5.cues[5].start, real: cues[5].start }, ordered: after5.cues.every((c, i) => !i || c.start > after5.cues[i - 1].start), statusLine: await page.locator('.todo').innerText() };

// a handle dragged on the waveform, and the nudge key, with the song paused
await page.locator('button.play').click();
await seekEditor(page, after5.cues[2].start);
await page.locator('li[data-index="2"] .row').click();
await page.waitForTimeout(200);
const box = (await page.locator('canvas.wave').boundingBox())!;
const view = await page.evaluate(() => { const c = (window as unknown as { ng: { getComponent: (e: Element) => { viewSec: () => number; viewStart: () => number } } }).ng.getComponent(document.querySelector('app-timing-page')!); return { sec: c.viewSec(), from: c.viewStart() }; });
const xOf = (t: number) => box.x + ((t - view.from) / view.sec) * box.width;
const dragged = after5.cues[2];
await page.mouse.move(xOf(dragged.end), box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(xOf(dragged.end) - 30, box.y + box.height / 2, { steps: 4 });
await page.mouse.up();
await page.keyboard.press('ArrowRight');
const afterDrag = await editor(page);
report['dragAndNudge'] = { endWas: dragged.end, endNow: afterDrag.cues[2].end, startWas: dragged.start, startNow: afterDrag.cues[2].start };
await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
report['undoNudge'] = (await editor(page)).cues[2].start;
await page.keyboard.press('ArrowRight');
const closing = await editor(page);
await shot(page, '06-edited');
await page.getByRole('button', { name: '完成，回到影片' }).click();
await page.waitForSelector('.frame canvas', { timeout: 120000 });
await page.waitForFunction(() => !(window as unknown as { vjFree: { busy: () => string } }).vjFree.busy());
await page.waitForFunction(() => !document.querySelector('app-timing-page'));

const applied = { seed: await free(page, (f) => f.seed()), style: await free(page, (f) => f.styleId()), cues: await free(page, (f) => f.song!.cues), job: await free(page, (f) => f.job!.cues.map((c) => c.start)) };
const moved = closing.cues.map((c, i) => Math.abs(c.start - applied.cues[i].start));
report['applied'] = { sameSeed: applied.seed === before.seed, sameStyle: applied.style === before.style, lines: applied.cues.length, maxStartChange: Math.max(...moved), first5: applied.cues.slice(0, 5).map((c) => c.start), jobFirst5: applied.job.slice(0, 5), end2: [closing.cues[2].end, applied.cues[2].end], note: await page.locator('.estimate').first().innerText(), box: (await free(page, (f) => f.lrc())).split('\n').slice(0, 3) };

// the new line on screen at its new time, and gone just before it
for (const [i, name] of [[1, '07-line2'], [4, '08-line5']] as const) {
  const line = applied.cues[i];
  await page.locator('input.seek').evaluate((el, t) => { const s = el as HTMLInputElement; s.value = String(t); s.dispatchEvent(new Event('input', { bubbles: true })); }, line.start + 0.9);
  await page.waitForTimeout(1200);
  await shot(page, name);
}
report['seekedTo'] = await free(page, (f) => f.t());
report['offerGoneOnceTimed'] = (await page.locator('.offer').count()) === 0;

await page.reload();
await page.waitForSelector('.page');
await page.waitForSelector('text=重新選擇');
report['afterReload'] = await page.locator('.form .hint').allInnerTexts();
await shot(page, '09-reloaded');
await pickAudio(page);
await page.waitForSelector('.frame canvas', { timeout: 120000 });
await page.waitForFunction(() => { const f = (window as unknown as { vjFree: { busy: () => string; analysing: () => boolean } }).vjFree; return !f.busy() && !f.analysing(); }, undefined, { timeout: 60000 });
const back = { seed: await free(page, (f) => f.seed()), style: await free(page, (f) => f.styleId()), cues: await free(page, (f) => f.song!.cues), marks: await free(page, (f) => f.marks()) };
report['restored'] = { sameSeed: back.seed === applied.seed, sameStyle: back.style === applied.style, sameCues: JSON.stringify(back.cues) === JSON.stringify(applied.cues), set: back.marks.filter((m) => m === 'set').length, guess: back.marks.filter((m) => m === 'guess').length };
await shot(page, '10-restored');
await openEditor(page);
const reopened = await editor(page);
report['reopened'] = { settled: reopened.touched, selected: reopened.selected };
await page.locator('li[data-index="1"]').screenshot({ path: join(out, '11-set-row.png') });
await page.getByRole('button', { name: '完成，回到影片' }).click();
await page.waitForSelector('.frame canvas', { timeout: 120000 });

if (a.to) {
  await page.waitForFunction(() => !(window as unknown as { vjFree: { busy: () => string } }).vjFree.busy());
  await page.evaluate((end) => (window as unknown as { vjFree: { export: (a: number, b: number) => Promise<void> } }).vjFree.export(0, end), Number(a.to));
  const link = page.locator('.done a');
  await link.waitFor({ timeout: 590000 });
  report['exportNote'] = await page.locator('.done').innerText();
  const [download] = await Promise.all([page.waitForEvent('download'), link.click()]);
  const mp4 = join(out, 'export.mp4');
  await download.saveAs(mp4);
  report['ffprobe'] = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,duration', '-of', 'json', mp4]).toString()).streams;
  report['volume'] = /mean_volume: [^\n]*/.exec(spawnSync('ffmpeg', ['-hide_banner', '-i', mp4, '-af', 'volumedetect', '-vn', '-f', 'null', '-'], { encoding: 'utf8' }).stderr)?.[0];
}
await ctx.close();

// ---- phone
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
const mob = await phone.newPage();
watch(mob);
await mob.goto(`${a.base}/free`);
await pickAudio(mob);
await pasteLyrics(mob, cues.slice(0, 12).map((c) => c.text).join('\n'));
await mob.waitForSelector('.frame canvas', { timeout: 120000 });
await shot(mob, '20-phone-form');
await openEditor(mob);
await mob.waitForTimeout(400);
await shot(mob, '21-phone-editor');
const big = mob.locator('.tap-big');
report['phoneButton'] = { height: await big.evaluate((e) => e.getBoundingClientRect().height), bottomInView: await big.evaluate((e) => e.getBoundingClientRect().bottom <= innerHeight), label: await big.innerText() };
await big.tap();
await mob.waitForFunction(() => document.querySelector('.tap-big')?.textContent?.includes('從現在開始'));
for (let i = 0; i < 5; i++) {
  await seekEditor(mob, cues[i].start - 0.3);
  await whenEditorAt(mob, cues[i].start + 0.12);
  await big.tap();
}
await mob.waitForTimeout(900);
await shot(mob, '22-phone-set');
report['phoneNextRow'] = await mob.locator('li[data-index="5"]').evaluate((e) => { const r = e.getBoundingClientRect(); const bar = document.querySelector('.tap-bar')!.getBoundingClientRect(); const head = document.querySelector('.player')!.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, barTop: bar.top, playerBottom: head.bottom }; });
const m = await editor(mob);
const mOff = m.cues.slice(0, 5).map((c, i) => +(c.start - cues[i].start).toFixed(3));
await mob.getByRole('button', { name: '復原' }).tap();
const undone = await editor(mob);
report['phone'] = { offBy: mOff, set: m.touched.length, selected: m.selected, undoLeaves: undone.touched.length, overflowX: await mob.evaluate(() => document.documentElement.scrollWidth - innerWidth) };
await mob.getByRole('button', { name: '完成，回到影片' }).tap();
await mob.waitForSelector('.frame canvas', { timeout: 120000 });
await mob.waitForFunction(() => !(window as unknown as { vjFree: { busy: () => string } }).vjFree.busy());
await mob.waitForTimeout(500);
await shot(mob, '23-phone-back');
report['phoneApplied'] = await free(mob, (f) => f.song!.cues.slice(0, 4).map((c) => c.start));

// ---- LRC stamps come first: nothing is estimated and nothing is searched; a found entry is used only when taken
const third = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const lrcPage = await third.newPage();
watch(lrcPage);
const stampOf = (t: number) => `[${String(Math.floor(t / 60)).padStart(2, '0')}:${(t % 60).toFixed(2).padStart(5, '0')}]`;
const foreignBefore = foreign.length;
await lrcPage.goto(`${a.base}/free`);
await pickAudio(lrcPage);
await lrcPage.locator('input[type=file][accept^=".lrc"]').setInputFiles({ name: 'song.lrc', mimeType: 'text/plain', buffer: Buffer.from(cues.map((c) => `${stampOf(c.start)}${c.text}`).join('\n')) });
await lrcPage.waitForSelector('.frame canvas', { timeout: 120000 });
await lrcPage.waitForTimeout(1500);
report['lrcImport'] = { label: await lrcPage.locator('.estimate').count(), asked: foreign.slice(foreignBefore), starts: (await free(lrcPage, (f) => f.song!.cues.map((c) => c.start))).slice(0, 3) };
await openEditor(lrcPage);
report['lrcInEditor'] = await lrcPage.locator('.counts').innerText();
await lrcPage.locator('li[data-index="1"]').screenshot({ path: join(out, '30-lrc-row.png') });
await third.close();

if (a['mock-lookup']) {
  const fourth = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const o = await fourth.newPage();
  watch(o);
  await o.route('https://lrclib.net/**', (route) => route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'lrclib-client' }, body: JSON.stringify([{ id: 2, trackName: '世界のつづき', artistName: 'Ado', albumName: 'x', duration: 288, instrumental: false, plainLyrics: 'a', syncedLyrics: cues.map((c) => `${stampOf(c.start)}${c.text}`).join('\n') }]) }));
  await o.goto(`${a.base}/free`);
  await pickAudio(o);
  await pasteLyrics(o, lyrics);
  await o.waitForSelector('.offer', { timeout: 20000 });
  report['offer'] = { text: await o.locator('.offer').innerText().then((t) => t.split('\n').filter((l) => !l.startsWith('[')).join(' / ')), usedYet: (await free(o, (f) => f.lrc())).startsWith('[') };
  await shot(o, '31-offer');
  await o.getByRole('button', { name: '用這份時間' }).click();
  await o.waitForFunction(() => /^\[/.test((window as unknown as { vjFree: { lrc: () => string } }).vjFree.lrc()));
  await o.waitForFunction(() => { const f = (window as unknown as { vjFree: { busy: () => string; analysing: () => boolean; song?: { cues: { start: number }[] }; estimate: () => string } }).vjFree; return !f.busy() && !f.analysing() && !f.estimate(); });
  report['offerUsed'] = { note: await o.locator('.estimate').allInnerTexts(), first: (await free(o, (f) => f.song!.cues[0].start)), real: cues[0].start };
  await fourth.close();
}

report['pageServerCalls'] = local;
report['uploads'] = uploads;
report['foreign'] = foreign;
report['pageErrors'] = errors;
await browser.close();
writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));
