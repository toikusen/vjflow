// Offline render: bundle the render page, drive headless Chrome frame by frame, encode with ffmpeg, mux both audio versions.
// npx tsx --tsconfig tsconfig.json scripts/lyric-vj/render.mts --song out/indigo/song.json --treatment out/indigo/treatment.json \
//   [--assets out/indigo/assets/assets.json] --start 69 --end 90 [--stills 70,75] [--fps 30 --workers 2]
import { spawn } from 'node:child_process';
import { copyFileSync, createReadStream, existsSync, mkdirSync, readFileSync, rmSync, statfsSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { jobIdFor, jobStatus } from './status.mts';
import { parseArgs } from 'node:util';
import { timingGate } from '../../src/app/lyric-vj/timing-qa';
import { keyPhrases, splitSongTitle } from '../../src/app/lyric-vj/structure';
import * as esbuild from 'esbuild';
import { chromium, Page } from 'playwright';
import { TEMPLATES } from '../../src/app/lyric-vj/templates';
import { alignOffset, SongTimeline } from '../../src/app/lyric-vj/timeline';
import { cuesIn, TreatmentV3, validateTreatment } from '../../src/app/lyric-vj/treatment';
import type { AssetSource, RenderJob } from '../../src/app/lyric-vj/render/engine';
import { decode } from './media.mts';

const { values: a } = parseArgs({
  options: {
    unconfirmed: { type: 'boolean', default: false },
    song: { type: 'string' }, treatment: { type: 'string' }, assets: { type: 'string' }, out: { type: 'string' },
    start: { type: 'string' }, end: { type: 'string' }, fps: { type: 'string', default: '30' }, workers: { type: 'string', default: '2' },
    stills: { type: 'string' }, font: { type: 'string' }, 'font-display': { type: 'string' }, 'font-body': { type: 'string' }, 'font-script': { type: 'string' }, // the user's font choice
    'no-video': { type: 'boolean', default: false }, // still version: every clip replaced by the image it starts from
    'with-instrumental': { type: 'boolean', default: false }, // vocal version only unless asked
    job: { type: 'string' },
    logo: { type: 'string' }, // group logo image (PNG with alpha)
  },
});
const ROOT = process.cwd();
const song: SongTimeline = JSON.parse(readFileSync(a.song!, 'utf8'));
// nothing is generated on unchecked lyric timing (the timing editor confirms it); --unconfirmed for internal tests
const gate = timingGate(song);
if (gate && !a.unconfirmed) throw new Error(gate);
const win = { start: Number(a.start ?? 0), end: Number(a.end ?? song.duration) };
const out = a.out ?? dirname(a.treatment!);
const fps = Number(a.fps);
mkdirSync(join(out, 'render'), { recursive: true });

const checked = validateTreatment(JSON.parse(readFileSync(a.treatment!, 'utf8')) as TreatmentV3, song, win, TEMPLATES);
if (checked.errors.length) throw new Error('企劃未通過驗證：\n' + checked.errors.join('\n'));
const assets: Record<string, AssetSource> = a.assets ? JSON.parse(readFileSync(a.assets, 'utf8')) : {};
if (a['no-video']) {
  for (const v of checked.treatment.assets.filter((x) => x.kind === 'video')) if (v.from && assets[v.from]) assets[v.id] = assets[v.from];
}
const url = (p: string) => '/' + relative(ROOT, resolve(p)).split('\\').join('/');
for (const s of Object.values(assets)) {
  s.url = url(s.url);
  if (s.frames) s.frames.pattern = url(s.frames.pattern);
}
const job: RenderJob = {
  fps, window: win, beats: song.beats, beatStrength: song.beatStrength,
  keyWords: [splitSongTitle(song.title).title, ...keyPhrases(song)],
  cues: cuesIn(song, win),
  treatment: checked.treatment, assets,
  fonts: { family: a.font, display: a['font-display'], body: a['font-body'], script: a['font-script'] },
  meta: { ...splitSongTitle(song.title), logo: a.logo ? url(a.logo) : undefined },
};
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
async function openPage(): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.goto(pageUrl);
  await page.waitForSelector('body[data-ready="1"]', { timeout: 120_000 });
  return page;
}
const shoot = (page: Page, type: 'jpeg' | 'png') => page.locator('#stage').screenshot({ type, ...(type === 'jpeg' ? { quality: 92 } : {}) });

try {
  if (a.stills) {
    const page = await openPage();
    for (const t of a.stills.split(',').map(Number)) {
      await page.evaluate((x) => window.renderAt(x), t);
      writeFileSync(join(out, `still_${t.toFixed(2)}.png`), await shoot(page, 'png'));
    }
    console.log('stills written to', out);
  } else {
    const total = Math.round((win.end - win.start) * fps);
    const status = jobStatus(a.job ?? jobIdFor(dirname(a.treatment!)));
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
        const file = join(segDir, `seg_${k}.mp4`);
        const page = await openPage();
        const ff = spawn('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
          '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-maxrate', '16M', '-bufsize', '32M', '-pix_fmt', 'yuv420p', // grain is incompressible: cap the rate
           '-r', String(fps), file], { stdio: ['pipe', 'inherit', 'inherit'] });
        for (let f = f0; f < f1; f++) {
          if (f % 60 === 0 && statfsSync(out).bavail * statfsSync(out).bsize < 400e6) throw new Error('磁碟可用空間不足 400MB，停止渲染');
          await page.evaluate((x) => window.renderAt(x), win.start + f / fps); // time from the frame index: no drift
          ff.stdin.write(await shoot(page, 'jpeg'));
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
    const silent = join(out, 'video_silent.mp4');
    await run('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', silent]);
    rmSync(segDir, { recursive: true });

    const len = win.end - win.start;
    const tag = `${Math.round(win.start)}-${Math.round(win.end)}s`;
    const vocal = join(out, `lyric-vj_vocal_${tag}.mp4`);
    await mux(silent, song.audio.mix, vocal, 0, win.start, len);
    const outputs = [vocal];
    let offsetMs: number | undefined;
    if (song.audio.instrumental && a['with-instrumental']) {
      const inst = join(out, `lyric-vj_instrumental_${tag}.mp4`);
      await mux(silent, song.audio.instrumental, inst, song.audio.instrumentalOffsetSec ?? 0, win.start, len);
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
    writeFileSync(join(out, 'metrics.json'), JSON.stringify({ ...report, cues: m.cues }, null, 1));
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
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-shortest', '-movflags', '+faststart', file]);
}

function run(cmd: string, args: string[]) {
  return new Promise((r, j) => spawn(cmd, args, { stdio: 'inherit' }).on('close', (c) => (c ? j(new Error(`${cmd} ${c}`)) : r(null))));
}
