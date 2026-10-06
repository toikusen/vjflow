// Draws the song's motif (motif.ts) as glowing line art between the background and the lyrics, in the form the
// director chose for each section, ticking with the beats and opening up on drops. Everything is geometry built here.
import * as THREE from 'three';
import { MotifForm, MotifPlan, MotifRender, motifStateAt } from '../motif';
import { clamp01, easeOutCubic, GlyphStyle, hash, makeGlyphs, placeRow } from './glyphs';

const W = 1920;
const H = 1080;
const LINE = 5; // line width in px at 1080p: the motif is a main element, not a faint overlay

type Mat = THREE.MeshBasicMaterial;
/** The plan's line style, set while a MotifLayer builds its geometry. */
let style: MotifRender = 'neon';
const lineMat = () => new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, blending: style === 'neon' ? THREE.AdditiveBlending : THREE.NormalBlending });

/** One drawable unit of the motif at radius 1 (scaled per form); `tick` animates it from song time and beat count. */
interface Unit {
  group: THREE.Group;
  mats: Mat[];
  accents: Mat[];
  tick(t: number, beat: number): void;
}

function ring(r: number, w: number, segments: number, mats: Mat[], start = 0): THREE.Object3D {
  const m = lineMat();
  mats.push(m);
  // flat lines are drawn heavier (print, not light); dotted rings are dashes around the circle
  const ww = style === 'flat' ? w * 1.6 : w;
  if (style !== 'dotted' || segments < 24) return new THREE.Mesh(new THREE.RingGeometry(r - ww, r, segments, 1, start), m);
  const g = new THREE.Group();
  const dashes = Math.max(12, Math.round(r * 48));
  for (let i = 0; i < dashes; i++) g.add(new THREE.Mesh(new THREE.RingGeometry(r - ww, r, 6, 1, start + (i / dashes) * Math.PI * 2, (Math.PI * 2) / dashes / 2), m));
  return g;
}

function bar(len: number, w: number, mats: Mat[]): THREE.Mesh {
  const m = lineMat();
  mats.push(m);
  return new THREE.Mesh(new THREE.PlaneGeometry(w, len), m);
}

/** Clock face: rings, 60 ticks, roman numerals, three hands; the second hand jumps one step per beat. */
function clock(px: number, font: string, detail: boolean, hands = true, variant = 'roman'): Unit {
  const g = new THREE.Group();
  const mats: Mat[] = [];
  const accents: Mat[] = [];
  const w = LINE / px;
  g.add(ring(1, w * 1.4, 128, mats), ring(0.93, w, 128, mats));
  if (variant === 'pocket') {
    // pocket watch: a crown on top and twelve dots instead of numerals
    const crown = bar(0.12, 0.14, mats);
    crown.position.set(0, 1.08, 0);
    g.add(crown);
    for (let i = 0; i < 12; i++) {
      const d = new THREE.Mesh(new THREE.CircleGeometry(i % 3 ? 0.025 : 0.045, 24), lineMat());
      mats.push(d.material);
      const a = (i / 12) * Math.PI * 2;
      d.position.set(Math.sin(a) * 0.8, Math.cos(a) * 0.8, 0);
      g.add(d);
    }
  } else if (detail) {
    for (let i = 0; i < 60; i++) {
      const long = i % 5 === 0;
      const t = bar(long ? 0.07 : 0.035, w * (long ? 1.6 : 1), mats);
      const a = (i / 60) * Math.PI * 2;
      t.position.set(Math.sin(a) * (0.93 - (long ? 0.05 : 0.03)), Math.cos(a) * (0.93 - (long ? 0.05 : 0.03)), 0);
      t.rotation.z = -a;
      g.add(t);
    }
    const romans = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
    const style: GlyphStyle = { family: font, weight: 400, size: Math.max(12, Math.round(px * 0.11)) };
    romans.forEach((r, i) => {
      const gs = makeGlyphs(r, style, 0xffffff, 0);
      const a = (i / 12) * Math.PI * 2;
      const holder = new THREE.Group();
      placeRow(gs, 0, 0, 0);
      gs.forEach((x) => {
        x.mesh.position.set(x.x / px, x.y / px, 0);
        x.mesh.scale.setScalar(1 / px);
        x.mesh.material.blending = THREE.AdditiveBlending;
        mats.push(x.mesh.material);
        holder.add(x.mesh);
      });
      holder.position.set(Math.sin(a) * 0.76, Math.cos(a) * 0.76, 0);
      g.add(holder);
    });
  }
  const hour = bar(0.45, w * 2.2, mats);
  const minute = bar(0.7, w * 1.6, mats);
  const second = bar(0.85, w, accents);
  for (const [h, len] of [[hour, 0.45], [minute, 0.7], [second, 0.85]] as const) {
    h.geometry.translate(0, len / 2 - 0.06, 0);
    // tunnel and burst layers are rings only: scaled-up hands read as light rays and pile up in the centre
    if (hands) g.add(h);
  }
  return {
    group: g, mats, accents,
    tick(t, beat) {
      second.rotation.z = -(beat % 60) * ((Math.PI * 2) / 60);
      minute.rotation.z = -t * 0.05;
      hour.rotation.z = -t * 0.05 / 12 - 1.2;
    },
  };
}

