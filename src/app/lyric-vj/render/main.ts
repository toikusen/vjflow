// Render page entry (bundled by scripts/lyric-vj/render.mts): exposes ready / renderAt / metrics to the driver.
import { LyricVjEngine, RenderJob } from './engine';
import { loadJobFonts } from './job-fonts';
import { isSignature, SIGNATURE_IDS, signatureCues, signatureLayer, signatureMetrics } from './signature-spike'; // ponytail: 20 s test, off without its flag

declare global {
  interface Window {
    vjReady: Promise<void>;
    renderAt: (t: number) => Promise<void>;
    /** Renders t and returns the frame as a JPEG data URL (faster than a page screenshot). */
    grabAt: (t: number, quality: number) => Promise<string>;
    vjLyrics: (on: boolean) => void;
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
// a transparent page for the lyric layer
if (job.layer === 'text') document.documentElement.style.background = document.body.style.background = 'transparent';
const engine = new LyricVjEngine(document.getElementById('stage') as HTMLCanvasElement, job);
(window as unknown as { vjEngine: LyricVjEngine }).vjEngine = engine;
window.vjReady = engine.init();
window.renderAt = (t) => engine.renderAt(t);
const stage = document.getElementById('stage') as HTMLCanvasElement;
const signature = isSignature(job) ? await signatureLayer(job) : null;
if (signature) engine.onCues = signatureCues as never;
window.grabAt = async (t, quality) => {
  await engine.renderAt(t);
  return (signature ? signature.compose(stage, t) : stage).toDataURL('image/jpeg', quality);
};
window.vjLyrics = (on) => engine.showLyrics(on);
window.vjMetrics = () => {
  engine.buildAll();
  const m = engine.metrics();
  return signature ? { ...m, cues: [...m.cues.filter((c) => !SIGNATURE_IDS.has(c.id)), ...(signatureMetrics(job) as unknown as typeof m.cues)] } : m;
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
