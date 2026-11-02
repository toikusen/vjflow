// A line set on its own piece of paper: paper and letters share one group, one pivot and one mask, so whatever moves or
// reveals the paper carries the words with it. buildCarrier is the shared base; lyricCarrier the plain tag laid on it,
// and the other papers are in carrier-family.ts.
import * as THREE from 'three';
import { cutPieces } from './beat-cut';
import { CarrierBox, carrierPad, hangBox, hangPad, paperPose, plainBox, Pt, tagBox, evenPad, PaperPose } from './carrier-shape';
import { CARRIER_SEC, CarrierEnter, foldCuts, foldPanels, foldPlace, hangPose, tailSwing } from './carrier-moves';
import { advanceOf, clamp01, Glyph, GlyphStyle, hash, makeGlyphs, placeRow } from './glyphs';
import { lampsLit, lampSpans, tilePose, tilesOf } from './line-exit';
import { contactShadow, insetOutline, mixHex, roughEdge } from './material';
import { FaceOptions, paintFace, paintShadow, sheetSeed } from './paper-surface';
import { color, CueLayer, CueRuntime, emphasisOf, FrameFx, readable, songVary, tagSource, TemplateRenderer } from './runtime';

const W = 1920;
const H = 1080;
const LAND_SEC = 0.32;
const MAX_SIZE = 230;

type PaperMesh = THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;

type Surface = 'fibre' | 'weave';
const hexOf = (c: THREE.ColorRepresentation) => `#${new THREE.Color(c).getHexString()}`;

/** The texture of a face cut to `outline`: the paper's px are the mesh's own, so a fold can share it panel by panel. */
export function faceMap(outline: Pt[], tint: THREE.ColorRepresentation, surface: Surface, o: Partial<FaceOptions> = {}) {
  const xs = outline.map((p) => p[0]);
  const ys = outline.map((p) => p[1]);
  const [x0, y0] = [Math.floor(Math.min(...xs)) - 4, Math.floor(Math.min(...ys)) - 4];
  const [w, h] = [Math.ceil(Math.max(...xs)) + 4 - x0, Math.ceil(Math.max(...ys)) + 4 - y0];
  const scale = Math.min(1, 3200 / Math.max(w, h));
  const map = new THREE.CanvasTexture(paintFace(outline, { x0, y0, w, h }, { seed: sheetSeed(), fill: hexOf(tint), weave: surface === 'weave', ...o }, scale) as unknown as HTMLCanvasElement);
  map.colorSpace = THREE.SRGBColorSpace;
  // ShapeGeometry's uvs are sheet px
  map.repeat.set(1 / w, 1 / h);
  map.offset.set(-x0 / w, -y0 / h);
  map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
  map.generateMipmaps = false;
  map.minFilter = THREE.LinearFilter;
  return map;
}

