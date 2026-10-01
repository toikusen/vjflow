import { DUST, FILM_FRAME } from './accents/film.elements';
import { IMPACT_FRAME, SHARDS } from './accents/impact.elements';
import { BUBBLES, HIT_FLASH, ICON_BURST, ORBS, SPARKS, TWINKLES } from './accents/particle-accents';
import { ElementDef } from './element';
import { CEL_BANDS } from './fields/cel-bands.element';
import { DOT_PATTERN } from './fields/dot-pattern.element';
import { AURORA, LIGHT_LEAK, SKY_GRADIENT } from './fields/glow.fields';
import { GLOW_HAZE } from './fields/glow-haze.element';
import { SHADER_FLOW } from './fields/shader-flow.element';
import { CONCENTRIC } from './figures/concentric.element';
import { LASERS } from './figures/lasers.element';
import { LED_WALL } from './figures/led-wall.element';
import { ANAMORPHIC_FLARE, HALOS, LIGHT_RAYS } from './figures/light.elements';
import { MANGA_PANELS, SPEED_LINES, SUNBURST } from './figures/manga.elements';
import { ORBIT_ICONS } from './figures/orbit-icons.element';
import { PERSPECTIVE_GRID } from './figures/perspective-grid.element';
import { POLY_TUNNEL } from './figures/poly-tunnel.element';
import { SPECTRUM_BARS } from './figures/spectrum-bars.element';
import { WAVEFORM } from './figures/waveform.element';
import { FEEDBACK } from './posts/feedback.element';
import { KALEIDOSCOPE } from './posts/kaleidoscope.element';

/** Every element any style may use, by id. Styles pick from this pool through their grammar. */
export const ELEMENTS: Record<string, ElementDef> = Object.fromEntries(
  [
    GLOW_HAZE, DOT_PATTERN, SHADER_FLOW, CEL_BANDS, SKY_GRADIENT, AURORA, LIGHT_LEAK,
    POLY_TUNNEL, PERSPECTIVE_GRID, SPECTRUM_BARS, WAVEFORM, LASERS, LED_WALL, CONCENTRIC, ORBIT_ICONS,
    SPEED_LINES, MANGA_PANELS, SUNBURST, LIGHT_RAYS, HALOS, ANAMORPHIC_FLARE,
    SPARKS, ORBS, BUBBLES, TWINKLES, ICON_BURST, HIT_FLASH, IMPACT_FRAME, SHARDS, DUST, FILM_FRAME,
    KALEIDOSCOPE, FEEDBACK,
  ].map((d) => [d.id, d]),
);

/** Field used when a grammar leaves the field slot empty. */
export const FALLBACK_FIELD = GLOW_HAZE.id;
