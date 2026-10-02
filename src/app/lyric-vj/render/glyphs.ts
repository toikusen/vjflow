// Glyph planes: every character is its own mesh so templates can animate per character (AE-style).
// Textures are drawn at 2× with Canvas2D and cached per (char, font, size, style).
import * as THREE from 'three';

export interface GlyphStyle {
  family: string;
  weight: number;
  size: number;
  outline?: number; // stroke width in px; 0/undefined = filled
  shadow?: boolean; // soft dark halo so body text reads over bright plates
}

export interface Glyph {
  char: string;
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  /** Advance width in design px. */
  advance: number;
  /** Home position (set by layout), design px, centre of the cell. */
  x: number;
  y: number;
  index: number;
}

const SS = 2; // supersampling
const cache = new Map<string, { texture: THREE.CanvasTexture; w: number; h: number; advance: number }>();
const measureCtx = document.createElement('canvas').getContext('2d')!;

const fontOf = (s: GlyphStyle, scale = 1) => `${s.weight} ${s.size * scale}px "${s.family}"`;

export function advanceOf(char: string, s: GlyphStyle): number {
  measureCtx.font = fontOf(s);
  return measureCtx.measureText(char).width;
}

function texture(char: string, s: GlyphStyle) {
  const key = `${char}|${s.family}|${s.weight}|${s.size}|${s.outline ?? 0}|${s.shadow ? 1 : 0}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const advance = advanceOf(char, s);
  const pad = Math.ceil(s.size * 0.3 + (s.outline ?? 0) * 2);
  const w = Math.ceil(Math.max(advance, s.size * 0.5)) + pad * 2;
  const h = Math.ceil(s.size * 1.3) + pad * 2;
  const canvas = document.createElement('canvas');
  canvas.width = w * SS;
  canvas.height = h * SS;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(SS, SS);
  ctx.font = fontOf(s);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (s.outline) {
    ctx.lineWidth = s.outline;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#fff';
    ctx.strokeText(char, w / 2, h / 2);
  } else {
    if (s.shadow) {
      // the halo is drawn dark, then the white glyph on top; the material colour tints only bright pixels
      ctx.shadowColor = 'rgba(0,0,0,0.85)';
      ctx.shadowBlur = s.size * 0.28;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillText(char, w / 2, h / 2);
      ctx.fillText(char, w / 2, h / 2);
      ctx.shadowColor = 'transparent';
    }
    ctx.fillStyle = '#fff';
    ctx.fillText(char, w / 2, h / 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const entry = { texture: tex, w, h, advance };
  cache.set(key, entry);
  return entry;
}

/** One mesh per character, laid out left to right from x=0 (callers position the row). */
export function makeGlyphs(text: string, s: GlyphStyle, color: THREE.ColorRepresentation, tracking = 0): Glyph[] {
  const out: Glyph[] = [];
  let x = 0;
  [...text].forEach((char, index) => {
    const t = texture(char, s);
    const mat = new THREE.MeshBasicMaterial({ map: t.texture, color, transparent: true, depthTest: false, depthWrite: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(t.w, t.h), mat);
    out.push({ char, mesh, advance: t.advance, x: x + t.advance / 2, y: 0, index });
    x += t.advance + tracking;
  });
  return out;
}

export function rowWidth(glyphs: Glyph[], tracking = 0): number {
  return glyphs.reduce((w, g) => w + g.advance, 0) + tracking * Math.max(0, glyphs.length - 1);
}

/** Centres a row of glyphs on (cx, cy). */
export function placeRow(glyphs: Glyph[], cx: number, cy: number, tracking = 0) {
  const w = rowWidth(glyphs, tracking);
  let x = cx - w / 2;
  for (const g of glyphs) {
    g.x = x + g.advance / 2;
    g.y = cy;
    x += g.advance + tracking;
  }
}

// ---- shared easing / math
export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const easeOutCubic = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);
export const easeInCubic = (x: number) => Math.pow(clamp01(x), 3);
export const easeOutBack = (x: number) => {
  const c = 1.9;
  const p = clamp01(x) - 1;
  return 1 + (c + 1) * p * p * p + c * p * p;
};
/** Deterministic hash noise in [0, 1). */
export const hash = (a: number, b = 0) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
