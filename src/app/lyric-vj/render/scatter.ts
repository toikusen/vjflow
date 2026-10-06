// scatter: the line breaks into 2–3 phrases stacked on a diagonal at different sizes and depths, the keyword largest
// (database: 50/50 videos layer phrases this way, typically small top-left → huge bottom-right).
import * as THREE from 'three';
import { chunks } from '../phrases';
import { advanceOf, clamp01, Glyph, GlyphStyle, hash, makeGlyphs, placeRow, rowWidth } from './glyphs';
import { accentPulse, color, readable, CueLayer, CueRuntime, FrameFx, glyphMotion, settledAt, tagSource, TemplateRenderer } from './runtime';

const W = 1920;
const H = 1080;
const MARGIN = 90;
const STAGGER = 0.04;

/** The line as phrases, and which one is the keyword: the emphasised one, else the longest. */
const edge = (s: string) => s.trim().replace(/^[、。，,．.・]+|[、，,]+$/g, '').trim();

export function scatterParts(text: string, emphasis?: { from: number; to: number }): { parts: string[]; key: number } {
  const chars = [...text];
  if (emphasis) {
    const [b, k, a] = [chars.slice(0, emphasis.from), chars.slice(emphasis.from, emphasis.to), chars.slice(emphasis.to)].map((c) => edge(c.join('')));
    const parts = [b, k, a].filter(Boolean);
    if (parts.length > 1) return { parts, key: parts.indexOf(k) };
  }
  const parts = chunks(text, chars.length > 4 ? 3 : 1, 2).map(edge).filter(Boolean);
  const key = parts.reduce((best, p, i) => ([...p].length >= [...parts[best]].length ? i : best), 0);
  return { parts, key };
}

export const scatter: TemplateRenderer = {
  cue(rt: CueRuntime): CueLayer {
    const p = rt.params;
    const { parts, key } = scatterParts(rt.cue.text, rt.style.emphasis?.[0]);
    const n = parts.length;
    const dir = p['direction'] === 'up' ? -1 : 1;
    const spread = p['spread'] as number;
    const tilt = ((p['tilt'] as number) * Math.PI) / 180;
    const accent = readable(rt.palette.accent, rt.palette.background, 7);
    const method = rt.style.emphasis?.[0]?.method;

    const root = new THREE.Group();
    root.position.y = (p['lift'] as number) ?? 0;
    let cursor = 0;
    const layers = parts.map((text, i) => {
      const isKey = i === key && n > 1;
      const probe: GlyphStyle = { family: rt.fonts.display, weight: 900, size: 200 };
      const w200 = [...text].reduce((w, c) => w + advanceOf(c, probe), 0) || 1;
      const style: GlyphStyle = isKey
        ? { family: rt.fonts.display, weight: 900, size: Math.round(Math.max(150, Math.min(340, (200 * 0.6 * W) / w200))) }
        : { family: rt.fonts.body, weight: 900, size: n === 1 ? 150 : 108, shadow: true };
      const tint = isKey && (method === 'color' || method === 'glow') ? accent : rt.palette.text;
      const glyphs = makeGlyphs(text, style, color(tint, 1.0), isKey ? 0 : 6);
      cursor = tagSource(glyphs, rt.cue.text, cursor);
      const rw = rowWidth(glyphs, isKey ? 0 : 6);
      // along the diagonal: first phrase top-left, last bottom-right (or rising with direction 'up')
      const u = n === 1 ? 0 : i / (n - 1) - 0.5;
      const half = Math.max(0, W / 2 - MARGIN - rw / 2);
      const x = Math.max(-half, Math.min(half, u * 980 * spread));
      const y = Math.max(-H / 2 + MARGIN + style.size / 2, Math.min(H / 2 - MARGIN - style.size / 2, -dir * u * 600 * spread));
      placeRow(glyphs, 0, 0, isKey ? 0 : 6);
      const g = new THREE.Group();
      g.position.set(x, y, 0);
      g.rotation.z = tilt + (hash(i, rt.cue.start) - 0.5) * 0.1;
      glyphs.forEach((gl) => g.add(gl.mesh));
      root.add(g);
      // each phrase enters a beat after the previous one
      const prt: CueRuntime = { ...rt, showFrom: rt.showFrom + (rt.rushed ? 0 : i * 0.16 * rt.pace) };
      return { g, glyphs, prt, isKey, x, depth: 0.4 + hash(i, 3) * 0.6 };
    });

    return {
      group: root,
      update(t: number, fx: FrameFx) {
        const pulse = accentPulse(t, rt.accentTimes);
        if (p['flash']) fx.hit = Math.max(fx.hit, accentPulse(t, rt.accentTimes, 10));
        const held = clamp01((t - rt.showFrom) / 4);
        for (const l of layers) {
          // parallax: nearer phrases drift and grow more, so the stack reads as layers in space
          l.g.position.x = l.x + (l.x >= 0 ? 1 : -1) * 24 * l.depth * held;
          l.g.scale.setScalar(1 + 0.05 * l.depth * held + (l.isKey ? 0.1 * pulse : 0));
          l.glyphs.forEach((gl: Glyph) => {
            const m = glyphMotion(l.prt, gl, l.glyphs.length, t, STAGGER);
            gl.mesh.position.set(gl.x + m.dx, gl.y + m.dy, 0);
            gl.mesh.scale.setScalar(m.scale);
            gl.mesh.rotation.z = m.rot;
            gl.mesh.material.opacity = m.opacity;
          });
        }
      },
      readable: () => [Math.max(...layers.map((l) => settledAt(l.prt, l.glyphs.length, STAGGER))), rt.exitAt],
    };
  },
};
