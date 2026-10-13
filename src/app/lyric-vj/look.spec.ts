import { describe, expect, it } from 'vitest';
import { validateLook } from './look';
import type { GraphicsLook } from './render/graphics';

describe('validateLook', () => {
  it('drops unknown layers and missing assets, sorts sections from the window start', () => {
    const look = {
      sections: [
        { start: 30, layers: [{ kind: 'fill', color: '#000000' }, { kind: 'laser', color: '#ff0000' }] },
        { start: 5, layers: [{ kind: 'photo', mode: 'inset', asset: 'nope' }] },
      ],
    } as unknown as GraphicsLook;
    const r = validateLook(look, ['a1'], 0);
    expect(r.look!.sections.map((s) => s.start)).toEqual([0, 30]);
    expect(r.look!.sections[1].layers.map((l) => l.kind)).toEqual(['fill']);
    expect('asset' in r.look!.sections[0].layers[0]).toBe(false);
  });

  it('sets dark lyrics on light fields and refuses dark lyrics on dark ones', () => {
    const r = validateLook({ sections: [{ start: 0, layers: [{ kind: 'paper', color: '#efe4cc' }] }, { start: 10, layers: [{ kind: 'fill', color: '#101020' }], text: '#202020' }] }, [], 0);
    expect(r.look!.sections[0].text).toBe('#1a1a1a');
    expect(r.look!.sections[1].text).toBeUndefined();
  });
});

describe('validateLook decorations', () => {
  it('reads a colours list where one colour is expected, and keeps one scattered decoration per section', () => {
    const look = {
      sections: [{ start: 0, layers: [
        { kind: 'fill', color: '#F1E3CF' },
        { kind: 'shapes', type: 'circle', colors: ['#E2553F', 'bad', '#6CC79A'] },
        { kind: 'particles', shape: 'heart', color: '#808080' },
        { kind: 'sparkles', color: '#FFFFFF' },
      ] }],
    } as unknown as GraphicsLook;
    const layers = validateLook(look, [], 0).look!.sections[0].layers as unknown as { kind: string; color?: string }[];
    expect(layers.map((l) => l.kind)).toEqual(['fill', 'shapes']);
    expect(layers[1].color).toBe('#E2553F');
  });
});

describe('neededAssets', () => {
  it('keeps only the pictures a graphic look shows through its photo layers', async () => {
    const { neededAssets } = await import('./look');
    const assets = [{ id: 'a', kind: 'image' }, { id: 'b', kind: 'image' }, { id: 'v', kind: 'video', from: 'b' }];
    const shots = [{ asset: 'a' }, { asset: 'b' }];
    expect([...neededAssets({ assets, shots })].sort()).toEqual(['a', 'b', 'v']);
    expect(neededAssets({ assets, shots, graphics: { sections: [{ start: 0, layers: [{ kind: 'fill', color: '#000000' }] }] } }).size).toBe(0);
    const named = neededAssets({ assets, shots, graphics: { sections: [{ start: 0, layers: [{ kind: 'photo', mode: 'inset', asset: 'v' }] }] } });
    expect([...named].sort()).toEqual(['b', 'v']);
    const shotPic = neededAssets({ assets, shots, graphics: { sections: [{ start: 0, layers: [{ kind: 'photo', mode: 'inset' }] }] } });
    expect([...shotPic].sort()).toEqual(['a', 'b']);
  });
});

describe('validateLook text', () => {
  it('turns a numeral written as a number into text', async () => {
    const { validateLook } = await import('./look');
    const r = validateLook({ sections: [{ start: 0, layers: [{ kind: 'numeral', text: 1 as unknown as string, color: '#ffffff' }] }] }, [], 0);
    expect((r.look!.sections[0].layers[0] as { text: string }).text).toBe('1');
  });
});

describe('validateLook windows', () => {
  it('keeps one operating system per song and one window look per section', async () => {
    const { validateLook } = await import('./look');
    const ui = (skin?: string) => ({ kind: 'ui', type: 'files', color: '#3DFF6E', skin }) as never;
    const r = validateLook({ sections: [
      { start: 0, layers: [ui('win'), ui('term')] },
      { start: 10, layers: [ui('mac'), ui('mac')] },
      { start: 20, layers: [ui(), ui('bogus')] },
    ] }, [], 0);
    const skins = r.look!.sections.map((s) => s.layers.map((l) => (l as { skin?: string }).skin ?? 'term'));
    expect(skins).toEqual([['win', 'win'], ['win', 'win'], ['term', 'term']]);
  });
});

