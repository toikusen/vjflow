// The closed beta's backend: invited people log in with their link, see their own songs and jobs, and queue work
// within their limit; the admin invites people, sets limits and retries failed jobs.
// npx tsx scripts/lyric-vj/beta/server.mts   (listens on 127.0.0.1:4320; the tunnel points at it)
import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, relative, resolve, sep } from 'node:path';
import { LANGUAGES, LanguageId } from '../../../src/app/lyric-vj/languages';
import type { SongTimeline } from '../../../src/app/lyric-vj/timeline';
import { applyTimingEdit, TimingEdit } from '../../../src/app/lyric-vj/timing-qa';
import { logEvent, readEvents } from './events.mts';
import { addFeedback, parseFeedback } from './feedback.mts';
import { killGroup, killRunning, pump, Queue, waitGone } from './queue.mts';
import { randomBytes } from 'node:crypto';
import { charged, Db, hashToken, invite, Job, load, newId, platformSpent, priceFor, refuse, TIER_TOTAL, requeueRunning, retryJob, save, Song, songDir, spent, Tier, User, runPath, userByToken, videoFile, workPath } from './store.mts';

export { songDir };

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
  /** How long a restart waits for orphaned pipelines to exit before giving up on them (default 12 s; tests shorten it). */
  orphanWaitMs?: number;
}
const PAGE: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8' };

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
const isViewable = (j: Job, user: User) => j.status === 'done' || (user.admin && j.status === 'admin');
/** The video's length in seconds from the run's song.json, or undefined when unreadable. */
const videoDuration = (root: string, j: Job) => {
  try { const d = JSON.parse(readFileSync(join(runPath(root, j), 'song.json'), 'utf8')).duration; return typeof d === 'number' && d >= 0 ? d : undefined; } catch { return undefined; }
};
const styleCache = new Map<string, string>();
/** The Chinese name of a make job's design language, from its treatment.json; cached by job id once found. */
export function jobStyle(root: string, job: Job): string | undefined {
  if (job.kind !== 'make') return undefined;
  const hit = styleCache.get(job.id);
  if (hit) return hit;
  try {
    const id = JSON.parse(readFileSync(join(workPath(root, job), 'base', 'treatment.json'), 'utf8'))?.design?.language as LanguageId;
    const name = LANGUAGES[id]?.name;
    if (name) styleCache.set(job.id, name);
    return name;
  } catch {
    return undefined;
  }
}
const publicJob = (j: Job, root?: string) => ({ id: j.id, songId: j.songId, kind: j.kind, tier: j.tier, status: j.status, phase: j.phase, createdAt: j.createdAt, startedAt: j.startedAt, endedAt: j.endedAt, steps: j.steps, priceUsd: j.priceUsd, failed: j.status === 'failed', retryOf: j.retryOf, auto: j.auto, style: root && (j.status === 'done' || j.status === 'admin') ? jobStyle(root, j) : undefined });
const publicUser = (db: Db, u: User) => ({ id: u.id, name: u.name, admin: u.admin, disabled: !!u.disabled, limitUsd: u.limitUsd, spentUsd: +spent(db, u.id).toFixed(2) });

/**
 * Shuts the queue down for a server exit: stops the running pipelines but leaves their jobs `running` in the record
 * (the next start re-queues them), starts nothing new, then calls `exit` once the kills have had their grace time.
 */
export function stopBeta(b: { db: Db; queue: Queue; orphans?: number[] }, exit: () => void = () => process.exit(0), graceMs = 2000) {
  b.queue.stopping = true;
  killRunning(b.db, graceMs);
  for (const pid of b.orphans ?? []) killGroup(pid, 0);
  b.queue.persist();
  setTimeout(exit, graceMs + 500);
}

