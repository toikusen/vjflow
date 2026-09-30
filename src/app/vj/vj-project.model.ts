import { AudioAnalysis } from '../audio/audio-analysis.model';
import { SongProfile } from '../audio/song-profile';
import { LyricCue, LyricPreset } from '../lyrics/lyric.model';
import { GenerationMode, PlayRange } from './generation-policy';
import { Look } from './look';

export type VJStyleId = 'edm' | 'cute' | 'anime' | 'light' | 'cinematic';

export type TransitionType = 'fade' | 'flash' | 'zoom' | 'glitch' | 'wipe';

export type EnergyTier = 'low' | 'mid' | 'high';

export interface VJScene {
  id: string;
  start: number;
  end: number;
  preset: string;
  intensity: number;
  palette: string[];
  /** Known keys: transition, transitionDuration, tier, target, variant, speed, density. */
  parameters: Record<string, number | string | boolean>;
}

export interface VJProject {
  id: string;
  duration: number;
  analysis: AudioAnalysis;
  styleId: VJStyleId;
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
