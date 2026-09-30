import { alignLyrics, basicNormalize, guessLanguage, TimedWord, trimLongOnsets, wordsToCues } from './lyric-alignment';

/** One word per char, 0.3s each, starting at `start`. */
const heard = (text: string, start: number): TimedWord[] =>
  Array.from(text).map((ch, i) => ({ text: ch, start: start + i * 0.3, end: start + (i + 1) * 0.3 }));

describe('alignLyrics', () => {
  const window = { start: 0, end: 60 };

  it('times each line from the matching recognized words', () => {
    const lines = ['星星在天空閃耀', '我們一起跳舞吧', '直到早晨來臨'];
    const words = [...heard('星星在天空閃耀', 10), ...heard('我們一起跳舞吧', 16), ...heard('直到早晨來臨', 25)];
    const cues = alignLyrics(lines, words, basicNormalize, window);
    cues.forEach((c, i) => expect(c.start).toBeCloseTo([10, 16, 25][i] - 0.3, 5));
    expect(cues[0].end).toBeLessThanOrEqual(16);
  });

  it('tolerates misheard characters, ad-libs and lines beyond the window', () => {
    const lines = ['Dance until the morning', 'We never stop tonight', 'Line after the preview'];
    const words: TimedWord[] = [
      { text: 'yeah', start: 2, end: 3 },
      { text: 'Dance', start: 5, end: 5.5 },
      { text: 'until', start: 5.5, end: 6 },
      { text: 'the', start: 6, end: 6.2 },
      { text: 'mourning', start: 6.2, end: 7 },
      { text: 'we', start: 12, end: 12.3 },
      { text: 'never', start: 12.3, end: 12.8 },
      { text: 'stopped', start: 12.8, end: 13.3 },
      { text: 'tonight', start: 13.3, end: 14 },
    ];
    const cues = alignLyrics(lines, words, basicNormalize, window);
    expect(cues[0].start).toBeCloseTo(5, 0);
    expect(cues[1].start).toBeCloseTo(12, 0);
    // Not heard inside the window → scheduled after it, never shown in the preview.
    expect(cues[2].start).toBeGreaterThanOrEqual(window.end);
  });

  it('interpolates a line the recognizer missed entirely', () => {
    const lines = ['第一句歌詞', '完全聽不到', '第三句歌詞'];
    const words = [...heard('第一句歌詞', 0), ...heard('第三句歌詞', 10)];
    const cues = alignLyrics(lines, words, basicNormalize, window);
    expect(cues[1].start).toBeGreaterThan(cues[0].start);
    expect(cues[1].start).toBeLessThan(10);
    expect(cues[2].start).toBeCloseTo(9.7, 5);
  });

  it('keeps cues ordered and non-overlapping', () => {
    const cues = alignLyrics(['a b c', 'd e f', 'g h i'], heard('abcdefghi', 1), basicNormalize, window);
    cues.forEach((c, i) => {
      expect(c.end).toBeGreaterThan(c.start);
      if (i) expect(c.start).toBeGreaterThanOrEqual(cues[i - 1].end);
    });
  });
});

describe('guessLanguage', () => {
  it('detects script', () => {
    expect(guessLanguage('星のように')).toBe('japanese');
    expect(guessLanguage('我們一起')).toBe('chinese');
    expect(guessLanguage('사랑해')).toBe('korean');
    expect(guessLanguage("Don't stop")).toBe('english');
  });
});

