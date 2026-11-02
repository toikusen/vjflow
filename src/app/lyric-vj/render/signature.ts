// Signature moments (signature-moments.ts) drawn over the engine's frame: the composer's whole frame stays, the
// moment's lines are taken off it and drawn here on the song's own paper and inks, keyed to the sung times the
// moment carries. Two forms: a strike (the sung verb acts on the line's paper: tear) and a shape (the line laid
// along the thing it names and moving like it: chain, wave, fall). Runs only when the treatment carries moments.
import type * as THREE from 'three';
import type { RenderJob } from './engine';
import { readingSec } from './reading-window';
import { lastSung, mainOf, SignatureMoment, thinHits } from '../signature-moments';
import { isSungChar, mainIndexes, wordIndex } from '../sung-times';
import { barsAt, barSplit, clamp, crackPath, easeOut, fallAt, hitSide, Jolt, jolt, joltAt, mix, RAD, rng, strikeAngle, SWING, swingPoses, waveAt } from './signature-motion';

type Ctx = CanvasRenderingContext2D;
const [W, H] = [1920, 1080];
const canvas = (w: number, h: number) => Object.assign(document.createElement('canvas'), { width: w, height: h });

export const momentsOf = (job: RenderJob): SignatureMoment[] => (job.treatment as { signature?: SignatureMoment[] }).signature ?? [];
export const isSignature = (job: RenderJob) => momentsOf(job).length > 0;
/** The lines the moments draw themselves: the engine keeps them laid out, so grounds and the fine tier stay as planned. */
export const signatureIds = (job: RenderJob) => new Set(momentsOf(job).flatMap((m) => [...m.cues, ...(m.repeat ? [m.repeat] : [])]));

interface Line { rt: { cue: { id: string; text: string }; showFrom: number; exitAt: number; exitDur: number }; layer: { group: THREE.Object3D }; twin?: { layer: { group: THREE.Object3D } } }
/** When the engine shows and takes off each line, read as it renders: the moment keeps the engine's exits. */
const windows = new Map<string, { show: number; exitAt: number; exitDur: number }>();
let hidden = new Set<string>();

/** After the engine's own update: hides the moments' lines and their calls, and keeps their windows. */
export function signatureCues(lines: Line[], calls: { rt: Line['rt']; group: THREE.Object3D }[]) {
  for (const c of calls) if (hidden.has(c.rt.cue.id)) c.group.visible = false;
  for (const { rt, layer, twin } of lines) {
    if (!hidden.has(rt.cue.id)) continue;
    windows.set(rt.cue.id, { show: rt.showFrom, exitAt: rt.exitAt, exitDur: rt.exitDur });
    layer.group.visible = false;
    if (twin) twin.layer.group.visible = false;
  }
}

/** The engine's exits for the moments' lines when no frame was rendered yet (a metrics-only page): from its own metrics. */
export function signatureWindows(cues: { id: string; goneAt: number; readableFrom: number }[]) {
  for (const c of cues) if (hidden.has(c.id) && !windows.has(c.id)) windows.set(c.id, { show: c.readableFrom, exitAt: c.goneAt - 0.28, exitDur: 0.28 });
}

// ---- colour ----
const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16) / 255);
const lum = (c: string) => { const [r, g, b] = hex(c).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)]; return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const mixHex = (a: string, b: string, k: number) => '#' + hex(a).map((v, i) => Math.round(mix(v, hex(b)[i], k) * 255).toString(16).padStart(2, '0')).join('');

export interface Inks { ink: string; paper: string; accent: string; board: string; boardInk: string; ghost: string; press: string; core: string }
/** The same inks for a line over a dark ground: the paper's colour as the ink (the engine's twin build does the same). */
export function onDark(i: Inks): Inks {
  let ghost = mixHex(i.paper, i.ink, 0.5);
  if (contrast(ghost, i.ink) < 2.5) ghost = mixHex(i.paper, i.ink, 0.28);
  return { ...i, ink: i.paper, ghost, press: contrast(i.accent, i.ink) >= 1.5 ? i.accent : mixHex(i.paper, i.ink, 0.4) };
}
/** Whether the frame is light under a region (x0,y0,x1,y1): the mean luminance of a sparse sample of its pixels. */
export function groundLight(c: Ctx, x0: number, y0: number, x1: number, y1: number): boolean {
  const d = c.getImageData(x0, y0, x1 - x0, y1 - y0).data;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < d.length; i += 4 * 7) {
    sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    n++;
  }
  return sum / Math.max(1, n) > 128;
}
/** The song's inks under t: the kinetic cut's paper and ink, the colour script's accent, else the style anchor's palette. */
export function inksAt(job: RenderJob, t: number): Inks {
  const tr = job.treatment as RenderJob['treatment'] & { design?: { colorScript?: { start: number; shadow?: string; highlight?: string; accent?: string }[] } };
  const secs = tr.graphics?.sections ?? [];
  const sec = [...secs].reverse().find((s) => s.start <= t + 1e-6) ?? secs[0];
  const kin = sec?.layers.find((l) => l.kind === 'kinetic') as { ink?: string; paper?: string } | undefined;
  const script = tr.design?.colorScript ?? [];
  const c = [...script].reverse().find((x) => x.start <= t + 1e-6) ?? script[0];
  const pal = tr.styleAnchor.palette;
  const ink = kin?.ink ?? c?.shadow ?? pal.text;
  const paper = kin?.paper ?? c?.highlight ?? pal.background;
  const accent = c?.accent ?? pal.accent;
  // the board: a lighter sheet than the paper it lies on, the accent when that is the light one (雙截棍: cream on red)
  const board = lum(paper) > 0.5 ? mixHex(paper, '#ffffff', 0.55) : lum(accent) > 0.5 ? accent : mixHex(paper, '#ffffff', 0.85);
  const boardInk = contrast(ink, board) >= 3 ? ink : '#1B1B1E';
  let ghost = mixHex(ink, paper, 0.5);
  if (contrast(ghost, paper) < 2.5) ghost = mixHex(ink, paper, 0.28);
  const press = contrast(accent, paper) >= 1.5 && accent !== ink ? accent : mixHex(ink, paper, 0.4);
  return { ink, paper, accent, board, boardInk, ghost, press, core: mixHex(board, '#ffffff', 0.5) };
}

