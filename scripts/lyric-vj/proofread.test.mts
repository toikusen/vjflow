// npx tsx scripts/lyric-vj/proofread.test.mts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyProof } from '../../src/app/lyric-vj/timeline';
import { placeFlags, proofNote } from './proofread.mts';

test('places each flag on its line as a suggestion, never changing the text', () => {
  const cues = [{ id: 'c1', text: '期盼著那三年大雪下得一瞬間', review: ['對齊信心低'] }, { id: 'c2', text: '我再也不再你身邊' }];
  const out = placeFlags(cues, [{ id: 'c1', wrong: '下得', right: '下的', why: '' }, { id: 'c2', wrong: '不再', right: '不在', why: '' }, { id: 'c2', wrong: '沒有的字', right: 'x', why: '' }]);
  assert.equal(out[0].text, cues[0].text);
  assert.deepEqual(out[0].proof, [{ at: 8, wrong: '下得', right: '下的', why: '' }]);
  assert.deepEqual(out[0].review, ['對齊信心低', proofNote({ wrong: '下得', right: '下的' })]);
  assert.equal(out[1].proof!.length, 1);
  assert.equal(applyProof(cues[0].text, out[0].proof![0]), '期盼著那三年大雪下的一瞬間');
  assert.equal(applyProof('已經改過的歌詞', out[0].proof![0]), '已經改過的歌詞');
});