/** Regular polygon, flat-topped, with an inner one. Drawn as one ring (clean corners) unless `asEdges`, where it is
 * built edge by edge so 'shards' can break it apart. */
function polygon(px: number, sides: number, asEdges = false, variant = 'outline'): Unit {
  const g = new THREE.Group();
  const mats: Mat[] = [];
  const accents: Mat[] = [];
  const w = LINE / px;
  const edges = (r: number, width: number, into: Mat[], parent: THREE.Object3D) => {
    for (let i = 0; i < sides; i++) {
      const a = (i + 0.5) * ((Math.PI * 2) / sides) + Math.PI / 2; // edge midpoints, flat top
      const e = bar(2 * r * Math.sin(Math.PI / sides) + width, width, into);
      e.position.set(Math.cos(a) * r * Math.cos(Math.PI / sides), Math.sin(a) * r * Math.cos(Math.PI / sides), 0);
      e.rotation.z = a;
      parent.add(e);
    }
  };
  const start = Math.PI / 2 - Math.PI / sides;
  const inner = new THREE.Group();
  if (asEdges) {
    edges(1, w * 1.4, mats, g);
    edges(0.86, w, accents, inner);
    inner.userData['split'] = true;
  } else {
    // one ring: separate bars overlap at the corners and the overlap shows as a darker/brighter joint
    g.add(ring(1, w * 1.4, sides, mats, start));
    inner.add(ring(0.86, w, sides, accents, start));
  }
  const vertex = (i: number, r = 1) => {
    const a = Math.PI / 2 - Math.PI / sides + (i * Math.PI * 2) / sides; // the ring's own vertices
    return new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r);
  };
  const line = (p: THREE.Vector2, q: THREE.Vector2, width: number, into: Mat[], parent: THREE.Object3D) => {
    const e = bar(p.distanceTo(q), width, into);
    e.position.set((p.x + q.x) / 2, (p.y + q.y) / 2, 0);
    e.rotation.z = Math.atan2(q.y - p.y, q.x - p.x) - Math.PI / 2;
    parent.add(e);
  };
  // star: chords skipping one vertex; facets: spokes from the centre to every vertex
  if (variant === 'star' && sides >= 5) for (let i = 0; i < sides; i++) line(vertex(i, 0.86), vertex(i + 2, 0.86), w, accents, inner);
  if (variant === 'facets') for (let i = 0; i < sides; i++) line(new THREE.Vector2(0, 0), vertex(i, 0.86), w * 0.8, accents, inner);
  g.add(inner);
  return { group: g, mats, accents, tick: (t) => (inner.rotation.z = Math.sin(t * 0.4) * 0.08) };
}

const disc = (r: number, into: Mat[]) => {
  const m = lineMat();
  into.push(m);
  return new THREE.Mesh(new THREE.CircleGeometry(r, 64), m);
};

