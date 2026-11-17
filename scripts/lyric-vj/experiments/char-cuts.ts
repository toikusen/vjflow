// Experiment-only (the character / subject video tiers' first edits): kept for reference, not part of any pipeline.
// Cut grid for the character video tier: where the cuts fall and which planned shot each one shows.
// The rhythm is read from the song itself (its beat grid, its energy curve, its line starts), never from fixed seconds:
// a slow quiet song holds for bars, a loud fast one cuts every beat or two. What is shown is the song's own plan
// (plan.json: a shot list and, per line, the shots in order) — this module only places it.

export interface CutPlanLine {
  /** The lyric cue these shots belong to. */
  cue: string;
  start: number;
  end: number;
  /** Shot ids in the order they are shown over the line (cycled when the line has more cuts than shots). */
  shots: string[];
  /** The song's own call for this line: hold this many beats per cut instead of what the energy says. */
  beats?: number;
}

export interface Cut {
  start: number;
  end: number;
  shot: string;
  cue: string;
  /** How many times this shot has been shown before this cut (0 = first time): an alternate clip use may be picked. */
  showing: number;
}

export interface GridOptions {
  /** The shortest cut (s): the renderer's floor for a beat-cut design (treatment.ts MIN_SHOT_BEAT_CUT). */
  minCut?: number;
  /** Energy curve (0..1) at a song time. */
  energyAt: (t: number) => number;
}

/**
 * Beats held per cut from the section's energy, the default when the plan says nothing for a line: quiet (< 0.35)
 * two bars, calm (< 0.5) a bar, else half a bar. The beat itself scales with tempo, so the same rule gives long holds
 * on a ballad and short ones on an idol song; a line's own `beats` (a one-beat run on a hook, a whole bar on a held
 * note) is the song's call, in its plan.
 */
export function holdBeats(energy: number): number {
  if (energy < 0.35) return 8;
  if (energy < 0.5) return 4;
  return 2;
}

/** The beat at or after t (the first beat when t is before all of them). */
const beatAt = (beats: number[], t: number) => beats.find((b) => b >= t - 1e-6) ?? beats[beats.length - 1];

/**
 * Cuts over the lines: each line starts a cut on its own start (a phrase boundary outranks the beat grid), then every
 * hold (in beats: the line's own, else from the energy there) until the next line; a leftover shorter than minCut joins
 * the cut before. Shots cycle through the line's list in order.
 */
export function cutGrid(beats: number[], lines: CutPlanLine[], opts: GridOptions): Cut[] {
  const minCut = opts.minCut ?? 0.3;
  const shown = new Map<string, number>();
  const cuts: Cut[] = [];
  const sorted = [...lines].sort((a, b) => a.start - b.start);
  sorted.forEach((line, li) => {
    const end = sorted[li + 1]?.start ?? line.end;
    if (!line.shots.length || end - line.start < minCut) return;
    let t = line.start;
    let n = 0;
    while (t < end - 1e-6) {
      const hold = line.beats ?? holdBeats(opts.energyAt(t));
      const i = beats.findIndex((b) => b > t + 1e-6);
      let next = i < 0 ? end : (beats[i + hold - 1] ?? end);
      // the first beat may be a hair after the line start: a hold counts from the beat at the line's start
      if (next - t < minCut) next = beats[i + hold] ?? end;
      next = Math.min(end, next);
      if (end - next < minCut) next = end;
      const shot = line.shots[n % line.shots.length];
      const showing = shown.get(shot) ?? 0;
      shown.set(shot, showing + 1);
      cuts.push({ start: +t.toFixed(3), end: +next.toFixed(3), shot, cue: line.cue, showing });
      t = next;
      n++;
    }
  });
  return cuts;
}

/** Share of the cuts (by count) whose shot is a still or a frozen tail of a clip. */
export function stillShare(cuts: Cut[], isStill: (shot: string) => boolean): number {
  if (!cuts.length) return 0;
  return cuts.filter((c) => isStill(c.shot)).length / cuts.length;
}

/** Reads the energy curve (song.energy at energyFps) as a smoothed value at t: the mean over a window of `sec` seconds. */
export function energyReader(energy: number[], fps: number, sec = 2): (t: number) => number {
  return (t: number) => {
    const a = Math.max(0, Math.floor((t - sec / 2) * fps));
    const b = Math.min(energy.length, Math.ceil((t + sec / 2) * fps));
    if (b <= a) return 0;
    let s = 0;
    for (let i = a; i < b; i++) s += energy[i];
    return s / (b - a);
  };
}

export const _test = { beatAt };