/** A shape in its own colour; given a surface it is cut from the song's sheet (paper-surface.ts) and its tint is in the face. */
export function outlineMesh(outline: Pt[], tint: THREE.ColorRepresentation, surface?: Surface, holes: Pt[] = [], holeR = 0, face: Partial<FaceOptions> = {}): PaperMesh {
  const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const [x, y] of holes) shape.holes.push(new THREE.Path().absarc(x, y, holeR, 0, Math.PI * 2, true));
  const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape, 16), new THREE.MeshBasicMaterial({ color: surface ? 0xffffff : tint, map: surface ? faceMap(outline, tint, surface, face) : null, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
  mesh.userData['noVeil'] = true;
  mesh.frustumCulled = false;
  return mesh;
}

/** The soft shadow a shape throws on what is under it, one light for the whole song. */
export function shadowMesh(outline: Pt[], lift: number): PaperMesh {
  const s = paintShadow(outline, lift);
  const map = new THREE.CanvasTexture(s.canvas as unknown as HTMLCanvasElement);
  map.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.h) as THREE.BufferGeometry, new THREE.MeshBasicMaterial({ map, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
  const at = contactShadow(lift);
  mesh.position.set(s.x0 + s.w / 2 + at.dx, s.y0 + s.h / 2 - at.dy, 0);
  mesh.userData['noVeil'] = true;
  mesh.frustumCulled = false;
  return mesh;
}

export const rectMesh = (x0: number, y0: number, x1: number, y1: number, tint: THREE.ColorRepresentation, surface?: Surface, face?: Partial<FaceOptions>) => outlineMesh([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], tint, surface, [], 0, face);

/** A strip of cloth between two points. */
export function strapMesh(a: Pt, b: Pt, width: number, tint: THREE.ColorRepresentation): PaperMesh {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const len = Math.hypot(dx, dy) || 1;
  const [nx, ny] = [(-dy / len) * (width / 2), (dx / len) * (width / 2)];
  return outlineMesh([[a[0] - nx, a[1] - ny], [b[0] - nx, b[1] - ny], [b[0] + nx, b[1] + ny], [a[0] + nx, a[1] + ny]], tint, 'weave');
}

export interface CarrierOptions {
  shape?: (w: number, h: number, seed: number, size: number) => CarrierBox;
  pad?: (size: number, side: number) => { top: number; bottom: number; left: number; right: number };
  /** The share of the frame's height the paper may take, and in type sizes what must fit above it. */
  height?: number;
  above?: number;
  /** Which of the song's papers: its dark ink, the pale stock, or a stock tinted with the accent. Unset: chosen by the song. */
  stock?: Stock;
  /** Lines printed on the paper, ruled to the type's rows: y's in sheet px, given the zone. */
  rules?: (zone: Carrier['zone'], rowH: number, rows: number) => [number, number, number, number][];
  /** The type's weight on this paper. */
  weight?: number;
  /** How far it stands off what is under it, px. */
  lift?: number;
  /** The paper runs past the frame on purpose: it does not count as the line's box. */
  bleeds?: boolean;
}

export type Stock = 'ink' | 'pale' | 'tinted';

/** The stock's face and what is printed on it. The pale papers do not change with the type's two builds: paper is paper on any ground. */
export function stockOf(rt: CueRuntime, stock: Stock) {
  const [text, ground] = [rt.palette.text, rt.palette.background];
  if (stock === 'ink') return { face: text, words: readable(ground, text, 7), key: readable(rt.palette.accent, text, 4.5), tone: 'dark' };
  const [light, dark] = lum(text) > lum(ground) ? [text, ground] : [ground, text];
  const face = stock === 'pale' ? mixHex(light, '#ffffff', 0.55) : mixHex(mixHex(light, '#ffffff', 0.3), rt.palette.accent, 0.2);
  return { face, words: readable(dark, face, 7), key: readable(rt.palette.accent, face, 4.5), tone: 'light' };
}
const lum = (hex: string) => { const n = parseInt(hex.slice(1, 7), 16); return 0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255); };

export interface Carrier {
  /** Everything on the paper; moves as one. */
  sheet: THREE.Group;
  box: CarrierBox;
  glyphs: Glyph[];
  /** Shows only what lies between lo and hi (sheet px along an axis): the shared reveal for paper and letters. */
  window(lo: number, hi: number, axis?: 'x' | 'y'): void;
  unmask(): void;
  /** Paper, shadow and letters with their full strength noted, and whatever else was adopted: the shared fade. */
  fade(a: number): void;
  /** Puts something on the sheet that moves and fades with it but is not masked with the paper. */
  adopt(m: PaperMesh, full?: number): void;
  paper: PaperMesh;
  shadow: PaperMesh;
  rows: number;
  size: number;
  /** The paper's own face and inks. */
  face: string;
  words: string;
  key: string;
  outline: Pt[];
  /** Where the words sit on the sheet: the reading area. */
  zone: { x0: number; y0: number; x1: number; y1: number };
}

/** A line on a sheet: the shared base of every carrier, with its rows left aligned on the paper's wider margin. */
export function buildCarrier(rt: CueRuntime, seed: number, o: CarrierOptions = {}): Carrier {
  const text = rt.cue.text.trim();
  const family = rt.fonts.display;
  const weight = o.weight ?? 900;
  const probe: GlyphStyle = { family, weight, size: 200 };
  const pieces = cutPieces(text);
  const long = [...text].length > 9 && pieces.length > 1;
  const half = [...text].length / 2;
  const cut = pieces.reduce((best, p) => (Math.abs(p.from - half) < Math.abs(best - half) ? p.from : best), pieces.at(-1)!.from);
  const rows = long && cut > 0 ? [{ text: [...text].slice(0, cut).join('').trim(), from: 0 }, { text: [...text].slice(cut).join('').trim(), from: cut }] : [{ text, from: 0 }];
  const widths = rows.map((r) => [...r.text].reduce((w, c) => w + advanceOf(c, probe), 0) || 1);
  const side = seed % 2 ? 1 : -1;
  const padOf = o.pad ?? carrierPad;
  const unit = padOf(1, side);
  // the paper's margins grow with the type, so the size comes from the paper's total width and height
  const size = Math.min(MAX_SIZE, Math.round((W * 0.8) / (Math.max(...widths) / 200 + unit.left + unit.right)), Math.round((H * (o.height ?? 0.7)) / (rows.length * 1.12 + unit.top + unit.bottom + (o.above ?? 0))));
  const pad = padOf(size, side);
  const rowW = Math.max(...widths) * (size / 200);
  const rowH = size * 1.12;
  const box = (o.shape ?? tagBox)(Math.round(rowW + pad.left + pad.right), Math.round(rows.length * rowH + pad.top + pad.bottom), seed, size);
  const sheet = new THREE.Group();
  const outline = roughEdge(box.outline, seed, songVary(rt, 'paper.rough', 1, 2.4), 46);
  const shadow = shadowMesh(outline, o.lift ?? Math.max(10, size * 0.09));
  shadow.renderOrder = -6;
  // a song leans to one stock of paper; which line takes it is the line's
  const stock = o.stock ?? (songVary(rt, 'paper.stock', 0, 1) + hash(seed, 3) * 0.6 > 0.95 ? 'ink' : 'tinted');
  const inks = stockOf(rt, stock);
  const zoneOf = { x0: -box.w / 2 + pad.left, y0: -box.h / 2 + pad.bottom, x1: box.w / 2 - pad.right, y1: box.h / 2 - pad.top };
  const paper = outlineMesh(outline, inks.face, 'fibre', box.holes, box.holeR, { line: { path: insetOutline(box.outline, Math.max(9, size * 0.075)), color: inks.words, alpha: inks.tone === 'dark' ? 0.34 : 0.3 }, rules: o.rules ? { lines: o.rules(zoneOf, rowH, rows.length), color: inks.words, alpha: 0.2 } : undefined });
  paper.renderOrder = -5;
  // the frame fit reads decor off a mesh's parents, so a bleeding paper sits in a group of its own
  const ground = new THREE.Group();
  ground.userData['decor'] = !!o.bleeds;
  // a shadow is no part of the line's box
  const cast = new THREE.Group();
  cast.userData['decor'] = true;
  cast.add(shadow);
  ground.add(cast, paper);
  sheet.add(ground);
  const [words, key] = [inks.words, inks.key];
  const x0 = zoneOf.x0;
  const zone = zoneOf;
  // a key word set off from the rest; a whole line in the accent sets nothing off
  const partial = [...text].some((c, i) => !/\s/.test(c) && !emphasisOf(rt, i));
  const glyphs = rows.flatMap((r, k) => {
    const gs = makeGlyphs(r.text, { family, weight, size }, color(words, 1));
    placeRow(gs, 0, 0);
    tagSource(gs, text, r.from);
    const left = Math.min(...gs.map((g) => g.x - g.advance / 2));
    const y = zone.y1 - rowH * (k + 0.5);
    gs.forEach((g) => {
      g.mesh.position.set(x0 + (g.x - left), y, 0);
      if (partial && g.src !== undefined && emphasisOf(rt, g.src)) g.mesh.material.color.copy(color(key, 1));
      // the paper is the letters' ground: a keyline on the backdrop would only show past the paper's edge
      g.mesh.userData['noVeil'] = true;
      sheet.add(g.mesh);
    });
    return gs;
  });
  const glyphMats = glyphs.map((g) => g.mesh.material);
  const mats: { m: THREE.Material; full: number }[] = [shadow.material, paper.material, ...glyphMats].map((m) => ({ m, full: m.opacity }));
  const clipped: THREE.Material[] = mats.map((x) => x.m);
  const planes = [new THREE.Plane(), new THREE.Plane()];
  const [a, b] = [new THREE.Vector3(), new THREE.Vector3()];
  const n = new THREE.Vector3();
  return {
    sheet, box, glyphs, zone, paper, shadow, rows: rows.length, size, face: inks.face, words, key, outline,
    window(lo, hi, axis = 'x') {
      sheet.updateWorldMatrix(true, false);
      sheet.localToWorld(axis === 'x' ? a.set(lo, 0, 0) : a.set(0, lo, 0));
      sheet.localToWorld(axis === 'x' ? b.set(Math.max(hi, lo + 0.01), 0, 0) : b.set(0, Math.max(hi, lo + 0.01), 0));
      n.copy(b).sub(a).normalize();
      planes[0].setFromNormalAndCoplanarPoint(n, a);
      planes[1].setFromNormalAndCoplanarPoint(n.clone().negate(), b);
      for (const m of clipped) if (!m.clippingPlanes?.includes(planes[0])) m.clippingPlanes = [...(m.clippingPlanes ?? []), ...planes];
    },
    // only its own planes go: a handoff may be clipping the same paper
    unmask() {
      for (const m of clipped) if (m.clippingPlanes?.includes(planes[0])) m.clippingPlanes = m.clippingPlanes.filter((p) => !planes.includes(p));
    },
    fade(alpha) {
      for (const { m, full } of mats) m.opacity = full * alpha;
    },
    adopt(mesh, full = 1) {
      mesh.material.opacity = full;
      sheet.add(mesh);
      mats.push({ m: mesh.material, full });
    },
  };
}

/**
 * tile-scatter: the paper and what is printed on it cut into a few large pieces, which leave from a point off the middle.
 * Each piece is the sheet again, clipped to itself, so nothing is cut until the reading is over.
 */
export function tileScatter(c: Carrier, rt: CueRuntime) {
  const seed = seedOf(rt, 59);
  const tiles = rt.style.exit === 'tile-scatter' ? tilesOf(c.box.w, c.box.h, seed) : [];
  const [fx, fy] = [(seed % 2 ? 1 : -1) * c.box.w * 0.2, (seed % 3 === 0 ? 1 : -1) * c.box.h * 0.2];
  const reach = songVary(rt, 'tiles.far', 1100, 1500);
  const made = tiles.map((tile) => {
    const group = new THREE.Group();
    const local = [new THREE.Plane(new THREE.Vector3(1, 0, 0), -tile.x0), new THREE.Plane(new THREE.Vector3(-1, 0, 0), tile.x1), new THREE.Plane(new THREE.Vector3(0, 1, 0), -tile.y0), new THREE.Plane(new THREE.Vector3(0, -1, 0), tile.y1)];
    const planes = local.map((p) => p.clone());
    const copy = (m: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>) => {
      const k = new THREE.Mesh(m.geometry, m.material.clone());
      k.position.copy(m.position);
      k.rotation.copy(m.rotation);
      k.scale.copy(m.scale);
      k.material.clippingPlanes = planes;
      k.renderOrder = m.renderOrder;
      k.userData['noVeil'] = true;
      group.add(k);
      return k;
    };
    const rect: Pt[] = [[tile.x0, tile.y0], [tile.x1, tile.y0], [tile.x1, tile.y1], [tile.x0, tile.y1]];
    const shade = shadowMesh(rect, 11);
    shade.renderOrder = -6;
    group.add(shade);
    const parts = [copy(c.paper), ...c.glyphs.map((g) => copy(g.mesh as unknown as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>))];
    group.visible = false;
    group.userData['decor'] = true;
    c.sheet.add(group);
    return { group, local, planes, parts, shade, cx: (tile.x0 + tile.x1) / 2, cy: (tile.y0 + tile.y1) / 2 };
  });
  const m = new THREE.Matrix4();
  return (t: number) => {
    const q = tiles.length ? clamp01((t - rt.exitAt) / Math.max(0.05, rt.exitDur)) : 0;
    const on = t > rt.exitAt && tiles.length > 0;
    made.forEach((p, i) => {
      p.group.visible = on;
      if (!on) return;
      const pose = tilePose(i, made.length, q, p.cx, p.cy, fx, fy, reach, seed);
      // about the piece's own middle, so it turns as it goes
      p.group.matrixAutoUpdate = false;
      p.group.matrix.makeTranslation(p.cx + pose.x, p.cy + pose.y, 0).multiply(m.makeRotationZ(pose.rot)).multiply(new THREE.Matrix4().makeTranslation(-p.cx, -p.cy, 0));
      p.group.matrixWorldNeedsUpdate = true;
      p.group.updateWorldMatrix(true, false);
      p.local.forEach((l, j) => p.planes[j].copy(l).applyMatrix4(p.group.matrixWorld));
      p.parts.forEach((x) => (x.material.opacity = pose.alpha));
      p.shade.material.opacity = pose.alpha;
    });
    // the sheet itself steps aside for its pieces
    if (tiles.length) {
      c.paper.visible = !on;
      c.shadow.visible = !on;
      for (const g of c.glyphs) g.mesh.visible = !on;
    }
  };
}

/** Lamps of uneven length running round just outside the paper's edge, on in fits and starts, then held. */
function lampRing(c: Carrier, rt: CueRuntime) {
  const seed = seedOf(rt, 73);
  const path = insetOutline(c.box.outline, -Math.max(12, c.size * 0.09));
  const closed = [...path, path[0]];
  const lens = closed.slice(1).map((p, i) => Math.hypot(p[0] - closed[i][0], p[1] - closed[i][1]));
  const total = lens.reduce((a, x) => a + x, 0);
  const at = (s: number): Pt => {
    let d = s * total;
    for (let i = 0; i < lens.length; i++) {
      if (d <= lens[i]) return [closed[i][0] + ((closed[i + 1][0] - closed[i][0]) * d) / lens[i], closed[i][1] + ((closed[i + 1][1] - closed[i][1]) * d) / lens[i]];
      d -= lens[i];
    }
    return closed[0];
  };
  const n = Math.round(songVary(rt, 'lamps.n', 18, 30));
  const spans = lampSpans(n, seed);
  const width = Math.max(3.5, c.size * songVary(rt, 'lamps.w', 0.022, 0.034));
  const STEPS = 6;
  const verts: number[] = [];
  const index: number[] = [];
  spans.forEach(([a, b]) => {
    for (let i = 0; i < STEPS; i++) {
      const [p, q] = [at(a + ((b - a) * i) / STEPS), at(a + ((b - a) * (i + 1)) / STEPS)];
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
      const [nx, ny] = [(-(q[1] - p[1]) / len) * (width / 2), ((q[0] - p[0]) / len) * (width / 2)];
      const base = verts.length / 3;
      verts.push(p[0] + nx, p[1] + ny, 0, p[0] - nx, p[1] - ny, 0, q[0] - nx, q[1] - ny, 0, q[0] + nx, q[1] + ny, 0);
      index.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
  g.setIndex(index);
  const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: readable(rt.palette.accent, rt.palette.background, 3), transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide })) as unknown as PaperMesh;
  mesh.userData['noVeil'] = true;
  mesh.userData['decor'] = true;
  mesh.frustumCulled = false;
  mesh.renderOrder = -4;
  c.adopt(mesh);
  return (k: number) => g.setDrawRange(0, lampsLit(n, k) * STEPS * 6);
}

/** The sheet at its pose, turned about the box's pivot, so it swings like something held at one end. */
export function poseSheet(c: Carrier, x: number, y: number, p: PaperPose) {
  const [px, py] = c.box.pivot;
  const [cs, sn] = [Math.cos(p.rot), Math.sin(p.rot)];
  c.sheet.position.set(x + p.x + px - (px * cs - py * sn) * p.scale, y + p.y + py - (px * sn + py * cs) * p.scale, 0);
  c.sheet.rotation.z = p.rot;
  c.sheet.scale.setScalar(p.scale);
}

export const seedOf = (rt: CueRuntime, salt = 29) => Math.abs(Math.floor(hash(rt.cue.start, salt) * 1000) + (rt.song ?? 0));

/** The paper's place: along the frame's width to the given side, and somewhere in its free height. */
export function placeOf(rt: CueRuntime, w: number, h: number, room = 0.7) {
  const side = rt.params['side'];
  return { x: side === 'center' ? 0 : (side === 'right' ? 1 : -1) * Math.max(0, (W * 0.92 - w) / 2), y: side === 'center' ? 0 : (hash(rt.cue.start, 31) - 0.5) * Math.max(0, H * room - h) };
}

/** When a carrier's entrance ends: its own length, or at once for a line that had to give the entrance up (or a handoff carried in). */
export const landOf = (rt: CueRuntime, kind: CarrierEnter) => (rt.style.enter === kind ? CARRIER_SEC[kind] * rt.pace : 0.02);

export const motionOf = (rt: CueRuntime, land: number) => ({ show: rt.showFrom, landSec: land, exitAt: rt.exitAt, exitDur: rt.exitDur, exit: rt.style.exit });

/** A tag hung from a strap: it drops and swings to rest, and only the strap's loose end stirs on while the line is read. */
function hungCard(rt: CueRuntime): CueLayer {
  const c = buildCarrier(rt, seedOf(rt), { pad: hangPad, shape: (w, h, s, size) => hangBox(w, h, s, size, songVary(rt, 'hang.strap', 0.8, 1.3)), above: 1.1, height: 0.76 });
  const group = new THREE.Group();
  group.add(c.sheet);
  const [peg, holes] = [c.box.pivot, c.box.holes ?? []];
  const cloth = color(readable(rt.palette.accent, rt.palette.background, 3), 1);
  const width = Math.max(14, c.size * songVary(rt, 'hang.width', 0.11, 0.18));
  holes.forEach((p) => {
    const strap = strapMesh(p, peg, width, cloth);
    strap.renderOrder = -4;
    c.adopt(strap);
  });
  const tail = strapMesh([0, 0], [0, -Math.max(46, c.size * songVary(rt, 'hang.tail', 0.3, 0.55))], width * 0.9, cloth);
  tail.position.set(peg[0], peg[1], 0);
  tail.renderOrder = -3;
  c.adopt(tail);
  const knot = outlineMesh(Array.from({ length: 12 }, (_, i) => [peg[0] + Math.cos((i * Math.PI) / 6) * width * 0.8, peg[1] + Math.sin((i * Math.PI) / 6) * width * 0.8] as Pt), color(rt.palette.text, 1));
  knot.renderOrder = -2;
  c.adopt(knot);
  const place = placeOf(rt, c.box.w, c.box.h, 0.5);
  const land = landOf(rt, 'tether-drop');
  const motion = motionOf(rt, land);
  const strapY = (peg[1] - c.box.h / 2) / 2;
  return {
    group,
    update(t: number, _fx: FrameFx) {
      const p = hangPose(t, motion, c.box.side);
      poseSheet(c, place.x, place.y - strapY, p);
      tail.rotation.z = tailSwing(t, rt.showFrom + land, c.box.side);
      c.fade(p.alpha);
    },
    readable: () => [rt.showFrom + land, rt.exitAt],
  };
}

/** A sheet folded like a screen: its panels open out flat, always hinged between characters, and fold up again to leave. */
function foldedSheet(rt: CueRuntime): CueLayer {
  const seed = seedOf(rt);
  const c = buildCarrier(rt, seed, { pad: (size) => evenPad(size), shape: plainBox, stock: 'tinted' });
  c.paper.visible = false;
  const group = new THREE.Group();
  group.add(c.sheet);
  const [bw, bh] = [c.box.w / 2, c.box.h / 2];
  const across = c.rows > 1;
  // one row folds between characters across the line, two between the rows, so a fold never lands on a character
  const rowGaps = [...new Set(c.glyphs.map((g) => Math.round(g.mesh.position.y)))].sort((a, b) => b - a);
  const gaps = across ? [(rowGaps[0] + rowGaps[1]) / 2, c.zone.y0] .map((y) => -y) : c.glyphs.slice(0, -1).map((g, i) => (g.mesh.position.x + c.glyphs[i + 1].mesh.position.x) / 2 + (g.advance - c.glyphs[i + 1].advance) / 4);
  const cuts = across ? [-bh, ...gaps.slice(0, 2), bh] : foldCuts(gaps, -bw, bw, seed);
  const panels = cuts.slice(0, -1).map((_, i) => {
    // the one face, shared panel by panel: a fold is the same paper either side of the crease
    const m = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(i % 2 ? 0.93 : 1), map: c.paper.material.map, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
    m.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
    m.geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(8), 2));
    m.geometry.setIndex([0, 1, 2, 0, 2, 3]);
    m.userData['noVeil'] = true;
    m.renderOrder = -5;
    m.frustumCulled = false;
    c.adopt(m);
    return m;
  });
  const rest = c.glyphs.map((g) => g.mesh.position.clone());
  const face = panels.map((m) => m.material.color.clone());
  const dark = new THREE.Color(0, 0, 0);
  const land = landOf(rt, 'fold-open');
  const folds = rt.planned?.enter === 'fold-open' || rt.style.exit === 'fold-close';
  const place = placeOf(rt, c.box.w, c.box.h);
  const lay = (open: number) => {
    const now = foldPanels(cuts, open);
    now.forEach((p, i) => {
      const pos = panels[i].geometry.getAttribute('position') as THREE.BufferAttribute;
      const uv = panels[i].geometry.getAttribute('uv') as THREE.BufferAttribute;
      const half = (across ? bw : bh);
      const corners: [number, number][] = [[p.from, -half - p.liftFrom], [p.to, -half - p.liftTo], [p.to, half + p.liftTo], [p.from, half + p.liftFrom]];
      corners.forEach(([along, side], k) => {
        const [x, y] = across ? [side, -along] : [along, side];
        pos.setXYZ(k, x, y, 0);
        uv.setXY(k, x, y);
      });
      pos.needsUpdate = uv.needsUpdate = true;
      panels[i].geometry.computeBoundingSphere();
      panels[i].material.color.copy(face[i]).lerp(dark, p.shade);
    });
    c.glyphs.forEach((g, i) => {
      const r = rest[i];
      const f = foldPlace(across ? -r.y : r.x, now);
      g.mesh.position.set(across ? r.x : f.at, across ? -f.at : r.y, 0);
      g.mesh.scale.set(across ? 1 : f.scale, across ? f.scale : 1, 1);
    });
    c.shadow.visible = open >= 1;
  };
  return {
    group,
    update(t: number, _fx: FrameFx) {
      const k = folds ? clamp01((t - rt.showFrom) / land) : 1;
      const close = rt.style.exit === 'fold-close' ? clamp01((t - rt.exitAt) / Math.max(0.05, rt.exitDur)) : 0;
      const eased = 1 - (1 - k) ** 2;
      poseSheet(c, place.x, place.y, { x: 0, y: 0, rot: 0, alpha: 1, open: 1, scale: 1 });
      lay(Math.min(eased, 1 - close * 0.985));
      const out = rt.style.exit === 'fold-close' ? 0 : clamp01((t - rt.exitAt) / Math.max(0.05, rt.exitDur));
      c.fade(t < rt.showFrom ? 0 : (1 - out) * (close > 0.8 ? (1 - close) / 0.2 : 1));
    },
    readable: () => [rt.showFrom + land, rt.exitAt],
  };
}

