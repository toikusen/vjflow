// npx tsx scripts/lyric-vj/refs-watch.test.mts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fresh, kittenjamEntries } from './refs-watch.mts';

test('lists only the entries not seen before', () => {
  const js = `const ITEMS=[\n{"id": 1, "zh": "閃電砸落", "en": "Lightning Strike", "desc": "重重砸下", "comp": "text"},\n{"id": 2, "zh": "雷射切斷", "en": "Laser Cut", "desc": "一刀兩斷", "comp": "text"}\n];`;
  const all = kittenjamEntries(js);
  assert.deepEqual(all.map((x) => x.id), ['1', '2']);
  assert.deepEqual(fresh(all, ['1']).map((x) => x.name), ['雷射切斷 / Laser Cut [text]']);
  assert.equal(fresh(all).length, 2);
});
