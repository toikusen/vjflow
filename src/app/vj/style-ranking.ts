import { SongProfile } from '../audio/song-profile';
import { VJ_STYLE_LIST } from './styles';
import { VJStyleId } from './vj-project.model';

export interface StyleScore {
  styleId: VJStyleId;
  /** Higher is better; 0 = perfect match. */
  score: number;
}

/** Arousal separates styles most, then valence, then timbre. */
const WEIGHTS = { arousal: 0.45, valence: 0.35, brightness: 0.2 };

/** Styles ordered from best to worst fit for the song (negative weighted distance to each style's affinity). */
export function rankStyles(profile: SongProfile): StyleScore[] {
  return VJ_STYLE_LIST.map(({ id, affinity }) => ({
    styleId: id,
    score: -Math.sqrt(
      WEIGHTS.arousal * (profile.arousal - affinity.arousal) ** 2 +
        WEIGHTS.valence * (profile.valence - affinity.valence) ** 2 +
        WEIGHTS.brightness * (profile.brightness - affinity.brightness) ** 2,
    ),
  })).sort((a, b) => b.score - a.score);
}

/** Short human reason for an automatic choice, e.g. 「小調・慢板 78 BPM・聲音偏暗」. */
export function describeProfile(p: SongProfile): string {
  const parts: string[] = [];
  if (p.modeConfidence >= 0.3) parts.push(p.mode === 'major' ? '大調' : '小調');
  const bpm = Math.round(p.tempo);
  parts.push(p.tempo < 95 ? `慢板 ${bpm} BPM` : p.tempo > 135 ? `快板 ${bpm} BPM` : `${bpm} BPM`);
  if (p.arousal >= 0.65) parts.push('能量強');
  else if (p.arousal <= 0.35) parts.push('氣氛平靜');
  if (p.brightness >= 0.65) parts.push('聲音明亮');
  else if (p.brightness <= 0.35) parts.push('聲音偏暗');
  return parts.join('・');
}
