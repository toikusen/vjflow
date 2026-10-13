// Text effects every template gets for free: after a template has placed and moved its glyphs for the frame, this
// pass adds what the style asks for on top — an ink entrance (the outline is drawn, then the fill floods in), a
// glitch or a blade-slash exit, and the emphasis kinds that are drawn rather than coloured (hollow type, a keyword in
// the contrasting face, a marker stroke under a word, a small sign by a word). Templates stay unaware of all of it.
import * as THREE from 'three';
import { contrastFace } from '../fonts';
import { CueStyle, SymbolName } from '../treatment';
import { clamp01, easeInCubic, easeOutBack, easeOutCubic, Glyph, GlyphStyle, glyphTexture, hash } from './glyphs';
import { CueLayer, CueRuntime, FrameFx, revealAt } from './runtime';

type GlyphMesh = THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
interface Item {
  mesh: GlyphMesh;
  glyph: Glyph;
  style: GlyphStyle;
}

/** Entrances drawn here over a plain cut: the template only places the glyphs. */
const DRAWN_ENTER = new Set(['ink', 'flap', 'slot', 'focus', 'rise']);
const NEEDS_FX = (s: CueStyle) => DRAWN_ENTER.has(s.enter) || s.exit === 'glitch' || s.exit === 'slash' || !!s.emphasis?.some((e) => ['hollow', 'face', 'mark', 'symbol', 'liquid'].includes(e.method));

