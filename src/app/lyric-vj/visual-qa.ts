// Frame checks a finished design must pass before a paying user sees it: the bugs the 28-style test found (a frame
// gone one flat colour, black wedges from a mask on a light paper look) show in a few sampled stills, so the program
// measures them instead of waiting for the user to notice.

export interface FrameStats {
  t: number;
  /** Luminance standard deviation (0..255). */
  std: number;
  median: number;
  /** Share of 4×4-pixel blocks of the 192×108 thumbnail (40 px squares in 1080p) that are dark all over: a mask or
   * an unpainted hole, which lyric strokes (thin) never fill. Pure black reads ~40 after the grain and paper pass. */
  black: number;
}

/** Stats of one RGBA frame, a `w`-wide thumbnail (192×108 by default). */
export function frameStats(t: number, px: ArrayLike<number>, w = 192): FrameStats {
  const n = Math.floor(px.length / 4);
  const lum = new Float32Array(n);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    lum[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
    sum += lum[i];
  }
  const h = Math.floor(n / w);
  let dark = 0;
  let blocks = 0;
  for (let by = 0; by + 4 <= h; by += 4)
    for (let bx = 0; bx + 4 <= w; bx += 4) {
      let m = 0;
      for (let y = by; y < by + 4; y++) for (let x = bx; x < bx + 4; x++) m += lum[y * w + x];
      blocks++;
      if (m / 16 < 35) dark++;
    }
  const black = dark / Math.max(1, blocks);
  const mean = sum / n;
  let sq = 0;
  for (let i = 0; i < n; i++) sq += (lum[i] - mean) ** 2;
  const median = [...lum].sort((a, b) => a - b)[n >> 1];
  return { t, std: Math.sqrt(sq / n), median, black };
}

/**
 * Problems in words for the director, or none. Only definite breakage: "mostly bare ground" was tried and dropped, as
 * the approved terminal look (phosphor text on black) measured as empty as the rejected one.
 */
export function visualIssues(frames: FrameStats[]): string[] {
  const out: string[] = [];
  const at = (f: FrameStats) => `${f.t.toFixed(1)} 秒`;
  const blank = frames.filter((f) => f.std < 3);
  if (blank.length) out.push(`${blank.map(at).join('、')} 的畫面幾乎是一整片單色（沒有圖形也沒有字）`);
  // swiss's deliberate black bars measured 3 % of a white frame; a black disc of radius 0.3 measured 12 %
  const holes = frames.filter((f) => f.median > 150 && f.black > 0.06);
  if (holes.length) out.push(`${holes.map(at).join('、')} 的淺色畫面裡出現純黑色塊（${holes.map((f) => `${Math.round(f.black * 100)}%`).join('、')}）：可能是遮罩或沒畫到的區域`);
  return out;
}

/**
 * When to sample a song's stills: the moments where breakage shows first come first — the finale and each drop just
 * after they hit, the three longest lines (most text, most room taken), each chorus just after it lands — then an even
 * spread fills the rest. Within 2 s of an earlier pick counts as the same moment; at most `max`.
 */
export function sampleTimes(
  duration: number,
  song: { sections?: { start: number; type?: string }[]; cues?: { start: number; end: number; text: string }[] },
  moments: { kind: string; at: number }[] = [],
  max = 16,
): number[] {
  const hits = moments.filter((m) => m.kind === 'finale' || m.kind === 'drop').sort((a, b) => (a.kind === 'finale' ? -1 : 0) - (b.kind === 'finale' ? -1 : 0)).map((m) => m.at + 0.4);
  const longest = [...(song.cues ?? [])].sort((a, b) => [...b.text].length - [...a.text].length).slice(0, 3).map((c) => (c.start + c.end) / 2);
  const choruses = (song.sections ?? []).filter((s) => s.type === 'chorus').map((s) => s.start + 1.5);
  const even = Array.from({ length: max }, (_, i) => (duration * (i + 0.5)) / max);
  const out: number[] = [];
  for (const t of [...hits, ...longest, ...choruses, ...even]) {
    if (out.length >= max) break;
    if (t > 0 && t < duration && out.every((x) => Math.abs(x - t) >= 2)) out.push(t);
  }
  return out.sort((a, b) => a - b);
}
