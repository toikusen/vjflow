// Kinetic-type backgrounds: the moves of graphic lyric MVs (word walls, rings, tunnels, bars, stacks, splits, rays,
// box tunnels, repeated panels, halftone), drawn from the song's own words in three inks, with a cut-out character
// printed in the same inks. One layer is one cut: the planner (scripts/lyric-vj/typeplan.mts) changes it on the beat,
// so nothing here needs to know about the song; `age` is the time since the cut.

import { drawMove, Env, Flow, kn, MORE, MORE_FX } from './kinetic-more';
import { BoardLayer, drawBoard } from './board';
import { drawStage, StageLayer } from './stage';
import { halftone, lineArt, lineStage } from './print';

type Rgb = string;
export const CORE_FX = ['wall', 'ring', 'tunnel', 'bars', 'stack', 'split', 'rays', 'boxes', 'grid', 'dots'] as const;
/** Every move: the first ten here, the rest in kinetic-more.ts. */
export const KINETIC_FX: readonly string[] = [...CORE_FX, ...MORE_FX];
export type KineticFx = string;

export interface KineticLayer {
  kind: 'kinetic';
  fx: KineticFx;
  /** The song's words this cut is built from (the lyric line itself is drawn by the lyric layout, not here). */
  words: string[];
  ink: Rgb;
  paper: Rgb;
  accent: Rgb;
  /** A cut-out from the sprite library (id without `spr:`), printed in ink and paper. */
  sprite?: string;
  /** Where the character stands; the lyric goes on the other side. */
  side?: 'left' | 'right' | 'center';
  /** Character height as a fraction of the frame (1.6 crops to a close-up from the top). */
  size?: number;
  flip?: boolean;
  /** The paper and ink swapped: a dark cut. */
  dark?: boolean;
  seed?: number;
  font?: string;
  /**
   * A camera move on the cut's background: snap zoom, a roll, upside down, a shake on the hit, a slow tilt; and the
   * film moves (Motion Prompt #25–40, MIT): a pan, a dolly in, a crane up, an orbit, a dolly zoom (the character holds
   * its size while the world behind it rushes), a rack focus, a speed ramp, a freeze, a tilt-shift, and a pull back
   * from a close-up of the character (@ai_cpocoder's shots).
   */
  cam?: KineticCam;
  /** A two-frame hit as the cut lands: black, white or the whole frame inverted. */
  flash?: 'black' | 'white' | 'invert';
  /** How the character is printed: two-ink duotone (default), line art drawn on, or a halftone dot screen. */
  print?: 'duo' | 'line' | 'halftone';
  /** The song's tempo (the ecg move beats with it). */
  bpm?: number;
  /** No lyric is sung over this cut: its words are only texture (faint, outlined). */
  hush?: boolean;
  /** Blueprint labels in the corners: a figure name, the lyric line count, a revision tag. */
  meta?: { fig?: string; line?: string; rev?: string; kind?: DocKind; n?: number; total?: number };
  /** The paper itself: flat (one colour), grain (fibres and specks, like newsprint), gradient (darkening downward). */
  ground?: Ground;
  /** No paper of its own: the cut is laid over a backdrop the section's other layers draw. */
  bare?: boolean;
  /** The song's look of every move (counts, sizes, speeds; see vary in kinetic-more). */
  song?: number;
  /** How lively the song is, 0 calm … 1 lively (from its energy and tempo): the knobs that follow the mood lean with it. */
  mood?: number;
  /**
   * The song's thread: one thing that runs through the whole song in the same corner and grows with it (a candle at
   * 0.2 in the first verse, a fire at 1 in the last chorus). `from` is the level of the cut before, eased into.
   */
  thread?: { mark: ThreadMark; level: number; from: number; sprite?: string; left?: boolean };
  /** Which way the move runs (moves that have a direction; see kinetic-more drawMove), and its variant. */
  flow?: Flow;
  style?: number;
  /** When the cut lands in the song and how long the song is (s): a player's timecode reads the real place. */
  at?: number;
  len?: number;
  /** The director's reading for a measuring move (measure), e.g. "+3 cm"; else one made from the song. */
  label?: string;
  /**
   * The cut's floor plan: the stretch of the frame (x, px) left free by the lines sung over it (freeBand). The
   * character is shrunk and slid to stand inside it, so it never reaches under the lyric.
   */
  room?: [number, number];
  /** What stays through the cut's part of the song (board.ts): evidence filling a board, a place's standing things. */
  board?: BoardLayer;
  /** Where the board may lay its pieces this cut (freeZone); null when the lines fill the frame. */
  zone?: [number, number, number, number] | null;
  /** The song's stage (stage.ts): one place where its story is acted by things, the same through every cut. */
  stage?: StageLayer;
  /** The boxes this cut's lines take: a board's pieces under one of them step back. */
  busy?: [number, number, number, number][];
}
/** Moves whose words are meant to be read (a title card, a chapter card). */
const READ_FX = new Set(['credits', 'chapter']);
const cardInk = new WeakMap<KineticLayer, boolean>();

const lum = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const hexLum = (c: Rgb) => {
  const n = parseInt(c.replace('#', '').slice(0, 6), 16);
  return lum((n >> 16) & 255, (n >> 8) & 255, n & 255);
};

