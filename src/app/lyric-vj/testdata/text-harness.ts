// Test-only: a template stand-in for the drawn text effects (text-fx.ts) and a record of what a frame shows.
import * as THREE from 'three';
import type { CueStyle } from '../treatment';
import type { CueLayer, CueRuntime } from '../render/runtime';

export const TEXT = 'abcd';
export const fx = { flash: 0, hit: 0, shake: 0 };

/** A template that sets its glyphs in a row each frame, sliding right (so a trail has motion to follow). */
export function layer(): CueLayer {
  const group = new THREE.Group();
  const meshes = [...TEXT].map((char, i) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(30, 40), new THREE.MeshBasicMaterial({ map: Object.assign(new THREE.Texture({ width: 30, height: 40 } as unknown as HTMLImageElement), { name: char }), transparent: true }));
    m.userData['glyph'] = { char, index: i, src: i, advance: 30, x: i * 50, y: 0 };
    m.userData['style'] = { size: 40, family: 'x', weight: 700 };
    group.add(m);
    return m;
  });
  return {
    group,
    readable: () => [1.6, 3],
    update: (t) =>
      meshes.forEach((m, i) => {
        m.position.set(i * 50 + Math.max(0, 1.6 - t) * 300, 0, 0);
        m.scale.set(1, 1, 1);
        m.material.opacity = t >= 1 ? 1 : 0;
      }),
  };
}

export const runtime = (style: Partial<CueStyle>) =>
  ({ cue: { text: TEXT, start: 1, end: 3 }, style: { enter: 'cut', exit: 'fade', reveal: 'line', ...style }, showFrom: 1, exitAt: 3, exitDur: 0.5, pace: 1, palette: { accent: '#ff0000', background: '#000000', ink: '#ffffff' } }) as unknown as CueRuntime;

/** Everything a frame shows of the layer: per object, whether it is drawn, where, how opaque, and with what picture. */
export function scene(l: CueLayer): string[] {
  l.group.updateMatrixWorld(true);
  const out: string[] = [];
  l.group.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined;
    const seen = o.visible && (!m || m.opacity > 0.002);
    out.push(seen ? `${o.matrixWorld.elements.map((x) => x.toFixed(2)).join(',')}|${m ? `${m.opacity.toFixed(3)}|${m.map?.name ?? ''}` : ''}` : '-');
  });
  return out;
}

