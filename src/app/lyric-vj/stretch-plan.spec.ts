import { describe, expect, it } from 'vitest';
import { planStretches, shotAt, type StretchScript } from './stretch-plan';

// 黄昏サイクル (run5): the outro ran every cut-out of the script in turn, a montage of thirty seconds
const lines = [
  { cue: 'c001', shots: ['S16', 'S17'] },
  { cue: 'c002', shots: ['S03'] },
  { cue: 'c003', shots: ['S18', 'S04'] },
  { cue: 'c006', shots: ['S18', 'S10', 'S21'] },
  { cue: 'c014', shots: ['S15', 'S17'] },
  { cue: 'c015', shots: ['S25', 'S19'] },
  { cue: 'c022', shots: ['S31', 'S04'] },
  { cue: 'c023', shots: ['S03', 'S19'] },
  { cue: 'c028', shots: ['S20', 'S34'] },
];
const cues = [
  { id: 'c001', start: 3, end: 9.5 }, { id: 'c002', start: 9.76, end: 11.68 }, { id: 'c003', start: 11.92, end: 19.08 }, { id: 'c006', start: 30, end: 36 },
  { id: 'c014', start: 86, end: 91.2 }, { id: 'c015', start: 98.98, end: 104 }, { id: 'c022', start: 150, end: 157.84 }, { id: 'c023', start: 176.4, end: 182 },
  { id: 'c028', start: 219.1, end: 227.53 },
];
const scene = new Set(['S16']);
const isCutOut = (id: string) => !scene.has(id);
const windows = [
  { start: 91.2, end: 98.98, kind: 'interlude' as const },
  { start: 157.84, end: 176.4, kind: 'interlude' as const },
  { start: 227.53, end: 257.73, kind: 'outro' as const },
];

describe('planStretches: an unsung stretch is a planned sequence, not the script in turn', () => {
  const plan = planStretches({ lines }, cues, windows, isCutOut);
  it('ends the song on a callback to its opening, then the last line\'s closing image held to the end', () => {
    const outro = plan.find((p) => p.kind === 'outro')!;
    expect(outro.shots).toEqual(['S17', 'S34']);
    expect(outro.shares[1]).toBeGreaterThan(outro.shares[0]);
    expect(outro.why).toMatch(/callback|closing/);
  });
  it('carries a short interlude from the line before into the line after', () => {
    expect(plan[0].shots).toEqual(['S17', 'S25']);
  });
  it('puts the song\'s recurring shot between them in a long interlude, three shots at most', () => {
    expect(plan[1].shots).toHaveLength(3);
    expect(plan[1].shots[0]).toBe('S04');
    expect(plan[1].shots[2]).toBe('S03');
    expect(['S18', 'S17']).toContain(plan[1].shots[1]);
  });
  it('never puts more than three shots on a stretch, and never a scene', () => {
    for (const p of plan) {
      expect(p.shots.length).toBeLessThanOrEqual(3);
      expect(p.shots.some((s) => scene.has(s))).toBe(false);
      expect(p.shares.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    }
  });
  it('takes the director\'s own plan for a stretch where the script has one', () => {
    const own: StretchScript[] = [{ kind: 'outro', at: 228, shots: ['S34', 'S16', 'S20'], why: '背影越騎越遠，最後停在長堤' }];
    const p = planStretches({ lines, stretches: own }, cues, windows, isCutOut).find((x) => x.kind === 'outro')!;
    // (a scene is not a cut-out: the director's order is kept without it)
    expect(p.shots).toEqual(['S34', 'S20']);
    expect(p.why).toBe('背影越騎越遠，最後停在長堤');
    expect(p.by).toBe('director');
  });
  it('names the shot for a time inside a stretch by its shares, nothing outside', () => {
    const outro = plan.find((p) => p.kind === 'outro')!;
    expect(shotAt(plan, 229)).toBe('S17');
    expect(shotAt(plan, 255)).toBe('S34');
    expect(shotAt(plan, outro.start + (outro.end - outro.start) * outro.shares[0] + 0.01)).toBe('S34');
    expect(shotAt(plan, 50)).toBeUndefined();
  });
});
