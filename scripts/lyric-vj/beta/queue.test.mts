// npx tsx --test scripts/lyric-vj/beta/queue.test.mts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readLine } from './queue.mts';
import type { Job } from './store.mts';

test('phases are timed once each and costs count once per key', () => {
  const j = { id: 'j', status: 'running' } as Job;
  const t = ['T1', 'T2', 'T3'];
  readLine(j, '##PHASE 導演規劃段落與故事', () => t[0]);
  readLine(j, '##PHASE 導演規劃段落與故事', () => t[1]);
  readLine(j, '##COST 2.021 direct', () => t[1]);
  readLine(j, '##COST 2.021 direct', () => t[2]);
  readLine(j, '##PHASE 畫道具', () => t[2]);
  readLine(j, '##COST 0.5', () => t[2]);
  assert.deepEqual(j.steps, [{ phase: '導演規劃段落與故事', at: 'T1' }, { phase: '畫道具', at: 'T3' }]);
  assert.equal(j.costUsd, 2.521);
  assert.equal(j.costs!.length, 2);
});

test('return value says whether anything changed; unkeyed costs number per phase and survive a restart', () => {
  const j = { id: 'j', status: 'running' } as Job;
  assert.equal(readLine(j, '##PHASE a'), true);
  assert.equal(readLine(j, '##PHASE a'), false);
  assert.equal(readLine(j, '##COST 1 k'), true);
  assert.equal(readLine(j, '##COST 1 k'), false);
  assert.equal(readLine(j, 'noise'), false);
  readLine(j, '##COST 1');
  readLine(j, '##COST 1');
  readLine(j, '##PHASE b');
  readLine(j, '##COST 1');
  assert.deepEqual(j.costs!.map((c) => c.key), ['k', 'phase:a#1', 'phase:a#2', 'phase:b#1']);
  assert.deepEqual(j.costs!.map((c) => c.phase), ['a', 'a', 'a', 'b']);
  assert.equal(j.costUsd, 4);
});

test('a ##NORETRY line marks the job and becomes its error', () => {
  const j = { id: 'j', status: 'running' } as Job;
  assert.equal(readLine(j, '##NORETRY 標記的範圍裡沒有可以拿掉的圖'), true);
  assert.deepEqual([j.noRetry, j.error], [true, '標記的範圍裡沒有可以拿掉的圖']);
});

// ---- C2: a fuse that trips as the process exits still ends the job failed and unpaid ----

const ran = async (script: string) => {
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { emptyDb, charged } = await import('./store.mts');
  const { pump } = await import('./queue.mts');
  const db = emptyDb();
  const job: Job = { id: 'j', userId: 'u', songId: 's', kind: 'concept', tier: 'img', status: 'queued', reservedUsd: 2.5, priceUsd: 2.5, createdAt: '2026-10-29T00:00:00Z' };
  db.jobs.push(job);
  const events: string[] = [];
  pump({ db, persist: () => {}, command: () => script, logDir: mkdtempSync(join(tmpdir(), 'queue-')), env: {}, onEvent: (_j, e) => events.push(e.type) });
  for (let k = 0; k < 50 && job.status === 'running'; k++) await new Promise((ok) => setTimeout(ok, 100));
  return { job, events, charged: charged(job) };
};

test('a cost past the fuse printed right before exit 0 ends the job failed, fused and charged nothing', async () => {
  // SIGTERM is ignored, so close() sees exit code 0 whatever the fuse's kill did: the exit-0 path, never the killed one
  const r = await ran("trap '' TERM; echo '##COST 13 x'; exit 0");
  assert.deepEqual([r.job.status, r.job.fused, r.job.error, r.charged], ['failed', true, '成本超過上限，已通知管理者', 0]);
  assert.ok(r.events.indexOf('job.fused') < r.events.indexOf('job.ended'));
});

test('the last line without a newline goes through the fuse too', async () => {
  const r = await ran("printf '##COST 13 x'");
  assert.deepEqual([r.job.status, r.job.fused, r.job.costUsd, r.charged], ['failed', true, 13, 0]);
});

test('guard (passes before the fix too): a cost under the fuse with exit 0 is still a done job at its price', async () => {
  const r = await ran("echo '##COST 4 x'; exit 0");
  assert.deepEqual([r.job.status, r.job.fused, r.charged], ['done', undefined, 2.5]);
});
