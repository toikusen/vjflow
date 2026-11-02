// A hit on the whole picture for a few frames as a line lands. It acts on what is behind the lyrics only: the type is
// composited after it, so the line stays sharp through the hit.

export type ScreenHit = 'zoom' | 'tile';
/** How long a hit lasts (s): five film frames for the zoom's rush, two for the tiled frame. */
export const HIT_SEC: Record<ScreenHit, number> = { zoom: 5 / 24, tile: 2 / 24 };

/** The strength of the hits at time t, 0–1 each; a hit starts at full strength and the zoom falls away. */
export function hitAt(hits: { at: number; hit: ScreenHit }[], t: number) {
  let zoom = 0;
  let tile = 0;
  for (const h of hits) {
    const k = (t - h.at) / HIT_SEC[h.hit];
    if (k < 0 || k >= 1) continue;
    if (h.hit === 'zoom') zoom = Math.max(zoom, (1 - k) ** 2);
    else tile = 1;
  }
  return { zoom, tile };
}
