// Render page entry (bundled by scripts/lyric-vj/render.mts): exposes ready / renderAt / metrics to the driver.
import { LyricVjEngine, RenderJob } from './engine';
import { loadJobFonts } from './job-fonts';
import { ensureAdvances } from './layout-measure';
import { isSignature, signatureCues, signatureIds, signatureLayer, signatureWindows } from './signature';
import { miniMomentLayer, miniMomentsOf } from './mini-moment';

declare global {
  interface Window {
    vjReady: Promise<void>;
    renderAt: (t: number) => Promise<void>;
    /** Renders t and returns the frame as a JPEG data URL (faster than a page screenshot). */
    grabAt: (t: number, quality: number) => Promise<string>;
    vjLyrics: (on: boolean, carriers?: boolean) => void;
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
window.grabAt = async (t, quality) => {
  // a freeze moment holds the engine's frame at its stopping word while only its line moves
  await engine.renderAt(signature ? signature.stageAt(t) : t);
  const framed = signature ? signature.compose(stage, t) : stage;
  return (mini ? mini.compose(framed, t) : framed).toDataURL('image/jpeg', quality);
};
window.vjLyrics = (on, carriers) => engine.showLyrics(on, carriers);
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
await window.vjReady;
const t = new URLSearchParams(location.search).get('t');
if (t) await engine.renderAt(Number(t));
document.body.dataset['ready'] = '1';
