// Graphic components for the styles the 534-video survey found missing (docs: ~/Desktop/vj/output/style-gap-2026-10-14):
// a phone screen, comic bursts and balloons, torn scrapbook scraps with tape, spray paint with drips and a stencil
// word, an LED dot-matrix board, stage beams, a glitch that slices the frame drawn so far, and five patterns (ruled
// notebook, music staves, banknote guilloche, 70s wavy stripes, isometric grid). Same contract as graphics.ts:
// deterministic in t, 1920×1080 frame px, x/y −1..1 with y up.

type Rgb = string;
interface Beat {
  since: number;
  pulse: number;
  index: number;
}

export type KitLayer =
  // a broken screen (the phone's state, kept across shots): drawn by the final pass over everything (engine.ts)
  | { kind: 'glass'; crack: number; seed?: number }
  | { kind: 'app'; type?: 'chat' | 'lock'; skin?: 'line' | 'light' | 'dark'; color: Rgb; bar?: Rgb; accent?: Rgb; title?: string; time?: string }
  | { kind: 'phone'; type?: 'chat' | 'feed' | 'player' | 'notify'; color: Rgb; accent?: Rgb; lines?: string[]; title?: string; x?: number; y?: number; size?: number; tilt?: number; delay?: number }
  | { kind: 'burst'; type?: 'boom' | 'speech' | 'thought'; color: Rgb; ink?: Rgb; text?: string; x?: number; y?: number; size?: number; tilt?: number }
  | { kind: 'scraps'; colors: Rgb[]; color?: Rgb; tape?: Rgb; count?: number; seed?: number }
  | { kind: 'spray'; color: Rgb; colors?: Rgb[]; count?: number; drips?: boolean; text?: string; size?: number; y?: number; seed?: number }
  // calls: the board shows the song's calls as they are shouted (the engine fills `script`), `text` scrolls between them
  | { kind: 'led'; color: Rgb; off?: Rgb; text?: string; y?: number; height?: number; speed?: number; calls?: boolean; script?: { text: string; at: number }[] }
  | { kind: 'beams'; color: Rgb; colors?: Rgb[]; count?: number; spin?: number }
  | { kind: 'glitch'; color: Rgb; color2?: Rgb; amount?: number; seed?: number };

export const KIT_KINDS = ['glass', 'app', 'phone', 'burst', 'scraps', 'spray', 'led', 'beams', 'glitch'] as const;
export const KIT_PATTERNS = ['lined', 'staff', 'guilloche', 'wavy', 'iso'] as const;
export type KitPattern = (typeof KIT_PATTERNS)[number];

const W = 1920;
const H = 1080;
const hash = (a: number, b = 0) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const px = (x = 0) => W / 2 + (x * W) / 2;
const py = (y = 0) => H / 2 - (y * H) / 2;
const SANS = '"Zen Kaku Gothic New", "Hiragino Sans", "Noto Sans JP", sans-serif';
const POP = '"Mochiy Pop One", "Zen Maru Gothic", sans-serif';

/** Lines of `text` no wider than `max` px, broken anywhere (Japanese has no spaces). */
function wrap(ctx: CanvasRenderingContext2D, text: string, max: number, limit = 3): string[] {
  const out: string[] = [];
  let line = '';
  for (const ch of text) {
    if (ctx.measureText(line + ch).width > max && line) {
      out.push(line);
      line = '';
    }
    line += ch;
  }
  if (line) out.push(line);
  return out.slice(0, limit);
}

export const PHONE_H = 0.78;
/** How close to the frame edge a phone may be drawn (px); placement checks keep the same margins. */
export const PHONE_MX = 40;
export const PHONE_MY = 20;
/** The phone's box in frame px: `size` is its height as a fraction of the frame (9:19.5). */
export function phoneBox(l: Extract<KitLayer, { kind: 'phone' }>) {
  const h = (l.size ?? PHONE_H) * H;
  const w = h * 0.47;
  return { cx: Math.min(W - w / 2 - PHONE_MX, Math.max(w / 2 + PHONE_MX, px(l.x ?? 0.68))), cy: Math.min(H - h / 2 - PHONE_MY, Math.max(h / 2 + PHONE_MY, py(l.y))), w, h };
}

/** Burst and balloon box in frame px (`size` is its height). */
export function burstBox(l: Extract<KitLayer, { kind: 'burst' }>) {
  const h = l.size ?? 300;
  return { cx: px(l.x ?? -0.6), cy: py(l.y ?? 0.55), w: h * 1.5, h };
}

/** Draws a kit layer; false when `l` is not one. */
export function drawKit(ctx: CanvasRenderingContext2D, l: { kind: string } & Record<string, unknown>, t: number, age: number, beat: Beat): boolean {
  const k = l as unknown as KitLayer & { pulse?: number };
  const kick = 1 + (k.pulse ?? 0) * beat.pulse;
  switch (k.kind) {
    case 'glass':
      // nothing on the canvas: the glass is the final pass's, over the type as well
      return true;
    case 'app':
      app(ctx, k, age);
      return true;
    case 'phone':
      phone(ctx, k, age, beat);
      return true;
    case 'burst':
      burst(ctx, k, age, kick);
      return true;
    case 'scraps':
      scraps(ctx, k, age);
      return true;
    case 'spray':
      spray(ctx, k, age);
      return true;
    case 'led':
      led(ctx, k, t, beat);
      return true;
    case 'beams':
      beams(ctx, k, t, kick);
      return true;
    case 'glitch':
      glitch(ctx, k, t, beat);
      return true;
    default:
      return false;
  }
}

/** Status bar, header and input bar heights of the full-frame app (px); the chat template's thread sits between them. */
export const APP_TOP = 150;
export const APP_BOTTOM = 112;

/**
 * The whole frame as a phone app (あいみょん〈貴方解剖純愛歌〉): wallpaper, status bar, a chat header with the other
 * person's name and the input bar, or a lock screen's big clock. (The screen breaking is the chat template's: it is
 * glass, over the messages.)
 */
