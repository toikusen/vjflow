// Sing-along modes (opt-in only: a buyer option, never the director's own pick; templates.ts templateOffered):
// 'singalong', two alternating lines, the sung one with a progress underline and the next line waiting in the other
// row as a preview (claude-animated-text #43 dual, idea only); 'scroll', the sung line centred and large with the
// next one below it, the column scrolling up a row as each line comes (#46 lyrics, idea only). The code is our own.
// A preview is never pale: it is set smaller and lighter in weight, in an ink that reads at 4.5:1 on the ground. No
// line is left behind: the line before only scrolls away. A preview shows only when the next line follows soon.
import * as THREE from 'three';
import { clamp01, easeOutCubic, Glyph, GlyphStyle, makeGlyphs, placeRow, rowWidth } from './glyphs';
import { color, contrast, CueLayer, CueRuntime, FrameFx, glyphMotion, readable, tagSource, TemplateRenderer } from './runtime';

const W = 1920;
const H = 1080;
const TRACK = 3;
/** A next line further off than this (s after this one ends) gets no preview: it would be a row left waiting. */
export const PREVIEW_GAP = 4;
/** The scroll up one row, s × pace: over before the line is read. */
export const SCROLL_SEC = 0.42;
/** A line before that ended longer ago than this (s) is not scrolled away: it would come back after a gap. */
const BACK_TO_BACK = 1.2;

const oneLine = (s: string) => s.replace(/[\s　]+/g, ' ').trim();

/** The type size that keeps a row of `text` within `share` of the frame width, at most `max` px. */
export const rowSize = (text: string, share: number, max: number) => Math.round(Math.min(max, (W * share) / Math.max(1, [...text].length) / 0.98));

/**
 * The preview's ink: the line's own ink if it reads at 4.5:1 on every ground under the preview's row (the palette's and
 * what was measured there, previewGrounds), else the candidate that reads best on all of them.
 */
export function previewInk(rt: Pick<CueRuntime, 'palette' | 'previewGrounds'>): string {
  const grounds = [rt.palette.background, ...(rt.previewGrounds ?? [])];
  const worst = (ink: string) => Math.min(...grounds.map((g) => contrast(ink, g)));
  if (worst(rt.palette.text) >= 4.5) return rt.palette.text;
  const tries = [...grounds.map((g) => readable(rt.palette.text, g, 4.5)), '#ffffff', '#111111'];
  return tries.reduce((best, x) => (worst(x) > worst(best) ? x : best), tries[0]);
}

/** Whether this line was previewed by the line before (so it comes up from the preview, not from nothing). */
export const previewed = (rt: Pick<CueRuntime, 'prevText' | 'prevEnd' | 'cue'>) => !!rt.prevText && rt.prevEnd !== undefined && rt.cue.start - rt.prevEnd <= PREVIEW_GAP;

/** The preview's size against the line's own: the only thing that sets it apart (same weight, so it grows into the line). */
export const PREVIEW_SCALE = 0.82;
/** How long a previewed line takes to grow from the preview's size to its own, s × pace: before it is read. */
export const GROW_SEC = 0.3;

/** The next line to preview, if it follows soon enough. */
export const previewOf = (rt: Pick<CueRuntime, 'nextText' | 'nextStart' | 'cue'>) =>
  rt.nextText && rt.nextStart !== undefined && rt.nextStart - rt.cue.end <= PREVIEW_GAP ? oneLine(rt.nextText) : '';

const glyphRow = (text: string, style: GlyphStyle, ink: string, cx: number, y: number, preview = false) => {
  const gs = makeGlyphs(text, style, color(ink, 1), TRACK);
  placeRow(gs, cx, y, TRACK);
  // a preview (or a line scrolling away) is not the line sung: the lyric box, the cover and ink checks leave it out
  if (preview) gs.forEach((g) => (g.mesh.userData['preview'] = true));
  return gs;
};

/** The share of the line sung at t, 0..1 (the underline's length). */
export const sungShare = (t: number, start: number, end: number) => clamp01((t - start) / Math.max(0.2, end - start));

