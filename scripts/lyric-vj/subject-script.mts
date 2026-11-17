// Subject-video tier, phase 1: the director's script and cast brief for a window of a song in one of our proven
// languages, then candidate sheets for the buyer to pick from. The script decides the cast (1–3 subjects: people,
// objects, animals or weather) from the lyrics, tells the story in a few shots — most of them subjects cut out and
// composited over the language's code-drawn grounds, a few scenes where a real place matters — and names, per line,
// which of our grounds, kinetic moves and text motions the meaning asks for. Nothing is fixed per song here: the
// shots, their count and their line map come from this song's lyrics, sections and tempo. A member the buyer has
// already picked (--fixed) is kept as given and gets no candidates; the others get 3–6 sheets each, drawn with the
// decided members as reference and one combined view.
// Phase 2 (after the picks) draws stills and clips with the chosen sheets as reference and cuts on the song's beats.
//
// npx tsx scripts/lyric-vj/subject-script.mts --song out/db/<id>/song.json --from 3 --to 63.06 --language risograph \
//   --out out/research/video-tier/run2 [--fixed <dir>/fixed.json] [--stage prompt|script|sheets|pick|all] [--model claude-opus-5-5] [--image-model gemini-3-pro-image]
//   [--earlier <cast sheet> --earlier-looks <board.json>]  (an earlier tier's cast of this song: one candidate per such member redraws it)
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { LANGUAGES, type LanguageId } from '../../src/app/lyric-vj/languages';
import { STYLE_WORLDS } from '../../src/app/lyric-vj/style-worlds';
import { type Candidate, cleanScript, type FixedMember, type SubjectScript } from '../../src/app/lyric-vj/subject-script';
import { feltTempo } from '../../src/app/lyric-vj/timeline';
import { unsungWindows } from '../../src/app/lyric-vj/structure';
import { STRETCH_SHOTS } from '../../src/app/lyric-vj/stretch-plan';
import { GROUND_HELP } from '../../src/app/lyric-vj/lineplan-core';
import { PRICES, streamed } from './claude.mts';
import { EMPH_HELP, ENTER_HELP, EXIT_HELP, FX_HELP, IDLE_HELP, TEMPLATES } from './typehelp.mts';

const { values: a } = parseArgs({
  options: {
    song: { type: 'string' }, from: { type: 'string' }, to: { type: 'string' }, language: { type: 'string', default: 'risograph' }, out: { type: 'string' }, fixed: { type: 'string' },
    // the buyer's direction for this run (who the protagonist is, what to keep), and an earlier script whose shots
    // (stills, clips) exist and may be reused by id
    note: { type: 'string' }, reuse: { type: 'string' },
    // an earlier tier's cast of this song (the story tier's sheet and its board's people): redrawn as one candidate each
    earlier: { type: 'string' }, 'earlier-looks': { type: 'string' },
    stage: { type: 'string', default: 'all' }, model: { type: 'string', default: 'claude-opus-5-5' }, 'image-model': { type: 'string', default: 'gemini-3-pro-image' },
  },
});
const IMAGE_PRICE: Record<string, number> = { 'gemini-3-pro-image': 0.134, 'gemini-3.1-flash-image': 0.101 };
const out = a.out!;
const from = Number(a.from), to = Number(a.to);
mkdirSync(join(out, 'sheets'), { recursive: true });
const ledgerPath = join(out, 'costs.json');
const ledger = (): { item: string; usd: number; at: string; model: string }[] => (existsSync(ledgerPath) ? JSON.parse(readFileSync(ledgerPath, 'utf8')) : []);
const charge = (item: string, usd: number, model: string) => writeFileSync(ledgerPath, JSON.stringify([...ledger(), { item, usd: +usd.toFixed(4), at: new Date().toISOString(), model }], null, 1));
const spent = () => ledger().reduce((s, x) => s + x.usd, 0);