export const lyricCarrier: TemplateRenderer = {
  cue(rt: CueRuntime): CueLayer {
    if (rt.style.idle === 'tether-settle') return hungCard(rt);
    if (rt.planned?.enter === 'fold-open' || rt.style.exit === 'fold-close') return foldedSheet(rt);
    const c = buildCarrier(rt, seedOf(rt), { shape: (w, h, s, size) => tagBox(w, h, s, songVary(rt, 'tag.cut', 0.72, 1.34), songVary(rt, 'tag.lean', 0.8, 1.3), size * 0.85) });
    const group = new THREE.Group();
    group.add(c.sheet);
    const place = placeOf(rt, c.box.w, c.box.h);
    // a line swung in whole keeps its paper whole: its own unrolling would be a second entrance
    const running = rt.style.enter === 'frame-run';
    const land = (rt.style.enter === 'cut' && rt.rushed) || rt.planned?.enter === 'corner-land' || running ? 0.02 : LAND_SEC * rt.pace;
    const motion = motionOf(rt, land);
    const scatter = tileScatter(c, rt);
    const run = landOf(rt, 'frame-run');
    const lamps = rt.style.idle === 'frame-lights' ? lampRing(c, rt) : undefined;
    return {
      group,
      update(t: number, _fx: FrameFx) {
        const p = paperPose(t, motion, c.box.side);
        poseSheet(c, place.x, place.y, p);
        c.fade(p.alpha);
        scatter(t);
        lamps?.((t - rt.showFrom) / run);
        if (p.open >= 1) c.unmask();
        // the paper unrolls from the end it is held by
        else if (c.box.side > 0) c.window(c.box.w / 2 - c.box.w * p.open, 1e5);
        else c.window(-1e5, -c.box.w / 2 + c.box.w * p.open);
      },
      readable: () => [rt.showFrom + (running ? run : land), rt.exitAt],
    };
  },
};
