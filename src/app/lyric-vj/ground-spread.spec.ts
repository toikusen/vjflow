import { describe, expect, it } from 'vitest';
import { capCount, GROUND_FAMILY_CAP, GROUND_REPEAT_GAP, groundFamily, groundShares, groundVariety, spreadGrounds } from './ground-spread';

// 黄昏サイクル v4's window (run4, 2026-11-17): the grounds its 29 cuts stood on, verse then chorus
const V4_VERSE = ['riso/grain-block', 'overprint', 'riso/two-drum', 'riso/grain-block', 'dotscreen', 'riso/two-drum'];
const V4_CHORUS = ['riso/grain-block', 'riso/grain-block', 'riso/two-drum', 'riso/two-drum', 'grid', 'dotscreen', 'overprint', 'overprint', 'riso/two-drum', 'riso/two-drum', 'riso/grain-block', 'dotscreen', 'dotscreen', 'overprint', 'riso/two-drum', 'riso/two-drum', 'riso/grain-block', 'dotscreen', 'dotscreen', 'overprint', 'riso/two-drum', 'riso/two-drum', 'riso/grain-block'];
const POOL = ['riso/two-drum', 'dotscreen', 'overprint', 'riso/grain-block'];
const cuts = (fx: string[]) => fx.map((f) => ({ fx: f }));

describe('ground spread', () => {
  it('names the family without the world prefix', () => {
    expect(groundFamily('riso/two-drum')).toBe('two-drum');
    expect(groundFamily('overprint')).toBe('overprint');
  });
  it('finds v4 wanting: two-drum on 10 of 29 cuts (a hair under the cap), every ground back within two cuts; one more two-drum is over', () => {
    const parts = groundVariety([{ id: 'verse', cuts: cuts(V4_VERSE) }, { id: 'chorus', cuts: cuts(V4_CHORUS) }]);
    expect(parts.ok).toBe(false);
    expect(parts.failing).toEqual([]);
    expect(parts.repeats.length).toBeGreaterThan(5);
    const v = groundVariety([{ id: 'window', cuts: cuts([...V4_VERSE, ...V4_CHORUS, 'riso/two-drum']) }]);
    expect(v.failing.map((f) => f.family)).toContain('two-drum');
  });
  it('spreads the chorus under the cap with repeats spaced out, leaving the grid alone', () => {
    const chorus = cuts(V4_CHORUS);
    const n = spreadGrounds([chorus], { pool: () => POOL, fixed: (c) => c.fx === 'grid' });
    expect(n).toBeGreaterThan(0);
    expect(chorus[4].fx).toBe('grid');
    const shares = groundShares(chorus.filter((c) => c.fx !== 'grid'));
    for (const [family, share] of shares) expect(share, family).toBeLessThanOrEqual(GROUND_FAMILY_CAP + 1 / chorus.length);
    const v = groundVariety([{ id: 'chorus', cuts: chorus.filter((c) => c.fx !== 'grid') }]);
    expect(v.repeats).toEqual([]);
    expect(v.ok).toBe(true);
  });
  it('changes the composer\'s cuts before the director\'s, and the director\'s only when it must', () => {
    const sec = cuts(['riso/two-drum', 'riso/two-drum', 'riso/two-drum', 'riso/two-drum', 'dotscreen', 'riso/two-drum']);
    const directed = new Set([sec[0], sec[3]]);
    spreadGrounds([sec], { pool: () => POOL, later: (c) => directed.has(c) });
    expect(sec[0].fx).toBe('riso/two-drum');
    expect(groundShares(sec).get('two-drum')!).toBeLessThanOrEqual(GROUND_FAMILY_CAP + 1 / sec.length);
  });
  it('leaves a section of two or three cuts and a cut the world fixes alone', () => {
    const two = cuts(['riso/two-drum', 'riso/two-drum']);
    expect(spreadGrounds([two], { pool: () => POOL, fixed: () => true })).toBe(0);
    expect(groundVariety([{ id: 's', cuts: cuts(['disc', 'disc', 'overprint']) }]).failing).toEqual([]);
  });
  it('cap count: a third of a section at least one', () => {
    expect(capCount(29)).toBe(10);
    expect(capCount(4)).toBe(1);
    expect(GROUND_REPEAT_GAP).toBe(2);
  });
});
