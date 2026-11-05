// The styles a buyer picks from. Each is a style world (style-worlds.ts): its colours, faces, material and closed pool of
// parts. This file is the free tier's view of them: what the page lists and what freeJob reads.
import { contrast } from './contrast';
import type { LanguageId } from './languages';
import { STYLE_WORLDS } from './style-worlds';
import type { StyleWorld } from './style-world';

export interface StylePalette { ink: string; paper: string; accent: string; heart: string; what: string }

/** A scheme as the page and the words' marks read it: a world's accent slot may be a colour for its papers, too near its ground to mark a word. */
const paletteOf = (s: StyleWorld['palette'][number], w: StyleWorld): StylePalette => {
  const paper = w.standsOnPlate ? s.plate : s.ground;
  return { ink: s.ink, paper, accent: [s.accent, s.ink2, s.ink].find((x) => contrast(x, paper) >= 3) ?? s.ink, heart: s.ink2, what: s.what };
};
export const STYLE_PALETTES: Record<string, StylePalette> = Object.fromEntries(STYLE_WORLDS.flatMap((w) => w.palette.map((s) => [s.id, paletteOf(s, w)])));

export interface FreeStyle {
  id: string;
  name: string;
  /** The design language it belongs to. */
  from: LanguageId;
  what: string;
  palettes: string[];
  /** Faces for lyrics with kana, in Han only, and for a song felt rather than shouted. */
  fonts: { ja: string; tc: string; calm?: string };
  world: StyleWorld;
}

export const FREE_STYLES: FreeStyle[] = STYLE_WORLDS.map((w) => ({ id: w.id, name: w.name, from: w.language, what: w.what, palettes: w.palette.map((s) => s.id), fonts: { ja: w.type.ja.family, tc: w.type.tc.family, calm: w.type.tc.family }, world: w }));

/** Worlds held back from the picker, rerolls and defaults until the owner passes them (batch 4's cyanotype, isometric and cel80s, 2026-11-05). A saved pick still renders. */
export const HELD_WORLDS = new Set<string>(['cyanotype', 'isometric', 'cel80s', 'document']);

/** The styles offered to a buyer. */
export const OFFERED_STYLES = FREE_STYLES.filter((s) => !HELD_WORLDS.has(s.id));

const KANA = /[ぁ-ゖァ-ヺ]/;

/** A style's face for these lyrics: Japanese faces draw some Han in Japanese forms, so Han-only lyrics take the other. */
export const styleFont = (s: FreeStyle, lyrics: string, calm: boolean) => (KANA.test(lyrics) ? s.fonts.ja : calm ? (s.fonts.calm ?? s.fonts.tc) : s.fonts.tc);

/** One short line for the picker; `what` is the world's full idea. */
const SHORT: Record<string, string> = {
  'dark-glitch': '深夜電台，字被雜訊吃掉', 'neon-stage': '夜裡的燈管招牌', terminal: '磷光螢幕逐格打字', 'led-board': '燈點組成的公告看板', 'stained-glass': '日光穿過鉛條玻璃窗',
  'silent-film': '插卡字幕，單色染片', 'ink-wash': '濕紙上的書法留白', ukiyoe: '分版平塗的木版畫', aizome: '留白成花紋的藍染布',
  papercut: '紅紙與光的鏤空', 'paper-lantern': '暖光穿過紙層', chiyogami: '花紋和紙摺疊拼貼', 'gothic-lolita': '暗黑童話精裝書',
  woodcut: '黑版上的刀痕', chalkboard: '放學後的粉筆字', crayon: '孩子塗的繪本頁',
  popart: '漫畫分格、對白框與網點', gameshow: '益智節目的題目卡與答案格', 'idol-live': '團扇剪字、門票與成員色卡', y2k: '凝膠按鈕、雷射膜與 CD',
  psychedelic: '七〇海報的招牌字與彩虹拱', graffiti: '水泥牆上的模板噴漆', brutalist: '影印海報的網格與紅色帶', citypop: '平塗封套的建築、泳池與夜景',
  cyanotype: '藍曬紙上的蕨葉與蕾絲剪影', isometric: '等角方塊、階梯與牆上的字', cel80s: '八〇動畫片頭的標題與星芒',
  silk: '平塗油墨，版微微錯開', 'silk-cold': '冷色網版，適合安靜的歌', riso: '透明墨疊印，留白多', file: '攤開的案件檔案', document: '感熱收據逐行印出，副歌是合計', spy: '剪紙片頭，大塊斜切', card: '節拍上翻面的閃卡',
};

/** The picker's groups, the worlds first: a family no group names lands in the last one. */
const GROUPS: { name: string; families: StyleWorld['family'][] }[] = [
  { name: '會發光', families: ['emissive'] },
  { name: '水與膠片', families: ['wet', 'film'] },
  { name: '紙與層次', families: ['layered'] },
  { name: '手繪筆觸', families: ['stroke'] },
  { name: '棚、牆與空氣', families: ['ui', 'wall', 'air'] },
  { name: '印刷平面', families: ['print'] },
];

export interface StyleCard { id: string; name: string; line: string; image: string }

const cardOf = (s: FreeStyle): StyleCard => ({ id: s.id, name: s.name, line: SHORT[s.id] ?? s.what.split(/[：，]/)[0], image: `free-styles/${s.id}.webp` });

/** Every style, once, in the picker's order. */
export function styleGroups(styles: readonly FreeStyle[] = OFFERED_STYLES) {
  const named = new Set(GROUPS.flatMap((g) => g.families));
  return GROUPS.map((g, i) => ({ name: g.name, cards: styles.filter((s) => g.families.includes(s.world.family) || (i === GROUPS.length - 1 && !named.has(s.world.family))).map(cardOf) }));
}

/** Worlds too particular in mood to be offered unasked (horror, a terminal, a case file, gothic): a person picks them. */
const NOT_DEFAULT = new Set(['dark-glitch', 'terminal', 'file', 'gothic-lolita']);
const CALM_FAMILIES: StyleWorld['family'][] = ['wet', 'film', 'layered', 'print'];
const LIVELY_FAMILIES: StyleWorld['family'][] = ['emissive', 'print', 'stroke', 'layered', 'ui', 'wall'];
const CALM_PRINT = new Set(['silk-cold', 'riso']);

/**
 * The style a song opens in when its person has picked none, by rule (the free tier calls no model): a song sung
 * slowly (under 3 characters a second, the line director's own line) leans to ink, film, paper and quiet print; a
 * busy one to light, bold print, hand strokes and paper. Within those, the title chooses, so a song always opens the
 * same and songs spread across the styles. (2026-11-03 owner: the plain look made the free tier's first impression.)
 */
export function recommendStyle(song: { title: string; cues: readonly { start: number; end: number; text: string }[] }, styles: readonly FreeStyle[] = OFFERED_STYLES): string {
  const sung = song.cues.reduce((s, c) => s + Math.max(0, c.end - c.start), 0);
  const chars = song.cues.reduce((s, c) => s + [...c.text.replace(/\s/g, '')].length, 0);
  const calm = chars / Math.max(1, sung) < 3;
  const pool = styles.filter((s) => !NOT_DEFAULT.has(s.id) && (calm ? CALM_FAMILIES : LIVELY_FAMILIES).includes(s.world.family) && (s.world.family !== 'print' || CALM_PRINT.has(s.id) === calm));
  const from = pool.length ? pool : styles;
  let h = 2166136261;
  for (const ch of song.title) h = Math.imul(h ^ ch.codePointAt(0)!, 16777619) >>> 0;
  return from[h % from.length].id;
}
