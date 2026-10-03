// beat-cut: each phrase is cut in huge, alone, one after another — a new position, size and angle every time —
// while the whole line sits small at the bottom for reading. The designer move of re-composing the frame every 1–2
// beats in a chorus.
import * as THREE from 'three';
import { phrases } from '../phrases';
import { advanceOf, clamp01, easeOutCubic, Glyph, GlyphStyle, hash, makeGlyphs, placeRow } from './glyphs';
import { color, CueLayer, CueRuntime, emphasisOf, FrameFx, glyphMotion, readable, settledAt, tagSource, TemplateRenderer } from './runtime';

const W = 1920;
const H = 1080;

/** The line as 2–6 pieces of at least 2 characters (particles join the word before them). */
export function cutPieces(text: string): { text: string; from: number }[] {
  const out: { text: string; from: number }[] = [];
  let at = 0;
  for (const p of phrases(text)) {
    const from = [...text].indexOf([...p.trim()][0] ?? '', at);
    at = from + [...p].length;
    const prev = out[out.length - 1];
    if (prev && ([...p.trim()].length < 2 || out.length >= 6)) prev.text += p;
    else out.push({ text: p.trim(), from: Math.max(0, from) });
  }
  return out.filter((x) => x.text);
}

/** Layout variants a piece can take: centre, upper left tilted, lower right tilted, oversized and cropped. */
const LAYOUTS = [
  { x: 0, y: 40, width: 0.8, tilt: 0, align: 'center' },
  { x: -W * 0.42, y: H * 0.18, width: 0.62, tilt: -5, align: 'left' },
  { x: W * 0.42, y: -H * 0.06, width: 0.62, tilt: 4, align: 'right' },
  { x: 0, y: 60, width: 1.25, tilt: -2, align: 'center' },
] as const;

export const beatCut: TemplateRenderer = {
  cue(rt: CueRuntime): CueLayer {
    const text = rt.cue.text;
    const pieces = cutPieces(text);
    const chars = [...text];
    // pieces cut in at a steady rate over the first 60 % of the line, so the last one stays up long enough to read
    const startOf = (k: number) => rt.showFrom + ((rt.exitAt - rt.showFrom) * 0.6 * pieces[k].from) / Math.max(1, chars.length);
    const accent = readable(rt.palette.accent, rt.palette.background, 7);
    const group = new THREE.Group();
    const seed = Math.floor(hash(rt.cue.start, 17) * 4);
    const big = pieces.map((piece, k) => {
      const lay = LAYOUTS[(k + seed) % LAYOUTS.length];
      const probe: GlyphStyle = { family: rt.fonts.display, weight: 900, size: 200 };
      const w200 = [...piece.text].reduce((w, c) => w + advanceOf(c, probe), 0) || 1;
      const size = Math.round(Math.max(150, Math.min(lay.width > 1 ? 640 : 460, (200 * lay.width * W) / w200)));
      const em = emphasisOf(rt, piece.from);
      const gs = makeGlyphs(piece.text, { family: rt.fonts.display, weight: 900, size }, color(em === 'color' || em === 'glow' ? accent : rt.palette.text, 1.0));
      const width = gs.reduce((s, g) => s + g.advance, 0);
      const cx = lay.align === 'left' ? lay.x + width / 2 : lay.align === 'right' ? lay.x - width / 2 : lay.x;
      placeRow(gs, 0, 0);
      const holder = new THREE.Group();
      holder.position.set(cx, lay.y, 0);
      holder.rotation.z = (lay.tilt * Math.PI) / 180;
      gs.forEach((g) => {
        g.mesh.position.set(g.x, g.y, 0);
        holder.add(g.mesh);
      });
      holder.visible = false;
      group.add(holder);
      return { holder, gs, from: startOf(k), to: k + 1 < pieces.length ? startOf(k + 1) : rt.exitAt };
    });
    // the whole line, small, at the bottom: readable from the start
    const small = makeGlyphs(text.replace(/\s+/g, ' '), { family: rt.fonts.body, weight: 700, size: 64, shadow: true }, color(rt.palette.text, 0.95), 4);
    placeRow(small, 0, -H / 2 + 120, 4);
    tagSource(small, text, 0);
    small.forEach((g, i) => {
      g.index = i;
      group.add(g.mesh);
    });
    const smallRt: CueRuntime = { ...rt, style: { ...rt.style, enter: 'fade', reveal: 'line' } };

    return {
      group,
      update(t: number, _fx: FrameFx) {
        for (const b of big) {
          const on = t >= b.from && t < b.to + 0.02;
          b.holder.visible = on && t <= rt.exitAt + rt.exitDur;
          if (!b.holder.visible) continue;
          // hard cut in: a quick 1.15 → 1 settle, nothing slow
          const p = easeOutCubic(clamp01((t - b.from) / 0.12));
          b.holder.scale.setScalar(1.15 - 0.15 * p);
          const out = t > rt.exitAt ? 1 - clamp01((t - rt.exitAt) / rt.exitDur) : 1;
          b.gs.forEach((g) => (g.mesh.material.opacity = Math.min(1, p * 2) * out));
        }
        small.forEach((g: Glyph) => {
          const m = glyphMotion(smallRt, g, small.length, t, 0.01);
          g.mesh.position.set(g.x + m.dx, g.y + m.dy, 0);
          g.mesh.material.opacity = m.opacity * 0.9;
        });
      },
      readable: () => [settledAt(smallRt, small.length, 0.01), rt.exitAt],
    };
  },
};
