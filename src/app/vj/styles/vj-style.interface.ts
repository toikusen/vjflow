import { LyricPreset } from '../../lyrics/lyric.model';
import { Skin, Trait } from '../elements/element';
import { EnergyTier, TransitionType, VJStyleId } from '../vj-project.model';

export interface PresetDef {
  id: string;
  /** Energy tiers this preset suits best; others are still possible at reduced weight. */
  tiers: EnergyTier[];
  /** How intense the preset feels, 0..1; matched against the scene's target energy. Defaults to 0.5. */
  energy?: number;
}

/** Smoothing time constants in seconds: lower = snappier. */
export interface AudioMapping {
  attack: number;
  decay: number;
  /** How long a beat pulse takes to fade (seconds). */
  beatDecay: number;
  /** Beats whose onset strength exceeds this trigger the style's "hit" (flash, burst, impact...). */
  hitThreshold: number;
}

export interface Typography {
  fontFamily: string;
  fontWeight: 'normal' | 'bold' | '300' | '400' | '600' | '800' | '900';
  fontStyle: 'normal' | 'italic';
  letterSpacing: number;
  uppercase: boolean;
}

/** How a style composes scenes from the shared element pool. */
export interface StyleGrammar {
  skin: Skin;
  /** Element id → weight multiplier; unlisted elements are unavailable to this style. */
  elements: Record<string, number>;
  /** Traits this style never shows. */
  forbidden: Trait[];
  /** Element pairs that never appear in the same motif. */
  exclusive?: [string, string][];
  /** Upper bound of figure + accent elements in one scene. */
  maxBusy: number;
}

export interface VJStyle {
  id: VJStyleId;
  name: string;
  tagline: string;
  /** CSS background used by the style card in the UI. */
  cardBackground: string;
  palettes: Record<EnergyTier, string[][]>;
  /** Legacy whole-scene presets; empty for styles that compose scenes through `grammar`. */
  presets: PresetDef[];
  grammar?: StyleGrammar;
  transitions: { type: TransitionType; weight: number }[];
  /** Transition used when a scene boundary lands on a strong onset. */
  impactTransition: TransitionType;
  transitionDuration: number;
  /** Target scene length in seconds. */
  sceneLength: { min: number; max: number };
  mapping: AudioMapping;
  typography: Typography;
  lyricPreset: LyricPreset;
}
