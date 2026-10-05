// block: a translucent slab in the plate's own colours glides in from one side on the cue and covers that part of the frame;
// the keyword is set huge in ink on the slab, the rest of the line in small type beside it. The designer chorus
// move the gap analysis kept asking for instead of the centred small-big-small stack: a colour block that eats the
// picture and carries the type.
import * as THREE from 'three';
import { advanceOf, clamp01, easeOutCubic, Glyph, GlyphStyle, makeGlyphs, placeRow, rowWidth } from './glyphs';
import { keywordRange } from './punch';
import { accentPulse, color, CueLayer, CueRuntime, FrameFx, glyphMotion, settledAt, tagSource, TemplateRenderer } from './runtime';

const W = 1920;
const easeInOutCubic = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
const mixHex = (a: string, b: string, k: number) =>
  '#' + [1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - k) + parseInt(b.slice(i, i + 2), 16) * k).toString(16).padStart(2, '0')).join('');
const H = 1080;
const STAGGER = 0.04;

/** Ink for type on a slab of `hex`: near-black on light slabs, white on dark ones. */
export function inkOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.5 ? '#0b0a10' : '#ffffff';
}

export const block: TemplateRenderer = {
  cue(rt: CueRuntime): CueLayer {
    const p = rt.params;
    const side = (p['side'] as string) === 'right' ? 1 : -1; // -1: the slab covers the left
    const cover = (p['cover'] as number) ?? 0.5;
    const tilt = (((p['tilt'] as number) ?? -4) * Math.PI) / 180;
    const chars = [...rt.cue.text];
    const [k0, k1] = keywordRange(rt.cue.text, rt);
    const keyword = chars.slice(k0, k1).join('').replace(/\s+/g, '');
    const edge = (s: string) => s.trim().replace(/^[、。，,．.・]+|[、，,]+$/g, '').trim();
    // text before the keyword (from 0) and after it (from k1), each with its source offset
    const rest = [{ text: edge(chars.slice(0, k0).join('')), from: 0 }, { text: edge(chars.slice(k1).join('')), from: k1 }].filter((r) => r.text);

    const group = new THREE.Group();
    // the slab takes the plate's own duotone colours (dark ground toward the section highlight), translucent so the
    // picture shows through: a saturated accent slab read as pasted on, unrelated to the background
    const slabColor = mixHex(rt.palette.background, rt.palette.line, 0.45);
    const slabW = W * cover;
    // the slab is wider and taller than its visible part so the tilt never shows a corner
    const slab = new THREE.Mesh(
      new THREE.PlaneGeometry(slabW + W * 0.3, H * 1.6),
      new THREE.MeshBasicMaterial({ color: color(slabColor, 1), opacity: 0.78, transparent: true, depthTest: false, depthWrite: false }),
    );
    slab.rotation.z = tilt;
    // cue layers sort at group order 0 with the plates (renderOrder 0/1) and under the dim layer (2): the slab sits
    // just above the plates and the type just above the slab, keeping the text as bright as every other template's
    slab.renderOrder = 1.5;
    const slabX = side * (W / 2 - slabW / 2) + side * W * 0.15; // inner edge at cover * W from the frame side
    group.add(slab);

    // keyword: as large as fits the slab, ink on colour, aligned to the slab's inner edge
    const probe: GlyphStyle = { family: rt.fonts.display, weight: 900, size: 200 };
    const w200 = [...keyword].reduce((w, c) => w + advanceOf(c, probe), 0) || 1;
    const size = Math.round(Math.max(72, Math.min(420, (200 * slabW * 0.82) / w200))); // long keywords shrink rather than run off the frame
    const kw = makeGlyphs(keyword, { family: rt.fonts.display, weight: 900, size }, color(inkOn(slabColor), 1.0));
    const inner = side * (W / 2 - slabW); // x of the slab's inner edge
    const kwX = inner + side * (70 + rowWidth(kw) / 2); // inside the slab
    placeRow(kw, kwX, 20);
    tagSource(kw, rt.cue.text, k0);

    // the rest of the line beside the slab, on the picture, aligned to the same edge
    const sStyle: GlyphStyle = { family: rt.fonts.body, weight: 900, size: 96, shadow: true };
    const small: Glyph[][] = rest.map((r) => makeGlyphs(r.text.replace(/\s+/g, ' '), sStyle, color(rt.palette.text, 0.95), 6));
    small.forEach((gs, i) => {
      // on the picture side of the slab, starting 60 px from its inner edge
      const x = inner - side * (60 + rowWidth(gs, 6) / 2);
      placeRow(gs, x, (small.length - 1) * 70 - i * 140, 6);
      tagSource(gs, rt.cue.text, rest[i].from);
    });
    for (const g of [...kw, ...small.flat()]) {
      g.mesh.renderOrder = 1.6;
      group.add(g.mesh);
    }
    const smallRt: CueRuntime = { ...rt, style: { ...rt.style, enter: 'wipe' }, showFrom: rt.showFrom + 0.12 };

    return {
      group,
      update(t: number, fx: FrameFx) {
        const pulse = accentPulse(t, rt.accentTimes);
        fx.hit = Math.max(fx.hit, 0.35 * accentPulse(t, rt.accentTimes, 12));
        // the slab glides in from its side over 0.5 s (a slam read as abrupt) and leaves the same way
        const inK = easeInOutCubic(clamp01((t - rt.showFrom) / 0.5));
        const outK = t > rt.exitAt ? easeOutCubic(clamp01((t - rt.exitAt) / Math.max(0.08, rt.exitDur))) : 0;
        const off = side * (1 - inK + outK) * (slabW + W * 0.3);
        slab.position.set(slabX + off, 0, 0);
        slab.material.opacity = t < rt.showFrom || t > rt.exitAt + rt.exitDur ? 0 : 0.78;
        kw.forEach((g) => {
          const m = glyphMotion(rt, g, kw.length, t, STAGGER);
          g.mesh.position.set(g.x + m.dx + off, g.y + m.dy, 0);
          g.mesh.scale.setScalar(m.scale * (1 + 0.08 * pulse));
          g.mesh.rotation.z = m.rot;
          g.mesh.material.opacity = m.opacity;
        });
        small.flat().forEach((g, i) => {
          const m = glyphMotion(smallRt, { ...g, index: i }, small.flat().length, t, 0.015);
          g.mesh.position.set(g.x + m.dx, g.y + m.dy, 0);
          g.mesh.scale.setScalar(m.scale);
          g.mesh.material.opacity = m.opacity;
        });
      },
      readable: () => [Math.max(settledAt(rt, kw.length, STAGGER), rt.showFrom + 0.5, settledAt(smallRt, small.flat().length, 0.015)), rt.exitAt],
    };
  },
};