export function createBetaServer(o: BetaOptions) {
  const dbFile = join(o.root, 'db.json');
  const db = load(dbFile);
  const q: Queue = { db, persist: () => save(dbFile, db), command: o.command, logDir: join(o.root, 'logs'), env: o.env, onEvent: (job, e) => logEvent(o.root, job.songId, { ...e, jobId: job.id }) };
  q.holding = true; // nothing starts, whatever gets enqueued, until the orphans are gone
  const orphanSongs = new Map(db.jobs.filter((j) => j.status === 'running' && j.pid).map((j) => [j.pid!, j.songId]));
  const orphans = killRunning(db); // a pipeline orphaned by a crash must not run beside its rerun
  for (const j of requeueRunning(db)) logEvent(o.root, j.songId, { type: 'job.requeued', jobId: j.id });
  // make jobs queued before run folders existed get one now, so their output lands where videoFile looks
  for (const j of db.jobs) if (j.kind === 'make' && j.status === 'queued' && !j.runDir) j.runDir = `runs/${j.id}`;
  q.persist();
  // the rerun starts only once the orphaned groups are gone; with none, at once
  const release = (left: number[]) => {
    const bySong = new Map<string, number[]>();
    for (const pid of left) bySong.set(orphanSongs.get(pid)!, [...(bySong.get(orphanSongs.get(pid)!) ?? []), pid]);
    // only survivors stay listed: a pid that has exited may belong to a stranger's group by the time stopBeta runs
    orphans.splice(0, orphans.length, ...left);
    try {
      for (const [songId, pids] of bySong) logEvent(o.root, songId, { type: 'queue.orphan.timeout', pids });
    } finally {
      q.holding = false;
      pump(q);
    }
  };
  const ready = orphans.length ? waitGone(orphans, o.orphanWaitMs).catch(() => orphans.slice()).then(release) : (release([]), Promise.resolve());

  /** Queues a job for a song the person owns, inside their limit. */
  const enqueue = (user: User, songId: string, kind: Job['kind'], tier?: Tier, runDir?: string) => {
    // until makes go through concepts, a direct make charges concept + rest, the same total as before the split
    const price = kind === 'make' && tier ? TIER_TOTAL(tier) : priceFor(kind, tier);
    const why = refuse(db, user.id, kind, tier, songId, price);
    if (why) return { error: why };
    if (db.jobs.some((j) => j.songId === songId && (j.status === 'queued' || j.status === 'running'))) return { error: '這首歌已經在排隊或製作中' };
    const id = newId();
    const job: Job = { id, runDir: kind === 'make' ? (runDir ?? `runs/${id}`) : undefined, userId: user.id, songId, kind, tier, status: 'queued', reservedUsd: price, priceUsd: price, createdAt: new Date().toISOString() };
    db.jobs.push(job);
    q.persist();
    logEvent(o.root, songId, { type: 'job.queued', jobId: id, by: user.id, kind, tier, priceUsd: job.priceUsd });
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
      if (path === '/beta/jobs') return json(res, 200, db.jobs.filter((j) => user.admin || j.userId === user.id).map((j) => publicJob(j, o.root)));
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
        logEvent(o.root, song.id, { type: 'song.created', by: user.id });
        return json(res, 201, song);
      }
      // one run's finished video; one held for the admin's look reaches the person once the admin approves it
      const vj = /^\/beta\/jobs\/([\w-]+)\/video$/.exec(path);
      if (vj && req.method === 'GET') {
        const j = db.jobs.find((x) => x.id === vj[1] && x.kind === 'make' && (x.userId === user.id || user.admin));
        return j && isViewable(j, user) ? sendFile(req, res, videoFile(o.root, j)) : json(res, 404, { error: '影片還沒完成' });
      }
      // problem reports on a finished video: only its owner posts; the owner or the admin reads; every report is kept
      const fb = /^\/beta\/jobs\/([\w-]+)\/feedback$/.exec(path);
      if (fb) {
        const j = db.jobs.find((x) => x.id === fb[1] && x.kind === 'make' && (x.userId === user.id || (user.admin && req.method === 'GET')));
        if (!j) return json(res, 404, { error: '找不到' });
        if (req.method === 'GET') return json(res, 200, db.feedback.filter((f) => f.jobId === j.id).reverse());
        if (req.method !== 'POST') return json(res, 404, { error: '找不到' });
        if (j.status !== 'done') return json(res, 409, { error: '影片還沒完成' });
        const p = parseFeedback(await readJson(req), videoDuration(o.root, j));
        if (!p.ok) return json(res, 400, { error: p.error });
        const f = addFeedback(db, j, p.value, user.id, jobStyle(o.root, j));
        q.persist();
        logEvent(o.root, j.songId, { type: 'feedback.submitted', jobId: j.id, by: user.id, feedbackId: f.id, ok: f.ok, action: f.action, marks: f.marks.length });
        return json(res, 201, f);
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
          logEvent(o.root, song.id, { type: 'audio.uploaded', by: user.id });
          const r = enqueue(user, song.id, 'prep');
          return 'error' in r ? json(res, 409, r) : json(res, 202, publicJob(r.job, o.root));
        }
        // old links: the latest finished video of a version
        if (sm[2].startsWith('video/') && req.method === 'GET') {
          const tier = sm[2].slice(6);
          const latest = db.jobs.filter((j) => j.songId === song.id && j.kind === 'make' && j.tier === tier && isViewable(j, user)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
          return latest ? sendFile(req, res, videoFile(o.root, latest)) : json(res, 404, { error: '影片還沒完成' });
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
          logEvent(o.root, song.id, { type: 'timing.saved', by: user.id, confirmed: !!b.confirm });
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
        return 'error' in r ? json(res, 409, r) : json(res, 202, publicJob(r.job, o.root));
      }
      if (!path.startsWith('/beta/admin/')) return json(res, 404, { error: '找不到' });
      if (!user.admin) return json(res, 403, { error: '只有管理者可以使用' });
      if (path === '/beta/admin/users' && req.method === 'GET') return json(res, 200, { users: db.users.map((u) => publicUser(db, u)), globalLimitUsd: db.globalLimitUsd, spentUsd: +spent(db).toFixed(2), platformSpentUsd: +platformSpent(db).toFixed(2) });
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
      // a failed job runs again as a new job at the fixed price (the failed one charged nothing; the steps resume from what they wrote)
      const rj = /^\/beta\/admin\/jobs\/([\w-]+)\/retry$/.exec(path);
      if (rj && req.method === 'POST') {
        const j = db.jobs.find((x) => x.id === rj[1] && x.status === 'failed');
        if (!j) return json(res, 404, { error: '找不到失敗的工作' });
        const again = db.jobs.find((x) => x.retryOf === j.id);
        if (again) return json(res, 409, { error: `已經重跑過（見 ${again.id}）` });
        const owner = db.users.find((u) => u.id === j.userId)!;
        const why = refuse(db, owner.id, j.kind, j.tier, j.songId, j.priceUsd);
        if (why) return json(res, 409, { error: why });
        if (db.jobs.some((x) => x.songId === j.songId && (x.status === 'queued' || x.status === 'running'))) return json(res, 409, { error: '這首歌已經在排隊或製作中' });
        const job = retryJob(db, j, { auto: false });
        q.persist();
        logEvent(o.root, j.songId, { type: 'job.queued', jobId: job.id, by: owner.id, kind: job.kind, tier: job.tier, priceUsd: job.priceUsd });
        logEvent(o.root, j.songId, { type: 'admin.retry', jobId: job.id, by: user.id, retryOf: j.id });
        pump(q);
        return json(res, 202, publicJob(job, o.root));
      }
      const ap = /^\/beta\/admin\/jobs\/([\w-]+)\/approve$/.exec(path);
      if (ap && req.method === 'POST') {
        const j = db.jobs.find((x) => x.id === ap[1] && x.status === 'admin');
        if (!j) return json(res, 404, { error: '找不到等待確認的工作' });
        j.status = 'done';
        q.persist();
        logEvent(o.root, j.songId, { type: 'admin.approve', jobId: j.id, by: user.id });
        return json(res, 200, publicJob(j, o.root));
      }
      // a song's history and its logs (admin only; every file stays inside that song's folder)
      const al = /^\/beta\/admin\/songs\/([\w-]+)\/(events|logs)(?:\/(.+))?$/.exec(path);
      if (al && req.method === 'GET') {
        const song = db.songs.find((s) => s.id === al[1]);
        if (!song) return json(res, 404, { error: '找不到這首歌' });
        if (al[2] === 'events') return json(res, 200, readEvents(o.root, song.id));
        const dir = resolve(songDir(o.root, song.id));
        const jobLog = (id: string) => join(o.root, 'logs', `${id}.log`);
        if (!al[3]) {
          const found: { path: string; bytes: number }[] = [];
          const walk = (d: string) => {
            if (!existsSync(d)) return;
            for (const e of readdirSync(d, { withFileTypes: true })) {
              const f = join(d, e.name);
              if (e.isDirectory()) walk(f);
              else if (e.isFile() && e.name.endsWith('.log')) found.push({ path: relative(dir, f).split(sep).join('/'), bytes: statSync(f).size });
            }
          };
          walk(dir);
          for (const j of db.jobs.filter((x) => x.songId === song.id))
            if (existsSync(jobLog(j.id))) found.push({ path: `jobs/${j.id}.log`, bytes: statSync(jobLog(j.id)).size });
          return json(res, 200, found);
        }
        const rel = decodeURIComponent(al[3]);
        const jm = /^jobs\/([\w-]+)\.log$/.exec(rel);
        const file = jm ? (db.jobs.some((x) => x.id === jm[1] && x.songId === song.id) ? jobLog(jm[1]) : '') : resolve(dir, rel);
        if (!jm && (!file.startsWith(dir + sep) || !file.endsWith('.log'))) return json(res, 400, { error: '路徑不正確' });
        if (!file || !existsSync(file) || !statSync(file).isFile()) return json(res, 404, { error: '找不到紀錄' });
        return void res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }).end(readFileSync(file));
      }
      if (path === '/beta/admin/feedback') return json(res, 200, [...db.feedback].reverse());
      if (path === '/beta/admin/jobs') return json(res, 200, db.jobs.map((j) => ({ ...publicJob(j, o.root), userId: j.userId, reservedUsd: j.reservedUsd, priceUsd: j.priceUsd, costUsd: j.costUsd, costs: j.costs, fused: j.fused, chargedUsd: charged(j), unsettled: j.unsettled, error: j.error })));
      return json(res, 404, { error: '找不到' });
    } catch (e) {
      json(res, 400, { error: (e as Error).message });
    }
  });
  return { server, db, queue: q, orphans, /** Resolves when the first pump has run (after any orphaned pipeline has exited). */ ready };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = resolve(process.env.VJ_BETA_ROOT ?? 'out/beta');
  const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
  const command = (job: Job, db: Db) => {
    const song = db.songs.find((s) => s.id === job.songId);
    if (!song) return { error: '找不到這首歌' };
    const dir = songDir(root, song.id);
    if (job.kind === 'prep') return `bash scripts/lyric-vj/beta/prep.sh ${q(dir)} ${q(song.language)} ${q([song.artist, song.title].filter(Boolean).join(' - '))}`;
    if (job.kind === 'concept') return `bash scripts/lyric-vj/beta/concept.sh ${q(dir)} ${q(runPath(root, job))}`;
    return `bash scripts/lyric-vj/beta/make.sh ${q(dir)} ${q(job.tier ?? '')} ${q(runPath(root, job))}`;
  };
  const beta = createBetaServer({ root, publicUrl: process.env.VJ_BETA_URL ?? 'http://127.0.0.1:4320', command, site: resolve('dist/vjflow/browser') });
  // the pipeline runs in its own process group: stop it with the server, or it would keep spending and a restart would run it twice
  for (const sig of ['SIGINT', 'SIGTERM'] as const)
    process.on(sig, () => stopBeta(beta));
  const { server } = beta;
  server.listen(4320, '127.0.0.1', () => console.log('beta backend on http://127.0.0.1:4320'));
}
