import { describe, expect, it } from 'vitest';
import { fineShown } from './fine-tier';

// The fine tier is set in the lyric face, bold, against the line's block: any words in it read as lyrics. Only the
// line's own sung words keep their text; unsung words (a director's note, the song's title, a part name) are dropped
// and the hairline stays.
describe('fineShown: no unsung words beside a sung line', () => {
  const sung = 'ああこんなにも君は僕を夢中にさせてたって思い出すよ';
  it('drops a legacy note of every kind (scene, chapter, echo, singer), keeping the hairline', () => {
    for (const text of ['凌晨三點・月台', '一・海辺の問い', '風の匂い', '阿花']) expect(fineShown({ kind: 'note', text }, sung)).toEqual({ kind: 'rule', text: '' });
    // (a note is dropped even when its words happen to be sung: it is the director's, not the line's)
    expect(fineShown({ kind: 'note', text: '夢中' }, sung)).toEqual({ kind: 'rule', text: '' });
  });
  it('drops the song\'s title and a part name the line does not sing', () => {
    expect(fineShown({ kind: 'title', text: '黄昏サイクル' }, sung)).toEqual({ kind: 'rule', text: '' });
    expect(fineShown({ kind: 'section', text: '副歌' }, sung)).toEqual({ kind: 'rule', text: '' });
  });
  it('keeps the line\'s own key phrase, and a title the line sings', () => {
    expect(fineShown({ kind: 'key', text: '夢中' }, sung)).toEqual({ kind: 'key', text: '夢中' });
    expect(fineShown({ kind: 'title', text: '思い出す' }, sung)).toEqual({ kind: 'title', text: '思い出す' });
    expect(fineShown({ kind: 'key', text: '君 僕' }, '君と僕')).toEqual({ kind: 'rule', text: '' });
  });
  it('keeps a bare hairline as it is', () => {
    expect(fineShown({ kind: 'rule', text: '' }, sung)).toEqual({ kind: 'rule', text: '' });
  });
});
