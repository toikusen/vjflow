// npx tsx --test scripts/lyric-vj/beta/store.test.mts
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { emptyDb, invite, Job, load, nextJob, refuse, requeueRunning, save, spent, userByToken } from './store.mts';

const job = (o: Partial<Job>): Job => ({ id: 'j', userId: 'u', songId: 's', kind: 'make', tier: 'none', status: 'done', reservedUsd: 4, createdAt: '2026-10-27T00:00:00Z', ...o });

test('an invite link logs its person in; only the hash is stored', () => {
  const db = emptyDb();
  const { user, token } = invite(db, 'A', 25);
  assert.equal(userByToken(db, token)?.id, user.id);
  assert.equal(userByToken(db, 'wrong'), undefined);
  assert.ok(!JSON.stringify(db).includes(token));
  user.disabled = true;
  assert.equal(userByToken(db, token), undefined);
});

test('a job is refused when its reserve would pass the person or the beta limit', () => {
  const db = emptyDb();
  const { user } = invite(db, 'A', 20);
  assert.equal(refuse(db, user.id, 'make', 'hybrid'), undefined);
  db.jobs.push(job({ userId: user.id, tier: 'hybrid', reservedUsd: 16, status: 'running' }));
  assert.match(refuse(db, user.id, 'make', 'img') ?? '', /額度不足/);
  assert.equal(refuse(db, user.id, 'make', 'none'), undefined);
  // the measured cost replaces the reserve
  db.jobs[0].costUsd = 10.5;
  assert.equal(spent(db, user.id), 10.5);
  assert.equal(refuse(db, user.id, 'make', 'img'), undefined);
  db.globalLimitUsd = 12;
  assert.match(refuse(db, user.id, 'make', 'img') ?? '', /總額度/);
});

test('one job runs at a time, oldest first, and a restart puts the running one back', () => {
  const db = emptyDb();
  db.jobs.push(job({ id: 'b', status: 'queued', createdAt: '2026-10-27T02:00:00Z' }), job({ id: 'a', status: 'queued', createdAt: '2026-10-27T01:00:00Z' }));
  assert.equal(nextJob(db)?.id, 'a');
  db.jobs[1].status = 'running';
  assert.equal(nextJob(db), undefined);
  requeueRunning(db);
  assert.equal(nextJob(db)?.id, 'a');
});

test('the store survives a save and load', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'beta-')), 'db.json');
  const db = emptyDb();
  invite(db, 'A', 25);
  save(file, db);
  assert.deepEqual(load(file), db);
});

test('the job keys come from KEY=value files', async () => {
  const { keyEnv } = await import('./queue.mts');
  const { writeFileSync } = await import('node:fs');
  const dir = mkdtempSync(join(tmpdir(), 'keys-'));
  writeFileSync(join(dir, 'a.env'), 'A_KEY=one\nexport B_KEY="two"\n# note\n');
  writeFileSync(join(dir, 'skip.txt'), 'C_KEY=no');
  assert.deepEqual(keyEnv(dir), { A_KEY: 'one', B_KEY: 'two' });
});
