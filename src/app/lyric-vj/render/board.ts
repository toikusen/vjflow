// A part's lasting things (BoardLayer): what stays on screen through a part of the song while the cuts change over
// it, so a part reads as one place that fills up instead of one sticker a cut. Learned from LYKY's hand-tuned code
// layer (2026-10-15): evidence lying on one surface with soft contact shadows, pinned and taped, joined by a red
// thread that grows to each new piece, pieces landing with a squash. `order` is how tidy the board is: 1 a neat filed
// grid, 0 tilted and spilling over.
//
// A board can also be told what happens to it (events, from a small vocabulary every renderable action is in):
// threads linking pieces, a thread reaching past the board, pins popping so pieces hang, pieces breaking loose and
// flying off, a stamp slamming down, a thread cut. Its state at any moment is worked out from them, so a later cut
// shows what an earlier one did (a piece that came loose in the chorus is still gone after it).
import type { Rgb } from './graphics';

export interface BoardItem {
  /** Song second the piece lands. */
  at: number;
  /** A sprite id (printed in the cut's inks), a scene picture (asset id, printed in the photo), else `text` on a card. */
  sprite?: string;
  scene?: string;
  text?: string;
}

export type BoardEventKind = 'link' | 'reach' | 'loosen' | 'scatter' | 'stamp' | 'cut';
/** The actions a board can show (the planner picks from these; anything else is flagged before anything is made). */
export const BOARD_EVENTS: readonly BoardEventKind[] = ['link', 'reach', 'loosen', 'scatter', 'stamp', 'cut'];

export interface BoardEvent {
  at: number;
  kind: BoardEventKind;
  /** The pieces it acts on (indices into items): link joins them in order; reach runs on from the last. */
  items?: number[];
  /** A stamp's word. */
  text?: string;
}

export interface BoardLayer {
  /** evidence: cards pinned and threaded; stage: one or two loose things standing in the place, no cards or thread. */
  style: 'evidence' | 'stage';
  items: BoardItem[];
  /** The part's span (song seconds) and how tidy the board is at its start and its end (1 tidy, 0 chaos). */
  from: number;
  to: number;
  order: [number, number];
  /** What happens to the board; without any, a thread joins the pieces as they land. */
  events?: BoardEvent[];
  /**
   * zone: pieces laid in the room each cut's lines leave (a passage); edges: a fixed border of pieces along the frame's
   * top and bottom for a whole song (laid by the zone, they jumped at every cut and read as the world resetting).
   */
  layout?: 'zone' | 'edges' | 'scene';
  /**
   * scene: how the place is looked at, part by part (a far view, then close on one thing, then far again): the place
   * stays and is revisited at another distance instead of being swapped for another picture.
   */
  views?: { at: number; zoom: number; focus: number }[];
  /** The part's own inks and layout seed, kept through every cut (the cut's own are used when unset). */
  ink?: Rgb;
  paper?: Rgb;
  accent?: Rgb;
  seed?: number;
}

/** A frame rectangle, px. */
export type Zone = [number, number, number, number];

/**
 * The biggest stretch of the frame the lines sung during [from, to) leave free: the band left of them, right of them,
 * above or below (margin kept); undefined when none is a fifth of the frame (a line filling the frame).
 */
export function freeZone(rects: { from: number; to: number; x0: number; y0: number; x1: number; y1: number }[], from: number, to: number, W: number, H: number, margin = 40): Zone | undefined {
  const on = rects.filter((r) => Math.min(to, r.to) - Math.max(from, r.from) > 0);
  if (!on.length) return [0, 0, W, H];
  const [x0, y0, x1, y1] = [Math.min(...on.map((r) => r.x0)), Math.min(...on.map((r) => r.y0)), Math.max(...on.map((r) => r.x1)), Math.max(...on.map((r) => r.y1))];
  const zones: Zone[] = [[0, 0, x0 - margin, H], [x1 + margin, 0, W, H], [0, 0, W, y0 - margin], [0, y1 + margin, W, H]];
  // a strip too thin to hold a readable card is no room (a band 60 px over a framed verse shrank them to stamps)
  const area = (z: Zone) => (z[2] - z[0] >= W * 0.18 && z[3] - z[1] >= H * 0.28 ? (z[2] - z[0]) * (z[3] - z[1]) : 0);
  const best = zones.reduce((a, b) => (area(b) > area(a) ? b : a));
  return area(best) >= (W * H) / 6 ? best : undefined;
}

