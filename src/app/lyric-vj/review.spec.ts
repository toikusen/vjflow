import { describe, expect, it } from 'vitest';
import { applyEdits, passes } from './review';
import { TreatmentV3 } from './treatment';

const t: TreatmentV3 = {
  concept: 'c',
  styleAnchor: { prompt: 'p', palette: { background: '#000000', text: '#ffffff', accent: '#00ffff', line: '#ffffff', glow: '#0000ff' }, fonts: { display: 'D', body: 'B' } },
  assets: [],
  shots: [{ id: 's1', start: 0, end: 5, template: 'punch', params: { dim: 0.3, tilt: 0 }, camera: 'static', transitionIn: 'cut' }],
  cues: [{ cueId: 'c001', shot: 's1', enter: 'slam', exit: 'burst' }],
};

describe('applyEdits', () => {
  it('changes only params and cue styles, and reports unknown targets', () => {
    const r = applyEdits(t, {
      shots: [{ id: 's1', params: { dim: 0.6 } }, { id: 'zz', params: {} }],
      cues: [{ cueId: 'c001', enter: 'pop', accents: [0] }, { cueId: 'c999', exit: 'fade' }],
    });
    expect(r.treatment.shots[0].params).toEqual({ dim: 0.6, tilt: 0 });
    expect(r.treatment.shots[0].start).toBe(0);
    expect(r.treatment.cues[0]).toMatchObject({ enter: 'pop', exit: 'burst', accents: [0] });
    expect(r.ignored).toEqual(['未知鏡頭 zz', '未知歌詞 c999']);
    expect(t.shots[0].params['dim']).toBe(0.3); // input untouched
  });
});

describe('passes', () => {
  it('needs mean ≥ 3.5 and nothing ≤ 2', () => {
    expect(passes({ a: 4, b: 3, c: 4 })).toBe(true);
    expect(passes({ a: 5, b: 5, c: 2 })).toBe(false);
    expect(passes({ a: 3, b: 3 })).toBe(false);
  });
});
