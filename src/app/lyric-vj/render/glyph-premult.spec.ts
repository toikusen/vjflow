import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { premultGlyph } from './glyphs';
import { matchGlyphPicture, unpremultiply } from './material-patch';

// sRGB transfer, as the GPU's decode and three's sRGBTransferEOTF
const dec = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const q = (v: number) => Math.round(v * 255) / 255; // 8-bit texels

describe('premultiplied glyph pictures (2026-11-15: straight alpha ran a stroke edge toward black)', () => {
  // an edge between a stroke texel (light ink, full coverage) and a clear one; the sample lands at `f` toward the stroke
  const ink = [0xdc / 255, 0xcf / 255, 0xea / 255];
  const lum = (c: number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

  it('a filtered edge of a light ink on a clear neighbour is the ink at that coverage, never darker', () => {
    for (const f of [0.5, 0.6, 0.75, 0.9]) {
      // before: straight rgb, decoded per texel then filtered with the clear texel's black
      const straight = ink.map((c) => f * dec(q(c)) + (1 - f) * 0);
      // now: premultiplied sRGB texels filtered, the shader divides alpha out and decodes (material-patch unpremultiply)
      const premult = ink.map((c) => f * q(c) + (1 - f) * 0);
      const now = premult.map((c) => dec(c / f));
      const want = ink.map((c) => dec(q(c)));
      now.forEach((c, k) => expect(c).toBeCloseTo(want[k], 3));
      // drawn at coverage f over a black ground: the ink × coverage; straight alpha drew less
      expect(lum(now) * f).toBeGreaterThanOrEqual(lum(want) * f - 1e-6);
      expect(lum(straight) * f).toBeLessThan(lum(want) * f * 0.95);
    }
  });

  it('a glyph picture is premultiplied and undecoded, and every material showing one divides it back out', () => {
    const tex = premultGlyph(new THREE.Texture());
    expect([tex.premultiplyAlpha, tex.colorSpace, tex.userData['premult']]).toEqual([true, THREE.NoColorSpace, true]);
    const m = new THREE.MeshBasicMaterial({ map: tex });
    matchGlyphPicture(m);
    const shader = { uniforms: {}, fragmentShader: 'void main() {\n#include <map_fragment>\n}', vertexShader: '' };
    m.onBeforeCompile(shader as never, undefined as never);
    expect(shader.fragmentShader).toContain('sampledDiffuseColor.rgb / sampledDiffuseColor.a');
    expect(shader.fragmentShader).toContain('sRGBTransferEOTF');
    // (a picture that is not a glyph's is left alone)
    const other = new THREE.MeshBasicMaterial({ map: new THREE.Texture() });
    matchGlyphPicture(other);
    expect(other.userData['patches']).toBeUndefined();
    expect(typeof unpremultiply).toBe('function');
  });
});
