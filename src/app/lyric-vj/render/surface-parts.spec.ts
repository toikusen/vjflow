import { describe, expect, it } from 'vitest';
import { isPartTexel, partOf, SURFACE_PARTS } from './surface-parts';
import { surfaceKey } from './world-glyph';

describe("a glyph material's declared parts (guard 2026-11-15: declared per material, never read off its colours)", () => {
  it('only a declared material has a part; gilt\'s pressed edge is ground, the silhouette is the keyline', () => {
    expect(partOf(surfaceKey({ kind: 'gilt', tint: '#c8a85a', core: '#f3ead8', eaten: false }))).toEqual({ tint: '#c8a85a', colour: '#f3ead8', role: 'ground' });
    expect(partOf(surfaceKey({ kind: 'silhouette', tint: '#f6e7c8', core: '#2a1d14', eaten: false }))?.role).toBe('outline');
    expect(partOf(surfaceKey({ kind: 'tape', tint: '#ffffff', core: '#000000', eaten: false }))).toBeUndefined();
    expect(partOf(undefined)).toBeUndefined();
    for (const parts of Object.values(SURFACE_PARTS)) for (const p of parts) expect(['outline', 'ground']).toContain(p.role);
  });

  it('a texel is the part where it is nearer the part than the ink, as the mask shader splits it', () => {
    expect(isPartTexel([0.17, 0.12, 0.08], '#f6e7c8', '#2a1d14')).toBe(true);
    expect(isPartTexel([0.95, 0.9, 0.78], '#f6e7c8', '#2a1d14')).toBe(false);
  });
});
