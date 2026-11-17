// The subject's sequence over the stretches nobody sings (intro, interludes, outro) in the subject-video tier: the
// director's own plan for a stretch where the script has one (SubjectScript.stretches), else a rule-based one read off
// the script's lines. Never the script's shots in turn: 黄昏サイクル's outro ran every cut-out of the song as a
// thirty-second montage (run5, 2026-11-17).
import type { UnsungWindow } from './structure';

/** The director's plan for one unsung stretch: its shots in order (at most STRETCH_SHOTS), and why. */
export interface StretchScript {
  kind: UnsungWindow['kind'];
  /** The stretch's start (s): which interlude it is. */
  at: number;
  shots: string[];
  why: string;
}

/** A stretch's planned sequence: each shot holds its share of the stretch, in order. */
export interface StretchPlan extends UnsungWindow {
  shots: string[];
  shares: number[];
  why: string;
  by: 'director' | 'rule';
}

/** The most shots a stretch shows: a few held images, not a montage. */
export const STRETCH_SHOTS = 3;
/** An interlude this long (s) and more holds a callback between the line before and the line after. */
export const LONG_INTERLUDE = 12;

const uniq = (xs: string[]) => xs.filter((x, i) => xs.indexOf(x) === i);

/**
 * The plan of every unsung window. Where the script has a stretch of the window's kind starting in it (or the nearest),
 * its cut-outs in its order (at most STRETCH_SHOTS, equal shares, the last held longest); else by rule:
 * - intro: the first line's first cut-out, held (the subject is there before the first word);
 * - interlude: the line before's last cut-out carried on, then the line after's first; a long one (LONG_INTERLUDE)
 *   holds the song's recurring shot between them (the cut-out the lines so far used most), a callback;
 * - outro: a callback to the song's opening cut-out, then the last line's last cut-out — the closing image — held to
 *   the end on the larger share (the slow ending).
 */
export function planStretches(
  script: { lines: { cue: string; shots: string[] }[]; stretches?: StretchScript[] },
  cues: { id: string; start: number; end: number }[],
  windows: UnsungWindow[],
  isCutOut: (id: string) => boolean,
): StretchPlan[] {
  const sorted = [...cues].sort((a, b) => a.start - b.start);
  const shotsOf = (id?: string) => (script.lines.find((l) => l.cue === id)?.shots ?? []).filter(isCutOut);
  return windows.map((w) => {
    const own = (script.stretches ?? []).filter((s) => s.kind === w.kind).sort((a, b) => Math.abs(a.at - w.start) - Math.abs(b.at - w.start))[0];
    const ownShots = own ? uniq(own.shots.filter(isCutOut)).slice(0, STRETCH_SHOTS) : [];
    if (own && ownShots.length && (w.kind !== 'interlude' || (own.at >= w.start - 2 && own.at < w.end))) return { ...w, shots: ownShots, shares: sharesOf(ownShots.length), why: own.why, by: 'director' as const };
    const before = sorted.filter((c) => c.end <= w.start + 1e-3).at(-1);
    const after = sorted.find((c) => c.start >= w.end - 1e-3);
    const first = shotsOf(sorted[0]?.id)[0];
    const lastOf = (id?: string) => shotsOf(id).at(-1);
    if (w.kind === 'intro') {
      const shots = uniq([first].filter((x): x is string => !!x));
      return { ...w, shots, shares: sharesOf(shots.length), why: 'the subject before the first line: the first line\'s first shot, held', by: 'rule' as const };
    }
    if (w.kind === 'outro') {
      const closing = lastOf(before?.id);
      const shots = uniq([first, closing].filter((x): x is string => !!x));
      return { ...w, shots, shares: shots.length === 2 ? [0.35, 0.65] : sharesOf(shots.length), why: 'a callback to the opening shot, then the last line\'s closing image held to the end', by: 'rule' as const };
    }
    const carry = lastOf(before?.id);
    const next = shotsOf(after?.id)[0];
    const sofar = sorted.filter((c) => c.end <= w.start + 1e-3).flatMap((c) => shotsOf(c.id));
    const motif = w.end - w.start >= LONG_INTERLUDE ? uniq(sofar).filter((x) => x !== carry && x !== next).sort((a, b) => sofar.filter((x) => x === b).length - sofar.filter((x) => x === a).length || sofar.indexOf(a) - sofar.indexOf(b))[0] : undefined;
    const shots = uniq([carry, motif, next].filter((x): x is string => !!x));
    return { ...w, shots, shares: sharesOf(shots.length), why: motif ? 'the line before carried on, a callback to the song\'s recurring shot, then the line after' : 'the line before carried on into the line after', by: 'rule' as const };
  });
}

/** Equal shares, the last a little longer (the image the stretch rests on). */
function sharesOf(n: number): number[] {
  if (n <= 1) return n ? [1] : [];
  const base = 1 / (n + 0.25);
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? 1 - base * (n - 1) : base));
}

/** The planned shot at time t (s), or undefined when t is in no stretch. */
export function shotAt(plans: StretchPlan[], t: number): string | undefined {
  const p = plans.find((x) => t >= x.start - 1e-3 && t < x.end);
  if (!p?.shots.length) return undefined;
  const k = (t - p.start) / Math.max(1e-6, p.end - p.start);
  let acc = 0;
  for (let i = 0; i < p.shots.length; i++) {
    acc += p.shares[i];
    if (k < acc - 1e-9) return p.shots[i];
  }
  return p.shots.at(-1);
}
