import { Container, Texture } from 'pixi.js';
import { createFrameContext } from '../renderer/frame-context';
import { VjTextures } from '../renderer/textures';
import { createRng } from '../seeded-random';
import { VJ_STYLE_LIST } from '../styles';
import { sampleParams } from './element';
import { ELEMENTS } from './registry';

// jsdom has no 2D canvas, so procedural textures are replaced by the built-in white texture.
const textures = new Proxy({}, { get: () => Texture.WHITE }) as VjTextures;
const palette = [0x05000d, 0xff00d4, 0x00e5ff, 0x7b2cff];

describe('elements', () => {
  for (const def of Object.values(ELEMENTS)) {
    for (const style of VJ_STYLE_LIST) {
      it(`${def.id} builds, animates and cleans up with the ${style.id} skin`, () => {
        const rng = createRng(1);
        const target = def.slot === 'post' ? new Container() : undefined;
        const element = def.create({ params: sampleParams(def.params, rng), skin: style.grammar.skin, palette, textures, rng, speed: 1, density: 1, target });
        const ctx = createFrameContext();
        for (let f = 0; f < 100; f++) {
          Object.assign(ctx, { time: f / 60, dt: 1 / 60, energy: 0.8, bass: 0.9, mid: 0.6, treble: 0.7, beat: f % 30 === 0, beatIndex: Math.floor(f / 30), beatPulse: 1 - (f % 30) / 30, hit: f % 30 === 0 ? 0.9 : 0 });
          element.update(ctx, 1);
        }
        expect(element.view.children.length).toBeGreaterThan(0);
        element.destroy();
        expect(element.view.destroyed).toBe(true);
      });
    }
  }

  it('every param spec samples inside its range', () => {
    const rng = createRng(9);
    for (const def of Object.values(ELEMENTS)) {
      const values = sampleParams(def.params, rng);
      for (const [key, spec] of Object.entries(def.params)) {
        if (spec.kind === 'choice') expect(spec.options).toContain(values[key]);
        else {
          expect(values[key]).toBeGreaterThanOrEqual(spec.min);
          expect(values[key]).toBeLessThanOrEqual(spec.max);
        }
      }
    }
  });
});
