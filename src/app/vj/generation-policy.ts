import { InjectionToken } from '@angular/core';

/** Seconds of a track included in the free preview. */
export const FREE_PREVIEW_DURATION = 60;

/** 'preview' = free first-N-seconds; 'full' = whole track (the future paid / credit-metered option). */
export type GenerationMode = 'preview' | 'full';

/** The playable, exportable part of the track. Not always from 0: later an AI may pick the best 60 s. */
export interface PlayRange {
  start: number;
  end: number;
}

/** What a generation would cover and cost, shown in the UI before the user commits. */
export interface GenerationQuote {
  mode: GenerationMode;
  range: PlayRange;
  /** Length of the range; the unit a time-based credit model would bill. */
  seconds: number;
  /** Credits this generation consumes (0 = free). */
  credits: number;
  /** True when the user must unlock (pay / top up) before generating. */
  locked: boolean;
}

/**
 * Decides what a user may generate and what it costs.
 * Swap the provider for GENERATION_POLICY to add a paywall or credit metering;
 * the store and UI only talk to this interface.
 */
export interface GenerationPolicy {
  quote(mode: GenerationMode, trackDuration: number): GenerationQuote;
  /**
   * Called once per (track, mode) before generating. Resolve false to cancel
   * (e.g. the user closed the checkout). A real implementation would charge / deduct credits here.
   */
  authorize(quote: GenerationQuote): Promise<boolean>;
}

export function resolveRange(mode: GenerationMode, trackDuration: number, previewStart = 0): PlayRange {
  if (mode === 'full') return { start: 0, end: trackDuration };
  const start = Math.max(0, Math.min(previewStart, trackDuration));
  return { start, end: Math.min(trackDuration, start + FREE_PREVIEW_DURATION) };
}

/** Current behaviour: everything unlocked and free. */
export const openAccessPolicy: GenerationPolicy = {
  quote(mode, trackDuration) {
    const range = resolveRange(mode, trackDuration);
    return { mode, range, seconds: range.end - range.start, credits: 0, locked: false };
  },
  authorize: async () => true,
};

export const GENERATION_POLICY = new InjectionToken<GenerationPolicy>('GenerationPolicy', {
  providedIn: 'root',
  factory: () => openAccessPolicy,
});
