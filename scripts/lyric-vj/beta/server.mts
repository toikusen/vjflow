// The closed beta's backend: invited people log in with their link, see their own songs and jobs, and queue work
// within their limit; the admin invites people, sets limits and retries failed jobs.
// npx tsx scripts/lyric-vj/beta/server.mts   (listens on 127.0.0.1:4320; the tunnel points at it)
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, resolve } from 'node:path';
import type { SongTimeline } from '../../../src/app/lyric-vj/timeline';
import { applyTimingEdit, TimingEdit } from '../../../src/app/lyric-vj/timing-qa';
import { pump, Queue } from './queue.mts';
import { randomBytes } from 'node:crypto';
import { Db, hashToken, invite, Job, load, newId, refuse, requeueRunning, reserveFor, save, Song, spent, Tier, User, userByToken } from './store.mts';

const MAX_BODY = 100_000;
const MAX_AUDIO = 80_000_000;
const MAX_LYRICS = 20_000;
const TIERS: Tier[] = ['none', 'img', 'hybrid'];
const LANGS = ['ja', 'zh', 'en', 'ko'];
const AUDIO: Record<string, string> = { 'audio/mpeg': '.mp3', 'audio/mp3': '.mp3', 'audio/wav': '.wav', 'audio/x-wav': '.wav', 'audio/wave': '.wav', 'audio/flac': '.flac', 'audio/x-flac': '.flac', 'audio/mp4': '.m4a', 'audio/x-m4a': '.m4a', 'audio/aac': '.aac' };
const SERVE: Record<string, string> = { '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.mp4': 'video/mp4' };

/** Streams a file with range support (the timing editor and the video player seek with range requests). */
function sendFile(req: IncomingMessage, res: ServerResponse, file: string) {
  const type = SERVE[extname(file)];
  if (!type || !existsSync(file)) return void res.writeHead(404).end();
  const size = statSync(file).size;
  const range = /bytes=(\d+)-(\d*)/.exec(req.headers.range ?? '');
  if (range) {
    const start = Number(range[1]);
    const end = Math.min(size - 1, range[2] ? Number(range[2]) : size - 1);
    res.writeHead(206, { 'content-type': type, 'content-range': `bytes ${start}-${end}/${size}`, 'accept-ranges': 'bytes', 'content-length': end - start + 1 });
    return void createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { 'content-type': type, 'content-length': size, 'accept-ranges': 'bytes' });
  createReadStream(file).pipe(res);
}

/** Saves a request body to a file, refusing past `max` bytes (the partial file is removed). */
const saveBody = (req: IncomingMessage, file: string, max: number) =>
  new Promise<void>((ok, fail) => {
    let n = 0;
    const out = createWriteStream(file);
    req.on('data', (c: Buffer) => { n += c.length; if (n > max) { req.destroy(); out.destroy(); rmSync(file, { force: true }); fail(new Error('音檔太大（上限 80 MB）')); } });
    req.pipe(out);
    out.on('finish', () => (n ? ok() : fail(new Error('沒有收到音檔'))));
    out.on('error', fail);
  });

export interface BetaOptions {
  root: string; command: Queue['command']; publicUrl: string; env?: Record<string, string>;
  /** The built pages (ng build); any other path gets index.html, whose own path check picks the page. */
  site?: string;
}
const PAGE: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8' };

/** Where a song's files live. */
export const songDir = (root: string, id: string) => join(root, 'songs', id);

const json = (res: ServerResponse, status: number, body: unknown) =>
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(body));

const readJson = (req: IncomingMessage) =>
  new Promise<Record<string, unknown>>((ok, fail) => {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > MAX_BODY) { fail(new Error('內容太大')); req.destroy(); } });
    req.on('end', () => { try { ok(body ? JSON.parse(body) : {}); } catch { fail(new Error('格式錯誤')); } });
    req.on('error', fail);
  });

const cookie = (req: IncomingMessage, name: string) => (req.headers.cookie ?? '').split(';').map((c) => c.trim().split('=')).find(([k]) => k === name)?.[1];

