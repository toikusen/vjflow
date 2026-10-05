import { describe, expect, it } from 'vitest';
import { anchorOf, hookRanges, titleHook, varyComposition } from './compose';
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

  it('opens the shot after each chorus through the motif (wipe)', () => {
    const t = tr([shot('a', 30, 'punch'), shot('b', 35, 'typewriter'), shot('c', 40, 'vertical')]);
    varyComposition(t, [{ start: 29, end: 35.4 }]);
    expect(t.shots.map((s) => s.transitionIn)).toEqual(['cut', 'wipe', 'cut']);
  });

  it('escalates choruses: narrow first, widest last, never bleeding', () => {
    const t = tr([shot('a', 30, 'punch'), shot('b', 90, 'punch'), shot('c', 150, 'punch', { align: 'left' })]);
    varyComposition(t, [{ start: 29, end: 40 }, { start: 89, end: 100 }, { start: 149, end: 160 }]);
    expect(t.shots.map((s) => [s.params['keywordWidth'], s.params['bleed']])).toEqual([[0.62, false], [0.77, false], [0.92, false]]);
    expect(t.shots[2].params['align']).toBe('center');
  });
});

describe('quiet spans', () => {
  it('sets shots inside a break to the quiet template, alternating centre and left', async () => {
    const { quietSpans } = await import('./moments');
    const moments = [{ kind: 'drop' as const, at: 30 }, { kind: 'break' as const, at: 50 }, { kind: 'build' as const, at: 66 }];
    expect(quietSpans(moments)).toEqual([{ start: 50, end: 66 }]);
    const t = { ...tr([shot('a', 45, 'punch'), shot('b', 50, 'typewriter'), shot('c', 55, 'vertical'), shot('d', 66, 'punch')]), moments } as TreatmentV3;
    varyComposition(t, []);
    expect(t.shots.map((s) => s.template)).toEqual(['punch', 'quiet', 'quiet', 'punch']);
    expect(t.shots.slice(1, 3).map((s) => s.params['position'])).toEqual(['center', 'left']);
  });
});

describe('chorus skeleton', () => {
  it('later choruses reuse the first chorus templates in order, and get an echo', () => {
    const t = tr([shot('a', 30, 'beat-cut'), shot('b', 35, 'scatter'), shot('c', 90, 'punch'), shot('d', 95, 'vertical'), shot('e', 100, 'typewriter')]);
    varyComposition(t, [{ start: 30, end: 40 }, { start: 90, end: 105 }]);
    expect(t.shots.map((s) => s.template)).toEqual(['beat-cut', 'scatter', 'beat-cut', 'scatter', 'scatter']);
    expect(t.shots.map((s) => !!s.params['echo'])).toEqual([false, true, false, true, true]);
  });
});

describe('title hook', () => {
  it('strips the bracketed subtitle and finds every sung occurrence', () => {
    expect(titleHook('第六感（THE SIXTH SENSE）')).toBe('第六感');
    expect(hookRanges('今が一番若いの 第六感、六感またがって第六感', '第六感')).toEqual([[8, 11], [19, 22]]);
    expect(hookRanges('Sweet Timer again', 'sweet timer')).toEqual([[0, 11]]);
  });
});

describe('per-song techniques', () => {
  it('skips the echo and skeleton when the design does not pick them', () => {
    const t = tr([shot('a', 30, 'beat-cut'), shot('b', 35, 'scatter'), shot('c', 90, 'punch')]);
    t.design = { techniques: ['title-hook'] } as unknown as TreatmentV3['design'];
    varyComposition(t, [{ start: 30, end: 40 }, { start: 90, end: 105 }]);
    expect(t.shots[2].template).toBe('punch');
    expect(t.shots.some((s) => s.params['echo'])).toBe(false);
  });
});
