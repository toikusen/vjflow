// Glyph planes: every character is its own mesh so templates can animate per character (AE-style).
// Textures are drawn at 2× with Canvas2D and cached per (char, font, size, style).
import * as THREE from 'three';
import { nearestWeight } from '../fonts';

export interface GlyphStyle {
  family: string;
  weight: number;
  size: number;
  outline?: number; // stroke width in px; 0/undefined = filled
  shadow?: boolean; // soft dark halo so body text reads over bright plates
  embolden?: number; // extra stroke width in px: thin handwriting faces read from the back of a live house
  kanaScale?: number; // hiragana set this much smaller than kanji/katakana, sitting on the same baseline
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
  /** Vertical offset from the row's centre line (smaller kana sit on the baseline). */
  dy?: number;
  /** Index of this character in the cue text (for word-by-word timing). */
  src?: number;
}

const SS = 2; // supersampling
let defaultKana = 1;
/** The song's kana scale, used when a style does not set its own (one design per render page). */
export const setKanaScale = (k: number) => (defaultKana = k);
/** Hiragana (and its small forms); katakana and kanji keep full size. */
const KANA = /[\u3041-\u3096\u309d\u309e]/;
const cache = new Map<string, { texture: THREE.CanvasTexture; w: number; h: number; advance: number }>();
const measureCtx = document.createElement('canvas').getContext('2d')!;

const fontOf = (s: GlyphStyle, scale = 1) => `${nearestWeight(s.family, s.weight)} ${s.size * scale}px "${s.family}"`;

export function advanceOf(char: string, s: GlyphStyle): number {
  measureCtx.font = fontOf(s);
  return measureCtx.measureText(char).width;
}

/** Halo behind shadowed glyphs: dark over pictures, none over a light field (a grey smudge on paper). */
let halo = 'rgba(0,0,0,0.85)';
export const setHalo = (rgba: string) => (halo = rgba);
/** A hard dark copy offset under every glyph, as a fraction of its size (print misregistration, sticker shadows). */
let ghost: [number, number] = [0, 0];
export const setGhost = (g: [number, number]) => (ghost = g);

function texture(char: string, s: GlyphStyle) {
  const key = `${char}|${s.family}|${s.weight}|${s.size}|${s.outline ?? 0}|${s.shadow ? halo : 0}|${s.embolden ?? 0}|${ghost.join(',')}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const advance = advanceOf(char, s);
  const pad = Math.ceil(s.size * (0.3 + Math.max(Math.abs(ghost[0]), Math.abs(ghost[1]))) + (s.outline ?? 0) * 2);
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
    const draw = (style: string) => {
      ctx.fillStyle = style;
      ctx.fillText(char, w / 2, h / 2);
      if (!s.embolden) return;
      ctx.lineWidth = s.embolden;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = style;
      ctx.strokeText(char, w / 2, h / 2);
    };
    if (ghost[0] || ghost[1]) {
      // dark pixels are not tinted by the material colour, so the ghost stays ink-dark under any lyric colour
      ctx.fillStyle = 'rgba(10,10,14,0.92)';
      ctx.fillText(char, w / 2 + ghost[0] * s.size, h / 2 + ghost[1] * s.size);
    }
    if (s.shadow) {
      // the halo is drawn dark, then the white glyph on top; the material colour tints only bright pixels
      ctx.shadowColor = halo;
      // a light halo (dark type on a light field) stays tight: a wide one fogged dark areas it crossed
      ctx.shadowBlur = s.size * (halo.startsWith('rgba(0,0,0') ? 0.28 : 0.1);
      draw('rgba(0,0,0,0.6)');
      draw('rgba(0,0,0,0.6)');
      ctx.shadowColor = 'transparent';
    }
    draw('#fff');
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
    // the song's kana scale shapes display type (big words); body rows keep even sizes, or the rule shows everywhere
    const k = s.kanaScale ?? (s.size >= 130 ? defaultKana : 1);
    const small = k < 1 && KANA.test(char);
    const cs = small ? { ...s, size: Math.round(s.size * k), embolden: s.embolden && s.embolden * k } : s;
    const t = texture(char, cs);
    const mat = new THREE.MeshBasicMaterial({ map: t.texture, color, transparent: true, depthTest: false, depthWrite: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(t.w, t.h), mat);
    // a smaller glyph is centred lower so both sit on one baseline
    out.push({ char, mesh, advance: t.advance, x: x + t.advance / 2, y: 0, index, dy: small ? -(s.size - cs.size) * 0.42 : 0 });
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
    g.y = cy + (g.dy ?? 0);
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
