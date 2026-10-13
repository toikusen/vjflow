// Offline render: bundle the render page, drive headless Chrome frame by frame, encode with ffmpeg, mux both audio versions.
// npx tsx --tsconfig tsconfig.json scripts/lyric-vj/render.mts --song out/indigo/song.json --treatment out/indigo/treatment.json \
//   [--assets out/indigo/assets/assets.json] --start 69 --end 90 [--stills 70,75] [--fps 30 --workers 2]
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, createReadStream, existsSync, mkdirSync, readFileSync, rmSync, statfsSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { jobIdFor, jobStatus, lockJob } from './status.mts';
import { lockFile } from './lock.mts';
import { fontCache } from './font-cache.mts';
import { parseArgs } from 'node:util';
import { endAtVoice, silentTail, timingGate } from '../../src/app/lyric-vj/timing-qa';
import { frameStats, visualIssues, type FrameStats } from '../../src/app/lyric-vj/visual-qa';
import { keyPhrases, splitSongTitle } from '../../src/app/lyric-vj/structure';
import * as esbuild from 'esbuild';
import { chromium, Page } from 'playwright';
import { TEMPLATES } from '../../src/app/lyric-vj/templates';
import { alignOffset, SongTimeline, vocalActivity } from '../../src/app/lyric-vj/timeline';
import { cuesIn, TreatmentV3, validateTreatment } from '../../src/app/lyric-vj/treatment';
import type { AssetSource, Entrance, RenderJob } from '../../src/app/lyric-vj/render/engine';
import { decode } from './media.mts';
import { MEDIA, MediumId } from '../../src/app/lyric-vj/medium';
import { DEFAULT_DESIGN } from '../../src/app/lyric-vj/design';

const { values: a } = parseArgs({
  options: {
    unconfirmed: { type: 'boolean', default: false },
    song: { type: 'string' }, treatment: { type: 'string' }, assets: { type: 'string' }, out: { type: 'string' },
    start: { type: 'string' }, end: { type: 'string' }, fps: { type: 'string', default: '30' }, workers: { type: 'string', default: '2' },
    stills: { type: 'string' }, font: { type: 'string' }, 'font-display': { type: 'string' }, 'font-body': { type: 'string' }, 'font-script': { type: 'string' }, // the user's font choice
    track: { type: 'boolean', default: false }, // QA: log sprite boxes per frame
    'no-video': { type: 'boolean', default: false }, // still version: every clip replaced by the image it starts from
    'with-instrumental': { type: 'boolean', default: false }, // vocal version only unless asked
    job: { type: 'string' },
    logo: { type: 'string' }, // group logo image (PNG with alpha)
    medium: { type: 'string' }, // override the treatment's medium (medium.ts)
    clip: { type: 'string' }, // 'a,b': render only this part of the window (previews)
    layer: { type: 'string' }, // text | back: one compositing layer (text = ProRes 4444 with alpha)
    entrance: { type: 'string', default: 'whole' }, // fast lines: whole (quick entrance, default) | stagger (comparison) | cut (fallback)
    'motion-frames': { type: 'string' }, // QA: line ids whose motion check runs on every frame (60 fps), comma-separated
  },
});
if (!['whole', 'stagger', 'cut'].includes(a.entrance!)) throw new Error(`--entrance 只能是 whole、stagger 或 cut（收到 ${a.entrance}）`);
const ROOT = process.cwd();
const song: SongTimeline = JSON.parse(readFileSync(a.song!, 'utf8'));
// nothing is generated on unchecked lyric timing (the timing editor confirms it); --unconfirmed for internal tests
const gate = timingGate(song);
// VJ_UNCONFIRMED=1: Studio's "try before the timing is confirmed" (passed down to every render it starts)
if (gate && !a.unconfirmed && process.env['VJ_UNCONFIRMED'] !== '1') throw new Error(gate);
const win = { start: Number(a.start ?? 0), end: Number(a.end ?? song.duration) };
const [clipStart, clipEnd] = a.clip ? a.clip.split(',').map(Number) : [win.start, win.end];
const range = { start: Math.max(win.start, clipStart), end: Math.min(win.end, clipEnd) };
const out = a.out ?? dirname(a.treatment!);
const fps = Number(a.fps);
// before anything is written: one render per output directory, and a video render also owns its job's status
const jobId = a.job ?? jobIdFor(dirname(a.treatment!));
lockFile(join(resolve(out), '.render.lock'), (pid) => `${out} 已經有一個渲染在寫入（pid ${pid}），請等它結束`);
if (!a.stills) lockJob(jobId);
mkdirSync(join(out, 'render'), { recursive: true });

