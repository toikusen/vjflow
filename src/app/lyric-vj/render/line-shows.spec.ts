import { describe, expect, it } from 'vitest';
import { lineShows } from './line-shows';
import { MIN_TAIL } from './sung-tail';

// a duet: A sung on 0.5 s into B (a true overlap: B is sung before A may leave)
const cues = [
  { id: 'a', start: 10, end: 13, text: '君の声がまだ聞こえる', charStarts: [10, 10.3, 10.6, 10.9, 11.2, 11.5, 11.8, 12.1, 12.4, 12.95] },
  { id: 'b', start: 12.5, end: 15, text: '僕はここにいるよ', charStarts: [12.5, 12.8, 13.1, 13.4, 13.7, 14, 14.3, 14.6] },
];
const style = (cueId: string, shot: string) => ({ cueId, shot, enter: 'fade', exit: 'fade', idle: 'still', budget: true }) as Record<string, unknown>;
const shot = (id: string, template: string, start: number, end: number) => ({ id, template, start, end, params: {} }) as never;

describe('lineShows: an overlapping pair is set together only where the plan did not seat it', () => {
  it('sets together a saved plan\'s pair standing in two shots', () => {
    const t = { cues: [style('a', 's1'), style('b', 's2')] as never, shots: [shot('s1', 'stair', 9.8, 12.5), shot('s2', 'stair', 12.5, 15)] };
    expect(lineShows(t, cues as never, 120, []).styled.map((x) => x.cue.id)).toEqual(['a']);
  });
  it('keeps a pair the composer seated in one shot (stack, couplet, world-pair): each line its own seat', () => {
    for (const template of ['stack', 'couplet', 'world-pair']) {
      const t = { cues: [style('a', 's1'), style('b', 's1')] as never, shots: [shot('s1', template, 9.8, 15)] };
      expect(lineShows(t, cues as never, 120, []).styled.map((x) => x.cue.id), template).toEqual(['a', 'b']);
    }
  });
  it('sets together a pair sharing a shot whose layout shows one line at a time (a tunnel is one seat)', () => {
    const t = { cues: [style('a', 's1'), style('b', 's1')] as never, shots: [shot('s1', 'tunnel', 9.8, 15)] };
    expect(lineShows(t, cues as never, 120, [], undefined, undefined, (x) => ['stack', 'couplet', 'world-pair'].includes(x)).styled.map((x) => x.cue.id)).toEqual(['a']);
  });
});

describe('lineShows: a handoff never takes the line going out off before its last character is read', () => {
  it('drops a push whose out-time is before the line\'s floor, keeps one after it', () => {
    const two = [
      { id: 'a', start: 10, end: 12.5, text: '快使用雙截棍', charStarts: [10, 10.4, 10.8, 11.2, 11.6, 12.4] },
      { id: 'b', start: 13, end: 15, text: '哼哼哈兮', charStarts: [13, 13.4, 13.8, 14.2] },
    ];
    const t = (to: number) => ({ cues: [{ ...style('a', 's1') }, { ...style('b', 's2'), handoff: { kind: 'push', from: to - 0.3, to } }], shots: [shot('s1', 'stair', 9.8, 13), shot('s2', 'stair', 13, 15)] });
    expect(lineShows(t(12.42) as never, two as never, 120, []).styled[1].style.handoff).toBeUndefined();
    expect(lineShows(t(12.45) as never, two as never, 120, [], undefined, MIN_TAIL).styled[1].style.handoff, 'at the engine\'s own tail').toBeUndefined();
    expect(lineShows(t(12.9) as never, two as never, 120, []).styled[1].style.handoff).toBeDefined();
  });
});

describe('lineShows: a handoff never brings a line in after its first sung character', () => {
  it('drops a relay that would show the line part way past its onset (三年後的大雪 c020: 84.77 for 84.74)', () => {
    const two = [
      { id: 'a', start: 80, end: 84.5, text: '想你的黑夜', charStarts: [80, 81, 82, 83, 84.3] },
      { id: 'b', start: 84.742, end: 88, text: '才想起大雪的那一天', charStarts: [84.742, 84.862, 85, 85.5, 86, 86.5, 87, 87.3, 87.6] },
    ];
    const t = (from: number, to: number) => ({ cues: [{ ...style('a', 's1') }, { ...style('b', 's2'), handoff: { kind: 'relay', from, to, dir: -1 } }], shots: [shot('s1', 'stair', 79.8, 84.7), shot('s2', 'stair', 84.7, 88)] });
    expect(lineShows(t(84.622, 84.982) as never, two as never, 120, []).styled[1].style.handoff).toBeUndefined();
    expect(lineShows(t(84.5, 84.8) as never, two as never, 120, []).styled[1].style.handoff).toBeDefined();
  });
});