type Draw = { ctx: CanvasRenderingContext2D; t: number; W: number; H: number; ink: Rgb; paper: Rgb; accent: Rgb; room?: [number, number]; zone?: Zone | null; busy?: Zone[]; seed: number; art: (id: string) => CanvasImageSource | undefined; photo?: (id: string) => CanvasImageSource | undefined };

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const ease = (x: number) => 1 - (1 - clamp(x)) ** 3;
const easeIn = (x: number) => clamp(x) ** 2;
const rnd = (i: number, k: number) => {
  const s = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/** How tidy the board is at t: eased from the part's start value to its end value. */
export function orderAt(b: Pick<BoardLayer, 'from' | 'to' | 'order'>, t: number): number {
  const p = clamp((t - b.from) / Math.max(0.1, b.to - b.from));
  return b.order[0] + (b.order[1] - b.order[0]) * p * p * (3 - 2 * p);
}

/**
 * Where piece i of n sits: a filed grid inside the stretch the lyric leaves free (the whole frame's other side when
 * none is given), loosened by `mess` (0 tidy .. 1 chaos): tilt up to 28°, pushed off its slot.
 */
export function slot(i: number, n: number, mess: number, W: number, H: number, room: [number, number] | undefined, seed: number, zone?: Zone) {
  const [x0, y0, x1, y1] = zone ?? (room && room[1] - room[0] > W * 0.22 ? [room[0], 0, room[1], H] : [W * 0.06, 0, W * 0.94, H]);
  const zw = x1 - x0, zh = y1 - y0;
  // as many columns as keep the cards near square in the zone
  const cols = Math.max(1, Math.min(n, Math.round(Math.sqrt((n * zw) / Math.max(1, zh)))));
  const rows = Math.ceil(n / cols);
  const cw = zw / cols, rh = Math.min(H * 0.34, (zh * 0.9) / rows);
  const c = i % cols, r = Math.floor(i / cols);
  const tidyX = x0 + cw * (c + 0.5), tidyY = y0 + zh / 2 + (r - (rows - 1) / 2) * rh;
  const j = (k: number) => rnd(i + seed * 13, k) * 2 - 1;
  return {
    x: tidyX + j(1) * cw * 0.45 * mess,
    y: tidyY + j(2) * rh * 0.5 * mess,
    rot: (j(3) * 2 + j(4) * 26 * mess) * (Math.PI / 180),
    w: Math.min(cw * 0.78, rh * 0.95 * 0.8),
  };
}

/** Piece i of n on a fixed border: the top edge first, then the bottom, evenly across the frame. */
export function edgeSlot(i: number, n: number, mess: number, W: number, H: number, seed: number) {
  const cols = Math.min(6, Math.max(1, Math.ceil(n / 2)));
  const row = Math.floor(i / cols) % 2, c = i % cols;
  const cw = (W * 0.9) / cols;
  const j = (k: number) => rnd(i + seed * 13, k) * 2 - 1;
  return { x: W * 0.05 + cw * (c + 0.5) + j(1) * cw * 0.3 * mess, y: (row ? H * 0.84 : H * 0.16) + j(2) * 30 * mess, rot: (j(3) * 2 + j(4) * 26 * mess) * (Math.PI / 180), w: Math.min(cw * 0.7, H * 0.2) };
}

/**
 * Thing i of n standing in the place: the first (the place's own landmark) large and central on the ground, the rest
 * smaller along the ground to either side of it.
 */
export function sceneSlot(i: number, n: number, W: number, H: number, seed: number) {
  if (i === 0) return { x: W * 0.5, y: H * 0.9, rot: 0, w: H * 0.5 };
  const side = i % 2 ? 1 : -1, k = Math.ceil(i / 2);
  return { x: W * 0.5 + side * (W * 0.2 + k * W * 0.12) + (rnd(i + seed, 5) - 0.5) * 30, y: H * 0.86, rot: 0, w: H * Math.max(0.14, 0.24 - k * 0.03) };
}

/** The view of the place at t: eased from the view before over 1.2 s (zoom about the focused thing's foot). */
export function viewAt(views: NonNullable<BoardLayer['views']>, t: number): { zoom: number; focus: number } {
  const past = views.filter((v) => v.at <= t);
  const cur = past.at(-1), prev = past.at(-2);
  if (!cur) return { zoom: 1, focus: 0 };
  const k = prev ? ease((t - cur.at) / 1.2) : 1;
  return { zoom: (prev?.zoom ?? 1) + (cur.zoom - (prev?.zoom ?? 1)) * k, focus: k < 0.5 && prev ? prev.focus : cur.focus };
}

/** Whether two rectangles overlap. */
const meets = (a: Zone, b: Zone) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

/** The first event of a kind acting on piece i by t, if any: its age. */
const since = (ev: BoardEvent[], kind: BoardEventKind, i: number, t: number) => {
  const e = ev.find((x) => x.kind === kind && x.at <= t && (x.items ?? []).includes(i));
  return e ? t - e.at : undefined;
};

/**
 * A piece's state at t from the board's events: pinned (0), hanging from one corner after its pin pops (loosen), or
 * thrown off (scatter: up with a kick, then falling and spinning past the frame).
 */
export function pieceAt(ev: BoardEvent[], i: number, t: number, H: number) {
  const thrown = since(ev, 'scatter', i, t);
  if (thrown !== undefined) {
    const dir = rnd(i, 21) < 0.5 ? -1 : 1;
    return { dx: dir * (240 + 380 * rnd(i, 22)) * ease(thrown / 1.2), dy: -160 * ease(thrown / 0.35) + 2200 * easeIn((thrown - 0.25) / 1.6), drot: dir * thrown * (2.2 + 2 * rnd(i, 23)), pin: false, gone: thrown > 1.9 || -160 + 2200 > H * 3 };
  }
  const loose = since(ev, 'loosen', i, t);
  if (loose !== undefined) {
    const side = rnd(i, 24) < 0.5 ? -1 : 1;
    // swings down to hang off its other pin, overshooting once
    const swing = ease(loose / 0.5) * (1 + 0.12 * Math.exp(-loose * 4) * Math.sin(loose * 14));
    return { dx: side * 40 * swing, dy: 70 * swing, drot: side * 0.95 * swing, pin: false, gone: false };
  }
  return { dx: 0, dy: 0, drot: 0, pin: true, gone: false };
}

/** The board at song second t: pieces landed so far, what has happened to them, the thread, any stamp. */
export function drawBoard(b: BoardLayer, d: Draw) {
  const { ctx, t, W, H } = d;
  const landed = b.items.map((x, i) => ({ x, i })).filter(({ x }) => x.at <= t);
  if (!landed.length) return;
  const ev = (b.events ?? []).filter((e) => BOARD_EVENTS.includes(e.kind));
  const mess = 1 - orderAt(b, t);
  const n = b.items.length;
  // a stamp landing or pins giving way jolts the whole board once
  const jolt = Math.max(0, ...ev.filter((e) => (e.kind === 'stamp' || e.kind === 'loosen') && e.at <= t && t - e.at < 0.3).map((e) => 1 - (t - e.at) / 0.3));
  const [jx, jy] = [Math.sin(t * 90) * 14 * jolt, Math.cos(t * 77) * 10 * jolt];
  const spots = landed.map(({ x, i }) => {
    const s = b.layout === 'scene' ? sceneSlot(i, n, W, H, d.seed) : b.layout === 'edges' ? edgeSlot(i, n, mess, W, H, d.seed) : slot(i, n, mess, W, H, b.style === 'stage' ? undefined : d.room, d.seed, d.zone ?? undefined);
    const p = ev.length ? pieceAt(ev, i, t, H) : { dx: 0, dy: 0, drot: 0, pin: true, gone: false };
    return { x, i, s: { ...s, x: s.x + p.dx + jx, y: s.y + p.dy + jy, rot: s.rot + p.drot }, pin: p.pin, gone: p.gone };
  });
  const pinOf = (k: number) => {
    const o = spots.find((x) => x.i === k);
    return o && !o.gone ? ([o.s.x, o.s.y - o.s.w * 0.62] as [number, number]) : undefined;
  };
  ctx.save();
  if (b.layout === 'scene' && b.views?.length) {
    // the camera on the place: close on one thing, or far
    const v = viewAt(b.views, t), f = sceneSlot(Math.min(v.focus, n - 1), n, W, H, d.seed);
    ctx.translate(W / 2, H * 0.6);
    ctx.scale(v.zoom, v.zoom);
    ctx.translate(-(W / 2 + (f.x - W / 2) * Math.min(1, v.zoom - 1)), -H * 0.6);
  }
  // a line filling the frame is the moment's event: the board stays, stepped back behind it (a fixed border stays put
  // and only its pieces under the line step back)
  if (d.zone === null && b.layout !== 'edges') ctx.globalAlpha = 0.3;
  if (b.style === 'evidence') {
    ctx.lineCap = 'round';
    // a cut takes the threads between the pieces it names (all of them when it names none): they drop and fade
    const cutOf = (ids: number[]) => ev.find((e) => e.kind === 'cut' && e.at <= t && (!(e.items ?? []).length || ids.every((x) => e.items!.includes(x))));
    const segment = (a: [number, number], z: [number, number], grow: number, ids: number[] = []) => {
      const cut = cutOf(ids);
      const gone = cut ? ease((t - cut.at) / 1.4) : 0;
      if (gone >= 1) return;
      const ex = a[0] + (z[0] - a[0]) * grow, ey = a[1] + (z[1] - a[1]) * grow;
      const mx = (a[0] + ex) / 2, my = (a[1] + ey) / 2 + Math.hypot(ex - a[0], ey - a[1]) * 0.12;
      const line = () => {
        ctx.beginPath();
        if (!cut) {
          ctx.moveTo(a[0], a[1]);
          ctx.quadraticCurveTo(mx, my, ex, ey);
          return;
        }
        // cut in the middle: the two ends swing down from their pins
        const drop = 260 * gone;
        ctx.moveTo(a[0], a[1]);
        ctx.quadraticCurveTo(a[0] + (mx - a[0]) * 0.4, my + drop * 0.6, mx - 20, my + drop);
        ctx.moveTo(ex, ey);
        ctx.quadraticCurveTo(ex + (mx - ex) * 0.4, my + drop * 0.6, mx + 20, my + drop);
      };
      ctx.globalAlpha = 1 - gone;
      line();
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 9;
      ctx.stroke();
      line();
      ctx.strokeStyle = d.accent;
      ctx.lineWidth = 6;
      ctx.stroke();
    };
    const links = ev.filter((e) => e.kind === 'link' && e.at <= t);
    if (!ev.length) {
      // no events: the thread runs through the pieces as they land (LYKY's TH)
      spots.forEach((o, k) => k && pinOf(spots[k - 1].i) && pinOf(o.i) && segment(pinOf(spots[k - 1].i)!, pinOf(o.i)!, ease((t - o.x.at) / 0.45), [spots[k - 1].i, o.i]));
    }
    for (const e of links) {
      const ids = e.items ?? [];
      for (let k = 1; k < ids.length; k++) {
        const a = pinOf(ids[k - 1]), z = pinOf(ids[k]);
        // each link of the chain grows after the one before it
        if (a && z) segment(a, z, ease((t - e.at - (k - 1) * 0.25) / 0.45), [ids[k - 1], ids[k]]);
      }
    }
    for (const e of ev.filter((x) => x.kind === 'reach' && x.at <= t)) {
      const a = pinOf((e.items ?? []).at(-1) ?? -1);
      // past the board, to the frame's far edge: the case reaches beyond what was filed
      if (a) segment(a, [a[0] < W / 2 ? -40 : W + 40, a[1] + H * 0.18], ease((t - e.at) / 0.9), e.items ?? []);
    }
    ctx.globalAlpha = 1;
  }
  for (const { x, i, s, pin, gone } of spots) {
    if (gone) continue;
    const popped = since(ev, 'loosen', i, t) ?? since(ev, 'scatter', i, t);
    if (popped !== undefined && popped < 0.7) {
      // the pin flies off, up and away
      ctx.save();
      ctx.globalAlpha = 1 - popped / 0.7;
      ctx.fillStyle = d.accent;
      ctx.beginPath();
      ctx.arc(s.x + 120 * popped * (i % 2 ? 1 : -1), s.y - s.w * 0.62 - 300 * popped + 500 * popped * popped, Math.max(9, s.w * 0.05), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    const age = t - x.at;
    // lands from a little above and squashes once (LYKY's DROP); a thing in a place fades in where it stands
    const scene = b.layout === 'scene';
    const fall = scene ? 0 : 1 - ease(age / 0.22);
    const sq = scene || age < 0.22 ? 1 : 1 + 0.14 * Math.exp(-(age - 0.22) * 10) * Math.cos((age - 0.22) * 30);
    const w = s.w, h = b.style === 'evidence' ? w * 1.18 : w;
    ctx.save();
    if (scene) ctx.globalAlpha *= ease(age / 1.2);
    // a piece under the cut's lines steps back so the line reads first (a thing in a place: its body, above its foot)
    const box: Zone = scene ? [s.x - w / 2, s.y - w, s.x + w / 2, s.y] : [s.x - w / 2, s.y - h / 2, s.x + w / 2, s.y + h / 2];
    // (the place's landmark stays the place: it only dims a little under a line, its keyline keeps the line readable)
    if (d.busy?.some((r) => meets(box, r))) ctx.globalAlpha *= scene ? (i === 0 ? 0.75 : 0.45) : 0.3;
    ctx.translate(s.x, s.y - fall * H * 0.08);
    if (pin && !scene) {
      // the contact shadow on the surface
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath();
      ctx.ellipse(w * 0.06, h * 0.5, w * 0.5, Math.max(4, h * 0.05), 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.rotate(s.rot);
    ctx.scale(1 / sq, sq);
    const img = x.sprite ? d.art(x.sprite) : undefined;
    const photo = x.scene ? d.photo?.(x.scene) : undefined;
    if (b.style === 'evidence') {
      ctx.fillStyle = d.paper;
      ctx.shadowColor = 'rgba(0,0,0,0.25)';
      ctx.shadowBlur = 14;
      ctx.shadowOffsetY = 6;
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.shadowColor = 'transparent';
      if (photo) cover(ctx, photo, -w / 2 + 10, -h / 2 + 10, w - 20, w - 20);
      else {
        ctx.strokeStyle = d.ink;
        ctx.lineWidth = 2;
        ctx.strokeRect(-w / 2 + 8, -h / 2 + 8, w - 16, w - 16);
        if (img) fit(ctx, img, -w / 2 + 14, -h / 2 + 14, w - 28, w - 28);
        else if (x.text) word(ctx, x.text, 0, -h / 2 + w / 2, w - 32, d.ink);
      }
      ctx.fillStyle = d.ink;
      ctx.font = `700 ${Math.round(w * 0.09)}px "Space Mono", ui-monospace, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`No.${String(i + 1).padStart(2, '0')}`, 0, h / 2 - w * 0.1);
      if (pin) {
        if (i % 2) {
          ctx.fillStyle = d.accent;
          ctx.beginPath();
          ctx.arc(0, -h / 2 + 4, Math.max(6, w * 0.035), 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = 'rgba(255,255,255,0.55)';
          ctx.save();
          ctx.rotate(-0.08);
          ctx.fillRect(-w * 0.18, -h / 2 - w * 0.04, w * 0.36, w * 0.1);
          ctx.restore();
        }
      }
    } else if (img && b.layout === 'scene') {
      // stands on the ground: its foot at the slot, its shadow under it
      const iw = (img as { width: number }).width || 1, ih = (img as { height: number }).height || 1, k = w / Math.max(iw, ih);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath();
      ctx.ellipse(0, 0, iw * k * 0.45, Math.max(5, ih * k * 0.04), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.drawImage(img, (-iw * k) / 2, -ih * k, iw * k, ih * k);
    } else if (img) fit(ctx, img, -w / 2, -h / 2, w, h);
    else if (photo) cover(ctx, photo, -w / 2, -h / 2, w, h);
    else if (x.text) word(ctx, x.text, 0, 0, w, d.ink);
    ctx.restore();
  }
  const stamps = ev.filter((x) => x.kind === 'stamp' && x.text);
  const [zx0, zy0, zx1, zy1] = d.zone ?? [0, 0, W, H];
  for (const [k0, e] of stamps.entries()) {
    if (e.at > t) continue;
    // slams down big and settles a little tilted inside the board's room, each next one further along (stacked in one
    // spot they read as one garbled word)
    const age = t - e.at, k = ease(age / 0.18);
    const cols = Math.max(1, Math.floor((zx1 - zx0) / 520));
    ctx.save();
    ctx.translate(zx0 + ((k0 % cols) + 0.5) * ((zx1 - zx0) / cols), zy0 + Math.min(zy1 - zy0, H) * (0.22 + 0.3 * (Math.floor(k0 / cols) % 2)));
    ctx.rotate(-0.12);
    const fitW = Math.min(1, ((zx1 - zx0) / Math.max(1, cols)) / 560);
    ctx.scale((3.2 - 2.2 * k) * fitW, (3.2 - 2.2 * k) * fitW);
    ctx.globalAlpha = 0.85 * k;
    ctx.globalCompositeOperation = 'multiply';
    ctx.strokeStyle = d.accent;
    ctx.fillStyle = d.accent;
    ctx.lineWidth = 8;
    const size = 96;
    ctx.font = `900 ${size}px "Noto Sans TC", "Hiragino Sans", sans-serif`;
    const tw = ctx.measureText(e.text!).width;
    ctx.strokeRect(-tw / 2 - 30, -size / 2 - 24, tw + 60, size + 48);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(e.text!, 0, 0);
    ctx.restore();
  }
  ctx.restore();
}

function fit(ctx: CanvasRenderingContext2D, img: CanvasImageSource, x: number, y: number, w: number, h: number) {
  const iw = (img as { width: number }).width || 1, ih = (img as { height: number }).height || 1;
  const s = Math.min(w / iw, h / ih);
  ctx.drawImage(img, x + (w - iw * s) / 2, y + (h - ih * s) / 2, iw * s, ih * s);
}

/** A photo filling its frame (cropped to it). */
function cover(ctx: CanvasRenderingContext2D, img: CanvasImageSource, x: number, y: number, w: number, h: number) {
  const iw = (img as { width: number }).width || 1, ih = (img as { height: number }).height || 1;
  const s = Math.max(w / iw, h / ih);
  const sw = w / s, sh = h / s;
  ctx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h);
}

function word(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, w: number, color: Rgb) {
  const size = Math.max(18, Math.min(w * 0.3, (w * 0.9) / Math.max(1, [...s].length)));
  ctx.fillStyle = color;
  ctx.font = `900 ${Math.round(size)}px "Noto Sans TC", "Hiragino Sans", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(s, x, y, w);
}
