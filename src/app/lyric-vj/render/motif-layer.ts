// Draws the song's motif (motif.ts) as glowing line art between the background and the lyrics, in the form the
// director chose for each section, ticking with the beats and opening up on drops. Everything is geometry built here.
import * as THREE from 'three';
import { MotifForm, MotifPlan, motifStateAt } from '../motif';
import { clamp01, easeOutCubic, GlyphStyle, hash, makeGlyphs, placeRow } from './glyphs';

const W = 1920;
const H = 1080;
const LINE = 5; // line width in px at 1080p: the motif is a main element, not a faint overlay

type Mat = THREE.MeshBasicMaterial;
const lineMat = () => new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending });

/** One drawable unit of the motif at radius 1 (scaled per form); `tick` animates it from song time and beat count. */
interface Unit {
  group: THREE.Group;
  mats: Mat[];
  accents: Mat[];
  tick(t: number, beat: number): void;
}

function ring(r: number, w: number, segments: number, mats: Mat[], start = 0): THREE.Mesh {
  const m = lineMat();
  mats.push(m);
  return new THREE.Mesh(new THREE.RingGeometry(r - w, r, segments, 1, start), m);
}

function bar(len: number, w: number, mats: Mat[]): THREE.Mesh {
  const m = lineMat();
  mats.push(m);
  return new THREE.Mesh(new THREE.PlaneGeometry(w, len), m);
}

/** Clock face: rings, 60 ticks, roman numerals, three hands; the second hand jumps one step per beat. */
function clock(px: number, font: string, detail: boolean, hands = true): Unit {
  const g = new THREE.Group();
  const mats: Mat[] = [];
  const accents: Mat[] = [];
  const w = LINE / px;
  g.add(ring(1, w * 1.4, 128, mats), ring(0.93, w, 128, mats));
  if (detail) {
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

/** Regular polygon, flat-topped, built edge by edge (so 'shards' breaks it into its edges), with an inner one. */
function polygon(px: number, sides: number): Unit {
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
  edges(1, w * 1.4, mats, g);
  const inner = new THREE.Group();
  edges(0.86, w, accents, inner);
  g.add(inner);
  return { group: g, mats, accents, tick: (t) => (inner.rotation.z = Math.sin(t * 0.4) * 0.08) };
}

/** Planet on a tilted elliptical orbit with a moon running around it. */
function orbit(px: number): Unit {
  const g = new THREE.Group();
  const mats: Mat[] = [];
  const accents: Mat[] = [];
  const w = LINE / px;
  const path = ring(1, w * 3, 128, mats);
  path.scale.y = 0.32;
  g.add(path);
  const planetMat = lineMat();
  accents.push(planetMat);
  const planet = new THREE.Mesh(new THREE.CircleGeometry(0.22, 64), planetMat);
  g.add(planet, ring(0.3, w, 96, mats));
  const moonMat = lineMat();
  accents.push(moonMat);
  const moon = new THREE.Mesh(new THREE.CircleGeometry(0.04, 32), moonMat);
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
    const make = (px: number, detail = true, hands = true): Unit =>
      plan.kind === 'clock' ? clock(px, fonts.display, detail, hands) : plan.kind === 'polygon' ? polygon(px, plan.sides) : orbit(px);
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
    add('shards', [make(H * 0.32)]);
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
  update(t: number, burst: number, line: THREE.Color, accent: THREE.Color, rings = 0, iris = -1) {
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
        const opacity = a * (0.8 + 0.3 * pulse + 0.4 * burst);
        u.mats.forEach((m) => {
          m.color.copy(line);
          m.opacity = opacity;
        });
        u.accents.forEach((m) => {
          m.color.copy(accent);
          m.opacity = Math.min(1, opacity * 1.3);
        });
        this.place(form, u, i, units.length, t, age, pulse, burst);
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
    this.mask.material.opacity = 0.88 * maskA;
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
        // pieces burst outward when the form begins, then keep floating and turning around the centre (never still)
        scale(H * 0.32);
        const burstOut = easeOutCubic(clamp01(age / 1.4));
        const parts = g.children.flatMap((c) => (c.children.length && !(c as THREE.Mesh).isMesh ? c.children : [c]));
        parts.forEach((c, j) => {
          if (c.userData['home'] === undefined) c.userData['home'] = { x: c.position.x, y: c.position.y, r: c.rotation.z };
          const home = c.userData['home'];
          const ang = Math.atan2(home.y, home.x) + (hash(j, 3) - 0.5) * 0.8 + age * 0.15 * (j % 2 ? 1 : -1);
          const dist = Math.hypot(home.x, home.y) + burstOut * (0.5 + 0.6 * hash(j, 5)) + 0.12 * Math.sin(age * 0.9 + j);
          c.position.set(Math.cos(ang) * dist, Math.sin(ang) * dist, 0);
          c.rotation.z = home.r + burstOut * (hash(j, 7) - 0.5) * 2 + age * 0.3 * (hash(j, 9) - 0.5);
        });
        u.mats.concat(u.accents).forEach((m) => (m.opacity *= 1 - 0.3 * burstOut));
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
