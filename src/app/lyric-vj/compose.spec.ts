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

describe('flush-left languages', () => {
  it('sets every placeable shot left for the swiss language', () => {
    const t = tr([shot('a', 10, 'punch'), shot('b', 20, 'vertical'), shot('c', 30, 'typewriter')]);
    t.design = { language: 'swiss' } as unknown as TreatmentV3['design'];
    varyComposition(t, []);
    expect(t.shots.map((s) => s.params['align'] ?? s.params['position'])).toEqual(['left', 'left', 'left']);
  });
});

describe('editorPass', () => {
  it('alternates stair sides, rations strong entrances, replays repeated lines', async () => {
    const { editorPass } = await import('./compose');
    const t = tr([shot('a', 10, 'stair', { side: 'left' }), shot('b', 20, 'stair', { side: 'left' })]);
    t.cues = [
      { cueId: 'c1', shot: 'a', enter: 'slam', exit: 'cut', reveal: 'line' },
      { cueId: 'c2', shot: 'a', enter: 'pop', exit: 'fade', reveal: 'line' },
      { cueId: 'c3', shot: 'b', enter: 'fade', exit: 'fade', reveal: 'word' },
    ] as TreatmentV3['cues'];
    editorPass(t, new Map([['c3', 'c1']]));
    expect(t.shots.map((s) => s.params['side'])).toEqual(['left', 'right']);
    expect(t.cues[1].enter).toBe('wipe');
    expect(t.cues[2]).toMatchObject({ enter: 'slam', exit: 'cut', reveal: 'line' });
  });

  it('caps the showy text effects per song', async () => {
    const { editorPass } = await import('./compose');
    const t = tr([shot('a', 10, 'stair')]);
    t.cues = Array.from({ length: 5 }, (_, i) => ({ cueId: `c${i}`, shot: 'a', enter: 'flap', exit: 'fade', reveal: 'line', emphasis: [{ from: 0, to: 1, method: 'liquid' }] })) as TreatmentV3['cues'];
    editorPass(t, new Map());
    // five lines: rise takes at most 2 (a quarter, at least 2), so both overflows still fit
    expect(t.cues.map((c) => c.enter)).toEqual(['flap', 'flap', 'flap', 'rise', 'rise']);
    expect(t.cues.map((c) => c.emphasis![0].method)).toEqual(['liquid', 'liquid', 'hollow', 'hollow', 'hollow']);
  });
});

describe('short title cards', () => {
  it('turns a title card under 6 s into a quiet graphic beat', async () => {
    const { editorPass } = await import('./compose');
    const t = tr([shot('a', 10, 'title-card'), shot('b', 14, 'stair')]);
    t.shots[0].end = 14;
    t.cues = [];
    editorPass(t, new Map());
    expect(t.shots[0].template).toBe('quiet');
  });

  it('keeps a language without quiet in its own templates', async () => {
    const { editorPass } = await import('./compose');
    const t = tr([shot('a', 10, 'title-card'), shot('b', 14, 'typewriter')]);
    t.shots[0].end = 14;
    t.cues = [];
    Object.assign(t, { language: 'terminal' }); // before the design pass: the shot pass's language
    editorPass(t, new Map());
    expect(t.shots[0].template).toBe('typewriter');
  });
});

describe('planSides', () => {
  it('moves a line off the side its section fills and keeps lines already clear', async () => {
    const { planSides } = await import('./compose');
    const win = { kind: 'ui', type: 'code', color: '#3DFF6E', x: -0.6, y: 0 } as const;
    const t = { ...tr([shot('a', 0, 'frame-split', { align: 'left' }), shot('b', 5, 'frame-split', { align: 'right' }), shot('c', 10, 'typewriter', { position: 'auto' })]), graphics: { sections: [{ start: 0, layers: [win] }] } } as unknown as TreatmentV3;
    const fixes = planSides(t);
    expect(t.shots.map((s) => Object.values(s.params)[0])).toEqual(['right', 'right', 'auto']);
    expect(fixes).toHaveLength(1);
  });

  it('moves a centred line off a phone at the side: too tall to dodge, it is in the way of a long line', async () => {
    const { planSides } = await import('./compose');
    const phone = { kind: 'phone', type: 'chat', color: '#1C1C1E', x: 0.62, size: 0.78 } as const;
    const t = { ...tr([shot('a', 0, 'typewriter', { position: 'center' })]), graphics: { sections: [{ start: 0, layers: [phone] }] } } as unknown as TreatmentV3;
    expect(planSides(t)).toHaveLength(1);
    expect(t.shots[0].params['position']).toBe('left');
  });
});

describe('stackRushed', () => {
  it('stacks the shots whose lines are sung faster than they read, at most half of them', async () => {
    const { stackRushed } = await import('./compose');
    const cue = (id: string, start: number, len: number, text: string) => ({ id, start, end: start + len, text });
    const cues = [cue('a', 0, 0.8, 'とても長い歌詞の一行です'), cue('b', 1, 0.8, 'もう一つの長い歌詞です'), cue('c', 10, 4, '短い'), cue('d', 15, 4, '短い')];
    const t = { ...tr([shot('s1', 0, 'typewriter'), shot('s2', 10, 'typewriter')]), cues: [{ cueId: 'a', shot: 's1' }, { cueId: 'b', shot: 's1' }, { cueId: 'c', shot: 's2' }, { cueId: 'd', shot: 's2' }] } as unknown as TreatmentV3;
    expect(stackRushed(t, cues)).toHaveLength(1);
    expect(t.shots.map((s) => s.template)).toEqual(['stack', 'typewriter']);
  });
});

describe('editorPass symbols', () => {
  it('keeps at most two drawn signs per song', async () => {
    const { editorPass } = await import('./compose');
    const sym = [{ from: 0, to: 1, method: 'symbol', symbol: 'heart' }];
    const t = { ...tr([shot('s1', 0, 'typewriter')]), cues: ['a', 'b', 'c'].map((id) => ({ cueId: id, shot: 's1', enter: 'wipe', exit: 'cut', emphasis: structuredClone(sym) })) } as unknown as TreatmentV3;
    editorPass(t, new Map());
    expect(t.cues.map((c) => c.emphasis?.length)).toEqual([1, 1, 0]);
  });
});
