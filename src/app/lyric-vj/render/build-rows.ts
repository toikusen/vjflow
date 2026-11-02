// The rows of a built line (build-cut.ts): how many, how big, where they sit as more of them come up.

const W = 1920;
const H = 1080;

/** At most four rows: the shortest neighbours join until they fit. */
export function fourPieces<T extends { text: string; from: number }>(pieces: T[]): T[] {
  const out = [...pieces];
  while (out.length > 4) {
    const k = out.slice(0, -1).reduce((best, _, i) => (out[i].text.length + out[i + 1].text.length < out[best].text.length + out[best + 1].text.length ? i : best), 0);
    out.splice(k, 2, { ...out[k], text: out[k].text + out[k + 1].text });
  }
  return out;
}

const letters = (s: string) => (s.match(/[\p{L}\p{N}]/gu) ?? []).length;

/** A line never opens on one character alone: the first phrase takes in the next, unless that character is the whole line. */
export function openOnTwo<T extends { text: string; from: number }>(pieces: T[], text: string): T[] {
  if (pieces.length < 2 || letters(pieces[0].text) >= 2) return pieces;
  const [first, , ...rest] = pieces;
  const end = rest[0]?.from ?? [...text].length;
  return [{ ...first, text: [...text].slice(first.from, end).join('').trim() }, ...rest];
}

/** The line cut at these code-point offsets, each piece trimmed; a piece of nothing but spaces is left out. */
export function piecesAt(text: string, breaks: number[]): { text: string; from: number }[] {
  const cs = [...text];
  const edges = [0, ...breaks, cs.length];
  return edges.slice(0, -1).flatMap((from, k) => {
    const raw = cs.slice(from, edges[k + 1]).join('');
    const lead = raw.length - raw.trimStart().length;
    return raw.trim() ? [{ text: raw.trim(), from: from + [...raw.slice(0, lead)].length }] : [];
  });
}

/** How much larger a row is set while it is alone in the frame: as big as the frame lets it, never smaller than its place in the block. */
export function loneScale(size: number, width: number): number {
  return Math.max(1, Math.min((W * 0.84) / Math.max(1, width), 340 / size, (H * 0.8) / (size * 1.16)));
}

/** Sizes for the rows: the key row the largest, every row inside the frame, widths as measured at size 200. */
export function fitRows(widths200: number[], keyRow: number, ratio: number): number[] {
  const want = widths200.map((_, i) => (i === keyRow ? 1 : ratio));
  const widest = Math.max(...widths200.map((w, i) => (w * want[i]) / 200));
  const tall = want.reduce((a, x) => a + x * 1.16, 0);
  const base = Math.min(W * 0.84 / widest, H * 0.8 / tall, 340);
  return want.map((x) => Math.round(base * x));
}

/** Each row's y with the first `shown` rows up, the block centred on the frame. */
export function rowTargets(sizes: number[], shown: number): number[] {
  const up = sizes.slice(0, shown).map((s) => s * 1.16);
  const total = up.reduce((a, x) => a + x, 0);
  let y = total / 2;
  return sizes.map((s, i) => {
    if (i >= shown) return -total / 2 - s;
    const at = y - up[i] / 2;
    y -= up[i];
    return at;
  });
}

