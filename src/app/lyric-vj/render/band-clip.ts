// Bands: a block of type cut into a few wide strips along one axis, each slid in from its own side. Strip widths follow
// the line's own phrases, so a strip's edge falls between words, and they always cover the block whole. Pure numbers: the
// drawing is in text-fx.ts.

const MAX_BANDS = 5;
const MIN_SHARE = 0.12;

/** Strip edges in 0..1 for these phrase weights: at most five strips, none under an eighth, the last edge exactly 1. */
export function bandEdges(weights: number[]): number[] {
  const parts = [...weights.filter((w) => w > 0)];
  while (parts.length > MAX_BANDS) {
    const k = parts.slice(0, -1).reduce((best, _, i) => (parts[i] + parts[i + 1] < parts[best] + parts[best + 1] ? i : best), 0);
    parts.splice(k, 2, parts[k] + parts[k + 1]);
  }
  if (parts.length === 0) return [0, 1];
  const total = () => parts.reduce((a, x) => a + x, 0);
  for (let k = parts.findIndex((p) => p / total() < MIN_SHARE); k >= 0 && parts.length > 1; k = parts.findIndex((p) => p / total() < MIN_SHARE)) {
    const into = k === 0 ? 1 : k === parts.length - 1 ? k - 1 : parts[k - 1] < parts[k + 1] ? k - 1 : k + 1;
    parts[into] += parts[k];
    parts.splice(k, 1);
  }
  const sum = total();
  const edges = parts.reduce<number[]>((out, p) => [...out, out[out.length - 1] + p / sum], [0]);
  edges[edges.length - 1] = 1;
  return edges;
}

/** Each strip's start within the entrance, 0..0.3: the outer strips first, closing on the middle. */
const delayOf = (i: number, n: number) => (n < 2 ? 0 : 0.3 * (1 - Math.abs(2 * i - (n - 1)) / (n - 1)));

const easeOut = (x: number) => 1 - (1 - Math.min(1, Math.max(0, x))) ** 3;

/** How far strip i of n still has to slide at entrance progress k (0..1), as a share of `reach`, signed by side; exactly 0 from k = 1. */
export function bandOffset(i: number, n: number, k: number, first = 1): number {
  if (k >= 1) return 0;
  const d = delayOf(i, n);
  const q = Math.min(1, Math.max(0, (k - d) / (1 - d)));
  return (i % 2 === 0 ? first : -first) * (1 - easeOut(q));
}

/** Slat edges across a block: the bands of these weights, the widest halved off-centre until there are `least`, unequal. */
export function slatEdges(weights: number[], least = 3): number[] {
  const edges = bandEdges(weights);
  while (edges.length < least + 1) {
    const k = edges.slice(0, -1).reduce((best, _, i) => (edges[i + 1] - edges[i] > edges[best + 1] - edges[best] ? i : best), 0);
    edges.splice(k + 1, 0, edges[k] + (edges[k + 1] - edges[k]) * 0.58);
  }
  return edges;
}

/** Slat i of n still this far off face-on at k, in radians: short of edge-on to begin with, exactly 0 from k = 1. */
export function slatTurn(i: number, n: number, k: number, fromLeft: boolean, from = 1.26): number {
  if (k >= 1) return 0;
  const d = n < 2 ? 0 : 0.42 * ((fromLeft ? i : n - 1 - i) / (n - 1));
  return from * (1 - easeOut((k - d) / (1 - d)));
}
