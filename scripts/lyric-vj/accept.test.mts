// npx tsx scripts/lyric-vj/accept.test.mts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { framesFor, report, stageFrames } from './accept.mts';

test('an event is judged just before it and once played out, inside the clip', () => {
  assert.ok(framesFor(40, 34.5, 75).every((x, i) => Math.abs(x - [39.7, 41.1][i]) < 1e-9));
  assert.deepEqual(framesFor(34.6, 34.5, 75), [34.5, 35.7]);
  const [a, b] = framesFor(74.9, 34.5, 75);
  assert.ok(Math.abs(a - 74.6) < 1e-9 && Math.abs(b - 74.95) < 1e-9);
});

test('each check reads on its own line, a miss says why', () => {
  const [ok, miss] = report([
    { event: { at: 38.1, kind: 'stamp', look: '' }, seen: '蓋章', photos: '香爐', lyric: 'clear', match: true, why: '' },
    { event: { at: 58.5, kind: 'loosen', look: '' }, seen: '沒有變化', photos: '看不出', lyric: 'partly', match: false, why: '照片沒有歪' },
  ]);
  assert.ok(ok.startsWith('✓ 38.1 s stamp'));
  assert.ok(miss.startsWith('✗') && miss.endsWith('不符：照片沒有歪'));
});

test('a stage is seen as frames spread evenly through it, ends included', () => {
  assert.deepEqual(stageFrames(54.6, 57.1), [54.6, 55.1, 55.6, 56.1, 56.6, 57.1]);
});
