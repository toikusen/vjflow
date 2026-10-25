// npx tsx --test scripts/lyric-vj/bench-hands.test.mts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { score } from './bench-hands.mts';

test('a checker is scored by the bad hands it passed, the good ones it failed and its runs disagreeing', () => {
  assert.deepEqual(score([
    { truth: 'bad', runs: ['fail', 'fail'] },
    { truth: 'bad', runs: ['pass', 'fail'] },
    { truth: 'ok', runs: ['fail', 'fail'] },
    { truth: 'ok', runs: ['pass', 'pass'] },
  ]), { bad: 2, ok: 2, missed: 1, falseReject: 1, disagree: 1 });
});
