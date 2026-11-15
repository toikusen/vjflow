import { describe, expect, it } from 'vitest';
import { isPartTexel, partOf, SURFACE_PARTS } from './surface-parts';
import { surfaceKey } from './world-glyph';

describe("a glyph material's declared parts (guard 2026-11-15: declared per material, never read off its colours)", () => {
  it('only a declared material has a part; gilt\'s pressed edge and the silhouette are the letter\'s own shape (extrude)', () => {
    expect(partOf(surfaceKey({ kind: 'gilt', tint: '#c8a85a', core: '#160a0e', eaten: false }))).toEqual({ tint: '#c8a85a', colour: '#160a0e', role: 'extrude' });
    expect(partOf(surfaceKey({ kind: 'silhouette', tint: '#f6e7c8', core: '#2a1d14', eaten: false }))?.role).toBe('extrude');
    expect(partOf(surfaceKey({ kind: 'tape', tint: '#ffffff', core: '#000000', eaten: false }))).toBeUndefined();
    expect(partOf(undefined)).toBeUndefined();
    for (const parts of Object.values(SURFACE_PARTS)) for (const p of parts) expect(['outline', 'extrude', 'ground']).toContain(p.role);
  });

  it('a texel is the part where it is nearer the part than the ink, as the mask shader splits it', () => {
    expect(isPartTexel([0.17, 0.12, 0.08], '#f6e7c8', '#2a1d14')).toBe(true);
    expect(isPartTexel([0.95, 0.9, 0.78], '#f6e7c8', '#2a1d14')).toBe(false);
  });
});
