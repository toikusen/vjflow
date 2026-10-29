// npx tsx --test scripts/lyric-vj/bind-sprites.test.mts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bindSprites, clampSize } from './bind-sprites.mts';

const cut = (beat: number) => ({ beat, fx: 'wall', words: ['a'], sprite: '', size: 0.85, heart: false, dark: false, cam: '', flash: '', transition: '' });
const plan = { format: { pace: 'held' }, shots: [{ shot: 's1', lyric: { template: 'punch', side: 'left' }, cuts: [cut(0), cut(4)] }, { shot: 's2', lyric: { template: 'stair', side: 'right' }, cuts: [cut(0)] }] };
const sprites = [{ id: 'cat.black_sit' }, { id: 'moon.crescent' }];

test('an assignment fills only its cut\'s sprite and size; everything else in the plan stays as accepted', () => {
  const r = bindSprites(plan, [{ shot: 's1', beat: 4, sprite: 'cat.black_sit', size: 0.9 }, { shot: 's2', beat: 0, sprite: 'moon.crescent', size: 2.5 }], sprites);
  assert.deepEqual([r.applied, r.ignored], [2, []]);
  assert.deepEqual(r.plan.shots[0].cuts[1], { ...cut(4), sprite: 'cat.black_sit', size: 0.9 });
  assert.deepEqual(r.plan.shots[1].cuts[0], { ...cut(0), sprite: 'moon.crescent', size: 1.7 }, 'size clamped to what the renderer draws');
  assert.deepEqual(r.plan.shots[0].cuts[0], cut(0), 'an unassigned cut keeps no sprite');
  assert.deepEqual([r.plan.format, r.plan.shots[0].lyric], [plan.format, plan.shots[0].lyric]);
  assert.equal(plan.shots[0].cuts[1].sprite, '', 'the accepted plan itself is untouched');
});

test('an unknown shot, beat or sprite is dropped and named, never invented', () => {
  const r = bindSprites(plan, [{ shot: 's9', beat: 0, sprite: 'cat.black_sit', size: 1 }, { shot: 's1', beat: 2, sprite: 'cat.black_sit', size: 1 }, { shot: 's1', beat: 0, sprite: 'dog', size: 1 }], sprites);
  assert.deepEqual([r.applied, r.ignored], [0, ['s9@0 cat.black_sit', 's1@2 cat.black_sit', 's1@0 dog']]);
  assert.deepEqual(r.plan, plan);
});

test('clampSize: the renderer\'s range, a missing size is the default figure', () => {
  assert.deepEqual([clampSize(0.1), clampSize(3), clampSize(undefined), clampSize('0.6')], [0.4, 1.7, 0.85, 0.6]);
});