const lang = LANGUAGES[a.language as LanguageId];
if (!lang) throw new Error(`unknown language ${a.language}`);
const world = STYLE_WORLDS.find((w) => w.language === a.language);
if (!world) throw new Error(`no style world for ${a.language}`);
const fixed: FixedMember[] = a.fixed ? JSON.parse(readFileSync(a.fixed, 'utf8')) : [];
const reuse: SubjectScript | undefined = a.reuse ? JSON.parse(readFileSync(a.reuse, 'utf8')) : undefined;
const earlierPeople: { id: string; look: string }[] = a['earlier-looks'] ? JSON.parse(readFileSync(a['earlier-looks'], 'utf8')).people ?? [] : [];

type Cue = { id: string; start: number; end: number; text: string };
type Song = { title: string; tempo: number; beats: number[]; downbeats: number[]; cues: Cue[]; sections: { start: number; end: number; energy: number; type: string }[] };
const song: Song = JSON.parse(readFileSync(a.song!, 'utf8'));
const felt = feltTempo(song as never);
const cues = song.cues.filter((c) => c.start < to && c.end > from);
const scriptFile = join(out, 'script.json');
const readScript = () => JSON.parse(readFileSync(scriptFile, 'utf8')) as SubjectScript;

/** The director's brief: the song's own data, the language's rules, the reference's clip rules and the schema. */
function prompt(): string {
  const beat = 60 / felt.tempo;
  const lines = cues.map((c) => {
    const sec = song.sections.find((s) => c.start >= s.start - 0.05 && c.start < s.end);
    return `${c.id} ${c.start.toFixed(2)}–${c.end.toFixed(2)} (${((c.end - c.start) / beat).toFixed(1)} 拍, ${sec?.type ?? '?'} 能量 ${sec?.energy.toFixed(2) ?? '?'}) ${c.text}`;
  }).join('\n');
  // the world's own grounds are drawn in world-grounds.ts; their words are not in GROUND_HELP
  const WORLD_GROUNDS: Record<string, string> = {
    'riso/two-drum': '兩滾筒：兩組斜切的淡色色版慢慢橫向滾過紙面（印刷機在跑、前進）', 'riso/grain-block': '顆粒大色塊：左邊一大塊深墨斜版、右下一塊淡墨版，大面留白（安靜、停下來）',
    'silk/pulled-slab': '刮刀拉出的兩塊斜版，一淡一深，滑進紙面', 'silk/second-pull': '第二道版疊上去，微微錯位',
    'screentone/narration': '旁白方框（直排），大片白與網點夜空，最安靜', 'screentone/caption': '旁白方框，橫排', 'screentone/caption-r': '旁白方框，在右邊',
    'screentone/balloons': '兩個橢圓對話框', 'screentone/shout': '尖刺爆炸框喊出來', 'screentone/burst': '爆炸框加集中線', 'screentone/burst-r': '爆炸框在右邊', 'screentone/sfx': '大擬聲字穿過分格（最強）',
  };
  const grounds = [...new Set([...Object.values(world.grounds.levels).flat(), ...world.grounds.quiet])].map((g) => `${g}（${GROUND_HELP[g] ?? WORLD_GROUNDS[g] ?? g}）`);
  const help = (h: Record<string, string>) => Object.entries(h).map(([k, v]) => `${k}: ${v}`).join('\n');
  const decided = fixed.length
    ? `已經定案的演員（使用者挑過 sheet，不可改、不出候選，cast 裡原樣列出，id 照用）：\n${fixed.map((f) => `- ${f.id}（${f.kind}）：${f.what}；role：${f.role}；features：${f.features.join('; ')}；配色 ${f.scheme}；look：${f.look}`).join('\n')}\n你要決定的是：還要加哪些演員和道具（依歌詞和故事，沒有上限）。不加也可以——那就 candidates 給空陣列，alternatives 用三行說清楚為什麼這首不需要第二個主角。加的每個 main 演員都要有 role、features、why，並出 3–4 個候選設計；prop 直接給 look。`
    : `從歌詞和故事決定演員與道具（沒有上限）；每個都要有 role、features、why。不一定要是人：上一版畫高中生騎單車，人物一致性和手腳是最大的弱點；LYKY 那首用物件當主角成功過。非人類主角影片模型也比較穩。但要是歌詞真的在講人、以人才說得通，就選人，並用構圖把手腳藏掉。每個演員出 4–6 個候選設計。`;
  const earlierText = earlierPeople.length && a.earlier
    ? `\n## 這首歌之前做過的人物（故事層的 cast sheet，使用者看過）\n${earlierPeople.map((p) => `- ${p.id}：${p.look}`).join('\n')}\n如果你的演員裡有對應的人，就沿用這些人的身份（id 可以改成你的短名），並在那個演員的候選裡放一個 "from": "earlier" 的候選：look 是上面那段英文改寫成這個風格的畫法（同一張臉、髮型、服裝設計，只換畫法和墨色），idea 寫「沿用故事版人物」；其餘候選是新的設計。程式會把舊的 cast sheet 當參考圖。\n`
    : '';
  // the stretches nobody sings in the window: the director plans each (stretches), else the video stage does by rule
  const dur = (song as { duration?: number }).duration ?? Math.max(...song.cues.map((c) => c.end));
  const unsung = unsungWindows({ cues: song.cues, duration: dur } as never).filter((w) => w.end > from && w.start < to);
  const KIND = { intro: '前奏', interlude: '間奏', outro: '尾奏' } as const;
  const stretchRule = unsung.length ? `\n## 沒人唱的段（前奏、間奏、尾奏）\n${unsung.map((w) => `${KIND[w.kind]} ${w.start.toFixed(2)}–${w.end.toFixed(2)}（${(w.end - w.start).toFixed(1)} 秒）`).join('\n')}\n每段在 stretches 給一筆：kind、at（這段開始的秒數）、shots（依序 1–${STRETCH_SHOTS} 個 cutout 鏡頭）、why（這個順序在故事裡的意思）。要有安排：收尾的畫面（尾奏停在故事的最後狀態）、呼應前面的鏡頭（callback）、慢下來的結尾；鏡頭少、每個停得久，不要把所有鏡頭輪一遍（上一版尾奏 30 秒把整份腳本的鏡頭輪播一次，像蒙太奇）。\n` : '';
  const owner = a.note ? `\n## 使用者的指示（最高優先，照做）\n${a.note}\n` : '';
  const existing = reuse ? `\n## 已有的素材（上一版畫好的鏡頭；合用的就沿用同一個 id 和同一段描述，不要改寫，程式會直接拿既有的圖和影片；不合用的就不要列，新的鏡頭用新的 id 從 S${String(reuse.shots.length + 1).padStart(2, '0')} 起）\n${reuse.shots.map((x) => `${x.id} ${x.kind.toUpperCase()} ${x.frame} cast ${x.cast.join('+')} ${x.size} side ${x.side} h ${x.height}: ${x.subject}`).join('\n')}\n` : '';
  return `你是這支歌詞 MV 的導演。這首歌〈${song.title}〉的 ${from}–${to} 秒要做成「主角影像 + 我們自己的動態字體與程式繪製世界」的版本，風格固定為「${lang.name}」（${a.language}）。
使用者看完上一版（每格都是 AI 整張場景、字只是排在旁邊、沒有轉場、沒有字體動態、沒有程式畫的圖）的評價是「還可以」。這一版要把我們整套系統用滿：風格自己的動態字體（進場、退場、停留、強調）、轉場、程式畫的底與圖形，全部依歌詞意義挑，不要展示、不要關鍵字觸發。

${owner}${earlierText}${existing}
## 這首歌（視窗內的句子，時間、拍數、段落、段落能量 0–1）
速度 ${felt.tempo.toFixed(1)} bpm（一拍 ${beat.toFixed(3)} 秒）
${lines}

## 風格：${lang.name}
本質：${lang.essence}
不是：${lang.not}
顏色：${lang.colour}
字：${lang.type}
圖層：${lang.layers}
動：${lang.motion}
招牌爆點：${lang.native}
道具畫法（給生圖模型的英文）：${lang.props?.style ?? ''}
適合：${lang.suits}
風格世界的程式底（ground id，每一句（line）選一個，跟著段落與故事走，不是跟著鏡頭；quiet 給沒唱的段）：${grounds.join(', ')}；安靜底：${world.grounds.quiet.join(', ')}
${lang.scenes === false ? '這個風格不印滿版場景（整張場景會把風格洗掉）：scene 鏡頭會以風格的照片窗（inset 或 circle、tint 成墨色、multiply）印在紙上，不會滿版；所以 scene 鏡頭要選在小窗裡也讀得出來的地方（一條地平線、一道階梯），不要靠細節。' : ''}
風格世界自己的字動作：進場 ${world.motion.enters.join('/')}，退場 ${world.motion.exits.join('/')}，停留 ${world.motion.holds.join('/')}；轉場 ${world.transitions.own.join('/')}；爆點 ${world.peak.loud}（慢：${world.peak.calm}）
配色方案（scheme id: 說明）：${world.palette.map((p) => `${p.id}: ${p.what}`).join('；')}

## 演員表（cast：person 人、object 物件、animal 動物、phenomenon 自然現象；我們的故事層可以有好幾個人物和道具，這一層也一樣，數量由歌詞和故事決定）
${decided}
tier：main 是會重複出現、需要使用者挑設計的主角（每個出候選 sheet）；prop 是不需要挑的道具或配角（落葉、路燈、一隻貓），直接照 look 用風格畫、去背。每多一個 main 演員就多一組 sheet（約 US$0.5）和一致性風險（同一個人每張圖要長一樣）；每個 prop 約一張圖。tradeoffs 用繁中說明你這組演員表的成本與一致性取捨。
id 用短英文名詞（person、bike、cat、sun）。look：prop 必填（給生圖模型的英文描述）；main 留空字串（由候選決定）。role 用繁中寫這個演員在歌裡代表什麼；features 列出分鏡會用到的部位或配件（英文，3–6 項），每一個候選設計都必須包含全部 features（候選只換造型與配色，不換零件），不要選天生帶文字的部位（車牌、停車證、標籤）。alternatives 寫你考慮過但沒選的演員和原因。
演員的墨色在整段裡固定（同一套去背圖用到底）：招牌爆點「留到最後才印的那一色」只能是底和字的強調色，不能是演員身上的墨；留色最多一個段落，任何時候紙上都要有兩個墨在疊。所有演員用同一個配色方案（scheme），world 的敘述也以該方案寫。
人（person）的鏡頭規則（AI 最容易出錯的地方）：背影、剪影、遠景小小的全身、側面小幅動作；手藏起來（口袋、畫面外）或小小地握在把手上；禁止走向鏡頭、拿東西的特寫、對嘴、手伸向鏡頭、臉部大特寫做表情。人和物件同框時用背影或側面，人不遮住物件的 features。

## 構圖規則（來自參考片 ゆのん「カルキュレイト」的分析，和上一版的檢討）
1. 絕大多數鏡頭是「演員去背（cutout）疊在程式畫的風格底上」：演員單獨生成在素色底、去背、以風格的墨色印在程式底上；很多鏡頭演員要小（高度 0.25–0.45）站在大片程式空間裡，字才有位置。只有少數（2–3 個）鏡頭是整張場景（scene）：開場、爆點，而且要有「真的需要一個地方」的理由。每個鏡頭用 cast 寫出裡面有哪些演員（id），空場景填 []；分鏡要說清楚哪些鏡頭只有哪個演員、哪些同框。
2. VIDEO 鏡頭是 8 秒的生成片段，只用最乾淨的 0.3–1.5 秒（最長 3 秒）；長的停留用定格加剪輯鏡頭。動作要「收得住」：遠景／側面／剪影才准大動作（走、轉、騎、落），中景只准小幅（抬頭、轉身、呼吸、風吹），特寫只准眨眼、閉眼、微微側頭。禁止：走向鏡頭、手伸向鏡頭、握持物特寫、對嘴、生成片裡的鏡頭運動（運鏡都由我們的渲染器加）。穩定等速轉動的輪子在抽格下會閃爍倒轉：轉動要慢、只取 1 秒內。
3. 手腳要藏：胸上景、背影、剪影、手插口袋、手在畫面外；物件主角沒有這個問題。
4. 鏡頭數：這段 ${(to - from).toFixed(0)} 秒約 10–16 個不同鏡頭，每個會重複用 2–5 次；主歌停留長、副歌短，實際切點由程式依這首的拍點與能量決定（你只給 lines：每句依序用哪些鏡頭，和可選的 beats 建議）。副歌不要只在 2–3 張圖之間來回閃。
5. 字永遠放在演員沒有的那一側（side 是演員那側；center 只給演員極小（height ≤ 0.3）或字壓不到的鏡頭）。同一句裡的所有鏡頭，演員必須在同一側（字在整句被讀的時候不能跳邊）；換句才可以換側。特寫 height ≤ 0.6，遠景 0.2–0.4。上一版最大的抱怨是字壓在臉上。
6. 轉場：用風格自己的轉場與「先印第一版再疊第二版」的方式切鏡頭，不要每切都硬切、也不要每切都用同一招。
7. 故事順序要成立：演員一旦離開畫面（騎走、消失），後面的句子不能又切回它停在原地的鏡頭，除非那句的意思就是回來；結尾狀態要和最後一句一致。同一段影片不要在兩句各播一次完整版。
8. 上一版成片檢討裡的具體失敗，不要再犯：俯視角的單車糾成一團（不畫俯視的複雜物件）；「剪影」畫成一塊黑形狀、零件缺失（剪影要用演員本體去背後由程式印成單墨，不另外畫剪影）；同一張圖連播兩次位置重置；副歌全是等長 2 拍切像節拍器；1 拍快切只在 3 張圖間來回閃。
9. beats 只在這句需要和程式規則不同時才填（程式依段落能量定：主歌約 4 拍、副歌約 2 拍、長音可長）：一個數字（整句），或一個陣列（依序每個鏡頭一個）；不要每句都填同一個數字。

## 我們的動態字與程式圖形（只在歌詞意義合的地方用）
排版 template：
${help(TEMPLATES)}
進場 enter：
${help(ENTER_HELP)}
退場 exit：
${help(EXIT_HELP)}
停留 idle：
${help(IDLE_HELP)}
強調 emphasis：
${help(EMPH_HELP)}
程式畫的動態圖形 fx（一句底下或演員周圍的程式圖形，填在 lines 上；大多數句子 fx 留空，只有這句的意思真的需要時才用，整段最多 2–3 句）：
${help(FX_HELP)}
強調 emphasis 一定要指定 word（這句歌詞裡實際唱到的那個詞）；idle 用 fill 時字已經照唱的時間填色，不要再加 color 強調（兩者會互相抵銷），要強調就換別的 emphasis。排版要避開演員：scatter 不配滿版 scene 或特寫；ribbon 會橫越整個畫面，只配演員極小的鏡頭；handwrite 不配特寫。

## 候選設計（candidates，只給還沒定案的演員）
每個候選是同一個演員的不同設計（造型、服裝或形狀、在這風格的 2–3 色墨裡的配色重點、年齡感或材質感）。for 填演員 id；idea 用繁體中文一句話（≤30 字）說設計想法；look 是給生圖模型的英文描述（具體：形狀、服裝、配件、哪些部位用哪個墨色、表情或姿態的氣質），不要寫風格說明（程式會加）；scheme 填配色方案 id（和定案演員一致）；together 用英文寫這個演員和其他 main 演員（已定案的，或同樣還在挑的）同框的一個合成視角（遵守人的鏡頭規則：背影或側面、手藏好、不遮住對方的 features；只有一個 main 演員就填空字串）。

${stretchRule}
## 避免每首歌長得一樣
sameness 寫：這個腳本裡哪些東西是你覺得「換一首歌也會這樣做」的固定做法，提醒我們之後變成規則時要小心。

只回傳一個 JSON 物件，不要任何說明文字。每個 why／fxWhy／role 只寫一句（≤40 字），不要長篇；整個 JSON 控制在能一次回完的長度。格式：
{
 "cast": [{"id": "bike", "kind": "person|object|animal|phenomenon", "tier": "main|prop", "what": "英文，這個演員是什麼", "look": "prop 的英文畫法；main 留空", "role": "繁中，在歌裡代表什麼", "features": ["English part or accessory every candidate must show"], "why": "繁中，為什麼"}],
 "alternatives": "繁中（沒加新演員時：三行為什麼）",
 "tradeoffs": "繁中，這組演員表的成本與一致性取捨",
 "story": "繁中，這段的故事 2–4 句（演員在這段裡發生什麼事）",
 "world": "繁中，程式底怎麼跟著故事走（哪一段用哪個 ground、墨色什麼時候換）",
 "peak": "繁中，爆點在哪一句、畫面怎麼做（用風格的招牌爆點）",
 "shots": [{"id": "S01", "kind": "still|video", "frame": "cutout|scene", "cast": ["bike"], "size": "wide|medium|close", "subject": "英文，姿勢或動作（video 寫會動的是什麼、鏡頭鎖定）", "place": "scene 鏡頭才填：英文，地方；加一句為什麼需要真的地方", "side": "left|right|center", "height": 0.35, "camera": "static|push|pan|parallax", "step": false, "why": "繁中，這個鏡頭對應歌詞的什麼"}],
 "lines": [{"cue": "c001", "shots": ["S01", "S02"], "beats": 4, "ground": "ground id", "fx": "fx id 或空字串", "fxWhy": "繁中，為什麼這句要這個 fx（空字串＝不用）"}],
 "text": [{"cue": "c001", "template": "template id", "enter": "enter id", "exit": "exit id", "idle": "idle id", "emphasis": "emphasis id 或空字串（只在有詞要強調時）", "word": "被強調的那個詞（歌詞裡的原文），沒有就空字串", "why": "繁中，為什麼這句用這組"}],
 "candidates": [{"for": "演員 id", "letter": "A", "idea": "繁中一句", "look": "English", "scheme": "scheme id", "together": "English or empty"${earlierPeople.length ? ', "from": "earlier（只有沿用舊人物的那個候選才填）"' : ''}}],
${unsung.length ? ' "stretches": [{"kind": "intro|interlude|outro", "at": 227.5, "shots": ["S20", "S34"], "why": "繁中，這段的順序在故事裡的意思"}],\n' : ''}
 "sameness": "繁中"
}`;
}

