// A speech balloon's tail, the one proportion every balloon carrier takes (phase 4d round 2; cards
// 2026-11-04-popart-balloon-line and 2026-11-09-screentone-balloon-thin-line: a tail that reads as a thin line joining
// the balloon to nothing was rejected twice). A short wedge on a wide root: its root about BALLOON_TAIL.root px along
// the rim, its tip at most BALLOON_TAIL.len px off the rim, pointed toward the speaker, its sides straight. The same
// numbers as screentone's fixed balloon (world-b5-screentone balloon, 404d73f), here for the balloons drawn as objects.
type Pt = [number, number];

/** Root along the rim and the tail's greatest length off it, px. */
export const BALLOON_TAIL = { root: 110, len: 96 };

/**
 * The tail of an ellipse balloon (centre cx, cy, radii rx, ry) aimed at `aim`: the rim angles its root spans (parametric,
 * the rim drawn the long way from `from` to `to`) and its tip.
 */
export function wedgeTail(cx: number, cy: number, rx: number, ry: number, aim: Pt): { from: number; to: number; tip: Pt } {
  const a = Math.atan2((aim[1] - cy) / ry, (aim[0] - cx) / rx);
  // (a parametric step per px of rim: the root stays ~root px long whatever the balloon's proportions)
  const w = BALLOON_TAIL.root / 2 / Math.max(40, Math.hypot(rx * Math.sin(a), ry * Math.cos(a)));
  const edge: Pt = [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry];
  const d = Math.hypot(aim[0] - edge[0], aim[1] - edge[1]);
  const len = Math.min(d, BALLOON_TAIL.len);
  const tip: Pt = d < 1 ? edge : [edge[0] + ((aim[0] - edge[0]) / d) * len, edge[1] + ((aim[1] - edge[1]) / d) * len];
  return { from: a + w, to: a - w + Math.PI * 2, tip };
}
