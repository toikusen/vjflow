import { LyricPreset } from '../../lyrics/lyric.model';
import { ParamSpec, Skin, Trait } from '../elements/element';
import { EnergyTier, TransitionType, VJStyleId } from '../vj-project.model';

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
  /** Per-element parameter ranges that replace the element's defaults in this style. */
  params?: Record<string, Record<string, ParamSpec>>;
  /** Elements drawn on top of every scene regardless of motif (e.g. letterbox and grain). */
  overlay?: string[];
}

export interface VJStyle {
  id: VJStyleId;
  name: string;
  tagline: string;
  /** CSS background used by the style card in the UI. */
  cardBackground: string;
  palettes: Record<EnergyTier, string[][]>;
  grammar: StyleGrammar;
  /** The song character this style suits best (0..1 each); used by automatic style choice. */
  affinity: { valence: number; arousal: number; brightness: number };
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
