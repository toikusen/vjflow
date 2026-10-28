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
