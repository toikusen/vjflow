// build-cut: a line assembled in front of you. Each phrase lands big as it is sung and the phrases already up shift to
// make room, so the whole line is on screen, composed, by the time it ends, with no recap to find time for. Every pose
// is worked out from t alone, so any frame can be drawn on its own.
import * as THREE from 'three';
import { cutPieces, timedPieces } from './beat-cut';
import { fitRows, fourPieces, loneScale, openOnTwo, piecesAt, rowTargets } from './build-rows';
import { advanceOf, clamp01, Glyph, GlyphStyle, hash, makeGlyphs, placeRow } from './glyphs';
import { color, CueLayer, CueRuntime, emphasisOf, FrameFx, readable, tagSource, TemplateRenderer } from './runtime';

const W = 1920;
const easeOut = (x: number) => (x >= 1 ? 1 : 1 - 2 ** (-9 * x));

export const buildCut: TemplateRenderer = {
  cue(rt: CueRuntime): CueLayer {
    const text = rt.cue.text;
    const soft = !!rt.shot.params['soft'];
    // the paid director's own breaks when it named them (cue rows), else the line's phrases
    const raw = rt.style.rows?.length ? piecesAt(text, rt.style.rows) : fourPieces(openOnTwo(cutPieces(text), text));
    // a line-timed song has no sung character times: its phrases land by their share of the line, and because every
    // phrase stays up the line still reads whole by its end
    const n = [...text].length;
    const times = rt.cue.charTimed && rt.cue.charStarts ? rt.cue.charStarts : Array.from({ length: n }, (_, i) => rt.cue.start + ((rt.cue.end - rt.cue.start) * i) / n);
    const timed = timedPieces(raw, times, rt.showFrom, rt.exitAt);
    const pieces = rt.rushed || timed.length < 2 ? [{ text: text.trim(), from: 0, at: rt.showFrom }] : timed;
    const seed = Math.floor(hash(rt.cue.start, 23) * 1000);
    const family = rt.fonts.display;
    const probe: GlyphStyle = { family, weight: 900, size: 200 };
    const widths = pieces.map((p) => [...p.text].reduce((w, c) => w + advanceOf(c, probe), 0) || 1);
    const marked = pieces.findIndex((p, k) => [...Array([...p.text].length).keys()].some((i) => emphasisOf(rt, p.from + i)) && k >= 0);
    const keyRow = marked >= 0 ? marked : pieces.length - 1;
    const sizes = fitRows(widths, keyRow, soft ? 0.78 : 0.56);
    const accent = readable(rt.palette.accent, rt.palette.background, 7);
    const align = soft ? 0 : [-1, 1, 0][seed % 3];
    const group = new THREE.Group();
    const rows = pieces.map((p, k) => {
      const style = { family, weight: soft ? 700 : 900, size: sizes[k] };
      const gs: Glyph[] = makeGlyphs(p.text, style, color(k === keyRow ? accent : rt.palette.text, 1));
      placeRow(gs, 0, 0);
      const holder = new THREE.Group();
      gs.forEach((g) => { g.mesh.position.set(g.x, g.y, 0); holder.add(g.mesh); });
      tagSource(gs, text, p.from);
      group.add(holder);
      const width = gs.reduce((a, g) => a + g.advance, 0);
      return { holder, gs, at: p.at, x: align === 0 ? 0 : (align * (W * 0.84 - width)) / 2, from: (seed + k) % 4, lone: k === 0 ? loneScale(sizes[0], width) : 1 };
    });
    // a composer line that gave up its motion for reading is whole from its first frame: nothing slides, nothing fades up
    const landed = rt.style.budget && rt.adjust?.includes('read-cut');
    const moveSec = landed ? 1e-3 : soft ? 0.32 : 0.16;
    const poses = pieces.map((_, k) => rowTargets(sizes, k + 1));
    return {
      group,
      update(t: number, _fx: FrameFx) {
        const k = pieces.reduce((n, p, i) => (t >= p.at ? i : n), 0);
        const e = easeOut(clamp01((t - pieces[k].at) / moveSec));
        const out = t > rt.exitAt ? clamp01((t - rt.exitAt) / Math.max(0.05, rt.exitDur)) : 0;
        const collapse = rt.style.exit === 'collapse' ? out : 0;
        group.scale.set(1 + 0.16 * collapse, Math.max(0.02, 1 - collapse), 1);
        rows.forEach((r, i) => {
          // a composer row waits until the rows above have made room: two rows never lie over each other half-faded
          const clearing = !!rt.style.budget && i === k && k > 0 && t - r.at < moveSec * 0.6;
          r.holder.visible = i <= k && t >= rt.showFrom - 0.02 && !clearing;
          if (!r.holder.visible) return;
          const was = i < k ? poses[k - 1][i] : poses[k][i];
          r.holder.position.y = was + (poses[k][i] - was) * e;
          const fresh = i === k ? 1 - e : 0;
          // the newest phrase arrives from a side of its own; solid from its first frames
          const reach = soft ? 60 : 420;
          // the opening phrase is alone in the frame until the next lands: centred and large, never a small word in an empty frame
          const alone = i === 0 ? (k === 0 ? 1 : k === 1 ? 1 - e : 0) : 0;
          r.holder.position.x = r.x * (1 - alone) + [reach, -reach, 0, 0][r.from] * fresh;
          r.holder.position.y += [0, 0, soft ? 30 : 180, 0][r.from] * fresh;
          const grow = r.from === 3 ? 1 + (soft ? 0.12 : 0.9) * fresh : 1;
          r.holder.scale.setScalar(grow * (1 + (r.lone - 1) * alone));
          const a = (landed || (rt.style.budget && k > 0) ? 1 : Math.min(1, (t - r.at) / 0.05)) * (rt.style.exit === 'collapse' ? (out > 0.8 ? (1 - out) / 0.2 : 1) : 1 - out);
          r.gs.forEach((g) => (g.mesh.material.opacity = clamp01(a)));
        });
      },
      readable: () => [rt.showFrom + (landed ? 1 / 60 : 0.12), rt.exitAt],
    };
  },
};
