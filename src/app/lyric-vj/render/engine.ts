// Lyric-VJ render engine: one frame for any time t (no wall clock). Plates (image / video frames) with camera moves,
// per-shot decoration, per-cue template layers, then bloom + grain/aberration/vignette/flash.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { textCamAt } from './text-cam';
import { CameraRig, isTrack, layPerspective, layScaleY, rigAt } from './camera-rig';
import { contrastSplit } from './contrast-split';
import { lyricCarrier } from './lyric-carrier';
import { worldPair, worldSet } from './world-layout';
import { clearOf } from './world-sets';
import { type CamPose, fitAtFloor, holdFalls, holdMultiple, playScale, readingTimes, TYPE_FLOOR } from './type-floor';
import { balanceLine, cornerAnchor, counterweightLayout, dotDisplay, crossAnchor, editorial, frameFeed, lightboxEntry, notePanel, panelRoute, phraseGrid, turnBox } from './line-layouts';
import { phraseSpans } from './line-space';
import { indexPull, lyricBand, memoryCard, paperFeed, phrasePanels } from './carrier-family';
import { gateMotion, REST_FLOOR } from './reading-window';
import { LinkContext, LinkFamilyKind, linkLayout, setLinkContext } from './motion-transition';
import { sectionClock, EXIT_LEAD } from './world-handoff';
import { approvedOf, lineShows, threadShot } from './line-shows';
import { Handoff, handoffProgress, inPose, Keep, openingAt, outPose, pageSquash, passKeeps, seamClear } from './lyric-handoff';
import { P as AnchorPoint, relayBetween, RelayPath, relaySpan, relayStrip } from './handoff-anchor';
import { hitAt } from './screen-hit';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FINAL_HALO_LIB, FINAL_WARP_LIB, FINAL_WARP_UV, HALO_REACH, haloOf } from './final-warp.glsl';
import { binarize, flipRows, InkMask } from './ink-mask';
import { InkHalo } from './ink-halo';
import { fxOfFrame, type FxBox } from '../ink-decide';
import { STYLE_WORLDS } from '../style-worlds';
import { HALO_UNIFORMS, haloCut, matchGlyphPicture, setPatch } from './material-patch';
import { partOf } from './surface-parts';
import { SNOW } from './world-grounds';
import { idOf, partIdOf } from '../ink-verify';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { TEMPLATES } from '../templates';
import { TimelineCue } from '../timeline';
import { beatsDuring, Shot, TreatmentV3 } from '../treatment';
import { MIXED_HALO, clamp01, easeOutBack, easeOutCubic, hash, glyphCacheSize, setKanaScale, trimGlyphCache } from './glyphs';
import { frameSplit } from './frame-split';
import { beatCut } from './beat-cut';
import { buildCut } from './build-cut';
import { handwrite } from './handwrite';
import { titleCard } from './title-card';
import { punch } from './punch';
import { chat, replyThread } from './chat';
import { drawGlassCrack, drawGlassShards, glassOf } from './kit';
import { input, notify } from './phone';
import { array, couplet, orbit, quote, ribbon, stack, tunnel } from './layouts';
import { clearTextCaches, templateStyle, withTextFx } from './text-fx';
import { Call, CallBox, CallUnit, callPhrases, callTimes, mapRange, placeCalls, splitCalls } from '../calls';
import { enterSec, momentCamera, Scene, SceneSong, ShownText, shownTexts } from '../scene';
import type { TransitionKind } from './transition';
import { checkScene, drawScene, echoCarry, SCENE_FONTS, SceneTextQa, setScenePictures } from './scene-parts';
import { fxAt, MomentFx, quietSpans } from '../moments';
import { quiet, quietFace } from './quiet';
import { hookRanges, titleHook } from '../compose';
import { stair } from './stair';
import { keywordRange } from './punch';
import { makeGlyphs, placeRow, rowWidth, advanceOf, Glyph, setFinish, setGhost, setHalo, setSizeCap, setInkGhost, setPieces, syncPieces } from './glyphs';
import { colorAt, DEFAULT_DESIGN, uses } from '../design';
import { SYSTEMS } from '../systems';
import { LANGUAGES } from '../languages';
import { MEDIA, stepTime } from '../medium';
import { MotifLayer } from './motif-layer';
import { CustomScene } from './custom-scene';
import { readBack } from './readback';
import { avoidAll, blendLayer, drawLook, drawNative, drawTransition, Layer, layerRect, Measured, measurable, photoBox, Rect, sectionAt, smoothPlacement } from './graphics';
import { carrySubjects, freeBand, freeRows, KineticLayer, oppositeSide, setBackPush, setDecidingInk, setLineVeil } from './kinetic';
import { setSheet } from './paper-surface';
import { songKeyOf } from './knobs';
import { setWordSafe } from '../phrases';
import { mixHex, passTint, patchClear } from './material';
import { tuneHandoffs } from './lyric-handoff';
import { apertureAt, gravityPose, isLineExit, LINE_EXIT_SEC, pushFocus, radialShift } from './line-exit';
import { FineLayer, fineLayer } from './fine-tier';
import { freeZone } from './board';
import { DIAGRAM_FX } from './kinetic-more';
import { firstSeen, storyEvents, storyLayers } from './story';
import type { Palette } from '../treatment';
import { contrastFace, DEFAULT_FONTS, FontChoice, FONTS, isLatinLine, nearestWeight, readingLatin, resolveFonts } from '../fonts';
import { scatter } from './scatter';
import { typewriter } from './typewriter';
import { vertical } from './vertical';
import { lanes } from './lanes';
import { PREVIEW_GAP, scroll, singalong } from './sing-along';
import { discOffsets } from './dilate';
import { missingOptIn } from '../templates';
import { boxInsideOutline } from './page-layout';
import { pageTally, type PageDrawn, type PageTally } from './world-b5-screentone';
import { songVary, contrast, CueLayer, GlyphBox, guardLine, poorShare, CueRuntime, entranceLost, EXIT_SEC, FrameFx, fitReading, frameFit, measureAtRest, motionPad, paceStyle, PaceAdjust, readable as readableOn, readingSec, ShotLayer, TemplateRenderer } from './runtime';
import { ALL_LABEL_TEXT } from '../labels';

const W = 1920;
const H = 1080;
/** Exits drawn over time (a glitch, a blade, falling dominoes, pixels, a shattering pane): given the gap to the next line. */
const LONG_EXITS = new Set(['glitch', 'slash', 'domino', 'pixel', 'shatter', 'fold-close']);
/**
 * Lyrics always inside the frame: the layer is laid out at its settled moment and, if any glyph would cross the
 * safe area (48 px side / 40 px top-bottom margin), scaled down about the centre inside a wrapper group.
 */
/**
 * Frame-px boxes of the glyphs on screen in a line's group (visible and not faded out), their opacity, and for a whole
 * glyph texture the affine that lays the texture where the letter is drawn, tilt and all (a letter on an arc).
 */
function glyphBoxes(group: THREE.Object3D): (Rect & { a: number; img?: CanvasImageSource; at?: [number, number, number, number, number, number]; preview?: boolean; ink?: string })[] {
  const out: (Rect & { a: number; img?: CanvasImageSource; at?: [number, number, number, number, number, number]; preview?: boolean; ink?: string })[] = [];
  const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const shown = (o: THREE.Object3D | null): boolean => !o || (o.visible && shown(o.parent));
  if (!shown(group)) return out;
  const b = new THREE.Box3();
  group.traverseVisible((o) => {
    const m = o as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
    if (!m.isMesh || (m.material.opacity ?? 1) < 0.05 || m.userData['noVeil']) return;
    b.setFromObject(m);
    const map = m.material.map;
    const whole = map && map.repeat.x === 1 && map.repeat.y === 1 && !map.offset.x && !map.offset.y;
    if (b.isEmpty()) return;
    const box = { x0: b.min.x + W / 2, y0: H / 2 - b.max.y, x1: b.max.x + W / 2, y1: H / 2 - b.min.y, a: m.material.opacity ?? 1, ...(m.userData['preview'] ? { preview: true, ink: `#${m.material.color.getHexString()}` } : {}) };
    const pos = m.geometry.getAttribute('position');
    const img = whole ? (map.image as CanvasImageSource & { width: number; height: number }) : undefined;
    if (!img || !pos || pos.count !== 4 || !img.width) return void out.push(box);
    // a plane's corners, top left, top right, bottom left, into frame px: the texture's own affine
    [0, 1, 2].forEach((k) => v[k].fromBufferAttribute(pos, k).applyMatrix4(m.matrixWorld));
    const [tl, tr, bl] = v.map((p) => [p.x + W / 2, H / 2 - p.y]);
    out.push({ ...box, img, at: [(tr[0] - tl[0]) / img.width, (tr[1] - tl[1]) / img.width, (bl[0] - tl[0]) / img.height, (bl[1] - tl[1]) / img.height, tl[0], tl[1]] });
  });
  return out;
}

/**
 * The glyphs of a line whose layout gives none of its own (a template that is not a world's set: a floored line's stair):
 * every shown, textured, opaque-enough mesh that is not what the words stand on, its picture's centre (the picture pads
 * the glyph a third of its size each side: GLYPH_CORE of it is the glyph), its opacity and colour (QA: the probe gate).
 */
export function meshGlyphs(group: THREE.Object3D): GlyphBox[] {
  const out: GlyphBox[] = [];
  const b = new THREE.Box3();
  group.traverseVisible((o) => {
    const m = o as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
    // (a sing-along's preview of the next line is not this line: sing-along.ts)
    if (!m.isMesh || !m.material.map || (m.material.opacity ?? 1) < 0.05 || m.userData['noVeil'] || m.userData['decor'] || m.userData['preview']) return;
    b.setFromObject(m);
    if (b.isEmpty()) return;
    const [cx, cy, hw, hh] = [(b.min.x + b.max.x) / 2 + W / 2, H / 2 - (b.min.y + b.max.y) / 2, ((b.max.x - b.min.x) * GLYPH_CORE) / 2, ((b.max.y - b.min.y) * GLYPH_CORE) / 2];
    out.push({ i: out.length, x0: cx - hw, y0: cy - hh, x1: cx + hw, y1: cy + hh, a: m.material.opacity ?? 1, moving: false, ink: `#${m.material.color.getHexString()}` });
  });
  return out;
}
/** The glyph meshes of a line whose layout gives none of its own: shown, textured, not what the words stand on (ink gate). */
function meshesOf(group: THREE.Object3D): { i: number; mesh: THREE.Mesh }[] {
  const out: { i: number; mesh: THREE.Mesh }[] = [];
  // (what hangs under a glyph, its echo, its shine, its plate copy, is its part, never a glyph of its own: partsUnder)
  const walk = (o: THREE.Object3D) => {
    const m = o as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
    if (m.isMesh && m.material.map && !m.userData['decor'] && !m.userData['ring'] && !m.userData['noVeil'] && !m.userData['copy'] && !m.userData['preview']) return void out.push({ i: out.length, mesh: m });
    o.children.forEach(walk);
  };
  walk(group);
  return out;
}
/** Every textured mesh hanging under these glyphs, by reading role (its `part`, else a copy: interference, ink-verify). */
function partsUnder(glyphs: { i: number; mesh: THREE.Mesh }[]): { i: number; mesh: THREE.Mesh; role: 'extrude' | 'outline' | 'copy' }[] {
  return glyphs.flatMap((g) => {
    const out: { i: number; mesh: THREE.Mesh; role: 'extrude' | 'outline' | 'copy' }[] = [];
    g.mesh.traverse((o) => { const m = o as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>; if (o !== g.mesh && m.isMesh && m.material.map) out.push({ i: g.i, mesh: m, role: (m.userData['part'] as 'extrude' | 'outline' | 'copy') ?? 'copy' }); });
    return out;
  });
}
/** A uniform's value copied, so a later frame's writes do not reach the copy. */
const cloneValue = (v: unknown) => (v && typeof (v as { clone?: () => unknown }).clone === 'function' && !(v as THREE.Texture).isTexture ? (v as { clone: () => unknown }).clone() : v);

/** The share of a glyph picture's plane that is the glyph (meshGlyphs). */
const GLYPH_CORE = 0.62;

/** A line's calls: their glyph units, where each sits, and the line's own box they are placed against. */
interface CallLayer {
  rt: CueRuntime;
  group: THREE.Group;
  units: { glyphs: Glyph[]; at: number; x: number; y: number; tilt: number }[];
  /** Each unit's footprint (frame px, tilt and keyline included). */
  sizes: CallUnit[];
  /** The call's own line where it is read (empty for a shout with no host on screen). */
  line: THREE.Box3;
  /** No spot clear of every lyric: the call is not shown at all rather than over the words. */
  dropped?: boolean;
}

/** A call's type, px: sung words too, so never under the type floor (type-floor.ts; set at 78 px before 2026-11-12). */
export const CALL_SIZE = TYPE_FLOOR.lo;

/** The layer's settled bounds in frame px (origin at the centre), with the layer laid out at its readable moment. */
function settledBox(layer: CueLayer, parent?: THREE.Object3D, span = false): THREE.Box3 {
  const [from, to] = layer.readable();
  const end = Number.isFinite(to) ? to : from + 1;
  const vis = layer.group.visible;
  layer.group.visible = true;
  // span: every place the line rests while it is read (a stack line is pushed up when the next one lands; measured
  // once it protected only one of its places — a card covered チョロイン c061, c003 ran off the frame), else the middle
  const box = new THREE.Box3();
  for (const k of span ? [0.05, 0.25, 0.5, 0.75, 0.95] : [0.5]) {
    measureAtRest(() => layer.update(from + (end - from) * k, { flash: 0, hit: 0, shake: 0 }));
    (parent ?? layer.group).updateMatrixWorld(true);
    box.union(shownBox(layer));
  }
  layer.group.visible = vis;
  return box;
}

/**
 * Each place a line rests while it is read, with when it is there: a stack (or couplet) line moves when a later line
 * lands (`cuts`, its arrivals); one box per stretch between them, measured once the 0.4 s push has settled. The
 * union of all of them held the whole frame middle for the whole line (チョロイン c003: a one-row line kept props and
 * photos off 580 px of the frame) though the line is only ever in one of those places.
 */
function placesWhileRead(layer: CueLayer, parent: THREE.Object3D, cuts: number[]): { from: number; to: number; box: THREE.Box3 }[] {
  const [from, to] = layer.readable();
  const end = Number.isFinite(to) ? to : from + 1;
  const vis = layer.group.visible;
  layer.group.visible = true;
  const bounds = [from, ...cuts.filter((c) => c > from + 0.05 && c < end - 0.05), end];
  const out = bounds.slice(0, -1).map((a, i) => {
    const b = bounds[i + 1];
    const s0 = Math.min(i ? a + 0.4 : a + (end - from) * 0.05, b - 0.01);
    const box = new THREE.Box3();
    for (const x of [s0, (s0 + b) / 2, b - 0.01]) {
      measureAtRest(() => layer.update(x, { flash: 0, hit: 0, shake: 0 }));
      parent.updateMatrixWorld(true);
      box.union(shownBox(layer));
    }
    return { from: a, to: b, box };
  });
  layer.group.visible = vis;
  return out;
}

/** Where a sing-along's preview row stands (world px, measured at rest), if the line has one. */
function previewBox(layer: CueLayer): THREE.Box3 | undefined {
  const box = new THREE.Box3();
  layer.update(layer.readable()[0] + 0.01, { flash: 0, hit: 0, shake: 0 });
  layer.group.updateMatrixWorld(true);
  layer.group.traverse((o) => void ((o as THREE.Mesh).isMesh && o.userData['preview'] && o.visible && ((o as THREE.Mesh).material as THREE.Material).opacity > 0.01 && box.expandByObject(o)));
  return box.isEmpty() ? undefined : box;
}

/** The box of what the layer shows now, in world (frame) px with every transform above it applied. */
export function shownBox(layer: CueLayer, inkOnly = false): THREE.Box3 {
  // only what is showing at that moment (beat-cut keeps its other pieces hidden)
  const box = new THREE.Box3();
  // decor (array's tiled words) is not the lyric: it may fill the frame on purpose
  // (nor is a sing-along's preview of the next line: the lyric box is this line's own)
  const shown = (o: THREE.Object3D): boolean => o === layer.group || (o.visible && !o.userData['decor'] && !o.userData['preview'] && (!o.parent || shown(o.parent)));
  layer.group.traverse((o) => {
    // inkOnly (the motion check): what can be seen, not pieces waiting at zero opacity
    const faint = inkOnly && ((o as THREE.Mesh).material as THREE.Material | undefined)?.opacity !== undefined && ((o as THREE.Mesh).material as THREE.Material).opacity <= 0.01;
    if ((o as THREE.Mesh).isMesh && o.parent && shown(o.parent) && o.visible && !faint && !o.userData['preview']) box.expandByObject(o);
    // a part of the line that blinks (a caret) is in the frame whether or not it is lit when measured: one cut off by the frame's edge (terminal 是誰在練太極, 2026-11-04)
    else if (!inkOnly && (o as THREE.Mesh).isMesh && o.userData['inFrame'] && o.parent && shown(o.parent)) { const v = o.visible; o.visible = true; box.expandByObject(o); o.visible = v; }
  });
  return box;
}

/** Text without spaces, punctuation or symbols, to match a card's words in a line (「嘘つき！」 in 「…結局嘘つき！つき！」). */
const bare = (s: string) => s.replace(/[\s\p{P}\p{S}]/gu, '');

/** A stretch between changes is placed as it is this long in: a card that just landed has stopped falling (story.ts). */
const SETTLE_SEC = 0.9;

/** A line whose type reads below 3:1 over more than this share of its box, as played, is rebuilt light in a dark halo
 * (experimental: set by eye on チョロイン, iw and Utsusemi stills, 2026-10-13). */
const POOR_SHARE = 0.15;
/** The light type of a line over light and dark at once (in a dark halo). */
const LIGHT_TYPE = '#f4f2ee';

/** The smallest type a line rests at, px on the 1920 frame: its own characters only, as fitted, near the end of its reading. */
function restSize(layer: CueLayer, wrap?: (l: CueLayer, kick: boolean) => THREE.Group, fitted?: THREE.Group) {
  const fit = fitted ?? wrap!(layer, false);
  const [from, to] = layer.readable();
  const vis = layer.group.visible;
  layer.group.visible = true;
  measureAtRest(() => layer.update(from + ((Number.isFinite(to) ? to : from + 1) - from) * 0.95, { flash: 0, hit: 0, shake: 0 }));
  fit.updateMatrixWorld(true);
  let least = Infinity;
  const scale = new THREE.Vector3();
  layer.group.traverse((o) => {
    let p: THREE.Object3D | null = o;
    for (; p && p !== layer.group; p = p.parent) if (!p.visible || p.userData['decor']) return;
    // (a glyph's type size is its em, the larger of its two axes: a face drawn narrow by its set's shear is condensed, and a character
    // rolling or flipping is squashed for a moment, neither is set small)
    if (o.userData['size']) { o.getWorldScale(scale); least = Math.min(least, o.userData['size'] * Math.max(Math.abs(scale.x), Math.abs(scale.y))); }
  });
  layer.group.visible = vis;
  return least;
}

function fitToFrame(layer: CueLayer, kick: boolean): THREE.Group {
  const fit = new THREE.Group();
  fit.add(layer.group);
  if (layer.framed) return fit;
  const box = settledBox(layer, fit, true);
  if (box.isEmpty()) return fit;
  const ex = Math.max(Math.abs(box.min.x), Math.abs(box.max.x));
  const ey = Math.max(Math.abs(box.min.y), Math.abs(box.max.y));
  // inside the safe area at rest, and inside the frame as it moves (motionPad: the kick and drift grow the box about
  // the centre, the sway and drift shift it); 行星 c010 and 天文対話 c036 sat in the safe area and swayed off the frame
  const scaleFor = (ex: number, ey: number, kicked = kick) => frameFit(ex, ey, kicked);
  let s = scaleFor(ex, ey);
  // (the fit never sets a world line's words under the type floor, render/type-floor.ts: where what they stand on is
  // what the frame cannot hold, the words alone are fitted, their carrier running past the safe edge; silk's slab set
  // its words at 79 px, 2026-11-12)
  if (s < 1 && layer.floor) {
    const words = restingWords(layer, fit);
    if (words.least < Infinity) {
      const wx = Math.max(Math.abs(words.box.min.x), Math.abs(words.box.max.x));
      const wy = Math.max(Math.abs(words.box.min.y), Math.abs(words.box.max.y));
      // (the kick's 5 % on a heavy beat is motion: it may take the words into the safe margin, never past the frame)
      s = fitAtFloor(s, words.least, layer.floor, scaleFor(wx, wy, false));
    }
  }
  fit.scale.setScalar(s);
  return fit;
}

/** Where in a line's reading its words are measured, shares of it: dense, a blown-up key and its swell change the words' size between any two (led-board c021, crayon c007, 2026-11-12). */
const READING_STOPS = [0.02, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 0.98, 0.995];

/** A line's words at rest (its middle and near the end of its reading), at the fit's scale 1: their em boxes' bound and least row type. */
function restingWords(layer: CueLayer, parent: THREE.Object3D, playing = false, clock: (t: number) => number = (t) => t) {
  const [from, to] = layer.readable();
  const end = Number.isFinite(to) ? to : from + 1;
  const vis = layer.group.visible;
  layer.group.visible = true;
  const box = new THREE.Box3();
  const scale = new THREE.Vector3();
  let least = Infinity;
  const read = (boxes: boolean, sizes: boolean) => {
    parent.updateMatrixWorld(true);
    layer.group.traverse((o) => {
      if (!(o as THREE.Mesh).isMesh || !o.userData['size']) return;
      for (let p: THREE.Object3D | null = o; p && p !== parent; p = p.parent) if (!p.visible || p.userData['decor']) return;
      // (each glyph's em box, not its picture: a glyph's picture carries a wide transparent pad, and the pad alone pushed
      // a line flush on the safe edge under the fit)
      o.getWorldScale(scale);
      if (boxes) {
        const half = new THREE.Vector3((o.userData['size'] * Math.abs(scale.x)) / 2, (o.userData['size'] * Math.abs(scale.y)) / 2, 0);
        const at = o.getWorldPosition(new THREE.Vector3());
        box.expandByPoint(at.clone().sub(half)).expandByPoint(at.add(half));
      }
      // (a glyph as drawn: a particle the typesetter set smaller is lyric too, and held at the floor with the rest; its type size is its em)
      if (sizes) least = Math.min(least, o.userData['size'] * Math.max(Math.abs(scale.x), Math.abs(scale.y)));
    });
  };
  // (the whole reading, not two moments of it: a line's glyphs swell as it is read, silk チョロイン c078 rested at 83 px at its
  // start and 87 at its end. Where the words stand is read at rest at a few stops: a line still sliding in a few hundredths
  // into its reading would put the box off the frame)
  if (!playing) {
    for (const k of READING_STOPS) {
      measureAtRest(() => layer.update(clock(from + (end - from) * k), { flash: 0, hit: 0, shake: 0 }));
      read(true, true);
    }
  } else {
    // (how big they are, and where, as played, every thirtieth of a second: a glyph that hops or breathes dips under the floor
    // between two coarse stops, gothic-lolita c048 at 79 px between stops that read 84; the at-rest box of a line that
    // grows as it is read is wider than any state it plays, and kept the hold from the lift it had room for)
    const n = Math.max(13, Math.ceil((end - from) * 30));
    for (let i = 0; i <= n; i++) {
      layer.update(clock(from + ((end - from) * i) / n), { flash: 0, hit: 0, shake: 0 });
      read(true, true);
    }
  }
  layer.group.visible = vis;
  return { box, least };
}

/**
 * Runs `fn` with the line's words in a space of their own: a bare group at the fit's scale, with no position, no
 * rotation and nothing above it (the type layer's sway, the kick's scale and jump, the drift and the line's camera are all
 * motion of the frame, not of the words). A hold read through the live groups took the previous frame's motion with it, up
 * to 5 % under-hold and a different constant for every segment of a render (2026-11-14 review).
 */
function inOwnSpace<T>(layer: CueLayer, fitScale: number, fn: (space: THREE.Group) => T): T {
  const space = new THREE.Group();
  space.scale.setScalar(fitScale);
  const home = layer.group.parent;
  space.add(layer.group);
  try {
    return fn(space);
  } finally {
    if (home) home.add(layer.group);
    else space.remove(layer.group);
  }
}

/** A line's words as played, in their own space at `fitScale`: the least glyph as drawn and the box's reach from the centre. */
function playedWords(layer: CueLayer, fitScale: number, clock: (t: number) => number) {
  const words = inOwnSpace(layer, fitScale, (space) => restingWords(layer, space, true, clock));
  return { least: words.least, wx: Math.max(Math.abs(words.box.min.x), Math.abs(words.box.max.x)), wy: Math.max(Math.abs(words.box.min.y), Math.abs(words.box.max.y)) };
}

/**
 * The least scale a line's fit group may take while it plays, so its words never rest under the type floor as drawn:
 * whatever the line's own camera or the drift puts on the fit (render/type-floor.ts; a text camera's zoom-out took silk
 * チョロイン c078 from 85 to 83 px and a spy build-cut line from 87 to 80, 2026-11-12). The scale at which its words
 * (as drawn, particles too) stand at `floor` px, no further than the frame holds them through all their motion
 * (holdMultiple, `kick`: the line's loud section); undefined for a line with no words to read. A function of the line
 * alone (its glyphs over its reading and its fit scale), so every segment of a render, a seek and a live build read the same.
 */
export function holdScale(layer: CueLayer, fitScale: number, floor: number, clock: (t: number) => number, kick: boolean, poses?: readonly CamPose[]): number | undefined {
  const w = playedWords(layer, fitScale, clock);
  if (!Number.isFinite(w.least) || w.least <= 0) return undefined;
  return fitScale * holdMultiple(w.least, floor, w.wx, w.wy, kick, poses);
}

/** Whether the hold (holdScale) cannot bring a line's words to its floor inside the frame. */
function holdShort(layer: CueLayer, fitScale: number, clock: (t: number) => number, kick: boolean, floor: number, poses?: readonly CamPose[]): boolean {
  const w = playedWords(layer, fitScale, clock);
  return Number.isFinite(w.least) && holdFalls(w.least, floor, w.wx, w.wy, kick, poses);
}

/** Where a laid-out line's phrases stand and the whole line's box, frame px from the centre: what a tracking camera calls at. */
function trackStops(layer: CueLayer, fit: THREE.Object3D, spans: [number, number][]): Pick<CameraRig, 'points' | 'box'> {
  const [from] = layer.readable();
  const shown = layer.group.visible;
  layer.group.visible = true;
  measureAtRest(() => layer.update(from + 0.05, { flash: 0, hit: 0, shake: 0 }));
  fit.updateMatrixWorld(true);
  const boxes = spans.map(() => new THREE.Box3());
  const whole = new THREE.Box3();
  layer.group.traverse((o) => {
    const src = (o.userData['glyph'] as Glyph | undefined)?.src;
    if (src === undefined) return;
    whole.expandByObject(o);
    const k = spans.findIndex(([a, b]) => src >= a && src < b);
    if (k >= 0) boxes[k].expandByObject(o);
  });
  layer.group.visible = shown;
  const points = boxes.filter((b) => !b.isEmpty()).map((b) => { const c = b.getCenter(new THREE.Vector3()); return [Math.round(c.x), Math.round(c.y)] as [number, number]; });
  return whole.isEmpty() ? {} : { points, box: [whole.min.x, whole.min.y, whole.max.x, whole.max.y] };
}

/** How long a drop's keyword flash holds before the line takes over (a few frames). */
const FLASH_SEC = 0.16;
const HOLD_SEC = 1.2;
/** Live: seconds ahead a line is made ready, and behind it let go. Glyphs kept beyond the lines up, at most. */
const LIVE_AHEAD = 2;
const LIVE_BEHIND = 0.5;
const GLYPH_CACHE = 900;
/** Loudness from which heavy beats kick the type layer (kickAt); the lyrics' avoidance room counts the kick from here. */
const KICK_LEVEL = 2.4;
const KANA_TEMPLATES = new Set(['punch', 'beat-cut', 'scatter', 'title-card']);
/** Paper grain closing over a patch in a few hard steps, thickest at its middle, its edge never a straight line. One ink. */
function grainSteps(w: number, h: number, seed: number) {
  const [cw, ch] = [Math.ceil(w / 3), Math.ceil(h / 3)];
  const value = (x: number, y: number) => {
    const [u, v] = [(x / cw - 0.5) * 2, (y / ch - 0.5) * 2];
    // loose paper grain thinning to nothing outward: never a block, and no edge a ruler drew
    return hash(x * 13 + y * 71, seed) * (1 - Math.hypot(u, v) ** 2.4 / 1.6);
  };
  return Array.from({ length: 6 }, (_, i) => {
    const cv = Object.assign(document.createElement('canvas'), { width: cw, height: ch });
    const g = cv.getContext('2d')!;
    g.fillStyle = '#fff';
    const cut = 0.97 - i * 0.07;
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) if (value(x, y) > cut) g.fillRect(x, y, 1, 1);
    const t = new THREE.CanvasTexture(cv);
    t.magFilter = t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    return t;
  });
}

