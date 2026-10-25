// The third set of kinetic moves, learnt from 2026-10-25 references and redrawn here (none of their code is used):
// - quiet seamless backgrounds for titles and the unsung seconds between shots (Scenario's "Motion Loops": halftone
//   waves, phyllotaxis, Truchet tiles, Bauhaus grids, contours, moiré, a breathing circle);
// - title and chapter openers (@ai_yunon_ai's opening sets: paper fold, glass panel, stacked cards, scrapbook, ribbon
//   reveal, ink splash);
// - story devices (kittenjam / Motion Prompt: a route drawn between dropped pins, a countdown whose changed digits
//   slide, a plant growing branch by branch).
// Every move draws in the cut's own inks (ink, paper, accent), so it belongs to every style.
import type { Env } from './kinetic-more';
import { kn } from './knobs';

const TAU = Math.PI * 2;
const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const ease = (x: number) => { const t = clamp(x); return t * t * (3 - 2 * t); };
const back = (x: number) => { const t = clamp(x), c = 1.7; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; };
const rnd = (a: number, b = 0) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
/** Slow loops breathe with the song's mood: a ballad drifts, a lively song moves. */
const speed = (e: Env) => 0.5 + (e.mood ?? 0.5);

interface Move { help: string; draw: (e: Env) => boolean | void; quiet?: boolean }

