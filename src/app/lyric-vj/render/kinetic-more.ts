import { LOOPS } from './kinetic-loops';
// The second set of kinetic moves (render/kinetic.ts draws the first): the graphic and background techniques of the
// 534-video knowledge base (out/knowledge) that a flat print can do — particles, screens, scopes, wireframes, HUDs,
// windows, comic bursts, split-flaps, marquees, glitch slices and the rest. Each move has a one-line `help` the
// planner reads (scripts/lyric-vj/typeplan.mts) and a `draw` over the cut's paper; a move that prints the character
// itself (a mirror, a window, a neon outline) returns true so the default placement is skipped.

const W = 1920;
const H = 1080;
const TAU = Math.PI * 2;
export { kn, vary } from './knobs';
import { kn, vary } from './knobs';
const hash = (a: number, b = 0) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));

/** What a move draws with: the cut's inks, words, time since the cut and the printed character. */
export interface Env {
  ctx: CanvasRenderingContext2D;
  age: number;
  /** 0→1 over the cut's first 0.18 s (the entrance). */
  k: number;
  pulse: number;
  /** Seconds since the last beat, and the song's tempo. */
  since: number;
  bpm: number;
  ink: string;
  paper: string;
  accent: string;
  word: (i: number) => string;
  txt: (s: string, x: number, y: number, size: number, color: string, alpha?: number, outline?: boolean) => void;
  /** The character's side of the frame (x centre). */
  cx: number;
  seed: number;
  /** The character printed in the cut's inks, and where it would stand by default. */
  art?: { img: CanvasImageSource; w: number; h: number; y: number; night?: () => CanvasImageSource };
  /** The frame the move draws in: 1920×1080, or 1080×1920 when its flow turns it on its side (see drawMove). */
  W: number;
  H: number;
  /** Text that runs with the move (a band's words): on its side when the move is turned; `txt` stays upright. */
  along?: Env['txt'];
  /** The move's variant (index into its `styles`), kept for the whole song. */
  style: number;
  /** When the cut lands in the song and the song's length (s), when known. */
  at?: number;
  len?: number;
  /** The director's reading for the cut (measure). */
  label?: string;
  /** The song's own variant of a move's look (count, size, speed), the same all song long: see `vary`. */
  song?: number;
  /** How lively the song is, 0 calm … 1 lively: speeds and counts lean with it (knobs.ts). */
  mood?: number;
  /** The stretch of the frame (x, px) the lines sung over the cut leave free ([0, 0]: none; unset: nobody sings). */
  room?: [number, number];
  /** How many different words the cut has: a move that labels its parts has no more parts than that. */
  count?: number;
}
/** A move's parts, one per word: as many as the knob asks but never more than the cut's own words (a loop labelled 思念 twice). */
const parts = (e: Env, key: string, least = 2) => Math.max(least, Math.min(kn(e, key), e.count ?? Infinity));
/** Which way a move runs on screen: left to right, right to left, top to bottom, bottom to top. */
export type Flow = 'ltr' | 'rtl' | 'ttb' | 'btt';
export const FLOWS: readonly Flow[] = ['ltr', 'rtl', 'ttb', 'btt'];
interface Move {
  help: string;
  draw: (e: Env) => boolean | void;
  /** The way the move runs as drawn, and the other ways it can be turned to run (drawMove). */
  native?: Flow;
  flows?: Flow[];
  /** Its variants, one line each for the planner (Env.style picks one). */
  styles?: string[];
}

/** The 12 fps step a hand-drawn effect is redrawn on. */
const step = (age: number, fps = 12) => Math.floor(age * fps);
const star = (ctx: CanvasRenderingContext2D, x: number, y: number, r1: number, r2: number, n: number, rot = 0) => {
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? r2 : r1;
    const a = rot + (i / (n * 2)) * TAU;
    i ? ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r) : ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  ctx.closePath();
};
const line = (ctx: CanvasRenderingContext2D, pts: [number, number][]) => {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
};
/** Draws the character; `negative`: printed with the inks swapped (light on a dark cut, still in the song's inks). */
const art = (e: Env, x: number, y: number, s = 1, alpha = 1, flip = false, negative = false) => {
  if (!e.art) return;
  const { ctx } = e;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.scale(flip ? -s : s, s);
  ctx.drawImage((negative && e.art.night?.()) || e.art.img, -e.art.w / 2, -e.art.h / 2, e.art.w, e.art.h);
  ctx.restore();
};
/** Characters of the cut's words, in order. */
const glyphs = (e: Env, n: number) => Array.from({ length: n }, (_, i) => [...e.word(Math.floor(i / 4))][i % 4] ?? e.word(i)[0] ?? '・');

