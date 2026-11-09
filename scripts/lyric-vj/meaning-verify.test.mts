// npx tsx scripts/lyric-vj/meaning-verify.test.mts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Meaning } from './lineplan-core.mts';
import { applyVerdicts, type Verdict, verifyRequest } from './meaning-read.mts';

const reading: Meaning = {
  reading: '', palette: 'tea', ground: 'grain', parts: [],
  keys: [{ cue: 'c1', phrase: '說再見', why: 'a' }, { cue: 'c2', phrase: '整句都是', why: 'b' }, { cue: 'c3', phrase: '不要下雨', why: 'c' }],
  moments: [
    { cues: ['c4'], form: 'strike', variant: 'melt', word: '融化', evidenceCueId: 'c4', why: 'd' },
    { cues: ['c5'], form: 'shape', variant: 'wave', word: '海', why: 'e' },
  ],
};
const v = (id: string, verdict: 'keep' | 'drop', over: Partial<Verdict> = {}): Verdict =>
  ({ id, phraseSung: true, lineSupports: true, mapping: '非比喻', directionOk: true, wholeLineKey: false, verdict, reason: `r-${id}`, ...over });

test('a fixture response drops what the verdicts drop, overrules inconsistent keeps, and drops what has no verdict', () => {
  const fixture = JSON.parse(JSON.stringify({ verdicts: [
    v('k0', 'keep'), v('k0', 'drop'),
    v('k1', 'drop', { wholeLineKey: true }),
    v('k2', 'keep', { lineSupports: false }),
    v('m0', 'keep', { directionOk: false }),
  ] })) as { verdicts: Verdict[] };
  const { meaning, dropped } = applyVerdicts(reading, fixture.verdicts);
  assert.deepEqual(meaning.keys, [reading.keys[0]]);
  assert.deepEqual(meaning.moments, []);
  assert.deepEqual(dropped, [
    { id: 'k1', why: 'drop: r-k1' },
    { id: 'k2', why: 'keep overruled: line does not support it' },
    { id: 'm0', why: 'keep overruled: direction wrong' },
    { id: 'm1', why: 'no verdict' },
  ]);
  assert.equal(meaning.palette, 'tea');
});

test('the request names every candidate once and allows only those ids', () => {
  const { prompt, schema, ids } = verifyRequest({ title: 't', cues: [{ id: 'c1', start: 0, end: 1, text: '說再見' }] }, reading);
  assert.deepEqual(ids, ['k0', 'k1', 'k2', 'm0', 'm1']);
  assert.match(prompt, /m0 moment strike\/melt｜句 c4（證據句 c4）｜word「融化」/);
  assert.match(prompt, /m1 moment shape\/wave｜句 c5（證據句 c5）/);
  assert.deepEqual((schema as { properties: { verdicts: { items: { properties: { id: { enum: string[] } } } } } }).properties.verdicts.items.properties.id.enum, ids);
});
