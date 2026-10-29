// npx tsx --test scripts/lyric-vj/beta/server.test.mts
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { betaCommand, createBetaServer, releaseStale, songDir as songDir2, stopBeta } from './server.mts';
import { killRunning, waitGone } from './queue.mts';
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { LANGUAGES } from '../../../src/app/lyric-vj/languages';
import { readEvents } from './events.mts';
import { invite, load, save, emptyDb, runPath, type Job } from './store.mts';

// every server and job a test starts is stopped when the file ends, so a failed assertion cannot leave the process hanging
const started: ReturnType<typeof createBetaServer>[] = [];
const create = (o: Parameters<typeof createBetaServer>[0]) => { const b = createBetaServer(o); started.push(b); return b; };
/** Shell appended to a stub make/fix: a base treatment in a proven language, so the video is handed over rather than held. */
const provenTreatment = (run: string, tier: string | undefined = 'img') => { const t = JSON.stringify({ design: { language: Object.entries(LANGUAGES).find(([, l]) => l.proven)![0] } }); const dirs = ['base', ({ none: 'noimg', img: 'img', hybrid: 'cut' } as Record<string, string>)[tier ?? ''] ?? 'base']; return dirs.map((d) => ` && mkdir -p '${run}/${d}' && echo '${t}' > '${run}/${d}/treatment.json'`).join(''); };
after(() => {
  for (const b of started) {
    b.queue.stopping = true;
    killRunning(b.db, 0);
    b.server.closeAllConnections();
    b.server.close();
  }
});

const SONG = JSON.stringify({ duration: 10, cues: [{ id: 'c1', start: 1, end: 2, text: 'a' }] });

async function setup() {
  const root = mkdtempSync(join(tmpdir(), 'beta-'));
  const db = emptyDb();
  const admin = invite(db, 'Admin', 100, true);
  const tester = invite(db, 'Tester', 10);
  db.songs.push({ id: 's1', userId: tester.user.id, title: 'T', artist: 'A', language: 'ja', createdAt: '2026-10-27T00:00:00Z', confirmedAt: '2026-10-27T00:00:00Z' });
  save(join(root, 'db.json'), db);
  mkdirSync(join(root, 'songs/s1'), { recursive: true });
  writeFileSync(join(root, 'songs/s1/song.json'), SONG);
  // a concept job snapshots the timing and leaves a summary to accept; any job leaves a video (only make jobs serve one)
  const beta = create({ root, publicUrl: 'https://beta.test', env: {}, command: (job) => `mkdir -p '${runPath(root, job)}' && echo mp4 > '${runPath(root, job)}/video.mp4'${job.kind === 'concept' ? ` && cp '${join(root, 'songs/s1/song.json')}' '${runPath(root, job)}/song.json' && echo '{"stills":[]}' > '${runPath(root, job)}/concept.json'` : provenTreatment(runPath(root, job), job.tier)}; echo '##PHASE 製作中'; echo '##COST 2.5'` });
  await new Promise<void>((ok) => beta.server.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${(beta.server.address() as AddressInfo).port}`;
  const as = (token?: string) => (path: string, init: RequestInit = {}) => fetch(base + path, { ...init, redirect: 'manual', headers: { ...(token ? { cookie: `vjb=${token}` } : {}), 'content-type': 'application/json' } });
  return { beta, base, root, admin: as(admin.token), tester: as(tester.token), anon: as(), testerToken: tester.token };
}

test('the invite link sets a cookie; nothing works without one', async () => {
  const t = await setup();
  const login = await t.anon(`/beta/login?t=${t.testerToken}`);
  assert.equal(login.status, 302);
  assert.match(login.headers.get('set-cookie') ?? '', /vjb=.*HttpOnly/);
  assert.equal((await t.anon('/beta/me')).status, 401);
  assert.equal((await t.anon('/beta/login?t=nope')).status, 401);
  assert.equal((await (await t.tester('/beta/me')).json()).name, 'Tester');
  t.beta.server.close();
});

test('a queued job runs, reports its phase and measured cost, and the limit holds', async () => {
  const t = await setup();
  assert.equal((await t.tester('/beta/songs/s1/make', { method: 'POST', body: JSON.stringify({ tier: 'bogus' }) })).status, 400);
  const r = await t.tester('/beta/songs/s1/make', { method: 'POST', body: JSON.stringify({ tier: 'img' }) });
  assert.equal(r.status, 202);
  for (let k = 0; k < 50 && t.beta.db.jobs[0].status !== 'done'; k++) await new Promise((ok) => setTimeout(ok, 100));
  const [job] = t.beta.db.jobs;
  assert.deepEqual([job.kind, job.status, job.phase, job.costUsd, job.priceUsd], ['concept', 'done', '製作中', 2.5, 2.5]);
  // $2.50 spent: with the limit lowered to $4 a second $2.50 concept is refused
  t.beta.db.users[1].limitUsd = 4;
  const refused = await t.tester('/beta/songs/s1/make', { method: 'POST', body: JSON.stringify({ tier: 'hybrid' }) });
  assert.equal(refused.status, 409);
  assert.match((await refused.json()).error, /額度不足/);
  t.beta.server.close();
});

test('admin pages are the admin\'s only; an invite returns a login link', async () => {
  const t = await setup();
  assert.equal((await t.tester('/beta/admin/users')).status, 403);
  const made = await t.admin('/beta/admin/users', { method: 'POST', body: JSON.stringify({ name: 'New', limitUsd: 20 }) });
  assert.equal(made.status, 201);
  assert.match((await made.json()).loginUrl, /^https:\/\/beta\.test\/beta\/login\?t=/);
  // another person's song is not theirs to queue
  const other = await t.admin('/beta/songs/s1/make', { method: 'POST', body: JSON.stringify({ tier: 'none' }) });
  assert.equal(other.status, 404);
  t.beta.server.close();
});

test('a new song keeps the person\'s lyrics, takes one audio upload and queues its preparation', async () => {
  const t = await setup();
  assert.equal((await t.tester('/beta/songs', { method: 'POST', body: JSON.stringify({ title: 'X', lyrics: 'a', language: 'xx' }) })).status, 400);
  const made = await t.tester('/beta/songs', { method: 'POST', body: JSON.stringify({ title: 'X', artist: 'Y', lyrics: '一行\n二行', translation: 'one\ntwo', language: 'zh' }) });
  assert.equal(made.status, 201);
  const song = await made.json();
  const { readFileSync, existsSync } = await import('node:fs');
  const { songDir } = await import('./server.mts');
  const dir = songDir(t.root, song.id);
  assert.equal(readFileSync(join(dir, 'lyrics.txt'), 'utf8'), '一行\n二行\n');
  const put = (type: string) => fetch(`${t.base}/beta/songs/${song.id}/audio`, { method: 'PUT', body: new Uint8Array([1, 2, 3]), headers: { cookie: `vjb=${t.testerToken}`, 'content-type': type } });
  assert.equal((await put('text/plain')).status, 415);
  assert.equal((await put('audio/mpeg')).status, 202);
  assert.ok(existsSync(join(dir, 'upload.mp3')));
  assert.equal((await put('audio/mpeg')).status, 409);
  // not someone else's
  const other = await t.admin(`/beta/songs/${song.id}/timing`);
  assert.equal(other.status, 409); // the admin may look, but it is still being prepared
  t.beta.server.close();
});

test('a video is downloadable once its job is done; a held one only after the admin approves', async () => {
  const t = await setup();
  const { writeFileSync, mkdirSync } = await import('node:fs');
  const { songDir } = await import('./server.mts');
  const dir = songDir(t.root, 's1');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'video-hybrid.mp4'), 'mp4');
  const get = () => t.tester('/beta/songs/s1/video/hybrid');
  assert.equal((await get()).status, 404);
  const held = { id: 'h', userId: t.beta.db.songs[0].userId, songId: 's1', kind: 'make' as const, tier: 'hybrid' as const, status: 'admin' as const, reservedUsd: 16, createdAt: '2026-10-27T00:00:00Z' };
  t.beta.db.jobs.push(held);
  assert.equal((await get()).status, 404);
  assert.equal((await t.admin('/beta/songs/s1/video/hybrid')).status, 200);
  assert.equal((await t.admin('/beta/admin/jobs/h/approve', { method: 'POST' })).status, 200);
  assert.equal((await get()).status, 200);
  t.beta.server.close();
});

test('a video held longer than HOLD_HOURS goes out by itself with its reason on record; one whose file cannot be handed over stays', async () => {
  const t = await setup();
  const dir = songDir2(t.root, 's1');
  mkdirSync(join(dir, 'runs/old'), { recursive: true });
  mkdirSync(join(dir, 'runs/bad'), { recursive: true });
  mkdirSync(join(dir, 'runs/new'), { recursive: true });
  for (const r of ['old', 'bad', 'new']) writeFileSync(join(dir, `runs/${r}/video.mp4`), 'mp4');
  writeFileSync(join(dir, 'runs/bad/quality.json'), JSON.stringify({ findings: ['影片檔無法解析'], fileOk: false }));
  const owner = t.beta.db.songs[0].userId;
  const held = (id: string, endedAt: string) => ({ id, userId: owner, songId: 's1', kind: 'make' as const, tier: 'img' as const, status: 'admin' as const, reservedUsd: 6, createdAt: endedAt, endedAt, runDir: `runs/${id}`, phase: '等管理者確認：2 句低於閱讀時間規則' });
  const now = Date.parse('2026-10-29T12:00:00Z');
  t.beta.db.jobs.push(held('old', '2026-10-29T07:00:00Z'), held('bad', '2026-10-29T07:00:00Z'), held('new', '2026-10-29T10:00:00Z'));
  const out = releaseStale(t.beta.db, t.root, () => undefined, now);
  assert.deepEqual(out.map((j) => j.id), ['old']);
  const by = (id: string) => t.beta.db.jobs.find((j) => j.id === id)!;
  assert.deepEqual([by('old').status, by('bad').status, by('new').status], ['done', 'admin', 'admin']);
  assert.equal(by('old').autoReleased, '等了 4 小時沒人處理，自動放行（等管理者確認：2 句低於閱讀時間規則）');
  assert.equal((await t.tester('/beta/jobs/old/video')).status, 200);
  assert.ok(readEvents(t.root, 's1').some((e) => e.type === 'admin.autorelease' && e.jobId === 'old'));
  t.beta.server.close();
});

test('a fresh login link replaces the old one', async () => {
  const t = await setup();
  const id = t.beta.db.users.find((u) => u.name === 'Tester')!.id;
  const r = await (await t.admin(`/beta/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify({ newLink: true }) })).json();
  assert.match(r.loginUrl, /^https:\/\/beta\.test\/beta\/login\?t=/);
  assert.equal((await t.tester('/beta/me')).status, 401);
  assert.equal((await t.anon(`/beta/login?t=${new URL(r.loginUrl).searchParams.get('t')}`)).status, 302);
  t.beta.server.close();
});

test('each make job gets its own run folder, and its video is served by job', async () => {
  const t = await setup();
  const r = await t.tester('/beta/songs/s1/make', { method: 'POST', body: JSON.stringify({ tier: 'img' }) });
  const cid = (await r.json()).id;
  const concept = t.beta.db.jobs.find((j) => j.id === cid)!;
  assert.equal(concept.runDir, `runs/${concept.id}`);
  for (let k = 0; k < 50 && concept.status !== 'done'; k++) await new Promise((ok) => setTimeout(ok, 100));
  assert.equal((await t.tester(`/beta/jobs/${concept.id}/video`)).status, 404, 'a concept job has no video');
  const { id } = await (await t.tester(`/beta/jobs/${concept.id}/accept`, { method: 'POST', body: '{}' })).json();
  const job = t.beta.db.jobs.find((j) => j.id === id)!;
  assert.equal(job.runDir, concept.runDir);
  for (let k = 0; k < 50 && job.status !== 'done'; k++) await new Promise((ok) => setTimeout(ok, 100));
  assert.equal(job.status, 'done');
  assert.equal((await t.tester(`/beta/jobs/${id}/video`)).status, 200);
  assert.equal((await t.admin(`/beta/jobs/${id}/video`)).status, 200);
  const other = invite(t.beta.db, 'Other', 10);
  const stranger = await fetch(`${t.base}/beta/jobs/${id}/video`, { headers: { cookie: `vjb=${other.token}` } });
  assert.equal(stranger.status, 404);
  assert.equal((await t.tester('/beta/jobs/nope/video')).status, 404);
  t.beta.server.close();
});

test('a prep job has no run folder', async () => {
  const t = await setup();
  const { mkdirSync } = await import('node:fs');
  mkdirSync(join(t.root, 'songs', 's1'), { recursive: true });
  const r = await fetch(`${t.base}/beta/songs/s1/audio`, { method: 'PUT', headers: { cookie: `vjb=${t.testerToken}`, 'content-type': 'audio/mpeg' }, body: 'x' });
  assert.equal(r.status, 202);
  assert.equal(t.beta.db.jobs[0].runDir, undefined);
  t.beta.server.close();
});