/** The app's chrome per skin: a messenger with a dark header and white input bar, a light system app, or dark mode. */
const SKIN = {
  line: { bar: '#20222B', fg: '#F2F2F7', input: '#FFFFFF', field: '#F2F2F7', icon: '#C7C7CC' },
  light: { bar: 'rgba(248,248,250,0.94)', fg: '#1C1C1E', input: 'rgba(248,248,250,0.96)', field: '#FFFFFF', icon: '#8E8E93' },
  dark: { bar: '#000000', fg: '#F2F2F7', input: '#111113', field: '#2C2C2E', icon: '#636366' },
} as const;

function app(ctx: CanvasRenderingContext2D, l: Extract<KitLayer, { kind: 'app' }>, age: number) {
  const sk = SKIN[l.skin ?? 'line'] ?? SKIN.line;
  const bar = l.bar ?? sk.bar;
  const accent = l.accent ?? '#06C755';
  const fg = sk.fg;
  ctx.fillStyle = l.color;
  ctx.fillRect(0, 0, W, H);
  // status bar: time in the middle, signal bars and battery on the right
  ctx.fillStyle = bar;
  ctx.fillRect(0, 0, W, 56);
  ctx.fillStyle = fg;
  ctx.font = `600 30px ${SANS}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(l.time ?? '2:16', W / 2, 28);
  for (let i = 0; i < 4; i++) ctx.fillRect(40 + i * 14, 38 - i * 6, 9, 8 + i * 6);
  ctx.strokeStyle = fg;
  ctx.lineWidth = 2;
  ctx.strokeRect(W - 110, 17, 54, 22);
  ctx.fillRect(W - 106, 21, 34, 14);
  ctx.fillRect(W - 54, 23, 4, 10);
  if ((l.type ?? 'chat') === 'chat') {
    // header: back chevron, the other person's name, menu
    ctx.fillStyle = bar;
    ctx.fillRect(0, 56, W, APP_TOP - 56);
    ctx.strokeStyle = fg;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(62, 80);
    ctx.lineTo(42, 103);
    ctx.lineTo(62, 126);
    ctx.stroke();
    ctx.fillStyle = fg;
    ctx.font = `700 38px ${SANS}`;
    ctx.fillText(l.title ?? '', W / 2, 103, W * 0.6);
    for (let i = 0; i < 3; i++) ctx.fillRect(W - 70, 88 + i * 13, 34, 4);
    // input bar: a plus, the rounded field, the mic / send button in the app's colour
    ctx.fillStyle = sk.input;
    ctx.fillRect(0, H - APP_BOTTOM, W, APP_BOTTOM);
    ctx.fillStyle = sk.icon;
    ctx.fillRect(40, H - APP_BOTTOM / 2 - 3, 36, 6);
    ctx.fillRect(55, H - APP_BOTTOM / 2 - 18, 6, 36);
    ctx.fillStyle = sk.field;
    ctx.beginPath();
    ctx.roundRect(110, H - APP_BOTTOM + 22, W - 300, APP_BOTTOM - 44, 34);
    ctx.fill();
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.roundRect(W - 160, H - APP_BOTTOM + 20, 120, APP_BOTTOM - 40, 34);
    ctx.fill();
  } else {
    // lock screen: the big clock and the date
    ctx.fillStyle = fg;
    ctx.font = `300 220px ${SANS}`;
    ctx.fillText(l.time ?? '2:16', W / 2, H * 0.28);
    ctx.font = `500 40px ${SANS}`;
    ctx.fillText(l.title ?? '', W / 2, H * 0.12);
  }
  ctx.textAlign = 'left';
}

/** A smartphone with its screen: a chat that grows line by line, a scrolling feed, a music player or notifications. */
function phone(ctx: CanvasRenderingContext2D, l: Extract<KitLayer, { kind: 'phone' }>, age: number, beat: Beat) {
  const local = age - (l.delay ?? 0);
  if (local < 0) return;
  const { cx, cy, w, h } = phoneBox(l);
  const pop = Math.min(1, local / 0.25);
  ctx.translate(cx, cy + (1 - pop) * 80);
  ctx.rotate(((l.tilt ?? 0) * Math.PI) / 180);
  ctx.globalAlpha *= pop;
  // body, then the screen inset with rounded corners and a camera island
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 16;
  ctx.fillStyle = l.color;
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, w * 0.14);
  ctx.fill();
  ctx.restore();
  const m = w * 0.045;
  const [sx, sy, sw, sh] = [-w / 2 + m, -h / 2 + m, w - 2 * m, h - 2 * m];
  const dark = l.type === 'player';
  const accent = l.accent ?? '#0A84FF';
  ctx.beginPath();
  ctx.roundRect(sx, sy, sw, sh, w * 0.11);
  if (l.type === 'notify') {
    // a lock screen: the wallpaper in the accent, so the white banners stand out
    const g = ctx.createLinearGradient(0, sy, 0, sy + sh);
    g.addColorStop(0, accent);
    g.addColorStop(1, '#1C1C1E');
    ctx.fillStyle = g;
  } else ctx.fillStyle = dark ? '#121214' : '#FFFFFF';
  ctx.fill();
  ctx.save();
  ctx.clip();
  const ink = dark ? '#F2F2F7' : '#1C1C1E';
  const lines = l.lines?.length ? l.lines : ['…'];
  // big enough to read on a video frame, not on a real phone
  const fs = Math.round(sw * 0.088);
  // status bar and header
  ctx.fillStyle = ink;
  ctx.font = `600 ${fs * 0.8}px ${SANS}`;
  ctx.textBaseline = 'middle';
  ctx.fillText('9:41', sx + sw * 0.1, sy + sh * 0.035);
  ctx.fillStyle = dark ? '#000' : '#111';
  ctx.beginPath();
  ctx.roundRect(-sw * 0.16, sy + sh * 0.018, sw * 0.32, sh * 0.034, sh * 0.017);
  ctx.fill();
  const top = sy + sh * 0.075;
  if (l.title || l.type === 'chat' || !l.type) {
    ctx.fillStyle = dark ? '#1C1C1E' : '#F2F2F7';
    ctx.fillRect(sx, top, sw, sh * 0.075);
    ctx.fillStyle = ink;
    ctx.font = `700 ${fs}px ${SANS}`;
    ctx.textAlign = 'center';
    ctx.fillText(l.title ?? '', 0, top + sh * 0.0375, sw * 0.8);
    ctx.textAlign = 'left';
  }
  const body = top + sh * 0.09;
  switch (l.type ?? 'chat') {
    case 'chat': {
      // one message every 1.1 s, alternating sides; the thread scrolls up when it fills
      const shown = Math.min(lines.length, 1 + Math.floor(local / 1.1));
      ctx.font = `500 ${fs}px ${SANS}`;
      const lh = fs * 1.3;
      const bubbles = lines.slice(0, shown).map((text, i) => ({ mine: i % 2 === 1, rows: wrap(ctx, text, sw * 0.7, 2) }));
      const heights = bubbles.map((b) => b.rows.length * lh + fs * 0.9);
      const total = heights.reduce((a, b) => a + b + fs * 0.6, 0);
      let y = Math.min(body, sy + sh * 0.93 - total);
      bubbles.forEach((b, i) => {
        const bw = Math.max(...b.rows.map((r) => ctx.measureText(r).width)) + fs * 1.2;
        const bx = b.mine ? sx + sw * 0.94 - bw : sx + sw * 0.06;
        const fresh = i === shown - 1 ? Math.min(1, (local - (shown - 1) * 1.1) / 0.2) : 1;
        ctx.save();
        ctx.translate(bx + (b.mine ? bw : 0), y + heights[i]);
        ctx.scale(0.6 + 0.4 * fresh, 0.6 + 0.4 * fresh);
        ctx.translate(-(bx + (b.mine ? bw : 0)), -(y + heights[i]));
        ctx.fillStyle = b.mine ? accent : dark ? '#2C2C2E' : '#E9E9EB';
        ctx.beginPath();
        ctx.roundRect(bx, y, bw, heights[i], fs * 0.9);
        ctx.fill();
        ctx.fillStyle = b.mine ? '#FFFFFF' : ink;
        b.rows.forEach((r, j) => ctx.fillText(r, bx + fs * 0.6, y + fs * 0.45 + lh * (j + 0.5)));
        ctx.restore();
        y += heights[i] + fs * 0.6;
      });
      // the other side typing: three dots bouncing on the beat
      if (shown < lines.length && shown % 2 === 0) {
        ctx.fillStyle = dark ? '#2C2C2E' : '#E9E9EB';
        ctx.beginPath();
        ctx.roundRect(sx + sw * 0.06, y, fs * 3.2, fs * 1.8, fs * 0.9);
        ctx.fill();
        ctx.fillStyle = '#8E8E93';
        for (let d = 0; d < 3; d++) {
          ctx.beginPath();
          ctx.arc(sx + sw * 0.06 + fs * (0.9 + d * 0.7), y + fs * 0.9 - (beat.index % 3 === d ? fs * 0.2 : 0), fs * 0.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    }
    case 'feed': {
      // posts scrolling past: avatar, name bar, the line, an image block in the accent
      const card = sh * 0.36;
      const off = (local * sh * 0.08) % card;
      ctx.font = `500 ${fs}px ${SANS}`;
      for (let i = -1; i < 4; i++) {
        const n = Math.floor(local * 0.08 * (sh / card)) + i;
        const y = body + i * card - off;
        const text = lines[((n % lines.length) + lines.length) % lines.length];
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.arc(sx + sw * 0.12, y + fs, fs * 0.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#C7C7CC';
        ctx.fillRect(sx + sw * 0.22, y + fs * 0.6, sw * 0.35, fs * 0.5);
        ctx.fillStyle = ink;
        wrap(ctx, text, sw * 0.84, 2).forEach((r, j) => ctx.fillText(r, sx + sw * 0.08, y + fs * 2.6 + j * fs * 1.3));
        ctx.globalAlpha *= 0.85;
        ctx.fillStyle = accent;
        ctx.fillRect(sx + sw * 0.08, y + fs * 5, sw * 0.84, card - fs * 6.2);
        ctx.globalAlpha /= 0.85;
      }
      break;
    }
    case 'player': {
      // cover, title, a progress bar that runs with the section, and level bars on the beat
      const cs = sw * 0.78;
      const g = ctx.createLinearGradient(sx, body, sx + sw, body + cs);
      g.addColorStop(0, accent);
      g.addColorStop(1, '#000000');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.roundRect(-cs / 2, body + sh * 0.02, cs, cs, fs);
      ctx.fill();
      ctx.fillStyle = ink;
      ctx.font = `700 ${fs * 1.15}px ${SANS}`;
      ctx.fillText(lines[0], -cs / 2, body + cs + sh * 0.07, cs);
      ctx.fillStyle = '#8E8E93';
      ctx.font = `500 ${fs * 0.85}px ${SANS}`;
      ctx.fillText(l.title ?? '', -cs / 2, body + cs + sh * 0.11, cs);
      const by = body + cs + sh * 0.15;
      ctx.fillStyle = '#3A3A3C';
      ctx.fillRect(-cs / 2, by, cs, 6);
      ctx.fillStyle = ink;
      ctx.fillRect(-cs / 2, by, cs * Math.min(1, local / 40), 6);
      for (let i = 0; i < 16; i++) {
        const v = 0.25 + 0.75 * hash(i, beat.index) * (0.5 + beat.pulse * 0.5);
        ctx.fillStyle = accent;
        ctx.fillRect(-cs / 2 + i * (cs / 16), by + sh * 0.1 - v * sh * 0.06, cs / 16 - 6, v * sh * 0.06);
      }
      break;
    }
    case 'notify': {
      // banners drop in from the top one by one, newest on top
      const shown = Math.min(lines.length, 1 + Math.floor(local / 1.4));
      ctx.font = `500 ${fs * 0.95}px ${SANS}`;
      for (let i = 0; i < shown; i++) {
        const j = shown - 1 - i;
        const drop = i === 0 ? Math.min(1, (local - (shown - 1) * 1.4) / 0.25) : 1;
        const y = body + i * sh * 0.13 - (1 - drop) * sh * 0.1;
        ctx.save();
        ctx.globalAlpha *= drop;
        ctx.fillStyle = 'rgba(242,242,247,0.96)';
        ctx.beginPath();
        ctx.roundRect(sx + sw * 0.04, y, sw * 0.92, sh * 0.115, fs * 0.8);
        ctx.fill();
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.roundRect(sx + sw * 0.08, y + sh * 0.025, fs * 1.6, fs * 1.6, fs * 0.4);
        ctx.fill();
        ctx.fillStyle = '#1C1C1E';
        ctx.fillText(lines[j], sx + sw * 0.08 + fs * 2.2, y + sh * 0.06, sw * 0.62);
        ctx.restore();
      }
      break;
    }
  }
  ctx.restore();
}

/** A comic burst (spiky, a word inside), a speech balloon with a tail or a thought balloon with its bubbles. */
function burst(ctx: CanvasRenderingContext2D, l: Extract<KitLayer, { kind: 'burst' }>, age: number, kick: number) {
  const { cx, cy, w, h } = burstBox(l);
  const pop = Math.min(1, age / 0.18);
  ctx.translate(cx, cy);
  ctx.rotate(((l.tilt ?? -6) * Math.PI) / 180);
  ctx.scale(pop * kick * (pop < 1 ? 1.15 : 1), pop * kick * (pop < 1 ? 1.15 : 1));
  ctx.fillStyle = l.color;
  ctx.strokeStyle = l.ink ?? '#111111';
  ctx.lineWidth = Math.max(5, h * 0.025);
  ctx.lineJoin = 'round';
  ctx.beginPath();
  const type = l.type ?? 'boom';
  if (type === 'boom') {
    const n = 16;
    for (let i = 0; i < n * 2; i++) {
      const a = (i / (n * 2)) * Math.PI * 2;
      const r = i % 2 ? 0.62 + 0.08 * hash(i, 7) : 1 - 0.12 * hash(i, 9);
      ctx.lineTo((Math.cos(a) * r * w) / 2, (Math.sin(a) * r * h) / 2);
    }
    ctx.closePath();
  } else {
    ctx.ellipse(0, 0, w / 2, h / 2.4, 0, 0, Math.PI * 2);
    if (type === 'speech') {
      ctx.moveTo(w * 0.08, h * 0.38);
      ctx.lineTo(w * 0.26, h * 0.62);
      ctx.lineTo(w * 0.22, h * 0.34);
    }
  }
  ctx.fill();
  ctx.stroke();
  if (type === 'thought')
    [0.12, 0.07].forEach((r, i) => {
      ctx.beginPath();
      ctx.arc(w * (0.3 + i * 0.12), h * (0.5 + i * 0.16), r * h, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
  if (!l.text) return;
  ctx.fillStyle = l.ink ?? '#111111';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const n = Math.max(1, [...l.text].length);
  ctx.font = `400 ${Math.min(h * 0.42, (w * 0.62) / n)}px ${POP}`;
  ctx.fillText(l.text, 0, 0);
}

/** A jagged torn edge along a rectangle, as a path. */
function tornRect(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number) {
  const pts: [number, number][] = [];
  const side = (x0: number, y0: number, x1: number, y1: number, s: number) => {
    const n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / 16));
    for (let i = 0; i < n; i++) {
      const u = i / n;
      const j = (hash(seed + s, i) - 0.5) * 9;
      pts.push([x0 + (x1 - x0) * u + (y1 - y0 ? j : 0), y0 + (y1 - y0) * u + (x1 - x0 ? j : 0)]);
    }
  };
  side(-w / 2, -h / 2, w / 2, -h / 2, 1);
  side(w / 2, -h / 2, w / 2, h / 2, 2);
  side(w / 2, h / 2, -w / 2, h / 2, 3);
  side(-w / 2, h / 2, -w / 2, -h / 2, 4);
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}

/** Torn paper scraps around the frame's edges (never its middle), each pinned by a strip of washi tape, landing one by one. */
function scraps(ctx: CanvasRenderingContext2D, l: Extract<KitLayer, { kind: 'scraps' }>, age: number) {
  const n = l.count ?? 7;
  const seed = l.seed ?? 3;
  const colors = l.colors?.length ? l.colors : [l.color ?? '#F3E9D2'];
  for (let i = 0; i < n; i++) {
    const land = Math.min(1, Math.max(0, (age - i * 0.09) / 0.2));
    if (!land) continue;
    // around an ellipse that leaves the lyric band free
    const a = (i / n) * Math.PI * 2 + hash(seed, i) * 0.6;
    const x = W / 2 + Math.cos(a) * W * 0.4;
    const y = H / 2 + Math.sin(a) * H * 0.4;
    const [w, h] = [200 + 240 * hash(seed, i + 20), 130 + 170 * hash(seed, i + 40)];
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((hash(seed, i + 60) - 0.5) * 0.4);
    ctx.scale(1.1 - 0.1 * land, 1.1 - 0.1 * land);
    ctx.globalAlpha *= land;
    ctx.shadowColor = 'rgba(0,0,0,0.22)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 5;
    ctx.fillStyle = colors[i % colors.length];
    tornRect(ctx, w, h, seed * 31 + i);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    // washi tape across the top edge, see-through, with zigzag ends
    const tw = w * 0.5;
    ctx.fillStyle = l.tape ?? 'rgba(240,200,120,0.75)';
    ctx.globalAlpha *= 0.8;
    ctx.beginPath();
    ctx.moveTo(-tw / 2, -h / 2 - 18);
    for (let z = 0; z <= 4; z++) ctx.lineTo(-tw / 2 + (z % 2 ? 6 : 0), -h / 2 - 18 + z * 9);
    ctx.lineTo(tw / 2, -h / 2 + 18);
    for (let z = 0; z <= 4; z++) ctx.lineTo(tw / 2 - (z % 2 ? 6 : 0), -h / 2 + 18 - z * 9);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

/** Spray paint: soft clouds with speckled overspray at the edges, drips that run down, and an optional stencil word. */
function spray(ctx: CanvasRenderingContext2D, l: Extract<KitLayer, { kind: 'spray' }>, age: number) {
  const n = l.count ?? 5;
  const seed = l.seed ?? 5;
  const colors = l.colors?.length ? l.colors : [l.color];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + hash(seed, i);
    const x = W / 2 + Math.cos(a) * W * (0.3 + 0.15 * hash(seed, i + 3));
    const y = H / 2 + Math.sin(a) * H * (0.3 + 0.12 * hash(seed, i + 5));
    const r = 120 + 160 * hash(seed, i + 7);
    const c = colors[i % colors.length];
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, c);
    g.addColorStop(0.55, c);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = c;
    for (let d = 0; d < 140; d++) {
      const aa = hash(i * 300 + d, seed) * Math.PI * 2;
      const rr = r * (0.8 + 0.6 * hash(i * 300 + d, seed + 1));
      ctx.fillRect(x + Math.cos(aa) * rr, y + Math.sin(aa) * rr, 2.5, 2.5);
    }
    if (l.drips === false) continue;
    // drips run for the first seconds of the section, each to its own length, ending in a bead
    ctx.strokeStyle = c;
    ctx.lineCap = 'round';
    for (let d = 0; d < 3; d++) {
      const dx = x + (hash(i, d + seed) - 0.5) * r;
      const len = Math.min(1, age / (2 + 2 * hash(i, d + 9))) * (60 + 200 * hash(i, d + 11));
      ctx.lineWidth = 6 + 6 * hash(i, d + 13);
      ctx.beginPath();
      ctx.moveTo(dx, y + r * 0.35);
      ctx.lineTo(dx, y + r * 0.35 + len);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(dx, y + r * 0.35 + len, ctx.lineWidth * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (!l.text) return;
  // a stencil word: heavy type with the bridge a cut stencil leaves (a gap through every stroke's middle)
  const s = l.size ?? 220;
  const ty = py(l.y ?? 0.62);
  // cut in its own canvas: the bridges must open the word only, never the wall under it
  const c = (stencilCanvas ??= new OffscreenCanvas(W, Math.ceil(s * 1.4)));
  if (c.height < s * 1.4) c.height = Math.ceil(s * 1.4);
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = 'source-over';
  g.font = `900 ${s}px ${SANS}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = l.color;
  const mid = c.height / 2;
  g.fillText(l.text, W / 2, mid, W * 0.9);
  g.globalCompositeOperation = 'destination-out';
  g.fillRect(0, mid - s * 0.035, W, s * 0.07);
  ctx.drawImage(c, 0, ty - mid);
}
let stencilCanvas: OffscreenCanvas | undefined;