/** A soft-edged hole in an opaque sheet: the iris's own shape, outside it the sheet runs on past the frame. */
const irisTex = { map: undefined as THREE.CanvasTexture | undefined };
function irisMap() {
  if (irisTex.map) return irisTex.map;
  const cv = Object.assign(document.createElement('canvas'), { width: 256, height: 256 });
  const g = cv.getContext('2d')!;
  g.fillStyle = '#fff';
  g.fillRect(0, 0, 256, 256);
  g.globalCompositeOperation = 'destination-out';
  const f = g.createRadialGradient(128, 128, 116, 128, 128, 126);
  f.addColorStop(0, 'rgba(0,0,0,1)');
  f.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = f;
  g.fillRect(0, 0, 256, 256);
  return (irisTex.map = new THREE.CanvasTexture(cv));
}

const RENDERERS: Record<string, TemplateRenderer> = { 'world-set': worldSet, 'world-pair': worldPair, 'build-cut': buildCut, punch, 'paper-feed': paperFeed, 'memory-card': memoryCard, 'index-pull': indexPull, 'lyric-band': lyricBand, 'phrase-panels': phrasePanels, 'frame-split': frameSplit, typewriter, vertical, scatter, singalong, scroll, handwrite, 'title-card': titleCard, 'beat-cut': beatCut, quiet, stair, stack, array, couplet, quote, orbit, ribbon, tunnel, chat, notify, input, lanes, 'lyric-carrier': lyricCarrier, 'contrast-split': contrastSplit, editorial, 'corner-anchor': cornerAnchor, 'cross-anchor': crossAnchor, 'note-panel': notePanel, 'phrase-grid': phraseGrid, 'balance-line': balanceLine, 'dot-display': dotDisplay, 'turn-box': turnBox, 'frame-feed': frameFeed, 'lightbox-entry': lightboxEntry, counterweight: counterweightLayout, 'panel-route': panelRoute, 'reply-thread': replyThread };

export interface AssetSource {
  kind: 'image' | 'video';
  /** image: picture URL; video: URL of the first-frame image (used after the clip runs out). */
  url: string;
  frames?: { pattern: string; count: number; fps: number };
}

export interface RenderJob {
  fps: number;
  window: { start: number; end: number };
  beats: number[];
  /** Kick strength per beat (song.beatStrength). */
  beatStrength?: number[];
  /** Song tempo (BPM): slow songs get breathing timing. */
  tempo?: number;
  cues: TimelineCue[];
  treatment: TreatmentV3;
  assets: Record<string, AssetSource>;
  /** The user's font choice; overrides the treatment's. */
  fonts?: FontChoice;
  /** Song identity for title cards; `logo` is an image URL (the group logo upload, later). */
  meta?: { title: string; artist: string; logo?: string };
  /** Members and their colours: a line tagged with a singer is set in that singer's colour. */
  singers?: { name: string; color: string }[];
  /** Downbeats (song.downbeats): storyboard events may count them. */
  downbeats?: number[];
  /** QA: log every sprite's box per frame (codelayer.mts continuity checks). */
  track?: boolean;
  /** One layer only, for compositing in VJ software: 'text' = lyrics on transparency, 'back' = everything else. */
  /** One compositing layer; `words` is the lyric layer without the carriers the lines stand on (QA: hold-events.mts). */
  layer?: 'text' | 'back' | 'words';
  /**
   * Live use (browser preview and export) of a line composer's plan: each line is built near its time and released
   * after, so a song starts as fast as a short one and memory stays flat. Ignored for any other treatment.
   */
  live?: boolean;
  /** The caller brings the faces (loadFaces): a first preview frame does not wait for a font download. */
  facesLater?: boolean;
  /**
   * A line too fast for its entrance: 'whole' (default) keeps a quick entrance on the whole line at once when readFix
   * still finds the reading time, else cuts; 'stagger' the same character by character (comparison only); 'cut' always
   * cuts: the earlier entrance strategy, kept as the fallback (measuring, room-making and fit work the same either way).
   */
  entrance?: Entrance;
}

/** motionQa per line: the deepest overlap with a visible story prop (by cause), decoration and card pile, and how far past the safe area / frame edge. */
export interface MotionCheck {
  id: string;
  text: string;
  template: string;
  /** Lyrics over a visible story prop or card, by cause (each the deepest, with which prop, its opacity and layer). */
  motion: Hit;
  atRest: Hit;
  /** Over a prop that found no room and faded behind the line (avoid's fallback, by design; still counted). */
  steppedBack: Hit;
  gliding: Hit;
  /** Lyrics over a visible decoration (inset photo, blob, stamp, seal, numeral, window); `cause` as above. */
  decor: Hit & { cause?: OverlapCause };
  /** Two visible cards over each other while the line is up (their texts show through each other). */
  cards: { t: number; px: number; a?: string; b?: string; opacity?: [number, number] };
  offSafe: { t: number; px: number };
  offFrame: { t: number; px: number };
}

export type OverlapCause = 'motion' | 'atRest' | 'steppedBack' | 'gliding';

/** The deepest overlap (px) at t, with the object it is over: id, drawn opacity and draw layer. */
export interface Hit {
  t: number;
  px: number;
  prop?: string;
  opacity?: number;
  layer?: string;
}

export type Entrance = 'whole' | 'stagger' | 'cut';

export interface CueMetric {
  id: string;
  text: string;
  readableFrom: number;
  readableTo: number;
  readableSec: number;
  requiredSec: number;
  ok: boolean;
  /** Seconds the line stays up after its last sung character (a long one sits over an instrumental). */
  lingerSec: number;
  /** When its last character is sung and when it is gone (equal for a line a template keeps up on purpose). */
  lastSung: number;
  goneAt: number;
  template: string;
  /** The director's entrance/reveal, what was drawn, why it changed, and whether a planned entrance never played. */
  plannedEnter: string;
  plannedReveal: string;
  enter: string;
  reveal: string;
  /** How much the line was scaled down to stay in the safe area at rest and in the frame as it moves (1 = not). */
  fitScale: number;
  /** A whole-line quick entrance was drawn (entrance 'whole'); a line cut afterwards keeps its state but did not get one. */
  together: boolean;
  adjust: PaceAdjust[];
  entranceLost: boolean;
}

