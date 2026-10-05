// quiet: the break / 落ちサビ register — a thin mincho line at a quarter of the usual size, wide tracking, lots of
// empty frame and almost no motion (a slow fade only). The technique library's top move: designers drop the type
// down a register in quiet sections, so the loud sections read loud by contrast.
import * as THREE from 'three';
import { chunks } from '../phrases';
import { clamp01, easeOutCubic, Glyph, GlyphStyle, makeGlyphs, placeRow, rowWidth } from './glyphs';
import { color, CueLayer, CueRuntime, emphasisOf, readable, tagSource, TemplateRenderer } from './runtime';

const W = 1920;
const TRACK = 14;
const FADE_IN = 0.9;

/** Mincho faces already in a song's design; any other design font falls back to Shippori Mincho for quiet lines. */
const MINCHO = ['Shippori Mincho', 'Zen Old Mincho', 'Noto Serif JP', 'Hina Mincho', 'Kaisei Decol'];
export const quietFace = (display: string) => (MINCHO.includes(display) ? display : 'Shippori Mincho');

export const quiet: TemplateRenderer = {
  cue(rt: CueRuntime): CueLayer {
    const p = rt.params;
    const text = rt.cue.text.replace(/[\s　]+/g, ' ');
    const rows = [...text].length > 16 ? chunks(text, 2) : [text];
    const style: GlyphStyle = { family: quietFace(rt.fonts.display), weight: 500, size: 66, shadow: true, kanaScale: 1 };
    const accent = readable(rt.palette.accent, rt.palette.background, 7);
    const group = new THREE.Group();
    const lineH = 66 * 1.9;
    const left = p['position'] === 'left';
    const glyphs: Glyph[] = [];
    rows.forEach((r, i) => {
      const gs = makeGlyphs(r, style, color(rt.palette.text, 0.92), TRACK);
      const w = rowWidth(gs, TRACK);
      placeRow(gs, left ? -W / 2 + 220 + w / 2 : 0, ((rows.length - 1) / 2 - i) * lineH - 40, TRACK);
      glyphs.push(...gs);
    });
    tagSource(glyphs, rt.cue.text, 0);
    glyphs.forEach((g) => {
      const m = g.src !== undefined ? emphasisOf(rt, g.src) : undefined;
      if (m === 'color' || m === 'glow') g.mesh.material.color = color(accent, 1);
      group.add(g.mesh);
    });
    return {
      group,
      update(t: number) {
        const a = easeOutCubic(clamp01((t - rt.showFrom) / FADE_IN)) * (t > rt.exitAt ? 1 - clamp01((t - rt.exitAt) / Math.max(0.3, rt.exitDur)) : 1);
        // almost still: a 6 px rise over the whole line, nothing on the beat
        const rise = 6 * clamp01((t - rt.showFrom) / Math.max(1, rt.exitAt - rt.showFrom));
        glyphs.forEach((g) => {
          g.mesh.position.set(g.x, g.y + rise, 0);
          g.mesh.material.opacity = a;
        });
      },
      readable: () => [rt.showFrom + FADE_IN * 0.6, rt.exitAt],
    };
  },
};
