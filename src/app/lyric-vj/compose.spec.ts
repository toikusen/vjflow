import { describe, expect, it } from 'vitest';
import { anchorOf, varyComposition } from './compose';
import type { Shot, TreatmentV3 } from './treatment';

const shot = (id: string, start: number, template: string, params: Shot['params'] = {}): Shot =>
  ({ id, start, end: start + 5, template, params, camera: 'static', transitionIn: 'cut' });
const tr = (shots: Shot[]) => ({ shots }) as unknown as TreatmentV3;

describe('varyComposition', () => {
  it('never leaves two centred shots in a row', () => {
    const t = tr([shot('a', 0, 'frame-split', { align: 'center' }), shot('b', 5, 'punch'), shot('c', 10, 'frame-split', { align: 'center' }), shot('d', 15, 'typewriter', { position: 'center' })]);
    varyComposition(t, []);
    const anchors = t.shots.map(anchorOf);
    expect(anchors).toEqual(['C', 'L', 'C', 'L']);
    expect(anchors.some((a, i) => a === 'C' && anchors[i - 1] === 'C')).toBe(false);
  });

  it('alternates sides and treats diagonal templates as off-centre', () => {
    const t = tr([shot('a', 0, 'punch'), shot('b', 5, 'punch'), shot('c', 10, 'punch'), shot('d', 15, 'punch'), shot('e', 20, 'scatter'), shot('f', 25, 'punch')]);
    varyComposition(t, []);
    expect(t.shots.map((s) => s.params['align'] ?? 'center')).toEqual(['center', 'left', 'center', 'right', 'center', 'center']);
  });

  it('escalates choruses: narrow first, widest last, never bleeding', () => {
    const t = tr([shot('a', 30, 'punch'), shot('b', 90, 'punch'), shot('c', 150, 'punch', { align: 'left' })]);
    varyComposition(t, [{ start: 29, end: 40 }, { start: 89, end: 100 }, { start: 149, end: 160 }]);
    expect(t.shots.map((s) => [s.params['keywordWidth'], s.params['bleed']])).toEqual([[0.62, false], [0.77, false], [0.92, false]]);
    expect(t.shots[2].params['align']).toBe('center');
  });
});
