// A line comes in a little ahead of its voice (runtime LEAD, the entrance's own lead), but the planner starts its shot, and
// the picture cut with it, on the voice. For those 0.2–0.45 s the line printed on the picture before: after an interlude
// the receipt's next line began on the old page (document, 雙截棍 02:32, 2026-11-05). The voice's time is the line's; the
// picture's is not: the shot and its first cut come forward to the line's entrance instead.

/** Two cuts of the picture are never closer than this: a picture up for less is a flash. */
export const PICTURE_MIN = 0.3;

interface ShotTimes {
  id: string;
  start: number;
  end: number;
}
interface SectionTimes {
  start: number;
  layers: object[];
}

/**
 * Moves each shot whose first line comes in before it, and the picture cut starting with it, to that line's entrance; the
 * shot before ends there; a later cut of the shot before that would be left up under PICTURE_MIN is dropped. Where the shot
 * before itself would be left that short, the move stops there and the line comes in with its picture instead (never later
 * than its shot's planned start). Mutates `shots` and `sections`.
 * @param firsts each line's shot and entrance time (the first per shot counts)
 * @returns the latest entrance a shot's first line may keep, by shot id, where the move was stopped short
 */
export function pullPictures(shots: ShotTimes[], sections: SectionTimes[], firsts: { shot: string; show: number }[]): Map<string, number> {
  const late = new Map<string, number>();
  const show = new Map<string, number>();
  for (const f of firsts) if (!show.has(f.shot)) show.set(f.shot, f.show);
  shots.forEach((s, k) => {
    const want = show.get(s.id);
    const prev = shots[k - 1];
    if (want === undefined || !prev || want >= s.start - 1e-3) return;
    // the line's picture: the last cut by its shot's start (a handoff's cut may already be up ahead of the shot)
    const pic = Math.max(-Infinity, ...sections.filter((x) => x.start <= s.start + 1e-3).map((x) => x.start));
    const moves = pic > want + 1e-3;
    const own = moves ? sections.filter((x) => Math.abs(x.start - pic) < 1e-3) : [];
    // a later cut of the shot before (a beat of an interlude, the last line's change of set) that would now be up for
    // less than PICTURE_MIN gives way: its line has left by the time this one comes in
    if (moves)
      for (let i = sections.length - 1; i >= 0; i--) {
        const x = sections[i];
        if (x.start > prev.start + 1e-3 && x.start < pic - 1e-3 && x.start > want - PICTURE_MIN) sections.splice(i, 1);
      }
    const before = moves ? sections.filter((x) => x.start < pic - 1e-3).map((x) => x.start) : [];
    const top = moves ? pic : s.start;
    const to = +Math.max(want, Math.min(top, Math.max(prev.start, ...before) + PICTURE_MIN)).toFixed(3);
    if (moves && to > want + 1e-3) late.set(s.id, to);
    if (to >= top - 1e-3) return;
    for (const x of own) {
      for (const l of x.layers as { at?: number }[]) if (l.at !== undefined && Math.abs(l.at - x.start) < 1e-3) l.at = to;
      x.start = to;
    }
    if (to < s.start) {
      s.start = to;
      prev.end = to;
    }
  });
  return late;
}