const checked = validateTreatment(JSON.parse(readFileSync(a.treatment!, 'utf8')) as TreatmentV3, song, win, TEMPLATES);
if (checked.errors.length) throw new Error('企劃未通過驗證：\n' + checked.errors.join('\n'));
if (a.medium) {
  if (!(a.medium in MEDIA)) throw new Error(`沒有 ${a.medium} 這種媒材（可用 ${Object.keys(MEDIA).join('/')}）`);
  checked.treatment.design = { ...(checked.treatment.design ?? DEFAULT_DESIGN), medium: a.medium as MediumId };
}
const assets: Record<string, AssetSource> = a.assets ? JSON.parse(readFileSync(a.assets, 'utf8')) : {};
if (a['no-video']) {
  for (const v of checked.treatment.assets.filter((x) => x.kind === 'video')) if (v.from && assets[v.from]) assets[v.id] = assets[v.from];
}
const url = (p: string) => '/' + relative(ROOT, resolve(p)).split('\\').join('/');
for (const s of Object.values(assets)) {
  s.url = url(s.url);
  if (s.frames) s.frames.pattern = url(s.frames.pattern);
}
// where the voice is, from the vocal stem: a line leaves after its real end, not after a stretch of silence the timing
// ran on into, and the check reports lines left up over silence
const vocals = song.audio.vocals && existsSync(song.audio.vocals) ? vocalActivity(decode(song.audio.vocals, 22050), 22050) : undefined;
const job: RenderJob = {
  fps, window: win, beats: song.beats, beatStrength: song.beatStrength, tempo: song.tempo,
  cues: cuesIn(song, win).map((c) => (vocals ? { ...c, end: endAtVoice(c, vocals) } : c)),
  singers: song.singers,
  treatment: checked.treatment, assets,
  fonts: { family: a.font, display: a['font-display'], body: a['font-body'], script: a['font-script'] },
  meta: { ...splitSongTitle(song.title), logo: a.logo ? url(a.logo) : undefined },
  layer: a.layer === 'text' || a.layer === 'back' ? a.layer : undefined,
  track: !!a.track,
  entrance: a.entrance as Entrance,
};
// which code and options made this render, so reports from different versions are never mixed up
const git = (...args: string[]) => {
  try {
    return execFileSync('git', args, { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
};
const diff = git('diff', 'HEAD');
const version = {
  commit: git('rev-parse', '--short', 'HEAD'),
  uncommitted: diff ? createHash('sha1').update(diff).digest('hex').slice(0, 10) : null,
  options: { entrance: job.entrance },
  renderedAt: new Date().toISOString(),
};
const alpha = job.layer === 'text';
const ext = alpha ? 'mov' : 'mp4';
writeFileSync(join(out, 'job.json'), JSON.stringify(job));

await esbuild.build({
  entryPoints: ['src/app/lyric-vj/render/main.ts'], bundle: true, format: 'esm', target: 'es2022',
  outfile: join(out, 'render', 'render.js'), logLevel: 'warning',
});
copyFileSync('scripts/lyric-vj/render.html', join(out, 'render', 'render.html'));

// static server rooted at the worktree (render page, job, assets)
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = createServer((req, res) => {
  const path = join(ROOT, decodeURIComponent(new URL(req.url!, 'http://x').pathname));
  if (!path.startsWith(ROOT) || !existsSync(path)) return void res.writeHead(404).end();
  res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' });
  createReadStream(path).pipe(res);
}).listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
const pageUrl = `${base}${url(join(out, 'render', 'render.html'))}?job=${url(join(out, 'job.json'))}`;

const browser = await chromium.launch({ channel: 'chrome', args: ['--force-device-scale-factor=1', '--ignore-gpu-blocklist'] });
const getFont = fontCache(resolve('out/font-cache'));
async function openPage(): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  // Google Fonts from the disk cache shared by every worktree (out/ is shared; font-cache.mts). A miss with no network
  // fails the song rather than rendering it in fallback fonts.
  const fontMiss: string[] = [];
  await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, async (route) => {
    const u = route.request().url();
    const font = await getFont(u, route.request().headers()['user-agent'] ?? '');
    if (!font) return void (fontMiss.push(u), await route.abort());
    await route.fulfill({ body: font.body, contentType: font.type, headers: { 'access-control-allow-origin': '*' } });
  });
  page.on('pageerror', (e) => console.error('page error:', e.message));
  // a texture that fails to load surfaces only as 'page error: Event': name the file
  page.on('requestfailed', (r) => console.error('request failed:', r.url(), r.failure()?.errorText));
  page.on('response', (r) => r.status() >= 400 && console.error('http', r.status(), r.url()));
  page.on('console', (m) => m.type() === 'error' && m.text().startsWith('code layer:') && console.error(m.text()));
  // a busy machine (several songs at once) can miss the ready timeout: one more try with longer patience before the
  // song fails (three style tests started together all timed out, then rendered fine one by one)
  for (let attempt = 0; ; attempt++) {
    try {
      await page.goto(pageUrl);
      await page.waitForSelector('body[data-ready="1"]', { timeout: attempt ? 300_000 : 120_000 });
      const bad = await page.evaluate(() => [...document.fonts].filter((f) => f.status === 'error').map((f) => f.family));
      if (fontMiss.length) throw new Error(`fonts not cached and not reachable: ${fontMiss.join(' ')}`);
      if (bad.length) throw new Error(`fonts failed to load: ${bad.join(', ')}`);
      return page;
    } catch (e) {
      if (attempt >= 1 || (e as Error).name !== 'TimeoutError') throw e;
      console.error('render page not ready in 120 s, retrying');
    }
  }
}
const shoot = (page: Page, type: 'jpeg' | 'png') => page.locator('#stage').screenshot({ type, ...(type === 'jpeg' ? { quality: 92 } : { omitBackground: true }) });

try {
  if (a.stills) {
    const page = await openPage();
    const frames: FrameStats[] = [];
    for (const t of a.stills.split(',').map(Number)) {
      await page.evaluate((x) => window.renderAt(x), t);
      const png = await shoot(page, 'png');
      writeFileSync(join(out, `still_${t.toFixed(2)}.png`), png);
      // a thumbnail's pixels, decoded by the page (no image library here), for the frame checks
      const px = await page.evaluate(async (b64) => {
        const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
        const c = new OffscreenCanvas(192, 108).getContext('2d')!;
        c.drawImage(bmp, 0, 0, 192, 108);
        return Array.from(c.getImageData(0, 0, 192, 108).data);
      }, png.toString('base64'));
      frames.push(frameStats(t, px));
    }
    // a pre-render check (no full render needed): lines too short to read, lines left over an instrumental
    const m = await page.evaluate(() => window.vjMetrics());
    // after the metrics: the motion check renders frames of its own
    const motion = await page.evaluate((ids) => window.vjMotionQa(ids), (a['motion-frames'] ?? '').split(',').filter(Boolean));
    writeFileSync(join(out, 'motion.json'), JSON.stringify({ version, lines: motion }, null, 1));
    const on = (h: { prop?: string; opacity?: number; layer?: string }) => (h.prop ? ` ${h.prop}（透明度 ${h.opacity}，${h.layer}）` : '');
    const check = {
      version,
      // what the overlap fields below are, and are not
      overlapNote: '道具、裝飾、卡片的重疊是可見性篩選後的幾何重疊（透明度門檻 0.02），不等於已證實的閱讀干擾',
      // a playing line (kick, sway, drift, beat pulse) carried onto a story prop that had cleared it, or past the frame
      // edge; overlaps already in the measured box or while a prop glides away are counted apart
      motion: motion.filter((x) => x.motion.px > 0 || x.offFrame.px > 0).map((x) => `${x.id} ${x.template} 動態疊到道具 ${x.motion.px.toFixed(0)}px@${x.motion.t.toFixed(2)}s${on(x.motion)} 出框 ${x.offFrame.px.toFixed(0)}px@${x.offFrame.t.toFixed(2)}s ${x.text}`),
      // only objects past the visibility filter count (a hidden hero does not); a half-transparent prop behind the words still counts
      propAtRest: motion.filter((x) => x.atRest.px > 0).map((x) => `${x.id} ${x.template} ${x.atRest.px.toFixed(0)}px@${x.atRest.t.toFixed(2)}s${on(x.atRest)}`),
      propSteppedBack: motion.filter((x) => x.steppedBack.px > 0).map((x) => `${x.id} ${x.template} ${x.steppedBack.px.toFixed(0)}px@${x.steppedBack.t.toFixed(2)}s${on(x.steppedBack)}`),
      propGliding: motion.filter((x) => x.gliding.px > 0).length,
      // decorations (inset photos, blobs, stamps, seals, numerals, windows) under the words, counted apart
      decorOverlap: motion.filter((x) => x.decor.px > 0).map((x) => `${x.id} ${x.template} ${x.decor.cause} ${x.decor.px.toFixed(0)}px@${x.decor.t.toFixed(2)}s${on(x.decor)}`),
      // cards over each other while a line is up (not the lyrics: their texts show through each other)
      cardOverlap: motion.filter((x) => x.cards.px > 0).map((x) => `${x.id} ${x.cards.px.toFixed(0)}px@${x.cards.t.toFixed(2)}s ${x.cards.a}(${x.cards.opacity?.[0]}) × ${x.cards.b}(${x.cards.opacity?.[1]})`),
      offSafe: motion.filter((x) => x.offSafe.px > 0 && !x.offFrame.px).length,
      unreadable: m.cues.filter((c) => !c.ok).map((c) => `${c.id} ${c.text}（${c.readableSec.toFixed(1)}/${c.requiredSec.toFixed(1)}s）`),
      // planned entrances that never play (a cut the director chose is not a loss), and every pacing change
      entranceLost: m.cues.filter((c) => c.entranceLost).map((c) => `${c.id} ${c.template} ${c.plannedEnter}→cut（${c.adjust.join('+')}）${c.text}`),
      adjusted: m.cues.filter((c) => c.adjust.length).map((c) => `${c.id} ${c.template} ${c.plannedEnter}/${c.plannedReveal}→${c.enter}/${c.reveal}（${c.adjust.join('+')}）`),
      // lingering = up over silence: measured on the vocal stem (a held note or a backing vocal is still singing; from
      // the last character's start alone, every held ending was flagged); without a stem, the old 4 s rule
      lingering: (() => {
        const tail = (c: (typeof m.cues)[number]) => (vocals ? silentTail(vocals, c.lastSung, c.goneAt) : c.lingerSec - 4);
        // the breathing a line is given on purpose: 1.2 s hold + up to 1 s fade after its end → over 2.5 s is a fault
        return m.cues.filter((c) => tail(c) > (vocals ? 2.5 : 0)).map((c) => `${c.id} ${c.text}（人聲停了還留 ${tail(c).toFixed(1)}s）`);
      })(),
      visual: visualIssues(frames),
    };
    writeFileSync(join(out, 'check.json'), JSON.stringify(check, null, 1));
    // per line: planned and drawn entrance, why it changed, readable and required seconds (to re-check any line)
    writeFileSync(join(out, 'metrics.json'), JSON.stringify({ version, cues: m.cues, textGuard: m.textGuard }, null, 1));
    console.log('stills written to', out, JSON.stringify(check));
  } else {
    const total = Math.round((range.end - range.start) * fps);
    const status = jobStatus(jobId);
    status.stage('render', { state: 'running', done: 0, total, message: a['no-video'] ? '純圖片版本' : undefined });
    process.on('uncaughtExceptionMonitor', (e) => status.stage('render', { state: 'failed', message: String(e).slice(0, 300) }));
    let rendered = 0;
    const workers = Math.max(1, Number(a.workers));
    const bounds = Array.from({ length: workers + 1 }, (_, k) => Math.round((total * k) / workers));
    const segDir = join(out, 'segments');
    mkdirSync(segDir, { recursive: true });
    const began = Date.now();
    const parts = await Promise.all(
      bounds.slice(0, -1).map(async (f0, k) => {
        const f1 = bounds[k + 1];
        const file = join(segDir, `seg_${k}.${ext}`);
        const page = await openPage();
        // the lyric layer keeps its alpha: PNG frames into ProRes 4444
        const enc = alpha
          ? ['-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le']
          : ['-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-maxrate', '16M', '-bufsize', '32M', '-pix_fmt', 'yuv420p']; // grain is incompressible: cap the rate
        const ff = spawn('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', alpha ? 'png' : 'mjpeg', '-i', '-',
          ...enc, '-r', String(fps), file], { stdio: ['pipe', 'inherit', 'inherit'] });
        for (let f = f0; f < f1; f++) {
          if (f % 60 === 0 && statfsSync(out).bavail * statfsSync(out).bsize < 400e6) throw new Error('磁碟可用空間不足 400MB，停止渲染');
          const t = range.start + f / fps; // time from the frame index: no drift
          if (alpha) {
            await page.evaluate((x) => window.renderAt(x), t);
            ff.stdin.write(await shoot(page, 'png'));
          } else {
            // the frame straight from the canvas: a page screenshot went through the compositor and was the bottleneck
            const url = await page.evaluate((x) => window.grabAt(x, 0.92), t);
            ff.stdin.write(Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
          }
          if (++rendered % fps === 0) status.stage('render', { done: rendered });
          if (k === 0 && f % fps === 0) process.stdout.write(`\r  frame ${f}/${f1} (${((Date.now() - began) / 1000).toFixed(0)}s)`);
        }
        ff.stdin.end();
        await new Promise((r, j) => ff.on('close', (c) => (c ? j(new Error(`ffmpeg ${c}`)) : r(null))));
        await page.close();
        return file;
      }),
    );
    console.log();
    const list = join(segDir, 'list.txt');
    writeFileSync(list, parts.map((p) => `file '${resolve(p)}'`).join('\n'));
    const silent = join(out, `video_silent.${ext}`);
    await run('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', silent]);
    rmSync(segDir, { recursive: true });

    const len = range.end - range.start;
    const tag = `${Math.round(range.start)}-${Math.round(range.end)}s`;
    const vocal = join(out, `lyric-vj_${job.layer ? `${job.layer}_` : ''}vocal_${tag}.${ext}`);
    await mux(silent, song.audio.mix, vocal, 0, range.start, len);
    const outputs = [vocal];
    let offsetMs: number | undefined;
    if (song.audio.instrumental && a['with-instrumental']) {
      const inst = join(out, `lyric-vj_instrumental_${tag}.mp4`);
      await mux(silent, song.audio.instrumental, inst, song.audio.instrumentalOffsetSec ?? 0, range.start, len);
      outputs.push(inst);
      offsetMs = Math.abs(alignOffset(decode(vocal, 22050), decode(inst, 22050), 22050, 0.5)) * 1000;
    }
    rmSync(silent);

    const page = await openPage();
    const m = await page.evaluate(() => window.vjMetrics());
    const accentErrFrames = m.accents.map((x) => Math.abs(Math.round(x.time * fps) - x.time * fps));
    const report = {
      outputs, seconds: Math.round((Date.now() - began) / 1000),
      readable: { ok: m.cues.every((c) => c.ok), failing: m.cues.filter((c) => !c.ok) },
      accents: { count: m.accents.length, maxErrorFrames: Math.max(0, ...accentErrFrames), ok: accentErrFrames.every((e) => e <= 1) },
      audioOffsetMs: offsetMs, audioOk: offsetMs === undefined || offsetMs <= 15,
      fixes: checked.fixes,
    };
    writeFileSync(join(out, 'metrics.json'), JSON.stringify({ version, ...report, cues: m.cues, textGuard: m.textGuard }, null, 1));
    status.outputs(outputs);
    status.stage('render', {
      state: 'done', done: total,
      message: report.readable.ok ? undefined : `可讀時間不足：${report.readable.failing.map((c) => c.text).join('、')}`,
    });
    console.log(JSON.stringify(report, null, 1));
  }
} finally {
  await browser.close();
  server.close();
}

async function mux(video: string, audio: string, file: string, offset: number, start: number, length: number) {
  // delay as a filter: asetpts would reset an input offset (-itsoffset) to zero
  const pre = offset > 0 ? `adelay=${(offset * 1000).toFixed(1)}:all=1,` : '';
  const af = `${pre}atrim=start=${start + Math.max(0, -offset)}:duration=${length},asetpts=PTS-STARTPTS`;
  await run('ffmpeg', ['-loglevel', 'error', '-y', '-i', video, '-i', audio, '-map', '0:v', '-map', '1:a', '-af', af,
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-shortest', ...(file.endsWith('.mp4') ? ['-movflags', '+faststart'] : []), file]);
}

function run(cmd: string, args: string[]) {
  return new Promise((r, j) => spawn(cmd, args, { stdio: 'inherit' }).on('close', (c) => (c ? j(new Error(`${cmd} ${c}`)) : r(null))));
}
