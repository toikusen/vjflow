// npx tsx --test scripts/lyric-vj/beta/store.test.mts
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { PROVEN_LANGUAGES } from '../../../src/app/lyric-vj/languages';
import { charged, conceptAttempts, emptyDb, PRICE, priceFor, TIER_TOTAL, invite, Job, load, nextJob, platformSpent, provenIds, refuse, requeueRunning, retryJob, runPath, trackOrphans, styleTier, styleOffered, candidateIds, save, spent, userByToken, videoFile } from './store.mts';

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
  assert.match(refuse(db, user.id, 'make', 'img', 's', TIER_TOTAL('img')) ?? '', /額度不足/);
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

test('videoFile and runPath fall back to the song folder for legacy jobs', () => {
  assert.equal(runPath('/r', job({ songId: 's' })), '/r/songs/s');
  assert.equal(videoFile('/r', job({ songId: 's', tier: 'img' })), '/r/songs/s/video-img.mp4');
  assert.equal(runPath('/r', job({ songId: 's', runDir: 'runs/j' })), '/r/songs/s/runs/j');
  assert.equal(videoFile('/r', job({ songId: 's', runDir: 'runs/j' })), '/r/songs/s/runs/j/video.mp4');
});

test('users pay the fixed price; failed jobs are free; the platform pays the measured cost', () => {
  const db = emptyDb(); const { user } = invite(db, 'A', 20);
  db.jobs.push(job({ userId: user.id, tier: 'img', priceUsd: 6, costUsd: 3.62, status: 'done' }));
  db.jobs.push(job({ userId: user.id, tier: 'img', priceUsd: 6, costUsd: 1.1, status: 'failed' }));
  db.jobs.push(job({ userId: user.id, tier: 'none', priceUsd: 4, status: 'running' }));
  assert.equal(spent(db, user.id), 10);
  assert.equal(platformSpent(db), 3.62 + 1.1 + 4);
});

test('a legacy job without priceUsd is charged as before, and a failed one is free', () => {
  const db = emptyDb(); db.jobs.push(job({ reservedUsd: 6, costUsd: 3.62 }));
  assert.equal(spent(db), 3.62);
  db.jobs.push(job({ reservedUsd: 6, costUsd: 2, status: 'failed' }));
  assert.equal(spent(db), 3.62);
});

test('a queued or running job counts the larger of its price and its cost so far for the platform', () => {
  const db = emptyDb();
  db.jobs.push(job({ priceUsd: 4, costUsd: 0.5, status: 'running' }));
  assert.equal(platformSpent(db), 4);
  db.jobs[0].costUsd = 5;
  assert.equal(platformSpent(db), 5);
  db.jobs[0].status = 'done';
  db.jobs[0].costUsd = 0.5;
  assert.equal(platformSpent(db), 0.5);
});

test('retryJob copies the run and price, links retryOf, and the user pays once', () => {
  const db = emptyDb(); const { user } = invite(db, 'A', 20);
  const failed = job({ id: 'f', userId: user.id, tier: 'img', priceUsd: 6, reservedUsd: 6, runDir: 'runs/f', status: 'failed', costUsd: 2 });
  db.jobs.push(failed);
  const r = retryJob(db, failed, { auto: true });
  assert.deepEqual([r.userId, r.songId, r.kind, r.tier, r.runDir, r.priceUsd, r.reservedUsd, r.retryOf, r.auto, r.status], [user.id, 's', 'make', 'img', 'runs/f', 6, 6, 'f', true, 'queued']);
  assert.notEqual(r.id, 'f');
  assert.ok(db.jobs.includes(r));
  assert.equal(retryJob(db, failed, { auto: false }).auto, undefined);
  db.jobs.pop(); r.status = 'done';
  assert.equal(spent(db, user.id), 6);
});