/**
 * Whether the card should print in the darker of its two inks: the frame's middle (where cards sit) sampled at nine
 * points, its mean brightness nearer the lighter ink. Canvas without pixel access (tests) keeps the dark ink.
 */
export function readsDark(ctx: CanvasRenderingContext2D, a: Rgb, b: Rgb): boolean {
  let sum = 0;
  try {
    for (const x of [0.3, 0.5, 0.7]) for (const y of [0.35, 0.5, 0.65]) {
      const d = ctx.getImageData(Math.round(W * x), Math.round(H * y), 1, 1).data;
      sum += lum(d[0], d[1], d[2]);
    }
  } catch {
    return true;
  }
  const under = sum / 9, [la, lb] = [hexLum(a), hexLum(b)];
  const light = Math.max(la, lb), darkInk = Math.min(la, lb);
  return Math.abs(under - light) < Math.abs(under - darkInk);
}

/** Moves that fill the frame with words: under a sung line they are kept faint. */
const PAGE_FX = new Set(['wall', 'marquee', 'ascii', 'tunnel', 'corridor', 'lens']);
export const KINETIC_PRINTS = ['duo', 'line', 'halftone'] as const;
/**
 * What document the video is, when it is one: a blueprint (FIG. and a ruler, LINE n / total), a film slate (SCENE,
 * TAKE, a clapper stripe), a case file (CASE No., a CONFIDENTIAL box, page n / total), a notebook page (No. and DATE
 * lines, a red margin, the page number), a ticket (a perforated edge, the destination, SEAT n).
 */
export type Ground = 'flat' | 'grain' | 'gradient';
export const GROUNDS: Ground[] = ['flat', 'grain', 'gradient'];
export type DocKind = 'blueprint' | 'slate' | 'casefile' | 'notebook' | 'ticket';
export const DOC_KINDS: DocKind[] = ['blueprint', 'slate', 'casefile', 'notebook', 'ticket'];
export const KINETIC_CAMS = ['snap', 'roll', 'flip', 'shake', 'tilt', 'pan', 'dolly', 'crane', 'orbit', 'vertigo', 'rack', 'ramp', 'freeze', 'tiltshift', 'pullback'] as const;
export type KineticCam = (typeof KINETIC_CAMS)[number];
/** The cut's own time as its camera plays it: a speed ramp rushes, then slows; a freeze stops the move once it has landed. */
export const camTime = (cam: KineticCam | undefined, t: number) =>
  cam === 'ramp' ? (t < 0.5 ? t * 2.4 : 1.2 + (t - 0.5) * 0.45) : cam === 'freeze' ? Math.min(t, 0.6) : t;
export const KINETIC_FLASHES = ['black', 'white', 'invert'] as const;

interface Beat { pulse: number; since?: number }
const W = 1920;
const H = 1080;
const hash = (a: number, b = 0) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const ease = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);

let veil: ((ctx: CanvasRenderingContext2D, alpha: number) => void) | undefined;
/** Set by the engine around each frame's look: lays the cut's ground back behind the lines that are up. */
export const setLineVeil = (fn?: (ctx: CanvasRenderingContext2D, alpha: number) => void) => (veil = fn);
export const lineVeil = () => veil;

/** Moves that frame or repeat the cut's figure: without one they draw an empty window. */
export const NEEDS_ART = new Set(['window', 'aura', 'grid', 'glide']);

export const THREAD_MARKS = ['flame', 'star', 'heart', 'moon', 'sun', 'note', 'drop', 'flower'] as const;
export type ThreadMark = (typeof THREAD_MARKS)[number];

