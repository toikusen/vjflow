// Motif: one object drawn by the program (line art, not an AI image) that carries the song's concept through every
// section — the gap analysis found it in every designer VJ (sweet timer → clock, 第六感 → hexagon, 天文対話 → orbit)
// and in none of ours. The director picks the motif and how it appears per section; the engine draws and animates it.
import type { Window } from './treatment';

export type MotifKind = 'clock' | 'polygon' | 'orbit';
export type MotifForm = 'off' | 'center' | 'bleed' | 'nested' | 'tunnel' | 'mask' | 'shards';
/** Forms that keep moving: required over instrumental gaps (a still motif over a still plate reads as dead air). */
export const MOVING_FORMS: MotifForm[] = ['nested', 'tunnel', 'shards', 'bleed'];

export const MOTIF_KINDS: Record<MotifKind, string> = {
  clock: '時鐘：外圈刻度、羅馬數字、時針分針；秒針隨拍跳動。適合時間、魔法、倒數、夜晚、約定',
  polygon: '多邊形（sides 決定邊數）：細線多邊形、蜂巢、切面。適合數字、幾何、結晶、科技、六感／五感等',
  orbit: '軌道：行星與橢圓軌道線、同心圓。適合宇宙、距離、對話、引力、思念',
};

export const MOTIF_FORMS: Record<MotifForm, string> = {
  off: '不出現（讓畫面休息）',
  center: '置中一個，大小約畫面高度的 60%，當作歌詞的舞台',
  bleed: '巨大、超出畫面被裁切，只看得到一部分，當作構圖',
  nested: '同心多層、各層以不同速度旋轉',
  tunnel: '一層層從中心往外放大，像穿越隧道（副歌、高潮）',
  mask: '背景只從物件的形狀裡露出來，外面壓暗（只能用在沒有歌詞的段落，有歌詞時字會看不清楚）',
  shards: '物件的零件（數字、刻度、邊）飛散到整個畫面並持續旋轉飛舞，全畫面的動態最吸睛（間奏、轉折、爆點後）',
};

export interface MotifSection {
  start: number;
  form: MotifForm;
  /** 0..1: line brightness and motion amount. */
  intensity: number;
}

export interface MotifPlan {
  kind: MotifKind;
  /** polygon: number of sides (3..12). */
  sides: number;
  sections: MotifSection[];
}

const clamp = (x: number, a: number, b: number) => (Number.isFinite(x) ? Math.min(b, Math.max(a, x)) : a);

export function validateMotif(m: MotifPlan | undefined, win: Window): { motif?: MotifPlan; fixes: string[]; errors: string[] } {
  if (!m) return { fixes: [], errors: [] };
  const errors: string[] = [];
  const fixes: string[] = [];
  if (!(m.kind in MOTIF_KINDS)) errors.push(`主題物件 ${m.kind} 不存在（可用 ${Object.keys(MOTIF_KINDS).join('/')}）`);
  const sections = (m.sections ?? [])
    // 'corner' was dropped (too small to read): older treatments show nothing there
    .map((s) => ((s.form as string) === 'corner' ? { ...s, form: 'off' as MotifForm } : s))
    .filter((s) => s.form in MOTIF_FORMS)
    .map((s) => ({ start: clamp(s.start, win.start, win.end), form: s.form, intensity: clamp(s.intensity, 0, 1) }))
    .sort((a, b) => a.start - b.start);
  if (sections.length !== (m.sections ?? []).length) fixes.push('移除不存在的主題物件形態');
  if (!sections.length) errors.push('主題物件至少要有一個段落設定');
  else if (sections[0].start > win.start) sections.unshift({ start: win.start, form: 'off', intensity: 0 });
  const sides = Math.round(clamp(m.sides, 3, 12));
  return { motif: { kind: m.kind, sides, sections }, fixes, errors };
}

/** The form at t and the one before it, with the crossfade progress (0.6 s). */
export function motifStateAt(m: MotifPlan, t: number, fade = 0.6): { cur: MotifSection; prev?: MotifSection; k: number; since: number } {
  let i = 0;
  while (i + 1 < m.sections.length && m.sections[i + 1].start <= t) i++;
  const cur = m.sections[i];
  const since = t - cur.start;
  return { cur, prev: m.sections[i - 1], k: Math.min(1, Math.max(0, since / fade)), since };
}
