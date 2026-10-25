// npx tsx --test scripts/lyric-vj/lessons.test.mts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { errorSet } from './lessons.mts';

test('pictures sent back join the error set; one the checker had passed counts as a miss', () => {
  const qa = { 'paint:17': { kind: 'paint' as const, id: '17', file: 'a.jpg', status: 'pass' as const, problems: [], tries: 1 }, 'pose:r1': { kind: 'pose' as const, id: 'r1', file: 'b.jpg', status: 'uncertain' as const, problems: ['x'], tries: 1 } };
  const out = errorSet({ 'paint-17': { verdict: 'redo', note: 'extra hand' }, 'pose-r1': { verdict: 'redo' }, 'paint-3': { verdict: 'ok' } }, qa);
  assert.deepEqual(out.map((e) => [e.key, e.missed]), [['paint-17', true], ['pose-r1', false]]);
});