// ---- paper ----
/** A sheet with a torn edge, slow mottling, fibres and a thin keyline: the board a line is printed on. Grain follows the design. */
function boardPaper(w: number, h: number, inks: Inks, grain: number, torn: boolean, seed: number): HTMLCanvasElement {
  const c = canvas(w, h);
  const x = c.getContext('2d')!;
  const r = rng(seed);
  const edge: [number, number][] = [];
  const j = torn ? 7 : 1.5;
  const tear = (x0: number, y0: number, x1: number, y1: number, n: number) => {
    for (let i = 0; i < n; i++) edge.push([mix(x0, x1, i / n) + (r() - 0.5) * j, mix(y0, y1, i / n) + (r() - 0.5) * j]);
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
  x.fillStyle = inks.core; // the torn core shows past the printed face
  trace();
  x.fill();
  x.save();
  x.translate(w / 2, h / 2);
  x.scale(1 - 10 / w, 1 - 10 / h);
  x.translate(-w / 2, -h / 2);
  trace();
  x.restore();
  x.clip();
  x.fillStyle = inks.board;
  x.fillRect(0, 0, w, h);
  const [ir, ig, ib] = hex(inks.boardInk).map((v) => Math.round(v * 255));
  for (let i = 0; i < 70 * (0.4 + grain); i++) {
    x.fillStyle = `rgba(${ir},${ig},${ib},${0.01 + r() * 0.025})`;
    x.beginPath();
    x.ellipse(r() * w, r() * h, 60 + r() * 220, 30 + r() * 90, r() * 3, 0, 7);
    x.fill();
  }
  x.lineWidth = 1;
  for (let i = 0; i < 900 * (0.3 + grain * 1.4); i++) {
    const [a, b, d] = [r() * w, r() * h, r() * 6.3];
    x.strokeStyle = `rgba(${ir},${ig},${ib},${0.04 + r() * 0.1})`;
    x.beginPath();
    x.moveTo(a, b);
    x.lineTo(a + Math.cos(d) * (6 + r() * 16), b + Math.sin(d) * (6 + r() * 16));
    x.stroke();
  }
  x.strokeStyle = inks.boardInk;
  x.lineWidth = 3;
  x.strokeRect(30, 30, w - 60, h - 60);
  return c;
}

interface Piece { pic: HTMLCanvasElement; cx: number; cy: number; vx: number; vy: number; spin: number }

/** Cuts the printed board along the crack. Every shard carries the paper and ink it was torn from. */
function splitBoard(full: HTMLCanvasElement, crack: [number, number][], core: string, seed: number): Piece[] {
  const [w, h] = [full.width, full.height];
  const cut = (poly: [number, number][], edge: boolean) => {
    const xs = poly.map((p) => p[0]);
    const ys = poly.map((p) => p[1]);
    const [x0, y0, x1, y1] = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    const pic = canvas(Math.max(2, Math.ceil(x1 - x0) + 2), Math.max(2, Math.ceil(y1 - y0) + 2));
    const c = pic.getContext('2d')!;
    c.translate(1 - x0, 1 - y0);
    c.beginPath();
    poly.forEach(([a, b], i) => (i ? c.lineTo(a, b) : c.moveTo(a, b)));
    c.closePath();
    c.save();
    c.clip();
    c.drawImage(full, 0, 0);
    c.restore();
    if (edge) { // the white core of the tear along the broken edge
      c.globalCompositeOperation = 'source-atop';
      c.strokeStyle = core;
      c.lineWidth = 7;
      c.beginPath();
      crack.forEach(([a, b], i) => (i ? c.lineTo(a, b) : c.moveTo(a, b)));
      c.stroke();
    }
    return { pic, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  };
  const left = cut([[0, 0], ...[...crack].reverse(), [0, h]], true);
  const right = cut([[w, 0], [w, h], ...crack], true);
  const r = rng(seed);
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

// ---- text ----
interface Aside { text: string; at: number }
/** A line's drawn parts: its sung characters (asides out), the bracketed asides with when they start, and a trailing shout. */
function partsOf(text: string, times: number[], word: string): { main: { ch: string; at: number; src: number }[]; asides: Aside[]; shout: { ch: string; at: number }[]; wordAt: number; wordLen: number } {
  const chars = [...text];
  const mainIdx = mainIndexes(text);
  const asides: Aside[] = [];
  let open = -1;
  chars.forEach((ch, i) => {
    if (/[（(]/.test(ch)) open = i;
    else if (/[）)]/.test(ch) && open >= 0) {
      const inner = chars.slice(open + 1, i);
      const first = inner.findIndex(isSungChar);
      if (first >= 0) asides.push({ text: inner.join('').trim(), at: times[open + 1 + first] });
      open = -1;
    }
  });
  let main = mainIdx.map((i) => ({ ch: chars[i], at: times[i], src: i }));
  const w0 = wordIndex(text, word);
  // a shout after the word, set off by a space and at most two letters (哈!): drawn as the shout, not on the line
  const tail = main.filter((m) => m.src > w0 + [...word].length - 1);
  const gap = tail.findIndex((m) => /\s/.test(m.ch));
  let shout: { ch: string; at: number }[] = [];
  if (w0 >= 0 && gap >= 0) {
    const after = tail.slice(gap + 1);
    if (after.length && after.filter((m) => isSungChar(m.ch)).length <= 2 && after.some((m) => /[!！]/.test(m.ch))) {
      shout = after.filter((m) => !/\s/.test(m.ch)).map((m) => ({ ch: m.ch, at: m.at }));
      main = main.filter((m) => m.src < after[0].src);
    }
  }
  while (main.length && /\s/.test(main[0].ch)) main.shift();
  while (main.length && /\s/.test(main[main.length - 1].ch)) main.pop();
  const wordAt = main.findIndex((m) => m.src === w0);
  return { main, asides, shout, wordAt, wordLen: [...word].length };
}

export interface SignatureLayer {
  /** Draws the frame at t into its own canvas: the engine's picture, then the moments. */
  compose(stage: HTMLCanvasElement, t: number): HTMLCanvasElement;
  metrics(): Record<string, unknown>[];
}

interface Built { from: number; /** The engine's exits are read as it renders: lazily. */ to: () => number; jolts: Jolt[]; /** Where the line stands, sampled for a dark ground. */ region: [number, number, number, number]; draw: (t: number, light: boolean) => void; metrics: () => Record<string, unknown>[] }

/** Loads the face at the sizes used and prepares every moment's paper. */
export async function signatureLayer(job: RenderJob): Promise<SignatureLayer> {
  const moments = momentsOf(job);
  hidden = signatureIds(job);
  const family = job.fonts?.family ?? (job.treatment.design as { font?: string } | undefined)?.font ?? 'Chiron Hei HK';
  const text = moments.flatMap((m) => Object.keys(m.sung).map((id) => job.cues.find((c) => c.id === id)?.text ?? '')).join('');
  await document.fonts.load(`900 100px "${family}"`, text + '!?');
  const out = canvas(W, H);
  const x = out.getContext('2d')!;
  const design = (job.treatment.design ?? {}) as { paper?: number; grain?: number };
  const grain = clamp((design.paper ?? 0.2) * 1.5 + (design.grain ?? 0.1));
  const cueOf = (id: string) => job.cues.find((c) => c.id === id)!;
  const nextStart = (id: string) => { const i = job.cues.findIndex((c) => c.id === id); return job.cues[i + 1]?.start ?? job.window.end; };
  const exitOf = (id: string) => { const w = windows.get(id); return w ? { at: w.exitAt, dur: w.exitDur } : { at: nextStart(id) - 0.1, dur: 0.1 }; };
  const song = job.cues.length * 7 + Math.round(job.window.end);

  const glyph = (c: Ctx, ch: string, a: number, b: number, size: number, fill: string, press = 0, pressInk = '') => {
    c.font = `900 ${size}px "${family}"`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    if (press) {
      c.fillStyle = pressInk;
      c.fillText(ch, a + press, b + press);
    }
    c.fillStyle = fill;
    c.fillText(ch, a, b);
  };
  /** One sung character: ghost tone until its time, then full ink with a short stamp. */
  const stamp = (ch: string, a: number, b: number, size: number, at: number, t: number, ink: string, ghost: string | null, press = 0, pressInk = '', kick = 0.32) => {
    if (t < at) {
      if (ghost) glyph(x, ch, a, b, size, ghost);
      return;
    }
    const s = 1 + kick * (1 - clamp((t - at) / 0.1)) ** 2;
    x.save();
    x.translate(a, b);
    x.scale(s, s);
    glyph(x, ch, 0, 0, size, ink, press, pressInk);
    x.restore();
  };
  const shadowed = (draw: () => void, blur = 26, dy = 14) => {
    x.save();
    x.shadowColor = 'rgba(40,5,0,0.42)';
    x.shadowBlur = blur;
    x.shadowOffsetY = dy;
    draw();
    x.restore();
  };
  /** The line's exit: 1 while up, falling to 0 over the engine's exit. */
  const alive = (id: string, t: number) => { const e = exitOf(id); return 1 - clamp((t - e.at) / Math.max(0.08, e.dur)); };
  const metric = (id: string, text: string, from: number, to: number, show: number, last: number) => {
    const requiredSec = Math.min(readingSec(mainOf(text), cueOf(id).start, cueOf(id).end), 0.95 * (to - show));
    const readableSec = Math.max(0, to - from);
    return { id, text, readableFrom: +from.toFixed(3), readableTo: +to.toFixed(3), readableSec: +readableSec.toFixed(3), requiredSec: +requiredSec.toFixed(3), ok: readableSec >= requiredSec - 0.05, lingerSec: +(to - last).toFixed(2), lastSung: last, goneAt: +to.toFixed(3), template: 'signature', fitScale: 1, plannedEnter: 'signature', plannedReveal: 'line', enter: 'signature', reveal: 'line', together: false, adjust: [], entranceLost: false };
  };
  /** The calls in brackets, each printed where it is sung, small, in the accent. */
  const drawAsides = (asides: Aside[], t: number, inks: Inks, until: number) => {
    asides.forEach((s, k) => {
      if (t < s.at || t >= until) return;
      [...s.text].forEach((ch, i) => stamp(ch, 190 + k * 330 + i * 72 * 1.03, 590, 72, s.at + i * 0.08, t, inks.accent, null, 0, '', 0.3));
    });
  };

  // ---- strike / tear ----
  const buildStrike = (m: SignatureMoment): Built => {
    const actorId = m.cues[m.cues.length - 1];
    const objectId = m.cues.length === 2 ? m.cues[0] : undefined;
    const actor = cueOf(actorId);
    const parts = partsOf(actor.text, m.sung[actorId], m.word);
    const inks = inksAt(job, m.at);
    const dark = onDark(inks);
    const at = m.at;
    const seed = song + Math.round(at * 10);
    const exit = () => exitOf(actorId);
    // the struck sheet: the line before, or this line's own paper
    const boardText = objectId ? partsOf(cueOf(objectId).text, m.sung[objectId], '').main : parts.main;
    const n = boardText.length;
    const size = Math.max(90, Math.min(178, 1320 / (n * 1.07)));
    const [BW, BH] = [Math.min(1480, Math.round(160 + n * size * 1.07)), Math.round(size * 1.8)];
    const BOARD = { x: 960, y: 292, tilt: -1.4 * RAD };
    const charX = (i: number) => BW / 2 + (i - (n - 1) / 2) * size * 1.07;
    const paper = boardPaper(BW, BH, inks, grain, true, seed);
    const full = canvas(BW, BH);
    const fc = full.getContext('2d')!;
    fc.drawImage(paper, 0, 0);
    boardText.forEach((c, i) => glyph(fc, c.ch, charX(i), BH / 2 + 4, size, inks.boardInk));
    // the striking line as one limb from its hip, the verb its foot; the crack is where the foot lands
    const body = Math.max(72, Math.min(132, 1380 / (parts.main.length + 0.5 * parts.wordLen)));
    const foot = body * 1.48;
    const isVerb = (i: number) => parts.wordAt >= 0 && i >= parts.wordAt && i < parts.wordAt + parts.wordLen;
    const reach = parts.main.reduce((s, _, i) => s + (isVerb(i) ? foot : body) + 6, 0) + 12;
    const tipX = 132 + Math.cos(-25 * RAD) * reach;
    const crackX = objectId ? Math.min(BW * 0.72, Math.max(BW * 0.28, tipX - (BOARD.x - BW / 2))) : charX(parts.wordAt) - size * 0.55;
    const crack = crackPath(crackX, BH, seed + 3);
    const pieces = splitBoard(full, crack, inks.core, seed + 7);
    const firstBoard = boardText[0]?.at ?? at;
    const enterB = firstBoard - 0.25;
    const firstActor = parts.main[0]?.at ?? at;
    const enterA = objectId ? firstActor - 0.3 : enterB;
    const shoutAt = parts.shout[0]?.at;
    const jolts = [jolt(at, 1), ...(shoutAt !== undefined ? [{ at: shoutAt, dx: 0, dy: 20, rot: 0.5, zoom: 0.07 }] : [])];
    const leave = () => exit().at; // one sheet: its halves fly off as the line goes

    const drawBoardWhole = (t: number) => {
      const fall = easeOut((t - enterB) / 0.2);
      const swing = Math.exp(-(t - enterB - 0.18) * 5) * Math.sin((t - enterB - 0.18) * 15) * (t > enterB + 0.18 ? 1.2 : 0);
      x.save();
      x.translate(BOARD.x, mix(-BH - 40, BOARD.y, fall));
      x.rotate(BOARD.tilt + swing * RAD);
      x.translate(-BW / 2, -BH / 2);
      shadowed(() => x.drawImage(paper, 0, 0));
      boardText.forEach((c, i) => stamp(c.ch, charX(i), BH / 2 + 4, size, c.at, t, inks.boardInk, objectId ? null : mixHex(inks.boardInk, inks.board, 0.55), 0, '', 0.5));
      x.restore();
    };
    const drawPieces = (t: number, fly: number, hold: number) => {
      const e = t - fly;
      for (const [i, p] of pieces.entries()) {
        const main = i < 2;
        for (const k of main ? [0.75, 0.5, 0.25, 0] : [0]) {
          const u = e - k / 30;
          if (u < 0) continue;
          const px = BOARD.x + (p.cx - BW / 2) + p.vx * u;
          const py = BOARD.y + (p.cy - BH / 2) + p.vy * u + (main ? 900 : 2300) * u * u;
          x.save();
          x.globalAlpha = (k ? 0.22 : main ? 1 : clamp((0.5 - e) / 0.2)) * hold;
          x.translate(px, py);
          x.rotate(BOARD.tilt + p.spin * u);
          const draw = () => x.drawImage(p.pic, -p.pic.width / 2, -p.pic.height / 2);
          if (k === 0 && main) shadowed(draw, 34, 26);
          else draw();
          x.restore();
        }
      }
    };
    /** One sheet struck: its halves jolt apart and hold, the shards fly; the halves go with the line. */
    const drawRipped = (t: number) => {
      const e = t - at;
      const apart = easeOut(e / 0.18) * 64;
      const gone = t >= leave();
      for (const [i, p] of pieces.entries()) {
        const main = i < 2;
        if (!main) {
          const u = e;
          const px = BOARD.x + (p.cx - BW / 2) + p.vx * u;
          const py = BOARD.y + (p.cy - BH / 2) + p.vy * u + 2300 * u * u;
          x.save();
          x.globalAlpha = clamp((0.5 - e) / 0.2);
          x.translate(px, py);
          x.rotate(BOARD.tilt + p.spin * u);
          x.drawImage(p.pic, -p.pic.width / 2, -p.pic.height / 2);
          x.restore();
          continue;
        }
        const side = i === 0 ? -1 : 1;
        const u = gone ? t - leave() : 0;
        const px = BOARD.x + (p.cx - BW / 2) + side * apart + p.vx * u;
        const py = BOARD.y + (p.cy - BH / 2) + side * 12 * easeOut(e / 0.18) + p.vy * u + 900 * u * u;
        x.save();
        x.translate(px, py);
        x.rotate(BOARD.tilt + side * 2.4 * RAD * easeOut(e / 0.18) - 1.5 * RAD * Math.exp(-e * 6) * Math.sin(e * 30) + p.spin * u);
        shadowed(() => x.drawImage(p.pic, -p.pic.width / 2, -p.pic.height / 2), 34, 26);
        // the struck word takes the press colour as it lands
        x.restore();
      }
    };
    const drawActor = (t: number, angle: number, alpha: number, inks: Inks) => {
      const entered = easeOut((t - enterA) / 0.14);
      x.save();
      x.globalAlpha = alpha;
      x.translate(mix(-reach - 100, 132, entered), 836);
      x.rotate(angle * RAD);
      let a = 0;
      parts.main.forEach((c, i) => {
        const s = isVerb(i) ? foot : body;
        a += s / 2 + (i === parts.wordAt ? 18 : 3);
        stamp(c.ch, a, s > body ? -0.22 * body : 0, s, c.at, t, inks.ink, inks.ghost, 7, inks.press, isVerb(i) ? 0.08 : 0.32);
        a += s / 2 + 3;
      });
      x.restore();
    };
    const drawShout = (t: number) => {
      if (shoutAt === undefined || t < shoutAt) return;
      const e = t - shoutAt;
      const s = 1 + 0.55 * (1 - clamp(e / 0.1)) ** 3;
      x.save();
      x.translate(1370, 310);
      x.rotate(-7 * RAD);
      x.scale(s, s);
      const size = 400;
      let a = -size * 0.25 * (parts.shout.length - 1);
      for (const c of parts.shout) {
        glyph(x, c.ch, a, 0, /[!！?？]/.test(c.ch) ? size : size, inks.accent, 11, inks.ink);
        a += size * 0.68;
      }
      x.restore();
    };
    const from = Math.min(enterB, enterA) - 0.05;
    const to = () => Math.max(exit().at + exit().dur, at + 1) + 0.05;
    return {
      from, to, jolts, region: [120, 700, 1560, 960],
      draw(t, light) {
        const hold = alive(actorId, t);
        const on = light ? inks : dark;
        if (objectId) {
          const obj = cueOf(objectId);
          drawAsides(partsOf(obj.text, m.sung[objectId], '').asides, t, inks, at);
          drawAsides(parts.asides, t, inks, at);
          if (t < at) {
            if (t >= enterB) drawBoardWhole(t);
          } else if (t < at + 0.9) drawPieces(t, at, 1);
          if (t >= enterA) {
            const dt = 1 / 240;
            if (t >= at - 0.1 && t < at + 0.04) for (const k of [6, 5, 4, 3, 2, 1]) drawActor(t, strikeAngle(t - k * dt, enterA, at), 0.09, on);
            drawActor(t, strikeAngle(t, enterA, at), hold, on);
          }
          x.globalAlpha = hold;
          drawShout(t);
          x.globalAlpha = 1;
        } else {
          drawAsides(parts.asides, t, inks, exit().at);
          if (t < at) {
            if (t >= enterB) drawBoardWhole(t);
          } else if (t < leave() + 0.9) drawRipped(t);
          x.globalAlpha = hold;
          drawShout(t);
          x.globalAlpha = 1;
        }
      },
      metrics() {
        const out: Record<string, unknown>[] = [];
        if (objectId) {
          const obj = cueOf(objectId);
          const last = lastSung(obj.text, m.sung[objectId]);
          out.push(metric(objectId, obj.text, last + 0.1, at, enterB, last));
        }
        const last = lastSung(actor.text, m.sung[actorId]);
        out.push(metric(actorId, actor.text, enterA + 0.14, exit().at, enterA, last));
        return out;
      },
    };
  };

  // ---- shape / chain ----
  const buildChain = (m: SignatureMoment): Built => {
    const ids = [m.cues[m.cues.length - 1], ...(m.repeat ? [m.repeat] : [])];
    const inks = inksAt(job, m.at);
    const dark = onDark(inks);
    const seed = song + Math.round(m.at * 10);
    const first = cueOf(ids[0]);
    const parts0 = partsOf(first.text, m.sung[ids[0]], m.word);
    // the bars: the line up to the sung syllables after the named thing (哼哼哈兮), which the swings then print
    const afterWord = parts0.wordAt >= 0 ? parts0.wordAt + parts0.wordLen : parts0.main.length;
    const gapAt = parts0.main.findIndex((c, i) => i >= afterWord && /\s/.test(c.ch));
    const barChars = (gapAt >= 0 ? parts0.main.slice(0, gapAt) : parts0.main).filter((c) => isSungChar(c.ch));
    const split = barSplit(barChars.map((c) => c.ch), barChars.findIndex((c) => c.src === parts0.main[parts0.wordAt]?.src), parts0.wordLen);
    const [leftN, rightN] = [split, barChars.length - split];
    const size = Math.max(84, Math.min(172, 600 / Math.max(leftN, rightN, 1)));
    const [hx, hy] = [960, 540];
    const tipR = 58 + Math.max(leftN, rightN) * size * 1.035;
    const passes = ids.map((id, k) => {
      const cue = cueOf(id);
      const parts = partsOf(cue.text, m.sung[id], m.word);
      const bars = (gapAt >= 0 ? parts.main.slice(0, gapAt) : parts.main).filter((c) => isSungChar(c.ch));
      const tail = (gapAt >= 0 ? parts.main.slice(gapAt + 1) : []).filter((c) => isSungChar(c.ch));
      const lastBar = bars[bars.length - 1]?.at ?? cue.start;
      const exit = () => exitOf(id);
      // no syllables after the thing: the bars swing on the song's beats as the line holds
      const hits = tail.length ? tail.map((c) => c.at) : job.beats.filter((b) => b > lastBar + 0.2 && b < nextStart(id) - 0.4).slice(0, 4);
      const up: 1 | -1 = k % 2 ? -1 : 1;
      return { id, cue, parts, bars, tail, hits, up, poses: swingPoses(hits, up), enter: (parts.main[0]?.at ?? cue.start) - 0.3, exit, lastBar };
    });
    const passAt = (t: number) => passes.filter((p) => t >= p.enter).at(-1) ?? passes[0];
    const jolts = passes.flatMap((p) => thinHits(p.hits).map((h, i) => (p.tail.length ? jolt(h, i === 2 ? 0.6 : 0.25, i % 2 ? -1 : 1) : jolt(h, 0.12))));
    const drawBar = (chars: { ch: string; at: number }[], side: -1 | 1, swing: number, t: number, alpha: number, inks: Inks) => {
      x.save();
      x.globalAlpha = alpha;
      x.translate(hx, hy);
      x.rotate(swing * RAD);
      chars.forEach((c, i) => {
        const dist = 58 + ((side < 0 ? chars.length - 1 - i : i) + 0.5) * size * 1.035;
        stamp(c.ch, side * dist, 0, size, c.at, t, inks.ink, inks.ghost, 7, inks.press);
      });
      x.restore();
    };
    const drawLinks = (pose: { left: number; right: number }, inks: Inks) => {
      const end = (swing: number, side: number) => [hx + Math.cos(swing * RAD) * side * 56, hy + Math.sin(swing * RAD) * side * 56];
      const [a, b] = [end(pose.left, -1), end(pose.right, 1)];
      const on = (k: number) => [(1 - k) ** 2 * a[0] + 2 * k * (1 - k) * hx + k * k * b[0], (1 - k) ** 2 * a[1] + 2 * k * (1 - k) * (hy + 26) + k * k * b[1]];
      x.strokeStyle = inks.ink;
      x.lineWidth = 6;
      for (const k of [0.16, 0.5, 0.84]) {
        const [c, d] = on(k);
        const [c2, d2] = on(k + 0.05);
        x.beginPath();
        x.ellipse(c, d, 17, 9, Math.atan2(d2 - d, c2 - c), 0, 7);
        x.stroke();
      }
    };
    const tipX = (side: number) => hx + side * tipR * Math.cos(SWING * RAD);
    /** Each tip that reached the edge chips the sheet's border there, and the chips stay. */
    const drawChips = (t: number) => {
      const chips = passes.flatMap((p) => p.hits.map((h, i) => { const s = hitSide(i, p.up); return [h, tipX(s.left ? -1 : 1), s.top ? 1 : -1] as [number, number, number]; }));
      chips.forEach(([at, cx, top], i) => {
        if (t < at) return;
        const grow = easeOut((t - at) / 0.06);
        const r = rng(seed + 1000 + i * 7919);
        for (let k = 0; k < 9; k++) r();
        const y0 = top > 0 ? 0 : H;
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
          x.fillStyle = inks.core;
          x.beginPath();
          pts.forEach(([a, b], k) => (k ? x.lineTo(a, b) : x.moveTo(a, b)));
          x.closePath();
          x.fill();
        }, 10, 3 * top);
      });
    };
    const from = passes[0].enter - 0.05;
    const to = () => passes[passes.length - 1].exit().at + passes[passes.length - 1].exit().dur + 0.05;
    return {
      from, to, jolts, region: [300, 380, 1620, 700],
      draw(t, light) {
        const p = passAt(t);
        if (t < p.enter) return;
        const on = light ? inks : dark;
        const hold = alive(p.id, t) * easeOut((t - p.enter) / 0.12);
        drawAsides(p.parts.asides, t, inks, p.exit().at);
        const pose = barsAt(p.poses, t);
        x.globalAlpha = hold;
        drawLinks(pose, on);
        x.globalAlpha = 1;
        const left = p.bars.slice(0, split);
        const right = p.bars.slice(split);
        for (const k of [3, 2, 1]) { // the swing's smear, drawn from where the sticks were a moment ago
          const q = barsAt(p.poses, t - k / 90);
          if (Math.abs(q.left - pose.left) + Math.abs(q.right - pose.right) < 3) continue;
          drawBar(left, -1, q.left, t, 0.2 * hold, on);
          drawBar(right, 1, q.right, t, 0.2 * hold, on);
        }
        drawBar(left, -1, pose.left, t, hold, on);
        drawBar(right, 1, pose.right, t, hold, on);
        if (p.tail.length) drawChips(t);
        // each hit prints its syllable where the tip landed
        x.globalAlpha = hold;
        p.tail.forEach((c, i) => {
          const s = hitSide(i, p.up);
          const big = i === 2;
          stamp(c.ch, s.left ? 280 : 1650, s.top ? 540 - (big ? 290 : 330) : 540 + 330, big ? 320 : 210, c.at, t, big ? on.accent : on.ink, null, 8, big ? on.ink : on.press, 0.28);
        });
        x.globalAlpha = 1;
      },
      metrics: () => passes.map((p) => metric(p.id, p.cue.text, p.enter + 0.12, p.exit().at, p.enter, lastSung(p.cue.text, m.sung[p.id]))),
    };
  };

  // ---- shape / wave and fall ----
  const buildRow = (m: SignatureMoment, kind: 'wave' | 'fall'): Built => {
    const ids = [m.cues[m.cues.length - 1], ...(m.repeat ? [m.repeat] : [])];
    const inks0 = inksAt(job, m.at);
    const dark = onDark(inks0);
    const passes = ids.map((id) => {
      const cue = cueOf(id);
      const parts = partsOf(cue.text, m.sung[id], m.word);
      const main = parts.main;
      const n = main.length;
      const size = Math.max(72, Math.min(150, 1560 / Math.max(1, n)));
      const xs = main.map((_, i) => 960 + (i - (n - 1) / 2) * size * 1.04);
      const exit = () => exitOf(id);
      const last = lastSung(cue.text, m.sung[id]);
      return { id, cue, parts, main, size, xs, exit, last, enter: (main[0]?.at ?? cue.start) - 0.3, isWord: (i: number) => parts.wordAt >= 0 && i >= parts.wordAt && i < parts.wordAt + parts.wordLen };
    });
    const passAt = (t: number) => passes.filter((p) => t >= p.enter).at(-1) ?? passes[0];
    const jolts = kind === 'fall' ? passes.flatMap((p) => (p.parts.wordAt >= 0 ? [jolt(p.main[p.parts.wordAt].at, 0.2)] : [])) : [];
    const from = passes[0].enter - 0.05;
    const to = () => passes[passes.length - 1].exit().at + passes[passes.length - 1].exit().dur + 0.05;
    return {
      from, to, jolts, region: [200, 400, 1720, 680],
      draw(t, light) {
        const p = passAt(t);
        if (t < p.enter) return;
        const inks = light ? inks0 : dark;
        const hold = alive(p.id, t);
        drawAsides(p.parts.asides, t, inks, p.exit().at);
        x.globalAlpha = hold;
        if (kind === 'wave') {
          const amp = Math.max(64, p.size * 0.6);
          const length = Math.max(900, p.main.length * p.size * 0.95);
          // the water under the words
          x.strokeStyle = inks.ink;
          x.lineWidth = 5;
          x.globalAlpha = 0.55 * hold;
          x.beginPath();
          for (let wx = 120; wx <= W - 120; wx += 12) {
            const w = waveAt(wx, t, amp, length, 2.6);
            const wy = 540 + p.size * 0.78 + w.dy;
            wx === 120 ? x.moveTo(wx, wy) : x.lineTo(wx, wy);
          }
          x.stroke();
          x.globalAlpha = hold;
          p.main.forEach((c, i) => {
            if (/\s/.test(c.ch)) return;
            const w = waveAt(p.xs[i], t, amp, length, 2.6);
            x.save();
            x.translate(p.xs[i], 540 + w.dy);
            x.rotate(w.tilt);
            const s = p.isWord(i) ? p.size * 1.18 : p.size;
            stamp(c.ch, 0, 0, s, c.at, t, inks.ink, inks.ghost, 6, inks.press);
            x.restore();
          });
        } else {
          // the unsung characters wait in a row above, ghosted, and drop into the line as they are sung
          const settled = p.last + 0.5;
          const sink = t > settled ? 14 * easeOut((t - settled) / 3) : 0;
          p.main.forEach((c, i) => {
            if (/\s/.test(c.ch)) return;
            const f = fallAt(t, c.at, 300);
            const s = p.isWord(i) ? p.size * 1.18 : p.size;
            x.save();
            x.translate(p.xs[i], 540 + f.dy + (t < c.at ? 0 : sink));
            x.scale(1 / f.squash, f.squash);
            if (t < c.at) glyph(x, c.ch, 0, 0, s, inks.ghost);
            else stamp(c.ch, 0, 0, s, c.at, t, inks.ink, null, 6, inks.press, 0.12);
            x.restore();
            // the landing's spray, in the accent, gone in a breath
            const e = t - c.at;
            if (e >= 0 && e < 0.4) {
              x.fillStyle = inks.accent;
              x.globalAlpha = hold * (1 - e / 0.4);
              for (const d of [-1, 0, 1]) {
                x.beginPath();
                x.arc(p.xs[i] + d * (s * 0.3 + e * 160), 540 + s * 0.55 + sink - e * 90 * (1 - Math.abs(d) * 0.5), 5 - e * 8, 0, 7);
                x.fill();
              }
              x.globalAlpha = hold;
            }
          });
        }
        x.globalAlpha = 1;
      },
      metrics: () => passes.map((p) => metric(p.id, p.cue.text, p.enter + 0.12, p.exit().at, p.enter, p.last)),
    };
  };

  const built = moments.map((m) => (m.form === 'strike' ? buildStrike(m) : m.variant === 'chain' ? buildChain(m) : buildRow(m, m.variant as 'wave' | 'fall')));
  const jolts = thinHits(built.flatMap((b) => b.jolts).map((j) => j.at)).map((at) => built.flatMap((b) => b.jolts).find((j) => j.at === at)!);
  return {
    compose(stage, t) {
      const j = joltAt(jolts, t);
      x.setTransform(1, 0, 0, 1, 0, 0);
      x.fillStyle = inksAt(job, t).paper; // the paper's own colour, if a jolt pulls the frame off the edge
      x.fillRect(0, 0, W, H);
      x.translate(W / 2 + j.dx, H / 2 + j.dy);
      x.rotate(j.rot * RAD);
      x.scale(j.zoom, j.zoom);
      x.translate(-W / 2, -H / 2);
      x.drawImage(stage, 0, 0, W, H);
      for (const b of built) if (t >= b.from && t < b.to()) b.draw(t, groundLight(x, ...b.region));
      return out;
    },
    metrics: () => built.flatMap((b) => b.metrics()),
  };
}