describe('samenessIssues', () => {
  const sec = (start: number, layers: unknown[]) => ({ start, layers }) as never;
  const paper = { kind: 'paper', color: '#F4EEDF' };
  const sun = { kind: 'blob', color: '#F2B33D' };
  const border = { kind: 'frame', type: 'border', color: '#222222' };
  const hills = { kind: 'skyline', type: 'hills', colors: ['#334455'] };

  it('flags a decoration in nearly every section but not the ground', async () => {
    const { samenessIssues } = await import('./look');
    const look = { sections: [0, 10, 20, 30, 40].map((t) => sec(t, [paper, hills, sun])) };
    const issues = samenessIssues(look, []);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/blob/);
  });

  it('flags two main decorations shared with an earlier song in the language', async () => {
    const { samenessIssues, mainDecor } = await import('./look');
    const look = { sections: [sec(0, [paper, sun, border]), sec(10, [paper, sun]), sec(20, [paper, border]), sec(30, [paper])] };
    expect(mainDecor(look)).toEqual(['blob', 'frame/border']);
    expect(samenessIssues(look, [{ song: 'A', decor: ['blob', 'frame/border'] }]).join()).toMatch(/「A」/);
    expect(samenessIssues(look, [{ song: 'B', decor: ['blob', 'rings'] }])).toEqual([]);
  });
});

describe('dropEmptyFrames', () => {
  it('removes brackets from a section with no lyric and keeps them where words are', async () => {
    const { dropEmptyFrames } = await import('./look');
    const br = { kind: 'frame', type: 'brackets', color: '#ffffff' };
    const look = { sections: [{ start: 0, layers: [{ kind: 'fill', color: '#000000' }, br] }, { start: 20, layers: [br] }] } as never as import('./render/graphics').GraphicsLook;
    expect(dropEmptyFrames(look, [{ start: 29.8, end: 33 }], 60)).toHaveLength(1);
    expect(look.sections.map((s) => s.layers.length)).toEqual([1, 1]);
  });
});

describe('validateLook photo over skyline', () => {
  it('drops multiply from a framed photo in a section with a skyline', async () => {
    const { validateLook } = await import('./look');
    const photo = { kind: 'photo', mode: 'band', blend: 'multiply', color: '#ffffff' };
    const r = validateLook({ sections: [{ start: 0, layers: [{ kind: 'skyline', type: 'hills', colors: ['#333333'] }, photo] }, { start: 9, layers: [photo] }] } as never, [], 0);
    expect(r.look!.sections.map((s) => (s.layers.find((l) => l.kind === 'photo') as { blend?: string }).blend)).toEqual([undefined, 'multiply']);
  });
});

describe('validateLook transitions', () => {
  it('parses transitions, drops the first one and a loud one after a loud one', async () => {
    const { validateLook } = await import('./look');
    const sec = (start: number, transition: string) => ({ start, transition, layers: [{ kind: 'fill', color: '#222222' }] });
    const r = validateLook({ sections: [sec(0, 'circle'), sec(10, 'impact'), sec(20, 'checker:0.8'), sec(30, 'liquid:0.9:#ff8800'), sec(40, 'nope')] } as never, [], 0);
    expect(r.look!.sections.map((s) => s.transition)).toEqual([undefined, { kind: 'impact' }, undefined, { kind: 'liquid', dur: 0.9, color: '#ff8800' }, undefined]);
  });
});

describe('validateLook transition limits', () => {
  const sec = (start: number, transition: string) => ({ start, transition, layers: [{ kind: 'fill', color: '#222222' }] });
  it('allows at most half of the changes, rounded down', async () => {
    const { validateLook } = await import('./look');
    // 4 sections, 3 changes: one transition at most
    const r = validateLook({ sections: [sec(0, ''), sec(10, 'circle'), sec(20, 'clock'), sec(30, 'liquid')] } as never, [], 0);
    expect(r.look!.sections.filter((s) => s.transition)).toHaveLength(1);
  });
  it('keeps transitions only where the music changes section', async () => {
    const { validateLook } = await import('./look');
    const r = validateLook({ sections: [sec(0, ''), sec(10, 'circle'), sec(20, ''), sec(31, 'clock'), sec(40, ''), sec(50, '')] } as never, [], 0, [0, 9.2, 45]);
    expect(r.look!.sections.map((s) => s.transition?.kind)).toEqual([undefined, 'circle', undefined, undefined, undefined, undefined]);
  });
});
