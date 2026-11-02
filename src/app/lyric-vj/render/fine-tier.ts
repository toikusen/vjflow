// The third size on the frame: a hairline hugging the line's block and, when it has one, a few small characters of real
// words at the rule's end (the song's title, the part, the line's own key phrase). Shown only with its line.
import * as THREE from 'three';
import type { FineTier } from '../treatment';
import { advanceOf, GlyphStyle, makeGlyphs } from './glyphs';
import { Box, finePlace } from './material';

const W = 1920;
const H = 1080;
export const FINE_SIZE = 30;

export interface FineLayer {
  group: THREE.Group;
  /** Sets it for this frame: `on` 0..1, in the ink that reads where it stands. */
  set(on: number, ink: THREE.Color): void;
}

const flat = (x0: number, y0: number, x1: number, y1: number) => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(1.4, Math.abs(x1 - x0)), Math.max(1.4, Math.abs(y1 - y0))), new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false }));
  m.position.set((x0 + x1) / 2 - W / 2, H / 2 - (y0 + y1) / 2, 0);
  m.userData['noVeil'] = true;
  return m;
};

/** The fine tier of a line whose block is `rect`, or nothing when the block leaves it no margin. `reach` and `end` are the song's. */
export function fineLayer(fine: FineTier, rect: Box, family: string, reach: number, end: 1 | -1): FineLayer | undefined {
  const style: GlyphStyle = { family, weight: 700, size: FINE_SIZE };
  const chars = [...fine.text];
  const space = 4;
  const len = chars.reduce((a, c) => a + advanceOf(c, style) + space, 0);
  const place = finePlace(rect, len, W, H, reach, end);
  if (!place) return undefined;
  const group = new THREE.Group();
  group.userData['decor'] = true;
  const [a, b, c, d] = place.rule;
  const rule = flat(a, b, c, d);
  group.add(rule);
  const tick = place.across ? flat(c - 0.7, d - 7, c + 0.7, d + 7) : flat(c - 7, d - 0.7, c + 7, d + 0.7);
  group.add(tick);
  const gs = chars.length ? makeGlyphs(fine.text, style, new THREE.Color(0xffffff)) : [];
  let run = 0;
  gs.forEach((g) => {
    const size = g.advance + space;
    const [px, py] = place.across ? [place.at[0] + (place.align > 0 ? run + size / 2 : -len + run + size / 2), place.at[1]] : [place.at[0], place.at[1] + run + FINE_SIZE / 2];
    g.mesh.position.set(px - W / 2, H / 2 - py, 0);
    g.mesh.userData['noVeil'] = true;
    run += place.across ? size : FINE_SIZE * 1.12;
    group.add(g.mesh);
  });
  const mats = [rule.material, tick.material, ...gs.map((g) => g.mesh.material)];
  return {
    group,
    set(on, ink) {
      group.visible = on > 0;
      mats.forEach((m, i) => {
        m.color.copy(ink);
        m.opacity = on * (i < 2 ? 0.8 : 1);
      });
    },
  };
}