export const MORE: Record<string, Move> = {
  film: {
    help: '膠卷顆粒：顆粒、塵點、縱向刮痕和輕微閃爍，大字壓在中間（回憶、復古）',
    draw: (e) => {
      const { ctx } = e, f = step(e.age);
      e.txt(e.word(0), W / 2, H / 2, 220, e.ink, 0.9);
      for (let i = 0, n = kn(e, 'film.grain'); i < n; i++) {
        ctx.fillStyle = hash(i, f) > 0.5 ? e.ink : e.paper;
        ctx.globalAlpha = 0.25;
        ctx.fillRect(hash(i, f + 1) * W, hash(i, f + 2) * H, 2, 2);
      }
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = e.ink;
      ctx.lineWidth = 1.5;
      for (let i = 0, n = kn(e, 'film.scratch'); i < n; i++) if (hash(i, f + 9) > 0.4) line(ctx, [[hash(i, f + 3) * W, 0], [hash(i, f + 3) * W + 6, H]]);
      ctx.globalAlpha = 0.06 * hash(f, 4);
      ctx.fillStyle = e.paper;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    },
  },
  crt: {
    help: 'CRT 映像管：掃描線、RGB 錯位的大字、圓角螢幕框（電視、舊時代、訊號）',
    draw: (e) => {
      const { ctx } = e, j = (hash(step(e.age), 1) - 0.5) * 6, d = kn(e, 'crt.shift'), gap = kn(e, 'crt.gap');
      e.txt(e.word(0), W / 2 - d + j, H / 2, 200, e.accent, 0.8);
      e.txt(e.word(0), W / 2 + d + j, H / 2, 200, e.ink, 0.8);
      ctx.fillStyle = e.ink;
      ctx.globalAlpha = 0.18;
      for (let y = (e.age * 40) % gap; y < H; y += gap) ctx.fillRect(0, y, W, 2);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = e.ink;
      ctx.lineWidth = 40;
      ctx.beginPath();
      ctx.roundRect(20, 20, W - 40, H - 40, kn(e, 'crt.round'));
      ctx.stroke();
    },
  },
  inkflow: {
    help: '墨水擴散：幾團墨從中心暈開成大理石紋（情緒擴散、心裡被填滿）',
    draw: (e) => {
      const { ctx } = e;
      const lobes = kn(e, 'inkflow.lobes');
      for (let b = 0, n = kn(e, 'inkflow.n'); b < n; b++) {
        const R = (180 + b * 160) * clamp(e.age / 1.2) + 40;
        ctx.fillStyle = b % 2 ? e.accent : e.ink;
        ctx.globalAlpha = 0.85 - b * 0.2;
        ctx.beginPath();
        for (let i = 0; i <= 64; i++) {
          const a = (i / 64) * TAU;
          const r = R * (0.8 + 0.35 * Math.sin(a * lobes + b + e.age) * hash(b, e.seed) + 0.1 * Math.sin(a * 7 - e.age * 2));
          const x = W / 2 + Math.cos(a) * r * 1.4, y = H / 2 + Math.sin(a) * r;
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    },
  },
  motes: {
    help: '漂浮微粒：前中後三層的小方塊和點慢慢上浮，越前越大（安靜、空氣感）',
    native: 'btt',
    flows: ['ttb', 'ltr', 'rtl'],
    styles: ['方塊和圓點', '只有細小圓點（灰塵、雪）', '短線條（雨絲、流星雨般的速度線）'],
    draw: (e) => {
      const { ctx, W, H } = e;
      ctx.strokeStyle = e.ink;
      const n = kn(e, 'motes.n'), speed = kn(e, 'motes.speed');
      for (let i = 0; i < n; i++) {
        const z = 0.3 + (i % 3) * 0.35;
        const y = (hash(i, e.seed) * H - e.age * (e.style === 2 ? 160 : 40) * speed * z + H * 4) % H;
        const x = hash(i, e.seed + 1) * W + Math.sin(e.age + i) * 10;
        ctx.fillStyle = i % 7 ? e.ink : e.accent;
        ctx.globalAlpha = 0.25 + 0.5 * hash(i, step(e.age, 4));
        const s = (e.style === 1 ? 2 : 4) + z * (e.style === 1 ? 4 : 10);
        if (e.style === 2) {
          ctx.strokeStyle = ctx.fillStyle;
          ctx.lineWidth = 1 + z * 2;
          line(ctx, [[x, y], [x, y + 20 + z * 50]]);
        } else if (e.style === 1 || i % 2 === 0) (ctx.beginPath(), ctx.arc(x, y, s / 2, 0, TAU), ctx.fill());
        else ctx.fillRect(x, y, s, s);
      }
      ctx.globalAlpha = 1;
    },
  },
  kaleido: {
    help: '萬花筒：詞和人物左右鏡射、六向旋轉成對稱圖騰（迷惘、夢、無限）',
    draw: (e) => {
      const { ctx } = e;
      const arms = kn(e, 'kaleido.arms'), r = kn(e, 'kaleido.r');
      for (let i = 0; i < arms; i++) {
        ctx.save();
        ctx.translate(W / 2, H / 2);
        ctx.rotate((i / arms) * TAU + e.age * 0.3);
        e.txt(e.word(i), 0, -r, 64, i % 2 ? e.accent : e.ink);
        ctx.restore();
      }
      if (!e.art) return;
      art(e, W / 2 - e.art.w * 0.42, e.art.y, 0.8);
      art(e, W / 2 + e.art.w * 0.42, e.art.y, 0.8, 1, true);
      return true;
    },
  },
  rain: {
    help: '雨絲風線：斜向細線以 12 格高速掠過全畫面（雨、風、速度、刮痕）',
    draw: (e) => {
      const { ctx } = e, f = step(e.age);
      ctx.strokeStyle = e.ink;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.6;
      const slant = kn(e, 'rain.slant'), len = kn(e, 'rain.len');
      for (let i = 0, n = kn(e, 'rain.n'); i < n; i++) {
        const x = hash(i, f) * (W + 600) - 300, y = hash(i, f + 5) * H, l = len + hash(i, 3) * len;
        line(ctx, [[x, y], [x - l * slant, y + l]]);
      }
      ctx.globalAlpha = 1;
    },
  },
  mirror: {
    help: '水面倒影：下半是水面，詞和人物倒映並隨波紋晃（河、海、回想、自省）',
    draw: (e) => {
      const { ctx } = e, hz = H * kn(e, 'mirror.hz');
      ctx.fillStyle = e.ink;
      ctx.globalAlpha = 0.12;
      ctx.fillRect(0, hz, W, H - hz);
      ctx.globalAlpha = 1;
      e.txt(e.word(0), W - e.cx, hz - 80, 120, e.ink);
      ctx.save();
      ctx.translate(0, hz * 2);
      ctx.scale(1, -1);
      e.txt(e.word(0), W - e.cx, hz - 80, 120, e.ink, 0.25);
      ctx.restore();
      ctx.strokeStyle = e.paper;
      ctx.lineWidth = 3;
      for (let i = 0, n = kn(e, 'mirror.ripples'); i < n; i++) {
        const y = hz + 20 + i * ((H - hz - 20) / n), x = (hash(i, e.seed) * W + e.age * 30 * (i % 2 ? 1 : -1)) % W;
        line(ctx, [[x, y], [x + 140, y]]);
      }
      if (!e.art) return;
      const s = Math.min(1, (hz * 0.9) / e.art.h);
      art(e, e.cx, hz - (e.art.h * s) / 2, s);
      ctx.save();
      ctx.translate(Math.sin(e.age * 3) * 4, hz * 2);
      ctx.scale(1, -1);
      art(e, e.cx, hz - (e.art.h * s) / 2, s, 0.3);
      ctx.restore();
      return true;
    },
  },
  fireworks: {
    help: '煙火：重拍炸開的放射火花往下墜（祭典、夏天、心動爆發）',
    draw: (e) => {
      const { ctx } = e;
      const bursts = kn(e, 'fireworks.n'), sparks = kn(e, 'fireworks.sparks'), R = kn(e, 'fireworks.r');
      for (let b = 0; b < bursts; b++) {
        const t = (e.age - b * 0.35) % 1.4;
        if (t < 0) continue;
        const x = W * ((b + 1) / (bursts + 1)) + (hash(b, e.seed) - 0.5) * 200, y = H * (0.3 + 0.15 * hash(b, e.seed + 1));
        ctx.strokeStyle = b % 2 ? e.accent : e.ink;
        ctx.lineWidth = 4;
        ctx.globalAlpha = clamp(1.4 - t);
        for (let i = 0; i < sparks; i++) {
          const a = (i / sparks) * TAU, r = R * Math.sqrt(t);
          const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r + 90 * t * t;
          line(ctx, [[x + Math.cos(a) * r * 0.7, y + Math.sin(a) * r * 0.7 + 90 * t * t * 0.7], [px, py]]);
        }
      }
      ctx.globalAlpha = 1;
    },
  },
  smoke: {
    help: '煙霧雲氣：大團霧氣極慢捲動和呼吸（夢、迷濛、不安）',
    draw: (e) => {
      const { ctx } = e;
      const size = kn(e, 'smoke.size');
      for (let i = 0, n = kn(e, 'smoke.n'); i < n; i++) {
        const x = (hash(i, e.seed) * W + e.age * 20 * (i % 2 ? 1 : -1)) % (W + 400) - 200;
        const y = hash(i, e.seed + 2) * H, r = (260 + hash(i, 4) * 240) * size + Math.sin(e.age + i) * 20;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, i % 3 ? e.ink : e.accent);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.globalAlpha = 0.18;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
      ctx.globalAlpha = 1;
    },
  },
  bleed: {
    help: '水彩暈邊：四角的不規則色塊往內暈開（溫柔、回憶的邊框）',
    draw: (e) => {
      const { ctx } = e;
      [[0, 0], [W, 0], [0, H], [W, H]].forEach(([x, y], c) => {
        ctx.fillStyle = c % 2 ? e.accent : e.ink;
        ctx.globalAlpha = 0.35;
        for (let b = 0, n = kn(e, 'bleed.n'); b < n; b++) {
          const r = (kn(e, 'bleed.reach') + b * 70) * clamp(e.age / 1.5 + 0.3) * (0.8 + hash(c * 9 + b, e.seed) * 0.5);
          ctx.beginPath();
          ctx.arc(x + (hash(b, c) - 0.5) * 120, y + (hash(b, c + 3) - 0.5) * 120, r, 0, TAU);
          ctx.fill();
        }
      });
      ctx.globalAlpha = 1;
    },
  },
  chat: {
    help: '手機聊天：手機框裡詞一句句變成對話氣泡彈出往上推（訊息、告白、聯絡）',
    draw: (e) => {
      const { ctx } = e, x = W - e.cx - 260, n = Math.min(kn(e, 'chat.n'), 1 + Math.floor(e.age / 0.35));
      ctx.fillStyle = e.ink;
      ctx.beginPath();
      ctx.roundRect(x, 90, 520, 900, 60);
      ctx.fill();
      ctx.fillStyle = e.paper;
      ctx.beginPath();
      ctx.roundRect(x + 24, 150, 472, 790, 30);
      ctx.fill();
      for (let i = 0; i < n; i++) {
        const mine = i % 2 === 1, y = 880 - (n - 1 - i) * 130, w = kn(e, 'chat.w');
        ctx.fillStyle = mine ? e.accent : e.ink;
        ctx.beginPath();
        ctx.roundRect(mine ? x + 472 - w : x + 48, y - 45, w, 90, 40);
        ctx.fill();
        e.txt(e.word(i), mine ? x + 472 - w / 2 : x + 48 + w / 2, y, 40, e.paper);
      }
    },
  },
  filmstrip: {
    help: '底片框：左右兩側底片齒孔以 12 格跳動，中間是詞（電影、回放、紀念）',
    native: 'ttb',
    flows: ['btt', 'ltr', 'rtl'],
    styles: ['兩側寬片框', '單側窄片框（像剪接台）', '兩側片框加格線與片號'],
    draw: (e) => {
      const { ctx, W, H } = e, j = (hash(step(e.age), 2) - 0.5) * 4;
      const band = (e.style === 1 ? 110 : 160) * kn(e, 'filmstrip.band'), gap = kn(e, 'filmstrip.holes');
      for (const x of e.style === 1 ? [0] : [0, W - band]) {
        ctx.fillStyle = e.ink;
        ctx.fillRect(x, 0, band, H);
        ctx.fillStyle = e.paper;
        for (let y = -gap / 2 + ((e.age * 120) % gap) + j; y < H; y += gap) {
          ctx.beginPath();
          ctx.roundRect(x + band / 2 - 30, y, 60, 50, 8);
          ctx.fill();
        }
      }
      if (e.style === 2) {
        ctx.strokeStyle = e.ink;
        ctx.globalAlpha = 0.25;
        ctx.lineWidth = 2;
        for (let y = ((e.age * 120) % (H / 3)) - H / 3; y < H; y += H / 3) line(ctx, [[band, y], [W - band, y]]);
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = e.ink;
        ctx.font = '700 22px "Space Mono", monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`KODAK ${String(e.seed).padStart(3, '0')}A`, band + 16, 40);
        ctx.globalAlpha = 1;
      }
      e.txt(e.word(0), W / 2, H * 0.85, 90, e.ink);
    },
  },
  zones: {
    help: '三段分區：上下兩條深色帶跑小字，中間強調色帶放一個大詞（切換、對比）',
    draw: (e) => {
      const { ctx } = e;
      const edge = kn(e, 'zones.edge'), mid = kn(e, 'zones.mid');
      ctx.fillStyle = e.ink;
      ctx.fillRect(0, 0, W, H * edge * e.k);
      ctx.fillRect(0, H - H * edge * e.k, W, H * edge);
      ctx.fillStyle = e.accent;
      ctx.fillRect(0, H * (0.5 - mid / 2), W * e.k, H * mid);
      for (const [y, d] of [[H * edge * 0.5, 1], [H * (1 - edge * 0.5), -1]] as const)
        for (let i = 0; i < 8; i++) e.txt(e.word(i), ((i * 320 + e.age * 120 * d) % (W + 320) + W + 320) % (W + 320) - 160, y, 48, e.paper, 0.8);
      e.txt(e.word(0), W / 2, H / 2, 150, e.paper);
    },
  },
  scope: {
    help: '示波器邊線：上下兩條細波形線隨拍跳動（聲音、心跳、電子感）',
    flows: ['rtl', 'ttb', 'btt'],
    styles: ['正弦波（柔和）', '方波（數位、機械）', '等化器短柱（音量、節奏感）'],
    draw: (e) => {
      const { ctx, W, H } = e;
      ctx.strokeStyle = e.ink;
      ctx.fillStyle = e.ink;
      ctx.lineWidth = 3;
      const off = kn(e, 'scope.y'), freq = kn(e, 'scope.freq');
      for (const [y0, d] of [[off, -1], [H - off, 1]] as const) {
        const amp = (x: number) => (8 + 60 * e.pulse) * hash(Math.floor(x / 60), step(e.age, 24));
        if (e.style === 2) {
          for (let x = 0; x <= W; x += 24) ctx.fillRect(x, y0, 14, d * (6 + amp(x) * 1.2));
          continue;
        }
        const pts: [number, number][] = [];
        for (let x = 0; x <= W; x += e.style === 1 ? 4 : 12) {
          const ph = x * freq - e.age * 8;
          const wave = e.style === 1 ? Math.sign(Math.sin(ph)) : Math.sin(ph);
          pts.push([x, y0 + wave * amp(x)]);
        }
        line(ctx, pts);
      }
      e.txt(e.word(0), W / 2, H / 2, 120, e.ink, 0.25, true);
    },
  },
  fall: {
    help: '主題飄落：歌詞的字一個個斜斜飄落並旋轉（櫻花、雪、思念落下）',
    native: 'ttb',
    flows: ['btt', 'ltr', 'rtl'],
    styles: ['斜斜飄落、旋轉', '筆直落下、不轉（重量、雨）', '慢慢搖擺飄落（花瓣、羽毛）'],
    draw: (e) => {
      const { ctx, W, H } = e, gs = glyphs(e, 24), size = kn(e, 'fall.size'), speed = kn(e, 'fall.speed');
      for (let i = 0, n = kn(e, 'fall.n'); i < n; i++) {
        const sp = ((e.style === 1 ? 220 : 80) + hash(i, e.seed) * 120) * speed, t = e.age * sp;
        const drift = e.style === 1 ? 0 : e.style === 2 ? Math.sin(e.age * 1.6 + i) * 60 : t * 0.7;
        const x = ((hash(i, e.seed + 1) * (W + 400) + drift + W + 400) % (W + 400)) - 200, y = ((hash(i, e.seed + 2) * H + t) % (H + 200)) - 100;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(e.style === 1 ? 0 : e.style === 2 ? Math.sin(e.age * 1.6 + i) * 0.5 : e.age * (hash(i, 5) - 0.5) * 3);
        e.txt(gs[i % gs.length], 0, 0, (30 + hash(i, 6) * 70) * size, i % 5 ? e.ink : e.accent, 0.5 + 0.5 * hash(i, 7));
        ctx.restore();
      }
    },
  },
  hud: {
    help: 'HUD 鎖定：準心、刻度、L 角標和縮小的圓環鎖定一個詞（注視、目標、發現）',
    draw: (e) => {
      const { ctx } = e, x = W - e.cx, y = H / 2, r0 = kn(e, 'hud.r'), r = r0 - (r0 - 160) * clamp(e.age / 0.5), ticks = kn(e, 'hud.ticks');
      ctx.strokeStyle = e.ink;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.stroke();
      for (let i = 0; i < ticks; i++) {
        const a = (i / ticks) * TAU + e.age * 0.4;
        line(ctx, [[x + Math.cos(a) * (r + 10), y + Math.sin(a) * (r + 10)], [x + Math.cos(a) * (r + (i % 3 ? 22 : 40)), y + Math.sin(a) * (r + (i % 3 ? 22 : 40))]]);
      }
      line(ctx, [[x - r - 80, y], [x - r + 40, y]]);
      line(ctx, [[x + r - 40, y], [x + r + 80, y]]);
      for (const [cx, cy, dx, dy] of [[80, 80, 1, 1], [W - 80, 80, -1, 1], [80, H - 80, 1, -1], [W - 80, H - 80, -1, -1]]) line(ctx, [[cx, cy + dy * 70], [cx, cy], [cx + dx * 70, cy]]);
      e.txt(e.word(0), x, y, 90, e.accent);
      e.txt(`${String(step(e.age, 24)).padStart(4, '0')} ● REC`, 260, H - 120, 32, e.ink);
    },
  },
  wire: {
    help: '3D 線框：立方體和二十面體的線框跟著拍子旋轉（思考、結構、未來感）',
    draw: (e) => {
      const { ctx } = e;
      const p = (1 + Math.sqrt(5)) / 2;
      const cube = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]];
      const ico = [[-1, p, 0], [1, p, 0], [-1, -p, 0], [1, -p, 0], [0, -1, p], [0, 1, p], [0, -1, -p], [0, 1, -p], [p, 0, -1], [p, 0, 1], [-p, 0, -1], [-p, 0, 1]];
      // the edges are the vertex pairs 2 apart (the cube's sides, the icosahedron's edges)
      const size = kn(e, 'wire.size'), spin = kn(e, 'wire.spin');
      const shapes: [number[][], number, number, number][] = [[cube, size, W - e.cx, H / 2], [ico, size * 0.52, e.cx, H * 0.25]];
      const a = e.age * 0.9 * spin + e.pulse * 0.2, b = e.age * 0.6 * spin;
      ctx.strokeStyle = e.ink;
      ctx.lineWidth = 3;
      for (const [vs, s, ox, oy] of shapes) {
        const pr = vs.map(([x, y, z]) => {
          const x1 = x * Math.cos(a) - z * Math.sin(a), z1 = x * Math.sin(a) + z * Math.cos(a);
          const y1 = y * Math.cos(b) - z1 * Math.sin(b), z2 = y * Math.sin(b) + z1 * Math.cos(b);
          const f = 4 / (4 + z2);
          return [ox + x1 * s * f, oy + y1 * s * f] as [number, number];
        });
        for (let i = 0; i < vs.length; i++)
          for (let j = i + 1; j < vs.length; j++) {
            const d = Math.hypot(vs[i][0] - vs[j][0], vs[i][1] - vs[j][1], vs[i][2] - vs[j][2]);
            if (d < 2.1) line(ctx, [pr[i], pr[j]]);
          }
      }
    },
  },
  spectrum: {
    help: '圓環頻譜：一圈等化器柱繞著中心隨拍伸縮（音樂、心跳、能量）',
    draw: (e) => {
      const { ctx } = e, x = W - e.cx, y = H / 2;
      const n = kn(e, 'spectrum.n'), R = kn(e, 'spectrum.r');
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU, h = 30 + hash(i, step(e.age, 10)) * 120 * (0.4 + e.pulse);
        ctx.strokeStyle = i % 6 ? e.ink : e.accent;
        ctx.lineWidth = (720 / n) * 1.1;
        line(ctx, [[x + Math.cos(a) * R, y + Math.sin(a) * R], [x + Math.cos(a) * (R + h), y + Math.sin(a) * (R + h)]]);
      }
      e.txt(e.word(0), x, y, 80, e.ink);
    },
  },
  pulse: {
    help: '同心擴散：重拍從中心擴出幾圈細線圓（心跳、震動、餘韻）',
    draw: (e) => {
      const { ctx } = e;
      const rings = kn(e, 'pulse.n'), rate = kn(e, 'pulse.rate');
      for (let i = 0; i < rings; i++) {
        const t = (e.age * rate + i / rings) % 1;
        ctx.strokeStyle = i % 2 ? e.accent : e.ink;
        ctx.lineWidth = 6 * (1 - t);
        ctx.globalAlpha = 1 - t;
        ctx.beginPath();
        ctx.arc(e.cx, H / 2, 150 + t * 900, 0, TAU);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    },
  },
  spiral: {
    help: '幾何螺旋隧道：三角形一層層旋轉往中心縮成螺旋（被吸進去、時間、暈眩）',
    draw: (e) => {
      const { ctx } = e;
      const n = kn(e, 'spiral.n'), sides = kn(e, 'spiral.sides');
      for (let i = 0; i < n; i++) {
        const z = (i / n + e.age * 0.25) % 1, r = 40 + z * z * 1300;
        ctx.strokeStyle = i % 3 ? e.ink : e.accent;
        ctx.lineWidth = 4 + z * 14;
        star(ctx, W / 2, H / 2, r, r, sides, z * 3 + e.age * 0.5);
        ctx.stroke();
      }
    },
  },
  chart: {
    help: '資訊圖表：圓餅圖的扇區寫著詞、折線圖往上畫（數字、比較、日常的計算）',
    draw: (e) => {
      const { ctx } = e, x = e.cx, y = H / 2, R = kn(e, 'chart.r'), np = kn(e, 'chart.pts');
      let a0 = -Math.PI / 2;
      for (let i = 0; i < 4; i++) {
        const a1 = a0 + TAU * [0.4, 0.25, 0.2, 0.15][i] * clamp(e.age / 0.6);
        ctx.fillStyle = [e.ink, e.accent, e.ink, e.paper][i];
        ctx.globalAlpha = i === 2 ? 0.4 : 1;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.arc(x, y, R, a0, a1);
        ctx.fill();
        ctx.globalAlpha = 1;
        const m = (a0 + a1) / 2;
        e.txt(e.word(i), x + Math.cos(m) * R * 0.63, y + Math.sin(m) * R * 0.63, 40, i === 1 ? e.paper : i === 3 ? e.ink : e.paper);
        a0 = a1;
      }
      ctx.strokeStyle = e.ink;
      ctx.lineWidth = 5;
      const pts: [number, number][] = [];
      for (let i = 0; i <= np * clamp(e.age / 1); i++) pts.push([W - x - 400 + i * (800 / np), H * 0.8 - i * (300 / np) - hash(i, e.seed) * 120]);
      if (pts.length > 1) line(ctx, pts);
    },
  },
  ribbon: {
    help: '流動緞帶：幾條彎曲的寬帶在畫面裡游動穿過（牽絆、流動、連結）',
    draw: (e) => {
      const { ctx } = e;
      const n = kn(e, 'ribbon.n'), w = kn(e, 'ribbon.w'), amp = kn(e, 'ribbon.amp');
      for (let r = 0; r < n; r++) {
        ctx.strokeStyle = r % 2 ? e.accent : e.ink;
        ctx.lineWidth = w * (1 - r * 0.25);
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        for (let x = -100; x <= W + 100; x += 20) {
          const y = H * (0.3 + (0.4 * r) / Math.max(1, n - 1)) + Math.sin(x * 0.004 + e.age * 1.5 + r * 2) * amp;
          x === -100 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    },
  },
  meteor: {
    help: '流星光弧：幾道帶尾巴的弧線劃過，詞在終點亮起（願望、瞬間、流逝）',
    draw: (e) => {
      const { ctx } = e;
      // this song's shower: how many, how thick, how fast, how steep and how far they arc
      const n = kn(e, 'meteor.n'), w = kn(e, 'meteor.w'), dur = kn(e, 'meteor.dur');
      const dx = kn(e, 'meteor.dx'), dy = kn(e, 'meteor.dy'), arc = kn(e, 'meteor.arc');
      // the whole shower stays in frame: starts spread over what is left once the flight and the word at its end fit
      const span = Math.max(0, W - 120 - dx - 120);
      for (let m = 0; m < n; m++) {
        const t = clamp((e.age - m * 0.25) / dur);
        const x0 = 60 + (n > 1 ? (m / (n - 1)) * span : span / 2), y0 = H * 0.1 + m * Math.min(50, (H * 0.8 - dy) / Math.max(1, n)), x1 = x0 + dx, y1 = y0 + dy;
        const hx = x0 + (x1 - x0) * t, hy = y0 + (y1 - y0) * t - Math.sin(t * Math.PI) * arc;
        ctx.strokeStyle = m % 2 ? e.accent : e.ink;
        ctx.lineCap = 'round';
        for (let s = 0; s < 10; s++) {
          const u = Math.max(0, t - s * 0.025);
          ctx.globalAlpha = 1 - s / 10;
          ctx.lineWidth = w * (1 - s * 0.08);
          line(ctx, [[x0 + (x1 - x0) * u, y0 + (y1 - y0) * u - Math.sin(u * Math.PI) * arc], [hx, hy]]);
        }
        ctx.globalAlpha = 1;
        if (t >= 1) e.txt(e.word(m), hx, hy + 60, 56, e.ink);
      }
    },
  },
  aura: {
    help: '人物光環殘影：人物周圍脈動的光圈，加上強調色和深色的錯位殘影（覺醒、存在感）',
    draw: (e) => {
      const { ctx } = e;
      for (let i = 0, n = kn(e, 'aura.n'); i < n; i++) {
        ctx.strokeStyle = e.accent;
        ctx.lineWidth = 8;
        ctx.globalAlpha = 0.6 - i * (0.5 / n);
        ctx.beginPath();
        ctx.ellipse(e.cx, H / 2, 300 + i * 70 + e.pulse * 30, 440 + i * 70 + e.pulse * 30, 0, 0, TAU);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      if (!e.art) return;
      const o = kn(e, 'aura.ghost') + 10 * Math.sin(e.age * 4);
      ctx.globalCompositeOperation = 'multiply';
      art(e, e.cx - o, e.art.y, 1, 0.35);
      art(e, e.cx + o, e.art.y, 1, 0.35);
      ctx.globalCompositeOperation = 'source-over';
      art(e, e.cx, e.art.y);
      return true;
    },
  },
  neon: {
    help: '霓虹描邊：深色底上人物和大字帶強調色外發光（夜晚、城市、閃耀）',
    draw: (e) => {
      const { ctx } = e;
      ctx.fillStyle = e.ink;
      ctx.fillRect(0, 0, W, H);
      ctx.shadowColor = e.accent;
      ctx.shadowBlur = kn(e, 'neon.glow') + 20 * e.pulse;
      e.txt(e.word(0), W - e.cx, H / 2, 160, e.paper, 1, true);
      // printed in reverse: an ink figure vanished on the ink night (an invert filter turned the navy yellow)
      art(e, e.cx, e.art?.y ?? H / 2, 1, 1, false, true);
      ctx.shadowBlur = 0;
      return !!e.art;
    },
  },
  brush: {
    help: '筆刷逐筆：粗筆刷一筆筆畫出漩渦圓環，越畫越滿（執念、塗掉、情緒累積）',
    draw: (e) => {
      const { ctx } = e, n = Math.min(kn(e, 'brush.n'), 1 + Math.floor(e.age / 0.12)), bw = kn(e, 'brush.w');
      ctx.strokeStyle = e.ink;
      ctx.lineCap = 'round';
      for (let i = 0; i < n; i++) {
        ctx.lineWidth = bw + hash(i, e.seed) * bw;
        ctx.globalAlpha = 0.7;
        const r = 180 + i * 18, a = i * 0.9;
        ctx.beginPath();
        ctx.arc(e.cx, H / 2, r, a, a + 2.2 + hash(i, 2));
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    },
  },
  crack: {
    help: '裂紋：重音時裂痕從一點分岔擴張（心碎、破裂、衝擊）',
    draw: (e) => {
      const { ctx } = e, t = clamp(e.age / 0.5);
      ctx.strokeStyle = e.ink;
      ctx.lineWidth = 4;
      const grow = (x: number, y: number, a: number, len: number, d: number, id: number) => {
        if (d > 4 || len < 20) return;
        const x1 = x + Math.cos(a) * len * t, y1 = y + Math.sin(a) * len * t;
        line(ctx, [[x, y], [x1, y1]]);
        grow(x1, y1, a + (hash(id, 1) - 0.5) * 1.2, len * 0.7, d + 1, id * 2);
        if (hash(id, 2) > 0.5) grow(x1, y1, a + (hash(id, 3) - 0.5) * 2, len * 0.5, d + 1, id * 2 + 1);
      };
      const arms = kn(e, 'crack.n'), len = kn(e, 'crack.len');
      for (let i = 0; i < arms; i++) grow(W - e.cx, H / 2, (i / arms) * TAU + e.seed, len, 0, i + 1);
      e.txt(e.word(0), W - e.cx, H / 2, 110, e.accent);
    },
  },
  fill: {
    help: '形狀填滿：一顆心或圓從中心急速放大填滿整個畫面（感情湧上、轉場）',
    draw: (e) => {
      const { ctx } = e, dur = kn(e, 'fill.speed'), s = clamp(e.age / dur) ** 2 * 1400;
      ctx.fillStyle = e.accent;
      ctx.beginPath();
      if (e.seed % 2) ctx.arc(W / 2, H / 2, s, 0, TAU);
      else {
        const x = W / 2, y = H / 2 + s * 0.3;
        ctx.moveTo(x, y);
        ctx.bezierCurveTo(x - s * 1.4, y - s * 0.6, x - s * 0.5, y - s * 1.5, x, y - s * 0.8);
        ctx.bezierCurveTo(x + s * 0.5, y - s * 1.5, x + s * 1.4, y - s * 0.6, x, y);
      }
      ctx.fill();
      e.txt(e.word(0), W / 2, H / 2, 140, e.paper, clamp(e.age / dur));
    },
  },
  stars: {
    help: '星座連線：詞散成星點逐一亮起，再用細線連成星座（命運、相連、夜空）',
    draw: (e) => {
      const { ctx } = e, n = kn(e, 'stars.n'), size = kn(e, 'stars.size'), pts: [number, number][] = [];
      for (let i = 0; i < n; i++) pts.push([W * (0.12 + 0.76 * (i / (n - 1))), H * (0.25 + 0.5 * hash(i, e.seed))]);
      const lit = clamp(e.age / 0.8) * n;
      ctx.strokeStyle = e.ink;
      ctx.lineWidth = 2;
      for (let i = 1; i < Math.min(n, lit); i++) line(ctx, [pts[i - 1], pts[i]]);
      pts.forEach(([x, y], i) => {
        if (i > lit) return;
        ctx.fillStyle = e.accent;
        star(ctx, x, y, size, size * 0.36, 4);
        ctx.fill();
        e.txt(e.word(i), x, y + 50, 36, e.ink);
      });
    },
  },
  bolt: {
    help: '閃電：鋸齒電光每 12 格重畫一次閃過（衝擊、靈光、雷）',
    draw: (e) => {
      const { ctx } = e, f = step(e.age);
      if (f % 3 === 2) return;
      ctx.strokeStyle = e.accent;
      ctx.lineWidth = 12;
      ctx.shadowColor = e.accent;
      ctx.shadowBlur = 20;
      const zig = kn(e, 'bolt.zig');
      for (let b = 0, n = kn(e, 'bolt.n'); b < n; b++) {
        const pts: [number, number][] = [];
        let x = W * (0.2 + 0.6 * hash(b, f));
        for (let y = 0; y <= H; y += 90) pts.push([(x += (hash(y, f + b) - 0.5) * zig), y]);
        line(ctx, pts);
      }
      ctx.shadowBlur = 0;
    },
  },
  beams: {
    help: '舞台光束：兩道光從上角射下隨拍左右交叉搖擺（舞台、偶像、主角登場）',
    draw: (e) => {
      const { ctx } = e;
      // this song's rig: two to five lamps along the top, each with its own beam width and swing
      // one beam per lamp, from the lamp: lamps spread along the top rig, each tilting toward the middle and swinging
      const n = kn(e, 'beams.n'), half = kn(e, 'beams.w'), sway = kn(e, 'beams.sway');
      const lampX = (j: number) => W * (0.12 + (0.76 * (j + 0.5)) / n);
      for (let j = 0; j < n; j++) {
        const x0 = lampX(j), lean = (W / 2 - x0) / (W / 2);
        const a = Math.PI / 2 - lean * 0.45 - 0.3 * Math.sin(e.age * sway + j * 1.7);
        ctx.fillStyle = e.accent;
        ctx.globalAlpha = 0.35;
        ctx.beginPath();
        ctx.moveTo(x0, 60);
        ctx.lineTo(x0 + Math.cos(a - half) * 2000, 60 + Math.sin(a - half) * 2000);
        ctx.lineTo(x0 + Math.cos(a + half) * 2000, 60 + Math.sin(a + half) * 2000);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = e.ink;
      ctx.lineWidth = 6;
      line(ctx, [[lampX(0) - 60, 40], [lampX(n - 1) + 60, 40]]);
      for (let j = 0; j < n; j++) {
        // the lamp housing on the rig, its lens lit in the accent on the beat
        ctx.fillStyle = e.ink;
        ctx.beginPath();
        ctx.roundRect(lampX(j) - 26, 40, 52, 34, 8);
        ctx.fill();
        ctx.fillStyle = (j + step(e.age, 4)) % 2 ? e.accent : e.paper;
        ctx.beginPath();
        ctx.arc(lampX(j), 66, 13, 0, TAU);
        ctx.fill();
      }
    },
  },
  staff: {
    help: '樂譜：五線譜橫過畫面，詞像音符排在線上（歌、旋律、唱給你聽）',
    native: 'rtl',
    flows: ['ltr'],
    draw: (e) => {
      const { ctx, W, H } = e, y0 = H * 0.4, gap = kn(e, 'staff.gap'), notes = kn(e, 'staff.notes'), step0 = (W - 200) / notes;
      ctx.strokeStyle = e.ink;
      ctx.lineWidth = 3;
      for (let i = 0; i < 5; i++) line(ctx, [[0, y0 + i * gap], [W * e.k, y0 + i * gap]]);
      for (let b = 1; b < 4; b++) line(ctx, [[(W / 4) * b, y0], [(W / 4) * b, y0 + gap * 4]]);
      for (let i = 0; i < notes; i++) {
        const x = 200 + i * step0 - ((e.age * 80) % step0), y = y0 + gap * 4 - hash(i, e.seed) * gap * 4;
        ctx.fillStyle = i % 3 ? e.ink : e.accent;
        ctx.beginPath();
        ctx.ellipse(x, y, 26, 18, -0.4, 0, TAU);
        ctx.fill();
        line(ctx, [[x + 24, y], [x + 24, y - 110]]);
        e.txt(e.word(i), x, y0 + gap * 4 + 80, 40, e.ink);
      }
    },
  },
  stamp: {
    help: '印章：大圓章蓋下來，略大回彈帶微旋轉（決定、承諾、認證）',
    draw: (e) => {
      const { ctx } = e, s = 1 + (1 - clamp(e.age / 0.15)) * 0.4, x = W - e.cx, y = H / 2;
      ctx.save();
      ctx.translate(x, y);
      const r = kn(e, 'stamp.r');
      ctx.rotate(kn(e, 'stamp.tilt'));
      ctx.scale(s, s);
      ctx.strokeStyle = e.accent;
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.stroke();
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.85, 0, TAU);
      ctx.stroke();
      e.txt(e.word(0), 0, 0, 110, e.accent);
      ctx.restore();
    },
  },
  counter: {
    help: '數字計數器：大號數字往上跑碼，重拍跳一位（倒數、日子、累積）',
    draw: (e) => {
      // the director's number from the lyric (365 days) runs up to itself; with none, the beats of the song so far, not
      // an invented sum (a run to 100,018 meant nothing). On the figure's side: on the lyric's it ran over the line
      const g = clamp(e.age / 1.2);
      const n = e.label ? reading(e.label, '', g) : `${Math.round((((e.at ?? 0) + e.age) * e.bpm) / 60 * g)} beats`;
      // low on the figure's side (the right when the lyric is centred): level with the lyric it ran over the line, and
      // the top right corner holds the song's thread
      const x = Math.abs(e.cx - W / 2) < 10 ? W * 0.8 : e.cx, y = H * 0.8;
      e.txt(n, x, y, kn(e, 'counter.size') * 0.8, e.ink);
      e.txt(e.word(0), x, y - 110, 50, e.accent);
    },
  },
  strike: {
    help: '劃線改寫：詞出現後被幾道橫線劃掉，上方補寫另一個詞（改變心意、否定、更正）',
    draw: (e) => {
      const { ctx } = e, x = W - e.cx, y = H / 2;
      e.txt(e.word(0), x, y, 150, e.ink);
      ctx.strokeStyle = e.accent;
      ctx.lineWidth = kn(e, 'strike.w');
      for (let i = 0, n = kn(e, 'strike.n'); i < n; i++) {
        const t = clamp((e.age - 0.2 - i * 0.08) / 0.12);
        if (t > 0) line(ctx, [[x - 300, y - 20 + i * 20], [x - 300 + 600 * t, y - 30 + i * 22]]);
      }
      if (e.age > 0.5) e.txt(e.word(1), x, y - 170, 100, e.accent);
    },
  },
  hang: {
    help: '吊線懸掛：詞塊用細線從頂端吊下來，像鐘擺晃一下慢慢停（掛念、不安定）',
    draw: (e) => {
      const { ctx } = e;
      const n = parts(e, 'hang.n', 1), base = kn(e, 'hang.len');
      for (let i = 0; i < n; i++) {
        const x0 = W * (0.15 + (i * 0.7) / Math.max(1, n - 1)), len = base + hash(i, e.seed) * base;
        const a = Math.sin(e.age * 3 + i) * 0.25 * Math.exp(-e.age * 1.2);
        const x = x0 + Math.sin(a) * len, y = Math.cos(a) * len;
        ctx.strokeStyle = e.ink;
        ctx.lineWidth = 2;
        line(ctx, [[x0, 0], [x, y]]);
        ctx.fillStyle = i % 2 ? e.accent : e.ink;
        ctx.fillRect(x - 90, y, 180, 90);
        e.txt(e.word(i), x, y + 45, 40, e.paper);
      }
    },
  },
  ascii: {
    help: 'ASCII 字符：等寬符號堆成往外轉的螺旋（電腦、雜訊、數位）',
    draw: (e) => {
      const set = '|/-\\_[]<>#*', cell = kn(e, 'ascii.cell'), arms = kn(e, 'ascii.arms');
      for (let y = 30; y < H; y += cell * 1.33)
        for (let x = 20; x < W; x += cell) {
          const dx = x - W / 2, dy = y - H / 2, a = Math.atan2(dy, dx), r = Math.hypot(dx, dy);
          const v = Math.sin(a * arms + r * 0.02 - e.age * 4);
          if (v > 0.3) e.txt(set[Math.floor((v * 10 + r) % set.length)], x, y, 30, v > 0.8 ? e.accent : e.ink, 0.8);
        }
    },
  },
  talisman: {
    help: '符咒插幀：全畫面閃過幾格手繪符咒與印記再切回（咒語、宿命、異樣）',
    draw: (e) => {
      const { ctx } = e;
      // whole on the cut, then a flicker of two frames in six
      if (e.age > 0.3 && step(e.age) % 6 > 1) return;
      ctx.fillStyle = e.accent;
      const tw = kn(e, 'talisman.w');
      ctx.fillRect(W / 2 - tw / 2, 60, tw, H - 120);
      ctx.strokeStyle = e.ink;
      ctx.lineWidth = 8;
      ctx.strokeRect(W / 2 - tw / 2 + 30, 90, tw - 60, H - 180);
      [...e.word(0)].slice(0, 4).forEach((c, i) => e.txt(c, W / 2, 220 + i * 200, 170, e.ink));
    },
  },
  pattern: {
    help: '圖樣平鋪：斜條紋、方格或千鳥格鋪滿整面斜向滾動（可愛、普普、明快）',
    draw: (e) => {
      const c = kn(e, 'pattern.cell'), { ctx } = e, kind = e.seed % 3, o = (e.age * kn(e, 'pattern.speed')) % c;
      ctx.fillStyle = e.ink;
      ctx.globalAlpha = 0.3;
      if (kind === 0) {
        ctx.save();
        ctx.rotate(-0.5);
        for (let x = -2000 + o; x < 3000; x += c) ctx.fillRect(x, -1000, c * 0.42, 4000);
        ctx.restore();
      } else
        for (let y = -c + o, r = 0; y < H; y += c, r++)
          for (let x = -c + o, q = 0; x < W; x += c, q++)
            if (kind === 1 ? (r + q) % 2 === 0 : true) {
              if (kind === 1) ctx.fillRect(x, y, c, c);
              else star(ctx, x + c / 2, y + c / 2, c * 0.28, c * 0.12, 4, 0.785), ctx.fill();
            }
      ctx.globalAlpha = 1;
    },
  },
  window: {
    help: '框景視窗：滿版色框挖出圓窗或拱窗，人物和詞在窗裡（窺看、回憶、心裡的畫面）',
    draw: (e) => {
      const { ctx } = e, r = kn(e, 'window.r') * (0.5 + 0.5 * e.k), x = e.cx, y = H / 2;
      // a round window or an arch, the same path for the frame and for the picture inside it
      const hole = () => {
        if (e.seed % 2) return ctx.arc(x, y, r, 0, TAU, true);
        ctx.moveTo(x + r * 0.8, y + r);
        ctx.lineTo(x - r * 0.8, y + r);
        ctx.lineTo(x - r * 0.8, y - r * 0.2);
        ctx.arc(x, y - r * 0.2, r * 0.8, Math.PI, 0);
        ctx.closePath();
      };
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      hole();
      ctx.fillStyle = e.accent;
      ctx.fill('evenodd');
      e.txt(e.word(0), W - x, H * 0.8, 90, e.paper);
      if (!e.art) return;
      ctx.save();
      ctx.beginPath();
      hole();
      ctx.clip();
      art(e, x, e.art.y);
      ctx.restore();
      return true;
    },
  },
  bubble: {
    help: '漫畫爆炸框：鋸齒爆炸框裡放一個大詞，彈簧彈出（吶喊、驚訝、擬聲）',
    draw: (e) => {
      const { ctx } = e, s = 0.6 + 0.4 * e.k + 0.05 * Math.sin(e.age * 20) * Math.exp(-e.age * 4), x = W - e.cx, y = H / 2;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(s, s);
      ctx.fillStyle = e.paper;
      ctx.strokeStyle = e.ink;
      ctx.lineWidth = 10;
      star(ctx, 0, 0, 380, kn(e, 'bubble.inner'), kn(e, 'bubble.spikes'), e.seed);
      ctx.fill();
      ctx.stroke();
      e.txt(e.word(0), 0, 0, 130, e.accent);
      ctx.restore();
    },
  },
  sparkle: {
    help: '星芒閃爍：四角星芒在畫面各處隨機亮起旋轉再消失（閃亮、可愛、心動）',
    draw: (e) => {
      const { ctx } = e;
      const n = kn(e, 'sparkle.n'), big = kn(e, 'sparkle.size'), rate = kn(e, 'sparkle.rate'), pts = kn(e, 'sparkle.pts');
      for (let i = 0; i < n; i++) {
        const life = (e.age * rate + hash(i, e.seed)) % 1, s = Math.sin(life * Math.PI) * (big * 0.3 + hash(i, 3) * big * 0.7);
        const g = Math.floor(e.age * rate + hash(i, e.seed));
        ctx.fillStyle = i % 3 ? e.ink : e.accent;
        star(ctx, hash(i, g) * W, hash(i, g + 7) * H, s, s * 0.25, pts, life);
        ctx.fill();
      }
    },
  },
  totem: {
    help: '中央圖騰：畫面中心一顆大星隨拍呼吸旋轉，詞小小地繞一圈（核心、信念、祈禱）',
    draw: (e) => {
      // in the middle, or beside the character when there is one (it hid the totem)
      const { ctx } = e, s = 260 * (1 + 0.12 * e.pulse), x = e.art ? W - e.cx : W / 2;
      ctx.fillStyle = e.accent;
      const pts = kn(e, 'totem.pts');
      star(ctx, x, H / 2, s, s * 0.45, pts, e.age * 0.4);
      ctx.fill();
      ctx.strokeStyle = e.ink;
      ctx.lineWidth = 6;
      star(ctx, x, H / 2, s * 1.25, s * 0.6, pts, -e.age * 0.3);
      ctx.stroke();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU - e.age * 0.3;
        e.txt(e.word(i), x + Math.cos(a) * s * 1.6, H / 2 + Math.sin(a) * s * 1.6, 36, e.ink);
      }
    },
  },
  flap: {
    help: '翻牌：車站時刻表的翻牌一格格翻到詞（出發、等待、時間表）',
    draw: (e) => {
      const { ctx } = e, s = [...e.word(0)].slice(0, 8), cw = kn(e, 'flap.cell'), x0 = W / 2 - (s.length * cw) / 2;
      s.forEach((c, i) => {
        const x = x0 + i * cw, done = e.age > 0.1 + i * 0.07, f = step(e.age, 20);
        ctx.fillStyle = e.ink;
        ctx.beginPath();
        ctx.roundRect(x + 8, H / 2 - 110, cw - 16, 220, 14);
        ctx.fill();
        e.txt(done ? c : String.fromCharCode(0x30a2 + ((f + i * 7) % 80)), x + cw / 2, H / 2, 140, e.paper);
        ctx.fillStyle = e.paper;
        ctx.fillRect(x + 8, H / 2 - 2, cw - 16, 4);
      });
    },
  },
  marquee: {
    help: '跑馬燈：幾條斜放的帶子上詞不斷橫向跑（新聞、喧鬧、停不下來）',
    flows: ['rtl', 'ttb', 'btt'],
    styles: ['兩條斜帶、反方向跑（喧鬧）', '一條水平粗帶（新聞快報、宣告）', '三條細帶、同方向跑（封鎖線、警戒）'],
    draw: (e) => {
      const { ctx, W, H } = e;
      const bands: [number, number, number, number][] =
        e.style === 1 ? [[0, 0.5, 1, 150]] : e.style === 2 ? [[-0.06, 0.3, 1, 70], [-0.06, 0.5, 1, 70], [-0.06, 0.7, 1, 70]] : [[-0.12, 0.35, 1, 120], [0.08, 0.67, -1, 120]];
      bands.forEach(([rot, at, dir, th], b) => {
        ctx.save();
        ctx.translate(W / 2, H * at);
        ctx.rotate(rot * kn(e, 'marquee.tilt'));
        ctx.fillStyle = b % 2 ? e.accent : e.ink;
        ctx.fillRect(-W, -th / 2, W * 2, th);
        const size = Math.round(th * 0.53);
        const text = Array.from({ length: 12 }, (_, i) => e.word(i + b)).join('　★　');
        ctx.font = `900 ${size}px "M PLUS Rounded 1c", sans-serif`;
        const w = ctx.measureText(text).width || 2000;
        const off = ((e.age * kn(e, 'marquee.speed') * dir) % w + w) % w;
        // the band's words run along it, on their side when the band is turned upright
        for (let x = -W + off - w; x < W; x += w) (e.along ?? e.txt)(text, x + w / 2, 0, size, e.paper);
        ctx.restore();
      });
    },
  },
  glitch: {
    help: '故障切片：大字被切成幾條左右錯開並閃一下（混亂、崩壞、心慌）',
    draw: (e) => {
      const { ctx } = e, f = step(e.age, 24), n = kn(e, 'glitch.n'), sh = 300 / n, y0 = H / 2 - 150, d = kn(e, 'glitch.off');
      for (let s = 0; s < n; s++) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, y0 + s * sh, W, sh);
        ctx.clip();
        const off = hash(s, f) > 0.6 ? (hash(s, f + 1) - 0.5) * d : 0;
        e.txt(e.word(0), W - e.cx + off, H / 2, 300, s % 2 && off ? e.accent : e.ink);
        ctx.restore();
      }
    },
  },
};
// openings, endings, structure and colour (intro_outro, structure, color in the knowledge base)
Object.assign(MORE, {
  credits: {
    help: '片頭片尾名單：words 依序放「曲名、歌手、其他名單」，曲名大字夾在兩條線之間（前奏、尾奏）',
    draw: (e: Env) => {
      const { ctx } = e, a = clamp(e.age / 0.8);
      ctx.strokeStyle = e.ink;
      ctx.lineWidth = 3;
      const rule = kn(e, 'credits.rule'), gap = kn(e, 'credits.gap');
      line(ctx, [[W / 2 - rule * a, H / 2 - gap], [W / 2 + rule * a, H / 2 - gap]]);
      line(ctx, [[W / 2 - rule * a, H / 2 + gap], [W / 2 + rule * a, H / 2 + gap]]);
      e.txt(e.word(1), W / 2, H / 2 - gap - 50, 40, e.ink, a);
      // the title fits between the rules: a long one (Keep Your Fire Burning) ran off both edges at a fixed size
      const em = [...e.word(0)].reduce((n, c) => n + (/[\x20-\x7e]/.test(c) ? 0.62 : 1), 0);
      e.txt(e.word(0), W / 2, H / 2, Math.min(150, 1500 / Math.max(1, em)), e.ink, a);
      // the other credits once each: word() cycles, which printed the title twice more under itself
      const names = new Set([e.word(0), e.word(1)]);
      for (let i = 2; i < 5; i++) if (!names.has(e.word(i))) names.add(e.word(i)), e.txt(e.word(i), W / 2, H / 2 + gap + (i - 1) * 55, 30, e.ink, clamp(e.age / 0.8 - (i - 2) * 0.3));
    },
  },
  slit: {
    help: '光縫揭幕：全黑中一條橫向光縫慢慢打開露出畫面（開場、甦醒、揭曉）',
    draw: (e: Env) => {
      const { ctx, W, H } = e, dur = kn(e, 'slit.dur'), o = clamp(e.age / dur) ** 2 * H * 0.5;
      e.txt(e.word(0), W / 2, H / 2, 160, e.accent);
      ctx.fillStyle = '#0a0a10';
      ctx.fillRect(0, 0, W, H / 2 - o);
      ctx.fillRect(0, H / 2 + o, W, H / 2 - o + 1);
      ctx.fillStyle = e.paper;
      ctx.globalAlpha = 1 - clamp(e.age / dur);
      ctx.fillRect(0, H / 2 - o - 2, W, 4);
      ctx.fillRect(0, H / 2 + o - 2, W, 4);
      ctx.globalAlpha = 1;
    },
  },
  tvoff: {
    help: 'CRT 關機：畫面壓成一條亮線再縮成一點消失（結束、斷線、離開）',
    draw: (e: Env) => {
      const { ctx } = e, t = clamp(e.age / kn(e, 'tvoff.dur'));
      ctx.fillStyle = '#0a0a10';
      ctx.fillRect(0, 0, W, H);
      const hgt = Math.max(3, H * (1 - t / 0.5)), wid = t < 0.5 ? W : W * (1 - (t - 0.5) / 0.5);
      ctx.fillStyle = e.paper;
      ctx.fillRect(W / 2 - wid / 2, H / 2 - hgt / 2, wid, hgt);
      if (t < 0.4) e.txt(e.word(0), W / 2, H / 2, 140, e.ink, 1 - t / 0.4);
    },
  },
  chapter: {
    help: '章節卡：大號段落標籤（CHORUS、#02、DAY 1）打出來加底線，段落開始的第一刀用',
    draw: (e: Env) => {
      const { ctx } = e, s = e.word(0), n = Math.ceil([...s].length * clamp(e.age / 0.4));
      e.txt([...s].slice(0, n).join(''), W / 2, H / 2, 180, e.ink);
      ctx.fillStyle = e.accent;
      const rule = kn(e, 'chapter.rule');
      ctx.fillRect(W / 2 - rule / 2, H / 2 + 120, rule * clamp((e.age - 0.3) / 0.3), kn(e, 'chapter.th'));
      e.txt(e.word(1), W / 2, H / 2 + 190, 44, e.ink);
    },
  },
  progress: {
    help: '播放器進度條：底部進度條和時間碼，上方一個大詞（回放、聽著這首歌、時間）',
    flows: ['rtl', 'btt'],
    styles: ['播放器進度條和時間碼', '一格格的載入方塊（等待、累積）', '細線加章節刻度（旅程、里程碑）'],
    draw: (e: Env) => {
      // the real place in the song (a fixed 4:18 length was one song's, shown on every song)
      const now = (e.at ?? 0) + e.age, songLen = e.len || 240;
      const { ctx, W, H } = e, p = e.len ? clamp(now / songLen) : clamp(0.2 + e.age * 0.05 + (e.seed % 10) / 14);
      const [x0, len, y] = [200, W - 400, H - 150];
      ctx.fillStyle = e.ink;
      ctx.strokeStyle = e.ink;
      if (e.style === 1) {
        const n = kn(e, 'progress.blocks'), gap = 10, bw = (len - gap * (n - 1)) / n;
        for (let i = 0; i < n; i++) {
          ctx.globalAlpha = i < Math.floor(p * n) ? 1 : 0.18;
          ctx.fillRect(x0 + i * (bw + gap), y - 20, bw, 40);
        }
        ctx.globalAlpha = 1;
        e.txt(`${Math.round(p * 100)}%`, x0 + len / 2, y + 60, 34, e.ink);
      } else {
        ctx.globalAlpha = 0.25;
        const th = e.style === 2 ? 4 : kn(e, 'progress.th');
        ctx.fillRect(x0, y, len, th);
        ctx.globalAlpha = 1;
        ctx.fillRect(x0, y, len * p, th);
        if (e.style === 2) {
          ctx.lineWidth = 3;
          for (let i = 0; i <= 4; i++) line(ctx, [[x0 + (len * i) / 4, y - 18], [x0 + (len * i) / 4, y + 22]]);
          ctx.fillStyle = e.accent;
        }
        ctx.beginPath();
        ctx.arc(x0 + len * p, y + 5, e.style === 2 ? 12 : 18, 0, TAU);
        ctx.fill();
        const tc = (x: number) => `${Math.floor(x / 60)}:${String(Math.floor(x % 60)).padStart(2, '0')}`;
        e.txt(tc(p * songLen), x0, y + 50, 32, e.ink);
        e.txt(`-${tc((1 - p) * songLen)}`, x0 + len, y + 50, 32, e.ink);
      }
      e.txt(e.word(0), W / 2, H / 2 - 60, 140, e.ink);
    },
  },
  duo: {
    help: '雙色分區：畫面切成兩個色域，詞跨過色界兩邊反色（對立、兩個人、裡外）',
    draw: (e: Env) => {
      const { ctx } = e, x = W * (kn(e, 'duo.at') + kn(e, 'duo.sway') * Math.sin(e.age));
      ctx.fillStyle = e.ink;
      ctx.fillRect(x, 0, W - x, H);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, x, H);
      ctx.clip();
      e.txt(e.word(0), W / 2, H / 2, 200, e.ink);
      ctx.restore();
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, 0, W - x, H);
      ctx.clip();
      e.txt(e.word(0), W / 2, H / 2, 200, e.paper);
      ctx.restore();
    },
  },
  beatbg: {
    help: '踩拍換底色：底色每半拍在三色間硬切，大詞固定在中間（副歌、狂歡、節奏）',
    draw: (e: Env) => {
      const { ctx } = e, c = [e.accent, e.ink, e.paper][Math.floor(e.age * kn(e, 'beatbg.rate')) % 3];
      ctx.fillStyle = c;
      ctx.fillRect(0, 0, W, H);
      e.txt(e.word(0), W - e.cx, H / 2, 200, c === e.ink ? e.paper : e.ink);
    },
  },
  morse: {
    help: '摩斯電碼：詞變成一排短點長橫逐碼亮起，像電報（訊號、傳達、密語）',
    flows: ['rtl', 'ttb'],
    draw: (e: Env) => {
      const { ctx, W, H } = e, codes = [...e.word(0) + e.word(1)].map((c) => c.charCodeAt(0));
      let x = 160;
      const lit = e.age * kn(e, 'morse.speed'), dot = kn(e, 'morse.dot'), dash = dot * 2.9;
      let i = 0;
      ctx.fillStyle = e.ink;
      for (const c of codes)
        for (let b = 0; b < 5; b++, i++) {
          const long = (c >> b) & 1;
          ctx.globalAlpha = i < lit ? 1 : 0.15;
          ctx.fillRect(x, H / 2 - dot * 0.64, long ? dash : dot, dot * 1.27);
          x += (long ? dash : dot) + dot * 0.8;
          if (x > W - 160) x = 160;
        }
      ctx.globalAlpha = 1;
      e.txt(e.word(0), W / 2, H / 2 + 120, 60, e.accent);
    },
  },
  pixels: {
    help: '像素方塊：彩色方格由中心往外蓋滿畫面再散開（切場、數位、遊戲）',
    draw: (e: Env) => {
      const { ctx } = e, c = kn(e, 'pixels.cell'), t = e.age / 0.5;
      for (let y = 0; y < H; y += c)
        for (let x = 0; x < W; x += c) {
          const d = Math.hypot(x + c / 2 - W / 2, y + c / 2 - H / 2) / 1100;
          const on = t > d + hash(x, y) * 0.2 && t < d + 1 + hash(y, x) * 0.3;
          if (!on) continue;
          ctx.fillStyle = [e.ink, e.accent, e.paper][Math.floor(hash(x * 3, y) * 3)];
          ctx.fillRect(x, y, c - 2, c - 2);
        }
      if (t > 1.2) e.txt(e.word(0), W / 2, H / 2, 160, e.ink);
    },
  },
  tear: {
    help: '撕紙揭示：一張紙沿鋸齒撕開，露出底下的強調色和詞（揭開、真心、打破）',
    draw: (e: Env) => {
      const { ctx } = e, o = clamp(e.age / kn(e, 'tear.dur')) * W * 0.6, zig = kn(e, 'tear.zig');
      ctx.fillStyle = e.accent;
      ctx.fillRect(0, 0, W, H);
      e.txt(e.word(0), W / 2, H / 2, 180, e.paper);
      for (const d of [-1, 1]) {
        ctx.fillStyle = e.paper;
        ctx.beginPath();
        const x0 = W / 2 + d * o;
        ctx.moveTo(d < 0 ? 0 : W, 0);
        for (let y = 0; y <= H; y += 40) ctx.lineTo(x0 + (hash(y, e.seed) - 0.5) * zig * -d, y);
        ctx.lineTo(d < 0 ? 0 : W, H);
        ctx.fill();
      }
    },
  },
  invert: {
    help: '正負反轉：深色滿版、詞和圖形用淺色，明暗整組對調（轉折、另一面、夜）',
    draw: (e: Env) => {
      const { ctx } = e;
      ctx.fillStyle = e.ink;
      ctx.fillRect(0, 0, W, H);
      for (let i = 0, n = kn(e, 'invert.n'); i < n; i++) e.txt(e.word(i), W * (0.12 + (0.76 * i) / Math.max(1, n - 1)), H * (0.2 + 0.6 * hash(i, e.seed)), 70, e.paper, 0.3);
      e.txt(e.word(0), W - e.cx, H / 2, 190, e.paper);
      if (!e.art) return;
      art(e, e.cx, e.art.y, 1, 1, false, true);
      return true;
    },
  },
} satisfies Record<string, Move>);

