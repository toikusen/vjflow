// Paper as pixels: the one sheet a song is printed on, laid over its backdrop, and the same paper on anything cut from it.
// Made once per song seed; nothing here depends on time, so a frame can be drawn on its own.
import * as THREE from 'three';
import { contactShadow, fibres, mottle, Pt } from './material';

const TILE = 480;
const NOISE = 240;
type Tile = OffscreenCanvas;

const blank = (w: number, h: number): Tile => new OffscreenCanvas(Math.max(1, w), Math.max(1, h));

let song = 1;
/** The song's sheet: everything cut from paper this render is cut from this one. */
export const setSheet = (seed: number) => (song = Math.abs(seed) % 997);
export const sheetSeed = () => song;
const cache = new Map<number, { tone: Tile; hair: Tile }>();

/** The sheet's two passes: slow tone (mid grey, for soft-light) and fibre on transparent, both tiling. */
function sheetOf(seed: number) {
  const hit = cache.get(seed);
  if (hit) return hit;
  const tone = blank(NOISE, NOISE);
  const g = tone.getContext('2d')!;
  const px = g.createImageData(NOISE, NOISE);
  for (let y = 0; y < NOISE; y++)
    for (let x = 0; x < NOISE; x++) {
      const v = 128 + mottle(x / NOISE, y / NOISE, seed) * 110;
      px.data.set([v, v, v, 255], (y * NOISE + x) * 4);
    }
  g.putImageData(px, 0, 0);
  const hair = blank(TILE, TILE);
  const h = hair.getContext('2d')!;
  h.lineCap = 'round';
  for (const f of fibres(seed, 520, TILE, TILE)) {
    const [c, s] = [Math.cos(f.angle), Math.sin(f.angle)];
    h.strokeStyle = f.light ? `rgba(255,255,255,${f.alpha * 1.6})` : `rgba(40,30,20,${f.alpha * 0.7})`;
    h.lineWidth = 0.6 + f.alpha * 2;
    h.beginPath();
    h.moveTo(f.x - (c * f.length) / 2, f.y - (s * f.length) / 2);
    h.quadraticCurveTo(f.x - s * f.bow, f.y + c * f.bow, f.x + (c * f.length) / 2, f.y + (s * f.length) / 2);
    h.stroke();
  }
  // tooth: the speckle that stops a flat ink looking like a screen fill
  for (let i = 0; i < 26000; i++) {
    const a = fractOf(Math.sin(i * 12.9898 + seed) * 43758.5453);
    const b = fractOf(Math.sin(i * 78.233 + seed) * 12543.1234);
    h.fillStyle = i % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(30,20,10,0.045)';
    h.fillRect(a * TILE, b * TILE, 1.4, 1.4);
  }
  const made = { tone, hair };
  cache.set(seed, made);
  return made;
}
const fractOf = (x: number) => x - Math.floor(x);

/**
 * The sheet over everything already in the box: whatever was printed there takes the paper's patches and fibres. It is
 * in the box's own place, never the camera's: paper does not move when the picture does.
 */
export function drawSheet(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, seed: number, x: number, y: number, w: number, h: number, strength = 1) {
  const { tone, hair } = sheetOf(seed);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.globalCompositeOperation = 'soft-light';
  ctx.globalAlpha = 0.3 * strength;
  const tile = 2600;
  for (let i = Math.floor(x / tile); i * tile < x + w; i++) for (let j = Math.floor(y / tile); j * tile < y + h; j++) ctx.drawImage(tone, i * tile, j * tile, tile, tile);
  ctx.globalCompositeOperation = 'source-atop';
  ctx.globalAlpha = strength;
  for (let i = Math.floor(x / TILE); i * TILE < x + w; i++) for (let j = Math.floor(y / TILE); j * TILE < y + h; j++) ctx.drawImage(hair, i * TILE, j * TILE);
  ctx.restore();
}

export const pathOf = (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, o: Pt[]) => {
  ctx.beginPath();
  o.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
};

export interface FaceOptions {
  seed: number;
  fill: string;
  /** A hairline running inside the edge: its path, colour and strength. */
  line?: { path: Pt[]; color: string; alpha: number; width?: number };
  /** Inner tone: one flat second colour in its own shape on the face, printed before the sheet goes on. */
  tone?: { path: Pt[]; color: string; alpha: number };
  /** The light across the face: how much brighter the top-left is than the bottom-right. */
  light?: number;
  /** Thin rules printed on the face, each [x0, y0, x1, y1]. */
  rules?: { lines: [number, number, number, number][]; color: string; alpha: number; width?: number };
  /** A woven surface instead of the plain sheet. */
  weave?: boolean;
}