test('admin retry of a failed make job reuses its run folder', async () => {
  const t = await setup();
  t.beta.db.jobs.push({ id: 'j1', userId: t.beta.db.songs[0].userId, songId: 's1', kind: 'make', tier: 'img', status: 'failed', reservedUsd: 6, costUsd: 1, runDir: 'runs/j1', createdAt: '2026-10-27T00:00:00Z' });
  const r = await t.admin('/beta/admin/jobs/j1/retry', { method: 'POST' });
  assert.equal(r.status, 202);
  const { id } = await r.json();
  assert.equal(t.beta.db.jobs.find((j) => j.id === id)!.runDir, 'runs/j1');
  t.beta.server.close();
});

test('a legacy job without runDir still serves songs/<id>/video-<tier>.mp4', async () => {
  const t = await setup();
  const { writeFileSync, mkdirSync } = await import('node:fs');
  mkdirSync(join(t.root, 'songs', 's1'), { recursive: true });
  writeFileSync(join(t.root, 'songs', 's1', 'video-img.mp4'), 'mp4');
  t.beta.db.jobs.push({ id: 'old', userId: t.beta.db.songs[0].userId, songId: 's1', kind: 'make', tier: 'img', status: 'done', reservedUsd: 6, createdAt: '2026-10-27T00:00:00Z' });
  assert.equal((await t.tester('/beta/jobs/old/video')).status, 200);
  assert.equal((await t.tester('/beta/songs/s1/video/img')).status, 200);
  t.beta.server.close();
});

test('the old per-tier video link serves the latest done run', async () => {
  const t = await setup();
  const { writeFileSync, mkdirSync } = await import('node:fs');
  const uid = t.beta.db.songs[0].userId;
  mkdirSync(join(t.root, 'songs', 's1', 'runs', 'b'), { recursive: true });
  writeFileSync(join(t.root, 'songs', 's1', 'runs', 'b', 'video.mp4'), 'new-run');
  t.beta.db.jobs.push(
    { id: 'a', userId: uid, songId: 's1', kind: 'make', tier: 'img', status: 'done', reservedUsd: 6, createdAt: '2026-10-27T00:00:00Z' },
    { id: 'b', userId: uid, songId: 's1', kind: 'make', tier: 'img', status: 'done', reservedUsd: 6, runDir: 'runs/b', createdAt: '2026-10-27T01:00:00Z' },
  );
  assert.equal(await (await t.tester('/beta/songs/s1/video/img')).text(), 'new-run');
  t.beta.server.close();
});

test('a legacy make job still queued at start gets a run folder and its video downloads by job', async () => {
  const root = mkdtempSync(join(tmpdir(), 'beta-'));
  const db = emptyDb();
  const tester = invite(db, 'Tester', 10);
  db.songs.push({ id: 's1', userId: tester.user.id, title: 'T', artist: 'A', language: 'ja', createdAt: '2026-10-27T00:00:00Z', confirmedAt: '2026-10-27T00:00:00Z' });
  db.jobs.push({ id: 'old', userId: tester.user.id, songId: 's1', kind: 'make', tier: 'img', status: 'running', reservedUsd: 6, createdAt: '2026-10-27T00:00:00Z' });
  save(join(root, 'db.json'), db);
  const beta = create({ root, publicUrl: 'https://beta.test', env: {}, command: (job) => `mkdir -p '${runPath(root, job)}' && echo mp4 > '${runPath(root, job)}/video.mp4'${provenTreatment(runPath(root, job), job.tier)}; echo '##COST 1'` });
  await new Promise<void>((ok) => beta.server.listen(0, '127.0.0.1', ok));
  const job = beta.db.jobs[0];
  assert.equal(job.runDir, 'runs/old');
  for (let k = 0; k < 50 && job.status !== 'done'; k++) await new Promise((ok) => setTimeout(ok, 100));
  const res = await fetch(`http://127.0.0.1:${(beta.server.address() as AddressInfo).port}/beta/jobs/old/video`, { headers: { cookie: `vjb=${tester.token}` } });
  assert.equal(res.status, 200);
  beta.server.close();
});

async function runStub(script: string) {
  const root = mkdtempSync(join(tmpdir(), 'beta-'));
  const db = emptyDb();
  const admin = invite(db, 'Admin', 100, true);
  const tester = invite(db, 'Tester', 10);
  db.songs.push({ id: 's1', userId: tester.user.id, title: 'T', artist: 'A', language: 'ja', createdAt: '2026-10-27T00:00:00Z', confirmedAt: '2026-10-27T00:00:00Z' });
  save(join(root, 'db.json'), db);
  const beta = create({ root, publicUrl: 'https://beta.test', env: {}, command: () => script });
  await new Promise<void>((ok) => beta.server.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${(beta.server.address() as AddressInfo).port}`;
  const as = (token: string) => (path: string, init: RequestInit = {}) => fetch(base + path, { ...init, headers: { cookie: `vjb=${token}`, 'content-type': 'application/json' } });
  return { beta, root, admin: as(admin.token), tester: as(tester.token) };
}

test('a job whose cost passes twice its price is stopped and not charged', async () => {
  const t = await runStub("echo '##COST 13 x'; sleep 5");
  const t0 = Date.now();
  await t.tester('/beta/songs/s1/make', { method: 'POST', body: JSON.stringify({ tier: 'img' }) });
  for (let k = 0; k < 40 && t.beta.db.jobs[0].status !== 'failed'; k++) await new Promise((ok) => setTimeout(ok, 100));
  const [job] = t.beta.db.jobs;
  assert.deepEqual([job.status, job.error, job.priceUsd], ['failed', '成本超過上限，已通知管理者', 2.5]);
  assert.ok(Date.now() - t0 < 4000);
  assert.equal((await (await t.tester('/beta/me')).json()).spentUsd, 0);
  t.beta.server.close();
});

test('a failed job records the step it was in as unsettled', async () => {
  const t = await runStub("echo '##PHASE 畫道具'; echo '##COST 1.5 x'; exit 1");
  await t.tester('/beta/songs/s1/make', { method: 'POST', body: JSON.stringify({ tier: 'img' }) });
  await waitFor(() => t.beta.db.jobs.length === 2 && t.beta.db.jobs.every((j) => j.status === 'failed'));
  const jobs = await (await t.admin('/beta/admin/jobs')).json();
  assert.equal(t.beta.db.jobs[0].costUsd, 1.5);
  assert.equal(jobs[0].unsettled, '畫道具');
  assert.equal(jobs[0].priceUsd, 2.5);
  assert.equal((await (await t.admin('/beta/admin/users')).json()).platformSpentUsd, 3); // the failed run and its automatic retry
  t.beta.server.close();
});

test('the admin job list carries costs, fused and the charged amount; a tester\'s list does not', async () => {
  const t = await runStub("echo '##COST 1.5 x'; exit 1");
  await t.tester('/beta/songs/s1/make', { method: 'POST', body: JSON.stringify({ tier: 'img' }) });
  await waitFor(() => t.beta.db.jobs.length === 2 && t.beta.db.jobs.every((j) => j.status === 'failed'));
  const [job] = await (await t.admin('/beta/admin/jobs')).json();
  assert.deepEqual([job.costs[0].key, job.costs[0].usd, job.chargedUsd], ['x', 1.5, 0]);
  assert.ok(!job.fused);
  const own = await (await t.tester('/beta/jobs')).json();
  for (const j of own) for (const k of ['costs', 'fused', 'chargedUsd']) assert.ok(!(k in j), k);
  t.beta.server.close();
});

test('a pipeline orphaned by a crash is stopped when the server starts again, and the job reruns only after it has exited', async () => {
  const marks = mkdtempSync(join(tmpdir(), 'beta-marks-'));
  // the orphan takes a second to wind down after SIGTERM; the rerun records whether that had finished when it started
  const t = await runStub(`echo '##PHASE 製作中'; trap 'sleep 1; touch ${marks}/orphan-exited; exit' TERM; touch ${marks}/orphan-up; sleep 30 & wait`);
  await t.tester('/beta/songs/s1/make', { method: 'POST', body: JSON.stringify({ tier: 'img' }) });
  for (let k = 0; k < 40 && !t.beta.db.jobs[0].pid; k++) await new Promise((ok) => setTimeout(ok, 50));
  for (let k = 0; k < 100 && !existsSync(join(marks, 'orphan-up')); k++) await new Promise((ok) => setTimeout(ok, 50));
  const pid = t.beta.db.jobs[0].pid!;
  assert.ok(pid > 0);
  process.kill(-pid, 0); // alive
  // a crash: the first server's record stays on disk with the job running; a second server starts on it
  const root = t.root;
  t.beta.server.close();
  const second = create({ root, publicUrl: 'https://beta.test', env: {}, command: () => `[ -f ${marks}/orphan-exited ] && touch ${marks}/rerun-saw-exit; sleep 30` });
  assert.equal(second.db.jobs[0].status, 'queued', 'the rerun waits for the orphan');
  await second.ready;
  const newPid = second.db.jobs[0].pid;
  try {
    assert.throws(() => process.kill(-pid, 0), 'old process group still alive');
    assert.equal(second.db.jobs[0].status, 'running');
    assert.notEqual(newPid, pid);
    for (let k = 0; k < 40 && !existsSync(join(marks, 'rerun-saw-exit')); k++) await new Promise((ok) => setTimeout(ok, 50));
    assert.ok(existsSync(join(marks, 'rerun-saw-exit')), 'rerun started before the orphan exited');
    const ev = readEvents(root, 's1').map((e) => e.type);
    assert.ok(ev.includes('job.requeued'));
  } finally {
    // stop the rerun's group and the first server's group; only pids this test started
    for (const p of [pid, newPid]) if (p) try { process.kill(-p, 'SIGKILL'); } catch { /* gone */ }
    second.server.close();
    await new Promise((ok) => setTimeout(ok, 200));
  }
});

test('a job whose cost passes twice its price leaves a job.fused event beside job.ended', async () => {
  const t = await runStub("echo '##COST 13 x'; sleep 5");
  await t.tester('/beta/songs/s1/make', { method: 'POST', body: JSON.stringify({ tier: 'img' }) });
  for (let k = 0; k < 40 && t.beta.db.jobs[0].status !== 'failed'; k++) await new Promise((ok) => setTimeout(ok, 100));
  const ev = readEvents(t.root, 's1');
  const fused = ev.find((e) => e.type === 'job.fused');
  assert.deepEqual([fused?.costUsd, fused?.priceUsd], [13, 2.5]);
  assert.ok(ev.some((e) => e.type === 'job.ended' && e.status === 'failed'));
  assert.ok(ev.findIndex((e) => e.type === 'job.fused') < ev.findIndex((e) => e.type === 'job.ended'));
  t.beta.server.close();
});

test('a shell that cannot start fails the job once and the queue moves on', async () => {
  const root = mkdtempSync(join(tmpdir(), 'beta-'));
  const db = emptyDb();
  const tester = invite(db, 'Tester', 10);
  db.songs.push({ id: 's1', userId: tester.user.id, title: 'T', artist: 'A', language: 'ja', createdAt: '2026-10-27T00:00:00Z', confirmedAt: '2026-10-27T00:00:00Z' });
  save(join(root, 'db.json'), db);
  const beta = create({ root, publicUrl: 'https://beta.test', env: {}, command: () => 'true' });
  beta.queue.shell = join(root, 'no-such-shell');
  await new Promise<void>((ok) => beta.server.listen(0, '127.0.0.1', ok));
  const res = await fetch(`http://127.0.0.1:${(beta.server.address() as AddressInfo).port}/beta/songs/s1/make`, { method: 'POST', body: JSON.stringify({ tier: 'none' }), headers: { cookie: `vjb=${tester.token}`, 'content-type': 'application/json' } });
  assert.equal(res.status, 202);
  for (let k = 0; k < 40 && beta.db.jobs[0].status !== 'failed'; k++) await new Promise((ok) => setTimeout(ok, 50));
  await new Promise((ok) => setTimeout(ok, 200));
  const [job] = beta.db.jobs;
  assert.equal(job.status, 'failed');
  assert.match(job.error ?? '', /無法啟動/);
  assert.ok(job.endedAt && job.unsettled && !job.pid);
  assert.equal(beta.db.jobs.length, 2);
  for (const j of beta.db.jobs) assert.equal(readEvents(root, 's1').filter((e) => e.type === 'job.ended' && e.jobId === j.id).length, 1);
  beta.server.close();
});