/**
 * A measuring move's reading, its number counting up as the drawing grows (g 0→1): the director's own (`label`, from
 * the lyric) or one made from the song's tempo and the cut, so no two songs or cuts show the same made-up number
 * (every song's height chart came to 180 cm).
 */
export const reading = (label: string | undefined, fallback: string, g: number) =>
  (label || fallback).replace(/\d+(\.\d+)?/, (n) => String(+(+n * g).toFixed(n.includes('.') ? 1 : 0)));

// From the 大字報 MVs (2026-10-19): every conceptual line drawn as the diagram it means, in a document language.
// The diagrams stand where the character would (away from the lyric) and take its place: the planner leaves the
// character out of their cuts (DIAGRAM_FX).
Object.assign(MORE, {
  ecg: {
    help: '心電圖：像監視器一樣，一條心跳線橫過畫面，亮點往右掃、把舊的線換成新的，每拍一個心跳，標著這首歌的 BPM（心跳、緊張、活著、喜歡；同一首也可以改用 metronome 或 pulse 說心跳）',
    flows: ['rtl', 'ttb', 'btt'],
    styles: ['心跳線', '心跳線，波更高（心動、緊張、奔跑）', '跳三拍後變成一直線（停止、失去、冷掉）'],
    draw: (e: Env) => {
      const { ctx, W, H } = e;
      // a bedside monitor: the whole trace stays up, the dot sweeps right writing the newest beats over the oldest a
      // little gap ahead of it (redrawing from nothing every sweep read as a flicker); one heartbeat on every beat
      const beat = 60 / e.bpm, span = kn(e, 'ecg.span') * beat, x0 = 80, x1 = W - 80, gap = 60;
      const y0 = H * 0.86, amp = (e.style === 1 ? 1.3 : 1) * kn(e, 'ecg.amp');
      // P bump, sharp QRS, broad T, over one beat (up is negative y)
      const wave = (p: number) =>
        p < 0.1 ? -0.12 * Math.sin((p / 0.1) * Math.PI)
        : p < 0.16 ? 0
        : p < 0.18 ? ((p - 0.16) / 0.02) * 0.15
        : p < 0.2 ? 0.15 - ((p - 0.18) / 0.02) * 1.15
        : p < 0.22 ? -1 + ((p - 0.2) / 0.02) * 1.3
        : p < 0.24 ? 0.3 - ((p - 0.22) / 0.02) * 0.3
        : p < 0.34 ? 0
        : p < 0.54 ? -0.28 * Math.sin(((p - 0.34) / 0.2) * Math.PI)
        : 0;
      // the signal at e.age - back; the beat phase from the song's beats (e.since is the time since the last one)
      const at = (back: number) => {
        if (e.style === 2 && e.age - back > beat * 3) return 0;
        return wave(((((e.since - back) / beat) % 1) + 1) % 1);
      };
      const now = (e.age % span) / span, xDot = x0 + (x1 - x0) * now;
      ctx.strokeStyle = e.accent;
      ctx.lineWidth = kn(e, 'ecg.w');
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      let pen = false;
      for (let x = x0; x <= x1; x += 3) {
        const ahead = x > xDot;
        // the old sweep, behind the gap ahead of the dot; nothing before the first sweep got there
        if (ahead && (x < xDot + gap || e.age < span)) {
          pen = false;
          continue;
        }
        const back = (((xDot - x) / (x1 - x0)) + (ahead ? 1 : 0)) * span;
        const y = y0 + at(back) * amp;
        pen ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        pen = true;
      }
      ctx.stroke();
      ctx.fillStyle = e.accent;
      ctx.beginPath();
      ctx.arc(xDot, y0 + at(0) * amp, 9, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = e.ink;
      ctx.font = '700 26px "Space Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`${Math.round(e.bpm)} BPM`, x1, y0 - amp - 20);
      ctx.globalAlpha = 1;
      e.txt(e.word(0), W - e.cx, H * 0.4, 150, e.ink, 0.15, true);
    },
  },
  blueprint: {
    help: '設計底紙：一張有格線的紙鋪滿背景，底部量尺的指標慢慢滑，人物那側有對準記號（規劃、設計、建造、理想）',
    styles: ['方格紙加十字準星（設計圖、建造）', '橫線筆記本加紅色邊線和打孔（日記、讀書、學生）', '星圖：點和細線連成星座加座標圈（夢想、遠方、夜空）'],
    draw: (e: Env) => {
      const { ctx } = e;
      ctx.strokeStyle = e.ink;
      ctx.fillStyle = e.ink;
      ctx.lineWidth = 1;
      if (e.style === 1) {
        // ruled lines, a red margin, binder holes down the left
        ctx.globalAlpha = 0.18;
        for (let y = 120, d = kn(e, 'blueprint.rule'); y < H; y += d) line(ctx, [[0, y], [W, y]]);
        ctx.strokeStyle = e.accent;
        ctx.globalAlpha = 0.5;
        line(ctx, [[150, 0], [150, H]]);
        ctx.globalAlpha = 0.25;
        for (const y of [H * 0.2, H * 0.5, H * 0.8]) (ctx.beginPath(), ctx.arc(60, y, 18, 0, TAU), ctx.fill());
        ctx.globalAlpha = 1;
        return;
      }
      if (e.style === 2) {
        // stars and the lines between them, drawn on in order; a coordinate ring on the character's side
        const pts = Array.from({ length: kn(e, 'blueprint.stars') }, (_, i) => [180 + hash(i, e.seed) * (W - 360), 120 + hash(i, e.seed + 3) * (H - 300)] as [number, number]);
        ctx.globalAlpha = 0.4;
        for (let i = 0; i < 90; i++) ctx.fillRect(hash(i, 31) * W, hash(i, 32) * H, 2, 2);
        ctx.globalAlpha = 0.6;
        const n = Math.min(pts.length - 1, Math.floor(e.age / 0.25));
        for (let i = 0; i < n; i++) line(ctx, [pts[i], pts[i + 1]]);
        ctx.fillStyle = e.accent;
        ctx.globalAlpha = 1;
        pts.slice(0, n + 1).forEach(([x, y]) => (ctx.beginPath(), ctx.arc(x, y, 6, 0, TAU), ctx.fill()));
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.arc(e.cx, H * 0.45, 220, 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = 1;
        return;
      }
      ctx.globalAlpha = 0.12;
      const grid = kn(e, 'blueprint.grid');
      for (let x = 0; x < W; x += grid) line(ctx, [[x, 0], [x, H]]);
      for (let y = 0; y < H; y += grid) line(ctx, [[0, y], [W, y]]);
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 2;
      // a ruler along the bottom with a marker sliding as the cut plays
      const ry = H - 120;
      line(ctx, [[60, ry], [W - 60, ry]]);
      for (let x = 60; x <= W - 60; x += 30) line(ctx, [[x, ry], [x, ry + ((x - 60) % 150 ? 10 : 22)]]);
      const mx = 60 + (W - 120) * clamp(e.age / 2.5);
      ctx.fillStyle = e.accent;
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.moveTo(mx, ry - 4);
      ctx.lineTo(mx - 10, ry - 22);
      ctx.lineTo(mx + 10, ry - 22);
      ctx.fill();
      // crosshair on the character's side
      ctx.globalAlpha = 0.6;
      const cy = H * 0.45;
      line(ctx, [[e.cx - 60, cy], [e.cx + 60, cy]]);
      line(ctx, [[e.cx, cy - 60], [e.cx, cy + 60]]);
      ctx.beginPath();
      ctx.arc(e.cx, cy, 34, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    },
  },
  gears: {
    help: '齒輪：幾個齒輪咬合轉動，詞寫在旁邊（合作、分擔、系統、互相支撐）',
    draw: (e: Env) => {
      const { ctx } = e, x0 = e.cx;
      const gear = (x: number, y: number, r: number, teeth: number, a: number) => {
        ctx.beginPath();
        for (let i = 0; i < teeth * 2; i++) {
          const rr = i % 2 ? r : r * 1.16;
          const a0 = a + (i / (teeth * 2)) * TAU, a1 = a + ((i + 1) / (teeth * 2)) * TAU;
          ctx.lineTo(x + Math.cos(a0) * rr, y + Math.sin(a0) * rr);
          ctx.lineTo(x + Math.cos(a1) * rr, y + Math.sin(a1) * rr);
        }
        ctx.closePath();
        ctx.fill();
        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        ctx.arc(x, y, r * 0.3, 0, TAU);
        ctx.fill();
        ctx.restore();
      };
      const spin = e.age * 0.8 * kn(e, 'gears.speed') + e.pulse * 0.05, g = kn(e, 'gears.size'), t = kn(e, 'gears.teeth');
      ctx.fillStyle = e.ink;
      ctx.globalAlpha = 0.85;
      gear(x0 - 150, H * 0.55, 150 * g, Math.round(12 * t), spin);
      ctx.fillStyle = e.accent;
      gear(x0 + 120, H * 0.38, 100 * g, Math.round(8 * t), -spin * 1.5 + 0.2);
      ctx.fillStyle = e.ink;
      ctx.globalAlpha = 0.5;
      gear(x0 + 150, H * 0.72, 80 * g, Math.round(7 * t), -spin * 1.9);
      ctx.globalAlpha = 1;
      e.txt(e.word(0), x0 - 150, H * 0.55 + 260, 52, e.ink);
      e.txt(e.word(1), x0 + 250, H * 0.38 - 140, 44, e.accent);
    },
  },
  clock: {
    help: '時鐘：大錶盤、指針轉、刻度一格格亮（時間、等待、下班、倒數）',
    draw: (e: Env) => {
      const { ctx } = e, x = e.cx, y = H / 2, r = kn(e, 'clock.r'), sp = kn(e, 'clock.speed');
      ctx.strokeStyle = e.ink;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.stroke();
      const lit = Math.floor(e.age * 6) % 60;
      for (let i = 0; i < 60; i++) {
        const a = (i / 60) * TAU - Math.PI / 2, long = i % 5 === 0;
        ctx.strokeStyle = i <= lit ? e.accent : e.ink;
        ctx.lineWidth = long ? 6 : 3;
        line(ctx, [[x + Math.cos(a) * (r - (long ? 40 : 22)), y + Math.sin(a) * (r - (long ? 40 : 22))], [x + Math.cos(a) * (r - 8), y + Math.sin(a) * (r - 8)]]);
      }
      const hand = (a: number, len: number, w: number, c: string) => {
        ctx.strokeStyle = c;
        ctx.lineWidth = w;
        ctx.lineCap = 'round';
        line(ctx, [[x, y], [x + Math.cos(a - Math.PI / 2) * len, y + Math.sin(a - Math.PI / 2) * len]]);
      };
      hand(e.age * 0.5 * sp + e.seed, r * 0.5, 14, e.ink);
      hand(e.age * 3 * sp + e.seed * 2, r * 0.8, 8, e.accent);
      e.txt(e.word(0), x, y + r + 70, 56, e.ink);
    },
  },
  measure: {
    help: '尺寸標註：詞被量尺和尺寸箭頭標出長寬高（長大、差距、比較、標準）',
    styles: ['工程圖的寬高箭頭（精準、標準）', '詞下方一把有刻度的尺，刻度一格格長出來（距離、差距）', '詞旁邊一把直立的身高尺，指標往上升（長大、高度、目標）'],
    draw: (e: Env) => {
      const { ctx } = e, x = e.cx, y = H * 0.5, g = clamp(e.age / 0.4);
      e.txt(e.word(0), x, y, 200, e.ink, 0.9, true);
      ctx.strokeStyle = e.accent;
      ctx.fillStyle = e.accent;
      ctx.lineWidth = 3;
      ctx.font = '700 28px "Space Mono", monospace';
      ctx.textAlign = 'center';
      if (e.style === 1) {
        // a ruler under the word, its ticks drawn on from the left, the reading at the end
        // this song's ruler: shorter or longer, finer or coarser ticks
        const len = kn(e, 'measure.len'), tick = kn(e, 'measure.tick');
        const x0 = x - len / 2, top = y + 150, n = Math.floor((len / tick) * g);
        line(ctx, [[x0, top], [x0 + len * g, top]]);
        for (let i = 0; i <= n; i++) line(ctx, [[x0 + i * tick, top], [x0 + i * tick, top + (i % 5 ? 14 : 30)]]);
        for (let i = 0; i <= n; i += 5) ctx.fillText(String(i), x0 + i * tick, top + 60);
        if (e.label) ctx.fillText(reading(e.label, '', g), x0 + len * g, top - 24);
        return;
      }
      if (e.style === 2) {
        // a height chart beside the word, the marker climbing to the word's top
        // on the word's outer side, away from the lyric in the middle
        const tall = kn(e, 'measure.tall');
        const toward = x > W / 2 ? 1 : -1, rx = clamp(x + 260 * toward, 70, W - 70), bot = y + tall, top = y - tall, mark = bot - (bot - top) * g;
        line(ctx, [[rx, bot], [rx, top]]);
        for (let v = bot, i = 0; v >= top; v -= 22, i++) line(ctx, [[rx, v], [rx - (i % 5 ? 14 : 30) * toward, v]]);
        ctx.fillRect(rx - (toward > 0 ? 120 : 0), mark - 3, 120, 6);
        ctx.textAlign = toward > 0 ? 'right' : 'left';
        ctx.fillText(reading(e.label, `${100 + ((Math.round(e.bpm) + e.seed * 17) % 90)} cm`, g), rx - 130 * toward, mark - 14);
        return;
      }
      const half = 330 * g, top = y - 140, bot = y + 140;
      // width arrow above, height bracket at the side, each with its number
      line(ctx, [[x - half, top], [x + half, top]]);
      line(ctx, [[x - half, top - 16], [x - half, top + 16]]);
      line(ctx, [[x + half, top - 16], [x + half, top + 16]]);
      line(ctx, [[x + 360, top + 20], [x + 360, bot]]);
      line(ctx, [[x + 346, top + 20], [x + 374, top + 20]]);
      line(ctx, [[x + 346, bot], [x + 374, bot]]);
      ctx.fillText(reading(e.label, `${Math.round(e.bpm * 5 + e.seed * 10)} mm`, g), x, top - 26);
      ctx.save();
      ctx.translate(x + 400, y + 10);
      ctx.rotate(Math.PI / 2);
      ctx.fillText(`H ${Math.round(e.bpm * 2 + e.seed * 6)}`, 0, 0);
      ctx.restore();
    },
  },
  beforeafter: {
    help: '前後對照：兩條時間軸 BEFORE / AFTER，長條長度不同（改變、變好、回不去）',
    flows: ['rtl'],
    draw: (e: Env) => {
      const { ctx } = e, x0 = e.cx - 420, w = 840;
      ctx.font = '700 28px "Space Mono", monospace';
      ctx.textAlign = 'left';
      const th = kn(e, 'beforeafter.th'), gap = kn(e, 'beforeafter.gap');
      [['BEFORE', 0.75, e.ink], ['AFTER', 0.35, e.accent]].forEach(([label, len, c], i) => {
        const y = H * 0.42 + i * gap;
        ctx.globalAlpha = 0.7;
        ctx.fillStyle = e.ink;
        ctx.fillText(label as string, x0, y - 20);
        ctx.globalAlpha = 0.15;
        ctx.fillRect(x0, y, w, th);
        ctx.globalAlpha = 1;
        ctx.fillStyle = c as string;
        ctx.fillRect(x0, y, w * (len as number) * clamp((e.age - i * 0.25) / 0.5), th);
      });
      e.txt(e.word(0), x0 + w / 2, H * 0.42 + 330, 50, e.ink);
    },
  },
  loop: {
    help: '循環圖：幾個詞排成一圈、箭頭繞著跑（日常、重複、輪迴、每天）',
    draw: (e: Env) => {
      const { ctx } = e, x = e.cx, y = H / 2, r = kn(e, 'loop.r'), n = parts(e, 'loop.n', 3);
      ctx.strokeStyle = e.ink;
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU - Math.PI / 2;
        const on = Math.floor(e.age * 2) % n === i;
        ctx.fillStyle = on ? e.accent : e.paper;
        ctx.strokeStyle = e.ink;
        ctx.beginPath();
        const bw = Math.min(220, ((TAU * r) / n) * 0.8);
        ctx.roundRect(x + Math.cos(a) * r - bw / 2, y + Math.sin(a) * r - 40, bw, 80, 12);
        ctx.fill();
        ctx.stroke();
        e.txt(e.word(i), x + Math.cos(a) * r, y + Math.sin(a) * r, 34, on ? e.paper : e.ink);
      }
      // an arrow head running round the ring
      const a = e.age * 1.4;
      ctx.fillStyle = e.accent;
      ctx.save();
      ctx.translate(x + Math.cos(a) * r, y + Math.sin(a) * r);
      ctx.rotate(a + Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(18, 0);
      ctx.lineTo(-14, -14);
      ctx.lineTo(-14, 14);
      ctx.fill();
      ctx.restore();
    },
  },
  tiles: {
    help: '字格：每個字放進一個方塊，一個個落下排好（呼喊、點名、一字一字強調）',
    styles: ['鍵盤鍵帽，一個個按下去（打字、訊息、數位）', '麻將牌，一張張翻正（賭、運氣、熱鬧、和風）', '活字鉛字，墨黑方塊排上去（印刷、文件、宣言、昭和）', '拼字遊戲木塊，角落有小分數（遊戲、拼湊、輕快）'],
    draw: (e: Env) => {
      const { ctx } = e;
      const chars = [...e.word(0)].slice(0, 8);
      const gap = kn(e, 'tiles.gap'), drop = kn(e, 'tiles.drop');
      const size = Math.min(220, 1500 / Math.max(1, chars.length)), x0 = W / 2 - (chars.length * size * gap) / 2 + (size * gap) / 2;
      chars.forEach((c, i) => {
        const down = clamp((e.age - i * drop) / 0.12);
        const x = x0 + i * size * gap;
        ctx.save();
        ctx.globalAlpha = down;
        if (e.style === 1) {
          // a mahjong tile turning face up: thick ivory body, a coloured back edge, the character carved in
          ctx.translate(x, H * 0.5);
          ctx.scale(1, Math.max(0.05, down));
          const [w, h] = [size * 0.82, size * 1.1];
          ctx.fillStyle = e.accent;
          ctx.beginPath();
          ctx.roundRect(-w / 2 + 6, -h / 2 + 10, w, h, 12);
          ctx.fill();
          ctx.fillStyle = e.paper;
          ctx.strokeStyle = e.ink;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.roundRect(-w / 2, -h / 2, w, h, 12);
          ctx.fill();
          ctx.stroke();
          e.txt(c, 0, 0, size * 0.6, i % 3 === 1 ? e.accent : e.ink);
        } else if (e.style === 2) {
          // a lead sort set into the line: a dark square block with a shoulder, the face in paper
          const y = H * 0.5 + (1 - down) * -30;
          ctx.fillStyle = e.ink;
          ctx.fillRect(x - size / 2, y - size / 2, size, size);
          ctx.globalAlpha = down * 0.35;
          ctx.fillStyle = e.paper;
          ctx.fillRect(x - size / 2 + 6, y + size / 2 - 18, size - 12, 6);
          ctx.globalAlpha = down;
          e.txt(c, x, y - 4, size * 0.66, i % 3 === 1 ? e.accent : e.paper);
        } else if (e.style === 3) {
          // a word-game tile: square wooden face, the letter and a small score in the corner
          const y = H * 0.5 + (1 - down) * -40;
          ctx.rotate(0);
          ctx.fillStyle = e.accent;
          ctx.globalAlpha = down * 0.9;
          ctx.beginPath();
          ctx.roundRect(x - size / 2, y - size / 2, size, size, 10);
          ctx.fill();
          ctx.globalAlpha = down;
          e.txt(c, x, y, size * 0.58, e.paper);
          e.txt(String(1 + Math.floor(hash(i, e.seed) * 9)), x + size * 0.33, y + size * 0.32, size * 0.16, e.paper);
        } else {
          const y = H * 0.5 + (1 - down) * -40;
          ctx.fillStyle = e.ink;
          ctx.beginPath();
          ctx.roundRect(x - size / 2 + 8, y - size / 2 + 12, size, size, 16);
          ctx.fill();
          ctx.fillStyle = i % 3 === 1 ? e.accent : e.paper;
          ctx.strokeStyle = e.ink;
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.roundRect(x - size / 2, y - size / 2, size, size, 16);
          ctx.fill();
          ctx.stroke();
          e.txt(c, x, y, size * 0.62, e.ink);
        }
        ctx.restore();
      });
    },
  },
  metronome: {
    help: '節拍器：倒三角木箱上的擺錘跟著歌的速度左右擺，每拍一下刻度亮（等待、倒數、心跳、規律的日子）',
    draw: (e: Env) => {
      const { ctx } = e, x = e.cx, base = H * 0.86, top = H * 0.26, beat = 60 / e.bpm;
      // the box, the scale behind the arm, the arm swinging one side per beat
      ctx.fillStyle = e.ink;
      ctx.beginPath();
      const bw = kn(e, 'metronome.w'), amp = kn(e, 'metronome.swing');
      ctx.moveTo(x - bw, base);
      ctx.lineTo(x + bw, base);
      ctx.lineTo(x + 70, top);
      ctx.lineTo(x - 70, top);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = e.paper;
      ctx.fillRect(x - 46, top + 50, 92, base - top - 160);
      const swing = Math.sin((e.age / beat) * Math.PI) * amp;
      ctx.strokeStyle = e.ink;
      ctx.lineWidth = 2;
      for (let k = -4; k <= 4; k++) {
        const a = (k / 4) * amp;
        ctx.globalAlpha = Math.abs(a - swing) < 0.06 ? 1 : 0.35;
        line(ctx, [[x + Math.sin(a) * 120, base - 110 - Math.cos(a) * 120], [x + Math.sin(a) * 135, base - 110 - Math.cos(a) * 135]]);
      }
      ctx.globalAlpha = 1;
      const px = x, py = base - 110, len = base - top - 90;
      ctx.strokeStyle = e.accent;
      ctx.lineWidth = 8;
      line(ctx, [[px, py], [px + Math.sin(swing) * len, py - Math.cos(swing) * len]]);
      ctx.fillStyle = e.accent;
      ctx.fillRect(px + Math.sin(swing) * len * 0.55 - 22, py - Math.cos(swing) * len * 0.55 - 14, 44, 28);
    },
  },
  // ---- 2026-10-21: moves learned from the kittenjam motion library and Motion Prompt #121–144 (MIT), redrawn here
  cube: {
    help: '文字方塊：一個立體方塊每面寫一個詞，隔幾拍轉一面（切換、另一面、選擇）',
    draw: (e) => {
      const { ctx } = e, h = kn(e, 'cube.size') / 2, D = 1500, cy = H / 2, beat = 60 / e.bpm;
      // a quarter turn every few beats, eased, about the vertical axis (Motion Prompt #139)
      const hold = kn(e, 'cube.hold') * beat, n = Math.floor(e.age / hold), f = clamp((e.age - n * hold) / 0.45);
      const a = -(n + f * f * (3 - 2 * f)) * (Math.PI / 2) + 0.35 * (e.seed % 2 ? 1 : -1);
      const P = (x: number, y: number, z: number): [number, number] => [e.cx + (x * D) / (D - z), cy - (y * D) / (D - z)];
      const faces = [0, 1, 2, 3].map((j) => ({ j, th: a + (j * Math.PI) / 2 })).filter((x) => Math.cos(x.th) > 0.02).sort((p, q) => Math.cos(p.th) - Math.cos(q.th));
      for (const { j, th } of faces) {
        const [s, c] = [Math.sin(th), Math.cos(th)];
        const at = (u: number, v: number) => P(h * s + u * c, v, h * c - u * s);
        const q = [at(-h, h), at(h, h), at(h, -h), at(-h, -h)];
        ctx.beginPath();
        q.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
        ctx.fillStyle = j % 2 ? e.accent : e.paper;
        ctx.fill();
        ctx.globalAlpha = (1 - c) * 0.55;
        ctx.fillStyle = e.ink;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = e.ink;
        ctx.lineWidth = 5;
        ctx.stroke();
        // the face's word, laid on it by the affine of three of its corners
        const [p00, p10, p01] = [q[0], q[1], q[3]];
        const A = [(p10[0] - p00[0]) / (2 * h), (p10[1] - p00[1]) / (2 * h)], C = [(p01[0] - p00[0]) / (2 * h), (p01[1] - p00[1]) / (2 * h)];
        ctx.save();
        ctx.transform(A[0], A[1], C[0], C[1], p00[0] + h * (A[0] + C[0]), p00[1] + h * (A[1] + C[1]));
        const w = e.word(j);
        e.txt(w, 0, 0, Math.min(h * 0.7, (h * 1.7) / Math.max(1, [...w].length)), j % 2 ? e.paper : e.ink);
        ctx.restore();
      }
    },
  },
  drum: {
    help: '文字圓柱：幾圈詞繞在一個直立的圓柱上轉，背面淡淡反過來（輪迴、日常、繞著你轉）',
    draw: (e) => {
      const { ctx } = e, R = kn(e, 'drum.r'), spin = kn(e, 'drum.speed'), rows = 3, size = 62;
      for (let r = 0; r < rows; r++) {
        const s = [...`${e.word(r)} ・ ${e.word(r + 1)} ・ `];
        const y = H / 2 + (r - 1) * size * 1.6, dir = r % 2 ? -1 : 1;
        s.forEach((c, i) => {
          const phi = (i / s.length) * TAU + e.age * spin * dir + r;
          const z = Math.cos(phi);
          // the back half shows faintly, mirrored; the front faces the viewer and narrows toward the edges
          ctx.save();
          ctx.translate(e.cx + Math.sin(phi) * R * e.k, y);
          ctx.scale(Math.max(0.05, Math.abs(z)) * (z < 0 ? -1 : 1), 1);
          e.txt(c, 0, 0, size, r === 1 ? e.accent : e.ink, z < 0 ? 0.18 : 0.5 + 0.5 * z);
          ctx.restore();
        });
      }
    },
  },
  tape: {
    help: '封鎖膠帶：兩條寫著詞的警示膠帶交叉成 X，字沿著帶子反向跑（禁止、危險、別靠近、封印的心）',
    draw: (e) => {
      const { ctx } = e, ang = kn(e, 'tape.angle'), sp = kn(e, 'tape.speed'), bw = 120;
      [ang, -ang].forEach((a, b) => {
        ctx.save();
        ctx.translate(W / 2, H / 2 + (b ? 60 : -60));
        ctx.rotate(a);
        // slides in from its own side as the cut lands
        ctx.translate((1 - e.k) * W * (b ? 1 : -1), 0);
        ctx.fillStyle = e.accent;
        ctx.fillRect(-W, -bw / 2, W * 2, bw);
        // hazard stripes along both edges
        ctx.fillStyle = e.ink;
        for (let x = -W; x < W; x += 56)
          for (const y of [-bw / 2, bw / 2 - 16]) {
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + 28, y);
            ctx.lineTo(x + 44, y + 16);
            ctx.lineTo(x + 16, y + 16);
            ctx.fill();
          }
        ctx.font = `900 54px ${'"Space Mono", monospace'}`;
        const unit = `${e.word(b)}　・　`, uw = Math.max(200, ctx.measureText(unit).width + 40);
        const off = ((e.age * sp * (b ? -1 : 1)) % uw + uw) % uw;
        for (let x = -W - uw + off; x < W + uw; x += uw) e.txt(unit, x, 2, 54, e.ink);
        ctx.restore();
      });
    },
  },
  corridor: {
    help: '文字走廊：一點透視的長廊，地板和牆上寫滿詞，一路往前走（前進、未來、走下去）',
    draw: (e) => {
      const { ctx } = e, n = kn(e, 'corridor.n'), sp = kn(e, 'corridor.speed'), vx = W / 2, vy = H * 0.46;
      // the four edges running to the vanishing point
      ctx.strokeStyle = e.ink;
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.6;
      for (const [x, y] of [[0, 0], [W, 0], [W, H], [0, H]]) line(ctx, [[vx, vy], [x, y]]);
      // frames at depths coming nearer, each with a word on its floor and its two walls
      for (let i = n - 1; i >= 0; i--) {
        const z = (i / n + e.age * sp) % 1, s = 0.04 + z * z * 1.05;
        const [x0, x1, y0, y1] = [vx - vx * s, vx + (W - vx) * s, vy - vy * s, vy + (H - vy) * s];
        ctx.globalAlpha = Math.min(1, z * 4) * 0.8;
        ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
        const size = 90 * s;
        e.txt(e.word(i), vx, y1 - size * 0.6, size, i % 3 ? e.ink : e.accent, Math.min(1, z * 4));
        for (const [x, r] of [[x0 + size * 0.6, -Math.PI / 2], [x1 - size * 0.6, Math.PI / 2]] as const) {
          ctx.save();
          ctx.translate(x, (y0 + y1) / 2);
          ctx.rotate(r);
          e.txt(e.word(i + 1), 0, 0, size * 0.8, e.ink, Math.min(1, z * 4) * 0.7);
          ctx.restore();
        }
      }
      ctx.globalAlpha = 1;
    },
  },
  confetti: {
    help: '彩紙：從下方兩角噴出的紙片受重力飄落、邊轉邊翻（慶祝、生日、恭喜、派對）',
    draw: (e) => {
      const { ctx } = e, n = kn(e, 'confetti.n'), power = kn(e, 'confetti.power'), g = 900;
      for (let i = 0; i < n; i++) {
        const left = i % 2 === 0, t = Math.max(0, e.age - hash(i, 3) * 0.25);
        const a = -Math.PI / 2 + (left ? 1 : -1) * (0.25 + 0.5 * hash(i, 4));
        const v = power * (0.55 + 0.6 * hash(i, 5));
        // air drag: the burst slows quickly, then each piece sinks at its own speed and sways
        const drag = (1 - Math.exp(-2.2 * t)) / 2.2;
        const x = (left ? 80 : W - 80) + Math.cos(a) * v * drag + Math.sin(t * 3 + i) * 30 * Math.min(1, t);
        const y = H + 20 + Math.sin(a) * v * drag + 0.5 * g * Math.max(0, t - 0.5) ** 1.6 * (0.3 + 0.3 * hash(i, 6));
        if (y > H + 40 && t > 0.5) continue;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(t * (2 + 4 * hash(i, 7)) + i);
        ctx.scale(Math.cos(t * (5 + 6 * hash(i, 8))), 1);
        ctx.fillStyle = [e.accent, e.ink, e.accent][i % 3];
        ctx.globalAlpha = i % 3 === 1 ? 0.7 : 1;
        ctx.fillRect(-9, -5, 18, 10);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    },
  },
  warp: {
    help: '星空穿越：星星從中心往外拉成光線，像高速穿過宇宙（衝刺、出發、越過界線）',
    draw: (e) => {
      const { ctx } = e, n = kn(e, 'warp.n'), sp = kn(e, 'warp.speed'), cx = W / 2, cy = H / 2;
      ctx.lineCap = 'round';
      for (let i = 0; i < n; i++) {
        const a = hash(i, 11) * TAU, z = (hash(i, 12) + e.age * sp * (0.6 + 0.8 * hash(i, 13))) % 1;
        // nearer stars are farther out, longer and brighter
        const r1 = 30 + z * z * 1300, r0 = r1 * (1 - 0.25 * z * e.k);
        ctx.strokeStyle = i % 7 ? e.ink : e.accent;
        ctx.globalAlpha = Math.min(1, z * 3);
        ctx.lineWidth = 1 + z * 4;
        line(ctx, [[cx + Math.cos(a) * r0, cy + Math.sin(a) * r0], [cx + Math.cos(a) * r1, cy + Math.sin(a) * r1]]);
      }
      ctx.globalAlpha = 1;
      ctx.lineCap = 'butt';
    },
  },
  flow: {
    help: '流場線條：上百條細線順著看不見的氣流流動（風、思緒、暗流、空氣）',
    draw: (e) => {
      const { ctx } = e, n = kn(e, 'flow.n'), sp = kn(e, 'flow.speed'), s = e.seed;
      // a still field of currents; dashes run along each streamline
      const angle = (x: number, y: number) => Math.sin(x * 0.0032 + s) * Math.cos(y * 0.0041 - s * 0.5) * Math.PI + Math.sin((x + y) * 0.0012) * 0.8;
      ctx.lineWidth = 2;
      ctx.setLineDash([60, 40]);
      ctx.lineDashOffset = -e.age * sp;
      for (let i = 0; i < n; i++) {
        let x = hash(i, 21) * W, y = hash(i, 22) * H;
        ctx.strokeStyle = i % 9 ? e.ink : e.accent;
        ctx.globalAlpha = (0.25 + 0.4 * hash(i, 23)) * e.k;
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let j = 0; j < 30; j++) {
          const a = angle(x, y);
          x += Math.cos(a) * 14;
          y += Math.sin(a) * 14;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
      ctx.globalAlpha = 1;
    },
  },
  synth: {
    help: '復古透視網格：地平線上一顆切成條紋的夕陽，透視網格地板一直往前推（八〇年代、霓虹、夏夜、懷舊的未來）',
    draw: (e) => {
      const { ctx } = e, hz = H * 0.58, sp = kn(e, 'synth.speed'), rows = kn(e, 'synth.rows');
      // the sun: a disc cut by bands that thicken toward the horizon
      const r = 230, sx = e.cx === W / 2 ? W / 2 : W - e.cx;
      ctx.save();
      ctx.beginPath();
      ctx.arc(sx, hz - 40, r, Math.PI, 0);
      ctx.lineTo(sx + r, hz);
      ctx.lineTo(sx - r, hz);
      ctx.clip();
      ctx.fillStyle = e.accent;
      ctx.fillRect(sx - r, hz - 40 - r, r * 2, r + 40);
      ctx.fillStyle = e.paper;
      for (let i = 0; i < 6; i++) ctx.fillRect(sx - r, hz - 40 - r * 0.45 + i * 34, r * 2, 4 + i * 3);
      ctx.restore();
      ctx.strokeStyle = e.ink;
      ctx.lineWidth = 2;
      line(ctx, [[0, hz], [W, hz]]);
      for (let i = -14; i <= 14; i++) line(ctx, [[W / 2 + i * 30, hz], [W / 2 + i * 260, H]]);
      for (let i = 0; i < rows; i++) {
        const z = (i / rows + e.age * sp) % 1, y = hz + (H - hz) * z * z;
        ctx.globalAlpha = Math.min(1, z * 5);
        line(ctx, [[0, y], [W, y]]);
      }
      ctx.globalAlpha = 1;
    },
  },
  bokeh: {
    help: '散景光點：大小不一的柔焦光圈慢慢往上飄、淡入淡出（夜景、回憶、溫柔、閃閃發亮的城市）',
    draw: (e) => {
      const { ctx } = e, n = kn(e, 'bokeh.n'), R = kn(e, 'bokeh.r');
      for (let i = 0; i < n; i++) {
        const life = 6 + 4 * hash(i, 31), t = (e.age + hash(i, 32) * life) % life, u = t / life;
        const r = R * (0.4 + 0.9 * hash(i, 33)), x = hash(i, 34) * W + Math.sin(t * 0.4 + i) * 30, y = H * (1.05 - u * 1.1);
        const g = ctx.createRadialGradient(x, y, r * 0.2, x, y, r);
        const c = i % 3 ? e.accent : e.ink;
        g.addColorStop(0, `${c}55`);
        g.addColorStop(0.8, `${c}33`);
        g.addColorStop(1, `${c}00`);
        ctx.globalAlpha = Math.sin(Math.PI * u) * e.k;
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    },
  },
  ridges: {
    help: '起伏線條：一排排橫線像山脈或聲波一樣拱起，前面的擋住後面的（脈動、地形、內心起伏）',
    draw: (e) => {
      const { ctx } = e, n = kn(e, 'ridges.n'), amp = kn(e, 'ridges.amp') * (1 + 0.35 * e.pulse) * e.k;
      const top = H * 0.2, gap = (H * 0.68) / n, step = 8;
      // each row: a few smooth hills near the middle (their places drift slowly) and a little ripple
      const hill = (x: number, r: number) => {
        let y = 0;
        for (let b = 0; b < 3; b++) {
          const c = W / 2 + (hash(r, b + 51) - 0.5) * W * 0.36 + Math.sin(e.age * 0.4 + r + b) * 40;
          const w = W * (0.035 + 0.05 * hash(r, b + 61));
          y += (0.4 + 0.8 * hash(r, b + 71)) * Math.exp(-(((x - c) / w) ** 2));
        }
        const mid = Math.exp(-(((x - W / 2) / (W * 0.22)) ** 2));
        return amp * (y * mid + 0.05 * Math.sin(x * 0.03 + r * 2 + e.age * 2) * mid);
      };
      // hidden lines, front row first: a row shows only where it rises above every row in front of it, so nothing
      // is painted over the backdrop (a paper fill per row laid a cream slab over a dark cut, 我愛台妹)
      const horizon = new Float32Array(Math.ceil(W / step) + 1).fill(Infinity);
      for (let r = n - 1; r >= 0; r--) {
        const y0 = top + r * gap;
        ctx.strokeStyle = r === Math.floor(n / 2) ? e.accent : e.ink;
        ctx.lineWidth = 3;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        let open = false;
        for (let k = 0; k * step <= W; k++) {
          const x = k * step, y = y0 - hill(x, r);
          const seen = y < horizon[k] - 2;
          if (seen) open ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
          open = seen;
          horizon[k] = Math.min(horizon[k], y);
        }
        ctx.stroke();
      }
    },
  },
  shapes: {
    help: '漂浮幾何：圓、方塊、三角形和圓環在背景慢慢漂、慢慢轉（輕快、玩心、設計感）',
    draw: (e) => {
      const { ctx } = e, n = kn(e, 'shapes.n'), sp = kn(e, 'shapes.speed');
      for (let i = 0; i < n; i++) {
        const x = (hash(i, 41) * W + e.age * sp * (hash(i, 42) - 0.5) * 2 + W) % W, y = (hash(i, 43) * H - e.age * sp * 0.4 * (0.5 + hash(i, 44)) + H * 4) % H;
        const s = 26 + 60 * hash(i, 45), rot = e.age * (hash(i, 46) - 0.5) * 1.4 + i;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rot);
        ctx.scale(e.k, e.k);
        ctx.strokeStyle = ctx.fillStyle = i % 4 === 0 ? e.accent : e.ink;
        ctx.lineWidth = 5;
        ctx.globalAlpha = i % 4 === 0 ? 0.9 : 0.45;
        ctx.beginPath();
        const kind = i % 4;
        if (kind === 0) ctx.arc(0, 0, s / 2, 0, TAU);
        else if (kind === 1) ctx.rect(-s / 2, -s / 2, s, s);
        else if (kind === 2) (ctx.moveTo(0, -s / 2), ctx.lineTo(s / 2, s / 2), ctx.lineTo(-s / 2, s / 2), ctx.closePath());
        else ctx.arc(0, 0, s / 2, 0, TAU);
        kind === 0 ? ctx.fill() : ctx.stroke();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    },
  },
  lens: {
    help: '放大鏡：滿版小字上一個放大鏡慢慢移動，鏡片裡的字被放大（尋找、注意、細看、偵探）',
    draw: (e) => {
      const { ctx } = e, R = kn(e, 'lens.r'), zoom = kn(e, 'lens.zoom');
      // rows of the cut's words in small type, faint outside the lens and full inside it
      const field = (alpha: number) => {
        for (let r = 0; r < 14; r++) for (let c = 0; c < 9; c++) e.txt(e.word(r * 2 + c), (c + 0.5 + (r % 2) * 0.5) * (W / 9), 40 + r * 78, 34, e.ink, alpha);
      };
      field(0.35);
      // the lens drifts along a slow figure of eight
      const lx = W / 2 + Math.sin(e.age * 0.5 + e.seed) * W * 0.3, ly = H / 2 + Math.sin(e.age * 1 + e.seed) * H * 0.22;
      ctx.save();
      ctx.beginPath();
      ctx.arc(lx, ly, R, 0, TAU);
      ctx.fillStyle = e.paper;
      ctx.fill();
      ctx.clip();
      ctx.translate(lx, ly);
      ctx.scale(zoom, zoom);
      ctx.translate(-lx, -ly);
      field(1);
      ctx.restore();
      ctx.strokeStyle = e.ink;
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.arc(lx, ly, R, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = e.accent;
      ctx.lineWidth = 26;
      ctx.lineCap = 'round';
      line(ctx, [[lx + R * 0.72, ly + R * 0.72], [lx + R * 1.45, ly + R * 1.45]]);
      ctx.lineCap = 'butt';
    },
  },
  layers: {
    help: '分解圖：幾片疊在一起的板子往上拆開，旁邊用引線標上詞，再合回去（拆開來看、組成、心的構造）',
    draw: (e) => {
      const { ctx } = e, n = parts(e, 'layers.n', 3), gap = kn(e, 'layers.gap'), x = e.cx, base = H * 0.78, beat = 60 / e.bpm;
      // apart over the first beats with a little overshoot, layer by layer from the top (Motion Prompt #143)
      const iso = (u: number, v: number, z: number): [number, number] => [x + (u - v) * 0.87, base + (u + v) * 0.5 - z];
      const left = x > W / 2;
      for (let i = 0; i < n; i++) {
        const p = clamp((e.age - 0.2 - (n - 1 - i) * 0.08 * beat * 2) / 0.75);
        const back = 1.3, o = p >= 1 ? 1 : 1 + (back + 1) * (p - 1) ** 3 + back * (p - 1) ** 2;
        const z = i * 10 + i * gap * o + Math.sin(e.age * 2 + i) * 3 * p, s = 190;
        const pts = [iso(-s, -s, z), iso(s, -s, z), iso(s, s, z), iso(-s, s, z)];
        ctx.beginPath();
        pts.forEach(([px, py], j) => (j ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
        ctx.closePath();
        ctx.fillStyle = i === n - 1 ? e.accent : e.paper;
        ctx.fill();
        ctx.strokeStyle = e.ink;
        ctx.lineWidth = 4;
        ctx.stroke();
        // the plate's edge: a thin side so it reads as a slab
        ctx.beginPath();
        ctx.moveTo(...pts[3]);
        ctx.lineTo(pts[3][0], pts[3][1] + 10);
        ctx.lineTo(pts[2][0], pts[2][1] + 10);
        ctx.lineTo(pts[1][0], pts[1][1] + 10);
        ctx.lineTo(...pts[1]);
        ctx.fillStyle = e.ink;
        ctx.fill();
        if (p < 0.6) continue;
        // a leader line from the plate's near corner to its label
        const [ax, ay] = pts[left ? 3 : 1], lx = left ? x - 470 : x + 470;
        ctx.globalAlpha = clamp((p - 0.6) / 0.4);
        ctx.lineWidth = 2;
        line(ctx, [[ax, ay], [lx, ay], [lx, ay]]);
        ctx.font = '900 44px sans-serif';
        const w = e.word(i);
        e.txt(w, lx + (left ? -1 : 1) * (ctx.measureText(w).width / 2 + 16), ay, 44, e.ink);
        ctx.globalAlpha = 1;
      }
    },
  },
  panels: {
    help: '分割畫面：一個畫面拆成兩格、再拆成三格，每格一個詞各自動（同時發生、比較、好幾個地方、好幾個人）',
    draw: (e) => {
      const { ctx } = e, n = parts(e, 'panels.n'), beat = 60 / e.bpm;
      // the dividers slide in one at a time, a couple of beats apart (Motion Prompt #144)
      const open = (j: number) => {
        const p = clamp((e.age - j * 2 * beat) / 0.5);
        return p * p * (3 - 2 * p);
      };
      const edges = [0];
      for (let j = 1; j < n; j++) edges.push(W * (j / n) * open(j) + W * (1 - open(j)));
      edges.push(W);
      for (let j = 0; j < n; j++) {
        const [x0, x1] = [edges[j], Math.max(edges[j], edges[j + 1])];
        if (x1 - x0 < 2) continue;
        ctx.save();
        ctx.beginPath();
        ctx.rect(x0, 0, x1 - x0, H);
        ctx.clip();
        ctx.fillStyle = j % 2 ? e.ink : e.paper;
        ctx.globalAlpha = j % 2 ? 0.12 : 1;
        ctx.fillRect(x0, 0, x1 - x0, H);
        ctx.globalAlpha = 1;
        // each panel's word drifts on its own (up, down, up …); a panel the lyric sits over keeps its word as a faint
        // outline (solid 大雪 stood under 在夢中看見你 and the two read as one)
        const cw = x1 - x0, wd = e.word(j), cx = (x0 + x1) / 2;
        const clear = !e.room || (cx > e.room[0] && cx < e.room[1]);
        e.txt(wd, cx, H / 2 + Math.sin(e.age * 0.8 + j * 2) * 40 * (j % 2 ? -1 : 1), Math.min(240, (cw * 0.8) / Math.max(1, [...wd].length)), j === 1 ? e.accent : e.ink, clear ? 1 : 0.16, !clear);
        ctx.restore();
      }
      ctx.fillStyle = e.ink;
      for (let j = 1; j < n; j++) ctx.fillRect(edges[j] - 4, 0, 8, H);
    },
  },
  path: {
    help: '曲線文字：一行詞沿著波浪線跑，每個字順著線的方向轉，底下一條虛線（路、河、旅程、一路走來）',
    draw: (e) => {
      const { ctx } = e, amp = kn(e, 'path.amp'), sp = kn(e, 'path.speed'), y0 = H * 0.5, size = 58;
      const wave = (x: number) => y0 + amp * Math.sin((x / W) * TAU * 1.3 + e.seed);
      ctx.strokeStyle = e.ink;
      ctx.lineWidth = 5;
      ctx.setLineDash([14, 12]);
      ctx.beginPath();
      for (let x = 0; x <= W; x += 12) (x ? ctx.lineTo(x, wave(x) + 18) : ctx.moveTo(x, wave(x) + 18));
      ctx.stroke();
      ctx.setLineDash([]);
      // characters spaced by arc length along the wave, the string sliding along it (Motion Prompt #131)
      const s = [...`${e.word(0)} ・ ${e.word(1)} ・ `], step = size * 0.95, len = s.length * step;
      let x = -((e.age * sp) % len) - len, i = 0;
      while (x < W + size) {
        const y = wave(x), dy = wave(x + 1) - y;
        if (x > -size) {
          ctx.save();
          ctx.translate(x, y - size * 0.5);
          ctx.rotate(Math.atan(dy));
          e.txt(s[i % s.length], 0, 0, size, s[i % s.length] === '・' ? e.accent : e.ink);
          ctx.restore();
        }
        // advance by one character along the curve, not along x
        x += step / Math.sqrt(1 + dy * dy);
        i++;
      }
    },
  },
  goo: {
    help: '融合球：幾團色塊像液體一樣漂動，靠近時黏在一起、分開時拉斷（融化、依偎、分不開、曖昧）',
    draw: (e) => {
      const { ctx } = e, n = kn(e, 'goo.n'), R = kn(e, 'goo.r'), sp = kn(e, 'goo.speed');
      const balls = Array.from({ length: n }, (_, i) => ({
        x: W / 2 + Math.sin(e.age * sp * (0.5 + hash(i, 1)) + i * 2.1) * W * 0.3,
        y: H / 2 + Math.cos(e.age * sp * (0.4 + hash(i, 2)) + i * 1.3) * H * 0.26,
        r: R * (0.6 + 0.6 * hash(i, 3)) * e.k,
      }));
      // the field of every blob (r² / d² summed), thresholded on a small sheet and blown up soft: where two come close
      // their edges run together like a metaball's
      const sw = 240, sh = 135, sx = W / sw;
      const sheet = typeof document === 'undefined' ? undefined : Object.assign(document.createElement('canvas'), { width: sw, height: sh });
      const g = sheet?.getContext('2d');
      const img = g?.createImageData?.(sw, sh);
      if (!g || !img?.data) {
        ctx.fillStyle = e.accent;
        for (const b of balls) (ctx.beginPath(), ctx.arc(b.x, b.y, b.r, 0, TAU), ctx.fill());
        return;
      }
      const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
      const [ca, ci] = [rgb(e.accent), rgb(e.ink)];
      for (let y = 0; y < sh; y++)
        for (let x = 0; x < sw; x++) {
          let f = 0;
          for (const b of balls) f += (b.r * b.r) / ((x * sx - b.x) ** 2 + (y * sx - b.y) ** 2 + 1);
          if (f < 0.85) continue;
          const o = (y * sw + x) * 4, c = f > 1.6 ? ci : ca;
          [img.data[o], img.data[o + 1], img.data[o + 2], img.data[o + 3]] = [c[0], c[1], c[2], Math.round(255 * Math.min(1, (f - 0.85) / 0.15))];
        }
      g.putImageData(img, 0, 0);
      ctx.drawImage(sheet!, 0, 0, W, H);
    },
  },
  morph: {
    help: '形狀變形：一個大圖形在圓、星、心、方塊、水滴之間慢慢變來變去（轉變、心情變化、成長）',
    draw: (e) => {
      const { ctx } = e, R = kn(e, 'morph.r'), hold = kn(e, 'morph.hold') * (60 / e.bpm);
      // each shape as its radius by angle (y down), so any two blend point by point
      const shapes: ((a: number) => number)[] = [
        () => 0.85,
        (a) => 0.7 + 0.3 * Math.cos(5 * (a + Math.PI / 2)),
        (a) => 0.3 + 0.48 * (1 + Math.sin(a)) ** 0.9,
        (a) => 0.78 / Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a))),
        (a) => 0.5 + 0.45 * Math.max(0, -Math.sin(a)) ** 4 + 0.1,
      ];
      const k0 = Math.floor(e.age / hold), f = clamp((e.age - k0 * hold) / Math.min(hold, 0.6)), q = f * f * (3 - 2 * f);
      const A = shapes[(k0 + e.seed) % shapes.length], B = shapes[(k0 + 1 + e.seed) % shapes.length];
      ctx.beginPath();
      for (let i = 0; i <= 120; i++) {
        const a = (i / 120) * TAU, r = R * e.k * (A(a) * (1 - q) + B(a) * q);
        const [x, y] = [e.cx + Math.cos(a) * r, H / 2 + Math.sin(a) * r];
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = e.accent;
      ctx.fill();
      ctx.strokeStyle = e.ink;
      ctx.lineWidth = 6;
      ctx.stroke();
    },
  },
  glide: {
    help: '沿路飛行：人物或道具沿著一條彎曲的虛線飛過畫面，順著路轉向，後面拖著殘影（旅程、出發、紙飛機、追逐）',
    draw: (e) => {
      if (!e.art) return false;
      const { ctx } = e, a0 = e.art, amp = kn(e, 'glide.amp'), dur = kn(e, 'glide.sec');
      const path = (u: number): [number, number] => [-a0.w * 0.25 + (W + a0.w * 0.5) * u, H * 0.55 - amp * Math.sin(u * Math.PI * 1.6 + e.seed)];
      ctx.strokeStyle = e.ink;
      ctx.lineWidth = 5;
      ctx.setLineDash([2, 16]);
      ctx.lineCap = 'round';
      line(ctx, Array.from({ length: 61 }, (_, i) => path(i / 60)));
      ctx.setLineDash([]);
      ctx.lineCap = 'butt';
      // the character on the path (Motion Prompt #126), turned along it, with faint copies just behind
      const u = (e.age / dur) % 1;
      for (const [lag, alpha] of [[0.06, 0.15], [0.03, 0.3], [0, 1]] as const) {
        const p = Math.max(0, u - lag), [x, y] = path(p), [x2, y2] = path(p + 0.01);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.atan2(y2 - y, x2 - x) * 0.6);
        art(e, 0, 0, 0.55, alpha);
        ctx.restore();
      }
      return true;
    },
  },
} satisfies Record<string, Move>);
// the third set (kinetic-loops.ts): quiet loops, openers and story devices learnt from the 2026-10-25 references
// a loop named like an older move silently replaced it once (stack, ribbon): a clash stops the build instead
const clash = Object.keys(LOOPS).filter((k) => k in MORE); // CORE_FX clashes: kinetic-loops.spec.ts
if (clash.length) throw new Error(`kinetic-loops reuses move names: ${clash.join(', ')}`);
Object.assign(MORE, LOOPS);
export const MORE_FX = Object.keys(MORE);
/** Moves that are a diagram on the character's side: a cut with one has no character. */
export const DIAGRAM_FX = new Set(['gears', 'clock', 'measure', 'beforeafter', 'loop', 'chart', 'metronome', 'cube', 'layers']);

/** Moves whose main shape is a big circle (rings, dials, radial bars, scopes): together they make a song read as circles. */
// (bleed's corner blotches draw as quarter rings)
export const ROUND_FX = new Set(['spectrum', 'pulse', 'clock', 'gears', 'loop', 'hud', 'bleed', 'morph', 'goo']);
/** The most of a song's cuts that may be round (第六感 had 23 of 111). */
export const ROUND_SHARE = 0.12;

/**
 * The cuts' moves (in time order, with each cut's shot) with the moves of a capped group past its cap swapped for a
 * move the director chose elsewhere: an uncapped one from the same shot, else the song's most used uncapped one.
 * `groupOf` names a move's group (undefined: not capped); `capOf` is how many cuts the group may have.
 */
export function capBy(fx: string[], shot: string[], groupOf: (f: string) => string | undefined, capOf: (group: string) => number): string[] {
  const free = (f: string) => groupOf(f) === undefined;
  const count = new Map<string, number>();
  for (const f of fx.filter(free)) count.set(f, (count.get(f) ?? 0) + 1);
  const common = [...count].sort((a, b) => b[1] - a[1]).map(([f]) => f);
  const used = new Map<string, number>();
  return fx.map((f, i) => {
    const g = groupOf(f);
    if (g === undefined) return f;
    used.set(g, (used.get(g) ?? 0) + 1);
    if (used.get(g)! <= capOf(g)) return f;
    // a move unlike its neighbours first; a repeat is better than going over the cap
    const near = fx.filter((h, j) => shot[j] === shot[i] && free(h));
    const fresh = (h: string) => h !== fx[i - 1] && h !== fx[i + 1];
    return near.find(fresh) ?? common.find(fresh) ?? near[0] ?? common[0] ?? f;
  });
}

/** Round moves past ROUND_SHARE of the song swapped out (capBy). */
export const capRound = (fx: string[], shot: string[]): string[] => capBy(fx, shot, (f) => (ROUND_FX.has(f) ? 'round' : undefined), () => Math.ceil(fx.length * ROUND_SHARE));

/** The most of a song's cuts one move may take (雙截棍 and チョロイン put rays on 17 cuts). */
export const MOVE_SHARE = 0.1;
/**
 * Each move kept to MOVE_SHARE of the song (at least `min` cuts) and to its own `limitOf` (a rare move's one or two
 * uses): the cuts past it take another move of the same shot still under its cap, else the song's most used one
 * under it; never the move of the cut before or after. Run last: the other caps' swaps pile onto the common moves.
 */
export function capEach(fx: string[], shot: string[], min = 4, limitOf: (f: string) => number = () => Infinity): string[] {
  const share = Math.max(min, Math.ceil(fx.length * MOVE_SHARE));
  const capOf = (f: string) => Math.min(share, limitOf(f));
  const used = new Map<string, number>();
  const total = new Map<string, number>();
  for (const f of fx) total.set(f, (total.get(f) ?? 0) + 1);
  const out = [...fx];
  out.forEach((f, i) => {
    if ((used.get(f) ?? 0) < capOf(f)) return void used.set(f, (used.get(f) ?? 0) + 1);
    const ok = (h: string) => h !== f && (used.get(h) ?? 0) < capOf(h) && h !== out[i - 1] && h !== fx[i + 1];
    const near = fx.filter((h, j) => shot[j] === shot[i] && ok(h));
    const common = [...total].sort((a, b) => b[1] - a[1]).map(([h]) => h).filter(ok);
    const g = near[0] ?? common[0] ?? f;
    out[i] = g;
    used.set(g, (used.get(g) ?? 0) + 1);
  });
  return out;
}

type Turn = 'mx' | 'my' | 'cw' | 'ccw';
/** How to turn a move drawn running `from` so it runs `to` (mirror across, or a quarter turn onto the long side). */
const TURNS: Record<Flow, Partial<Record<Flow, Turn>>> = {
  ltr: { rtl: 'mx', ttb: 'cw', btt: 'ccw' },
  rtl: { ltr: 'mx', ttb: 'ccw', btt: 'cw' },
  ttb: { btt: 'my', ltr: 'ccw', rtl: 'cw' },
  btt: { ttb: 'my', ltr: 'cw', rtl: 'ccw' },
};
export const turnFor = (from: Flow, to: Flow): Turn | undefined => (from === to ? undefined : TURNS[from][to]);

/**
 * Draws a move running `flow` (when the move can): mirrored, or a quarter turn with the move drawn in a 1080×1920
 * frame so nothing is squashed. Mirrored text is turned back to read (a quarter turn leaves it on its side, like a
 * book spine).
 */
export function drawMove(m: Move | undefined, e: Env, flow?: Flow): boolean {
  if (!m) return false;
  const turn = flow && m.flows?.includes(flow) ? turnFor(m.native ?? 'ltr', flow) : undefined;
  if (!turn) return !!m.draw(e);
  const { ctx } = e;
  ctx.save();
  let env: Env = e;
  if (turn === 'mx') (ctx.translate(W, 0), ctx.scale(-1, 1), (env = { ...e, cx: W - e.cx }));
  else if (turn === 'my') (ctx.translate(0, H), ctx.scale(1, -1));
  else {
    if (turn === 'cw') (ctx.translate(W, 0), ctx.rotate(Math.PI / 2));
    else (ctx.translate(0, H), ctx.rotate(-Math.PI / 2));
    // the move's own words stay upright (their place turns with the move); a band's words run along it (along)
    const up = turn === 'cw' ? -Math.PI / 2 : Math.PI / 2;
    const txt: Env['txt'] = (str, x, y, ...rest) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(up);
      e.txt(str, 0, 0, ...rest);
      ctx.restore();
    };
    env = { ...e, W: H, H: W, cx: H / 2, txt, along: e.txt };
  }
  const own = ctx as unknown as Record<string, unknown>;
  if (turn === 'mx' || turn === 'my') {
    const [sx, sy] = turn === 'mx' ? [-1, 1] : [1, -1];
    const swap: Record<string, CanvasTextAlign> = { left: 'right', right: 'left', start: 'end', end: 'start' };
    for (const name of ['fillText', 'strokeText'] as const) {
      const fn = ctx[name];
      own[name] = (s: string, x: number, y: number, max?: number) => {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(sx, sy);
        if (sx < 0) ctx.textAlign = swap[ctx.textAlign] ?? ctx.textAlign;
        max === undefined ? fn.call(ctx, s, 0, 0) : fn.call(ctx, s, 0, 0, max);
        ctx.restore();
      };
    }
  }
  try {
    return !!m.draw(env);
  } finally {
    delete own['fillText'];
    delete own['strokeText'];
    ctx.restore();
  }
}
