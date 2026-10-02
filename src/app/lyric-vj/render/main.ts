// Render page entry (bundled by scripts/lyric-vj/render.mts): exposes ready / renderAt / metrics to the driver.
import { googleFontsUrl } from '../fonts';
import { LyricVjEngine, RenderJob } from './engine';

declare global {
  interface Window {
    vjReady: Promise<void>;
    renderAt: (t: number) => Promise<void>;
    vjMetrics: () => ReturnType<LyricVjEngine['metrics']>;
  }
}

// the stylesheet must be in place before document.fonts.load can find the faces
await new Promise<void>((resolve, reject) => {
  const link = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: googleFontsUrl(), onload: () => resolve(), onerror: reject });
  document.head.append(link);
});
const job: RenderJob = await (await fetch(new URLSearchParams(location.search).get('job')!)).json();
const engine = new LyricVjEngine(document.getElementById('stage') as HTMLCanvasElement, job);
window.vjReady = engine.init();
window.renderAt = (t) => engine.renderAt(t);
window.vjMetrics = () => engine.metrics();
await window.vjReady;
const t = new URLSearchParams(location.search).get('t');
if (t) await engine.renderAt(Number(t));
document.body.dataset['ready'] = '1';
