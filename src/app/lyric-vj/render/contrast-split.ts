// A line across a boundary: one off-square edge divides the backdrop and turns the letters to the other ink where they
// cross it, so the same edge is both picture and type. The boundary is still for all of the reading.
import * as THREE from 'three';
import { cutPieces } from './beat-cut';
import { fitRows, rowTargets } from './build-rows';
import { advanceOf, clamp01, Glyph, GlyphStyle, hash, makeGlyphs, placeRow } from './glyphs';
import { faceMap } from './lyric-carrier';
import { color, CueLayer, CueRuntime, FrameFx, readable, songVary, tagSource, TemplateRenderer } from './runtime';
import { boundaryAt, halfPlaneOf, halfPolygon, seatBoundary } from './shared-mask';

const LAND_SEC = 0.4;

/** The shadow an edge throws: dark at the cut, nothing a hand's width off. */
const edgeShade = () => {
  const c = new OffscreenCanvas(4, 46);
  const g = c.getContext('2d')!;
  const f = g.createLinearGradient(0, 46, 0, 0);
  f.addColorStop(0, 'rgba(0,0,0,0.3)');
  f.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = f;
  g.fillRect(0, 0, 4, 46);
  return new THREE.CanvasTexture(c as unknown as HTMLCanvasElement);
};

export const contrastSplit: TemplateRenderer = {
  cue(rt: CueRuntime): CueLayer {
    const text = rt.cue.text.trim();
    const family = rt.fonts.display;
    const probe: GlyphStyle = { family, weight: 900, size: 200 };
    const all = cutPieces(text);
    const two = [...text].length > 6 && all.length > 1;
    const half = Math.ceil(all.length / 2);
    const rows = two ? [{ text: all.slice(0, half).map((p) => p.text).join(''), from: 0 }, { text: all.slice(half).map((p) => p.text).join(''), from: all[half]?.from ?? 0 }].filter((r) => r.text) : [{ text, from: 0 }];
    const widths = rows.map((r) => [...r.text].reduce((w, c) => w + advanceOf(c, probe), 0) || 1);
    const sizes = fitRows(widths, widths.indexOf(Math.max(...widths)), 0.9);
    const ys = rowTargets(sizes, rows.length);
    const group = new THREE.Group();
    const seed = Math.abs(Math.floor(hash(rt.cue.start, 37) * 1000) + (rt.song ?? 0));
    const ink = rt.palette.text;
    const onInk = readable(rt.palette.background, ink, 7);
    const glyphs: Glyph[] = [];
    const blockW = Math.max(...widths.map((w, i) => (w * sizes[i]) / 200));
    // the printed half is a cut sheet of the same paper: it lies on the other half and throws a shadow along the one edge
    const paint = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ map: faceMap([[-1300, -860], [1300, -860], [1300, 860], [-1300, 860]], ink, 'fibre'), transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
    paint.userData['noVeil'] = true;
    paint.renderOrder = -6;
    paint.frustumCulled = false;
    const seam = new THREE.Group();
    const edge = new THREE.Mesh(new THREE.PlaneGeometry(6000, 46), new THREE.MeshBasicMaterial({ map: edgeShade(), transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
    edge.position.y = 23;
    edge.renderOrder = -7;
    const fine = new THREE.Mesh(new THREE.PlaneGeometry(6000, 1.6), new THREE.MeshBasicMaterial({ color: color(onInk, 1), transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
    fine.position.y = -songVary(rt, 'split.line', 12, 22);
    fine.renderOrder = -5;
    seam.add(edge, fine);
    edge.userData['noVeil'] = fine.userData['noVeil'] = true;
    edge.frustumCulled = fine.frustumCulled = false;
    const holder = new THREE.Group();
    holder.userData['decor'] = true;
    holder.add(paint, seam);
    group.add(holder);
    rows.forEach((r, k) => {
      const gs = makeGlyphs(r.text, { family, weight: 900, size: sizes[k] }, color(ink, 1));
      placeRow(gs, 0, 0);
      tagSource(gs, text, r.from);
      gs.forEach((g) => {
        g.mesh.position.set(g.x, ys[k] + g.y, 0);
        group.add(g.mesh);
      });
      glyphs.push(...gs);
    });
    const rest = seatBoundary({ x0: -blockW / 2, x1: blockW / 2, y: 0 }, seed, songVary(rt, 'split.lean', 0.75, 1.3));
    const onPaper = new THREE.Plane();
    const onPaint = new THREE.Plane();
    const twins = glyphs.map((g) => {
      const tw = new THREE.Mesh(g.mesh.geometry, new THREE.MeshBasicMaterial({ map: g.mesh.material.map, color: color(onInk, 1), transparent: true, depthTest: false, depthWrite: false }));
      tw.material.clippingPlanes = [onPaint];
      g.mesh.add(tw);
      g.mesh.material.clippingPlanes = [onPaper];
      return tw;
    });
    const land = rt.rushed ? 0.02 : LAND_SEC * rt.pace;
    const times = { show: rt.showFrom, landSec: land, exitAt: rt.exitAt, exitDur: rt.exitDur };
    const set = (b: { x: number; y: number; angle: number }) => {
      const pts = halfPolygon(b).map(([x, y]) => new THREE.Vector3(x, y, 0));
      paint.geometry.setFromPoints([pts[0], pts[1], pts[2], pts[0], pts[2], pts[3]]);
      paint.geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([pts[0], pts[1], pts[2], pts[0], pts[2], pts[3]].flatMap((v) => [v.x, v.y])), 2));
      seam.position.set(b.x, b.y, 0);
      seam.rotation.z = b.angle;
      // planes are in world px and the type layer sways: the boundary is carried through the group's transform
      group.updateWorldMatrix(true, false);
      const h = halfPlaneOf(b);
      const n = new THREE.Vector3(h.nx, h.ny, 0).transformDirection(group.matrixWorld);
      const p = group.localToWorld(new THREE.Vector3(b.x, b.y, 0));
      onPaint.setFromNormalAndCoplanarPoint(n, p);
      onPaper.setFromNormalAndCoplanarPoint(n.clone().negate(), p);
    };
    return {
      group,
      framed: true,
      update(t: number, _fx: FrameFx) {
        set(boundaryAt(rest, t, times, 2200));
        const a = t < rt.showFrom ? 0 : 1 - clamp01((t - rt.exitAt) / Math.max(0.05, rt.exitDur));
        paint.material.opacity = t < rt.showFrom ? 0 : 1;
        seam.visible = t >= rt.showFrom;
        glyphs.forEach((g, i) => {
          g.mesh.material.opacity = a;
          twins[i].material.opacity = a;
        });
      },
      readable: () => [rt.showFrom + land, rt.exitAt],
    };
  },
};
