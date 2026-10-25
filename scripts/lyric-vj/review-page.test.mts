// npx tsx --test scripts/lyric-vj/review-page.test.mts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { confirmOrder, parts } from './review-page.mts';

test('a song is cut into parts of about 50 s that cover it end to end', () => {
  const p = parts(236);
  assert.equal(p.length, 5);
  assert.equal(p[0][0], 0);
  assert.equal(p.at(-1)![1], 236);
  for (let i = 1; i < p.length; i++) assert.equal(p[i][0], p[i - 1][1]);
});

test('doubts come first, then substitutes and dropped poses, then the pictures that passed', () => {
  const e = (id: string, status: 'pass' | 'uncertain' | 'substitute') => ({ kind: 'paint' as const, id, file: '', status, problems: [], tries: 1 });
  assert.deepEqual(confirmOrder([e('a', 'pass'), e('b', 'substitute'), e('c', 'uncertain')]).map((x) => x.id), ['c', 'b', 'a']);
});