test('a normal stop leaves the running job running, kills its group and starts nothing else', async () => {
  const t = await runStub("echo '##PHASE 製作中'; sleep 30");
  await t.tester('/beta/songs/s1/make', { method: 'POST', body: JSON.stringify({ tier: 'img' }) });
  for (let k = 0; k < 40 && !t.beta.db.jobs[0].pid; k++) await new Promise((ok) => setTimeout(ok, 50));
  const pid = t.beta.db.jobs[0].pid!;
  t.beta.db.songs.push({ ...t.beta.db.songs[0], id: 's2' });
  t.beta.db.jobs.push({ id: 'next', userId: t.beta.db.songs[0].userId, songId: 's2', kind: 'make', tier: 'none', status: 'queued', reservedUsd: 4, priceUsd: 4, createdAt: '2999-01-01T00:00:00Z' });
  let exited = false;
  stopBeta(t.beta, () => { exited = true; }, 300);
  let gone = false;
  for (let k = 0; k < 40 && !gone; k++) {
    await new Promise((ok) => setTimeout(ok, 50));
    try { process.kill(-pid, 0); } catch { gone = true; }
  }
  await new Promise((ok) => setTimeout(ok, 900));
  try {
    assert.ok(gone, 'group still alive');
    assert.ok(exited);
    const saved = JSON.parse(readFileSync(join(t.root, 'db.json'), 'utf8')).jobs;
    assert.deepEqual([saved[0].status, saved[0].pid, saved[1].status], ['running', pid, 'queued']);
    assert.equal(t.beta.db.jobs[1].pid, undefined);
  } finally {
    try { process.kill(-pid, 'SIGKILL'); } catch { /* gone */ }
    t.beta.server.close();
  }
});

test('a saved pid from before the machine booted is never signalled', async () => {
  const bystander = spawn('sleep', ['30'], { detached: true, stdio: 'ignore' });
  const t = await runStub('exit 0');
  try {
    const { killRunning } = await import('./queue.mts');
    const old = { id: 'o', userId: 'u', songId: 's1', kind: 'make' as const, status: 'running' as const, reservedUsd: 4, pid: bystander.pid, startedAt: '2000-01-01T00:00:00Z', createdAt: '2000-01-01T00:00:00Z' };
    killRunning({ ...t.beta.db, jobs: [old] }, 100);
    await new Promise((ok) => setTimeout(ok, 300));
    process.kill(-bystander.pid!, 0); // throws if it was killed
    killRunning({ ...t.beta.db, jobs: [{ ...old, startedAt: new Date().toISOString() }] }, 100);
    await new Promise((ok) => setTimeout(ok, 300));
    assert.throws(() => process.kill(-bystander.pid!, 0));
  } finally {
    try { process.kill(-bystander.pid!, 'SIGKILL'); } catch { /* gone */ }
    t.beta.server.close();
  }
});

test('a concept job leaves queued, started, phase, cost and ended events', async () => {
  const t = await runStub("echo '##PHASE 製作中'; echo '##COST 2.5 x'");
  await t.tester('/beta/songs/s1/make', { method: 'POST', body: JSON.stringify({ tier: 'img' }) });
  for (let k = 0; k < 50 && t.beta.db.jobs[0].status !== 'done'; k++) await new Promise((ok) => setTimeout(ok, 100));
  const ev = await (await t.admin('/beta/admin/songs/s1/events')).json();
  assert.deepEqual(ev.map((e: { type: string }) => e.type), ['job.queued', 'job.started', 'job.phase', 'job.cost', 'job.ended']);
  assert.deepEqual([ev[0].kind, ev[0].tier, ev[0].priceUsd, ev[2].phase, ev[3].key, ev[3].usd, ev[4].status], ['concept', 'img', 2.5, '製作中', 'x', 2.5, 'done']);
  assert.deepEqual(ev[0].inputs, { concept: '', refs: [] });
  assert.ok(ev.every((e: { jobId: string }) => e.jobId === t.beta.db.jobs[0].id));
  t.beta.server.close();
});

test('admin logs list and read; traversal and non-admins are refused', async () => {
  const { mkdirSync, writeFileSync } = await import('node:fs');
  const t = await runStub('true');
  mkdirSync(join(t.root, 'songs/s1/runs/j'), { recursive: true });
  writeFileSync(join(t.root, 'songs/s1/runs/j/direct.log'), 'hello log');
  writeFileSync(join(t.root, 'songs/s1/runs/j/video.mp4'), 'x');
  mkdirSync(join(t.root, 'logs'), { recursive: true });
  writeFileSync(join(t.root, 'logs/jb.log'), 'job out');
  writeFileSync(join(t.root, 'logs/other.log'), 'not this song');
  t.beta.db.jobs.push({ id: 'jb', userId: 'u', songId: 's1', kind: 'make', status: 'done', reservedUsd: 1, createdAt: 'x' });
  const list = await (await t.admin('/beta/admin/songs/s1/logs')).json();
  assert.deepEqual(list.map((l: { path: string }) => l.path).sort(), ['jobs/jb.log', 'runs/j/direct.log']);
  assert.equal(list.find((l: { path: string }) => l.path === 'runs/j/direct.log').bytes, 9);
  const r = await t.admin('/beta/admin/songs/s1/logs/runs/j/direct.log');
  assert.match(r.headers.get('content-type') ?? '', /^text\/plain; charset=utf-8/);
  assert.equal(await r.text(), 'hello log');
  assert.equal(await (await t.admin('/beta/admin/songs/s1/logs/jobs/jb.log')).text(), 'job out');
  assert.equal((await t.admin('/beta/admin/songs/s1/logs/jobs/other.log')).status, 404);
  assert.equal((await t.admin('/beta/admin/songs/s1/logs/..%2F..%2Fdb.json')).status, 400);
  // the URL parser folds %2e%2e itself, so this never reaches the song's log route; it must still not serve the other log
  const dots = await t.admin('/beta/admin/songs/s1/logs/%2e%2e/%2e%2e/logs/other.log');
  assert.ok(dots.status >= 400 && !(await dots.text()).includes('not this song'));
  assert.equal((await t.admin('/beta/admin/songs/s1/logs/runs/j/video.mp4')).status, 400);
  assert.equal((await t.admin('/beta/admin/songs/s1/logs/runs/j/nope.log')).status, 404);
  assert.equal((await t.admin('/beta/admin/songs/nope/logs')).status, 404);
  assert.equal((await t.tester('/beta/admin/songs/s1/events')).status, 403);
  assert.equal((await t.tester('/beta/admin/songs/s1/logs/runs/j/direct.log')).status, 403);
  t.beta.server.close();
});

test('an event log that cannot be written does not stop the job', async () => {
  const t = await runStub("echo '##PHASE a'; echo '##COST 1 x'");
  // a folder where the event log should be: every event write fails (the concept's own run folder still can be)
  mkdirSync(join(t.root, 'songs/s1/events.jsonl'), { recursive: true });
  await t.tester('/beta/songs/s1/make', { method: 'POST', body: JSON.stringify({ tier: 'img' }) });
  for (let k = 0; k < 50 && t.beta.db.jobs[0].status !== 'done'; k++) await new Promise((ok) => setTimeout(ok, 100));
  assert.deepEqual([t.beta.db.jobs[0].status, t.beta.db.jobs[0].costUsd], ['done', 1]);
  t.beta.server.close();
});

test('an admin retry records who retried it', async () => {
  const t = await runStub('true');
  t.beta.db.jobs.push({ id: 'j1', userId: t.beta.db.songs[0].userId, songId: 's1', kind: 'make', tier: 'img', status: 'failed', reservedUsd: 6, runDir: 'runs/j1', createdAt: '2026-10-27T00:00:00Z' });
  const adminId = t.beta.db.users.find((u) => u.admin)!.id;
  const { id } = await (await t.admin('/beta/admin/jobs/j1/retry', { method: 'POST' })).json();
  const ev = await (await t.admin('/beta/admin/songs/s1/events')).json();
  const retry = ev.find((e: { type: string }) => e.type === 'admin.retry');
  assert.deepEqual([retry.by, retry.retryOf, retry.jobId], [adminId, 'j1', id]);
  assert.equal(ev.find((e: { type: string }) => e.type === 'job.queued').by, t.beta.db.songs[0].userId);
  t.beta.server.close();
});

test('a tester sees steps and price on their jobs but never the platform cost', async () => {
  const t = await setup();
  t.beta.db.jobs.push({ id: 'j1', userId: t.beta.db.users[1].id, songId: 's1', kind: 'make', tier: 'img', status: 'done', reservedUsd: 6, priceUsd: 6, costUsd: 2.5, createdAt: '2026-10-27T00:00:00Z', steps: [{ phase: '畫道具', at: '2026-10-27T00:01:00Z' }] });
  const [mine] = await (await t.tester('/beta/jobs')).json();
  assert.deepEqual(mine.steps, [{ phase: '畫道具', at: '2026-10-27T00:01:00Z' }]);
  assert.equal(mine.priceUsd, 6);
  assert.equal('costUsd' in mine, false);
  t.beta.server.close();
});

/** A root whose record shows s1's job running under a pipeline that ignores SIGTERM for 3 s (a crash left it behind). */
async function orphanRoot() {
  const root = mkdtempSync(join(tmpdir(), 'beta-'));
  const db = emptyDb();
  const admin = invite(db, 'Admin', 100, true);
  const tester = invite(db, 'Tester', 10);
  for (const [id, u] of [['s1', tester.user.id], ['s2', admin.user.id]]) db.songs.push({ id, userId: u, title: 'T', artist: 'A', language: 'ja', createdAt: '2026-10-27T00:00:00Z', confirmedAt: '2026-10-27T00:00:00Z' });
  const orphan = spawn('bash', ['-c', "trap '' TERM; echo up; sleep 3"], { detached: true, stdio: ['ignore', 'pipe', 'ignore'] });
  await new Promise((ok) => orphan.stdout.once('data', ok)); // the trap is set before any signal goes out
  const exitedAt = new Promise<number>((ok) => orphan.on('exit', () => ok(Date.now())));
  db.jobs.push({ id: 'j0', userId: tester.user.id, songId: 's1', kind: 'make', tier: 'img', status: 'running', pid: orphan.pid, startedAt: new Date().toISOString(), createdAt: '2026-10-27T00:00:00Z', reservedUsd: 6, priceUsd: 6, runDir: 'runs/j0' });
  save(join(root, 'db.json'), db);
  return { root, admin, orphan, exitedAt, kill: () => { try { process.kill(-orphan.pid!, 'SIGKILL'); } catch { /* gone */ } } };
}

test('enqueuing during the startup wait does not start a job beside the orphan', async () => {
  const o = await orphanRoot();
  try {
    const b = create({ root: o.root, publicUrl: 'https://beta.test', env: {}, command: () => 'sleep 30' });
    await new Promise<void>((ok) => b.server.listen(0, '127.0.0.1', ok));
    const r = await fetch(`http://127.0.0.1:${(b.server.address() as AddressInfo).port}/beta/songs/s2/make`, { method: 'POST', headers: { cookie: `vjb=${o.admin.token}`, 'content-type': 'application/json' }, body: JSON.stringify({ tier: 'img' }) });
    assert.equal(r.status, 202);
    assert.deepEqual(b.db.jobs.map((j) => j.status), ['queued', 'queued'], 'nothing starts while the orphan lives');
    await b.ready;
    const exited = await o.exitedAt;
    const running = b.db.jobs.find((j) => j.status === 'running')!;
    assert.ok(Date.parse(running.startedAt!) >= exited - 5, 'started after the orphan exited');
  } finally { o.kill(); }
});

test('stopBeta during the startup wait kills the waited-on orphans', async () => {
  const o = await orphanRoot();
  try {
    const b = create({ root: o.root, publicUrl: 'https://beta.test', env: {}, command: () => 'sleep 30' });
    stopBeta(b, () => {}, 50);
    const t0 = Date.now();
    await o.exitedAt;
    assert.ok(Date.now() - t0 < 1500, 'the orphan died well before its own 3 s');
  } finally { o.kill(); }
});

test('waitGone reports survivors and the server logs queue.orphan.timeout', async () => {
  const o = await orphanRoot();
  try {
    const b = create({ root: o.root, publicUrl: 'https://beta.test', env: {}, command: () => 'sleep 30', orphanWaitMs: 100 });
    await b.ready;
    const ev = readEvents(o.root, 's1').find((e) => e.type === 'queue.orphan.timeout');
    assert.deepEqual(ev?.pids, [o.orphan.pid]);
    assert.deepEqual(await waitGone([o.orphan.pid!], 50, 10), [o.orphan.pid]);
    assert.deepEqual(await waitGone([2 ** 22 + 12345], 50, 10), []);
  } finally { o.kill(); }
});

test('once the orphans have exited the server forgets their pids, so stopBeta never signals them again', async () => {
  const o = await orphanRoot();
  try {
    const b = create({ root: o.root, publicUrl: 'https://beta.test', env: {}, command: () => 'sleep 30' });
    assert.deepEqual(b.orphans, [o.orphan.pid]);
    await b.ready;
    await o.exitedAt;
    assert.deepEqual(b.orphans, []);
  } finally { o.kill(); }
});

