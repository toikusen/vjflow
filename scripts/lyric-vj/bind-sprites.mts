// Placing drawn props into an accepted plan without changing anything else in it (typeplan.mts --bind): the person
// accepted the concept's cuts, lyric layouts, backdrops and pace from the noimg plan, so the img tier keeps them and
// only fills each chosen cut's `sprite` and `size`. Pure: the model's assignments in, the bound plan out.

export interface Assignment { shot: string; beat: number; sprite: string; size: number; why?: string }
interface BindableCut { beat: number; sprite: string; size: number }
interface BindablePlan { shots: { shot: string; cuts: BindableCut[] }[] }

/** A figure's height as a share of the frame, within what the renderer draws (0.5 far … 1.6 close-up). */
export const clampSize = (size: unknown) => Math.min(1.7, Math.max(0.4, Number(size) || 0.85));

/**
 * The plan with each assignment's sprite and size written into its cut; an assignment naming an unknown shot, beat
 * or sprite is dropped and listed. Every other field of every cut stays as accepted.
 */
export function bindSprites<P extends BindablePlan>(plan: P, assignments: Assignment[], sprites: { id: string }[]): { plan: P; applied: number; ignored: string[] } {
  const ids = new Set(sprites.map((x) => x.id));
  const out = structuredClone(plan);
  const ignored: string[] = [];
  let applied = 0;
  for (const a of assignments) {
    const cut = out.shots.find((s) => s.shot === a.shot)?.cuts.find((c) => c.beat === a.beat);
    if (!cut || !ids.has(a.sprite)) {
      ignored.push(`${a.shot}@${a.beat} ${a.sprite}`);
      continue;
    }
    cut.sprite = a.sprite;
    cut.size = clampSize(a.size);
    applied++;
  }
  return { plan: out, applied, ignored };
}
