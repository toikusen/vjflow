// npx tsx --test scripts/lyric-vj/replan.test.mts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mergeShots, replanBrief, shotsToReplan } from './replan.mts';

const shots = [{ id: 'S1', start: 0, end: 10 }, { id: 'S2', start: 10, end: 20 }, { id: 'S3', start: 20, end: 30 }, { id: 'S4', start: 30, end: 40 }];
const plan = { format: { pace: 'held' }, shots: [
  { shot: 'S1', lyric: { template: 'quiet', side: 'left' }, cuts: [{ fx: 'motes' }] },
  { shot: 'S2', lyric: { template: 'quote', side: 'center' }, cuts: [{ fx: 'sparkle' }, { fx: 'fall' }] },
  { shot: 'S3', lyric: { template: 'stack', side: 'left' }, cuts: [{ fx: 'morph' }] },
  { shot: 'S4', lyric: { template: 'stair', side: 'right' }, cuts: [{ fx: 'path' }] },
] };

test('shotsToReplan: a point mark covers 2 s, a range mark every shot it touches, nothing outside', () => {
  assert.deepEqual(shotsToReplan(shots, [{ at: 12 }]), ['S2']);
  assert.deepEqual(shotsToReplan(shots, [{ at: 9 }]), ['S1', 'S2'], 'a point at 9 runs to 11');
  assert.deepEqual(shotsToReplan(shots, [{ at: 5, end: 25 }, { at: 35 }]), ['S1', 'S2', 'S3', 'S4']);
  assert.deepEqual(shotsToReplan(shots, [{ at: 50 }]), []);
  assert.deepEqual(shotsToReplan(shots, []), []);
});

test('replanBrief names each shot with what it was, its notes with the category, and the neighbours for continuity', () => {
  const b = replanBrief(shots, plan, [{ at: 21.7, category: 'picture', note: '橢圓變星形很怪' }, { at: 25, category: 'other' }], ['S3']);
  assert.match(b, /- S3 20\.0–30\.0s（原本：版型 stack\/left；刀 morph）/);
  assert.match(b, /· 0:21 圖片不搭：「橢圓變星形很怪」/);
  assert.match(b, /· 0:25 其他\n/);
  assert.match(b, /前後鏡頭.*S2 版型 quote\/center；刀 sparkle、fall；S4 版型 stair\/right；刀 path/);
  assert.match(b, /shots 只含 S3，/);
  assert.doesNotMatch(b, /S1 版型/, 'S1 is not a neighbour');
  assert.doesNotMatch(b, /整體意見/);
  assert.match(replanBrief(shots, plan, [{ at: 21.7 }], ['S3'], ' 插圖太深看不清 '), /整體意見（[^）]*）：「插圖太深看不清」/);
});

test('mergeShots replaces only the asked shots the fill returned with cuts, keeps order and the other fields', () => {
  const fill = { shots: [
    { shot: 'S3', lyric: { template: 'quiet', side: 'left' }, cuts: [{ fx: 'bokeh' }] },
    { shot: 'S1', lyric: { template: 'punch', side: 'center' }, cuts: [{ fx: 'flash' }] },
    { shot: 'S2', lyric: { template: 'punch', side: 'center' }, cuts: [] },
  ] };
  const r = mergeShots(plan, fill, ['S2', 'S3']);
  assert.deepEqual(r.plan.shots.map((p) => `${p.shot}:${p.lyric!.template}`), ['S1:quiet', 'S2:quote', 'S3:quiet', 'S4:stair'], 'S1 was not asked, S2 came back without cuts');
  assert.deepEqual([r.got, r.kept], [['S3'], ['S2']]);
  assert.equal(r.plan.format.pace, 'held');
  assert.equal(plan.shots[2].lyric.template, 'stack', 'the old plan is not mutated');
});
