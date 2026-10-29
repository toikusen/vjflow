// npx tsx --test scripts/lyric-vj/beta/server-audit.test.mts
// The 2026-10-29 audit's server fixes, each against a real server on an ephemeral port.
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
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

/** A raw request whose body the test sends by hand; `reply` resolves with the response text once the server answers. */
function rawRequest(port: number, head: string) {
  const sock = connect(port, '127.0.0.1');
  let reply = '';
  const done = new Promise<string>((ok) => { sock.on('data', (d) => { reply += d; }); sock.on('close', () => ok(reply)); sock.on('error', () => ok(reply)); });
  sock.write(head);
  return { sock, reply: () => { sock.end(); return done; }, text: () => reply };
}

// ---- C6: a timing save is checked once its body has arrived ----

test('cues: a concept that starts while the body is still arriving refuses the save', async () => {
  const t = await setup();
  const body = JSON.stringify({ cues: [] });
  const req = rawRequest(t.port, `PUT /beta/songs/s1/cues HTTP/1.1\r\nhost: x\r\ncookie: vjb=${t.testerToken}\r\ncontent-type: application/json\r\ncontent-length: ${Buffer.byteLength(body)}\r\nconnection: close\r\n\r\n`);
  await new Promise((ok) => setTimeout(ok, 200)); // the handler has passed the point where it used to check
  const make = await t.tester('/beta/songs/s1/make', { json: { tier: 'none' } });
  assert.equal(make.status, 202);
  await waitFor(() => t.beta.db.jobs[0]?.status === 'running');
  const before = JSON.parse(await (await t.tester('/beta/songs/s1/timing')).text());
  req.sock.write(body);
  const reply = await req.reply();
  assert.match(reply, /^HTTP\/1\.1 409/);
  assert.match(reply, /概念製作中/);
  assert.deepEqual(JSON.parse(await (await t.tester('/beta/songs/s1/timing')).text()), before, 'the timing was not written');
});

// ---- FB-B4: an upload the client abandons leaves no half file ----

test('audio: an upload cut mid-body leaves no upload file, and the server keeps serving', async () => {
  const t = await setup();
  const req = rawRequest(t.port, `PUT /beta/songs/s1/audio HTTP/1.1\r\nhost: x\r\ncookie: vjb=${t.testerToken}\r\ncontent-type: audio/mpeg\r\ncontent-length: 100000\r\n\r\n`);
  req.sock.write(Buffer.alloc(1000, 1));
  await new Promise((ok) => setTimeout(ok, 200));
  req.sock.destroy();
  await new Promise((ok) => setTimeout(ok, 300));
  assert.deepEqual(readdirSync(t.dir).filter((f) => f.startsWith('upload.')), []);
  assert.equal(t.beta.db.jobs.length, 0, 'no prep was queued');
  assert.equal((await t.tester('/beta/me')).status, 200);
});

test('saveBody: a cut before the file is even open leaves no file behind', async () => {
  const { saveBody } = await import('./server.mts');
  const { PassThrough } = await import('node:stream');
  const dir = mkdtempSync(join(tmpdir(), 'savebody-'));
  const file = join(dir, 'upload.mp3');
  const req = Object.assign(new PassThrough(), { complete: false }) as unknown as import('node:http').IncomingMessage;
  const saved = saveBody(req, file, 1000);
  req.destroy(); // 'close' follows on the next tick, before the write stream's open has completed
  await assert.rejects(saved, /上傳中斷/);
  await new Promise((ok) => setTimeout(ok, 300));
  assert.ok(!existsSync(file), 'the open that completed after the cut created the file again');
});

// ---- NEW (review): two uploads at once for one song ----

