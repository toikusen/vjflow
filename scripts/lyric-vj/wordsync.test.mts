// npx tsx --test scripts/lyric-vj/wordsync.test.mts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planLinesOf, planWordSync } from './wordsync.mts';

const cues = [
  { id: 'c020', start: 76.32, end: 79.3, text: '快使用雙截棍 哼哼哈兮' },
  { id: 'c021', start: 79.7, end: 82.8, text: '快使用雙截棍 哼哼哈兮' },
  { id: 'c024', start: 90, end: 94, text: '夜晚的橋邊在飄雪' },
  { id: 'c025', start: 94.2, end: 97, text: '算不清過了幾個冬天' },
];
const times = new Map(cues.map((c) => [c.id, { times: [...c.text].map((_, i) => +(c.start + 0.2 * i).toFixed(3)), source: 'vote' as const, votes: 2 }]));
const plan = () => ({ shots: [
  { shot: 's1', lyric: { template: 'punch' }, lines: [{ cue: 'c020', enter: 'fade' }] },
  { shot: 's2', lyric: { template: 'build-cut' }, lines: [{ cue: 'c021', enter: 'cut' }] },
  { shot: 's3', lyric: { template: 'stack' }, lines: [{ cue: 'c024', enter: 'fade', handoff: { kind: 'push' } }, { cue: 'c025', enter: 'fade' }] },
] });

test('reads what the plan made of each line', () => {
  const l = planLinesOf(plan());
  assert.deepEqual(l.get('c020'), { split: false, together: false, handoff: false });
  assert.deepEqual(l.get('c021'), { split: true, together: false, handoff: false });
  assert.deepEqual(l.get('c024'), { split: false, together: true, handoff: true });
});

test('writes the kept lines onto the plan and leaves the rest as they were', () => {
  const p = plan();
  const { kept, dropped } = planWordSync(p, cues, [{ cue: 'c020', why: '口令' }, { cue: 'c021', why: '口令' }, { cue: 'c024', why: '飄' }], times);
  assert.deepEqual(kept.map((k) => k.cue), ['c020']);
  assert.equal(dropped.length, 2);
  const l20 = p.shots[0].lines[0];
  assert.equal(l20.reveal, 'sung');
  assert.equal(l20.sung?.length, [...'快使用雙截棍 哼哼哈兮'].length);
  assert.equal(p.shots[1].lines[0].reveal, undefined);
  assert.equal(p.shots[2].lines[0].sung, undefined);
});