describe('lineShows: world events name lines, not the plan', () => {
  it('sets together a pair no event acts on in a plan that carries a table; keeps a pair an event names', () => {
    const base = { cues: [style('a', 's1'), style('b', 's2')] as never, shots: [shot('s1', 'stair', 9.8, 12.5), shot('s2', 'stair', 12.5, 15)] };
    const keepOnly = { ...base, worldEvents: { events: [{ kind: 'keep', lineIds: ['a'] }, { kind: 'keep', lineIds: ['b'] }], holds: [] } };
    const seated = { ...base, worldEvents: { events: [{ kind: 'layout-seat', lineIds: ['b'] }], holds: [] } };
    expect(lineShows(keepOnly as never, cues as never, 120, [], undefined, MIN_TAIL).styled.map((x) => x.cue.id)).toEqual(['a']);
    expect(lineShows(seated as never, cues as never, 120, [], undefined, MIN_TAIL).styled.map((x) => x.cue.id)).toEqual(['a', 'b']);
  });
});

describe('lineShows: a duet set together never goes under the reading floor', () => {
  it('keeps two voices apart (a fault the gate fails) when one of them cannot stand on a row at REST_FLOOR', () => {
    const long = [
      { id: 'a', start: 10, end: 13, text: 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめも', charStarts: [10, 12.95] },
      { id: 'b', start: 12.5, end: 15, text: '僕はここにいるよ', charStarts: [12.5, 14.6] },
    ];
    const t = { cues: [style('a', 's1'), style('b', 's2')] as never, shots: [shot('s1', 'stair', 9.8, 12.5), shot('s2', 'stair', 12.5, 15)] };
    expect(lineShows(t, long as never, 120, [], undefined, MIN_TAIL).styled.map((x) => x.cue.id)).toEqual(['a', 'b']);
  });
});

describe('lineShows: a third line joins two set together only where a voice still sounds as it comes in', () => {
  it('sets a duet together and leaves the next line, sung after both voices ended, on its own (no cascade)', () => {
    const three = [
      { id: 'a', start: 10, end: 12, text: '君の声が', charStarts: [10, 10.5, 11, 11.9] },
      { id: 'b', start: 11.5, end: 13.5, text: '僕はここに', charStarts: [11.5, 12, 12.5, 13, 13.4] },
      { id: 'c', start: 13.6, end: 15, text: 'いつかまた', charStarts: [13.6, 13.8, 14, 14.4, 14.8] },
    ];
    const t = { cues: [style('a', 's1'), style('b', 's2'), style('c', 's3')] as never, shots: [shot('s1', 'stair', 9.8, 11.5), shot('s2', 'stair', 11.5, 13.6), shot('s3', 'stair', 13.6, 15)] };
    expect(lineShows(t, three as never, 120, [], undefined, MIN_TAIL).styled.map((x) => x.cue.id)).toEqual(['a', 'c']);
    // (c sung from 13.35, over b's last character at 13.4: a genuine overlap, it joins; at 13.45 it would hand over)
    const into = three.map((c) => (c.id === 'c' ? { ...c, start: 13.35, charStarts: [13.35, 13.8, 14, 14.4, 14.8] } : c));
    expect(lineShows(t, into as never, 120, [], undefined, MIN_TAIL).styled.map((x) => x.cue.id)).toEqual(['a']);
  });
});

describe('lineShows: a fast rap line sung after the last one hands over, never set together (Tokyo Drift c066–c073)', () => {
  it('leaves rap lines sung MIN_TAIL or more apart, and an untimed line whose interpolated times run past its end, each on its own', () => {
    const rap = [
      { id: 'a', start: 179.76, end: 181.6, text: 'ごちゃごちゃの Fast & Furious', charTimed: false, charStarts: [179.76, 180.4, 181.3, 196.728] },
      { id: 'b', start: 181.6, end: 183.36, text: "It's gotta be the shoes", charStarts: [181.6, 182.2, 183.31] },
      { id: 'c', start: 183.45, end: 185, text: "That's why ladies choose me", charStarts: [183.45, 184, 184.95] },
    ];
    const t = { cues: [style('a', 's1'), style('b', 's2'), style('c', 's3')] as never, shots: [shot('s1', 'stair', 179.5, 181.6), shot('s2', 'stair', 181.6, 183.36), shot('s3', 'stair', 183.36, 185)] };
    expect(lineShows(t, rap as never, 120, [], undefined, MIN_TAIL).styled.map((x) => x.cue.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('lineShows: each voice keeps its own times when set together (a stray early time is not the merged line\'s onset)', () => {
  it('clamps the second voice\'s times into its own line', () => {
    const two = [
      { id: 'a', start: 10, end: 12, text: 'あいう', charStarts: [10, 10.5, 11.95] },
      { id: 'b', start: 11.9, end: 14, text: 'かきく', charStarts: [11.9, 5, 13.5] },
    ];
    const t = { cues: [style('a', 's1'), style('b', 's2')] as never, shots: [shot('s1', 'stair', 9.8, 11.9), shot('s2', 'stair', 11.9, 14)] };
    const merged = lineShows(t, two as never, 120, [], undefined, MIN_TAIL).styled[0].cue;
    expect(Math.min(...merged.charStarts!)).toBeGreaterThanOrEqual(10 - 0.25);
    expect(merged.charStarts!.slice(4)).toEqual([11.9, 11.65, 13.5]);
  });
});