test('audio: of two overlapping uploads one is taken and one refused; the taken file is whole and alone', async () => {
  const t = await setup();
  const head = (type: string, len: number) => `PUT /beta/songs/s1/audio HTTP/1.1\r\nhost: x\r\ncookie: vjb=${t.testerToken}\r\ncontent-type: ${type}\r\ncontent-length: ${len}\r\nconnection: close\r\n\r\n`;
  const a = rawRequest(t.port, head('audio/mpeg', 6));
  const b = rawRequest(t.port, head('audio/wav', 6));
  a.sock.write('aaa'); b.sock.write('bbb');
  await new Promise((ok) => setTimeout(ok, 200)); // both passed the checks and are writing
  a.sock.write('aaa');
  await new Promise((ok) => setTimeout(ok, 200));
  b.sock.write('bbb');
  await new Promise((ok) => setTimeout(ok, 200));
  const [ra, rb] = await Promise.all([a.reply(), b.reply()]);
  assert.match(ra, /^HTTP\/1\.1 202/);
  assert.match(rb, /^HTTP\/1\.1 409/);
  assert.match(rb, /已經上傳過音檔/);
  assert.deepEqual(readdirSync(t.dir).filter((f) => /upload/.test(f)), ['upload.mp3']);
  assert.equal(readFileSync(join(t.dir, 'upload.mp3'), 'utf8'), 'aaaaaa');
  assert.equal(t.beta.db.jobs.filter((j) => j.kind === 'prep').length, 1);
});

// ---- FB-B5: a new upload after a failed prep replaces what the old one left ----

test('audio: after a failed prep a new upload removes the old upload, mix, stems and song.json', async () => {
  const t = await setup();
  t.beta.db.jobs.push({ id: 'p0', userId: t.beta.db.songs[0].userId, songId: 's1', kind: 'prep', status: 'failed', reservedUsd: 0.5, priceUsd: 0.5, createdAt: '2026-10-28T00:00:00Z' });
  // the stems, the alignment caches song.mts resumes from (asr/force per stem, mms_alt) and the timing
  for (const f of ['upload.aac', 'vocals.wav', 'vocals_kim.wav', 'asr.json', 'asr_alt.json', 'force.json', 'force_alt.json', 'force_main.json', 'force_main_alt.json', 'mms_alt.json', 'stage_main.json', 'song.orig.json', 'proofread.log']) writeFileSync(join(t.dir, f), 'old');
  const r = await t.tester('/beta/songs/s1/audio', { method: 'PUT', body: Buffer.from('new mp3'), headers: { 'content-type': 'audio/mpeg' } });
  assert.equal(r.status, 202);
  assert.deepEqual(readdirSync(t.dir).filter((f) => f !== 'events.jsonl').sort(), ['upload.mp3']);
  assert.equal(t.beta.db.songs[0].confirmedAt, undefined);
  assert.equal(t.beta.db.jobs.at(-1)?.kind, 'prep');
});

// ---- FB-B8: admin amounts are finite numbers, zero or more ----

test('admin: a limit that is not a finite number is refused rather than read as 0 or saved as null', async () => {
  const t = await setup();
  for (const bad of [null, '', true, 'Infinity', -1, 'abc', [5]]) {
    const r = await t.admin('/beta/admin/users', { json: { name: 'N', limitUsd: bad } });
    assert.equal(r.status, 400, `invite with ${JSON.stringify(bad)}`);
    const g = await t.admin('/beta/admin/limit', { method: 'PUT', json: { globalLimitUsd: bad } });
    assert.equal(g.status, 400, `global limit ${JSON.stringify(bad)}`);
  }
  assert.equal(t.beta.db.users.length, 2);
  assert.equal(t.beta.db.globalLimitUsd, 100);
  const tester = t.beta.db.users[1];
  const patch = await t.admin(`/beta/admin/users/${tester.id}`, { method: 'PATCH', json: { limitUsd: null } });
  assert.deepEqual([patch.status, tester.limitUsd], [400, 50]);
  assert.equal((await t.admin(`/beta/admin/users/${tester.id}`, { method: 'PATCH', json: { limitUsd: 0 } })).status, 200);
  assert.equal(tester.limitUsd, 0);
  assert.equal((await t.admin('/beta/admin/users', { json: { name: 'N', limitUsd: 20 } })).status, 201);
  assert.equal((await t.admin('/beta/admin/limit', { method: 'PUT', json: { globalLimitUsd: 250 } })).status, 200);
  assert.equal(t.beta.db.globalLimitUsd, 250);
});
