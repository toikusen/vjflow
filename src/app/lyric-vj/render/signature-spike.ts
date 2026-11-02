// ponytail: throwaway spike for one 20 s test of 雙截棍 (70.5–90.5 s). The free composer's whole frame stays; two moments
// with hard-coded times and layouts are drawn over it with Canvas2D, and the free lines after them follow the sung times.
// Runs only when a treatment sets signatureSpike; delete it with the test.
// Two moments: the lyric line kicks the signboard apart (c018–c019), and the line itself is the nunchaku (c020–c021).
import * as THREE from 'three';
import type { RenderJob } from './engine';
import { readingSec } from './reading-window';

const [INK, CREAM, GHOST, PRESS] = ['#1B1B1E', '#F6F1E7', '#5E2C27', '#B93222'];

/** Sung times, measured from the vocal stem's onsets against the alternate alignment: song.json's own are flat or evenly spread on c018–c020, c022, c023. */
const SUNG: Record<string, number[]> = {
  c018: [71.57, 71.69, 71.91, 72.03, 72.16, 72.33, 72.5],
  c019: [73.94, 74.06, 74.22, 74.39, 74.55, 74.73, 75.06],
  c020: [76.38, 76.51, 76.63, 76.78, 76.95, 77.11, 77.42, 77.73, 78.02, 78.28],
  c021: [78.74, 78.88, 79.0, 79.14, 79.33, 79.45, 79.77, 80.08, 80.38, 80.65],
  c022: [81.11, 81.23, 81.42, 81.56, 81.69, 81.86, 82.24, 82.46, 82.62, 82.88],
  c023: [83.49, 83.61, 83.76, 83.88, 84.02, 84.2, 84.49, 84.79, 85.12, 85.41],
  c024: [85.83, 86.0, 86.14, 86.27, 86.43, 86.59, 86.87, 87.21, 87.47, 87.77],
  c025: [88.23, 88.39, 88.5, 88.65, 88.84, 88.96, 89.24, 89.56, 89.83, 90.11],
};
const KICK = SUNG['c019'][5]; // 踢
const HA1 = 75.57; // the shout after 踢開
/** The lines the moments draw themselves: the engine keeps them laid out, so the grounds and fine tier stay as in free. */
const IN_MOMENT = new Set(['c018', 'c019', 'c020', 'c021']);
/** The moments give way on the frame the free c022 cuts in (its first drawn frame is 80.933). */
const MOMENT_END = 80.92;
/** An unsung free character's ink: 3:1 on the red, and for the build on the black its own red held back to 3:1. */
const UNSUNG_ON_BLACK = '#B84434';

const clamp = (x: number) => Math.min(1, Math.max(0, x));
const easeOut = (x: number) => 1 - (1 - clamp(x)) ** 3;
const easeIn = (x: number) => clamp(x) ** 2.4;
const mix = (a: number, b: number, k: number) => a + (b - a) * k;
const RAD = Math.PI / 180;

/** A seeded generator: the same paper and tear on every frame and worker. */
const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);

export const isSignature = (job: RenderJob) => !!(job.treatment as { signatureSpike?: boolean }).signatureSpike;

/** The moments' lines for the render's metrics, in place of the engine's (which no longer shows them); computed from the timeline, not measured. */
export function signatureMetrics(job: RenderJob) {
  const windows: [string, string, number, number][] = [
    ['c018', '東亞病夫的招牌', 72.5, KICK],
    ['c019', '已被我一腳踢開 哈!', 73.62, 76.28],
  ];
  // the engine holds a line sung again straight away as one line (repeats, engine.ts): same here, its two rests added
  const repeat = readingSec('快使用雙截棍 哼哼哈兮', job.cues.find((c) => c.id === 'c020')!.start, job.cues.find((c) => c.id === 'c021')!.end);
  const rests = 77.3 - 76.24 + (79.72 - 78.56);
  return [{ id: 'c020', text: '快使用雙截棍 哼哼哈兮', readableFrom: 76.24, readableTo: 79.72, readableSec: rests, requiredSec: repeat, ok: rests >= repeat - 0.05 }, ...windows.map(([id, text, from, to]) => {
    const cue = job.cues.find((c) => c.id === id)!;
    const requiredSec = readingSec(text, cue.start, cue.end);
    return { id, text, readableFrom: from, readableTo: to, readableSec: to - from, requiredSec, ok: to - from >= requiredSec - 0.05 };
  })];
}

