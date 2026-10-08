import { describe, expect, it } from 'vitest';
import { analyzeStructure, chorusSpans, keyWords, lineSimilarity, sameLines, splitSongTitle, suggestMoments, titleGaps, wantedTitleGaps } from './structure';
import { SongTimeline, TimelineCue } from './timeline';

// verse / chorus ×2 / quiet ochi / last chorus; the shout 「はぁ」 precedes every chorus, a pickup line only some
const plan: [number, string, number][] = [];
const VERSES = [['歩き出した道の上', '知らない街の角を曲がる', 'ここから始まる物語'], ['窓の外は雨模様', '傘を忘れた月曜日', '君の声が聞こえた']];
const verse = (t: number, k: number) => VERSES[k - 1].forEach((x, i) => plan.push([t + i * 4, x, 0.5]));
const chorus = (t: number, pickup: boolean) => {
  if (pickup) plan.push([t - 4, 'ねえ聞いてよ', 0.6]);
  plan.push([t - 1, '「はぁ」', 0.6]);
  ['光る星 夜空に消えて', '進む先 見えなくても', '僕らなりの藍を描こう'].forEach((x, i) => plan.push([t + i * 4, x, 0.85]));
};
verse(10, 1); chorus(30, true); verse(60, 2); chorus(80, true);
['溢れ出す想い', '迷い続けても', '繋ぎ止めたカケラ紡ぐ'].forEach((x, i) => plan.push([110 + i * 4, x, 0.45]));
chorus(130, false);
plan.sort((a, b) => a[0] - b[0]);
const cues: TimelineCue[] = plan.map(([t, text], i) => ({ id: `c${i}`, start: t, end: t + 3.6, text, timingSource: 'whisper', confidence: 'aligned' }));
const energy = Array.from({ length: 1600 }, (_, f) => {
  const t = f / 10;
  const c = [...plan].reverse().find((p) => p[0] <= t);
  return c && t < c[0] + 4 ? c[2] : 0.4;
});
const song: SongTimeline = { title: 't', duration: 160, tempo: 120, beats: [], downbeats: [], energy, energyFps: 10, sections: [], cues, audio: { mix: 'm' } };

describe('lineSimilarity', () => {
  it('ignores spaces, punctuation and part-colour emoji', () => {
    expect(lineSimilarity('🩷光る星 夜空に', '光る星夜空に')).toBe(1);
    expect(lineSimilarity('光る星', '進む先')).toBe(0);
  });
});

describe('analyzeStructure', () => {
  const st = analyzeStructure(song);
  it('finds each chorus at its first sung line shared by every occurrence', () => {
    expect(st.choruses).toEqual([30, 80, 130]);
  });
  it('finds the quiet stretch before the last chorus', () => {
    expect(st.ochi).toEqual({ start: 110, end: 121.6 });
    expect(st.sections.find((s) => s.start <= 112 && s.end > 112)?.kind).toBe('ochi');
  });
  it('suggests builds and drops, a hold and finale for the last chorus, and a break', () => {
    const m = suggestMoments(st).moments.map((x) => `${x.kind}@${x.at}`);
    expect(m).toEqual(['build@30', 'drop@30', 'build@80', 'drop@80', 'build@130', 'hold@130', 'finale@130', 'break@110']);
  });
});

describe('repeats and gaps', () => {
  it('maps repeated lines to their first occurrence', () => {
    const same = sameLines(song);
    const first = cues.find((c) => c.text === '光る星 夜空に消えて')!.id;
    expect([...same].filter(([, src]) => src === first)).toHaveLength(2);
  });
  it('lists the gaps without lyrics long enough for a title card', () => {
    // first line at 10 s, lines every 4 s with 3.6 s duration, last chorus ends 141.6 s, song 160 s
    const gaps = titleGaps(song);
    expect(gaps[0]).toEqual({ start: 0, end: 10, kind: 'intro' });
    expect(gaps[gaps.length - 1]).toMatchObject({ kind: 'outro', end: 160 });
    expect(gaps.every((g) => g.end - g.start >= (g.kind === 'intro' ? 4 : 6))).toBe(true);
    expect(wantedTitleGaps(song, 'ends').map((g) => g.kind)).toEqual(['intro', 'outro']);
    expect(wantedTitleGaps(song, 'none')).toEqual([]);
  });
  it('gives the chorus spans in order and splits "Artist - Title"', () => {
    expect(chorusSpans(analyzeStructure(song)).map((c) => c.start)).toEqual([30, 80, 130]);
    expect(splitSongTitle('Reol - 第六感')).toEqual({ artist: 'Reol', title: '第六感' });
    expect(splitSongTitle('indigo')).toEqual({ artist: '', title: 'indigo' });
  });
});

describe('keyWords', () => {
  it('keeps title words and meaningful repeated words, not particles or pronouns', () => {
    const s = { ...song, title: 'yosugala - indigo', cues: [
      { id: 'a', start: 0, end: 1, text: '僕らなりの藍を描いてゆこう', timingSource: 'lrclib' as const, confidence: 'verified' as const },
      { id: 'b', start: 2, end: 3, text: '僕らなりの藍に染めてゆこうか', timingSource: 'lrclib' as const, confidence: 'verified' as const },
      { id: 'c', start: 4, end: 5, text: '僕は 夜空を見上げた', timingSource: 'lrclib' as const, confidence: 'verified' as const },
      { id: 'd', start: 6, end: 7, text: '夜空に消えて 僕は', timingSource: 'lrclib' as const, confidence: 'verified' as const },
    ] };
    const k = keyWords(s);
    expect(k).toContain('indigo');
    expect(k).toContain('藍');
    expect(k).toContain('夜空');
    expect(k).not.toContain('僕');
    expect(k.some((x) => /こう|ゆこう/.test(x))).toBe(false);
  });
});

describe('colourWords', () => {
  it('keeps colour for the title and the most repeated words only', async () => {
    const { colourWords } = await import('./structure');
    const cue = (text: string, i: number) => ({ id: `c${i}`, start: i, end: i + 1, text });
    const song = {
      title: 'X - てぇてぇ',
      cues: ['てぇてぇ 自分を', '最強 今日も', '最強 自分は', '最強だよ', '今日を'].map(cue),
    } as unknown as Parameters<typeof colourWords>[0];
    const w = colourWords(song);
    expect(w).toContain('てぇてぇ');
    expect(w).toContain('最強');
    expect(w).not.toContain('自分');
  });
});
