// Text effects every template gets for free: after a template has placed and moved its glyphs for the frame, this
// pass adds what the style asks for on top — an ink entrance (the outline is drawn, then the fill floods in), a
// glitch or a blade-slash exit, and the emphasis kinds that are drawn rather than coloured (hollow type, a keyword in
// the contrasting face, a marker stroke under a word, a small sign by a word). Templates stay unaware of all of it.
import * as THREE from 'three';
import { contrastFace, FONTS } from '../fonts';
import { CueStyle, Emphasis, SymbolName } from '../treatment';
import { clamp01, easeInCubic, easeOutBack, easeOutCubic, Glyph, GlyphStyle, glyphTexture, hash } from './glyphs';
import { CueLayer, CueRuntime, DRAWN, enterSec, FrameFx, revealAt, songVary } from './runtime';

type GlyphMesh = THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
interface Item {
  mesh: GlyphMesh;
  glyph: Glyph;
  style: GlyphStyle;
}

/** Entrances drawn here over a plain cut: the template only places the glyphs. */
const DRAWN_ENTER = new Set(['ink', 'flap', 'slot', 'focus', 'rise', 'decode', 'slice', 'flip', 'stretch', 'shuffle', 'squash', 'windup', 'karaoke']);
/** Exits drawn here over a plain fade. */
const DRAWN_EXIT = new Set(['glitch', 'slash', 'scramble', 'split', 'pixel', 'shatter']);
const NEEDS_FX = (s: CueStyle) => DRAWN_ENTER.has(s.enter) || DRAWN_EXIT.has(s.exit) || !!s.trail || !!s.emphasis?.some((e) => ['hollow', 'face', 'mark', 'symbol', 'liquid', 'strike', 'box', 'hold', 'revise', 'echo', 'weight', 'shine', 'faces'].includes(e.method));
/** What a decoding line flickers through before each character settles. */
const SCRAMBLE = [...'#%&@$?!*+=<>/01ア゙ヲｦﾘ※◆▲■□'];

/** The style a template sees: entrances and exits drawn here are replaced by the plain ones they build on. */
export function templateStyle(s: CueStyle): CueStyle {
  return { ...s, enter: DRAWN_ENTER.has(s.enter) ? 'cut' : s.enter, exit: DRAWN_EXIT.has(s.exit) ? 'fade' : s.exit };
}

/** When glyph g (in cue-text order) starts its entrance: as sung for a word reveal, else a short stagger. */
const startOf = (rt: CueRuntime, g: Glyph, n: number) =>
  rt.style.reveal === 'word' ? revealAt(rt, (g.src ?? g.index) / Math.max(1, n - 1)) : rt.showFrom + (g.src ?? g.index) * 0.035 * rt.pace;

/** Swaps a glyph's picture for another style of the same character (outline, another face). */
function retexture(m: GlyphMesh, char: string, s: GlyphStyle) {
  const t = glyphTexture(char, s);
  m.material.map = t.texture;
  m.material.needsUpdate = true;
  m.geometry.dispose();
  m.geometry = new THREE.PlaneGeometry(t.w, t.h);
}

const outlineOf = (s: GlyphStyle): GlyphStyle => ({ ...s, shadow: false, embolden: 0, outline: Math.max(2.5, s.size * 0.035) });

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
const pixelated = new Map<THREE.Texture, Map<number, THREE.Texture>>();
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

