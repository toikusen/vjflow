// title-card: song title and artist (and the group logo when one is uploaded) over an intro, interlude or outro with
// no lyrics. Letters rise in one by one between two thin lines that draw out from the centre.
import * as THREE from 'three';
import { advanceOf, clamp01, easeOutCubic, GlyphStyle, makeGlyphs, placeRow } from './glyphs';
import { color, CueLayer, CueRuntime, ShotContext, ShotLayer, TemplateRenderer } from './runtime';
import { typewriter } from './typewriter';
import { readingLatin } from '../fonts';
import { Palette, ParamValue, Shot } from '../treatment';

const W = 1920;

export const titleCard: TemplateRenderer = {
  standalone: true,
  // a line that falls inside a title-card shot is set small at the bottom, the title stays the subject
  cue(rt: CueRuntime): CueLayer {
    return typewriter.cue({ ...rt, params: { ...rt.params, position: 'bottom', cursor: false } });
  },

  shot(shot: Shot, params: Record<string, ParamValue>, palette: Palette, ctx: ShotContext): ShotLayer {
    const group = new THREE.Group();
    const lower = params['layout'] === 'lower-left';
    const { title, artist } = ctx.meta;
    // title as large as fits 70 % of the width (one line), artist small above it
    const probe: GlyphStyle = { family: ctx.fonts.display, weight: 900, size: 100 };
    const w100 = [...title].reduce((w, c) => w + advanceOf(c, probe), 0) || 1;
    const size = Math.round(Math.max(90, Math.min(lower ? 150 : 210, (100 * (lower ? 0.5 : 0.7) * W) / w100)));
    const tStyle: GlyphStyle = { family: ctx.fonts.display, weight: 900, size, shadow: true };
    // the artist must read as a name: a script accent face (Pacifico) made JAPANARIZM unrecognisable
    const aFamily = /^[\u0000-\u024f\s]+$/.test(artist) ? readingLatin(ctx.accentFont) : ctx.fonts.body;
    const aStyle: GlyphStyle = { family: aFamily, weight: 700, size: Math.round(size * 0.32), shadow: true };
    const cx = lower ? -W / 2 + 140 : 0;
    const cy = lower ? -300 : 0;
    const tGlyphs = makeGlyphs(title, tStyle, color(palette.text, 1.1), size * 0.04);
    const aGlyphs = params['showArtist'] !== false && artist ? makeGlyphs(artist, aStyle, color(palette.accent, 1.2), aStyle.size * 0.35) : [];
    const rowW = (gs: typeof tGlyphs, track: number) => gs.reduce((s, g) => s + g.advance, 0) + track * Math.max(0, gs.length - 1);
    const tW = rowW(tGlyphs, size * 0.04);
    placeRow(tGlyphs, lower ? cx + tW / 2 : cx, cy, size * 0.04);
    placeRow(aGlyphs, lower ? cx + rowW(aGlyphs, aStyle.size * 0.35) / 2 : cx, cy + size * 0.85, aStyle.size * 0.35);
    [...tGlyphs, ...aGlyphs].forEach((g) => group.add(g.mesh));

    // two hairlines that draw out from the centre (from the left edge in the lower-left layout)
    const lineMat = () => new THREE.MeshBasicMaterial({ color: color(palette.line, 1.2), transparent: true, depthTest: false, depthWrite: false });
    const lines = [cy + size * 0.62, cy - size * 0.62].map((y) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 2), lineMat());
      m.position.y = y;
      group.add(m);
      return m;
    });
    const lineLen = Math.max(tW, rowW(aGlyphs, 0)) + 160;

    let logo: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> | undefined;
    if (ctx.logo && params['logo'] !== false) {
      const img = ctx.logo.image as { width: number; height: number };
      const h = size * 1.2;
      logo = new THREE.Mesh(new THREE.PlaneGeometry((h * img.width) / img.height, h), new THREE.MeshBasicMaterial({ map: ctx.logo, transparent: true, depthTest: false, depthWrite: false }));
      logo.position.set(lower ? cx + (h * img.width) / img.height / 2 : cx, cy + size * 1.7, 0);
      group.add(logo);
    }

    const dur = shot.end - shot.start;
    const outAt = shot.end - Math.min(0.8, dur * 0.2);
    return {
      group,
      update(t: number) {
        const since = t - shot.start;
        const out = 1 - clamp01((t - outAt) / Math.max(0.1, shot.end - outAt));
        const drift = 1 + 0.025 * clamp01(since / Math.max(1, dur)); // slow push while it holds
        group.scale.setScalar(drift);
        lines.forEach((m, k) => {
          const p = easeOutCubic((since - 0.1 - k * 0.12) / 0.9);
          m.scale.x = Math.max(0.001, lineLen * p);
          m.position.x = lower ? cx + (lineLen * p) / 2 : cx;
          m.material.opacity = 0.8 * p * out;
        });
        tGlyphs.forEach((g, i) => {
          const p = easeOutCubic((since - 0.35 - i * 0.06) / 0.7);
          g.mesh.position.set(g.x, g.y - (1 - p) * size * 0.35, 0);
          g.mesh.material.opacity = p * out;
        });
        aGlyphs.forEach((g, i) => {
          const p = easeOutCubic((since - 0.15 - i * 0.02) / 0.6);
          g.mesh.position.set(g.x + (1 - p) * -30, g.y, 0);
          g.mesh.material.opacity = p * out;
        });
        if (logo) logo.material.opacity = easeOutCubic((since - 0.6) / 0.8) * out;
      },
    };
  },
};
