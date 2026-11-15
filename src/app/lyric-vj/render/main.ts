// Render page entry (bundled by scripts/lyric-vj/render.mts): exposes ready / renderAt / metrics to the driver.
import { LyricVjEngine, RenderJob } from './engine';
import { loadJobFonts } from './job-fonts';
import { ensureAdvances } from './layout-measure';
import { ensureInkTones } from './ink-tones';
import { glyphTexture } from './glyphs';
import { surfaceKey } from './world-glyph';
import { isPartTexel, partOf } from './surface-parts';
import { isSignature, signatureCues, signatureIds, signatureLayer, signatureWindows } from './signature';
import { miniMomentLayer, miniMomentsOf } from './mini-moment';

declare global {
  interface Window {
    vjReady: Promise<void>;
    renderAt: (t: number) => Promise<void>;
    /** Renders t and returns the frame as a JPEG data URL (faster than a page screenshot). */
    grabAt: (t: number, quality: number, type?: string) => Promise<string>;
    vjLyrics: (on: boolean, carriers?: boolean) => void;
    /** Renders t and gives the composed frame's canvas, as grabAt encodes it (the measured ink probe reads its pixels). */
    vjFrame: (t: number) => Promise<HTMLCanvasElement>;
    /** Every glyph on the frame last rendered (engine glyphBoxes). */
    vjGlyphs: () => ReturnType<LyricVjEngine['glyphBoxes']>;
    vjMetrics: () => ReturnType<LyricVjEngine['metrics']>;
    vjRows: () => ReturnType<LyricVjEngine['rowBreaks']>;
    vjSceneQa: () => ReturnType<LyricVjEngine['sceneQa']>;
    vjMotionQa: (everyFrame?: string[]) => ReturnType<LyricVjEngine['motionQa']>;
  }
}

const job: RenderJob = await (await fetch(new URLSearchParams(location.search).get('job')!)).json();
// QA renders log sprite boxes per frame (graphics.ts)
(globalThis as { __vjTrack?: boolean }).__vjTrack = !!job.track;
await loadJobFonts(job);
// (the plan's advance table, loaded once so anything measuring a seat in the page measures as the plan did)
await ensureAdvances();
await ensureInkTones();
// a transparent page for the lyric layer
if (job.layer === 'text' || job.layer === 'words') document.documentElement.style.background = document.body.style.background = 'transparent';
const engine = new LyricVjEngine(document.getElementById('stage') as HTMLCanvasElement, job);
(window as unknown as { vjEngine: LyricVjEngine }).vjEngine = engine;
window.vjReady = engine.init();
window.renderAt = (t) => engine.renderAt(t);
const stage = document.getElementById('stage') as HTMLCanvasElement;
// signature moments (paid tiers): drawn over the engine's frame, their lines taken off it
const signature = isSignature(job) ? await signatureLayer(job) : null;
if (signature) engine.onCues = signatureCues as never;
// mini moments (Q5 phase 2): drawn over the frame round their lines, every line kept (render/mini-moment.ts)
const mini = miniMomentsOf(job).length ? await miniMomentLayer(job) : null;
// (whether the lyrics are shown: the signature layer draws its lines only with them, so a frame without the words has none)
let lyricsOn = true;
const frameAt = async (t: number) => {
  // a freeze moment holds the engine's frame at its stopping word while only its line moves
  await engine.renderAt(signature ? signature.stageAt(t) : t);
  // (the look behind a region, for an overlay's inks on a layered output, render/engine groundBehind)
  const behind = (at: number, x0: number, y0: number, x1: number, y1: number) => engine.groundBehind(at, x0, y0, x1, y1);
  // (the back layer carries no lines: the signature layer's lines belong to the lyric layer, as the engine's do)
  const framed = signature ? signature.compose(stage, t, lyricsOn && job.layer !== 'back', behind) : stage;
  return mini ? mini.compose(framed, t, behind) : framed;
};
window.grabAt = async (t, quality, type = 'image/jpeg') => (await frameAt(t)).toDataURL(type, quality);
window.vjFrame = frameAt;
// (a signature moment's characters too, drawn on its own layer: under the id `signature`, with no index in a line)
window.vjGlyphs = () => [...engine.glyphBoxes(), ...(signature ? [{ id: 'signature', glyphs: signature.glyphs().map((g, i) => ({ i, x0: g.x0, y0: g.y0, x1: g.x1, y1: g.y1, a: g.a, moving: g.ghost })) }] : [])];
window.vjLyrics = (on, carriers) => { lyricsOn = on; engine.showLyrics(on, carriers); };
window.vjMetrics = () => {
  engine.buildAll();
  const m = engine.metrics();
  if (mini) (m as { miniMoments?: unknown }).miniMoments = mini.metrics();
  if (!signature) return m;
  // the moments' lines are measured from their own timeline, on the engine's exits for them
  signatureWindows(m.cues);
  const ids = signatureIds(job);
  return { ...m, cues: [...m.cues.filter((c) => !ids.has(c.id)), ...(signature.metrics() as unknown as typeof m.cues)] };
};
window.vjRows = () => engine.rowBreaks();
window.vjSceneQa = () =>
  engine.sceneQa(async (t) => {
    await engine.renderAt(t);
    const c = new OffscreenCanvas(1920, 1080).getContext('2d')!;
    c.drawImage(stage, 0, 0, 1920, 1080);
    return c.getImageData(0, 0, 1920, 1080);
  });
