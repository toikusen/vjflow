import { VJStyleId } from '../../vj-project.model';
import { AnimeLayer } from './anime.layer';
import { CinematicLayer } from './cinematic.layer';
import { LightLayer } from './light.layer';
import { LayerFactory } from './vj-layer';

/** Legacy whole-scene layers; EDM and Cute compose scenes from elements instead (see CompositeLayer). */
export const STYLE_LAYERS: Partial<Record<VJStyleId, LayerFactory>> = {
  anime: (d) => new AnimeLayer(d),
  light: (d) => new LightLayer(d),
  cinematic: (d) => new CinematicLayer(d),
};