test('a second crash during the startup wait still leaves the first orphan to be waited for', async () => {
  const o = await orphanRoot();
  try {
    const first = create({ root: o.root, publicUrl: 'https://beta.test', env: {}, command: () => 'sleep 30' });
    // the server dies here, mid-wait: nothing it does from now on reaches the record
    Object.assign(first.queue, { stopping: true, persist: () => {} });
    assert.equal(first.db.jobs[0].pid, undefined, 'the first start cleared the job pid');
    const second = create({ root: o.root, publicUrl: 'https://beta.test', env: {}, command: () => 'sleep 30' });
    assert.deepEqual(second.orphans, [o.orphan.pid], 'the orphan is known from db.orphans');
    assert.deepEqual(second.db.orphans?.map((e) => [e.pid, e.jobId]), [[o.orphan.pid, 'j0']]);
    assert.equal(second.db.jobs[0].status, 'queued', 'requeued jobs still read queued at once');
    await second.ready;
    const exited = await o.exitedAt;
    const running = second.db.jobs.find((j) => j.status === 'running')!;
    assert.ok(Date.parse(running.startedAt!) >= exited - 5, 'the rerun started only after the orphan exited');
  } finally { o.kill(); }
});

test('an orphan entry is dropped from the record once its process is gone', async () => {
  const o = await orphanRoot();
  try {
    const b = create({ root: o.root, publicUrl: 'https://beta.test', env: {}, command: () => 'sleep 30' });
    assert.deepEqual(load(join(o.root, 'db.json')).orphans?.map((e) => e.pid), [o.orphan.pid], 'persisted before the wait');
    await b.ready;
    assert.deepEqual(b.db.orphans, []);
    assert.deepEqual(load(join(o.root, 'db.json')).orphans, []);
  } finally { o.kill(); }
});

test('a queued job still starts when the orphans outlive the wait and the event log cannot be written', async () => {
  const { writeFileSync } = await import('node:fs');
  const o = await orphanRoot();
  try {
    mkdirSync(join(o.root, 'songs'), { recursive: true });
    writeFileSync(join(o.root, 'songs/s1'), 'in the way');
    const b = create({ root: o.root, publicUrl: 'https://beta.test', env: {}, command: () => 'sleep 30', orphanWaitMs: 100 });
    await b.ready;
    assert.equal(b.queue.holding, false);
    assert.equal(b.db.jobs[0].status, 'running');
    assert.deepEqual(b.orphans, [o.orphan.pid], 'a survivor stays listed for stopBeta');
  } finally { o.kill(); }
});

const waitFor = async (f: () => boolean) => { for (let k = 0; k < 80 && !f(); k++) await new Promise((ok) => setTimeout(ok, 100)); };
const makeImg = (t: Awaited<ReturnType<typeof runStub>>) => t.tester('/beta/songs/s1/make', { method: 'POST', body: JSON.stringify({ tier: 'img' }) });

test('a failed job retries once by itself; a second failure waits for the admin', async () => {
  const t = await runStub('exit 1');
  await makeImg(t);
  await waitFor(() => t.beta.db.jobs.length === 2 && t.beta.db.jobs.every((j) => j.status === 'failed'));
  await new Promise((ok) => setTimeout(ok, 300));
  const jobs = t.beta.db.jobs;
  assert.equal(jobs.length, 2);
  assert.deepEqual([jobs[1].auto, jobs[1].retryOf, jobs.map((j) => j.status)], [true, jobs[0].id, ['failed', 'failed']]);
  const ev = await (await t.admin('/beta/admin/songs/s1/events')).json();
  const types = ev.map((e: { type: string }) => e.type);
  assert.equal(types.filter((x: string) => x === 'job.autoretry').length, 1);
  assert.equal(ev.filter((e: { type: string; auto?: boolean }) => e.type === 'job.queued' && e.auto).length, 1);
  assert.equal((await (await t.tester('/beta/me')).json()).spentUsd, 0);
  t.beta.server.close();
});

test('an automatic retry that succeeds charges the price once', async () => {
  const t = await runStub('exit 1');
  t.beta.queue.command = (j) => (j.auto ? 'true' : 'exit 1');
  await makeImg(t);
  await waitFor(() => t.beta.db.jobs.length === 2 && t.beta.db.jobs[1].status === 'done');
  assert.equal((await (await t.tester('/beta/me')).json()).spentUsd, 2.5);
  t.beta.server.close();
});

test('an admin cannot retry a failed job that was already retried', async () => {
  const t = await runStub('exit 1');
  t.beta.queue.command = (j) => (j.auto ? 'true' : 'exit 1');
  await makeImg(t);
  await waitFor(() => t.beta.db.jobs.length === 2 && t.beta.db.jobs[1].status === 'done');
  const [a, b] = t.beta.db.jobs;
  const r = await t.admin(`/beta/admin/jobs/${a.id}/retry`, { method: 'POST' });
  assert.equal(r.status, 409);
  assert.equal((await r.json()).error, `已經重跑過（見 ${b.id}）`);
  assert.equal(t.beta.db.jobs.length, 2);
  t.beta.server.close();
});

test('a fuse trip and an admin hold do not auto-retry', async () => {
  const fused = await runStub("echo '##COST 13 x'; sleep 5");
  await makeImg(fused);
  await waitFor(() => fused.beta.db.jobs[0].status === 'failed');
  await new Promise((ok) => setTimeout(ok, 300));
  assert.deepEqual([fused.beta.db.jobs.length, fused.beta.db.jobs[0].fused], [1, true]);
  fused.beta.server.close();
  const held = await runStub('exit 10');
  await makeImg(held);
  await waitFor(() => held.beta.db.jobs[0].status === 'admin');
  await new Promise((ok) => setTimeout(ok, 300));
  assert.deepEqual([held.beta.db.jobs.length, held.beta.db.jobs[0].status], [1, 'admin']);
  held.beta.server.close();
});

test('an automatic retry resumes in the same run folder', async () => {
  const t = await runStub('exit 1');
  await makeImg(t);
  await waitFor(() => t.beta.db.jobs.length === 2);
  assert.ok(t.beta.db.jobs[0].runDir);
  assert.equal(t.beta.db.jobs[1].runDir, t.beta.db.jobs[0].runDir);
  t.beta.server.close();
});

test('no automatic retry when the global budget cannot cover it', async () => {
  const t = await runStub("echo '##COST 3 x'; exit 1");
  t.beta.db.globalLimitUsd = 5; // the first run may start (2.5), but after its measured 3 a retry needing 2.5 more would pass 5
  await makeImg(t);
  await waitFor(() => t.beta.db.jobs[0].status === 'failed');
  await new Promise((ok) => setTimeout(ok, 300));
  assert.equal(t.beta.db.jobs.length, 1);
  const ev = await (await t.admin('/beta/admin/songs/s1/events')).json();
  const skip = ev.filter((e: { type: string }) => e.type === 'job.autoretry.skipped');
  assert.deepEqual([skip.length, skip[0].retryOf, skip[0].reason], [1, t.beta.db.jobs[0].id, 'global-limit']);
  t.beta.server.close();
});

test('feedback: owner posts and reads; others and running jobs are refused; every report is kept', async () => {
  const t = await setup();
  const { writeFileSync, mkdirSync } = await import('node:fs');
  const owner = t.beta.db.songs[0].userId;
  const job = (id: string, status: 'done' | 'running', runDir?: string) => ({ id, userId: owner, songId: 's1', kind: 'make' as const, tier: 'none' as const, status, reservedUsd: 4, priceUsd: 4, createdAt: '2026-10-27T00:00:00Z', ...(runDir ? { runDir } : {}) });
  t.beta.db.jobs.push(job('d', 'done', 'runs/d'), job('r', 'running'));
  mkdirSync(join(t.root, 'songs/s1/runs/d'), { recursive: true });
  writeFileSync(join(t.root, 'songs/s1/runs/d/song.json'), JSON.stringify({ duration: 10 }));
  const body = (o: object) => ({ method: 'POST', body: JSON.stringify(o) });
  const good = { ok: false, marks: [{ at: 2, category: 'lyrics', note: 'n' }], suggestion: '', action: 'none' };
  const r = await t.tester('/beta/jobs/d/feedback', body(good));
  assert.equal(r.status, 201);
  assert.equal((await r.json()).userId, owner);
  assert.equal((await t.tester('/beta/jobs/d/feedback', body({ ok: true }))).status, 201);
  assert.equal((await t.tester('/beta/jobs/d/feedback', body({ ...good, marks: [{ at: 99, category: 'lyrics', note: '' }] }))).status, 400);
  assert.equal((await (await t.tester('/beta/jobs/d/feedback')).json()).length, 2);
  assert.equal((await (await t.admin('/beta/jobs/d/feedback')).json()).length, 2);
  assert.equal((await t.admin('/beta/jobs/d/feedback', body(good))).status, 404);
  assert.equal((await t.tester('/beta/jobs/r/feedback', body(good))).status, 409);
  assert.equal((await t.tester('/beta/admin/feedback')).status, 403);
  assert.equal((await (await t.admin('/beta/admin/feedback')).json()).length, 2);
  const other = invite(t.beta.db, 'Other', 10);
  const o = await fetch(`${t.base}/beta/jobs/d/feedback`, { ...body(good), headers: { cookie: `vjb=${other.token}`, 'content-type': 'application/json' } });
  assert.equal(o.status, 404);
  assert.equal((await fetch(`${t.base}/beta/jobs/d/feedback`, { headers: { cookie: `vjb=${other.token}` } })).status, 404);
  assert.equal(readEvents(t.root, 's1').filter((e) => e.type === 'feedback.submitted').length, 2);
  t.beta.server.close();
});

test('feedback: a redo is stored with its action and queues nothing', async () => {
  const t = await setup();
  const owner = t.beta.db.songs[0].userId;
  t.beta.db.jobs.push({ id: 'd', userId: owner, songId: 's1', kind: 'make', tier: 'hybrid', status: 'done', reservedUsd: 16, priceUsd: 16, createdAt: '2026-10-27T00:00:00Z', runDir: 'runs/d' });
  mkdirSync(join(t.root, 'songs/s1/runs/d'), { recursive: true });
  writeFileSync(join(t.root, 'songs/s1/runs/d/song.json'), JSON.stringify({ duration: 10 }));
  const r = await t.tester('/beta/jobs/d/feedback', { method: 'POST', body: JSON.stringify({ ok: false, marks: [{ at: 2, category: 'style', note: '' }], suggestion: '整首換個方向', action: 'redo' }) });
  assert.equal(r.status, 201);
  const f = await r.json();
  assert.deepEqual([f.action, f.tier, f.suggestion, f.fixJobId], ['redo', 'hybrid', '整首換個方向', undefined]);
  assert.deepEqual(t.beta.db.feedback.map((x) => x.action), ['redo']);
  assert.equal(t.beta.db.jobs.length, 1, 'nothing queued');
  const ev = readEvents(t.root, 's1').filter((e) => e.type === 'feedback.submitted');
  assert.deepEqual([ev.length, ev[0].action, ev[0].fixJobId], [1, 'redo', undefined]);
  t.beta.server.close();
});

test('a finished job shows its style from the treatment; a missing file shows none', async () => {
  const t = await setup();
  const { writeFileSync, mkdirSync } = await import('node:fs');
  const owner = t.beta.db.songs[0].userId;
  const job = (id: string, status: 'done' | 'running', runDir?: string) => ({ id, userId: owner, songId: 's1', kind: 'make' as const, tier: 'none' as const, status, reservedUsd: 4, priceUsd: 4, createdAt: '2026-10-27T00:00:00Z', startedAt: '2026-10-27T00:00:00Z', endedAt: '2026-10-27T00:20:00Z', ...(runDir ? { runDir } : {}) });
  t.beta.db.jobs.push(job('n', 'done', 'runs/n'), job('l', 'done'), job('m', 'done', 'runs/m'), job('x', 'running', 'runs/x'));
  const treat = JSON.stringify({ design: { language: 'silkscreen' } });
  mkdirSync(join(t.root, 'songs/s1/runs/n/base'), { recursive: true });
  writeFileSync(join(t.root, 'songs/s1/runs/n/base/treatment.json'), treat);
  mkdirSync(join(t.root, 'songs/s1/make/base'), { recursive: true });
  writeFileSync(join(t.root, 'songs/s1/make/base/treatment.json'), treat);
  const jobs = (await (await t.tester('/beta/jobs')).json()) as { id: string; style?: string; startedAt?: string }[];
  const by = (id: string) => jobs.find((j) => j.id === id)!;
  assert.equal(by('n').style, '絲網海報');
  assert.equal(by('l').style, '絲網海報');
  assert.equal(by('m').style, undefined);
  assert.equal(by('x').style, undefined);
  assert.equal(by('n').startedAt, '2026-10-27T00:00:00Z');
});

test('new feedback records the job style', async () => {
  const t = await setup();
  const { writeFileSync, mkdirSync } = await import('node:fs');
  const owner = t.beta.db.songs[0].userId;
  t.beta.db.jobs.push({ id: 'd', userId: owner, songId: 's1', kind: 'make', tier: 'none', status: 'done', reservedUsd: 4, priceUsd: 4, createdAt: '2026-10-27T00:00:00Z', runDir: 'runs/d' });
  mkdirSync(join(t.root, 'songs/s1/runs/d/base'), { recursive: true });
  writeFileSync(join(t.root, 'songs/s1/runs/d/base/treatment.json'), JSON.stringify({ design: { language: 'silkscreen' } }));
  const r = await t.tester('/beta/jobs/d/feedback', { method: 'POST', body: JSON.stringify({ ok: true }) });
  assert.equal((await r.json()).style, '絲網海報');
});

