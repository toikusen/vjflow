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
