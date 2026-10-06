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

/** How the motif's lines are drawn: one song's planet must not look like another's. */
export type MotifRender = 'neon' | 'flat' | 'dotted' | 'ink';
export const MOTIF_RENDERS: Record<MotifRender, string> = {
  neon: '發光細線（疊加發光，像霓虹管）',
  flat: '平塗不發光的粗線與實心形狀（像印刷、貼紙）',
  dotted: '虛線與點線（像星圖、設計圖）',
  ink: '手畫的抖動墨線，一秒 8 次微抖（像手繪、蠟筆）',
};
/** Geometry variants per kind. */
export const MOTIF_VARIANTS: Record<MotifKind, Record<string, string>> = {
  clock: { roman: '羅馬數字錶盤、60 刻度、三根指針', minimal: '只有外圈與兩根指針，極簡', pocket: '懷錶：外圈、龍頭、12 個圓點刻度' },
  polygon: { outline: '多邊形外框加內框', star: '星形多邊形（連線跳一個頂點）', facets: '多邊形加中心放射切面線' },
  orbit: { atom: '一顆星球、一條傾斜橢圓軌道、一顆衛星', solar: '俯視的太陽系：多條同心軌道、各有一顆行星不同速度', saturn: '土星：星球加一條寬環帶', eclipse: '日蝕：兩個圓緩慢重疊成新月', binary: '雙星：兩顆星互相繞行，留下軌跡' },
};

export interface MotifPlan {
  kind: MotifKind;
  /** Geometry variant (MOTIF_VARIANTS[kind]); absent = the first. */
  variant?: string;
  render?: MotifRender;
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
  const variant = m.variant && m.variant in (MOTIF_VARIANTS[m.kind] ?? {}) ? m.variant : undefined;
  const render = m.render && m.render in MOTIF_RENDERS ? m.render : undefined;
  return { motif: { kind: m.kind, sides, sections, variant, render }, fixes, errors };
}

/** The form at t and the one before it, with the crossfade progress (0.6 s). */
export function motifStateAt(m: MotifPlan, t: number, fade = 0.6): { cur: MotifSection; prev?: MotifSection; k: number; since: number } {
  let i = 0;
  while (i + 1 < m.sections.length && m.sections[i + 1].start <= t) i++;
  const cur = m.sections[i];
  const since = t - cur.start;
  return { cur, prev: m.sections[i - 1], k: Math.min(1, Math.max(0, since / fade)), since };
}
