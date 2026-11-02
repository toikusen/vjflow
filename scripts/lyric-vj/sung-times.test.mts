// npx tsx --test scripts/lyric-vj/sung-times.test.mts
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { loadAlignments, sungTimesOf } from './sung-times.mts';
import { buildMoments, withMoments } from './moments.mts';

const dir = mkdtempSync(join(tmpdir(), 'sung-'));
const line = (text: string, starts: number[], p = 0.8) => ({ text, start: starts[0], end: starts.at(-1)! + 0.2, words: [...text].map((ch, i) => ({ text: ch, start: starts[i], end: starts[i] + 0.1, p })) });
writeFileSync(join(dir, 'force_main_alt.json'), JSON.stringify({ model: 'turbo', lines: [line('夜晚的橋邊在飄雪', [44.2, 44.4, 44.7, 44.9, 45.2, 45.7, 46.1, 46.5])] }));
writeFileSync(join(dir, 'force_main.json'), JSON.stringify({ model: 'turbo', lines: [line('夜晚的橋邊在飄雪', [40, 40.2, 40.4, 40.6, 40.8, 41, 41.2, 41.4], 0.05)] }));
writeFileSync(join(dir, 'mms_alt.json'), 'not json');
const songFile = join(dir, 'song.json');
const song = { title: 't', cues: [{ id: 'c008', start: 44.1, end: 47.1, text: '夜晚的橋邊在飄雪' }, { id: 'c009', start: 47.3, end: 50, text: '那一年的冬天' }] };
writeFileSync(songFile, JSON.stringify(song));

test('loads the alignments that parse, in order of trust', () => {
  const a = loadAlignments(dir);
  assert.deepEqual(a.map((x) => x.lines.length), [1, 1]);
});

test('times a line from the trusted alignment and spreads the rest evenly', () => {
  const t = sungTimesOf(song, songFile, false);
  assert.equal(t.get('c008')!.source, 'aligned');
  assert.equal(t.get('c008')!.times[7], 46.5);
  assert.equal(t.get('c009')!.source, 'even');
});

test('builds a moment on them and puts it on a treatment without the line\'s small tier', () => {
  const { kept, dropped } = buildMoments(song, songFile, [{ cues: ['c008'], form: 'shape', variant: 'fall', word: '雪', why: '' }]);
  assert.equal(dropped.length, 0);
  assert.equal(kept[0].at, 46.5);
  const tr = withMoments({ cues: [{ cueId: 'c008', fine: { kind: 'rule' }, hit: 'tile' }, { cueId: 'c009', fine: { kind: 'rule' } }] }, kept);
  assert.equal(tr.cues[0].fine, undefined);
  assert.equal(tr.cues[0].hit, undefined);
  assert.ok(tr.cues[1].fine);
  assert.equal(tr.signature.length, 1);
});
