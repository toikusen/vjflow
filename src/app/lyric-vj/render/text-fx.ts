// Text effects every template gets for free: after a template has placed and moved its glyphs for the frame, this
// pass adds what the style asks for on top — an ink entrance (the outline is drawn, then the fill floods in), a
// glitch or a blade-slash exit, and the emphasis kinds that are drawn rather than coloured (hollow type, a keyword in
// the contrasting face, a marker stroke under a word, a small sign by a word). Templates stay unaware of all of it.
import * as THREE from 'three';
import { contrastFace, FONTS } from '../fonts';
import { CueStyle, Emphasis, SymbolName } from '../treatment';
import { SIGN_PATHS } from './signs';
import { clamp01, easeInCubic, easeOutBack, easeOutCubic, Glyph, GlyphStyle, glyphTexture, hash, inkShare, clearGlyphCache } from './glyphs';
import { stepScale, ARRIVAL_SEC, cornerPose, curveKind, curvePoint, doorPhase, doorSeam, isArrival, markShare, seatPhase, trainDelay, waveEdge, waveRise } from './arrival';
import { bandEdges, bandOffset, slatEdges, slatTurn } from './band-clip';
import { cutPieces } from './beat-cut';
import { GRAIN_PITCH, grainStep, lightRows, litShare, pressDepth, softDepth, stateFor, UNLIT } from './glyph-state';
import { phraseSpans } from './line-space';
import { outlineMesh, rectMesh, shadowMesh } from './lyric-carrier';
import { breathLine, crumbPose, nodePhase, nodeSize, ovalStroke, relayAt, ECHO_WAYS, echoPose, focusShare, foldPhase, gravityPose, poreField, pushFocus, radialShift, railAhead, railPose, slatClose, stripShare, strokeLeft, waveShift, waveThin } from './line-exit';
import { mixHex, mottle, ovalFit, roughEdge, tornLine } from './material';
import { CueLayer, CueRuntime, DRAWN, enterSec, FrameFx, readable, revealAt, songVary } from './runtime';

type GlyphMesh = THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
interface Item {
  mesh: GlyphMesh;
  glyph: Glyph;
  style: GlyphStyle;
}

/** Entrances drawn here over a plain cut: the template only places the glyphs. */
const DRAWN_ENTER = new Set<string>(['ink', 'flap', 'slot', 'focus', 'rise', 'decode', 'slice', 'rip', 'flip', 'stretch', 'shuffle', 'squash', 'windup', 'karaoke', 'band-in', 'matrix-light', ...Object.keys(ARRIVAL_SEC)]);
/** Exits drawn here over a plain fade. */
const DRAWN_EXIT = new Set(['glitch', 'slash', 'scramble', 'split', 'pixel', 'shatter', 'collapse', 'band-out', 'slat-close', 'line-fold', 'echo-travel', 'radial-leave', 'glyph-shed', 'wave-dissolve', 'pore-out', 'focus-out', 'node-fold']);
const NEEDS_FX = (s: CueStyle) => !!s.relay || !!s.oval || s.idle === 'reflection-rest' || !!s.breath || !!s.icon || DRAWN_ENTER.has(s.enter) || DRAWN_EXIT.has(s.exit) || s.exit === 'rail-leave' || s.exit === 'gravity-pass' || !!s.trail || !!s.inkState || !!s.emphasis?.some((e) => ['hollow', 'face', 'mark', 'symbol', 'liquid', 'strike', 'box', 'hold', 'revise', 'echo', 'weight', 'shine', 'faces'].includes(e.method));
/** What a decoding line flickers through before each character settles. */
const SCRAMBLE = [...'#%&@$?!*+=<>/01ア゙ヲｦﾘ※◆▲■□'];

/** The style a template sees: entrances and exits drawn here are replaced by the plain ones they build on. */
export function templateStyle(s: CueStyle): CueStyle {
  return { ...s, enter: DRAWN_ENTER.has(s.enter) ? 'cut' : s.enter, exit: DRAWN_EXIT.has(s.exit) ? 'fade' : s.exit };
}

/** When glyph g (in cue-text order) starts its entrance: as sung for a word reveal, else a short stagger. */
const startOf = (rt: CueRuntime, g: Glyph, n: number) =>
  rt.style.enter === 'band-in' || rt.style.enter === 'matrix-light' || isArrival(rt.style.enter) ? rt.showFrom : rt.style.reveal === 'word' ? revealAt(rt, (g.src ?? g.index) / Math.max(1, n - 1)) : rt.showFrom + (g.src ?? g.index) * 0.035 * rt.pace;

/** A glyph's picture as a screen of round dots of this pitch, each as big as the ink it stands for (cached per picture and pitch). */
const grains = new Map<string, THREE.Texture>();
/** Pictures made from a glyph's picture, at most: a live preview runs for as long as someone keeps it open. */
const DERIVED_MAX = 240;
/** Keeps a made picture, letting go of the oldest past the limit (a line still showing it has it sent to the card again). */
export function keepDerived(map: Map<string, { dispose(): void }>, key: string, t: { dispose(): void }) {
  map.set(key, t);
  if (map.size <= DERIVED_MAX) return;
  const [oldest, old] = map.entries().next().value!;
  old.dispose();
  map.delete(oldest);
}
/** Live use: everything these caches hold, when an engine is let go of. */
export function clearTextCaches() {
  for (const m of [grains, blurred]) {
    m.forEach((t) => t.dispose());
    m.clear();
  }
  clearGlyphCache();
}
export function grainOf(tex: THREE.Texture, planeW: number, pitch: number, crisp = false) {
  const key = `${tex.uuid}|${pitch.toFixed(1)}|${crisp}`;
  const hit = grains.get(key);
  if (hit) return hit;
  const img = tex.image as HTMLCanvasElement;
  const px = img.getContext('2d')!.getImageData(0, 0, img.width, img.height).data;
  const cell = Math.max(3, Math.round((pitch * img.width) / planeW));
  const cv = Object.assign(document.createElement('canvas'), { width: img.width, height: img.height });
  const c = cv.getContext('2d')!;
  c.fillStyle = '#fff';
  for (let y = 0, row = 0; y < img.height; y += cell, row++)
    for (let x = row % 2 ? -cell / 2 : 0; x < img.width; x += cell) {
      let [ink, count] = [0, 0];
      for (let j = Math.max(0, y); j < Math.min(img.height, y + cell); j += 2)
        for (let i = Math.max(0, Math.round(x)); i < Math.min(img.width, x + cell); i += 2) {
          const at = (j * img.width + i) * 4;
          // the halo drawn round a glyph is dark: only the letter's own white counts
          ink += px[at] > 128 ? px[at + 3] / 255 : 0;
          count++;
        }
      const cover = count ? ink / count : 0;
      if (cover < (crisp ? 0.5 : 0.1)) continue;
      // the point bleeds along the paper's fibres: a few fine hairs, no blur
      if (crisp) {
        c.globalAlpha = 0.5;
        c.strokeStyle = '#fff';
        c.lineWidth = Math.max(1, cell * 0.08);
        c.lineCap = 'round';
        for (let k = 0; k < 1 + Math.floor(hash(x, y) * 2); k++) {
          const a = hash(x * 3 + k, y) * Math.PI * 2;
          const len = cell * (0.6 + 0.55 * hash(y + k, x));
          const bend = (hash(x + k, y + 3) - 0.5) * cell * 0.5;
          c.beginPath();
          c.moveTo(x + cell / 2, y + cell / 2);
          c.quadraticCurveTo(x + cell / 2 + Math.cos(a) * len * 0.5 - Math.sin(a) * bend, y + cell / 2 + Math.sin(a) * len * 0.5 + Math.cos(a) * bend, x + cell / 2 + Math.cos(a) * len, y + cell / 2 + Math.sin(a) * len);
          c.stroke();
        }
        c.globalAlpha = 1;
      }
      c.beginPath();
      c.arc(x + cell / 2, y + cell / 2, (cell / 2) * (crisp ? 0.86 : Math.min(1.12, 1.25 * Math.sqrt(cover))), 0, Math.PI * 2);
      c.fill();
    }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  keepDerived(grains, key, t);
  return t;
}

/** Swaps a glyph's picture for another style of the same character (outline, another face). */
function retexture(m: GlyphMesh, char: string, s: GlyphStyle) {
  const t = glyphTexture(char, s);
  m.material.map = t.texture;
  m.material.needsUpdate = true;
  m.geometry.dispose();
  m.geometry = new THREE.PlaneGeometry(t.w, t.h);
}

const outlineOf = (s: GlyphStyle): GlyphStyle => ({ ...s, shadow: false, embolden: 0, outline: Math.max(2.5, s.size * 0.035) });
/** The held heavy outline, drawn on a medium cut of the face: round a black cut's letterforms it closes every counter. */
const heavyOutlineOf = (s: GlyphStyle): GlyphStyle => ({ ...outlineOf(s), weight: Math.min(s.weight, 500), outline: Math.max(4, s.size * 0.045) });

// ---- drawn pieces: a marker stroke, signs (one canvas each, shared)
const drawn = new Map<string, THREE.CanvasTexture>();
function canvasTexture(key: string, w: number, h: number, paint: (c: CanvasRenderingContext2D) => void) {
  let t = drawn.get(key);
  if (t) return t;
  const cv = Object.assign(document.createElement('canvas'), { width: w, height: h });
  paint(cv.getContext('2d')!);
  t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  drawn.set(key, t);
  return t;
}

/** A solid disc, white (tinted by material): the karaoke ball. */
const ballTexture = () =>
  canvasTexture('ball', 64, 64, (c) => {
    c.fillStyle = '#fff';
    c.beginPath();
    c.arc(32, 32, 28, 0, Math.PI * 2);
    c.fill();
  });

/** A glyph's picture in coarse blocks (`block` texture px), made once per picture and size; undefined without a canvas. */
const pixelated = new WeakMap<THREE.Texture, Map<number, THREE.Texture>>();
function pixelOf(tex: THREE.Texture, block: number): THREE.Texture | undefined {
  const img = tex.image as (CanvasImageSource & { width: number; height: number }) | undefined;
  if (!img?.width || typeof document === 'undefined') return undefined;
  const byBlock = pixelated.get(tex) ?? new Map<number, THREE.Texture>();
  pixelated.set(tex, byBlock);
  const hit = byBlock.get(block);
  if (hit) return hit;
  const small = Object.assign(document.createElement('canvas'), { width: Math.max(1, Math.round(img.width / block)), height: Math.max(1, Math.round(img.height / block)) });
  const big = Object.assign(document.createElement('canvas'), { width: img.width, height: img.height });
  const a = small.getContext('2d'), b = big.getContext('2d');
  if (!a || !b) return undefined;
  a.drawImage(img, 0, 0, small.width, small.height);
  b.imageSmoothingEnabled = false;
  b.drawImage(small, 0, 0, big.width, big.height);
  const t = new THREE.CanvasTexture(big);
  t.colorSpace = tex.colorSpace;
  byBlock.set(block, t);
  return t;
}

/** A felt-tip stroke: a slightly tapered band with dry streaks and a darker pooled end, white (tinted by material). */
const markerTexture = () =>
  canvasTexture('marker', 1024, 96, (c) => {
    for (let i = 0; i < 1024; i += 2) {
      const u = i / 1024;
      const half = 30 * (0.82 + 0.18 * Math.sin(u * Math.PI)) * (u < 0.03 ? u / 0.03 : u > 0.97 ? (1 - u) / 0.03 : 1);
      const y = 48 + Math.sin(u * 5.1) * 3;
      c.fillStyle = `rgba(255,255,255,${0.78 + 0.22 * hash(i, 3)})`;
      c.fillRect(i, y - half, 2, half * 2);
    }
    // dry streaks along the stroke where the felt skipped
    c.globalCompositeOperation = 'destination-out';
    for (let k = 0; k < 9; k++) {
      c.fillStyle = `rgba(0,0,0,${0.25 + 0.3 * hash(k, 9)})`;
      c.fillRect(1024 * hash(k, 1) * 0.5, 24 + 48 * hash(k, 2), 300 + 400 * hash(k, 4), 1.5);
    }
  });

/** The composer's marker: an even, half-toned stroke with soft ends, no skipped streaks, so no thin stroke of a character is lost on it. */
const cleanMarkerTexture = () =>
  canvasTexture('marker-clean', 1024, 96, (c) => {
    for (let i = 0; i < 1024; i += 2) {
      const u = i / 1024;
      const half = 30 * (0.82 + 0.18 * Math.sin(u * Math.PI)) * (u < 0.03 ? u / 0.03 : u > 0.97 ? (1 - u) / 0.03 : 1);
      c.fillStyle = `rgba(255,255,255,${0.62 + 0.03 * Math.sin(u * 19)})`;
      c.fillRect(i, 48 + Math.sin(u * 5.1) * 3 - half, 2, half * 2);
    }
  });

/** The tape's colour: the page's paper when it is light, else white (on a dark page or a sky it read as a black bar). */
const tapeColor = (page: THREE.ColorRepresentation) => {
  const c = new THREE.Color(page);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b > 0.6 ? c : new THREE.Color('#F4F1EA');
};
/** Correction tape: an opaque band with slightly torn ends, white (tinted the page's paper). */
const tapeTexture = () =>
  canvasTexture('tape', 512, 96, (c) => {
    c.fillStyle = '#fff';
    c.beginPath();
    c.moveTo(6, 8);
    for (let i = 0; i <= 10; i++) c.lineTo(506 + 6 * hash(i, 21), 8 + i * 8);
    for (let i = 10; i >= 0; i--) c.lineTo(6 * hash(i, 22), 8 + i * 8);
    c.fill();
  });

/** A pen scribbling a word out: a tight zigzag of loose strokes, white. */
const scribbleTexture = () =>
  canvasTexture('scribble', 512, 128, (c) => {
    c.strokeStyle = '#fff';
    c.lineWidth = 9;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.beginPath();
    for (let i = 0; i <= 22; i++) c.lineTo(10 + i * 22.5, i % 2 ? 22 + 10 * hash(i, 5) : 106 - 10 * hash(i, 6));
    c.stroke();
  });

/** A VOID stamp: a double-ruled box with the word in it, inked unevenly, white. */
const stampTexture = () =>
  canvasTexture('void', 512, 192, (c) => {
    c.strokeStyle = '#fff';
    c.fillStyle = '#fff';
    c.lineWidth = 12;
    c.strokeRect(10, 10, 492, 172);
    c.lineWidth = 4;
    c.strokeRect(28, 28, 456, 136);
    c.font = '900 108px "Space Mono", "Courier New", monospace';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('VOID', 256, 100);
    // worn ink: specks where the stamp did not take
    c.globalCompositeOperation = 'destination-out';
    for (let k = 0; k < 140; k++) c.fillRect(512 * hash(k, 11), 192 * hash(k, 12), 2 + 5 * hash(k, 13), 2 + 3 * hash(k, 14));
  });

/** A wavering line, white: a held vowel trailing from the word (repeats along x, so it grows without stretching). */
const waveTexture = () =>
  canvasTexture('wave', 512, 64, (c) => {
    c.strokeStyle = '#fff';
    c.lineWidth = 9;
    c.lineCap = 'round';
    c.beginPath();
    for (let x = 0; x <= 512; x += 4) c.lineTo(x, 32 + Math.sin((x / 512) * Math.PI * 4) * 18);
    c.stroke();
  });

/** A proofreader's caret (^), drawn as two pen strokes, white. */
const caretTexture = () =>
  canvasTexture('caret', 128, 128, (c) => {
    c.strokeStyle = '#fff';
    c.lineWidth = 14;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.beginPath();
    c.moveTo(16, 116);
    c.lineTo(64, 14);
    c.lineTo(112, 116);
    c.stroke();
  });

const signTexture = (s: SymbolName) =>
  canvasTexture(`sign:${s}`, 128, 128, (c) => {
    c.fillStyle = '#fff';
    SIGN_PATHS[s](c);
  });

/**
 * Clips a glyph and what it already carries (a style's offset second ink is a child mesh: left unclipped, it showed
 * outside a slot window or under a rising line).
 */
function clipWith(m: GlyphMesh, planes: THREE.Plane[]) {
  m.traverse((o) => {
    const mat = (o as THREE.Mesh).material as THREE.Material | undefined;
    if (!(o as THREE.Mesh).isMesh || !mat) return;
    mat.clippingPlanes = planes;
    mat.needsUpdate = true;
  });
}

/** A glyph's picture softened by a canvas blur (cached per picture and radius). */
const blurred = new Map<string, THREE.Texture>();
const pores = new Map<number, THREE.Texture>();
/** A field of pores as a picture, the alpha a rising threshold eats through. Made once for a handful of seeds. */
function poreMap(seed: number) {
  const hit = pores.get(seed);
  if (hit) return hit;
  const n = 160;
  const cv = Object.assign(document.createElement('canvas'), { width: n, height: n });
  const c = cv.getContext('2d')!;
  const px = c.createImageData(n, n);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const f = Math.round(255 * poreField(x / n, y / n, seed * 19 + 3, (u, w) => mottle(u, w, seed)));
      px.data.set([f, f, f, 255], (y * n + x) * 4);
    }
  c.putImageData(px, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  pores.set(seed, t);
  return t;
}

function blurredOf(tex: THREE.Texture, size: number) {
  const key = `${tex.uuid}|${Math.round(size * 0.18)}`;
  const hit = blurred.get(key);
  if (hit) return hit;
  const img = tex.image as HTMLCanvasElement;
  const cv = Object.assign(document.createElement('canvas'), { width: img.width, height: img.height });
  const c = cv.getContext('2d')!;
  // glyph canvases are drawn at 2× (glyphs.ts SS): about a tenth of the type size, inside the glyph's padding
  c.filter = `blur(${Math.round(size * 0.18)}px)`;
  c.drawImage(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  keepDerived(blurred, key, t);
  return t;
}

const plane = (tex: THREE.Texture, color: THREE.ColorRepresentation) =>
  new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, color, transparent: true, depthTest: false, depthWrite: false }));

