// npx tsx --test scripts/lyric-vj/beta/server-audit.test.mts
// The 2026-10-29 audit's server fixes, each against a real server on an ephemeral port.
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { connect } from 'node:net';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { killRunning } from './queue.mts';
import { createBetaServer } from './server.mts';
import { emptyDb, invite, save, type Job } from './store.mts';

const started: ReturnType<typeof createBetaServer>[] = [];
after(() => {
  for (const b of started) {
    b.queue.stopping = true;
    killRunning(b.db, 0);
    b.server.closeAllConnections();
    b.server.close();
  }
});

const SONG = JSON.stringify({ duration: 10, cues: [{ id: 'c1', start: 1, end: 2, text: 'a' }] });
const MIX = Buffer.from('0123456789abcdef');
const waitFor = async (f: () => boolean) => { for (let k = 0; k < 80 && !f(); k++) await new Promise((ok) => setTimeout(ok, 100)); };

/** A server with one tester's song (its song.json and a 16-byte mix.mp3); `command` is the stub every job runs. */
async function setup(command: (job: Job) => string = () => 'sleep 30') {
  const root = mkdtempSync(join(tmpdir(), 'beta-audit-'));
  const db = emptyDb();
  const admin = invite(db, 'Admin', 100, true);
  const tester = invite(db, 'Tester', 50);
  db.songs.push({ id: 's1', userId: tester.user.id, title: 'T', artist: 'A', language: 'ja', createdAt: '2026-10-27T00:00:00Z', confirmedAt: '2026-10-27T00:00:00Z' });
  save(join(root, 'db.json'), db);
  const dir = join(root, 'songs/s1');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'song.json'), SONG);
  writeFileSync(join(dir, 'mix.mp3'), MIX);
  const beta = createBetaServer({ root, publicUrl: 'https://beta.test', env: {}, command });
  started.push(beta);
  await new Promise<void>((ok) => beta.server.listen(0, '127.0.0.1', ok));
  const port = (beta.server.address() as AddressInfo).port;
  const base = `http://127.0.0.1:${port}`;
  const as = (token: string) => (path: string, init: RequestInit & { json?: unknown } = {}) =>
    fetch(base + path, { method: init.method ?? (init.json !== undefined ? 'POST' : 'GET'), body: init.json !== undefined ? JSON.stringify(init.json) : init.body, headers: { cookie: `vjb=${token}`, 'content-type': 'application/json', ...(init.headers as Record<string, string> | undefined) } });
  return { beta, root, dir, port, base, admin: as(admin.token), tester: as(tester.token), testerToken: tester.token };
}

// ---- C1: a range the file cannot satisfy is a 416, never a 206 followed by a crash ----

test('audio: an unsatisfiable Range is answered 416 before any header, and the server keeps serving', async () => {
  const t = await setup();
  const get = (range: string) => t.tester('/beta/songs/s1/audio/mix', { headers: { range } });
  const backwards = await get('bytes=1-0');
  assert.deepEqual([backwards.status, backwards.headers.get('content-range')], [416, `bytes */${MIX.length}`]);
  assert.equal((await get(`bytes=${MIX.length}-`)).status, 416, 'a start at the file size');
  assert.equal((await get('bytes=500-600')).status, 416, 'a start past the file');
  const ok = await get('bytes=2-5');
  assert.deepEqual([ok.status, ok.headers.get('content-range'), await ok.text()], [206, `bytes 2-5/${MIX.length}`, '2345']);
  const tail = await get('bytes=14-');
  assert.deepEqual([tail.status, await tail.text()], [206, 'ef']);
  const past = await get('bytes=10-999');
  assert.deepEqual([past.status, await past.text()], [206, 'abcdef'], 'an end past the file is clipped, as before');
  assert.equal((await t.tester('/beta/me')).status, 200, 'the process is still up');
});

// ---- FB-B3: a read stream that fails ends that response, not the process ----

test('audio: a file that cannot be read ends the response and the server keeps serving', { skip: process.getuid?.() === 0 ? 'root reads anything' : false }, async () => {
  const t = await setup();
  chmodSync(join(t.dir, 'mix.mp3'), 0o000);
  try {
    // the open fails after the 200 went out: the connection is cut, which fetch reports as a failure or an empty body
    const r = await t.tester('/beta/songs/s1/audio/mix').then((res) => res.text().then((body) => ({ status: res.status, body }))).catch(() => undefined);
    assert.ok(r === undefined || r.body === '', JSON.stringify(r));
    assert.equal((await t.tester('/beta/me')).status, 200, 'the process is still up');
  } finally {
    chmodSync(join(t.dir, 'mix.mp3'), 0o644);
  }
});