/** Orbit variants (motif.ts MOTIF_VARIANTS.orbit). */
function orbit(px: number, variant = 'atom'): Unit {
  const g = new THREE.Group();
  const mats: Mat[] = [];
  const accents: Mat[] = [];
  const w = LINE / px;
  if (variant === 'solar') {
    // top-down system: concentric orbits, one planet each at its own speed
    const planets = [0.32, 0.5, 0.68, 0.86, 1].map((r, i) => {
      g.add(ring(r, w, 128, mats));
      const p = disc(0.025 + 0.012 * (i % 3), accents);
      g.add(p);
      return { p, r, speed: 0.9 / (1 + i * 0.7), phase: i * 1.7 };
    });
    g.add(disc(0.1, accents));
    return { group: g, mats, accents, tick: (t) => planets.forEach((x) => x.p.position.set(Math.cos(t * x.speed + x.phase) * x.r, Math.sin(t * x.speed + x.phase) * x.r, 0)) };
  }
  if (variant === 'saturn') {
    g.add(disc(0.34, accents), ring(0.36, w, 96, mats));
    const band = new THREE.Group();
    band.add(ring(0.95, w * 1.2, 128, mats), ring(0.78, w * 5, 128, mats), ring(0.62, w, 128, mats));
    band.scale.y = 0.24;
    g.add(band);
    return { group: g, mats, accents, tick: (t) => (g.rotation.z = -0.35 + Math.sin(t * 0.2) * 0.05) };
  }
  if (variant === 'eclipse') {
    // a bright disc slowly covered by a dark one: a crescent that grows and thins with the song
    const sun = disc(0.6, accents);
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.6, 64), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, depthTest: false, depthWrite: false }));
    g.add(sun, shadow, ring(0.62, w, 128, mats), ring(0.85, w * 0.6, 128, mats));
    return { group: g, mats, accents, tick: (t) => shadow.position.set(Math.cos(t * 0.12) * 0.32, Math.sin(t * 0.09) * 0.08, 0) };
  }
  if (variant === 'binary') {
    const a = disc(0.12, accents);
    const b = disc(0.08, accents);
    const trail = Array.from({ length: 10 }, () => disc(0.02, mats));
    g.add(a, b, ...trail, ring(0.62, w * 0.6, 128, mats));
    return {
      group: g, mats, accents,
      tick(t) {
        a.position.set(Math.cos(t * 0.8) * 0.28, Math.sin(t * 0.8) * 0.28, 0);
        b.position.set(-Math.cos(t * 0.8) * 0.45, -Math.sin(t * 0.8) * 0.45, 0);
        trail.forEach((d, k) => d.position.set(-Math.cos(t * 0.8 - (k + 1) * 0.12) * 0.45, -Math.sin(t * 0.8 - (k + 1) * 0.12) * 0.45, 0));
      },
    };
  }
  // atom: planet on a tilted elliptical orbit with a moon running around it
  const path = ring(1, w * 3, 128, mats);
  path.scale.y = 0.32;
  g.add(path);
  const planet = disc(0.22, accents);
  g.add(planet, ring(0.3, w, 96, mats));
  const moon = disc(0.04, accents);
  g.add(moon);
  return {
    group: g, mats, accents,
    tick(t) {
      moon.position.set(Math.cos(t * 0.6), Math.sin(t * 0.6) * 0.32, 0);
      g.rotation.z = -0.25;
    },
  };
}

export class MotifLayer {
  readonly group = new THREE.Group();
  private readonly forms = new Map<MotifForm, { holder: THREE.Group; units: Unit[] }>();
  private readonly mask: THREE.Mesh<THREE.ShapeGeometry, Mat>;
  /** Rings that rush outward on a 'burst' drop. */
  private readonly burstRings: Unit[];
  /** Iris transition: the next shot opens through the motif's shape. */
  private readonly iris: THREE.Mesh<THREE.ShapeGeometry, Mat>;

