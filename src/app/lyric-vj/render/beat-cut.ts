// beat-cut: each phrase is cut in huge, alone, one after another — a new position, size and angle every time — and
// the whole line comes back big once it is sung. The designer move of re-composing the frame every 1–2 beats in a
// chorus. No small copy of the line underneath: the pieces cycling over it read as the line repeating.
import * as THREE from 'three';
import { phraseBoundaries, phrases } from '../phrases';
import { advanceOf, clamp01, easeOutCubic, Glyph, GlyphStyle, hash, makeGlyphs, placeRow } from './glyphs';
import { color, CueLayer, CueRuntime, emphasisOf, FrameFx, readable, tagSource, TemplateRenderer } from './runtime';

const W = 1920;
const H = 1080;

/** Longest piece cut in big: a longer one cannot be set large enough to read and ran off the frame. */
export const MAX_PIECE = 6;

/** The line as 2–6 pieces of 2–6 characters (particles join the word before them; long phrases split again). */
export function cutPieces(text: string): { text: string; from: number }[] {
  const out: { text: string; from: number }[] = [];
  let at = 0;
  const split = (p: string): string[] => {
    const cs = [...p.trim()];
    if (cs.length <= MAX_PIECE) return [p];
    // cut nearest the middle, at a phrase boundary when there is one, never inside a kanji run (六|感 or 年甲|斐)
    const kanji = (c?: string) => !!c && /\p{Script=Han}/u.test(c);
    const ok = cs.map((_, i) => i).filter((i) => i >= 2 && cs.length - i >= 2 && !(kanji(cs[i - 1]) && kanji(cs[i])) && !/^[、。，,ーっゃゅょぁぃぅぇぉ]/.test(cs[i]));
    const bounds = phraseBoundaries(p.trim());
    const byMiddle = (x: number, y: number) => Math.abs(x - cs.length / 2) - Math.abs(y - cs.length / 2);
    // prefer where a kanji word ends (六感|またがって), then a phrase boundary, then the middle
    const cut = ok.filter((i) => kanji(cs[i - 1]) && !kanji(cs[i])).sort(byMiddle)[0] ?? ok.filter((i) => bounds.has(i)).sort(byMiddle)[0] ?? ok.sort(byMiddle)[0];
    return cut === undefined ? [p] : [cs.slice(0, cut).join(''), cs.slice(cut).join('')].flatMap(split);
  };
  // phrases can split a kanji compound (六|感): rejoin pieces that meet kanji to kanji
  const kanjiEnd = /\p{Script=Han}$/u;
  const kanjiStart = /^\p{Script=Han}/u;
  const joined = phrases(text).reduce<string[]>((acc, p) => (acc.length && kanjiEnd.test(acc[acc.length - 1]) && kanjiStart.test(p) ? [...acc.slice(0, -1), acc[acc.length - 1] + p] : [...acc, p]), []);
  for (const p of joined.flatMap(split)) {
    const from = [...text].indexOf([...p.trim()][0] ?? '', at);
    at = from + [...p].length;
    const prev = out[out.length - 1];
    if (prev && ([...p.trim()].length < 2 || (out.length >= 6 && [...prev.text].length < MAX_PIECE))) prev.text += p;
    else out.push({ text: p.trim(), from: Math.max(0, from) });
  }
  return out.filter((x) => x.text);
}

/** A piece must hold this long to be read; shorter ones merge into the next. */
export const MIN_HOLD = 0.5;

/** Pieces with their sung time (first one at showFrom), merged until each holds at least MIN_HOLD. */
export function timedPieces(pieces: { text: string; from: number }[], charStarts: number[], showFrom: number, exitAt: number) {
  const out = pieces.map((p, k) => ({ ...p, at: k === 0 ? showFrom : charStarts[p.from] - 0.05 }));
  for (let k = 0; k < out.length; ) {
    const end = k + 1 < out.length ? out[k + 1].at : exitAt;
    if (end - out[k].at >= MIN_HOLD || out.length === 1) {
      k++;
      continue;
    }
    // too short: fold into the next piece (or, for the last, into the previous)
    const [a, b] = k + 1 < out.length ? [k, k + 1] : [k - 1, k];
    out.splice(a, 2, { text: out[a].text + out[b].text, from: out[a].from, at: out[a].at });
    k = Math.max(0, a - 1);
  }
  return out;
}

