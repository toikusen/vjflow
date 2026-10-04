// Composition pass (program, after the director): the gap analysis found nearly every frame centred and every
// chorus laid out the same. This moves centred shots off-centre so two centred frames never follow each other, and
// makes the choruses escalate (the keyword grows chorus by chorus). Bleed is switched off: every review read the
// cropped keyword as a layout overflow.
import type { Shot, TreatmentV3 } from './treatment';

type Anchor = 'L' | 'C' | 'R';

/** Per template: the param that places it horizontally and its values by anchor (absent = fixed composition). */
const PLACEMENT: Record<string, { param: string; values: Partial<Record<Anchor, string>> }> = {
  punch: { param: 'align', values: { L: 'left', C: 'center', R: 'right' } },
  'frame-split': { param: 'align', values: { L: 'left', C: 'center', R: 'right' } },
  typewriter: { param: 'position', values: { L: 'left', C: 'center' } },
  vertical: { param: 'position', values: { L: 'left', C: 'center', R: 'right' } },
  handwrite: { param: 'position', values: { L: 'left', C: 'center' } },
};

/** Where a shot sits: diagonal and per-word templates read as off-centre already. */
export function anchorOf(s: Shot): Anchor | undefined {
  if (s.template === 'scatter' || s.template === 'beat-cut') return undefined;
  const p = PLACEMENT[s.template];
  if (!p) return 'C';
  const v = s.params[p.param];
  if (s.template === 'punch' && s.params['bleed']) return 'C';
  return (Object.entries(p.values).find(([, x]) => x === v)?.[0] as Anchor) ?? 'C';
}

/**
 * Moves every second centred shot in a run to the side (alternating left/right, away from the previous shot's side)
 * and sets the choruses' keyword size from restrained (first) to full width (last). Returns the repairs made.
 */
export function varyComposition(t: TreatmentV3, choruses: { start: number; end: number }[]): string[] {
  const fixes: string[] = [];
  let prev: Anchor | undefined;
  let side: Anchor = 'R';
  for (const s of t.shots) {
    const a = anchorOf(s);
    const place = PLACEMENT[s.template];
    if (a === 'C' && prev === 'C' && place && !s.params['bleed']) {
      side = side === 'R' ? 'L' : 'R';
      const want = place.values[side] ?? place.values.L ?? place.values.R;
      if (want) {
        s.params[place.param] = want;
        fixes.push(`${s.id} 改為偏${want === 'left' ? '左' : '右'}，避免連續置中`);
        prev = want === 'left' ? 'L' : 'R';
        continue;
      }
    }
    if (a === 'L' || a === 'R') side = a;
    prev = a ?? prev;
  }
  // choruses escalate: keyword width rises chorus by chorus
  choruses.forEach((c, k) => {
    const last = k === choruses.length - 1;
    const width = choruses.length > 1 ? 0.62 + (0.3 * k) / (choruses.length - 1) : 0.8;
    for (const s of t.shots.filter((x) => x.template === 'punch' && x.start < c.end && x.end > c.start)) {
      s.params['keywordWidth'] = +width.toFixed(2);
      s.params['bleed'] = false;
      if (last) s.params['align'] = 'center';
    }
  });
  return fixes;
}
