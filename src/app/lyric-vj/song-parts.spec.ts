import { describe, expect, it } from 'vitest';
import { chorusLines, lineParts } from './song-parts';

const cue = (id: string, start: number, text: string) => ({ id, start, end: start + 3, text });
// verse, chorus, verse, chorus: the chorus comes back with its words, 30 s apart
const VERSE = ['走過那一條長長的街', '風吹著我們的頭髮', '你說今晚不要回家'];
const CHORUS = ['一起唱到天亮吧', '光就在前面等我們', '不要停下來'];
const song = (sections: { start: number; end: number; energy: number; type?: string }[] = []) => ({
  title: 'x',
  duration: 120,
  sections,
  energy: [],
  energyFps: 1,
  cues: [
    ...VERSE.map((t, i) => cue(`v1${i}`, 5 + i * 4, t)),
    ...CHORUS.map((t, i) => cue(`c1${i}`, 20 + i * 4, t)),
    ...['夜裡的城市很安靜', '我們走在雨裡面', '誰也沒有說話'].map((t, i) => cue(`v2${i}`, 40 + i * 4, t)),
    ...CHORUS.map((t, i) => cue(`c2${i}`, 60 + i * 4, t)),
  ],
});

describe('lineParts', () => {
  it('finds the chorus by the lines that come back, with no stored sections', () => {
    const ch = chorusLines(song());
    expect([...ch].sort()).toEqual(['c10', 'c11', 'c12', 'c20', 'c21', 'c22']);
    const p = lineParts(song());
    expect(p.get('c10')?.label).toBe('副歌');
    expect(p.get('v10')?.chorus).toBe(false);
  });
  it("takes the song's stored sections when no line comes back", () => {
    const plain = { ...song([{ start: 0, end: 18, energy: 0.3, type: 'verse' }, { start: 18, end: 120, energy: 0.8, type: 'chorus' }]), cues: song().cues.filter((c) => !c.id.startsWith('c2')) };
    const p = lineParts(plain);
    expect(p.get('v10')?.label).toBe('主歌');
    expect(p.get('c10')?.chorus).toBe(true);
    expect(p.get('v20')?.chorus).toBe(true);
  });
  it('gives every line a part, a song with nothing to go on all verse', () => {
    const lone = { title: 'x', duration: 30, cues: [cue('a', 1, '只有一句'), cue('b', 6, '再一句')] };
    expect([...lineParts(lone).values()].map((p) => p.label)).toEqual(['主歌', '主歌']);
  });
});
