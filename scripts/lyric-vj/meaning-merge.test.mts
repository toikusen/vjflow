// npx tsx scripts/lyric-vj/meaning-merge.test.mts
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { mergeMeaning } from './meaning-merge.mts';

test('takes only keys and moments from the overlay and records both sources', () => {
  const baseText = JSON.stringify({ reading: 'old', palette: 'tea', ground: 'grain', parts: [{ from: 'c001', tension: 0.3, fx: ['a'], what: 'x' }], keys: [] });
  const overlay = {
    reading: 'new', palette: 'frost', ground: 'flat', parts: [],
    keys: [{ cue: 'c002', phrase: '說再見', why: 'w' }],
    moments: [{ cues: ['c003'], form: 'strike', variant: 'tear', word: '破碎', evidenceCueId: 'c003', why: 'y' }],
  };
  const m = mergeMeaning(baseText, overlay, { overlay: 'o.json', model: 'claude-haiku-5-5', effort: 'medium', date: '2026-11-09' });
  assert.equal(m.reading, 'old');
  assert.equal(m.palette, 'tea');
  assert.equal(m.ground, 'grain');
  assert.deepEqual(m.parts, JSON.parse(baseText).parts);
  assert.deepEqual(m.keys, overlay.keys);
  assert.deepEqual(m.moments, overlay.moments);
  assert.deepEqual(m.source, { base: createHash('sha256').update(baseText).digest('hex'), overlay: 'o.json', model: 'claude-haiku-5-5', effort: 'medium', date: '2026-11-09' });
  assert.deepEqual(mergeMeaning(baseText, { ...overlay, keys: undefined as never, moments: undefined }, m.source).keys, []);
});