/** The style a template sees: entrances and exits drawn here are replaced by the plain ones they build on. */
export function templateStyle(s: CueStyle): CueStyle {
  return { ...s, enter: DRAWN_ENTER.has(s.enter) ? 'cut' : s.enter, exit: s.exit === 'glitch' || s.exit === 'slash' ? 'fade' : s.exit };
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
  const marks = (rt.style.emphasis ?? []).filter((e) => e.method === 'mark').map((e) => {
    const m = plane(markerTexture(), accent.clone());
    m.renderOrder = -1;
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
      const picks = Array.from({ length: 6 }, (_, j) => pool[Math.floor(hash(it.glyph.index, j + 11) * pool.length)]).filter((c) => c !== it.glyph.char);
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

  const held = new Map<GlyphMesh, number>();
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
    readable: () => {
      const [a, b] = layer.readable();
      return [ink ? a + 0.6 * rt.pace : cycling ? a + 0.5 * rt.pace : enter === 'focus' || enter === 'rise' ? a + 0.3 * rt.pace : a, b];
    },
    update(t: number, fx: FrameFx) {
      layer.update(t, fx);
      layer.group.updateMatrixWorld(true);
      const exiting = t > rt.exitAt;
      const q = clamp01((t - rt.exitAt) / Math.max(0.08, rt.exitDur));
      if (!exiting) for (const it of items) held.set(it.mesh, it.mesh.material.opacity);

      if (ink)
        for (const it of items) {
          const k = (t - startOf(rt, it.glyph, n)) / rt.pace;
          const line = easeOutCubic(k / 0.28);
          const fill = easeOutCubic((k - 0.22) / 0.34);
          const base = it.mesh.material.opacity;
          const o = outlines.get(it.mesh)!;
          o.material.opacity = base * line * (1 - 0.6 * fill);
          o.material.color.copy(it.mesh.material.color);
          it.mesh.material.opacity = base * fill;
          // the outline is drawn on: it grows in from a little larger, like a pen closing the shape
          o.scale.setScalar(1 + 0.06 * (1 - line));
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
          const u = enter === 'flap' ? k / 0.07 : steps * (1 - (1 - clamp01(k / 0.55)) ** 2);
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
            const off = own ? 1 - easeOutBack(clamp01((k - 0.55) / 0.25)) : 1 - f;
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
          const drop = 1 - easeOutCubic(k / 0.45);
          // the glyph comes up from behind the line it sits on: nothing shows below its own baseline
          m.position.y -= drop * 1.1 * b.half * 2 / Math.max(1e-6, m.getWorldScale(tmpS).y / (m.scale.y || 1));
          clips.get(m)![0].set(new THREE.Vector3(0, 1, 0), -(b.y - b.half));
          clips.get(m)![1].set(new THREE.Vector3(0, 1, 0), 1e6);
        }

      if (enter === 'focus')
        for (const it of items) {
          const m = it.mesh;
          const k = clamp01((t - startOf(rt, it.glyph, n)) / (0.6 * rt.pace));
          const base = m.material.opacity;
          const c = blurs.get(m)!;
          // the soft one is there first (a little larger, coming closer), the sharp one fades in over it
          c.material.opacity = base * Math.min(1, k * 4) * (1 - easeInCubic(k));
          c.material.color.copy(m.material.color);
          m.material.opacity = base * easeInCubic(clamp01((k - 0.25) / 0.75));
          m.scale.multiplyScalar(1 + 0.1 * (1 - easeOutCubic(k)));
        }

      for (const { it, o, level, ink: own } of liquids) {
        const m = it.mesh;
        const b = box(m);
        const from = startOf(rt, it.glyph, n) + 0.15;
        const k = easeOutCubic((t - from) / 0.9);
        // the surface rises from below the glyph to its top and keeps a slow slosh (a tilt of a few degrees)
        const tilt = 0.12 * Math.sin((t - from) * 3.2 + it.glyph.index) * (0.4 + 0.6 * (1 - k));
        const top = b.y - b.half * 1.1 + k * b.half * 2.05;
        const nrm = new THREE.Vector3(-Math.sin(tilt), -Math.cos(tilt), 0);
        level.set(nrm, -nrm.dot(new THREE.Vector3(b.x, top, 0)));
        o.material.opacity = m.material.opacity;
        o.material.color.copy(own);
        m.material.color.copy(accent);
      }

      for (const { e, m, its } of marks) {
        const on = lead(its).filter((x) => x.mesh.visible && x.mesh.material.opacity > 0.05).map((x) => ({ ...x, at: local(x.mesh) }));
        m.visible = on.length > 0;
        if (!on.length) continue;
        const size = on[0].style.size * on[0].at.s;
        const x0 = Math.min(...on.map((x) => x.at.x - (x.glyph.advance / 2) * x.at.s));
        const x1 = Math.max(...on.map((x) => x.at.x + (x.glyph.advance / 2) * x.at.s));
        const y = Math.min(...on.map((x) => x.at.y)) - size * 0.42;
        // drawn on left to right as the word is sung (or just after the line lands)
        const from = startOf(rt, on[0].glyph, n) + 0.12;
        const p = easeOutCubic((t - from) / (0.18 + 0.03 * (e.to - e.from)));
        const w = (x1 - x0 + size * 0.2) * p;
        m.scale.set(Math.max(0.001, w), size * 0.24, 1);
        m.position.set(x0 - size * 0.1 + w / 2, y, 0);
        m.rotation.z = -0.025;
        m.material.opacity = 0.9 * Math.min(...on.map((x) => held.get(x.mesh) ?? x.mesh.material.opacity)) * (exiting ? 1 - q : 1);
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
        const s = size * 0.5 * Math.max(0, pop);
        m.scale.set(s, s, 1);
        m.position.set(at.x + (last.glyph.advance / 2) * at.s + size * 0.18, at.y + size * 0.48 + Math.sin((t - from) * 3) * size * 0.03, 0);
        m.rotation.z = 0.18 + 0.06 * Math.sin((t - from) * 2.1 + e.from);
        m.material.opacity = Math.min(1, clamp01((t - from) * 6)) * (held.get(last.mesh) ?? 1) * (exiting ? 1 - easeInCubic(q) : 1);
      }

      if (glitch && exiting) {
        // broken signal: positions jump in steps (15 a second), rows squash, the colour copy slips, the line flickers out
        const step = Math.floor(t * 15);
        const amp = 0.25 + 0.75 * easeInCubic(q);
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

      if (slash && blade && bladeGlow) {
        // the cut runs across the whole line at a fixed angle through its middle
        const ats = items.map((x) => local(x.mesh));
        const xs = ats.map((a) => a.x);
        const ys = ats.map((a) => a.y);
        const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
        const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
        const size = items[0].style.size * (ats[0]?.s ?? 1);
        const span = Math.max(...xs) - Math.min(...xs) + size * 2.4;
        const ang = -0.3;
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
          const gap = worldSize * 0.18 * part;
          const slide = worldSize * 0.35 * part;
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
    },
  };
}
