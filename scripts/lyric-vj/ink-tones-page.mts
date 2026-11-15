// The tone table generator's page side (ink-tones.mts): one moment, each world line at rest, the ground right round its
// glyphs as the gate reads it: the pixels within RIM px of where the words are drawn (the words-on frame differs from
// the words-off frame there), read in the words-off frame with the final pass at rest; their 10th and 90th percentile (a decision input: the gate stays per pixel).
// (A glyph's em box ran past a tape onto the page; the rim is what the reading stands on, 2026-11-15.)
const REST = ['uVignette', 'uVigBase', 'uFade', 'uGrain', 'uPaper', 'uBoil', 'uLift', 'uTooth', 'uPixel', 'uScan', 'uGlitch', 'uAberration', 'uFlash', 'uHit', 'uZoomHit', 'uTileHit', 'uRays', 'uBeams', 'uShock', 'uSweep', 'uShockR', 'uGlass', 'uFlicker'];
const RIM = 3;
type G = { id: string; glyphs: { x0: number; y0: number; x1: number; y1: number; a: number; phase?: string }[] }[];
const w = window as unknown as { vjFrame(t: number): Promise<HTMLCanvasElement>; vjGlyphs(): G; vjLyrics(on: boolean, carriers?: boolean): void; __vjFinalOff?: string[]; inkTonesPage: unknown };

const pixels = (stage: HTMLCanvasElement) => { const c = new OffscreenCanvas(stage.width, stage.height); const g = c.getContext('2d')!; g.drawImage(stage, 0, 0); return g.getImageData(0, 0, stage.width, stage.height).data; };
const hex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
const lum = (r: number, g: number, b: number) => { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };

async function read(t: number, ids: string[]): Promise<{ id: string; lo: string; hi: string }[]> {
  w.__vjFinalOff = REST;
  try {
    const stage = await w.vjFrame(t);
    const boxes = w.vjGlyphs().filter((l) => ids.includes(l.id)).map((l) => {
      const gs = l.glyphs.filter((g) => g.a > 0.01);
      // (a line read at rest only: coming or going it may stand off its carrier, a tape still rolling in over the page)
      if (!gs.length || gs.some((g) => g.phase && g.phase !== 'rest')) return undefined;
      return { id: l.id, x0: Math.max(0, Math.floor(Math.min(...gs.map((g) => g.x0)))), y0: Math.max(0, Math.floor(Math.min(...gs.map((g) => g.y0)))), x1: Math.min(stage.width, Math.ceil(Math.max(...gs.map((g) => g.x1)))), y1: Math.min(stage.height, Math.ceil(Math.max(...gs.map((g) => g.y1)))) };
    }).filter((x): x is NonNullable<typeof x> => !!x && x.x1 > x.x0 && x.y1 > x.y0);
    if (!boxes.length) return [];
    const on = pixels(stage);
    w.vjLyrics(false, true);
    const off = pixels(await w.vjFrame(t));
    const W = stage.width;
    return boxes.flatMap((b) => {
      const [bw, bh] = [b.x1 - b.x0, b.y1 - b.y0];
      const ink = new Uint8Array(bw * bh);
      for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) { const k = ((y + b.y0) * W + x + b.x0) * 4; ink[y * bw + x] = Math.max(Math.abs(on[k] - off[k]), Math.abs(on[k + 1] - off[k + 1]), Math.abs(on[k + 2] - off[k + 2])) > 24 ? 1 : 0; }
      const ls: [number, number][] = [];
      for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
        if (ink[y * bw + x]) continue;
        let near = false;
        for (let dy = -RIM; dy <= RIM && !near; dy++) for (let dx = -RIM; dx <= RIM && !near; dx++) { const [qx, qy] = [x + dx, y + dy]; if (qx >= 0 && qy >= 0 && qx < bw && qy < bh && dx * dx + dy * dy <= RIM * RIM && ink[qy * bw + qx]) near = true; }
        if (!near) continue;
        const k = ((y + b.y0) * W + x + b.x0) * 4;
        ls.push([lum(off[k], off[k + 1], off[k + 2]), k]);
      }
      if (ls.length < 20) return [];
      ls.sort((p, q) => p[0] - q[0]);
      const [a, z] = [ls[Math.floor(ls.length * 0.1)][1], ls[Math.floor(ls.length * 0.9)][1]];
      return [{ id: b.id, lo: hex(off[a], off[a + 1], off[a + 2]), hi: hex(off[z], off[z + 1], off[z + 2]) }];
    });
  } finally {
    w.__vjFinalOff = undefined;
    w.vjLyrics(true);
  }
}
w.inkTonesPage = { read };