// ---- the concept gate: reference images, concept jobs, decisions, stills and the style catalog ----

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(32)]);
const PROVEN = Object.entries(LANGUAGES).filter(([, l]) => l.proven).map(([id]) => id);
const UNLISTED = Object.entries(LANGUAGES).filter(([, l]) => l.shelved).map(([id]) => id);
const CANDIDATE = Object.entries(LANGUAGES).filter(([, l]) => !l.proven && !l.shelved).map(([id]) => id);
/** The menu in catalog order: every language but the shelved ones. */
const ON_MENU = Object.keys(LANGUAGES).filter((id) => !UNLISTED.includes(id));

/**
 * A root where the tester owns confirmed song s1 and every job is a stub: a concept job writes concept.json (with the
 * given concerns), one still and the VJ_CANDIDATES it saw; a make job writes its video. `fail` picks jobs whose first
 * (non-retry) run exits 1.
 */
async function gate(o: { concerns?: string; candidateReason?: string; fail?: 'concept' | 'make'; limit?: number; slow?: { on: boolean }; make?: (run: string) => string } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'beta-'));
  const db = emptyDb();
  const admin = invite(db, 'Admin', 100, true);
  const tester = invite(db, 'Tester', o.limit ?? 50);
  const other = invite(db, 'Other', 10);
  db.songs.push({ id: 's1', userId: tester.user.id, title: 'T', artist: 'A', language: 'ja', createdAt: '2026-10-27T00:00:00Z', confirmedAt: '2026-10-27T00:00:00Z' });
  save(join(root, 'db.json'), db);
  mkdirSync(join(root, 'songs/s1'), { recursive: true });
  writeFileSync(join(root, 'songs/s1/song.json'), SONG);
  const command = (job: Job) => {
    const run = runPath(root, job);
    if (o.fail === job.kind && !job.retryOf) return 'exit 1';
    mkdirSync(join(run, 'stills'), { recursive: true });
    // a make leaves its video and a base treatment in a proven language (any other language, or none, is held for the admin)
    if (job.kind === 'make') return o.make?.(run) ?? `true${provenTreatment(run, job.tier)}; echo mp4 > '${run}/video.mp4'`;
    if (!existsSync(join(run, 'song.json'))) writeFileSync(join(run, 'song.json'), readFileSync(join(root, 'songs/s1/song.json')));
    if (o.slow?.on) return `sleep 30`;
    writeFileSync(join(run, 'stills', 'still_1.00.png'), PNG);
    writeFileSync(join(run, 'concept.json'), JSON.stringify({ language: 'silkscreen', languageName: '絲網海報', font: 'f', palette: ['#000'], concept: 'c', concerns: o.concerns ?? '', candidateReason: o.candidateReason ?? '', stills: ['still_1.00.png'] }));
    return `printf '%s' "$VJ_CANDIDATES" > '${run}/candidates.txt'; printf '%s' "$VJ_PROVEN" > '${run}/proven.txt'`;
  };
  const beta = create({ root, publicUrl: 'https://beta.test', env: {}, command });
  await new Promise<void>((ok) => beta.server.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${(beta.server.address() as AddressInfo).port}`;
  const as = (token?: string) => (path: string, init: RequestInit & { json?: unknown } = {}) =>
    fetch(base + path, { method: init.method ?? (init.json !== undefined ? 'POST' : 'GET'), body: init.json !== undefined ? JSON.stringify(init.json) : init.body, headers: { ...(token ? { cookie: `vjb=${token}` } : {}), 'content-type': (init.headers as Record<string, string>)?.['content-type'] ?? 'application/json' } });
  const put = (token: string, body: Buffer, type: string) => fetch(`${base}/beta/songs/s1/refs`, { method: 'PUT', body: new Uint8Array(body), headers: { cookie: `vjb=${token}`, 'content-type': type } });
  const done = async (id: string) => { await waitFor(() => t.beta.db.jobs.find((j) => j.id === id)?.status === 'done'); return t.beta.db.jobs.find((j) => j.id === id)!; };
  const t = { beta, root, base, port: (beta.server.address() as AddressInfo).port, admin: as(admin.token), tester: as(tester.token), other: as(other.token), anon: as(), put: (b: Buffer, type: string, token = tester.token) => put(token, b, type), otherToken: other.token, adminToken: admin.token, testerToken: tester.token, done };
  return t;
}

test('reference images: owner uploads jpg/png/webp, owner and admin read, nobody else; bad files are refused', async () => {
  const t = await gate();
  assert.deepEqual(await (await t.put(PNG, 'image/png')).json(), { name: 'ref-1.png' });
  assert.equal((await t.put(JPG, 'image/jpeg')).status, 201);
  assert.equal((await t.put(WEBP, 'image/webp')).status, 201);
  assert.deepEqual(await (await t.tester('/beta/songs/s1/refs')).json(), ['ref-1.png', 'ref-2.jpg', 'ref-3.webp']);
  assert.deepEqual(await (await t.admin('/beta/songs/s1/refs')).json(), ['ref-1.png', 'ref-2.jpg', 'ref-3.webp']);
  const got = await t.tester('/beta/songs/s1/refs/ref-1.png');
  assert.deepEqual([got.status, got.headers.get('content-type'), Buffer.from(await got.arrayBuffer()).equals(PNG)], [200, 'image/png', true]);
  assert.equal((await t.admin('/beta/songs/s1/refs/ref-2.jpg')).status, 200);
  assert.equal((await t.other('/beta/songs/s1/refs/ref-1.png')).status, 404);
  assert.equal((await t.other('/beta/songs/s1/refs')).status, 404);
  assert.equal((await t.anon('/beta/songs/s1/refs/ref-1.png')).status, 401);
  // wrong type, a fake extension (declared png, jpg bytes), text posing as an image, empty, oversized, someone else's song
  assert.equal((await t.put(PNG, 'image/gif')).status, 415);
  assert.equal((await t.put(JPG, 'image/png')).status, 415);
  assert.equal((await t.put(Buffer.from('<svg onload=alert(1)>'), 'image/jpeg')).status, 415);
  assert.equal((await t.put(Buffer.alloc(0), 'image/png')).status, 400);
  assert.equal((await t.put(Buffer.concat([PNG, Buffer.alloc(10_000_001)]), 'image/png')).status, 413);
  assert.equal((await t.put(PNG, 'image/png', t.otherToken)).status, 404);
  assert.equal((await t.put(PNG, 'image/png', t.adminToken)).status, 404, 'the admin reads but does not add');
  // names are the server's: traversal, other extensions and unknown names are not served
  for (const bad of ['..%2Fdb.json', '..%2F..%2F..%2Fdb.json', 'ref-1.png.html', 'ref-1.PNG', 'ref-9.png', 'x.png'])
    assert.equal((await t.tester(`/beta/songs/s1/refs/${bad}`)).status, 404, bad);
  assert.equal((await t.put(PNG, 'image/png')).status, 201);
  assert.equal((await t.put(PNG, 'image/png')).status, 201);
  const sixth = await t.put(PNG, 'image/png');
  assert.deepEqual([sixth.status, (await sixth.json()).error], [409, '參考圖最多 5 張']);
  // only the owner deletes; a deleted name is not reused
  assert.equal((await t.other('/beta/songs/s1/refs/ref-1.png', { method: 'DELETE' })).status, 404);
  assert.equal((await t.admin('/beta/songs/s1/refs/ref-1.png', { method: 'DELETE' })).status, 404);
  assert.equal((await t.tester('/beta/songs/s1/refs/ref-1.png', { method: 'DELETE' })).status, 204);
  assert.equal((await t.tester('/beta/songs/s1/refs/ref-1.png', { method: 'DELETE' })).status, 404);
  assert.deepEqual(await (await t.put(PNG, 'image/png')).json(), { name: 'ref-6.png' });
  t.beta.server.close();
});

test('make queues a concept job at the concept price with its inputs; the refs are copied into the run', async () => {
  const t = await gate();
  await t.put(PNG, 'image/png');
  await t.put(JPG, 'image/jpeg');
  const r = await t.tester('/beta/songs/s1/make', { json: { tier: 'img', concept: ' 溫暖的手繪感 ', style: PROVEN[0], refs: ['ref-2.jpg'] } });
  assert.equal(r.status, 202);
  const pub = await r.json();
  const job = t.beta.db.jobs.find((j) => j.id === pub.id)!;
  assert.deepEqual([job.kind, job.tier, job.priceUsd, job.runDir], ['concept', 'img', 2.5, `runs/${job.id}`]);
  assert.deepEqual(job.inputs, { concept: '溫暖的手繪感', style: PROVEN[0], refs: ['ref-2.jpg'] });
  assert.deepEqual(pub.inputs, job.inputs);
  const run = runPath(t.root, job);
  assert.deepEqual(JSON.parse(readFileSync(join(run, 'inputs.json'), 'utf8')), job.inputs);
  assert.deepEqual(readdirSync(join(run, 'refs')), ['ref-2.jpg']);
  assert.ok(readFileSync(join(run, 'refs/ref-2.jpg')).equals(JPG));
  // deleting the song's ref afterwards leaves the queued concept's copy alone
  await t.tester('/beta/songs/s1/refs/ref-2.jpg', { method: 'DELETE' });
  assert.ok(existsSync(join(run, 'refs/ref-2.jpg')));
  const queued = readEvents(t.root, 's1').find((e) => e.type === 'job.queued');
  assert.deepEqual(queued?.inputs, job.inputs);
  await t.done(job.id);
  assert.equal((await (await t.tester('/beta/me')).json()).spentUsd, 2.5);
  t.beta.server.close();
});

test('make refuses a bad tier, a long concept, a style that is not offered and refs that do not exist', async () => {
  const t = await gate();
  await t.put(PNG, 'image/png');
  const make = (b: object) => t.tester('/beta/songs/s1/make', { json: b });
  for (const b of [{}, { tier: 'gold' }, { tier: 'img', concept: 'x'.repeat(501) }, { tier: 'img', concept: 5 }, { tier: 'img', style: 'nope' }, { tier: 'img', style: UNLISTED[0] },
    { tier: 'img', refs: ['ref-9.png'] }, { tier: 'img', refs: ['../db.json'] }, { tier: 'img', refs: 'ref-1.png' }, { tier: 'img', refs: ['ref-1.png', 'ref-1.png'] }])
    assert.equal((await make(b)).status, 400, JSON.stringify(b).slice(0, 60));
  assert.equal(t.beta.db.jobs.length, 0);
  assert.equal((await make({ tier: 'img', concept: '字'.repeat(500), style: '' })).status, 202, '500 characters (not bytes) is allowed; an empty style means the director picks');
  assert.equal(t.beta.db.jobs[0].inputs?.style, undefined);
  t.beta.server.close();
});

test('accepting a concept queues the make in the same run at the tier price: concept + rest charged once', async () => {
  const t = await gate();
  const { id } = await (await t.tester('/beta/songs/s1/make', { json: { tier: 'img' } })).json();
  assert.equal((await t.tester(`/beta/jobs/${id}/accept`, { json: {} })).status, 409, 'not finished yet');
  const concept = await t.done(id);
  assert.equal((await t.other(`/beta/jobs/${id}/accept`, { json: {} })).status, 404);
  assert.equal((await t.admin(`/beta/jobs/${id}/accept`, { json: {} })).status, 404, 'only the owner decides');
  const r = await t.tester(`/beta/jobs/${id}/accept`, { json: {} });
  assert.equal(r.status, 202);
  const make = t.beta.db.jobs.find((j) => j.kind === 'make')!;
  assert.equal((await r.json()).id, make.id);
  assert.deepEqual([make.kind, make.tier, make.priceUsd, make.runDir, make.conceptOf, concept.decision], ['make', 'img', 3.5, concept.runDir, id, 'accepted']);
  assert.equal((await t.tester(`/beta/jobs/${id}/accept`, { json: {} })).status, 409, 'accepted once');
  await t.done(make.id);
  assert.equal(t.beta.db.jobs.length, 2, 'the director did not run again');
  assert.equal((await (await t.tester('/beta/me')).json()).spentUsd, 6);
  assert.equal((await t.tester(`/beta/jobs/${make.id}/video`)).status, 200);
  assert.ok(readEvents(t.root, 's1').some((e) => e.type === 'concept.accepted' && e.jobId === id));
  t.beta.server.close();
});

test('a failed accepted make auto-retries at the tier price; an admin retry keeps it too', async () => {
  const t = await gate({ fail: 'make' });
  const { id } = await (await t.tester('/beta/songs/s1/make', { json: { tier: 'img' } })).json();
  await t.done(id);
  await t.tester(`/beta/jobs/${id}/accept`, { json: {} });
  await waitFor(() => t.beta.db.jobs.length === 3 && t.beta.db.jobs[2].status === 'done');
  const [, failed, retry] = t.beta.db.jobs;
  assert.deepEqual([failed.status, retry.auto, retry.priceUsd, retry.runDir, retry.conceptOf], ['failed', true, 3.5, failed.runDir, id]);
  assert.equal((await (await t.tester('/beta/me')).json()).spentUsd, 6);
  // an admin retry of a failed accepted make (no automatic retry left) keeps the tier price
  const uid = t.beta.db.songs[0].userId;
  t.beta.db.jobs.push({ id: 'm2', userId: uid, songId: 's1', kind: 'make', tier: 'hybrid', status: 'failed', reservedUsd: 13.5, priceUsd: 13.5, runDir: `runs/${id}`, conceptOf: id, createdAt: '2026-10-27T00:00:00Z' });
  const ar = await t.admin('/beta/admin/jobs/m2/retry', { method: 'POST' });
  assert.equal(ar.status, 202);
  const again = t.beta.db.jobs.find((j) => j.retryOf === 'm2')!;
  assert.deepEqual([again.priceUsd, again.conceptOf, again.runDir], [13.5, id, `runs/${id}`]);
  t.beta.server.close();
});

test('a concept with concerns needs the extra tick to accept', async () => {
  const t = await gate({ concerns: '這個風格太熱鬧，和安靜的歌不合' });
  const { id } = await (await t.tester('/beta/songs/s1/make', { json: { tier: 'none', style: PROVEN[0] } })).json();
  await t.done(id);
  for (const b of [{}, { confirmConcerns: 'yes' }]) {
    const r = await t.tester(`/beta/jobs/${id}/accept`, { json: b });
    assert.equal(r.status, 409);
    assert.equal((await r.json()).concerns, '這個風格太熱鬧，和安靜的歌不合');
  }
  assert.deepEqual([t.beta.db.jobs.length, t.beta.db.jobs[0].decision], [1, undefined]);
  assert.equal((await t.tester(`/beta/jobs/${id}/accept`, { json: { confirmConcerns: true } })).status, 202);
  assert.equal(t.beta.db.jobs[1].priceUsd, 1.5);
  t.beta.server.close();
});

test('adjust and redo queue a new concept in a new run from the previous one; the 4th attempt is refused', async () => {
  const t = await gate();
  await t.put(PNG, 'image/png');
  const { id: a } = await (await t.tester('/beta/songs/s1/make', { json: { tier: 'img', concept: '夜晚', style: PROVEN[0], refs: ['ref-1.png'] } })).json();
  await t.done(a);
  await t.tester('/beta/songs/s1/refs/ref-1.png', { method: 'DELETE' }); // the copy in the old run carries over
  for (const note of ['', '  ', 'x'.repeat(501), 7]) assert.equal((await t.tester(`/beta/jobs/${a}/adjust`, { json: { note } })).status, 400, String(note).slice(0, 9));
  assert.equal((await t.other(`/beta/jobs/${a}/adjust`, { json: { note: '更暗' } })).status, 404);
  const r1 = await t.tester(`/beta/jobs/${a}/adjust`, { json: { note: ' 更暗一點 ' } });
  assert.equal(r1.status, 202);
  const b = (await r1.json()).id;
  const jb = t.beta.db.jobs.find((j) => j.id === b)!;
  assert.deepEqual([jb.kind, jb.priceUsd, jb.runDir, jb.inputs], ['concept', 2.5, `runs/${b}`, { concept: '夜晚', style: PROVEN[0], refs: ['ref-1.png'], note: '更暗一點', from: a }]);
  assert.ok(readFileSync(join(runPath(t.root, jb), 'refs/ref-1.png')).equals(PNG));
  assert.deepEqual(JSON.parse(readFileSync(join(runPath(t.root, jb), 'inputs.json'), 'utf8')).from, a);
  assert.equal(t.beta.db.jobs.find((j) => j.id === a)!.decision, 'adjusted');
  assert.equal((await t.tester(`/beta/jobs/${a}/redo`, { json: {} })).status, 409, 'already decided');
  await t.done(b);
  const r2 = await t.tester(`/beta/jobs/${b}/redo`, { json: {} });
  assert.equal(r2.status, 202);
  const c = (await r2.json()).id;
  const jc = t.beta.db.jobs.find((j) => j.id === c)!;
  assert.deepEqual([jc.inputs, t.beta.db.jobs.find((j) => j.id === b)!.decision], [{ concept: '夜晚', style: PROVEN[0], refs: ['ref-1.png'], from: b }, 'redone']);
  await t.done(c);
  for (const [path, body] of [[`/beta/jobs/${c}/redo`, {}], [`/beta/jobs/${c}/adjust`, { note: '再試' }]] as const) {
    const r = await t.tester(path, { json: body });
    assert.deepEqual([r.status, (await r.json()).error], [409, '這個版本已試過 3 次概念，請聯絡管理者']);
  }
  assert.equal(jc.decision, undefined, 'a refused attempt decides nothing');
  // the direct make for the same tier is refused too; another tier has its own 3
  assert.equal((await t.tester('/beta/songs/s1/make', { json: { tier: 'img' } })).status, 409);
  assert.equal((await t.tester('/beta/songs/s1/make', { json: { tier: 'none' } })).status, 202);
  t.beta.server.close();
});

test('adjust can switch to another offered style: the note becomes optional and the new job carries the style', async () => {
  const t = await gate();
  const { id: a } = await (await t.tester('/beta/songs/s1/make', { json: { tier: 'img', concept: '夜晚' } })).json();
  await t.done(a); // the concept came out as silkscreen
  const other = PROVEN.find((x) => x !== 'silkscreen')!;
  for (const style of ['silkscreen', UNLISTED[0], 'nope', 7]) assert.equal((await t.tester(`/beta/jobs/${a}/adjust`, { json: { style } })).status, 400, String(style));
  const r = await t.tester(`/beta/jobs/${a}/adjust`, { json: { note: '', style: other } });
  assert.equal(r.status, 202);
  const nextId = (await r.json()).id;
  const jb = t.beta.db.jobs.find((j) => j.id === nextId)!;
  assert.deepEqual(jb.inputs, { concept: '夜晚', style: other, refs: [], from: a });
  assert.equal(t.beta.db.jobs.find((j) => j.id === a)!.decision, 'adjusted');
  t.beta.server.close();
});

test('adjust refuses a concept whose run folder is not a run of the same song', async () => {
  const t = await gate();
  const uid = t.beta.db.songs[0].userId;
  t.beta.db.songs.push({ ...t.beta.db.songs[0], id: 's2' });
  const job = (id: string, songId: string, runDir: string) => ({ id, userId: uid, songId, kind: 'concept' as const, tier: 'img' as const, status: 'done' as const, reservedUsd: 2.5, priceUsd: 2.5, runDir, inputs: { concept: '', refs: [] }, createdAt: '2026-10-27T00:00:00Z' });
  t.beta.db.jobs.push(job('evil', 's1', 'runs/../../../s2'), job('odd', 's1', 'elsewhere/x'));
  for (const id of ['evil', 'odd']) assert.equal((await t.tester(`/beta/jobs/${id}/redo`, { json: {} })).status, 409, id);
  assert.equal(t.beta.db.jobs.length, 2);
  t.beta.server.close();
});

test('stills are served from the concept to its owner and the admin only, by the names in concept.json', async () => {
  const t = await gate();
  const { id } = await (await t.tester('/beta/songs/s1/make', { json: { tier: 'img' } })).json();
  const job = await t.done(id);
  writeFileSync(join(runPath(t.root, job), 'stills', 'secret.png'), PNG);
  const s = await t.tester(`/beta/jobs/${id}/stills/still_1.00.png`);
  assert.deepEqual([s.status, s.headers.get('content-type')], [200, 'image/png']);
  assert.equal((await t.admin(`/beta/jobs/${id}/stills/still_1.00.png`)).status, 200);
  assert.equal((await t.other(`/beta/jobs/${id}/stills/still_1.00.png`)).status, 404);
  for (const bad of ['secret.png', '..%2Fconcept.json', '..%2Finputs.json', 'nope.png']) assert.equal((await t.tester(`/beta/jobs/${id}/stills/${bad}`)).status, 404, bad);
  t.beta.server.close();
});

test('a finished concept shows its summary, decision and inputs; the candidate reason is the admin\'s only', async () => {
  const t = await gate({ candidateReason: '候選語言比較合' });
  const { id } = await (await t.tester('/beta/songs/s1/make', { json: { tier: 'img', concept: '海' } })).json();
  const queued = (await (await t.tester('/beta/jobs')).json())[0];
  assert.equal(queued.concept, undefined);
  await t.done(id);
  const [mine] = await (await t.tester('/beta/jobs')).json();
  assert.deepEqual([mine.concept.languageName, mine.concept.stills, mine.inputs.concept, mine.decision], ['絲網海報', ['still_1.00.png'], '海', undefined]);
  assert.equal('candidateReason' in mine.concept, false);
  const [adm] = await (await t.admin('/beta/admin/jobs')).json();
  assert.equal(adm.concept.candidateReason, '候選語言比較合');
  t.beta.server.close();
});

test('a failed concept job retries by itself with the same inputs and run folder, and is charged once', async () => {
  const t = await gate({ fail: 'concept' });
  await t.put(PNG, 'image/png');
  await t.tester('/beta/songs/s1/make', { json: { tier: 'img', concept: '雨', refs: ['ref-1.png'] } });
  await waitFor(() => t.beta.db.jobs.length === 2 && t.beta.db.jobs[1].status === 'done');
  const [first, retry] = t.beta.db.jobs;
  assert.deepEqual([first.status, retry.auto, retry.kind, retry.runDir, retry.inputs, retry.priceUsd], ['failed', true, 'concept', first.runDir, first.inputs, 2.5]);
  assert.equal((await (await t.tester('/beta/me')).json()).spentUsd, 2.5);
  // the retry is the concept the person decides on, still one attempt
  assert.equal((await t.tester(`/beta/jobs/${retry.id}/accept`, { json: {} })).status, 202);
  t.beta.server.close();
});

test('the style menu lists proven and candidate languages without tiers; the admin sets tiers; jobs see the candidates', async () => {
  const t = await gate();
  assert.equal((await t.anon('/beta/styles')).status, 401);
  const list = (await (await t.tester('/beta/styles')).json()) as { id: string; name: string; suits: string; image: string | null }[];
  assert.deepEqual(list.map((s) => s.id), ON_MENU);
  for (const s of list) assert.deepEqual(Object.keys(s).sort(), ['id', 'image', 'name', 'suits']);
  const withImage = list.find((s) => s.image)!;
  const img = await t.tester(withImage.image!);
  assert.deepEqual([img.status, img.headers.get('content-type')], [200, 'image/jpeg']);
  assert.equal((await t.tester(`/beta/styles/${UNLISTED[0]}/image`)).status, 404);
  assert.equal((await t.tester('/beta/styles/..%2F..%2Fbeta%2Fdb/image')).status, 404);
  // admin only: every language with its tier
  assert.equal((await t.tester('/beta/admin/styles')).status, 403);
  assert.equal((await t.tester(`/beta/admin/styles/${UNLISTED[0]}`, { method: 'PUT', json: { tier: 'candidate' } })).status, 403);
  const all = (await (await t.admin('/beta/admin/styles')).json()) as { id: string; tier: string }[];
  assert.equal(all.length, Object.keys(LANGUAGES).length);
  assert.equal(all.find((s) => s.id === UNLISTED[0])!.tier, 'unlisted');
  assert.equal((await t.admin(`/beta/admin/styles/${UNLISTED[0]}`, { method: 'PUT', json: { tier: 'gold' } })).status, 400);
  assert.equal((await t.admin('/beta/admin/styles/nope', { method: 'PUT', json: { tier: 'candidate' } })).status, 404);
  for (const id of [UNLISTED[0], UNLISTED[1]]) assert.equal((await t.admin(`/beta/admin/styles/${id}`, { method: 'PUT', json: { tier: 'candidate' } })).status, 200);
  assert.equal((await t.admin(`/beta/admin/styles/${PROVEN[0]}`, { method: 'PUT', json: { tier: 'unlisted' } })).status, 200);
  const now = ((await (await t.tester('/beta/styles')).json()) as { id: string }[]).map((s) => s.id);
  assert.ok(now.includes(UNLISTED[0]) && now.includes(UNLISTED[1]) && !now.includes(PROVEN[0]));
  assert.equal(JSON.parse(readFileSync(join(t.root, 'db.json'), 'utf8')).styles[UNLISTED[0]].tier, 'candidate');
  assert.equal((await t.tester('/beta/songs/s1/make', { json: { tier: 'img', style: PROVEN[0] } })).status, 400, 'an unlisted style cannot be picked');
  const { id } = await (await t.tester('/beta/songs/s1/make', { json: { tier: 'img', style: UNLISTED[0] } })).json();
  const job = await t.done(id);
  assert.equal(readFileSync(join(runPath(t.root, job), 'candidates.txt'), 'utf8'), Object.keys(LANGUAGES).filter((id) => CANDIDATE.includes(id) || id === UNLISTED[0] || id === UNLISTED[1]).join(','));
  // the proven set the director gets is the admin's: the unlisted one is gone
  assert.equal(readFileSync(join(runPath(t.root, job), 'proven.txt'), 'utf8'), PROVEN.slice(1).join(','));
  t.beta.server.close();
});

test('a video whose checks passed reaches the person whatever its style (a candidate\'s or an unlisted one\'s with a note for the admin); only an unreadable final treatment waits', async () => {
  const name = (id: string) => LANGUAGES[id as keyof typeof LANGUAGES].name;
  // [final img/treatment.json content, expected status, expected phase, expected autoReleased]; the base is always proven
  const cases = [
    [JSON.stringify({ design: { language: CANDIDATE[0] } }), 'done', undefined, `候選風格「${name(CANDIDATE[0])}」：檢查全過，直接交付，有空看一下`],
    [JSON.stringify({ design: { language: UNLISTED[0] } }), 'done', undefined, `已下架風格「${name(UNLISTED[0])}」：檢查全過，直接交付，有空看一下`],
    [JSON.stringify({ design: { language: 'nope' } }), 'admin', '等管理者確認：讀不到成品的設計語言', undefined],
    ['{not json', 'admin', '等管理者確認：讀不到成品的設計語言', undefined],
    ['', 'admin', '等管理者確認：讀不到成品的設計語言', undefined],
    [JSON.stringify({ design: { language: PROVEN[0] } }), 'done', undefined, undefined],
  ] as const;
  for (const [final, status, phase, released] of cases) {
    const t = await gate({ make: (run) => `mkdir -p '${run}/base' '${run}/img'; echo '${JSON.stringify({ design: { language: PROVEN[0] } })}' > '${run}/base/treatment.json'; ` + (final ? `printf '%s' '${final}' > '${run}/img/treatment.json'; ` : '') + `echo mp4 > '${run}/video.mp4'` });
    const concept = await t.done((await (await t.tester('/beta/songs/s1/make', { json: { tier: 'img' } })).json()).id);
    const { id } = await (await t.tester(`/beta/jobs/${concept.id}/accept`, { json: {} })).json();
    await waitFor(() => ['admin', 'done'].includes(t.beta.db.jobs.find((j) => j.id === id)?.status ?? ''));
    const job = t.beta.db.jobs.find((j) => j.id === id)!;
    assert.deepEqual([job.status, job.phase, job.error, job.autoReleased], [status, phase ?? job.phase, undefined, released], final || '(no final treatment)');
    if (phase) assert.equal(job.steps?.at(-1)?.phase, phase, 'the hold is a recorded step');
    // the note is the admin's: the owner's view of the job has none
    const seen = (await (await (released ? t.admin : t.tester)(`/beta/jobs`)).json()) as { id: string; autoReleased?: string }[];
    assert.equal(seen.find((x) => x.id === id)?.autoReleased, released);
    if (released) assert.equal(((await (await t.tester('/beta/jobs')).json()) as { id: string; autoReleased?: string }[]).find((x) => x.id === id)?.autoReleased, undefined);
    assert.equal((await t.tester(`/beta/jobs/${id}/video`)).status, status === 'admin' ? 404 : 200);
    if (status === 'admin') {
      assert.equal((await t.admin(`/beta/admin/jobs/${id}/approve`, { method: 'POST' })).status, 200);
      assert.equal((await t.tester(`/beta/jobs/${id}/video`)).status, 200);
    }
    t.beta.server.close();
  }
});

test('an admin retry of a legacy failed job checks the limit against what it set aside', async () => {
  const t = await gate({ limit: 5 });
  t.beta.db.jobs.push({ id: 'old', userId: t.beta.db.songs[0].userId, songId: 's1', kind: 'make', tier: 'img', status: 'failed', reservedUsd: 6, createdAt: '2026-10-27T00:00:00Z' });
  const r = await t.admin('/beta/admin/jobs/old/retry', { method: 'POST' });
  assert.equal(r.status, 409);
  assert.match((await r.json()).error, /額度不足/);
  t.beta.server.close();
});

// ---- fix round 1 ----

test('timing is locked while a concept runs; an edit after the concept blocks accept without a charge', async () => {
  const slow = { on: true };
  const t = await gate({ slow });
  const { id } = await (await t.tester('/beta/songs/s1/make', { json: { tier: 'img' } })).json();
  await waitFor(() => t.beta.db.jobs[0].status === 'running');
  slow.on = false;
  t.beta.db.jobs[0].fused = true; // the killed stub must not retry by itself
  const cues = await t.tester('/beta/songs/s1/cues', { method: 'PUT', json: { cues: [] } });
  assert.deepEqual([cues.status, (await cues.json()).error], [409, '概念製作中，時間不能再改']);
  // finish the concept by hand (the stub only sleeps), then save a timing edit straight into the song
  try { process.kill(-t.beta.db.jobs[0].pid!, 'SIGKILL'); } catch { /* gone */ }
  await waitFor(() => t.beta.db.jobs[0].status !== 'running');
  const job = t.beta.db.jobs[0];
  assert.equal(t.beta.db.jobs.length, 1);
  Object.assign(job, { status: 'done', error: undefined, fused: undefined });
  writeFileSync(join(runPath(t.root, job), 'concept.json'), JSON.stringify({ stills: [], concerns: '' }));
  writeFileSync(join(t.root, 'songs/s1/song.json'), JSON.stringify({ duration: 10, cues: [{ id: 'c1', start: 1.2, end: 2, text: 'a' }] }));
  const r = await t.tester(`/beta/jobs/${id}/accept`, { json: {} });
  assert.deepEqual([r.status, (await r.json()).error], [409, '歌詞時間已修改，請重做概念']);
  assert.deepEqual([t.beta.db.jobs.length, job.decision, (await (await t.tester('/beta/me')).json()).spentUsd], [1, undefined, 2.5]);
  // redo is still open and snapshots the new timing
  assert.equal((await t.tester(`/beta/jobs/${id}/redo`, { json: {} })).status, 202);
  t.beta.server.close();
});

test('accept without a timing edit still works after the timing is saved unchanged', async () => {
  const t = await gate();
  const { id } = await (await t.tester('/beta/songs/s1/make', { json: { tier: 'none' } })).json();
  await t.done(id);
  // rewriting the same cues (another formatting, an added field) is not an edit
  writeFileSync(join(t.root, 'songs/s1/song.json'), JSON.stringify({ ...JSON.parse(SONG), timingConfirmedAt: '2026-10-28T00:00:00Z' }, null, 2));
  assert.equal((await t.tester(`/beta/jobs/${id}/accept`, { json: {} })).status, 202);
  t.beta.server.close();
});

test('a new concept waits while a finished one of the same version is undecided; adjust and redo are allowed', async () => {
  const t = await gate();
  const { id } = await (await t.tester('/beta/songs/s1/make', { json: { tier: 'img' } })).json();
  await t.done(id);
  const r = await t.tester('/beta/songs/s1/make', { json: { tier: 'img' } });
  assert.deepEqual([r.status, (await r.json()).error], [409, '這個版本有一個概念還沒決定']);
  const other = await t.tester('/beta/songs/s1/make', { json: { tier: 'none' } });
  assert.equal(other.status, 202, 'another version is its own');
  await t.done((await other.json()).id);
  assert.equal((await t.tester(`/beta/jobs/${id}/adjust`, { json: { note: '亮一點' } })).status, 202);
  t.beta.server.close();
});

test('a decision taken while the body was read is not taken twice', async () => {
  const t = await gate();
  const { id } = await (await t.tester('/beta/songs/s1/make', { json: { tier: 'img' } })).json();
  await t.done(id);
  const [a, b] = await Promise.all([t.tester(`/beta/jobs/${id}/accept`, { json: {} }), t.tester(`/beta/jobs/${id}/redo`, { json: {} })]);
  assert.deepEqual([a.status, b.status].sort(), [202, 409]);
  assert.equal(t.beta.db.jobs.length, 2);
  t.beta.server.close();
});

test('inherited object keys are not languages', async () => {
  const t = await gate();
  assert.equal((await t.tester('/beta/songs/s1/make', { json: { tier: 'img', style: 'constructor' } })).status, 400);
  assert.equal((await t.admin('/beta/styles/constructor/image')).status, 404);
  assert.equal((await t.admin('/beta/admin/styles/constructor', { method: 'PUT', json: { tier: 'candidate' } })).status, 404);
  assert.equal((await t.admin('/beta/admin/styles/__proto__', { method: 'PUT', json: { tier: 'candidate' } })).status, 404);
  t.beta.server.close();
});

test('an upload far past the limit gets its 413 and the server keeps answering; refs are not cached', async () => {
  const t = await gate();
  const { connect } = await import('node:net');
  const got = await new Promise<string>((ok) => {
    const sock = connect(t.port, '127.0.0.1');
    let reply = '';
    let stop = false;
    sock.on('data', (d) => { reply += d; stop = true; });
    sock.on('error', () => { stop = true; });
    sock.on('close', () => ok(reply));
    sock.write(`PUT /beta/songs/s1/refs HTTP/1.1\r\nhost: x\r\ncookie: vjb=${t.testerToken}\r\ncontent-type: image/png\r\ncontent-length: 60000000\r\n\r\n`);
    // one 256 KB chunk at a time, waiting for each to drain, so the reply is read long before the 4x cut
    const chunk = Buffer.concat([PNG, Buffer.alloc(256_000)]);
    const pushMore = () => {
      if (stop || sock.destroyed) return void sock.end();
      if (sock.write(chunk)) setImmediate(pushMore);
      else sock.once('drain', pushMore);
    };
    pushMore();
  });
  assert.match(got, /^HTTP\/1\.1 413/);
  assert.equal((await t.tester('/beta/me')).status, 200);
  await t.put(PNG, 'image/png');
  assert.equal((await t.tester('/beta/songs/s1/refs/ref-1.png')).headers.get('cache-control'), 'no-store');
  t.beta.server.close();
});

// ---- fix jobs: a finished video fixed in a new run (pictures removed in a range, or the new timing re-applied) ----

const RETIMED = JSON.stringify({ duration: 10, cues: [{ id: 'c1', start: 1.3, end: 2, text: 'a' }] });
async function fixRoot(o: { slow?: boolean; limit?: number; script?: string; sameTiming?: boolean; unconfirmed?: boolean; current?: string } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'beta-'));
  const db = emptyDb();
  const admin = invite(db, 'Admin', 100, true);
  const tester = invite(db, 'Tester', o.limit ?? 50);
  db.songs.push({ id: 's1', userId: tester.user.id, title: 'T', artist: 'A', language: 'ja', createdAt: '2026-10-27T00:00:00Z', ...(o.unconfirmed ? {} : { confirmedAt: '2026-10-27T00:00:00Z' }) });
  const src = (id: string, tier: Job['tier'], runDir?: string): Job => ({ id, userId: tester.user.id, songId: 's1', kind: 'make', tier, status: 'done', reservedUsd: 3.5, priceUsd: 3.5, createdAt: '2026-10-27T00:00:00Z', ...(runDir ? { runDir } : {}) });
  db.jobs.push(src('i', 'img', 'runs/i'), src('h', 'hybrid', 'runs/h'), src('n', 'none', 'runs/n'), src('legacy', 'img'));
  save(join(root, 'db.json'), db);
  for (const r of ['i', 'h', 'n']) { mkdirSync(join(root, 'songs/s1/runs', r), { recursive: true }); writeFileSync(join(root, 'songs/s1/runs', r, 'song.json'), SONG); }
  // the person retimed the song after these videos (a timing fix needs a change)
  writeFileSync(join(root, 'songs/s1/song.json'), o.current ?? (o.sameTiming ? SONG : RETIMED));
  const seen: Job[] = [];
  const command = (job: Job) => { seen.push(job); return o.script ?? (o.slow ? 'sleep 30' : `mkdir -p '${runPath(root, job)}' && echo mp4 > '${runPath(root, job)}/video.mp4'${provenTreatment(runPath(root, job), job.tier)}`); };
  const beta = create({ root, publicUrl: 'https://beta.test', env: {}, command });
  await new Promise<void>((ok) => beta.server.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${(beta.server.address() as AddressInfo).port}`;
  const as = (token: string) => (path: string, init: { method?: string; json?: unknown } = {}) =>
    fetch(base + path, { method: init.method ?? (init.json !== undefined ? 'POST' : 'GET'), body: init.json !== undefined ? JSON.stringify(init.json) : undefined, headers: { cookie: `vjb=${token}`, 'content-type': 'application/json' } });
  return { beta, root, seen, admin: as(admin.token), tester: as(tester.token) };
}
const fixBody = (category: string, o: object = {}) => ({ ok: false, marks: [{ at: 2, category, note: '' }], suggestion: '', action: 'fix', ...o });

