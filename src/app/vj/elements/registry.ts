import { BUBBLES, HIT_FLASH, ICON_BURST, ORBS, SPARKS, TWINKLES } from './accents/particle-accents';
import { ElementDef } from './element';
import { DOT_PATTERN } from './fields/dot-pattern.element';
import { GLOW_HAZE } from './fields/glow-haze.element';
import { SHADER_FLOW } from './fields/shader-flow.element';
import { CONCENTRIC } from './figures/concentric.element';
import { LASERS } from './figures/lasers.element';
import { LED_WALL } from './figures/led-wall.element';
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
    GLOW_HAZE, DOT_PATTERN, SHADER_FLOW,
    POLY_TUNNEL, PERSPECTIVE_GRID, SPECTRUM_BARS, WAVEFORM, LASERS, LED_WALL, CONCENTRIC, ORBIT_ICONS,
    SPARKS, ORBS, BUBBLES, TWINKLES, ICON_BURST, HIT_FLASH,
    KALEIDOSCOPE, FEEDBACK,
  ].map((d) => [d.id, d]),
);

/** Field used when a grammar leaves the field slot empty. */
export const FALLBACK_FIELD = GLOW_HAZE.id;
