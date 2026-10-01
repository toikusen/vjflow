import { AudioAnalysis } from '../audio/audio-analysis.model';
import { SongProfile } from '../audio/song-profile';
import { LyricCue, LyricPreset } from '../lyrics/lyric.model';
import { GenerationMode, PlayRange } from './generation-policy';
import { ElementUse } from './compose-scene';
import { Look } from './look';

export type VJStyleId = 'edm' | 'cute' | 'anime' | 'light' | 'cinematic';

/** What the user picked: a style, or 'auto' to let the song decide. */
export type StyleChoice = VJStyleId | 'auto';

export type TransitionType = 'fade' | 'flash' | 'zoom' | 'glitch' | 'wipe';

export type EnergyTier = 'low' | 'mid' | 'high';

export interface VJScene {
  id: string;
  start: number;
  end: number;
  preset: string;
  intensity: number;
  palette: string[];
  /** Elements to draw, bottom to top. */
  composition: ElementUse[];
  /** Known keys: transition, transitionDuration, tier, target, variant, speed, density. */
  parameters: Record<string, number | string | boolean>;
}

export interface VJProject {
  id: string;
  duration: number;
  analysis: AudioAnalysis;
  /** Always a concrete style; for an 'auto' choice, the one the song was matched to. */
  styleId: VJStyleId;
  /** Set when the style was chosen automatically, e.g. 「小調・慢板 78 BPM・聲音偏暗」. */
  autoReason?: string;
  seed: number;
  profile: SongProfile;
  look: Look;
  scenes: VJScene[];
  /** Scenes cover the whole track; playback and export are limited to `range`. */
  mode: GenerationMode;
  range: PlayRange;
  lyrics?: LyricCue[];
  lyricPreset: LyricPreset;
}
