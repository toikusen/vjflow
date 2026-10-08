// Glyph planes: every character is its own mesh so templates can animate per character (AE-style).
// Textures are drawn at 2× with Canvas2D and cached per (char, font, size, style).
import * as THREE from 'three';
import { nearestWeight } from '../fonts';
import { typeset } from '../typeset';

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
  /** Extra space before this glyph in px (a Latin↔Japanese switch). */
  gap?: number;
}

const SS = 2; // supersampling
let defaultKana = 1;
/** The song's kana scale, used when a style does not set its own (one design per render page). */
export const setKanaScale = (k: number) => (defaultKana = k);
/** Japanese typesetting rules (typeset.ts) on or off for the glyphs made next. */
let typesetOn = true;
export const setTypeset = (on: boolean) => (typesetOn = on);
/** Glyphs split into their strokes (connected components) for assemble / scatter motion. */
let piecesOn = false;
export const setPieces = (on: boolean) => (piecesOn = on);
/** Hiragana (and its small forms); katakana and kanji keep full size. */
const KANA = /[\u3041-\u3096\u309d\u309e]/;
/** One stroke of a glyph: its own texture, home offset from the glyph centre and size, in design px. */
export interface Piece {
  texture: THREE.CanvasTexture;
  x: number;
  y: number;
  w: number;
  h: number;
}
const cache = new Map<string, { texture: THREE.CanvasTexture; w: number; h: number; advance: number; pieces?: Piece[] }>();
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
/**
 * A misregistered plate in a second ink under dark type (risograph-like): a separate coloured copy, offset, so dark
 * strokes never merge with a dark shadow. Offsets are fractions of the glyph size.
 */
let inkGhost: { dx: number; dy: number; color: THREE.ColorRepresentation } | null = null;
export const setInkGhost = (g: typeof inkGhost) => (inkGhost = g);

function texture(char: string, s: GlyphStyle) {
  const key = `${char}|${s.family}|${s.weight}|${s.size}|${s.outline ?? 0}|${s.shadow ? halo : 0}|${s.embolden ?? 0}|${ghost.join(',')}|${piecesOn ? 1 : 0}`;
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
  const entry: { texture: THREE.CanvasTexture; w: number; h: number; advance: number; pieces?: Piece[] } = { texture: tex, w, h, advance };
  if (piecesOn) entry.pieces = piecesOf(canvas, w, h);
  cache.set(key, entry);
  return entry;
}

