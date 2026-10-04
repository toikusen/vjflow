// Per-song design system: one font family, how much smaller kana are set, and a colour script (a duotone for the
// background plus one accent colour, changing by section) with grain and paper texture. The gap analysis against
// designer VJs found generic full-colour AI backgrounds and one bold gothic face everywhere to be the main tells.
import { FONTS } from './fonts';
import type { Window } from './treatment';
import { MEDIA, MediumId } from './medium';

export interface ColorStop {
  /** Section start (seconds); the stop holds until the next one. */
  start: number;
  /** Duotone: the background's darks map to `shadow`, its lights to `highlight`. */
  shadow: string;
  highlight: string;
  /** The one accent colour (key words, lines, glows) for this section. */
  accent: string;
  /** 0 = the image's own colours, 1 = pure duotone. */
  duotone: number;
  /** How much of the background image shows: 1 = full, 0 = a dark textured ground (graphics and type carry it). */
  image: number;
  /** This section's medium when it differs from the song's (a drop switching material); none = the song's. */
  medium?: MediumId;
}

/** How this song's drops hit (the same radial burst on every song read as a template). */
export type PeakStyle = 'rays' | 'beams' | 'vacuum' | 'burst';
export const PEAK_STYLES: Record<PeakStyle, string> = {
  rays: '地平線放射光：光束從畫面下方中央放射',
  beams: '斜向平行光束：一束束斜向的光帶掃過畫面，背景轉灰（冷調、俐落）',
  vacuum: '黑場抽空：爆點前一瞬間全黑，落拍時整個畫面爆亮（衝擊、反差）',
  burst: '主題物件爆開：物件放大成一層層往外衝的圈（物件為主的歌）',
};

export interface Design {
  font: string;
  /** Paired Latin face: English lines, the artist name and the corner tag. */
  accentFont: string;
  /** Hiragana size relative to kanji/katakana (1 = same size; ~0.6 reads as designed type). */
  kanaScale: number;
  /** Film grain amount 0..1. */
  grain: number;
  /** Paper/print texture amount 0..1. */
  paper: number;
  colorScript: ColorStop[];
  peak: PeakStyle;
  /** The material the video pretends to be made of (medium.ts); older treatments have none = clean. */
  medium?: MediumId;
}

const HEX = /^#[0-9a-f]{6}$/i;
const clamp = (x: number, a: number, b: number) => (Number.isFinite(x) ? Math.min(b, Math.max(a, x)) : a);

export const DEFAULT_DESIGN: Design = {
  font: 'Zen Kaku Gothic New',
  accentFont: 'Montserrat',
  kanaScale: 1,
  grain: 0.3,
  paper: 0,
  colorScript: [{ start: 0, shadow: '#0a0d24', highlight: '#e9ecff', accent: '#6fa8ff', duotone: 0, image: 1 }],
  peak: 'rays',
  medium: 'clean',
};

/** Repairs a director's design: known font, numbers in range, valid colours, stops sorted from the window start. */
export function validateDesign(d: Design | undefined, win: Window): { design: Design; fixes: string[] } {
  const fixes: string[] = [];
  if (!d) return { design: structuredClone(DEFAULT_DESIGN), fixes: ['沒有設計設定，使用預設'] };
  const font = FONTS.some((f) => f.family === d.font && f.roles.some((r) => r !== 'accent')) ? d.font : DEFAULT_DESIGN.font; // accent faces have no kana
  if (font !== d.font) fixes.push(`字型 ${d.font} 不在目錄裡，改用 ${font}`);
  const accentFont = FONTS.some((f) => f.family === d.accentFont && f.roles.includes('accent')) ? d.accentFont : DEFAULT_DESIGN.accentFont;
  const stops = (d.colorScript ?? [])
    .filter((s) => HEX.test(s.shadow) && HEX.test(s.highlight) && HEX.test(s.accent))
    .map((s): ColorStop => ({ ...s, start: clamp(s.start, win.start, win.end), duotone: clamp(s.duotone, 0, 1), image: clamp(s.image ?? 1, 0, 1), medium: s.medium && s.medium in MEDIA ? s.medium : undefined }))
    .sort((a, b) => a.start - b.start);
  if (stops.length !== (d.colorScript ?? []).length) fixes.push('移除顏色格式錯誤的色彩段落');
  if (!stops.length) stops.push({ ...DEFAULT_DESIGN.colorScript[0], start: win.start });
  if (stops[0].start > win.start) stops.unshift({ ...stops[0], start: win.start });
  return {
    design: { font, accentFont, kanaScale: clamp(d.kanaScale, 0.5, 1), grain: clamp(d.grain, 0, 1), paper: clamp(d.paper, 0, 1), colorScript: stops, peak: d.peak in PEAK_STYLES ? d.peak : 'rays', medium: d.medium && d.medium in MEDIA ? d.medium : 'clean' },
    fixes,
  };
}

const mixHex = (a: string, b: string, k: number) => {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return '#' + pa.map((x, i) => Math.round(x + (pb[i] - x) * k).toString(16).padStart(2, '0')).join('');
};

/** The colour stop in effect at t, blended over `ease` seconds into each new section. */
export function colorAt(script: ColorStop[], t: number, ease = 1): ColorStop {
  let cur = script[0];
  for (let i = 1; i < script.length; i++) {
    const s = script[i];
    if (t < s.start) break;
    const k = Math.min(1, (t - s.start) / ease);
    cur = {
      start: s.start,
      shadow: mixHex(cur.shadow, s.shadow, k),
      highlight: mixHex(cur.highlight, s.highlight, k),
      accent: mixHex(cur.accent, s.accent, k),
      duotone: cur.duotone + (s.duotone - cur.duotone) * k,
      image: cur.image + (s.image - cur.image) * k,
      medium: s.medium,
    };
  }
  return cur;
}
