import { describe, expect, it } from 'vitest';
import { ALL_LABEL_TEXT, byLang, headOf, LABEL_LANGS, LABELS, labelLangOf, labelOf, langOfEnv, PART_LABELS, partLabelOf, say } from './labels';
import { PART_LABEL } from './song-parts';

describe('labelLangOf: the lyric language a world labels in', () => {
  it('reads Chinese, Japanese and English lyrics', () => {
    expect(labelLangOf(['快使用雙截棍', '哼哼哈兮'])).toBe('zh');
    expect(labelLangOf(['信じてみるんだ', '世界の続きを'])).toBe('ja');
    expect(labelLangOf(["I don't wanna lose you tonight", 'hold me closer'])).toBe('en');
  });
  it('takes the dominant language of a mixed lyric', () => {
    // a Chinese song with one English hook is Chinese
    expect(labelLangOf(['那些話留給了潮汐', '你還在等我回來嗎', 'baby', '夜裡的光照亮了街道'])).toBe('zh');
    // a Japanese song with English lines is Japanese while its Japanese carries more
    expect(labelLangOf(['君の声が聞こえる', 'I love you', '夜明けまで歌おう', '涙の向こうに'])).toBe('ja');
    // an English song with a Japanese tag is English
    expect(labelLangOf(['we are dancing in the moonlight', 'never let me go away from here', 'ありがとう'])).toBe('en');
  });
  it('needs a real share of kana for Japanese: a stray の in a Chinese lyric is not', () => {
    expect(labelLangOf(['我の夏天', '在海邊等你回來', '風吹過了整個城市'])).toBe('zh');
    expect(labelLangOf('永遠に')).toBe('ja');
  });
  it('falls back to Chinese with nothing to read', () => {
    expect(labelLangOf([])).toBe('zh');
    expect(labelLangOf('… 123 !!')).toBe('zh');
  });
});

describe('the label dictionary', () => {
  it('has every label in every language, never empty', () => {
    for (const forms of [...Object.values(LABELS), ...Object.values(PART_LABELS)]) for (const l of LABEL_LANGS) expect(forms[l].trim().length).toBeGreaterThan(0);
  });
  it('keeps the Chinese labels the worlds printed before (a Chinese song does not change)', () => {
    expect(['drawingTitle', 'by', 'time', 'scale', 'section', 'notes', 'elevation'].map((k) => labelOf(k as keyof typeof LABELS, 'zh'))).toEqual(['圖名', '作者', '時間', '比例', '剖面', '說明', '立面']);
    expect(['item', 'part', 'total', 'decline', 'accept', 'search', 'newline', 'space'].map((k) => labelOf(k as keyof typeof LABELS, 'zh'))).toEqual(['品名', '段落', '合計', '拒絕', '接聽', '搜尋', '換行', '空白']);
    expect(PART_LABEL).toEqual({ intro: '前奏', verse: '主歌', pre: '導歌', chorus: '副歌', ochi: '副歌', bridge: '橋段', interlude: '間奏', outro: '尾奏' });
  });
  it('writes Japanese in Japanese forms and English in English', () => {
    expect(labelOf('notes', 'ja')).toBe('注記');
    expect(labelOf('notes', 'en')).toBe('NOTES');
    expect(partLabelOf('chorus', 'ja')).toBe('サビ');
    expect(partLabelOf('verse', 'en')).toBe('VERSE');
    // no Japanese label is written in a Chinese-only form, no English one in CJK
    for (const forms of [...Object.values(LABELS), ...Object.values(PART_LABELS)]) {
      expect(forms.en).not.toMatch(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u);
      expect(forms.ja).not.toMatch(/[說筆畫訊無絕剖圖聽搜]/u);
    }
  });
  it("types a case file's heads in English with the song's own word after it", () => {
    expect(headOf('title', 'zh')).toBe('TITLE 標題');
    expect(headOf('lines', 'ja')).toBe('LINES 行数');
    expect(headOf('artist', 'en')).toBe('ARTIST');
  });
  it('a frame speaks the plan\'s language, or its title\'s for a job planned before', () => {
    expect(say({ lang: 'ja', title: '雙截棍' }, 'hint')).toBe('ヒント');
    expect(langOfEnv({ title: 'プラトニックチョロイン' })).toBe('ja');
    expect(langOfEnv({ title: 'Sweet Timer' })).toBe('en');
    expect(langOfEnv({})).toBe('zh');
    expect(byLang('en', { zh: 1, ja: 2, en: 3 })).toBe(3);
  });
  it('lists every form for the faces to load', () => {
    for (const ch of ['注', 'ヒ', 'N', '段', 'サ']) expect(ALL_LABEL_TEXT).toContain(ch);
  });
});
