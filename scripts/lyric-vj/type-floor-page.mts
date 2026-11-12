// The type-floor scan's page side (type-floor-scan.mts), bundled and added before the render page's own scripts: every
// lyric glyph the engine draws at a moment, its size as drawn on the 1920 frame. A glyph mesh carries the size its picture
// was made at (glyphs.ts userData.size, the typesetter's particle scale included) and the row's own type size
// (userData.set, before that scale); the world scale of the mesh takes both to frame px (the pose, the block, the frame
// fit, the camera). Only what is visible at the moment is read.
import * as THREE from 'three';

type Obj = THREE.Object3D & { isMesh?: boolean };
interface Read { set: number; drawn: number; decor: boolean }
const v = new THREE.Vector3();
const visible = (o: Obj | null) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
const decorOf = (o: Obj, stop: Obj) => { for (let p: Obj | null = o; p && p !== stop; p = p.parent) if (p.userData?.['decor']) return true; return false; };

/** Every visible glyph under `root`, sizes in frame px. */
function glyphsIn(root: Obj | undefined): Read[] {
  if (!root || !visible(root)) return [];
  root.updateMatrixWorld(true);
  const out: Read[] = [];
  root.traverse((o: Obj) => {
    if (!o.isMesh || !o.userData?.['size'] || !visible(o)) return;
    const s = Math.abs(o.getWorldScale(v).x);
    out.push({ set: (o.userData['set'] ?? o.userData['size']) * s, drawn: o.userData['size'] * s, decor: decorOf(o, root) });
  });
  return out;
}

type Engine = { cueLayers: { rt: { cue: { id: string } }; layer: { group: Obj }; fit?: Obj; twin?: { fit: Obj } }[]; callLayers: { rt: { cue: { id: string } }; group: Obj }[]; updateCues(t: number, fx: { flash: number; hit: number; shake: number }): void };
const w = window as unknown as { vjEngine: Engine; floorScan: unknown };

/**
 * One line at moment t: the engine's own per-frame update of its lines is run there (updateCues: the frame fit, the drift,
 * a text camera, each line's own pose, beat and camera; no frame is drawn), then the line's glyphs are read: its fitted
 * group and its other-ink twin, whichever is shown. Its calls are read at the size they are set at (their pop is motion).
 * Sizes rounded to 0.1 px.
 */
function at(id: string, t: number) {
  const e = w.vjEngine;
  e.updateCues(t, { flash: 0, hit: 0, shake: 0 });
  const r = (xs: Read[]) => xs.map((x) => ({ set: Math.round(x.set * 10) / 10, drawn: Math.round(x.drawn * 10) / 10, decor: x.decor }));
  const own = e.cueLayers.filter((c) => c.rt.cue.id === id);
  const calls: Read[] = [];
  for (const c of e.callLayers.filter((x) => x.rt.cue.id === id)) c.group.traverse((o: Obj) => { if (o.isMesh && o.userData?.['size']) calls.push({ set: o.userData['set'] ?? o.userData['size'], drawn: o.userData['size'], decor: false }); });
  return { line: r(own.flatMap((c) => [...glyphsIn(c.fit ?? c.layer.group), ...glyphsIn(c.twin?.fit)])), calls: r(calls) };
}
w.floorScan = { at };
