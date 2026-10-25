// lanes: the frame is letterboxed and the bars carry the words (learnt from @aicreataro's 2026-10 lyric film): the
// sung line in the top bar, each phrase lighting up in its own colour as it is sung, and the line's translation (or
// its second half) in the bottom bar. The picture between the bars stays free of text.
import * as THREE from 'three';
import { chunks } from '../phrases';
import { clamp01, easeOutCubic, Glyph, GlyphStyle, makeGlyphs, placeRow, rowWidth } from './glyphs';
import { color, CueLayer, CueRuntime, enterAt, FrameFx, glyphMotion, readable, tagSource, TemplateRenderer } from './runtime';

const W = 1920;
const H = 1080;
const TRACK = 4;

/** The phrases a line is coloured by: its words where it has spaces, otherwise a few even chunks of about four characters. */
export function phrasesOf(text: string): string[] {
  const words = text.trim().split(/[\s　]+/).filter(Boolean);
  if (words.length > 1) return words;
  const n = [...text].length;
  return n <= 4 ? [text] : chunks(text, Math.ceil(n / 4));
}

/** Which phrase each character of the line belongs to (spaces count with the phrase before them). */
export function phraseIndex(text: string, phrases: string[]): number[] {
  const out: number[] = [];
  let p = 0, inP = 0;
  for (const ch of [...text]) {
    if (/[\s　]/.test(ch)) { out.push(Math.max(0, p - (inP ? 0 : 1))); continue; }
    while (p < phrases.length && inP >= [...phrases[p].replace(/[\s　]/g, '')].length) { p++; inP = 0; }
    out.push(Math.min(p, phrases.length - 1));
    inP++;
  }
  return out;
}

export const lanes: TemplateRenderer = {
  cue(rt: CueRuntime): CueLayer {
    const p = rt.params;
    const bar = (p['bar'] as number) ?? 150;
    const text = rt.cue.text.replace(/[\s　]+/g, ' ').trim();
    const sub = ((rt.cue as { sub?: string }).sub ?? '').trim();
    const group = new THREE.Group();

    // the bars themselves (black, outside the picture; wider than the frame so a camera zoom never shows their ends)
    for (const y of [H / 2 - bar / 2, -H / 2 + bar / 2]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(W * 1.4, bar), new THREE.MeshBasicMaterial({ color: 0x050505, transparent: true, depthTest: false, depthWrite: false }));
      m.position.set(0, y, -1);
      group.add(m);
    }

    // the sung line: phrase by phrase in turning colours, readable on black
    const phrases = phrasesOf(text);
    const owner = phraseIndex(text, phrases);
    const inks = ['#ffffff', readable(rt.palette.accent, '#050505', 4.5), readable(rt.palette.text, '#050505', 4.5)];
    const size = Math.round(Math.min(78, (W * 0.86) / Math.max(1, [...text].length) / 0.95));
    const style: GlyphStyle = { family: rt.fonts.display, weight: 900, size, shadow: false };
    const glyphs: Glyph[] = makeGlyphs(text, style, color('#ffffff', 1), TRACK);
    glyphs.forEach((g, i) => (g.mesh.material.color = color(inks[owner[i] % inks.length], 1)));
    placeRow(glyphs, 0, H / 2 - bar / 2, TRACK);
    tagSource(glyphs, rt.cue.text, 0);
    glyphs.forEach((g) => group.add(g.mesh));

    // the bottom lane: the translation, or nothing
    const subStyle: GlyphStyle = { family: rt.fonts.display, weight: 700, size: Math.round(Math.min(46, (W * 0.8) / Math.max(1, [...sub].length) / 0.6)) };
    const subs: Glyph[] = sub ? makeGlyphs(sub, subStyle, color('#e8e8e8', 1), 2) : [];
    if (subs.length) placeRow(subs, 0, -H / 2 + bar / 2, 2);
    subs.forEach((g) => g.mesh.position.set(g.x, g.y, 0));
    subs.forEach((g) => group.add(g.mesh));
    const subW = subs.length ? rowWidth(subs, 2) : 0;

    // each character lands when its phrase is sung (the line's own timing), a little lift as it lights
    const wordRt: CueRuntime = { ...rt, style: { ...rt.style, reveal: 'word' } };
    const at = glyphs.map((g) => enterAt(wordRt, g, 0));
    const exitRt: CueRuntime = { ...rt, style: { ...rt.style, enter: 'cut' } };
    const n = glyphs.length;
    return {
      group,
      update(t: number, _fx: FrameFx) {
        for (const g of glyphs) {
          const a = clamp01((t - at[g.index]) / 0.12);
          const m = glyphMotion(exitRt, g, n, t, 0);
          g.mesh.position.set(g.x + m.dx, g.y + m.dy - (1 - easeOutCubic(a)) * 18, 0);
          g.mesh.scale.setScalar(m.scale);
          g.mesh.material.opacity = m.opacity * a;
        }
        // the translation reads in from the left as the line is sung
        const k = clamp01((t - rt.showFrom) / Math.max(0.3, (rt.cue.end - rt.cue.start) * 0.6));
        const edge = -subW / 2 + k * subW;
        const gone = t > rt.exitAt ? clamp01(1 - (t - rt.exitAt) / 0.3) : 1;
        for (const g of subs) g.mesh.material.opacity = (g.x <= edge ? 1 : 0) * gone;
      },
      readable: () => [at[n - 1] ?? rt.showFrom, rt.exitAt],
      framed: true,
    };
  },
};
