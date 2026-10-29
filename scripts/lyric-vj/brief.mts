// What the person asked for, as the director reads it (direct.mts): their text, reference images, a style they picked,
// the candidate styles on offer and the concept being adjusted. Pure helpers, no API calls.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { LANGUAGES, type LanguageId, PROVEN_LANGUAGES } from '../../src/app/lyric-vj/languages';
import type { UnsungWindow } from '../../src/app/lyric-vj/structure';
import type { Interlude } from '../../src/app/lyric-vj/treatment';

export interface Previous { concept: string; language: string; font: string }
export interface Ref { media_type: string; data: string; name?: string }

const MEDIA: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
export const MAX_REFS = 5;
/** Long edge of a reference sent to the director (the model downsizes above 2,576 px anyway). */
export const REF_EDGE = 1568;
/** A converted reference larger than this is skipped (the API takes 10 MB per image base64, 32 MB per request). */
export const REF_MAX_BYTES = 5 * 1024 * 1024;

/** macOS sips arguments: fit the long edge into REF_EDGE and re-encode as JPEG quality 85. */
export function sipsArgs(input: string, output: string): string[] {
  return ['-Z', String(REF_EDGE), '-s', 'format', 'jpeg', '-s', 'formatOptions', '85', input, '--out', output];
}

/** `--style`: plain text as given, `@path` reads the file (trimmed). */
export function readStyle(v: string | undefined): string {
  if (!v) return '';
  return v.startsWith('@') ? readFileSync(v.slice(1), 'utf8').trim() : v;
}

/**
 * The reference images in a folder: jpg/png/webp by extension, sorted by name, each re-encoded by sips as a JPEG of at
 * most REF_EDGE px (a phone photo sent as is went over the API's size limits; a mislabelled file got the wrong media
 * type), at most five. A file sips cannot read or that stays over REF_MAX_BYTES is skipped with a note, never fatal.
 */
export function loadRefs(dir: string): Ref[] {
  if (!existsSync(dir)) return [];
  const names = readdirSync(dir).filter((n) => MEDIA[extname(n).toLowerCase()]).sort();
  const tmp = mkdtempSync(join(tmpdir(), 'vj-refs-'));
  const refs: Ref[] = [];
  try {
    for (const [i, name] of names.entries()) {
      if (refs.length >= MAX_REFS) break;
      const out = join(tmp, `${i}.jpg`);
      try {
        execFileSync('sips', sipsArgs(join(dir, name), out), { stdio: 'ignore' });
      } catch {
        console.error(`ref skipped: ${name} (sips could not convert it)`);
        continue;
      }
      if (!existsSync(out) || statSync(out).size > REF_MAX_BYTES) {
        console.error(`ref skipped: ${name} (${existsSync(out) ? 'still over 5 MB after conversion' : 'no output'})`);
        continue;
      }
      refs.push({ name, media_type: 'image/jpeg', data: readFileSync(out).toString('base64') });
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  return refs;
}

/** A first user message: the text alone, or the images before it when there are references. */
export function withRefs(text: string, refs: Ref[]) {
  if (!refs.length) return text;
  return [
    ...refs.map((r) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: r.media_type, data: r.data } })),
    { type: 'text' as const, text },
  ];
}

const ids = (list: string | undefined) => [...new Set((list ?? '').split(',').map((x) => x.trim()))].filter((k): k is LanguageId => k in LANGUAGES);

/**
 * The design languages on offer to the director. `proven` and `candidates` are comma lists of ids as the beta server
 * keeps them (the admin's tiers at run time); without a proven list the code's PROVEN_LANGUAGES stand in. A language
 * the person picked is the only one. Unknown ids are dropped; a candidate that is also proven is proven.
 */
export function languageOffer(o: { picked?: string; proven?: string; candidates?: string }): { picked?: LanguageId; candidates: LanguageId[]; allowed: LanguageId[] } {
  const picked = o.picked && o.picked in LANGUAGES ? (o.picked as LanguageId) : undefined;
  const proven = o.proven === undefined ? PROVEN_LANGUAGES : ids(o.proven);
  const candidates = picked ? [] : ids(o.candidates).filter((k) => !proven.includes(k));
  return { picked, candidates, allowed: picked ? [picked] : [...proven, ...candidates] };
}

/** 「上一版…。」 with only the parts the previous treatment has; '' when it has none. */
const previousText = (p: Previous) => {
  const parts = [p.concept.trim() && `概念是「${p.concept.trim()}」`, p.language.trim() && `設計語言 ${p.language.trim()}`, p.font.trim() && `字型 ${p.font.trim()}`].filter(Boolean);
  return parts.length ? `上一版的${parts.join('，')}。` : '';
};
const block = (rules: string[]) => (rules.length ? `導演須知（依使用者的要求）：\n${rules.map((r) => `- ${r}`).join('\n')}` : '');

/**
 * The instructions appended to 【這首歌的說明】: each rule only when its condition holds, '' when there is nothing
 * the person asked for (the prompt then stays as it was).
 */