/** What a person sees of a job (no logs: those can carry paths and keys' error text). */
const publicJob = (j: Job) => ({ id: j.id, songId: j.songId, kind: j.kind, tier: j.tier, status: j.status, phase: j.phase, createdAt: j.createdAt, startedAt: j.startedAt, endedAt: j.endedAt, failed: j.status === 'failed' });
const publicUser = (db: Db, u: User) => ({ id: u.id, name: u.name, admin: u.admin, disabled: !!u.disabled, limitUsd: u.limitUsd, spentUsd: +spent(db, u.id).toFixed(2) });

export function createBetaServer(o: BetaOptions) {
  const dbFile = join(o.root, 'db.json');
  const db = load(dbFile);
  const q: Queue = { db, persist: () => save(dbFile, db), command: o.command, logDir: join(o.root, 'logs'), env: o.env };
  requeueRunning(db);
  q.persist();
  pump(q);

  /** Queues a job for a song the person owns, inside their limit. */
  const enqueue = (user: User, songId: string, kind: Job['kind'], tier?: Tier) => {
    const why = refuse(db, user.id, kind, tier);
    if (why) return { error: why };
    if (db.jobs.some((j) => j.songId === songId && (j.status === 'queued' || j.status === 'running'))) return { error: '這首歌已經在排隊或製作中' };
    const job: Job = { id: newId(), userId: user.id, songId, kind, tier, status: 'queued', reservedUsd: reserveFor(kind, tier), createdAt: new Date().toISOString() };
    db.jobs.push(job);
    q.persist();
    pump(q);
    return { job };
  };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    const path = url.pathname;
    try {
      if (!path.startsWith('/beta/') && o.site) {
        const file = resolve(o.site, '.' + decodeURIComponent(path));
        const page = file.startsWith(resolve(o.site) + '/') && existsSync(file) && statSync(file).isFile() ? file : join(o.site, 'index.html');
        res.writeHead(200, { 'content-type': PAGE[extname(page)] ?? 'application/octet-stream', 'cache-control': page.endsWith('index.html') ? 'no-store' : 'public, max-age=3600' });
        // a missing page (dist wiped mid-build) must not take the server and its running job down
        return void createReadStream(page).on('error', () => res.destroy()).pipe(res);
      }
      // the invite link: the token becomes an HttpOnly cookie and leaves the address bar
      if (path === '/beta/login') {
        const t = url.searchParams.get('t') ?? '';
        if (!userByToken(db, t)) return json(res, 401, { error: '登入連結無效' });
        const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
        return void res.writeHead(302, { 'set-cookie': `vjb=${t}; HttpOnly; SameSite=Lax; Path=/; Max-Age=7776000${secure}`, location: '/my' }).end();
      }
      const user = userByToken(db, cookie(req, 'vjb'));
      if (!user) return json(res, 401, { error: '請用邀請連結登入' });
      if (path === '/beta/me') return json(res, 200, publicUser(db, user));
      if (path === '/beta/jobs') return json(res, 200, db.jobs.filter((j) => user.admin || j.userId === user.id).map(publicJob));
      if (path === '/beta/songs' && req.method === 'GET') return json(res, 200, db.songs.filter((s) => user.admin || s.userId === user.id));
      // a new song: its words first (the person's own lyrics are the authority), the audio next
      if (path === '/beta/songs' && req.method === 'POST') {
        const b = await readJson(req);
        const text = (k: string, max: number) => String(b[k] ?? '').trim().slice(0, max);
        const [title, artist, lyrics, translation, language] = [text('title', 120), text('artist', 120), text('lyrics', MAX_LYRICS), text('translation', MAX_LYRICS), text('language', 4)];
        if (!title || !lyrics) return json(res, 400, { error: '請填歌名和歌詞' });
        if (!LANGS.includes(language)) return json(res, 400, { error: '語言不正確' });
        const song: Song = { id: newId(), userId: user.id, title, artist, language, createdAt: new Date().toISOString() };
        const dir = songDir(o.root, song.id);
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, 'lyrics.txt'), lyrics + '\n');
        if (translation) writeFileSync(join(dir, 'translation.txt'), translation + '\n');
        db.songs.push(song);
        q.persist();
        return json(res, 201, song);
      }
      const sm = /^\/beta\/songs\/([\w-]+)\/(audio|timing|cues|audio\/mix|audio\/vocals|video\/none|video\/img|video\/hybrid)$/.exec(path);
      if (sm) {
        const song = db.songs.find((s) => s.id === sm[1] && (s.userId === user.id || user.admin));
        if (!song) return json(res, 404, { error: '找不到這首歌' });
        const dir = songDir(o.root, song.id), songFile = join(dir, 'song.json');
        if (sm[2] === 'audio' && req.method === 'PUT') {
          const ext = AUDIO[(req.headers['content-type'] ?? '').split(';')[0].trim()];
          if (!ext) return json(res, 415, { error: '請上傳 mp3、wav、flac、m4a 或 aac' });
          if (db.jobs.some((j) => j.songId === song.id && j.kind === 'prep' && j.status !== 'failed')) return json(res, 409, { error: '這首歌已經上傳過音檔' });
          await saveBody(req, join(dir, `upload${ext}`), MAX_AUDIO);
          const r = enqueue(user, song.id, 'prep');
          return 'error' in r ? json(res, 409, r) : json(res, 202, publicJob(r.job));
        }
        // a finished video; one held for the admin's look reaches the person once the admin approves it
        if (sm[2].startsWith('video/') && req.method === 'GET') {
          const tier = sm[2].slice(6);
          const ready = db.jobs.some((j) => j.songId === song.id && j.kind === 'make' && j.tier === tier && (j.status === 'done' || (user.admin && j.status === 'admin')));
          return ready ? sendFile(req, res, join(dir, `video-${tier}.mp4`)) : json(res, 404, { error: '影片還沒完成' });
        }
        if (!existsSync(songFile)) return json(res, 409, { error: '歌曲還在準備中' });
        const timeline: SongTimeline = JSON.parse(readFileSync(songFile, 'utf8'));
        if (sm[2] === 'timing' && req.method === 'GET') return json(res, 200, timeline);
        if (sm[2].startsWith('audio/') && req.method === 'GET') return sendFile(req, res, join(dir, sm[2] === 'audio/mix' ? 'mix.mp3' : 'vocals.wav'));
        if (sm[2] === 'cues' && req.method === 'PUT') {
          if (db.jobs.some((j) => j.songId === song.id && j.kind === 'make' && (j.status === 'queued' || j.status === 'running'))) return json(res, 409, { error: '影片製作中，時間不能再改' });
          const b = (await readJson(req)) as { cues?: TimingEdit[]; confirm?: boolean; accepted?: string[]; singers?: { name: string; color: string }[] };
          if (!Array.isArray(b.cues)) return json(res, 400, { error: '格式錯誤' });
          const next = applyTimingEdit(timeline, b.cues, !!b.confirm, undefined, Array.isArray(b.accepted) ? b.accepted.map(String) : [], b.singers);
          if (!existsSync(join(dir, 'song.orig.json'))) writeFileSync(join(dir, 'song.orig.json'), JSON.stringify(timeline));
          writeFileSync(songFile, JSON.stringify(next, null, 1));
          song.confirmedAt = next.timingConfirmedAt;
          q.persist();
          return json(res, 200, { ok: true, confirmedAt: next.timingConfirmedAt ?? null });
        }
        return void res.writeHead(405).end();
      }
      const mk = /^\/beta\/songs\/([\w-]+)\/make$/.exec(path);
      if (mk && req.method === 'POST') {
        const song = db.songs.find((s) => s.id === mk[1] && s.userId === user.id);
        if (!song) return json(res, 404, { error: '找不到這首歌' });
        if (!song.confirmedAt) return json(res, 409, { error: '請先確認歌詞時間' });
        const tier = (await readJson(req)).tier as Tier;
        if (!TIERS.includes(tier)) return json(res, 400, { error: '方案不正確' });
        const r = enqueue(user, song.id, 'make', tier);
        return 'error' in r ? json(res, 409, r) : json(res, 202, publicJob(r.job));
      }
      if (!path.startsWith('/beta/admin/')) return json(res, 404, { error: '找不到' });
      if (!user.admin) return json(res, 403, { error: '只有管理者可以使用' });
      if (path === '/beta/admin/users' && req.method === 'GET') return json(res, 200, { users: db.users.map((u) => publicUser(db, u)), globalLimitUsd: db.globalLimitUsd, spentUsd: +spent(db).toFixed(2) });
      if (path === '/beta/admin/users' && req.method === 'POST') {
        const b = await readJson(req);
        const name = String(b.name ?? '').trim().slice(0, 60);
        const limit = Number(b.limitUsd);
        if (!name || !(limit >= 0)) return json(res, 400, { error: '請填名字和額度' });
        const { user: u, token } = invite(db, name, limit, b.admin === true);
        q.persist();
        return json(res, 201, { user: publicUser(db, u), loginUrl: `${o.publicUrl}/beta/login?t=${token}` });
      }
      const pu = /^\/beta\/admin\/users\/([\w-]+)$/.exec(path);
      if (pu && req.method === 'PATCH') {
        const u = db.users.find((x) => x.id === pu[1]);
        if (!u) return json(res, 404, { error: '找不到帳號' });
        const b = await readJson(req);
        if (b.limitUsd !== undefined && Number(b.limitUsd) >= 0) u.limitUsd = Number(b.limitUsd);
        if (typeof b.disabled === 'boolean' && u.id !== user.id) u.disabled = b.disabled;
        // a fresh login link (the tunnel's address changed, or a link was lost); the old one stops working
        let loginUrl: string | undefined;
        if (b.newLink === true) {
          const token = randomBytes(24).toString('base64url');
          u.tokenHash = hashToken(token);
          loginUrl = `${o.publicUrl}/beta/login?t=${token}`;
        }
        q.persist();
        return json(res, 200, { ...publicUser(db, u), loginUrl });
      }
      if (path === '/beta/admin/limit' && req.method === 'PUT') {
        const v = Number((await readJson(req)).globalLimitUsd);
        if (!(v >= 0)) return json(res, 400, { error: '金額不正確' });
        db.globalLimitUsd = v;
        q.persist();
        return json(res, 200, { globalLimitUsd: v });
      }
      // a failed job runs again as a new job (its cost so far stays charged; the steps resume from what they wrote)
      const rj = /^\/beta\/admin\/jobs\/([\w-]+)\/retry$/.exec(path);
      if (rj && req.method === 'POST') {
        const j = db.jobs.find((x) => x.id === rj[1] && x.status === 'failed');
        if (!j) return json(res, 404, { error: '找不到失敗的工作' });
        const owner = db.users.find((u) => u.id === j.userId)!;
        const r = enqueue(owner, j.songId, j.kind, j.tier);
        return 'error' in r ? json(res, 409, r) : json(res, 202, publicJob(r.job));
      }
      const ap = /^\/beta\/admin\/jobs\/([\w-]+)\/approve$/.exec(path);
      if (ap && req.method === 'POST') {
        const j = db.jobs.find((x) => x.id === ap[1] && x.status === 'admin');
        if (!j) return json(res, 404, { error: '找不到等待確認的工作' });
        j.status = 'done';
        q.persist();
        return json(res, 200, publicJob(j));
      }
      if (path === '/beta/admin/jobs') return json(res, 200, db.jobs.map((j) => ({ ...publicJob(j), userId: j.userId, reservedUsd: j.reservedUsd, costUsd: j.costUsd, error: j.error })));
      return json(res, 404, { error: '找不到' });
    } catch (e) {
      json(res, 400, { error: (e as Error).message });
    }
  });
  return { server, db, queue: q };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = resolve(process.env.VJ_BETA_ROOT ?? 'out/beta');
  const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
  const command = (job: Job, db: Db) => {
    const song = db.songs.find((s) => s.id === job.songId);
    if (!song) return { error: '找不到這首歌' };
    const dir = songDir(root, song.id);
    if (job.kind === 'prep') return `bash scripts/lyric-vj/beta/prep.sh ${q(dir)} ${q(song.language)} ${q([song.artist, song.title].filter(Boolean).join(' - '))}`;
    return `bash scripts/lyric-vj/beta/make.sh ${q(dir)} ${q(job.tier ?? '')}`;
  };
  const { server } = createBetaServer({ root, publicUrl: process.env.VJ_BETA_URL ?? 'http://127.0.0.1:4320', command, site: resolve('dist/vjflow/browser') });
  server.listen(4320, '127.0.0.1', () => console.log('beta backend on http://127.0.0.1:4320'));
}