// --stage prompt: the brief written out for a read, no call made
if (a.stage === 'prompt') writeFileSync(join(out, 'script_prompt.md'), prompt());

if (a.stage === 'script' || a.stage === 'all') {
  if (!existsSync(scriptFile)) {
    const text = prompt();
    writeFileSync(join(out, 'script_prompt.md'), text);
    let made: SubjectScript | undefined;
    for (let k = 0; k < 3 && !made; k++) {
      const msg = await streamed({ model: a.model!, max_tokens: 64000, messages: [{ role: 'user', content: text }], output_config: { effort: 'high' } } as Anthropic.Beta.Messages.MessageStreamParams);
      const [pin, pout] = PRICES[a.model!] ?? [5, 25];
      charge(`script try ${k + 1}`, (msg.usage.input_tokens * pin + msg.usage.output_tokens * pout) / 1e6, a.model!);
      const body = msg.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('');
      try {
        const m = JSON.parse(body.slice(body.indexOf('{'), body.lastIndexOf('}') + 1)) as SubjectScript;
        const bad = (['shots', 'lines', 'text'] as const).filter((f) => !m[f]?.length);
        if (!(m.cast?.length || fixed.length) || bad.length) { writeFileSync(join(out, `script.incomplete.${k + 1}.json`), body); console.log(`script: incomplete (${bad.join(', ')}; ${msg.stop_reason}), asked again`); continue; }
        made = m;
      } catch { console.log(`script: unreadable (${msg.stop_reason}), asked again`); }
    }
    if (!made) throw new Error('script: no usable answer after three tries');
    const kept = cleanScript(made, {
      cues: cues.map((c) => ({ id: c.id, text: c.text })),
      grounds: [...Object.values(world.grounds.levels).flat(), ...world.grounds.quiet],
      fx: Object.keys(FX_HELP),
      templates: Object.keys(TEMPLATES),
      enters: [...Object.keys(ENTER_HELP), ...world.motion.enters],
      exits: [...Object.keys(EXIT_HELP), ...world.motion.exits],
      idles: [...Object.keys(IDLE_HELP), ...world.motion.holds],
      emphases: Object.keys(EMPH_HELP),
      schemes: world.palette.map((p) => p.id),
      fixed,
    }, (m) => console.warn(m));
    writeFileSync(scriptFile, JSON.stringify(kept, null, 1));
  }
  const s = readScript();
  const md = [
    `# ${song.title} ${from}–${to} s — ${lang.name} subject script`, '',
    '## Cast', ...s.cast.map((m) => `- **${m.id}** (${m.kind}, ${m.tier}${m.fixed ? ', decided' : ''}): ${m.what}${m.tier === 'prop' ? ` — look: ${m.look}` : ''}\n  - role: ${m.role}\n  - features: ${m.features.join('; ')}\n  - why: ${m.why}`),
    `- alternatives: ${s.alternatives}`, `- tradeoffs: ${s.tradeoffs}`, '',
    `**Story**: ${s.story}`, '', `**World**: ${s.world}`, '', `**Peak**: ${s.peak}`, '',
    '| id | kind | frame | cast | size | side | h | camera | subject | why |', '|---|---|---|---|---|---|---|---|---|---|',
    ...s.shots.map((x) => `| ${x.id} | ${x.kind.toUpperCase()} | ${x.frame} | ${x.cast.join('+') || '—'} | ${x.size} | ${x.side} | ${x.height} | ${x.kind === 'video' ? (x.step ? 'step' : 'clip') : x.camera} | ${x.subject}${x.place ? ` — ${x.place}` : ''} | ${x.why} |`), '',
    '| cue | shots | beats | ground | fx | template | enter | exit | idle | emphasis | why |', '|---|---|---|---|---|---|---|---|---|---|---|',
    ...s.lines.map((l) => { const t = s.text.find((x) => x.cue === l.cue); const c = cues.find((x) => x.id === l.cue); return `| ${l.cue} ${c?.text ?? ''} | ${l.shots.join(' ')} | ${l.beats ?? ''} | ${l.ground} | ${l.fx}${l.fxWhy ? ` (${l.fxWhy})` : ''} | ${t?.template ?? ''} | ${t?.enter ?? ''} | ${t?.exit ?? ''} | ${t?.idle ?? ''} | ${t?.emphasis ? `${t.emphasis} ${t.word}` : ''} | ${t?.why ?? ''} |`; }), '',
    '## Candidates', ...s.candidates.map((c) => `- **${c.for} ${c.letter}** (${c.scheme}): ${c.idea} — ${c.look}${c.together ? ` — together: ${c.together}` : ''}`), '',
    `**Sameness risk**: ${s.sameness}`,
  ].join('\n');
  writeFileSync(join(out, 'script.md'), md);
  const who = (ids: string[]) => s.shots.filter((x) => x.cast.length === ids.length && ids.every((id) => x.cast.includes(id))).length;
  console.log(`script: cast ${s.cast.map((m) => `${m.id}(${m.kind}${m.fixed ? ',decided' : ''})`).join(' ')}; ${s.shots.length} shots (${s.shots.filter((x) => x.kind === 'video').length} video, ${s.shots.filter((x) => x.frame === 'scene').length} scene; ${s.cast.map((m) => `${m.id} alone ${who([m.id])}`).join(', ')}, together ${s.shots.filter((x) => x.cast.length > 1).length}), ${s.candidates.length} candidates`);
}

