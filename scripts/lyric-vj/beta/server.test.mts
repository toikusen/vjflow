// npx tsx --test scripts/lyric-vj/beta/server.test.mts
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createBetaServer } from './server.mts';
import { invite, save, emptyDb } from './store.mts';

async function setup() {
  const root = mkdtempSync(join(tmpdir(), 'beta-'));
  const db = emptyDb();
  const admin = invite(db, 'Admin', 100, true);
  const tester = invite(db, 'Tester', 10);
  db.songs.push({ id: 's1', userId: tester.user.id, title: 'T', artist: 'A', language: 'ja', createdAt: '2026-10-27T00:00:00Z', confirmedAt: '2026-10-27T00:00:00Z' });
  save(join(root, 'db.json'), db);
  const beta = createBetaServer({ root, publicUrl: 'https://beta.test', env: {}, command: () => `echo '##PHASE 製作中'; echo '##COST 2.5'` });
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
