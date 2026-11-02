// Which faces a render job needs and getting them onto the page, shared by the offline render page and the browser preview.
import { SCENE_FONTS } from './scene-parts';
import { contrastFace, DEFAULT_FAMILY, FONTS, googleFontsUrl, readingLatin } from '../fonts';
import { quietFace } from './quiet';
import type { RenderJob } from './engine';

/** Every family a job can draw with: its faces, their quiet and contrast partners, and any font named in its look. */
export function jobFamilies(job: RenderJob): string[] {
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

/** The stylesheet must be in place before document.fonts.load can find the faces; only this song's faces are asked for. */
export const loadJobFonts = (job: RenderJob) =>
  new Promise<void>((resolve, reject) => {
    const href = googleFontsUrl(jobFamilies(job));
    if (document.querySelector(`link[href="${CSS.escape(href)}"]`)) return resolve();
    document.head.append(Object.assign(document.createElement('link'), { rel: 'stylesheet', href, onload: () => resolve(), onerror: reject }));
  });
