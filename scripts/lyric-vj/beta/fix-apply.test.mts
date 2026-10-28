// npx tsx --test scripts/lyric-vj/beta/fix-apply.test.mts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyPictureFix, cutSpans, type FixPlan } from './fix-apply.mts';

const cut = (beat: number, sprite: string) => ({ beat, sprite, fx: 'wall' });
const plan = (): FixPlan => ({
  shots: [
    { shot: 's1', cuts: [cut(0, 'a'), cut(2, 'b'), cut(4, ''), cut(6, 'c')] },
    { shot: 's2', cuts: [cut(0, 'd'), cut(2, 'e')] },
  ],
});
const beats = Array.from({ length: 16 }, (_, i) => i);
const timeline = (gap = 0.45) => ({ shots: [{ id: 's1', start: 0, end: 8, gap }, { id: 's2', start: 8, end: 12, gap }], beats });
const sprites = (p: FixPlan) => p.shots.flatMap((s) => s.cuts.map((c) => c.sprite));

test('cutSpans: a cut runs from its beat to the next cut that lands, or the shot end', () => {
  const spans = cutSpans(plan(), timeline());
  assert.deepEqual(spans.map((x) => [x.start, x.end]), [[0, 2], [2, 4], [4, 6], [6, 8], [8, 10], [10, 12]]);
});

test('a range removes the pictures of the cuts it overlaps, nothing else', () => {
  const p = plan();
  const r = applyPictureFix(p, [{ at: 2.5, end: 3 }], timeline());
  assert.equal(r.removed, 1);
  assert.deepEqual(sprites(r.plan), ['a', '', '', 'c', 'd', 'e']);
  assert.deepEqual(sprites(p), ['a', 'b', '', 'c', 'd', 'e'], 'the given plan is not changed');
});

test('a range without an end covers two seconds; touching edges do not overlap', () => {
  const r = applyPictureFix(plan(), [{ at: 2 }], timeline());
  assert.deepEqual(sprites(r.plan), ['a', '', '', 'c', 'd', 'e']);
  assert.equal(r.removed, 1);
});

test('ranges across shots and several ranges', () => {
  const r = applyPictureFix(plan(), [{ at: 7, end: 9 }, { at: 11, end: 11.5 }], timeline());
  assert.deepEqual(sprites(r.plan), ['a', 'b', '', '', '', '']);
  assert.equal(r.removed, 3);
});

test('a skipped next cut makes the one before it run on (held gap)', () => {
  // gap 2.5: the cut at 2 s is too soon after 0 s, so the first cut runs to 4 s
  const r = applyPictureFix(plan(), [{ at: 3, end: 3.5 }], timeline(2.5));
  assert.deepEqual(sprites(r.plan).slice(0, 2), ['', '']);
});

test('a range outside every cut removes nothing', () => {
  const r = applyPictureFix(plan(), [{ at: 20, end: 22 }], timeline());
  assert.equal(r.removed, 0);
  assert.deepEqual(sprites(r.plan), ['a', 'b', '', 'c', 'd', 'e']);
});
