// vertical: Japanese tategaki, columns read right to left (database: 41/50 videos set lines vertically).
import * as THREE from 'three';
import { chunks } from '../phrases';
import { typewriter } from './typewriter';
import { clamp01, Glyph, GlyphStyle, makeGlyphs } from './glyphs';
import { accentPulse, color, readable, CueLayer, CueRuntime, emphasisOf, FrameFx, glyphMotion, settledAt, TemplateRenderer } from './runtime';

const W = 1920;
const STAGGER = 0.05;
const EMPH = 1.3;
/** Characters drawn rotated in vertical text: long marks, dashes and Latin letters/digits (set sideways). */
const ROTATE = /[ー〜～…―‐\-A-Za-z0-9!?'"&.,:;]/;
/** Brackets have their own vertical forms (︵︶﹁﹂); horizontal ones stand sideways in a column. */
const VERTICAL_FORM: Record<string, string> = { '（': '︵', '(': '︵', '）': '︶', ')': '︶', '「': '﹁', '」': '﹂', '『': '﹃', '』': '﹄', '【': '︻', '】': '︼', '〈': '︿', '〉': '﹀' };
const LATIN = /[A-Za-z0-9!?'"&.,:;]/;
/** Small marks sit in the upper right of their cell in vertical text. */
const CORNER = /[、。，．]/;
/** Small kana sit a little toward the upper right of their cell (Mografy cjk.ts, MIT). */
const SMALL = /[ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ]/;
const DIGIT = /[0-9０-９]/;

export const vertical: TemplateRenderer = {
  cue(rt: CueRuntime): CueLayer {
    // English words do not stack in a column (spaces split them across columns): set such a line horizontally
    if ((rt.cue.text.match(/[A-Za-z]/g) ?? []).length >= 3) {
      const side = rt.params['position'] === 'left' || rt.params['position'] === 'right';
      return typewriter.cue({ ...rt, params: { ...rt.params, position: side ? rt.params['position'] : 'center', ...(side ? { span: 0.34 } : {}), cursor: false } });
    }
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
    const emStyle: GlyphStyle = { ...style, family: rt.fonts.display, weight: 900, size: Math.round(size * EMPH) };
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
    let srcCursor = 0;
    cells.forEach((col, k) => {
      let y = top - k * step;
      col.forEach(({ ch, m }, i) => {
        const em = m !== undefined;
        // tate-chu-yoko: a number of one or two digits stands upright, a pair side by side in one cell (10月17日)
        const isDigit = (j: number) => DIGIT.test(col[j]?.ch ?? '');
        const run = (() => {
          let a = i, b = i;
          while (isDigit(a - 1)) a--;
          while (isDigit(b + 1)) b++;
          return isDigit(i) ? b - a + 1 : 0;
        })();
        const pair = run === 2 ? (isDigit(i - 1) ? 1 : 0) : -1;
        const [g] = makeGlyphs(VERTICAL_FORM[ch] ?? ch, em ? emStyle : style, color(em ? accent : rt.palette.text, em && m === 'glow' ? 1.1 : 1.0));
        // a sideways Latin letter takes only its own width down the column; spaces in a Latin run keep a gap
        const upright = run === 1 || run === 2;
        const h = upright ? (pair === 0 ? 0 : cell) : LATIN.test(ch) || ch === ' ' ? Math.max(g.advance, size * 0.3) : em ? cell * EMPH : cell;
        const nudge = CORNER.test(ch) ? size * 0.32 : SMALL.test(ch) ? size * 0.12 : 0;
        g.x = firstX - k * colGap + nudge + (pair === 0 ? -g.advance / 2 : pair === 1 ? g.advance / 2 : 0);
        g.y = y - (upright ? cell : h) / 2 + nudge;
        g.mesh.rotation.z = ROTATE.test(ch) && !upright ? -Math.PI / 2 : 0;
        g.mesh.userData['turn'] = g.mesh.rotation.z;
        g.mesh.userData['emph'] = em ? 1 : 0;
        g.src = src.indexOf(ch, srcCursor);
        if (g.src >= 0) srcCursor = g.src + 1;
        else delete g.src;
        g.index = glyphs.length;
        glyphs.push(g);
        group.add(g.mesh);
        y -= h;
      });
    });
    const n = glyphs.length;

    return {
      group,
      update(t: number, _fx: FrameFx) {
        const pulse = accentPulse(t, rt.accentTimes);
        const drift = -14 * clamp01((t - rt.showFrom) / 4); // columns sink slowly while held
        for (const g of glyphs) {
          const m = glyphMotion(rt, g, n, t, STAGGER);
          // entrances move along the column, not across it: a sideways slide (dx) runs down the column, a fall (dy,
          // y up) stays a fall (-0.2 · dy turned a drop into a rise once glyphMotion's drop came from above)
          g.mesh.position.set(g.x, g.y + drift - m.dx + m.dy, 0);
          g.mesh.scale.setScalar(m.scale * (g.mesh.userData['emph'] ? 1 + 0.08 * pulse : 1));
          // the glyph's own turn (a sideways long mark) plus the motion's (a spin, a domino falling)
          g.mesh.rotation.z = (g.mesh.userData['turn'] as number) + m.rot;
          g.mesh.material.opacity = m.opacity;
        }
      },
      readable: () => [settledAt(rt, n, STAGGER), rt.exitAt],
    };
  },
};