test('fix: a picture fix on img queues a fix job at the fix price in a fresh run, and its video is served', async () => {
  const t = await fixRoot();
  const r = await t.tester('/beta/jobs/i/feedback', { json: fixBody('picture', { marks: [{ at: 2, category: 'picture', note: '' }, { at: 5, end: 6, category: 'picture', note: 'x' }] }) });
  assert.equal(r.status, 201);
  const fb = await r.json();
  assert.equal(fb.action, 'fix');
  assert.equal(t.beta.db.feedback.length, 1);
  const fix = t.beta.db.jobs.find((j) => j.kind === 'fix')!;
  assert.ok(fix);
  assert.deepEqual([fix.tier, fix.priceUsd, fix.reservedUsd, fix.userId, fix.songId], ['img', 1, 1, t.beta.db.songs[0].userId, 's1']);
  assert.equal(fix.runDir, `runs/${fix.id}`);
  assert.notEqual(fix.runDir, 'runs/i');
  assert.deepEqual(fix.inputs, { from: 'i', kind: 'picture', ranges: [{ at: 2, end: 4 }, { at: 5, end: 6 }], feedbackId: fb.id });
  assert.equal(fb.fixJobId, fix.id);
  assert.equal(t.beta.db.feedback[0].fixJobId, fix.id);
  const q = readEvents(t.root, 's1').find((e) => e.type === 'job.queued');
  assert.deepEqual([q?.kind, q?.jobId, (q?.inputs as { kind?: string })?.kind, (q?.inputs as { feedbackId?: string })?.feedbackId], ['fix', fix.id, 'picture', fb.id]);
  const sub = readEvents(t.root, 's1').find((e) => e.type === 'feedback.submitted');
  assert.deepEqual([sub?.feedbackId, sub?.fixJobId], [fb.id, fix.id]);
  await waitFor(() => fix.status === 'done');
  assert.equal(t.seen[0].id, fix.id);
  assert.equal((await t.tester(`/beta/jobs/${fix.id}/video`)).status, 200);
  assert.equal((await t.tester('/beta/songs/s1/video/img')).status, 200);
  t.beta.server.close();
});

