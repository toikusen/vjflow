import { inject, Injectable } from '@angular/core';
import { AudioAnalysis } from '../audio/audio-analysis.model';
import { computeSongProfile } from '../audio/song-profile';
import { LyricCue, LyricPreset } from '../lyrics/lyric.model';
import { deriveLook } from './look';
import { hashString } from './seeded-random';
import { VJ_STYLES } from './styles';
import { GenerationMode, PlayRange, resolveRange } from './generation-policy';
import { describeProfile, rankStyles } from './style-ranking';
import { StyleChoice, VJProject } from './vj-project.model';
import { VjTimelineService } from './vj-timeline.service';

/** Stable per-track fingerprint so the same song + style always yields the same scenes. */
export function analysisFingerprint(a: AudioAnalysis): number {
  let sum = 0;
  for (let i = 0; i < a.frames.length; i += 16) sum += a.frames[i].energy;
  return hashString(`${a.duration.toFixed(3)}|${a.beats.length}|${sum.toFixed(4)}`);
}

export interface ProjectInput {
  analysis: AudioAnalysis;
  styleId: StyleChoice;
  lyrics?: LyricCue[];
  lyricPreset?: LyricPreset | 'auto';
  mode?: GenerationMode;
  /** Defaults to the range implied by `mode`; pass one to play e.g. an AI-picked highlight. */
  range?: PlayRange;
  /** Bump to get a different but still deterministic arrangement (future "Regenerate"). */
  variation?: number;
}

@Injectable({ providedIn: 'root' })
export class VjEngineService {
  private readonly timeline = inject(VjTimelineService);

  createProject({ analysis, styleId: choice, lyrics, lyricPreset = 'auto', mode = 'preview', range, variation = 0 }: ProjectInput): VJProject {
    const profile = computeSongProfile(analysis);
    const styleId = choice === 'auto' ? rankStyles(profile)[0].styleId : choice;
    const style = VJ_STYLES[styleId];
    const fingerprint = analysisFingerprint(analysis);
    const seed = hashString(`${fingerprint}|${styleId}|${variation}`);
    const look = deriveLook(profile, style);
    return {
      id: `${fingerprint.toString(36)}-${styleId}-${variation}`,
      duration: analysis.duration,
      analysis,
      styleId,
      autoReason: choice === 'auto' ? describeProfile(profile) : undefined,
      seed,
      profile,
      look,
      scenes: this.timeline.buildScenes(analysis, style, seed, look),
      mode,
      range: range ?? resolveRange(mode, analysis.duration),
      lyrics: lyrics?.length ? lyrics : undefined,
      lyricPreset: lyricPreset === 'auto' ? style.lyricPreset : lyricPreset,
    };
  }
}
