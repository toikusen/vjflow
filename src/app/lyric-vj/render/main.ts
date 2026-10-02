// Render page entry (bundled by scripts/lyric-vj/render.mts): exposes ready / renderAt / metrics to the driver.
import { LyricVjEngine, RenderJob } from './engine';

declare global {
  interface Window {
    vjReady: Promise<void>;
    renderAt: (t: number) => Promise<void>;
    vjMetrics: () => ReturnType<LyricVjEngine['metrics']>;
  }
}

const job: RenderJob = await (await fetch(new URLSearchParams(location.search).get('job')!)).json();
const engine = new LyricVjEngine(document.getElementById('stage') as HTMLCanvasElement, job);
window.vjReady = engine.init();
window.renderAt = (t) => engine.renderAt(t);
window.vjMetrics = () => engine.metrics();
await window.vjReady;
const t = new URLSearchParams(location.search).get('t');
if (t) await engine.renderAt(Number(t));
document.body.dataset['ready'] = '1';
