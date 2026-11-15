// The parts a world's glyph material paints into a glyph's own picture besides its ink (ruling 2026-11-13 §1, guard of
// 2026-11-15): declared per material here, never inferred from the colours a picture happens to hold. A part is
// - 'outline': a keyline the face is read against (it reads ≥ 4.5 against the face per pixel, and where it breaks the face
//   is read against what shows through: the gate's own outline rule, ink-verify reduceGlyphs);
// - 'ground': a part that separates nothing (a pressed edge or a shadow in the paper's own tone): not the face, read as
//   the ground the face stands on.
// A texel is a part where it is nearer the part's colour than the ink (isPartTexel); everything else is face.
import { parseSurface } from './world-glyph';

export type SurfacePartRole = 'outline' | 'ground';
/** Per surface kind: which colour of its key is a part, and its role. */
export const SURFACE_PARTS: Record<string, { from: 'core'; role: SurfacePartRole }[]> = {
  // gothic-lolita: leaf on a tooled ground, its pressed edge drawn in the core, the ground's own colour
  gilt: [{ from: 'core', role: 'ground' }],
  // paper-lantern: a dark shape between two lit layers, light wrapping round it: the shape is the letter's keyline
  silhouette: [{ from: 'core', role: 'outline' }],
  // chiyogami: the pressed shadow on the paper below the print
  foil: [{ from: 'core', role: 'ground' }],
  // papercut: the sheet's own edge shadowing a hole's upper left
  'cut-hole': [{ from: 'core', role: 'ground' }],
};

/** A glyph picture's declared part from its surface key (`kind|tint|core|eaten`), if its material declares one. */
export function partOf(surface: string | undefined): { tint: string; colour: string; role: SurfacePartRole } | undefined {
  if (!surface) return undefined;
  const s = parseSurface(surface);
  const d = SURFACE_PARTS[s.kind]?.[0];
  return d && /^#[0-9a-f]{6}$/i.test(s.tint) && /^#[0-9a-f]{6}$/i.test(s.core) ? { tint: s.tint, colour: s.core, role: d.role } : undefined;
}

const rgb = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16) / 255);
/** Whether a texel (sRGB 0..1) is the declared part rather than the ink: nearer the part's colour. Mirrors MASK's GLSL. */
export function isPartTexel(texel: number[], tint: string, part: string): boolean {
  const d = (c: number[]) => texel.reduce((s, v, k) => s + (v - c[k]) ** 2, 0);
  return d(rgb(part)) < d(rgb(tint));
}
