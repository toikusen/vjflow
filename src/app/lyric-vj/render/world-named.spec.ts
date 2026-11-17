import { describe, expect, it } from 'vitest';
import { namedLines } from './world-named';

describe('namedLines: only the lines a world event acts on', () => {
  it('leaves out a plain keep, takes the rest and every hold', () => {
    const t = { worldEvents: { events: [{ kind: 'keep', lineIds: ['c1'] }, { kind: 'layout-seat', lineIds: ['c2'] }, { kind: 'page-handoff', lineIds: ['c3', 'c4'] }], holds: [{ lineId: 'c5' }] } };
    expect([...namedLines(t)].sort()).toEqual(['c2', 'c3', 'c4', 'c5']);
    expect(namedLines({}).size).toBe(0);
  });
});