/** Two rows, upper left and lower right: even lines of the song in the upper one, odd in the lower. */
export const singalong: TemplateRenderer = {
  persist: 'preview',
  cue(rt: CueRuntime): CueLayer {
    const text = oneLine(rt.cue.text);
    const next = previewOf(rt);
    const up = (rt.songOrder ?? 0) % 2 === 0;
    const rows = { up: { x: -W * 0.12, y: H * 0.12 }, down: { x: W * 0.12, y: -H * 0.16 } };
    const [mine, other] = up ? [rows.up, rows.down] : [rows.down, rows.up];
    const size = rowSize(text, 0.62, 96);
    const group = new THREE.Group();
    const glyphs = glyphRow(text, { family: rt.fonts.display, weight: 900, size, shadow: false }, rt.palette.text, mine.x, mine.y);
    tagSource(glyphs, rt.cue.text, 0);
    glyphs.forEach((g) => group.add(g.mesh));
    // the preview is the next line where it will be sung, the same type a little smaller, never dimmed
    const preview = next ? glyphRow(next, { family: rt.fonts.display, weight: 900, size: Math.round(rowSize(next, 0.62, 96) * PREVIEW_SCALE) }, previewInk(rt), other.x, other.y, true) : [];
    preview.forEach((g) => (g.mesh.position.set(g.x, g.y, 0), group.add(g.mesh)));
    // the underline: the accent that reads on the ground, drawn on from the line's left edge as it is sung
    const width = rowWidth(glyphs, TRACK);
    const bar = new THREE.Mesh(new THREE.PlaneGeometry(1, Math.max(6, size * 0.08)), new THREE.MeshBasicMaterial({ color: color(readable(rt.palette.accent, rt.palette.background, 3), 1), transparent: true, depthTest: false, depthWrite: false }));
    bar.userData['decor'] = true;
    group.add(bar);
    // a previewed line is already up: it grows from the preview's size in place, at full strength (no fade, no flash)
    const grows = previewed(rt);
    const inRt: CueRuntime = { ...rt, style: { ...rt.style, enter: grows ? 'cut' : 'fade' } };
    const grow = GROW_SEC * rt.pace;
    const from = new THREE.Color(previewInk(rt));
    const own = new THREE.Color(rt.palette.text);
    const n = glyphs.length;
    return {
      group,
      update(t: number, _fx: FrameFx) {
        const k = grows ? easeOutCubic(clamp01((t - rt.showFrom) / grow)) : 1;
        const s = PREVIEW_SCALE + (1 - PREVIEW_SCALE) * k;
        for (const g of glyphs) {
          const m = glyphMotion(inRt, g, n, t, 0);
          g.mesh.position.set(mine.x + (g.x - mine.x) * s + m.dx, g.y + m.dy, 0);
          g.mesh.scale.setScalar(m.scale * s);
          if (grows) g.mesh.material.color.copy(from).lerp(own, k);
          g.mesh.material.opacity = m.opacity;
        }
        const up = glyphs[0]?.mesh.material.opacity ?? 0;
        // the preview stays until this layer goes, which is when the next line shows (persist 'preview')
        const end = rt.exitAt + rt.exitDur;
        for (const g of preview) g.mesh.material.opacity = t >= rt.showFrom && t < end ? 1 : 0;
        const kk = sungShare(t, rt.cue.start, rt.cue.end);
        bar.scale.x = Math.max(1e-3, width * kk);
        bar.position.set(mine.x - width / 2 + (width * kk) / 2, mine.y - size * 0.68, 0);
        bar.material.opacity = up;
      },
      readable: () => [rt.showFrom + (grows ? grow : 0.3), rt.exitAt],
      framed: true,
    };
  },
};

/** The sung line centred and large, the next one below it; the column scrolls up a row as each line comes. */
export const scroll: TemplateRenderer = {
  persist: 'preview',
  cue(rt: CueRuntime): CueLayer {
    const text = oneLine(rt.cue.text);
    const next = previewOf(rt);
    const before = rt.prevText && rt.prevEnd !== undefined && rt.showFrom - rt.prevEnd <= BACK_TO_BACK ? oneLine(rt.prevText) : '';
    const size = rowSize(text, 0.8, 110);
    const step = size * 1.55;
    const small = (s: string) => Math.round(rowSize(s, 0.8, 110) * 0.6);
    const group = new THREE.Group();
    const ink = readable(rt.palette.accent, rt.palette.background, 4.5);
    const glyphs = glyphRow(text, { family: rt.fonts.display, weight: 900, size, shadow: false }, ink, 0, 0);
    tagSource(glyphs, rt.cue.text, 0);
    glyphs.forEach((g) => group.add(g.mesh));
    const below = next ? glyphRow(next, { family: rt.fonts.display, weight: 900, size: small(next) }, previewInk(rt), 0, -step, true) : [];
    // the line before, as it was sung (its own size and ink), shrinking as it scrolls away
    const gone = before ? glyphRow(before, { family: rt.fonts.display, weight: 900, size: rowSize(before, 0.8, 110) }, ink, 0, 0, true) : [];
    [...below, ...gone].forEach((g) => group.add(g.mesh));
    const scrollSec = SCROLL_SEC * rt.pace;
    const lands = rt.showFrom + scrollSec;
    const from = new THREE.Color(previewInk(rt));
    const own = new THREE.Color(ink);
    const grows = previewed(rt);
    return {
      group,
      update(t: number, _fx: FrameFx) {
        const k = easeOutCubic(clamp01((t - rt.showFrom) / scrollSec));
        const shown = t >= rt.showFrom && t < rt.exitAt + rt.exitDur;
        // the sung line rises from the preview's row to the centre, growing to its size and taking its ink; with no
        // preview before it, it fades up as it rises
        const grow = 0.6 + 0.4 * k;
        for (const g of glyphs) {
          const m = glyphMotion({ ...rt, style: { ...rt.style, enter: 'cut' } }, g, glyphs.length, t, 0);
          g.mesh.position.set(g.x * grow + m.dx, -step * (1 - k) + g.y + m.dy, 0);
          g.mesh.scale.setScalar(grow * m.scale);
          if (grows) g.mesh.material.color.copy(from).lerp(own, k);
          g.mesh.material.opacity = shown ? (grows ? 1 : k) * m.opacity : 0;
        }
        // the line before scrolls up from where it stood, from its own size down, and is gone once this one has landed
        const shrink = 1 - 0.4 * k;
        for (const g of gone) {
          g.mesh.position.set(g.x * shrink, g.y + step * k, 0);
          g.mesh.scale.setScalar(shrink);
          g.mesh.material.opacity = shown ? 1 - k : 0;
        }
        for (const g of below) {
          g.mesh.position.set(g.x, g.y - step * 0.4 * (1 - k), 0);
          g.mesh.material.opacity = shown ? k : 0;
        }
      },
      readable: () => [lands, rt.exitAt],
      framed: true,
    };
  },
};