test('fix: timing is accepted on every tier', async () => {
  for (const id of ['n', 'h', 'i']) {
    const t = await fixRoot();
    const r = await t.tester(`/beta/jobs/${id}/feedback`, { json: fixBody('timing') });
    assert.equal(r.status, 201, id);
    const fix = t.beta.db.jobs.find((j) => j.kind === 'fix')!;
    assert.deepEqual([fix.tier, fix.priceUsd, fix.inputs?.kind, fix.inputs?.from], [t.beta.db.jobs.find((j) => j.id === id)!.tier, 1, 'timing', id]);
    t.beta.server.close();
  }
});

test('fix: refused requests queue nothing and store no report', async () => {
  const t = await fixRoot();
  const status = async (id: string, body: object) => { const r = await t.tester(`/beta/jobs/${id}/feedback`, { json: body }); return [r.status, (await r.json()).error]; };
  assert.deepEqual(await status('h', fixBody('picture')), [400, '這類問題目前只能重做或只回報']);
  assert.deepEqual(await status('n', fixBody('picture')), [400, '這類問題目前只能重做或只回報']);
  assert.deepEqual(await status('i', fixBody('lyrics')), [400, '這類問題目前只能重做或只回報']);
  assert.deepEqual(await status('legacy', fixBody('timing')), [409, '這支舊影片無法修正，請重做']);
  assert.equal(t.beta.db.feedback.length, 0);
  t.beta.server.close();
  const same = await fixRoot({ sameTiming: true });
  const r1 = await same.tester('/beta/jobs/i/feedback', { json: fixBody('timing') });
  assert.deepEqual([r1.status, (await r1.json()).error], [409, '歌詞時間沒有變更']);
  assert.equal((await same.tester('/beta/jobs/i/feedback', { json: fixBody('picture') })).status, 201, 'a picture fix needs no timing change');
  same.beta.server.close();
  const unconfirmed = await fixRoot({ unconfirmed: true });
  const r2 = await unconfirmed.tester('/beta/jobs/i/feedback', { json: fixBody('timing') });
  assert.deepEqual([r2.status, (await r2.json()).error], [409, '請先確認歌詞時間']);
  for (const x of [same, unconfirmed]) assert.equal(x.beta.db.jobs.filter((j) => j.kind === 'fix').length, x === same ? 1 : 0);
  assert.equal(unconfirmed.beta.db.feedback.length, 0);
  unconfirmed.beta.server.close();
  assert.equal(t.beta.db.jobs.filter((j) => j.kind === 'fix').length, 0);
  // the same report as 只回報 is kept
  const kept = await fixRoot();
  assert.equal((await kept.tester('/beta/jobs/h/feedback', { json: fixBody('picture', { action: 'none' }) })).status, 201);
  kept.beta.server.close();
});

