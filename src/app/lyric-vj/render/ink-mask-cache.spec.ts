import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { idMaterialOf } from './ink-mask';

describe("the ink gate's ID materials (Codex 2026-11-16 P2)", () => {
  it('are kept per source material, ID and split, and released when their source is disposed', () => {
    const src = new THREE.MeshBasicMaterial({ map: new THREE.Texture() });
    const a = idMaterialOf(src, 5);
    expect(idMaterialOf(src, 5)).toBe(a);
    expect(idMaterialOf(src, 6)).not.toBe(a);
    let released = 0;
    a.addEventListener('dispose', () => released++);
    src.dispose();
    expect(released).toBe(1);
    // (made again after its source came back into use)
    expect(idMaterialOf(src, 5)).not.toBe(a);
  });
});
