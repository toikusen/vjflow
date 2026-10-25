import { cameraAt, lightAt, project, thingAt } from './stage';

describe('stage', () => {
  it('sets further things higher and smaller', () => {
    const far = project(0.5, 0, 1920, 1080), near = project(0.5, 1, 1920, 1080);
    expect(far.y).toBeLessThan(near.y);
    expect(far.s).toBeLessThan(near.s);
  });

  it('works a thing out from its script: it arrives, falls over, is taken away', () => {
    const base = { sprite: 'cup', x: 0.5, z: 0.5, size: 0.3 };
    const script = [{ at: 10, action: 'in' as const, things: [0] }, { at: 20, action: 'fall' as const, things: [0] }, { at: 30, action: 'out' as const, things: [0] }];
    expect(thingAt(script, 0, base, 5).shown).toBe(false);
    expect(thingAt(script, 0, base, 12).alpha).toBeCloseTo(1);
    expect(thingAt(script, 0, base, 21).fallen).toBeCloseTo(1);
    expect(thingAt(script, 0, base, 32).shown).toBe(false);
  });

  it('eases the light between cues and the camera between shots', () => {
    const s = { light: { x: 0.3, color: '#ffcc88', level: 1 }, script: [{ at: 10, action: 'light' as const, things: [], level: 0 }] };
    expect(lightAt(s, 5)).toBe(1);
    expect(lightAt(s, 20)).toBeCloseTo(0);
    const cam = cameraAt({ shots: [{ at: 0, frame: 'wide', focus: 0 }, { at: 10, frame: 'close', focus: 0 }], things: [{ sprite: 'a', x: 0.3, z: 0.6, size: 0.3 }] }, 20, 1920, 1080);
    expect(cam.zoom).toBeCloseTo(1.45);
  });
});
