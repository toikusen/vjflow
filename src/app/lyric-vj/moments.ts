// Emotional arc and section moments: the director marks how intense each part of the song is and where the
// build-ups, drops, breaks (落ちサビ), holds (溜め) and the finale are; fxAt turns that into per-frame effect amounts.
// Database basis: every one of the 50 analysed lyric VJs marks the way into a chorus (145 boundaries; light bursts
// 36 %, colour shift 34 %, push-in 14 %, flash 13 %), and last choruses typically go quiet/dark first, then burst.
import type { SongTimeline } from './timeline';
import type { Window } from './treatment';

export type MomentKind = 'build' | 'drop' | 'break' | 'hold' | 'finale';
export const MOMENT_KINDS: MomentKind[] = ['build', 'drop', 'break', 'hold', 'finale'];

/**
 * `at` is the musical point the moment is about: for build and hold the moment ENDS there (they lead into it);
 * for drop and finale it is the impact; for break it is where the quiet starts. `dur` is seconds.
 */
export interface Moment {
  kind: MomentKind;
  at: number;
  dur?: number;
  /** 0.5..1.5, 1 = the style's normal amount. */
  strength?: number;
}

/** Intensity level 0 (quiet) .. 3 (peak) from `start` until the next arc point. */
export interface ArcPoint {
  start: number;
  level: number;
}

export const MOMENT_RULES: Record<MomentKind, { dur: [number, number]; def: number; desc: string }> = {
  build: { dur: [1, 8], def: 3, desc: '蓄力：在 at 之前 dur 秒逐漸推鏡、變亮、粒子加速，at 放在副歌（或最後副歌）第一拍' },
  drop: { dur: [0, 0], def: 0, desc: '爆發：at 是副歌第一拍，地平線光束炸開、震波、鏡頭衝進再回彈、色調轉亮' },
  break: { dur: [2, 30], def: 8, desc: '收（落ちサビ）：從 at 開始 dur 秒降飽和、變暗、粒子變慢，畫面安靜' },
  hold: { dur: [0.3, 1.2], def: 0.6, desc: '溜め：at 之前 dur 秒背景幾乎全黑、只留星光，at 通常是最後副歌第一拍' },
  finale: { dur: [0, 0], def: 0, desc: '終章：at 是最後副歌第一拍，比 drop 再強一級的爆發' },
};

/** Effect amounts at one instant. Neutral values: exposure 1, saturation 1, zoom 1, others 0. */
export interface MomentFx {
  exposure: number;
  saturation: number;
  bloom: number;
  /** Radial light rays from the horizon (0..1). */
  rays: number;
  /** Shockwave ring radius in screen heights (<0: none) and its strength. */
  shockR: number;
  shock: number;
  /** Camera zoom multiplier (whole frame, text included). */
  zoom: number;
  /** Background darkening 0..1 (text stays). */
  black: number;
  vignette: number;
  shake: number;
  /** Seconds added to the light-mote clock (builds speed them up, breaks slow them down). */
  moteTime: number;
  /** Outward push of the motes after an impact (0..1). */
  moteBurst: number;
  /** Arc intensity 0..3 at t. */
  level: number;
}

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const smooth = (x: number) => {
  const k = clamp(x, 0, 1);
  return k * k * (3 - 2 * k);
};

/** Snaps and clamps moments and the arc to the song; returns fixes and errors in the director's language. */
export function validateMoments(
  moments: Moment[] | undefined,
  arc: ArcPoint[] | undefined,
  song: SongTimeline,
  win: Window,
): { moments: Moment[]; arc: ArcPoint[]; errors: string[]; fixes: string[] } {
  const errors: string[] = [];
  const fixes: string[] = [];
  const downbeats = song.downbeats.filter((b) => b >= win.start - 0.5 && b <= win.end + 0.5);
  const anchors = [...downbeats, ...song.cues.map((c) => c.start)];
  const out: Moment[] = [];
  for (const m of moments ?? []) {
    if (!MOMENT_KINDS.includes(m.kind)) {
      errors.push(`爆點 ${m.kind} 不存在（可用 ${MOMENT_KINDS.join('/')}）`);
      continue;
    }
    // outside the window it has nothing to do (rendering part of a song keeps the whole-song treatment)
    if (!(m.at >= win.start && m.at <= win.end + 1)) {
      fixes.push(`爆點 ${m.kind}@${m.at} 不在範圍 ${win.start}–${win.end} 秒內，略過`);
      continue;
    }
    const near = anchors.reduce((best, a) => (Math.abs(a - m.at) < Math.abs(best - m.at) ? a : best), anchors[0] ?? m.at);
    const at = Math.abs(near - m.at) <= 0.35 ? near : m.at;
    if (at !== m.at) fixes.push(`爆點 ${m.kind}@${m.at.toFixed(2)} 吸附到強拍或句首 ${at.toFixed(2)}`);
    const r = MOMENT_RULES[m.kind];
    const dur = r.dur[1] === 0 ? undefined : clamp(m.dur ?? r.def, r.dur[0], r.dur[1]);
    if (dur !== undefined && m.dur !== undefined && dur !== m.dur) fixes.push(`爆點 ${m.kind}@${at.toFixed(2)} 長度改為 ${dur} 秒`);
    out.push({ kind: m.kind, at, dur, strength: clamp(m.strength ?? 1, 0.5, 1.5) });
  }
  out.sort((a, b) => a.at - b.at || MOMENT_KINDS.indexOf(a.kind) - MOMENT_KINDS.indexOf(b.kind));
  // a drop and a finale on the same beat double the impact: keep the finale
  const deduped = out.filter((m, i) => !(m.kind === 'drop' && out.some((n, j) => j !== i && n.kind === 'finale' && Math.abs(n.at - m.at) < 0.5)));
  if (deduped.length !== out.length) fixes.push('同一拍的 drop 與 finale 只保留 finale');
  const pts = (arc ?? [])
    .filter((p) => Number.isFinite(p.start))
    .map((p) => ({ start: clamp(p.start, win.start, win.end), level: clamp(Math.round(p.level), 0, 3) }))
    .sort((a, b) => a.start - b.start);
  if (!pts.length || pts[0].start > win.start) pts.unshift({ start: win.start, level: pts[0]?.level ?? 1 });
  return { moments: deduped, arc: pts, errors, fixes };
}

