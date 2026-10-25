// Render page entry (bundled by scripts/lyric-vj/render.mts): exposes ready / renderAt / metrics to the driver.
import { SCENE_FONTS } from './scene-parts';
import { contrastFace, DEFAULT_FAMILY, FONTS, googleFontsUrl, readingLatin } from '../fonts';
import { quietFace } from './quiet';
import { LyricVjEngine, RenderJob } from './engine';

/** Every family a job can draw with: its faces, their quiet and contrast partners, and any font named in its look. */
function jobFamilies(job: RenderJob): string[] {
  const d = job.treatment.design;
  const main = job.fonts?.family ?? d?.font ?? DEFAULT_FAMILY;
  const named = new Set<string>();
  // graphic layers (stamps, seals, labels) may name their own font
  JSON.stringify(job.treatment.graphics ?? {}, (k, v) => (k === 'font' && typeof v === 'string' && named.add(v), v));
  JSON.stringify(job.treatment.storyboard ?? [], (k, v) => (k === 'font' && typeof v === 'string' && named.add(v), v));
  if (job.treatment.storyboard?.length) SCENE_FONTS.forEach((f) => named.add(f));
  const accent = d?.accentFont ?? 'Montserrat';
  return [...new Set([main, job.fonts?.display, job.fonts?.body, job.fonts?.script, accent, readingLatin(accent), 'Montserrat', quietFace(main), contrastFace(main), DEFAULT_FAMILY, 'Zen Old Mincho', ...named])].filter((f): f is string => !!f && FONTS.some((x) => x.family === f));
}

declare global {
  interface Window {
    vjReady: Promise<void>;
    renderAt: (t: number) => Promise<void>;
    /** Renders t and returns the frame as a JPEG data URL (faster than a page screenshot). */
    grabAt: (t: number, quality: number) => Promise<string>;
    vjMetrics: () => ReturnType<LyricVjEngine['metrics']>;
    vjSceneQa: () => ReturnType<LyricVjEngine['sceneQa']>;
    vjMotionQa: (everyFrame?: string[]) => ReturnType<LyricVjEngine['motionQa']>;
  }
}

const job: RenderJob = await (await fetch(new URLSearchParams(location.search).get('job')!)).json();
// QA renders log sprite boxes per frame (graphics.ts)
(globalThis as { __vjTrack?: boolean }).__vjTrack = !!job.track;
// the stylesheet must be in place before document.fonts.load can find the faces; only this song's faces are asked for
await new Promise<void>((resolve, reject) => {
  const link = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: googleFontsUrl(jobFamilies(job)), onload: () => resolve(), onerror: reject });
  document.head.append(link);
});
// a transparent page for the lyric layer
if (job.layer === 'text') document.documentElement.style.background = document.body.style.background = 'transparent';
const engine = new LyricVjEngine(document.getElementById('stage') as HTMLCanvasElement, job);
window.vjReady = engine.init();
window.renderAt = (t) => engine.renderAt(t);
const stage = document.getElementById('stage') as HTMLCanvasElement;
window.grabAt = async (t, quality) => {
  await engine.renderAt(t);
  return stage.toDataURL('image/jpeg', quality);
};
window.vjMetrics = () => engine.metrics();
window.vjSceneQa = () =>
  engine.sceneQa(async (t) => {
    await engine.renderAt(t);
    const c = new OffscreenCanvas(1920, 1080).getContext('2d')!;
    c.drawImage(stage, 0, 0, 1920, 1080);
    return c.getImageData(0, 0, 1920, 1080);
  });
window.vjMotionQa = (everyFrame) => engine.motionQa(everyFrame);
await window.vjReady;
const t = new URLSearchParams(location.search).get('t');
if (t) await engine.renderAt(Number(t));
document.body.dataset['ready'] = '1';
