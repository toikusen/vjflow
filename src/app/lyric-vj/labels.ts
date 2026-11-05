// The small printed words of the style worlds (a blueprint's title block, a phone's buttons, a case file's header cells,
// a receipt's columns, a quiz card's head) speak the song's language (owner rule, 2026-11-05): a Japanese song's
// blueprint says 注記, an English song's says NOTES, a Chinese song's says 說明. One dictionary keyed by meaning, here, for
// every world; the language is the lyric's dominant one, picked once a song (labelLangOf). Real data (the song's title,
// its artist, a time) is never translated. What every market prints in English (a quiz show's Q and its answer letters,
// a homepage's menu, a setlist, a computer's windows) is not in the dictionary: those stay as the worlds draw them
// (ENGLISH_EVERYWHERE lists them).
import type { SectionKind } from './structure';

export type LabelLang = 'zh' | 'ja' | 'en';
export const LABEL_LANGS: readonly LabelLang[] = ['zh', 'ja', 'en'];

const KANA = /[ぁ-ゖァ-ヺー]/gu;
const HAN = /\p{Script=Han}/gu;
const LATIN_WORD = /\p{Script=Latin}+(?:['’]\p{Script=Latin}+)*/gu;
/** A Latin word carries about as much of a sung line as two CJK characters. */
const WORD_WEIGHT = 2;
/** Share of the CJK characters that must be kana for the CJK to be Japanese (a stray の in a Chinese lyric is not). */
const KANA_SHARE = 0.1;

/**
 * The language a song's small labels are printed in: the lyric's dominant one. CJK characters against Latin words (a
 * word weighs two characters); CJK with a real share of kana is Japanese, else Chinese (zh-Hant). Nothing to go on: zh.
 */
export function labelLangOf(lyrics: string | readonly string[]): LabelLang {
  const text = typeof lyrics === 'string' ? lyrics : lyrics.join('\n');
  const count = (re: RegExp) => text.match(re)?.length ?? 0;
  const kana = count(KANA);
  const cjk = kana + count(HAN);
  const latin = count(LATIN_WORD) * WORD_WEIGHT;
  if (latin > cjk) return 'en';
  return cjk && kana >= cjk * KANA_SHARE ? 'ja' : 'zh';
}

type Forms = Readonly<Record<LabelLang, string>>;
const f = (zh: string, ja: string, en: string): Forms => ({ zh, ja, en });

/** Every decorative label a world prints, by meaning: Traditional Chinese, Japanese, English. */
export const LABELS = {
  // a song's data heads (case file cells, idol ticket)
  title: f('標題', '題名', 'TITLE'),
  artist: f('歌手', '歌手', 'ARTIST'),
  song: f('曲名', '曲名', 'SONG'),
  time: f('時間', '時刻', 'TIME'),
  lines: f('行數', '行数', 'LINES'),
  // blueprint's title block and notes
  drawingTitle: f('圖名', '図名', 'TITLE'),
  by: f('作者', '作者', 'BY'),
  scale: f('比例', '尺度', 'SCALE'),
  section: f('剖面', '断面', 'SECTION'),
  letterHeight: f('字高', '字高', 'HEIGHT'),
  strokeWeight: f('筆畫粗', '線の太さ', 'STROKE'),
  notes: f('說明', '注記', 'NOTES'),
  elevation: f('立面', '立面図', 'ELEVATION'),
  // phone
  mobile: f('行動電話', '携帯', 'mobile'),
  decline: f('拒絕', '拒否', 'Decline'),
  accept: f('接聽', '応答', 'Accept'),
  search: f('搜尋', '検索', 'search'),
  lyrics: f('歌詞', '歌詞', 'lyrics'),
  newMessage: f('新訊息', '新着メッセージ', 'New message'),
  justNow: f('現在', 'たった今', 'now'),
  noService: f('無服務', '圏外', 'No service'),
  searchingSignal: f('搜尋訊號…', '検索中…', 'Searching…'),
  newline: f('換行', '改行', 'return'),
  space: f('空白', '空白', 'space'),
  // gameshow
  hint: f('提示', 'ヒント', 'HINT'),
  timeLeft: f('時間', '残り時間', 'TIME'),
  // receipt
  item: f('品名', '品名', 'ITEM'),
  part: f('段落', 'パート', 'PART'),
  total: f('合計', '合計', 'TOTAL'),
  subtotal: f('小計', '小計', 'SUBTOTAL'),
  thanks: f('謝謝光臨', 'ありがとうございました', 'THANK YOU'),
  // a receipt's units, printed right after a number (15字, 12字, 15 ch): an English one keeps its own space
  unitChars: f('字', '字', ' ch'),
  unitSec: f('秒', '秒', 's'),
  unitLines: f('句', '行', ' lines'),
  unitRows: f('行', '行', ' lines'),
} as const satisfies Record<string, Forms>;
export type LabelKey = keyof typeof LABELS;

/** A song part's name as a world prints it (a receipt's 段落 column): a quiet last chorus is still the chorus. */
export const PART_LABELS: Readonly<Record<SectionKind, Forms>> = {
  intro: f('前奏', 'イントロ', 'INTRO'),
  verse: f('主歌', 'Aメロ', 'VERSE'),
  pre: f('導歌', 'Bメロ', 'PRE'),
  chorus: f('副歌', 'サビ', 'CHORUS'),
  ochi: f('副歌', '落ちサビ', 'CHORUS'),
  bridge: f('橋段', 'Cメロ', 'BRIDGE'),
  interlude: f('間奏', '間奏', 'INTERLUDE'),
  outro: f('尾奏', 'アウトロ', 'OUTRO'),
};

/** A label in a language. */
export const labelOf = (key: LabelKey, lang: LabelLang): string => LABELS[key][lang];
/** A part's name in a language. */
export const partLabelOf = (kind: SectionKind, lang: LabelLang): string => PART_LABELS[kind][lang];
/** One of three things by language, for what is more than a word (a phone's keyboard, its input chips). */
export const byLang = <T,>(lang: LabelLang, forms: Readonly<Record<LabelLang, T>>): T => forms[lang];
/**
 * A typed case file's bilingual head: the English typewriter word, then the song's own (TITLE 標題, TITLE 題名); an
 * English song's head is the English word alone.
 */
export const headOf = (key: LabelKey, lang: LabelLang) => (lang === 'en' ? LABELS[key].en : `${LABELS[key].en} ${LABELS[key][lang]}`);
/** Every form of every label, for loading a face's glyphs before the first frame. */
export const ALL_LABEL_TEXT = [...Object.values(LABELS), ...Object.values(PART_LABELS)].flatMap((x) => Object.values(x)).join('');

/**
 * What stays English for every song, because every market prints it in English (genre conventions, not translations
 * missing): the world, and the words.
 */
export const ENGLISH_EVERYWHERE: Readonly<Record<string, readonly string[]>> = {
  gameshow: ['Q (the question tab)', 'A B C D … (answer letters)'],
  y2k: ['HOME', 'MUSIC', 'GUESTBOOK', 'NEW!'],
  'idol-live': ['SETLIST', 'PINK BLUE MINT LEMON LILAC (member colours)', '01 02 … (setlist numbers)'],
  file: ['FILE (the folder tab)', 'ENTRY', 'n LINE(S)', 'the English half of a head cell (TITLE 標題)'],
  terminal: ['~ $ tty', 'log', 'sync', '~/…', '….txt', 'Error / ERROR', 'Terminal (window titles a computer prints)'],
  blueprint: ['A–A (section letters)', '1:1', '⌀30', 'zone marks 1–8 and A–D'],
  phone: ['ABC / 123 / QWERTY keys', 'the status bar'],
};

/** The language a frame's labels speak: the song's, set by the plan; a job planned before it had one, its title's. */
export const langOfEnv = (e: { lang?: LabelLang; title?: string }): LabelLang => e.lang ?? labelLangOf(e.title ?? '');
/** A label as a frame prints it. */
export const say = (e: { lang?: LabelLang; title?: string }, key: LabelKey) => LABELS[key][langOfEnv(e)];
