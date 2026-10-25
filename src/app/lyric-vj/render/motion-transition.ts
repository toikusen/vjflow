// Motion transitions: unlike the shape reveals in transition.ts, both pictures move. The section before (a) and the
// new one (b) are each drawn whole to their own canvas, then composited with transforms, blur and light at progress
// k (0 → 1). Read frame by frame from the @ai_yunon_ai「画面切り替え40選」catalogue (2026-10-19): most land in 8–15
// frames, the light and blur ones in 20–25.
type Pic = CanvasImageSource;
type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
interface Env {
  ctx: Ctx;
  a: Pic;
  b: Pic;
  k: number;
  w: number;
  h: number;
  seed: number;
}
interface Move {
  sec: number;
  mood: string;
  draw: (e: Env) => void;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const outCubic = (x: number) => 1 - (1 - clamp01(x)) ** 3;
const inCubic = (x: number) => clamp01(x) ** 3;
const inOut = (x: number) => {
  const k = clamp01(x);
  return k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
};
/** Overshoots its target and settles (a spring). */
const spring = (x: number) => (x >= 1 ? 1 : 1 - Math.exp(-6 * clamp01(x)) * Math.cos(clamp01(x) * 11));
const hash = (a: number, b: number) => {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** Draws a picture whole, moved, scaled and turned about the frame centre. */
function put(e: Env, p: Pic, o: { x?: number; y?: number; s?: number; sx?: number; sy?: number; r?: number; alpha?: number; blur?: number } = {}) {
  const { ctx, w, h } = e;
  if ((o.alpha ?? 1) <= 0.001) return;
  // moved wholly out of frame (an unscaled picture)
  if ((o.s ?? 1) * (o.sx ?? 1) <= 1 && (Math.abs(o.x ?? 0) >= w || Math.abs(o.y ?? 0) >= h)) return;
  ctx.save();
  ctx.globalAlpha = o.alpha ?? 1;
  if (o.blur && o.blur > 0.3) ctx.filter = `blur(${o.blur.toFixed(1)}px)`;
  ctx.translate(w / 2 + (o.x ?? 0), h / 2 + (o.y ?? 0));
  ctx.rotate(o.r ?? 0);
  ctx.scale((o.s ?? 1) * (o.sx ?? 1), (o.s ?? 1) * (o.sy ?? 1));
  ctx.drawImage(p, -w / 2, -h / 2, w, h);
  ctx.restore();
}

/** A copy smeared along x: a few faint offset copies (motion blur that a canvas blur filter cannot aim). */
function smear(e: Env, p: Pic, x: number, len: number, alpha = 1) {
  const n = 6;
  for (let i = n; i >= 0; i--) put(e, p, { x: x - (len * i) / n, alpha: (i === 0 ? 1 : 0.22) * alpha });
}

/**
 * The picture as a panel turning on a vertical axis: `turn` 0 faces the viewer, ±1 is edge-on; drawn in strips whose
 * height shrinks toward the far edge (perspective). `pivot` is the x (0..1 of the frame) the panel turns about.
 */
function panel(e: Env, p: Pic, turn: number, pivot: number, shade = 0.55) {
  const { ctx, w, h } = e;
  const a = turn * Math.PI / 2;
  const width = w * Math.cos(a);
  if (width < 1) return;
  const left = pivot * w - pivot * width;
  const strips = 32;
  const far = Math.sin(Math.abs(a)) * 0.22;
  for (let i = 0; i < strips; i++) {
    const u = i / strips;
    // the side turned away is smaller (further), the near side a little bigger
    const depth = turn > 0 ? u : 1 - u;
    const sh = h * (1 + far * 0.4 - far * depth * 1.4);
    ctx.drawImage(p, (u * w), 0, w / strips + 1, h, left + u * width, (h - sh) / 2, width / strips + 1, sh);
  }
  ctx.save();
  ctx.globalAlpha = Math.sin(Math.abs(a)) * shade;
  ctx.fillStyle = '#000';
  ctx.fillRect(left, 0, width, h);
  ctx.restore();
}

/** Same as panel but turning on a horizontal axis (rolls, flips top over bottom). */
function rollPanel(e: Env, p: Pic, turn: number, pivot: number, shade = 0.55) {
  const { ctx, w, h } = e;
  const a = turn * Math.PI / 2;
  const height = h * Math.cos(a);
  if (height < 1) return;
  const top = pivot * h - pivot * height;
  const strips = 24;
  const far = Math.sin(Math.abs(a)) * 0.2;
  for (let i = 0; i < strips; i++) {
    const u = i / strips;
    const depth = turn > 0 ? u : 1 - u;
    const sw = w * (1 + far * 0.4 - far * depth * 1.4);
    ctx.drawImage(p, 0, u * h, w, h / strips + 1, (w - sw) / 2, top + u * height, sw, height / strips + 1);
  }
  ctx.save();
  ctx.globalAlpha = Math.sin(Math.abs(a)) * shade;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, top, w, height);
  ctx.restore();
}

function wash(e: Env, color: string, alpha: number) {
  if (alpha <= 0.001) return;
  e.ctx.save();
  e.ctx.globalAlpha = clamp01(alpha);
  e.ctx.fillStyle = color;
  e.ctx.fillRect(0, 0, e.w, e.h);
  e.ctx.restore();
}

/** Draws `p` only inside the path `shape` builds. */
function inside(e: Env, p: Pic, shape: (c: Ctx) => void, o: Parameters<typeof put>[2] = {}) {
  e.ctx.save();
  e.ctx.beginPath();
  shape(e.ctx);
  e.ctx.clip();
  put(e, p, o);
  e.ctx.restore();
}

const cross = (e: Env, k: number, ao: Parameters<typeof put>[2] = {}, bo: Parameters<typeof put>[2] = {}) => {
  put(e, e.a, ao);
  put(e, e.b, { ...bo, alpha: (bo.alpha ?? 1) * clamp01(k) });
};

export const MOTION = {
  // ---- impact cuts
  whip: {
    sec: 0.35, mood: '甩鏡：高速甩過去、殘影拉線，動作、速度、轉場有勁',
    draw: (e) => {
      // both pictures travel together like a camera whipping across, smeared most at full speed (mid-way)
      const q = inOut(e.k), x = e.w * q, len = e.w * 0.3 * Math.sin(e.k * Math.PI);
      smear(e, e.a, -x, -len);
      smear(e, e.b, e.w - x, -len);
    },
  },
  burst: {
    sec: 0.45, mood: '放射衝擊：中心爆出集中線、舊畫面衝向鏡頭，衝擊、揭曉、重拍',
    draw: (e) => {
      const { ctx, k, w, h, seed } = e;
      cross(e, outCubic((k - 0.3) / 0.4), { s: 1 + 0.6 * inCubic(k), blur: 14 * k }, { s: 1.25 - 0.25 * outCubic(k), blur: 10 * (1 - k) });
      const r0 = w * 0.05 + w * 0.9 * outCubic(k), r1 = r0 + w * 0.25 * (1 - k);
      ctx.save();
      ctx.strokeStyle = `rgba(255,255,255,${0.9 * (1 - k)})`;
      ctx.lineWidth = 6;
      for (let i = 0; i < 40; i++) {
        const a = (i / 40) * Math.PI * 2 + hash(i, seed) * 0.1;
        ctx.beginPath();
        ctx.moveTo(w / 2 + Math.cos(a) * r0, h / 2 + Math.sin(a) * r0);
        ctx.lineTo(w / 2 + Math.cos(a) * r1, h / 2 + Math.sin(a) * r1);
        ctx.stroke();
      }
      ctx.restore();
    },
  },
  spinzoom: {
    sec: 0.5, mood: '旋轉吸入：轉著被吸進中心再轉出來，暈眩、掉進另一個世界',
    draw: (e) => {
      const { k } = e;
      if (k < 0.5) put(e, e.a, { r: 1.6 * inCubic(k * 2), s: 1 - 0.85 * inCubic(k * 2), blur: 8 * k });
      else {
        const q = (k - 0.5) * 2;
        put(e, e.b, { r: -1.6 * (1 - outCubic(q)), s: 0.15 + 0.85 * outCubic(q), blur: 8 * (1 - q) });
      }
    },
  },
  glitchjump: {
    sec: 0.45, mood: '故障跳接：切片錯位、紅藍分離、閃爍後跳到下一個，數位、錯亂、訊號',
    draw: (e) => {
      const { ctx, k, w, h, seed } = e;
      const step = Math.floor(k * 14);
      const pic = hash(step, seed) < k ? e.b : e.a;
      put(e, pic);
      if (k > 0.92) return;
      // horizontal slices pushed sideways, a colour-split copy
      for (let i = 0; i < 9; i++) {
        const y = hash(i, step + seed) * h, sh = 20 + hash(i + 3, step) * 90, dx = (hash(i + 7, step) - 0.5) * w * 0.25;
        ctx.drawImage(pic, 0, y, w, sh, dx, y, w, sh);
      }
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.25;
      ctx.drawImage(pic, 14, 0, w, h);
      ctx.restore();
    },
  },
  flashcut: {
    sec: 0.3, mood: '白光一閃就換：節拍、衝擊、拍照',
    draw: (e) => {
      const { k } = e;
      put(e, k < 0.4 ? e.a : e.b);
      wash(e, '#ffffff', k < 0.4 ? inCubic(k / 0.4) : 1 - outCubic((k - 0.4) / 0.6));
    },
  },
  shakecut: {
    sec: 0.4, mood: '震動切換：畫面一震被敲進來，衝擊、生氣、重拍',
    draw: (e) => {
      const { k, seed } = e;
      const amp = 40 * (k < 0.45 ? k / 0.45 : 1 - (k - 0.45) / 0.55);
      const j = Math.floor(k * 20);
      put(e, k < 0.45 ? e.a : e.b, { x: (hash(j, seed) - 0.5) * amp * 2, y: (hash(j, seed + 1) - 0.5) * amp, r: (hash(j, seed + 2) - 0.5) * amp * 0.002, s: 1.04 });
    },
  },
  cube: {
    sec: 0.6, mood: '立方體轉面：像轉骰子換到下一面，立體、科技、換主題',
    draw: (e) => {
      const q = inOut(e.k);
      // the old face turns away to the left about its left edge, the new one turns in from the right
      panel(e, e.a, q, 0, 0.6);
      panel(e, e.b, -(1 - q), 1, 0.6);
    },
  },
  cardflip: {
    sec: 0.5, mood: '卡片翻面：像翻牌看到背面，揭曉、遊戲、反轉',
    draw: (e) => {
      const q = inOut(e.k);
      if (q < 0.5) panel(e, e.a, q * 2, 0.5, 0.5);
      else panel(e, e.b, -(1 - (q - 0.5) * 2), 0.5, 0.5);
    },
  },
  // ---- slide & push
  push: {
    sec: 0.45, mood: '推入：下一個把現在的推出去，前進、換話題、清楚',
    draw: (e) => {
      const x = e.w * inOut(e.k);
      put(e, e.a, { x: -x });
      put(e, e.b, { x: e.w - x });
    },
  },
  slideover: {
    sec: 0.45, mood: '滑入覆蓋：新的從上方滑下蓋住，加一層、追加、補充',
    draw: (e) => {
      put(e, e.a, { s: 1 - 0.04 * e.k });
      wash(e, '#000', 0.35 * e.k);
      put(e, e.b, { y: -e.h * (1 - outCubic(e.k)) });
    },
  },
  slidereveal: {
    sec: 0.45, mood: '抽走露出：舊的被抽走、下面原本就是新的，揭曉、真相',
    draw: (e) => {
      put(e, e.b, { s: 1.04 - 0.04 * e.k });
      put(e, e.a, { x: e.w * inCubic(e.k) * 1.02 });
    },
  },
  elastic: {
    sec: 0.6, mood: '彈性滑入：彈進來還會回彈，活潑、可愛、元氣',
    draw: (e) => {
      put(e, e.a, { x: -e.w * 0.3 * outCubic(e.k), alpha: 1 });
      put(e, e.b, { x: e.w * (1 - spring(e.k)) });
    },
  },
  parallax: {
    sec: 0.55, mood: '視差滑動：前後景速度不同的滑動，深度、旅程、移動',
    draw: (e) => {
      const q = inOut(e.k);
      put(e, e.a, { x: -e.w * 0.35 * q });
      wash(e, '#000', 0.3 * q);
      put(e, e.b, { x: e.w * (1 - q) });
    },
  },
  stack: {
    sec: 0.5, mood: '疊卡：新的一張從下方疊上來、舊的退後變暗，累積、一頁頁',
    draw: (e) => {
      const q = outCubic(e.k);
      put(e, e.a, { s: 1 - 0.12 * q });
      wash(e, '#000', 0.45 * q);
      put(e, e.b, { y: e.h * (1 - q), s: 0.92 + 0.08 * q });
    },
  },
  rollover: {
    sec: 0.6, mood: '縱向翻滾：上下翻轉到下一面，翻篇、換場、立體',
    draw: (e) => {
      const q = inOut(e.k);
      rollPanel(e, e.a, q, 1, 0.6);
      rollPanel(e, e.b, -(1 - q), 0, 0.6);
    },
  },
  barndoor: {
    sec: 0.55, mood: '對開門：從中線往左右打開，開場、揭幕、登場',
    draw: (e) => {
      const { w, h } = e;
      const q = inOut(e.k), o = w * 0.5 * q;
      put(e, e.b, { s: 1.06 - 0.06 * q });
      if (q >= 1) return;
      // each door carries its half of the old picture with it
      inside(e, e.a, (c) => c.rect(-o, 0, w / 2, h), { x: -o });
      inside(e, e.a, (c) => c.rect(w / 2 + o, 0, w / 2, h), { x: o });
    },
  },
  // ---- zoom & blur
  zoomin: {
    sec: 0.5, mood: '推近穿過：衝進畫面裡到下一個，深入、靠近、專注',
    draw: (e) => cross(e, (e.k - 0.35) / 0.4, { s: 1 + 1.5 * inCubic(e.k), blur: 16 * e.k }, { s: 1.4 - 0.4 * outCubic(e.k), blur: 12 * (1 - e.k) }),
  },
  zoomout: {
    sec: 0.55, mood: '拉遠：舊畫面縮小退進新畫面裡，抽離、全貌、回顧',
    draw: (e) => {
      const q = outCubic(e.k);
      put(e, e.b, { s: 1.3 - 0.3 * q, blur: 8 * (1 - q) });
      put(e, e.a, { s: 1 - 0.7 * q, alpha: 1 - inCubic((e.k - 0.4) / 0.6) });
    },
  },
  blurdissolve: {
    sec: 0.8, mood: '模糊溶接：糊掉、溶進下一個再清楚，柔和、回憶、夢',
    draw: (e) => {
      const b = 22 * Math.sin(e.k * Math.PI);
      cross(e, inOut(e.k), { blur: b }, { blur: b });
    },
  },
  crosszoom: {
    sec: 0.55, mood: '交叉變焦：一個放大一個縮回，順暢、MV 感、連續',
    draw: (e) => {
      const q = inOut(e.k);
      cross(e, q, { s: 1 + 0.5 * q, blur: 18 * q }, { s: 1.5 - 0.5 * q, blur: 18 * (1 - q) });
    },
  },
  spinblur: {
    sec: 0.6, mood: '旋轉模糊：轉一點、拖著模糊流過去，夢幻、流動',
    draw: (e) => {
      const q = inOut(e.k);
      const r = 0.25 * Math.sin(q * Math.PI);
      cross(e, q, { r, s: 1.15, blur: 16 * Math.sin(q * Math.PI) }, { r: r - 0.25 * (1 - q), s: 1.15, blur: 16 * Math.sin(q * Math.PI) });
    },
  },
  defocus: {
    sec: 0.85, mood: '失焦再對焦：焦點散掉發光、再對到下一個，電影感、恍神、醒來',
    draw: (e) => {
      const { k } = e;
      const b = 26 * Math.sin(k * Math.PI);
      cross(e, (k - 0.4) / 0.2, { blur: b }, { blur: b });
      e.ctx.save();
      e.ctx.globalCompositeOperation = 'lighter';
      wash(e, '#ffffff', 0.35 * Math.sin(k * Math.PI));
      e.ctx.restore();
    },
  },
  smear: {
    sec: 0.35, mood: '動態拖影：被橫向拉長抹過去，速度、衝刺',
    draw: (e) => {
      const { k, w } = e;
      if (k < 0.5) put(e, e.a, { x: w * 0.6 * inCubic(k * 2), sx: 1 + 1.5 * inCubic(k * 2), blur: 20 * k });
      else put(e, e.b, { x: -w * 0.6 * (1 - outCubic((k - 0.5) * 2)), sx: 1 + 1.5 * (1 - outCubic((k - 0.5) * 2)), blur: 20 * (1 - k) });
    },
  },
  dropzoom: {
    sec: 0.5, mood: '落下縮放：新的從大到小落下蓋住，落地、確定、重量',
    draw: (e) => {
      const q = outCubic(e.k);
      put(e, e.a, { s: 1 - 0.06 * q });
      wash(e, '#000', 0.4 * q);
      put(e, e.b, { s: 1.6 - 0.6 * spring(e.k), alpha: clamp01(e.k * 3) });
    },
  },
  // ---- light & film
  lightleak: {
    sec: 0.9, mood: '漏光：暖色光從邊緣漫進來洗白再退，懷舊、溫暖、夏天',
    draw: (e) => {
      const { ctx, k, w, h, seed } = e;
      cross(e, (k - 0.4) / 0.25);
      const g = ctx.createRadialGradient(w * (0.2 + 0.6 * hash(seed, 1)), h * 0.3, 0, w / 2, h / 2, w * 0.9);
      g.addColorStop(0, 'rgba(255,240,200,1)');
      g.addColorStop(0.4, 'rgba(255,150,80,0.85)');
      g.addColorStop(1, 'rgba(255,90,140,0)');
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = Math.sin(k * Math.PI);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    },
  },
  dipwhite: {
    sec: 0.6, mood: '淡到白：白色過場，回憶、天堂、純粹、一段結束',
    draw: (e) => { put(e, e.k < 0.5 ? e.a : e.b); wash(e, '#ffffff', 1 - Math.abs(e.k - 0.5) * 2); },
  },
  dipblack: {
    sec: 0.7, mood: '淡到黑：黑色過場，時間過去、沉重、章節結束',
    draw: (e) => { put(e, e.k < 0.5 ? e.a : e.b); wash(e, '#000000', 1 - Math.abs(e.k - 0.5) * 2); },
  },
  filmburn: {
    sec: 0.8, mood: '底片燒焦：橘紅光斑燒穿畫面，復古、底片、激情',
    draw: (e) => {
      const { ctx, k, w, h, seed } = e;
      cross(e, (k - 0.45) / 0.2);
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (let i = 0; i < 5; i++) {
        const x = w * hash(i, seed), y = h * hash(i + 9, seed), r = w * (0.2 + 0.4 * hash(i, 4)) * Math.sin(k * Math.PI);
        const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(1, r));
        g.addColorStop(0, `rgba(255,${200 - i * 20},120,${0.9 * Math.sin(k * Math.PI)})`);
        g.addColorStop(1, 'rgba(255,40,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }
      ctx.restore();
    },
  },
  flare: {
    sec: 0.6, mood: '鏡頭光暈：一道光掃過去換場，閃耀、希望、登場',
    draw: (e) => {
      const { ctx, k, w, h } = e;
      put(e, k < 0.5 ? e.a : e.b);
      const x = -w * 0.2 + w * 1.4 * inOut(k), r = h * 0.55;
      const g = ctx.createRadialGradient(x, h * 0.5, 0, x, h * 0.5, r);
      g.addColorStop(0, 'rgba(255,255,240,1)');
      g.addColorStop(0.25, 'rgba(255,240,200,0.8)');
      g.addColorStop(1, 'rgba(255,220,180,0)');
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
      wash(e, '#ffffff', 0.6 * (1 - Math.abs(k - 0.5) * 4));
    },
  },
  vhs: {
    sec: 0.6, mood: 'VHS 倒帶：掃描線、色偏、畫面扭動，復古、倒轉、回憶',
    draw: (e) => {
      const { ctx, k, w, h, seed } = e;
      const pic = k < 0.55 ? e.a : e.b;
      const amt = Math.sin(k * Math.PI);
      for (let y = 0; y < h; y += 12) {
        const dx = Math.sin(y * 0.02 + k * 40) * 40 * amt + (hash(y, Math.floor(k * 20) + seed) < 0.05 ? 120 * amt : 0);
        ctx.drawImage(pic, 0, y, w, 12, dx, y, w, 12);
      }
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.3 * amt;
      ctx.drawImage(pic, 10, 0, w, h);
      ctx.restore();
      // a bright tracking bar rolling up
      const by = h * (1 - ((k * 2.5) % 1));
      ctx.save();
      ctx.globalAlpha = 0.5 * amt;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, by, w, 10);
      ctx.restore();
    },
  },
  flicker: {
    sec: 0.45, mood: '閃爍交替：新舊畫面快速交替幾下才定，緊張、心跳、恐怖、節拍',
    draw: (e) => {
      const step = Math.floor(e.k * 9);
      put(e, step >= 8 || step % 2 === 1 ? e.b : e.a);
    },
  },
  // Motion Prompt #141 (MIT): the picture coarsens step by step, swaps at the coarsest, then sharpens
  pixelate: {
    sec: 0.6, mood: '像素化：畫面變成越來越粗的方塊、最粗時換成下一個再變清楚，遊戲、數位、復古、訊號',
    draw: (e) => {
      const { ctx, k, w, h } = e;
      const steps = [1, 2, 3, 4, 6, 8, 11, 15, 20, 27, 36];
      const q = 1 - Math.abs(clamp01(k) * 2 - 1);
      const block = steps[Math.min(steps.length - 1, Math.floor(q * steps.length))] * 2;
      const pic = k < 0.5 ? e.a : e.b;
      if (block <= 2) return put(e, pic);
      // shrink with smoothing, then blow the small copy back up without it
      const sw = Math.max(1, Math.round(w / block)), sh = Math.max(1, Math.round(h / block));
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(pic, 0, 0, sw, sh);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(ctx.canvas, 0, 0, sw, sh, 0, 0, w, h);
      ctx.restore();
    },
  },
  // Mografy cinema.ts (MIT): a gust of petals sweeps across, the new picture behind its ragged front
  petals: {
    sec: 0.8, mood: '花瓣吹過：一陣花瓣從左邊吹過去，後面露出下一個，春天、櫻花、告別、重新開始',
    draw: (e) => {
      const { ctx, k, w, h, seed } = e;
      const front = -0.25 * w + 1.5 * w * inOut(k);
      put(e, e.a);
      inside(e, e.b, (c) => {
        c.moveTo(-10, -10);
        for (let i = 0; i <= 12; i++) c.lineTo(front + Math.sin(i * 1.7 + seed) * 70 - 120, (i / 12) * h);
        c.lineTo(-10, h + 10);
        c.closePath();
      });
      if (k <= 0 || k >= 1) return;
      // the petals ride just ahead of the front, turning as they go
      ctx.save();
      for (let i = 0; i < 60; i++) {
        const y = hash(i, seed + 1) * h, x = front - 160 + hash(i, seed + 2) * 360 + Math.sin(k * 9 + i) * 30;
        ctx.save();
        ctx.translate(x, y + Math.sin(k * 6 + i) * 20);
        ctx.rotate(k * 8 + i);
        ctx.scale(1, 0.55 + 0.45 * Math.cos(k * 11 + i));
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = i % 3 ? '#F9C6D3' : '#FFFFFF';
        ctx.beginPath();
        ctx.ellipse(0, 0, 18, 10, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();
    },
  },
  // Motion Prompt #138 (MIT): every slat of a blind opens at once from its top edge, neither picture moving
  blinds: {
    sec: 0.6, mood: '百葉窗：一排橫條同時往下打開露出下一個，日夜、前後對照、復古',
    draw: (e) => {
      const { k, w, h } = e;
      const n = 9, sh = h / n, open = inOut(k) * sh;
      put(e, e.a);
      inside(e, e.b, (c) => {
        for (let i = 0; i < n; i++) c.rect(0, i * sh, w, open + (k >= 1 ? 1 : 0));
      });
    },
  },
  // ---- objects
  pagecurl: {
    sec: 0.7, mood: '翻頁：像書頁從角落翻過去，故事、日記、下一章',
    draw: (e) => {
      const { ctx, k, w, h } = e;
      const q = inOut(k);
      put(e, e.b);
      if (q >= 1) return;
      // the fold line sweeps from the right edge to past the left; the page keeps what is left of it
      const fx = w * 1.15 - w * 1.5 * q;
      const slope = 0.35;
      const edge = (c: Ctx, off: number) => {
        c.moveTo(-10, -10);
        c.lineTo(fx + off + h * slope, -10);
        c.lineTo(fx + off - h * slope * 0.2, h + 10);
        c.lineTo(-10, h + 10);
        c.closePath();
      };
      inside(e, e.a, (c) => edge(c, 0));
      // the turned-over flap: a pale gradient strip along the fold
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(fx + h * slope, -10);
      ctx.lineTo(fx + h * slope + 160 * (1 - q) + 40, -10);
      ctx.lineTo(fx - h * slope * 0.2 + 120 * (1 - q) + 30, h + 10);
      ctx.lineTo(fx - h * slope * 0.2, h + 10);
      ctx.closePath();
      const g = ctx.createLinearGradient(fx, 0, fx + 200, 0);
      g.addColorStop(0, 'rgba(255,255,255,0.95)');
      g.addColorStop(1, 'rgba(160,160,160,0.6)');
      ctx.fillStyle = g;
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = 30;
      ctx.fill();
      ctx.restore();
    },
  },
  papertear: {
    sec: 0.6, mood: '撕紙：從中間撕開露出下一個，手作、決裂、打破',
    draw: (e) => {
      const { k, w, h, seed } = e;
      put(e, e.b);
      if (k >= 1) return;
      const open = w * 0.6 * inOut(k);
      const jag = (c: Ctx, side: number) => {
        const pts: [number, number][] = [];
        for (let i = 0; i <= 18; i++) pts.push([w / 2 + (hash(i, seed) - 0.5) * 60, (i / 18) * h]);
        if (side < 0) {
          c.moveTo(-10, -10);
          pts.forEach(([x, y]) => c.lineTo(x - open, y));
          c.lineTo(-10, h + 10);
        } else {
          c.moveTo(w + 10, -10);
          pts.forEach(([x, y]) => c.lineTo(x + open, y));
          c.lineTo(w + 10, h + 10);
        }
        c.closePath();
      };
      inside(e, e.a, (c) => jag(c, -1), { x: -open, r: -0.03 * k });
      inside(e, e.a, (c) => jag(c, 1), { x: open, r: 0.03 * k });
    },
  },
  domino: {
    sec: 0.7, mood: '骨牌翻：一格格依序翻到下一個，連鎖、節奏、依序',
    draw: (e) => {
      const { ctx, k, w, h } = e;
      const n = 8, cw = w / n;
      for (let i = 0; i < n; i++) {
        const q = clamp01((k - i * 0.07) / 0.45);
        const turn = inOut(q);
        const pic = turn < 0.5 ? e.a : e.b;
        const sx = Math.abs(Math.cos(turn * Math.PI));
        ctx.save();
        ctx.translate(i * cw + cw / 2, 0);
        ctx.scale(Math.max(0.01, sx), 1);
        ctx.drawImage(pic, i * cw, 0, cw, h, -cw / 2, 0, cw + 1, h);
        ctx.restore();
      }
    },
  },
  rollup: {
    sec: 0.55, mood: '捲簾：新的從下往上捲上來，打開、早晨、上升',
    draw: (e) => {
      const { ctx, k, w, h } = e;
      const y = h * (1 - inOut(k));
      put(e, e.a);
      inside(e, e.b, (c) => c.rect(0, y, w, h - y));
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillRect(0, y - 4, w, 8);
      ctx.restore();
    },
  },
  squeeze: {
    sec: 0.5, mood: '擠成一線：被壓成一條線再展開成下一個，收束、科幻、切換頻道',
    draw: (e) => {
      const { k } = e;
      if (k < 0.5) put(e, e.a, { sy: Math.max(0.005, 1 - outCubic(k * 2)) });
      else put(e, e.b, { sy: Math.max(0.005, outCubic((k - 0.5) * 2)) });
      // the thin line glows white as it passes through its thinnest
      const t = 1 - Math.abs(k - 0.5) * 4;
      if (t <= 0) return;
      e.ctx.save();
      e.ctx.globalAlpha = t;
      e.ctx.fillStyle = '#fff';
      e.ctx.fillRect(0, e.h / 2 - 3, e.w, 6);
      e.ctx.restore();
    },
  },
  tvoff: {
    sec: 0.6, mood: '電視關機：縮成白線再成白點熄掉，結束、斷訊、復古',
    draw: (e) => {
      const { ctx, k, w, h } = e;
      if (k < 0.6) {
        const q = k / 0.6;
        const sy = Math.max(0.004, 1 - outCubic(q * 1.4)), sx = q > 0.7 ? Math.max(0.01, 1 - (q - 0.7) / 0.3) : 1;
        put(e, e.a, { sy, sx });
        // the picture burns to white as it collapses
        ctx.save();
        ctx.globalAlpha = q;
        ctx.fillStyle = '#fff';
        ctx.fillRect((w - w * sx) / 2, (h - h * sy) / 2, w * sx, Math.max(4, h * sy));
        ctx.restore();
      } else put(e, e.b, { alpha: outCubic((k - 0.6) / 0.4) });
    },
  },
  warp: {
    sec: 0.7, mood: '扭曲變形：畫面像水面一樣扭動再變成下一個，幻覺、夢、迷幻',
    draw: (e) => {
      const { ctx, k, w, h } = e;
      const amt = Math.sin(k * Math.PI);
      const pic = k < 0.5 ? e.a : e.b;
      for (let y = 0; y < h; y += 8) {
        const dx = Math.sin(y * 0.015 + k * 12) * 70 * amt;
        ctx.drawImage(pic, 0, y, w, 8, dx, y, w, 8);
      }
    },
  },
} satisfies Record<string, Move>;

export type MotionKind = keyof typeof MOTION;
export const MOTION_KINDS = Object.keys(MOTION) as MotionKind[];
export const isMotion = (k: string): k is MotionKind => k in MOTION;

let offA: OffscreenCanvas | undefined;
let offB: OffscreenCanvas | undefined;
/** One frame of a motion transition: both sides are drawn to their own canvas first. */
export function drawMotionTransition(ctx: Ctx, kind: MotionKind, k: number, w: number, h: number, seed: number, drawPrev: (c: CanvasRenderingContext2D) => void, drawNew: (c: CanvasRenderingContext2D) => void) {
  offA ??= new OffscreenCanvas(w, h);
  offB ??= new OffscreenCanvas(w, h);
  for (const [off, draw] of [[offA, drawPrev], [offB, drawNew]] as const) {
    const c = off.getContext('2d')! as unknown as CanvasRenderingContext2D;
    c.save();
    c.clearRect(0, 0, w, h);
    draw(c);
    c.restore();
  }
  ctx.save();
  // what neither side covers (a panel turned edge-on, a page curling) shows black, as between two shots
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  MOTION[kind].draw({ ctx, a: offA, b: offB, k: clamp01(k), w, h, seed });
  ctx.restore();
}