test('prices split into concept and the rest; a stop after the concept pays only the concept', () => {
  assert.deepEqual(PRICE, { prep: 0.5, concept: 2.5, fix: 1, none: 1.5, img: 3.5, hybrid: 13.5 });
  assert.equal(priceFor('fix', 'hybrid'), 1);
  assert.equal(priceFor('concept', 'img'), 2.5);
  assert.equal(priceFor('make', 'img'), 3.5);
  assert.equal(priceFor('prep'), 0.5);
  assert.equal(TIER_TOTAL('img'), 6);
  assert.equal(TIER_TOTAL('none'), 4);
  assert.equal(TIER_TOTAL('hybrid'), 16);
});

test('conceptAttempts: a system failure never uses up an attempt, and attempts count per tier', () => {
  const db = emptyDb();
  const c = (o: Partial<Job>) => job({ kind: 'concept', tier: 'img', ...o });
  db.jobs.push(c({ id: 'a', status: 'failed' }), c({ id: 'a2', status: 'done', retryOf: 'a' }));
  assert.equal(conceptAttempts(db, 's', 'img'), 1);
  db.jobs.push(c({ id: 'b', status: 'failed' }), c({ id: 'b2', status: 'failed', retryOf: 'b' }));
  assert.equal(conceptAttempts(db, 's', 'img'), 1);
  db.jobs.push(c({ id: 'n', tier: 'none' }), c({ id: 'o', songId: 'other' }));
  assert.equal(conceptAttempts(db, 's', 'img'), 1);
  assert.equal(conceptAttempts(db, 's', 'none'), 1);
});

test('conceptAttempts: a retry of a retry that succeeds uses the attempt; a chain that failed throughout does not', () => {
  const db = emptyDb();
  const c = (o: Partial<Job>) => job({ kind: 'concept', tier: 'img', ...o });
  // the job failed, its automatic retry failed, the admin's retry of that retry succeeded
  db.jobs.push(c({ id: 'a', status: 'failed' }), c({ id: 'a2', status: 'failed', retryOf: 'a', auto: true }), c({ id: 'a3', status: 'done', retryOf: 'a2' }));
  assert.equal(conceptAttempts(db, 's', 'img'), 1);
  db.jobs.push(c({ id: 'b', status: 'failed' }), c({ id: 'b2', status: 'failed', retryOf: 'b', auto: true }), c({ id: 'b3', status: 'failed', retryOf: 'b2' }));
  assert.equal(conceptAttempts(db, 's', 'img'), 1);
  db.jobs.push(c({ id: 'c', status: 'failed' }), c({ id: 'c2', status: 'failed', retryOf: 'c' }), c({ id: 'c3', status: 'queued', retryOf: 'c2' }));
  assert.equal(conceptAttempts(db, 's', 'img'), 2, 'a chain still running counts');
});

test('a concept is refused unless the whole version (concept and make) fits the limit; an explicit price still wins', () => {
  const db = emptyDb();
  const { user } = invite(db, 'A', 3);
  // $3 pays the concept alone, not the 故事版 it starts
  assert.equal(refuse(db, user.id, 'concept', 'hybrid', 's'), `額度不足：剩 $3.00，完成這個版本需要 $${TIER_TOTAL('hybrid').toFixed(2)}`);
  assert.equal(refuse(db, user.id, 'concept', 'img', 's'), `額度不足：剩 $3.00，完成這個版本需要 $${TIER_TOTAL('img').toFixed(2)}`);
  user.limitUsd = TIER_TOTAL('none');
  assert.equal(refuse(db, user.id, 'concept', 'none', 's'), undefined);
  // the admin's retry of a failed concept passes the job's own price: the concept fee alone
  user.limitUsd = 3;
  assert.equal(refuse(db, user.id, 'concept', 'hybrid', 's', PRICE.concept), undefined);
  // the make after an accepted concept is charged its own part only
  db.jobs.push(job({ userId: user.id, kind: 'concept', tier: 'none', priceUsd: PRICE.concept, reservedUsd: PRICE.concept, status: 'done' }));
  user.limitUsd = TIER_TOTAL('none');
  assert.equal(refuse(db, user.id, 'make', 'none', 's'), undefined);
  // the beta's own budget counts the concept step alone (each step is checked as it is spent)
  db.jobs.length = 0;
  user.limitUsd = 100;
  db.globalLimitUsd = PRICE.concept;
  assert.equal(refuse(db, user.id, 'concept', 'hybrid', 's'), undefined);
  db.globalLimitUsd = PRICE.concept - 0.01;
  assert.match(refuse(db, user.id, 'concept', 'hybrid', 's') ?? '', /總額度/);
});