const ledCache = new Map<string, { w: number; h: number; on: Uint8Array }>();
/** Text as an on/off dot grid `rows` dots high (drawn once into a small canvas, then sampled). */
function ledGlyphs(text: string, rows: number) {
  const key = `${rows}|${text}`;
  const hit = ledCache.get(key);
  if (hit) return hit;
  const c = new OffscreenCanvas(Math.max(1, rows * [...text].length * 1.1 + rows), rows);
  const g = c.getContext('2d')!;
  g.font = `400 ${rows}px "DotGothic16", monospace`;
  g.textBaseline = 'top';
  g.fillStyle = '#fff';
  g.fillText(text, 0, 0);
  const w = Math.ceil(g.measureText(text).width) + rows;
  const data = g.getImageData(0, 0, Math.min(c.width, w), rows).data;
  const on = new Uint8Array(Math.min(c.width, w) * rows);
  for (let i = 0; i < on.length; i++) on[i] = data[i * 4 + 3] > 110 ? 1 : 0;
  const out = { w: Math.min(c.width, w), h: rows, on };
  ledCache.set(key, out);
  return out;
}

/** Seconds without a call before the board goes back to its idle text (a new burst of calls starts the row afresh). */
export const LED_IDLE = 3;

/**
 * Where the calls sit on the board at t, in dots: each call is set after the one before it in its burst (calls less
 * than LED_IDLE apart), and the row slides left (0.15 s) when a new one would run past the right edge, so a dense
 * burst never stacks two calls on each other. Undefined while the board is idle.
 */