/** A cut piece of the sheet as a texture over [x0, x0 + w] × [y0, y0 + h], y up as the outlines have it. */
export function paintFace(outline: Pt[], box: { x0: number; y0: number; w: number; h: number }, o: FaceOptions, scale = 1): OffscreenCanvas {
  const c = blank(Math.ceil(box.w * scale), Math.ceil(box.h * scale));
  const g = c.getContext('2d')!;
  g.scale(scale, -scale);
  g.translate(-box.x0, -box.y0 - box.h);
  g.fillStyle = o.fill;
  g.fillRect(box.x0, box.y0, box.w, box.h);
  const shade = g.createLinearGradient(box.x0, box.y0 + box.h, box.x0 + box.w, box.y0);
  const k = o.light ?? 0.09;
  shade.addColorStop(0, `rgba(255,255,255,${k})`);
  shade.addColorStop(0.55, 'rgba(255,255,255,0)');
  shade.addColorStop(1, `rgba(0,0,0,${k})`);
  g.fillStyle = shade;
  g.fillRect(box.x0, box.y0, box.w, box.h);
  if (o.tone) {
    g.globalAlpha = o.tone.alpha;
    g.fillStyle = o.tone.color;
    pathOf(g, o.tone.path);
    g.fill();
    g.globalAlpha = 1;
  }
  if (o.weave) {
    g.strokeStyle = 'rgba(255,255,255,0.14)';
    g.lineWidth = 1.4;
    g.beginPath();
    for (let x = Math.floor(box.x0 / 6) * 6; x < box.x0 + box.w; x += 6) { g.moveTo(x, box.y0); g.lineTo(x, box.y0 + box.h); }
    g.stroke();
    g.strokeStyle = 'rgba(0,0,0,0.16)';
    g.beginPath();
    for (let y = Math.floor(box.y0 / 6) * 6; y < box.y0 + box.h; y += 6) { g.moveTo(box.x0, y); g.lineTo(box.x0 + box.w, y); }
    g.stroke();
  }
  drawSheet(g, o.seed, box.x0, box.y0, box.w, box.h, 1);
  if (o.rules) {
    g.strokeStyle = o.rules.color;
    g.globalAlpha = o.rules.alpha;
    g.lineWidth = o.rules.width ?? 1.4;
    g.beginPath();
    for (const [a, b, c, d] of o.rules.lines) { g.moveTo(a, b); g.lineTo(c, d); }
    g.stroke();
    g.globalAlpha = 1;
  }
  if (o.line) {
    g.strokeStyle = o.line.color;
    g.globalAlpha = o.line.alpha;
    g.lineWidth = o.line.width ?? 1.6;
    g.lineJoin = 'miter';
    pathOf(g, o.line.path);
    g.stroke();
    g.globalAlpha = 1;
  }
  return c;
}

/** The soft shadow of an outline on what lies under it: black with soft edges, nothing else, at third size. */
export function paintShadow(outline: Pt[], lift: number): { canvas: OffscreenCanvas; x0: number; y0: number; w: number; h: number } {
  const s = contactShadow(lift);
  const pad = s.blur * 2 + Math.abs(s.dx) + Math.abs(s.dy);
  const xs = outline.map((p) => p[0]);
  const ys = outline.map((p) => p[1]);
  const [x0, y0] = [Math.min(...xs) - pad, Math.min(...ys) - pad];
  const [w, h] = [Math.max(...xs) + pad - x0, Math.max(...ys) + pad - y0];
  const scale = Math.min(1 / 3, 1800 / w);
  const c = blank(Math.ceil(w * scale), Math.ceil(h * scale));
  const g = c.getContext('2d')!;
  const far = 8000;
  g.shadowColor = `rgba(0,0,0,${s.alpha + 0.2})`;
  g.shadowBlur = s.blur * scale;
  g.shadowOffsetX = far * scale;
  g.fillStyle = '#000';
  g.scale(scale, -scale);
  g.translate(-x0 - far, -y0 - h);
  pathOf(g, outline);
  g.fill();
  return { canvas: c, x0, y0, w, h };
}

/** A character's shape as a piece of the sheet: the colour and fibres go in the picture, and a soft shadow lies a little off it. */
export function paperGlyph(mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>, fill: string, lift: number) {
  const img = mesh.material.map!.image as HTMLCanvasElement;
  const c = blank(img.width, img.height);
  const g = c.getContext('2d')!;
  g.fillStyle = fill;
  g.fillRect(0, 0, img.width, img.height);
  drawSheet(g, sheetSeed(), 0, 0, img.width, img.height);
  // the light across the piece, as on any paper
  const shade = g.createLinearGradient(0, 0, img.width, img.height);
  shade.addColorStop(0, 'rgba(255,255,255,0.12)');
  shade.addColorStop(1, 'rgba(0,0,0,0.12)');
  g.fillStyle = shade;
  g.fillRect(0, 0, img.width, img.height);
  g.globalCompositeOperation = 'destination-in';
  g.drawImage(img, 0, 0);
  const map = new THREE.CanvasTexture(c as unknown as HTMLCanvasElement);
  map.colorSpace = THREE.SRGBColorSpace;
  mesh.material.map = map;
  mesh.material.color.set(0xffffff);
  mesh.material.needsUpdate = true;
  const s = blank(img.width, img.height);
  const h = s.getContext('2d')!;
  h.filter = `blur(${Math.round(lift * 0.7)}px)`;
  h.drawImage(img, 0, 0);
  h.filter = 'none';
  h.globalCompositeOperation = 'source-in';
  h.fillStyle = '#000';
  h.fillRect(0, 0, img.width, img.height);
  const shadow = new THREE.Mesh(mesh.geometry, new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(s as unknown as HTMLCanvasElement), transparent: true, depthTest: false, depthWrite: false, opacity: 0 }));
  shadow.position.set(lift * 0.42, -lift * 0.7, 0);
  shadow.renderOrder = -1;
  shadow.material.opacity = 0.28;
  mesh.add(shadow);
  return shadow.material;
}
