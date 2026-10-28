// What the person asked for, as the director reads it (direct.mts): their text, reference images, a style they picked,
// the candidate styles on offer and the concept being adjusted. Pure helpers, no API calls.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';

export interface Previous { concept: string; language: string; font: string }
export interface Ref { media_type: string; data: string }

const MEDIA: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
export const MAX_REFS = 5;

/** `--style`: plain text as given, `@path` reads the file (trimmed). */
export function readStyle(v: string | undefined): string {
  if (!v) return '';
  return v.startsWith('@') ? readFileSync(v.slice(1), 'utf8').trim() : v;
}

/** The reference images in a folder: jpg/png/webp only, sorted by name, at most five, base64. */
export function loadRefs(dir: string): Ref[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => MEDIA[extname(n).toLowerCase()])
    .sort()
    .slice(0, MAX_REFS)
    .map((n) => ({ media_type: MEDIA[extname(n).toLowerCase()], data: readFileSync(join(dir, n)).toString('base64') }));
}

/** A first user message: the text alone, or the images before it when there are references. */
export function withRefs(text: string, refs: Ref[]) {
  if (!refs.length) return text;
  return [
    ...refs.map((r) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: r.media_type, data: r.data } })),
    { type: 'text' as const, text },
  ];
}

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
  if (o.previous) rules.push(`這是調整：上一版的概念是「${o.previous.concept}」，設計語言 ${o.previous.language}，字型 ${o.previous.font}。${o.note?.trim() ? `使用者的意見：「${o.note.trim()}」。` : ''}使用者沒有要求改的（設計語言、字型、色調、故事）都保留，只改意見提到的地方。`);
  return block(rules);
}

/** The same wishes for the design pass (font, colour, texture are decided there); '' when there are none. */
export function designBriefText(o: { style?: string; briefReading?: string; previous?: Previous; hasRefs: boolean }): string {
  const rules: string[] = [];
  if (o.style?.trim()) rules.push(`使用者寫的話：${o.style.trim()}${o.briefReading?.trim() ? `\n  導演的理解：${o.briefReading.trim()}` : ''}\n  色彩、字型、質感照這個理解做；名字只轉譯成視覺特徵，不能畫出名字、角色或標誌。`);
  if (o.hasRefs) rules.push('使用者附了參考圖（在這則訊息最前面）：色彩、光線與質感往它靠，不要照抄畫面，也不要畫出圖裡的人物、角色、文字或標誌。');
  if (o.previous) rules.push(`這是調整：上一版用字型 ${o.previous.font}；使用者沒有要求改字型或色調時就保留。`);
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