export function briefText(o: { style?: string; note?: string; previous?: Previous; candidates: string[]; chosen?: string; hasRefs: boolean }): string {
  const wrote = !!o.style?.trim() || !!o.note?.trim();
  const rules: string[] = [];
  if (wrote) rules.push('上面是使用者寫的話。提到的畫家、導演、動畫公司、作品或品牌（例如宮崎駿、吉卜力），要轉譯成看得到的具體視覺特徵（色彩、光線、線條、質感、構圖、節奏）再用；畫面裡絕對不能出現這些名字、角色或標誌，素材 prompt 也不能寫這些名字。');
  if (o.hasRefs) rules.push('使用者附了參考圖（在這則訊息最前面）：只取它的色彩、光線、質感與構圖感覺，不要照抄畫面，也不要畫出圖裡的人物、角色、文字或標誌。');
  if (wrote) rules.push(`briefReading 必填：一兩句，用「你寫的『…』我理解成：…」的句型，引用使用者的關鍵字，說出你讀成哪些具體的視覺特徵${o.hasRefs ? '（也說從參考圖取了什麼）' : ''}；被轉譯的名字只出現在這句引用裡。`);
  else if (o.hasRefs) rules.push('briefReading 必填：一兩句，用「你給的參考圖我理解成：…」的句型，說出你從圖裡取了哪些具體的視覺特徵。');
  if (o.chosen) rules.push(`使用者指定了設計語言「${o.chosen}」：照用，不要換。如果你判斷它不適合這首歌，在 concerns 用一兩句具體說明哪裡不合、畫面會受什麼影響；適合就填空字串。`);
  else if (o.candidates.length) rules.push(`設計語言清單裡標【候選】的（${o.candidates.join('、')}）還在試：只有它明顯比驗收過的更適合這首歌才選；選了就在 candidateReason 寫一兩句理由（這首歌的哪個特質需要它），選驗收過的就填空字串。`);
  // a previous version with a note is an adjustment (what the note leaves alone stays); without a note it is a redo:
  // a new direction, the previous version quoted only so it is not repeated
  if (o.previous && o.note?.trim()) rules.push(`這是調整：${previousText(o.previous)}使用者的意見：「${o.note.trim()}」。使用者沒有要求改的（設計語言、字型、色調、故事）都保留，只改意見提到的地方。`);
  else if (o.previous) rules.push(`這是重做：${previousText(o.previous)}使用者要的是一個明顯不同的方向：概念不能和上一版重複，字型、色調、故事都要換${o.chosen ? '' : '，設計語言也考慮換'}。上一版只是用來避開，沒有任何部分要保留。`);
  return block(rules);
}

/** The same wishes for the design pass (font, colour, texture are decided there); '' when there are none. */
export function designBriefText(o: { style?: string; briefReading?: string; note?: string; previous?: Previous; hasRefs: boolean }): string {
  const rules: string[] = [];
  if (o.style?.trim()) rules.push(`使用者寫的話：${o.style.trim()}${o.briefReading?.trim() ? `\n  導演的理解：${o.briefReading.trim()}` : ''}\n  色彩、字型、質感照這個理解做；名字只轉譯成視覺特徵，不能畫出名字、角色或標誌。`);
  if (o.hasRefs) rules.push('使用者附了參考圖（在這則訊息最前面）：色彩、光線與質感往它靠，不要照抄畫面，也不要畫出圖裡的人物、角色、文字或標誌。');
  const font = o.previous?.font.trim();
  if (o.previous && o.note?.trim()) rules.push(`這是調整：${font ? `上一版用字型 ${font}；` : ''}使用者沒有要求改字型或色調時就保留上一版的。`);
  else if (o.previous) rules.push(`這是重做：${font ? `上一版用字型 ${font}，` : ''}這次的字型與色調都要和上一版明顯不同。`);
  return rules.length ? `\n\n【使用者的要求】\n${rules.map((r) => `- ${r}`).join('\n')}` : '';
}

type BriefFields = { briefReading?: string; concerns?: string; candidateReason?: string };

/** The three reading fields stay as the director wrote them; empty ones are dropped. */
export function briefFields<T extends BriefFields>(t: T): T {
  for (const k of ['briefReading', 'concerns', 'candidateReason'] as const) if (typeof t[k] === 'string' && !t[k]!.trim()) delete t[k];
  return t;
}

export interface UserPromptParts {
  toolbox: string; expectShots: number; shotSec: [number, number]; cueCount: number; style: string; brief: string;
  structure: string; suggested: string; keyWords: string[]; repeat: string; titleCards: string; win: { start: number; end: number };
  tempo: number; sections: string; downbeats: string; cueLines: string; catalog: string; dbText: string;
}