export function ledCallLayout(widths: number[], ats: number[], t: number, cols: number, gap: number): { shift: number; items: { i: number; x: number; age: number }[] } | undefined {
  const last = ats.reduce((k, a, i) => (a <= t ? i : k), -1);
  if (last < 0 || t - ats[last] > LED_IDLE) return undefined;
  let first = last;
  while (first > 0 && ats[first] - ats[first - 1] <= LED_IDLE) first--;
  const xs: number[] = [];
  for (let i = first; i <= last; i++) xs.push(i === first ? gap : xs[xs.length - 1] + widths[i - 1] + gap);
  const need = (k: number) => Math.max(0, xs[k] + widths[first + k] + gap - cols);
  const k = last - first;
  const e = Math.min(1, (t - ats[last]) / 0.15);
  const shift = (k ? need(k - 1) : 0) + (need(k) - (k ? need(k - 1) : 0)) * (1 - (1 - e) ** 3);
  return { shift, items: xs.map((x, j) => ({ i: first + j, x, age: t - ats[first + j] })) };
}

/** An LED dot-matrix board across the frame: the text scrolls left in lit dots over the dim unlit ones; a calls
 * board sets each call on it as it is shouted (white for a moment, then the board's colour, older ones dimmer). */
function led(ctx: CanvasRenderingContext2D, l: Extract<KitLayer, { kind: 'led' }>, t: number, beat: Beat) {
  // a calls board is read from across the frame: taller dots
  const bh = l.height ?? (l.calls ? 150 : 120);
  const rows = 16;
  const pitch = bh / rows;
  const y0 = py(l.y ?? -0.82) - bh / 2;
  ctx.fillStyle = '#050505';
  ctx.fillRect(0, y0 - pitch, W, bh + pitch * 2);
  const cols = Math.ceil(W / pitch);
  const r = pitch * 0.36;
  const dot = (i: number, j: number) => {
    ctx.beginPath();
    ctx.arc(i * pitch + pitch / 2, y0 + j * pitch + pitch / 2, r, 0, Math.PI * 2);
    ctx.fill();
  };
  const script = l.calls ? (l.script ?? []) : [];
  const glyphs = script.map((c) => ledGlyphs(c.text, rows));
  const lay = l.calls ? ledCallLayout(glyphs.map((g) => g.w), script.map((c) => c.at), t, cols, rows) : undefined;
  if (lay) {
    ctx.fillStyle = l.off ?? 'rgba(255,255,255,0.07)';
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) dot(i, j);
    const base = ctx.globalAlpha;
    for (const it of lay.items) {
      const g = glyphs[it.i];
      const x0 = Math.round(it.x - lay.shift);
      const each = (f: (i: number, j: number) => void) => {
        for (let gx = Math.max(0, -x0); gx < g.w && x0 + gx < cols; gx++) for (let j = 0; j < rows; j++) if (g.on[j * g.w + gx]) f(x0 + gx, j);
      };
      // the newest call glows: a soft halo around its lit dots (older ones stay readable, a little dimmer)
      const fresh = it.age < 1.2;
      if (fresh) {
        ctx.fillStyle = l.color;
        ctx.globalAlpha = base * 0.22;
        each((i, j) => {
          ctx.beginPath();
          ctx.arc(i * pitch + pitch / 2, y0 + j * pitch + pitch / 2, pitch * 0.95, 0, Math.PI * 2);
          ctx.fill();
        });
      }
      ctx.fillStyle = it.age < 0.1 ? '#FFFFFF' : l.color;
      ctx.globalAlpha = base;
      each(dot);
    }
    ctx.globalAlpha = base;
    return;
  }
  const g = ledGlyphs(`${l.text ?? '★'}　　`, rows);
  const shift = Math.floor((t * (l.speed ?? 220)) / pitch);
  const base = ctx.globalAlpha;
  // between calls a calls board's idle text is dim: the calls are what the board is for
  const lit1 = base * (l.calls ? 0.35 : beat.since < 0.08 ? 1.3 : 1);
  for (let i = 0; i < cols; i++) {
    const gx = (((i + shift) % g.w) + g.w) % g.w;
    for (let j = 0; j < rows; j++) {
      const lit = g.on[j * g.w + gx];
      ctx.fillStyle = lit ? l.color : (l.off ?? 'rgba(255,255,255,0.07)');
      ctx.globalAlpha = lit ? Math.min(1, lit1) : base;
      dot(i, j);
    }
  }
  ctx.globalAlpha = base;
}

