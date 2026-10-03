// handwrite: a handwriting face revealed character by character with a diagonal wipe, as if being written
// (database: 47/50 videos use handwritten lettering; ~90 % of those events are the face itself, not true stroke order).
import * as THREE from 'three';
import { nearestWeight } from '../fonts';
import { chunks } from '../phrases';
import { advanceOf, clamp01, easeOutCubic, Glyph, GlyphStyle, hash, makeGlyphs, placeRow } from './glyphs';
import { accentPulse, color, enterAt, readable, CueLayer, CueRuntime, emphasisOf, FrameFx, glyphMotion, tagSource, TemplateRenderer } from './runtime';

const W = 1920;
const DIAG = new THREE.Vector3(1, -1, 0).normalize(); // writing runs top-left → bottom-right inside each character

/** Seconds to write one character; consecutive characters overlap by 20 %. */
export const writeSec = (dur: number, n: number) => Math.min(0.2, Math.max(0.08, (0.5 * dur) / Math.max(1, n)));

export const handwrite: TemplateRenderer = {
  cue(rt: CueRuntime): CueLayer {
    const p = rt.params;
    const text = rt.cue.text.replace(/[\s　]+/g, ' ');
    const rows = [...text].length > 10 ? chunks(text, 2) : [text];
    const probe: GlyphStyle = { family: rt.fonts.script, weight: 400, size: 100 };
    const widest = Math.max(...rows.map((r) => [...r].reduce((w, c) => w + advanceOf(c, probe), 0)), 1);
    const size = Math.round(Math.max(110, Math.min(190, (100 * 0.8 * W) / widest)));
    // thin single-weight faces need their strokes thickened to read on a big screen; bold families do not
    const thin = nearestWeight(rt.fonts.script, 900) < 700;
    const style: GlyphStyle = { family: rt.fonts.script, weight: 900, size, shadow: true, embolden: thin ? size * ((p['weight'] as number) ?? 0.035) : 0 };
    const accent = readable(rt.palette.accent, rt.palette.background, 7);

    const group = new THREE.Group();
    group.position.y = ((p['lift'] as number) ?? 0) + (p['position'] === 'lower' ? -220 : 0);
    const lineH = size * 1.3;
    const src = [...rt.cue.text];
    let s = 0;
    const glyphs: Glyph[] = [];
    rows.forEach((row, r) => {
      const gs = makeGlyphs(row, style, color(rt.palette.text, 1.0), 2);
      // a second line starts a little to the right, like a hand-written note
      placeRow(gs, r * size * 0.8 - (rows.length - 1) * size * 0.4, ((rows.length - 1) / 2 - r) * lineH, 2);
      for (const g of gs) {
        while (s < src.length && src[s] !== g.char) s++;
        const m = emphasisOf(rt, s++);
        if (m === 'color' || m === 'glow') g.mesh.material.color = color(accent, m === 'glow' ? 1.1 : 1.0);
        g.index = glyphs.length;
        g.y += (hash(g.index, 11) - 0.5) * size * 0.06; // uneven baseline
        g.mesh.rotation.z = (hash(g.index, 13) - 0.5) * 0.06;
        g.mesh.material.clippingPlanes = [new THREE.Plane(DIAG.clone().negate(), 0)];
        glyphs.push(g);
        group.add(g.mesh);
      }
    });

    const n = glyphs.length;
    const per = writeSec(rt.cue.end - rt.cue.start, n) * Math.max(0.6, rt.pace);
    tagSource(glyphs, rt.cue.text, 0);
    const startOf = (i: number) => (rt.style.reveal === 'word' ? enterAt(rt, glyphs[i], 0) : rt.showFrom + i * per * 0.8);
    const exitRt: CueRuntime = { ...rt, style: { ...rt.style, enter: 'cut' } };
    const world = new THREE.Vector3();
    const corner = new THREE.Vector3();

    return {
      group,
      update(t: number, _fx: FrameFx) {
        const pulse = accentPulse(t, rt.accentTimes);
        for (const g of glyphs) {
          const a = easeOutCubic(clamp01((t - startOf(g.index)) / per));
          const m = glyphMotion(exitRt, g, n, t, 0);
          g.mesh.position.set(g.x + m.dx, g.y + m.dy, 0);
          g.mesh.scale.setScalar(m.scale * (1 + 0.04 * pulse));
          g.mesh.material.opacity = m.opacity * clamp01(a * 3);
          // clip plane in world space: keep the part of the cell the pen has already passed
          g.mesh.getWorldPosition(world);
          const { width: w, height: h } = g.mesh.geometry.parameters;
          corner.set(world.x - w / 2, world.y + h / 2, 0);
          const plane = g.mesh.material.clippingPlanes![0];
          plane.constant = a * ((w + h) / Math.SQRT2) + DIAG.dot(corner);
        }
      },
      readable: () => [startOf(n - 1) + per, rt.exitAt],
    };
  },
};
