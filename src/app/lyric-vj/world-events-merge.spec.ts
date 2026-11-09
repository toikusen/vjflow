// Q1 3b x Q3/Q5 merge order (docs/research/2026-11-10-rhythm-gaps-merge.md): 3b's material moves are laid first, Q3 and
// Q5 yield to them and to camera moves, and the post-plan camera check runs after arbitration.
import { describe, expect, it } from 'vitest';
import { planWorldEvents, type PolicyCandidate, type SeatCandidate, type WorldCompositionCaps, type WorldEventInput, type WorldEventLine } from './world-events';
import { WORLD_COMPOSITIONS } from './world-shared';

const LEFT: SeatCandidate = { id: 'w/left', box: { x0: 0.05, y0: 0.3, x1: 0.45, y1: 0.6 } };
const CENTRE: SeatCandidate = { id: 'w/centre', box: { x0: 0.3, y0: 0.35, x1: 0.7, y1: 0.65 } };
const caps = (o: Partial<WorldCompositionCaps> = {}): WorldCompositionCaps => ({ worldId: 'w', kinds: ['layout-seat'], seats: [], carrierRole: 'page', ...o });
const line = (id: string, start: number, end: number, seats: SeatCandidate[]): WorldEventLine => ({ id, show: start - 0.2, start, end, seats, seat: seats[0].id });
const input = (lines: WorldEventLine[], o: Partial<WorldEventInput> = {}): WorldEventInput => ({ lines, beats: [], sections: [{ start: 0, energy: 0.9 }], caps: caps(), seed: 0, ...o });
const q3 = (lineId: string, show: number): PolicyCandidate => ({ source: 'Q3', id: `scale:${lineId}`, group: 'S', rank: 0, lineId, kind: 'layout-seat', at: show, from: show, to: show, seatAfter: 'w/centre+scale:bottom', seat: { id: 'w/centre+scale:bottom', box: { x0: 0.1, y0: 0.6, x1: 0.6, y1: 0.95 } }, reason: 'test' });
const q5 = (lineId: string, at: number): PolicyCandidate => ({ source: 'Q5', id: `moment:${lineId}`, group: 'm', rank: 0, lineId, kind: 'signature-moment', at, from: at - 0.25, to: at + 0.8, changesLight: false, budget: { key: 'Q5', max: 2, apart: 30 }, reason: 'test' });

describe('merge order: 3b material moves, then Q3/Q5, then the camera check', () => {
  it('Q3 refuses a line whose switch is a world material move (erase-reseat), the move stands', () => {
    const chalk = caps({ materials: { 'erase-reseat': WORLD_COMPOSITIONS['chalkboard'].materials!['erase-reseat'] } });
    const plan = planWorldEvents(input([line('a', 1, 3, [LEFT]), line('b', 5, 7, [CENTRE, LEFT])], { caps: chalk, candidates: [q3('b', 4.8)] }));
    expect(plan.events.find((e) => e.material === 'erase-reseat')?.policy).toBeUndefined();
    expect(plan.policy).toEqual([expect.objectContaining({ lineId: 'b', approved: false, reason: expect.stringMatching(/^collisionQ1: a world material move/) })]);
  });

  it('a Q5 moment over a camera move yields to it; the camera is not dropped for the moment', () => {
    const ls = [line('a', 0, 2, [LEFT]), line('b', 3, 6, [LEFT])];
    const plan = planWorldEvents(input(ls, { cams: [{ lineId: 'b', at: 3.2, sec: 0.5, kind: 'push-through' }], candidates: [q5('b', 3.3)] }));
    expect(plan.policy?.[0]).toMatchObject({ approved: false });
    expect(plan.camDrops).toBeUndefined();
  });

  it('with no candidates the plan carries no policy field and the 3b fields as before', () => {
    const ls = [line('a', 0, 2, [LEFT]), line('b', 3, 6, [LEFT])];
    expect(planWorldEvents(input(ls)).policy).toBeUndefined();
  });
});