const SIGN_PATHS: Record<SymbolName, (c: CanvasRenderingContext2D) => void> = {
  heart: (c) => {
    c.beginPath();
    c.moveTo(64, 108);
    c.bezierCurveTo(10, 72, 14, 22, 44, 22);
    c.bezierCurveTo(56, 22, 62, 30, 64, 40);
    c.bezierCurveTo(66, 30, 72, 22, 84, 22);
    c.bezierCurveTo(114, 22, 118, 72, 64, 108);
    c.fill();
  },
  star: (c) => {
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 ? 22 : 54;
      c.lineTo(64 + Math.cos(a) * r, 68 + Math.sin(a) * r);
    }
    c.fill();
  },
  sparkle: (c) => {
    c.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 4;
      const r = i % 2 ? 9 : 58;
      c.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r);
    }
    c.fill();
  },
  note: (c) => {
    c.beginPath();
    c.ellipse(44, 96, 20, 14, -0.4, 0, Math.PI * 2);
    c.fill();
    c.fillRect(58, 22, 8, 74);
    c.beginPath();
    c.moveTo(66, 22);
    c.quadraticCurveTo(100, 34, 92, 64);
    c.quadraticCurveTo(92, 42, 66, 40);
    c.fill();
  },
  flame: (c) => {
    c.beginPath();
    c.moveTo(64, 10);
    c.bezierCurveTo(98, 46, 104, 72, 92, 96);
    c.bezierCurveTo(82, 116, 46, 118, 36, 96);
    c.bezierCurveTo(26, 72, 44, 60, 50, 40);
    c.bezierCurveTo(56, 56, 62, 60, 66, 62);
    c.bezierCurveTo(70, 44, 68, 26, 64, 10);
    c.fill();
  },
  drop: (c) => {
    c.beginPath();
    c.moveTo(64, 12);
    c.bezierCurveTo(78, 44, 98, 62, 98, 82);
    c.arc(64, 82, 34, 0, Math.PI);
    c.bezierCurveTo(30, 62, 50, 44, 64, 12);
    c.fill();
  },
  bolt: (c) => {
    c.beginPath();
    for (const [x, y] of [[76, 8], [34, 72], [60, 72], [48, 120], [96, 52], [70, 52], [84, 8]]) c.lineTo(x, y);
    c.fill();
  },
  exclaim: (c) => {
    c.beginPath();
    c.moveTo(52, 10);
    c.lineTo(78, 10);
    c.lineTo(70, 84);
    c.lineTo(58, 84);
    c.fill();
    c.beginPath();
    c.arc(64, 106, 11, 0, Math.PI * 2);
    c.fill();
  },
  question: (c) => {
    c.lineWidth = 16;
    c.lineCap = 'round';
    c.strokeStyle = '#fff';
    c.beginPath();
    c.arc(64, 46, 24, Math.PI * 1.05, Math.PI * 0.45);
    c.quadraticCurveTo(64, 70, 64, 80);
    c.stroke();
    c.beginPath();
    c.arc(64, 108, 10, 0, Math.PI * 2);
    c.fill();
  },
  swirl: (c) => {
    c.lineWidth = 11;
    c.lineCap = 'round';
    c.strokeStyle = '#fff';
    c.beginPath();
    for (let a = 0; a < Math.PI * 4.2; a += 0.05) c.lineTo(64 + Math.cos(a) * a * 3.9, 64 + Math.sin(a) * a * 3.9);
    c.stroke();
  },
  flower: (c) => {
    for (let i = 0; i < 5; i++) {
      const a = (i * Math.PI * 2) / 5 - Math.PI / 2;
      c.beginPath();
      c.ellipse(64 + Math.cos(a) * 28, 64 + Math.sin(a) * 28, 22, 16, a, 0, Math.PI * 2);
      c.fill();
    }
    c.globalCompositeOperation = 'destination-out';
    c.beginPath();
    c.arc(64, 64, 11, 0, Math.PI * 2);
    c.fill();
  },
};
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

/** A glyph's picture softened by a canvas blur (cached per picture). */
const blurred = new Map<THREE.Texture, THREE.Texture>();
function blurredOf(tex: THREE.Texture, size: number) {
  const hit = blurred.get(tex);
  if (hit) return hit;
  const img = tex.image as HTMLCanvasElement;
  const cv = Object.assign(document.createElement('canvas'), { width: img.width, height: img.height });
  const c = cv.getContext('2d')!;
  // glyph canvases are drawn at 2× (glyphs.ts SS): about a tenth of the type size, inside the glyph's padding
  c.filter = `blur(${Math.round(size * 0.18)}px)`;
  c.drawImage(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  blurred.set(tex, t);
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
    const m = plane(l === 'scribble' ? scribbleTexture() : l === 'stamp' ? stampTexture() : l === 'tape' ? tapeTexture() : markerTexture(), l === 'tape' ? tapeColor(rt.palette.background) : accent.clone());
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
  if (enter === 'slice')
    for (const it of items) {
      const tw = new THREE.Mesh(it.mesh.geometry, new THREE.MeshBasicMaterial({ map: it.mesh.material.map, color: it.mesh.material.color, transparent: true, depthTest: false, depthWrite: false }));
      it.mesh.add(tw);
      const h = { tw, top: new THREE.Plane(), bottom: new THREE.Plane() };
      it.mesh.material.clippingPlanes = [h.top];
      tw.material.clippingPlanes = [h.bottom];
      halves.set(it.mesh, h);
    }
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
      layer.update(t, fx);
      for (const it of items) base.set(it.mesh, { p: it.mesh.position.clone(), s: it.mesh.scale.clone(), r: it.mesh.rotation.z, o: it.mesh.material.opacity });
      layer.group.updateMatrixWorld(true);
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

      const kOf = (it: Item, sec: number) => (t - startOf(rt, it.glyph, n)) / (sec * rt.pace);
      if (enter === 'slice')
        for (const it of items) {
          const m = it.mesh;
          const k = kOf(it, DRAWN.slice.sec);
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