/** Stage beams: cones of light from the rig at the top, sweeping, brighter on the beat. */
function beams(ctx: CanvasRenderingContext2D, l: Extract<KitLayer, { kind: 'beams' }>, t: number, kick: number) {
  const n = l.count ?? 5;
  const colors = l.colors?.length ? l.colors : [l.color];
  // the beat brightens the layer's own opacity, never past it (opacity 0 is the lights off)
  const base = ctx.globalAlpha;
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < n; i++) {
    const x = (W * (i + 0.5)) / n;
    const a = Math.sin(t * (l.spin ?? 0.6) + i * 1.7) * 0.45;
    const len = H * 1.25;
    const spread = 0.12;
    const g = ctx.createLinearGradient(x, 0, x + Math.sin(a) * len, Math.cos(a) * len);
    const c = colors[i % colors.length];
    g.addColorStop(0, c);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.globalAlpha = base * Math.min(1, 0.5 * kick);
    ctx.beginPath();
    ctx.moveTo(x, -10);
    ctx.lineTo(x + Math.sin(a - spread) * len, Math.cos(a - spread) * len);
    ctx.lineTo(x + Math.sin(a + spread) * len, Math.cos(a + spread) * len);
    ctx.closePath();
    ctx.fill();
  }
}

/** A glitch over everything drawn so far: bands of the frame shifted sideways and a few colour blocks, in bursts on the beat. */
function glitch(ctx: CanvasRenderingContext2D, l: Extract<KitLayer, { kind: 'glitch' }>, t: number, beat: Beat) {
  const amount = l.amount ?? 0.5;
  // a burst right after each beat, and a rarer one between beats
  const step = Math.floor(t * 12);
  if (!(beat.since < 0.12 || hash(step, l.seed ?? 1) < amount * 0.15)) return;
  const canvas = ctx.canvas as HTMLCanvasElement;
  const sx = canvas.width / W;
  const sy = canvas.height / H;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const n = Math.round(3 + amount * 9);
  for (let i = 0; i < n; i++) {
    const y = hash(step, i) * H;
    const h = 8 + hash(step, i + 50) * 70;
    const dx = (hash(step, i + 100) - 0.5) * 160 * amount;
    ctx.drawImage(canvas, 0, y * sy, canvas.width, h * sy, dx * sx, y * sy, canvas.width, h * sy);
  }
  ctx.restore();
  for (let i = 0; i < Math.round(amount * 6); i++) {
    ctx.fillStyle = i % 2 && l.color2 ? l.color2 : l.color;
    ctx.fillRect(hash(step, i + 200) * W, hash(step, i + 300) * H, 40 + hash(step, i + 400) * 260, 6 + hash(step, i + 500) * 26);
  }
}