export const SIGNATURE_IDS = IN_MOMENT;

interface Line { rt: { cue: { id: string; text: string } }; layer: { group: THREE.Object3D }; twin?: { layer: { group: THREE.Object3D } } }

/** One mesh's own numbers, kept so a change here never builds on itself from frame to frame. */
const base = new WeakMap<THREE.Mesh, { color: THREE.Color; scale?: number; wrote?: number }>();

/** The sung time of each character of a free line, spaces and punctuation taking the character before them. */
function sungTimes(id: string, text: string): (number | undefined)[] {
  let k = 0;
  return [...text].map((ch) => (/[\s"「」?？!！]/.test(ch) ? SUNG[id][Math.max(0, k - 1)] : SUNG[id][k++]));
}

/** After the engine's own update: hides the moments' lines, and takes the free lines' characters from unsung to sung. */
export function signatureCues(lines: Line[], calls: { rt: Line['rt']; group: THREE.Object3D }[], t: number) {
  for (const c of calls) if (IN_MOMENT.has(c.rt.cue.id)) c.group.visible = false;
  for (const { rt, layer, twin } of lines) {
    const id = rt.cue.id;
    if (IN_MOMENT.has(id)) {
      layer.group.visible = false;
      if (twin) twin.layer.group.visible = false;
      continue;
    }
    if (!SUNG[id]) continue;
    // the engine holds c024 through its repeat: the second time round follows c025
    const times = sungTimes(id === 'c024' && t >= 88.14 ? 'c025' : id, rt.cue.text);
    [{ g: layer.group, unsung: GHOST }, ...(twin ? [{ g: twin.layer.group, unsung: UNSUNG_ON_BLACK }] : [])].forEach(({ g, unsung }) => {
      if (!g.visible) return;
      g.traverse((o) => {
        const gl = o.userData['glyph'] as { src?: number; index: number } | undefined;
        if (!gl) return;
        const at = times[gl.src ?? gl.index];
        if (at === undefined) return;
        const m = o as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
        const b = base.get(m) ?? { color: m.material.color.clone() };
        base.set(m, b);
        m.material.color.copy(b.color);
        if (t < at) m.material.color.set(unsung);
        const own = b.wrote !== undefined && m.scale.x === b.wrote ? b.scale! : m.scale.x;
        const pop = t >= at ? 1 + 0.16 * (1 - clamp((t - at) / 0.1)) ** 2 : 1;
        b.scale = own;
        b.wrote = own * pop;
        m.scale.setScalar(b.wrote);
      });
    });
  }
}

type Ctx = CanvasRenderingContext2D;
const canvas = (w: number, h: number) => Object.assign(document.createElement('canvas'), { width: w, height: h });

/** Cream paper with a torn edge, slow mottling, fibres and a thin keyline: the board the lyric is printed on. */
function boardPaper(w: number, h: number): HTMLCanvasElement {
  const c = canvas(w, h);
  const x = c.getContext('2d')!;
  const r = rng(7);
  const edge: [number, number][] = [];
  const tear = (x0: number, y0: number, x1: number, y1: number, n: number) => {
    for (let i = 0; i < n; i++) edge.push([mix(x0, x1, i / n) + (r() - 0.5) * 7, mix(y0, y1, i / n) + (r() - 0.5) * 7]);
  };
  tear(10, 10, w - 10, 10, 90);
  tear(w - 10, 10, w - 10, h - 10, 22);
  tear(w - 10, h - 10, 10, h - 10, 90);
  tear(10, h - 10, 10, 10, 22);
  const trace = () => {
    x.beginPath();
    edge.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b)));
    x.closePath();
  };
  x.fillStyle = '#FFFCF4'; // the torn core shows past the printed face
  trace();
  x.fill();
  x.save();
  x.translate(w / 2, h / 2);
  x.scale(1 - 10 / w, 1 - 10 / h);
  x.translate(-w / 2, -h / 2);
  trace();
  x.restore();
  x.clip();
  x.fillStyle = CREAM;
  x.fillRect(0, 0, w, h);
  for (let i = 0; i < 70; i++) {
    x.fillStyle = `rgba(150,120,90,${0.012 + r() * 0.03})`;
    x.beginPath();
    x.ellipse(r() * w, r() * h, 60 + r() * 220, 30 + r() * 90, r() * 3, 0, 7);
    x.fill();
  }
  x.lineWidth = 1;
  for (let i = 0; i < 900; i++) {
    const [a, b, d] = [r() * w, r() * h, r() * 6.3];
    x.strokeStyle = `rgba(90,70,50,${0.04 + r() * 0.1})`;
    x.beginPath();
    x.moveTo(a, b);
    x.lineTo(a + Math.cos(d) * (6 + r() * 16), b + Math.sin(d) * (6 + r() * 16));
    x.stroke();
  }
  x.strokeStyle = INK;
  x.lineWidth = 3;
  x.strokeRect(30, 30, w - 60, h - 60);
  return c;
}

