// stair: the line in two rows set off-axis like steps — the second row indented a quarter of the frame and entering
// a beat later. One of the library's layout moves against the always-centred stack.
import * as THREE from 'three';
import { balancedRows } from '../phrases';
import { advanceOf, Glyph, GlyphStyle, makeGlyphs, placeRow, rowWidth } from './glyphs';
import { color, CueLayer, CueRuntime, emphasisOf, glyphMotion, readable, settledAt, tagSource, TemplateRenderer } from './runtime';

const W = 1920;
const TRACK = 6;
const STAGGER = 0.03;

export const stair: TemplateRenderer = {
  cue(rt: CueRuntime): CueLayer {
    const p = rt.params;
    const text = rt.cue.text.replace(/[\s　]+/g, ' ');
    // a long line (a rap verse) takes three steps: on two its rows were too wide to set at a readable size
    const chars = [...text.replace(/ /g, '')].length;
    const rows = chars > 22 ? balancedRows(text, 3) : chars > 6 ? balancedRows(text, 2) : [text];
    const probe: GlyphStyle = { family: rt.fonts.display, weight: 900, size: 100 };
    const widest = Math.max(...rows.map((r) => [...r].reduce((w, c) => w + advanceOf(c, probe), 0)), 1);
    const size = Math.round(Math.max(90, Math.min(180, (100 * 0.55 * W) / widest)));
    const style: GlyphStyle = { family: rt.fonts.display, weight: 900, size, shadow: true };
    const accent = readable(rt.palette.accent, rt.palette.background, 7);
    const right = p['side'] === 'right'; // mirrored: steps descend toward the left
    const lineH = size * 1.25;
    const group = new THREE.Group();
    const rowGlyphs = rows.map((r) => makeGlyphs(r, style, color(rt.palette.text, 1.0), TRACK));
    rowGlyphs.forEach((gs, i) => {
      const w = rowWidth(gs, TRACK);
      // row 0 starts 36 % in from its side, each later row steps a quarter frame further in and one line down
      // (three rows step an eighth: a quarter put the third row off the frame's far side)
      const edge = -W * 0.36 + i * W * (rows.length > 2 ? 0.12 : 0.25);
      placeRow(gs, right ? -(edge + w / 2) : edge + w / 2, ((rows.length - 1) / 2 - i) * lineH, TRACK);
    });
    const glyphs: Glyph[] = rowGlyphs.flat();
    tagSource(glyphs, rt.cue.text, 0);
    glyphs.forEach((g, i) => {
      g.index = i;
      const m = g.src !== undefined ? emphasisOf(rt, g.src) : undefined;
      if (m === 'color' || m === 'glow') g.mesh.material.color = color(accent, m === 'glow' ? 1.1 : 1.0);
      group.add(g.mesh);
    });
    // each later row enters a beat-ish after the one before
    const delay = rt.rushed ? 0 : 0.35 * rt.pace;
    const rowOf = glyphs.map((_, i) => rowGlyphs.findIndex((_, r) => i < rowGlyphs.slice(0, r + 1).reduce((a, x) => a + x.length, 0)));
    const rowRt = (i: number): CueRuntime => (rowOf[i] === 0 ? rt : { ...rt, showFrom: rt.showFrom + delay * rowOf[i] });

    return {
      group,
      update(t: number) {
        glyphs.forEach((g) => {
          const m = glyphMotion(rowRt(g.index), g, glyphs.length, t, STAGGER);
          g.mesh.position.set(g.x + m.dx, g.y + m.dy, 0);
          g.mesh.scale.setScalar(m.scale);
          g.mesh.rotation.z = m.rot;
          g.mesh.material.opacity = m.opacity;
        });
      },
      readable: () => [settledAt(rowRt(glyphs.length - 1), glyphs.length, STAGGER), rt.exitAt],
    };
  },
};