describe('alignLyrics with misheard passages', () => {
  it('does not compress a misheard chorus when later lyrics extend past the preview', () => {
    const prefix = ['abcdefghijklmnop', '副歌甲句', '副歌乙句'];
    const words = [...heard(prefix[0], 2), ...heard('012345678901', 20)];
    const lines = [...prefix, ...Array(10).fill('這是預覽結束之後才會唱到的段落')];
    const cues = alignLyrics(lines, words, basicNormalize, { start: 0, end: 60 });
    expect(cues[0].start).toBeCloseTo(1.7);
    expect(cues[1].start).toBeCloseTo(19.7);
    expect(cues[2].start).toBeCloseTo(20.9);
    expect(cues[1].end).toBeGreaterThan(cues[1].start);
    expect(cues[2].end).toBeGreaterThan(cues[2].start);
    expect(cues[4].start).toBeGreaterThanOrEqual(60);
  });

  it('does not reuse the last heard character for extra trailing lines', () => {
    const cues = alignLyrics(['abcdefgh', '甲', '乙', '丙'], [...heard('abcdefgh', 2), ...heard('01', 20)], basicNormalize, { start: 0, end: 60 });
    expect(cues[1].start).toBeCloseTo(19.7);
    expect(cues[2].start).toBeCloseTo(20);
    expect(cues[2].end).toBeGreaterThan(cues[2].start);
    expect(cues[3].start).toBeGreaterThanOrEqual(60);
  });

  it('maps unmatched trailing lines onto the vocals that were heard instead of pushing them out', () => {
    const lines = ['大膽的愛勇敢的愛', '手心貼手心', '一起心電心', '街上的情侶'];
    // Chorus 2..4 misheard as unrelated characters, but the voice is clearly there from 20s on.
    const words = [...heard('大膽的愛勇敢的愛', 10), ...heard('如今天熟悉如今變這雙盞情依從那', 20)];
    const cues = alignLyrics(lines, words, basicNormalize, { start: 0, end: 60 });
    expect(cues[1].start).toBeGreaterThanOrEqual(19.5);
    expect(cues[1].start).toBeLessThan(21);
    expect(cues[2].start).toBeGreaterThan(cues[1].start);
    expect(cues[3].start).toBeLessThan(60);
  });

  it('still spills lines past the window when the heard tail is too short for them', () => {
    const lines = ['第一句歌詞', '第二句', '第三句很長很長很長很長', '第四句也很長很長很長'];
    const words = [...heard('第一句歌詞', 1), ...heard('某某', 10)];
    const cues = alignLyrics(lines, words, basicNormalize, { start: 0, end: 30 });
    expect(cues[1].start).toBeLessThan(11);
    expect(cues[3].start).toBeGreaterThanOrEqual(30);
  });
});

describe('alignLyrics across an instrumental break', () => {
  it('does not start unmatched lines before the first voice heard after the break', () => {
    const lines = ['第一句歌詞', '聽不清楚的', '第三句歌詞'];
    // 5s..20s is instrumental; one garbled blip at 20s, then line 3 at 30s.
    const words = [...heard('第一句歌詞', 3), { text: '嗯', start: 20, end: 20.3 }, ...heard('第三句歌詞', 30)];
    const cues = alignLyrics(lines, words, basicNormalize, { start: 0, end: 60 });
    expect(cues[1].start).toBeGreaterThanOrEqual(19.5);
  });
});

describe('wordsToCues', () => {
  const w = (text: string, start: number, end: number) => ({ text, start, end });

  it('breaks lines on pauses and joins spaced words verbatim', () => {
    const cues = wordsToCues([w(' Hello', 1, 1.4), w(' world', 1.5, 2), w(' again', 4, 4.5), w(' ...', 4.6, 4.7)], { start: 0, end: 10 });
    expect(cues).toEqual([
      { start: 0.7, end: 2, text: 'Hello world' },
      { start: 3.7, end: 4.5, text: 'again' },
    ]);
  });

  it('caps CJK line width and clamps to the window', () => {
    const chars = Array.from('一二三四五六七八九十一二三四五六', (ch, i) => w(ch, 10 + i * 0.2, 10.2 + i * 0.2));
    const cues = wordsToCues(chars, { start: 10, end: 13 });
    expect(cues.map((c) => c.text)).toEqual(['一二三四五六七八九十一二三四', '五六']);
    expect(cues[0].start).toBe(10);
    expect(cues[1].end).toBe(13);
  });
});

describe('trimLongOnsets', () => {
  it('pulls a word stretched over an instrumental intro back to near its end', () => {
    const w = (text: string, start: number, end: number) => ({ text, start, end });
    const [first, second] = trimLongOnsets([w("You're", 5.12, 16.94), w('just', 16.94, 17.46)]);
    expect(first.start).toBeCloseTo(15.94);
    expect(first.end).toBe(16.94);
    expect(second).toEqual(w('just', 16.94, 17.46));
  });
});
