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

const moveSection = (x: SectionTimes, to: number) => {
  for (const l of x.layers as { at?: number }[]) if (l.at !== undefined && Math.abs(l.at - x.start) < 1e-3) l.at = to;
  x.start = to;
};

/**
 * Moves each shot whose first line comes in before it, and the picture cut starting with it, to that line's entrance; the
 * shot before ends there. The shot before keeps its cuts (the owner wants the cut rate): a later one the move would leave up
 * under PICTURE_MIN comes forward, and the ones before it as far as needed, each kept up PICTURE_MIN; one is dropped only
 * where the shot before has no room left for it. Where the shot before cannot keep even its first cut up PICTURE_MIN, the
 * move stops there and the line comes in with its picture instead (never later than its shot's planned start). Mutates
 * `shots` and `sections` (kept in time order).
 * @param firsts each line's shot and entrance time (the first per shot counts)
 * @returns `late`: the latest entrance a shot's first line may keep, by shot id, where the move was stopped short;
 * `dropped`: how many cuts had no room
 */
export function pullPictures(shots: ShotTimes[], sections: SectionTimes[], firsts: { shot: string; show: number }[]): { late: Map<string, number>; dropped: number } {
  const late = new Map<string, number>();
  let dropped = 0;
  const show = new Map<string, number>();
  for (const f of firsts) if (!show.has(f.shot)) show.set(f.shot, f.show);
  shots.forEach((s, k) => {
    const want = show.get(s.id);
    const prev = shots[k - 1];
    if (want === undefined || !prev || want >= s.start - 1e-3) return;
    // the line's picture: the last cut by its shot's start (a handoff's cut may already be up ahead of the shot)
    const pic = Math.max(-Infinity, ...sections.filter((x) => x.start <= s.start + 1e-3).map((x) => x.start));
    const moves = pic > want + 1e-3;
    // what the shot before stands on from its start (its first cut, or a cut before it still up), never moved
    const anchor = Math.max(-Infinity, ...sections.filter((x) => x.start <= prev.start + 1e-3).map((x) => x.start));
    const top = moves ? pic : s.start;
    const to = +Math.max(want, Math.min(top, Math.max(prev.start, anchor) + PICTURE_MIN)).toFixed(3);
    if (moves && to > want + 1e-3) late.set(s.id, to);
    if (to >= top - 1e-3) return;
    if (moves) {
      const own = sections.filter((x) => Math.abs(x.start - pic) < 1e-3);
      // the shot before's later cuts, latest first: each comes forward as far as the one after it needs
      const tail = sections.filter((x) => x.start > anchor + 1e-3 && x.start < pic - 1e-3).reverse();
      let limit = to - PICTURE_MIN;
      for (const x of tail) {
        if (x.start <= limit + 1e-3) break;
        const at = +limit.toFixed(3);
        if (at < anchor + PICTURE_MIN - 1e-3) {
          sections.splice(sections.indexOf(x), 1);
          dropped += 1;
          continue;
        }
        moveSection(x, at);
        limit = at - PICTURE_MIN;
      }
      for (const x of own) moveSection(x, to);
    }
    if (to < s.start) {
      s.start = to;
      prev.end = to;
    }
  });
  return { late, dropped };
}
