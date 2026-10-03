// Per-line timing check against the vocal stem: a line must appear when the voice comes in and stay until it is sung.
// Used by the pipeline (block a render with unchecked lines) and by the timing editor (red rows, suggested fixes).
import { phraseStarts } from './timeline';

export type TimingIssue = 'early' | 'late' | 'cut' | 'silent';

export interface LineCheck {
  id: string;
  ok: boolean;
  issues: TimingIssue[];
  /** Where singing actually resumes nearest to the line start, if that is the likely fix. */
  suggestedStart?: number;
}

/** Tolerance for a line start against the vocal onset (seconds). */
export const START_TOL = 0.15;
const FPS = 100;

/**
 * - early: no singing in the first 0.3 s after the line appears (text before the voice)
 * - late: singing already started more than START_TOL before the line appears
 * - cut: the voice is still going when the line disappears and the next line is not up yet
 * - silent: no singing anywhere inside the line (wrong place entirely)
 */
export function checkLines(cues: { id: string; start: number; end: number }[], active: boolean[]): LineCheck[] {
  const phrases = phraseStarts(active, FPS);
  const on = (a: number, b: number) => {
    for (let i = Math.max(0, Math.floor(a * FPS)); i < Math.min(active.length, Math.ceil(b * FPS)); i++) if (active[i]) return true;
    return false;
  };
  return cues.map((c, k) => {
    const issues: TimingIssue[] = [];
    const next = cues[k + 1];
    if (!on(c.start, c.end)) issues.push('silent');
    else {
      if (!on(c.start, c.start + 0.3)) issues.push('early');
      // singing in the stretch just before the line, after the previous line ended, belongs to this line
      const prevEnd = k > 0 ? cues[k - 1].end : 0;
      const before = phrases.filter((p) => p < c.start - START_TOL && p >= Math.max(prevEnd, c.start - 1.5));
      if (before.length) issues.push('late');
      const gapAfter = next ? next.start - c.end : Infinity;
      if (gapAfter > 0.4 && on(c.end, c.end + 0.25) && on(c.end - 0.25, c.end)) issues.push('cut');
    }
    let suggestedStart: number | undefined;
    if (issues.includes('early') || issues.includes('late')) {
      const lo = k > 0 ? cues[k - 1].start + 0.2 : 0;
      const cand = phrases.filter((p) => p >= lo && p <= c.start + 2 && (!next || p < next.start));
      if (cand.length) suggestedStart = cand.reduce((b, p) => (Math.abs(p - c.start) < Math.abs(b - c.start) ? p : b));
    }
    return { id: c.id, ok: issues.length === 0, issues, suggestedStart };
  });
}

export const ISSUE_LABEL: Record<TimingIssue, string> = {
  early: '字幕比歌聲早',
  late: '字幕比歌聲晚',
  cut: '還在唱字幕就消失',
  silent: '這段時間沒有歌聲',
};
