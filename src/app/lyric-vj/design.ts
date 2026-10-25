// Per-song design system: one font family, how much smaller kana are set, and a colour script (a duotone for the
// background plus one accent colour, changing by section) with grain and paper texture. The gap analysis against
// designer VJs found generic full-colour AI backgrounds and one bold gothic face everywhere to be the main tells.
import { SYSTEMS, SystemId } from './systems';
import { LANGUAGES, LanguageId } from './languages';
import { FONTS } from './fonts';
import type { Window } from './treatment';
import { MEDIA, MediumId } from './medium';
import type { Signature } from './signature';

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
}

/** How this song's drops hit (the same radial burst on every song read as a template). */
export type PeakStyle = 'rays' | 'beams' | 'vacuum' | 'burst';
export const PEAK_STYLES: Record<PeakStyle, string> = {
  rays: '地平線放射光：光束從畫面下方中央放射',
  beams: '斜向平行光束：一束束斜向的光帶掃過畫面，背景轉灰（冷調、俐落）',
  vacuum: '黑場抽空：爆點前一瞬間全黑，落拍時整個畫面爆亮（衝擊、反差）',
  burst: '主題物件爆開：物件放大成一層層往外衝的圈（物件為主的歌）',
};

/** Optional techniques from the library, picked per song by the director (none is right for every song). */
export const TECHNIQUES = {
  echo: '回聲字：副歌開頭在歌詞背後疊一層放大的關鍵字描邊字，慢慢漂移。適合關鍵字短而有力、畫面需要景深的歌；抒情、字少的歌不要用',
  skeleton: '副歌同骨架：之後每次副歌照第一次副歌的版型順序排，靠色彩與爆點逐次加強。適合副歌重複多次的歌',
  'title-hook': '曲名字樣：歌詞唱到歌名時每次都用同一個強調色，像商標。適合歌名會在歌詞裡唱出來的歌',
  flash: '爆點巨字閃現：每次副歌爆點先把關鍵字滿版閃一下再換成整句。適合有明確 drop 的快歌；慢歌不要用',
  pieces: '字形碎片：每個字拆成筆畫，出現時從四周聚合、消失時散開。適合節奏感強、有破壞感或組裝感的歌；抒情歌不要用',
  quiet: '安靜段降維：break／落ちサビ改成細明朝小字、大量留白並加上下黑邊。適合有明顯安靜段的歌',
} as const;
export type TechniqueId = keyof typeof TECHNIQUES;
/** Whether a design uses a technique: designs from before the choice existed use them all. */
export const uses = (d: Pick<Design, 'techniques'> | undefined, id: TechniqueId) => !d?.techniques || d.techniques.includes(id);

/** A print finish on every lyric glyph (glyphs.ts): LED dots, a 45° extrusion, chalk grain, a worn print, diagonal
 * hatching or a top-lit gradient. */
export type GlyphFinish = 'dots' | 'extrude' | 'chalk' | 'distress' | 'stripes' | 'gradient';
export const GLYPH_FINISHES: GlyphFinish[] = ['dots', 'extrude', 'chalk', 'distress', 'stripes', 'gradient'];

export interface Design {
  /** The lyric type's print finish (unset: plain). */
  finish?: GlyphFinish;
  /** Quiet type (a song felt, not shouted): no offset print ghost behind the lines, only their keyline. */
  quiet?: boolean;
  /** The visual language (systems.ts); older treatments have none = stage. */
  system?: SystemId;
  /** The design language (languages.ts) the song's graphics are built in. */
  language?: LanguageId;
  /** Techniques this song uses (absent = all, for older treatments). */
  techniques?: TechniqueId[];
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
  /** Where the song happens and how its frame is built (signature.ts); older treatments have none = as drawn. */
  signature?: Signature;
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
    .map((s) => ({ ...s, start: clamp(s.start, win.start, win.end), duotone: clamp(s.duotone, 0, 1), image: clamp(s.image ?? 1, 0, 1) }))
    .sort((a, b) => a.start - b.start);
  if (stops.length !== (d.colorScript ?? []).length) fixes.push('移除顏色格式錯誤的色彩段落');
  if (!stops.length) stops.push({ ...DEFAULT_DESIGN.colorScript[0], start: win.start });
  if (stops[0].start > win.start) stops.unshift({ ...stops[0], start: win.start });
  return {
    design: fitSystem({ font, accentFont, kanaScale: clamp(d.kanaScale, 0.5, 1), grain: clamp(d.grain, 0, 1), paper: clamp(d.paper, 0, 1), colorScript: stops, peak: d.peak in PEAK_STYLES ? d.peak : 'rays', medium: d.medium && d.medium in MEDIA ? d.medium : 'clean', techniques: d.techniques?.filter((x) => x in TECHNIQUES), system: d.system && d.system in SYSTEMS ? d.system : undefined, language: d.language && d.language in LANGUAGES ? d.language : undefined, ...(d.signature !== undefined ? { signature: structuredClone(d.signature) } : {}) }, fixes),
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
    };
  }
  return cur;
}

/** Holds a design to its system's media, peaks, techniques and picture range. */
export function fitSystem(d: Design, fixes: string[]): Design {
  const sys = d.system && SYSTEMS[d.system];
  if (!sys) return d;
  const medium = d.medium && sys.media.includes(d.medium) ? d.medium : sys.media[0];
  const peak = sys.peaks.includes(d.peak) ? d.peak : sys.peaks[0];
  if (medium !== d.medium || peak !== d.peak) fixes.push(`依「${sys.name}」系統調整媒材／爆點：${medium}、${peak}`);
  const [lo, hi] = sys.image;
  return {
    ...d, medium, peak,
    techniques: (d.techniques ?? sys.techniques).filter((x) => sys.techniques.includes(x)),
    colorScript: d.colorScript.map((c) => ({ ...c, image: Math.min(hi, Math.max(lo, c.image)) })),
  };
}