/** One mesh per character, laid out left to right from x=0 (callers position the row). */
export function makeGlyphs(text: string, s: GlyphStyle, color: THREE.ColorRepresentation, tracking = 0): Glyph[] {
  const out: Glyph[] = [];
  let x = 0;
  const ts = typesetOn ? typeset(text, s.size >= 110) : [...text].map(() => ({ scale: 1, advance: 1, gapBefore: 0 }));
  [...text].forEach((char, index) => {
    // the song's kana scale shapes display type (big words); body rows keep even sizes, or the rule shows everywhere
    const k = s.kanaScale ?? (s.size >= 130 ? defaultKana : 1);
    const small = k < 1 && KANA.test(char);
    // typesetting (typeset.ts) scales particles, a leading kanji and Latin; the kana scale wins where both apply
    const f = small ? k : ts[index].scale;
    const cs = f !== 1 ? { ...s, size: Math.round(s.size * f), embolden: s.embolden && s.embolden * f } : s;
    const t = texture(char, cs);
    const mat = new THREE.MeshBasicMaterial({ map: t.texture, color, transparent: true, depthTest: false, depthWrite: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(t.w, t.h), mat);
    if (t.pieces && t.pieces.length > 1) {
      // the glyph draws nothing itself; its strokes are children that follow its opacity and colour (syncPieces)
      mesh.geometry.setDrawRange(0, 0);
      mesh.userData['pieces'] = t.pieces.map((p, i) => {
        const pm = new THREE.Mesh(new THREE.PlaneGeometry(p.w, p.h), new THREE.MeshBasicMaterial({ map: p.texture, color, transparent: true, depthTest: false, depthWrite: false }));
        pm.position.set(p.x, p.y, 0);
        const a = Math.atan2(p.y, p.x) + (hash(index, i) - 0.5) * 1.2;
        pm.userData['home'] = [p.x, p.y];
        pm.userData['dir'] = [Math.cos(a), Math.sin(a), (hash(i, index + 7) - 0.5) * 2];
        mesh.add(pm);
        return pm;
      });
    }
    if (inkGhost) {
      // the plate copy has no halo: only the glyph shape, in the second ink, behind the type
      const plain = texture(char, { ...cs, shadow: false });
      const gm = new THREE.Mesh(new THREE.PlaneGeometry(plain.w, plain.h), new THREE.MeshBasicMaterial({ map: plain.texture, color: inkGhost.color, transparent: true, depthTest: false, depthWrite: false }));
      gm.position.set(inkGhost.dx * cs.size, -inkGhost.dy * cs.size, -0.01);
      gm.renderOrder = -1;
      mesh.add(gm);
      mesh.userData['inkGhost'] = gm;
    }
    const advance = t.advance * ts[index].advance;
    const gap = ts[index].gapBefore * s.size;
    x += gap;
    // glyphs of another size are centred so all sit on one baseline
    out.push({ char, mesh, advance, x: x + advance / 2, y: 0, index, dy: -(s.size - cs.size) * 0.42, gap: gap || undefined });
    x += advance + tracking;
  });
  return out;
}

export function rowWidth(glyphs: Glyph[], tracking = 0): number {
  return glyphs.reduce((w, g, i) => w + g.advance + (i ? (g.gap ?? 0) : 0), 0) + tracking * Math.max(0, glyphs.length - 1);
}

/** Centres a row of glyphs on (cx, cy). */
export function placeRow(glyphs: Glyph[], cx: number, cy: number, tracking = 0) {
  const w = rowWidth(glyphs, tracking);
  let x = cx - w / 2;
  for (const [i, g] of glyphs.entries()) {
    if (i) x += g.gap ?? 0;
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

/**
 * Splits a glyph texture into strokes: body pixels grouped into connected components (on a 2 px grid), every other
 * inked pixel (halo, ghost) given to the nearest component, tiny specks merged, at most 10 pieces.
 */
function piecesOf(canvas: HTMLCanvasElement, w: number, h: number): Piece[] {
  const ctx = canvas.getContext('2d')!;
  const W2 = canvas.width;
  const H2 = canvas.height;
  const img = ctx.getImageData(0, 0, W2, H2).data;
  const step = 2;
  const gw = Math.ceil(W2 / step);
  const gh = Math.ceil(H2 / step);
  const label = new Int32Array(gw * gh).fill(-1);
  const inked = (i: number, j: number) => img[((j * step) * W2 + i * step) * 4 + 3] > 10;
  const body = (i: number, j: number) => {
    const o = ((j * step) * W2 + i * step) * 4;
    return img[o + 3] > 120 && img[o] > 150;
  };
  let n = 0;
  const sizes: number[] = [];
  const queue: number[] = [];
  for (let j = 0; j < gh; j++)
    for (let i = 0; i < gw; i++) {
      if (label[j * gw + i] >= 0 || !body(i, j)) continue;
      label[j * gw + i] = n;
      let size = 0;
      const q = [j * gw + i];
      while (q.length) {
        const c = q.pop()!;
        size++;
        const ci = c % gw;
        const cj = (c - ci) / gw;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ni = ci + di;
          const nj = cj + dj;
          if (ni < 0 || nj < 0 || ni >= gw || nj >= gh || label[nj * gw + ni] >= 0 || !body(ni, nj)) continue;
          label[nj * gw + ni] = n;
          q.push(nj * gw + ni);
        }
      }
      sizes.push(size);
      n++;
    }
  if (n < 2) return [];
  // grow components over halo pixels (multi-source BFS), so each piece keeps its own halo
  for (let c = 0; c < label.length; c++) if (label[c] >= 0) queue.push(c);
  for (let qi = 0; qi < queue.length; qi++) {
    const c = queue[qi];
    const ci = c % gw;
    const cj = (c - ci) / gw;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = ci + di;
      const nj = cj + dj;
      if (ni < 0 || nj < 0 || ni >= gw || nj >= gh || label[nj * gw + ni] >= 0 || !inked(ni, nj)) continue;
      label[nj * gw + ni] = label[c];
      queue.push(nj * gw + ni);
    }
  }
  // merge specks and keep at most 10: the smallest components join the largest
  const total = sizes.reduce((a, b) => a + b, 0);
  const order = sizes.map((sz, k) => k).sort((a, b) => sizes[b] - sizes[a]);
  const keep = new Set(order.filter((k, r) => r < 10 && sizes[k] > total * 0.02));
  const target = order[0];
  const map = sizes.map((_, k) => (keep.has(k) ? k : target));
  const pieces: Piece[] = [];
  for (const k of keep) {
    let x0 = gw, y0 = gh, x1 = -1, y1 = -1;
    for (let c = 0; c < label.length; c++) {
      if (label[c] < 0 || map[label[c]] !== k) continue;
      const ci = c % gw;
      const cj = (c - ci) / gw;
      x0 = Math.min(x0, ci); y0 = Math.min(y0, cj); x1 = Math.max(x1, ci); y1 = Math.max(y1, cj);
    }
    if (x1 < 0) continue;
    const px0 = x0 * step, py0 = y0 * step, pw = (x1 - x0 + 1) * step, ph = (y1 - y0 + 1) * step;
    const pc = document.createElement('canvas');
    pc.width = pw;
    pc.height = ph;
    const pctx = pc.getContext('2d')!;
    const out = pctx.createImageData(pw, ph);
    for (let y = 0; y < ph; y++)
      for (let x = 0; x < pw; x++) {
        const gx = Math.floor((px0 + x) / step);
        const gy = Math.floor((py0 + y) / step);
        const l = label[gy * gw + gx];
        if (l < 0 || map[l] !== k) continue;
        const si = ((py0 + y) * W2 + (px0 + x)) * 4;
        const di = (y * pw + x) * 4;
        out.data[di] = img[si]; out.data[di + 1] = img[si + 1]; out.data[di + 2] = img[si + 2]; out.data[di + 3] = img[si + 3];
      }
    pctx.putImageData(out, 0, 0);
    const tex = new THREE.CanvasTexture(pc);
    tex.colorSpace = THREE.SRGBColorSpace;
    // canvas px are SS × design px; texture y runs down, scene y up
    pieces.push({ texture: tex, x: (px0 + pw / 2) / SS - w / 2, y: h / 2 - (py0 + ph / 2) / SS, w: pw / SS, h: ph / SS });
  }
  return pieces;
}

/** Strokes follow their glyph: same opacity and colour, scattered outward as the glyph fades (assemble / scatter). */
export function syncPieces(root: THREE.Object3D) {
  root.traverse((o) => {
    const ink = o.userData['inkGhost'] as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> | undefined;
    if (ink) ink.material.opacity = 0.85 * (o as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>).material.opacity;
    const pieces = o.userData['pieces'] as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] | undefined;
    if (!pieces || !(o as THREE.Mesh).isMesh) return;
    const m = (o as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>).material;
    const away = (1 - m.opacity) ** 2;
    for (const p of pieces) {
      const [hx, hy] = p.userData['home'];
      const [dx, dy, spin] = p.userData['dir'];
      p.material.opacity = m.opacity;
      p.material.color.copy(m.color);
      p.position.set(hx + dx * away * 160, hy + dy * away * 160, 0);
      p.rotation.z = spin * away * 1.5;
    }
  });
}
