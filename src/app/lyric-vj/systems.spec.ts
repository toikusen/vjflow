import { describe, expect, it } from 'vitest';
import { DEFAULT_DESIGN, fitSystem } from './design';
import { availableSystems } from './systems';

describe('availableSystems', () => {
  it('excludes the systems of the recent songs', () => {
    expect(availableSystems([{ song: 'a', system: 'stage', font: 'x' }, { song: 'b', system: 'cinema', font: 'y' }])).toEqual(['poster', 'notebook']);
    expect(availableSystems([])).toHaveLength(4);
  });
});

describe('fitSystem', () => {
  it('holds media, peak, techniques and picture range to the system', () => {
    const fixes: string[] = [];
    const d = fitSystem({ ...DEFAULT_DESIGN, system: 'poster', medium: 'paper', peak: 'rays', techniques: ['echo', 'flash'], colorScript: [{ ...DEFAULT_DESIGN.colorScript[0], image: 0.9 }] }, fixes);
    expect(d.medium).toBe('clean');
    expect(d.peak).toBe('vacuum');
    expect(d.colorScript[0].image).toBe(0.25);
    expect(d.techniques).toEqual(['echo', 'flash']);
    expect(fitSystem({ ...DEFAULT_DESIGN, system: 'cinema', techniques: ['echo', 'quiet'] }, []).techniques).toEqual(['quiet']);
  });
});