export const LOOPS: Record<string, Move> = {
  // ---------------------------------------------------------------------------------- quiet backgrounds (loops)
  halftone: {
    quiet: true,
    help: '網點波浪：整面網點大小隨一道慢波起伏（安靜的底、間奏、抒情段落）',
    draw: (e) => {
      const { ctx, W, H } = e, gap = kn(e, 'halftone.gap'), t = e.age * 0.6 * speed(e);
      ctx.fillStyle = e.ink;
      for (let y = gap / 2; y < H; y += gap)
        for (let x = gap / 2; x < W; x += gap) {
          const r = (gap * 0.42) * (0.25 + 0.75 * (0.5 + 0.5 * Math.sin(x / 260 + y / 340 - t)));
          ctx.globalAlpha = 0.18;
          ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
        }
      ctx.globalAlpha = 1;
    },
  },
  bloom: {
    quiet: true,
    help: '網點綻放：網點從中心一圈圈脹大又縮回，像呼吸的花（等待、心跳、溫柔）',
    draw: (e) => {
      const { ctx, W, H } = e, gap = kn(e, 'bloom.gap'), t = e.age * speed(e);
      ctx.fillStyle = e.accent;
      for (let y = gap / 2; y < H; y += gap)
        for (let x = gap / 2; x < W; x += gap) {
          const d = Math.hypot(x - W / 2, y - H / 2);
          const r = gap * 0.45 * Math.max(0, Math.sin(d / 120 - t * 1.6)) ** 2;
          if (r < 0.6) continue;
          ctx.globalAlpha = 0.22;
          ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
        }
      ctx.globalAlpha = 1;
    },
  },
  phyllo: {
    quiet: true,
    help: '葉序點陣：點沿黃金角螺旋排開、緩慢旋轉，外圈點較大（花、種子、成長、時間）',
    draw: (e) => {
      const { ctx, W, H } = e, n = kn(e, 'phyllo.n'), rot = e.age * 0.05 * speed(e);
      const R = Math.min(W, H) * 0.62;
      for (let i = 1; i < n; i++) {
        const a = i * 2.39996 + rot, r = R * Math.sqrt(i / n);
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = i % 9 === 0 ? e.accent : e.ink;
        ctx.beginPath(); ctx.arc(W / 2 + Math.cos(a) * r, H / 2 + Math.sin(a) * r, 2 + 7 * (i / n), 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
    },
  },
  truchet: {
    quiet: true,
    help: 'Truchet 流動：四分之一圓弧拼成的迷宮線，每隔一拍有幾格翻轉（迷路、纏繞、命運交錯）',
    draw: (e) => {
      const { ctx, W, H } = e, s = kn(e, 'truchet.s'), beat = Math.floor(e.age * (e.bpm || 100) / 60);
      ctx.strokeStyle = e.ink; ctx.lineWidth = s * 0.12; ctx.globalAlpha = 0.2; ctx.lineCap = 'round';
      for (let y = 0, j = 0; y < H + s; y += s, j++)
        for (let x = 0, i = 0; x < W + s; x += s, i++) {
          const flip = (rnd(i, j) + (rnd(i * 7, j * 3) < 0.08 ? beat * 0.5 : 0)) % 1 < 0.5;
          ctx.beginPath();
          if (flip) { ctx.arc(x, y, s / 2, 0, Math.PI / 2); ctx.moveTo(x + s, y + s / 2); ctx.arc(x + s, y + s, s / 2, -Math.PI / 2, Math.PI, true); }
          else { ctx.arc(x + s, y, s / 2, Math.PI / 2, Math.PI); ctx.moveTo(x + s / 2, y + s); ctx.arc(x, y + s, s / 2, -Math.PI / 2, 0); }
          ctx.stroke();
        }
      ctx.globalAlpha = 1;
    },
  },
  bauhaus: {
    quiet: true,
    help: '包浩斯格子：大格子裡的半圓、四分之一圓、方塊輪流轉向換色（理性、設計感、都市）',
    draw: (e) => {
      const { ctx, W, H } = e, cols = kn(e, 'bauhaus.cols'), s = W / cols, step = Math.floor(e.age * 0.8 * speed(e));
      for (let y = 0, j = 0; y < H; y += s, j++)
        for (let x = 0, i = 0; x < W; x += s, i++) {
          const k = Math.floor(rnd(i, j) * 4 + (rnd(i + 9, j) < 0.25 ? step : 0)) % 4;
          ctx.globalAlpha = 0.16;
          ctx.fillStyle = (i + j) % 3 === 0 ? e.accent : e.ink;
          ctx.save(); ctx.translate(x + s / 2, y + s / 2); ctx.rotate((k * Math.PI) / 2);
          ctx.beginPath();
          if ((i * 3 + j) % 3 === 0) ctx.arc(-s / 2, -s / 2, s, 0, Math.PI / 2);
          else if ((i * 3 + j) % 3 === 1) ctx.arc(0, -s / 2, s / 2, 0, Math.PI);
          else ctx.rect(-s / 2, -s / 2, s / 2, s);
          ctx.lineTo(-s / 2, -s / 2); ctx.fill(); ctx.restore();
        }
      ctx.globalAlpha = 1;
    },
  },
  ripple: {
    quiet: true,
    help: '點陣漣漪：整齊的點陣被一圈圈水波推動起伏（水面、雨、回憶泛起）',
    draw: (e) => {
      const { ctx, W, H } = e, gap = kn(e, 'ripple.gap'), t = e.age * speed(e);
      const cx = W * (0.3 + 0.4 * rnd(e.seed)), cy = H * 0.55;
      ctx.fillStyle = e.ink;
      for (let y = gap / 2; y < H; y += gap)
        for (let x = gap / 2; x < W; x += gap) {
          const d = Math.hypot(x - cx, y - cy), w = Math.sin(d / 46 - t * 3) * Math.exp(-d / 900);
          ctx.globalAlpha = 0.14 + 0.16 * Math.max(0, w);
          ctx.beginPath(); ctx.arc(x, y + w * 10, 3 + 2 * w, 0, TAU); ctx.fill();
        }
      ctx.globalAlpha = 1;
    },
  },
  sines: {
    quiet: true,
    help: '正弦疊線：十幾條細線上下疊著慢慢起伏，像聲波或山脊（旋律、思念、遠方）',
    draw: (e) => {
      const { ctx, W, H } = e, n = kn(e, 'sines.n'), t = e.age * 0.7 * speed(e);
      ctx.lineWidth = 2.5;
      for (let i = 0; i < n; i++) {
        const y0 = H * 0.2 + (i / (n - 1)) * H * 0.6;
        ctx.strokeStyle = i === Math.floor(n / 2) ? e.accent : e.ink; ctx.globalAlpha = 0.22;
        ctx.beginPath();
        for (let x = 0; x <= W; x += 16) { const a = Math.sin(x / 210 + t + i * 0.45) * 26 * Math.sin((x / W) * Math.PI); x ? ctx.lineTo(x, y0 + a) : ctx.moveTo(x, y0 + a); }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    },
  },
  contours: {
    quiet: true,
    help: '等高線：一圈圈不規則的等高線慢慢漂移變形（地圖、旅程、距離、地形）',
    draw: (e) => {
      const { ctx, W, H } = e, t = e.age * 0.25 * speed(e);
      ctx.strokeStyle = e.ink; ctx.lineWidth = 2; ctx.globalAlpha = 0.2;
      for (const [cx, cy, k] of [[0.3, 0.45, 0], [0.72, 0.6, 3]] as const)
        for (let r = 40, step = kn(e, 'contours.step'); r < 700; r += step) {
          ctx.beginPath();
          for (let a = 0; a <= TAU + 0.01; a += 0.08) {
            const rr = r * (1 + 0.16 * Math.sin(a * 3 + t + k + r / 90) + 0.08 * Math.sin(a * 5 - t * 1.3));
            const x = W * cx + Math.cos(a) * rr * 1.3, y = H * cy + Math.sin(a) * rr;
            a ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
          }
          ctx.stroke();
        }
      ctx.globalAlpha = 1;
    },
  },
  moire: {
    quiet: true,
    help: '摩爾紋：兩組同心圓互相滑過，干涉出流動的紋路（迷幻、恍惚、兩個人的交會）',
    draw: (e) => {
      const { ctx, W, H } = e, t = e.age * 0.3 * speed(e);
      ctx.lineWidth = 3; ctx.strokeStyle = e.ink; ctx.globalAlpha = 0.14;
      for (const [cx, cy] of [[W / 2 + Math.sin(t) * 160, H / 2], [W / 2 - Math.sin(t) * 160, H / 2 + Math.cos(t) * 60]])
        for (let r = 12, step = kn(e, 'moire.step'); r < 1300; r += step) { ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke(); }
      ctx.globalAlpha = 1;
    },
  },
  breathe: {
    quiet: true,
    help: '呼吸圓：畫面中一個大圓隨拍子緩緩脹縮，外圍一圈細線跟著擴散（等待、平靜、心跳）',
    draw: (e) => {
      const { ctx, W, H } = e, beat = 60 / (e.bpm || 90), ph = (e.age % (beat * 2)) / (beat * 2);
      const r = H * (kn(e, 'breathe.size') + 0.03 * Math.sin(ph * TAU));
      ctx.globalAlpha = 0.2; ctx.fillStyle = e.accent;
      ctx.beginPath(); ctx.arc(W / 2, H / 2, r, 0, TAU); ctx.fill();
      ctx.globalAlpha = 0.25 * (1 - ph); ctx.strokeStyle = e.ink; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(W / 2, H / 2, r * (1 + ph * 0.8), 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
    },
  },

  // ---------------------------------------------------------------------------------- openers and chapter cards
  paperfold: {
    help: '紙張摺疊：一張紙從摺起的狀態一折一折打開，露出中間的詞（開場、信、坦白）',
    draw: (e) => {
      const { ctx, W, H } = e, k = ease(e.age / kn(e, 'paperfold.sec')), w = W * 0.5, h = H * 0.42;
      ctx.save(); ctx.translate(W / 2, H / 2);
      // three panels: the outer two swing open on their hinges (shown by their width), shaded while they turn
      const open = [clamp(k * 2), clamp(k * 2 - 1)];
      ctx.fillStyle = e.paper; ctx.strokeStyle = e.ink; ctx.lineWidth = 3;
      ctx.fillRect(-w / 6, -h / 2, w / 3, h); ctx.strokeRect(-w / 6, -h / 2, w / 3, h);
      [[-1, open[0]], [1, open[1]]].forEach(([side, o]) => {
        const pw = (w / 3) * o;
        ctx.fillStyle = e.paper; ctx.fillRect(side < 0 ? -w / 6 - pw : w / 6, -h / 2, pw, h);
        ctx.globalAlpha = 0.25 * (1 - o); ctx.fillStyle = e.ink; ctx.fillRect(side < 0 ? -w / 6 - pw : w / 6, -h / 2, pw, h); ctx.globalAlpha = 1;
        ctx.strokeRect(side < 0 ? -w / 6 - pw : w / 6, -h / 2, pw, h);
      });
      ctx.restore();
      if (k > 0.7) e.txt(e.word(0), W / 2, H / 2, 120, e.ink, ease((k - 0.7) / 0.3));
    },
  },
  glass: {
    help: '玻璃面板：一片半透明的玻璃板從下方滑上來，邊緣一道光掃過，詞浮在玻璃上（未來、冷靜、清澈）',
    draw: (e) => {
      const { ctx, W, H } = e, k = back(e.age / 0.8), w = W * kn(e, 'glass.w'), h = H * 0.36, y = H / 2 + (1 - k) * H * 0.5;
      ctx.save();
      ctx.globalAlpha = 0.55; ctx.fillStyle = e.paper;
      ctx.beginPath(); ctx.roundRect(W / 2 - w / 2, y - h / 2, w, h, 28); ctx.fill();
      ctx.globalAlpha = 0.9; ctx.strokeStyle = e.ink; ctx.lineWidth = 2; ctx.stroke();
      // the glint: a slanted band of light passes across once
      const g = clamp((e.age - 0.6) / 0.7);
      if (g > 0 && g < 1) {
        ctx.clip();
        ctx.globalAlpha = 0.35; ctx.fillStyle = '#ffffff';
        const gx = W / 2 - w / 2 + g * (w + 200) - 100;
        ctx.beginPath(); ctx.moveTo(gx, y - h / 2); ctx.lineTo(gx + 70, y - h / 2); ctx.lineTo(gx - 30, y + h / 2); ctx.lineTo(gx - 100, y + h / 2); ctx.fill();
      }
      ctx.restore();
      e.txt(e.word(0), W / 2, y, 104, e.ink, clamp((e.age - 0.3) / 0.3));
    },
  },
  cardstack: {
    help: '卡片疊放：幾張卡片從畫面外一張張飛來疊上，最上面那張寫著詞，下面的微微錯開（收集、回憶一張張、清單）',
    draw: (e) => {
      const { ctx, W, H } = e, n = Math.max(3, Math.min(5, e.count ?? kn(e, 'cardstack.n'))), w = W * 0.3, h = H * 0.42;
      for (let i = 0; i < n; i++) {
        const k = back((e.age - i * 0.16) / 0.45);
        if (k <= 0) continue;
        const rot = (rnd(e.seed, i) - 0.5) * 0.16 * (i < n - 1 ? 1 : 0.3), from = i % 2 ? 1 : -1;
        ctx.save(); ctx.translate(W / 2 + (1 - k) * from * W * 0.7 + (i - n + 1) * 14, H / 2 + (i - n + 1) * 10); ctx.rotate(rot * k);
        ctx.fillStyle = i === n - 1 ? e.paper : i % 2 ? e.accent : e.ink; ctx.globalAlpha = i === n - 1 ? 1 : 0.85;
        ctx.fillRect(-w / 2, -h / 2, w, h); ctx.globalAlpha = 1; ctx.strokeStyle = e.ink; ctx.lineWidth = 3; ctx.strokeRect(-w / 2, -h / 2, w, h);
        ctx.restore();
      }
      if (e.age > n * 0.16 + 0.3) e.txt(e.word(0), W / 2, H / 2, 92, e.ink, clamp((e.age - n * 0.16 - 0.3) / 0.25));
    },
  },
  scrapbook: {
    help: '剪貼簿：撕邊紙片、膠帶和小貼紙一片片貼上，詞寫在中間那張紙上（日記、回憶、手作感）',
    draw: (e) => {
      const { ctx, W, H } = e;
      const bits = [[0.3, 0.38, 0.22, 0.26, -0.12], [0.66, 0.6, 0.24, 0.24, 0.1], [0.5, 0.5, 0.34, 0.34, -0.03]];
      bits.forEach(([x, y, w, h, r], i) => {
        const k = back((e.age - i * 0.2) / 0.4);
        if (k <= 0) return;
        ctx.save(); ctx.translate(W * x, H * y); ctx.rotate(r * kn(e, 'scrapbook.tilt')); ctx.scale(k, k);
        ctx.fillStyle = i === 2 ? e.paper : i ? e.accent : e.ink; ctx.globalAlpha = i === 2 ? 1 : 0.8;
        ctx.beginPath();
        const pw = W * w, ph = H * h;
        for (let s = 0; s <= 24; s++) ctx.lineTo(-pw / 2 + (pw * s) / 24, -ph / 2 + (rnd(i, s) - 0.5) * 12);
        for (let s = 24; s >= 0; s--) ctx.lineTo(-pw / 2 + (pw * s) / 24, ph / 2 + (rnd(i + 5, s) - 0.5) * 12);
        ctx.fill();
        // tape across the top corner
        ctx.globalAlpha = 0.6; ctx.fillStyle = e.paper; ctx.rotate(-0.5); ctx.fillRect(-pw * 0.42, -ph * 0.62, pw * 0.3, 28);
        ctx.restore();
      });
      if (e.age > 0.7) e.txt(e.word(0), W * 0.5, H * 0.5, 96, e.ink, clamp((e.age - 0.7) / 0.25));
    },
  },
  unveil: {
    help: '緞帶揭露：一條寬緞帶從一側捲過畫面，緞帶過去的地方露出詞（揭曉、開場、禮物）',
    draw: (e) => {
      const { ctx, W, H } = e, k = ease(e.age / 0.9), x = -W * 0.2 + k * W * 1.4;
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, Math.max(0, x - 80), H); ctx.clip();
      e.txt(e.word(0), W / 2, H / 2, 140, e.ink);
      ctx.restore();
      ctx.fillStyle = e.accent;
      ctx.beginPath();
      for (let y = -40; y <= H + 40; y += 20) ctx.lineTo(x + Math.sin(y / 90 + e.age * 4) * 30, y);
      for (let y = H + 40; y >= -40; y -= 20) ctx.lineTo(x - kn(e, 'unveil.width') + Math.sin(y / 90 + e.age * 4 + 0.6) * 30, y);
      ctx.fill();
    },
  },
  splash: {
    help: '墨水噴濺：一滴墨落下濺開成一團不規則的墨，濺點四散，詞從墨團中央浮出（衝擊、情緒爆發、心碎）',
    draw: (e) => {
      const { ctx, W, H } = e, cx = W / 2, cy = H / 2, k = ease((e.age - 0.25) / 0.35);
      const drop = clamp(e.age / 0.25);
      ctx.fillStyle = e.accent;
      if (drop < 1) { ctx.beginPath(); ctx.arc(cx, -40 + drop * (cy + 40), 24, 0, TAU); ctx.fill(); return; }
      ctx.beginPath();
      for (let a = 0; a <= TAU + 0.01; a += TAU / 60) {
        const r = H * 0.26 * k * (1 + 0.22 * Math.sin(a * 7 + e.seed) + 0.12 * rnd(Math.round(a * 10), e.seed));
        ctx.lineTo(cx + Math.cos(a) * r * 1.3, cy + Math.sin(a) * r);
      }
      ctx.fill();
      for (let i = 0, drops = kn(e, 'splash.drops'); i < drops; i++) {
        const a = rnd(i, e.seed) * TAU, d = H * (0.3 + 0.25 * rnd(i + 3)) * k;
        ctx.beginPath(); ctx.arc(cx + Math.cos(a) * d * 1.3, cy + Math.sin(a) * d, 6 + 14 * rnd(i + 7), 0, TAU); ctx.fill();
      }
      if (k > 0.6) e.txt(e.word(0), cx, cy, 110, e.paper, ease((k - 0.6) / 0.4));
    },
  },

  // ---------------------------------------------------------------------------------- story devices
  route: {
    help: '地圖路線：幾個地標針依序落下，路線從起點畫到終點，小點沿路線前進，每站標上詞（旅程、出發、從這裡到那裡）',
    draw: (e) => {
      const { ctx, W, H } = e, n = Math.max(2, Math.min(4, e.count ?? kn(e, 'route.n')));
      const pts = Array.from({ length: n }, (_, i) => [W * (0.18 + (0.64 * i) / (n - 1)), H * (0.62 - 0.22 * Math.sin(i * 1.7 + e.seed))] as const);
      // the dashed road, drawn up to where the traveller is
      const k = clamp((e.age - n * 0.18) / 1.6), total = n - 1, upTo = k * total;
      ctx.setLineDash([16, 14]); ctx.lineWidth = 6; ctx.strokeStyle = e.ink; ctx.beginPath();
      for (let s = 0; s <= upTo * 30; s++) {
        const u = s / 30, i = Math.min(total - 1, Math.floor(u)), f = u - i, [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
        const x = x0 + (x1 - x0) * f, y = y0 + (y1 - y0) * f - Math.sin(f * Math.PI) * 60;
        s ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke(); ctx.setLineDash([]);
      pts.forEach(([x, y], i) => {
        const d = back((e.age - i * 0.18) / 0.35);
        if (d <= 0) return;
        const py = y - (1 - d) * 200;
        ctx.fillStyle = e.accent; ctx.beginPath(); ctx.arc(x, py - 34, 22, Math.PI * 0.85, Math.PI * 2.15); ctx.lineTo(x, py); ctx.fill();
        ctx.fillStyle = e.paper; ctx.beginPath(); ctx.arc(x, py - 36, 8, 0, TAU); ctx.fill();
        if (upTo >= i - 0.05) e.txt(e.word(i), x, py + 48, 44, e.ink, clamp((upTo - i + 0.3) * 3));
      });
    },
  },
  countdown: {
    help: '倒數數字：數字一格格倒數，只有變動的那一位往上滑走、新數字從下方滑入（倒數、等待、時間到）',
    draw: (e) => {
      const { ctx, W, H } = e, from = kn(e, 'countdown.from'), per = 60 / (e.bpm || 100), n = Math.max(0, from - Math.floor(e.age / per)), f = clamp(((e.age % per) / per) / 0.3);
      const now = String(n).padStart(2, '0'), prev = String(Math.min(from, n + 1)).padStart(2, '0');
      const size = 260, cw = size * 0.62;
      [0, 1].forEach((d) => {
        const x = W / 2 + (d - 0.5) * cw, changed = now[d] !== prev[d];
        ctx.save(); ctx.beginPath(); ctx.rect(x - cw / 2, H / 2 - size * 0.6, cw, size * 1.2); ctx.clip();
        if (changed && n < from) {
          e.txt(prev[d], x, H / 2 - ease(f) * size, size, e.ink);
          e.txt(now[d], x, H / 2 + (1 - ease(f)) * size, size, e.ink);
        } else e.txt(now[d], x, H / 2, size, e.ink);
        ctx.restore();
      });
      e.txt(e.word(0), W / 2, H / 2 + size * 0.8, 56, e.accent);
    },
  },
  plant: {
    help: '樹枝生長：一根枝幹從底部長出、分岔，葉子一片片冒出，詞掛在最高的枝頭（成長、希望、時間流過）',
    draw: (e) => {
      const { ctx, W, H } = e, k = clamp(e.age / 2.2);
      ctx.strokeStyle = e.ink; ctx.lineCap = 'round';
      const grow = (x: number, y: number, a: number, len: number, depth: number, t0: number, id: number): [number, number] => {
        const t = clamp((k - t0) / 0.28);
        if (t <= 0) return [x, y];
        const x1 = x + Math.cos(a) * len * t, y1 = y + Math.sin(a) * len * t;
        ctx.lineWidth = 3 + depth * 3; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x1, y1); ctx.stroke();
        let top: [number, number] = [x1, y1];
        if (depth > 0 && t >= 1) {
          const l = grow(x1, y1, a - 0.5 - rnd(id, 1) * 0.3, len * 0.72, depth - 1, t0 + 0.24, id * 2 + 1);
          const r = grow(x1, y1, a + 0.45 + rnd(id, 2) * 0.3, len * 0.7, depth - 1, t0 + 0.28, id * 2 + 2);
          top = l[1] < r[1] ? l : r;
        } else if (depth === 0 && t >= 1) {
          ctx.fillStyle = id % 3 ? e.accent : e.ink; ctx.globalAlpha = 0.85;
          ctx.beginPath(); ctx.ellipse(x1, y1, 16, 9, a, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
        }
        return top;
      };
      const [tx, ty] = grow(W / 2, H * 0.95, -Math.PI / 2, H * 0.24, kn(e, 'plant.depth'), 0, 1);
      if (k > 0.85) e.txt(e.word(0), tx, ty - 50, 60, e.ink, clamp((k - 0.85) / 0.15));
    },
  },
};

/** The quiet ones (backgrounds for unsung seconds and calm songs); the rest open a chapter or carry a story beat. */
export const QUIET_LOOPS = Object.keys(LOOPS).filter((k) => LOOPS[k].quiet);
