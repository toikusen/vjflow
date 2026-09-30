export interface LyricCue {
  start: number;
  end: number;
  text: string;
}

/**
 * 'timestamped' = from LRC tags; 'aligned' = automatic alignment to the vocals;
 * 'transcribed' = no lyrics given, text and timing both recognized from the vocals;
 * 'provisional' = evenly spread placeholder (fallback when alignment is unavailable).
 */
export type LyricTiming = 'timestamped' | 'aligned' | 'transcribed' | 'provisional';

export interface ParsedLyrics {
  cues: LyricCue[];
  timing: LyricTiming;
}

export type LyricPreset = 'minimal' | 'kinetic' | 'idol';
