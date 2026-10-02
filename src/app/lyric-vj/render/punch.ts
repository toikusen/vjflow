// punch: the emphasised words set huge and hit on the accents; the rest of the line in small type above/below.
import * as THREE from 'three';
import { advanceOf, clamp01, Glyph, GlyphStyle, makeGlyphs, placeRow } from './glyphs';
import { accentPulse, color, CueLayer, CueRuntime, emphasisOf, FrameFx, glyphMotion, settledAt, TemplateRenderer } from './runtime';

const W = 1920;
const STAGGER = 0.045;

/** The keyword range: the first emphasis, else the longest space-separated phrase. */
export function keywordRange(text: string, rt: Pick<CueRuntime, 'style'>): [number, number] {
  const e = rt.style.emphasis?.[0];
  if (e) return [e.from, e.to];
  const chars = [...text];
  let best: [number, number] = [0, chars.length];
  let bestLen = -1;
  let from = 0;
  for (let i = 0; i <= chars.length; i++) {
    if (i === chars.length || /\s/.test(chars[i])) {
      if (i - from > bestLen) [best, bestLen] = [[from, i], i - from];
      from = i + 1;
    }
  }
  return best;
}

export const punch: TemplateRenderer = {
  cue(rt: CueRuntime): CueLayer {
    const chars = [...rt.cue.text];
    const [k0, k1] = keywordRange(rt.cue.text, rt);
    const keyword = chars.slice(k0, k1).join('').replace(/\s+/g, '');
    const before = chars.slice(0, k0).join('').trim();
    const after = chars.slice(k1).join('').trim();
    const p = rt.params;
    const group = new THREE.Group();
    group.rotation.z = ((p['tilt'] as number) * Math.PI) / 180;
    group.position.y = (p['lift'] as number) ?? 0;

    // fit the keyword to the requested width
    const probe: GlyphStyle = { family: rt.fonts.display, weight: 400, size: 200 };
    const w200 = [...keyword].reduce((w, c) => w + advanceOf(c, probe), 0) || 1;
    const size = Math.max(140, Math.min(440, (200 * (p['keywordWidth'] as number) * W) / w200));
    const method = emphasisOf(rt, k0);
    const kwColor = method === 'color' || method === 'glow' ? rt.palette.accent : rt.palette.text;
    const kStyle: GlyphStyle = { family: rt.fonts.display, weight: 400, size };
    const kw = makeGlyphs(keyword, kStyle, color(kwColor, method === 'glow' ? 1.8 : 1.15));
    placeRow(kw, 0, 30);
    const echo = p['outline'] ? makeGlyphs(keyword, { ...kStyle, outline: Math.max(2, size * 0.03) }, color(rt.palette.glow, 1.4)) : [];
    placeRow(echo, 0, 30);

    const sStyle: GlyphStyle = { family: rt.fonts.body, weight: 900, size: 84 }; // readable from the back of a live house
    const small: Glyph[][] = [];
    if (before) small.push(makeGlyphs(before.replace(/\s+/g, ' '), sStyle, color(rt.palette.text, 0.95), 6));
    if (after) small.push(makeGlyphs(after.replace(/\s+/g, ' '), sStyle, color(rt.palette.text, 0.95), 6));
    const gap = size * 0.62 + 64;
    // text before the keyword reads above it, text after it below
    if (before) placeRow(small[0], 0, 30 + gap, 6);
    if (after) placeRow(small[before ? 1 : 0], 0, 30 - gap, 6);
    for (const g of [...echo, ...kw, ...small.flat()]) group.add(g.mesh);

    const smallRt: CueRuntime = { ...rt, style: { ...rt.style, enter: 'fade' }, showFrom: rt.showFrom + 0.1 };
    const bounce = p['bounce'] as number;
    const shake = method === 'shake';

    return {
      group,
      update(t: number, fx: FrameFx) {
        const pulse = accentPulse(t, rt.accentTimes);
        // a hit flash, not a white-out: strong values wash the whole frame grey
        if (p['flash']) fx.hit = Math.max(fx.hit, accentPulse(t, rt.accentTimes, 10));
        if (shake) fx.shake = Math.max(fx.shake, pulse * bounce);
        const hit = 1 + 0.14 * bounce * pulse;
        const drift = 1 + 0.02 * clamp01((t - rt.showFrom) / 4); // slow push while held
        kw.forEach((g) => {
          const m = glyphMotion(rt, g, kw.length, t, STAGGER);
          g.mesh.position.set(g.x * drift + m.dx, g.y + m.dy, 0);
          g.mesh.scale.setScalar(m.scale * hit * drift);
          g.mesh.rotation.z = m.rot;
          g.mesh.material.opacity = m.opacity;
        });
        echo.forEach((g) => {
          const m = glyphMotion(rt, g, echo.length, t, STAGGER);
          // the echo hugs the glyph and only appears once the fill has landed (no oversized box during the slam)
          const landed = clamp01((t - (rt.showFrom + g.index * STAGGER + 0.3)) / 0.15);
          const off = size * (keyword.length <= 2 ? 0.012 : 0.022) * (1 + pulse);
          g.mesh.position.set(g.x * drift + m.dx + off, g.y + m.dy - off, 0);
          g.mesh.scale.setScalar(m.scale * hit * drift * 1.04);
          g.mesh.rotation.z = m.rot;
          g.mesh.material.opacity = m.opacity * landed * (0.35 + 0.4 * pulse);
        });
        small.flat().forEach((g, i) => {
          const m = glyphMotion(smallRt, { ...g, index: i }, small.flat().length, t, 0.012);
          g.mesh.position.set(g.x + m.dx, g.y + m.dy, 0);
          g.mesh.scale.setScalar(m.scale);
          g.mesh.material.opacity = m.opacity;
        });
      },
      readable: () => [Math.max(settledAt(rt, kw.length, STAGGER), settledAt(smallRt, small.flat().length, 0.012)), rt.exitAt],
    };
  },
};