/**
 * The big pieces of a line: its sung pieces, then the whole line back big (the recap) once the last word is sung.
 * A line with no time left for the recap is shown whole instead of cut, as the pieces alone never show the line.
 */
export function planCut(text: string, timed: { text: string; from: number; at: number }[], showFrom: number, lastSung: number, exitAt: number) {
  const recapAt = lastSung + 0.3;
  const fits = timed.length > 1 && exitAt - recapAt >= 0.9 && recapAt > timed[timed.length - 1].at + MIN_HOLD;
  if (!fits) return { pieces: [{ text: text.trim(), from: 0, at: showFrom }], cutCount: 1, recapAt: showFrom };
  return { pieces: [...timed, { text: text.replace(/\s+/g, ' ').trim(), from: 0, at: recapAt }], cutCount: timed.length, recapAt };
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
    // pieces cut in when they are sung; without audio-matched character times the line is shown whole
    const timed = rt.cue.charTimed && rt.cue.charStarts && !rt.rushed ? timedPieces(cutPieces(text), rt.cue.charStarts, rt.showFrom, rt.exitAt) : [];
    const lastSung = rt.cue.charStarts?.[rt.cue.charStarts.length - 1] ?? rt.exitAt;
    const { pieces, cutCount: cutLen, recapAt } = planCut(text, timed, rt.showFrom, lastSung, rt.exitAt);
    const cut = pieces.slice(0, cutLen);
    const startOf = (k: number) => pieces[k].at;
    const whole = pieces.length === 1;
    const accent = readable(rt.palette.accent, rt.palette.background, 7);
    const group = new THREE.Group();
    const seed = Math.floor(hash(rt.cue.start, 17) * 4);
    const big = pieces.map((piece, k) => {
      const recap = k === pieces.length - 1 && pieces.length > cut.length;
      const lay = whole || recap ? LAYOUTS[0] : LAYOUTS[(k + seed) % LAYOUTS.length];
      const probe: GlyphStyle = { family: rt.fonts.display, weight: 900, size: 200 };
      const w200 = [...piece.text].reduce((w, c) => w + advanceOf(c, probe), 0) || 1;
      // fits the layout width, and never wider than the frame (minus margins) even at the floor size
      const size = Math.round(Math.min((200 * 0.9 * W) / w200, Math.max(150, Math.min(lay.width > 1 ? 640 : 460, (200 * lay.width * W) / w200))));
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
      tagSource(gs, text, piece.from);
      return { holder, gs, from: startOf(k), to: k + 1 < pieces.length ? startOf(k + 1) : rt.exitAt, recap, size, tilt: (lay.tilt * Math.PI) / 180 };
    });
    // morph into the recap: the last word's glyphs glide from where they were into their
    // place in the whole line; the rest of the line fades in around them
    const MORPH = 0.35;
    const last = big[big.length - 1];
    const before = big[big.length - 2];
    const morphFrom = new Map<Glyph, { x: number; y: number; s: number }>();
    if (last?.recap && before) {
      for (const g of last.gs) {
        const p = before.gs.find((q) => q.src !== undefined && q.src === g.src);
        if (!p) continue;
        // the earlier glyph's position in the recap holder's space (both holders sit in `group`)
        const c = Math.cos(before.tilt);
        const sn = Math.sin(before.tilt);
        const wx = before.holder.position.x + p.x * c - p.y * sn;
        const wy = before.holder.position.y + p.x * sn + p.y * c;
        morphFrom.set(g, { x: wx - last.holder.position.x, y: wy - last.holder.position.y, s: before.size / last.size });
      }
    }

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
          if (b === last && morphFrom.size) {
            b.holder.scale.setScalar(1);
            const k = easeOutCubic(clamp01((t - b.from) / MORPH));
            for (const g of b.gs) {
              const m0 = morphFrom.get(g);
              if (m0) {
                g.mesh.position.set(m0.x + (g.x - m0.x) * k, m0.y + (g.y - m0.y) * k, 0);
                g.mesh.scale.setScalar(m0.s + (1 - m0.s) * k);
                g.mesh.material.opacity = out;
              } else g.mesh.material.opacity = clamp01((t - b.from - MORPH * 0.4) / (MORPH * 0.6)) * out;
            }
            continue;
          }
          b.gs.forEach((g) => (g.mesh.material.opacity = Math.min(1, p * 2) * out));
        }
      },
      readable: () => [whole ? rt.showFrom + 0.12 : recapAt, rt.exitAt],
    };
  },
};