/** The glyphs of a template's layer, each with its style and its place in the cue text. */
function itemsOf(group: THREE.Object3D): Item[] {
  const out: Item[] = [];
  group.traverse((o) => {
    const g = o.userData['glyph'] as Glyph | undefined;
    let decor = false;
    for (let p: THREE.Object3D | null = o; p && p !== group; p = p.parent) decor ||= !!p.userData['decor'];
    if (g && (o as THREE.Mesh).isMesh && !decor) out.push({ mesh: o as GlyphMesh, glyph: g, style: o.userData['style'] as GlyphStyle });
  });
  return out;
}

/**
 * Wraps a template's cue layer with the effects its style asks for (a no-op for styles without them). The template
 * must have been built from templateStyle(rt.style); rt here is the real style.
 */
export function withTextFx(layer: CueLayer, rt: CueRuntime): CueLayer {
  if (!NEEDS_FX(rt.style)) return layer;
  // the song's own reach for each drawn effect (how far a half slides, how hard a glitch jumps, the blade's angle):
  // never its timing, which DRAWN and the reading checks count on
  const v = (key: string, lo: number, hi: number) => songVary(rt, key, lo, hi);
  const items = itemsOf(layer.group);
  if (!items.length) return layer;
  const n = [...rt.cue.text].length;
  const accent = new THREE.Color(rt.palette.accent);
  const inRange = (it: Item, from: number, to: number) => it.glyph.src !== undefined && it.glyph.src >= from && it.glyph.src < to;
  // a template may set a word twice (beat-cut: the big word and the small full line): each character's k-th glyph is
  // copy k; marks and signs follow whichever copy is most on screen at the moment, in reading order
  const copyOf = new Map<Item, number>();
  {
    const count = new Map<number, number>();
    for (const it of items) {
      if (it.glyph.src === undefined) continue;
      const k = count.get(it.glyph.src) ?? 0;
      count.set(it.glyph.src, k + 1);
      copyOf.set(it, k);
    }
  }
  const lead = (its: Item[]) => {
    const copies = new Map<number, Item[]>();
    for (const it of its) copies.set(copyOf.get(it) ?? 0, [...(copies.get(copyOf.get(it) ?? 0) ?? []), it]);
    let best: Item[] = [];
    let score = 0;
    for (const c of copies.values()) {
      const sc = c.reduce((a, x) => a + (x.mesh.visible ? x.mesh.material.opacity : 0) * x.style.size, 0);
      if (sc > score) [best, score] = [c, sc];
    }
    return best.sort((a, b) => a.glyph.src! - b.glyph.src!);
  };

  // drawn emphasis: hollow type and the contrast face are picture swaps, made once
  for (const e of rt.style.emphasis ?? []) {
    for (const it of items.filter((x) => inRange(x, e.from, e.to))) {
      if (e.method === 'hollow') retexture(it.mesh, it.glyph.char, outlineOf(it.style));
      if (e.method === 'face') retexture(it.mesh, it.glyph.char, { ...it.style, family: contrastFace(it.style.family), weight: 900 });
    }
  }

  // the surface the line keeps through its reading: fixed from its first frame, so reading never sees it change
  const inkState = rt.style.inkState && stateFor(rt.style.inkState, Math.max(...items.map((x) => x.style.size)), Math.max(...items.map((x) => inkShare(x.glyph.char, rt.style.inkState === 'edge' ? { ...x.style, weight: 700 } : rt.style.inkState === 'outline' ? heavyOutlineOf(x.style) : x.style))));
  if (inkState && inkState !== 'solid') for (const it of items) retexture(it.mesh, it.glyph.char, inkState === 'block' ? { ...it.style, bevel: true } : inkState === 'edge' ? { ...it.style, weight: 700 } : inkState === 'dots' ? { ...it.style, dots: true } : inkState === 'soft' ? { ...it.style, weight: Math.min(it.style.weight, 700), soft: softDepth(it.style.size, inkShare(it.glyph.char, it.style)) } : heavyOutlineOf(it.style));
  // the body's shading is grey times the type colour, and nothing shows on near-black: a soft line takes a colour with some light in it
  if (inkState === 'soft') for (const it of items) it.mesh.material.color.set(readable(rt.palette.accent, rt.palette.background, 4.5));

  // ink: an outline copy of each glyph sits on it; the outline is drawn first, the fill floods in after
  const ink = rt.style.enter === 'ink';
  const outlines = new Map<GlyphMesh, GlyphMesh>();
  if (ink)
    for (const it of items) {
      const t = glyphTexture(it.glyph.char, outlineOf(it.style));
      const o = new THREE.Mesh(new THREE.PlaneGeometry(t.w, t.h), new THREE.MeshBasicMaterial({ map: t.texture, color: it.mesh.material.color.clone(), transparent: true, depthTest: false, depthWrite: false }));
      it.mesh.add(o);
      outlines.set(it.mesh, o);
    }

  // a marker stroke under each marked range, a sign beside each signed range
  // (a strike runs through the word in front of it, a box sits behind it like a marker)
  const look = (e: Emphasis) => (e.method === 'revise' ? (e.look ?? 'caret') : undefined);
  const marks = (rt.style.emphasis ?? []).filter((e) => ['mark', 'strike', 'box', 'revise'].includes(e.method)).map((e) => {
    // correction tape is the page's own paper laid over the word; a scribble and a stamp are their own drawings
    const l = look(e);
    const m = plane(l === 'scribble' ? scribbleTexture() : l === 'stamp' ? stampTexture() : l === 'tape' ? tapeTexture() : rt.style.budget ? cleanMarkerTexture() : markerTexture(), l === 'tape' ? tapeColor(rt.palette.background) : accent.clone());
    m.renderOrder = e.method === 'mark' || e.method === 'box' ? -1 : 5;
    layer.group.add(m);
    return { e, m, its: items.filter((x) => inRange(x, e.from, e.to)) };
  });
  // revise: a caret drawn under the struck word's end once the strike is through, where the right word goes in
  const carets = (rt.style.emphasis ?? []).filter((e) => look(e) === 'caret').map((e) => {
    const m = plane(caretTexture(), accent.clone());
    layer.group.add(m);
    return { e, m, its: items.filter((x) => inRange(x, e.from, e.to)) };
  });
  const signs = (rt.style.emphasis ?? []).filter((e) => e.method === 'symbol' && e.symbol).map((e) => {
    const m = plane(signTexture(e.symbol!), accent.clone());
    layer.group.add(m);
    return { e, m, its: items.filter((x) => inRange(x, e.from, e.to)) };
  });

  // glitch: a second, colour-split copy of each glyph that slips sideways while the line breaks up
  const glitch = rt.style.exit === 'glitch';
  const splits = new Map<GlyphMesh, GlyphMesh>();
  if (glitch)
    for (const it of items) {
      const s = new THREE.Mesh(it.mesh.geometry, new THREE.MeshBasicMaterial({ map: it.mesh.material.map, color: accent.clone(), transparent: true, depthTest: false, depthWrite: false, opacity: 0 }));
      s.renderOrder = -1;
      it.mesh.add(s);
      splits.set(it.mesh, s);
    }
  // slash: a blade of light crosses the line, then every glyph is cut along it — its two halves (clip planes on the
  // glyph and on a twin of it) slide apart along the cut and fall away
  const slash = rt.style.exit === 'slash';
  const bladeTex = () =>
    canvasTexture('blade', 512, 32, (c) => {
      const g = c.createLinearGradient(0, 0, 512, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.12, 'rgba(255,255,255,1)');
      g.addColorStop(0.88, 'rgba(255,255,255,1)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, 512, 32);
      // soft top and bottom edges
      c.globalCompositeOperation = 'destination-in';
      const v = c.createLinearGradient(0, 0, 0, 32);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(0.5, 'rgba(0,0,0,1)');
      v.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = v;
      c.fillRect(0, 0, 512, 32);
    });
  const blade = slash ? plane(bladeTex(), new THREE.Color(1, 1, 1)) : undefined;
  const bladeGlow = slash ? plane(bladeTex(), new THREE.Color(1, 1, 1).lerp(accent, 0.5)) : undefined;
  if (blade && bladeGlow) {
    blade.material.blending = bladeGlow.material.blending = THREE.AdditiveBlending;
    layer.group.add(bladeGlow, blade);
  }
  const twins = new Map<GlyphMesh, GlyphMesh>();
  const cutA = new Map<GlyphMesh, THREE.Plane>();
  const cutB = new Map<GlyphMesh, THREE.Plane>();
  if (slash)
    for (const it of items) {
      const tw = new THREE.Mesh(it.mesh.geometry, new THREE.MeshBasicMaterial({ map: it.mesh.material.map, color: it.mesh.material.color, transparent: true, depthTest: false, depthWrite: false }));
      tw.visible = false;
      it.mesh.add(tw);
      twins.set(it.mesh, tw);
      cutA.set(it.mesh, new THREE.Plane());
      cutB.set(it.mesh, new THREE.Plane());
    }
  let cutting = false;

  // flap / slot: the glyph runs through other characters of the same line before it lands on its own. Their pictures
  // are made now, while this line's halo and ghost are set (made later, they would take another line's)
  const enter = rt.style.enter;
  const cycling = enter === 'flap' || enter === 'slot';
  const faces = new Map<GlyphMesh, { map: THREE.Texture; geo: THREE.PlaneGeometry }[]>();
  const home = new Map<GlyphMesh, { map: THREE.Texture | null; geo: THREE.PlaneGeometry }>();
  if (cycling) {
    const pool = [...new Set([...rt.cue.text].filter((c) => !/\s/.test(c)))];
    const pics = new Map<string, { map: THREE.Texture; geo: THREE.PlaneGeometry }>();
    for (const it of items) {
      home.set(it.mesh, { map: it.mesh.material.map, geo: it.mesh.geometry });
      const picks = Array.from({ length: DRAWN.flap.faces }, (_, j) => pool[Math.floor(hash(it.glyph.index, j + 11) * pool.length)]).filter((c) => c !== it.glyph.char);
      faces.set(
        it.mesh,
        picks.map((c) => {
          const key = `${c}|${it.style.family}|${it.style.weight}|${it.style.size}`;
          if (!pics.has(key)) {
            const t = glyphTexture(c, it.style);
            pics.set(key, { map: t.texture, geo: new THREE.PlaneGeometry(t.w, t.h) });
          }
          return pics.get(key)!;
        }),
      );
    }
  }
  // decode / scramble: random signs flicker through each place (in the accent) before it settles or after it breaks
  const scrambling = enter === 'decode' || rt.style.exit === 'scramble';
  const noise = new Map<GlyphMesh, { map: THREE.Texture; geo: THREE.PlaneGeometry }[]>();
  if (scrambling) {
    const pics = new Map<string, { map: THREE.Texture; geo: THREE.PlaneGeometry }>();
    for (const it of items) {
      if (!home.has(it.mesh)) home.set(it.mesh, { map: it.mesh.material.map, geo: it.mesh.geometry });
      noise.set(
        it.mesh,
        Array.from({ length: DRAWN.decode.faces }, (_, j) => {
          const c = SCRAMBLE[Math.floor(hash(it.glyph.index, j + 31 + v('decode.signs', 0, 97)) * SCRAMBLE.length)];
          const key = `${c}|${it.style.family}|${it.style.weight}|${it.style.size}`;
          if (!pics.has(key)) {
            const t = glyphTexture(c, it.style);
            pics.set(key, { map: t.texture, geo: new THREE.PlaneGeometry(t.w, t.h) });
          }
          return pics.get(key)!;
        }),
      );
    }
  }
  const inks = new Map(items.map((it) => [it.mesh, it.mesh.material.color.clone()]));
  const noisy = new Set<GlyphMesh>();
  const show = (m: GlyphMesh, pic: { map: THREE.Texture | null; geo: THREE.PlaneGeometry }) => {
    if (m.material.map === pic.map) return;
    m.material.map = pic.map as THREE.Texture;
    m.geometry = pic.geo;
    m.material.needsUpdate = true;
  };
  // slice: the glyph's upper half slides in from the left and its lower half (a clipped twin) from the right
  const halves = new Map<GlyphMesh, { tw: GlyphMesh; top: THREE.Plane; bottom: THREE.Plane }>();
  if (enter === 'slice' || enter === 'rip')
    for (const it of items) {
      const tw = new THREE.Mesh(it.mesh.geometry, new THREE.MeshBasicMaterial({ map: it.mesh.material.map, color: it.mesh.material.color, transparent: true, depthTest: false, depthWrite: false }));
      it.mesh.add(tw);
      const h = { tw, top: new THREE.Plane(), bottom: new THREE.Plane() };
      it.mesh.material.clippingPlanes = [h.top];
      tw.material.clippingPlanes = [h.bottom];
      halves.set(it.mesh, h);
    }
  // band-in: the line is cut across into a few wide strips by masks that stay put; a copy of each glyph per strip slides
  // home inside its mask, so the whole line is there, uncut, the moment the entrance ends
  const twinOf = (it: Item, planes: THREE.Plane[]) => {
    const tw = new THREE.Mesh(it.mesh.geometry, new THREE.MeshBasicMaterial({ map: it.mesh.material.map, color: it.mesh.material.color, transparent: true, depthTest: false, depthWrite: false }));
    tw.material.clippingPlanes = planes;
    tw.visible = false;
    // the keyline round a letter has its whole shape: on a cut piece it would show the letter early
    tw.userData['noVeil'] = true;
    it.mesh.add(tw);
    return tw;
  };
  const bandIn = enter === 'band-in';
  const blockWeights = bandIn ? cutPieces(rt.cue.text.trim()).map((p) => [...p.text].length) : [];
  const bandCount = bandEdges(blockWeights).length - 1;
  const bandPlanes = bandIn ? Array.from({ length: Math.max(bandCount, 3) }, () => [new THREE.Plane(), new THREE.Plane()]) : [];
  const bandTwins = new Map(bandIn ? items.map((it) => [it.mesh, bandPlanes.map((p) => twinOf(it, p))]) : []);
  // matrix-light: the unlit line waits; a copy above a falling edge lights it row by row
  const lightPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const litTwins = new Map(enter === 'matrix-light' ? items.map((it) => [it.mesh, twinOf(it, [lightPlane])]) : []);
  /** The line's block in world px, as it stands this frame. */
  const blockNow = () => {
    const pts = items.map((it) => ({ p: it.mesh.getWorldPosition(new THREE.Vector3()), half: (it.style.size * it.mesh.getWorldScale(new THREE.Vector3()).y) / 2 }));
    return { x0: Math.min(...pts.map((q) => q.p.x - q.half)), x1: Math.max(...pts.map((q) => q.p.x + q.half)), y0: Math.min(...pts.map((q) => q.p.y - q.half)), y1: Math.max(...pts.map((q) => q.p.y + q.half)), unit: Math.max(...pts.map((q) => q.half * 2)) };
  };

  // the whole-line arrivals (arrival.ts): every piece below is hidden or undone from the moment the entrance ends
  const arrival = isArrival(enter) ? enter : undefined;
  const lineSeed = Math.abs(Math.floor(hash(rt.cue.start, 43) * 1000) + (rt.song ?? 0));
  const sideDir = lineSeed % 2 ? 1 : -1;
  const spans = arrival ? phraseSpans(rt.cue.text.trim(), 3) : [];
  const phraseOf = (it: Item) => { const s = it.glyph.src ?? it.glyph.index; const i = spans.findIndex(([, b]) => s < b); return i < 0 ? spans.length - 1 : i; };
  const overlay = new THREE.Group();
  overlay.userData['decor'] = true;
  if (arrival) layer.group.add(overlay);
  const flat = (tint: THREE.ColorRepresentation) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: tint, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
    m.userData['noVeil'] = true;
    m.visible = false;
    overlay.add(m);
    return m;
  };
  const ink0 = items[0].mesh.material.color.clone();
  /** Frame px into this layer's own px. */
  const toLayer = (x: number, y: number) => layer.group.worldToLocal(new THREE.Vector3(x, y, 0));
  const layerScale = () => layer.group.getWorldScale(new THREE.Vector3()).x || 1;
  // panel-open: two unequal cloths meet off-centre on a phrase break, then slide away off the frame
  const doors = enter === 'panel-open' ? [-1, 1].map((d, i) => {
    const door = new THREE.Group();
    const tint = ink0.clone().lerp(new THREE.Color(rt.palette.background), i * v('door.tone', 0.06, 0.16));
    // the leading edge is cut cloth, a little uneven; a stitched line follows it and a soft shadow lifts it off the page
    const edge: [number, number][] = Array.from({ length: 13 }, (_, j) => [hash(j + i * 17, lineSeed % 97) * v('door.rough', 5, 11), 200 - (j * 400) / 12]);
    const cloth = outlineMesh([...edge, [3400, -200], [3400, 200]], tint, 'fibre');
    const shade = shadowMesh([...edge, [3400, -200], [3400, 200]], 13);
    const inset = v('door.stitch', 20, 38);
    const stitch = rectMesh(inset, -200, inset + 3, 200, accent.clone());
    stitch.material.opacity = 0.9;
    shade.renderOrder = 29;
    cloth.renderOrder = 30;
    stitch.renderOrder = 31;
    door.add(shade, cloth, stitch);
    door.visible = false;
    overlay.add(door);
    door.scale.x = d;
    return door;
  }) : [];
  const seamShare = doorSeam(spans.slice(0, -1).map(([, b]) => b / Math.max(1, [...rt.cue.text.trim()].length)), lineSeed, v('door.off', 0.08, 0.17));
  // phrase-mark: each phrase is drawn out behind a short rule; each piece of a phrase on a row keeps its own rule
  const markPlanes = new Map(enter === 'phrase-mark' ? items.map((it) => [it.mesh, new THREE.Plane(new THREE.Vector3(-1, 0, 0), 1e6)]) : []);
  // copies carry the wipe: the keyline round a letter has its whole shape, so the line itself waits at nothing
  const markTwins = new Map(enter === 'phrase-mark' ? items.map((it) => [it.mesh, twinOf(it, [markPlanes.get(it.mesh)!])]) : []);
  const markBars = new Map<string, GlyphMesh>();
  const onKey = (it: Item) => (rt.style.emphasis ?? []).some((e) => inRange(it, e.from, e.to));
  // wave-reveal: the line stands behind an uneven edge; a few copies of each glyph, each under its own stretch of that edge
  const WAVE_CUTS = 5;
  const waveTwins = new Map(enter === 'wave-reveal' ? items.map((it) => [it.mesh, Array.from({ length: WAVE_CUTS }, () => { const planes = [new THREE.Plane(), new THREE.Plane(), new THREE.Plane()]; return { planes, tw: twinOf(it, planes) }; })]) : []);
  const waveLines = new Map<number, THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>>();
  const WAVE_POINTS = 44;
  const waveLine = (row: number) => {
    const hit = waveLines.get(row);
    if (hit) return hit;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((WAVE_POINTS + 1) * 6), 3));
    g.setIndex(Array.from({ length: WAVE_POINTS }, (_, i) => [2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2]).flat());
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: ink0.clone(), transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
    m.frustumCulled = false;
    m.userData['noVeil'] = true;
    overlay.add(m);
    waveLines.set(row, m);
    return m;
  };
  // outline-seat: two heavy outlines of the whole character close on it from unequal distances
  const seatMeshes = new Map(enter === 'outline-seat' ? items.map((it) => {
    const tex = glyphTexture(it.glyph.char, heavyOutlineOf(it.style));
    const rings = [accent, it.mesh.material.color].map((tint) => {
      const o = new THREE.Mesh(new THREE.PlaneGeometry(tex.w, tex.h), new THREE.MeshBasicMaterial({ map: tex.texture, color: tint.clone(), transparent: true, depthTest: false, depthWrite: false, opacity: 0 }));
      o.userData['noVeil'] = true;
      o.renderOrder = -1;
      o.visible = false;
      it.mesh.add(o);
      return o;
    });
    return [it.mesh, rings];
  }) : []);
  // slat-face: fixed upright slats of the block turn from side-on, each with a sliver of its cloth's edge showing
  const slats = enter === 'slat-face' ? slatEdges(spans.map(([a, b]) => b - a), 3 + Math.round(v('slat.n', 0, 1.4))) : [];
  const slatCount = Math.max(0, slats.length - 1);
  const slatPlanes = Array.from({ length: slatCount }, () => [new THREE.Plane(), new THREE.Plane()]);
  const slatTwins = new Map(enter === 'slat-face' ? items.map((it) => [it.mesh, slatPlanes.map((p) => twinOf(it, p))]) : []);
  const slatSides = slatPlanes.map(() => flat(ink0.clone().lerp(new THREE.Color(rt.palette.background), 0.32)));
  // grain-resolve: the line's own characters as coarse dots, then fine ones, then themselves; nothing but its own ink
  const grainPics = new Map(enter === 'grain-resolve' ? items.map((it) => {
    home.set(it.mesh, { map: it.mesh.material.map, geo: it.mesh.geometry });
    return [it.mesh, GRAIN_PITCH.map((p) => ({ map: grainOf(it.mesh.material.map!, it.mesh.geometry.parameters.width, p * v('grain.pitch', 0.85, 1.2) * it.style.size), geo: it.mesh.geometry }))];
  }) : []);
  const curveMoves = curveKind(items.length);
  // a step for each stressed phrase, however long the line
  const stepCount = Math.max(2, Math.min(4, spans.length + 1));
  const groupRest = { p: layer.group.position.clone(), r: layer.group.rotation.z, s: layer.group.scale.x };

  // block: the character's hard thickness on a child of its own, so light can move on the side and never on the face
  const pieceOf = (it: Item, st: GlyphStyle, tint: THREE.ColorRepresentation) => {
    const tx = glyphTexture(it.glyph.char, st);
    const o = new THREE.Mesh(new THREE.PlaneGeometry(tx.w, tx.h), new THREE.MeshBasicMaterial({ map: tx.texture, color: tint, transparent: true, depthTest: false, depthWrite: false })) as unknown as GlyphMesh;
    o.renderOrder = -1;
    o.userData['noVeil'] = true;
    it.mesh.add(o);
    return o;
  };
  const sideRest = new THREE.Color(rt.palette.text).lerp(new THREE.Color(rt.palette.background), 0.52);
  const sideLit = new THREE.Color(rt.palette.text).lerp(new THREE.Color(rt.palette.background), 0.2);
  const sides = new Map(inkState === 'block' ? items.map((it) => [it.mesh, pieceOf(it, { ...it.style, press: pressDepth(it.style.size, inkShare(it.glyph.char, it.style)) }, sideRest.clone())]) : []);
  // edge: one warm outline just outside the character, its light held tight to it; a brighter stretch runs round it before reading
  const warmEdge = inkState === 'edge' ? new THREE.Color(readable(mixHex(rt.palette.accent, '#F7DDB0', 0.82), rt.palette.background, 3)) : undefined;
  const edges = new Map(inkState === 'edge' ? items.map((it) => [it.mesh, pieceOf(it, { ...it.style, weight: 700, glowEdge: true }, warmEdge!.clone())]) : []);
  const edgeRun = new Map(inkState === 'edge' ? items.map((it) => [it.mesh, pieceOf(it, { ...it.style, weight: 700, glowEdge: true }, new THREE.Color('#FFF3DC'))]) : []);
  const edgePlanes = [new THREE.Plane(new THREE.Vector3(-1, 0, 0), 1e6)];
  const runPlanes = [new THREE.Plane(), new THREE.Plane()];
  for (const o of edges.values()) o.material.clippingPlanes = edgePlanes;
  for (const o of edgeRun.values()) o.material.clippingPlanes = runPlanes;
  // reflection-rest: the last row once more below a rough waterline, short and faded
  const mirrored = rt.style.idle === 'reflection-rest';
  const pond = new THREE.Group();
  pond.userData['decor'] = true;
  if (mirrored) layer.group.add(pond);
  const fadeMap = mirrored ? canvasTexture('water-fade', 128, 96, (c) => {
    const f = c.createLinearGradient(0, 0, 0, 96);
    f.addColorStop(0, '#000');
    f.addColorStop(0.16, '#000');
    f.addColorStop(0.72, '#fff');
    c.fillStyle = f;
    c.fillRect(0, 0, 128, 96);
    // still water is broken by a few level streaks, further apart nearer the line; they stay where they are for all of the reading
    c.fillStyle = '#000';
    for (let i = 0; i < 9; i++) c.fillRect(hash(i, 4) * 96, 18 + i * i * 0.85, 26 + 60 * hash(i, 5), 1.6 + 1.6 * hash(i, 6));
  }) : undefined;
  const images = new Map(mirrored ? items.map((it) => {
    const o = new THREE.Mesh(it.mesh.geometry, new THREE.MeshBasicMaterial({ map: it.mesh.material.map, alphaMap: fadeMap, color: it.mesh.material.color.clone().lerp(new THREE.Color(rt.palette.background), 0.2), transparent: true, depthTest: false, depthWrite: false })) as unknown as GlyphMesh;
    o.renderOrder = -2;
    o.userData['noVeil'] = true;
    o.visible = false;
    it.mesh.add(o);
    return [it.mesh, o];
  }) : []);
  const WATER_POINTS = 64;
  const waterSeed = Math.floor(hash(rt.cue.start, 61) * 99);
  const waterEdge = tornLine(WATER_POINTS, waterSeed, 1);
  const water = mirrored ? (() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((WATER_POINTS + 1) * 6), 3));
    g.setIndex(Array.from({ length: WATER_POINTS }, (_, i) => [2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2]).flat());
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: mixHex(rt.palette.background, rt.palette.text, 0.62), transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
    m.frustumCulled = false;
    m.userData['noVeil'] = true;
    return m;
  })() : undefined;
  if (water) pond.add(water);
  // breath: a hand-drawn line under the last phrase, as long as the sound is held; it draws out before reading and then stays still
  const BREATH_POINTS = 40;
  const breath = rt.style.breath ? (() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((BREATH_POINTS + 1) * 6), 3));
    g.setIndex(Array.from({ length: BREATH_POINTS }, (_, i) => [2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2]).flat());
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: accent.clone(), transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
    m.frustumCulled = false;
    m.userData['noVeil'] = true;
    m.userData['decor'] = true;
    layer.group.add(m);
    return m;
  })() : undefined;
  // oval: a hand-drawn ring round the whole line, one stroke with a gap where it starts and stops; never over a character
  const OVAL_POINTS = 72;
  const ovalSeed = Math.floor(hash(rt.cue.start, 71) * 97);
  const oval = rt.style.oval ? (() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((OVAL_POINTS + 1) * 6), 3));
    g.setIndex(Array.from({ length: OVAL_POINTS }, (_, i) => [2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2]).flat());
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: accent.clone(), transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
    m.frustumCulled = false;
    m.userData['noVeil'] = true;
    m.userData['decor'] = true;
    layer.group.add(m);
    return m;
  })() : undefined;
  // icon: one small sign standing on the line's own ground, in the room the block leaves
  const iconHold = new THREE.Group();
  iconHold.userData['decor'] = true;
  const iconSign = rt.style.icon ? plane(signTexture(rt.style.icon), readable(rt.palette.accent, rt.palette.background, 3)) : undefined;
  const iconShade = rt.style.icon ? plane(canvasTexture('ground-shade', 64, 16, (c) => { const f = c.createRadialGradient(32, 8, 2, 32, 8, 30); f.addColorStop(0, 'rgba(255,255,255,0.75)'); f.addColorStop(1, 'rgba(255,255,255,0)'); c.save(); c.scale(1, 8 / 30); c.translate(0, 22); c.fillStyle = f; c.fillRect(0, -22, 64, 64); c.restore(); }), 0x000000) : undefined;
  if (iconSign && iconShade) {
    iconHold.add(iconShade, iconSign);
    layer.group.add(iconHold);
  }

  // the composer's exits (line-exit.ts): all of it hidden and undone while the line is up
  const exitKind = rt.style.exit;
  const exitSeed = Math.abs(Math.floor(hash(rt.cue.start, 53) * 1000) + (rt.song ?? 0));
  const exitText = rt.cue.text.trim();
  const exitSpans = exitKind === 'slat-close' || exitKind === 'band-out' ? phraseSpans(exitText, 3) : [];
  const exitLayer = new THREE.Group();
  exitLayer.userData['decor'] = true;
  exitLayer.visible = false;
  if (['band-out', 'line-fold'].includes(exitKind)) layer.group.add(exitLayer);
  // band-out and wave-dissolve: the block cut across into slices, a clipped copy of each glyph in each
  const sliceCount = exitKind === 'band-out' ? 3 + Math.round(v('bandout.n', 0, 1.4)) : exitKind === 'wave-dissolve' ? Math.round(v('wave.n', 15, 19)) : 0;
  const slicePlanes = Array.from({ length: sliceCount }, () => [new THREE.Plane(), new THREE.Plane()]);
  const sliceTwins = new Map(sliceCount ? items.map((it) => [it.mesh, slicePlanes.map((p) => twinOf(it, p))]) : []);
  const sliceEdges = exitKind === 'band-out' ? bandEdges(Array.from({ length: sliceCount }, (_, i) => 1 + 0.5 * hash(i, exitSeed))) : Array.from({ length: sliceCount + 1 }, (_, i) => i / sliceCount);
  // a strip is paper: the ground's own stock under its slice of type, a torn end and a shadow to lift it away
  const stripBacks = exitKind === 'band-out' ? slicePlanes.map((_, i) => {
    const edge = roughEdge([[-1000, -50], [1000, -50], [1000, 50], [-1000, 50]], exitSeed + i * 7, 2.6, 34);
    const face = outlineMesh(edge, rt.palette.background, 'fibre');
    const cast = shadowMesh(edge, 12);
    face.renderOrder = -2;
    cast.renderOrder = -3;
    const g = new THREE.Group();
    g.add(cast, face);
    exitLayer.add(g);
    return { g, face, cast };
  }) : [];
  // slat-close: upright slats of uneven width, closing on the key word
  const exitSlats = exitKind === 'slat-close' ? slatEdges(exitSpans.map(([a, b]) => b - a), 4 + Math.round(v('slatout.n', 0, 1.4))) : [];
  const exitSlatPlanes = exitSlats.slice(0, -1).map(() => [new THREE.Plane(), new THREE.Plane()]);
  const exitSlatTwins = new Map(exitSlats.length ? items.map((it) => [it.mesh, exitSlatPlanes.map((p) => twinOf(it, p))]) : []);
  // line-fold: a dry stroke per row, its far end running out of ink
  const foldEnd: 1 | -1 = v('fold.end', 0, 1) < 0.5 ? 1 : -1;
  const foldBars = new Map<number, { face: GlyphMesh }>();
  const dryTex = exitKind === 'line-fold' ? (() => {
    const c = Object.assign(document.createElement('canvas'), { width: 512, height: 48 });
    const g = c.getContext('2d')!;
    g.fillStyle = '#fff';
    for (let row = 0; row < 16; row++) {
      const stop = 512 * (0.72 + 0.28 * hash(row, exitSeed));
      for (let x = 0; x < stop; x += 3 + 7 * hash(x, row)) {
        const gap = (x / stop) ** 3 > hash(x, row + 40);
        if (!gap) g.fillRect(x, row * 3, 10, 3);
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })() : undefined;
  // echo-travel: a few copies in the line's own ink, only ever outside its reading
  const echoWay = ECHO_WAYS[exitSeed % ECHO_WAYS.length];
  const echoN = 1 + Math.round(v('echoout.n', 0, 1));
  const echoTwins = new Map(exitKind === 'echo-travel' ? items.map((it) => [it.mesh, Array.from({ length: echoN }, () => twinOf(it, []))]) : []);
  // pore-out: a copy of each glyph eaten away by a field of pores, the threshold rising through it
  const poreTwins = new Map(exitKind === 'pore-out' ? items.map((it, i) => {
    const tw = new THREE.Mesh(it.mesh.geometry, new THREE.MeshBasicMaterial({ map: it.mesh.material.map, color: it.mesh.material.color, alphaMap: poreMap((exitSeed + i) % 5), alphaTest: 0.02, transparent: true, depthTest: false, depthWrite: false }));
    tw.visible = false;
    tw.userData['noVeil'] = true;
    it.mesh.add(tw);
    return [it.mesh, tw];
  }) : []);
  // focus-out: each phrase goes soft in turn, as the focus walks off along the line
  const focusSpans = exitKind === 'focus-out' ? phraseSpans(exitText, 3) : [];
  const focusOf = (it: Item) => { const s = it.glyph.src ?? it.glyph.index; const i = focusSpans.findIndex(([, b]) => s < b); return i < 0 ? focusSpans.length - 1 : i; };
  const softTwins = new Map(exitKind === 'focus-out' ? items.map((it) => {
    const tw = new THREE.Mesh(it.mesh.geometry, new THREE.MeshBasicMaterial({ map: blurredOf(it.mesh.material.map!, it.style.size * 0.55), color: it.mesh.material.color, transparent: true, depthTest: false, depthWrite: false, opacity: 0 }));
    tw.visible = false;
    tw.userData['noVeil'] = true;
    it.mesh.add(tw);
    return [it.mesh, tw];
  }) : []);
  // rail-leave: one curved seam on the stage, shown only while a card runs along it
  const railRest = { p: layer.group.position.clone(), r: layer.group.rotation.z, s: layer.group.scale.clone() };
  const railLine = exitKind === 'rail-leave' ? (() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(41 * 6), 3));
    g.setIndex(Array.from({ length: 40 }, (_, i) => [2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2]).flat());
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: ink0.clone(), transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
    m.frustumCulled = false;
    m.renderOrder = -9;
    m.userData['noVeil'] = true;
    m.userData['decor'] = true;
    m.visible = false;
    return m;
  })() : undefined;

  // node-fold: each phrase ends as one ink point of its own size
  const nodeSpans = exitKind === 'node-fold' ? phraseSpans(exitText, 3) : [];
  const nodeOf = (it: Item) => { const c = it.glyph.src ?? it.glyph.index; const i = nodeSpans.findIndex(([, b]) => c < b); return i < 0 ? nodeSpans.length - 1 : i; };
  // an ink point: a soft-edged uneven drop with a speck or two thrown off it
  const nodeTex = () => canvasTexture('ink-drop', 64, 64, (c) => {
    c.fillStyle = '#fff';
    c.beginPath();
    for (let i = 0; i < 28; i++) { const a = (i / 28) * Math.PI * 2, r = 15 + 5 * hash(i, 5) + 2 * Math.sin(a * 2 + 1); c.lineTo(30 + Math.cos(a) * r, 34 + Math.sin(a) * r); }
    c.fill();
    for (const [x, y, r] of [[52, 16, 3.4], [12, 12, 2.2], [56, 50, 1.8]]) { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); }
  });
  const nodes = nodeSpans.map(() => {
    const m = plane(nodeTex(), ink0.clone());
    m.visible = false;
    m.userData['noVeil'] = true;
    m.userData['decor'] = true;
    layer.group.add(m);
    return m;
  });
  // relay: the accent's place as the line lands; it stops on the key word as reading starts
  const relayRest = rt.style.relay ? items.map((it) => it.mesh.material.color.clone()) : [];
  const relayInk = relayRest.find((c) => !c.equals(relayRest[0])) ? relayRest.reduce((a, c) => (relayRest.filter((x) => x.equals(c)).length > relayRest.filter((x) => x.equals(a)).length ? c : a)) : undefined;
  const relayTone = relayInk ? relayRest.find((c) => !c.equals(relayInk)) : undefined;
  const relayLen = relayInk ? relayRest.filter((c) => !c.equals(relayInk)).length : 0;
  const relayKey = relayInk ? relayRest.findIndex((c) => !c.equals(relayInk)) : 0;

  // glyph-shed: each character's own picture cut into crumbs; only where it has ink, and all of it, so nothing shifts at the start
  const crumbs = new Map(exitKind === 'glyph-shed' ? items.map((it, index) => {
    const img = it.mesh.material.map!.image as HTMLCanvasElement;
    const px = img.getContext('2d')!.getImageData(0, 0, img.width, img.height).data;
    const geo = it.mesh.geometry.parameters;
    const n = Math.round(v('shed.cells', 7, 9));
    const list: { m: GlyphMesh; at: number; dx: number; dy: number; salt: number; x: number; y: number }[] = [];
    const [gapX, gapY] = [(hash(index, exitSeed) - 0.5) * 0.5, -0.46];
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const [u0, v0] = [i / n, j / n];
        let ink = 0;
        for (let b = 0; b < 4; b++) for (let a = 0; a < 4; a++) ink += px[(Math.floor((v0 + (b + 0.5) / (4 * n)) * img.height) * img.width + Math.floor((u0 + (a + 0.5) / (4 * n)) * img.width)) * 4 + 3];
        if (ink < 200) continue;
        // two triangles a cell: torn scraps, not a grid of squares; a whisker over so no seam shows at the first frame
        const [cw, ch] = [(geo.width / n) * 1.05, (geo.height / n) * 1.05];
        const [ul, ur, vt, vb] = [u0, u0 + 1 / n, 1 - v0, 1 - v0 - 1 / n];
        const flip = hash(i + j * n, index) > 0.5;
        const tris: [number, number, number, number][][] = flip
          ? [[[-cw / 2, ch / 2, ul, vt], [cw / 2, ch / 2, ur, vt], [-cw / 2, -ch / 2, ul, vb]], [[cw / 2, ch / 2, ur, vt], [cw / 2, -ch / 2, ur, vb], [-cw / 2, -ch / 2, ul, vb]]]
          : [[[-cw / 2, ch / 2, ul, vt], [cw / 2, -ch / 2, ur, vb], [-cw / 2, -ch / 2, ul, vb]], [[-cw / 2, ch / 2, ul, vt], [cw / 2, ch / 2, ur, vt], [cw / 2, -ch / 2, ur, vb]]];
        tris.forEach((tri, k) => {
          const pl = new THREE.BufferGeometry();
          pl.setAttribute('position', new THREE.BufferAttribute(new Float32Array(tri.flatMap(([x, y]) => [x, y, 0])), 3));
          pl.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(tri.flatMap(([, , a, b]) => [a, b])), 2));
          const m = new THREE.Mesh(pl, new THREE.MeshBasicMaterial({ map: it.mesh.material.map, color: it.mesh.material.color, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide })) as unknown as GlyphMesh;
          m.visible = false;
          m.frustumCulled = false;
          m.userData['noVeil'] = true;
          it.mesh.add(m);
          const [x, y] = [(u0 + 0.5 / n - 0.5) * geo.width, (0.5 - v0 - 0.5 / n) * geo.height];
          const [rx, ry] = [x / geo.width - gapX, y / geo.height - gapY];
          const len = Math.hypot(rx, ry) || 1;
          list.push({ m, at: Math.min(1, len / 1.1), dx: rx / len, dy: ry / len, salt: index * 97 + i * 13 + j + k * 501, x, y });
        });
      }
    return [it.mesh, list];
  }) : []);

  // split: on the way out each glyph comes apart along its middle, the halves sliding opposite ways
  const parts = new Map<GlyphMesh, { tw: GlyphMesh; top: THREE.Plane; bottom: THREE.Plane }>();
  if (rt.style.exit === 'split')
    for (const it of items) {
      const tw = new THREE.Mesh(it.mesh.geometry, new THREE.MeshBasicMaterial({ map: it.mesh.material.map, color: it.mesh.material.color, transparent: true, depthTest: false, depthWrite: false }));
      tw.visible = false;
      it.mesh.add(tw);
      parts.set(it.mesh, { tw, top: new THREE.Plane(), bottom: new THREE.Plane() });
    }
  let splitting = false;
  // trail: faint copies where each glyph was a few frames ago (only while it moves)
  const TRAIL = [3, 6, 10];
  const ghosts = new Map<GlyphMesh, GlyphMesh[]>();
  const past = new Map<GlyphMesh, { m: THREE.Matrix4; o: number }[]>();
  let lastT = -1;
  if (rt.style.trail)
    for (const it of items) {
      ghosts.set(
        it.mesh,
        TRAIL.map(() => {
          const g = new THREE.Mesh(it.mesh.geometry, new THREE.MeshBasicMaterial({ map: it.mesh.material.map, color: it.mesh.material.color.clone().lerp(accent, 0.6), transparent: true, depthTest: false, depthWrite: false, opacity: 0 }));
          g.matrixAutoUpdate = false;
          g.renderOrder = -2;
          layer.group.add(g);
          return g;
        }),
      );
      past.set(it.mesh, []);
    }
  // hold: a wavering line runs on from the word's last character while the vowel is held
  const holds = (rt.style.emphasis ?? []).filter((e) => e.method === 'hold').map((e) => {
    const tex = waveTexture().clone();
    tex.wrapS = THREE.RepeatWrapping;
    tex.needsUpdate = true;
    const m = plane(tex, accent.clone());
    layer.group.add(m);
    return { e, m, tex, its: items.filter((x) => inRange(x, e.from, e.to)) };
  });

  // focus: a blurred copy of each glyph (its picture through a canvas blur) fades into the sharp one (six offset
  // copies instead read as a smudge)
  const blurs = new Map<GlyphMesh, GlyphMesh>();
  if (enter === 'focus')
    for (const it of items) {
      const c = new THREE.Mesh(it.mesh.geometry, new THREE.MeshBasicMaterial({ map: blurredOf(it.mesh.material.map!, it.style.size), color: it.mesh.material.color, transparent: true, depthTest: false, depthWrite: false, opacity: 0 }));
      it.mesh.add(c);
      blurs.set(it.mesh, c);
    }
  // slot / rise: the glyph is seen only through a window (a slot reel's, or above the line it rises from)
  const windowed = enter === 'slot' || enter === 'rise';
  const clips = new Map<GlyphMesh, [THREE.Plane, THREE.Plane]>();
  if (windowed)
    for (const it of items) {
      const pl: [THREE.Plane, THREE.Plane] = [new THREE.Plane(), new THREE.Plane()];
      clips.set(it.mesh, pl);
      clipWith(it.mesh, pl);
    }
  // clipWith reaches a glyph's children: the exit's copies keep their own cuts, not the entrance's window
  for (const it of items) {
    sliceTwins.get(it.mesh)?.forEach((tw, i) => (tw.material.clippingPlanes = slicePlanes[i]));
    exitSlatTwins.get(it.mesh)?.forEach((tw, i) => (tw.material.clippingPlanes = exitSlatPlanes[i]));
    for (const tw of echoTwins.get(it.mesh) ?? []) tw.material.clippingPlanes = [];
    for (const c of crumbs.get(it.mesh) ?? []) c.m.material.clippingPlanes = [];
  }
  // liquid: the keyword is an outline that fills from the bottom with the accent like a glass, its surface tilting
  const liquids = (rt.style.emphasis ?? [])
    .filter((e) => e.method === 'liquid')
    .flatMap((e) => items.filter((x) => inRange(x, e.from, e.to)))
    .map((it) => {
      const t = glyphTexture(it.glyph.char, outlineOf(it.style));
      const o = new THREE.Mesh(new THREE.PlaneGeometry(t.w, t.h), new THREE.MeshBasicMaterial({ map: t.texture, color: it.mesh.material.color.clone(), transparent: true, depthTest: false, depthWrite: false }));
      const level = new THREE.Plane();
      // on top of a slot / rise window, not instead of it (the outline keeps to the window too)
      const win = clips.get(it.mesh) ?? [];
      clipWith(it.mesh, [...win, level]);
      o.material.clippingPlanes = win;
      it.mesh.add(o);
      return { it, o, level, ink: it.mesh.material.color.clone() };
    });

  // karaoke: one ball in the accent that hops from character to character as each is sung
  const ball = enter === 'karaoke' ? plane(ballTexture(), accent.clone()) : undefined;
  if (ball) layer.group.add(ball);
  /** When each character is sung: the aligner's character times when they are real, else spread over the line. */
  const sungAt = (it: Item) => {
    const i = it.glyph.src ?? it.glyph.index;
    const c = rt.cue as { start: number; end?: number; charStarts?: number[]; charTimed?: boolean };
    if (c.charTimed && c.charStarts?.[i] !== undefined) return c.charStarts[i];
    const end = c.end ?? c.start + 2;
    return c.start + (i / Math.max(1, n - 1)) * 0.85 * (end - c.start);
  };
  // shuffle: each glyph starts in another one's place (a fixed shuffle of the line)
  const swapOf = new Map<GlyphMesh, GlyphMesh>();
  if (enter === 'shuffle') {
    const order = [...items].sort((a, b) => hash(a.glyph.index, 61) - hash(b.glyph.index, 61));
    items.forEach((it, i) => swapOf.set(it.mesh, order[i].mesh));
  }
  // shatter: each glyph is five wedges round its centre (twins clipped by two planes each) that crack and fly apart
  // the song's own glass: how many shards, how hard they fly, spin and fall, how long the crack holds
  const glass = (k: number, lo: number, hi: number) => lo + hash((rt.song ?? 0) % 100003, k + 0.5) * (hi - lo);
  const SHARDS = Math.round(glass(1, 4, 8)), FLING = glass(2, 1.6, 3.2), SPIN = glass(3, 4, 12), FALL = glass(4, 6, 12), CRACK = glass(5, 0.12, 0.3);
  const shards = new Map<GlyphMesh, { tw: GlyphMesh; local: [THREE.Plane, THREE.Plane]; world: [THREE.Plane, THREE.Plane]; mid: number }[]>();
  if (rt.style.exit === 'shatter')
    for (const it of items) {
      const off = hash(it.glyph.index, 71) * Math.PI * 2;
      shards.set(
        it.mesh,
        Array.from({ length: SHARDS }, (_, j) => {
          const a0 = off + (j / SHARDS) * Math.PI * 2, a1 = off + ((j + 1) / SHARDS) * Math.PI * 2;
          const tw = new THREE.Mesh(it.mesh.geometry, new THREE.MeshBasicMaterial({ map: it.mesh.material.map, color: it.mesh.material.color, transparent: true, depthTest: false, depthWrite: false }));
          tw.visible = false;
          it.mesh.add(tw);
          // the wedge between a0 and a1: on the left of the ray at a0 and on the right of the ray at a1
          const local: [THREE.Plane, THREE.Plane] = [new THREE.Plane(new THREE.Vector3(-Math.sin(a0), Math.cos(a0), 0), 0), new THREE.Plane(new THREE.Vector3(Math.sin(a1), -Math.cos(a1), 0), 0)];
          const world: [THREE.Plane, THREE.Plane] = [new THREE.Plane(), new THREE.Plane()];
          tw.material.clippingPlanes = world;
          return { tw, local, world, mid: (a0 + a1) / 2 };
        }),
      );
    }
  // echo: outlined copies of the word behind it, fanning out down and right and breathing back (Motion Prompt #134)
  const ECHOES = Math.round(songVary(rt, 'echo.n', 3, 5)), ECHO_STEP = songVary(rt, 'echo.step', 0.05, 0.1);
  const echoes = (rt.style.emphasis ?? [])
    .filter((e) => e.method === 'echo')
    .flatMap((e) => items.filter((x) => inRange(x, e.from, e.to)))
    .map((it) => {
      const t = glyphTexture(it.glyph.char, outlineOf(it.style));
      const copies = Array.from({ length: ECHOES }, () => {
        const o = new THREE.Mesh(new THREE.PlaneGeometry(t.w, t.h), new THREE.MeshBasicMaterial({ map: t.texture, color: accent.clone(), transparent: true, depthTest: false, depthWrite: false, opacity: 0 }));
        o.renderOrder = -1;
        it.mesh.add(o);
        return o;
      });
      return { it, copies };
    });
  // weight: the word's own picture, then heavier and heavier strokes swapped in as it swells (Motion Prompt #132)
  // the face's own weights from light to the line's, so the strokes thicken as the type designer drew them; a face with
  // one weight thickens by a thin added stroke (an added stroke of 9 % ran 我愛台妹 into one blot)
  const weightSteps = (st: GlyphStyle) => {
    const ws = (FONTS.find((f) => f.family === st.family)?.weights ?? []).filter((w) => w < st.weight && w >= songVary(rt, 'weight.from', 280, 420));
    return ws.length ? [...ws.slice(-3), st.weight].map((weight) => ({ ...st, weight })) : [0.012, 0.024, 0.035].map((k) => ({ ...st, embolden: (st.embolden ?? 0) + st.size * k }));
  };
  const weights = (rt.style.emphasis ?? [])
    .filter((e) => e.method === 'weight')
    .flatMap((e) => items.filter((x) => inRange(x, e.from, e.to)))
    .map((it) => {
      const steps = weightSteps(it.style);
      const light = 'embolden' in steps[0] && steps[0].weight === it.style.weight;
      // with the face's weights the last step is the line's own picture; with added strokes the first is
      const pics = steps.map((st) => { const t = glyphTexture(it.glyph.char, st); return { map: t.texture, geo: new THREE.PlaneGeometry(t.w, t.h) }; });
      return { it, pics: light ? [{ map: it.mesh.material.map as THREE.Texture, geo: it.mesh.geometry }, ...pics] : [...pics.slice(0, -1), { map: it.mesh.material.map as THREE.Texture, geo: it.mesh.geometry }] };
    });

  // shine: a white copy of each glyph, seen only inside a slanted band that sweeps across the word (Motion Prompt #22)
  const shines = (rt.style.emphasis ?? []).filter((e) => e.method === 'shine').map((e) => {
    const its = items.filter((x) => inRange(x, e.from, e.to));
    const band: [THREE.Plane, THREE.Plane] = [new THREE.Plane(), new THREE.Plane()];
    const glows = its.map((it) => {
      const g = new THREE.Mesh(it.mesh.geometry, new THREE.MeshBasicMaterial({ map: it.mesh.material.map, color: new THREE.Color(1, 1, 1), transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
      g.material.clippingPlanes = band;
      it.mesh.add(g);
      return g;
    });
    return { its, glows, band };
  });
  // faces: the word flicks through the video's other typefaces before it lands in its own (kittenjam 字體樣本)
  const FACES = [...new Set([rt.fonts?.display, rt.fonts?.body, rt.fonts?.script].filter(Boolean) as string[])];
  const faced = (rt.style.emphasis ?? [])
    .filter((e) => e.method === 'faces')
    .flatMap((e) => items.filter((x) => inRange(x, e.from, e.to)))
    .map((it) => {
      const families = [...new Set([...FACES, contrastFace(it.style.family)])].filter((f) => f !== it.style.family);
      return { it, own: { map: it.mesh.material.map as THREE.Texture, geo: it.mesh.geometry }, pics: families.map((family) => { const t = glyphTexture(it.glyph.char, { ...it.style, family }); return { map: t.texture, geo: new THREE.PlaneGeometry(t.w, t.h) }; }) };
    });

  const held = new Map<GlyphMesh, number>();
  const base = new Map<GlyphMesh, { p: THREE.Vector3; s: THREE.Vector3; r: number; o: number }>();
  // where a glyph is in the layer's own frame (templates nest rows in groups of their own) and how big it is there
  const tmp = new THREE.Vector3();
  const tmpS = new THREE.Vector3();
  const local = (m: GlyphMesh) => {
    const p = layer.group.worldToLocal(m.getWorldPosition(tmp)).clone();
    m.getWorldScale(tmpS);
    const g = layer.group.getWorldScale(new THREE.Vector3());
    return { x: p.x, y: p.y, s: tmpS.y / (g.y || 1) };
  };
  return {
    group: layer.group,
    framed: layer.framed,
    // a drawn entrance is readable once the last character to start it has finished it (same timing as drawn)
    readable: () => {
      const [a, b] = layer.readable();
      if (!DRAWN_ENTER.has(enter) || !items.length) return [a, b];
      // karaoke shows the whole line from the start, only dimmer until it is sung: it reads as soon as it is up
      if (enter === 'karaoke') return [Math.max(a, rt.showFrom + DRAWN.karaoke.sec), b];
      return [Math.max(a, Math.max(...items.map((it) => startOf(rt, it.glyph, n))) + enterSec(enter, rt.pace)), b];
    },
    update(t: number, fx: FrameFx) {
      // what the template set last frame, before the effects here moved it: a template that sets only some of a
      // glyph's state each frame (quiet sets position and opacity, not scale) would otherwise keep this pass's
      // changes and compound them frame on frame (a focus entrance grew the line to fill the frame)
      for (const [m, b] of base) {
        m.position.copy(b.p);
        m.scale.copy(b.s);
        m.rotation.z = b.r;
        m.material.opacity = b.o;
      }
      if (enter === 'corner-land') {
        layer.group.position.copy(groupRest.p);
        layer.group.rotation.z = groupRest.r;
        layer.group.scale.setScalar(groupRest.s);
      }
      layer.update(t, fx);
      for (const it of items) base.set(it.mesh, { p: it.mesh.position.clone(), s: it.mesh.scale.clone(), r: it.mesh.rotation.z, o: it.mesh.material.opacity });
      layer.group.updateMatrixWorld(true);
      // corner-land: the layer as a whole, paper and all, is swung about a point near one corner of its block
      if (enter === 'corner-land' && layer.group.parent) {
        const k = (t - rt.showFrom) / (ARRIVAL_SEC['corner-land'] * rt.pace);
        if (t >= rt.showFrom && k < 1) {
          const dir = rt.style.textCam?.dir ?? sideDir;
          const pose = cornerPose(k, dir, lineSeed, v('corner.reach', 0.8, 1.25));
          const b = blockNow();
          const pivot = layer.group.parent.worldToLocal(new THREE.Vector3(b.x0 + (b.x1 - b.x0) * pose.pivot[0], b.y0 + (b.y1 - b.y0) * pose.pivot[1], 0));
          const scaleUp = layer.group.parent.getWorldScale(new THREE.Vector3()).x || 1;
          const [dx, dy] = [groupRest.p.x - pivot.x, groupRest.p.y - pivot.y].map((x) => x * pose.scale);
          const [c, sn] = [Math.cos(pose.rot), Math.sin(pose.rot)];
          layer.group.position.set(pivot.x + dx * c - dy * sn + pose.dx / scaleUp, pivot.y + dx * sn + dy * c + pose.dy / scaleUp, groupRest.p.z);
          layer.group.rotation.z = groupRest.r + pose.rot;
          layer.group.scale.setScalar(groupRest.s * pose.scale);
          layer.group.updateMatrixWorld(true);
          for (const it of items) it.mesh.material.opacity *= Math.min(1, k * 7);
        }
      }
      const exiting = t > rt.exitAt;
      const q = clamp01((t - rt.exitAt) / Math.max(0.08, rt.exitDur));
      if (!exiting) for (const it of items) held.set(it.mesh, it.mesh.material.opacity);
      // scrubbed back before the exit: the shards go and each glyph has its own picture again
      if (!exiting) {
        for (const list of shards.values()) for (const sh of list) sh.tw.visible = false;
        if (rt.style.exit === 'pixel') for (const it of items) if (home.has(it.mesh) && !weights.length) show(it.mesh, home.get(it.mesh)!);
      }

      if (ink)
        for (const it of items) {
          const k = (t - startOf(rt, it.glyph, n)) / rt.pace;
          const line = easeOutCubic(k / DRAWN.ink.line);
          const fill = easeOutCubic((k - DRAWN.ink.fillFrom) / DRAWN.ink.fill);
          const base = it.mesh.material.opacity;
          const o = outlines.get(it.mesh)!;
          o.material.opacity = base * line * (1 - 0.6 * fill);
          o.material.color.copy(it.mesh.material.color);
          it.mesh.material.opacity = base * fill;
          // the outline is drawn on: it grows in from a little larger, like a pen closing the shape
          o.scale.setScalar(1 + 0.06 * v('ink.grow', 0.5, 1.8) * (1 - line));
        }

      // the glyph's box in world space (its plane's height at its world scale), for the clip planes
      const box = (m: GlyphMesh) => {
        const p = m.getWorldPosition(new THREE.Vector3());
        const half = (m.geometry.parameters.height * m.getWorldScale(new THREE.Vector3()).y) / 2;
        return { x: p.x, y: p.y, half };
      };

      if (cycling)
        for (const it of items) {
          const m = it.mesh;
          const k = (t - startOf(rt, it.glyph, n)) / rt.pace;
          const fs = faces.get(m)!;
          const steps = fs.length;
          // flap: one fold every 0.07 s; slot: the reel slows down toward its own character
          const u = enter === 'flap' ? k / DRAWN.flap.fold : steps * (1 - (1 - clamp01(k / DRAWN.slot.reel)) ** 2);
          const step = Math.floor(Math.max(0, u));
          const own = step >= steps || k < 0;
          const pic = own ? home.get(m)! : fs[step];
          if (m.material.map !== pic.map) {
            m.material.map = pic.map as THREE.Texture;
            m.geometry = pic.geo;
            m.material.needsUpdate = true;
          }
          const f = u - step;
          if (enter === 'flap' && !own) {
            // the leaf folds down the middle and opens on the next character, darker while it is edge-on
            m.scale.y *= Math.max(0.04, Math.abs(Math.cos(f * Math.PI)));
            m.material.opacity *= 0.7 + 0.3 * Math.abs(Math.cos(f * Math.PI));
          }
          if (enter === 'slot') {
            const b = box(m);
            // each character rolls down through the window; the last one lands with a small overshoot
            const off = own ? 1 - easeOutBack(clamp01((k - DRAWN.slot.reel) / DRAWN.slot.land)) : 1 - f;
            m.position.y += (off * b.half * 2) / Math.max(1e-6, m.getWorldScale(tmpS).y / (m.scale.y || 1));
            // the window stays where the glyph rests
            clips.get(m)![0].set(new THREE.Vector3(0, -1, 0), b.y + b.half);
            clips.get(m)![1].set(new THREE.Vector3(0, 1, 0), -(b.y - b.half));
          }
        }

      if (enter === 'rise')
        for (const it of items) {
          const m = it.mesh;
          const k = (t - startOf(rt, it.glyph, n)) / rt.pace;
          const b = box(m);
          const drop = 1 - easeOutCubic(k / DRAWN.rise.sec);
          // the glyph comes up from behind the line it sits on: nothing shows below its own baseline
          m.position.y -= drop * v('rise.depth', 1.05, 1.4) * b.half * 2 / Math.max(1e-6, m.getWorldScale(tmpS).y / (m.scale.y || 1));
          clips.get(m)![0].set(new THREE.Vector3(0, 1, 0), -(b.y - b.half));
          clips.get(m)![1].set(new THREE.Vector3(0, 1, 0), 1e6);
        }

      if (enter === 'focus')
        for (const it of items) {
          const m = it.mesh;
          const k = clamp01((t - startOf(rt, it.glyph, n)) / (DRAWN.focus.sec * rt.pace));
          const base = m.material.opacity;
          const c = blurs.get(m)!;
          // the soft one is there first (a little larger, coming closer), the sharp one fades in over it
          c.material.opacity = base * Math.min(1, k * 4) * (1 - easeInCubic(k));
          c.material.color.copy(m.material.color);
          m.material.opacity = base * easeInCubic(clamp01((k - 0.25) / 0.75));
          m.scale.multiplyScalar(1 + 0.1 * v('focus.near', 0.5, 2) * (1 - easeOutCubic(k)));
        }

      // decode: every place flickers from the moment the line shows; each settles on its own character in turn
      if (enter === 'decode')
        for (const it of items) {
          const m = it.mesh;
          const settle = startOf(rt, it.glyph, n) + DRAWN.decode.fold * DRAWN.decode.faces * rt.pace;
          const fs = noise.get(m)!;
          if (t >= settle) {
            show(m, home.get(m)!);
            // once: a template that colours its glyphs every frame keeps its own colour after this
            if (noisy.delete(m)) m.material.color.copy(inks.get(m)!);
            continue;
          }
          show(m, fs[Math.floor(Math.max(0, t - rt.showFrom) / (DRAWN.decode.fold * rt.pace)) % fs.length]);
          m.material.color.copy(accent);
          noisy.add(m);
          m.material.opacity *= 0.85;
        }

      if (bandIn) {
        const k = (t - rt.showFrom) / (DRAWN.bandIn.sec * rt.pace);
        const on = t >= rt.showFrom && k < 1;
        for (const list of bandTwins.values()) for (const tw of list) tw.visible = false;
        if (on) {
          const b = blockNow();
          // a wide single row is cut between its phrases, a block across its rows
          const wide = b.x1 - b.x0 > 2.4 * (b.y1 - b.y0);
          const edges = wide ? bandEdges(blockWeights) : bandEdges([1, 1 + v('band.mid', 0.2, 0.9), v('band.low', 0.7, 1.2)]);
          const count = Math.min(edges.length - 1, bandPlanes.length);
          const span: [number, number] = wide ? [b.x0, b.x1] : [b.y1, b.y0];
          // the strips reach just past the block so nothing is shaved off its edge
          const at = (e: number) => (e <= 0 ? span[0] + (wide ? -80 : 80) : e >= 1 ? span[1] + (wide ? 80 : -80) : span[0] + (span[1] - span[0]) * e);
          const first = v('band.first', 0, 1) < 0.5 ? 1 : -1;
          for (let i = 0; i < count; i++) {
            const [lo, hi] = bandPlanes[i];
            if (wide) {
              lo.set(new THREE.Vector3(1, 0, 0), -at(edges[i]));
              hi.set(new THREE.Vector3(-1, 0, 0), at(edges[i + 1]));
            } else {
              lo.set(new THREE.Vector3(0, -1, 0), at(edges[i]));
              hi.set(new THREE.Vector3(0, 1, 0), -at(edges[i + 1]));
            }
          }
          const reach = wide ? (b.y1 - b.y0) * 1.5 : Math.min(760, (b.x1 - b.x0) * 0.6);
          for (const it of items) {
            const list = bandTwins.get(it.mesh)!;
            const o = it.mesh.material.opacity;
            const parent = it.mesh.getWorldScale(new THREE.Vector3()).x || 1;
            list.forEach((tw, i) => {
              tw.visible = i < count;
              if (!tw.visible) return;
              const off = (bandOffset(i, count, k, first) * reach) / parent;
              tw.position.set(wide ? 0 : off, wide ? off : 0, 0);
              tw.material.opacity = o;
            });
            it.mesh.material.opacity = 0;
          }
        }
      }

      if (enter === 'matrix-light') {
        const k = (t - rt.showFrom) / (DRAWN.matrixLight.sec * rt.pace);
        const on = t >= rt.showFrom && k < 1;
        for (const tw of litTwins.values()) tw.visible = on;
        if (on) {
          const b = blockNow();
          const edge = b.y1 - (b.y1 - b.y0) * litShare(k, lightRows(b.y1 - b.y0, b.unit));
          lightPlane.set(new THREE.Vector3(0, 1, 0), -edge);
          for (const it of items) {
            const tw = litTwins.get(it.mesh)!;
            tw.material.opacity = it.mesh.material.opacity;
            it.mesh.material.opacity *= UNLIT;
          }
        }
      }

      if (arrival && arrival !== 'corner-land') {
        const k = (t - rt.showFrom) / (ARRIVAL_SEC[arrival] * rt.pace);
        const on = t >= rt.showFrom && k < 1;

        if (arrival === 'scale-steps') {
          const b = blockNow();
          const s = stepScale(k, stepCount, v('steps.from', 0.5, 0.62));
          const [cx, cy] = [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];
          if (on)
            for (const it of items) {
              const m = it.mesh;
              const p = m.getWorldPosition(new THREE.Vector3());
              const ps = m.parent!.getWorldScale(tmpS).x || 1;
              m.position.x += ((p.x - cx) * (s - 1)) / ps;
              m.position.y += ((p.y - cy) * (s - 1)) / ps;
              m.scale.multiplyScalar(s);
            }
        }

        if (arrival === 'curve-arrive' && on)
          for (const it of items) {
            const m = it.mesh;
            const wait = trainDelay(it.glyph.src ?? it.glyph.index, n, sideDir);
            const q = (k - wait) / (1 - 0.34);
            const p = curvePoint(q, sideDir, curveMoves, v('curve.far', 0.8, 1.2), v('curve.bend', 0.7, 1.3));
            const s = m.parent!.getWorldScale(tmpS).x || 1;
            m.position.x += p.x / s;
            m.position.y += p.y / s;
            m.rotation.z += p.rot;
            m.material.opacity *= q <= 0 ? 0 : clamp01(q * 6);
          }

        if (arrival === 'panel-open') {
          for (const d of doors) d.visible = on;
          if (on) {
            const b = blockNow();
            const ph = doorPhase(k);
            const [seam, cy, tall] = [b.x0 + (b.x1 - b.x0) * seamShare, (b.y0 + b.y1) / 2, b.y1 - b.y0 + b.unit * 0.56];
            const s = layerScale();
            doors.forEach((d, i) => {
              const off = i ? ph.right * (960 + 40 - seam) : -ph.left * (seam + 960 + 40);
              const at = toLayer(seam + off, cy);
              d.position.set(at.x, at.y, 0);
              d.scale.set((i ? 1 : -1) / s, (tall * ph.cover) / 400 / s, 1);
            });
            if (ph.cover < 1) for (const it of items) it.mesh.material.opacity = 0;
          }
        }

        if (arrival === 'phrase-mark') {
          // a row's pieces, read off the glyphs as they stand: it follows the line through its exit too
          const pieces = new Map<string, Item[]>();
          for (const it of [...items].sort((a, b) => a.mesh.getWorldPosition(tmp).y - b.mesh.getWorldPosition(new THREE.Vector3()).y)) {
            // one row, however its characters are stepped or sized: a row is what a gap of over half a character ends
            const y = it.mesh.getWorldPosition(tmp).y;
            const row = [...pieces.entries()].find(([key, its]) => key.startsWith(`${phraseOf(it)}:`) && Math.abs(its[0].mesh.getWorldPosition(new THREE.Vector3()).y - y) < it.style.size * it.mesh.getWorldScale(tmpS).y * 0.6);
            const key = row?.[0] ?? `${phraseOf(it)}:${pieces.size}`;
            pieces.set(key, [...(pieces.get(key) ?? []), it]);
          }
          const hidden = t < rt.showFrom;
          for (const [key, its] of pieces) {
            const pos = its.map((it) => ({ w: it.mesh.getWorldPosition(new THREE.Vector3()), half: (it.style.size * it.mesh.getWorldScale(tmpS).y) / 2, adv: (it.glyph.advance * it.mesh.getWorldScale(tmpS).x) / 2 }));
            const [x0, x1] = [Math.min(...pos.map((q) => q.w.x - q.adv)), Math.max(...pos.map((q) => q.w.x + q.adv))];
            const share = markShare(phraseOf(its[0]), Math.max(1, spans.length), k);
            const head = x0 + (x1 - x0 + 2) * share;
            for (const it of its) {
              const tw = markTwins.get(it.mesh)!;
              markPlanes.get(it.mesh)!.constant = head;
              tw.visible = on;
              if (!on) continue;
              tw.material.opacity = it.mesh.material.opacity;
              it.mesh.material.opacity = 0;
            }
            const bar = markBars.get(key) ?? (() => { const m = flat(ink0) as GlyphMesh; m.renderOrder = -1; markBars.set(key, m); return m; })();
            const unit = Math.max(...pos.map((q) => q.half)) * 2;
            const y = Math.min(...pos.map((q) => q.w.y)) - unit * v('mark.drop', 0.54, 0.6);
            const w = (x1 - x0) * share;
            const s = layerScale();
            const at = toLayer(x0 + w / 2, y);
            bar.visible = !hidden && share > 0;
            bar.position.set(at.x, at.y, 0);
            bar.scale.set(Math.max(0.01, w) / s, (unit * v('mark.weight', 0.04, 0.07) * (its.some(onKey) ? 1.7 : 1)) / s, 1);
            bar.material.opacity = on ? 1 : Math.max(...its.map((it) => it.mesh.material.opacity));
          }
        }

        if (arrival === 'wave-reveal') {
          for (const list of waveTwins.values()) for (const { tw } of list) tw.visible = on;
          for (const m of waveLines.values()) m.visible = on;
          if (on) {
            const b = blockNow();
            const rise = waveRise(k);
            const amp = b.unit * v('wave.amp', 0.11, 0.2);
            const stretch = v('wave.len', 0.8, 1.35);
            const rows = new Map<number, number>();
            for (const it of items) {
              const m = it.mesh;
              const p = m.getWorldPosition(new THREE.Vector3());
              const sw = m.getWorldScale(new THREE.Vector3());
              const half = (it.style.size * sw.y) / 2;
              const ground = p.y - half * 1.04;
              rows.set(Math.round(ground / 40), ground);
              const [left, wide] = [p.x - (m.geometry.parameters.width * sw.x) / 2, m.geometry.parameters.width * sw.x];
              const o = m.material.opacity;
              waveTwins.get(m)!.forEach(({ tw, planes }, j) => {
                const [xa, xb] = [left + (wide * j) / WAVE_CUTS, left + (wide * (j + 1)) / WAVE_CUTS];
                const [ya, yb] = [ground + waveEdge(xa, k, lineSeed, amp, stretch), ground + waveEdge(xb, k, lineSeed, amp, stretch)];
                planes[0].set(new THREE.Vector3(1, 0, 0), -xa);
                planes[1].set(new THREE.Vector3(-1, 0, 0), xb);
                const up = new THREE.Vector3(ya - yb, xb - xa, 0).normalize();
                planes[2].set(up, -(up.x * xa + up.y * ya));
                tw.position.y = -rise * it.style.size;
                tw.material.opacity = o;
              });
              m.material.opacity = 0;
            }
            // the edge itself, thin and uneven, gone as the line stands clear of it
            const s = layerScale();
            [...rows.values()].forEach((ground, r) => {
              const line = waveLine(r);
              line.visible = true;
              const pos = line.geometry.getAttribute('position') as THREE.BufferAttribute;
              const pad = b.unit * 0.42;
              for (let i = 0; i <= WAVE_POINTS; i++) {
                const u = i / WAVE_POINTS;
                const x = b.x0 - pad + (b.x1 - b.x0 + 2 * pad) * u;
                const y = ground + waveEdge(x, k, lineSeed, amp, stretch);
                const thick = (2 + 5 * Math.abs(Math.sin(x / 61 + lineSeed))) * Math.min(1, 6 * Math.min(u, 1 - u));
                const low = toLayer(x, y);
                pos.setXYZ(2 * i, low.x, low.y, 0);
                pos.setXYZ(2 * i + 1, low.x, low.y + thick / s, 0);
              }
              pos.needsUpdate = true;
              line.material.opacity = 1 - clamp01((k - 0.62) / 0.38);
            });
          }
        }

        if (arrival === 'outline-seat') {
          const ph = seatPhase(k, v('seat.far', 0.75, 1.3));
          const b = on ? blockNow() : undefined;
          for (const it of items) {
            const m = it.mesh;
            const rings = seatMeshes.get(m)!;
            rings.forEach((o) => (o.visible = on));
            if (!on || !b) continue;
            const p = m.getWorldPosition(new THREE.Vector3());
            const s = m.getWorldScale(tmpS).x || 1;
            const [cx, cy] = [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];
            const base = m.material.opacity;
            rings.forEach((o, i) => {
              const r = ph.rings[i];
              o.scale.setScalar(r.scale);
              o.position.set(((p.x - cx) * (r.scale - 1)) / s, ((p.y - cy) * (r.scale - 1)) / s, 0);
              o.material.opacity = base * r.alpha;
            });
            m.material.opacity = base * ph.solid;
          }
        }

        if (arrival === 'slat-face') {
          for (const list of slatTwins.values()) for (const tw of list) tw.visible = on;
          for (const side of slatSides) side.visible = on;
          if (on) {
            const b = blockNow();
            const fromLeft = sideDir > 0;
            const s = layerScale();
            const edgeAt = (e: number) => (e <= 0 ? b.x0 - 80 : e >= 1 ? b.x1 + 80 : b.x0 + (b.x1 - b.x0) * e);
            const turned = slatPlanes.map(([lo, hi], i) => {
              const [a, z] = [edgeAt(slats[i]), edgeAt(slats[i + 1])];
              const [cx, w] = [(a + z) / 2, z - a];
              const ang = slatTurn(i, slatCount, k, fromLeft, v('slat.turn', 1.05, 1.3));
              const c = Math.cos(ang);
              lo.set(new THREE.Vector3(1, 0, 0), -(cx - (w / 2) * c));
              hi.set(new THREE.Vector3(-1, 0, 0), cx + (w / 2) * c);
              const depth = Math.sin(ang) * b.unit * v('slat.depth', 0.09, 0.16);
              const side = slatSides[i];
              const at = toLayer(cx + (fromLeft ? 1 : -1) * ((w / 2) * c + depth / 2), (b.y0 + b.y1) / 2);
              side.position.set(at.x, at.y, 0);
              side.scale.set(Math.max(0.01, depth) / s, (b.y1 - b.y0) / s, 1);
              side.material.opacity = clamp01(k * 8) * Math.min(1, ang * 3);
              return { cx, c };
            });
            for (const it of items) {
              const m = it.mesh;
              const x = m.getWorldPosition(new THREE.Vector3()).x;
              const sx = m.getWorldScale(tmpS).x || 1;
              const o = m.material.opacity * clamp01(k * 8);
              slatTwins.get(m)!.forEach((tw, i) => {
                const { cx, c } = turned[i];
                tw.scale.x = c;
                tw.position.x = ((cx + (x - cx) * c - x) / sx);
                tw.material.opacity = o;
              });
              m.material.opacity = 0;
            }
          }
        }

        if (arrival === 'grain-resolve') {
          const b = on ? blockNow() : undefined;
          for (const it of items) {
            const m = it.mesh;
            const share = b ? clamp01((m.getWorldPosition(tmp).x - b.x0) / Math.max(1, b.x1 - b.x0)) : 1;
            const step = grainStep(sideDir > 0 ? share : 1 - share, on ? k : 1);
            show(m, step === 2 ? home.get(m)! : grainPics.get(m)![step]);
          }
        }
      }

      const kOf = (it: Item, sec: number) => (t - startOf(rt, it.glyph, n)) / (sec * rt.pace);
      if (enter === 'slice' || enter === 'rip')
        for (const it of items) {
          const m = it.mesh;
          const k = kOf(it, enter === 'rip' ? DRAWN.rip.sec : DRAWN.slice.sec);
          const h = halves.get(m)!;
          if (k < 0) m.material.opacity = 0;
          const off = it.style.size * 1.4 * v('slice.far', 0.7, 1.6) * (1 - easeOutCubic(clamp01(k)));
          m.position.x -= off;
          h.tw.position.set((2 * off) / (m.scale.x || 1), 0, 0);
          m.updateMatrixWorld(true);
          const y = m.getWorldPosition(new THREE.Vector3()).y;
          h.top.set(new THREE.Vector3(0, 1, 0), -y);
          h.bottom.set(new THREE.Vector3(0, -1, 0), y);
          h.tw.material.opacity = m.material.opacity;
          h.tw.material.color.copy(m.material.color);
          h.tw.visible = !((slash || rt.style.exit === 'split') && exiting);
        }

      if (enter === 'flip')
        for (const it of items) {
          const m = it.mesh;
          const k = kOf(it, DRAWN.flip.sec);
          // turns in on its vertical axis from edge-on, a little past flat and back
          const c = Math.abs(Math.cos((1 - easeOutBack(clamp01(k))) * Math.PI / 2));
          m.scale.x *= Math.max(0.02, c);
          m.material.opacity *= k < 0 ? 0 : 0.55 + 0.45 * c;
        }

      if (enter === 'stretch')
        for (const it of items) {
          const m = it.mesh;
          const k = clamp01(kOf(it, DRAWN.stretch.sec));
          // shoots up tall and thin, then springs back through a squash to its own shape
          const spring = Math.cos(k * Math.PI * 3.5) * Math.exp(-5 * k) * (k < 1 ? 1 : 0);
          m.scale.y *= Math.max(0.3, 1 + 1.8 * v('stretch.tall', 0.6, 1.2) * spring);
          m.scale.x *= 1 / Math.max(0.5, 1 + 0.9 * v('stretch.tall', 0.6, 1.2) * spring);
          m.material.opacity *= kOf(it, DRAWN.stretch.sec) < 0 ? 0 : clamp01(k * 6);
        }

      if (enter === 'shuffle') {
        // every glyph runs from the place it started in (another glyph's) to its own along a small arc
        const at = new Map(items.map((it) => [it.mesh, it.mesh.getWorldPosition(new THREE.Vector3())]));
        for (const it of items) {
          const m = it.mesh;
          const k = kOf(it, DRAWN.shuffle.sec);
          const e = easeOutCubic(clamp01(k)), from = at.get(swapOf.get(m)!)!, to = at.get(m)!;
          const w = from.clone().lerp(to, e);
          w.y += Math.sin(Math.PI * e) * Math.min(80, from.distanceTo(to) * songVary(rt, 'shuffle.arc', 0.2, 0.5)) * (it.glyph.index % 2 ? 1 : -1);
          m.position.copy(m.parent!.worldToLocal(w));
          if (k < 0) m.material.opacity = 0;
        }
      }

      if (enter === 'squash')
        for (const it of items) {
          const m = it.mesh;
          const k = kOf(it, DRAWN.squash.sec), u = clamp01(k), size = it.style.size;
          // a fall and three bounces, each 0.5 as high (time 1 + 2·0.71 + 2·0.5 + 2·0.35 of the first fall, as √height)
          const T = [1, 1.414, 1, 0.707], total = T.reduce((x, y) => x + y), hits = [1, 2.414, 3.414, 4.121].map((x) => x / total);
          const x = u * total;
          let h = 0;
          if (x < 1) h = 1 - x * x;
          else {
            let at = 1;
            for (let j = 1; j < T.length; j++) {
              if (x < at + T[j]) {
                const v = (x - at) / T[j];
                h = 0.5 ** j * 4 * v * (1 - v);
                break;
              }
              at += T[j];
            }
          }
          // squashed flat for a moment on every landing, less each time
          let sq = 0;
          hits.forEach((ht, j) => (sq = Math.max(sq, songVary(rt, 'squash.flat', 0.28, 0.45) * 0.6 ** j * (1 - clamp01(Math.abs(k - ht) / 0.035)))));
          m.position.y += h * size * songVary(rt, 'squash.height', 2.4, 4) - sq * size * 0.5;
          m.scale.x *= 1 + sq;
          m.scale.y *= 1 - sq;
          m.material.opacity *= k < 0 ? 0 : clamp01(k * 10);
        }

      if (enter === 'windup')
        for (const it of items) {
          const m = it.mesh;
          const k = kOf(it, DRAWN.windup.sec), u = clamp01(k), size = it.style.size, far = size * songVary(rt, 'windup.far', 1.8, 3.4);
          let dx: number, sx = 1, sy = 1, rot = 0;
          if (u < 0.35) {
            // backs off a little further and crouches, leaning back
            const w = u / 0.35, e = w * w * (3 - 2 * w);
            dx = -far - size * 0.5 * e;
            [sx, sy, rot] = [1 + 0.2 * e, 1 - 0.22 * e, 0.16 * e];
          } else if (u < 0.6) {
            // shoots home with a slight overshoot, stretched along the way and leaning into it
            const w = (u - 0.35) / 0.25, s = Math.sin(Math.PI * Math.min(1, w / 0.6));
            dx = (-far - size * 0.5) * (1 - easeOutBack(w));
            [sx, sy, rot] = [1 + 0.45 * s, 1 - 0.25 * s, -0.08 * s];
          } else {
            // lands and wobbles, width and height in turn
            const w = (u - 0.6) * DRAWN.windup.sec * rt.pace, b = 0.13 * Math.exp(-7 * w) * Math.sin(17 * w) * (u < 1 ? 1 : 0);
            dx = 0;
            [sx, sy] = [1 + b, 1 - b];
          }
          m.position.x += dx;
          m.scale.x *= sx;
          m.scale.y *= sy;
          m.rotation.z += rot;
          m.material.opacity *= k < 0 ? 0 : clamp01(k * 8);
        }

      if (enter === 'karaoke' && ball) {
        // the line waits dim; each character lights (with a small pop) as the ball lands on it
        const order = lead(items);
        for (const it of items) {
          const lit = t - sungAt(it);
          it.mesh.material.opacity *= t < rt.showFrom ? 0 : lit >= 0 ? 1 : 0.5;
          if (lit >= 0) it.mesh.scale.multiplyScalar(1 + 0.16 * (1 - easeOutCubic(lit / 0.22)));
        }
        const on = order.filter((x) => x.mesh.visible);
        ball.visible = on.length > 0 && t >= rt.showFrom;
        if (ball.visible) {
          const ats = on.map((x) => ({ ...local(x.mesh), size: x.style.size, at: sungAt(x) }));
          let j = ats.findIndex((a) => a.at > t);
          if (j < 0) j = ats.length;
          // from the character just sung to the next one, in one arch over the line; before the first it drops in
          const a = ats[Math.max(0, j - 1)], b = ats[Math.min(ats.length - 1, j)];
          const u = j === 0 ? 1 : j >= ats.length ? 1 : clamp01((t - a.at) / Math.max(0.05, b.at - a.at));
          // the hop runs from one character's top to the next one's, so a jump to the next row or column is one arc
          // (held over the higher row, it dropped 196 px in a frame on reaching the lower one)
          const size = a.size * a.s;
          // a column (vertical text) carries the ball down its right side, hopping outward; a row, over the tops
          const column = ats.slice(1).filter((q, k) => Math.abs(q.y - ats[k].y) > Math.abs(q.x - ats[k].x)).length * 2 > ats.length - 1;
          const drop = 1 - easeOutCubic((t - rt.showFrom) / 0.25);
          let x: number, y: number;
          if (column) {
            const [xa, xb] = [a.x + size * 0.72, b.x + size * 0.72];
            x = j === 0 ? xb + size * 1.2 * drop : xa + (xb - xa) * u + Math.sin(Math.PI * u) * size * 0.45;
            y = j === 0 ? b.y : a.y + (b.y - a.y) * u;
          } else {
            const [ta, tb] = [a.y + size * 0.75, b.y + size * 0.75];
            x = j === 0 ? b.x : a.x + (b.x - a.x) * u;
            y = j === 0 ? tb + size * 1.2 * drop : ta + (tb - ta) * u + Math.sin(Math.PI * u) * size * (0.55 + (Math.max(0, tb - ta) / size) * 0.5);
          }
          ball.position.set(x, y, 0);
          ball.scale.setScalar(size * songVary(rt, 'karaoke.ball', 0.18, 0.3));
          ball.material.opacity = Math.min(1, (t - rt.showFrom) * 8) * (exiting ? 1 - q : 1) * (j >= ats.length ? 1 - clamp01((t - a.at - 0.4) / 0.3) : 1);
        }
      }

      for (const { it, copies } of echoes) {
        const m = it.mesh;
        const from = startOf(rt, it.glyph, n) + 0.05;
        // fans out as the word lands, then breathes in and out a little while it is held
        const out = easeOutCubic((t - from) / 0.4) * (0.75 + 0.25 * Math.sin((t - from) * 2.6));
        copies.forEach((o, j) => {
          o.position.set((j + 1) * it.style.size * ECHO_STEP * out, -(j + 1) * it.style.size * ECHO_STEP * out, 0);
          o.material.opacity = (held.get(m) ?? m.material.opacity) * (0.55 - j * 0.12) * clamp01((t - from) * 5) * (exiting ? 1 - q : 1);
        });
      }

      for (const { its, glows, band } of shines) {
        const on = its.filter((x) => x.mesh.visible);
        if (!on.length) continue;
        const ws = on.map((x) => x.mesh.getWorldPosition(new THREE.Vector3()));
        const size = on[0].style.size * on[0].mesh.getWorldScale(new THREE.Vector3()).y;
        const x0 = Math.min(...ws.map((w) => w.x)) - size, x1 = Math.max(...ws.map((w) => w.x)) + size;
        // one sweep as the word lands, then again every few seconds while it is held
        const from = startOf(rt, on[0].glyph, n) + 0.15, period = v('shine.every', 2.2, 3.4);
        const u = t < from ? -1 : ((t - from) % period) / 0.55;
        const a = v('shine.slant', 0.25, 0.6), nrm = new THREE.Vector3(Math.cos(a), Math.sin(a), 0), half = size * v('shine.width', 0.25, 0.5);
        const c = new THREE.Vector3(x0 + (x1 - x0) * clamp01(u), ws[0].y, 0).dot(nrm);
        band[0].set(nrm, -(c - half));
        band[1].set(nrm.clone().negate(), c + half);
        glows.forEach((g, j) => (g.material.opacity = u >= 0 && u <= 1 ? 0.85 * (held.get(its[j].mesh) ?? 1) * (exiting ? 1 - q : 1) : 0));
      }

      for (const { it, own, pics } of faced) {
        // a new face every 0.09 s (× pace) from the word's start, its own face after the last
        const k = Math.floor((t - startOf(rt, it.glyph, n)) / (0.09 * rt.pace));
        show(it.mesh, k >= 0 && k < pics.length * 2 ? pics[(k + it.glyph.index) % pics.length] : own);
      }

      for (const { it, pics } of weights) {
        // one step heavier every 0.07 s from when the word is sung, held at the heaviest
        const k = Math.floor(Math.max(0, t - startOf(rt, it.glyph, n) - 0.1) / (0.07 * rt.pace));
        show(it.mesh, pics[Math.min(pics.length - 1, k)]);
      }

      for (const { e, m, tex, its } of holds) {
        const on = lead(its).filter((x) => x.mesh.visible && x.mesh.material.opacity > 0.05);
        m.visible = on.length > 0;
        if (!on.length) continue;
        const last = on[on.length - 1];
        const at = local(last.mesh);
        const size = last.style.size * at.s;
        const from = startOf(rt, last.glyph, n) + 0.1;
        const p = easeOutCubic((t - from) / 0.9);
        const w = Math.max(0.001, size * 2.4 * v('hold.len', 0.7, 1.3) * p);
        // the visible part of the wave grows with the line (repeat) so its waves keep their size
        tex.repeat.x = Math.max(0.001, (w / size) * 0.5);
        tex.offset.x = -t * 0.6;
        m.scale.set(w, size * 0.32 * v('hold.wave', 0.7, 1.4), 1);
        m.position.set(at.x + (last.glyph.advance / 2) * at.s + size * 0.12 + w / 2, at.y - size * 0.05, 0);
        m.material.opacity = 0.9 * (held.get(last.mesh) ?? 1) * clamp01((t - from) * 8) * (exiting ? 1 - q : 1) * (e.to > e.from ? 1 : 0);
      }

      for (const { it, o, level, ink: own } of liquids) {
        const m = it.mesh;
        const b = box(m);
        const from = startOf(rt, it.glyph, n) + 0.15;
        const k = easeOutCubic((t - from) / 0.9);
        // the surface rises from below the glyph to its top and keeps a slow slosh (a tilt of a few degrees)
        const tilt = 0.12 * v('liquid.slosh', 0.5, 1.6) * Math.sin((t - from) * 3.2 + it.glyph.index) * (0.4 + 0.6 * (1 - k));
        const top = b.y - b.half * 1.1 + k * b.half * 2.05;
        const nrm = new THREE.Vector3(-Math.sin(tilt), -Math.cos(tilt), 0);
        level.set(nrm, -nrm.dot(new THREE.Vector3(b.x, top, 0)));
        o.material.opacity = m.material.opacity;
        o.material.color.copy(own);
        m.material.color.copy(accent);
      }

      for (const { e, m, its } of marks) {
        const seen = lead(its).filter((x) => x.mesh.visible && x.mesh.material.opacity > 0.05).map((x) => ({ ...x, at: local(x.mesh) }));
        m.visible = seen.length > 0;
        if (!seen.length) continue;
        // a range a layout broke over two rows takes the row with most of it: one band spanning both sat between them
        // and covered the next row whole (stair, 誰かの / 栄光の…)
        const rowOf = (x: (typeof seen)[number]) => seen.filter((o) => Math.abs(o.at.y - x.at.y) < o.style.size * o.at.s * 0.5);
        const on = seen.map(rowOf).reduce((a, b) => (b.length > a.length ? b : a));
        const size = on[0].style.size * on[0].at.s;
        const x0 = Math.min(...on.map((x) => x.at.x - (x.glyph.advance / 2) * x.at.s));
        const x1 = Math.max(...on.map((x) => x.at.x + (x.glyph.advance / 2) * x.at.s));
        const mid = on.reduce((a, x) => a + x.at.y, 0) / on.length;
        const l = look(e);
        const kind =
          l === 'tape' ? { y: mid, h: 1.02, pad: 0.35, delay: 0.38 }
          : l === 'scribble' ? { y: mid, h: 0.7, pad: 0.2, delay: 0.38 }
          : l === 'stamp' ? { y: mid, h: 1.25, pad: 0.6, delay: 0.38 }
          : e.method === 'strike' || e.method === 'revise' ? { y: mid, h: 0.13, pad: 0.3, delay: 0.38 }
          : e.method === 'box' ? { y: mid, h: 1.18, pad: 0.45, delay: 0 }
          : { y: Math.min(...on.map((x) => x.at.y)) - size * 0.42, h: 0.24, pad: 0.2, delay: 0.12 };
        const y = e.method === 'mark' ? kind.y : mid;
        // drawn on left to right as the word is sung (or just after the line lands); a strike or a correction waits for
        // the word itself and runs at its pace: struck at once, the word was crossed out before anyone sang it
        const struck = e.method === 'strike' || e.method === 'revise';
        const first = on.reduce((a, x) => (x.glyph.src! < a.glyph.src! ? x : a)), last = on.reduce((a, x) => (x.glyph.src! > a.glyph.src! ? x : a));
        const from = struck ? Math.max(startOf(rt, on[0].glyph, n) + 0.15, sungAt(first)) : startOf(rt, on[0].glyph, n) + kind.delay;
        const p = easeOutCubic((t - from) / (struck ? Math.max(0.18, sungAt(last) - sungAt(first) + 0.12) : 0.18 + 0.03 * (e.to - e.from)));
        const full = x1 - x0 + size * kind.pad;
        if (l === 'stamp') {
          // a stamp lands whole, a little big, and settles askew
          const k = easeOutBack(clamp01((t - from) / 0.22));
          m.scale.set(Math.max(0.001, full * (1.3 - 0.3 * k)) * Math.min(1, k * 3), size * kind.h * (1.3 - 0.3 * k), 1);
          m.position.set(x0 - (size * kind.pad) / 2 + full / 2, y, 0);
          m.rotation.z = -0.09;
        } else {
          const w = full * p;
          m.scale.set(Math.max(0.001, w), size * kind.h, 1);
          m.position.set(x0 - (size * kind.pad) / 2 + w / 2, y, 0);
          m.rotation.z = (l === 'tape' ? -0.01 : -0.025) * v('mark.tilt', -1.5, 2.5);
        }
        m.material.opacity = (l === 'tape' ? 1 : 0.9) * Math.min(...on.map((x) => held.get(x.mesh) ?? x.mesh.material.opacity)) * (exiting ? 1 - q : 1);
      }

      for (const { m, its } of carets) {
        const on = lead(its).filter((x) => x.mesh.visible && x.mesh.material.opacity > 0.05);
        m.visible = on.length > 0;
        if (!on.length) continue;
        const last = on[on.length - 1];
        const at = local(last.mesh);
        const size = last.style.size * at.s;
        // once the strike is through the sung word
        const from = Math.max(startOf(rt, on[0].glyph, n) + 0.38, sungAt(last) + 0.12) + 0.22;
        const p = easeOutBack((t - from) / 0.25);
        m.scale.set(size * 0.55, size * 0.55 * Math.max(0, p), 1);
        m.position.set(at.x + (last.glyph.advance / 2) * at.s, at.y - size * 0.72, 0);
        m.material.opacity = clamp01((t - from) * 8) * (held.get(last.mesh) ?? 1) * (exiting ? 1 - q : 1);
      }

      for (const { e, m, its } of signs) {
        const on = lead(its).filter((x) => x.mesh.visible && x.mesh.material.opacity > 0.05);
        m.visible = on.length > 0;
        if (!on.length) continue;
        const last = on[on.length - 1];
        const at = local(last.mesh);
        const size = last.style.size * at.s;
        const from = startOf(rt, last.glyph, n) + 0.08;
        const pop = easeOutBack((t - from) / 0.3);
        const s = size * 0.5 * v('sign.size', 0.8, 1.25) * Math.max(0, pop);
        m.scale.set(s, s, 1);
        m.position.set(at.x + (last.glyph.advance / 2) * at.s + size * 0.18, at.y + size * 0.48 + Math.sin((t - from) * 3) * size * 0.03, 0);
        m.rotation.z = 0.18 * v('sign.tilt', -1, 1.6) + 0.06 * Math.sin((t - from) * 2.1 + e.from);
        m.material.opacity = Math.min(1, clamp01((t - from) * 6)) * (held.get(last.mesh) ?? 1) * (exiting ? 1 - easeInCubic(q) : 1);
      }

      if (glitch && exiting) {
        // broken signal: positions jump in steps (15 a second), rows squash, the colour copy slips, the line flickers out
        const step = Math.floor(t * v('glitch.hz', 10, 20));
        const amp = (0.25 + 0.75 * easeInCubic(q)) * v('glitch.amp', 0.6, 1.3);
        for (const it of items) {
          const i = it.glyph.index;
          const size = it.style.size;
          const jump = hash(i * 0.37, step) < 0.55 ? (hash(i, step) - 0.5) * size * 0.7 * amp : 0;
          it.mesh.position.x += jump;
          it.mesh.scale.y *= 1 - 0.45 * amp * (hash(step, i) < 0.3 ? 1 : 0);
          const flicker = hash(step * 1.3, i) < 0.25 + 0.5 * q ? 0.15 : 1;
          it.mesh.material.opacity = (held.get(it.mesh) ?? 1) * (1 - easeInCubic(q)) * flicker;
          const sp = splits.get(it.mesh)!;
          sp.position.x = (hash(step, i * 3) - 0.3) * size * 0.18 * amp;
          sp.material.opacity = it.mesh.material.opacity * 0.85;
        }
        fx.shake = Math.max(fx.shake, 0.15 * (1 - q));
      }

      if (rt.style.exit === 'scramble' && exiting)
        for (const it of items) {
          const m = it.mesh;
          // each character breaks into flickering signs in turn, then the noise fades out
          const from = rt.exitAt + it.glyph.index * Math.min(0.03, rt.exitDur / Math.max(1, n) / 2);
          if (t < from) continue;
          const fs = noise.get(m)!;
          show(m, fs[Math.floor((t - from) / DRAWN.decode.fold) % fs.length]);
          m.material.color.copy(accent);
          m.material.opacity = (held.get(m) ?? 1) * (1 - easeInCubic(q));
        }

      if (rt.style.exit === 'pixel' && exiting)
        for (const it of items) {
          // the picture coarsens into bigger and bigger blocks as it fades (Motion Prompt #141)
          const own = home.get(it.mesh) ?? { map: it.mesh.material.map, geo: it.mesh.geometry };
          if (!home.has(it.mesh)) home.set(it.mesh, own);
          const block = Math.round([3, 5, 8, 12, 18, 26][Math.min(5, Math.floor(q * 6))] * songVary(rt, 'pixel.block', 0.7, 1.4));
          const map = own.map && pixelOf(own.map, block);
          if (map) show(it.mesh, { map, geo: own.geo });
        }

      if (rt.style.exit === 'shatter' && exiting)
        for (const it of items) {
          const m = it.mesh;
          const o = held.get(m) ?? 1;
          // cracks for the first fifth (the wedges a hair apart), then the shards fly out, fall and spin (Motion Prompt #142)
          const fly = Math.max(0, q - CRACK) / (1 - CRACK), sec = fly * rt.exitDur * 1.25;
          m.material.opacity = 0;
          for (const [j, sh] of shards.get(m)!.entries()) {
            const sp = it.style.size * (FLING + 2 * hash(it.glyph.index, j + 81));
            const crack = it.style.size * 0.02 * clamp01(q / CRACK);
            sh.tw.visible = true;
            sh.tw.position.set(Math.cos(sh.mid) * (crack + sp * sec), Math.sin(sh.mid) * (crack + sp * sec) + sp * 0.5 * sec - it.style.size * FALL * sec * sec, 0);
            sh.tw.rotation.z = (hash(it.glyph.index, j + 91) - 0.5) * SPIN * sec;
            sh.tw.scale.setScalar(1 - 0.35 * fly);
            sh.tw.material.opacity = o * (1 - easeInCubic(clamp01((fly - 0.35) / 0.65)));
            sh.tw.material.color.copy(m.material.color);
            sh.tw.updateMatrixWorld(true);
            sh.world.forEach((w, i) => w.copy(sh.local[i]).applyMatrix4(sh.tw.matrixWorld));
          }
        }

      if (sides.size) {
        const [from, to] = layer.readable();
        const lit = Math.max(1 - clamp01((t - (from - 0.34)) / 0.34), clamp01((t - to) / 0.3));
        for (const [m, o] of sides) {
          o.material.opacity = m.material.opacity;
          o.material.color.copy(sideRest).lerp(sideLit, lit);
        }
      }
      if (edges.size) {
        const k = (t - rt.showFrom) / (ARRIVAL_SEC['edge-light'] * rt.pace);
        const sweeping = enter === 'edge-light' && k < 1;
        const b = sweeping ? blockNow() : undefined;
        const head = b ? b.x0 - 40 + (b.x1 - b.x0 + 80) * clamp01(k) : 1e6;
        edgePlanes[0].constant = head;
        runPlanes[0].set(new THREE.Vector3(1, 0, 0), -(head - (b ? b.unit * 0.9 : 0)));
        runPlanes[1].set(new THREE.Vector3(-1, 0, 0), head);
        for (const [m, o] of edges) {
          o.material.opacity = m.material.opacity * 0.9;
          edgeRun.get(m)!.visible = sweeping && t >= rt.showFrom;
          edgeRun.get(m)!.material.opacity = m.material.opacity;
        }
      }
      if (mirrored && water) {
        const b = blockNow();
        const low = items.filter((it) => it.mesh.getWorldPosition(new THREE.Vector3()).y < b.y0 + b.unit * 0.8);
        const waterAt = b.y0 - b.unit * 0.1;
        const span = Math.max(...low.map((it) => it.mesh.getWorldPosition(new THREE.Vector3()).x)) - Math.min(...low.map((it) => it.mesh.getWorldPosition(new THREE.Vector3()).x)) + b.unit * 1.5;
        const pos = water.geometry.getAttribute('position') as THREE.BufferAttribute;
        const x0 = (b.x0 + b.x1) / 2 - span / 2;
        for (let i = 0; i <= WATER_POINTS; i++) {
          const x = x0 + (span * i) / WATER_POINTS;
          // a line of its own wandering width, broken in a few places, the shore's and not a ruler's
          const y = waterAt + waterEdge[i] * b.unit * v('water.rough', 0.035, 0.06);
          const w = hash(Math.floor(i / 5), waterSeed) > 0.8 ? 0 : (1.1 + 3 * hash(i, waterSeed + 3)) * Math.sin((i / WATER_POINTS) * Math.PI) ** 0.5;
          const [lo, hi] = [toLayer(x, y - w / 2), toLayer(x, y + w / 2)];
          pos.setXYZ(2 * i, lo.x, lo.y, 0);
          pos.setXYZ(2 * i + 1, hi.x, hi.y, 0);
        }
        pos.needsUpdate = true;
        const base = low.length ? Math.max(...low.map((it) => it.mesh.material.opacity)) : 0;
        water.material.opacity = base;
        for (const it of items) {
          const o = images.get(it.mesh)!;
          o.visible = low.includes(it);
          if (!o.visible) continue;
          const p = it.mesh.getWorldPosition(new THREE.Vector3());
          const ms = it.mesh.getWorldScale(tmpS).y || 1;
          o.scale.y = -0.62;
          o.position.y = (waterAt - (p.y - waterAt) * 0.62 - p.y) / ms;
          o.material.opacity = it.mesh.material.opacity * 0.85;
        }
      }
      if (oval) {
        const b = blockNow();
        const o = ovalFit({ x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 }, 960, 540);
        oval.visible = !!o;
        if (o) {
          const grow = easeOutCubic((t - rt.showFrom) / Math.max(0.2, layer.readable()[0] - rt.showFrom));
          const pos = oval.geometry.getAttribute('position') as THREE.BufferAttribute;
          for (let i = 0; i <= OVAL_POINTS; i++) {
            const p = ovalStroke((i / OVAL_POINTS) * grow, ovalSeed, v('ovalmark.tilt', -0.03, 0.03));
            const w = 1.8 + 3.4 * Math.sin((i / OVAL_POINTS) * Math.PI) ** 0.6 * (0.7 + 0.3 * hash(i >> 3, ovalSeed));
            const [x, y] = [p.x * o.a, p.y * o.b];
            const [lo, hi] = [toLayer(o.cx + x * (1 - w / (2 * o.a)), o.cy + y * (1 - w / (2 * o.b))), toLayer(o.cx + x * (1 + w / (2 * o.a)), o.cy + y * (1 + w / (2 * o.b)))];
            pos.setXYZ(2 * i, lo.x, lo.y, 0);
            pos.setXYZ(2 * i + 1, hi.x, hi.y, 0);
          }
          pos.needsUpdate = true;
          oval.material.opacity = Math.max(...items.map((it) => it.mesh.material.opacity));
        }
      }
      if (breath) {
        const row = [...items].sort((x, y) => (y.glyph.src ?? 0) - (x.glyph.src ?? 0)).slice(0, Math.min(items.length, 5));
        const pts = row.map((it) => it.mesh.getWorldPosition(new THREE.Vector3()));
        const unit = (row[0].style.size * row[0].mesh.getWorldScale(tmpS).y) / 2;
        const lastRow = row.filter((_, i) => Math.abs(pts[i].y - pts[0].y) < unit);
        const xs = lastRow.map((it) => it.mesh.getWorldPosition(new THREE.Vector3()).x);
        const end = Math.max(...xs) + unit;
        const seedB = Math.floor(hash(rt.cue.start, 67) * 97);
        const full = Math.min(end - Math.min(...xs) + unit, unit * (1.6 + 1.5 * rt.style.breath!));
        const grow = easeOutCubic((t - rt.showFrom) / Math.max(0.2, layer.readable()[0] - rt.showFrom));
        const pos = breath.geometry.getAttribute('position') as THREE.BufferAttribute;
        for (let i = 0; i <= BREATH_POINTS; i++) {
          const u = i / BREATH_POINTS;
          const off = breathLine(u, unit * v('breath.amp', 0.07, 0.13), 2 + Math.round(v('breath.n', 0, 1.4)), seedB);
          const w = 1 + 3.2 * (1 - u) ** 0.7 * Math.min(1, u * 8);
          const [x, y] = [end - full + full * u * grow, pts[0].y - unit * 1.2 + off];
          const [lo, hi] = [toLayer(x, y - w / 2), toLayer(x, y + w / 2)];
          pos.setXYZ(2 * i, lo.x, lo.y, 0);
          pos.setXYZ(2 * i + 1, hi.x, hi.y, 0);
        }
        pos.needsUpdate = true;
        breath.material.opacity = Math.max(...items.map((it) => it.mesh.material.opacity));
      }
      if (iconSign && iconShade) {
        const b = blockNow();
        const size = Math.min(130, b.unit * 0.62);
        const out = exiting ? 1 - easeInCubic(q) : 1;
        const pop = t < rt.showFrom ? 0 : easeOutBack((t - rt.showFrom) / 0.3);
        const beside = 960 - b.x1 > size * 1.5;
        const over = 540 - b.y1 > size * 1.7;
        const [x, ground] = beside ? [b.x1 + size * 0.8, b.y0 + b.unit * 0.1] : over ? [b.x1 - size * 0.6, b.y1 + size * 0.2] : [b.x0 - size * 0.8, b.y0 + b.unit * 0.1];
        const room = beside || over || b.x0 + 960 > size * 1.5;
        const s0 = layerScale();
        const at = toLayer(x, ground);
        iconHold.visible = room;
        iconHold.position.set(at.x, at.y, 0);
        iconHold.scale.setScalar(1 / s0);
        iconSign.scale.setScalar(size * Math.max(0.001, pop));
        iconSign.position.set(0, (size * 0.5 * pop), 0);
        iconShade.scale.set(size * 1.05, size * 0.2, 1);
        iconSign.material.opacity = out * Math.min(1, pop * 2);
        iconShade.material.opacity = 0.34 * out * Math.min(1, pop);
      }

      // the composer's exits: rest of the frame untouched, and every piece back in its box the moment the line is up again
      if (!exiting) {
        for (const list of sliceTwins.values()) for (const tw of list) tw.visible = false;
        for (const list of exitSlatTwins.values()) for (const tw of list) tw.visible = false;
        for (const list of echoTwins.values()) for (const tw of list) tw.visible = false;
        for (const list of crumbs.values()) for (const c of list) c.m.visible = false;
        for (const tw of poreTwins.values()) tw.visible = false;
        for (const tw of softTwins.values()) tw.visible = false;
        exitLayer.visible = false;
        if (railLine) railLine.visible = false;
        for (const m of nodes) m.visible = false;
        if (exitKind === 'rail-leave' || exitKind === 'gravity-pass') {
          layer.group.position.copy(railRest.p);
          layer.group.rotation.z = railRest.r;
          layer.group.scale.copy(railRest.s);
        }
      }
      if (relayInk && relayTone) {
        const [from] = layer.readable();
        const k = (t - rt.showFrom) / Math.max(0.05, from - rt.showFrom);
        const at = relayAt(k, relayKey);
        items.forEach((it, i) => {
          const on = k >= 1 ? false : i >= at && i < at + relayLen;
          it.mesh.material.color.copy(k >= 1 ? relayRest[i] : on ? relayTone : relayInk);
        });
      }
      if (exiting && exitKind === 'node-fold') {
        const ph = nodePhase(q);
        const b = blockNow();
        nodeSpans.forEach(([a, z], i) => {
          const own = items.filter((it) => nodeOf(it) === i);
          if (!own.length) return;
          const pts = own.map((it) => it.mesh.getWorldPosition(new THREE.Vector3()));
          const [cx, cy] = [pts.reduce((s, p) => s + p.x, 0) / pts.length, pts.reduce((s, p) => s + p.y, 0) / pts.length];
          own.forEach((it, j) => {
            const m = it.mesh;
            const ps = m.parent!.getWorldScale(tmpS).x || 1;
            m.position.x += ((cx - pts[j].x) * ph.gather) / ps;
            m.position.y += ((cy - pts[j].y) * ph.gather) / ps;
            m.scale.multiplyScalar(Math.max(0.02, 1 - ph.gather));
            m.material.opacity = (held.get(m) ?? 1) * (ph.gather >= 1 ? 0 : 1);
          });
          const dot = nodes[i];
          const s = (nodeSize(z - a, i, exitSeed, b.unit) * 3 * ph.dot) / layerScale();
          const at = toLayer(cx, cy);
          dot.visible = ph.dot > 0 && ph.fade < 1;
          dot.material.color.copy(own[0].mesh.material.color);
          dot.position.set(at.x, at.y, 0);
          dot.scale.setScalar(Math.max(0.001, s));
          dot.material.opacity = (1 - ph.fade) * Math.min(1, ph.dot * 3);
        });
      }
      if (exiting && exitKind === 'pore-out') {
        for (const it of items) {
          const tw = poreTwins.get(it.mesh)!;
          tw.visible = true;
          tw.material.alphaTest = Math.max(0.02, q * 1.03);
          tw.material.opacity = held.get(it.mesh) ?? 1;
          it.mesh.material.opacity = 0;
        }
      }
      if (exiting && exitKind === 'focus-out') {
        for (const it of items) {
          const m = it.mesh;
          const h = held.get(m) ?? 1;
          const k = focusShare(focusOf(it), focusSpans.length, q);
          const tw = softTwins.get(m)!;
          tw.visible = k > 0;
          m.scale.multiplyScalar(1 - 0.05 * q);
          m.material.opacity = h * (1 - clamp01(k * 2.4));
          tw.material.opacity = h * clamp01(k * 2.4) * (1 - clamp01((k - 0.5) / 0.5));
        }
      }
      if (exiting && (exitKind === 'rail-leave' || exitKind === 'gravity-pass')) {
        // measured from rest: last frame's move is still on the group
        layer.group.position.copy(railRest.p);
        layer.group.rotation.z = railRest.r;
        layer.group.scale.copy(railRest.s);
        layer.group.updateMatrixWorld(true);
        const b = blockNow();
        const [cx, cy] = [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];
        const dir = exitSeed % 2 ? 1 : -1;
        for (const it of items) it.mesh.material.opacity = held.get(it.mesh) ?? 1;
        const [pose, spin, sx] = (() => {
          if (exitKind === 'gravity-pass') {
            const g = gravityPose(q, dir);
            return [{ x: g.x, y: g.y, scale: 1, alpha: 1 }, g.rot, 1];
          }
          const to: [number, number] = [dir * v('rail.x', 620, 880), v('rail.y', 200, 380)];
          const bow = v('rail.bow', -220, -120);
          const r = railPose(q, [cx, cy], to, bow);
          if (railLine) {
            if (!railLine.parent && layer.group.parent) layer.group.parent.add(railLine);
            const pos = railLine.geometry.getAttribute('position') as THREE.BufferAttribute;
            const [mx, my] = [(cx + to[0]) / 2, (cy + to[1]) / 2 + bow];
            const inv = railLine.parent ? railLine.parent.matrixWorld.clone().invert() : new THREE.Matrix4();
            for (let i = 0; i <= 40; i++) {
              const lead = railAhead(q, ((b.x1 - b.x0) * 0.56 * r.scale) / Math.max(1, Math.hypot(to[0] - cx, to[1] - cy)));
              const u = lead + ((1 - lead) * i) / 40;
              const at = (a: number, c: number, e: number) => (1 - u) ** 2 * a + 2 * (1 - u) * u * c + u * u * e;
              const w = 2.2 * (1 - 0.7 * u);
              const p = new THREE.Vector3(at(cx, mx, to[0]), at(cy, my, to[1]), 0).applyMatrix4(inv);
              pos.setXYZ(2 * i, p.x, p.y + w, 0);
              pos.setXYZ(2 * i + 1, p.x, p.y - w, 0);
            }
            pos.needsUpdate = true;
            railLine.visible = true;
            railLine.material.color.copy(ink0);
            railLine.material.opacity = Math.min(1, q * 6) * (1 - clamp01((q - 0.82) / 0.18)) * 0.7;
          }
          for (const it of items) it.mesh.material.opacity *= r.alpha;
          return [r, r.rot, r.scale];
        })();
        // the block turns and shrinks about its own middle, and its middle travels
        const [cs, sn] = [Math.cos(spin), Math.sin(spin)];
        const local = toLayer(cx, cy);
        layer.group.rotation.z = railRest.r + spin;
        layer.group.scale.copy(railRest.s).multiplyScalar(sx);
        layer.group.position.set(railRest.p.x + pose.x + local.x * (railRest.s.x - sx * cs * railRest.s.x) + local.y * sn * sx * railRest.s.x, railRest.p.y + pose.y + local.y * (railRest.s.y - sx * cs * railRest.s.y) - local.x * sn * sx * railRest.s.x, 0);
      }
      if (exiting && (exitKind === 'band-out' || exitKind === 'wave-dissolve')) {
        const b = blockNow();
        const pad = b.unit * 0.3;
        const [top, tall] = [b.y1 + pad, b.y1 - b.y0 + pad * 2];
        const wave = exitKind === 'wave-dissolve';
        const thin = waveThin(q);
        const s = layerScale();
        exitLayer.visible = !wave;
        slicePlanes.forEach(([hi, lo], i) => {
          const [a, z] = [top - tall * sliceEdges[i], top - tall * sliceEdges[i + 1]];
          const cut = wave ? ((a - z) * (1 - thin.keep)) / 2 : 0;
          hi.set(new THREE.Vector3(0, -1, 0), a - cut);
          lo.set(new THREE.Vector3(0, 1, 0), -(z + cut));
          const dir = (i + (exitSeed % 2)) % 2 ? 1 : -1;
          const off = wave ? waveShift((a + z) / 2, q, b.unit * v('wave.len', 0.5, 0.8), b.unit * v('wave.amp', 0.24, 0.38)) : dir * 2100 * v('bandout.far', 0.9, 1.1) * stripShare(i, sliceCount, q);
          for (const it of items) {
            const tw = sliceTwins.get(it.mesh)![i];
            tw.visible = true;
            tw.position.x = off / (it.mesh.getWorldScale(tmpS).x || 1);
            tw.material.opacity = (held.get(it.mesh) ?? 1) * (wave ? thin.alpha : 1);
          }
          if (!wave) {
            const back = stripBacks[i];
            const at = toLayer((b.x0 + b.x1) / 2 + off, (a + z) / 2);
            back.g.position.set(at.x, at.y, 0);
            back.g.scale.set(((b.x1 - b.x0) / 2000 + 0.09) / s, (a - z) / 100 / s, 1);
            back.face.material.opacity = 1;
            back.cast.material.opacity = clamp01(q * 8);
          }
        });
        for (const it of items) it.mesh.material.opacity = 0;
      }
      if (exiting && exitKind === 'slat-close') {
        const b = blockNow();
        const key = items.filter(onKey).map((it) => it.mesh.getWorldPosition(new THREE.Vector3()).x);
        const focus = key.length ? key.reduce((a, x) => a + x, 0) / key.length : b.x0 + (b.x1 - b.x0) * v('slatout.at', 0.3, 0.7);
        const edge = (e: number) => (e <= 0 ? b.x0 - 80 : e >= 1 ? b.x1 + 80 : b.x0 + (b.x1 - b.x0) * e);
        const out = Math.max(focus - b.x0, b.x1 - focus, 1);
        const poses = exitSlatPlanes.map(([lo, hi], i) => {
          const [a, z] = [edge(exitSlats[i]), edge(exitSlats[i + 1])];
          const cx = (a + z) / 2;
          const w = z - a;
          const p = slatClose(cx, focus, q, Math.abs(cx - focus) / out);
          lo.set(new THREE.Vector3(1, 0, 0), -(cx + p.x - (w / 2) * p.c));
          hi.set(new THREE.Vector3(-1, 0, 0), cx + p.x + (w / 2) * p.c);
          return { cx, ...p };
        });
        for (const it of items) {
          const m = it.mesh;
          const x = m.getWorldPosition(new THREE.Vector3()).x;
          const sx = m.getWorldScale(tmpS).x || 1;
          exitSlatTwins.get(m)!.forEach((tw, i) => {
            const p = poses[i];
            tw.visible = true;
            tw.scale.x = Math.max(0.001, p.c);
            tw.position.x = (p.cx + p.x + (x - p.cx) * p.c - x) / sx;
            tw.material.opacity = held.get(m) ?? 1;
          });
          m.material.opacity = 0;
        }
      }
      if (exiting && exitKind === 'line-fold') {
        const b = blockNow();
        const down = b.y1 - b.y0 > (b.x1 - b.x0) * 1.2;
        const ph = foldPhase(q);
        const rows = new Map<number, Item[]>();
        for (const it of items) {
          const w = it.mesh.getWorldPosition(new THREE.Vector3());
          const key = Math.round((down ? w.x : w.y) / (b.unit * 0.8));
          rows.set(key, [...(rows.get(key) ?? []), it]);
        }
        const s = layerScale();
        exitLayer.visible = true;
        for (const bar of foldBars.values()) bar.face.visible = false;
        for (const [key, its] of rows) {
          const pts = its.map((it) => it.mesh.getWorldPosition(new THREE.Vector3()));
          const mid = pts.reduce((a, p) => a + (down ? p.x : p.y), 0) / pts.length;
          const lo = Math.min(...pts.map((p) => (down ? p.y : p.x))) - b.unit * 0.5;
          const hi = Math.max(...pts.map((p) => (down ? p.y : p.x))) + b.unit * 0.5;
          for (const it of its) {
            const m = it.mesh;
            const ps = m.parent!.getWorldScale(tmpS).x || 1;
            const w = m.getWorldPosition(new THREE.Vector3());
            if (down) m.position.x += ((mid - w.x) * ph.flat) / ps;
            else m.position.y += ((mid - w.y) * ph.flat) / ps;
            if (down) m.scale.x *= Math.max(0.03, 1 - ph.flat);
            else m.scale.y *= Math.max(0.03, 1 - ph.flat);
            m.material.opacity = (held.get(m) ?? 1) * (ph.flat >= 1 ? 0 : 1);
          }
          const bar = foldBars.get(key) ?? (() => {
            const m = flat(ink0.clone()) as GlyphMesh;
            m.parent?.remove(m);
            exitLayer.add(m);
            m.material.map = dryTex!;
            m.material.needsUpdate = true;
            const made = { face: m };
            foldBars.set(key, made);
            return made;
          })();
          const [a, z] = strokeLeft(lo, hi, foldEnd, ph.shrink);
          const at = down ? toLayer(mid, (a + z) / 2) : toLayer((a + z) / 2, mid);
          const thick = b.unit * v('fold.thick', 0.1, 0.16);
          bar.face.visible = ph.flat > 0.8 && z > a + 1;
          bar.face.material.color.copy(its[0].mesh.material.color);
          bar.face.material.opacity = ph.flat > 0.8 ? (held.get(its[0].mesh) ?? 1) : 0;
          bar.face.position.set(at.x, at.y, 0);
          bar.face.rotation.z = down ? Math.PI / 2 : 0;
          bar.face.scale.set(Math.max(0.5, z - a) / s * foldEnd, thick / s, 1);
        }
      }
      if (exiting && exitKind === 'echo-travel') {
        const b = blockNow();
        const [cx, cy] = [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];
        const reach = v('echoout.far', 0.8, 1.25);
        for (const it of items) {
          const m = it.mesh;
          const p = m.getWorldPosition(new THREE.Vector3());
          const sx = m.getWorldScale(tmpS).x || 1;
          const h = held.get(m) ?? 1;
          echoTwins.get(m)!.forEach((tw, i) => {
            const e = echoPose(echoWay, i, q, reach);
            tw.visible = true;
            tw.scale.setScalar(e.scale);
            tw.position.set(((p.x - cx) * (e.scale - 1) + e.dx) / sx, ((p.y - cy) * (e.scale - 1) + e.dy) / sx, 0);
            tw.material.opacity = h * e.alpha;
          });
          m.material.opacity = h * (1 - clamp01(q / 0.16));
        }
      }
      if (exiting && exitKind === 'radial-leave') {
        const b = blockNow();
        const [fx, fy] = pushFocus((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, b.x1 - b.x0, b.y1 - b.y0, exitSeed);
        const reach = v('push.far', 0.8, 1.2);
        for (const it of items) {
          const m = it.mesh;
          const p = m.getWorldPosition(new THREE.Vector3());
          const ps = m.parent!.getWorldScale(tmpS).x || 1;
          const r = radialShift(p.x, p.y, fx, fy, q, reach);
          m.position.x += r.dx / ps;
          m.position.y += r.dy / ps;
          m.scale.multiplyScalar(r.scale);
          m.material.opacity = (held.get(m) ?? 1) * r.alpha;
        }
      }
      if (exiting && exitKind === 'glyph-shed') {
        for (const it of items) {
          const m = it.mesh;
          const h = held.get(m) ?? 1;
          for (const c of crumbs.get(m)!) {
            const p = crumbPose(c.at, c.dx, c.dy, q, c.salt, it.style.size);
            c.m.visible = p.alpha > 0;
            c.m.position.set(c.x + p.x, c.y + p.y, 0);
            c.m.rotation.z = p.rot;
            c.m.scale.setScalar(p.scale);
            c.m.material.opacity = h * p.alpha;
          }
          m.material.opacity = 0;
        }
      }

      // collapse: the whole line flattens onto one rule across its middle and is gone
      if (rt.style.exit === 'collapse' && exiting) {
        const mid = items.reduce((a, x) => a + x.mesh.position.y, 0) / items.length;
        const e = easeInCubic(q);
        for (const { mesh: m } of items) {
          m.position.y += (mid - m.position.y) * e;
          m.scale.y *= Math.max(0.025, 1 - e);
          m.scale.x *= 1 + 0.18 * e;
          m.material.opacity *= q > 0.8 ? (1 - q) / 0.2 : 1;
        }
      }

      if (rt.style.exit === 'split' && exiting) {
        if (!splitting) {
          splitting = true;
          for (const [m, h] of parts) {
            m.material.clippingPlanes = [h.top];
            m.material.needsUpdate = true;
            h.tw.material.clippingPlanes = [h.bottom];
            h.tw.material.needsUpdate = true;
            h.tw.visible = true;
          }
        }
        for (const it of items) {
          const m = it.mesh;
          const h = parts.get(m)!;
          const e = easeInCubic(q);
          const off = it.style.size * 1.6 * v('split.far', 0.7, 1.5) * e;
          // the upper half leaves to the right, the lower to the left, opening a gap along the middle
          m.position.x += off;
          m.updateMatrixWorld(true);
          const y = m.getWorldPosition(new THREE.Vector3()).y;
          h.top.set(new THREE.Vector3(0, 1, 0), -y);
          h.bottom.set(new THREE.Vector3(0, -1, 0), y);
          h.tw.position.set((-2 * off) / (m.scale.x || 1), 0, 0);
          m.material.opacity = (held.get(m) ?? 1) * (1 - easeInCubic(clamp01((q - 0.3) / 0.7)));
          h.tw.material.opacity = m.material.opacity;
          h.tw.material.map = m.material.map;
          h.tw.material.color.copy(m.material.color);
        }
      }

      if (slash && blade && bladeGlow) {
        // the cut runs across the whole line at a fixed angle through its middle
        const ats = items.map((x) => local(x.mesh));
        const xs = ats.map((a) => a.x);
        const ys = ats.map((a) => a.y);
        const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
        const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
        const size = items[0].style.size * (ats[0]?.s ?? 1);
        const span = Math.max(...xs) - Math.min(...xs) + size * 2.4;
        const ang = (v('slash.dir', 0, 1) < 0.5 ? -1 : 1) * v('slash.angle', 0.15, 0.45);
        const dir = new THREE.Vector2(Math.cos(ang), Math.sin(ang));
        const sweep = easeOutCubic(q / 0.22);
        const bx = cx + (dir.x * (span * sweep - span)) / 2;
        const by = cy + (dir.y * (span * sweep - span)) / 2;
        blade.scale.set(Math.max(0.001, span * sweep), Math.max(6, size * 0.07), 1);
        bladeGlow.scale.set(Math.max(0.001, span * sweep), Math.max(24, size * 0.32), 1);
        for (const b of [blade, bladeGlow]) {
          b.rotation.z = ang;
          b.position.set(bx, by, 0);
        }
        blade.material.opacity = exiting ? 1 - clamp01((q - 0.3) / 0.3) : 0;
        bladeGlow.material.opacity = 0.45 * blade.material.opacity;
        if (exiting) {
          // the cut line in world space: halves move apart along its normal and slide along it in opposite ways
          const c0 = layer.group.localToWorld(new THREE.Vector3(cx, cy, 0));
          const c1 = layer.group.localToWorld(new THREE.Vector3(cx + dir.x, cy + dir.y, 0));
          const d = c1.sub(c0).normalize();
          const nrm = new THREE.Vector3(-d.y, d.x, 0);
          const worldSize = size * layer.group.getWorldScale(new THREE.Vector3()).y;
          const part = easeOutCubic(clamp01((q - 0.2) / 0.8));
          const gap = worldSize * 0.18 * v('slash.gap', 0.7, 1.5) * part;
          const slide = worldSize * 0.35 * v('slash.slide', 0.6, 1.5) * part;
          const fade = 1 - easeInCubic(clamp01((q - 0.45) / 0.55));
          if (!cutting) {
            cutting = true;
            for (const it of items) {
              it.mesh.material.clippingPlanes = [cutA.get(it.mesh)!];
              it.mesh.material.needsUpdate = true;
              const tw = twins.get(it.mesh)!;
              tw.material.clippingPlanes = [cutB.get(it.mesh)!];
              tw.material.needsUpdate = true;
              tw.visible = true;
            }
          }
          const base = c0.dot(nrm);
          for (const it of items) {
            const m = it.mesh;
            const w = m.getWorldPosition(new THREE.Vector3());
            // the upper half rises and slides forward, the lower one drops back
            const up = w.clone().addScaledVector(nrm, gap).addScaledVector(d, slide);
            m.position.copy(m.parent!.worldToLocal(up.clone()));
            m.updateMatrixWorld(true);
            const down = w.clone().addScaledVector(nrm, -gap).addScaledVector(d, -slide);
            const tw = twins.get(m)!;
            tw.position.copy(m.worldToLocal(down.clone()));
            tw.rotation.set(0, 0, 0);
            tw.scale.set(1, 1, 1);
            cutA.get(m)!.set(nrm, -(base + gap));
            cutB.get(m)!.set(nrm.clone().negate(), base - gap);
            const o = (held.get(m) ?? 1) * fade;
            m.material.opacity = o;
            tw.material.opacity = o;
          }
        }
      }

      if (rt.style.trail) {
        if (t < lastT || t - lastT > 0.2) for (const h of past.values()) h.length = 0;
        lastT = t;
        layer.group.updateMatrixWorld(true);
        const inv = layer.group.matrixWorld.clone().invert();
        for (const it of items) {
          const m = it.mesh;
          const h = past.get(m)!;
          const now = new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld);
          ghosts.get(m)!.forEach((g, i) => {
            const was = h[TRAIL[i] - 1];
            g.geometry = m.geometry;
            g.material.map = m.material.map;
            // a still glyph has no trail (its copies would only thicken it)
            const moved = was ? new THREE.Vector3().setFromMatrixPosition(was.m).distanceTo(new THREE.Vector3().setFromMatrixPosition(now)) : 0;
            g.visible = !!was && m.visible && moved > it.style.size * 0.06;
            if (!was) return;
            g.matrix.copy(was.m);
            g.matrixWorldNeedsUpdate = true;
            g.material.opacity = Math.min(was.o, m.material.opacity + 0.3) * [0.45, 0.28, 0.14][i];
          });
          h.unshift({ m: now, o: m.material.opacity });
          h.length = Math.min(h.length, TRAIL[TRAIL.length - 1]);
        }
      }
    },
  };
}
