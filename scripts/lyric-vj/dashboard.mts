// Backend for the lyric-VJ pages (dev): job statuses and media for /admin, songs and lyric timing for /timing.
// npx tsx scripts/lyric-vj/dashboard.mts   (then `npm start` and open http://localhost:4200/admin or /timing)
import { copyFileSync, createReadStream, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import type { SongTimeline } from '../../src/app/lyric-vj/timeline';
import { applyTimingEdit, TimingEdit } from '../../src/app/lyric-vj/timing-qa';
import { JOBS_DIR } from './status.mts';
import { startStep, studioState, StudioStep } from './studio.mts';
import { LANGUAGES } from '../../src/app/lyric-vj/languages';

const PORT = 4310;
const OUT_ROOT = resolve('out');
const TYPES: Record<string, string> = {
  '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.mp4': 'video/mp4', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.mov': 'video/quicktime', '.lrc': 'text/plain; charset=utf-8',
};
const MAX_BODY = 2_000_000;

const json = (res: ServerResponse, status: number, body: unknown) =>
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(body));

/** Streams a file with range support (audio and video seek with range requests). */
function sendFile(req: IncomingMessage, res: ServerResponse, file: string) {
  const type = TYPES[extname(file)];
  if (!type || !existsSync(file)) return void res.writeHead(404).end();
  const size = statSync(file).size;
  const range = /bytes=(\d+)-(\d*)/.exec(req.headers.range ?? '');
  if (range) {
    const start = Number(range[1]);
    const end = range[2] ? Number(range[2]) : size - 1;
    res.writeHead(206, { 'content-type': type, 'content-range': `bytes ${start}-${end}/${size}`, 'accept-ranges': 'bytes', 'content-length': end - start + 1 });
    createReadStream(file, { start, end }).pipe(res);
    return;
  }
  res.writeHead(200, { 'content-type': type, 'content-length': size, 'accept-ranges': 'bytes' });
  createReadStream(file).pipe(res);
}

/** Every song.json under out/ (depth ≤ 3), by id = its folder relative to out/. */
function songFiles(): Map<string, string> {
  const found = new Map<string, string>();
  const walk = (dir: string, depth: number) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory() && depth < 3 && !e.name.startsWith('.') && !['render', 'segments', 'assets'].some((x) => e.name.startsWith(x))) walk(join(dir, e.name), depth + 1);
      else if (e.name === 'song.json') found.set(relative(OUT_ROOT, dir), join(dir, e.name));
    }
  };
  if (existsSync(OUT_ROOT)) walk(OUT_ROOT, 0);
  return found;
}

const readBody = (req: IncomingMessage) =>
  new Promise<string>((ok, fail) => {
    let body = '';
    req.on('data', (c) => {
      body += c;
      if (body.length > MAX_BODY) fail(new Error('內容太大'));
    });
    req.on('end', () => ok(body));
    req.on('error', fail);
  });

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  const path = url.pathname;
  try {
    if (path === '/lyric-vj/jobs') {
      const jobs = existsSync(JOBS_DIR)
        ? readdirSync(JOBS_DIR).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(JOBS_DIR, f), 'utf8')))
        : [];
      jobs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      return json(res, 200, jobs);
    }
    if (path.startsWith('/lyric-vj/files/')) {
      // only files under out/
      const file = resolve(OUT_ROOT, decodeURIComponent(path.slice('/lyric-vj/files/'.length)));
      if (!file.startsWith(OUT_ROOT + sep)) return void res.writeHead(404).end();
      return sendFile(req, res, file);
    }
    if (path === '/lyric-vj/songs') {
      const list = [...songFiles()].map(([id, file]) => {
        const s: SongTimeline = JSON.parse(readFileSync(file, 'utf8'));
        return { id, title: s.title, lines: s.cues.length, review: s.cues.filter((c) => c.review?.length).length, confirmedAt: s.timingConfirmedAt ?? null };
      });
      return json(res, 200, list.sort((a, b) => a.title.localeCompare(b.title)));
    }
    if (path === '/lyric-vj/languages') return json(res, 200, Object.entries(LANGUAGES).map(([id, l]) => ({ id, name: l.name, suits: l.suits, essence: l.essence })));
    // /lyric-vj/studio/<id> (GET state) and /lyric-vj/studio/<id>/<step> (POST {language?})
    const st = /^\/lyric-vj\/studio\/([^/]+)(?:\/(make|design|render|layer|lrc|clip|props|revise|draw))?$/.exec(path);
    if (st) {
      const file = songFiles().get(decodeURIComponent(st[1]));
      if (!file) return json(res, 404, { error: '找不到這首歌' });
      if (!st[2] && req.method === 'GET') return json(res, 200, studioState(file, OUT_ROOT));
      if (st[2] && req.method === 'POST') {
        const body = JSON.parse((await readBody(req)) || '{}') as { language?: string; seconds?: number; feedback?: string; unconfirmed?: boolean };
        const err = startStep(file, st[2] as StudioStep, { language: body.language, seconds: Number(body.seconds) || undefined, feedback: typeof body.feedback === 'string' ? body.feedback.slice(0, 4000) : undefined, unconfirmed: body.unconfirmed === true });
        return err ? json(res, 409, { error: err }) : json(res, 202, { ok: true });
      }
      return void res.writeHead(405).end();
    }
    // /lyric-vj/songs/<id>[/audio/<mix|vocals>|/cues]  (id is one URL-encoded segment, e.g. db%2Fyt_x)
    const m = /^\/lyric-vj\/songs\/([^/]+)(\/audio\/(mix|vocals)|\/cues)?$/.exec(path);
    if (m) {
      const file = songFiles().get(decodeURIComponent(m[1]));
      if (!file) return json(res, 404, { error: '找不到這首歌' });
      const song: SongTimeline = JSON.parse(readFileSync(file, 'utf8'));
      if (!m[2] && req.method === 'GET') return json(res, 200, song);
      if (m[3] && req.method === 'GET') {
        // audio files the pipeline recorded for this song (may live outside out/, e.g. the user's music folder)
        const p = m[3] === 'mix' ? song.audio.mix : song.audio.vocals;
        if (!p) return void res.writeHead(404).end();
        return sendFile(req, res, resolve(dirname(OUT_ROOT), p));
      }
      if (m[2] === '/cues' && req.method === 'PUT') {
        const body = JSON.parse(await readBody(req)) as { cues: TimingEdit[]; confirm?: boolean; accepted?: string[]; singers?: { name: string; color: string }[] };
        const next = applyTimingEdit(song, body.cues, !!body.confirm, undefined, Array.isArray(body.accepted) ? body.accepted.map(String) : [], body.singers);
        const backup = file.replace(/\.json$/, '.orig.json');
        if (!existsSync(backup)) copyFileSync(file, backup); // the automatic timing, kept once
        writeFileSync(file, JSON.stringify(next, null, 1));
        return json(res, 200, { ok: true, confirmedAt: next.timingConfirmedAt ?? null });
      }
      return void res.writeHead(405).end();
    }
    res.writeHead(404).end();
  } catch (e) {
    json(res, 400, { error: (e as Error).message });
  }
}).listen(PORT, '127.0.0.1', () => console.log(`lyric-vj backend on http://127.0.0.1:${PORT}`));
