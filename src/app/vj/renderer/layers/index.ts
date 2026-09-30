import { VJStyleId } from '../../vj-project.model';
import { AnimeLayer } from './anime.layer';
import { CinematicLayer } from './cinematic.layer';
import { CuteLayer } from './cute.layer';
import { EdmLayer } from './edm.layer';
import { LightLayer } from './light.layer';
import { LayerFactory } from './vj-layer';

export const STYLE_LAYERS: Record<VJStyleId, LayerFactory> = {
  edm: (d) => new EdmLayer(d),
  cute: (d) => new CuteLayer(d),
  anime: (d) => new AnimeLayer(d),
  light: (d) => new LightLayer(d),
  cinematic: (d) => new CinematicLayer(d),
};
