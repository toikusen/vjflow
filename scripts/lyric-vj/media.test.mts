// npx tsx --test scripts/lyric-vj/media.test.mts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { blackSpans } from './media.mts';

test('blackSpans reads every span blackdetect printed', () => {
  const log = '[blackdetect @ 0x1] black_start:170.2 black_end:255.133 black_duration:84.9\nframe=1\n[blackdetect @ 0x1] black_start:0 black_end:3.5 black_duration:3.5';
  assert.deepEqual(blackSpans(log), [[170.2, 255.133], [0, 3.5]]);
  assert.deepEqual(blackSpans('nothing'), []);
});
