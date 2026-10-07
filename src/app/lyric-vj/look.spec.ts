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
