// The tone table generator's page side (ink-tones.mts): one moment, each world line's box as the words stand, and the
// ground under it with the words off (carriers kept) and the final pass at rest: its darkest and lightest tones.
import { groundTones } from '../../src/app/lyric-vj/measured-ink';

const REST = ['uVignette', 'uVigBase', 'uFade', 'uGrain', 'uPaper', 'uBoil', 'uLift', 'uTooth', 'uPixel', 'uScan', 'uGlitch', 'uAberration', 'uFlash', 'uHit', 'uZoomHit', 'uTileHit', 'uRays', 'uBeams', 'uShock', 'uSweep', 'uShockR', 'uGlass', 'uFlicker'];
type G = { id: string; glyphs: { x0: number; y0: number; x1: number; y1: number; a: number }[] }[];
const w = window as unknown as { vjFrame(t: number): Promise<HTMLCanvasElement>; vjGlyphs(): G; vjLyrics(on: boolean, carriers?: boolean): void; __vjFinalOff?: string[]; inkTonesPage: unknown };

async function read(t: number, ids: string[]): Promise<{ id: string; lo: string; hi: string }[]> {
  await w.vjFrame(t);
  const boxes = w.vjGlyphs().filter((l) => ids.includes(l.id)).map((l) => {
    const gs = l.glyphs.filter((g) => g.a > 0.01);
    return gs.length ? { id: l.id, box: { x0: Math.min(...gs.map((g) => g.x0)), y0: Math.min(...gs.map((g) => g.y0)), x1: Math.max(...gs.map((g) => g.x1)), y1: Math.max(...gs.map((g) => g.y1)) } } : undefined;
  }).filter((x): x is NonNullable<typeof x> => !!x);
  if (!boxes.length) return [];
  w.__vjFinalOff = REST;
  w.vjLyrics(false, true);
  try {
    const stage = await w.vjFrame(t);
    const c = new OffscreenCanvas(stage.width, stage.height);
    const g = c.getContext('2d')!;
    g.drawImage(stage, 0, 0);
    const data = g.getImageData(0, 0, stage.width, stage.height).data;
    return boxes.flatMap(({ id, box }) => { const tones = groundTones(data, stage.width, box, 1); return tones ? [{ id, ...tones }] : []; });
  } finally {
    w.__vjFinalOff = undefined;
    w.vjLyrics(true);
  }
}
w.inkTonesPage = { read };
