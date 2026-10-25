import { describe, expect, it } from 'vitest';
import { collide, DrawnText, echoCarry } from './scene-parts';

const box = (x0: number, y0: number, x1: number, y1: number, quad?: [number, number][]): DrawnText => ({ text: {} as never, rect: { x0, y0, x1, y1 }, quad, px: 100 });
const tilt = (cx: number, cy: number, w: number, h: number, a: number): DrawnText => {
  const pts = ([[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]] as [number, number][]).map(([x, y]) => [cx + x * Math.cos(a) - y * Math.sin(a), cy + x * Math.sin(a) + y * Math.cos(a)] as [number, number]);
  return box(Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1])), pts);
};

describe('collide', () => {
  it('tells crossing boxes from ones that only touch', () => {
    expect(collide(box(0, 0, 100, 100), box(50, 50, 150, 150))).toBe(true);
    expect(collide(box(0, 0, 100, 100), box(101, 0, 200, 100))).toBe(false);
    // edges shared by a sliver do not count
    expect(collide(box(0, 0, 100, 100), box(98, 0, 200, 100))).toBe(false);
  });

  it('tests a tilted band row by its own corners, not its bounding box', () => {
    // a 1500 px row tilted 4° rises to the right: its bounding box reaches y 573, the row's left end only y 664
    const row = tilt(960, 700, 1500, 150, (-4 * Math.PI) / 180);
    const above = box(220, 600, 400, 650);
    expect(above.rect.y1 > row.rect.y0).toBe(true);
    expect(collide(row, above)).toBe(false);
    expect(collide(row, box(900, 640, 1000, 700))).toBe(true);
  });
});

describe('echoCarry', () => {
  it('counts each echoed word sung in the scenes before, so the echo keeps growing', () => {
    const song = { beats: [], downbeats: [], cues: [
      { id: 'a', start: 0, end: 2, text: 'てぇてぇ!ほんとてぇてぇ!' },
      { id: 'b', start: 2, end: 4, text: 'やっぱてぇてぇ︕' },
      { id: 'c', start: 4, end: 6, text: 'てぇてぇすぎて' },
    ] };
    const echo = (cue: string) => ({ id: 'e', kind: 'echo' as const, z: 0, params: { word: 'てぇてぇ' }, lines: [{ cueId: cue, role: 'echo' as const }] });
    const s1 = { id: 's1', start: 0, end: 4, intent: 'x', parts: [echo('a'), { ...echo('b'), id: 'e2' }] };
    const s2 = { id: 's2', start: 4, end: 6, intent: 'x', parts: [echo('c')] };
    expect(echoCarry([s1, s2], s1, song)).toEqual({});
    expect(echoCarry([s1, s2], s2, song)).toEqual({ 'てぇてぇ': 3 });
  });
});
