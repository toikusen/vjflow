// vertical: Japanese tategaki, columns read right to left (database: 41/50 videos set lines vertically).
import * as THREE from 'three';
import { chunks } from '../phrases';
import { clamp01, Glyph, GlyphStyle, makeGlyphs } from './glyphs';
import { accentPulse, color, readable, CueLayer, CueRuntime, emphasisOf, FrameFx, glyphMotion, settledAt, TemplateRenderer } from './runtime';

const W = 1920;
const STAGGER = 0.05;
const EMPH = 1.3;
/** Characters drawn rotated in vertical text (long marks and dashes). */
const ROTATE = /[ー〜～…―‐\-]/;
/** Small marks sit in the upper right of their cell in vertical text. */
const CORNER = /[、。，．]/;

export const vertical: TemplateRenderer = {
  cue(rt: CueRuntime): CueLayer {
    const p = rt.params;
    const src = [...rt.cue.text];
    const cols = chunks(rt.cue.text, 3);
    // map every column character back to its source index, so emphasis (and the column height it adds) is known up front
    let s = 0;
    const cells = cols.map((col) =>
      [...col].map((ch) => {
        while (s < src.length && src[s] !== ch) s++;
        return { ch, m: emphasisOf(rt, s++) };
      }),
    );
    const stepK = p['step'] as number; // each column starts a little lower: a stair-step read
    const units = Math.max(...cells.map((c, k) => c.reduce((h, x) => h + (x.m ? EMPH : 1) * 1.06, 0) + k * stepK), 1);
    const size = Math.round(Math.max(70, Math.min(132, 860 / units)));
    const style: GlyphStyle = { family: rt.fonts.body, weight: 900, size, shadow: true };
    const emStyle: GlyphStyle = { ...style, family: rt.fonts.display, weight: 400, size: Math.round(size * EMPH) };
    const accent = readable(rt.palette.accent, rt.palette.background, 7);

    const group = new THREE.Group();
    group.position.y = (p['lift'] as number) ?? 0;
    const colGap = size * 1.55;
    const blockW = (cols.length - 1) * colGap;
    const pos = p['position'] as string;
    const firstX = pos === 'right' ? W / 2 - 240 : pos === 'left' ? -W / 2 + 240 + blockW : blockW / 2;
    const step = stepK * size;
    const cell = size * 1.06;
    const top = (units * size) / 2;

    const glyphs: Glyph[] = [];
    cells.forEach((col, k) => {
      let y = top - k * step;
      for (const { ch, m } of col) {
        const em = m !== undefined;
        const [g] = makeGlyphs(ch, em ? emStyle : style, color(em ? accent : rt.palette.text, em && m === 'glow' ? 1.6 : 1.05));
        const h = em ? cell * EMPH : cell;
        g.x = firstX - k * colGap + (CORNER.test(ch) ? size * 0.32 : 0);
        g.y = y - h / 2 + (CORNER.test(ch) ? size * 0.32 : 0);
        g.mesh.rotation.z = ROTATE.test(ch) ? -Math.PI / 2 : 0;
        g.mesh.userData['emph'] = em ? 1 : 0;
        g.index = glyphs.length;
        glyphs.push(g);
        group.add(g.mesh);
        y -= h;
      }
    });
    const n = glyphs.length;

    return {
      group,
      update(t: number, _fx: FrameFx) {
        const pulse = accentPulse(t, rt.accentTimes);
        const drift = -14 * clamp01((t - rt.showFrom) / 4); // columns sink slowly while held
        for (const g of glyphs) {
          const m = glyphMotion(rt, g, n, t, STAGGER);
          // entrances move along the column, not across it
          g.mesh.position.set(g.x + m.dy * 0.3, g.y + drift - m.dx - m.dy * 0.2, 0);
          g.mesh.scale.setScalar(m.scale * (g.mesh.userData['emph'] ? 1 + 0.08 * pulse : 1));
          g.mesh.material.opacity = m.opacity;
        }
      },
      readable: () => [settledAt(rt, n, STAGGER), rt.exitAt],
    };
  },
};
