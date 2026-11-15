// The tone table generator's page side (ink-tones.mts): one moment, each world line at rest, the ground it stands on
// with the words off and the final pass at rest: inside its carrier's drawn rect (inset a little) where it stands on one,
// else under its glyphs' boxes; the worst tones there (1st and 99th percentile of the pixels' luminance, not a mean).
const REST = ['uVignette', 'uVigBase', 'uFade', 'uGrain', 'uPaper', 'uBoil', 'uLift', 'uTooth', 'uPixel', 'uScan', 'uGlitch', 'uAberration', 'uFlash', 'uHit', 'uZoomHit', 'uTileHit', 'uRays', 'uBeams', 'uShock', 'uSweep', 'uShockR', 'uGlass', 'uFlicker'];
type Box = { x0: number; y0: number; x1: number; y1: number };
type G = { id: string; glyphs: (Box & { a: number; phase?: string; on?: Box })[] }[];
const w = window as unknown as { vjFrame(t: number): Promise<HTMLCanvasElement>; vjGlyphs(): G; vjLyrics(on: boolean, carriers?: boolean): void; __vjFinalOff?: string[]; inkTonesPage: unknown };

const pixels = (stage: HTMLCanvasElement) => { const c = new OffscreenCanvas(stage.width, stage.height); const g = c.getContext('2d')!; g.drawImage(stage, 0, 0); return g.getImageData(0, 0, stage.width, stage.height).data; };
const hex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
const lum = (r: number, g: number, b: number) => { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };

async function read(t: number, ids: string[]): Promise<{ id: string; lo: string; hi: string; carried: boolean }[]> {
  w.__vjFinalOff = REST;
  try {
    const stage = await w.vjFrame(t);
    const [W, H] = [stage.width, stage.height];
    const where = w.vjGlyphs().filter((l) => ids.includes(l.id)).flatMap((l) => {
      const gs = l.glyphs.filter((g) => g.a > 0.01);
      // (a line read at rest only: coming or going it may stand off its carrier)
      if (!gs.length || gs.some((g) => g.phase && g.phase !== 'rest')) return [];
      const on = gs.find((g) => g.on)?.on;
      // (inside its carrier, inset a tenth of each side: a carrier's picture carries its own shadow and margin round it)
      const box = on ? { x0: on.x0 + (on.x1 - on.x0) * 0.1, y0: on.y0 + (on.y1 - on.y0) * 0.1, x1: on.x1 - (on.x1 - on.x0) * 0.1, y1: on.y1 - (on.y1 - on.y0) * 0.1 } : { x0: Math.min(...gs.map((g) => g.x0)), y0: Math.min(...gs.map((g) => g.y0)), x1: Math.max(...gs.map((g) => g.x1)), y1: Math.max(...gs.map((g) => g.y1)) };
      const r = { x0: Math.max(0, Math.floor(box.x0)), y0: Math.max(0, Math.floor(box.y0)), x1: Math.min(W, Math.ceil(box.x1)), y1: Math.min(H, Math.ceil(box.y1)) };
      return r.x1 > r.x0 && r.y1 > r.y0 ? [{ id: l.id, r, carried: !!on }] : [];
    });
    if (!where.length) return [];
    w.vjLyrics(false, true);
    const off = pixels(await w.vjFrame(t));
    // (a carrier's own drawn pixels: where the frame with the carriers differs from the frame without them; its bounding
    // rect also held the page round a tape, dark-glitch 2026-11-15)
    const bare = where.some((x) => x.carried) ? (w.vjLyrics(false, false), pixels(await w.vjFrame(t))) : undefined;
    return where.flatMap(({ id, r, carried }) => {
      const ls: [number, number][] = [];
      const step = Math.max(1, Math.floor(Math.min(r.x1 - r.x0, r.y1 - r.y0) / 120));
      for (let y = r.y0; y < r.y1; y += step) for (let x = r.x0; x < r.x1; x += step) {
        const k = (y * W + x) * 4;
        if (carried && bare && Math.max(Math.abs(off[k] - bare[k]), Math.abs(off[k + 1] - bare[k + 1]), Math.abs(off[k + 2] - bare[k + 2])) <= 16) continue;
        ls.push([lum(off[k], off[k + 1], off[k + 2]), k]);
      }
      if (ls.length < 20) return [];
      ls.sort((p, q) => p[0] - q[0]);
      const [a, z] = [ls[Math.floor(ls.length * 0.01)][1], ls[Math.floor(ls.length * 0.99)][1]];
      return [{ id, lo: hex(off[a], off[a + 1], off[a + 2]), hi: hex(off[z], off[z + 1], off[z + 2]), carried }];
    });
  } finally {
    w.__vjFinalOff = undefined;
    w.vjLyrics(true);
  }
}
w.inkTonesPage = { read };
