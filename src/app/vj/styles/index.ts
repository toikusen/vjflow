import { VJStyleId } from '../vj-project.model';
import { ANIME_STYLE } from './anime.style';
import { CINEMATIC_STYLE } from './cinematic.style';
import { CUTE_STYLE } from './cute.style';
import { EDM_STYLE } from './edm.style';
import { LIGHT_STYLE } from './light.style';
import { VJStyle } from './vj-style.interface';

export const VJ_STYLES: Record<VJStyleId, VJStyle> = {
  edm: EDM_STYLE,
  cute: CUTE_STYLE,
  anime: ANIME_STYLE,
  light: LIGHT_STYLE,
  cinematic: CINEMATIC_STYLE,
};

export const VJ_STYLE_LIST: VJStyle[] = Object.values(VJ_STYLES);