window.vjMotionQa = (everyFrame) => engine.motionQa(everyFrame);
// (QA, the tone table's generator, ink-tones.mts: how far a surface draws a tint down at its darkest part: the 5th
// percentile luminance of its inked pixels over the tint's own, the least of the characters given)
(window as unknown as { vjSurfaceShare: (kind: string, tint: string, core: string, family: string, chars: string) => { lo: number; hi: number } }).vjSurfaceShare = (kind, tint, core, family, chars) => {
  // (lo, hi: the face texels' 5th and 95th percentile, each channel's mean, 0..1 sRGB)
  const lin = (v: number) => (v <= 10.0164 ? v / 3294.6 : ((v / 255 + 0.055) / 1.055) ** 2.4);
  const lum = (r: number, g: number, b: number) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const own = lum(...([1, 3, 5].map((i) => parseInt(tint.slice(i, i + 2), 16)) as [number, number, number]));
  // (the face only: a declared part's texels, surface-parts, are not the ink; the 5th and 95th percentile of the rest)
  const part = partOf(surfaceKey({ kind: kind as never, tint, core, eaten: false }));
  let [lo, hi] = [1, 1];
  for (const ch of chars) {
    const { texture } = glyphTexture(ch, { family, weight: 700, size: 160, surface: surfaceKey({ kind: kind as never, tint, core, eaten: false }) });
    const img = texture.image as HTMLCanvasElement;
    const d = img.getContext('2d')!.getImageData(0, 0, img.width, img.height).data;
    const ls: number[] = [];
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] >= 128 && !(part && isPartTexel([d[i] / 255, d[i + 1] / 255, d[i + 2] / 255], part.tint, part.colour))) ls.push((d[i] + d[i + 1] + d[i + 2]) / 765);
    if (!ls.length) continue;
    ls.sort((x, y) => x - y);
    [lo, hi] = [Math.min(lo, ls[Math.floor(ls.length * 0.05)]), Math.max(hi === 1 ? 0 : hi, ls[Math.floor(ls.length * 0.95)])];
  }
  void own;
  return { lo: +lo.toFixed(3), hi: +hi.toFixed(3) };
};
await window.vjReady;
const t = new URLSearchParams(location.search).get('t');
if (t) await engine.renderAt(Number(t));
document.body.dataset['ready'] = '1';