/** The thread's mark at (x, y), r across: simple filled shapes in the cut's ink and accent, glowing as it grows. */
function drawThread(ctx: CanvasRenderingContext2D, t: NonNullable<KineticLayer['thread']>, ink: Rgb, accent: Rgb, age: number, pic: (CanvasImageSource & { width: number; height: number }) | undefined, paper: Rgb) {
  const lv = t.from + (t.level - t.from) * Math.min(1, age / 1.2) ** 0.5;
  // a small light at the start, a third of the frame's height at the peak (40 → 190 read as the same size all song)
  // in the top corner away from the lyric (a grown candle sat on a lyric set down the right, 152 s)
  const r = 30 + 230 * lv, x = t.left ? 40 + r * 0.6 : W - 40 - r * 0.6, y = 40 + r * 1.1;
  const flicker = 1 + 0.04 * Math.sin(age * 9) + 0.03 * Math.sin(age * 23);
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = 0.5 + 0.5 * lv;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 10 + 50 * lv;
  if (t.sprite && pic && pic.width) {
    // a paper halo round the picture: in the cut's own inks it sank into a sky of the same colour
    const h = r * 2.2, w = (pic.width / pic.height) * h;
    ctx.shadowColor = paper;
    ctx.shadowBlur = 18;
    const img = duotone(pic, t.sprite, ink, paper);
    for (let i = 0; i < 2; i++) ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
    return;
  }
  ctx.fillStyle = accent;
  ctx.strokeStyle = accent;
  ctx.beginPath();
  switch (t.mark) {
    case 'flame': {
      const f = r * flicker;
      ctx.moveTo(0, f * 0.9);
      ctx.bezierCurveTo(-f * 0.75, f * 0.5, -f * 0.45, -f * 0.2, 0, -f);
      ctx.bezierCurveTo(f * 0.45, -f * 0.2, f * 0.75, f * 0.5, 0, f * 0.9);
      ctx.fill();
      ctx.fillStyle = ink;
      ctx.globalAlpha *= 0.5;
      ctx.beginPath();
      ctx.ellipse(0, f * 0.45, f * 0.22, f * 0.38, 0, 0, Math.PI * 2);
      break;
    }
    case 'star':
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? r * 0.42 : r;
        ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      break;
    case 'heart':
      ctx.moveTo(0, r * 0.8);
      ctx.bezierCurveTo(-r * 1.2, 0, -r * 0.6, -r * 0.9, 0, -r * 0.35);
      ctx.bezierCurveTo(r * 0.6, -r * 0.9, r * 1.2, 0, 0, r * 0.8);
      break;
    case 'moon':
      ctx.arc(0, 0, r, Math.PI * 0.3, Math.PI * 1.7);
      ctx.arc(r * 0.45, 0, r * 0.82, Math.PI * 1.55, Math.PI * 0.45, true);
      break;
    case 'sun':
      ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = Math.max(3, r * 0.08);
      ctx.beginPath();
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + age * 0.2;
        ctx.moveTo(Math.cos(a) * r * 0.72, Math.sin(a) * r * 0.72);
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.stroke();
      ctx.restore();
      return;
    case 'note':
      ctx.ellipse(-r * 0.2, r * 0.5, r * 0.34, r * 0.24, -0.4, 0, Math.PI * 2);
      ctx.rect(r * 0.08, -r * 0.9, r * 0.1, r * 1.4);
      break;
    case 'drop':
      ctx.moveTo(0, -r);
      ctx.bezierCurveTo(r * 0.7, -r * 0.1, r * 0.7, r * 0.8, 0, r * 0.8);
      ctx.bezierCurveTo(-r * 0.7, r * 0.8, -r * 0.7, -r * 0.1, 0, -r);
      break;
    case 'flower':
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + age * 0.1;
        ctx.moveTo(Math.cos(a) * r * 0.5 + r * 0.32, Math.sin(a) * r * 0.5);
        ctx.arc(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5, r * 0.32, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.fillStyle = ink;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.22, 0, Math.PI * 2);
      break;
  }
  ctx.fill();
  ctx.restore();
}

/** The sprite in two inks: dark parts in ink, light parts in paper, alpha kept (a full-colour drawing would break the print). */
const tinted = new Map<string, CanvasImageSource>();
function duotone(pic: CanvasImageSource & { width: number; height: number }, key: string, ink: Rgb, paper: Rgb): CanvasImageSource {
  const k = `${key}|${ink}|${paper}`;
  const hit = tinted.get(k);
  if (hit) return hit;
  if (typeof document === 'undefined') return pic;
  const c = document.createElement('canvas');
  c.width = pic.width;
  c.height = pic.height;
  const g = c.getContext('2d', { willReadFrequently: true });
  if (!g) return pic;
  g.drawImage(pic, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height);
  const [a, b] = [rgb(ink), rgb(paper)];
  for (let i = 0; i < d.data.length; i += 4) {
    const l = (0.3 * d.data[i] + 0.59 * d.data[i + 1] + 0.11 * d.data[i + 2]) / 255;
    // a print, not a tint: the uniform, hair and line work go to ink, skin and shirt to paper (a navy uniform at
    // luminance 0.4 stayed a pale blue with a softer ramp)
    const u = Math.min(1, Math.max(0, (l - 0.45) / 0.3));
    for (let j = 0; j < 3; j++) d.data[i + j] = a[j] + (b[j] - a[j]) * u;
  }
  g.putImageData(d, 0, 0);
  tinted.set(k, c);
  return c;
}
const rgb = (h: Rgb) => {
  const x = h.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16) || 0);
};

