import { ORIGINS } from './origins';
import { MAX_PER_CREATOR, overCreator, useCap } from './origin-rules';
import { MORE } from './render/kinetic-more';
import { CORE_FX } from './render/kinetic';
import { TRANSITION_KINDS } from './render/transition';
import { EMPHASIS_METHODS, ENTER_KINDS, EXIT_KINDS, IDLE_KINDS } from './treatment';

describe('technique origins', () => {
  it('has an audit row for every technique (a new one runs scripts/lyric-vj/origins.mts first)', () => {
    const ids = [...CORE_FX.map((x) => `fx:${x}`), ...Object.keys(MORE).map((x) => `fx:${x}`), ...TRANSITION_KINDS.map((x) => `tr:${x}`), ...ENTER_KINDS.map((x) => `enter:${x}`), ...EXIT_KINDS.map((x) => `exit:${x}`), ...EMPHASIS_METHODS.map((x) => `emph:${x}`), ...IDLE_KINDS.map((x) => `idle:${x}`), 'motion:loop-noise', 'motion:velocity-settle'];
    expect(ids.filter((id) => !ORIGINS[id])).toEqual([]);
  });

  it('tags what was learned from outside references with its source', () => {
    expect(ORIGINS['idle:track'].from).toContain('claude-animated-text (pound0423, MIT) #30');
    expect(ORIGINS['idle:fill'].from).toContain('#41');
    expect(ORIGINS['enter:strips'].from).toContain('#39');
    expect(['motion:loop-noise', 'motion:velocity-settle'].every((id) => ORIGINS[id].from?.includes('concept only'))).toBe(true);
  });

  it('caps rare techniques and lets one creator lend a song at most two of their own forms', () => {
    const one = Object.entries(ORIGINS).find(([, o]) => o.videos === 1 && !o.from)![0];
    expect(useCap(one)).toBe(1);
    const own = Object.entries(ORIGINS).filter(([, o]) => o.own && o.from === '@snakenxx 大字報 MV').map(([id]) => id);
    expect(overCreator(own)).toEqual(own.slice(MAX_PER_CREATOR));
  });
});