test('fix: a timing fix that adds or removes a lyric line is refused (the render draws only the styled lines)', async () => {
  const added = JSON.stringify({ duration: 10, cues: [{ id: 'c1', start: 1.3, end: 2, text: 'a' }, { id: 'c2', start: 3, end: 4, text: 'b' }] });
  const removed = JSON.stringify({ duration: 10, cues: [] });
  const renamed = JSON.stringify({ duration: 10, cues: [{ id: 'c9', start: 1.3, end: 2, text: 'a' }] });
  for (const current of [added, removed, renamed]) {
    const t = await fixRoot({ current });
    const r = await t.tester('/beta/jobs/i/feedback', { json: fixBody('timing') });
    assert.deepEqual([r.status, (await r.json()).error], [409, '新增或刪除了歌詞，請重做']);
    assert.equal(t.beta.db.feedback.length, 0);
    assert.equal(t.beta.db.jobs.filter((j) => j.kind === 'fix').length, 0);
    t.beta.server.close();
  }
});

test('fix: refused while the song has a job queued or running, and over the limit', async () => {
  const t = await fixRoot({ slow: true });
  assert.equal((await t.tester('/beta/jobs/i/feedback', { json: fixBody('timing') })).status, 201);
  const fix = t.beta.db.jobs.find((j) => j.kind === 'fix')!;
  await waitFor(() => fix.status === 'running');
  fix.fused = true; // the killed stub must not retry by itself
  const again = await t.tester('/beta/jobs/n/feedback', { json: fixBody('timing') });
  assert.deepEqual([again.status, (await again.json()).error], [409, '這首歌已經在排隊或製作中']);
  assert.equal(t.beta.db.feedback.length, 1);
  // the timing stays locked while the fix runs
  const cues = await t.tester('/beta/songs/s1/cues', { method: 'PUT', json: { cues: [] } });
  assert.deepEqual([cues.status, (await cues.json()).error], [409, '影片製作中，時間不能再改']);
  try { process.kill(-fix.pid!, 'SIGKILL'); } catch { /* gone */ }
  await waitFor(() => fix.status !== 'running');
  t.beta.server.close();
  const poor = await fixRoot({ limit: 3.5 * 4 });
  const r = await poor.tester('/beta/jobs/i/feedback', { json: fixBody('timing') });
  assert.equal(r.status, 409);
  assert.match((await r.json()).error, /額度不足/);
  assert.equal(poor.beta.db.feedback.length, 0);
  poor.beta.server.close();
});

test('fix: a failed fix retries at the fix price in the same run', async () => {
  const t = await fixRoot();
  assert.equal((await t.tester('/beta/jobs/i/feedback', { json: fixBody('timing') })).status, 201);
  const fix = t.beta.db.jobs.find((j) => j.kind === 'fix')!;
  await waitFor(() => fix.status === 'done');
  Object.assign(fix, { status: 'failed' });
  const r = await t.admin(`/beta/admin/jobs/${fix.id}/retry`, { method: 'POST' });
  assert.equal(r.status, 202);
  const again = t.beta.db.jobs.find((j) => j.retryOf === fix.id)!;
  assert.deepEqual([again.kind, again.priceUsd, again.runDir, again.inputs], ['fix', 1, fix.runDir, fix.inputs]);
  t.beta.server.close();
});

test('the shell command of a fix job runs fix.sh with the source run, the kind and the ranges', () => {
  const root = '/r';
  const db = emptyDb();
  db.songs.push({ id: 's1', userId: 'u', title: 'T', artist: 'A', language: 'ja', createdAt: 'x' });
  const job = (kind: 'picture' | 'timing'): Job => ({ id: 'f1', userId: 'u', songId: 's1', kind: 'fix', tier: 'img', status: 'queued', reservedUsd: 1, priceUsd: 1, createdAt: 'x', runDir: 'runs/f1', inputs: { from: 'm1', kind, ranges: [{ at: 2, end: 4 }] } });
  const cmd = betaCommand(root);
  assert.equal(cmd(job('picture'), db), `bash scripts/lyric-vj/beta/fix.sh '/r/songs/s1' 'img' '/r/songs/s1/runs/f1' '/r/songs/s1/runs/m1' 'picture' '[{"at":2,"end":4}]'`);
  assert.match(cmd(job('timing'), db) as string, /fix\.sh .* 'timing' /);
  assert.deepEqual(cmd({ ...job('timing'), inputs: { from: '../x', kind: 'timing', ranges: [] } }, db), { error: '找不到要修正的影片' });
  assert.match(cmd({ ...job('timing'), kind: 'make' }, db) as string, /^bash scripts\/lyric-vj\/beta\/make\.sh '\/r\/songs\/s1' 'img' '\/r\/songs\/s1\/runs\/f1'$/);
});

test('fix: a fix with nothing to remove fails at no charge and does not retry by itself', async () => {
  const t = await fixRoot({ script: "echo '##PHASE 套用修正'; echo '##NORETRY 標記的範圍裡沒有可以拿掉的圖'; exit 3" });
  assert.equal((await t.tester('/beta/jobs/i/feedback', { json: fixBody('picture') })).status, 201);
  const fix = t.beta.db.jobs.find((j) => j.kind === 'fix')!;
  await waitFor(() => fix.status === 'failed');
  await new Promise((ok) => setTimeout(ok, 300));
  assert.deepEqual([fix.error, fix.noRetry], ['標記的範圍裡沒有可以拿掉的圖', true]);
  // the person sees why without the raw error text
  const seen = ((await (await t.tester('/beta/jobs')).json()) as { id: string; nothingToRemove?: boolean; error?: string }[]).find((j) => j.id === fix.id)!;
  assert.deepEqual([seen.nothingToRemove, seen.error], [true, undefined]);
  assert.equal(t.beta.db.jobs.filter((j) => j.retryOf === fix.id).length, 0);
  assert.equal(readEvents(t.root, 's1').filter((e) => e.type === 'job.autoretry').length, 0);
  t.beta.server.close();
});

test('fix: a system failure of a fix still retries by itself at the fix price', async () => {
  const t = await fixRoot({ script: 'exit 1' });
  assert.equal((await t.tester('/beta/jobs/i/feedback', { json: fixBody('picture') })).status, 201);
  const fix = t.beta.db.jobs.find((j) => j.kind === 'fix')!;
  await waitFor(() => t.beta.db.jobs.some((j) => j.retryOf === fix.id));
  const again = t.beta.db.jobs.find((j) => j.retryOf === fix.id)!;
  assert.deepEqual([again.kind, again.priceUsd, again.runDir, again.auto], ['fix', 1, fix.runDir, true]);
  await waitFor(() => again.status === 'failed');
  const seen = ((await (await t.tester('/beta/jobs')).json()) as { id: string; nothingToRemove?: boolean }[]).find((j) => j.id === again.id)!;
  assert.equal(seen.nothingToRemove, undefined);
  t.beta.server.close();
});

test('不確認直接製作: the owner skips the timing check once; song.json counts as confirmed and is marked; a later confirm clears the mark', async () => {
  const t = await setup();
  const song = t.beta.db.songs[0];
  assert.equal((await t.tester('/beta/songs/s1/timing/skip', { method: 'POST' })).status, 409, 'already confirmed');
  song.confirmedAt = undefined;
  assert.equal((await t.admin('/beta/songs/s1/timing/skip', { method: 'POST' })).status, 403, 'not the admin\'s song');
  const r = await t.tester('/beta/songs/s1/timing/skip', { method: 'POST' });
  assert.equal(r.status, 200);
  assert.ok(song.confirmedAt && song.timingSkipped);
  const file = JSON.parse(readFileSync(join(t.root, 'songs/s1/song.json'), 'utf8'));
  assert.ok(file.timingConfirmedAt && file.timingSkipped);
  assert.deepEqual(file.cues, JSON.parse(SONG).cues, 'the lines are untouched');
  assert.ok(readEvents(t.root, 's1').some((e) => e.type === 'timing.skipped'));
  const c = await t.tester('/beta/songs/s1/cues', { method: 'PUT', body: JSON.stringify({ cues: [{ id: 'c1', start: 1, end: 2 }], confirm: true }) });
  assert.equal(c.status, 200);
  assert.equal(song.timingSkipped, undefined);
  assert.equal(JSON.parse(readFileSync(join(t.root, 'songs/s1/song.json'), 'utf8')).timingSkipped, undefined);
  t.beta.server.close();
});