/** Arc level at t, eased over 1.2 s around each change (a sudden jump only at a drop/finale). */
export function levelAt(arc: ArcPoint[], moments: Moment[], t: number): number {
  if (!arc.length) return 1;
  let level = arc[0].level;
  for (let i = 1; i < arc.length; i++) {
    const p = arc[i];
    const hit = moments.some((m) => (m.kind === 'drop' || m.kind === 'finale') && Math.abs(m.at - p.start) < 0.5);
    const ease = hit ? 0.15 : 1.2;
    const k = smooth((t - (p.start - (hit ? 0 : ease / 2))) / ease);
    level += (p.level - level) * k;
  }
  return level;
}

/**
 * Effect amounts at time t. Sized for "noticeable, never over the top": exposure stays under +40 %, the zoom
 * punch under 5 %, and nothing is mixed toward white (a white mix reads as grey fog over a dark plate).
 */
export function fxAt(t: number, moments: Moment[], arc: ArcPoint[]): MomentFx {
  const level = levelAt(arc, moments, t);
  const fx: MomentFx = {
    exposure: 0.94 + 0.04 * level,
    saturation: 0.9 + 0.06 * level,
    bloom: 0.08 * level,
    rays: 0,
    shockR: -1,
    shock: 0,
    zoom: 1,
    black: 0,
    vignette: 0.1 * (1.5 - level) * 0.3,
    shake: 0,
    moteTime: 0,
    moteBurst: 0,
    level,
  };
  for (const m of moments) {
    const s = m.strength ?? 1;
    const dt = t - m.at;
    switch (m.kind) {
      case 'build': {
        const d = m.dur ?? MOMENT_RULES.build.def;
        const p = clamp((t - (m.at - d)) / d, 0, 1);
        if (p <= 0) break;
        // ramps up to the downbeat, then releases over ~0.5 s (the drop's punch takes over, no snap back)
        const e = dt < 0 ? p * p : Math.exp(-dt * 6);
        if (dt > 0 && e < 0.002) {
          fx.moteTime += d * 1.5 * s; // the extra mote travel stays after the build
          break;
        }
        fx.zoom *= 1 + 0.035 * e * s;
        fx.exposure *= 1 + 0.12 * e * s;
        fx.saturation *= 1 + 0.08 * e * s;
        fx.vignette += 0.18 * e * s;
        fx.bloom += 0.25 * e * s;
        fx.moteTime += d * p * p * 1.5 * s;
        break;
      }
      case 'drop':
      case 'finale': {
        if (dt < 0) break;
        const k = (m.kind === 'finale' ? 1.35 : 1) * s;
        const impact = Math.exp(-dt * 4.5);
        fx.exposure *= 1 + 0.28 * k * impact;
        fx.bloom += 0.7 * k * impact;
        fx.rays = Math.max(fx.rays, Math.min(1, k * (dt < 0.08 ? dt / 0.08 : Math.exp(-(dt - 0.08) * 1.6))));
        if (dt < 0.9) {
          fx.shockR = dt / 0.9;
          fx.shock = Math.max(fx.shock, 0.6 * k * (1 - dt / 0.9));
        }
        // punch in, then settle back over ~0.6 s
        fx.zoom = Math.max(fx.zoom, 1 + 0.045 * k * Math.exp(-dt * 6));
        fx.shake = Math.max(fx.shake, 0.35 * k * Math.exp(-dt * 10));
        fx.moteBurst = Math.max(fx.moteBurst, (1 - Math.exp(-dt * 5)) * Math.exp(-dt * 0.9) * k);
        break;
      }
      case 'break': {
        const d = m.dur ?? MOMENT_RULES.break.def;
        const inK = smooth(dt / 0.8);
        const outK = 1 - smooth((dt - d + 0.6) / 0.6);
        const q = dt < 0 ? 0 : Math.min(inK, outK) * s;
        fx.saturation *= 1 - 0.45 * q;
        fx.exposure *= 1 - 0.18 * q;
        fx.vignette += 0.12 * q;
        // motes drift at 30 % speed while it is quiet
        fx.moteTime -= 0.7 * clamp(Math.min(dt, d), 0, d);
        break;
      }
      case 'hold': {
        const d = m.dur ?? MOMENT_RULES.hold.def;
        const into = t - (m.at - d);
        if (into < 0 || dt >= 0) break;
        fx.black = Math.max(fx.black, 0.88 * smooth(into / Math.min(0.15, d / 2)) * Math.min(1, s));
        break;
      }
    }
  }
  fx.zoom = Math.min(fx.zoom, 1.055);
  fx.exposure = Math.min(fx.exposure, 1.42);
  return fx;
}