/** The kit's patterns, in pattern()'s space (rotated, origin moved to −W,−H, `span` modules across); false if not one. */
export function kitPattern(ctx: CanvasRenderingContext2D, type: string, s: number, color: string, span: [number, number], t: number): boolean {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  switch (type as KitPattern) {
    case 'lined': {
      // ruled notebook paper: thin rules every module and the red margin line
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let j = 0; j < span[1]; j++) ctx.rect(0, j * s, W * 2 + s * 2, 0.001);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(226,87,76,0.75)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(W * 0.68, 0);
      ctx.lineTo(W * 0.68, H * 2 + s * 2);
      ctx.stroke();
      return true;
    }
    case 'staff': {
      // music staves: five lines a staff, one staff every module
      ctx.lineWidth = 2;
      const gap = Math.max(8, s / 9);
      ctx.beginPath();
      for (let j = 0; j < span[1]; j++) for (let k = 0; k < 5; k++) ctx.rect(0, j * s + k * gap, W * 2 + s * 2, 0.001);
      ctx.stroke();
      return true;
    }
    case 'guilloche': {
      // banknote guilloche: many thin interlaced sine curves in bands, drifting slowly
      ctx.lineWidth = 1.5;
      for (let j = 0; j < span[1]; j += 3)
        for (let k = 0; k < 12; k++) {
          ctx.beginPath();
          for (let x = 0; x <= W * 2 + s * 2; x += 12) {
            const y = j * s + Math.sin(x / (s * 0.9) + k * 0.52 + t * 0.15) * s * 0.7 + Math.sin(x / (s * 2.3) - k * 0.3) * s * 0.3;
            if (x) ctx.lineTo(x, y);
            else ctx.moveTo(x, y);
          }
          ctx.stroke();
        }
      return true;
    }
    case 'wavy': {
      // 70s groovy stripes: fat wavy bands that roll sideways
      ctx.lineWidth = s * 0.5;
      ctx.lineCap = 'round';
      for (let j = 0; j < span[1]; j++) {
        ctx.beginPath();
        for (let x = 0; x <= W * 2 + s * 2; x += 16) {
          const y = j * s + Math.sin(x / (s * 1.6) + t * 0.8) * s * 0.35;
          if (x) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        }
        ctx.stroke();
      }
      return true;
    }
    case 'iso': {
      // isometric grid: verticals and the two 30° families
      ctx.lineWidth = 2;
      const dx = s * Math.sqrt(3);
      const L = W * 2 + H * 2;
      ctx.beginPath();
      for (let i = -span[1]; i < span[0] * 2; i++) {
        ctx.moveTo(i * dx, 0);
        ctx.lineTo(i * dx, H * 2 + s * 2);
        ctx.moveTo(i * dx, 0);
        ctx.lineTo(i * dx + L * Math.cos(Math.PI / 6), L * Math.sin(Math.PI / 6));
        ctx.moveTo(i * dx, 0);
        ctx.lineTo(i * dx - L * Math.cos(Math.PI / 6), L * Math.sin(Math.PI / 6));
      }
      ctx.stroke();
      return true;
    }
    default:
      return false;
  }
}

