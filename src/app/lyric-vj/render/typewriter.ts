// typewriter: the line types in character by character behind a cursor (database: 45/50 videos type lyrics in).
import * as THREE from 'three';
import { chunks } from '../phrases';
import { advanceOf, clamp01, easeOutCubic, Glyph, GlyphStyle, makeGlyphs, placeRow, rowWidth, sizeCap } from './glyphs';
import { accentPulse, color, enterAt, readable, CueLayer, CueRuntime, emphasisOf, FrameFx, glyphMotion, tagSource, TemplateRenderer } from './runtime';

const W = 1920;
const TRACK = 6;

/** Seconds between characters: the line finishes typing in the first ~45 % of its duration. */
// typing takes a quarter of the line, at most 0.8 s in all, so the finished line has most of its time to be read
export const typeInterval = (dur: number, n: number) => Math.min(0.06, 0.8 / Math.max(1, n), Math.max(0.02, (0.25 * dur) / Math.max(1, n)));

export const typewriter: TemplateRenderer = {
  cue(rt: CueRuntime): CueLayer {
    const p = rt.params;
    const text = rt.cue.text.replace(/[\s　]+/g, ' ');
    // span: the block keeps to a side column this wide (a fraction of the frame), in as many rows as that takes; a
    // mixed-language line from the vertical template stays in its lyric third instead of crossing the picture
    const span = p['span'] as number | undefined;
    const probe: GlyphStyle = { family: rt.fonts.body, weight: 900, size: 100 };
    const widthOf = (rs: string[]) => Math.max(...rs.map((r) => [...r].reduce((w, c) => w + advanceOf(c, probe), 0)), 1);
    // in a side column: as many rows as keep the block inside it at the smallest type size (a long English line at the
    // floor size ran wider than its column and over the picture)
    let rows = [...text].length > 14 ? chunks(text, 2) : [text];
    if (span) for (let n = 2; n <= 12; n++) { rows = chunks(text, n); if ((widthOf(rows) * 64) / 100 <= span * W) break; }
    const widest = widthOf(rows);
    const size = Math.round(Math.max(span ? 64 : 88, Math.min(150 * sizeCap, (100 * (span ?? 0.78) * W) / widest)));
    const style: GlyphStyle = { family: rt.fonts.body, weight: 900, size, shadow: true };
    const accent = readable(rt.palette.accent, rt.palette.background, 7);

    const group = new THREE.Group();
    group.position.y = (p['lift'] as number) ?? 0;
    const lineH = size * 1.4;
    const pos = p['position'] as string;
    const cy = pos === 'bottom' ? -330 + ((rows.length - 1) * lineH) / 2 : 0;
    const rowGlyphs = rows.map((r) => makeGlyphs(r, style, color(rt.palette.text, 1.0), TRACK));
    const blockW = Math.max(...rowGlyphs.map((g) => rowWidth(g, TRACK)));
    // rows share one left edge, like text typed on a page
    const left = pos === 'left' ? -W / 2 + 160 : pos === 'right' && span ? W / 2 - 160 - blockW : -blockW / 2;
    const glyphs: Glyph[] = [];
    let srcIndex = 0;
    rowGlyphs.forEach((gs, r) => {
      placeRow(gs, left + rowWidth(gs, TRACK) / 2, cy + ((rows.length - 1) / 2 - r) * lineH, TRACK);
      for (const g of gs) {
        while (srcIndex < [...rt.cue.text].length && [...rt.cue.text][srcIndex] !== g.char) srcIndex++;
        const m = emphasisOf(rt, srcIndex++);
        if (m === 'color' || m === 'glow') g.mesh.material.color = color(accent, m === 'glow' ? 1.1 : 1.0);
        g.index = glyphs.length;
        glyphs.push(g);
        group.add(g.mesh);
      }
    });

    const cursor = new THREE.Mesh(
      new THREE.PlaneGeometry(Math.max(4, size * 0.07), size * 1.05),
      new THREE.MeshBasicMaterial({ color: color(accent, 1.2), transparent: true, depthTest: false, depthWrite: false }),
    );
    cursor.visible = !!p['cursor'];
    group.add(cursor);

    const n = glyphs.length;
    // a line with no time to spare is up at once (typing it would leave nothing to read)
    const per = rt.rushed ? 0 : typeInterval(rt.cue.end - rt.cue.start, n) * Math.max(0.6, rt.pace);
    tagSource(glyphs, rt.cue.text, 0);
    // word reveal: steady typing over the first part of the line
    const typedAt = (i: number) => (rt.style.reveal === 'word' ? enterAt(rt, glyphs[i], 0) : rt.showFrom + i * per);
    const doneAt = typedAt(n - 1) + 0.06;
    // typing is the entrance; the cue's exit still applies
    const exitRt: CueRuntime = { ...rt, style: { ...rt.style, enter: 'cut' } };

    return {
      group,
      update(t: number, _fx: FrameFx) {
        const pulse = accentPulse(t, rt.accentTimes);
        let last = -1;
        for (const g of glyphs) {
          const a = clamp01((t - typedAt(g.index)) / 0.06);
          if (a > 0) last = g.index;
          const m = glyphMotion(exitRt, g, n, t, 0);
          g.mesh.position.set(g.x + m.dx, g.y + m.dy, 0);
          g.mesh.scale.setScalar(m.scale * (1 + 0.25 * (1 - easeOutCubic(a))));
          g.mesh.material.opacity = m.opacity * a;
        }
        const at = glyphs[Math.max(0, last)];
        cursor.position.set(last < 0 ? at.x - at.advance / 2 : at.x + at.advance / 2 + TRACK + size * 0.06, at.y, 0);
        // solid while typing, blinking once done, gone when the line leaves
        const blink = t < doneAt || Math.floor((t - doneAt) / 0.45) % 2 === 0;
        const mat = cursor.material as THREE.MeshBasicMaterial;
        mat.opacity = t < rt.showFrom || t > rt.exitAt ? 0 : (blink ? 0.9 : 0) * (1 + 0.3 * pulse);
      },
      readable: () => [doneAt, rt.exitAt],
    };
  },
};