/** Draws one kinetic cut. */
export function drawKinetic(ctx: CanvasRenderingContext2D, l: KineticLayer, clock: number, beat: Beat, image: (asset?: string) => CanvasImageSource | undefined, now = (l.at ?? 0) + clock) {
  const age = camTime(l.cam, clock);
  // a card meant to be read (a title, a chapter) laid bare over someone else's picture takes the ink that reads on what
  // is actually under it: a light title set for its own dark ground vanished on 世界のつづき's cream coast (2026-10-22)
  // decided once a card, from its first frame (re-deciding every frame flickered as the picture under it moved)
  if (l.bare && READ_FX.has(l.fx) && !cardInk.has(l)) cardInk.set(l, readsDark(ctx, l.ink, l.paper) === hexLum(l.ink) > hexLum(l.paper));
  const dark = cardInk.get(l) ?? l.dark;
  const paper = dark ? l.ink : l.paper;
  const ink = dark ? l.paper : l.ink;
  const seed = l.seed ?? 1;
  const words = l.words.length ? l.words : ['・'];
  const font = l.font ?? '"M PLUS Rounded 1c", "Hiragino Sans", sans-serif';
  const side = l.side ?? 'right';
  // the figure's centre, and the graphic's centre on the same side so the lyric keeps the other
  // near the edge: at 0.3 / 0.7 a full figure stood under the middle of a stair lyric
  const fx = side === 'left' ? W * 0.22 : side === 'right' ? W * 0.78 : W / 2;
  const word = (i: number) => words[i % words.length];
  const txt = (s: string, x: number, y: number, size: number, color: Rgb, alpha = 1, outline = false) => {
    // a cut given no words keeps a placeholder so the moves can still count and repeat: drawn, it was a big ring or dot
    // meaning nothing (an outlined ・ by every ECG)
    if (!s.trim() || s === '・') return;
    // nobody sings over a hushed cut: its words stay a faint outlined texture, never read as a lyric line
    if (l.hush) [alpha, outline] = [Math.min(alpha, 0.12), true];
    // a page of words under a line being sung stays texture: the sung line is always the one read first (我愛台妹's
    // party wall competed with 把手放在空中甩, 2026-10-21)
    else if (l.room && PAGE_FX.has(l.fx)) alpha = Math.min(alpha, 0.28);
    ctx.globalAlpha = alpha;
    ctx.font = `900 ${size}px ${font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (outline) {
      ctx.lineWidth = Math.max(2, size / 28);
      ctx.strokeStyle = color;
      ctx.strokeText(s, x, y);
    } else {
      ctx.fillStyle = color;
      ctx.fillText(s, x, y);
    }
    ctx.globalAlpha = 1;
  };
  ctx.save();
  if (!l.bare) drawGround(ctx, l.ground, paper, ink, seed);
  const k = ease(age / 0.18);
  // a dolly zoom pushes the world in; the character is drawn back at its own size (it holds while the world rushes)
  const zoom = 1 + 0.35 * ease(clock / 2.2);
  // the camera on the background (the lyric stays level above it)
  if (l.cam) {
    ctx.translate(W / 2, H / 2);
    if (l.cam === 'snap') ctx.scale(1 + 0.3 * (1 - ease(age / 0.25)), 1 + 0.3 * (1 - ease(age / 0.25)));
    if (l.cam === 'roll') ctx.rotate(0.4 * (1 - ease(age / 0.45)) * (seed % 2 ? 1 : -1));
    if (l.cam === 'flip') ctx.rotate(Math.PI);
    if (l.cam === 'shake') ctx.translate((hash(seed, Math.floor(age * 30)) - 0.5) * 30 * Math.max(0, 1 - age / 0.35), (hash(seed + 1, Math.floor(age * 30)) - 0.5) * 30 * Math.max(0, 1 - age / 0.35));
    if (l.cam === 'tilt') ctx.rotate(0.03 * age * (seed % 2 ? 1 : -1));
    const dir = seed % 2 ? 1 : -1;
    // the film moves run slowly over the whole cut, framed a little wide so the paper's edge never shows
    if (l.cam === 'pan') (ctx.scale(1.08, 1.08), ctx.translate(dir * Math.min(70, -50 + clock * 30), 0));
    if (l.cam === 'dolly') ctx.scale(1 + Math.min(0.14, clock * 0.035), 1 + Math.min(0.14, clock * 0.035));
    if (l.cam === 'crane') (ctx.scale(1.1, 1.1), ctx.translate(0, Math.min(90, -40 + clock * 26)));
    if (l.cam === 'orbit') (ctx.scale(1.12, 1.12), ctx.rotate(0.035 * Math.sin(clock * 0.7) * dir), ctx.translate(70 * Math.sin(clock * 0.7) * dir, 0));
    if (l.cam === 'vertigo') ctx.scale(zoom, zoom);
    if (l.cam === 'pullback') {
      // from a close-up of the character (or the middle) back to the whole frame over the cut's first 1.6 s
      const q = 1 + 1.3 * (1 - ease(clock / 1.6));
      ctx.translate(fx - W / 2, H * 0.12);
      ctx.scale(q, q);
      ctx.translate(-(fx - W / 2), -H * 0.12);
    }
    ctx.translate(-W / 2, -H / 2);
  }
  // a rack focus: the background comes into focus as the cut lands (the character drawn sharp over it)
  if (l.cam === 'rack') ctx.filter = `blur(${(9 * (1 - ease(clock / 0.7))).toFixed(1)}px)`;
  // the character printed in the cut's inks, sized and placed before the move (some moves print it themselves)
  const pic = l.sprite ? (image(`spr:${l.sprite}`) as (CanvasImageSource & { width: number; height: number }) | undefined) : undefined;
  const size = l.size ?? 0.85;
  const look = pic && pic.width ? (l.print === 'line' ? lineArt(pic, l.sprite!, ink)?.[lineStage(age)] : l.print === 'halftone' ? halftone(pic, l.sprite!, ink, paper) : undefined) : undefined;
  const printed = pic && pic.width ? { img: look ?? duotone(pic, l.sprite!, ink, paper), night: () => duotone(pic, l.sprite!, paper, ink), w: (pic.width / pic.height) * H * size, h: H * size, y: size > 1 ? (H * size) / 2 - H * 0.08 : H - (H * size) / 2 } : undefined;
  let own = false;
  switch (l.fx) {
    case 'wall': {
      // rows of the song's words, alternate rows drifting the other way
      const rows = kn(l, 'wall.rows'), rowH = (H - 40) / rows, drift = kn(l, 'wall.speed');
      for (let r = 0; r < rows; r++) {
        const y = 50 + r * rowH;
        const dir = r % 2 ? 1 : -1;
        let x = -400 + ((age * drift * dir + hash(r, seed) * 400) % 400);
        for (let i = 0; x < W + 400; i++) {
          const s = word(r * 3 + i);
          const size = 44 + (hash(r * 9 + i, seed) > 0.8 ? 26 : 0);
          const hl = hash(r * 7 + i, seed + 1) > 0.9;
          ctx.font = `900 ${size}px ${font}`;
          const w = ctx.measureText(s).width;
          if (hl) {
            ctx.fillStyle = l.accent;
            ctx.fillRect(x, y - size * 0.6, w + 20, size * 1.2);
          }
          txt(s, x + w / 2 + 10, y, size, hl ? paper : ink, hl ? 1 : 0.35);
          x += w + 60;
        }
      }
      break;
    }
    case 'ring': {
      // two rings of words turning against each other around the figure
      const r0 = kn(l, 'ring.r'), spin = kn(l, 'ring.speed');
      for (const [r, dir, size] of [[r0, 1, 54], [r0 + 130, -1, 40]] as const) {
        const s = Array.from({ length: 6 }, (_, i) => word(i)).join(' ・ ') + ' ・ ';
        const chars = [...s];
        const turn = age * spin * dir + seed;
        for (let i = 0; i < chars.length; i++) {
          const a = turn + (i / chars.length) * Math.PI * 2;
          ctx.save();
          ctx.translate(fx + Math.cos(a) * r * k, H / 2 + Math.sin(a) * r * k);
          ctx.rotate(a + Math.PI / 2);
          txt(chars[i], 0, 0, size, r === r0 ? ink : l.accent);
          ctx.restore();
        }
      }
      break;
    }
    case 'tunnel': {
      // the words flying out of the centre, nearer ones bigger
      for (let i = 0, n = kn(l, 'tunnel.n'), sp = kn(l, 'tunnel.speed'); i < n; i++) {
        const z = (i / n + age * sp) % 1;
        const s = 0.15 + z * z * 2.2;
        const a = hash(i, seed) * Math.PI * 2;
        const x = W / 2 + Math.cos(a) * z * 900;
        const y = H / 2 + Math.sin(a) * z * 520;
        txt(word(i), x, y, 60 * s, i % 4 ? ink : l.accent, Math.min(1, z * 3) * (1 - z * 0.4));
      }
      break;
    }
    case 'bars': {
      // a level meter across the middle that answers the beat
      const n = kn(l, 'bars.n'), jump = kn(l, 'bars.h');
      for (let i = 0; i < n; i++) {
        const x = (i + 0.5) * (W / n);
        const h = (0.15 + hash(i, seed + Math.floor(age * 8)) * jump + beat.pulse * 0.3) * H * 0.5 * k;
        ctx.fillStyle = i % 5 === 0 ? l.accent : ink;
        ctx.fillRect(x - W / n / 3, H / 2 - h / 2, (W / n) / 1.6, h);
      }
      break;
    }
    case 'stack': {
      // one word repeated down the frame, outlined echoes trailing the solid one
      const s = word(0), n = kn(l, 'stack.n'), rowH = (H - 120) / n, mid = Math.floor(n / 2);
      for (let i = 0; i < n; i++) {
        const y = 60 + rowH / 2 + i * rowH;
        const off = (1 - k) * (i % 2 ? 1 : -1) * W * 0.6;
        txt(s, W / 2 + off + (i % 2 ? 40 : -40), y, Math.min(170, rowH * 0.95), i === mid ? l.accent : ink, i === mid ? 1 : 0.9, i !== mid);
      }
      break;
    }
    case 'split': {
      // a diagonal cut wiping in: one side accent, a thick ink band on the seam
      const x0 = W * kn(l, 'split.at'), slant = kn(l, 'split.slant');
      ctx.fillStyle = l.accent;
      ctx.beginPath();
      ctx.moveTo(x0 + slant, 0);
      ctx.lineTo(W, 0);
      ctx.lineTo(W, H * k);
      ctx.lineTo(x0 - slant + (1 - k) * slant * 2, H * k);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = ink;
      ctx.lineWidth = 34;
      ctx.beginPath();
      ctx.moveTo(x0 + slant, 0);
      ctx.lineTo(x0 + slant - 2 * slant * k, H * k);
      ctx.stroke();
      txt(word(0), W * 0.78, H * 0.82, 120, paper, 0.95);
      break;
    }
    case 'rays': {
      // speed lines from the figure, with a dot ring
      // this song's burst: denser or sparser, thinner or bolder spokes (vary, kinetic-more)
      const n = kn(l, 'rays.n'), w = kn(l, 'rays.w');
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + seed;
        const r0 = 260 + hash(i, seed) * 120;
        ctx.strokeStyle = i % 9 === 0 ? l.accent : ink;
        ctx.lineWidth = w + hash(i, seed + 2) * w * 1.5;
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.moveTo(fx + Math.cos(a) * r0, H / 2 + Math.sin(a) * r0);
        ctx.lineTo(fx + Math.cos(a) * (r0 + 900 * k), H / 2 + Math.sin(a) * (r0 + 900 * k));
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      break;
    }
    case 'boxes': {
      // squares nesting inward, the nearest leaving the frame
      for (let i = 0, n = kn(l, 'boxes.n'), sp = kn(l, 'boxes.speed'); i < n; i++) {
        const z = (i / n + age * sp) % 1;
        const s = 60 + z * z * 2200;
        ctx.save();
        ctx.translate(fx, H / 2);
        ctx.rotate(Math.PI / 4 * (seed % 2) + z * 0.2);
        ctx.strokeStyle = i % 3 ? ink : l.accent;
        ctx.lineWidth = 6 + z * 18;
        ctx.strokeRect(-s / 2, -s / 2, s, s);
        ctx.restore();
      }
      break;
    }
    case 'grid': {
      // panels in alternating inks; the character repeats in them (drawn below)
      const cols = kn(l, 'grid.cols');
      for (let i = 0; i < cols; i++) {
        ctx.fillStyle = i % 2 ? l.accent : ink;
        ctx.globalAlpha = i % 2 ? 1 : 0.12;
        const w = W / cols;
        ctx.fillRect(i * w + 12, 12 + (1 - k) * H * (i % 2 ? 1 : -1), w - 24, H - 24);
      }
      ctx.globalAlpha = 1;
      break;
    }
    case 'dots': {
      // a halftone field, dots growing toward one corner
      const c = kn(l, 'dots.cell');
      for (let y = 0, row = 0; y < H; y += c, row++)
        for (let x = row % 2 ? c / 2 : 0; x < W; x += c) {
          const r = c * 0.39 * Math.min(1, (x / W + y / H) / 1.4) * k;
          ctx.fillStyle = ink;
          ctx.globalAlpha = 0.3;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        }
      ctx.globalAlpha = 1;
      txt(word(0), W * 0.5, H * 0.5, 260, l.accent, 0.9, true);
      break;
    }
    default: {
      const move = MORE[l.fx];
      const env: Env = { ctx, age, k, pulse: beat.pulse, since: beat.since ?? 0, bpm: l.bpm ?? 120, ink, paper, accent: l.accent, word, txt, cx: fx, seed, art: printed, W, H, style: l.style ?? 0, at: l.at, len: l.len, label: l.label, song: l.song, mood: l.mood, room: l.room, count: new Set(l.words.filter((w) => w.trim() && w !== '・')).size || undefined };
      own = drawMove(move, env, l.flow);
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      ctx.globalCompositeOperation = 'source-over';
    }
  }
  if (l.cam === 'rack') ctx.filter = 'none';
  // behind the lines up, a keyline of the cut's ground round each letter; again over the character (unkeyed, dark type
  // sank into a dark figure)
  veil?.(ctx, 1);
  // the character, printed in the cut's inks: it pops in, then holds still until the next cut
  if (printed && !own) {
    const { img: art, w, h } = printed;
    const pop = 1 + (1 - k) * 0.06;
    const cols = l.fx === 'grid' ? kn(l, 'grid.cols') : 1;
    // the floor plan: one character shrinks and slides into the room the lyric leaves it (feet kept on the floor)
    const fit = l.fx !== 'grid' && l.room && l.room[1] > l.room[0] ? fitInRoom(l.room, w, fx) : { s: 1, x: fx };
    const copies = l.fx === 'grid' ? Array.from({ length: cols }, (_, i) => ((i + 0.5) / cols) * W) : [fit.x];
    for (const cx of copies) {
      ctx.save();
      if (l.cam === 'vertigo') (ctx.translate(W / 2, H / 2), ctx.scale(1 / zoom, 1 / zoom), ctx.translate(-W / 2, -H / 2));
      ctx.translate(cx, size > 1 ? (h * fit.s) / 2 - H * 0.08 : H - (h * fit.s) / 2);
      // follow-through (Motion Prompt #122): the figure lands and rocks a little before it settles
      ctx.rotate(0.05 * Math.exp(-5 * clock) * Math.sin(13 * clock) * (seed % 2 ? 1 : -1));
      ctx.scale(pop * fit.s * (l.flip ? -1 : 1), pop * fit.s);
      const s = l.fx === 'grid' ? Math.min(1, W / cols / w) : 1;
      ctx.drawImage(art, (-w / 2) * s, (-h / 2) * s, w * s, h * s);
      ctx.restore();
    }
  }
  if (printed && !own) veil?.(ctx, 1);
  ctx.restore();
  // a tilt-shift: the top and bottom of the frame drawn again out of focus, the middle band sharp (a miniature world)
  if (l.cam === 'tiltshift' && ctx.canvas) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (const [y, h] of [[0, H * 0.28], [H * 0.72, H * 0.28]]) {
      ctx.filter = 'blur(7px)';
      ctx.drawImage(ctx.canvas, 0, y, W, h, 0, y, W, h);
    }
    ctx.filter = 'none';
    ctx.restore();
  }
  if (l.thread) drawThread(ctx, l.thread, ink, l.accent, clock, l.thread.sprite ? (image(`spr:${l.thread.sprite}`) as (CanvasImageSource & { width: number; height: number }) | undefined) : undefined, paper);
  if (l.meta) drawMeta(ctx, l.meta, ink, l.accent, clock);
  if (l.stage) {
    const st = l.stage;
    drawStage(st, { ctx, t: now, W, H, busy: l.busy, art: (id) => {
      const p = image(`spr:${id}`) as (CanvasImageSource & { width: number; height: number }) | undefined;
      return p && p.width ? duotone(p, id, st.ink, st.paper) : undefined;
    } });
  }
  // the board is the part's place, not the cut's: its own inks, no camera of the cut, and over the cut's move (a palette
  // swap and a push at every cut read as the whole frame changing, blind viewers saw 1 of 12 events; a full-page panels
  // cut hid it and read as a reset, 2026-10-22). The move changes behind it, the world stays.
  if (l.board) {
    const [bi, bp, ba] = [l.board.ink ?? ink, l.board.paper ?? paper, l.board.accent ?? l.accent];
    drawBoard(l.board, { ctx, t: now, W, H, ink: bi, paper: bp, accent: ba, room: l.room, zone: l.zone, busy: l.busy, seed: l.board.seed ?? seed, art: (id) => {
      const p = image(`spr:${id}`) as (CanvasImageSource & { width: number; height: number }) | undefined;
      return p && p.width ? duotone(p, id, bi, bp) : undefined;
    }, photo: (id) => image(id) });
  }
  // the hit as the cut lands: two frames of black or white, or the frame inverted
  if (l.flash && clock < 0.08) {
    ctx.save();
    if (l.flash === 'invert') {
      ctx.globalCompositeOperation = 'difference';
      ctx.fillStyle = '#ffffff';
    } else ctx.fillStyle = l.flash === 'black' ? '#000000' : '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
}

/**
 * The stretch of the frame (x, px) on `side` clear of every line up over the cut (rects in frame px), with a margin;
 * undefined when the lines leave less than a fifth of the frame there.
 */
export function freeBand(rects: { from: number; to: number; x0: number; x1: number }[], from: number, to: number, side: 'left' | 'right', margin = 40): [number, number] | undefined {
  const on = rects.filter((r) => Math.min(to, r.to) - Math.max(from, r.from) > 0);
  if (!on.length) return undefined;
  const band: [number, number] = side === 'left' ? [0, Math.min(...on.map((r) => r.x0)) - margin] : [Math.max(...on.map((r) => r.x1)) + margin, W];
  return band[1] - band[0] >= W / 5 ? band : undefined;
}

/** Where a character w px wide stands at fx inside a free band: its scale (≤ 1) and its centre. */
export function fitInRoom(room: [number, number], w: number, fx: number, pad = 24): { s: number; x: number } {
  const s = Math.min(1, (room[1] - room[0] - 2 * pad) / Math.max(1, w));
  const half = (w * s) / 2;
  return { s, x: Math.min(room[1] - pad - half, Math.max(room[0] + pad + half, fx)) };
}

/**
 * Blueprint labels (the 大字報 MVs' document feel): a figure name top left over a ruled line, the line count bottom
 * right, a revision tag top right; small mono type that types itself in as the cut lands.
 */
/**
 * The side a cut's character (or diagram) takes so it is clear of the lyric: the other side from where the lines up
 * over the cut actually sit (their frame-px rects, weighted by time on screen), or undefined when they sit centred.
 */
export function oppositeSide(rects: { from: number; to: number; x0: number; x1: number }[], from: number, to: number): 'left' | 'right' | undefined {
  let sum = 0, weight = 0;
  for (const r of rects) {
    const t = Math.min(to, r.to) - Math.max(from, r.from);
    if (t <= 0) continue;
    sum += ((r.x0 + r.x1) / 2) * t;
    weight += t;
  }
  if (!weight) return undefined;
  const cx = sum / weight;
  return cx < W / 2 - 120 ? 'right' : cx > W / 2 + 120 ? 'left' : undefined;
}

const grains = new Map<string, CanvasImageSource>();
/** The cut's paper: one flat colour, a printed paper with fibres and specks, or the colour deepening toward the foot. */
function drawGround(ctx: CanvasRenderingContext2D, ground: Ground | undefined, paper: Rgb, ink: Rgb, seed: number) {
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, W, H);
  if (ground === 'gradient') {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(255,255,255,0.10)');
    g.addColorStop(1, `${ink}2e`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  if (ground !== 'grain' || typeof document === 'undefined') return;
  // one sheet of grain per ink, made once (a frame is too short to scatter thousands of specks)
  const key = `${ink}|${seed % 3}`;
  let tex = grains.get(key);
  if (!tex) {
    const c = Object.assign(document.createElement('canvas'), { width: W / 2, height: H / 2 });
    const g = c.getContext('2d');
    if (!g) return;
    g.fillStyle = ink;
    for (let i = 0; i < 9000; i++) {
      g.globalAlpha = 0.04 + 0.1 * hash(i, 7 + (seed % 3));
      g.fillRect(hash(i, 1 + (seed % 3)) * c.width, hash(i, 2 + (seed % 3)) * c.height, 1 + hash(i, 3) * 1.5, 1);
    }
    g.globalAlpha = 0.05;
    for (let i = 0; i < 160; i++) g.fillRect(hash(i, 4) * c.width, hash(i, 5) * c.height, 8 + 30 * hash(i, 6), 1);
    grains.set(key, (tex = c));
  }
  ctx.drawImage(tex, 0, 0, W, H);
}

function drawMeta(ctx: CanvasRenderingContext2D, m: NonNullable<KineticLayer['meta']>, ink: Rgb, accent: Rgb, age: number) {
  ctx.save();
  ctx.fillStyle = ink;
  ctx.strokeStyle = ink;
  ctx.globalAlpha = 0.75;
  ctx.font = '700 22px "Space Mono", "Courier New", monospace';
  ctx.textBaseline = 'alphabetic';
  const typed = (s: string) => s.slice(0, Math.ceil(Math.min(1, age / 0.35) * s.length));
  const grow = Math.min(1, age / 0.3);
  const pad = (x: number | undefined, d = 3) => String(x ?? 0).padStart(d, '0');
  const text = (s: string | undefined, x: number, y: number, align: CanvasTextAlign) => {
    if (!s) return;
    ctx.textAlign = align;
    ctx.fillText(typed(s), x, y);
  };
  const kind = m.kind ?? 'blueprint';
  ctx.lineWidth = 1.5;
  if (kind === 'blueprint') {
    text(m.fig, 48, 52, 'left');
    if (m.fig) {
      // a ruler under it with a tick every 40 px, every fifth longer
      ctx.beginPath();
      ctx.moveTo(48, 66);
      ctx.lineTo(48 + 520 * grow, 66);
      for (let x = 48; x <= 48 + 520 * grow; x += 40) (ctx.moveTo(x, 66), ctx.lineTo(x, (x - 48) % 200 ? 72 : 78));
      ctx.stroke();
    }
    text(m.rev, W - 48, 52, 'right');
    text(m.line ?? (m.n ? `LINE ${pad(m.n)} / ${pad(m.total)}` : undefined), W - 48, H - 40, 'right');
  } else if (kind === 'slate') {
    // a clapper stripe over SCENE / TAKE, the roll at the foot
    for (let i = 0; i < 8; i++) {
      ctx.globalAlpha = i % 2 ? 0.15 : 0.75;
      ctx.beginPath();
      ctx.moveTo(48 + i * 34 * grow, 28);
      ctx.lineTo(48 + i * 34 * grow + 30, 28);
      ctx.lineTo(48 + i * 34 * grow + 18, 44);
      ctx.lineTo(48 + i * 34 * grow - 12, 44);
      ctx.fill();
    }
    ctx.globalAlpha = 0.75;
    text(m.fig ? `SCENE  ${m.fig}` : undefined, 48, 78, 'left');
    text(m.n ? `TAKE ${pad(m.n, 2)}` : undefined, W - 48, 52, 'right');
    text(`ROLL A${pad(m.total, 2)}`, W - 48, H - 40, 'right');
  } else if (kind === 'casefile') {
    text(m.n ? `CASE No. ${pad(m.total, 2)}-${pad(m.n)}` : undefined, 48, 52, 'left');
    text(m.fig, 48, 82, 'left');
    // a CONFIDENTIAL box in the accent, top right
    ctx.strokeStyle = accent;
    ctx.fillStyle = accent;
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.85 * grow;
    ctx.strokeRect(W - 48 - 230, 26, 230, 38);
    text('CONFIDENTIAL', W - 48 - 115, 54, 'center');
    ctx.fillStyle = ink;
    ctx.globalAlpha = 0.75;
    text(m.n ? `p. ${m.n} / ${m.total}` : undefined, W - 48, H - 40, 'right');
  } else if (kind === 'notebook') {
    // a red double margin down the left, No. and DATE on ruled lines, the page number at the foot
    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.5;
    for (const x of [96, 104]) (ctx.beginPath(), ctx.moveTo(x, 0), ctx.lineTo(x, H * grow), ctx.stroke());
    ctx.strokeStyle = ink;
    ctx.globalAlpha = 0.75;
    text('No.', W - 420, 52, 'left');
    text('DATE', W - 230, 52, 'left');
    ctx.beginPath();
    ctx.moveTo(W - 370, 58);
    ctx.lineTo(W - 250, 58);
    ctx.moveTo(W - 160, 58);
    ctx.lineTo(W - 48, 58);
    ctx.stroke();
    text(m.fig, 128, 52, 'left');
    text(m.n ? `— ${m.n} —` : undefined, W / 2, H - 36, 'center');
  } else {
    // a ticket: a perforated edge down the right, the destination, the seat
    ctx.setLineDash([6, 8]);
    ctx.beginPath();
    ctx.moveTo(W - 300, 0);
    ctx.lineTo(W - 300, 110 * grow);
    ctx.stroke();
    ctx.setLineDash([]);
    text(m.fig ? `→ ${m.fig}` : undefined, 48, 52, 'left');
    text('ADMIT ONE', W - 276, 52, 'left');
    text(m.n ? `SEAT ${pad(m.n, 2)}` : undefined, W - 276, 84, 'left');
    text(m.n ? `No. ${pad(m.total, 2)}${pad(m.n)}` : undefined, W - 48, H - 40, 'right');
  }
  ctx.restore();
}
