// npx tsx --test scripts/lyric-vj/beta/server.test.mts
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createBetaServer, stopBeta } from './server.mts';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { invite, save, emptyDb, runPath } from './store.mts';

async function setup() {
  const root = mkdtempSync(join(tmpdir(), 'beta-'));
  const db = emptyDb();
  const admin = invite(db, 'Admin', 100, true);
  const tester = invite(db, 'Tester', 10);
  db.songs.push({ id: 's1', userId: tester.user.id, title: 'T', artist: 'A', language: 'ja', createdAt: '2026-10-27T00:00:00Z', confirmedAt: '2026-10-27T00:00:00Z' });
  save(join(root, 'db.json'), db);
  const beta = createBetaServer({ root, publicUrl: 'https://beta.test', env: {}, command: (job) => `mkdir -p '${runPath(root, job)}' && echo mp4 > '${runPath(root, job)}/video.mp4'; echo '##PHASE 製作中'; echo '##COST 2.5'` });
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
  assert.deepEqual([job.status, job.phase, job.costUsd], ['done', '製作中', 2.5]);
  // $10 limit, $2.50 spent: the $16 hybrid reserve is refused
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
  const { id } = await r.json();
  const job = t.beta.db.jobs.find((j) => j.id === id)!;
  assert.equal(job.runDir, `runs/${id}`);
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
  const beta = createBetaServer({ root, publicUrl: 'https://beta.test', env: {}, command: (job) => `mkdir -p '${runPath(root, job)}' && echo mp4 > '${runPath(root, job)}/video.mp4'; echo '##COST 1'` });
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
  const beta = createBetaServer({ root, publicUrl: 'https://beta.test', env: {}, command: () => script });
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
  assert.deepEqual([job.status, job.error, job.priceUsd], ['failed', '成本超過上限，已通知管理者', 6]);
  assert.ok(Date.now() - t0 < 4000);
  assert.equal((await (await t.tester('/beta/me')).json()).spentUsd, 0);
  t.beta.server.close();
});

test('a failed job records the step it was in as unsettled', async () => {
  const t = await runStub("echo '##PHASE 畫道具'; echo '##COST 1.5 x'; exit 1");
  await t.tester('/beta/songs/s1/make', { method: 'POST', body: JSON.stringify({ tier: 'img' }) });
  for (let k = 0; k < 40 && t.beta.db.jobs[0].status !== 'failed'; k++) await new Promise((ok) => setTimeout(ok, 100));
  const jobs = await (await t.admin('/beta/admin/jobs')).json();
  assert.equal(jobs[0].unsettled, '畫道具');
  assert.equal(jobs[0].priceUsd, 6);
  assert.equal((await (await t.admin('/beta/admin/users')).json()).platformSpentUsd, 1.5);
  t.beta.server.close();
});

test('a pipeline orphaned by a crash is stopped when the server starts again, and the job reruns', async () => {
  const t = await runStub("echo '##PHASE 製作中'; sleep 30");
  await t.tester('/beta/songs/s1/make', { method: 'POST', body: JSON.stringify({ tier: 'img' }) });
  for (let k = 0; k < 40 && !t.beta.db.jobs[0].pid; k++) await new Promise((ok) => setTimeout(ok, 50));
  const pid = t.beta.db.jobs[0].pid!;
  assert.ok(pid > 0);
  process.kill(-pid, 0); // alive
  // a crash: the first server's record stays on disk with the job running; a second server starts on it
  const root = t.root;
  t.beta.server.close();
  const second = createBetaServer({ root, publicUrl: 'https://beta.test', env: {}, command: () => 'sleep 30' });
  let gone = false;
  for (let k = 0; k < 40 && !gone; k++) {
    await new Promise((ok) => setTimeout(ok, 50));
    try { process.kill(-pid, 0); } catch { gone = true; }
  }
  const newPid = second.db.jobs[0].pid;
  try {
    assert.ok(gone, 'old process group still alive');
    assert.equal(second.db.jobs[0].status, 'running');
    assert.notEqual(newPid, pid);
  } finally {
    // stop the rerun's group and the first server's group; only pids this test started
    for (const p of [pid, newPid]) if (p) try { process.kill(-p, 'SIGKILL'); } catch { /* gone */ }
    second.server.close();
    await new Promise((ok) => setTimeout(ok, 200));
  }
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

test('a make job leaves queued, started, phase, cost and ended events', async () => {
  const t = await runStub("echo '##PHASE 製作中'; echo '##COST 2.5 x'");
  await t.tester('/beta/songs/s1/make', { method: 'POST', body: JSON.stringify({ tier: 'img' }) });
  for (let k = 0; k < 50 && t.beta.db.jobs[0].status !== 'done'; k++) await new Promise((ok) => setTimeout(ok, 100));
  const ev = await (await t.admin('/beta/admin/songs/s1/events')).json();
  assert.deepEqual(ev.map((e: { type: string }) => e.type), ['job.queued', 'job.started', 'job.phase', 'job.cost', 'job.ended']);
  assert.deepEqual([ev[0].kind, ev[0].tier, ev[0].priceUsd, ev[2].phase, ev[3].key, ev[3].usd, ev[4].status], ['make', 'img', 6, '製作中', 'x', 2.5, 'done']);
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
