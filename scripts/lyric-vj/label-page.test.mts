// npx tsx --test scripts/lyric-vj/label-page.test.mts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { labelId, personPictures } from './label-page.mts';

test('a run\'s person pictures are its people poses and people frames, every kept version', () => {
  const spec = { sprites: [{ id: 'he', who: ['he'], shows: '' }, { id: 'leaf', who: [], shows: '' }], shots: [{ frame: 3, subject: 'people' }, { frame: 4, subject: 'object' }] } as never;
  const files: Record<string, string[]> = { 'r/spr': ['he.jpg', 'he.reject0.jpg', 'leaf.jpg', 'he.png'], r: ['paint_3.jpg', 'paint_3.recheck.jpg', 'paint_4.jpg', 'paint_3.subreject0.jpg'] };
  assert.deepEqual(personPictures('r', spec, (d) => files[d] ?? []), ['r/spr/he.jpg', 'r/spr/he.reject0.jpg', 'r/paint_3.jpg', 'r/paint_3.recheck.jpg']);
});

test('a label id names the run and the file in document-id characters', () => {
  assert.equal(labelId('out/research/snowSBW2/spr/he.reject0.jpg'), 'snowSBW2~he.reject0.jpg');
  assert.equal(labelId('out/research/taimeiBW2/paint_3.jpg'), 'taimeiBW2~paint_3.jpg');
});