interface Piece {
  pic: HTMLCanvasElement;
  /** Centre in board px. */
  cx: number;
  cy: number;
  vx: number;
  vy: number;
  spin: number;
}

/** Cuts the printed board along the crack. Every shard carries the paper and ink it was torn from. */
function splitBoard(full: HTMLCanvasElement): Piece[] {
  const [w, h] = [full.width, full.height];
  const crack: [number, number][] = [[626, h], [652, 268], [618, 226], [664, 180], [640, 132], [690, 96], [668, 48], [704, 0]];
  const cut = (poly: [number, number][], core: boolean) => {
    const xs = poly.map((p) => p[0]);
    const ys = poly.map((p) => p[1]);
    const [x0, y0, x1, y1] = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    const pic = canvas(Math.ceil(x1 - x0) + 2, Math.ceil(y1 - y0) + 2);
    const c = pic.getContext('2d')!;
    c.translate(1 - x0, 1 - y0);
    c.beginPath();
    poly.forEach(([a, b], i) => (i ? c.lineTo(a, b) : c.moveTo(a, b)));
    c.closePath();
    c.save();
    c.clip();
    c.drawImage(full, 0, 0);
    c.restore();
    if (core) { // the white core of the tear along the broken edge
      c.globalCompositeOperation = 'source-atop';
      c.strokeStyle = '#FFFEFA';
      c.lineWidth = 7;
      c.beginPath();
      crack.forEach(([a, b], i) => (i ? c.lineTo(a, b) : c.moveTo(a, b)));
      c.stroke();
    }
    return { pic, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  };
  const left = cut([[0, 0], ...[...crack].reverse(), [0, h]], true);
  const right = cut([[w, 0], [w, h], ...crack], true);
  const r = rng(31);
  const shards = crack.slice(0, -1).flatMap(([a, b], i) => {
    const [c, d] = crack[i + 1];
    return [-1, 1].map((side) => {
      const s = 26 + r() * 34;
      const piece = cut([[a, b], [c, d], [c + side * s, d + (r() - 0.5) * 20], [a + side * s * 0.8, b + (r() - 0.5) * 20]], false);
      return { ...piece, vx: side * (240 + r() * 620), vy: -700 - r() * 1100, spin: (r() - 0.5) * 16 };
    });
  });
  return [{ ...left, vx: -1380, vy: -760, spin: -1.2 }, { ...right, vx: 1950, vy: -1120, spin: 2.1 }, ...shards];
}

/** Damped jolts of the whole frame: each one is a sung hit landing. */
const JOLTS: { at: number; dx: number; dy: number; rot: number; zoom: number }[] = [
  { at: KICK, dx: 26, dy: -32, rot: -1.1, zoom: 0.045 },
  { at: HA1, dx: 0, dy: 20, rot: 0.5, zoom: 0.07 },
  ...[0, 2.37].flatMap((d, k) => [
    { at: 77.42 + d, dx: -14, dy: k ? 18 : -18, rot: 0.3, zoom: 0.012 },
    { at: 77.73 + d, dx: -14, dy: k ? -18 : 18, rot: -0.3, zoom: 0.012 },
    { at: 78.02 + d, dx: 44, dy: k ? 22 : -22, rot: 1.2, zoom: 0.06 },
    { at: 78.28 + d, dx: 16, dy: k ? -14 : 14, rot: -0.3, zoom: 0.012 },
  ]),
];
function joltAt(t: number) {
  const out = { dx: 0, dy: 0, rot: 0, zoom: 1 };
  for (const j of JOLTS) {
    const e = t - j.at;
    if (e < 0 || e > 0.6) continue;
    const k = Math.exp(-e * 11) * Math.cos(e * 34);
    out.dx += j.dx * k;
    out.dy += j.dy * k;
    out.rot += j.rot * k;
    out.zoom += j.zoom * Math.exp(-e * 12);
  }
  return out;
}

/** The kicking line's angle: wound back while 已被我一腳 is sung, snapping up into the board on 踢. */
const legAngle = (t: number) => {
  if (t < 73.94) return 0;
  if (t < KICK - 0.1) return mix(0, 8, easeOut((t - 73.94) / 0.6));
  if (t < KICK) return mix(8, -25, easeIn((t - (KICK - 0.1)) / 0.1));
  const e = t - KICK;
  return mix(-25, -13, easeOut(e / 0.62)) - 3 * Math.exp(-e * 8) * Math.sin(e * 26);
};

const SWING = 52; // the tip reaches the edge without leaving the frame, jolt included
/** Pose of the two bars at the sung hits: [time, left bar's swing, right bar's swing], degrees, 0 = lying straight. */
const POSES: [number, number, number][] = (() => {
  const pass = (d: number, up: number): [number, number, number][] => [
    [77.3 + d, 0, 0],
    [77.42 + d, SWING * up, 0], // 哼: the left bar's tip at the top edge
    [77.56 + d, SWING * up, 0],
    [77.73 + d, -SWING * up, 0], // 哼: down at the bottom edge
    [77.86 + d, -SWING * up, 0],
    [78.02 + d, 0, -SWING * up], // 哈: the right bar up, the hardest hit
    [78.14 + d, 0, -SWING * up],
    [78.28 + d, 0, SWING * up], // 兮
    [78.4 + d, 0, SWING * up],
    [78.52 + d, 0, 0],
  ];
  return [...pass(0, 1), ...pass(2.37, -1)];
})();
const barsAt = (t: number) => {
  const i = POSES.findIndex((p) => p[0] > t);
  if (i <= 0) return { left: 0, right: 0 };
  const [a, b] = [POSES[i - 1], POSES[i]];
  const k = easeIn((t - a[0]) / (b[0] - a[0]));
  // the stick recoils off the hit while it holds there
  const held = a[1] === b[1] && a[2] === b[2] && i > 1;
  const e = t - a[0];
  const spring = held ? 0.16 * Math.exp(-e * 18) * Math.cos(e * 46) : 0;
  const p = POSES[Math.max(0, i - 2)];
  return { left: mix(a[1], b[1], k) - (a[1] - p[1]) * spring, right: mix(a[2], b[2], k) - (a[2] - p[2]) * spring };
};

export interface SignatureLayer {
  /** Draws the frame at t into its own canvas: the engine's picture, then the lines. */
  compose(stage: HTMLCanvasElement, t: number): HTMLCanvasElement;
}

/** Loads the faces at the sizes used and prepares the board. */
export async function signatureLayer(job: RenderJob): Promise<SignatureLayer> {
  const family = job.fonts?.family ?? 'Chiron Hei HK';
  await document.fonts.load(`900 100px "${family}"`, '東亞病夫的招牌已被我一腳踢開哈!快使用雙截棍哼兮習武之人切記仁者無敵「」是誰在練太極?風生水起幹什麼');
  const out = canvas(1920, 1080);
  const x = out.getContext('2d')!;

  const glyph = (c: Ctx, ch: string, a: number, b: number, size: number, fill: string, press = 0) => {
    c.font = `900 ${size}px "${family}"`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    if (press) {
      c.fillStyle = PRESS;
      c.fillText(ch, a + press, b + press);
    }
    c.fillStyle = fill;
    c.fillText(ch, a, b);
  };
  /** One sung character: ghost tone until its time, then full ink with a short stamp. */
  const stamp = (ch: string, a: number, b: number, size: number, at: number, t: number, ink: string, ghost: string | null, press = 0, kick = 0.32) => {
    if (t < at) {
      if (ghost) glyph(x, ch, a, b, size, ghost);
      return;
    }
    const s = 1 + kick * (1 - clamp((t - at) / 0.1)) ** 2;
    x.save();
    x.translate(a, b);
    x.scale(s, s);
    glyph(x, ch, 0, 0, size, ink, press);
    x.restore();
  };

  // the board
  const [BW, BH] = [1480, 320];
  const BOARD = { x: 960, y: 292, tilt: -1.4 * RAD };
  const CHAR_X = (i: number) => 740 + (i - 3) * 190;
  const paper = boardPaper(BW, BH);
  const full = canvas(BW, BH);
  const fc = full.getContext('2d')!;
  fc.drawImage(paper, 0, 0);
  [...'東亞病夫的招牌'].forEach((ch, i) => glyph(fc, ch, CHAR_X(i), BH / 2 + 4, 178, INK));
  const pieces = splitBoard(full);

  const shadowed = (draw: () => void, blur = 26, dy = 14) => {
    x.save();
    x.shadowColor = 'rgba(40,5,0,0.42)';
    x.shadowBlur = blur;
    x.shadowOffsetY = dy;
    draw();
    x.restore();
  };

  const drawBoardWhole = (t: number) => {
    const fall = easeOut((t - 71.32) / 0.2);
    const swing = Math.exp(-(t - 71.5) * 5) * Math.sin((t - 71.5) * 15) * (t > 71.5 ? 1.2 : 0);
    x.save();
    x.translate(BOARD.x, mix(-220, BOARD.y, fall));
    x.rotate(BOARD.tilt + swing * RAD);
    x.translate(-BW / 2, -BH / 2);
    shadowed(() => x.drawImage(paper, 0, 0));
    [...'東亞病夫的招牌'].forEach((ch, i) => stamp(ch, CHAR_X(i), BH / 2 + 4, 178, SUNG['c018'][i], t, INK, null, 0, 0.5));
    x.restore();
  };

  const drawPieces = (t: number) => {
    const e = t - KICK;
    for (const [i, p] of pieces.entries()) {
      const main = i < 2;
      for (const k of main ? [0.75, 0.5, 0.25, 0] : [0]) {
        const u = e - (k / 30);
        if (u < 0) continue;
        const px = BOARD.x + (p.cx - BW / 2) + p.vx * u;
        const py = BOARD.y + (p.cy - BH / 2) + p.vy * u + (main ? 900 : 2300) * u * u;
        x.save();
        x.globalAlpha = k ? 0.22 : main ? 1 : clamp((0.5 - e) / 0.2);
        x.translate(px, py);
        x.rotate(BOARD.tilt + p.spin * u);
        const draw = () => x.drawImage(p.pic, -p.pic.width / 2, -p.pic.height / 2);
        if (k === 0 && main) shadowed(draw, 34, 26);
        else draw();
        x.restore();
      }
    }
  };

  /** 已被我一腳踢開 as one straight limb from the hip: the last two characters are the foot. */
  const drawLeg = (t: number, angle: number, alpha = 1) => {
    const entered = easeOut((t - 73.62) / 0.14);
    x.save();
    x.globalAlpha = alpha;
    x.translate(mix(-400, 132, entered), 836);
    x.rotate(angle * RAD);
    let a = 0;
    [...'已被我一腳踢開'].forEach((ch, i) => {
      const size = i < 5 ? 132 : 196;
      a += size / 2 + (i === 5 ? 18 : 3); // room for 踢's stamp beside 腳
      stamp(ch, a, size > 150 ? -30 : 0, size, SUNG['c019'][i], t, INK, GHOST, 7, i < 5 ? 0.32 : 0.08);
      a += size / 2 + 3;
    });
    x.restore();
  };

  const moment1 = (t: number) => {
    const calls = (at: number, a: number, b: number, size = 72) => {
      if (t < at) return;
      [...'幹什麼?'].forEach((ch, i) => stamp(ch, a + i * size * 1.03, b, size, at + i * 0.08, t, CREAM, null, 0, 0.3));
    };
    if (t >= 70.5 && t < 71.32) calls(70.58, 700, 500, 130);
    if (t >= 72.56 && t < 74.73) {
      calls(72.62, 190, 590);
      calls(72.96, 520, 590);
    }
    if (t < KICK) {
      if (t >= 71.32) drawBoardWhole(t);
    } else if (t < KICK + 0.9) drawPieces(t);
    if (t >= 73.62) {
      const dt = 1 / 240;
      if (t >= KICK - 0.1 && t < KICK + 0.04) for (const k of [6, 5, 4, 3, 2, 1]) drawLeg(t, legAngle(t - k * dt), 0.09);
      drawLeg(t, legAngle(t));
    }
    if (t >= HA1) {
      const e = t - HA1;
      const s = 1 + 0.55 * (1 - clamp(e / 0.1)) ** 3; // bigger took the shout off the frame and over 踢開
      x.save();
      x.translate(1370, 310);
      x.rotate(-7 * RAD);
      x.scale(s, s);
      x.font = `900 400px "${family}"`;
      glyph(x, '哈', -70, 0, 400, CREAM, 11);
      glyph(x, '!', 200, 0, 400, CREAM, 11);
      x.restore();
    }
  };

  /** Three characters as one rigid stick swung from the hinge. */
  const drawBar = (chars: string, sung: number[], hingeX: number, hingeY: number, side: -1 | 1, swing: number, t: number) => {
    x.save();
    x.translate(hingeX, hingeY);
    x.rotate(swing * RAD);
    [...chars].forEach((ch, i) => {
      const dist = 58 + ((side < 0 ? 2 - i : i) + 0.5) * 178;
      stamp(ch, side * dist, 0, 172, sung[side < 0 ? i : i + 3], t, INK, GHOST, 7);
    });
    x.restore();
  };

  const moment2 = (t: number) => {
    const second = t >= 78.56;
    const sung = SUNG[second ? 'c021' : 'c020'];
    const [hx, hy] = [960, 540];
    const pose = barsAt(t);
    // three links of chain between the sticks, slack under their ends
    const end = (swing: number, side: number) => [hx + Math.cos(swing * RAD) * side * 56, hy + Math.sin(swing * RAD) * side * 56];
    const [a, b] = [end(pose.left, -1), end(pose.right, 1)];
    const on = (k: number) => [(1 - k) ** 2 * a[0] + 2 * k * (1 - k) * hx + k * k * b[0], (1 - k) ** 2 * a[1] + 2 * k * (1 - k) * (hy + 26) + k * k * b[1]];
    x.strokeStyle = INK;
    x.lineWidth = 6;
    for (const k of [0.16, 0.5, 0.84]) {
      const [c, d] = on(k);
      const [c2, d2] = on(k + 0.05);
      x.beginPath();
      x.ellipse(c, d, 17, 9, Math.atan2(d2 - d, c2 - c), 0, 7);
      x.stroke();
    }
    for (const k of [3, 2, 1]) { // the swing's smear, drawn from where the sticks were a moment ago
      const p = barsAt(t - k / 90);
      if (Math.abs(p.left - pose.left) + Math.abs(p.right - pose.right) < 3) continue;
      x.globalAlpha = 0.2;
      drawBar('快使用', sung, hx, hy, -1, p.left, t);
      drawBar('雙截棍', sung, hx, hy, 1, p.right, t);
      x.globalAlpha = 1;
    }
    drawBar('快使用', sung, hx, hy, -1, pose.left, t);
    drawBar('雙截棍', sung, hx, hy, 1, pose.right, t);
    // each tip that reached the edge chips the sheet's border there, and the chips stay
    const tipX = (side: number) => 960 + side * 589 * Math.cos(SWING * RAD);
    const chips: [number, number, number][] = [0, 1].flatMap((pass) => {
      const s = pass ? -1 : 1;
      const at = SUNG[pass ? 'c021' : 'c020'];
      return [[at[6], tipX(-1), s], [at[7], tipX(-1), -s], [at[8], tipX(1), s], [at[9], tipX(1), -s]] as [number, number, number][];
    });
    chips.forEach(([at, cx, top], i) => {
      if (t < at) return;
      const grow = easeOut((t - at) / 0.06);
      // an LCG's first draws barely differ between close seeds: each chip starts well into its own stream
      const r = rng(1000 + i * 7919);
      for (let k = 0; k < 9; k++) r();
      const y0 = top > 0 ? 0 : 1080;
      const steps = 4 + Math.floor(r() * 5);
      const [left, right] = [50 + r() * 90, 40 + r() * 110];
      const deep = 42 + r() * 74;
      const peak = 0.25 + r() * 0.5;
      const off = (r() - 0.5) * 40;
      const pts: [number, number][] = [[cx + off - left, y0]];
      for (let k = 1; k < steps; k++) {
        const u = k / steps;
        const rise = u < peak ? u / peak : (1 - u) / (1 - peak);
        pts.push([cx + off - left + (left + right) * (u + (r() - 0.5) * 0.09), y0 + deep * grow * top * clamp(rise * (0.62 + r() * 0.6))]);
      }
      pts.push([cx + off + right, y0]);
      shadowed(() => {
        x.fillStyle = '#FFFCF4';
        x.beginPath();
        pts.forEach(([a, b], k) => (k ? x.lineTo(a, b) : x.moveTo(a, b)));
        x.closePath();
        x.fill();
      }, 10, 3 * top);
    });
    // each hit prints its syllable where the tip landed
    const up = second ? -1 : 1;
    const spots: [string, number, number, number][] = [
      ['哼', 280, 540 - 330 * up, 210],
      ['哼', 280, 540 + 330 * up, 210],
      ['哈', 1650, 540 - 290 * up, 320],
      ['兮', 1650, 540 + 330 * up, 210],
    ];
    spots.forEach(([ch, px, py, size], i) => stamp(ch, px, py, size, sung[6 + i], t, i === 2 ? CREAM : INK, null, 8, 0.28));
  };

  return {
    compose(stage, t) {
      const j = joltAt(t);
      x.setTransform(1, 0, 0, 1, 0, 0);
      x.fillStyle = CREAM; // the paper's own border colour, if a jolt pulls the frame off the edge
      x.fillRect(0, 0, 1920, 1080);
      x.translate(960 + j.dx, 540 + j.dy);
      x.rotate(j.rot * RAD);
      x.scale(j.zoom, j.zoom);
      x.translate(-960, -540);
      x.drawImage(stage, 0, 0, 1920, 1080);
      if (t < 76.28) moment1(t);
      else if (t < MOMENT_END) moment2(t);
      return out;
    },
  };
}

