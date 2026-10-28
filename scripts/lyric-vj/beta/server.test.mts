// npx tsx --test scripts/lyric-vj/beta/server.test.mts
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { createBetaServer, stopBeta } from './server.mts';
import { killRunning, waitGone } from './queue.mts';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { readEvents } from './events.mts';
import { invite, save, emptyDb, runPath } from './store.mts';

// every server and job a test starts is stopped when the file ends, so a failed assertion cannot leave the process hanging
const started: ReturnType<typeof createBetaServer>[] = [];
const create = (o: Parameters<typeof createBetaServer>[0]) => { const b = createBetaServer(o); started.push(b); return b; };
after(() => {
  for (const b of started) {
    b.queue.stopping = true;
    killRunning(b.db, 0);
    b.server.closeAllConnections();
    b.server.close();
  }
});

async function setup() {
  const root = mkdtempSync(join(tmpdir(), 'beta-'));
  const db = emptyDb();
  const admin = invite(db, 'Admin', 100, true);
  const tester = invite(db, 'Tester', 10);
  db.songs.push({ id: 's1', userId: tester.user.id, title: 'T', artist: 'A', language: 'ja', createdAt: '2026-10-27T00:00:00Z', confirmedAt: '2026-10-27T00:00:00Z' });
  save(join(root, 'db.json'), db);
  const beta = create({ root, publicUrl: 'https://beta.test', env: {}, command: (job) => `mkdir -p '${runPath(root, job)}' && echo mp4 > '${runPath(root, job)}/video.mp4'; echo '##PHASE 製作中'; echo '##COST 2.5'` });
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
  const beta = create({ root, publicUrl: 'https://beta.test', env: {}, command: (job) => `mkdir -p '${runPath(root, job)}' && echo mp4 > '${runPath(root, job)}/video.mp4'; echo '##COST 1'` });
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
  assert.deepEqual([job.status, job.error, job.priceUsd], ['failed', '成本超過上限，已通知管理者', 6]);
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
  assert.equal(jobs[0].priceUsd, 6);
  assert.equal((await (await t.admin('/beta/admin/users')).json()).platformSpentUsd, 3); // the failed run and its automatic retry
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
  assert.deepEqual([fused?.costUsd, fused?.priceUsd], [13, 6]);
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

test('a song folder that cannot be written does not stop the job', async () => {
  const { writeFileSync } = await import('node:fs');
  const t = await runStub("echo '##PHASE a'; echo '##COST 1 x'");
  // a file where the song folder should be: every event write fails
  mkdirSync(join(t.root, 'songs'), { recursive: true });
  writeFileSync(join(t.root, 'songs/s1'), 'in the way');
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
  assert.equal((await (await t.tester('/beta/me')).json()).spentUsd, 6);
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
  t.beta.db.globalLimitUsd = 8; // the first run may start (6), but after its measured 3 a retry needing 6 more would pass 8
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
