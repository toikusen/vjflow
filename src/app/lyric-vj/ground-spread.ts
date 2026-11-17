// The grounds a passage of cuts stands on, spread by meaning's leave: no one ground family on more than
// GROUND_FAMILY_CAP of a section's cuts, and the same ground never back within GROUND_REPEAT_GAP cuts. A world's pool is
// small by design, and every rule before this one looked only at the cut before: 黄昏サイクル v4 (2026-11-17) stood 18
// of its 29 window cuts on the same stripe and block (riso/two-drum, riso/grain-block), the video stage's bar splits
// copying the ground they split. A general rule for every tier and world: the spread runs on the line director's plan
// (linedirect-core) and again on the video stage's sections.

/** The most of a section's cuts one ground family may take. */
export const GROUND_FAMILY_CAP = 0.35;
/** The same ground is not back within this many cuts. */
export const GROUND_REPEAT_GAP = 2;

/** A ground's family: its id without the world's prefix ('riso/two-drum' → 'two-drum'; 'overprint' stays). */
export const groundFamily = (fx: string) => fx.replace(/^[^/]+\//, '');

export interface GroundCut { fx: string }
export interface SpreadOptions<T extends GroundCut> {
  /** The grounds a cut may take instead (its world's pool, no peaks, no set pages). */
  pool: (cut: T) => string[];
  /** A cut whose ground is never changed: a peak, a set's own page, a grid, a line's named ground the composer must keep. */
  fixed?: (cut: T) => boolean;
  /** A cut changed only after every other in the section was (the director's own ground: meaning before spread). */
  later?: (cut: T) => boolean;
}

/** The share of a section's cuts each ground family holds. */
export function groundShares(cuts: GroundCut[]): Map<string, number> {
  const n = Math.max(1, cuts.length);
  const out = new Map<string, number>();
  for (const c of cuts) out.set(groundFamily(c.fx), (out.get(groundFamily(c.fx)) ?? 0) + 1 / n);
  return out;
}

/** The most cuts of a section one family may hold under the cap: at least one, never under a quarter of a tiny section. */
export const capCount = (n: number, cap = GROUND_FAMILY_CAP) => Math.max(1, Math.floor(n * cap + 1e-9));

/**
 * Spreads the grounds of each section in place: walking its cuts, one whose family is already at the cap or was on a
 * cut within the gap takes the least-used ground of its pool that is not; cuts `later` marks are changed only on a
 * second pass, when the first could not bring the section under the cap. Returns how many cuts changed.
 */
export function spreadGrounds<T extends GroundCut>(sections: T[][], o: SpreadOptions<T>): number {
  let changed = 0;
  for (const cuts of sections) {
    const n = cuts.length;
    if (n < 2) continue;
    const most = capCount(n);
    for (const pass of [0, 1]) {
      const count = new Map<string, number>();
      const last = new Map<string, number>();
      const fam = (fx: string) => groundFamily(fx);
      const within = (f: string, i: number) => last.has(f) && i - last.get(f)! <= GROUND_REPEAT_GAP;
      const ahead = (f: string, i: number) => (count.get(f) ?? 0) >= most;
      cuts.forEach((c, i) => {
        const f = fam(c.fx);
        const movable = !o.fixed?.(c) && (pass === 1 || !o.later?.(c));
        if (movable && (ahead(f, i) || within(f, i))) {
          const pool = [...new Set(o.pool(c))].filter((g) => !ahead(fam(g), i) && !within(fam(g), i) && fam(g) !== f);
          // (the least used first; between equals, the pool's order from this cut on, so a run never settles into one swap)
          const pick = pool.map((g, k) => ({ g, k: (k + i) % Math.max(1, pool.length), n: count.get(fam(g)) ?? 0 })).sort((a, b) => a.n - b.n || a.k - b.k)[0];
          if (pick) { c.fx = pick.g; changed += 1; }
        }
        const f2 = fam(c.fx);
        count.set(f2, (count.get(f2) ?? 0) + 1);
        last.set(f2, i);
      });
      if (![...count.values()].some((v) => v > most)) break;
    }
  }
  return changed;
}

export interface GroundVarietyFault { section: string; family: string; share: number; cuts: number }
/**
 * The check: every section's ground families under the cap (a section of under four cuts is not judged: two cuts of
 * one ground are half of it), and no ground back within the gap. For plan checks and the video stage's log.
 */
export function groundVariety(sections: { id: string; cuts: GroundCut[] }[], cap = GROUND_FAMILY_CAP): { ok: boolean; failing: GroundVarietyFault[]; repeats: { section: string; fx: string; at: number }[] } {
  const failing: GroundVarietyFault[] = [];
  const repeats: { section: string; fx: string; at: number }[] = [];
  for (const s of sections) {
    const n = s.cuts.length;
    if (n >= 4) for (const [family, share] of groundShares(s.cuts)) if (share > cap + 1e-9 && Math.round(share * n) > capCount(n, cap)) failing.push({ section: s.id, family, share: +share.toFixed(3), cuts: n });
    s.cuts.forEach((c, i) => {
      for (let k = 1; k <= GROUND_REPEAT_GAP; k++) if (i - k >= 0 && groundFamily(s.cuts[i - k].fx) === groundFamily(c.fx)) { repeats.push({ section: s.id, fx: c.fx, at: i }); break; }
    });
  }
  return { ok: !failing.length && !repeats.length, failing, repeats };
}