test('the 4th concept for a song and tier is refused', () => {
  const db = emptyDb();
  const { user } = invite(db, 'A', 100);
  for (const id of ['1', '2', '3']) db.jobs.push(job({ id, userId: user.id, kind: 'concept', tier: 'img' }));
  assert.equal(refuse(db, user.id, 'concept', 'img', 's'), '這個版本已試過 3 次概念，請聯絡管理者');
  assert.equal(refuse(db, user.id, 'concept', 'none', 's'), undefined);
  assert.equal(refuse(db, user.id, 'concept', 'img', 'other'), undefined);
});

test('a legacy make job keeps its stored price', () => {
  assert.equal(charged(job({ priceUsd: 6 })), 6);
  assert.equal(charged(job({ priceUsd: undefined, costUsd: 2.2 })), 2.2);
});

test('retryJob carries a concept job\'s inputs and a make job\'s accepted concept', () => {
  const db = emptyDb();
  const inputs = { concept: '雨', refs: ['ref-1.png'], from: 'a' };
  assert.deepEqual(retryJob(db, job({ id: 'c', kind: 'concept', tier: 'img', status: 'failed', inputs }), { auto: true }).inputs, inputs);
  assert.equal(retryJob(db, job({ id: 'm', kind: 'make', tier: 'img', status: 'failed', conceptOf: 'c' }), { auto: true }).conceptOf, 'c');
});

test('style tiers default to proven, unlisted for a shelved language and candidate otherwise; the admin overrides them', () => {
  const db = emptyDb();
  assert.equal(styleTier(db, 'silkscreen'), 'proven');
  assert.equal(styleTier(db, 'cel80s'), 'unlisted');
  assert.deepEqual([styleTier(db, 'terminal'), styleOffered(db, 'terminal'), styleOffered(db, 'cel80s')], ['candidate', true, false]);
  assert.equal(styleOffered(db, 'nope'), false);
  db.styles = { cel80s: { tier: 'candidate' }, terminal: { tier: 'unlisted' }, silkscreen: { tier: 'unlisted' } };
  assert.deepEqual([styleTier(db, 'cel80s'), styleOffered(db, 'cel80s'), styleOffered(db, 'terminal'), styleOffered(db, 'silkscreen')], ['candidate', true, false, false]);
  assert.ok(candidateIds(db).includes('cel80s') && !candidateIds(db).includes('terminal'));
  // the proven set at run time: silkscreen unlisted drops out, a promoted language comes in
  assert.ok(!provenIds(db).includes('silkscreen') && provenIds(db).length === PROVEN_LANGUAGES.length - 1);
  db.styles.cel80s = { tier: 'proven' };
  assert.ok(provenIds(db).includes('cel80s') && !candidateIds(db).includes('cel80s'));
});

test('a db saved before db.orphans existed loads, and trackOrphans merges old entries with running jobs', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'store-')), 'db.json');
  const old = emptyDb();
  old.jobs.push({ id: 'j1', userId: 'u', songId: 's', kind: 'make', tier: 'img', status: 'running', pid: 42, startedAt: '2026-10-28T01:00:00Z', createdAt: '2026-10-28T00:00:00Z', reservedUsd: 6 } as Job);
  save(file, old);
  const db = load(file);
  assert.equal(db.orphans, undefined);
  db.orphans = [{ pid: 7, jobId: 'j0', since: '2026-10-28T00:30:00Z' }, { pid: 8, jobId: 'jx', since: '2026-10-27T00:00:00Z' }];
  const boot = Date.parse('2026-10-28T00:00:00Z');
  assert.deepEqual(trackOrphans(db, boot).map((e) => e.pid), [7, 42], 'an entry from before boot is dropped; the running job is added');
  assert.deepEqual(trackOrphans(db, boot).map((e) => e.pid), [7, 42], 'no duplicates on a second pass');
});