  constructor(
    private readonly plan: MotifPlan,
    private readonly beats: number[],
    fonts: { display: string; accent: string },
  ) {
    style = plan.render ?? 'neon';
    const make = (px: number, detail = true, hands = true, edges = false): Unit =>
      plan.kind === 'clock' ? clock(px, fonts.display, detail && plan.variant !== 'minimal', hands, plan.variant) : plan.kind === 'polygon' ? polygon(px, plan.sides, edges, plan.variant) : orbit(px, plan.variant);
    const add = (form: MotifForm, units: Unit[]) => {
      const holder = new THREE.Group();
      units.forEach((u) => holder.add(u.group));
      holder.visible = false;
      this.group.add(holder);
      this.forms.set(form, { holder, units });
    };
    add('center', [make(H * 0.32)]);
    add('bleed', [make(H * 1.15)]);
    add('nested', [0.13, 0.22, 0.32, 0.43, 0.56].map((r) => make(H * r, r > 0.2)));
    add('tunnel', Array.from({ length: 9 }, () => make(H * 0.5, false, false)));
    add('shards', [make(H * 0.32, true, true, true), make(H * 0.32, true, true, true)]);
    add('mask', [make(H * 0.38, false)]);
    // the mask: a dark plate with the motif's outline cut out, so the background only shows through the shape
    const outer = new THREE.Shape([new THREE.Vector2(-W, -H), new THREE.Vector2(W, -H), new THREE.Vector2(W, H), new THREE.Vector2(-W, H)]);
    const hole = new THREE.Path();
    const n = plan.kind === 'polygon' ? plan.sides : 96;
    const r = H * 0.38;
    for (let i = 0; i <= n; i++) {
      const a = Math.PI / 2 - Math.PI / n + (i / n) * Math.PI * 2;
      hole[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r * (plan.kind === 'orbit' ? 0.7 : 1));
    }
    outer.holes.push(hole);
    this.mask = new THREE.Mesh(new THREE.ShapeGeometry(outer), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, depthTest: false, depthWrite: false }));
    this.mask.renderOrder = -1;
    this.group.add(this.mask);
    this.burstRings = Array.from({ length: 5 }, () => make(H * 0.5, false, false));
    this.burstRings.forEach((u) => this.group.add(u.group));
    // the iris: the same cut-out shape, scaled from nothing to past the frame edges at a 'wipe' transition
    this.iris = new THREE.Mesh(new THREE.ShapeGeometry(outer), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, depthTest: false, depthWrite: false }));
    this.iris.renderOrder = -1;
    this.group.add(this.iris);
  }

  private beatIndex(t: number) {
    let lo = 0;
    let hi = this.beats.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.beats[mid] <= t) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  /** `burst` 0..1 comes from the drop/finale moments; `line`/`accent` are the section's colours. */
  update(t: number, burst: number, line: THREE.Color, accent: THREE.Color, rings = 0, iris = -1, textOn = 0) {
    const { cur, prev, k, since } = motifStateAt(this.plan, t);
    const beat = this.beatIndex(t);
    const lastBeat = this.beats[beat - 1] ?? -10;
    const pulse = Math.exp(-(t - lastBeat) * 7);
    for (const [form, { holder, units }] of this.forms) {
      const a = form === cur.form ? easeOutCubic(k) * cur.intensity : form === prev?.form ? (1 - k) * prev.intensity : 0;
      holder.visible = a > 0.002;
      if (!holder.visible) continue;
      const age = form === cur.form ? since : since + 1;
      units.forEach((u, i) => {
        u.tick(t + i * 0.7, beat);
        // while lyrics are up the motif steps back: line art at 40 %, filled shapes (a planet) no brighter than 0.3
        const opacity = a * (0.8 + 0.3 * pulse + 0.4 * burst) * (1 - 0.6 * textOn);
        u.mats.forEach((m) => {
          m.color.copy(line);
          m.opacity = opacity;
        });
        u.accents.forEach((m) => {
          m.color.copy(accent);
          m.opacity = Math.min(1 - 0.92 * textOn, opacity * 1.3); // a filled planet under the lyrics blooms into a glare
        });
        this.place(form, u, i, units.length, t, age, pulse, burst);
        if (this.plan.render === 'ink') {
          // hand-drawn boil: the drawing shifts a little 8 times a second, like redrawn frames
          const step = Math.floor(t * 8);
          u.group.rotation.z += (hash(step, i * 7 + 1) - 0.5) * 0.03;
          u.group.scale.multiplyScalar(1 + (hash(step, i * 7 + 2) - 0.5) * 0.02);
          u.group.position.x += (hash(step, i * 7 + 3) - 0.5) * 6;
        }
      });
    }
    // 'burst' drops: rings rush outward from the centre
    this.burstRings.forEach((u, i) => {
      const phase = clamp01(rings > 0 ? (1 - rings) * 1.4 - i * 0.12 : 1);
      u.group.visible = rings > 0.02 && phase < 1;
      if (!u.group.visible) return;
      u.tick(t, beat);
      u.group.scale.setScalar(H * (0.4 + 2.0 * easeOutCubic(phase)));
      u.group.rotation.z = i * 0.3 + phase;
      u.mats.concat(u.accents).forEach((m) => {
        m.color.copy(i % 2 ? accent : line);
        m.opacity = (1 - phase) * 0.95;
      });
    });
    // iris: a black frame whose motif-shaped hole grows from nothing (iris 0..1, -1 = off)
    this.iris.visible = iris >= 0 && iris < 1;
    if (this.iris.visible) this.iris.scale.setScalar(Math.max(0.001, easeOutCubic(iris) * 3.2));
    const maskA = cur.form === 'mask' ? easeOutCubic(k) * cur.intensity : prev?.form === 'mask' ? (1 - k) * prev.intensity : 0;
    this.mask.visible = maskA > 0.002;
    this.mask.material.opacity = 0.7 * maskA;
  }

  private place(form: MotifForm, u: Unit, i: number, n: number, t: number, age: number, pulse: number, burst: number) {
    const g = u.group;
    const scale = (px: number) => g.scale.setScalar(px);
    g.position.set(0, 0, 0);
    g.rotation.z = 0;
    switch (form) {
      case 'center':
        scale(H * 0.32 * (1 + 0.06 * pulse + 0.12 * burst));
        g.rotation.z = t * 0.12 + 0.05 * pulse;
        break;
      case 'bleed':
        scale(H * 1.15 * (1 + 0.02 * pulse));
        g.position.set(W * 0.28, -H * 0.18, 0);
        g.rotation.z = t * 0.03;
        break;
      case 'nested': {
        const r = [0.13, 0.22, 0.32, 0.43, 0.56][i];
        scale(H * r * (1 + 0.04 * pulse * (i % 2 ? 1 : -1)));
        g.rotation.z = t * (i % 2 ? 0.25 : -0.18) * (1 + i * 0.3);
        break;
      }
      case 'tunnel': {
        // layers move outward continuously (faster on a drop); far layers fade so the tunnel has no edge
        const speed = 0.18 + 0.5 * burst;
        const phase = (((t * speed + i / n) % 1) + 1) % 1;
        const r = H * 0.08 * Math.pow(18, phase);
        scale(r);
        g.rotation.z = phase * 1.2 + i * 0.4;
        // fade at the far end, and near the centre where many small layers would pile up into a white hot spot
        const centre = clamp01((phase - 0.1) / 0.25);
        u.mats.concat(u.accents).forEach((m) => (m.opacity *= Math.sin(Math.PI * phase) * centre * centre));
        break;
      }
      case 'shards': {
        // pieces (numerals, ticks, hands, edges) burst across the whole frame over ~2.5 s, then keep swirling and
        // tumbling for the rest of the section — the full-frame motion reads as a set piece
        scale(H * 0.32);
        g.rotation.z = i * 0.5;
        const burstOut = easeOutCubic(clamp01(age / 2.5));
        const parts = g.children.flatMap((c) => (c.userData['split'] ? c.children : [c]));
        parts.forEach((c, j) => {
          if (c.userData['home'] === undefined) c.userData['home'] = { x: c.position.x, y: c.position.y, r: c.rotation.z };
          const home = c.userData['home'];
          const seed = j + i * 97;
          const ang = Math.atan2(home.y, home.x) + (hash(seed, 3) - 0.5) * 1.6 + age * (0.08 + 0.1 * hash(seed, 11)) * (seed % 2 ? 1 : -1);
          const dist = Math.hypot(home.x, home.y) * (1 - burstOut) + burstOut * (0.6 + 2.8 * hash(seed, 5)) + 0.15 * Math.sin(age * 0.7 + seed);
          c.position.set(Math.cos(ang) * dist * 1.6, Math.sin(ang) * dist, 0);
          c.rotation.z = home.r + burstOut * (hash(seed, 7) - 0.5) * 3 + age * 0.6 * (hash(seed, 9) - 0.5);
        });
        break;
      }
      case 'mask':
        scale(H * 0.38 * (1 + 0.02 * pulse));
        break;
      case 'off':
        break;
    }
  }
}