export const FINAL_SHADER = {
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uFlash: { value: 0 }, uHit: { value: 0 }, uZoomHit: { value: 0 }, uTileHit: { value: 0 }, uSweep: { value: -1 }, uAberration: { value: 0.0012 }, uGrain: { value: 0.05 }, uPaper: { value: 0 }, uBeams: { value: 0 },
    // section moments (moments.ts)
    uVignette: { value: 0 }, uVigBase: { value: 0.55 }, uRays: { value: 0 }, uShockR: { value: -1 }, uShock: { value: 0 },
    uRayColor: { value: new THREE.Color(1, 1, 1) },
    // medium (medium.ts)
    uBoil: { value: 0 }, uBoilSeed: { value: 0 }, uWeave: { value: new THREE.Vector2() }, uFlicker: { value: 1 }, uTooth: { value: 0 },
    uPixel: { value: 0 }, uLift: { value: 0 }, tText: { value: null }, uHasText: { value: 0 }, uScan: { value: 0 },
    // full-frame glitch transition, and the ending's fade to black
    uGlitch: { value: 0 }, uFade: { value: 0 },
    // a broken screen (kit.ts glass): the shard map shifts and shades the picture piece by piece, the cracks go on top
    tGlass: { value: null }, tCracks: { value: null }, uGlass: { value: 0 },
    // the ink halo round the reading glyphs (final-warp.glsl FINAL_HALO_LIB; uHaloOut 0: off)
    tHalo: { value: null }, uHaloIn: { value: 0 }, uHaloOut: { value: 0 },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uZoomHit, uTileHit; uniform float uTime, uFlash, uHit, uSweep, uAberration, uGrain, uPaper, uBeams;
    uniform float uVignette, uVigBase, uRays, uShockR, uShock; uniform vec3 uRayColor; varying vec2 vUv;
    uniform float uBoil, uBoilSeed, uFlicker, uTooth, uPixel, uLift, uHasText, uGlitch, uFade, uScan; uniform sampler2D tText; uniform vec2 uWeave;
    uniform sampler2D tGlass, tCracks; uniform float uGlass;
    uniform sampler2D tHalo; uniform float uHaloIn, uHaloOut;
    ${FINAL_WARP_LIB}
    ${FINAL_HALO_LIB}
    void main(){
      ${FINAL_WARP_UV}
      float hk = haloKeep(uvC, uv, d, a);           // the halo: what of the effects' geometry this pixel keeps
      float ho = haloAt(uvC);                       // and of their noise, where it shows
      vec3 c = vec3(texture2D(tDiffuse, uv + d * a).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - d * a).b);
      if (uTileHit > 0.0) c = texture2D(tDiffuse, fract(uv * 3.0)).rgb; // the picture repeated three by three for two frames
      if (uZoomHit > 0.0) {                         // a rush into the frame: the picture smeared along lines from the centre
        vec3 sum = vec3(0.0);
        for (int i = 0; i < 12; i++) sum += texture2D(tDiffuse, 0.5 + d * (1.0 - 0.26 * uZoomHit * float(i) / 11.0)).rgb;
        c = sum / 12.0;
      }
      // the lyrics come through a hit untouched (the text-only render marks where they are)
      if ((uZoomHit > 0.0 || uTileHit > 0.0) && uHasText > 0.0 && uHaloOut <= 0.0) c = mix(c, texture2D(tDiffuse, uv).rgb, smoothstep(0.02, 0.3, texture2D(tText, uv).a));
      // round the reading glyphs the picture is read straight: no split, no jump, no grid, no smear (halo)
      if (uHaloOut > 0.0) c = mix(texture2D(tDiffuse, uvC).rgb, c, hk);
      vec4 cracks = vec4(0.0);
      if (uGlass > 0.0) {                           // broken glass: each shard refracts what is under it a little
        vec3 sh = texture2D(tGlass, vUv).rgb;
        vec2 off = (sh.rg - 0.5) * 0.02 * uGlass;
        cracks = texture2D(tCracks, vUv);
        float split = 0.0016 * cracks.a;            // a rainbow fringe along the cracks
        c = vec3(texture2D(tDiffuse, uv + off + split).r, texture2D(tDiffuse, uv + off).g, texture2D(tDiffuse, uv + off - split).b);
        c *= 1.0 + (sh.b - 0.5) * 0.3 * uGlass;
        c += vec3(0.03) * (sh.b - 0.5) * uGlass;   // a lighter shard is a little milky even over black
      }
      c *= 1.0 + 0.45 * uHit;         // accent hit: exposure up (highlights bloom), shadows stay dark
      if (uRays > 0.0) {                            // light rays bursting from the horizon, added light only
        float ang = atan(q.y, q.x);
        float k = floor((ang + 3.1416) * 18.0);
        float beam = pow(0.5 + 0.5 * cos(ang * 36.0 + h1(k) * 6.28), 6.0) * (0.4 + 0.6 * h1(k + 7.0));
        float fall = exp(-r * 1.1) * smoothstep(0.0, 0.06, r);
        c += uRayColor * (beam * fall * 1.4 + exp(-r * 4.0) * 0.8) * uRays;
      }
      if (uBeams > 0.0) {                           // diagonal parallel light beams sweeping across
        float x = uv.x * 1.7778 + uv.y * 0.9 - uTime * 0.9;
        float band = pow(0.5 + 0.5 * sin(x * 9.0), 18.0) + 0.6 * pow(0.5 + 0.5 * sin(x * 23.0 + 1.3), 30.0);
        c += uRayColor * band * uBeams * 0.85;
      }
      c *= 1.0 - (uVigBase + uVignette) * dot(d, d) * 1.6; // vignette
      c += (rnd(vUv * 1000.0) - 0.5) * uGrain * ho; // film grain
      if (uPaper > 0.0) {                           // static print/paper texture: fibres and soft blotches
        vec2 p = vUv * vec2(1920.0, 1080.0);
        float fib = h1(floor(p.x / 3.0) * 7.0 + floor(p.y * 0.7)) * 0.5 + h1(floor(p.y / 2.0) * 13.0 + floor(p.x * 0.3)) * 0.5;
        float blot = sin(vUv.x * 9.0 + sin(vUv.y * 7.0) * 2.0) * sin(vUv.y * 11.0 + vUv.x * 3.0);
        c *= 1.0 - uPaper * (0.07 * fib + 0.05 * (0.5 + 0.5 * blot));
      }
      vec2 px = vUv * RES;
      float lum = dot(c, LUMA);
      // lyrics (a text-only render, tText) stay crisp under pixel dither and paper tooth
      float keep = uHasText > 0.0 && uHaloOut <= 0.0 ? smoothstep(0.05, 0.5, texture2D(tText, uvText).a) : 0.0;
      if (uLift > 0.0) {                            // the paper shows through the darks: a warm, fibrous ground
        float fib = h1(floor(px.x / 3.0) * 7.0 + floor(px.y * 0.7)) * 0.5 + vnoise(px / 90.0) * 0.5;
        c += vec3(0.91, 0.86, 0.77) * uLift * (0.6 + 0.8 * fib) * (1.0 - lum);
      }
      if (uTooth > 0.0) {                           // paper tooth: paint skips the grooves of rough paper
        float tn = vnoise(px / 2.5) * 0.6 + h2(floor(px / 2.0)) * 0.4;
        c *= 1.0 - uTooth * 0.55 * smoothstep(0.62, 0.8, tn) * smoothstep(0.1, 0.6, lum) * (uHaloOut > 0.0 ? ho : 1.0 - 0.8 * keep);
      }
      if (uPixel > 0.0) c = mix(c, floor(c * 4.0 + bayer4(floor(uv * PIX))) / 4.0, uPixel * ho);
      if (uPixel > 0.0) c = mix(c, texture2D(tDiffuse, uvText).rgb * (1.0 + 0.45 * uHit), keep * uPixel);
      c *= uFlicker;
      if (uScan > 0.0) c *= 1.0 - uScan * step(0.5, fract(vUv.y * 360.0)) * ho; // a raster: every other line dimmer, whole frame
      if (uSweep >= 0.0) {                          // light sweep: a soft slanted band crossing left to right
        float x = vUv.x + (vUv.y - 0.5) * 0.25;
        c += vec3(0.55, 0.7, 1.0) * 0.5 * exp(-pow((x - (uSweep * 1.6 - 0.3)) / 0.035, 2.0)) * (1.0 - uSweep * 0.5);
      }
      if (uGlitch > 0.0) {                          // block noise, only in the bands that jumped (all over read as a dead TV)
        float gb = floor(vUv.y * 14.0) + floor(uTime * 30.0) * 7.0;
        c += (rnd(floor(vUv * vec2(48.0, 27.0)) + uTime) - 0.5) * 0.14 * uGlitch * step(0.45, h1(gb * 1.7)) * ho;
      }
      c = mix(c, cracks.rgb, cracks.a * uGlass);   // the cracks themselves over everything, the type included
      // white only at the peak, then an exposure lift that falls away: a plain white mix while it decays is grey fog
      // over a dark frame; brightening keeps the darks dark and makes the lit parts glow
      float fl = clamp(uFlash, 0.0, 1.0);
      c = mix(c, vec3(1.0), pow(fl, 4.0)) * (1.0 + 1.2 * fl);
      c *= 1.0 - clamp(uFade, 0.0, 1.0);
      gl_FragColor = vec4(c, 1.0);
    }`,
};

interface Plate {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
}

/** A plate draws one frame, or two adjacent frames blended (slowed clips), in a single pass. */
const plateMaterial = () =>
  new THREE.ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      map: { value: null }, map2: { value: null }, mixAmt: { value: 0 }, opacity: { value: 1 }, exposure: { value: 1 }, sat: { value: 1 },
      shadowC: { value: new THREE.Color(0, 0, 0) }, highlightC: { value: new THREE.Color(1, 1, 1) }, duo: { value: 0 }, soft: { value: 0.0018 },
    },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    // exposure/saturation from the emotional arc grade the background only, so lyrics never go grey
    // the song's duotone turns any plate into a designed two-colour image (the main AI-look tell is full colour)
    fragmentShader: `uniform sampler2D map; uniform sampler2D map2; uniform float mixAmt, opacity, exposure, sat, duo, soft; uniform vec3 shadowC, highlightC; varying vec2 vUv;
      vec3 px(vec2 uv) { return mix(texture2D(map, uv).rgb, texture2D(map2, uv).rgb, mixAmt); }
      void main() {
        // the plate is softened (a 9-tap ring blur): generated pictures give themselves away in crisp, busy detail,
        // and a designer keeps the background a supporting layer behind the type
        vec3 c = px(vUv) * 0.2;
        for (int i = 0; i < 8; i++) {
          float a = float(i) * 0.7854;
          c += px(vUv + vec2(cos(a), sin(a) * 1.7778) * soft) * 0.1;
        }
        c *= exposure;
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c = mix(c, mix(shadowC, highlightC, smoothstep(0.03, 0.9, l)), duo);
        c = mix(vec3(dot(c, vec3(0.2126, 0.7152, 0.0722))), c, sat);
        gl_FragColor = vec4(c, opacity);
      }`,
  });

/** Mostly Latin letters (an English line): set in the accent face (fonts.ts, where the plan reads it too). */
export { isLatinLine };

/** A line as live use holds it until it is built. */
type LiveLine = { style: CueRuntime['style']; cue: TimelineCue };

export class LyricVjEngine {
  private renderer: THREE.WebGLRenderer;
  private fonts = DEFAULT_FONTS;
  private accentFont = DEFAULT_DESIGN.accentFont;
  private motif?: MotifLayer;
  private scene = new THREE.Scene();
  /** Lyrics (and their echoes), rendered after the bloom pass. */
  private textScene = new THREE.Scene();
  private probe?: CanvasRenderingContext2D;
  /** Each line's on-screen rectangle and when it is up (graphic objects move out of its way). */
  private lyricRects: { from: number; to: number; rect: Rect; rest: Rect; id?: string }[] = [];
  /**
   * Other words up besides the lines (a sing-along's preview row), frame px: out of the lyric box (its ground is not
   * the line's, the guard reads only the line) but kept clear on their own by props, a move's marks and a drawing.
   */
  private keepOut: { from: number; to: number; rect: Rect; id: string }[] = [];
  /**
   * While a linked page move runs (world-handoff.ts linkGrounds), where the last line's words and the next line's are
   * read, and when in the move they switch: the page edges keep their margin from them (motion-transition.ts linkLayout).
   */
  private linkContextAt(at: number): LinkContext | undefined {
    const sec = this.job.treatment.graphics ? sectionAt(this.job.treatment.graphics, at) : undefined;
    const tr = sec?.transition;
    if (!sec || !tr?.kind.startsWith('link-')) return undefined;
    const t0 = sec.start + (tr.seam ?? 0);
    const union = (rs: Rect[]) => (rs.length ? { x0: Math.min(...rs.map((r) => r.x0)), y0: Math.min(...rs.map((r) => r.y0)), x1: Math.max(...rs.map((r) => r.x1)), y1: Math.max(...rs.map((r) => r.y1)) } : undefined);
    const from = union(this.lyricRects.filter((r) => r.from < t0 - 0.06 && r.to > sec.start).map((r) => r.rect));
    const to = union(this.lyricRects.filter((r) => Math.abs(r.from - t0) <= 0.08).map((r) => r.rect));
    return { at: (tr.seam ?? 0) / (tr.dur ?? 1), from, to };
  }

  /**
   * Each linked handoff as the frames will draw it (same context and layout as the draw): how many frames of its window
   * a page edge really moves; 0 = the plain cut, the words too close to the page edge (motion-transition LINK_MIN). Read
   * from the built lines, so a QA instance that draws nothing reports the same as the render.
   */
  private linkOutcomes(fps = 30) {
    const secs = (this.job.treatment.graphics?.sections ?? []) as { start: number; transition?: { kind: string; dur?: number; dir?: number } }[];
    return secs.filter((s) => s.transition?.kind.startsWith('link-')).map((s) => {
      const tr = s.transition!;
      const dur = tr.dur ?? 1, n = Math.max(1, Math.round(dur * fps));
      const mode = tr.dir === 1 ? 'in' : tr.dir === -1 ? 'out' : 'both';
      let moved = 0;
      for (let f = 0; f <= n; f++) {
        const ctx = this.linkContextAt(s.start + (f / n) * dur);
        if (ctx && linkLayout(tr.kind.slice(5) as LinkFamilyKind, mode, f / n, ctx, W, H).edges.length) moved++;
      }
      return { start: +s.start.toFixed(2), kind: tr.kind, dir: tr.dir ?? 0, frames: n + 1, moved, drawn: moved ? ('link' as const) : ('plain-cut' as const) };
    });
  }

  /** The visible props, cards and decorations as placed in the last rendered frame (motionQa checks the lyrics against them). */
  private placedProps: Measured[] = [];
  /** The props were still gliding out of the way of a line that just came up (or back after one left). */
  private propsGliding = false;
  private ghostA?: THREE.WebGLRenderTarget;
  private ghostB?: THREE.WebGLRenderTarget;
  private ghostPass?: ShaderPass;
  private camera = new THREE.OrthographicCamera(-W / 2, W / 2, H / 2, -H / 2, -10, 10);
  private composer: EffectComposer;
  private finalPass: ShaderPass;
  private bloom: UnrealBloomPass;
  private motes: THREE.Points;
  private plates: Plate[] = [];
  private customScenes: CustomScene[] = [];
  private sceneTarget?: THREE.WebGLRenderTarget;
  /** The graphic look's canvas, drawn every frame and shown as the background layer. */
  private gfx?: { ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture; mesh: THREE.Mesh };
  /** The look drawn again without its snow, shown round the reading glyphs (the ink halo at the source layer). */
  private gfxClean?: { ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture; mesh: THREE.Mesh; u: { tHalo: { value: unknown }; uHaloIn: { value: number }; uHaloOut: { value: number } } };
  private dim: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  /** Letterbox bars, closed over quiet spans (the cinema-scope narrowing from the technique library). */
  private bars: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] = [];
  private quiet: { start: number; end: number }[] = [];
  /** Keyword flashes on the drops: full-width for a few frames, then the line takes over. */
  /** Outlined echoes of chorus keywords behind the lines (the library's readable layer + huge echo layer). */
  private echoes: { rt: CueRuntime; group: THREE.Group; glyphs: Glyph[] }[] = [];
  private echoRoot = new THREE.Group();
  private flashes: { at: number; glyphs: Glyph[]; group: THREE.Group; cueId: string }[] = [];
  private textRoot = new THREE.Group();
  /** For the reading scan: the same frame with no lyrics, to see what they really add to it. */
  /**
   * The lyrics on or off. `carriers`: off takes only the words away and leaves what they stand on (a card, a banner),
   * so a check reads the words against what is really behind them, not against the ground under their carrier.
   */
  showLyrics(on: boolean, carriers = false) { this.textRoot.visible = on || carriers; this.carriersOnly = !on && carriers; }
  private carriersOnly = false;
  /** Hides every lyric mesh but the carriers (decor) for one render; returns what puts them back. */
  private wordsAway(): () => void {
    const hid: THREE.Object3D[] = [];
    // (the measured ink probe, style-gate-ink.mts --rings, may keep the rings a set lays under its letters as their ground)
    const rings = !!(globalThis as { __vjInkRings?: boolean }).__vjInkRings;
    if (!rings) {
      this.textRoot.traverse((o) => { if ((o as THREE.Mesh).isMesh && o.visible && !o.userData['decor']) { o.visible = false; hid.push(o); } });
      return () => hid.forEach((o) => (o.visible = true));
    }
    // (the ink gate keeps what the words stand on, the rings under the letters; a glyph is taken away by its material, so
    // a ring that is its child stays)
    const off: THREE.Material[] = [];
    this.textRoot.traverse((o) => {
      const m = o as THREE.Mesh;
      // (a copy behind a glyph, an extrude, a misprint, a ghost, goes with the words: it is the word's own look, not a
      // ground; the glyph's face is read against what is under the whole word, dark-glitch c059 read 1:1 on its own extrude)
      if (!m.isMesh || !o.visible || o.userData['decor'] || o.userData['ring']) return;
      for (const mat of Array.isArray(m.material) ? m.material : [m.material]) if (mat.visible) { mat.visible = false; off.push(mat); }
    });
    return () => off.forEach((mat) => (mat.visible = true));
  }
  private shotLayers = new Map<string, ShotLayer>();
  /** After each frame's lines are updated: the signature moments (render/signature.ts) take their lines off the frame; set only when a treatment has moments. */
  onCues?: (cues: unknown[], calls: unknown[], t: number) => void;
  private cueLayers: { index?: number; rt: CueRuntime; layer: CueLayer; fit?: THREE.Group; fitScale?: number; hold?: number; holds?: boolean; kick?: boolean; need?: number; drift?: [number, number]; mixed?: boolean; remake?: () => void; twin?: { layer: CueLayer; fit: THREE.Group; text: [string, string] }; guard?: { from: number; to: number; rect: Rect; share: number; light: number }; hand?: { h: Handoff; planes: [THREE.Plane, THREE.Plane]; seam?: number }; handOut?: { h: Handoff; seam: number; side: number; plane?: THREE.Plane }; laidOut?: { h: Handoff; seam: number; side: number; plane?: THREE.Plane } }[] = [];
  private relays: { h: Handoff; path: RelayPath; mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>; width: number }[] = [];
  /** Calls and backing lines (the bracketed part of a line) on a small second track of their own. */
  private callLayers: CallLayer[] = [];
  private images = new Map<string, THREE.Texture>();
  /** Each shot's lines as they show (chat attachments are pushed up by the messages after them). */
  private shotLines = new Map<string, { text: string; at: number }[]>();
  /** The storyboard's scenes (scene.ts): drawn by their parts, their lines never built as caption layers. */
  private storyboard: Scene[] = [];
  private frameCache = new Map<string, THREE.Texture>();
  private gradient: THREE.Texture;

  /**
   * The final effects a world line's inks are decided through (M3, ink-decide fxOfFrame), from the job's world frame and
   * its halo: the same numbers the plan has for the world (hold-room WORLD_FX). null: treatment.inkDecide false (QA).
   * Read by world-layout through each cue's runtime (rt.inkFx).
   */
  static inkFx(job: RenderJob): FxBox | null | undefined {
    const tr = job.treatment as { inkDecide?: boolean; inkHalo?: [number, number] | false };
    if (tr.inkDecide === false) return null;
    // (the world from its design, else from its world lines' sets: a free job's design names no world, and the default
    // fell through to a registry the render bundle never filled: M3 was off on every free job, 2026-11-15)
    const id = job.treatment.design?.world?.id ?? (job.treatment.cues as { world?: { set?: string } }[]).find((c) => c.world?.set)?.world?.set?.split('/')[0];
    const frame = job.treatment.design?.world?.frame ?? STYLE_WORLDS.find((w) => w.id === id)?.frameStack;
    return frame ? fxOfFrame(frame, !!haloOf(tr.inkHalo)) : undefined;
  }

  /** The ink halo a job draws (INK_HALO unless its treatment names another or false): one per engine, player and export alike. */
  static inkHaloOf(job: Pick<RenderJob, 'treatment'>): [number, number] | undefined {
    return haloOf((job.treatment as { inkHalo?: [number, number] | false }).inkHalo);
  }

  /** This engine's ink halo and the effects its inks are decided through, from its own job (Codex review 2026-11-16 P1/P2). */
  private readonly inkHaloSpec: [number, number] | undefined;
  private readonly inkFxBox: FxBox | null | undefined;
  /** The halo drawn now: the job's, or a QA probe's override (__vjInkHaloQA: [clean, back] or false). */
  private haloNow(): [number, number] | undefined {
    const qa = (globalThis as { __vjInkHaloQA?: [number, number] | false }).__vjInkHaloQA;
    return qa === undefined ? this.inkHaloSpec : qa || undefined;
  }

  constructor(canvas: HTMLCanvasElement, private job: RenderJob) {
    this.inkHaloSpec = LyricVjEngine.inkHaloOf(job);
    this.inkFxBox = LyricVjEngine.inkFx(job);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, alpha: job.layer === 'text' || job.layer === 'words' });
    this.renderer.setPixelRatio(1);
    this.renderer.localClippingEnabled = true; // handwrite reveals glyphs with clip planes
    this.renderer.setSize(W, H, false);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.55, 0.45, 0.8);
    this.composer.addPass(this.bloom);
    // chroma ghosts of the lyrics (languages with `chroma`), composited before the crisp lyrics
    if (job.treatment.design?.language && LANGUAGES[job.treatment.design.language].chroma && !job.treatment.design.lineDirect) {
      this.ghostA = new THREE.WebGLRenderTarget(W, H);
      this.ghostB = new THREE.WebGLRenderTarget(W, H);
      this.ghostPass = new ShaderPass({
        uniforms: { tDiffuse: { value: null }, tA: { value: this.ghostA.texture }, tB: { value: this.ghostB.texture }, uColA: { value: new THREE.Color() }, uColB: { value: new THREE.Color() }, tHalo: { value: null }, uHaloIn: { value: 0 }, uHaloOut: { value: 0 } },
        vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        // (the ghosts stay off round the reading glyphs with the ink halo on: final-warp.glsl haloAt)
        fragmentShader: `uniform sampler2D tDiffuse, tA, tB, tHalo; uniform vec3 uColA, uColB; uniform float uHaloIn, uHaloOut; varying vec2 vUv;
          float haloAt(vec2 p){ if (uHaloOut <= 0.0) return 1.0; return clamp((texture2D(tHalo, p).r - uHaloIn) / max(uHaloOut - uHaloIn, 1e-3), 0.0, 1.0); }
          void main() {
            vec4 c = texture2D(tDiffuse, vUv);
            float ho = haloAt(vUv);
            c.rgb = mix(c.rgb, uColB, texture2D(tB, vUv).a * 0.45 * ho);
            c.rgb = mix(c.rgb, uColA, texture2D(tA, vUv).a * 0.55 * ho);
            gl_FragColor = c;
          }`,
      });
      // ShaderPass clones its uniforms (a cloned texture is no longer the render target's): point them back
      this.ghostPass.uniforms['tA'].value = this.ghostA.texture;
      this.ghostPass.uniforms['tB'].value = this.ghostB.texture;
      this.composer.addPass(this.ghostPass);
    }
    // lyrics are drawn after the bloom: bloomed white type smeared into an unreadable glow
    const textPass = new RenderPass(this.textScene, this.camera);
    textPass.clear = false;
    this.composer.addPass(textPass);
    // grade in display (sRGB) space: a 0.2 flash mixed in linear light reads as a ~45 % grey wash
    this.composer.addPass(new OutputPass());
    this.finalPass = new ShaderPass(FINAL_SHADER);
    this.composer.addPass(this.finalPass);
    for (let i = 0; i < 2; i++) {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), plateMaterial());
      mesh.renderOrder = i;
      this.scene.add(mesh);
      this.plates.push({ mesh });
    }
    const N = 260;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    this.motes = new THREE.Points(geo, new THREE.PointsMaterial({ size: 4, color: 0xffffff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthTest: false, sizeAttenuation: false }));
    this.motes.renderOrder = 2.5;
    // a storyboard draws on the graphics canvas: give it one
    if (this.job.treatment.storyboard?.length) this.job.treatment.graphics ??= { sections: [{ start: 0, layers: [] }] };
    if (this.job.treatment.graphics) {
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
      mesh.renderOrder = -1; // first: the plates are hidden, everything else (dim, motif, lyrics) draws over it
      this.scene.add(mesh);
      this.gfx = { ctx: c.getContext('2d')!, tex, mesh };
    }
    this.echoRoot.renderOrder = 2.65; // above the dim layer and motes, under the motif and lyrics
    this.textScene.add(this.echoRoot);
    this.bars = [1, -1].map((side) => {
      const bar = new THREE.Mesh(new THREE.PlaneGeometry(W * 1.2, H * 0.2), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, depthTest: false, depthWrite: false })); // transparent: drawn in the same pass as the plates, so renderOrder holds
      bar.renderOrder = 2.6;
      bar.userData['side'] = side;
      this.scene.add(bar);
      return bar;
    });
    this.scene.add(this.motes);
    this.dim = new THREE.Mesh(new THREE.PlaneGeometry(W * 1.2, H * 1.2), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, depthTest: false }));
    this.dim.renderOrder = 2;
    this.scene.add(this.dim);
    this.textRoot.renderOrder = 3;
    this.textScene.add(this.textRoot);
    this.gradient = this.makeGradient();
  }

  /** The job's faces on the page, for this song's characters. */
  async loadFaces() {
    const design = this.job.treatment.design ?? DEFAULT_DESIGN;
    const fonts = resolveFonts({ ...this.job.fonts, family: this.job.fonts?.family ?? design.font });
    // (every weight the accent face has: a world's labels may set it bold, y2k's pixel menu)
    await Promise.all((FONTS.find((f) => f.family === design.accentFont)?.weights ?? [400]).map((w) => document.fonts.load(`${w} 100px "${design.accentFont}"`, 'Aa!')));
    const latin = readingLatin(design.accentFont);
    await Promise.all([700, 900].map((w) => document.fonts.load(`${nearestWeight(latin, w)} 100px "${latin}"`, 'Aa')));
    // (with every world label's characters: a label in the song's language never waits a frame for its glyphs, labels.ts)
    const text = this.job.cues.map((c) => c.text).join('') + ALL_LABEL_TEXT;
    const faces = [[fonts.display, 400], [fonts.body, 900], [fonts.body, 700], [fonts.script, 400], [quietFace(fonts.display), 500], [contrastFace(fonts.display), 900]] as const;
    await Promise.all(faces.map(([f, w]) => document.fonts.load(`${nearestWeight(f, w)} 100px "${f}"`, text)));
  }

  async init() {
    const { treatment, cues } = this.job;
    const design = treatment.design ?? DEFAULT_DESIGN;
    // (a style world's job: its lines carry a world layout (cue.world) or its design names one; the type floor binds every line of it)
    const inWorld = !!design.world || treatment.cues.some((c) => !!(c as { world?: unknown }).world);
    const fonts = (this.fonts = resolveFonts({ ...this.job.fonts, family: this.job.fonts?.family ?? design.font }));
    setKanaScale(design.kanaScale);
    this.accentFont = design.accentFont;
    if (!this.job.facesLater) await this.loadFaces();
    const loader = new THREE.TextureLoader();
    await Promise.all(
      Object.entries(this.job.assets).map(async ([id, a]) => {
        const tex = await loader.loadAsync(a.url);
        tex.colorSpace = THREE.SRGBColorSpace;
        this.images.set(id, tex);
      }),
    );
    // story props take their pictures' aspect (their boxes make room for the lyrics); a prop with no picture (the
    // image model dropped it) is taken out instead of drawing nothing where the story expects it
    // a calls board (idol Live's LED marquee) shows the song's calls as they are shouted, apart from the lead's lines
    if (treatment.graphics) {
      const script = callTimes(cues).map(({ text, at }) => ({ text, at }));
      for (const sec of treatment.graphics.sections) for (const l of sec.layers) if (l.kind === 'led' && l.calls) l.script = script;
    }
    this.inksAtStart();
    if (treatment.graphics?.story) {
      const pic = (prop: string) => this.images.get(`spr:${prop}`)?.image as { width: number; height: number } | undefined;
      const aspect = (prop: string) => pic(prop)!.width / pic(prop)!.height;
      // a shape chain or a float keeps the shapes that were drawn (and drops out if fewer than it needs remain)
      treatment.graphics.story = treatment.graphics.story
        .filter((it) => !('prop' in it) || pic(it.prop))
        .map((it) => {
          if ('prop' in it) return { ...it, aspect: aspect(it.prop) };
          if (it.kind === 'morph') {
            const steps = it.steps.filter((s) => pic(s.prop));
            return { ...it, steps, aspects: Object.fromEntries(steps.map((s) => [s.prop, aspect(s.prop)])) };
          }
          if (it.kind === 'float') {
            const props = it.props.filter((p) => pic(p));
            return { ...it, props, aspects: Object.fromEntries(props.map((p) => [p, aspect(p)])) };
          }
          return it;
        })
        .filter((it) => (it.kind === 'morph' ? it.steps.length > 1 : it.kind === 'float' ? it.props.length > 0 : true));
      // a card the colour of the ground it lands on cannot be read (行星's second, dark-blue time notes on the night
      // sky): measured where it lands (without the story drawn), it turns to light paper with dark ink
      const story = treatment.graphics.story;
      treatment.graphics.story = undefined;
      const cards = story.map((it) => {
        if (it.kind !== 'cards' && it.kind !== 'chapter') return it;
        const box = new THREE.Box3(new THREE.Vector3(it.x * (W / 2) - 260, it.y * (H / 2) - 200, 0), new THREE.Vector3(it.x * (W / 2) + 260, it.y * (H / 2) + 120, 0));
        const ground = this.backdropAt((it.kind === 'cards' ? it.from : it.at) + 0.5, box)?.mean;
        return ground && contrast(it.color, ground) < 2.2 ? { ...it, color: '#F4ECDA', ink: '#1E1C24' } : it;
      });
      // a prop the tone of its ground (落ちた風鈴: pale glass on cream paper) gets a halo of the opposite tone
      treatment.graphics.story = cards.map((it) => {
        if (!('prop' in it)) return it;
        const tone = this.spriteTone(`spr:${it.prop}`);
        // where and when it is first fully seen (a moving prop: where its journey ends, an orbit: its centre)
        const seen = it.kind === 'follow' ? firstSeen(cards, cards.indexOf(it), Math.max(0, ...storyEvents(cards)) + 5) : undefined;
        if (it.kind === 'follow' && !seen) return it;
        const at = seen ? seen.t + 0.5 : it.kind === 'hero' ? it.states[0]?.at ?? 0 : it.kind === 'fly' ? it.at + it.dur : it.kind === 'pop' ? it.at + 0.5 : it.kind === 'journey' ? it.to : it.kind === 'follow' ? 0 : it.from + 0.5;
        const [x, y] = seen ? [seen.x, seen.y] : it.kind === 'journey' ? it.pts[it.pts.length - 1] : [it.x, it.y];
        const [hw, hh] = [(it.size * H * (it.aspect ?? 1)) / 2, (it.size * H) / 2];
        const box = new THREE.Box3(new THREE.Vector3(x * (W / 2) - hw, y * (H / 2) - hh, 0), new THREE.Vector3(x * (W / 2) + hw, y * (H / 2) + hh, 0));
        const ground = this.backdropAt(at, box)?.mean;
        if (!tone || !ground || contrast(tone, ground) >= 1.6) return it;
        return { ...it, lift: contrast(ground, '#000000') > contrast(ground, '#FFFFFF') ? 'rgba(20,18,24,0.75)' : 'rgba(255,250,240,0.85)' };
      });
    }
    const logo = this.job.meta?.logo ? await loader.loadAsync(this.job.meta.logo) : undefined;
    if (logo) logo.colorSpace = THREE.SRGBColorSpace;
    const ctx = { fonts: this.fonts, accentFont: this.accentFont, meta: { title: this.job.meta?.title ?? '', artist: this.job.meta?.artist ?? '' }, logo, texture: (id: string) => this.images.get(id), lines: (shotId: string) => this.shotLines.get(shotId) ?? [] };
    if (treatment.motif && (!design.system || SYSTEMS[design.system].motif) && (!design.language || LANGUAGES[design.language].motif)) {
      this.motif = new MotifLayer(treatment.motif, this.job.beats, { display: this.fonts.display, accent: this.accentFont });
      this.motif.group.renderOrder = 2.7; // above the background and motes, under the lyrics
      this.scene.add(this.motif.group);
    }
    for (const spec of treatment.scenes ?? []) {
      const stop = colorAt(design.colorScript, spec.start + 0.5);
      this.customScenes.push(new CustomScene(spec, { W, H, start: spec.start, end: spec.end, palette: { shadow: stop.shadow, highlight: stop.highlight, accent: stop.accent }, beats: this.job.beats, beatStrength: this.job.beatStrength ?? [], hash }));
    }
    // a sing-along template without the buyer's option (a hand-edited or stale plan) is set as a plain stack instead
    for (const shot of treatment.shots) if (missingOptIn(shot.template, design)) Object.assign(shot, { template: 'stack', params: {} });
    // 'auto' placement: the lyrics go to the third of the frame where the background is calmest at that shot
    for (const shot of treatment.shots)
      for (const [k, v] of Object.entries(shot.params)) if (v === 'auto') shot.params[k] = this.calmSide(shot, k);
    for (const shot of treatment.shots) {
      const r = RENDERERS[shot.template];
      if (r?.shot) {
        const from = r.standalone ? this.clearOfLines(shot) : shot.start;
        const make = (palette: Palette) => {
          const l = r.shot!({ ...shot, start: from }, shot.params, palette, ctx);
          l.group.visible = false;
          this.textRoot.add(l.group);
          return l;
        };
        let layer = make(treatment.styleAnchor.palette);
        if (r.standalone && treatment.graphics) {
          // measured once it has fully drawn in (glyphs sit at the origin until the first update)
          const at = Math.min(from + 2.5, shot.end - 1);
          layer.update(at, { flash: 0, hit: 0, shake: 0 });
          layer.group.updateMatrixWorld(true);
          const b = new THREE.Box3().setFromObject(layer.group);
          if (!b.isEmpty()) {
            // the title takes dark or light type against what is behind it, like a line, and the background makes room;
            // a long card spans several camera shots, so the backdrop is sampled across it and the type must read on all
            const samples = [at, (at + shot.end) / 2, shot.end - 1.5].filter((x) => x >= from && x < shot.end).map((x) => this.backdropAt(x, b)?.mean).filter((x): x is string => !!x);
            const lumas = samples.map(luma);
            const darkType = Math.min(...lumas) > 1 - Math.max(...lumas);
            // the colour is picked against the backdrop that is hardest for that type: dark type against the darkest
            // sample, light type against the lightest (picked the other way round, 雙截棍's title went dark on dark)
            const backdrop = samples.length ? samples[lumas.indexOf(darkType ? Math.min(...lumas) : Math.max(...lumas))] : undefined;
            // a card over both dark and light ground (a dark intro cutting to yellow) gets the line treatment for that
            const spread = lumas.length ? Math.max(...lumas) - Math.min(...lumas) : 0;
            const both = spread > 0.35;
            const text = both ? '#f4f2ee' : backdrop ? this.cuePalette(at, backdrop).text : treatment.styleAnchor.palette.text;
            const ground = both ? '#141218' : backdrop ?? treatment.styleAnchor.palette.background;
            this.textRoot.remove(layer.group);
            setHalo(both ? MIXED_HALO : luma(ground) > 0.5 ? hexToRgba(ground, 0.95) : 'rgba(0,0,0,0.85)');
            layer = make({ ...treatment.styleAnchor.palette, text, background: ground });
            const r = { x0: b.min.x + W / 2, y0: H / 2 - b.max.y, x1: b.max.x + W / 2, y1: H / 2 - b.min.y };
            this.lyricRects.push({ from, to: shot.end, rect: r, rest: r });
          }
        }
        this.shotLayers.set(shot.id, layer);
      }
    }
    const live = !!this.job.live && !!design.composer && !design.lineDirect;
    // a scene's lines are drawn by its parts: nothing below (merging, pacing, room-making, recolouring) touches them
    this.storyboard = treatment.storyboard ?? [];
    // the story's drawn props and the song's title, for the scene parts that show them
    setScenePictures((prop) => this.images.get(`spr:${prop}`)?.image as (CanvasImageSource & { width: number; height: number }) | undefined, this.job.meta ? { title: this.job.meta.title, artist: this.job.meta.artist } : undefined);
    if (this.storyboard.length) {
      const text = this.storyboard.flatMap((sc) => shownTexts(sc, this.sceneSong()).map((x) => x.text)).join('') + 'iLiFE!';
      const faces = new Set([...SCENE_FONTS, ...this.storyboard.flatMap((sc) => sc.parts.flatMap((p) => (typeof p.params?.['font'] === 'string' ? [p.params['font'] as string] : [])))]);
      const extra = '特典券No.0046CHEKI×1¥2,000TIME UP0123456789:';
      await Promise.all([...faces].flatMap((f) => [400, 700, 900].map((wt) => document.fonts.load(`${wt} 100px "${f}"`, text + extra))));
    }
    // which lines show and when, the handoffs that run, the pictures pulled to their lines and the linked page moves
    // laid on the world's sections: one computation, shared with the plan (line-shows.ts); with the song's one event plan
    // (Q1, world-events.ts) only the page handoffs that plan approved are laid
    const { styled, repeats, shouts, showAt } = lineShows(treatment, cues, this.job.tempo, treatment.graphics?.sections, approvedOf(treatment));
    for (const [i, { cue, style }] of styled.entries()) this.shotLines.set(style.shot, [...(this.shotLines.get(style.shot) ?? []), { text: cue.text, at: showAt[i] }]);
    // the title as sung gets one fixed treatment every time it appears (accent colour), like a logotype
    // strokes only when the director picked them (older treatments without techniques keep whole glyphs)
    setPieces(!!design.techniques?.includes('pieces'));
    if (design.composer) {
      const song = songKeyOf(this.job.meta?.title ?? '', design.reroll);
      setSheet(song);
      setWordSafe(true);
      tuneHandoffs({ body: songVary({ song }, 'hand.body', 340, 560), lean: songVary({ song }, 'hand.lean', 0.12, 0.3), panels: songVary({ song }, 'hand.panels', -0.04, 0.05) });
    }
    // a quiet song's lines carry no offset ghost (三年後的大雪's thick shadows pushed its longing into a poster's shout)
    const langGhost: [number, number] = design.language && !design.quiet ? (LANGUAGES[design.language].text?.ghost ?? [0, 0]) : [0, 0];
    setGhost(langGhost);
    setFinish(design.finish);
    setSizeCap(design.language ? (LANGUAGES[design.language].text?.cap ?? 1) : 1);
    const hook = uses(design, 'title-hook') ? titleHook(this.job.meta?.title ?? '') : '';
    const buildLine = ({ style: style1, cue: cue0 }: (typeof styled)[number], i: number) => {
      // the paid director's word sync: the server's sung times stand in for the song's own on this line (word-sync.ts
      // let them through), so each character lands on its voice
      const cue1 = style1.reveal === 'sung' && style1.sung?.length === [...cue0.text].length ? { ...cue0, charStarts: style1.sung, charTimed: true } : cue0;
      // bracketed calls leave the line for a track of their own; emphasis and breaks follow the remaining text (a chat
      // message keeps its aside: 「もう殺しちゃいたいんだ (キルユー)」 is one message)
      const inChat = threadShot(treatment.shots.find((s) => s.id === style1.shot));
      const split = inChat ? { main: cue1.text, calls: [] as Call[], map: [...cue1.text].map((_, k) => k) } : splitCalls(cue1.text);
      const cue = split.calls.length ? { ...cue1, text: split.main, charStarts: cue1.charStarts && cue1.charStarts.length === split.map.length ? cue1.charStarts.filter((_, k) => split.map[k] >= 0) : undefined } : cue1;
      const style0 = split.calls.length
        ? {
            ...style1,
            emphasis: style1.emphasis?.flatMap((e) => {
              const r = mapRange(split.map, e.from, e.to);
              return r ? [{ ...e, from: r[0], to: r[1] }] : [];
            }),
            rows: style1.rows?.map((r) => split.map[r]).filter((r) => r > 0),
          }
        : style1;
      const hooks = hookRanges(cue.text, hook).map(([from, to]) => ({ from, to, method: 'color' as const }));
      const hOut = styled[i + 1]?.style.handoff;
      // the line coming in is carried in with its picture and the one going out is carried off: neither plays its own move
      const style = { ...(hooks.length ? { ...style0, emphasis: [...hooks, ...(style0.emphasis ?? [])] } : style0), ...(style0.handoff ? { enter: 'cut' as const, reveal: 'line' as const } : {}), ...(hOut ? { exit: hOut.kind === 'relay' ? ('fade' as const) : ('cut' as const) } : {}) };
      if (design.composer) this.lastExits.set(cue.id, style0.exit);
      const shot = treatment.shots.find((s) => s.id === style.shot)!;
      const next = styled[i + 1]?.cue;
      const nextShow = next ? showAt[i + 1] : Infinity;
      const len = cue.end - cue.start;
      const pace = Math.min(1, Math.max(0.35, len / 2)); // short lines enter and leave faster so they stay readable
      // a rushed line leaves in a blink: its exit animation would eat the little time it has
      const rushedLine = len < [...cue.text.replace(/\s/g, '')].length / 12 + 1;
      // a glitch or a blade needs time to be seen; it takes up to half a second when the next line leaves room (a row of
      // dominoes or a shattering pane up to 0.8 s: in 0.28 s neither reads as more than a flicker)
      // a cut needs no time: the line holds until the next one shows (leaving early left a frame with no words in it)
      // a fade takes the time the music leaves it: half the gap to the next line, 0.28–1 s
      const fadeSec = Math.min(1, Math.max(EXIT_SEC * pace, (nextShow - cue.end) * 0.5));
      // a falling, breaking or pixelating exit may take 0.6 s of the line's own end when the line has that much more than
      // it needs to be read (lines sung back to back left it 0.28 s: a blink, never seen as dominoes or glass)
      const spare = len - readingSec(cue.text, cue.start, cue.end);
      const drawnFloor = ['domino', 'shatter', 'pixel'].includes(style.exit) && spare > 0.8 ? 0.6 : 0;
      // a line with no time for a composer exit does without it
      const noExit = isLineExit(style.exit) && rushedLine && !style.budget;
      const exitSec = style.exit === 'cut' || noExit ? 0 : isLineExit(style.exit) ? LINE_EXIT_SEC[style.exit] : style.exit === 'collapse' ? 0.14 : rushedLine ? 0.08 : style.exit === 'fade' ? fadeSec : LONG_EXITS.has(style.exit) ? Math.max(EXIT_SEC * pace, drawnFloor, Math.min(style.exit === 'domino' || style.exit === 'shatter' ? 0.8 : 0.5, nextShow - cue.end - 0.05)) : EXIT_SEC * pace;
      // breathing: a line holds up to 1.2 s past its last syllable when nothing follows straight away
      // lines after this one in the same shot (stack and couplet keep earlier lines up while they arrive)
      const later = styled.flatMap((x, j) => (j > i && x.style.shot === style.shot ? [showAt[j]] : []));
      const laterText = styled.flatMap((x, j) => (j > i && x.style.shot === style.shot ? [x.cue.text] : []));
      const shotText = styled.flatMap((x) => (x.style.shot === style.shot ? [x.cue.text] : []));
      const firstVoice = styled.find((x) => x.style.shot === style.shot)?.style.voice;
      const persist = RENDERERS[shot.template]?.persist;
      const leaveBy = (() => {
        // a composer line is gone before the next one's shot shows it
        if (style.budget && next && styled[i + 1].style.shot !== style.shot) return nextShow;
        const other = styled.findIndex((x, j) => j > i && x.style.shot !== style.shot);
        const shotOver = Math.min(shot.end, other >= 0 ? showAt[other] : Infinity);
        if (persist === 'shot') return shotOver;
        if (persist === 'next') return Math.min(shotOver, later[1] ?? Infinity);
        return nextShow;
      })();
      // (a world's shared shot is gone before the next line shows, however late its own line runs)
      // (a sing-along line stays until the next one shows only while that one follows soon: its preview waits there)
      const held = !!persist && (persist !== 'preview' || (!!next && next.start - cue.end <= PREVIEW_GAP));
      const exitAt = shot.template === 'world-pair' ? leaveBy - exitSec - EXIT_LEAD : held ? Math.max(cue.end, leaveBy - exitSec - EXIT_LEAD) : Math.min(cue.end + (style.linger ?? HOLD_SEC), nextShow - exitSec - EXIT_LEAD);
      const inBeats = beatsDuring(this.job.beats, cue.start, cue.end);

      // a line sung faster than it can be read appears whole: word reveals and staggered pieces would eat its time
      const entrance = this.job.entrance ?? 'whole';
      const { style: paced, rushed, adjust } = paceStyle(noExit ? { ...style, exit: 'cut' as const } : style, cue, entrance !== 'cut');
      // a quick entrance comes in on the whole line at once
      const together = entrance === 'whole' && adjust.includes('fast-short');
      const rt: CueRuntime = {
        inkFx: this.inkFxBox,
        cue, style: paced, shot, params: shot.params, palette: this.paletteAt(cue.start + 0.3), // a colour stop set on the drop beat can sit a few ms after the line's start
        // an English line is set in the paired Latin face (fonts.ts lineFace: the plan's reading of the same choice)
        fonts: isLatinLine(cue.text) ? { display: readingLatin(this.accentFont), body: readingLatin(this.accentFont), script: readingLatin(this.accentFont) } : this.fonts,
        showFrom: showAt[i],
        exitAt: Math.max(cue.start + 0.25 * pace, exitAt),
        exitDur: Math.max(0.08, Math.min(exitSec, (persist ? leaveBy : nextShow) - Math.max(cue.start + 0.25 * pace, exitAt) - 0.02)),
        accentTimes: [...(style.accents ?? []).map((k) => inBeats[k]).filter((b) => b !== undefined), ...(repeats.get(cue.id) ?? [])].sort((a, b) => a - b),
        pace,
        rushed,
        planned: { enter: style.enter, reveal: style.reveal },
        song: songKeyOf(this.job.meta?.title ?? '', design.reroll),
        bpm: this.job.tempo,
        together,
        adjust,
        later,
        laterText,
        shotText,
        firstVoice,
        order: styled.slice(0, i).filter((x) => x.style.shot === style.shot).length,
        songOrder: i,
        prevText: styled[i - 1]?.cue.text,
        prevEnd: styled[i - 1]?.cue.end,
        nextText: styled[i + 1]?.cue.text,
        nextStart: styled[i + 1]?.cue.start,
      };
      // (a world line's inks are checked on the ground each glyph really stands on, world-layout measuredInks)
      if (hOut) Object.assign(rt, hOut.kind === 'relay' ? { exitAt: hOut.from, exitDur: 0.6 * (hOut.to - hOut.from) } : { exitAt: hOut.to, exitDur: 0.06 });
      // a line its world erases (Q1 phase 3b, an approved event only): the erase is its way out, at the approved time
      const wipe = (style.world as { wipe?: { from: number; sec: number } } | undefined)?.wipe;
      if (wipe) Object.assign(rt, { exitAt: wipe.from, exitDur: wipe.sec });
      // small kana only on the impact templates: on every line it read as an algorithm
      setKanaScale(KANA_TEMPLATES.has(shot.template) ? design.kanaScale : 1);
      // dark type on a light field gets a halo of that field's colour: it then reads over a photo inset as well
      // with a graphic look the lyric colour comes from what is actually behind the lyrics: the line is laid out once
      // to find where it sits, the look is measured there, and the line is built again in a colour that reads
      let backdrop: string | undefined;
      let mixed = false;
      // the composer's lines take both inks of the cut under them (below): what the look measures here would be thrown away
      if (this.job.treatment.graphics && !(design.composer && !design.lineDirect && this.kineticInks(cue.start, cue.end))) {
        setHalo('rgba(0,0,0,0)');
        const probe = RENDERERS[shot.template].cue({ ...rt, style: templateStyle(rt.style) });
        const box = settledBox(probe);
        const where = box.isEmpty() ? undefined : box;
        const measured = this.backdropAt(cue.start + Math.min(1, (cue.end - cue.start) / 2), where);
        backdrop = measured?.mean;
        mixed = measured?.mixed ?? false;
        rt.palette = this.cuePalette(cue.start + 0.3, backdrop);
        // the camera moves under a held line: measured again as it lands and as it leaves; where the chosen colour
        // falls short anywhere (a bright lake sliding in), the line takes the treatment that reads on anything
        const ends = [cue.start + 0.15, Math.max(cue.start + 0.2, cue.end - 0.2)].map((x) => this.backdropAt(x, where)).filter((m): m is NonNullable<typeof m> => !!m);
        if (ends.some((m) => m.mixed || contrast(rt.palette.text, m.mean) < 3)) mixed = true;
      }
      // a line over light and dark at once (stripes, a photo inset) stays one colour: light type in a dark halo reads
      // on both; flipping each glyph to the other ink made words change colour for no reason
      // the emphasis colour is read against the same dark keyline as the type: measured against the light half of the
      // backdrop it was darkened, and a dark keyword sat unreadable on the dark half (世界のつづき 「波に」)
      const colour = (mix: boolean) => {
        if (mix) rt.palette = { ...rt.palette, text: LIGHT_TYPE, background: '#141218' };
        // a member's line in the member's colour, lightened or darkened until it reads on what is behind it
        const singer = cue.singer ? this.job.singers?.find((x) => x.name === cue.singer) : undefined;
        if (singer) rt.palette = { ...rt.palette, text: readableOn(singer.color, backdrop ?? rt.palette.background, 4.5) };
        // a one-ink look (phosphor) keeps its ink on everything: the dark halo carries it over a busy backdrop
        // a section on a real Mac / Windows desktop takes white type instead, so the two kinds of section read apart
        // (read mid-line: the director's section starts are rounded and land a few hundredths after the cut)
        const desk = this.job.treatment.graphics && sectionAt(this.job.treatment.graphics, (cue.start + cue.end) / 2).layers.some((l) => l.kind === 'ui' && (l.skin === 'mac' || l.skin === 'win'));
        const ink = design.language && LANGUAGES[design.language].text?.ink;
        if (ink) rt.palette = { ...rt.palette, text: desk ? '#F5F5F7' : ink };
        setHalo(mix ? MIXED_HALO : backdrop && luma(backdrop) > 0.5 ? hexToRgba(backdrop, 0.95) : 'rgba(0,0,0,0.85)');
        // the dark offset copy goes under light type; dark type gets the offset as a coloured second ink instead (a dark
        // shadow under dark heavy type merged the strokes into one blob)
        const darkType = luma(rt.palette.text) <= 0.5;
        // dark type never sits on a dark halo or keyline: its strokes and counters fill in and the word reads as one
        // blob (てぇてぇ's chorus: dark type on a dark keyline). A light halo keeps it legible on any ground
        if (darkType && (mix || !(backdrop && luma(backdrop) > 0.5))) setHalo('rgba(255,255,255,0.92)');
        // a soft ring round each letter is the same smudge as a keyline: the composer's lines stand on their ground alone
        if (design.composer && !design.lineDirect) setHalo('rgba(0,0,0,0)');
        setGhost(darkType ? [0, 0] : langGhost);
        setInkGhost(darkType && (langGhost[0] || langGhost[1]) ? { dx: langGhost[0] * 1.4, dy: langGhost[1] * 1.4, color: new THREE.Color(rt.palette.accent).lerp(new THREE.Color(1, 1, 1), 0.25) } : null);
      };
      colour(mixed);
      // templates draw the plain entrance/exit; ink, glitch, slash and drawn emphasis go on top (text-fx.ts)
      // a line in motion with the camera or a handoff is not being read yet, or no longer
      const heldFrom = Math.max(style.handoff?.to ?? -Infinity, style.textCam?.rig?.to ?? -Infinity);
      const heldTo = hOut ? hOut.from : Infinity;
      const inFrame = (l: CueLayer): CueLayer => (heldFrom === -Infinity && heldTo === Infinity ? l : { ...l, readable: () => { const [a, b] = l.readable(); return [Math.max(a, heldFrom), Math.min(b, heldTo)]; } });
      let drawn = shot.template;
      const build = (r = rt) => inFrame(withTextFx(RENDERERS[drawn].cue({ ...r, style: templateStyle(r.style) }), r));
      let layer = build();
      // a sing-along's preview row reads on what is under it there (measured where it stands), not on the line's ground
      const pv = previewBox(layer);
      if (pv) {
        const m = this.backdropAt(cue.start + Math.min(1, (cue.end - cue.start) / 2), pv);
        if (m) {
          rt.previewGrounds = [m.mean, ...(m.grounds ?? [])];
          layer = build();
        }
      }
      // the floor on type size: a line that would rest under it takes plain stepped rows, its moves given up for them
      const alone = !styled.some((x, j) => j !== i && x.style.shot === style.shot);
      // (in a style world every line rests at the type floor, render/type-floor.ts, a world line too: one that no set of its
      // world holds at the floor, and that the fit cannot hold, is laid as plain stepped rows, as a shared template's line
      // is (a stack line set its words at 73 px among the world's own lines at 84 and up, silk チョロイン c046; document
      // c041 rested at 80 px in the only set that took it, 2026-11-12)
      const probe = build();
      // (the floor this line must rest at, from the set it was planned in: kept whichever way it falls back to plain rows, which carry no set)
      const floorNeed = Math.max(probe.floor ?? 0, TYPE_FLOOR.lo);
      const planned = !!rt.style.world?.blow;
      let blowReason: string | undefined;
      const floor = inWorld ? floorNeed - 0.5 : REST_FLOOR;
      if (style.budget && alone && restSize(probe, fitToFrame) < floor) {
        drawn = 'stair';
        rt.style = { ...rt.style, enter: 'cut', exit: 'fade' };
        rt.params = { ...rt.params, floor: floorNeed };
        layer = build();
        this.floored.add(cue.id);
        if (planned) blowReason = 'stair';
      }
      // a line not up long enough to read holds into the free time after it, or lands and leaves at once (the
      // templates read their timing when built, so the line is built again with the new timing)
      const need = readingSec(rt.cue.text, rt.cue.start, rt.cue.end);
      const limit = (persist ? leaveBy : nextShow) - 0.02;
      // the line composer's lines pay for reading in its order: the exit goes before the entrance does
      if (style.budget && !hOut && rt.style.exit !== 'cut') {
        const [from] = layer.readable();
        const kept = gateMotion({ enter: Math.max(0, from - rt.showFrom), exit: rt.exitDur, extra: 0 }, limit - rt.showFrom, need);
        if (!kept.exit) {
          Object.assign(rt, { style: { ...rt.style, exit: 'cut' as const }, exitAt: limit - 0.08, exitDur: 0.08 });
          layer = build();
        }
      }
      const fixRead = fitReading(rt, (r) => (r === rt ? layer : build(r)).readable(), need, limit, entrance !== 'cut', entrance === 'whole');
      if (fixRead) {
        Object.assign(rt, fixRead);
        layer = build();
      }
      // a kinetic print swaps paper and ink from cut to cut under one line: no one type colour reads on both (light
      // type with a dark keyline sat unreadable on the cream cuts), so the line is built in both inks and each frame
      // shows the one that reads on the cut behind it (updateCues)
      const inks = this.kineticInks(cue.start, cue.end);
      let twin: CueLayer | undefined;
      const keyOn: [string, string] = ['', '']; // each build's type colour after the language's own ink
      if (inks) {
        // a world's key ink reads on what its painted ground really puts under the line, not only on the paper the line
        // is set on (citypop's coral run on the sky over the night sea: 2.5:1, 12 of 489 moments, 2026-11-05)
        // (each colour that covers a fair share of the box, not its mean: a copier's dark edge or a corner pulled the mean
        // of brutalist's grey paper down until its red key was pushed to the body's black, 2026-11-05)
        const paper = inks.paper.toLowerCase();
        const under = (this.backdropAt(cue.start + Math.min(1, (cue.end - cue.start) / 2), settledBox(layer))?.grounds ?? []).filter((g) => g.toLowerCase() !== paper);
        if (under.length) rt.under = under;
        const inked = (text: string, ground: string) => {
          backdrop = ground;
          rt.palette = { ...this.cuePalette(cue.start + 0.3, ground), text };
          colour(false);
          return build();
        };
        layer = inked(inks.ink, inks.paper);
        keyOn[0] = rt.palette.text;
        twin = inked(inks.paper, inks.ink);
        keyOn[1] = rt.palette.text;
        twin.group.visible = false;
        mixed = true; // never rebuilt as light type in a dark halo (the guard below)
      }
      setInkGhost(null);
      layer.group.visible = false;
      // the kick (kickAt) moves the line only where the section is loud enough: its fit and its room count it there
      const span = rt.exitAt + rt.exitDur - rt.showFrom;
      const kick = Array.from({ length: Math.ceil(span / 0.25) + 1 }, (_, k) => rt.showFrom + k * 0.25).some((x) => fxAt(x, treatment.moments ?? [], treatment.arc ?? []).level >= KICK_LEVEL);
      let fit = fitToFrame(layer, kick);
      // (the line laid again after a change to how it is drawn: both builds of a line in two inks, the twin too)
      const rebuild = () => {
        if (inks) {
          const inked = (text: string, ground: string) => {
            backdrop = ground;
            rt.palette = { ...this.cuePalette(cue.start + 0.3, ground), text };
            colour(false);
            return build();
          };
          layer = inked(inks.ink, inks.paper);
          twin = inked(inks.paper, inks.ink);
          twin.group.visible = false;
          setInkGhost(null);
          layer.group.visible = false;
        } else layer = build();
        fit = fitToFrame(layer, kick);
      };
      // a held line drifts slowly one way and grows a little, so type never sits frozen (each line its own direction)
      const ang = hash(i, 41) * Math.PI * 2;
      const driftOf = (l: CueLayer): [number, number] | undefined => (l.framed ? undefined : [Math.cos(ang) * 14, Math.sin(ang) * 8]);
      // (the line's own camera and drift over its whole play span, the poses the hold keeps the words in the frame through)
      const cannotHold = () => holdShort(layer, fit.scale.x, (t) => this.koma(t), kick, floorNeed, this.camPoses({ rt, drift: driftOf(layer) }, layer.readable()));
      if (inWorld && !layer.framed) {
        // (a blown-up key the frame cannot hold with the words round it at the floor gives way: the line stands as its set lays
        // it, as when blowPose finds no room; led-board and silk-cold lines rested at 80 px under a key that took the fit to 0.93)
        if (rt.style.world?.blow && !blowReason && cannotHold()) {
          rt.style = { ...rt.style, world: { ...rt.style.world, blow: undefined } };
          blowReason = 'frame';
          rebuild();
        }
        // (a line the frame cannot hold at the floor through all its motion, whatever its set: plain stepped rows take it, as a
        // shared template's line is, set no smaller than the set it came from asked; gothic-lolita c048 rested at 81 px, too wide
        // at 84 for the kick, 2026-11-14)
        if (alone && cannotHold()) {
          drawn = 'stair';
          rt.style = { ...rt.style, enter: 'cut', exit: 'fade' };
          rt.params = { ...rt.params, floor: floorNeed };
          this.floored.add(cue.id);
          if (planned && !blowReason) blowReason = 'stair';
          rebuild();
          // (the last resort is checked too: six rows at the least size may still not stand in the frame)
          if (cannotHold()) this.floorMissed.add(cue.id);
        }
      }
      if (planned && !blowReason && layer.blow === 'refused') blowReason = 'pose';
      if (blowReason) this.blowDropped.set(cue.id, blowReason);
      if (style.budget) this.rests.set(cue.id, restSize(layer, undefined, fit));
      this.textRoot.add(fit);
      const rig = rt.style.textCam?.rig;
      if (rig && isTrack(rig.kind)) {
        // the backdrop's copy of the camera calls at the same stops
        const stops = trackStops(layer, fit, phraseSpans(rt.cue.text, 3));
        Object.assign(rig, stops);
        for (const l of (treatment.graphics?.sections.flatMap((x) => x.layers) ?? []) as { rig?: CameraRig }[]) if (l.rig?.from === rig.from) Object.assign(l.rig, stops);
      }
      const holds = inWorld && !layer.framed;
      const entry: (typeof this.cueLayers)[number] = { index: i, rt, layer, fit, fitScale: fit.scale.x, holds, kick, need: floorNeed, drift: layer.framed ? undefined : [Math.cos(ang) * 14, Math.sin(ang) * 8], mixed };
      if (twin) {
        const f = fitToFrame(twin, kick);
        this.textRoot.add(f);
        entry.twin = { layer: twin, fit: f, text: keyOn };
      }
      // rebuilt light type in a dark halo (same timing and layout): a line found over a picture once the song is laid out
      entry.remake = () => {
        setKanaScale(KANA_TEMPLATES.has(shot.template) ? design.kanaScale : 1);
        colour(true);
        const l = build();
        setInkGhost(null);
        l.group.visible = false;
        const f = fitToFrame(l, kick);
        const kids = this.textRoot.children;
        const k = kids.indexOf(entry.fit!);
        entry.fit!.removeFromParent();
        this.textRoot.add(f);
        kids.splice(k, 0, kids.pop()!); // drawn in the same order as before
        Object.assign(entry, { layer: l, fit: f, fitScale: f.scale.x, hold: undefined, holds: inWorld && !l.framed, mixed: true });
        this.settleHold(entry);
      };
      if (live) this.cueLayers.splice(this.cueLayers.findIndex((c) => c.index! > i) >>> 0, 0, entry);
      else this.cueLayers.push(entry);
      if (this.job.treatment.graphics) {
        // where the line sits on screen, so background objects can make room for it
        // beat-cut throws its phrases all over the frame before the line settles: the whole frame is the line's
        const b = settledBox(layer, fit, true);
        const pv = previewBox(layer);
        if (pv) this.keepOut.push({ id: rt.cue.id, from: rt.showFrom, to: rt.exitAt + rt.exitDur, rect: { x0: pv.min.x + W / 2, y0: H / 2 - pv.max.y, x1: pv.max.x + W / 2, y1: H / 2 - pv.min.y } });
        if (layer.poses) for (const p of layer.poses()) this.lyricRects.push({ id: rt.cue.id, from: p.from, to: p.to, rect: p.rect, rest: p.rect });
        else if (shot.template === 'beat-cut') this.lyricRects.push({ id: rt.cue.id, from: rt.showFrom, to: rt.exitAt + rt.exitDur, rect: { x0: 0, y0: 0, x1: W, y1: H }, rest: { x0: 0, y0: 0, x1: W, y1: H } });
        else if (!b.isEmpty()) {
          const px = (x: THREE.Box3): Rect => ({ x0: x.min.x + W / 2, y0: H / 2 - x.max.y, x1: x.max.x + W / 2, y1: H / 2 - x.min.y });
          const places = placesWhileRead(layer, fit, rt.later ?? []);
          // room for the line as it moves, not only where it rests; a line pushed along by later lines gets each place
          // for its own stretch (the change lands with a line coming up, where the props glide anyway), and once its
          // reading time is over (pushed out by the second one) no room at all
          if (places.length < 2) {
            const rest = px(b);
            this.lyricRects.push({ id: rt.cue.id, from: rt.showFrom, to: rt.exitAt + rt.exitDur, rect: motionPad(rest, kick), rest });
          } else {
            const readTo = layer.readable()[1];
            places.forEach((p, k) => {
              if (p.box.isEmpty()) return;
              const last = k === places.length - 1;
              const rest = px(p.box);
              this.lyricRects.push({ id: rt.cue.id, from: k ? p.from : rt.showFrom, to: last && readTo >= rt.exitAt - 0.01 ? rt.exitAt + rt.exitDur : p.to, rect: motionPad(rest, kick), rest });
            });
          }
        }
      }
      const onBoard = !!treatment.graphics && sectionAt(treatment.graphics, cue1.start).layers.some((l) => l.kind === 'led' && l.calls);
      if (split.calls.length && !onBoard) this.callLayers.push(this.makeCalls(rt, cue1, split.calls, settledBox(layer, fit)));
      // a call is sung words too: whatever is cut off at the line is cut off at it
      if (design.composer && this.job.treatment.graphics && split.calls.length && !onBoard) {
        const call = this.callLayers.at(-1)!;
        if (!call.dropped && call.units.length) this.lyricRects.push({ id: `${rt.cue.id}:call`, from: rt.showFrom, to: rt.exitAt + rt.exitDur, rect: this.callRect(call), rest: this.callRect(call) });
      }
      if (shot.params['echo'] && !this.ownDrawing(cue.start)) {
        const echo = this.makeEcho(rt);
        if (echo) this.echoes.push(echo);
      }
    };
    if (live) {
      // what a line needs of its neighbours is settled here for all of them; each is built when it is near
      this.lazy = { styled, showAt, end: this.job.window.end, build: buildLine, built: new Set(), kana: design.kanaScale };
      setKanaScale(design.kanaScale);
      return;
    }
    styled.forEach(buildLine);
    this.cueLayers.forEach((c, i) => this.layHandoff(c, this.cueLayers[i - 1]));
    this.cueLayers.forEach((c) => this.layFine(c));
    this.cueLayers.forEach((c) => this.settleHold(c));
    for (const { cue } of shouts) {
      const host = this.cueLayers.find((c) => c.rt.showFrom <= cue.start && cue.start < c.rt.exitAt) ?? this.cueLayers.find((c) => c.rt.showFrom > cue.start);
      if (!host) continue;
      const until = Math.max(cue.end, cue.start + 0.8);
      const rt = { ...host.rt, cue, showFrom: cue.start - 0.05, exitAt: until, exitDur: 0.15 };
      const box = host.rt.showFrom <= cue.start ? settledBox(host.layer, host.fit) : new THREE.Box3();
      this.callLayers.push(this.makeCalls(rt, cue, [{ text: cue.text, from: 0, to: 1 }], box, 1.9));
    }
    // every line is built now: each call is kept clear of the lines that landed after it was made
    this.callLayers.forEach((c) => this.placeCall(c));
    // each line's colour was read where it first sits, with room made for it alone; as played it may be pushed up by
    // the next lines, and an object with no room for all of them stays behind (チョロイン c003: blue type pushed up over
    // the blue stage photo). Every place a line takes is read again as played; a line whose type falls short over a
    // share of it is rebuilt light in a dark halo (a mean let a mid-tone photo under half the line pass)
    if (treatment.graphics)
      for (const c of this.cueLayers) {
        if (c.mixed || !c.remake || (treatment.design?.composer && !treatment.design.lineDirect)) continue;
        // beat-cut takes the whole frame for room (its phrases fly all over before the line settles): its type is read
        // where it settles, so that box is measured, not the frame (a photo anywhere filled a frame-wide share)
        const settled = c.rt.shot.template === 'beat-cut' ? settledBox(c.layer, c.fit, true) : undefined;
        const own = settled
          ? settled.isEmpty()
            ? []
            : [{ from: c.rt.showFrom, to: c.rt.exitAt, rest: { x0: settled.min.x + W / 2, y0: H / 2 - settled.max.y, x1: settled.max.x + W / 2, y1: H / 2 - settled.min.y } }]
          : this.lyricRects.filter((r) => r.id === c.rt.cue.id);
        const places = own
          .flatMap((r) => {
            const box = new THREE.Box3(new THREE.Vector3(r.rest.x0 - W / 2, H / 2 - r.rest.y1, 0), new THREE.Vector3(r.rest.x1 - W / 2, H / 2 - r.rest.y0, 0));
            // read after the 0.4 s objects take to glide clear of a line coming up, and the median over the place's
            // stretch: an object mid-glide as the line comes up or leaves is not where the line is read
            const at = [r.from + 0.5, (r.from + r.to) / 2, r.to - 0.2].filter((x) => x >= r.from && x <= r.to).map((x) => ({ x, poor: this.backdropAt(x, box, true, c.rt.palette.text)?.poor ?? 0 })).sort((p, q) => p.poor - q.poor);
            const mid = at[Math.floor((at.length - 1) / 2)];
            return mid ? [{ from: r.from, to: r.to, rect: r.rest, share: mid.poor, x: mid.x, box }] : [];
          });
        const worst = places.reduce<(typeof places)[number] | undefined>((a, b) => (!a || b.share > a.share ? b : a), undefined);
        if (!worst || worst.share <= POOR_SHARE) continue;
        // only when light type reads better there (guardLine): over a pale photo (チョロイン's bright stage) the line's
        // own dark ink read better than light type on a thin keyline
        const light = this.backdropAt(worst.x, worst.box, true, LIGHT_TYPE)?.poor ?? 1;
        if (!guardLine(worst.share, light, POOR_SHARE)) continue;
        c.guard = { from: worst.from, to: worst.to, rect: worst.rect, share: worst.share, light };
        c.remake();
      }
    // a kinetic cut's character stands on the other side from where its lyric actually landed (a layout with no side
    // setting, couplet, sat its lines on the left over the figure the plan had put there)
    this.layRooms();
    setKanaScale(design.kanaScale);
    this.quiet = uses(design, 'quiet') ? quietSpans(treatment.moments ?? []) : [];
    // the drop keyword flash: one per drop/finale (2–4 a song), the line's keyword set full width in the display face
    for (const m of (treatment.moments ?? []).filter((x) => uses(design, 'flash') && (x.kind === 'drop' || x.kind === 'finale'))) {
      const hit = styled.find(({ cue }) => cue.start >= m.at - 0.4 && cue.start <= m.at + 0.6);
      if (!hit) continue;
      const [k0, k1] = keywordRange(hit.cue.text, hit);
      const word = [...hit.cue.text].slice(k0, k1).join('').replace(/\s+/g, '');
      const probe = { family: fonts.display, weight: 900, size: 200 };
      const w200 = [...word].reduce((w, c) => w + advanceOf(c, probe), 0) || 1;
      const glyphs = makeGlyphs(word, { family: fonts.display, weight: 900, size: Math.round(Math.min(700, (200 * 0.9 * W) / w200)) }, new THREE.Color(1, 1, 1));
      placeRow(glyphs, 0, 20);
      const group = new THREE.Group();
      glyphs.forEach((g) => {
        g.mesh.position.set(g.x, g.y, 0);
        group.add(g.mesh);
      });
      group.visible = false;
      this.textRoot.add(group);
      this.flashes.push({ at: m.at, glyphs, group, cueId: hit.cue.id });
    }
  }

  /**
   * Each bare kinetic cut's ink, decided from what is under it at its own start, before anything else draws the look
   * (a probe for a line's colour, a seek): the same in the export and the preview at any seek (kinetic.ts inkDark).
   */
  private inksAtStart() {
    const secs = this.job.treatment.graphics?.sections ?? [];
    setDecidingInk(true);
    try {
      for (const sec of secs) if (sec.layers.some((l) => l.kind === 'kinetic' && (l as KineticLayer).bare && (l as KineticLayer).inkDark === undefined)) this.backdropAt(sec.start + 1 / 120);
    } finally {
      setDecidingInk(false);
    }
  }

  /** The room the lines leave each kinetic cut under them, for what it draws of its own. */
  private layRooms(span: [number, number] = [-Infinity, Infinity]) {
    const treatment = this.job.treatment;
    if (treatment.graphics) {
      const secs = treatment.graphics.sections;
      const rects = this.lyricRects.map((r) => ({ from: r.from, to: r.to, x0: r.rest.x0, x1: r.rest.x1 }));
      secs.forEach((sec, i) => {
        // (a line built on its own touches only the cuts it runs over)
        if ((secs[i + 1]?.start ?? Infinity) < span[0] || sec.start > span[1]) return;
        for (const l of sec.layers as Layer[]) {
          // a director's drawing sees every line read over its section, to place its props clear of them (f.room, f.fit)
          if (l.kind === 'code') {
            const until = secs[i + 1]?.start ?? Infinity;
            // (a sing-along's preview row too: the drawing composes clear of it)
            l.lines = [...this.lyricRects.map((r) => ({ ...r, rect: r.rest })), ...this.keepOut].filter((r) => Math.min(until, r.to) - Math.max(sec.start, r.from) > 0).map((r) => ({ from: r.from, to: r.to, x0: r.rect.x0, y0: r.rect.y0, x1: r.rect.x1, y1: r.rect.y1 }));
            continue;
          }
          if (l.kind !== 'kinetic') continue;
          const until = secs[i + 1]?.start ?? Infinity;
          // a board lays its pieces where this cut's lines leave the most room (board.ts)
          if (l.board) {
            const lines = this.lyricRects.map((r) => ({ from: r.from, to: r.to, ...r.rest }));
            l.zone = freeZone(lines, sec.start, until, W, H) ?? null;
            const on = lines.filter((r) => Math.min(until, r.to) - Math.max(sec.start, r.from) > 0);
            if (on.length) l.busy = on.map((r) => [r.x0, r.y0, r.x1, r.y1] as [number, number, number, number]);
          }
          if (!(l.sprite || DIAGRAM_FX.has(l.fx))) {
            // a move with big words of its own (split panels) keeps them out of the lines' way: the room the lines leave
            // ([0, 0] when they leave none; unset when nobody sings over the cut)
            const way = oppositeSide(rects, sec.start, until);
            if (rects.some((r) => Math.min(until, r.to) - Math.max(sec.start, r.from) > 0)) l.room = (way && freeBand(rects, sec.start, until, way)) || [0, 0];
            continue;
          }
          const side = oppositeSide(rects, sec.start, until);
          if (side) Object.assign(l, { side, flip: side === 'left' });
          // the lines' boxes over the cut: a prop sent to a corner takes the one they leave clear
          if (l.sprite) l.over = this.lyricRects.filter((r) => Math.min(until, r.to) - Math.max(sec.start, r.from) > 0).map((r) => [r.rest.x0, r.rest.y0, r.rest.x1, r.rest.y1] as [number, number, number, number]);
          // the floor plan: the room the lines leave it, where the character is fitted (a 1.7 close-up reached under them)
          const room = side && l.sprite ? freeBand(rects, sec.start, secs[i + 1]?.start ?? Infinity, side) : undefined;
          if (room) l.room = room;
          // a thing never sits on a sung line at full strength: with lines centred, or too little room beside them, it
          // stands behind them faded (sweet timer's carriage, wand and moon sat on its lines; dropping it instead left
          // プラトニックチョロイン a minute without pictures)
          // (centred lines with a band free above or below them first: the line director centres most lines, and every
          // prop of 世界のつづき's picture tier went behind its words, 2026-11-02)
          else if (l.sprite && rects.some((r) => Math.min(until, r.to) - Math.max(sec.start, r.from) > 0)) {
            const rows = freeRows(this.lyricRects.map((r) => ({ from: r.from, to: r.to, y0: r.rest.y0, y1: r.rest.y1 })), sec.start, until);
            if (rows) l.rows = rows;
            else l.under = true;
          }
        }
      });
      // a character carries on across a cut only where it stands as before (size, side, room, rows: kinetic.ts)
      carrySubjects(secs.flatMap((s) => s.layers.filter((l) => l.kind === 'kinetic') as KineticLayer[]));
    }
  }

  /** A storyboard frame: the scene under the moments' camera, coming in through the scene before's exit (a flash, a
   * transition from the library), lights out on its last beat when it ends that way, a drop's two white frames. */
  private drawStoryboard(ctx: CanvasRenderingContext2D, scene: Scene, t: number, since: number, beat: number) {
    const song = this.sceneSong();
    const k = this.storyboard.indexOf(scene);
    const prev = this.storyboard[k - 1];
    const joined = !!prev && Math.abs(prev.end - scene.start) < 0.1;
    const lastBeat = [...this.job.beats].reverse().find((b) => b < scene.end - 0.05) ?? scene.end;
    const cam = momentCamera(this.job.treatment.moments ?? [], t);
    const bursts = (s: Scene) => (this.job.treatment.moments ?? []).filter((m) => (m.kind === 'drop' || m.kind === 'finale') && m.at >= s.start - 0.05 && m.at < s.end).map((m) => m.at);
    const frame = (s: Scene) => ({ t, since, beat, hide: this.sceneHide, zoom: cam.zoom, carry: echoCarry(this.storyboard, s, song), bursts: bursts(s), enterFlash: s === scene && joined && prev.exit === 'flash', exitDark: s.exit === 'blackout' && t >= ([...this.job.beats].reverse().find((b) => b < s.end - 0.05) ?? s.end) && t < s.end });
    const into = enterSec(this.storyboard, scene);
    if (into && t < scene.start + into)
      drawTransition(ctx, { kind: prev.exit as TransitionKind }, (t - scene.start) / into, Math.round(scene.start * 10), (c) => void drawScene(c, prev, song, { ...frame(prev), t: Math.min(t, prev.end - 0.001) }), (c) => void drawScene(c, scene, song, frame(scene)));
    else drawScene(ctx, scene, song, { ...frame(scene), exitDark: scene.exit === 'blackout' && t >= lastBeat });
    if (cam.flash) {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, W, H);
    }
  }

  /** The scene playing at t. */
  private sceneAt(t: number): Scene | undefined {
    return this.storyboard.find((s) => t >= s.start && t < s.end);
  }

  private sceneSong(): SceneSong {
    return { beats: this.job.beats, downbeats: this.job.downbeats ?? [], cues: this.job.cues };
  }

  /** A text the next frames leave out (the scene check renders a frame without it). */
  sceneHide?: ShownText;

  /** Every storyboard text measured on finished frames (scene-parts.ts checkScene); `grab` renders and reads one. */
  async sceneQa(grab: (t: number) => Promise<ImageData>): Promise<SceneTextQa[]> {
    const beats = this.job.beats;
    const sinceAt = (t: number) => {
      const b = beats.filter((x) => x <= t).pop();
      return b === undefined ? 10 : t - b;
    };
    const out: SceneTextQa[] = [];
    for (const sc of this.storyboard)
      out.push(...(await checkScene(sc, this.sceneSong(), sinceAt, async (t, hide) => {
        this.sceneHide = hide;
        try {
          return await grab(t);
        } finally {
          this.sceneHide = undefined;
        }
      }, (t) => momentCamera(this.job.treatment.moments ?? [], t).zoom, sc.start + enterSec(this.storyboard, sc))));
    return out;
  }

  metrics(): { cues: CueMetric[]; accents: { cueId: string; time: number }[]; textGuard: { id: string; text: string; from: number; to: number; rect: number[]; share: number; light: number }[]; links: { start: number; kind: string; dir: number; frames: number; moved: number; drawn: 'link' | 'plain-cut' }[] } {
    return {
      links: this.linkOutcomes(),
      // lines rebuilt light in a dark halo over a photo as played: the place that set it off and its share below 3:1
      // (POOR_SHARE and the median are experimental rules, recorded here to be checked against the picture)
      textGuard: this.cueLayers.flatMap(({ rt, guard: g }) => (g ? [{ id: rt.cue.id, text: rt.cue.text, from: +g.from.toFixed(2), to: +g.to.toFixed(2), rect: [g.rect.x0, g.rect.y0, g.rect.x1, g.rect.y1].map(Math.round), share: +g.share.toFixed(2), light: +g.light.toFixed(2) }] : [])),
      cues: this.cueLayers.map(({ rt, layer, fitScale }) => {
        const [from, to] = layer.readable();
        const readableSec = Math.max(0, to - from);
        // reading time: chars / 12 + 1 s , but never more than 90 % of the time the line is sung
        const chars = [...rt.cue.text.replace(/\s/g, '')].length;
        // never more than the line can be up without covering the next one (a rap line sung back to back has only
        // its own slot: asking more flagged every line of a fast song)
        const requiredSec = Math.min(readingSec(rt.cue.text, rt.cue.start, rt.cue.end), 0.95 * (rt.exitAt + rt.exitDur - rt.showFrom));
        const last = rt.cue.charStarts?.length ? rt.cue.charStarts[rt.cue.charStarts.length - 1] : rt.cue.end;
        const lingerSec = rt.later !== undefined && RENDERERS[rt.shot.template]?.persist ? 0 : +(rt.exitAt + rt.exitDur - last).toFixed(2);
        return { id: rt.cue.id, text: rt.cue.text, readableFrom: from, readableTo: to, readableSec, requiredSec, ok: readableSec >= requiredSec - 0.05, ...(this.job.treatment.design?.composer ? { plannedExit: this.lastExits.get(rt.cue.id), exit: rt.style.exit, restSize: Math.round(this.rests.get(rt.cue.id) ?? 0), floored: this.floored.has(rt.cue.id) } : {}), ...(this.blowDropped.has(rt.cue.id) ? { blowDropped: this.blowDropped.get(rt.cue.id) } : {}), ...(this.floorMissed.has(rt.cue.id) ? { floorMissed: true } : {}), lingerSec, lastSung: last, goneAt: last + lingerSec, template: rt.shot.template, fitScale: +(fitScale ?? 1).toFixed(4), plannedEnter: rt.planned?.enter ?? rt.style.enter, plannedReveal: rt.planned?.reveal ?? 'line', enter: rt.style.enter, reveal: rt.style.reveal ?? 'line', together: !!rt.together && rt.style.enter !== 'cut', adjust: rt.adjust ?? [], entranceLost: entranceLost(rt.planned ?? rt.style, rt.style), ...(layer.scale ? { scale: layer.scale } : {}) }; // the same 0.05 s readFix lets pass
      }),
      accents: this.cueLayers.flatMap(({ rt }) => rt.accentTimes.map((time) => ({ cueId: rt.cue.id, time }))),
    };
  }

  /**
   * QA: every glyph shown on the frame last drawn, line by line (the measured ink probe, style-gate-ink.mts): the build
   * on screen (a kinetic print's line shows one of its two inks a frame), its em boxes in frame px.
   */
  glyphBoxes(): { id: string; glyphs: GlyphBox[] }[] {
    if (!this.textRoot.visible) return [];
    this.textRoot.updateMatrixWorld(true);
    const shown = (o: THREE.Object3D | null): boolean => !o || (o.visible && shown(o.parent));
    return this.cueLayers.flatMap(({ rt, layer, twin }) => [layer, ...(twin ? [twin.layer] : [])].filter((l) => shown(l.group)).map((l) => ({ id: rt.cue.id, glyphs: l.glyphBoxes ? l.glyphBoxes() : meshGlyphs(l.group) })).filter((x) => x.glyphs.length));
  }

  /** QA: where each line's type breaks into rows or columns as it rests, by source character (a check on word breaks). */
  rowBreaks(): { id: string; text: string; breaks: number[]; template: string }[] {
    return this.cueLayers.flatMap(({ rt, layer, fit }) => {
      const [from, to] = layer.readable();
      measureAtRest(() => layer.update((from + Math.min(to, from + 2)) / 2, { flash: 0, hit: 0, shake: 0 }));
      (fit ?? layer.group).updateMatrixWorld(true);
      const seen = new Map<number, THREE.Box3>();
      layer.group.traverse((o) => {
        const g = o.userData['glyph'] as Glyph | undefined;
        if (g?.src !== undefined && !seen.has(g.src)) seen.set(g.src, new THREE.Box3().setFromObject(o));
      });
      const at = [...seen].sort((a, b) => a[0] - b[0]).map(([src, b]) => ({ src, x: (b.min.x + b.max.x) / 2, y: (b.min.y + b.max.y) / 2, w: b.max.x - b.min.x, h: b.max.y - b.min.y }));
      const breaks = at.flatMap((g, i) => {
        const p = at[i - 1];
        return p && (Math.abs(g.y - p.y) > 0.7 * Math.max(g.h, p.h)) !== (rt.shot.template === 'vertical') && !(rt.shot.template === 'vertical' && Math.abs(g.x - p.x) < 0.7 * Math.max(g.w, p.w)) ? [g.src] : [];
      });
      return [{ id: rt.cue.id, text: rt.cue.text, breaks, template: rt.shot.template }];
    });
  }

  private shotAt(t: number): { shot: Shot; prev?: Shot } {
    const shots = this.job.treatment.shots;
    const i = Math.max(0, shots.findIndex((s) => s.start <= t && t < s.end));
    return { shot: shots[i] ?? shots[shots.length - 1], prev: shots[i - 1] };
  }

  /**
   * Consecutive shots on the same asset form one run: the clip plays straight through it and the camera move spans it,
   * so a cut between those shots changes only the text, never jumps the background back.
   */
  private runOf(shot: Shot): { start: number; end: number; first: Shot } {
    const shots = this.job.treatment.shots;
    let i = shots.indexOf(shot);
    let j = i;
    while (i > 0 && shots[i - 1].asset === shot.asset) i--;
    while (j < shots.length - 1 && shots[j + 1].asset === shot.asset) j++;
    return { start: shots[i].start, end: shots[j].end, first: shots[i] };
  }

  /**
   * Plate frames for a shot at time t. A clip shorter than its run plays slower (down to half speed, adjacent frames
   * blended), then holds its last frame: it never restarts or falls back to the first-frame still.
   */
  private async plateTexture(shot: Shot, t: number): Promise<{ tex: THREE.Texture; next?: THREE.Texture; mix: number }> {
    const a = shot.asset ? this.job.assets[shot.asset] : undefined;
    if (!a) return { tex: this.gradient, mix: 0 };
    if (a.kind === 'image' || !a.frames) return { tex: this.images.get(shot.asset!)!, mix: 0 };
    const run = this.runOf(shot);
    const from = run.first.clipStart ?? 0;
    const clipSec = a.frames.count / a.frames.fps;
    const speed = Math.min(1, Math.max(0.5, (clipSec - from) / Math.max(0.1, run.end - run.start)));
    const f = Math.min(a.frames.count - 1, Math.max(0, (from + (t - run.start) * speed) * a.frames.fps));
    const idx = Math.floor(f);
    const tex = await this.frame(a.frames.pattern, idx);
    if (idx >= a.frames.count - 1 || speed >= 1) return { tex, mix: 0 };
    return { tex, next: await this.frame(a.frames.pattern, idx + 1), mix: f - idx };
  }

  private async frame(pattern: string, idx: number): Promise<THREE.Texture> {
    const url = pattern.replace('%05d', String(idx + 1).padStart(5, '0'));
    let tex = this.frameCache.get(url);
    if (!tex) {
      const bmp = await createImageBitmap(await (await fetch(url)).blob(), { imageOrientation: 'flipY' });
      tex = new THREE.Texture(bmp);
      tex.flipY = false;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.needsUpdate = true;
      this.frameCache.set(url, tex);
      if (this.frameCache.size > 8) {
        const [k, old] = this.frameCache.entries().next().value!;
        old.dispose();
        this.frameCache.delete(k);
      }
    }
    return tex;
  }

  /** The kinetic print's two inks when the look under t0..t1 is kinetic type (the line is then built in both). */
  private kineticInks(t0: number, t1: number): { ink: string; paper: string } | undefined {
    const g = this.job.treatment.graphics;
    if (!g) return undefined;
    // a full picture under the line (a story frame) is its ground, not the faint print laid over it: the line takes its
    // colour and halo from the picture (三年後的大雪's story frames under the line director: navy type lost in a crowd)
    const full = (s: { layers: { kind: string; mode?: string }[] }) => s.layers.some((l) => l.kind === 'photo' && l.mode === 'full');
    const ks = g.sections.filter((s, i) => s.start < t1 && (g.sections[i + 1]?.start ?? Infinity) > t0 && !full(s as never)).flatMap((s) => s.layers.filter((l) => l.kind === 'kinetic')) as { ink: string; paper: string }[];
    return ks.length ? { ink: ks[0].ink, paper: ks[0].paper } : undefined;
  }

  /**
   * A kinetic cut draws its words, diagrams and tape wherever its move puts them: behind each line up, the cut's own
   * ground is laid round each letter as a tight keyline, so the move still shows round the line but never
   * through it (第六感: a clock and stacked 未完成 under the sung words). Drawn under the character (kinetic.ts):
   * laid over it, the figure greyed into a box behind the line.
   */
  private veilLines(ctx: CanvasRenderingContext2D, t: number, alpha: number) {
    this.veilShape ??= new OffscreenCanvas(W, H).getContext('2d')!;
    const shape = this.veilShape;
    const passing = (h?: Handoff) => h?.kind === 'band' || h?.kind === 'chain' || h?.kind === 'page';
    for (const { rt, layer, twin, hand, handOut } of this.cueLayers) {
      const end = rt.exitAt + rt.exitDur;
      if (t < rt.showFrom || t > end) continue;
      // a keyline lies under the picture: it knows nothing of the edge that is cutting its line away
      if ((passing(handOut?.h) && t > handOut!.h.from) || (passing(hand?.h) && t < hand!.h.to)) continue;
      const inks = this.kineticInks(rt.cue.start, rt.cue.end);
      if (!inks || !twin) continue;
      // which build reads here is decided now, on this frame's ground and move (before any keyline or the character):
      // read off the last frame, a cold still or a cut's first frame took the other ink, and its keyline then held
      // the choice (light type in a dark keyline on cream)
      if (this.lit.t !== t) this.lit = { t, by: new Map() };
      if (!this.lit.by.has(rt.cue.id)) this.lit.by.set(rt.cue.id, this.groundLight(rt.cue.id, t, twin.text));
      const light = this.lit.by.get(rt.cue.id)!;
      // the composer's lines are held by their ground, never by paper cut round the letters
      if (this.job.treatment.design?.composer && !this.job.treatment.design.lineDirect) continue;
      // both builds share one layout: the keyline follows whichever was laid out
      const boxes = glyphBoxes(twin.layer.group.visible ? twin.layer.group : layer.group);
      if (!boxes.length) continue;
      // a tight keyline in the type's own ground round each letter's shape, grown by R px: the move is cut cleanly
      // where it crosses a letter (a frosted blur under each letter read as a smudge)
      // twice as wide where neither ink stands off the ground (thin mincho in navy on a mid violet sky, indigo)
      const R = (this.weak.get(rt.cue.id) ?? 21) < 4.5 ? 14 : 7;
      const x0 = Math.max(0, Math.floor(Math.min(...boxes.map((b) => b.x0)) - R));
      const y0 = Math.max(0, Math.floor(Math.min(...boxes.map((b) => b.y0)) - R));
      const [w, h] = [Math.min(W, Math.ceil(Math.max(...boxes.map((b) => b.x1)) + R)) - x0, Math.min(H, Math.ceil(Math.max(...boxes.map((b) => b.y1)) + R)) - y0];
      if (w < 2 || h < 2) continue;
      this.veilMask ??= new OffscreenCanvas(W, H).getContext('2d')!;
      const mask = this.veilMask;
      // the line's letters once into a mask, then the mask stamped over a solid disc of radius R (dilate.ts): twelve
      // stamps of each letter on a ring of R left scallops between them round thin strokes, a blotchy ring. A
      // sing-along's preview row (not the line sung, in an ink of its own) takes a thin keyline in the ink it is not in
      const text = twin.text[light ? 0 : 1];
      for (const [preview, reach] of [[false, R], [true, Math.min(R, 4)]] as const) {
        const own = boxes.filter((b) => !!b.preview === preview);
        if (!own.length) continue;
        shape.save();
        shape.clearRect(x0, y0, w, h);
        mask.clearRect(x0, y0, w, h);
        for (const b of own) {
          // only what has a letter's own shape gets a keyline: a cut-up glyph, a repeating wave (a held vowel's ～), a
          // mark took a rounded box, a smudge of ground behind it
          if (!b.img || !b.at) continue;
          mask.globalAlpha = b.a;
          // the texture where the letter is, tilted with it (an arc's letters had upright keylines, a blur round them)
          mask.setTransform(b.at[0], b.at[1], b.at[2], b.at[3], b.at[4], b.at[5]);
          mask.drawImage(b.img, 0, 0);
          mask.setTransform(1, 0, 0, 1, 0, 0);
        }
        mask.globalAlpha = 1;
        for (const [dx, dy] of discOffsets(reach)) shape.drawImage(mask.canvas, x0, y0, w, h, x0 + dx, y0 + dy, w, h);
        shape.globalCompositeOperation = 'source-in';
        // the ink the letters are not in (a language's own type ink can put both builds in the same colour)
        const ink = preview ? (own.find((b) => b.ink)?.ink ?? text) : text;
        shape.fillStyle = contrast(ink, inks.ink) > contrast(ink, inks.paper) ? inks.ink : inks.paper;
        shape.fillRect(x0, y0, w, h);
        shape.restore();
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0); // frame px, under the cut's camera move
        // a line still being handed in has no keyline yet: its letters are only partly out
        ctx.globalAlpha = alpha * clamp01((t - (hand ? hand.h.to : rt.showFrom)) / 0.25) * clamp01((end - t) / 0.25);
        ctx.drawImage(shape.canvas, x0, y0, w, h, x0, y0, w, h);
        ctx.restore();
      }
    }
  }
  private veilShape?: OffscreenCanvasRenderingContext2D;
  /** The letters of the line being keyed, before they are grown into its keyline (veilLines). */
  private veilMask?: OffscreenCanvasRenderingContext2D;
  /** The build each kinetic line shows this frame, picked by the veil (veilLines). */
  private lit: { t: number; by: Map<string, boolean> } = { t: NaN, by: new Map() };

  /**
   * Whether the line's first build (`texts[0]`) reads better than its twin on the look drawn behind it this frame (read
   * from the frame's own background canvas). By contrast, not by a light/dark split: a mid red paper counted as dark
   * and took the red twin, red type on red (雙截棍).
   */
  private groundLight(id: string, t: number, texts: [string, string]): boolean {
    if (this.lit.t === t && this.lit.by.has(id)) return this.lit.by.get(id)!;
    // playing, a line reads its ground a few times a cut (a transition may still be crossing the first read):
    // reading the canvas back every frame takes it off the graphics card
    const look = this.job.treatment.graphics!;
    const sec = sectionAt(look, sectionClock(look.sections, t));
    const age = t - sec.start;
    // a ground can change inside a cut (a plate lifting off, a transition crossing in its first moments): a read is
    // only good for a moment, shorter while a transition may be crossing
    const part = age < 0.4 ? Math.floor(age / 0.1) : 3 + Math.floor(age / 0.4);
    const cut = this.preview ? `${id}|${look.sections.indexOf(sec)}|${part}` : '';
    const known = this.previewLit.get(cut);
    if (known !== undefined) return known;
    const light = this.readGround(id, t, texts);
    // until the veil opens this frame's reads (lit.t) the canvas still holds the last frame: kept, a seek's or a new
    // engine's first read would hold the ground's own colour on the type for the rest of the cut
    if (cut && this.lit.t === t) this.previewLit.set(cut, light);
    return light;
  }
  /** Playing in a tab, not exporting: reads that only trade exactness for frame rate may be skipped. */
  preview = false;
  private previewLit = new Map<string, boolean>();

  private readGround(id: string, t: number, texts: [string, string]): boolean {
    const rs = this.lyricRects.filter((r) => r.id === id);
    const r = rs.find((x) => t >= x.from && t <= x.to)?.rest ?? rs[0]?.rest;
    if (!this.gfx || !r) return true;
    const [x0, y0] = [Math.max(0, Math.floor(r.x0)), Math.max(0, Math.floor(r.y0))];
    const [w, h] = [Math.min(W, Math.ceil(r.x1)) - x0, Math.min(H, Math.ceil(r.y1)) - y0];
    if (w < 1 || h < 1) return true;
    const d = readBack(this.gfx.ctx, x0, y0, w, h);
    const rgb = [0, 0, 0];
    let n = 0;
    for (let i = 0; i < d.length; i += 4 * 53, n++) for (let c = 0; c < 3; c++) rgb[c] += d[i + c];
    const mean = `#${rgb.map((v) => Math.round(v / Math.max(1, n)).toString(16).padStart(2, '0')).join('')}`;
    const [c0, c1] = [contrast(texts[0], mean), contrast(texts[1], mean)];
    this.weak.set(id, Math.max(c0, c1));
    return c0 >= c1;
  }
  /** A radial exit's push on the backdrop this frame: the same curve as the type's, from the same point, at less reach. */
  private pushAt(t: number) {
    const c = this.cueLayers.find(({ rt }) => ['radial-leave', 'focus-out', 'gravity-pass'].includes(rt.style.exit) && t > rt.exitAt && t < rt.exitAt + rt.exitDur);
    const box = c && this.lyricRects.find((r) => r.id === c.rt.cue.id)?.rest;
    if (!c || !box) return undefined;
    const q = (t - c.rt.exitAt) / c.rt.exitDur;
    // the backdrop softens with a line losing focus, follows one falling, is pushed by one leaving radially
    if (c.rt.style.exit === 'focus-out') return { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2, scale: 1 - 0.02 * q, blur: 7 * q };
    if (c.rt.style.exit === 'gravity-pass') return { x: W / 2, y: H / 2, scale: 1, dy: -songVary(c.rt, 'gravity.follow', 90, 170) * gravityPose(q, 1).follow };
    const seed = Math.abs(Math.floor(hash(c.rt.cue.start, 53) * 1000) + (c.rt.song ?? 0));
    const [fx, fy] = pushFocus((box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2, box.x1 - box.x0, box.y1 - box.y0, seed);
    return { x: fx, y: fy, scale: radialShift(0, 0, 0, 0, q, 0.12).scale };
  }

  /** The composer's small tier, one per line that has one; hairlines hug the block the line takes as it moves. */
  private lastExits = new Map<string, string>();
  private rests = new Map<string, number>();
  private floored = new Set<string>();
  /** Lines whose blown-up key was dropped because the frame cannot hold the words round it at the floor (metrics, the scan and the gate count them). */
  private blowDropped = new Map<string, string>();
  /** Lines the last resort could not hold at the floor in the frame either (metrics, the scan and the gate count them). */
  private floorMissed = new Set<string>();
  private signals: { h: Handoff; mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>; steps: THREE.Texture[] }[] = [];
  private irises: { h: Handoff; mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>; from: [number, number]; to: [number, number] }[] = [];
  private fines: { id: string; layer: FineLayer; from: number; to: number; rt: CueRuntime }[] = [];
  /**
   * Where a line's fit group stands at t apart from its fit: the line's own camera (a text camera, or the camera it shares with the
   * backdrop), a hand-off's push or exit, and the drift, as the frame draws them (updateCues) and as the hold reads them
   * (settleHold): one place, so the two never differ.
   */
  private frameAt(entry: Pick<(typeof this.cueLayers)[number], 'rt' | 'drift' | 'hand' | 'handOut'>, t: number) {
    const { rt, drift, hand, handOut } = entry;
    const k = clamp01((t - rt.showFrom) / Math.max(0.5, rt.exitAt + rt.exitDur - rt.showFrom));
    const e = 0.5 - 0.5 * Math.cos(Math.PI * k);
    // a line given its own camera takes it on top of the drift
    const cam = rt.style.textCam;
    const c = cam?.rig ? rigAt(cam.rig, t) : cam ? { ...textCamAt(cam, e), lay: 0 } : { x: 0, y: 0, scale: 1, rot: 0, lay: 0 };
    const moved = hand && hand.h.kind === 'push' ? inPose(hand.h, t) : { x: 0, y: 0 };
    const left = handOut && t > handOut.h.from ? outPose(handOut.h, t, handOut.seam, handOut.side) : { x: 0, y: 0 };
    return { e, c, x: (drift?.[0] ?? 0) * e + c.x + moved.x + left.x, y: (drift?.[1] ?? 0) * e + c.y + moved.y + left.y };
  }

  /**
   * The line's camera and drift at every frame of its reading (frameAt), as poses for the hold. Only the reading, when the words
   * stand on the screen: a hand-off pushes the line up to 1920 px off it while it enters and leaves, which would take the
   * whole room from the hold (holdRoom's floor) and leave the line unprotected while it is read.
   */
  private camPoses(entry: Pick<(typeof this.cueLayers)[number], 'rt' | 'drift' | 'hand' | 'handOut'>, reading: readonly [number, number]): CamPose[] {
    return readingTimes(reading, entry.rt.exitAt).map((t) => {
      const f = this.frameAt(entry, t);
      return { x: f.x, y: f.y, rot: f.c.rot };
    });
  }

  /** The line's hold (holdScale), once its layout is final: from the line alone, never from the frame it happens to be read in. */
  private settleHold(entry: (typeof this.cueLayers)[number]) {
    if (!entry.holds || !entry.fit || entry.fitScale === undefined) return;
    entry.hold = holdScale(entry.layer, entry.fitScale, (entry.need ?? Math.max(entry.layer.floor ?? 0, TYPE_FLOOR.lo)) + 0.6, (t) => this.koma(t), !!entry.kick, this.camPoses(entry, entry.layer.readable())) ?? 0;
  }

  private layFine({ rt, layer }: (typeof this.cueLayers)[number]) {
    {
      const fine = rt.style.fine;
      const box = this.lyricRects.find((r) => r.id === rt.cue.id);
      if (!fine || !box) return;
      const f = fineLayer(fine, box.rect, rt.fonts.display, songVary(rt, 'fine.reach', 0.45, 0.95), songVary(rt, 'fine.end', 0, 1) > 0.5 ? 1 : -1);
      if (!f) return;
      f.group.visible = false;
      this.textRoot.add(f.group);
      const [from, to] = layer.readable();
      // a phrase set again small is only there while it is being sung
      this.fines.push({ id: rt.cue.id, layer: f, from: fine.kind === 'key' ? Math.max(from, rt.cue.start) : from, to: fine.kind === 'key' ? Math.min(to, rt.cue.end) : to, rt });
    }
  }
  /** The contrast the chosen build has on its ground, per line, as last read (groundLight). */
  private weak = new Map<string, number>();

  /** Whether the section at t is a kinetic-type cut: a flat print, shown without lens effects. */
  private flatPrint(t: number) {
    const g = this.job.treatment.graphics;
    return !!g && sectionAt(g, t).layers.some((l) => l.kind === 'kinetic');
  }

  /** Whether the section at t has the director's own drawing (a 'code' layer), which owns the background. */
  private ownDrawing(t: number) {
    const g = this.job.treatment.graphics;
    // a kinetic cut lays out its own frame too: the language's drop move drew an orange rail across it
    return !!g && sectionAt(g, t).layers.some((l) => l.kind === 'code' || l.kind === 'kinetic');
  }

  /** The cue's keyword as large outlined type behind the line, within the frame. */
  private makeEcho(rt: CueRuntime) {
    const [k0, k1] = keywordRange(rt.cue.text, rt);
    const word = [...rt.cue.text].slice(k0, k1).join('').replace(/\s+/g, '');
    // a long phrase echoed at near text size reads as a doubled line, not a deeper layer
    if ([...word].length > 5) return undefined;
    const probe = { family: rt.fonts.display, weight: 900, size: 200 };
    const w200 = [...word].reduce((w, c) => w + advanceOf(c, probe), 0) || 1;
    const size = Math.round(Math.min(620, (200 * 0.95 * W) / w200));
    const glyphs = makeGlyphs(word, { family: rt.fonts.display, weight: 900, size, outline: 3 }, new THREE.Color(rt.palette.text));
    placeRow(glyphs, 0, 30);
    const group = new THREE.Group();
    group.renderOrder = 2.65; // a nested group resets three.js's group order
    for (const g of glyphs) {
      g.mesh.position.set(g.x, g.y, 0);
      group.add(g.mesh);
    }
    group.visible = false;
    this.echoRoot.add(group);
    return { rt, group, glyphs };
  }

  /**
   * The call track of one line: each call phrase ("幹什麼?") is set small in the accent colour on the side of the frame
   * away from the main line and pops in when it is sung (its share of the line's time), tilted alternately like a
   * crowd shouting back; all of it leaves with the line.
   */
  /** The phone's broken glass (a glass layer in the current look section), its two maps made once per crack. */
  private glassKey = '';
  private glassFlash = 0;
  private updateGlass(t: number) {
    const u = this.finalPass.uniforms;
    const look = this.job.treatment.graphics;
    const l = look ? (sectionAt(look, sectionClock(look.sections, t)).layers.find((x) => x.kind === 'glass') as { crack: number; seed?: number } | undefined) : undefined;
    this.glassFlash = 0;
    if (!l || !(l.crack > 0)) {
      u['uGlass'].value = 0;
      return;
    }
    const key = `${l.crack}|${l.seed ?? 7}`;
    if (key !== this.glassKey) {
      this.glassKey = key;
      const glass = glassOf(W, H, l.crack, l.seed ?? 7)!;
      const shards = new OffscreenCanvas(W, H);
      drawGlassShards(shards.getContext('2d')!, W, H, glass);
      const lines = new OffscreenCanvas(W, H);
      drawGlassCrack(lines.getContext('2d')!, W, H, l.crack, l.seed ?? 7);
      for (const [name, c] of [['tGlass', shards], ['tCracks', lines]] as const) {
        (u[name].value as THREE.Texture | null)?.dispose();
        const tex = new THREE.CanvasTexture(c as unknown as HTMLCanvasElement);
        tex.flipY = true;
        u[name].value = tex;
      }
    }
    // a fresh break (more cracked than the section before): the glass snaps in with a short white hit
    const secs = look!.sections;
    const k = secs.indexOf(sectionAt(look!, sectionClock(secs, t)));
    const before = (secs[k - 1]?.layers.find((x) => x.kind === 'glass') as { crack: number } | undefined)?.crack ?? 0;
    const since = t - secs[k].start;
    const fresh = l.crack > before + 0.05 && since < 0.3;
    u['uGlass'].value = fresh ? clamp01(since / 0.08) : 1;
    this.glassFlash = fresh && since < 0.12 ? 0.35 * (1 - since / 0.12) : 0;
  }

  private makeCalls(rt: CueRuntime, full: TimelineCue, calls: Call[], box: THREE.Box3, scale = 1) {
    const group = new THREE.Group();
    group.renderOrder = 3;
    const dur = full.end - full.start;
    // the calls sit right over their own line (under it when the frame has no room above), beside it only when neither
    // is clear (placeCall): set beside it freely they ran off the frame's edge and lay over the next line of a couplet
    // (Tokyo Drift's asides over あなたも東京好き)
    const units: { glyphs: Glyph[]; at: number; x: number; y: number; tilt: number }[] = [];
    const widths: number[] = [];
    for (const c of calls) {
      // a long aside in phrases of a few words, not a word per row (you / see / me / go … ran off the frame's foot)
      const parts = [...c.text].length > 6 ? callPhrases(c.text) : [c.text];
      const from = full.start + c.from * dur;
      const span = Math.max(0.2, (c.to - c.from) * dur);
      parts.forEach((part, k) => {
        // a shout is a sticker: the heaviest face, filled, on a thick dark keyline (the database's idol call words)
        const face = scale > 1 ? { family: rt.fonts.body, weight: 900, size: Math.round(CALL_SIZE * scale) } : { family: rt.fonts.display, weight: 900, size: CALL_SIZE, shadow: true };
        const fill = makeGlyphs(part, face, new THREE.Color(rt.style.world ? readableOn(rt.style.world.callInk ?? rt.style.world.slots.accent, rt.style.world.callOn ?? rt.style.world.slots.ground) : readableOn(rt.palette.accent, rt.palette.background)));
        const keyline = scale > 1 ? makeGlyphs(part, { ...face, outline: Math.round(face.size * 0.16) }, new THREE.Color('#14081A')) : [];
        const glyphs = [...keyline, ...fill];
        const n = units.length;
        placeRow(fill, 0, 0);
        if (keyline.length) placeRow(keyline, 0, 0);
        const g = new THREE.Group();
        glyphs.forEach((gl, j) => {
          // the keyline is drawn first, under the fill (same render order: added first, and further back)
          gl.mesh.position.set(gl.x, gl.y, j < keyline.length ? -1 : 0);
          if (j < keyline.length) gl.mesh.renderOrder = -1;
          g.add(gl.mesh);
        });
        group.add(g);
        units.push({ glyphs, at: from + (k * span) / parts.length - 0.04, x: 0, y: 0, tilt: (n % 2 ? -1 : 1) * 0.07 });
        widths.push(rowWidth(fill) * (scale > 1 ? 1.1 : 1));
      });
    }
    group.visible = false;
    this.textRoot.add(group);
    const sizes = units.map((u, j) => {
      const h = Math.round(CALL_SIZE * scale) * (scale > 1 ? 1.5 : 1.2);
      return { w: widths[j] * Math.cos(u.tilt) + h * Math.sin(Math.abs(u.tilt)), h: h * Math.cos(u.tilt) + widths[j] * Math.sin(Math.abs(u.tilt)) };
    });
    const call: CallLayer = { rt, group, units, sizes, line: box };
    this.placeCall(call);
    return call;
  }

  /**
   * Sets a line's calls where no lyric glyph is: over the line, under it, else beside it, each a clear gap from every
   * line on screen while the call is (its own line at each place it rests, and its neighbours); with no such spot the
   * call is dropped. Run again once later lines are built, so a line that lands beside the call later is kept clear.
   */
  private placeCall(call: CallLayer) {
    const { rt } = call;
    // from when the first call pops in (it is invisible before): the line going out by then is no obstacle
    const from = Math.max(rt.showFrom, Math.min(...call.units.map((u) => u.at)));
    const to = rt.exitAt + rt.exitDur;
    const toBox = (b: THREE.Box3): CallBox => ({ x0: b.min.x, y0: b.min.y, x1: b.max.x, y1: b.max.y });
    const avoid = this.cueLayers
      .filter((c) => c.fit && c.rt.showFrom < to && c.rt.exitAt + c.rt.exitDur > from)
      .map((c) => this.restBox(c))
      .filter((b) => !b.isEmpty())
      .map(toBox);
    if (!call.line.isEmpty()) avoid.push(toBox(call.line));
    // (and the large graphics its world's page draws there: a gel button, a disc, an EQ wall, world-sets `clear`)
    avoid.push(...clearOf(rt.style.world?.set, W, H));
    const at = placeCalls(call.sizes, { line: call.line.isEmpty() ? undefined : toBox(call.line), avoid, W, H });
    call.dropped = !at;
    at?.forEach((p, j) => Object.assign(call.units[j], p));
    const r = this.lyricRects.find((x) => x.id === `${rt.cue.id}:call`);
    if (r && at) Object.assign(r.rect, this.callRect(call)), Object.assign(r.rest, this.callRect(call));
  }

  /** Every place a line rests while it is read (frame px), measured as built even once it has been playing (live). */
  private restBox(c: (typeof this.cueLayers)[number]): THREE.Box3 {
    let box = new THREE.Box3();
    const measure = () => (box = settledBox(c.layer, c.fit, true));
    if (this.lazy) this.layFromRest(c, measure);
    else measure();
    return box;
  }

  /** The room a call's units take, padded, in top-left frame px (what props make room for). */
  private callRect(call: CallLayer): Rect {
    const box = new THREE.Box3();
    call.units.forEach((u) => u.glyphs.forEach((g) => box.expandByPoint(new THREE.Vector3(u.x + g.x, u.y + g.y, 0))));
    const pad = 56;
    return { x0: box.min.x + W / 2 - pad * 2, y0: H / 2 - box.max.y - pad, x1: box.max.x + W / 2 + pad * 2, y1: H / 2 - box.min.y + pad };
  }

  /**
   * Places each handoff on the lines as they were really laid out: a seam clear of the line going out (falling back to
   * a side push when the line fills the frame), and a relay's anchors at its key words' edges.
   */
  private layHandoff(c: (typeof this.cueLayers)[number], prev: (typeof this.cueLayers)[number] | undefined) {
    // live: the line before came back after a seek, the line itself never left: its handoff is laid already, and new
    // planes would leave the old ones cutting its letters
    if (c.hand && c.laidOut && prev) {
      prev.handOut = c.laidOut;
      return;
    }
    const sections = this.job.treatment.graphics?.sections ?? [];
    const pxBox = (b: THREE.Box3) => ({ x0: b.min.x + W / 2, x1: b.max.x + W / 2, y0: H / 2 - b.max.y, y1: H / 2 - b.min.y });
    {
      const planned = c.rt.style.handoff;
      if (!planned || !prev?.fit) return;
      const box = pxBox(settledBox(prev.layer, prev.fit));
      const axisDoor = planned.kind === 'door';
      const clear = planned.kind === 'split' || axisDoor || planned.kind === 'page' ? seamClear(axisDoor ? box.y0 : box.x0, axisDoor ? box.y1 : box.x1, axisDoor ? H : W) : undefined;
      // a page has no half to open: on a line that fills the frame its spine moves out past the line's own edge
      const seam = clear ?? (planned.kind === 'page' ? Math.max(40, box.x0 - 30) : undefined);
      const mid = axisDoor ? (box.y0 + box.y1) / 2 : (box.x0 + box.x1) / 2;
      const side = seam !== undefined && mid > seam ? 1 : -1;
      const needsSeam = planned.kind === 'split' || axisDoor || planned.kind === 'page';
      // a page turns the side the line going out stands on, so the line goes with its page
      const h: Handoff = needsSeam && seam === undefined ? { ...planned, kind: 'push' } : planned.kind === 'page' ? { ...planned, dir: side } : planned;
      const tr = sections.find((s) => s.transition && Math.abs(s.start - h.from) < 0.06)?.transition;
      if (tr) Object.assign(tr, { dur: h.to - h.from, dir: h.dir, ink: this.kineticInks(c.rt.cue.start, c.rt.cue.end)?.ink ?? c.rt.palette.text, ...(seam !== undefined ? { seam } : {}), ...(h.kind === 'push' ? { kind: 'lyric-push' } : {}) });
      const planes: [THREE.Plane, THREE.Plane] = [new THREE.Plane(), new THREE.Plane()];
      c.hand = { h, planes, seam };
      prev.handOut = c.laidOut = { h, seam: seam ?? 0, side, plane: new THREE.Plane() };
      if (h.kind === 'palette' && tr) {
        const inks = this.kineticInks(c.rt.cue.start, c.rt.cue.end);
        Object.assign(tr, { ink: passTint(inks?.paper ?? c.rt.palette.background, inks?.ink ?? c.rt.palette.text, c.rt.palette.accent) });
      }
      if (h.kind === 'signal') {
        const next = pxBox(settledBox(c.layer, c.fit));
        const all = { x0: Math.min(box.x0, next.x0), y0: Math.min(box.y0, next.y0), x1: Math.max(box.x1, next.x1), y1: Math.max(box.y1, next.y1) };
        // a small patch beside the words, and none at all when they leave it no room
        const patch = patchClear(all, 320, 200, W, H) ?? patchClear(next, 320, 200, W, H);
        if (patch) {
          const [pw, ph] = [patch.x1 - patch.x0, patch.y1 - patch.y0];
          const steps = grainSteps(pw, ph, Math.floor(c.rt.cue.start * 7));
          const inks = this.kineticInks(c.rt.cue.start, c.rt.cue.end);
          const mesh = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), new THREE.MeshBasicMaterial({ map: steps[0], color: new THREE.Color(mixHex(inks?.paper ?? c.rt.palette.background, inks?.ink ?? c.rt.palette.text, 0.26)), transparent: true, depthTest: false, depthWrite: false }));
          mesh.position.set((patch.x0 + patch.x1) / 2 - W / 2, H / 2 - (patch.y0 + patch.y1) / 2, 0);
          mesh.renderOrder = 5000;
          mesh.frustumCulled = false;
          mesh.visible = false;
          // (a handoff's graphic, not words: never read as a glyph, nor taken away with the words; review 2026-11-14,
          // dark-glitch's signal patch counted as 82 see-through glyphs at 73.43 s)
          mesh.userData['decor'] = true;
          this.textRoot.add(mesh);
          this.signals.push({ h, mesh, steps });
        }
      }
      if (h.kind === 'aperture') {
        const next = pxBox(settledBox(c.layer, c.fit));
        const map = irisMap().clone();
        map.needsUpdate = true;
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(W * 1.1, H * 1.1), new THREE.MeshBasicMaterial({ map, color: new THREE.Color(this.kineticInks(c.rt.cue.start, c.rt.cue.end)?.ink ?? c.rt.palette.text), transparent: true, depthTest: false, depthWrite: false }));
        mesh.renderOrder = 5000;
        mesh.frustumCulled = false;
        mesh.visible = false;
        mesh.userData['decor'] = true;
        this.textRoot.add(mesh);
        this.irises.push({ h, mesh, from: [(box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2], to: [(next.x0 + next.x1) / 2, (next.y0 + next.y1) / 2] });
      }
      if (h.kind !== 'relay') return;
      const [a, b] = [this.keyEdge(prev), this.keyEdge(c)];
      if (!a || !b) return;
      const path = relayBetween(a.end, a.dir, b.start, b.dir);
      const mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: new THREE.Color(readableOn(c.rt.palette.accent, c.rt.palette.background, 3)), transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
      const n = 32;
      mesh.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array((n + 1) * 2 * 3), 3));
      mesh.geometry.setIndex(Array.from({ length: n }, (_, k) => { const q = k * 2; return [q, q + 1, q + 2, q + 1, q + 3, q + 2]; }).flat());
      mesh.frustumCulled = false;
      mesh.visible = false;
      mesh.userData['decor'] = true;
      this.textRoot.add(mesh);
      this.relays.push({ h, path, mesh, width: Math.max(8, a.size * 0.045) });
      c.hand.seam = b.start[0] + W / 2;
    }
  }

  /** Where a relay leaves and meets a line: the edges of its key word, as it rests, just under the type (frame px, y up). */
  private keyEdge(c: (typeof this.cueLayers)[number]): { start: AnchorPoint; end: AnchorPoint; dir: AnchorPoint; size: number } | undefined {
    const e = c.rt.style.emphasis?.[0];
    const [from, to] = c.layer.readable();
    measureAtRest(() => c.layer.update((from + Math.min(to, from + 2)) / 2, { flash: 0, hit: 0, shake: 0 }));
    c.fit!.updateMatrixWorld(true);
    const box = new THREE.Box3();
    c.layer.group.traverse((o) => {
      const g = o.userData['glyph'] as Glyph | undefined;
      if (g && (!e || (g.src !== undefined && g.src >= e.from && g.src < e.to))) box.expandByObject(o);
    });
    if (box.isEmpty()) return undefined;
    const size = box.max.y - box.min.y;
    const tall = size > (box.max.x - box.min.x) * 1.4;
    const y = box.min.y + size * 0.1;
    return tall
      ? { start: [box.max.x + 10, box.max.y], end: [box.max.x + 10, box.min.y], dir: [0, -1], size: box.max.x - box.min.x }
      : { start: [box.min.x, y], end: [box.max.x, y], dir: [1, 0], size };
  }

  /** A handoff's place on the lines and the marks that run between them, at t: from t alone, so any frame stands on its own. */
  private updateHandoffs(t: number) {
    for (const { h, path, mesh, width } of this.relays) {
      const e = (t - h.from) / (h.to - h.from);
      mesh.visible = e > 0 && e < 1;
      if (!mesh.visible) continue;
      const [u0, u1] = relaySpan(e);
      const pts = relayStrip(path, u0, u1, width);
      const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let k = 0; k < pts.length / 2; k++) pos.setXYZ(k, pts[k * 2], pts[k * 2 + 1], 0);
      pos.needsUpdate = true;
    }
  }

  /** What of a line coming in shows yet: only the opening between the halves, or what has opened from the relay's anchor. */
  private openLine(c: (typeof this.cueLayers)[number], t: number) {
    const hand = c.hand;
    const clip = (planes: THREE.Plane[]) => {
      for (const f of c.twin ? [c.fit!, c.twin.fit] : [c.fit!])
        f.traverse((o) => {
          const m = (o as THREE.Mesh).material as THREE.Material | undefined;
          if (!m || m.clippingPlanes?.includes(planes[0])) return;
          m.clippingPlanes = [...(m.clippingPlanes ?? []), ...planes];
          m.needsUpdate = true;
        });
    };
    const set = (p: THREE.Plane, k: Keep) => p.set(new THREE.Vector3(k.nx, k.ny, 0), k.d);
    const edged = (x?: Handoff) => x?.kind === 'band' || x?.kind === 'chain' || x?.kind === 'page' || x?.kind === 'aperture' || x?.kind === 'signal' || x?.kind === 'palette';
    if (edged(c.handOut?.h) && c.handOut?.plane) {
      set(c.handOut.plane, passKeeps(c.handOut.h, t, c.handOut.seam).going);
      clip([c.handOut.plane]);
    }
    if (hand && edged(hand.h)) {
      set(hand.planes[0], passKeeps(hand.h, t, hand.seam ?? 0).coming);
      clip([hand.planes[0]]);
      return;
    }
    if (!hand || hand.seam === undefined || hand.h.kind === 'push') return;
    const relay = hand.h.kind === 'relay';
    const door = hand.h.kind === 'door';
    const [a, b] = hand.planes;
    // relay: the opening runs from the anchor across the frame while the new line is up, ending with the handoff
    const live = relay ? { ...hand.h, from: c.rt.showFrom, kind: 'split' as const } : hand.h;
    const [lo, hi] = t >= hand.h.to ? [-99999, 99999] : openingAt(live, t, hand.seam);
    if (door) {
      a.set(new THREE.Vector3(0, -1, 0), H / 2 - lo);
      b.set(new THREE.Vector3(0, 1, 0), hi - H / 2);
    } else {
      a.set(new THREE.Vector3(1, 0, 0), W / 2 - lo);
      b.set(new THREE.Vector3(-1, 0, 0), hi - W / 2);
    }
    clip([a, b]);
  }

  /** Shows the lines up at t and moves them; strokes follow their glyphs. */
  private updateCues(t: number, fx: FrameFx, hidden?: string) {
    this.updateHandoffs(t);
    for (const entry of this.cueLayers) {
      const { rt, layer: main, fit, fitScale, drift, twin, hand, handOut } = entry;
      this.openLine(entry, t);
      if (fit && drift && fitScale !== undefined) {
        const { e, c, x, y } = this.frameAt(entry, t);
        for (const f of twin ? [fit, twin.fit] : [fit]) {
          f.position.set(x, y, 0);
          // (never under the type floor as drawn: the camera's zoom-out and the drift's growth stop where the words rest at it)
          f.scale.setScalar(playScale(fitScale * (1 + 0.012 * e) * c.scale, entry.hold));
          f.rotation.z = c.rot;
          // a page takes the line it carries with it, narrowing about the seam
          if (handOut?.h.kind === 'page' && t > handOut.h.from) {
            const sq = pageSquash(handoffProgress(handOut.h, t));
            const about = handOut.seam - W / 2;
            f.position.x = about + (f.position.x - about) * sq;
            f.scale.x *= sq;
          }
          // the floor view needs real foreshortening: the ortho camera divides by the w this keystone sets
          f.matrixAutoUpdate = !c.lay;
          if (c.lay) {
            f.scale.y *= layScaleY(c.lay);
            f.updateMatrix();
            const m = new THREE.Matrix4();
            m.elements[7] = layPerspective(c.lay);
            f.matrix.premultiply(m);
            f.matrixWorldNeedsUpdate = true;
          }
        }
      }
      const on = t >= rt.showFrom - 0.05 && t <= rt.exitAt + rt.exitDur + 0.05 && rt.cue.id !== hidden;
      // the dark-ink build on a light cut, the light-ink twin on a dark one
      const light = !twin || !on || this.groundLight(rt.cue.id, t, twin.text);
      const layer = light ? main : twin!.layer;
      main.group.visible = on && light;
      if (twin) twin.layer.group.visible = on && !light;
      if (on) layer.update(this.koma(t), fx);
    }
    for (const { rt, group, units, dropped } of this.callLayers) {
      const k = this.koma(t);
      group.visible = !dropped && t >= rt.showFrom - 0.05 && t <= rt.exitAt + rt.exitDur + 0.05 && rt.cue.id !== hidden;
      if (!group.visible) continue;
      const out = clamp01((k - rt.exitAt) / Math.max(0.08, rt.exitDur));
      units.forEach((u, i) => {
        const g = group.children[i] as THREE.Group;
        const p = (k - u.at) / 0.22;
        const s = p <= 0 ? 0 : easeOutBack(p);
        g.position.set(u.x, u.y + (1 - clamp01(p)) * -24, 0);
        g.scale.setScalar(Math.max(0.001, s));
        g.rotation.z = u.tilt;
        for (const gl of u.glyphs) gl.mesh.material.opacity = clamp01(p * 3) * (1 - out);
      });
    }
    this.onCues?.(this.cueLayers, this.callLayers, t);
    syncPieces(this.textRoot);
  }

  /** Motion time held to the design language's drawings per second (koma); cuts and visibility stay on real time. */
  private koma(t: number): number {
    const d = this.job.treatment.design;
    const k = d?.world ? d.world.frame.koma : d?.language && LANGUAGES[d.language].koma;
    return k ? Math.floor(t * k + 1e-6) / k : t;
  }

  /** Draws a custom scene into its render target; the target's texture then stands in for the plate. */
  private renderCustom(scene: CustomScene, t: number): THREE.Texture {
    this.sceneTarget ??= new THREE.WebGLRenderTarget(W, H);
    scene.update(t);
    this.renderer.setRenderTarget(this.sceneTarget);
    this.renderer.clear();
    this.renderer.render(scene.scene, scene.camera);
    this.renderer.setRenderTarget(null);
    return this.sceneTarget.texture;
  }

  private placePlate(p: Plate, tex: THREE.Texture, shot: Shot, t: number, opacity: number, next?: THREE.Texture, mix = 0) {
    const img = tex.image as { width: number; height: number };
    const cover = Math.max(W / img.width, H / img.height);
    const run = this.runOf(shot);
    const k = clamp01((t - run.start) / Math.max(0.1, run.end - run.start));
    shot = run.first; // the run keeps its first shot's camera move
    // stills must keep moving (a slow push alone reads as a frozen picture)
    const e = 0.5 - 0.5 * Math.cos(Math.PI * k);
    let s = 1.06;
    let x = 0;
    let y = 0;
    if (shot.camera === 'static') [s, x] = [1.06 + 0.03 * k, Math.sin(t * 0.6) * 12];
    if (shot.camera === 'push') [s, y] = [1.02 + 0.16 * e, -20 * e];
    if (shot.camera === 'pan') [s, x] = [1.12, (e - 0.5) * W * 0.1];
    if (shot.camera === 'parallax') [s, x, y] = [1.08 + 0.1 * e, (e - 0.5) * W * 0.06, -24 * e];
    const u = p.mesh.material.uniforms;
    // a custom scene is already composed for the frame: no camera move, no softening
    const isScene = tex === this.sceneTarget?.texture;
    if (isScene) [s, x, y] = [1, 0, 0];
    u['soft'].value = isScene ? 0 : 0.0018;
    u['map'].value = tex;
    u['map2'].value = next ?? tex;
    u['mixAmt'].value = next ? mix : 0;
    u['opacity'].value = opacity;
    p.mesh.scale.set(img.width * cover * s, img.height * cover * s, 1);
    p.mesh.position.set(x, y, 0);
  }

  /** Live: what the lines are while the song runs, built up to here and let go of behind it. */
  private lazy?: { styled: LiveLine[]; showAt: number[]; end: number; build: (x: LiveLine, i: number) => void; built: Set<number>; kana: number };

  /** The window a line may be on screen in, known before it is built: never past the next line's or its shot's end. */
  private lineSpan(i: number): [number, number] {
    const { styled, showAt, end } = this.lazy!;
    const shot = this.job.treatment.shots.find((s) => s.id === styled[i].style.shot);
    return [showAt[i] - 0.1, Math.max(showAt[i + 1] ?? end, shot?.end ?? 0, styled[i].cue.end + HOLD_SEC + 1)];
  }

  private buildLive(i: number) {
    const lz = this.lazy!;
    if (lz.built.has(i)) return;
    // a handoff is laid on both its lines
    if (lz.styled[i].style.handoff && i > 0) this.buildLive(i - 1);
    lz.built.add(i);
    setWordSafe(true);
    this.lyricRects = this.lyricRects.filter((r) => r.id !== lz.styled[i].cue.id && r.id !== `${lz.styled[i].cue.id}:call`);
    this.keepOut = this.keepOut.filter((r) => r.id !== lz.styled[i].cue.id);
    // a line is measured on the frame, not on the type layer as this moment's sway and kick have left it
    const held = { x: this.textRoot.position.x, y: this.textRoot.position.y, s: this.textRoot.scale.x };
    this.textRoot.position.set(0, 0, 0);
    this.textRoot.scale.setScalar(1);
    this.textRoot.updateMatrixWorld(true);
    lz.build(lz.styled[i], i);
    setKanaScale(lz.kana);
    const at = this.cueLayers.findIndex((c) => c.index === i);
    const c = this.cueLayers[at];
    const prev = this.cueLayers[at - 1];
    if (prev?.index === i - 1) this.layFromRest(prev, () => this.layHandoff(c, prev));
    const next = this.cueLayers[at + 1];
    if (next?.index === i + 1) this.layFromRest(next, () => this.layHandoff(next, c));
    this.layFine(c);
    this.settleHold(c);
    for (const call of this.callLayers) if (call.rt.showFrom < c.rt.exitAt + c.rt.exitDur && call.rt.exitAt + call.rt.exitDur > c.rt.showFrom) this.placeCall(call);
    this.layRooms([c.rt.showFrom, c.rt.exitAt + c.rt.exitDur]);
    this.textRoot.position.set(held.x, held.y, 0);
    this.textRoot.scale.setScalar(held.s);
  }

  /** A line that has been playing is put back as it was built while a handoff measures it. */
  private layFromRest(c: (typeof this.cueLayers)[number], lay: () => void) {
    const fits = [c.fit!, ...(c.twin ? [c.twin.fit] : [])];
    const held = fits.map((f) => ({ p: f.position.clone(), s: f.scale.clone(), r: f.rotation.z, auto: f.matrixAutoUpdate }));
    for (const f of fits) {
      f.position.set(0, 0, 0);
      f.scale.setScalar(c.fitScale ?? 1);
      f.rotation.z = 0;
      f.matrixAutoUpdate = true;
      f.updateMatrixWorld(true);
    }
    lay();
    fits.forEach((f, k) => {
      f.position.copy(held[k].p);
      f.scale.copy(held[k].s);
      f.rotation.z = held[k].r;
      f.matrixAutoUpdate = held[k].auto;
    });
  }

  private releaseLive(i: number) {
    const lz = this.lazy!;
    lz.built.delete(i);
    const at = this.cueLayers.findIndex((c) => c.index === i);
    const c = this.cueLayers[at];
    if (!c) return;
    this.cueLayers.splice(at, 1);
    const gone = new Set<THREE.Object3D>([c.fit!, ...(c.twin ? [c.twin.fit] : [])]);
    const h = c.hand?.h;
    const drop = <T>(list: T[], is: (x: T) => boolean, of: (x: T) => THREE.Object3D) => list.filter((x) => { if (!is(x)) return true; gone.add(of(x)); return false; });
    this.signals = drop(this.signals, (r) => r.h === h, (r) => r.mesh);
    this.irises = drop(this.irises, (r) => r.h === h, (r) => r.mesh);
    this.relays = drop(this.relays, (r) => r.h === h, (r) => r.mesh);
    this.fines = drop(this.fines, (f) => f.id === c.rt.cue.id, (f) => f.layer.group);
    this.callLayers = drop(this.callLayers, (x) => x.rt === c.rt, (x) => x.group);
    const live = new Set<THREE.Texture>();
    const mapsOf = (o: THREE.Object3D, each: (m: THREE.Mesh) => void) => o.traverse((x) => { if ((x as THREE.Mesh).isMesh) each(x as THREE.Mesh); });
    this.textRoot.children.filter((o) => !gone.has(o)).forEach((o) => mapsOf(o, (m) => { const map = (m.material as THREE.MeshBasicMaterial).map; if (map) live.add(map); }));
    for (const o of gone) {
      o.removeFromParent();
      // a cached picture let go here is sent to the card again if a later line asks for it
      mapsOf(o, (m) => {
        const mat = m.material as THREE.MeshBasicMaterial;
        m.geometry.dispose();
        if (mat.map && !live.has(mat.map)) mat.map.dispose();
        mat.dispose();
      });
    }
    trimGlyphCache(GLYPH_CACHE, live);
  }

  /** Lines up at t are built before it is drawn; one more ahead per frame, so what is coming is ready without a hitch. */
  private keepLines(t: number) {
    const lz = this.lazy;
    if (!lz) return;
    let ahead = false;
    for (let i = 0; i < lz.styled.length; i++) {
      const [from, to] = this.lineSpan(i);
      if (t >= from && t <= to) this.buildLive(i);
      else if (lz.built.has(i) && (t < from - LIVE_AHEAD - 1 || t > to + LIVE_BEHIND)) this.releaseLive(i);
      else if (!ahead && !lz.built.has(i) && t < from && t >= from - LIVE_AHEAD) {
        this.buildLive(i);
        ahead = true;
      }
    }
  }

  /** Every line built now (QA in a live job: metrics read all of them). */
  buildAll() {
    if (this.lazy) this.lazy.styled.forEach((_, i) => this.buildLive(i));
  }

  /** Live: the picture's size against the frame (1 = 1080p). The layout and the type's places do not change. */
  setQuality(scale: number) {
    this.renderer.setPixelRatio(scale);
    this.renderer.setSize(W, H, false);
    this.composer.setPixelRatio(scale);
    this.composer.setSize(W, H);
  }

  /** Lines held at the moment, for checks on what live use keeps in memory. */
  liveLines() {
    return this.cueLayers.length;
  }

  /** What is held on the graphics card and in the glyph cache (a check that a long session stays bounded). */
  liveMemory() {
    const { textures, geometries } = this.renderer.info.memory;
    return { lines: this.cueLayers.length, textures, geometries, glyphs: glyphCacheSize() };
  }

  /** Lets go of everything this engine holds; the canvas can be thrown away after it. `caches`: the glyph pictures too (not when another engine takes over). */
  dispose(caches = true) {
    if (this.lazy) [...this.lazy.built].forEach((i) => this.releaseLive(i));
    if (caches) clearTextCaches();
    this.gfx?.tex.dispose();
    this.textMask?.dispose();
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }

  /** The time of the frame being drawn (page checks name it). */
  private renderedAt = 0;
  async renderAt(t: number) {
    this.renderedAt = t;
    this.keepLines(t);
    this.placedProps = [];
    const { shot, prev } = this.shotAt(t);
    const framed = this.job.treatment.design?.world?.frame;
    const medium = framed ? { ...MEDIA.clean, ...framed, grain: 0 } : MEDIA[(this.job.treatment.design ?? DEFAULT_DESIGN).medium ?? 'clean'];
    // background motion is held to the medium's frame rate (on twos); cuts and lyrics stay on every frame
    const bt = stepTime(t, medium.step);
    const fx: FrameFx = { flash: 0, hit: 0, shake: 0 };
    const since = t - shot.start;
    // a flash is a few frames of white: a slower decay reads as grey fog over a dark plate
    // a drop/finale on this cut already is the impact: stacking the white flash on it is too much
    const momentHere = (this.job.treatment.moments ?? []).some((m) => (m.kind === 'drop' || m.kind === 'finale') && Math.abs(m.at - shot.start) < 0.3);
    const flashIn = shot.transitionIn === 'flash' && !momentHere;
    // the white rises over the two frames before the cut, holds a frame on it, then falls away in about 0.2 s
    const next = this.job.treatment.shots.find((x) => x.start > shot.start + 0.01);
    const toNext = next ? next.start - t : Infinity;
    if (next?.transitionIn === 'flash' && toNext <= 0.07 && toNext > 0) fx.flash = Math.max(fx.flash, 0.9 * (1 - toNext / 0.07));
    if (flashIn) fx.flash = Math.max(fx.flash, since >= 0 ? (since < 1 / 30 ? 0.95 : 0.95 * Math.exp(-(since - 1 / 30) * 14)) : 0);
    if (flashIn) fx.hit = Math.max(fx.hit, Math.exp(-since * 6) * (since >= 0 ? 1 : 0)); // then glows down
    // glitch: the signal breaks up just before the cut, peaks on it and settles in a quarter second
    const glitchOut = next?.transitionIn === 'glitch' && toNext <= 0.1 && toNext > 0 ? 1 - toNext / 0.1 : 0;
    const glitchIn = shot.transitionIn === 'glitch' && since >= 0 && since < 0.25 ? 1 - since / 0.25 : 0;
    this.finalPass.uniforms['uGlitch'].value = Math.max(glitchOut, glitchIn);
    if (glitchIn > 0.6) fx.shake = Math.max(fx.shake, 0.3);
    // the ending fades to black when the last line is over well before the song ends
    const lastLine = Math.max(0, ...this.job.cues.map((c) => c.end));
    const end = this.job.window.end;
    const fadeLen = Math.min(3, Math.max(0, end - lastLine - 1));
    this.finalPass.uniforms['uFade'].value = fadeLen > 0.8 ? clamp01((t - (end - fadeLen)) / fadeLen) : 0;
    const sweep = shot.transitionIn === 'wipe' && since >= 0 && since < 0.35 ? since / 0.35 : -1;

    const custom = this.customScenes.find((s) => s.covers(t));
    const cur = custom ? { tex: this.renderCustom(custom, bt), mix: 0 } : await this.plateTexture(shot, bt);
    // dissolving a plate into itself at another camera position shows a double image: skip it for the same asset
    const dissolve = prev && shot.transitionIn === 'dissolve' && prev.asset !== shot.asset ? clamp01(since / 0.4) : 1;
    if (prev && dissolve < 1) {
      const p0 = await this.plateTexture(prev, bt);
      this.placePlate(this.plates[0], p0.tex, prev, bt, 1, p0.next, p0.mix);
      this.placePlate(this.plates[1], cur.tex, shot, bt, dissolve, cur.next, cur.mix);
    } else {
      // slowed clips blend toward the next frame instead of stepping
      this.placePlate(this.plates[0], cur.tex, shot, bt, 1, cur.next, cur.mix);
      this.plates[1].mesh.material.uniforms['opacity'].value = 0;
    }
    const mfx = fxAt(t, this.job.treatment.moments ?? [], this.job.treatment.arc ?? []);
    this.updateMotes(bt + mfx.moteTime, fx.hit, mfx);
    if (this.gfx) {
      const beats = this.job.beats;
      let i = beats.findIndex((b) => b > bt) - 1;
      if (i < -1) i = beats.length - 1;
      const since = i >= 0 ? bt - beats[i] : 10;
      if (this.flatPrint(bt)) {
        // the type laid out for this frame first: the veil under it follows where its letters are now
        this.updateCues(t, fx, this.flashes.find((f) => t >= f.at && t < f.at + FLASH_SEC)?.cueId);
        this.textRoot.updateMatrixWorld(true);
        setLineVeil((c, alpha) => this.veilLines(c, t, alpha));
        setBackPush(this.pushAt(t));
      }
      const scene = this.sceneAt(t);
      const paint = (ctx: CanvasRenderingContext2D) => {
        setLinkContext(this.linkContextAt(this.koma(bt)));
        try {
          drawLook(ctx, this.job.treatment.graphics!, this.koma(bt), { since, pulse: Math.exp(-since * 7), index: i }, (asset) => {
            const tex = this.images.get(asset ?? shot.asset ?? '');
            return tex?.image as CanvasImageSource | undefined;
          }, (ls) => this.makeRoom(shot.template === 'title-card' ? ls.filter((l) => !(l.kind === 'app' && l.type === 'lock')) : ls, bt), t); // the code layer moves on real time (bt is stepped by the medium and koma)
        } finally {
          setLinkContext(undefined);
        }
        // (a title card takes the frame alone: a lock screen's big clock under it read as one word with the title)
        if (scene) this.drawStoryboard(ctx, scene, t, since, i);
        const lang = this.job.treatment.design?.language;
        const drop = scene ? undefined : [...(this.job.treatment.moments ?? [])].reverse().find((m) => (m.kind === 'drop' || m.kind === 'finale') && bt >= m.at);
        // a song's own code layer brings its own peaks; the language's stock move on top of it read as clutter
        if (lang && drop && !this.ownDrawing(bt)) drawNative(ctx, lang, bt - drop.at, sectionAt(this.job.treatment.graphics!, bt), { since, pulse: Math.exp(-since * 7), index: i });
      };
      SNOW.drawn = 0;
      paint(this.gfx.ctx);
      // (the ink halo at the source layer, ruling 2026-11-13 §2: a look that drew TV snow is drawn again without it, and
      // that copy is shown round the reading glyphs; the final pass's own noise cannot take back what the scene drew)
      const halo = this.haloNow();
      if (halo && SNOW.drawn > 0) {
        this.gfxClean ??= this.makeGfxClean();
        SNOW.skip = true;
        try { paint(this.gfxClean.ctx); } finally { SNOW.skip = false; }
        this.gfxClean.tex.needsUpdate = true;
      }
      if (this.gfxClean) this.gfxClean.mesh.visible = !!halo && SNOW.drawn > 0;
      setLineVeil(undefined); // probes draw the look without it
      this.gfx.tex.needsUpdate = true;
      // the look is the whole background: no full-bleed plates, no generic light motes
      for (const p of this.plates) p.mesh.material.uniforms['opacity'].value = 0;
      this.motes.visible = false;
    }
    const dimTarget = (shot.params['dim'] as number) ?? 0.3;
    const dimPrev = prev ? ((prev.params['dim'] as number) ?? 0.3) : dimTarget;
    // a hold (溜め) darkens the background only: the dim layer sits under the motes (starlight stays) and the text
    this.dim.material.opacity = Math.max(dimPrev + (dimTarget - dimPrev) * easeOutCubic(since / 0.4), mfx.black);
    if (this.job.treatment.graphics) this.dim.material.opacity = mfx.black; // the look sets its own contrast

    for (const [id, layer] of this.shotLayers) {
      const s = this.job.treatment.shots.find((x) => x.id === id)!;
      // an empty frame during an instrumental reads as a mistake: only draw it around text
      const lines = this.cueLayers.filter((c) => c.rt.shot.id === id);
      const busy = RENDERERS[s.template]?.standalone || lines.some(({ rt }) => t >= rt.showFrom - 0.5 && t <= rt.exitAt + rt.exitDur + 0.3);
      layer.group.visible = t >= s.start && t < s.end && busy;
      if (layer.group.visible) layer.update(this.koma(t), fx);
    }
    for (const r of this.signals) {
      r.mesh.visible = t > r.h.from && t < r.h.to;
      if (r.mesh.visible) r.mesh.material.map = r.steps[Math.min(r.steps.length - 1, Math.floor((1 - Math.abs(2 * handoffProgress(r.h, t) - 1)) * r.steps.length))];
    }
    for (const r of this.irises) {
      r.mesh.visible = t > r.h.from && t < r.h.to;
      if (!r.mesh.visible) continue;
      const a = apertureAt(handoffProgress(r.h, t), r.from, r.to, W * 1.3);
      const map = r.mesh.material.map!;
      // the sheet overhangs the frame by a twentieth a side: the type layer sways under it
      map.repeat.set((W * 1.1) / (2 * a.rx), (H * 1.1) / (2 * a.ry));
      map.offset.set(-(a.cx + W * 0.05 - a.rx) / (2 * a.rx), -(H - a.cy + H * 0.05 - a.ry) / (2 * a.ry));
    }
    for (const f of this.fines) {
      const on = clamp01(Math.min((t - f.from) / 0.14, (f.to - t) / 0.14));
      const inks = on > 0 ? this.kineticInks(f.rt.cue.start, f.rt.cue.end) : undefined;
      f.layer.set(on, new THREE.Color(inks ? (this.lit.by.get(f.id) ?? true ? inks.ink : inks.paper) : f.rt.palette.text));
    }
    for (const e of this.echoes) {
      const on = t >= e.rt.showFrom && t <= e.rt.exitAt + e.rt.exitDur;
      e.group.visible = on;
      if (!on) continue;
      const a = clamp01((t - e.rt.showFrom) / 0.6) * (1 - clamp01((t - e.rt.exitAt) / Math.max(0.1, e.rt.exitDur)));
      // slow drift at a fraction of the text's speed: reads as a deeper layer
      e.group.position.set(-30 + 60 * clamp01((t - e.rt.showFrom) / 6), 0, 0);
      for (const g of e.glyphs) g.mesh.material.opacity = 0.2 * a;
    }
    const flash = this.flashes.find((f) => t >= f.at && t < f.at + FLASH_SEC);
    for (const f of this.flashes) {
      f.group.visible = f === flash;
      if (f !== flash) continue;
      f.group.scale.setScalar(1.08 - 0.08 * ((t - f.at) / FLASH_SEC));
    }
    // letterbox: bars slide in over 0.5 s at a quiet span and snap open on the beat that ends it
    const q = this.quiet.find((s) => t >= s.start && t < s.end);
    const sys = this.job.treatment.design?.system;
    // a phone's messages are the screen itself: nothing moves them off it or draws bars over it
    const screen = !!(this.job.treatment.design?.language && LANGUAGES[this.job.treatment.design.language]?.screen);
    // a flat print fills the frame: the letterbox bars read as a mistake over it
    const close = screen || this.sceneAt(t) || this.flatPrint(t) ? 0 : sys && SYSTEMS[sys].letterbox ? 1 : q ? easeOutCubic(clamp01((t - q.start) / 0.5)) : 0;
    for (const bar of this.bars) bar.position.y = bar.userData['side'] * (H / 2 + H * 0.1 - close * H * 0.12);
    this.updateCues(t, fx, flash?.cueId);
    // heavy beats in loud sections: the lyrics jump with the kick (strength from the song's kick analysis)
    const kick = screen ? 0 : this.kickAt(t, mfx.level);
    this.textRoot.scale.setScalar(1 + 0.05 * kick);
    this.textRoot.position.y = 10 * kick;
    // held lyrics never freeze: the whole type layer drifts a few pixels, like a hand-held camera on a slow move
    const drift = screen ? 0 : 1;
    this.textRoot.position.x = drift * (9 * Math.sin(t * 0.31) + 4 * Math.sin(t * 0.83 + 1.7));
    this.textRoot.position.y += drift * 6 * Math.sin(t * 0.27 + 0.9);
    // a scene plays its moments itself (scene.ts momentCamera): the shared push, shake and hit would come on top of it
    const inScene = !!this.sceneAt(t);
    const shake = inScene ? 0 : Math.max(fx.shake, mfx.shake) * 10;
    this.camera.position.set((hash(t * 30) - 0.5) * shake, (hash(t * 30, 1) - 0.5) * shake, 5);
    this.camera.zoom = inScene ? 1 : mfx.zoom;
    this.camera.updateProjectionMatrix();
    const u = this.finalPass.uniforms;
    const d = this.job.treatment.design ?? DEFAULT_DESIGN;
    const stop = colorAt(d.colorScript, t);
    // the drop's peak style (one per song): rays / diagonal beams / black vacuum then burst / motif rings
    const peak = d.peak === 'burst' && !this.motif ? 'rays' : d.peak;
    const beams = peak === 'beams' ? mfx.rays : 0;
    for (const p of this.plates) {
      // image < 1 sinks the picture toward a dark ground so graphics and type carry the section
      const isScene = p.mesh.material.uniforms['map'].value === this.sceneTarget?.texture;
      p.mesh.material.uniforms['exposure'].value = mfx.exposure * (isScene ? 1 : 0.12 + 0.88 * stop.image);
      p.mesh.material.uniforms['sat'].value = mfx.saturation * (1 - 0.65 * beams);
    }
    // a phone's screen does not go black for a drop: its climax is what happens on it (a close-up, the glass breaking)
    const onScreen = !!(d.language && LANGUAGES[d.language]?.screen);
    if (onScreen || this.sceneAt(t)) this.dim.material.opacity = 0;
    if (peak === 'vacuum' && !onScreen && !this.sceneAt(t)) {
      const drop = (this.job.treatment.moments ?? []).find((m) => (m.kind === 'drop' || m.kind === 'finale') && t >= m.at - 0.35 && t < m.at);
      // the vacuum is under the type: on a composer line being read it would leave dark ink on black
      const reading = this.cueLayers.some(({ rt, layer }) => { if (!rt.style.budget) return false; const [a, b] = layer.readable(); return t >= a && t <= b; });
      if (drop && !reading) this.dim.material.opacity = Math.max(this.dim.material.opacity, 0.96);
    }
    // a scene's stage draws its own dark edges: the shared vignette greyed its white flash
    u['uVignette'].value = this.sceneAt(t) ? 0 : mfx.vignette;
    // a flat print (kinetic type) has no lens: the vignette greyed its paper and inks
    const worldFrame = this.job.treatment.design?.world?.frame;
    u['uVigBase'].value = worldFrame ? worldFrame.vignette : this.sceneAt(t) || this.flatPrint(t) ? 0 : 0.55;
    u['uScan'].value = worldFrame?.scan ?? 0;
    this.updateGlass(t);
    // a design language brings its own peak move (graphics.ts drawNative): no shared rays, beams or shockwave
    const own = !!this.job.treatment.design?.language && !!this.gfx;
    u['uRays'].value = own ? 0 : peak === 'rays' || peak === 'vacuum' ? mfx.rays * (peak === 'vacuum' ? 0.5 : 1) : 0;
    u['uBeams'].value = own ? 0 : beams;
    u['uShockR'].value = mfx.shockR;
    u['uShock'].value = own ? 0 : mfx.shock;
    (u['uRayColor'].value as THREE.Color).set(this.paletteAt(t).glow).lerp(new THREE.Color(1, 1, 1), 0.45);
    for (const p of this.plates) {
      const pu = p.mesh.material.uniforms;
      (pu['shadowC'].value as THREE.Color).set(stop.shadow);
      (pu['highlightC'].value as THREE.Color).set(stop.highlight);
      pu['duo'].value = pu['map'].value === this.sceneTarget?.texture ? 0 : Math.max(stop.duotone, 1 - stop.image);
    }
    if (this.motif) {
      const pal = this.paletteAt(t);
      // a 'wipe' into a shot opens through the motif's shape; its mask is black, so a design language's paper look
      // (crayon on てぇてぇ: black wedges at every wipe) never uses it
      const iris = !own && shot.transitionIn === 'wipe' && since >= 0 && since < 0.6 ? since / 0.6 : -1;
      const textOn = this.cueLayers.some(({ rt }) => t >= rt.showFrom && t <= rt.exitAt + rt.exitDur) ? 1 : 0;
      this.motif.update(bt, Math.max(mfx.rays, mfx.moteBurst) * 0.8 * (1 - 0.6 * textOn), new THREE.Color(pal.line), new THREE.Color(pal.accent), peak === 'burst' ? mfx.rays : 0, iris, textOn);
    }
    u['uGrain'].value = 0.02 + 0.1 * d.grain + medium.grain;
    u['uPaper'].value = Math.max(d.paper, medium.paper);
    const held = Math.floor(t * (medium.step || this.job.fps) + 1e-6);
    u['uTime'].value = held / (medium.step || this.job.fps); // grain re-seeds once per held frame
    u['uBoil'].value = medium.boil;
    u['uBoilSeed'].value = Math.floor(t * medium.boilRate + 1e-6) % 97;
    (u['uWeave'].value as THREE.Vector2).set(((hash(held, 11) - 0.5) * 2 * medium.weave) / W, ((hash(held, 12) - 0.5) * 2 * medium.weave) / H);
    u['uFlicker'].value = 1 + (hash(held, 13) - 0.5) * 2 * medium.flicker;
    u['uTooth'].value = medium.tooth;
    u['uPixel'].value = medium.pixel;
    u['uLift'].value = medium.lift;
    const screenHit = hitAt(this.cueLayers.flatMap(({ rt }) => (rt.style.hit ? [{ at: rt.cue.start, hit: rt.style.hit }] : [])), t);
    // (QA, the ink gate's freeze test: __vjForceTextMask draws the text mask whatever the medium)
    // the ink halo (every job: this engine's, haloNow): measured round the reading glyphs as they stand now; the words-off pass of
    // the ink gate keeps the words-on pass's (frozen controls), never one measured with the words away
    const halo = this.haloNow();
    if (!this.inkFrozen) {
      [u['uHaloIn'].value, u['uHaloOut'].value] = halo ? [halo[0], Math.min(halo[1], HALO_REACH)] : [0, 0];
      // (no reading glyph on the frame: nothing to keep the effects off, and no pass drawn)
      const reading = halo ? (this.textRoot.updateMatrixWorld(true), this.readingMeshes()) : [];
      if (halo && !reading.length) [u['uHaloIn'].value, u['uHaloOut'].value] = [0, 0];
      if (halo && reading.length) {
        this.halo ??= new InkHalo();
        this.halo.render(this.renderer, this.textScene, this.camera, reading);
        u['tHalo'].value = this.halo.texture;
        // (every copy of the words stays out of the clean zone: material-patch haloCut; a declared extrude is read)
        this.textRoot.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && o.userData['copy'] && o.userData['part'] !== 'extrude') setPatch(m.material as THREE.Material, 'halo-cut', haloCut); });
      }
      HALO_UNIFORMS.tHalo.value = u['tHalo'].value as THREE.Texture | null;
      [HALO_UNIFORMS.uHaloIn.value, HALO_UNIFORMS.uHaloOut.value] = [u['uHaloIn'].value as number, u['uHaloOut'].value as number];
    }
    if (this.ghostPass) for (const k of ['tHalo', 'uHaloIn', 'uHaloOut']) this.ghostPass.uniforms[k].value = u[k].value;
    if (this.gfxClean) for (const k of ['tHalo', 'uHaloIn', 'uHaloOut'] as const) this.gfxClean.u[k].value = u[k].value;
    const needsMask = medium.pixel + medium.tooth > 0 || screenHit.zoom > 0 || screenHit.tile > 0 || !!(globalThis as { __vjForceTextMask?: boolean }).__vjForceTextMask;
    u['uHasText'].value = needsMask ? 1 : 0;
    // (the ink gate's words-off pass keeps the words-on pass's text mask: ink-mask.ts, frozen controls)
    if (needsMask && !this.inkFrozen) {
      // (QA, the gate's smoke test: __vjInkNoFreeze draws a words-off pass's controls from the words-off scene, what the
      // freeze stands against: the text mask drawn with the words already away)
      const away = this.carriersOnly && (globalThis as { __vjInkNoFreeze?: boolean }).__vjInkNoFreeze ? this.wordsAway() : undefined;
      u['tText'].value = this.renderTextMask();
      away?.();
    }
    this.finalPass.uniforms['uFlash'].value = inScene ? 0 : Math.max(fx.flash, this.glassFlash);
    this.finalPass.uniforms['uHit'].value = inScene ? 0 : fx.hit;
    this.finalPass.uniforms['uZoomHit'].value = inScene ? 0 : screenHit.zoom;
    this.finalPass.uniforms['uTileHit'].value = inScene ? 0 : screenHit.tile;
    // capped: past this, white lyrics bloom into an unreadable glare
    this.bloom.strength = Math.min(1.2, 0.55 + 0.9 * fx.hit + mfx.bloom);
    // a light field blooms to white: keep only a trace there; on a dark field a flat graphic look still glows around
    // every light object (a cream sprite got a white halo), so it stays low there too
    if (this.job.treatment.graphics) this.bloom.strength = sectionAt(this.job.treatment.graphics, sectionClock(this.job.treatment.graphics.sections, t)).text ? 0.05 : Math.min(this.bloom.strength, 0.15);
    // the cream paper bloomed to white and spilled over the printed figure, turning navy pale blue
    if (this.flatPrint(t)) this.bloom.strength = 0;
    // a scene's parts glow on their own (the LED's halo): a bloom over them washed the band's type grey
    if (this.sceneAt(t)) this.bloom.strength = 0;
    // a live picture skips the bloom's passes when it adds nothing; a phone feels them
    if (this.lazy) this.bloom.enabled = this.bloom.strength > 0;
    this.finalPass.uniforms['uSweep'].value = this.motif ? -1 : sweep;
    // chroma ghosts: the lyrics as they were 1/30 and 1/15 s ago, offset and tinted
    const chroma = this.job.treatment.design?.language && LANGUAGES[this.job.treatment.design.language].chroma;
    if (chroma && this.ghostPass && !this.inkFrozen) {
      const offset = this.textRoot.position.x;
      // a line jumping (pushed up by the next one landing) leaves no ghost: a copy a whole line away is a second line
      // over the new one (チョロイン c061 at 163.4 s), not a misregistered plate; small motion keeps its trail
      const pose = () => this.cueLayers.map(({ layer }) => [layer.group.position.x, layer.group.position.y, layer.group.scale.x]);
      const at = pose();
      ([[2 / 30, -3.4, this.ghostB!], [1 / 30, 3.2, this.ghostA!]] as const).forEach(([lag, dx, target]) => {
        this.updateCues(t - lag, { flash: 0, hit: 0, shake: 0 }, flash?.cueId);
        pose().forEach(([x, y, s], i) => {
          const [x1, y1, s1] = at[i];
          if (Math.hypot(x - x1, y - y1) > 24 || Math.abs(s - s1) > 0.03 * Math.max(s, s1)) this.cueLayers[i].layer.group.visible = false;
        });
        this.textRoot.position.x = offset + dx;
        this.renderer.setRenderTarget(target);
        this.renderer.setClearColor(0x000000, 0);
        this.renderer.clear();
        this.renderer.render(this.textScene, this.camera);
      });
      this.renderer.setRenderTarget(null);
      this.textRoot.position.x = offset;
      this.updateCues(t, fx, flash?.cueId);
      (this.ghostPass.uniforms['uColA'].value as THREE.Color).set(chroma[0]);
      (this.ghostPass.uniforms['uColB'].value as THREE.Color).set(chroma[1]);
    }
    // (every material showing a glyph picture reads it premultiplied: material-patch matchGlyphPicture; a material made
    // anywhere with a glyph's map, a copy, a shine, a twin, is matched here)
    for (const root of [this.textScene, this.scene]) root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.material) matchGlyphPicture(m.material); });
    if (this.job.layer === 'text' || this.job.layer === 'words') {
      // the lyrics alone on transparency (their own colour treatment; grain and grading belong to the back layer)
      this.renderer.setRenderTarget(null);
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.clear();
      const hid: THREE.Object3D[] = [];
      if (this.job.layer === 'words') this.textRoot.traverse((o) => { if ((o as THREE.Mesh).isMesh && o.visible && o.userData['decor']) { o.visible = false; hid.push(o); } });
      this.renderer.render(this.textScene, this.camera);
      hid.forEach((o) => (o.visible = true));
      return;
    }
    if (this.job.layer === 'back') this.textRoot.visible = this.echoRoot.visible = false;
    const back = this.carriersOnly ? this.wordsAway() : undefined;
    this.pageGlyphCheck();
    // (the ink gate: the words-on pass's controls captured, the words-off pass run on the same ones)
    if (this.inkCapture) this.inkControls = { uniforms: Object.fromEntries(Object.entries(this.finalPass.uniforms).map(([k, v]) => [k, cloneValue(v.value)])), bloom: this.bloom.strength };
    if (this.inkFrozen) { for (const [k, v] of Object.entries(this.inkFrozen.uniforms)) this.finalPass.uniforms[k].value = cloneValue(v); this.bloom.strength = this.inkFrozen.bloom; }
    // (QA ablation, the ink gate: final-pass uniforms held at their resting value by name, __vjFinalOff)
    for (const k of (globalThis as { __vjFinalOff?: string[] }).__vjFinalOff ?? []) if (this.finalPass.uniforms[k] && typeof this.finalPass.uniforms[k].value === 'number') this.finalPass.uniforms[k].value = ({ uFlicker: 1, uSweep: -1, uShockR: -1 } as Record<string, number>)[k] ?? 0;
    for (const [k, v] of Object.entries((globalThis as { __vjFinalSet?: Record<string, number> }).__vjFinalSet ?? {})) if (this.finalPass.uniforms[k]) this.finalPass.uniforms[k].value = v;
    this.composer.render();
    back?.();
  }

  /**
   * A page-carried scale composition's glyphs as drawn on this frame against the carrier its page laid on this same frame
   * (render/page-layout.ts, Codex phase 4 §4: checked on every output frame, entering, still, leaving and at seams):
   * every visible glyph's em box inside the outline. A frame that breaks it is counted (render.mts metrics.json
   * `pageChecks`; the reading gate's contract).
   */
  private pageGlyphCheck() {
    const g = globalThis as { vjPageLast?: PageDrawn; vjFrameStamp?: number; vjPageChecks?: PageTally };
    const stamp = g.vjFrameStamp ?? 0;
    for (const { rt, layer } of this.cueLayers) {
      if (!layer.inkBoxes || !layer.scale || layer.scale.kind === 'miss' || !layer.scale.carrier.startsWith('page') || !layer.group.visible) continue;
      this.textRoot.updateMatrixWorld(true);
      const boxes = layer.inkBoxes();
      if (!boxes.length) continue;
      const tally = pageTally();
      tally.glyphFrames++;
      const drawn = g.vjPageLast?.[rt.cue.id];
      const at = this.renderedAt.toFixed(3);
      // (a frame its page drew whole as composed, its lines leaving no legal page: counted apart, pageFallbackFrames)
      if (drawn?.fallback && drawn.stamp === stamp) continue;
      if (!drawn || drawn.stamp !== stamp) { if (tally.fails.length < 400) tally.fails.push(`${at} ${rt.cue.id} oneCarrier: glyphs drawn with no page laid round them this frame`); continue; }
      const out = boxes.filter((b) => !boxInsideOutline(drawn.outline, b));
      if (out.length && tally.fails.length < 400) tally.fails.push(`${at} ${rt.cue.id} balloonHolds: ${out.length} glyph(s) as drawn leave the carrier (${out.map((b) => `${b.x0.toFixed(0)},${b.y0.toFixed(0)}`).slice(0, 3).join(' ')})`);
    }
    g.vjFrameStamp = stamp + 1;
  }

  /** The ink gate (QA): capture the next render's controls; run renders on these captured ones. */
  private inkCapture = false;
  private inkControls?: { uniforms: Record<string, unknown>; bloom: number };
  private inkFrozen?: { uniforms: Record<string, unknown>; bloom: number };
  private inkMask?: InkMask;
  private halo?: InkHalo;

  /** The clean copy of the look (gfxClean): over the look, seen only within the halo round the reading glyphs. */
  private makeGfxClean(): NonNullable<LyricVjEngine['gfxClean']> {
    const c = document.createElement('canvas');
    [c.width, c.height] = [W, H];
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const u = { tHalo: { value: null as unknown }, uHaloIn: { value: 0 }, uHaloOut: { value: 0 } };
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false });
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, u);
      sh.fragmentShader = sh.fragmentShader
        .replace('void main() {', `uniform sampler2D tHalo; uniform float uHaloIn, uHaloOut;\nvoid main() {`)
        .replace('#include <alphatest_fragment>', `#include <alphatest_fragment>\n  diffuseColor.a *= uHaloOut > 0.0 ? 1.0 - clamp((texture2D(tHalo, gl_FragCoord.xy / vec2(${W}.0, ${H}.0)).r - uHaloIn) / max(uHaloOut - uHaloIn, 1e-3), 0.0, 1.0) : 0.0;`);
    };
    mat.customProgramCacheKey = () => 'gfx-clean';
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(W, H), mat);
    mesh.renderOrder = -0.999; // right over the look, under everything else
    mesh.position.copy(this.gfx!.mesh.position);
    this.scene.add(mesh);
    return { ctx: c.getContext('2d')!, tex, mesh, u };
  }

  /** The reading glyphs as shown now, their faces and declared extrudes (the ink halo's support). */
  private readingMeshes(): THREE.Mesh[] {
    return this.glyphMeshes().flatMap((l) => [...l.glyphs.map((g) => g.mesh), ...l.parts.filter((p) => p.role === 'extrude').map((p) => p.mesh)]);
  }

  /**
   * QA: every glyph mesh of every line shown, each with its line's slot on this moment (1..) and its index: what the ink
   * gate draws in IDs (ink-mask.ts). A world line gives its own glyphs; other templates their textured meshes that are not
   * what the words stand on.
   */
  glyphMeshes(): { id: string; slot: number; glyphs: { i: number; mesh: THREE.Mesh }[]; parts: { i: number; mesh: THREE.Mesh; role: 'extrude' | 'outline' | 'copy' }[] }[] {
    if (!this.textRoot.visible) return [];
    const shown = (o: THREE.Object3D | null): boolean => !o || (o.visible && shown(o.parent));
    // (shown: visible all the way up and drawn at opacity over 0.01, §1.4)
    const drawn = (m: THREE.Mesh) => shown(m) && ((m.material as THREE.Material).opacity ?? 1) > 0.01;
    // (each line's parts by reading role, ruling 2026-11-13 §1: what its layout names, and whatever hangs under a glyph)
    const lines = this.cueLayers.flatMap(({ rt, layer, twin }) => [layer, ...(twin ? [twin.layer] : [])].filter((l) => shown(l.group)).map((l) => {
      const glyphs = (l.glyphMeshes ? l.glyphMeshes() : meshesOf(l.group)).filter((g) => drawn(g.mesh));
      return { id: rt.cue.id, glyphs, parts: [...(l.glyphParts?.() ?? []), ...partsUnder(glyphs)].filter((p) => drawn(p.mesh)) };
    }).filter((x) => x.glyphs.length));
    // (and every other word the type layer shows: a line's call, a blown-up word's copies, the drop's keyword flash; read
    // under `other`, so nothing taken away with the words is left out of the masks; what hangs under a glyph is its part)
    const taken = new Set<THREE.Object3D>(lines.flatMap((l) => [...l.glyphs.map((g) => g.mesh), ...l.parts.map((p) => p.mesh)]));
    const under = (o: THREE.Object3D | null): boolean => !!o && (taken.has(o) || under(o.parent));
    // (decor anywhere above it: a fine tier's small phrase, a set piece's printed words: not a reading line, owner rule
    // that background words are never the reading; review 2026-11-15, counted as see-through "other" glyphs)
    const decor = (o: THREE.Object3D | null): boolean => !!o && o !== this.textRoot && (!!o.userData['decor'] || decor(o.parent));
    const other: { i: number; mesh: THREE.Mesh }[] = [];
    this.textRoot.traverse((o) => { const m = o as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>; if (m.isMesh && m.material.map && !under(m) && !decor(m) && !m.userData['ring'] && !m.userData['copy'] && drawn(m)) other.push({ i: other.length, mesh: m }); });
    return [...lines, ...(other.length ? [{ id: 'other', glyphs: other, parts: [] }] : [])].slice(0, 255).map((l, k) => ({ ...l, slot: k + 1 }));
  }

  /**
   * QA, the ink gate (gate v2, docs/research/2026-11-13-ink-table-gate-design.md §1.3): one moment drawn three ways with
   * the glyphs' coverage made all or nothing: the final composite with the words, the same without them on the words-on
   * pass's own controls (text mask, chroma trails, every final uniform, the bloom), and the glyphs' IDs through the final
   * pass's sampling. Returns the three over the glyphs' box grown by `pad`, top row first, and which line each slot is.
   */
  async inkMoment(t: number, pad = 64): Promise<{ box: [number, number, number, number]; on: Uint8Array; off: Uint8Array; mask: Uint8Array; parts?: Uint8Array; fx: Record<string, number>; others: Record<number, string>; lines: Record<number, string>; shown: number[]; opacity: Record<number, number> } | undefined> {
    const gl = this.renderer.getContext();
    const read = (x0: number, y0: number, w: number, h: number) => { const b = new Uint8Array(w * h * 4); gl.readPixels(x0, H - y0 - h, w, h, gl.RGBA, gl.UNSIGNED_BYTE, b); return flipRows(b, w, h); };
    this.showLyrics(true);
    await this.renderAt(t);
    const lines = this.glyphMeshes();
    if (!lines.length) return undefined;
    // (a glyph's parts too: the edge of its extrude or keyline is read as drawn, all or nothing like its face)
    const all = lines.flatMap((l) => [...l.glyphs, ...l.parts]);
    all.forEach((g) => binarize(g.mesh.material as THREE.Material, true));
    try {
      this.inkCapture = true;
      await this.renderAt(t);
      this.inkCapture = false;
      const meshes = this.glyphMeshes();
      const b = new THREE.Box3();
      let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
      for (const g of meshes.flatMap((l) => l.glyphs)) { b.setFromObject(g.mesh); if (b.isEmpty()) continue; [x0, y0, x1, y1] = [Math.min(x0, b.min.x + W / 2), Math.min(y0, H / 2 - b.max.y), Math.max(x1, b.max.x + W / 2), Math.max(y1, H / 2 - b.min.y)]; }
      if (!(x1 > x0)) return undefined;
      [x0, y0, x1, y1] = [Math.max(0, Math.floor(x0 - pad)), Math.max(0, Math.floor(y0 - pad)), Math.min(W, Math.ceil(x1 + pad)), Math.min(H, Math.ceil(y1 + pad))];
      const [w, h] = [x1 - x0, y1 - y0];
      const on = read(x0, y0, w, h);
      this.inkMask ??= new InkMask();
      // (a glyph picture whose material declares a part (surface-parts): the face is its ink texels only; an outline part
      // goes to the parts mask as the glyph's outline, a ground part is read as the ground)
      const declared = (m: THREE.Mesh) => partOf(((m.material as THREE.MeshBasicMaterial).map?.userData['surface']) as string | undefined);
      this.inkMask.render(this.renderer, this.textScene, this.camera, meshes.flatMap((l) => l.glyphs.map((g) => { const d = declared(g.mesh); return { mesh: g.mesh, id: idOf(l.slot, g.i), ...(d ? { split: { tint: d.tint, part: d.colour, keep: 'face' as const } } : {}) }; })), this.finalPass.uniforms as Record<string, { value: unknown }>);
      const mask = this.inkMask.read(this.renderer, x0, y0, w, h);
      // (the parts mask: each glyph's parts by reading role, through the same sampling; ink-verify partIdOf)
      const partList = [
        ...meshes.flatMap((l) => l.parts.map((p) => ({ mesh: p.mesh, id: partIdOf(l.slot, p.i, p.role) }))),
        ...meshes.flatMap((l) => l.glyphs.flatMap((g) => { const d = declared(g.mesh); return d && d.role !== 'ground' ? [{ mesh: g.mesh, id: partIdOf(l.slot, g.i, d.role), split: { tint: d.tint, part: d.colour, keep: 'part' as const } }] : []; })),
      ];
      let parts: Uint8Array | undefined;
      if (partList.length) {
        this.inkMask.render(this.renderer, this.textScene, this.camera, partList, this.finalPass.uniforms as Record<string, { value: unknown }>);
        parts = this.inkMask.read(this.renderer, x0, y0, w, h);
      }
      // (QA, the gate's smoke test: __vjInkNoFreeze runs the words-off pass on its own controls, to show what freezing holds)
      this.inkFrozen = (globalThis as { __vjInkNoFreeze?: boolean }).__vjInkNoFreeze ? undefined : this.inkControls;
      this.showLyrics(false, true);
      (globalThis as { __vjInkRings?: boolean }).__vjInkRings = true;
      await this.renderAt(t);
      const off = read(x0, y0, w, h);
      // (each glyph's drawn opacity, with every group above it: under 1 the ground shows through its ink, ink-verify)
      const opacity = (m: THREE.Mesh) => { let a = (m.material as THREE.Material).opacity ?? 1; for (let o = m.parent; o; o = o.parent) a *= ((o as THREE.Mesh).material as THREE.Material | undefined)?.opacity ?? 1; return a; };
      // (the effects as the words-on pass drew them: every numeric final control off its resting value, and the bloom)
      const rest: Record<string, number> = { uFlicker: 1, uSweep: -1, uShockR: -1, uVigBase: 0.55, uAberration: 0.0012 };
      const fx = Object.fromEntries([...Object.entries(this.inkControls?.uniforms ?? {}).filter(([k, v]) => typeof v === 'number' && v !== (rest[k] ?? 0)).map(([k, v]) => [k, +(v as number).toFixed(4)]), ['bloom', +(this.inkControls?.bloom ?? 0).toFixed(3)]]);
      // (what each `other` mesh is, for the report: its ancestors' names and userData keys, its picture's name)
      const what = (m: THREE.Object3D) => { const p: string[] = []; for (let o: THREE.Object3D | null = m; o && o !== this.textRoot; o = o.parent) p.push(`${o.type}${o.name ? `:${o.name}` : ''}${Object.keys(o.userData).length ? `{${Object.keys(o.userData).join(',')}}` : ''}`); return `${p.join('<')} map:${((m as THREE.Mesh).material as THREE.MeshBasicMaterial).map?.name ?? ''}`; };
      const others = Object.fromEntries(meshes.filter((l) => l.id === 'other').flatMap((l) => l.glyphs.map((g) => [idOf(l.slot, g.i), what(g.mesh)])));
      return { box: [x0, y0, w, h], on, off, mask, parts, fx, others, lines: Object.fromEntries(meshes.map((l) => [l.slot, l.id])), shown: meshes.flatMap((l) => l.glyphs.map((g) => idOf(l.slot, g.i))), opacity: Object.fromEntries(meshes.flatMap((l) => l.glyphs.map((g) => [idOf(l.slot, g.i), opacity(g.mesh)]))) };
    } finally {
      this.inkCapture = false;
      this.inkFrozen = undefined;
      this.showLyrics(true);
      all.forEach((g) => binarize(g.mesh.material as THREE.Material, false));
    }
  }

  private textMask?: THREE.WebGLRenderTarget;

  /** The lyrics alone (alpha = coverage), so ink treatments can leave them crisp. */
  private renderTextMask(): THREE.Texture {
    this.textMask ??= new THREE.WebGLRenderTarget(W, H);
    // (the lyrics live in the type scene, textScene, since 0638c72: rendering `this.scene` with all but textRoot hidden drew
    // an empty mask, so the text-keep path of tooth, pixel and the zoom/tile hits never kept the lyrics; review 2026-11-13)
    const shown = this.textScene.children.map((o) => o.visible);
    this.textScene.children.forEach((o) => (o.visible = o === this.textRoot));
    const clear = this.renderer.getClearAlpha();
    this.renderer.setClearAlpha(0);
    this.renderer.setRenderTarget(this.textMask);
    this.renderer.clear();
    this.renderer.render(this.textScene, this.camera);
    this.renderer.setRenderTarget(null);
    this.renderer.setClearAlpha(clear);
    this.textScene.children.forEach((o, i) => (o.visible = shown[i]));
    return this.textMask.texture;
  }

  /** Drifting light motes (deterministic in t): keep every shot alive even on a still plate. */
  private updateMotes(t: number, hit: number, m: MomentFx) {
    const pos = this.motes.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const sp = 18 + hash(i, 3) * 50;
      const y = ((hash(i, 1) * (H + 200) + t * sp) % (H + 200)) - H / 2 - 100;
      const x = (hash(i, 2) - 0.5) * W + Math.sin(t * 0.4 + i) * 30;
      // after a drop the motes are blown outward from the horizon, then drift back
      const ox = x;
      const oy = y + H * 0.16;
      const push = 1 + 1.2 * m.moteBurst;
      pos.setXYZ(i, ox * push, oy * push - H * 0.16, 0);
    }
    pos.needsUpdate = true;
    (this.motes.material as THREE.PointsMaterial).color.set(this.paletteAt(t).glow);
    (this.motes.material as THREE.PointsMaterial).opacity = Math.min(1, (0.45 + 0.4 * hit) * (0.75 + 0.15 * m.level) + 0.3 * m.moteBurst);
  }

  /** Kick pulse 0..1 at t: only in loud sections (arc level ≥ 2.4), only on beats that really hit (≥ 0.3). */
  private kickAt(t: number, level: number): number {
    const strength = this.job.beatStrength;
    if (!strength || level < KICK_LEVEL) return 0;
    const beats = this.job.beats;
    let lo = 0;
    let hi = beats.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (beats[mid] <= t) lo = mid + 1;
      else hi = mid;
    }
    const i = lo - 1;
    if (i < 0 || strength[i] < 0.3) return 0;
    return Math.min(1, strength[i] * 1.4) * Math.exp(-(t - beats[i]) * 9) * Math.min(1, level - 2.4 + 0.4);
  }

  /** When a shot is clear of lyrics: after the last line that overlaps it has held and left the screen (+0.3 s). */
  private clearOfLines(shot: Shot): number {
    let t = shot.start;
    // a line holds HOLD_SEC after it is sung before it exits: the title waits until it has gone
    const gone = (c: { end: number }) => c.end + HOLD_SEC + EXIT_SEC + 0.3;
    for (const c of this.job.cues) if (c.start < shot.end && gone(c) > shot.start) t = Math.max(t, gone(c));
    return Math.min(t, shot.end - 1);
  }

  /** The palette with this section's accent (the colour script's one accent drives key words, lines and glows). */
  /** The cue's palette: with a graphic look, dark type over a light backdrop and light type over a dark one. */
  private cuePalette(t: number, backdrop?: string): Palette {
    const p = this.paletteAt(t);
    if (!backdrop) return p;
    const look = sectionAt(this.job.treatment.graphics!, sectionClock(this.job.treatment.graphics!.sections, t));
    const light = luma(backdrop) > 0.5;
    const text = light ? (look.text && luma(look.text) < 0.4 ? look.text : '#1a1a1a') : look.text && luma(look.text) > 0.6 ? look.text : '#f4f2ee';
    return { ...p, text, background: backdrop };
  }

  /**
   * Background objects make room for the lyrics: moved (or shrunk) off the rectangle of the line on screen, gliding
   * there over 0.4 s when a new line comes up and back when lines leave.
   */
  private roomEvents?: { n: number; ev: number[] };
  /** Every time the frame's set of objects or lines changes, sorted (see makeRoom). */
  private roomEventsFor(): number[] {
    if (this.roomEvents?.n === this.lyricRects.length) return this.roomEvents.ev;
    const look = this.job.treatment.graphics;
    const all = [...this.lyricRects.flatMap((r) => [r.from, r.to]), ...(look?.sections.map((s) => s.start) ?? []), ...storyEvents(look?.story ?? [])];
    const ev = [...new Set(all.filter((x) => Number.isFinite(x)))].sort((a, b) => a - b);
    this.roomEvents = { n: this.lyricRects.length, ev };
    return ev;
  }

  private makeRoom(all: Layer[], t: number): Layer[] {
    const GLIDE = 0.4;
    // a bracket or viewfinder frame marks where the words are: it fades in with the words and out when none are up, so
    // an intro or an interlude never frames empty space (a section running on past its first line kept it there)
    // (per line, from its first box to its last: a line pushed along has one box per place and must not dip between them)
    const spans = new Map<string, { from: number; to: number }>();
    this.lyricRects.forEach((r, i) => {
      const k = r.id ?? `#${i}`;
      const s = spans.get(k);
      spans.set(k, s ? { from: Math.min(s.from, r.from), to: Math.max(s.to, r.to) } : { from: r.from, to: r.to });
    });
    const words = Math.max(0, ...[...spans.values()].map((r) => Math.min(clamp01((t - r.from + 0.15) / 0.3), clamp01((r.to - t) / 0.3))));
    const ls = all.map((l) => (l.kind === 'frame' && (l.type === 'brackets' || l.type === 'viewfinder') ? ({ ...l, opacity: (l.opacity ?? 1) * words } as Layer) : l));
    const at = (x: number) => this.lyricRects.filter((r) => x >= r.from && x <= r.to);
    // (lines that all stand on their own carriers stay carried: the ground leaves them no room of paper, 2026-11-04)
    // (a page built round its words' wall keeps every wall's layout through the union: a call beside the line, or a line
    // sharing the shot, would otherwise leave it the bare box, world-sets FaceLayout)
    const union = (rs: Rect[]) => {
      if (!rs.length) return undefined;
      const faces = rs.flatMap((r) => (r as { face?: unknown }).face ?? []);
      return { ...rs.reduce((a, b) => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) })), carried: rs.every((r) => r.carried), ...(faces.length ? { faces } : {}) };
    };
    // room for the lines as they move where the frame has it; an object with nowhere to go clear of that makes room
    // for the lines at rest instead (as it did before the motion room; the bigger box left it over the words)
    const placeAt = (layers0: Layer[], x: number) => {
      const lines = at(x);
      const moving = union(lines.map((r) => r.rect));
      const rest = union(lines.map((r) => r.rest));
      if (!moving || !rest) return layers0;
      // a card about a line up (its text in the line: 「嘘つき！」 on c062) is key content: it stays before the others
      const sung = lines.map((r) => bare(this.cueLayers.find((c) => c.rt.cue.id === r.id)?.rt.cue.text ?? '')).join('|');
      const layers = layers0.map((l) => (l.kind === 'card' && !l.key && bare(l.text) && sung.includes(bare(l.text)) ? ({ ...l, key: true } as Layer) : l));
      const keep = this.keepOut.filter((r) => x >= r.from && x <= r.to).map((r) => r.rect);
      const wide = avoidAll(layers, moving, keep);
      const tight = avoidAll(layers, rest, keep);
      return wide.map((l, i) => {
        const r = l.kind === 'code' ? undefined : layerRect(l);
        return r && r.x0 < moving.x1 && moving.x0 < r.x1 && r.y0 < moving.y1 && moving.y0 < r.y1 ? tight[i] : l;
      });
    };
    const placed = (x: number) => placeAt(ls, x);
    // the latest change of the visible set before t: glide from the placement just before it
    const edges = this.lyricRects.flatMap((r) => [r.from, r.to]).filter((x) => x <= t && x > t - GLIDE);
    const now = placed(t);
    const e = edges.length ? Math.max(...edges) : 0;
    const before = edges.length ? placed(e - 0.001) : now;
    const blended = edges.length ? now.map((l, i) => blendLayer(before[i], l, easeOutCubic((t - e) / GLIDE))) : now;
    const look = this.job.treatment.graphics;
    const sec = look ? sectionAt(look, this.koma(t)) : undefined;
    const current = !!sec && sec.layers.length <= all.length && sec.layers.every((l, i) => all[i] === l);
    const n = look && sec ? look.sections.indexOf(sec) : -1;
    // every move making room makes, and every object it sends away (avoid sets one with no room anywhere to 0), glides
    // and fades over GLIDE: the placement is the mean over the frames of the last GLIDE s, each placed with the layers
    // and lines of its own time — whatever made the change (a line, a card landing, a hero state), nothing jumps
    const storyFrom = sec && current ? sec.layers.length : all.length;
    const idsOf = (layers: Layer[], s: number, from: number) => layers.map((l, i) => (i >= from ? ((l as { ref?: string }).ref ?? `story#${i - from}`) : `${s}#${i}`));
    const keys = (layers: Layer[], s: number, from: number) => new Map(idsOf(layers, s, from).map((k, i) => [k, i]));
    const own = sec && current ? n : n - 1;
    // decided once per stretch between changes (a line, a section, a card landing, a hero turn, a prop coming or going):
    // placed per frame, a falling, swaying card found another spot every few frames and the pile hopped about
    // (チョロイン 167–169 s). The stretch is placed as it is 0.9 s in (a card that just landed has settled), or just
    // before the next change if that comes first
    const ev = this.roomEventsFor();
    const decide = (x: number) => {
      const k = ev.findIndex((e) => e > x);
      const e = k < 0 ? ev[ev.length - 1] : k === 0 ? undefined : ev[k - 1];
      const next = k < 0 ? Infinity : ev[k];
      return e === undefined ? x : Math.min(e + SETTLE_SEC, next - 0.001);
    };
    const memo = new Map<number, { plan: Layer[]; placed: Layer[]; keys: Map<string, number> }>();
    // the window looks back twice GLIDE: a long move fades out and in over GLIDE each (see smoothPlacement); the rest
    // glides over the latest GLIDE
    const STEPS = 25;
    const LOOK = 2 * STEPS - 1;
    // a prop flying along its path is placed frame by frame: room made where it was at one time of the stretch is not
    // where it is later (a feather of 春泥棒 grazed c008)
    // (and a follower: it moves with its leader all the time)
    const flying = (l: Layer) => /^(fly|follow)#/.test((l as { ref?: string }).ref ?? '');
    const sample = (j: number, each: boolean) => {
      const x = t - (GLIDE * j) / (STEPS - 1);
      const d = each ? x : decide(x);
      const hit = memo.get(d);
      if (hit) return hit;
      const sx = look && sec && current ? sectionAt(look, this.koma(d)) : undefined;
      const plan = sx && look ? [...sx.layers, ...(storyLayers(look.story ?? [], this.koma(d)) as Layer[])] : ls;
      const f = { plan, placed: placeAt(plan, d), keys: sx && look ? keys(plan, look.sections.indexOf(sx), sx.layers.length) : keys(ls, own, storyFrom) };
      memo.set(d, f);
      return f;
    };
    const frames = Array.from({ length: LOOK }, (_, j) => sample(j, false));
    const each = ls.some(flying) ? Array.from({ length: STEPS }, (_, j) => sample(j, true)) : frames;
    const ids = idsOf(ls, own, storyFrom);
    const out = ls.map((l, i) => {
      if (l.kind === 'code') return blended[i];
      return smoothPlacement(l, (flying(l) ? each : frames).map((f) => {
        const j = f.keys.get(ids[i]);
        return j === undefined ? undefined : { plan: f.plan[j], placed: f.placed[j] };
      }), STEPS);
    });
    this.placedProps.push(...(sec && current ? measurable(out, ls, this.koma(t) - sec.start, 'section', n, sec.layers.length) : measurable(out, ls, Infinity, 'prev', n - 1)));
    // (a line shows 0.05 s before its room is made: those frames are the start of the glide)
    this.propsGliding = this.lyricRects.some((r) => [r.from, r.to].some((x) => x <= t + 0.05 && x > t - GLIDE));
    return out;
  }

  /**
   * QA after a render: where each line actually is while it plays (the type layer's kick and sway, its own drift,
   * wave and beat pulses), at its beats and across its readable time, against the story props placed in that frame,
   * the safe area and the frame edge. The avoidance boxes are measured at rest; this is what checks the motion.
   */
  async motionQa(everyFrame: string[] = []): Promise<MotionCheck[]> {
    const depth = (a: Rect, p: Rect) => Math.max(0, Math.min(Math.min(a.x1, p.x1) - Math.max(a.x0, p.x0), Math.min(a.y1, p.y1) - Math.max(a.y0, p.y0)));
    const out: MotionCheck[] = [];
    for (const { rt, layer } of this.cueLayers) {
      const [from, to0] = layer.readable();
      const to = Number.isFinite(to0) ? to0 : from + 1;
      if (!(to > from)) continue;
      const boxes = this.lyricRects.filter((r) => r.id === rt.cue.id);
      // sampled (beats + five points) to find problems; lines named in everyFrame are checked on every 60 fps frame
      const times = everyFrame.includes(rt.cue.id)
        ? Array.from({ length: Math.floor((to - from) * 60) + 1 }, (_, k) => from + k / 60)
        : [...new Set([...rt.accentTimes.filter((a) => a >= from && a <= to), ...[0.1, 0.3, 0.5, 0.7, 0.9].map((k) => from + (to - from) * k)])];
      const none = { t: 0, px: 0 };
      const worst: MotionCheck = { id: rt.cue.id, text: rt.cue.text, template: rt.shot.template, motion: none, atRest: none, steppedBack: none, gliding: none, decor: none, cards: none, offSafe: none, offFrame: none };
      const keep = <K extends 'motion' | 'atRest' | 'steppedBack' | 'gliding' | 'decor' | 'cards' | 'offSafe' | 'offFrame'>(k: K, px: number, hit: MotionCheck[K]) => {
        if (px > worst[k].px) worst[k] = hit;
      };
      const hit = (t: number, px: number, p: Measured): Hit => ({ t, px, prop: p.ref, opacity: p.opacity, layer: p.layer });
      for (const t of times) {
        await this.renderAt(t);
        if (!layer.group.visible) continue;
        this.textRoot.updateMatrixWorld(true);
        const b = shownBox(layer, true);
        if (b.isEmpty()) continue;
        // (a layer that knows its inked box (a scale composition) is measured by it, not by its glyph pictures' pad)
        const r = layer.inkRect?.() ?? { x0: b.min.x + W / 2, y0: H / 2 - b.max.y, x1: b.max.x + W / 2, y1: H / 2 - b.min.y };
        for (const p of this.placedProps) {
          const px = depth(r, p.r);
          if (!px) continue;
          // gliding: the prop is still on its way out (0.4 s, by design); stepped back: it found no room and faded
          // behind the line (by design, but a half-transparent prop behind the words is still counted); at rest: the
          // measured box already meets it; else the playing line's motion carried it onto a prop that had cleared its box
          const rest = (boxes.find((x) => t >= x.from && t <= x.to) ?? boxes[0])?.rest;
          const cause: OverlapCause = this.propsGliding ? 'gliding' : p.faded ? 'steppedBack' : rest && depth(rest, p.r) > 0 ? 'atRest' : 'motion';
          if (p.group === 'decor') keep('decor', px, { ...hit(t, px, p), cause });
          else keep(cause, px, hit(t, px, p));
        }
        // cards over each other: measured apart from the lyrics (c061: two half-transparent cards, texts through each other)
        const cards = this.placedProps.filter((p) => p.group === 'card');
        cards.forEach((a, i) =>
          cards.slice(i + 1).forEach((b) => {
            const px = depth(a.r, b.r);
            keep('cards', px, { t, px, a: a.ref, b: b.ref, opacity: [a.opacity, b.opacity] });
          }),
        );
        const off = Math.max(0, -r.x0, r.x1 - W, -r.y0, r.y1 - H);
        keep('offFrame', off, { t, px: off });
        const safe = Math.max(0, 48 - r.x0, r.x1 - (W - 48), 40 - r.y0, r.y1 - (H - 40));
        keep('offSafe', safe, { t, px: safe });
      }
      out.push(worst);
    }
    return out;
  }

  /** The value of a placement param (align / position) that puts the lyrics over the calmest third of the frame. */
  private calmSide(shot: Shot, key: string): string {
    const values = ((TEMPLATES[shot.template]?.params[key] as { values?: string[] } | undefined)?.values ?? []).filter((v) => v !== 'auto');
    const side = this.calmestThird((shot.start + shot.end) / 2, shot.asset);
    return [side, side === 'center' ? '' : 'center', values[0]].find((v) => v && values.includes(v)) ?? values[0] ?? 'center';
  }

  /** Which third of the frame (left / center / right) has the least detail in the background at t. */
  private calmestThird(t: number, asset?: string): 'left' | 'center' | 'right' {
    this.probe ??= Object.assign(document.createElement('canvas'), { width: W, height: H }).getContext('2d', { willReadFrequently: true })!;
    const ctx = this.probe;
    ctx.clearRect(0, 0, W, H);
    const img = this.images.get(asset ?? '')?.image as (CanvasImageSource & { width: number; height: number }) | undefined;
    if (this.job.treatment.graphics) {
      const pf = globalThis as { __vjProbe?: boolean };
      pf.__vjProbe = true; // a probe, not a frame (see backdropAt)
      try {
        drawLook(ctx, this.job.treatment.graphics, sectionClock(this.job.treatment.graphics.sections, t), { since: 1, pulse: 0, index: 0 }, (a) => this.images.get(a ?? asset ?? '')?.image as CanvasImageSource | undefined);
      } finally {
        pf.__vjProbe = false;
      }
    } else if (img) {
      const s = Math.max(W / img.width, H / img.height);
      ctx.drawImage(img, (W - img.width * s) / 2, (H - img.height * s) / 2, img.width * s, img.height * s);
    } else return 'center';
    const d = ctx.getImageData(0, 0, W, H).data;
    const L = (x: number, y: number) => {
      const i = (y * W + x) * 4;
      return 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    };
    // detail = mean luminance change between neighbouring samples, over the band the lyrics use (middle 70 %)
    const busy = [0, 0, 0];
    const n = [0, 0, 0];
    for (let y = Math.round(H * 0.15); y < H * 0.85 - 6; y += 6)
      for (let x = 0; x < W - 6; x += 6) {
        const b = Math.min(2, Math.floor((x / W) * 3));
        busy[b] += Math.abs(L(x + 6, y) - L(x, y)) + Math.abs(L(x, y + 6) - L(x, y));
        n[b]++;
      }
    const m = busy.map((v, i) => v / Math.max(1, n[i]));
    // the centre wins unless a side is clearly calmer (a centred line reads best)
    const k = m[1] <= Math.min(m[0], m[2]) * 1.15 ? 1 : m[0] < m[2] ? 0 : 2;
    return (['left', 'center', 'right'] as const)[k];
  }

  /**
   * The look behind a region of the frame (frame px, y down) at t, as played: what an overlay drawn over the frame reads
   * its inks on. On a layered output (the lyric layer alone, transparent) the frame under the overlay is empty, so its
   * inks must come from here, never from the cleared canvas (phase 4d round 6: the echo picked cream on cream over
   * `--layer back`). Undefined without a look.
   */
  groundBehind(t: number, x0: number, y0: number, x1: number, y1: number): { mean: string; mixed: boolean } | undefined {
    const box = new THREE.Box3(new THREE.Vector3(x0 - W / 2, H / 2 - y1, 0), new THREE.Vector3(x1 - W / 2, H / 2 - y0, 0));
    const b = this.backdropAt(t, box, true);
    return b && { mean: b.mean, mixed: b.mixed };
  }

  /**
   * Mean colour of the look behind `box` (frame px, centre origin; default the central lyric band) at t. `asPlayed`
   * places the objects as the frame does (room for every line up, eased), not with room for this box alone; `text`
   * also gives `poor`, the share of the box where that colour reads below 3:1.
   */
  private backdropAt(t: number, box?: THREE.Box3, asPlayed = false, text?: string): { mean: string; grounds: string[]; mixed: boolean; poor: number } | undefined {
    if (!this.job.treatment.graphics) return undefined;
    this.probe ??= Object.assign(document.createElement('canvas'), { width: W, height: H }).getContext('2d', { willReadFrequently: true })!;
    const shot = this.shotAt(t).shot;
    const lyric: Rect | undefined = box && !box.isEmpty() ? { x0: box.min.x + W / 2, y0: H / 2 - box.max.y, x1: box.max.x + W / 2, y1: H / 2 - box.min.y } : undefined;
    // a probe, not a frame: the sprite tracking (--track) must not log it (its boxes mixed into the real frames read
    // as props teleporting between two samples a frame apart)
    const pf = globalThis as { __vjProbe?: boolean };
    pf.__vjProbe = true;
    const [kept, gliding] = [this.placedProps.length, this.propsGliding];
    let placed: Layer[] = [];
    try {
      drawLook(this.probe, this.job.treatment.graphics, sectionClock(this.job.treatment.graphics.sections, t), { since: 1, pulse: 0, index: 0 }, (asset) => this.images.get(asset ?? shot.asset ?? '')?.image as CanvasImageSource | undefined, (ls) => (asPlayed ? (placed = this.makeRoom(ls, t)) : lyric ? avoidAll(ls, lyric) : ls));
    } finally {
      pf.__vjProbe = false;
      // makeRoom logs what it placed for the motion QA: a probe is not a frame
      this.placedProps.length = kept;
      this.propsGliding = gliding;
    }
    const [x0, y0, x1, y1] = box
      ? [box.min.x + W / 2, H / 2 - box.max.y, box.max.x + W / 2, H / 2 - box.min.y].map((v, i) => Math.max(0, Math.min(i % 2 ? H : W, v)))
      : [W * 0.15, H * 0.28, W * 0.85, H * 0.72];
    const img = this.probe.getImageData(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0));
    const d = img.data;
    let r = 0, g = 0, b = 0, n = 0, dark = 0, light = 0;
    const bins = new Map<number, number[]>();
    for (let i = 0; i < d.length; i += 4 * 97) {
      r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
      const k = ((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4);
      let bin = bins.get(k);
      if (!bin) bins.set(k, (bin = [0, 0, 0, 0]));
      bin[0] += d[i]; bin[1] += d[i + 1]; bin[2] += d[i + 2]; bin[3]++;
      const l = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
      if (l < 0.3) dark++;
      else if (l > 0.65) light++;
    }
    const hx = (v: number) => Math.round(v / n).toString(16).padStart(2, '0');
    // only pictures behind the words count (as placed): photos in every mode (a band or full photo makes no room, so
    // it is under the words by design: Utsusemi's band photo under 「交差する道」) and a key hero (see poorShare)
    const photos = placed.flatMap((l) =>
      (l.opacity ?? 1) <= 0.05 ? [] : l.kind === 'photo' ? [photoBox(l)] : l.kind === 'sprite' && l.key && layerRect(l) ? [layerRect(l)!] : [],
    );
    const poor = text ? poorShare(img, Math.floor(x0), Math.floor(y0), text, photos) : 0;
    // mixed: a sizeable share of both dark and light under the line — no single type colour reads everywhere
    // the grounds: each flat colour that covers a fifth of the box (a gradient such as a vignette spreads over many
    // colours and none counts), else the commonest one
    const byShare = [...bins.values()].sort((p, q) => q[3] - p[3]);
    const grounds = (byShare.filter((v) => v[3] >= n * 0.2).length ? byShare.filter((v) => v[3] >= n * 0.2) : byShare.slice(0, 1)).map((v) => '#' + v.slice(0, 3).map((c) => Math.round(c / v[3]).toString(16).padStart(2, '0')).join(''));
    return { mean: `#${hx(r)}${hx(g)}${hx(b)}`, grounds, mixed: dark / n > 0.06 && light / n > 0.06, poor };
  }

  /** A sprite's mean colour over its opaque pixels, as #rrggbb. */
  private spriteTone(asset: string): string | undefined {
    const img = this.images.get(asset)?.image as CanvasImageSource | undefined;
    if (!img) return undefined;
    const c = new OffscreenCanvas(32, 32).getContext('2d', { willReadFrequently: true })!;
    c.drawImage(img, 0, 0, 32, 32);
    const d = c.getImageData(0, 0, 32, 32).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 128) continue;
      r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
    }
    if (!n) return undefined;
    const hx = (v: number) => Math.round(v / n).toString(16).padStart(2, '0');
    return `#${hx(r)}${hx(g)}${hx(b)}`;
  }

  private paletteAt(t: number): Palette {
    const base = this.job.treatment.styleAnchor.palette;
    if (!this.job.treatment.design) return base;
    const stop = colorAt(this.job.treatment.design.colorScript, t);
    const look = this.job.treatment.graphics && sectionAt(this.job.treatment.graphics, sectionClock(this.job.treatment.graphics.sections, t));
    return { ...base, accent: look?.accent ?? stop.accent, glow: look?.accent ?? stop.accent, line: stop.highlight, text: look?.text ?? base.text, background: look?.text ? '#ffffff' : base.background };
  }

  private makeGradient(): THREE.Texture {
    const c = document.createElement('canvas');
    c.width = 960;
    c.height = 540;
    const ctx = c.getContext('2d')!;
    const p = this.job.treatment.styleAnchor.palette;
    const g = ctx.createRadialGradient(480, 220, 40, 480, 270, 620);
    g.addColorStop(0, p.glow);
    g.addColorStop(0.35, p.background);
    g.addColorStop(1, '#000000');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 960, 540);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
}

const hexToRgba = (hex: string, a: number) => `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a})`;

/** Relative luminance 0..1 of a #rrggbb colour (rough: for picking dark or light type). */
const luma = (hex: string) => {
  const n = parseInt(hex.slice(1, 7), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
};