const sheetOf = (c: Candidate) => join(out, 'sheets', `${c.for}_${c.letter}.jpg`);

/** One sheet per candidate: the member in the language's inks on bare paper, several views, a detail, and one combined view with the decided members. */
async function drawSheet(c: Candidate) {
  const file = sheetOf(c);
  if (existsSync(file)) return;
  const scheme = world.palette.find((p) => p.id === c.scheme) ?? world.palette[0];
  const s = readScript();
  const member = s.cast.find((m) => m.id === c.for);
  const must = member?.features.length ? ` It must show every one of these parts clearly in the views where they are visible: ${member.features.join('; ')}.` : '';
  const refs = fixed.filter((f) => existsSync(f.sheet));
  // mains still being picked have no design yet: in the combined view they stand in as a plain flat grey silhouette,
  // so the sheet shows scale and staging without fixing their look (an earlier-cast candidate keeps its partners' look)
  const open = s.cast.filter((m) => m.tier === 'main' && !m.fixed && m.id !== c.for);
  const earlier = c.from === 'earlier' && a.earlier && existsSync(a.earlier) ? a.earlier : '';
  const standIns = open.length ? ` ${earlier ? `the ${open.map((m) => m.what).join(' and the ')} drawn as in the earlier reference picture, redrawn the same way` : `the ${open.map((m) => m.what).join(' and the ')} only as a plain flat light-grey silhouette stand-in with no inner detail (its design is not chosen yet)`}.` : '';
  const together = c.together && (refs.length || open.length)
    ? ` Then, at the far right, one combined view: ${c.together} —${refs.length ? ` the ${refs.map((f) => f.what).join(' and the ')} drawn exactly as in the reference sheet (same design, same inks), nothing added to it;` : ''}${standIns}`
    : '';
  const redraw = earlier ? ' The last reference image is this song\'s earlier cast sheet in another style: draw the same person (same face, hair, clothes design and accessories) translated into this style and these inks; copy the design, not that drawing technique or its colours.' : '';
  const text = `Subject reference sheet for a ${lang.name} music video, printed as a ${a.language} print. ${lang.props?.style ?? ''} Inks: ${scheme.what} — use only ink ${scheme.ink}, ink ${scheme.accent} and their overprint, on bare paper ${scheme.ground}; no other colours, no black outlines, no gradients.${refs.length ? ' The reference image is the sheet of another subject of the same video: match its drawing technique, ink handling and halftone exactly.' : ''}${redraw}\nSubject: ${c.look}${must}\nDraw this same subject four times side by side on the bare paper, clearly separated and not overlapping, all the same size: front view, three-quarter view, side profile facing left, back view. Then one larger close-up of its most characteristic detail (the face or head if it has one, otherwise its key part).${together} The same design, proportions and ink placement in every view. Plain bare paper around every figure: no ground, no shadow on the ground, no scene, no frame, no panel borders, no text, no letters, no labels, no logo.`;
  writeFileSync(file.replace(/\.jpg$/, '.txt'), text);
  for (const f of [join(homedir(), '.config/vjflow/gemini.env')]) if (existsSync(f)) for (const line of readFileSync(f, 'utf8').split('\n')) { const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; }
  const ai = new GoogleGenAI({ apiKey: process.env['GEMINI_API_KEY'] });
  const model = a['image-model']!;
  const img = (f: string) => ({ type: 'image', mime_type: 'image/jpeg', data: readFileSync(f).toString('base64') });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let r: any;
  for (let k = 0; k < 3 && !r?.output_image?.data; k++) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      r = await (ai as any).interactions.create({ model, input: [{ type: 'text', text }, ...refs.map((f) => img(f.sheet)), ...(earlier ? [img(earlier)] : [])], response_format: { type: 'image', mime_type: 'image/jpeg', aspect_ratio: '16:9', image_size: '2K' } });
    } catch (e) {
      if (k >= 2) throw e;
      await new Promise((ok) => setTimeout(ok, 8000 * 3 ** k));
    }
  }
  if (!r?.output_image?.data) throw new Error(`no image for ${file}: ${JSON.stringify(r).slice(0, 300)}`);
  writeFileSync(file, Buffer.from(r.output_image.data, 'base64'));
  charge(`sheet ${c.for}_${c.letter}.jpg`, IMAGE_PRICE[model] ?? 0.134, model);
  console.log(`sheet ${file}`);
}

if (a.stage === 'sheets' || a.stage === 'all') {
  await Promise.all(readScript().candidates.map(drawSheet));
}

// one labelled pick page per undecided member: sheets/pick_<id>.jpg
if (a.stage === 'pick' || a.stage === 'all') {
  const s = readScript();
  for (const m of s.cast.filter((x) => !x.fixed && x.tier === 'main')) {
    const items = s.candidates.filter((c) => c.for === m.id && existsSync(sheetOf(c))).map((c) => ({ file: sheetOf(c), label: c.letter, text: `${c.idea}（${c.scheme}）` }));
    if (!items.length) continue;
    const list = join(out, 'sheets', `pick_${m.id}.json`);
    writeFileSync(list, JSON.stringify(items, null, 1));
    execFileSync('uv', ['run', '--with', 'pillow', 'python', 'scripts/lyric-vj/contact_sheet.py', list, join(out, 'sheets', `pick_${m.id}.jpg`), '--cols', '2'], { stdio: 'inherit' });
  }
}
console.log(JSON.stringify({ spentUSD: +spent().toFixed(3) }));
