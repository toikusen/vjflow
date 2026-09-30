export type SectionType = 'intro' | 'verse' | 'chorus' | 'bridge' | 'outro';

/** Per-hop audio features; every value is normalized to 0..1. */
export interface AudioFeatureFrame {
  time: number;
  energy: number;
  bass: number;
  mid: number;
  treble: number;
  spectralFlux?: number;
}

export interface AudioSection {
  start: number;
  end: number;
  energy: number;
  type?: SectionType;
}

export interface AudioAnalysis {
  duration: number;
  /** Seconds between consecutive frames. */
  frameInterval: number;
  frames: AudioFeatureFrame[];
  /** Beat times in seconds, ascending. */
  beats: number[];
  /** Estimated tempo in BPM. */
  tempo: number;
  sections: AudioSection[];
}

/** The subset of AudioBuffer the analyzer needs; lets tests pass synthetic buffers. */
export type AudioBufferLike = Pick<AudioBuffer, 'sampleRate' | 'length' | 'numberOfChannels' | 'getChannelData'>;