/** The director's user prompt; without a brief it is exactly the prompt direct.mts wrote before briefs existed. */
export function userPrompt(p: UserPromptParts): string {
  return `${p.toolbox ? `${p.toolbox}\n\n` : ''}【輸出要求】shots 大約 ${p.expectShots} 個（每個 ${p.shotSec[0]}–${p.shotSec[1]} 秒，連續覆蓋整個範圍）；cues 必須包含下列全部 ${p.cueCount} 句。\n\n【這首歌的說明】\n${p.style ? `${p.style}\n` : ''}${p.brief ? `${p.brief}\n` : ''}${p.structure}\n\n【程式建議的爆點】（依結構產生，可以調整強度與長度，位置除非有明確理由不要改）\n${p.suggested}\n\n【關鍵詞（可以換色的詞）】\n${p.keyWords.join('、') || '（無）'}\n\n【重複段落】\n${p.repeat}\n\n【標題卡】\n${p.titleCards}\n\n【範圍】${p.win.start}–${p.win.end} 秒；BPM 約 ${p.tempo.toFixed(0)}\n【段落】\n${p.sections}\n【強拍】${p.downbeats}\n\n【歌詞】\n${p.cueLines}\n\n【模板】\n${p.catalog}\n\n【VJ 資料庫參考】（50 支歌詞 VJ 的分析，是觀察與推測，不是規則）\n${p.dbText}`;
}

const KIND_NAME: Record<UnsungWindow['kind'], string> = { intro: '前奏', interlude: '間奏', outro: '尾奏' };
const mmss = (sec: number) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
/** A pictures entry needs a reason at least this long (characters, trimmed); shorter is read as no reason. */
export const MIN_REASON = 8;

/**
 * The instruction block for the song's unsung windows: each listed as `mm:ss–mm:ss 前奏/間奏/尾奏`, backdrop by
 * default, pictures only with a story reason. '' when there are no windows (the prompt then stays as it was).
 */
export function interludeText(windows: UnsungWindow[]): string {
  if (!windows.length) return '';
  const list = windows.map((w) => `- ${mmss(w.start)}–${mmss(w.end)} ${KIND_NAME[w.kind]}（${w.start.toFixed(1)}–${w.end.toFixed(1)} 秒）`).join('\n');
  return `沒有歌詞的段落（interludes 每段一筆，start/end 照下面的秒數）：\n${list}\n- 預設 mode 填 backdrop：背景換段、圖形動態、節奏撐畫面，不放道具、角色或插圖，reason 填空字串。\n- 只有這首歌的故事在那裡需要一張畫面時才填 pictures，reason 寫一句理由（故事的哪一段要在這裡被看見，至少 ${MIN_REASON} 個字）；理由會顯示在概念卡上。`;
}

const span = (x: { start: number; end: number }) => `${x.start.toFixed(1)}–${x.end.toFixed(1)} 秒`;
const overlap = (a: { start: number; end: number }, b: { start: number; end: number }) => Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));

/**
 * Makes the director's interludes one entry per window, in order: entries that overlap no window are dropped, a
 * window's entry is the one covering most of it (others dropped), times snap to the window, pictures without a
 * reason of MIN_REASON characters becomes backdrop, and a window with no entry gets backdrop. Mutates `t`; returns
 * the fix lines (director.json `fixes`). No windows leaves no interludes.
 */
export function normaliseInterludes(t: { interludes?: Interlude[] }, windows: UnsungWindow[]): string[] {
  const fixes: string[] = [];
  const given = t.interludes ?? [];
  const best = new Map<number, Interlude>();
  for (const x of given) {
    const hits = windows.map((w, i) => ({ i, o: overlap(x, w) })).filter((h) => h.o > 0).sort((a, b) => b.o - a.o);
    if (!hits.length) { fixes.push(`interludes ${span(x)} 不在沒有歌詞的段落裡，刪除`); continue; }
    const i = hits[0].i;
    const prev = best.get(i);
    if (!prev) { best.set(i, x); continue; }
    const keepNew = overlap(x, windows[i]) > overlap(prev, windows[i]);
    fixes.push(`interludes ${span(keepNew ? prev : x)} 和同一段重複，刪除`);
    if (keepNew) best.set(i, x);
  }
  const out = windows.map((w, i): Interlude => {
    const x = best.get(i);
    if (!x) { fixes.push(`${span(w)}（${KIND_NAME[w.kind]}）導演沒有寫 interludes，補 backdrop`); return { start: w.start, end: w.end, mode: 'backdrop', reason: '' }; }
    if (x.start !== w.start || x.end !== w.end) fixes.push(`interludes ${span(x)} 對齊到 ${span(w)}`);
    const reason = typeof x.reason === 'string' ? x.reason : '';
    const short = [...reason.trim()].length < MIN_REASON;
    if (x.mode === 'pictures' && short) fixes.push(`interludes ${span(w)} 選了 pictures 但理由不到 ${MIN_REASON} 個字，改為 backdrop`);
    return { start: w.start, end: w.end, mode: x.mode === 'pictures' && !short ? 'pictures' : 'backdrop', reason };
  });
  if (out.length) t.interludes = out;
  else delete t.interludes;
  return fixes;
}
