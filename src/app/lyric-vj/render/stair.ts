// stair: the line in two rows set off-axis like steps — the second row indented a quarter of the frame and entering
// a beat later. One of the library's layout moves against the always-centred stack.
import * as THREE from 'three';
import { balancedRows } from '../phrases';
import { advanceOf, Glyph, GlyphStyle, makeGlyphs, placeRow, rowWidth } from './glyphs';
import { color, CueLayer, CueRuntime, emphasisOf, glyphMotion, readable, settledAt, tagSource, TemplateRenderer } from './runtime';

const W = 1920;
const TRACK = 6;
const STAGGER = 0.03;
/** The least type a stair row is set at, px (never under the type floor, type-floor.ts). */
export const STAIR_LEAST = 90;

/** A run cut into `n` even rows at its characters, a mark staying with the character before it (a line with too few phrase breaks to take more rows). */
function evenRows(text: string, n: number): string[] {
  const cs = [...text.replace(/[\s　]+/g, ' ').trim()];
  const out: string[] = [];
  let at = 0;
  for (let k = 1; k <= n; k++) {
    let end = k === n ? cs.length : Math.round((cs.length * k) / n);
    while (end < cs.length && /[\s\p{P}\p{S}ーぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮ～〜]/u.test(cs[end])) end++;
    if (end > at) out.push(cs.slice(at, end).join('').trim());
    at = end;
  }
  return out.filter(Boolean);
}

/**
 * The rows a stair line is set in: two, three for a long line, and one more (the steps closer, to six) while its widest
 * row would set under STAIR_LEAST px (the frame fit took the type of a 50-character line down to 68 px, under the type
 * floor, 2026-11-12). `widestOf`: the widest row's advance at 100 px.
 */
export function stairRows(text: string, chars: number, widestOf: (rows: string[]) => number, least = STAIR_LEAST, breaks?: number[]): string[] {
  // (a line with breaks — a duet set together, line-shows.ts, one voice to a row — keeps them: each voice on rows of its
  // own, split further only while its widest row would set under the least size)
  if (breaks?.length) {
    const cs = [...text];
    const cuts = [0, ...breaks.filter((b) => b > 0 && b < cs.length).sort((a, b) => a - b), cs.length];
    return cuts.slice(1).flatMap((end, k) => {
      const g = cs.slice(cuts[k], end).join('').replace(/[\s　]+/g, ' ').trim();
      if (!g) return [];
      let rs = [g];
      while (rs.length < 4 && (100 * 0.55 * W) / widestOf(rs) < least) {
        const n = rs.length + 1;
        const more = balancedRows(g, n);
        const next = more.length >= n ? more : evenRows(g, n);
        if (next.length <= rs.length) break;
        rs = next;
      }
      return rs;
    });
  }
  let rows = chars > 22 ? balancedRows(text, 3) : chars > 6 ? balancedRows(text, 2) : [text];
  while (rows.length < 6 && (100 * 0.55 * W) / widestOf(rows) < least) {
    const n = rows.length + 1;
    const more = balancedRows(text, n);
    const next = more.length >= n ? more : evenRows(text, n);
    if (next.length <= rows.length) break;
    rows = next;
  }
  return rows;
}

export const stair: TemplateRenderer = {
  cue(rt: CueRuntime): CueLayer {
    const p = rt.params;
    const text = rt.cue.text.replace(/[\s　]+/g, ' ');
    // a long line (a rap verse) takes three steps: on two its rows were too wide to set at a readable size
    const chars = [...text.replace(/ /g, '')].length;
    const probe: GlyphStyle = { family: rt.fonts.display, weight: 900, size: 100 };
    const widestOf = (rs: string[]) => Math.max(...rs.map((r) => [...r].reduce((w, c) => w + advanceOf(c, probe), 0)), 1);
    // (the least type the line must rest at: the floor of the set it was taken from, when it falls back to stair from one)
    const least = Math.max(STAIR_LEAST, Number(p['floor']) || 0);
    // (the line's own breaks where it has them: a duet set together keeps a voice to a row group)
    const rows = stairRows(rt.style.rows?.length ? rt.cue.text : text, chars, widestOf, least, rt.style.rows);
    const size = Math.round(Math.max(least, Math.min(180, (100 * 0.55 * W) / widestOf(rows))));
    const style: GlyphStyle = { family: rt.fonts.display, weight: 900, size, shadow: true };
    const accent = readable(rt.palette.accent, rt.palette.background, 7);
    const right = p['side'] === 'right'; // mirrored: steps descend toward the left
    const lineH = size * 1.25;
    const group = new THREE.Group();
    const rowGlyphs = rows.map((r) => makeGlyphs(r, style, color(rt.palette.text, 1.0), TRACK));
    rowGlyphs.forEach((gs, i) => {
      const w = rowWidth(gs, TRACK);
      // row 0 starts 36 % in from its side, each later row steps a quarter frame further in and one line down
      // (three rows step an eighth, more rows share that same reach: a quarter put the third row off the frame's far side)
      const edge = -W * 0.36 + i * W * (rows.length > 2 ? 0.24 / (rows.length - 1) : 0.25);
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