/** The geometry of a broken screen, shared by its crack lines and its shard map so the two line up exactly. */
interface Glass {
  k: number;
  ox: number;
  oy: number;
  /** Radial cracks as polylines from the point of impact outward, each extended past the frame edge. */
  rays: [number, number][][];
  seed: number;
}

/** Where the glass broke and how: radial cracks from the point of impact (up and to the left, where the thread never is). */
export function glassOf(w: number, h: number, crack: number, seed = 7): Glass | undefined {
  const k = Math.max(0, Math.min(1, crack));
  if (!k) return undefined;
  const [ox, oy] = [w * (0.14 + 0.3 * hash(seed, 1)), h * (0.17 + 0.13 * hash(seed, 2))];
  const n = Math.round(12 + k * 16);
  const rays: [number, number][][] = [];
  for (let i = 0; i < n; i++) {
    let [x, y] = [ox, oy];
    let a = (i / n) * Math.PI * 2 + (hash(seed, i + 10) - 0.5) * 0.35;
    const len = (h * 0.25 + w * 0.5 * hash(seed, i + 20)) * (0.45 + 0.55 * k);
    const pts: [number, number][] = [[x, y]];
    for (let d = 0; d < len; d += 28) {
      a += (hash(seed + i, d) - 0.5) * 0.35;
      x += Math.cos(a) * 28;
      y += Math.sin(a) * 28;
      pts.push([x, y]);
    }
    // past the visible end the crack runs on straight to the frame edge (the shard between two rays is closed)
    pts.push([x + Math.cos(a) * w * 2, y + Math.sin(a) * w * 2]);
    rays.push(pts);
  }
  return { k, ox, oy, rays, seed };
}

/**
 * The shard map of a broken screen, for the final pass (engine.ts): every shard between two cracks a flat colour whose
 * red and green are how far that piece of glass shifts the picture under it (0.5 none) and blue how much lighter or
 * darker it is; the shards near the impact shift most. Untouched glass is mid grey.
 */
export function drawGlassShards(g: OffscreenCanvasRenderingContext2D, w: number, h: number, glass: Glass) {
  g.fillStyle = 'rgb(128,128,128)';
  g.fillRect(0, 0, w, h);
  const { seed, k } = glass;
  for (const p of glassPieces(glass)) {
    const amp = (30 + 60 * p.near) * k;
    const v = (o: number) => Math.round(128 + (hash(seed + p.id, o) - 0.5) * 2 * amp);
    g.fillStyle = `rgb(${v(1)},${v(2)},${Math.round(128 + (hash(seed + p.id * 3, 3) - 0.5) * 200 * k)})`;
    g.beginPath();
    p.pts.forEach(([x, y]) => g.lineTo(x, y));
    g.closePath();
    g.fill();
  }
}

/** The shards of a broken screen: the cells between neighbouring cracks and successive rings, the outer ones reaching
 * past the frame edge; `near` is 1 at the impact, 0 at the edge. */
export function glassPieces(glass: Glass): { id: number; near: number; pts: [number, number][] }[] {
  const rings = [0, 1, 2, 3, 5, 7, 10];
  const out: { id: number; near: number; pts: [number, number][] }[] = [];
  glass.rays.forEach((r, i) => {
    const r2 = glass.rays[(i + 1) % glass.rays.length];
    for (let j = 0; j < rings.length; j++) {
      const a0 = Math.min(rings[j], r.length - 2);
      const b0 = Math.min(rings[j], r2.length - 2);
      const a1 = j + 1 < rings.length ? Math.min(rings[j + 1], r.length - 1) : r.length - 1;
      const b1 = j + 1 < rings.length ? Math.min(rings[j + 1], r2.length - 1) : r2.length - 1;
      if (a1 <= a0 && b1 <= b0) continue;
      const pts: [number, number][] = [];
      for (let q = a0; q <= a1; q++) pts.push(r[q]);
      for (let q = b1; q >= b0; q--) pts.push(r2[q]);
      out.push({ id: i * 16 + j, near: 1 - j / rings.length, pts });
    }
  });
  return out;
}

/**
 * The crack lines of a broken screen (over the picture, `g` w×h, transparent elsewhere): a crushed hole at the point
 * of impact with slivers round it, radial cracks that taper and fork, a spider-web of short links between them, glints
 * along some edges, and at `crack` over 0.7 a black leak of dead pixels from a corner.
 */
