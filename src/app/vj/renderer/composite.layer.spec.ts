import { Texture } from 'pixi.js';
import { createRng } from '../seeded-random';
import { CINEMATIC_STYLE } from '../styles/cinematic.style';
import { EDM_STYLE } from '../styles/edm.style';
import { VJScene } from '../vj-project.model';
import { CompositeLayer } from './composite.layer';
import { CENTER_X, createFrameContext } from './frame-context';
import { VjTextures } from './textures';

const textures = new Proxy({}, { get: () => Texture.WHITE }) as VjTextures;
const scene = (composition: VJScene['composition']): VJScene => ({
  id: 's', start: 0, end: 10, preset: '', intensity: 0.8, palette: ['#000000', '#ff00ff', '#00ffff', '#ffffff'], parameters: {}, composition,
});

describe('CompositeLayer', () => {
  it('keeps overlays above the post-processed body', () => {
    const layer = new CompositeLayer({
      scene: scene([
        { id: 'glowHaze', params: { x: 0.5 }, strength: 1 },
        { id: 'kaleidoscope', params: { segments: 6 }, strength: 1 },
        { id: 'filmFrame', params: {}, strength: 1, overlay: true },
      ]),
      style: EDM_STYLE,
      textures,
      rng: createRng(1),
    });
    expect(layer.view.children).toHaveLength(2);
    expect(layer.view.children[0].filters).toBeFalsy();
    layer.update(createFrameContext());
    layer.destroy();
    expect(layer.view.destroyed).toBe(true);
  });

  it('pushes the camera in over the scene for dolly skins only', () => {
    const uses = [{ id: 'lightLeak', params: { count: 2 }, strength: 1 }];
    const ctx = { ...createFrameContext(), sceneProgress: 1 };
    const film = new CompositeLayer({ scene: scene(uses), style: CINEMATIC_STYLE, textures, rng: createRng(1) });
    const still = new CompositeLayer({ scene: scene(uses), style: EDM_STYLE, textures, rng: createRng(1) });
    film.update(ctx);
    still.update(ctx);
    const body = (l: CompositeLayer) => l.view.children[0];
    expect(body(film).scale.x).toBeCloseTo(1.14);
    expect(body(film).position.x).not.toBe(CENTER_X);
    expect(body(still).scale.x).toBe(1);
  });
});