export function drawGlassCrack(g: OffscreenCanvasRenderingContext2D, w: number, h: number, crack: number, seed = 7) {
  const glass = glassOf(w, h, crack, seed);
  if (!glass) return;
  const { k, ox, oy, rays } = glass;
  const hs = (a: number, b: number) => hash(glass.seed * 131 + a, b);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  // radial cracks: hairlines, a few heavier; each catches light on one edge and throws a dark line on the other,
  // and sheds many small forks and micro-fractures along its length
  rays.forEach((pts0, i) => {
    const pts = pts0.slice(0, -1);
    const heavy = hs(i, 1) > 0.65 ? 1.8 : 1;
    pts.slice(1).forEach(([x2, y2], j) => {
      const [x1, y1] = pts[j];
      const t = j / pts.length;
      g.strokeStyle = 'rgba(0,0,0,0.4)';
      g.lineWidth = (1.6 - t) * heavy + 0.6;
      g.beginPath();
      g.moveTo(x1 + 1.2, y1 + 1.2);
      g.lineTo(x2 + 1.2, y2 + 1.2);
      g.stroke();
      g.strokeStyle = `rgba(255,255,255,${0.85 - 0.5 * t})`;
      g.lineWidth = Math.max(0.6, (1.5 - t) * heavy);
      g.beginPath();
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
      g.stroke();
      const dir = Math.atan2(y2 - y1, x2 - x1);
      if (hs(i * 50 + j, 2) > 0.82) {
        // a fork: a short crack branching off at 30–60°, itself bent once
        const fa = dir + (hs(i * 50 + j, 3) > 0.5 ? 1 : -1) * (0.5 + 0.5 * hs(i * 50 + j, 4));
        const fl = (20 + 70 * hs(i * 50 + j, 5)) * (1 - t * 0.6);
        const mx = x2 + Math.cos(fa) * fl * 0.55;
        const my = y2 + Math.sin(fa) * fl * 0.55;
        g.strokeStyle = `rgba(255,255,255,${0.6 - 0.3 * t})`;
        g.lineWidth = 0.8;
        g.beginPath();
        g.moveTo(x2, y2);
        g.lineTo(mx, my);
        g.lineTo(mx + Math.cos(fa + 0.3) * fl * 0.45, my + Math.sin(fa + 0.3) * fl * 0.45);
        g.stroke();
      }
      if (hs(i * 50 + j, 6) > 0.92) {
        // micro-fractures: a little fan of 2–4 tiny splinters
        g.strokeStyle = 'rgba(255,255,255,0.45)';
        g.lineWidth = 0.6;
        for (let m = 0; m < 2 + Math.floor(hs(i * 50 + j, 7) * 3); m++) {
          const ma = dir + (hs(i * 50 + j, 8 + m) - 0.5) * 2.6;
          const ml = 6 + 14 * hs(i * 50 + j, 12 + m);
          g.beginPath();
          g.moveTo(x1, y1);
          g.lineTo(x1 + Math.cos(ma) * ml, y1 + Math.sin(ma) * ml);
          g.stroke();
        }
      }
    });
  });
  // the spider-web: irregular arcs between neighbouring cracks at several distances, with gaps
  for (const ring of [1, 2, 3, 5, 7, 10].slice(0, 2 + Math.round(k * 4))) {
    rays.forEach((r, i) => {
      if (hs(i * 13 + ring, 20) < 0.3) return;
      const r2 = rays[(i + 1) % rays.length];
      const a = r[Math.min(ring, r.length - 2)];
      const b = r2[Math.min(ring, r2.length - 2)];
      // bowed outward a little, like a real concentric fracture
      const mx = (a[0] + b[0]) / 2 + (a[0] + b[0] - 2 * ox) * 0.06;
      const my = (a[1] + b[1]) / 2 + (a[1] + b[1] - 2 * oy) * 0.06;
      g.strokeStyle = `rgba(255,255,255,${0.55 - ring * 0.035})`;
      g.lineWidth = 0.9;
      g.beginPath();
      g.moveTo(a[0], a[1]);
      g.quadraticCurveTo(mx, my, b[0], b[1]);
      g.stroke();
    });
  }
  // the crush zone at the impact: a frosted cluster of tiny shards, white-edged, densest in the middle
  const R = 34 + 50 * k;
  const frost = g.createRadialGradient(ox, oy, 0, ox, oy, R * 1.3);
  frost.addColorStop(0, 'rgba(235,240,245,0.55)');
  frost.addColorStop(0.5, 'rgba(220,228,235,0.22)');
  frost.addColorStop(1, 'rgba(220,228,235,0)');
  g.fillStyle = frost;
  g.beginPath();
  g.arc(ox, oy, R * 1.3, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 0.8;
  for (let i = 0; i < 70; i++) {
    const rr = R * Math.sqrt(hs(i, 30));
    const a = hs(i, 31) * Math.PI * 2;
    const [cx, cy] = [ox + Math.cos(a) * rr, oy + Math.sin(a) * rr];
    const sz = 4 + 10 * hs(i, 32) * (1 - rr / R / 1.5);
    g.strokeStyle = `rgba(255,255,255,${0.35 + 0.5 * hs(i, 33)})`;
    g.beginPath();
    for (let v = 0; v < 3 + Math.floor(hs(i, 34) * 3); v++) {
      const va = hs(i, 35 + v) * Math.PI * 2;
      g.lineTo(cx + Math.cos(va) * sz, cy + Math.sin(va) * sz);
    }
    g.closePath();
    g.stroke();
  }
  // glints: small bright points where the broken edges catch the light
  for (let i = 0; i < 14; i++) {
    const r = rays[Math.floor(hs(i, 60) * rays.length)];
    const p = r[Math.min(r.length - 2, 1 + Math.floor(hs(i, 61) * 8))];
    const gl = g.createRadialGradient(p[0], p[1], 0, p[0], p[1], 7);
    gl.addColorStop(0, 'rgba(255,255,255,0.9)');
    gl.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gl;
    g.fillRect(p[0] - 8, p[1] - 8, 16, 16);
  }
  if (k > 0.7) {
    // liquid crystal leaking from the top-left corner: black, with a ragged edge
    const r = ((k - 0.7) / 0.3) * h * 0.5;
    g.fillStyle = '#000000';
    g.beginPath();
    g.moveTo(0, 0);
    for (let i = 0; i <= 14; i++) {
      const a = (i / 14) * (Math.PI / 2);
      const rr = r * (0.7 + 0.3 * hs(i, 140));
      g.lineTo(Math.cos(a) * rr * 1.5, Math.sin(a) * rr);
    }
    g.closePath();
    g.fill();
  }
}
