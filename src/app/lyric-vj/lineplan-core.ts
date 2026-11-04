// The line composer's rules: every sung line gets its own layout, entrance, hold, exit, emphasis, background moves,
// camera and transition, without a director call. typeplan.mts --plan turns the result into a treatment, so every
// reading check and renderer rule stays in force. A repeated line comes back with the same recipe.

import { splitCalls } from './calls';
import type { TextCam, TextCamKind } from './render/text-cam';
import { CameraRig, isTrack, RigKind } from './render/camera-rig';
import { cjkOnly, cornerOf, crossingOf, phraseSpans, spoken, twoParts } from './render/line-space';
import type { InkState } from './render/glyph-state';
import { isArrival } from './render/arrival';
import { heldTail, leanAngle, LINE_EXIT_SEC, LineExitKind } from './render/line-exit';
import { splitSongTitle } from './structure';
import { Handoff, HANDOFF_TRANSITION, HandoffKind, handoffTimes } from './render/lyric-handoff';
import { setWordSafe, wordBreaks } from './phrases';
import { LineBeat, lineBeats, readingSec, setTogether } from './render/reading-window';
import { WORLD_BEATS } from './render/world-beats';
import type { BeatKind, StressKind } from './world-shared';
import type { FineTier, SymbolName } from './treatment';

export type Level = 0 | 1 | 2;
export interface Recipe {
  params?: Record<string, number | boolean>; id: string; level: Level; template: string; sides: string[]; enter: string; exit: string; idle: string; method: string; min?: number; max?: number; trail?: boolean;
  /** What a device needs of the line's words or shape to be there at all: it means something or it stays out. */
  fit?: Fit;
  /** The part's own world can give the reason too (`fit` read against what the part is about), not only the line's words. */
  world?: boolean;
  /** Seconds the line must have beyond its reading for this recipe's moves. */
  spare?: number;
  /** The emphasis it takes whatever the tension (a drawn mark would fight a carrier's own paper). */
  mark?: string;
  /** The surface it holds through its reading. */
  state?: InkState;
  /** A style world's own line: its set and moves, in place of template, enter, exit and idle (render/world-layout.ts). */
  wline?: { set: string; enter: string; exit: string; hold: string; ground?: string; loud?: boolean };
}
export interface Fit { test(text: string): boolean }
export interface Cue { id: string; start: number; end: number; text: string; singer?: string; charStarts?: number[]; charTimed?: boolean }
export interface SongPart { from: string; tension: number; fx: string[]; what: string }
export interface Meaning { palette: string; ground: string; reading: string; parts: SongPart[]; keys: { cue: string; phrase: string }[] }

// When a device fits: the words that give it a reason. Short, plain lists on purpose; a line that does not say this keeps
// the ordinary recipes.
/** Saying who one is, or owning up to something: a line worth a name tag. */
const IDENTITY = /我是|我叫|我的名|名字|身分|就是我|告白|承認|僕は|私は|俺は|名前/;
/** Making up one's mind, turning away: a cut. */
const DECIDE = /不要|不再|別再|算了|決定|轉身|放下|放手|夠了|停止|離開|從此|やめ|もういい|決め|捨て/;
/** Two sides of one thing. */
const PAIR = /你.{0,6}我|我.{0,6}你|黑.{0,6}白|白.{0,6}黑|明.{0,6}暗|愛.{0,6}恨|日.{0,6}夜|生.{0,6}死|天.{0,6}地|左.{0,6}右|彼此|兩邊|兩難|君.{0,6}僕|僕.{0,6}君|光.{0,6}影/;
/** Lights, screens, machines. */
const ELECTRIC = /電|機器|燈|霓虹|螢幕|訊號|數位|數據|代碼|像素|ネオン|信号|画面|機械|光線|閃爍/;
/** Going, coming near, looking back: a camera that travels. */
const TRAVEL = /路|走|遠方|靠近|回頭|回望|前進|旅|離開|抵達|歸|道|歩|帰|向こう|振り返/;
/** A line that turns against the one before. */
const TURN = /^(但|卻|可是|然而|不過|只是|而是|でも|だけど|しかし|けど)/;
/** A line that follows from the one before. */
const FOLLOWS = /^(所以|因為|於是|然後|才|就|只好|為什麼|怎麼|還|又|だから|それで|なぜ|どうして)/;

/** Waiting on someone, a thing one cannot let go of: a card on a strap. */
const HANG = /等|惦|牽掛|掛念|懸|繫|放不下|想念|思念|執念|不抽的菸|待って|待つ|恋しい|焦がれ/;
/** Something written down, a story told: paper fed out. */
const LETTER = /信(?!じ)|寫|寫下|紙|日記|故事|筆|那年|從前|小時候|手紙|書い|物語|ノート/;
/** Opening something up: a fold. */
const OPEN_UP = /翻開|翻|打開|攤開|祕密|秘密|往事|心事|章|一頁|那頁|ページ|開いて|秘め/;
/** Remembering, a kept moment: a print. */
const MEMORY = /回憶|記憶|記得|照片|相片|以前|當年|那天|那時|想起|曾經|當初|後來|褪色|思い出|写真|あの日|あの頃|昔/;
/** One thing singled out of many, a day named: a slip drawn from the row. */
const SINGLED = /那一天|某天|這一天|今天|唯一|只有你|選擇|選了|哪一|哪個|挑|每一天|三年|十年|[一二三四五六七八九十兩\d]+[月日歲年]|一天|いつか|今日|選ぶ|ただ一つ/;
/** Calling people in, saying it loud: a band across the frame. */
const SHOUT = /一起|來吧|跟我|大聲|大家|街|喊|宣布|聽好|全部|我們|準備|開始|出發|衝|Let|Go|Hey|みんな|行こう|叫べ|さあ/;
/** A list said item by item: short phrases in a row. */
const ITEMS = /^\S{1,6}[\s，、,]+\S{1,6}[\s，、,]+\S{1,6}|遊戲|輪到|下一個|骨牌|ゲーム/;
/** Sweet, light, looking forward to something: soft type. */
const SWEET = /甜|輕輕|輕飄|飄|軟|棉花|糖|泡泡|氣球|期待|喜歡|可愛|ふわ|甘い|好き|キュン|浮/;

const len = (s: string) => [...s.replace(/\s/g, '')].length;
/** A long line with a break the singer makes and sides of unequal weight: a statement and what it adds. */
const PAGE: Fit = { test: (raw) => {
  const text = spoken(raw);
  const p = /[\s，,、]/.test(text) && cjkOnly(text) ? twoParts(text) : undefined;
  return !!p && Math.min(len(p.head), len(p.tail)) <= 0.62 * Math.max(len(p.head), len(p.tail));
} };
/** Meeting, turning, taking up from the other side: words about a corner, on a line that can turn one. */
const TURNING = /轉|彎|交會|相遇|遇見|遇到|路口|十字|方向|對面|迎|擦肩|擦身|錯過|繞|逆|回頭|背對|すれ違|交差|曲が|角|出会|巡り/;
/** The second half going back on the first. */
const BUT = /^(卻|但|可是|還是|でも|だけど|けれど|それでも)/;
const CORNER: Fit = { test: (raw) => { const c = cornerOf(spoken(raw)); return !!c && (TURNING.test(raw) || BUT.test(c.tail)); } };
/** Two phrases with a word in common: a meeting the line itself makes. */
const CROSSES: Fit = { test: (raw) => !!crossingOf(spoken(raw)) };
/** What is said alone, or left unsent. */
const UNSENT = /備忘|筆記|便條|留言|句話|的話|沒說|沒有說|說不出|不敢說|想說|想對你|告訴你|對你說|心裡話|自言自語|獨白|沒寄|未寄|寄不出|メモ|言えな|伝え|独り言|言葉|ことば|つぶや|呟/;
/** Writing, learning, going back to the first page. */
const FIRST_PAGE = /寫|字|信(?!じ)|稿|學|從頭|重新|第一次|起點|回到|最初|書く|書いて|習う|初めて|もう一度|一から/;
/** One thing after another, a chase. */
const ROUTE: Fit = { test: (raw) => /追|跑|逃|趕|一路|轉眼|接著|穿過|走過|下一|追い|走る|逃げ/.test(raw) && phraseSpans(spoken(raw), 3).length > 1 && cjkOnly(spoken(raw)) };
/** Looking for something, drawing near step by step: a camera that finds the words one phrase at a time. */
const SEEK = /找|尋|靠近|一步|慢慢|漸漸|逐|看見|望著|探|ずつ|探す|近づ|見つけ/;

/** Wind, water, going round: words that come in along a curve. */
const WINDS = /風|吹|河|流|浪|潮|漂|飄|繞|兜|旋|盤旋|蜿蜒|靠近|水面|海|風に|波|渦|巡り/;
/** Something beginning, being let in or uncovered. */
const BEGINS = /開始|開門|打開|推開|門|窗|迎接|歡迎|揭開|揭曉|登場|開場|開幕|第一次|扉|開け|開く|始ま|始め|スタート|ステージ|おいで|ようこそ|明ける|夜明け|誕生/;
/** Said in step: two or three short phrases of like length, the singer's own breaks between them. */
const STEPS: Fit = { test: (raw) => {
  const text = spoken(raw);
  const parts = text.split(/[\s，,、]+/).filter(Boolean).map(len);
  return cjkOnly(text) && parts.length >= 2 && parts.length <= 3 && Math.min(...parts) >= 2 && Math.max(...parts) <= 8 && Math.max(...parts) <= 1.7 * Math.min(...parts);
} };
/** Something welling up, surfacing, waking. */
const SURFACES = /浮現|浮起|醒|湧|升起|淚|眼淚|心底|夢|日出|天亮|黎明|目覚|浮か|溢れ|涙|あふれ/;
/** Out of nowhere, a word thrown in. */
const SUDDEN = /突然|忽然|瞬間|一下子|偏偏|竟然|居然|馬上|立刻|乾脆|不料|喂|欸|嘿|哼|いきなり|急に|ふいに|すぐ/;
/** Things coming to one point: being sure at last. */
const SEATS = /就是|確定|一定|終於|答案|肯定|絕對|認定|聚集|合而為一|誓|必ず|絶対|きっと|ついに|やっと|確かに|決ま|本物|答え/;
/** Seeing it, the other side coming round. */
const TURNS_OVER = /明白|懂了|醒悟|覺悟|看清|看穿|真相|恍然|原來|才知道|其實|變成|變了|切換|転換|分かった|わかった|気づ|気付|見違え|変わ|かわる|本当|ほんと/;
/** Not known yet, or a message getting through. */
const UNCLEAR = /訊息|消息|收到|傳來|聽見|不知道|不明白|看不清|算不清|看不見|模糊|猜|迷霧|謎|知らない|届|聞こえ|伝え|わからない|わからん|教えて|おしえて|呼ばれ|見えな/;

/** The other side of a thing, answering it. */
const TURN_FACE = /另一面|換個|反過來|背面|轉身|另一邊|其實|可是你|回答|もう一つ|裏|反対/;
/** Time passing frame by frame, a journey kept. */
const STRIP = /那年|那些年|一幕|一格|畫面|電影|底片|沿途|路上|時光|歲月|旅途|フィルム|映画|場面/;
/** Far off and getting through: a message, meeting again. */
const REACHES = /訊息|傳來|重逢|久別|收到|遠方的|視訊|螢幕|連線|再次|届いた|再会|メッセージ/;
/** Uneasy, not sure, held at a distance: a line that will not sit level. */
const UNEASY = /不安|猶豫|徬徨|疏離|陌生|懷疑|搖擺|不確定|迷惘|迷路|ためら|不安|戸惑|迷い/;

/** Weighing one thing against another: two phrases on one bar. */
const WEIGHS = /比.{1,6}(重要|更|還|好|多|少|重|輕)|值不值|權衡|是.{1,8}還是|柔.*剛|剛.*柔|誰比較|どっち/;
const BALANCE: Fit = { test: (raw) => WEIGHS.test(raw) && !!twoParts(spoken(raw)) };
/** A city at night, a message sent out: a lit band. */
const LIT_BAND = /街|城|夜晚|夜行|夜車|車站|列車|捷運|廣播|公告|霓虹|終電|駅|夜の街|メッセージ/;
/** Standing one's ground: type with weight to it. */
const WEIGHTY = /不屈|不倒|絕不|一定|堅持|無敵|正氣|鐵|硬|沉重|壓力|負擔|硬底子|負けない|貫く|重い/;
/** A small light in the dark. */
const LIT_EDGE = /光|星|燈|亮|月|黎明|希望|黑夜|夜|螢|灯|星空|ひかり/;
/** Water, or looking back at oneself. */
const STILL_WATER = /水|河|湖|海|橋|倒影|鏡|映|身影|自己|影子|水面|鏡|湖|川|影/;

/** A welcome, a stage, something to celebrate. */
const WELCOME = /歡迎|舞台|慶祝|登場|開場|生日|恭喜|ようこそ|ステージ|おめでとう/;
/** Holding on to something said: a ring round the line. */
const KEEPS = /珍惜|記住|唯一|寶貝|最愛|只有你|這句話|大切|宝物/;
/** A promise, signing off. */
const SEALS = /承諾|答應|約定|誓|保證|簽下|約束|約束|約束する|約束/;

/** Building to a declaration. */
const DECLARES = /決心|宣言|宣告|我要|我會|一定要|絕不|永遠|發誓|從今|從現在|誰也|決める|宣言|誓う/;

/** The most characters an arc carries: past this it is a thread of tiny type. */
const ARC_MAX = 10;

export const RECIPES: Recipe[] = [
  { id: 'lights-soft', level: 0, template: 'lyric-carrier', sides: ['center', 'left', 'right'], enter: 'frame-run', exit: 'fade', idle: 'frame-lights', method: 'color', mark: 'color', min: 2, max: 14, fit: WELCOME, spare: 0.7 },
  { id: 'steps-plain', level: 1, template: 'stack', sides: ['left', 'right'], enter: 'scale-steps', exit: 'rise', idle: 'still', method: 'color', mark: 'color', min: 3, max: 14, fit: DECLARES, spare: 0.6 },
  { id: 'steps-hit', level: 2, template: 'punch', sides: ['center'], enter: 'scale-steps', exit: 'collapse', idle: 'still', method: 'color', mark: 'color', min: 3, max: 16, fit: DECLARES, spare: 0.6, params: { keywordWidth: 0.92 } },
  { id: 'lights-plain', level: 1, template: 'lyric-carrier', sides: ['center', 'left', 'right'], enter: 'frame-run', exit: 'rise', idle: 'frame-lights', method: 'color', mark: 'color', min: 2, max: 14, fit: WELCOME, spare: 0.7 },
  { id: 'lights-hit', level: 2, template: 'lyric-carrier', sides: ['center', 'right', 'left'], enter: 'frame-run', exit: 'dash', idle: 'frame-lights', method: 'color', mark: 'color', min: 2, max: 14, fit: WELCOME, spare: 0.7 },
  { id: 'balance-soft', level: 0, template: 'balance-line', sides: ['center'], enter: 'balance-seat', exit: 'fade', idle: 'balance-rest', method: 'color', mark: 'color', min: 6, max: 18, fit: BALANCE, spare: 0.5 },
  { id: 'balance-plain', level: 1, template: 'balance-line', sides: ['center'], enter: 'balance-seat', exit: 'rise', idle: 'balance-rest', method: 'color', mark: 'color', min: 6, max: 18, fit: BALANCE, spare: 0.5 },
  { id: 'dot-soft', level: 0, template: 'dot-display', sides: ['center', 'left', 'right'], enter: 'display-feed', exit: 'display-off', idle: 'still', method: 'color', mark: 'color', min: 3, max: 10, fit: LIT_BAND, spare: 1.1 },
  { id: 'dot-plain', level: 1, template: 'dot-display', sides: ['center', 'right', 'left'], enter: 'display-feed', exit: 'display-off', idle: 'still', method: 'color', mark: 'color', min: 3, max: 10, fit: LIT_BAND, spare: 1.1 },
  { id: 'block-plain', level: 1, template: 'punch', sides: ['center'], enter: 'snapin', exit: 'fade', idle: 'side-light', method: 'mark', mark: 'mark', state: 'block', min: 3, max: 16, fit: WEIGHTY, spare: 0.2, params: { keywordWidth: 0.92 } },
  { id: 'block-hit', level: 2, template: 'punch', sides: ['center'], enter: 'snapin', exit: 'rise', idle: 'side-light', method: 'color', mark: 'color', state: 'block', min: 3, max: 18, fit: WEIGHTY, spare: 0.2, params: { keywordWidth: 0.92 } },
  { id: 'edge-soft', level: 0, template: 'punch', sides: ['center'], enter: 'edge-light', exit: 'fade', idle: 'ink-state', method: 'color', mark: 'color', state: 'edge', min: 3, max: 12, fit: LIT_EDGE, spare: 0.7, params: { keywordWidth: 0.92 } },
  { id: 'edge-plain', level: 1, template: 'punch', sides: ['center'], enter: 'edge-light', exit: 'rise', idle: 'ink-state', method: 'color', mark: 'color', state: 'edge', min: 3, max: 12, fit: LIT_EDGE, spare: 0.7, params: { keywordWidth: 0.92 } },
  { id: 'mirror-soft', level: 0, template: 'punch', sides: ['center'], enter: 'fade', exit: 'fade', idle: 'reflection-rest', method: 'color', mark: 'color', min: 3, max: 14, fit: STILL_WATER, spare: 0.4, params: { keywordWidth: 0.92 } },
  { id: 'mirror-plain', level: 1, template: 'punch', sides: ['center'], enter: 'rise', exit: 'fade', idle: 'reflection-rest', method: 'color', mark: 'color', min: 3, max: 14, fit: STILL_WATER, spare: 0.4, params: { keywordWidth: 0.92 } },
  { id: 'vert-ink', level: 0, template: 'vertical', sides: ['right', 'left'], enter: 'ink', exit: 'fade', idle: 'drift', method: 'color', max: 22 },
  { id: 'vert-focus', level: 0, template: 'vertical', sides: ['left', 'right', 'center'], enter: 'focus', exit: 'fade', idle: 'float', method: 'weight', max: 22 },
  { id: 'ribbon-soft', level: 0, template: 'ribbon', sides: ['center'], enter: 'fade', exit: 'fade', idle: 'wave', method: 'color', mark: 'color', min: 5, max: 14 },
  { id: 'stair-wipe', level: 0, template: 'stair', sides: ['left', 'right'], enter: 'wipe', exit: 'fade', idle: 'drift', method: 'mark' },
  { id: 'couplet-rise', level: 0, template: 'couplet', sides: ['center'], enter: 'rise', exit: 'rise', idle: 'float', method: 'color', min: 8 },
  { id: 'quote-settle', level: 0, template: 'quote', sides: ['center'], enter: 'settle', exit: 'fade', idle: 'push', method: 'mark' },
  { id: 'hand-ink', level: 0, template: 'handwrite', sides: ['left', 'center'], enter: 'ink', exit: 'fade', idle: 'still', method: 'mark', max: 18 },
  { id: 'build-soft', level: 0, template: 'build-cut', sides: ['center'], enter: 'cut', exit: 'fade', idle: 'still', method: 'color', min: 7, params: { soft: true } },
  { id: 'build-calm', level: 1, template: 'build-cut', sides: ['center'], enter: 'cut', exit: 'fade', idle: 'still', method: 'color', min: 7, params: { soft: true } },
  { id: 'build-mid', level: 1, template: 'build-cut', sides: ['center'], enter: 'cut', exit: 'collapse', idle: 'still', method: 'color', min: 7 },
  { id: 'orbit-spread', level: 1, template: 'orbit', sides: ['center'], enter: 'spread', exit: 'fade', idle: 'still', method: 'color', min: 4, max: ARC_MAX },
  { id: 'ribbon-rise', level: 1, template: 'ribbon', sides: ['center'], enter: 'rise', exit: 'fade', idle: 'wave', method: 'color', mark: 'color', min: 5, max: 14 },
  { id: 'quote-flap', level: 1, template: 'quote', sides: ['center'], enter: 'flap', exit: 'shrink', idle: 'still', method: 'mark', max: 16 },
  { id: 'stair-dash', level: 1, template: 'stair', sides: ['left', 'right'], enter: 'dash', exit: 'dash', idle: 'push', method: 'scale' },
  { id: 'stair-slice', level: 1, template: 'stair', sides: ['right', 'left'], enter: 'slice', exit: 'split', idle: 'drift', method: 'box' },
  { id: 'couplet-flip', level: 1, template: 'couplet', sides: ['center'], enter: 'flip', exit: 'shrink', idle: 'wave', method: 'color', min: 8 },
  { id: 'stack-rise', level: 1, template: 'stack', sides: ['left', 'right'], enter: 'rise', exit: 'rise', idle: 'hop', method: 'color' },
  { id: 'vert-drop', level: 1, template: 'vertical', sides: ['right', 'left', 'center'], enter: 'drop', exit: 'drop', idle: 'push', method: 'scale', max: 12 },
  { id: 'quote-pop', level: 1, template: 'quote', sides: ['center'], enter: 'pop', exit: 'shrink', idle: 'wave', method: 'mark' },
  { id: 'punch-zoom', level: 1, template: 'punch', sides: ['center'], enter: 'zoom', exit: 'zoom', idle: 'thump', method: 'scale', max: 20 },
  { id: 'stair-snap', level: 1, template: 'stair', sides: ['left', 'right'], enter: 'snapin', exit: 'collapse', idle: 'push', method: 'color' },
  { id: 'punch-rip', level: 1, template: 'punch', sides: ['center'], enter: 'rip', exit: 'collapse', idle: 'still', method: 'scale', max: 20, params: { keywordWidth: 0.92 } },
  { id: 'punch-slam', level: 2, template: 'punch', sides: ['center'], enter: 'slam', exit: 'burst', idle: 'thump', method: 'scale', max: 22 },
  { id: 'build-hit', level: 2, template: 'build-cut', sides: ['center'], enter: 'cut', exit: 'collapse', idle: 'still', method: 'color', min: 6 },
  { id: 'punch-snap', level: 2, template: 'punch', sides: ['center'], enter: 'snapin', exit: 'collapse', idle: 'climb', method: 'scale', max: 24, params: { keywordWidth: 0.92 } },
  { id: 'punch-rip-hit', level: 2, template: 'punch', sides: ['center'], enter: 'rip', exit: 'split', idle: 'shake', method: 'color', max: 22, params: { keywordWidth: 0.92 } },
  { id: 'stair-rip', level: 2, template: 'stair', sides: ['left', 'right'], enter: 'rip', exit: 'collapse', idle: 'still', method: 'box' },
  { id: 'punch-windup', level: 2, template: 'punch', sides: ['center'], enter: 'windup', exit: 'shatter', idle: 'shake', method: 'color', max: 22 },
  { id: 'beat-cut', level: 2, template: 'beat-cut', sides: ['center'], enter: 'cut', exit: 'cut', idle: 'thump', method: 'color', min: 5 },
  { id: 'stack-squash', level: 2, template: 'stack', sides: ['left', 'right'], enter: 'squash', exit: 'drop', idle: 'thump', method: 'scale' },
  { id: 'scatter-gather', level: 2, template: 'scatter', sides: ['center'], enter: 'gather', exit: 'domino', idle: 'hop', method: 'color', max: 16 },
  { id: 'stair-dash-hit', level: 2, template: 'stair', sides: ['right', 'left'], enter: 'dash', exit: 'slash', idle: 'shake', method: 'box' },
  { id: 'tag-soft', level: 0, template: 'lyric-carrier', sides: ['left', 'right'], enter: 'cut', exit: 'fade', idle: 'still', method: 'color', mark: 'color', min: 2, max: 16, fit: IDENTITY, spare: 0.5 },
  { id: 'tag-plain', level: 1, template: 'lyric-carrier', sides: ['left', 'right', 'center'], enter: 'cut', exit: 'rise', idle: 'still', method: 'color', mark: 'color', min: 2, max: 16, fit: IDENTITY, spare: 0.5 },
  { id: 'tag-hit', level: 2, template: 'lyric-carrier', sides: ['center', 'right', 'left'], enter: 'cut', exit: 'dash', idle: 'still', method: 'color', mark: 'color', min: 2, max: 14, fit: IDENTITY, spare: 0.4 },
  { id: 'band-short', level: 1, template: 'stack', sides: ['left', 'right'], enter: 'band-in', exit: 'fade', idle: 'still', method: 'color', min: 3, max: 12, fit: DECIDE, spare: 0.5 },
  { id: 'band-hit', level: 2, template: 'punch', sides: ['center'], enter: 'band-in', exit: 'collapse', idle: 'still', method: 'scale', min: 3, max: 14, fit: DECIDE, spare: 0.5, params: { keywordWidth: 0.92 } },
  { id: 'matrix-rows', level: 1, template: 'stair', sides: ['left', 'right'], enter: 'matrix-light', exit: 'fade', idle: 'ink-state', method: 'color', mark: 'color', state: 'dots', min: 4, max: 20, fit: ELECTRIC, spare: 0.6 },
  { id: 'matrix-hit', level: 2, template: 'stack', sides: ['left', 'right'], enter: 'matrix-light', exit: 'cut', idle: 'ink-state', method: 'color', mark: 'color', state: 'dots', min: 4, max: 18, fit: ELECTRIC, spare: 0.6 },
  { id: 'outline-hold', level: 1, template: 'quote', sides: ['center'], enter: 'pop', exit: 'shrink', idle: 'ink-state', method: 'color', mark: 'color', state: 'outline', min: 3, max: 10, fit: ELECTRIC, spare: 0.3 },
  { id: 'split-pair', level: 1, template: 'contrast-split', sides: ['center'], enter: 'cut', exit: 'fade', idle: 'still', method: 'color', mark: 'color', min: 4, max: 18, fit: PAIR, spare: 0.6 },
  { id: 'split-hit', level: 2, template: 'contrast-split', sides: ['center'], enter: 'cut', exit: 'fade', idle: 'still', method: 'color', mark: 'color', min: 4, max: 16, fit: PAIR, spare: 0.5 },
  { id: 'hang-soft', level: 0, template: 'lyric-carrier', sides: ['left', 'right', 'center'], enter: 'tether-drop', exit: 'fade', idle: 'tether-settle', method: 'color', mark: 'color', min: 2, max: 14, fit: HANG, world: true, spare: 0.7 },
  { id: 'hang-plain', level: 1, template: 'lyric-carrier', sides: ['right', 'left'], enter: 'tether-drop', exit: 'drop', idle: 'tether-settle', method: 'color', mark: 'color', min: 2, max: 14, fit: HANG, world: true, spare: 0.7 },
  { id: 'feed-soft', level: 0, template: 'paper-feed', sides: ['left', 'right', 'center'], enter: 'paper-feed', exit: 'fade', idle: 'still', method: 'color', mark: 'color', min: 5, max: 22, fit: LETTER, world: true, spare: 0.7 },
  { id: 'feed-plain', level: 1, template: 'paper-feed', sides: ['right', 'left', 'center'], enter: 'paper-feed', exit: 'rise', idle: 'still', method: 'color', mark: 'color', min: 5, max: 22, fit: LETTER, world: true, spare: 0.7 },
  { id: 'fold-soft', level: 0, template: 'lyric-carrier', sides: ['center', 'left', 'right'], enter: 'fold-open', exit: 'fold-close', idle: 'still', method: 'color', mark: 'color', min: 3, max: 18, fit: OPEN_UP, world: true, spare: 0.9 },
  { id: 'fold-plain', level: 1, template: 'lyric-carrier', sides: ['center', 'right', 'left'], enter: 'fold-open', exit: 'fold-close', idle: 'still', method: 'color', mark: 'color', min: 3, max: 18, fit: OPEN_UP, world: true, spare: 0.9 },
  { id: 'card-soft', level: 0, template: 'memory-card', sides: ['left', 'right', 'center'], enter: 'card-develop', exit: 'fade', idle: 'still', method: 'color', mark: 'color', min: 3, max: 18, fit: MEMORY, world: true, spare: 0.8 },
  { id: 'card-plain', level: 1, template: 'memory-card', sides: ['right', 'left', 'center'], enter: 'card-land', exit: 'drop', idle: 'still', method: 'color', mark: 'color', min: 3, max: 18, fit: MEMORY, world: true, spare: 0.6 },
  { id: 'index-soft', level: 0, template: 'index-pull', sides: ['center'], enter: 'index-lift', exit: 'fade', idle: 'still', method: 'color', mark: 'color', min: 3, max: 18, fit: SINGLED, spare: 0.8 },
  { id: 'index-plain', level: 1, template: 'index-pull', sides: ['center'], enter: 'index-lift', exit: 'drop', idle: 'still', method: 'color', mark: 'color', min: 3, max: 18, fit: SINGLED, spare: 0.8 },
  { id: 'band-stick', level: 1, template: 'lyric-band', sides: ['left', 'right', 'center'], enter: 'band-stick', exit: 'dash', idle: 'still', method: 'color', mark: 'color', min: 3, max: 18, fit: SHOUT, spare: 0.5 },
  { id: 'band-cross', level: 2, template: 'lyric-band', sides: ['center', 'left', 'right'], enter: 'band-stick', exit: 'dash', idle: 'still', method: 'color', mark: 'color', min: 3, max: 16, fit: SHOUT, spare: 0.5, params: { cross: true } },
  { id: 'panels-plain', level: 1, template: 'phrase-panels', sides: ['center'], enter: 'panel-flip', exit: 'shrink', idle: 'still', method: 'color', mark: 'color', min: 5, max: 20, fit: ITEMS, spare: 0.6 },
  { id: 'panels-hit', level: 2, template: 'phrase-panels', sides: ['center'], enter: 'panel-flip', exit: 'rise', idle: 'still', method: 'color', mark: 'color', min: 5, max: 20, fit: ITEMS, spare: 0.6 },
  { id: 'soft-quiet', level: 0, template: 'punch', sides: ['center'], enter: 'soft-float', exit: 'fade', idle: 'still', method: 'color', mark: 'color', state: 'soft', min: 2, max: 12, fit: SWEET, spare: 0.7, params: { keywordWidth: 0.92 } },
  { id: 'soft-mid', level: 1, template: 'punch', sides: ['center'], enter: 'soft-float', exit: 'rise', idle: 'still', method: 'color', mark: 'color', state: 'soft', min: 2, max: 14, fit: SWEET, spare: 0.7, params: { keywordWidth: 0.92 } },
  { id: 'page-soft', level: 0, template: 'editorial', sides: ['left', 'right'], enter: 'fade', exit: 'fade', idle: 'still', method: 'color', mark: 'color', min: 10, max: 24, fit: PAGE, spare: 0.4 },
  { id: 'page-plain', level: 1, template: 'editorial', sides: ['left', 'right'], enter: 'wipe', exit: 'rise', idle: 'still', method: 'color', mark: 'color', min: 10, max: 24, fit: PAGE, spare: 0.4 },
  { id: 'page-hit', level: 2, template: 'editorial', sides: ['left', 'right'], enter: 'snapin', exit: 'collapse', idle: 'still', method: 'color', mark: 'color', min: 10, max: 24, fit: PAGE, spare: 0.3 },
  { id: 'corner-soft', level: 0, template: 'corner-anchor', sides: ['center'], enter: 'fade', exit: 'fade', idle: 'still', method: 'color', mark: 'color', min: 5, max: 18, fit: CORNER, spare: 0.5 },
  { id: 'corner-plain', level: 1, template: 'corner-anchor', sides: ['center'], enter: 'wipe', exit: 'fade', idle: 'still', method: 'color', mark: 'color', min: 5, max: 18, fit: CORNER, spare: 0.5 },
  { id: 'corner-hit', level: 2, template: 'corner-anchor', sides: ['center'], enter: 'snapin', exit: 'collapse', idle: 'still', method: 'color', mark: 'color', min: 5, max: 18, fit: CORNER, spare: 0.4 },
  { id: 'cross-soft', level: 0, template: 'cross-anchor', sides: ['center'], enter: 'fade', exit: 'fade', idle: 'still', method: 'color', mark: 'color', min: 6, max: 18, fit: CROSSES, spare: 0.5 },
  { id: 'cross-plain', level: 1, template: 'cross-anchor', sides: ['center'], enter: 'wipe', exit: 'fade', idle: 'still', method: 'color', mark: 'color', min: 6, max: 18, fit: CROSSES, spare: 0.5 },
  { id: 'cross-hit', level: 2, template: 'cross-anchor', sides: ['center'], enter: 'snapin', exit: 'collapse', idle: 'still', method: 'color', mark: 'color', min: 6, max: 18, fit: CROSSES, spare: 0.4 },
  { id: 'note-soft', level: 0, template: 'note-panel', sides: ['left', 'right', 'center'], enter: 'cut', exit: 'fade', idle: 'still', method: 'color', mark: 'color', min: 3, max: 20, fit: UNSENT, world: true, spare: 0.5 },
  { id: 'note-plain', level: 1, template: 'note-panel', sides: ['right', 'left', 'center'], enter: 'cut', exit: 'rise', idle: 'still', method: 'color', mark: 'color', min: 3, max: 20, fit: UNSENT, world: true, spare: 0.5 },
  { id: 'grid-soft', level: 0, template: 'phrase-grid', sides: ['center'], enter: 'cell-land', exit: 'fade', idle: 'still', method: 'color', mark: 'color', min: 4, max: 16, fit: FIRST_PAGE, spare: 0.7 },
  { id: 'grid-plain', level: 1, template: 'phrase-grid', sides: ['center'], enter: 'cell-land', exit: 'fade', idle: 'still', method: 'color', mark: 'color', min: 4, max: 16, fit: FIRST_PAGE, spare: 0.7 },
  { id: 'route-plain', level: 1, template: 'panel-route', sides: ['center'], enter: 'cut', exit: 'fade', idle: 'still', method: 'color', mark: 'color', min: 6, max: 20, fit: ROUTE, spare: 1.3 },
  { id: 'route-hit', level: 2, template: 'panel-route', sides: ['center'], enter: 'cut', exit: 'fade', idle: 'still', method: 'color', mark: 'color', min: 6, max: 20, fit: ROUTE, spare: 1.3 },
  { id: 'curve-soft', level: 0, template: 'stair', sides: ['left', 'right'], enter: 'curve-arrive', exit: 'fade', idle: 'still', method: 'color', mark: 'color', min: 3, max: 14, fit: WINDS, spare: 0.8 },
  { id: 'curve-plain', level: 1, template: 'stair', sides: ['left', 'right'], enter: 'curve-arrive', exit: 'rise', idle: 'still', method: 'color', mark: 'color', min: 3, max: 16, fit: WINDS, spare: 0.8 },
  { id: 'open-plain', level: 1, template: 'punch', sides: ['center'], enter: 'panel-open', exit: 'fade', idle: 'still', method: 'color', mark: 'color', min: 4, max: 16, fit: BEGINS, spare: 0.7, params: { keywordWidth: 0.92 } },
  { id: 'open-hit', level: 2, template: 'punch', sides: ['center'], enter: 'panel-open', exit: 'shrink', idle: 'still', method: 'color', mark: 'color', min: 4, max: 16, fit: BEGINS, spare: 0.7, params: { keywordWidth: 0.92 } },
  { id: 'mark-plain', level: 1, template: 'stair', sides: ['left', 'right'], enter: 'phrase-mark', exit: 'fade', idle: 'still', method: 'color', mark: 'color', min: 5, max: 20, fit: STEPS, spare: 0.8 },
  { id: 'mark-hit', level: 2, template: 'stack', sides: ['left', 'right'], enter: 'phrase-mark', exit: 'rise', idle: 'still', method: 'color', mark: 'color', min: 5, max: 20, fit: STEPS, spare: 0.8 },
  { id: 'wave-soft', level: 0, template: 'stack', sides: ['left', 'right'], enter: 'wave-reveal', exit: 'fade', idle: 'still', method: 'color', mark: 'color', min: 3, max: 16, fit: SURFACES, spare: 0.7 },
  { id: 'wave-plain', level: 1, template: 'stack', sides: ['left', 'right'], enter: 'wave-reveal', exit: 'fade', idle: 'still', method: 'color', mark: 'color', min: 3, max: 16, fit: SURFACES, spare: 0.7 },
  { id: 'throw-plain', level: 1, template: 'punch', sides: ['center'], enter: 'corner-land', exit: 'shrink', idle: 'still', method: 'color', mark: 'color', min: 3, max: 18, fit: SUDDEN, spare: 0.5, params: { keywordWidth: 0.92 } },
  { id: 'throw-card', level: 1, template: 'lyric-carrier', sides: ['left', 'right', 'center'], enter: 'corner-land', exit: 'rise', idle: 'still', method: 'color', mark: 'color', min: 2, max: 14, fit: SUDDEN, spare: 0.5 },
  { id: 'throw-hit', level: 2, template: 'punch', sides: ['center'], enter: 'corner-land', exit: 'collapse', idle: 'still', method: 'color', mark: 'color', min: 3, max: 18, fit: SUDDEN, spare: 0.5, params: { keywordWidth: 0.92 } },
  { id: 'seat-plain', level: 1, template: 'stack', sides: ['left', 'right'], enter: 'outline-seat', exit: 'fade', idle: 'still', method: 'color', mark: 'color', min: 3, max: 12, fit: SEATS, spare: 0.6 },
  { id: 'seat-hit', level: 2, template: 'punch', sides: ['center'], enter: 'outline-seat', exit: 'collapse', idle: 'still', method: 'color', mark: 'color', min: 3, max: 12, fit: SEATS, spare: 0.6, params: { keywordWidth: 0.92 } },
  { id: 'slat-plain', level: 1, template: 'stair', sides: ['left', 'right'], enter: 'slat-face', exit: 'fade', idle: 'still', method: 'color', mark: 'color', min: 4, max: 16, fit: TURNS_OVER, spare: 0.7 },
  { id: 'slat-hit', level: 2, template: 'punch', sides: ['center'], enter: 'slat-face', exit: 'collapse', idle: 'still', method: 'color', mark: 'color', min: 4, max: 16, fit: TURNS_OVER, spare: 0.7, params: { keywordWidth: 0.92 } },
  { id: 'box-soft', level: 0, template: 'turn-box', sides: ['center', 'left', 'right'], enter: 'box-turn', exit: 'box-turn', idle: 'still', method: 'color', mark: 'color', min: 3, max: 16, fit: TURN_FACE, spare: 1.1 },
  { id: 'box-plain', level: 1, template: 'turn-box', sides: ['center', 'right', 'left'], enter: 'box-turn', exit: 'box-turn', idle: 'still', method: 'color', mark: 'color', min: 3, max: 16, fit: TURN_FACE, spare: 1.1 },
  { id: 'strip-soft', level: 0, template: 'frame-feed', sides: ['center', 'left', 'right'], enter: 'frame-advance', exit: 'frame-advance', idle: 'still', method: 'color', mark: 'color', min: 3, max: 14, fit: STRIP, world: true, spare: 1 },
  { id: 'strip-plain', level: 1, template: 'frame-feed', sides: ['center', 'right', 'left'], enter: 'frame-advance', exit: 'frame-advance', idle: 'still', method: 'color', mark: 'color', min: 3, max: 14, fit: STRIP, world: true, spare: 1 },
  { id: 'dive-soft', level: 0, template: 'lightbox-entry', sides: ['center'], enter: 'frame-dive', exit: 'fade', idle: 'still', method: 'color', mark: 'color', min: 3, max: 16, fit: REACHES, spare: 0.8 },
  { id: 'dive-plain', level: 1, template: 'lightbox-entry', sides: ['center'], enter: 'frame-dive', exit: 'rise', idle: 'still', method: 'color', mark: 'color', min: 3, max: 16, fit: REACHES, spare: 0.8 },
  { id: 'grain-plain', level: 1, template: 'stack', sides: ['left', 'right'], enter: 'grain-resolve', exit: 'fade', idle: 'still', method: 'color', mark: 'color', min: 3, max: 16, fit: UNCLEAR, spare: 0.7 },
  { id: 'grain-hit', level: 2, template: 'stack', sides: ['left', 'right'], enter: 'grain-resolve', exit: 'cut', idle: 'still', method: 'color', mark: 'color', min: 3, max: 16, fit: UNCLEAR, spare: 0.7 },
];

/** Two or three lines of one thought, in one shot: the older stays up, second in rank, while the next lands. */
export type PairKind = 'list' | 'reply' | 'chat';
const PAIR_RECIPE: Record<PairKind, Recipe> = {
  list: { id: 'pair-list', level: 1, template: 'stack', sides: ['center'], enter: 'wipe', exit: 'fade', idle: 'still', method: 'color', params: { pair: true } },
  reply: { id: 'pair-reply', level: 1, template: 'couplet', sides: ['center'], enter: 'wipe', exit: 'fade', idle: 'still', method: 'color' },
  chat: { id: 'pair-chat', level: 1, template: 'reply-thread', sides: ['center'], enter: 'cut', exit: 'fade', idle: 'still', method: 'color' },
};

/** Emphasis by tension, chosen per line: a recipe fixes how the line moves, not how its word is marked. */
const MARKS: Record<Level, string[]> = { 0: ['color', 'mark', 'weight'], 1: ['scale', 'box', 'mark', 'color'], 2: ['scale', 'box', 'shake', 'color'] };
/** The line's own camera by tension: how far it travels while it is up. */
const TEXT_CAMS: Record<Level, TextCamKind[]> = { 0: ['push', 'rise', 'slide'], 1: ['push', 'slide', 'pull', 'tilt'], 2: ['pull', 'tilt', 'slide', 'push'] };

/** Background moves by tension, none that needs picked words: these are what the song's reading chooses among. */
export const BACKGROUNDS: Record<Level, string[]> = {
  0: ['herringbone', 'paper-edge', 'paper-drift', 'soft-rings', 'deckle', 'overprint', 'crease', 'ledger', 'stitch', 'punched', 'dotscreen', 'washi', 'motes', 'flow', 'rain'],
  1: ['herringbone', 'paper-edge', 'paper-drift', 'soft-rings', 'offcut', 'block', 'washi', 'dotscreen', 'deckle', 'hatch', 'disc', 'overprint', 'ledger', 'punched', 'crease', 'stitch', 'dots', 'flow', 'synth', 'motes'],
  2: ['herringbone', 'paper-edge', 'peel', 'block', 'disc', 'offcut', 'hatch', 'deckle', 'dotscreen', 'rays', 'washi', 'dots', 'synth', 'overprint', 'crease', 'punched', 'ledger'],
};
/** What the reading is told about the composer's own grounds. */
export const GROUND_HELP: Record<string, string> = { herringbone: '人字紋：邊緣斷續的折線（行進、節拍）', 'horizon-light': '角落落日：角落低扁日輪與水面反光（黃昏、海、告別）', 'surface-crack': '釉面裂紋：角落開始的分叉裂紋（破裂、突破）', 'paper-drift': '低重力紙屑：紙屑沿邊緩慢飄（慶祝後、輕盈）', 'fold-mark': '扇形摺片與壓印：角落摺片加歌曲符號（承諾）', 'paper-edge': '常駐撕紙邊：單側撕裂的紙邊（手記、懷舊）', 'soft-rings': '橢圓波紋：字周圍往外擴的細線橢圓（共鳴、水波、聲音傳開）', deckle: '撕紙層：幾層撕邊的紙從畫面一邊疊上來（回憶、層層堆積）', offcut: '裁紙片：角落留下的色紙片（明快、拼貼）', overprint: '套印色版：字後面兩塊錯位的淡色版（安靜、印刷感）', dotscreen: '網點漸層：網點從一邊淡出（復古、印刷）', ledger: '帳本細線：字上下的細線（理性、紀錄）', block: '木刻版：一塊帶墨紋的木刻色塊（有力、手作）', stitch: '縫線：沿畫面邊的縫線（牽絆、手作）', washi: '紙膠帶：角落的紙膠帶（日常、手帳）', punched: '活頁孔：邊上的一排打孔（筆記、記錄）', crease: '摺痕：紙摺過再攤開的淡痕（信、舊紙、安靜）', peel: '撕開的大色紙：一大張紙從一邊撕開（爆發、揭開）', disc: '半圓太陽：線網印的半圓（日出、熱血）', hatch: '手繪斜線：角落的排線（速度、草稿）' };

/** A reading made when the screen moves were on offer still says what it wanted: the paper move nearest in mood. */
const KIN: Record<string, string> = { smoke: 'crease', bokeh: 'dotscreen', bleed: 'deckle', film: 'crease', mirror: 'overprint', ribbon: 'stitch', zones: 'overprint', tear: 'peel', split: 'offcut', duo: 'offcut', boxes: 'hatch', beams: 'peel', beatbg: 'block', crack: 'hatch', bolt: 'block', spiral: 'disc', fill: 'block', stamp: 'disc', invert: 'block', glitch: 'hatch' };
/** From each level's pool, the moves that stay out of the way: a layout with a shape of its own is what the line is about. */
export const QUIET_BACKGROUNDS: Record<Level, string[]> = {
  0: ['overprint', 'crease', 'motes', 'stitch', 'ledger', 'soft-rings', 'paper-edge', 'herringbone'],
  1: ['overprint', 'crease', 'ledger', 'stitch', 'punched', 'dotscreen', 'soft-rings', 'paper-edge', 'herringbone'],
  2: ['overprint', 'crease', 'dotscreen', 'punched', 'ledger', 'paper-edge'],
};
const CAMS: Record<Level, string[]> = { 0: ['dolly', 'pan', 'tilt', 'crane'], 1: ['pan', 'dolly', 'snap', 'tilt', 'rack'], 2: ['snap', 'shake', 'roll', 'ramp', 'vertigo'] };
const LINE_TRANSITIONS: Record<Level, string[]> = { 0: ['blurdissolve', 'defocus', 'dipwhite'], 1: ['push', 'whip', 'blinds', 'barndoor'], 2: ['whip', 'burst', 'shakecut', 'spinzoom', 'crosszoom', 'domino'] };
export const composeTransitions = (l: Level) => [...LINE_TRANSITIONS[l], ...PART_TRANSITIONS[l]];
const PART_TRANSITIONS: Record<Level, string[]> = { 0: ['dipwhite', 'ripple', 'wave'], 1: ['diagonal', 'brush', 'pagecurl', 'barndoor', 'iris', 'circle'], 2: ['impact', 'shatter', 'zoomin', 'stripes'] };

/** Line motions that read as a gimmick in a song felt rather than shouted (a decode's junk symbols over a line of grief). */
const NOT_CALM = new Set(['steps-plain', 'lights-plain', 'block-plain', 'box-plain', 'strip-plain', 'dive-plain', 'build-mid', 'orbit-spread', 'quote-flap', 'quote-pop', 'punch-zoom', 'stair-slice', 'punch-rip', 'stair-snap', 'band-short', 'matrix-rows', 'outline-hold', 'split-pair', 'band-stick', 'band-cross', 'panels-plain', 'panels-hit', 'route-plain', 'route-hit', 'open-plain', 'mark-plain', 'throw-plain', 'throw-card', 'seat-plain', 'slat-plain', 'grain-plain']);
export const fitsCalm = (r: Recipe) => !NOT_CALM.has(r.id);

/** The move for this cut: the part's next one under its cap, else the next of the song's pool. The planner past its own cap swaps in whatever comes next in its list (a pie chart under a line of grief), so the cap is kept here. */
export function nextFx(wanted: string[], pool: string[], used: Map<string, number>, cap: number, k: number, last: string | string[]) {
  const back = [last].flat();
  const ok = (f: string) => !back.includes(f) && (used.get(f) ?? 0) < cap;
  const turned = [...pool.slice(k % pool.length), ...pool];
  const pick = [...wanted.slice(k % Math.max(1, wanted.length)), ...wanted, ...turned].find(ok) ?? turned.find((f) => !back.includes(f)) ?? pool[k % pool.length];
  used.set(pick, (used.get(pick) ?? 0) + 1);
  return pick;
}

/** How many cuts must pass before a background comes back: variety the eye gets, not only the song's total. */
const RECENT_FX = 5;

export const PALETTES: Record<string, { ink: string; paper: string; accent: string; heart: string; what: string }> = {
  frost: { ink: '#1E2A3C', paper: '#E8EDF1', accent: '#B5402E', heart: '#7E94AC', what: '冷、雪、失去、思念' },
  dusk: { ink: '#2B1B3D', paper: '#F3D9C4', accent: '#E4572E', heart: '#F2A541', what: '黃昏、懷舊、溫柔' },
  tea: { ink: '#2E2A25', paper: '#EFE6D5', accent: '#7A8B4F', heart: '#B5502F', what: '日常、文學、手作' },
  tide: { ink: '#0E3B43', paper: '#DCEBE6', accent: '#F26B4E', heart: '#2FA3A0', what: '海、夏、清新' },
  wine: { ink: '#3A0F1E', paper: '#F4E3DA', accent: '#D7263D', heart: '#F2B5A7', what: '戀愛、危險、心痛' },
  lacquer: { ink: '#1B1B1E', paper: '#E94F37', accent: '#F6F1E7', heart: '#F2C14E', what: '熱血、武打、街頭、態度' },
  moss: { ink: '#1F3327', paper: '#E7E3C8', accent: '#D9822B', heart: '#A7B84A', what: '自然、民謠、旅程' },
  sugar: { ink: '#3B2352', paper: '#FCE8EE', accent: '#F0528E', heart: '#6C5CE7', what: '可愛、甜、偶像' },
};

/** The palettes a song felt rather than shouted can take on a reroll: the rest are too loud for it. */
const CALM_PALETTES = ['frost', 'dusk', 'tea', 'tide', 'moss', 'wine'];
/**
 * The palette of a reroll: the song's own turns on through the pool, in an order the song fixes, so each press changes it
 * and the same number gives the same colours. Unset: the song's own.
 */
export function rerollPalette(title: string, own: string, calm: boolean, reroll?: number, pool: string[] = calm ? CALM_PALETTES : Object.keys(PALETTES)): string {
  if (reroll === undefined || !pool.length) return own;
  const order = [...pool].sort((a, b) => hash(`${title}:${a}`) - hash(`${title}:${b}`));
  return order[(Math.max(0, order.indexOf(own)) + reroll) % order.length];
}

/** The longest line a ring can be drawn round. */
export const RING_MAX = 12;
/** Chorus leads a song puts up in lights. */
const LEAD_CAP = 2;
/** Dusk, the sea, seeing someone off. */
const DUSK = /黃昏|夕陽|日落|落日|傍晚|海邊|海面|告別|夕焼|夕暮|海辺/;
/** Something breaking. */
const CRACKS = /破碎|碎裂|裂|撕破|決裂|崩潰|割れ|砕|ひび/;
/** Calling out, or setting one thing against another: the accent has somewhere to go. */
const RELAYS = /你.{0,6}我|我.{0,6}你|呼喚|喊|約定|承諾|答應|叫你|呼ぶ|約束/;
const glyphs = (s: string) => [...s.replace(/\s/g, '')].length;
export const charsPerSec = (c: Cue) => glyphs(c.text) / Math.max(0.3, c.end - c.start);
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7) >>> 0;

/** Tension to level: a dense line is never quiet, and a song felt rather than shouted stays out of the loud set. */
export function levelOf(tension: number, cps: number, calm: boolean): Level {
  const base: Level = tension < 0.35 ? 0 : tension < 0.7 ? 1 : 2;
  if (calm) return Math.min(base, 1) as Level;
  return (cps >= 6 ? Math.max(base, 1) : base) as Level;
}

/** A recipe for this line: fits its length and level, unlike the last line's layout and the recent entrances. */
export function pickRecipe(c: Cue, level: Level, recent: Recipe[], seed: number, allow: (r: Recipe) => boolean = () => true, spare = Infinity, world = '', lean: (r: Recipe) => number = () => 0, from: Recipe[] = RECIPES): Recipe {
  const n = glyphs(c.text);
  const fits = (r: Recipe) => r.level === level && n >= (r.min ?? 0) && n <= (r.max ?? Infinity) && allow(r) && spare >= (r.spare ?? 0) && (!r.fit || r.fit.test(c.text) || (!!r.world && r.fit.test(world)));
  const pool = from.filter(fits);
  const own = from.filter((r) => r.level === level && r.wline && !r.fit);
  const use = pool.length ? pool : from !== RECIPES ? (own.length ? own : from.filter((r) => !r.fit)) : RECIPES.filter((r) => r.level === level && r.template === 'stair');
  const score = (r: Recipe) => {
    const age = (f: (x: Recipe) => boolean) => { const i = recent.map(f).lastIndexOf(true); return i < 0 ? 99 : recent.length - i; };
    // (a world's lines all share one template: what must not repeat is the set and the move)
    const shape = (x: Recipe) => x.wline?.set ?? x.template, way = (x: Recipe) => x.wline?.enter ?? x.enter;
    const layout = age((x) => shape(x) === shape(r)), enter = age((x) => way(x) === way(r)), same = age((x) => x.id === r.id);
    // the multi-phrase line is the backbone of the rhythm: it comes up every other line or so when the line can carry it
    return lean(r) + (r.template === 'build-cut' ? 7 : 0) + (r.fit ? 12 : 0) + (layout === 1 ? -100 : Math.min(layout, 5)) * 2 + Math.min(enter, 4) + Math.min(same, 8) + (hash(`${seed}:${c.id}:${r.id}`) % 100) / 100;
  };
  return [...use].sort((a, b) => score(b) - score(a))[0];
}

/** The key phrase of a line when the reading names none: the longest space- or punctuation-separated run. */
export function keyOf(text: string, named?: string) {
  if (named && text.includes(named)) {
    const stops = wordBreaks(text);
    const at = [...text.slice(0, text.indexOf(named))].length;
    const end = at + [...named].length;
    if (stops.has(at) && (stops.has(end) || /[\s，,、。!！?？︕︖…～]/.test([...text][end] ?? ''))) return named;
  }
  const runs = text.split(/[\s,，、。!！?？()（）"「」]+/).filter(Boolean);
  const best = [...runs].sort((a, b) => [...b].length - [...a].length)[0] ?? text;
  if ([...best].length <= 8) return best;
  // the end of a long run, cut at a word: the whole run when it has no word to cut at
  const cs = [...best];
  const stops = [...wordBreaks(best)].filter((b) => b < cs.length && cs.length - b >= 2 && cs.length - b <= 8).sort((a, b) => b - a);
  const from = stops.find((b) => cs.length - b >= 3) ?? stops[0];
  return from === undefined ? best : cs.slice(from).join('');
}

/** Song parts without a reading: the song's own sections as tension, the first sung line of each as its start. */
export function fallbackParts(cues: Cue[], sections: { start: number; end: number; energy: number; type: string }[], calm: boolean): SongPart[] {
  const pool = BACKGROUNDS[calm ? 0 : 1];
  const parts = sections.flatMap((s, i) => {
    const first = cues.find((c) => c.start >= s.start && c.start < s.end);
    return first ? [{ from: first.id, tension: s.energy, fx: [0, 1, 2].map((k) => pool[(i * 3 + k) % pool.length]), what: s.type }] : [];
  });
  return parts.length ? parts : [{ from: cues[0].id, tension: 0.5, fx: pool.slice(0, 3), what: 'song' }];
}

interface ShotOut { id: string; start: number; end: number; cue?: string }

/**
 * The treatment a plan is laid on: only the base's type settings survive. Its language, song signature, moments and
 * peak belong to the song it was directed for (a chorus rail in a dead ink, drop flashes at another song's seconds).
 */
export function composerBase(base: Record<string, any>, plan: { shots: { shot: string; lines: unknown[] }[] }, shots: ShotOut[], p: { ink: string; paper: string; accent: string }, reroll?: number) {
  const proto = base['shots'][0];
  const { language: _lang, signature: _sig, techniques: _tech, ...design } = base['design'];
  const { motif: _motif, moments: _moments, arc: _arc, language: _l2, concept: _c, ...rest } = base;
  return {
    ...rest,
    concept: '',
    moments: [],
    arc: [],
    design: { ...design, composer: true, ...(reroll === undefined ? {} : { reroll }), peak: 'rays', techniques: [], colorScript: [{ start: 0, shadow: p.ink, highlight: p.paper, accent: p.accent, duotone: 0, image: 1 }] },
    styleAnchor: { ...base['styleAnchor'], palette: { ...base['styleAnchor'].palette, background: p.paper, text: p.ink, accent: p.accent } },
    shots: shots.map((s) => ({ ...proto, ...s, cue: undefined, template: 'stair', params: { side: 'left', dim: 0 }, asset: undefined })),
    cues: plan.shots.flatMap((sh) => (sh.lines as { cue: string }[]).map((l) => ({ cueId: l.cue, shot: sh.shot, emphasis: [], enter: 'fade', exit: 'fade', reveal: 'line' }))),
  };
}

/** Layouts that cannot be carried across a handoff: either side of one stays out of these. */
export const FIXED_LAYOUT = new Set(['balance-line', 'dot-display', 'contrast-split', 'counterweight', 'panel-route', 'turn-box', 'frame-feed', 'lightbox-entry']);
/** Entrances that clip against the frame: a camera moving the line under them would slide it out of its mask. */
export const CLIPPED_ENTER = new Set(['band-in', 'matrix-light', 'slice', 'rip', 'rise', 'slot', 'wave-reveal', 'slat-face', 'phrase-mark', 'panel-open', 'corner-land']);
export const RIG_LAYOUT_OUT = new Set(['balance-line', 'dot-display', 'turn-box', 'frame-feed', 'lightbox-entry', 'contrast-split', 'lyric-carrier', 'paper-feed', 'memory-card', 'index-pull', 'lyric-band', 'phrase-panels', 'note-panel', 'corner-anchor', 'cross-anchor', 'phrase-grid', 'counterweight']);
/** Papers a line is laid on. However well a song's words suit them, they are the seasoning: a share of the lines, never two close together. */
export const CARRIERS = new Set(['dot-display', 'turn-box', 'frame-feed', 'lightbox-entry', 'lyric-carrier', 'paper-feed', 'memory-card', 'index-pull', 'lyric-band', 'phrase-panels', 'note-panel']);
export const CARRIER_SHARE = 0.12;
export const CARRIER_APART = 3;
/** Layouts with a shape of their own: the same seasoning rule, counted apart from the papers. */
export const SPATIAL = new Set(['balance-line', 'editorial', 'corner-anchor', 'cross-anchor', 'phrase-grid', 'counterweight', 'panel-route']);
export const SPATIAL_SHARE = 0.12;
/** …and each layout's own share of those, so the one with the commonest fit does not take them all. */
export const LAYOUT_SHARE = 0.05;
/** A layout that is the point of its line: nothing busy runs behind it. */
const OWN_SHAPE = (template: string) => CARRIERS.has(template) || SPATIAL.has(template) || template === 'contrast-split';
/** Each whole-line entrance's share of a song, all of them together, and the lines between two: they mark a line, not a verse. */
export const ARRIVAL_SHARE = 0.04;
export const ARRIVALS_SHARE = 0.1;
export const ARRIVAL_APART = 3;
/** Every distinctive device of a song together, the choruses that bring one back included. */
export const DISTINCT_SHARE = 0.26;
/** Layouts whose glyphs a phrase track can find and that stay put while it calls at them. */
export const TRACKED = new Set(['stair', 'quote', 'punch', 'editorial', 'stack', 'vertical', 'couplet']);
/** Seconds a tracking camera gives each stop. */
const TRACK_STOP = 0.46;
/** Pairs of lines: rare, and never close together. */
export const PAIR_SHARE = 0.06;
export const PAIR_APART = 5;
/** Lines between two handoffs, and each kind's share of the song: a device that comes round on schedule stops meaning anything. */
export const HANDOFF_APART = 4;
export const DEVICE_SHARE = 0.07;

/** A line about the signal dropping or coming back. */
const BROKEN_OFF = /訊號|信號|斷線|失聯|中斷|回訊|收訊|電波|電話|圏外|通信/;
/** Each song's irises at its parts' changes. */
const APERTURE_SHARE = 0.05;

/** Which handoff, if any, the words between two lines ask for. */
export function handoffFor(prev: Cue, next: Cue, turnPart: boolean, calm: boolean, roll: number): HandoffKind | undefined {
  if (FOLLOWS.test(next.text) || prev.text.trim().endsWith('？') || prev.text.trim().endsWith('?')) return 'relay';
  if (OPEN_UP.test(next.text) || (turnPart && MEMORY.test(next.text))) return 'page';
  if (BROKEN_OFF.test(next.text)) return 'signal';
  if (calm) return turnPart && roll % 3 === 0 ? 'aperture' : undefined;
  if (TURN.test(next.text)) return roll % 2 ? 'split' : 'door';
  if (SHOUT.test(next.text)) return 'band';
  if (ITEMS.test(next.text) && ITEMS.test(prev.text)) return 'chain';
  return turnPart ? (['push', 'split', 'door', 'aperture'] as HandoffKind[])[roll % 4] : undefined;
}

/** The handoffs a song can afford: asked for by its words, paid for by neither line's reading, and rare. */
export function planHandoffs(cues: Cue[], beats: LineBeat[], partStarts: Set<string>, calm: boolean, seed: number, force?: Map<string, HandoffKind>, noIris = new Set<string>(), passes = new Set<string>(), onlyForced = false, room = 0): Map<string, Handoff> {
  const out = new Map<string, Handoff>();
  const cap = Math.max(2, Math.ceil(cues.length * DEVICE_SHARE));
  const irisCap = Math.max(1, Math.ceil(cues.length * APERTURE_SHARE));
  let irises = 0;
  let last = -HANDOFF_APART;
  cues.forEach((next, i) => {
    const prev = cues[i - 1];
    if (!prev) return;
    const forced = force?.get(next.id);
    if (onlyForced && !forced) return;
    // (a line shorter than its reading is read ahead of its voice: a handoff would land it too late for that)
    const taken = beats.find((x) => x.id === next.id);
    if (!forced && room && taken && (taken.spare < room || next.end - next.start < taken.need + 0.3)) return;
    const roll = hash(`${seed}:${next.id}:hand`);
    const free = i - last >= HANDOFF_APART && out.size < cap;
    // a part changing is reason enough for the iris, when both lines have the time; else whatever the words ask
    const iris = !forced && free && partStarts.has(next.id) && !noIris.has(next.id) && irises < irisCap && !!handoffTimes('aperture', prev, prev.start - 0.25, 0.45, next, (cues[i + 1]?.start ?? next.end + 2) - 0.3);
    // a change of paper goes between two lines when they leave it the seconds; if not, it is a plain cut
    const kind = forced ?? (passes.has(next.id) ? 'palette' : iris ? 'aperture' : free ? handoffFor(prev, next, partStarts.has(next.id) && !noIris.has(next.id), calm, roll) : undefined);
    if (!kind) return;
    if (kind === 'aperture') irises += 1;
    // the line after shows ahead of its voice: what the renderer gates on is when that line comes up
    const gone = (cues[i + 1]?.start ?? next.end + 2) - 0.3;
    const times = handoffTimes(kind, prev, prev.start - 0.25, 0.45, next, gone);
    if (!times) return;
    out.set(next.id, { kind, ...times, dir: roll % 4 < 2 ? 1 : -1 });
    last = i;
  });
  return out;
}

/** Asks something, and so leaves room for an answer. */
const ASKS = /[？?]\s*$|嗎\s*$|為什麼|是誰|怎麼|哪裡|どこ|なぜ|どうして/;
/** A message rather than a thought: a line that belongs in a thread. */
const MESSAGE = /訊息|簡訊|電話|回覆|回答|答案|已讀|傳給|打給|留言|喂|在嗎|你說|我說|メッセージ|返事|答え|既読|LINE|教えて/;
const norm = (s: string) => spoken(s).replace(/[\s、。,.!?！？「」]/g, '');
/** Two lines starting alike, the shape of a list said item by item (not one line sung twice). */
export const parallel = (a: string, b: string) => {
  const [x, y] = [[...norm(a)], [...norm(b)]];
  return x.length >= 4 && y.length >= 4 && norm(a) !== norm(b) && Math.abs(x.length - y.length) <= 3 && x[0] === y[0] && (x[1] === y[1] || /[一我你他她沒不]/.test(x[0]));
};

/** What relation two neighbouring lines have, if any: told by who sings them and what they say, nothing else. */
export function pairFor(a: Cue, b: Cue, calm: boolean): PairKind | undefined {
  // a word or two each way is an exchange, whatever it is about
  const chats = !calm && (MESSAGE.test(spoken(a.text) + spoken(b.text)) || Math.max(len(spoken(a.text)), len(spoken(b.text))) <= 7);
  if (a.singer && b.singer && a.singer !== b.singer) return chats ? 'chat' : 'reply';
  if (ASKS.test(spoken(a.text)) && !ASKS.test(spoken(b.text))) return chats ? 'chat' : 'reply';
  return parallel(a.text, b.text) ? 'list' : undefined;
}

export interface LinePair { kind: PairKind; also: string[] }

/** The shots lines share: asked for by their words, near enough to read as one thought, away from any handoff, and rare. */
export function planPairs(cues: Cue[], beats: Map<string, LineBeat>, hands: Map<string, Handoff>, calm: boolean, force?: Map<string, PairKind>, forced?: Map<string, string>): Map<string, LinePair> {
  const out = new Map<string, LinePair>();
  const cap = Math.max(1, Math.ceil(cues.length * PAIR_SHARE));
  const named = (id?: string) => !!id && !!forced?.has(id);
  const near = (a: Cue, b?: Cue) => !!b && !named(a.id) && !named(b.id) && b.start - a.end <= 1.2 && len(spoken(a.text)) >= 2 && len(spoken(a.text)) <= 18 && len(spoken(b.text)) <= 18 && norm(a.text) !== norm(b.text) && !hands.has(b.id) && (beats.get(b.id)?.spare ?? 0) >= 0.3;
  const forcedLine = (a: Cue, b: Cue) => !!forced?.has(a.id) || !!forced?.has(b.id);
  let last = -PAIR_APART;
  for (let i = 0; i < cues.length - 1; i++) {
    const [a, b, c] = [cues[i], cues[i + 1], cues[i + 2]];
    const forced = force?.get(a.id);
    // two lines sung too fast to read apart share a shot whatever they say: the older stays up while the next is sung
    if (!forced && !forcedLine(a, b) && setTogether(a, b) && norm(a.text) !== norm(b.text)) {
      out.set(a.id, { kind: 'list', also: [b.id] });
      i += 1;
      last = i;
      continue;
    }
    const kind = forced ?? (i - last >= PAIR_APART && out.size < cap ? pairFor(a, b, calm) : undefined);
    if (!kind || !near(a, b) || hands.has(a.id) || (c && hands.has(c.id))) continue;
    const third = kind === 'list' && near(b, c) && c && pairFor(b, c, calm) === 'list' && !(cues[i + 3] && hands.has(cues[i + 3].id));
    out.set(a.id, { kind, also: third ? [b.id, c.id] : [b.id] });
    i += third ? 2 : 1;
    last = i;
  }
  return out;
}

/** The key phrase's centre in frame px, from where it falls in the line: the camera turns about what the line is about. */
export function targetOf(text: string, key: string): [number, number] {
  const n = Math.max(1, [...text].length);
  const at = text.indexOf(key);
  const middle = at < 0 ? n / 2 : [...text.slice(0, at)].length + [...key].length / 2;
  return [Math.round((middle / n - 0.5) * Math.min(1500, n * 150)), 0];
}

/** The camera for a line that travels: it lands by the first syllable's end, before reading starts, or the line stays put. */
export function rigFor(c: Cue, beat: LineBeat | undefined, key: string, kind: RigKind, dir: number, reach = 1, room = 0.3): CameraRig | undefined {
  if (isTrack(kind)) {
    const stops = phraseSpans(spoken(c.text), 3).length;
    const [start, sec] = [c.start - 0.2, TRACK_STOP * stops + 0.1];
    return stops > 1 && (beat?.spare ?? 0) >= sec + 0.3 ? { kind, from: +start.toFixed(3), to: +(start + sec).toFixed(3), dir, target: [0, 0] } : undefined;
  }
  const [from, to] = [c.start - 0.34, c.start + 0.22];
  return (beat?.spare ?? 0) >= room ? { kind, from: +from.toFixed(3), to: +to.toFixed(3), dir, target: targetOf(c.text, key), reach: +reach.toFixed(2) } : undefined;
}

export interface PlanForce {
  exits?: Map<string, LineExitKind>; recipes?: Map<string, string>; hands?: Map<string, HandoffKind>; rigs?: Map<string, RigKind>; pairs?: Map<string, PairKind>;
  /** A line's own stack, made for it by the paid director (linedirect-core.mts); it stands in place of a named recipe. */
  custom?: Map<string, Recipe>;
  /** Lines the paid director holds: one background for the whole line, however many beats it spans. */
  holds?: Set<string>;
  /** The paid director has judged the song: no chorus lights, no turned-over part, no handoff it did not ask for. */
  director?: boolean;
  /** One-click reroll: another version of the song, the same for the same number. Unset: the song's own plan, as ever. */
  reroll?: number;
  /** A style world: its closed pool is all the plan may draw from. */
  world?: WorldPool;
}

/** All a style world lets the composer draw from: nothing outside it reaches the plan (style-world.ts poolOf). */
export interface WorldPool {
  id: string;
  recipes: Recipe[];
  pairSet: string;
  pairLine: { enters: string[]; exits: string[]; hold: string };
  grounds: Record<Level, string[]>;
  quiet: string[];
  peak: { loud: string; calm: string };
  pieces: string[];
  /** The words that ask for a set piece. */
  pieceWords: Record<string, RegExp>;
  /** The scheme the song opens on. */
  start: number;
  lineIn: Record<Level, string[]>;
  partIn: Record<Level, string[]>;
  cams: Record<Level, string[]>;
  textCams: Record<Level, TextCamKind[]>;
  pace: { every: [number, number, number]; calmEvery: number; repose: boolean; hits: ('tile' | 'zoom')[] };
  flip: 'none' | 'part' | 'peak';
  schemes: number;
  devices: boolean;
  handoffs: boolean;
  columns: Record<string, boolean>;
  /** What happens while a line is held, the world's own two or three (world-shared.ts), and whether in steps. */
  beats?: BeatKind[];
  stepped?: boolean;
  /** How the world stresses a blown-up key word, two ways (world-shared.ts). */
  stress?: StressKind[];
}
/** Each shared recipe's most a world's song may use of its lines (style standard §2.1). */
export const SHARED_SHARE = 0.4;
/** A line changes its set on a beat only if it has this long up, and each set stays this long. */
export const REPOSE_MIN_LINE = 1.5;
export const REPOSE_MIN_HOLD = 0.5;
/**
 * A song felt rather than shouted changes set once a line runs past this, at its word break (2026-11-04: calm songs cut
 * once a line, 3.4 cuts in 10 s against JIZURA's 10.8; Motion Prompt #190 cross-cutting, rebuilt from its description).
 */
export const REPOSE_CALM_LINE = 2;
/** Each calm set stays at least this long; a calm line this long takes two changes. */
export const REPOSE_CALM_HOLD = 0.9;
export const REPOSE_CALM_TWICE = 3.5;
/** A change of set looks for a song beat this near its word break, else lands on the break itself. */
const REPOSE_SNAP = 0.3;
/** Calm stays calm by moving slowly and far: how far a held block travels, px, by level. */
export const LINE_TRAVEL: Record<Level, number> = { 0: 150, 1: 200, 2: 260 };

/** A blown-up key word: this many characters at most, and no more than this share of its line (else it is the line). */
export const BLOW_MAX = 4;
const BLOW_SHARE = 0.6;
/** A line needs this long up for its key word to be blown up: the small rest has to be read too. */
const BLOW_MIN_LINE = 1.4;
/**
 * The key word a line could blow up, as code-point indices of its text, or undefined: the phrase the reading named when
 * it is short enough, else the line's last whole word of two to four characters (where a line usually lands).
 */
export function blowOf(c: Cue, named?: string): { from: number; to: number } | undefined {
  if (c.end - c.start < BLOW_MIN_LINE || splitCalls(c.text).calls.length) return undefined;
  const cs = [...c.text];
  const fits = (from: number, to: number) => { const w = cs.slice(from, to).join(''); const n = glyphs(w); return n >= 2 && n <= BLOW_MAX && n <= BLOW_SHARE * glyphs(c.text) && !/[A-Za-z0-9\s]/.test(w) && /^[\p{L}]+$/u.test(w); };
  const key = keyOf(c.text, named);
  const at = c.text.indexOf(key);
  if (named && key === named && at >= 0) { const from = [...c.text.slice(0, at)].length; if (fits(from, from + [...key].length)) return { from, to: from + [...key].length }; }
  const stops = [...wordBreaks(c.text)].sort((a, b) => a - b);
  for (let k = stops.length - 1; k > 0; k--) for (let j = 0; j < k; j++) if (fits(stops[j], stops[k])) return { from: stops[j], to: stops[k] };
  return undefined;
}

/** A held line's event needs this much line, s. */
export const BEAT_MIN_LINE = 1.5;
/** An event never lands this near a change of set: two things at once read as one muddle. */
const BEAT_CLEAR = 0.35;

/**
 * The one thing that happens while a line is held (world-beats.ts): the world's kinds in turn, never the line before's,
 * on the song beat nearest the middle of the held stretch. One that dims or turns a character waits for the line to be
 * read; the others wait for the entrance. Nothing when the line has no room for one.
 */
export function beatOfLine(c: Cue, kinds: BeatKind[], beats: number[], repose: { at: number }[], last: string, roll: number): { kind: BeatKind; at: number } | undefined {
  if (c.end - c.start < BEAT_MIN_LINE || !kinds.length) return undefined;
  const need = readingSec(c.text, c.start, c.end);
  const order = [...kinds.slice(roll % kinds.length), ...kinds.slice(0, roll % kinds.length)].sort((a, b) => Number(a === last) - Number(b === last));
  for (const kind of order) {
    const m = WORLD_BEATS[kind];
    const from = c.start + (m.hides ? need : Math.min(need, 0.7));
    const to = c.end + 0.1 - m.sec;
    if (to < from) continue;
    const aim = (from + to) / 2;
    const clear = (x: number) => repose.every((r) => Math.abs(r.at - x) >= BEAT_CLEAR && Math.abs(r.at - (x + m.sec)) >= BEAT_CLEAR / 2);
    const at = beats.filter((b) => b >= from && b <= to && clear(b)).sort((a, b) => Math.abs(a - aim) - Math.abs(b - aim))[0] ?? (clear(aim) ? aim : undefined);
    if (at !== undefined) return { kind, at: +at.toFixed(3) };
  }
  return undefined;
}

/** The sets a line moves to while it is sung, each on a beat as near a phrase's end as the beats fall. */
function reposeOf(c: Cue, set: string, W: WorldPool, beat: LineBeat | undefined, beats: number[], level: Level, calm: boolean, roll: (salt: string, n: number) => number) {
  const len0 = c.end - c.start;
  if (!W.pace.repose || (!calm && level === 0 && len0 < REPOSE_MIN_LINE * 1.4) || len0 < (calm ? REPOSE_CALM_LINE : REPOSE_MIN_LINE) || (beat?.spare ?? 0) < 0.2) return [];
  const others = [...new Set(W.recipes.flatMap((r) => (r.wline && r.level === level && r.wline.set !== set && !r.wline.ground && (r.max ?? 99) >= glyphs(c.text) && glyphs(c.text) >= (r.min ?? 0) && (!W.columns[r.wline.set] || !/[A-Za-z0-9]/.test(c.text)) ? [r.wline.set] : [])))];
  if (!others.length) return [];
  const hold = calm ? REPOSE_CALM_HOLD : REPOSE_MIN_HOLD;
  const count = calm ? (len0 >= REPOSE_CALM_TWICE ? 2 : 1) : len0 >= hold * 4.4 ? 2 : 1;
  const n = [...spoken(c.text)].length;
  const spans = phraseSpans(spoken(c.text), count + 1);
  const out: { at: number; set: string }[] = [];
  // a calm line changes where a word ends, at the time that character is sung
  const all = [...c.text];
  const breakTimes = [...wordBreaks(c.text)].filter((k) => k > 0 && k < all.length && /\S/.test(all[k])).map((k) => c.charStarts?.[k] ?? c.start + (len0 * k) / all.length);
  for (let i = 0; i < count; i++) {
    const after = out.at(-1)?.at ?? c.start;
    const even = c.start + (len0 * (i + 1)) / (count + 1);
    const atBreak = calm ? breakTimes.filter((b) => b >= after + hold && b <= c.end - hold).sort((a, b) => Math.abs(a - even) - Math.abs(b - even))[0] : undefined;
    if (calm && atBreak === undefined) break;
    const aim = atBreak ?? c.start + len0 * (spans.length > i + 1 ? spans[i][1] / Math.max(1, n) : (i + 1) / (count + 1));
    const fits = beats.filter((b) => b >= after + hold && b <= c.end - hold && (!calm || Math.abs(b - aim) <= REPOSE_SNAP));
    const at = [...fits].sort((a, b) => Math.abs(a - aim) - Math.abs(b - aim))[0] ?? (aim >= after + hold && aim <= c.end - hold ? aim : undefined);
    if (at === undefined) break;
    out.push({ at: +at.toFixed(3), set: others[(roll('repose', others.length) + i) % others.length] });
  }
  return out;
}

/** One shot per sung line, each running to the next line; a long unsung stretch gets a shot of its own. */
export function shotsOf(cues: Cue[], duration: number, startAt: (c: Cue) => number = (c) => c.start): ShotOut[] {
  const out: ShotOut[] = [];
  const add = (start: number, end: number, cue?: string) => out.push({ id: `L${String(out.length + 1).padStart(3, '0')}`, start: +start.toFixed(3), end: +end.toFixed(3), cue });
  // the validator refuses a shot under half a second: a line that near the top opens at 0
  const intro = cues[0].start >= 0.5;
  if (intro) add(0, cues[0].start);
  cues.forEach((c, i) => {
    const start = i === 0 && !intro ? 0 : startAt(c);
    const next = cues[i + 1] ? startAt(cues[i + 1]) : duration;
    if (next - c.end > 3) { add(start, c.end + 0.6, c.id); add(c.end + 0.6, next); } else add(start, next, c.id);
  });
  return out;
}

/** A reroll's travelling camera: reading starts when it lands, so the line must have that much past its reading. */
const RIG_ROOM = 0.6;

/** The shortest held sound worth a breath, s. */
export const BREATH_MIN = 0.9;
/** Each composer exit's share of a song's lines. */
export const EXIT_SHARE = 0.13;
/** Exits that are the recipe's own idea, not a default to replace. */
export const OWN_EXIT = new Set(['box-turn', 'frame-advance', 'display-off']);
/** Surfaces held by pieces of their own: the drawn exits cut the face away from them. */
export const KEEPS_EXIT = (r: Recipe) => r.state === 'block' || r.state === 'edge' || r.idle === 'reflection-rest';
/** Each small mark's share of a song's lines. */
export const MARK_SHARE = 0.08;
/** What a song's own repeated word can be drawn as. Only a thing the words name, and nothing else stands in for it. */
const ICONS: [SymbolName, RegExp][] = [['flower', /[花櫻梅薔玫桜]/], ['drop', /[雨淚涙]/], ['flame', /[火焰燭]/], ['note', /歌|唱|旋律|メロディ/], ['star', /星/]];
/** The one icon of a song: the thing most lines name, if at least three do; else none at all. */
export function themeIcon(lines: string[]): { symbol: SymbolName; words: RegExp } | undefined {
  const best = ICONS.map(([symbol, words]) => ({ symbol, words, n: lines.filter((l) => words.test(l)).length })).sort((a, b) => b.n - a.n)[0];
  return best.n >= 3 ? best : undefined;
}

/** Which words ask for which way out: an exit means something or the line keeps its own. */
const EXIT_WORDS: [LineExitKind, RegExp][] = [
  ['tile-scatter', /散|拆|碎了|分開|解放|自由|再見|畢業|告別|バラバラ|さよなら|解散/],
  ['glyph-shed', /崩|塌|落空|失去|灰|掉落|碎|沒有了|什麼都|消失|崩れ|失く|こぼれ|砕け/],
  ['wave-dissolve', /夢|累|疲|淡|蒸|煙|霧|消逝|逝|睡|醒不|眠|霞|幻|溶/],
  ['line-fold', /結束|停|句點|最後|到此|終|盡頭|截止|止|おわり|終わ|最後/],
  ['slat-close', /收|壓|藏|忍|沉默|關上|閉|吞|歸零|閉じ|隠|黙/],
  ['band-out', /不要|不再|別再|算了|放手|離開|切斷|斷|否|やめ|切り|離れ|捨て/],
  ['radial-leave', /爆|衝|炸|狂|燃|燒|吼|破|爆発|叫|燃え|弾け/],
  ['node-fold', /未完|還沒|繼續|待續|下去|沒說完|未說|つづく|続く|まだ/],
  ['gravity-pass', /墜|跌|掉下|往下|沉|落下|失落|墜ち|落ち|沈/],
  ['rail-leave', /離站|遠行|走了|出發|遠方|告辭|旅|發車|發車|行く|旅立/],
  ['pore-out', /漸漸|褪|消磨|時間|歲月|日子|流逝|擦去|磨|薄れ|時間|日々/],
  ['focus-out', /忘|遠去|模糊|想不起|回憶|記憶|ぼやけ|忘れ|思い出/],
];
/** Exits a song felt rather than shouted does not take. */
export const NOT_CALM_EXIT = new Set<LineExitKind>(['band-out', 'radial-leave', 'glyph-shed']);
/** The ways out that go with a line's level when its words name none. */
const EXIT_BY_LEVEL: Record<Level, LineExitKind[]> = { 0: ['wave-dissolve', 'pore-out', 'line-fold', 'slat-close', 'focus-out', 'node-fold'], 1: ['slat-close', 'pore-out', 'line-fold', 'band-out', 'rail-leave', 'node-fold'], 2: ['band-out', 'radial-leave', 'gravity-pass', 'glyph-shed', 'line-fold'] };
/** Layouts the drawn exits work on; a paper line can only be cut up. */
export const EXIT_LAYOUT = new Set(['stair', 'punch', 'quote', 'stack', 'vertical', 'couplet', 'editorial', 'corner-anchor', 'build-cut']);
export const EXIT_PAPER = new Set(['lyric-carrier', 'note-panel', 'memory-card']);
export const PAPER_EXITS = new Set<LineExitKind>(['tile-scatter', 'gravity-pass']);
/** A line's way out, if it asks for one, can afford it after its reading and the song still has room for that kind. */
export function exitFor(text: string, template: string, entrance: string, spare: number, calm: boolean, used: Map<string, number>, cap: number, last?: string, level?: Level, roll = 0): LineExitKind | undefined {
  if (entrance === 'fold-open' || entrance === 'tether-drop') return undefined;
  const open = (kind: LineExitKind) => (EXIT_PAPER.has(template) ? PAPER_EXITS.has(kind) && !(template === 'memory-card' && kind === 'tile-scatter') : !['tile-scatter'].includes(kind) && EXIT_LAYOUT.has(template)) && !(calm && NOT_CALM_EXIT.has(kind)) && (used.get(kind) ?? 0) < cap && kind !== last && spare >= LINE_EXIT_SEC[kind];
  const asked = EXIT_WORDS.find(([kind, words]) => words.test(text) && open(kind))?.[0];
  if (asked || level === undefined) return asked;
  // no word asks: a line with the time still goes a way that suits how loud it is, the least used of those first
  const fits = (EXIT_PAPER.has(template) ? ([...PAPER_EXITS] as LineExitKind[]) : EXIT_BY_LEVEL[level]).filter(open);
  return [...fits].sort((a, b) => (used.get(a) ?? 0) - (used.get(b) ?? 0) || hash(`${roll}:${a}`) - hash(`${roll}:${b}`))[0];
}

/**
 * The small tier for a line, if it has one: a song keeps to the kinds it leans to, and a line gets one only when it has
 * room in time. Only real words: the title or the line's own key phrase. (Part names such as 副歌 read as a label
 * pasted on the video, 2026-11-02 owner review.)
 */
export function fineFor(c: Cue, key: string, lineNo: number, seed: number, title: string): FineTier | undefined {
  const lean = seed % 3;
  const beat = (lineNo + seed) % 4;
  const whole = [...spoken(c.text).replace(/\s/g, '')].length;
  if (charsPerSec(c) > 9) return undefined;
  if (beat === 1) return undefined;
  const short = [...key].length >= 2 && [...key].length <= 8 && [...key].length <= whole - 2;
  if (beat === 2 && short) return { kind: 'key', text: key };
  if (beat === 0 && title && lean !== 2) return { kind: 'title', text: title };
  return lean === 1 ? undefined : { kind: 'rule', text: '' };
}

/** The plan typeplan.mts reads with --plan: a line's whole stack, chosen per line. */
/** The plan typeplan.mts reads with --plan, under the composer's stricter word breaks. */
export function composePlan(...args: Parameters<typeof compose>) {
  setWordSafe(true);
  try {
    return compose(...args);
  } finally {
    setWordSafe(false);
  }
}

function compose(song: { title: string; duration: number; tempo: number; beats: number[]; cues: Cue[]; sections?: { start: number; end: number; type: string }[] }, meaning: Meaning, calm: boolean, force: PlanForce = {}) {
  const { cues, beats } = song;
  const rolled = force.reroll !== undefined;
  const seed = hash(rolled ? `${song.title}#${force.reroll}` : song.title);
  // a reroll is another version of the song, not the same one reshuffled: it leans to its own layouts and entrances all song long
  // (mixed: the plain hash keeps its low digits from one seed to the next, so a small roll would shift every line alike)
  const mixed = rolled ? (s: string) => { const h = Math.imul(hash(s), 0x2c1b3c6d); return (h ^ (h >>> 15)) >>> 0; } : hash;
  const lean = rolled ? (r: Recipe) => (mixed(`${seed}:t:${r.wline?.set ?? r.template}`) % 100) * (r.wline ? 0.26 : 0.12) + (mixed(`${seed}:e:${r.wline?.enter ?? r.enter}`) % 100) * 0.05 : undefined;
  const W = force.world;
  const rollFx = (list: string[], salt: string) => [...list].sort((a, b) => mixed(`${seed}:${salt}:${a}`) - mixed(`${seed}:${salt}:${b}`));
  const inChorus = (c: Cue) => song.sections?.find((x) => c.start >= x.start && c.start < x.end)?.type === 'chorus';
  const partOfCue = (id: string) => { const i = cues.findIndex((c) => c.id === id); return [...meaning.parts].filter((p) => cues.findIndex((c) => c.id === p.from) <= i).at(-1) ?? meaning.parts[0]; };
  const lineBeatsOf = new Map(lineBeats(cues, song.duration).map((b) => [b.id, b]));
  const beatOf = new Map(lineBeats(cues, song.duration).map((b) => [b.id, b]));
  // every other chorus part opens on its lead line in lights; a part change that is already something else takes no iris
  // (its lead: the first of its opening lines short enough for a paper with the time for one)
  const leadOf = (p: SongPart) => { const at = cues.findIndex((c) => c.id === p.from); return cues.slice(at, at + 3).find((c) => inChorus(c) && partOfCue(c.id) === p && glyphs(c.text) <= 14 && (lineBeatsOf.get(c.id)?.spare ?? 0) >= 0.7); };
  const leadIds = new Set(force.director || W ? [] : meaning.parts.slice(1).flatMap((p) => { const c = leadOf(p); return c ? [c.id] : []; }).filter((_, i) => i % 2 === 0).slice(0, LEAD_CAP));
  // a part's key line: the one the reading names, else the one with most room to be held; a ring goes round no other
  const keyLines = new Set(meaning.parts.flatMap((p) => {
    const own = cues.filter((c) => partOfCue(c.id) === p && glyphs(c.text) <= RING_MAX);
    const named = own.filter((c) => meaning.keys.some((k) => k.cue === c.id));
    return (named.length ? named : [...own].sort((a, b) => (lineBeatsOf.get(b.id)?.spare ?? 0) - (lineBeatsOf.get(a.id)?.spare ?? 0))).slice(0, 3).map((c) => c.id);
  }));
  // the part the song falls hardest into turns its paper over, and back; one a song
  // (a part change that can take the iris keeps it: the iris is the rarer of the two)
  const irisFits = (p: SongPart) => { const i = cues.findIndex((c) => c.id === p.from); return i > 0 && !!handoffTimes('aperture', cues[i - 1], cues[i - 1].start - 0.25, 0.45, cues[i], (cues[i + 1]?.start ?? cues[i].end + 2) - 0.3); };
  const irisSlots = new Set(meaning.parts.slice(1).filter((p) => irisFits(p) && !leadIds.has(p.from)).slice(0, Math.max(1, Math.ceil(cues.length * APERTURE_SHARE))));
  // (and it is long enough to be a place: one line flipped and back is a blink)
  const linesOf = (p: SongPart) => cues.filter((c) => partOfCue(c.id) === p).length;
  const falls = meaning.parts.slice(1).map((p, i) => ({ p, drop: meaning.parts[i].tension - p.tension })).filter((x) => !irisSlots.has(x.p) && linesOf(x.p) >= 3).sort((a, b) => b.drop - a.drop)[0];
  const nightPart = falls && falls.drop >= 0.095 && !force.director && (!W || W.flip === 'part') ? falls.p : undefined;
  const afterNight = nightPart ? meaning.parts[meaning.parts.indexOf(nightPart) + 1] : undefined;
  const fineTitle = splitSongTitle(song.title).title;
  const hands = planHandoffs(cues, [...beatOf.values()], new Set(meaning.parts.slice(1).map((p) => p.from)), calm, seed, force.hands, new Set([...leadIds, ...(nightPart ? [nightPart.from] : []), ...(afterNight ? [afterNight.from] : [])]), new Set([...(nightPart ? [nightPart.from] : []), ...(afterNight ? [afterNight.from] : [])]), !!force.director, rolled ? RIG_ROOM : 0);
  if (W && !W.handoffs) hands.clear();
  // a whole-line entrance forced for inspection plays: a handoff would replace it with a cut
  for (const [id, name] of force.recipes ?? []) if (isArrival(RECIPES.find((r) => r.id === name)?.enter ?? '')) hands.delete(id);
  // a handoff's picture changes when it starts, ahead of the line it hands to
  const pairs = planPairs(cues, beatOf, hands, calm, force.pairs, new Map([...(force.recipes ?? []), ...[...(force.custom?.keys() ?? [])].map((id) => [id, 'custom'] as [string, string]), ...[...leadIds].map((id) => [id, 'lead'] as [string, string])]));
  // a pair of quick lines has no seconds for a handoff, into it or out of it
  for (const [id, p] of pairs) if (p.kind === 'list' && setTogether(cues.find((c) => c.id === id)!, cues.find((c) => c.id === p.also[0])!)) for (const x of [id, ...p.also, cues[cues.findIndex((c) => c.id === p.also.at(-1)) + 1]?.id ?? '']) if (!force.hands?.has(x)) hands.delete(x);
  // a call beside a line is laid out from where the line stands: a world keeps such a line alone and where it lands
  const hasCall = (id: string) => splitCalls(cues.find((c) => c.id === id)?.text ?? '').calls.length > 0;
  if (W) for (const [id, p] of pairs) if ([id, ...p.also].some(hasCall)) pairs.delete(id);
  const leaderOf = new Map([...pairs].flatMap(([id, p]) => p.also.map((x) => [x, id] as const)));
  // a pair is one shot, running as far as its last line
  const leaders = cues.filter((c) => !leaderOf.has(c.id)).map((c) => ({ ...c, end: cues.find((x) => x.id === pairs.get(c.id)?.also.at(-1))?.end ?? c.end }));
  const shots = shotsOf(leaders, song.duration, (c) => { const h = hands.get(c.id); return h && h.kind !== 'relay' ? h.from : c.start; });
  const handNear = (id: string) => { const i = cues.findIndex((x) => x.id === id); return hands.has(id) || hands.has(cues[i + 1]?.id ?? ''); };
  const deviceCap = Math.max(2, Math.ceil(cues.length * DEVICE_SHARE));
  const devices = new Map<string, number>();
  const carrierCap = Math.max(2, Math.ceil(cues.length * CARRIER_SHARE));
  // the chorus leads' papers come out of the song's share up front
  let carriers = leadIds.size;
  let lastCarrier = -CARRIER_APART;
  const spatialCap = Math.max(1, Math.ceil(cues.length * SPATIAL_SHARE));
  const layoutCap = Math.max(1, Math.ceil(cues.length * LAYOUT_SHARE));
  let spatial = 0;
  let lastSpatial = -CARRIER_APART;
  const distinctCap = Math.max(3, Math.ceil(cues.length * DISTINCT_SHARE));
  let distinct = pairs.size + leadIds.size;
  const arrivalCap = Math.max(1, Math.ceil(cues.length * ARRIVAL_SHARE));
  const arrivalsCap = Math.max(2, Math.ceil(cues.length * ARRIVALS_SHARE));
  let arrivals = 0;
  let lastArrival = -ARRIVAL_APART;
  /** Whether this device still has room in the song, a chorus bringing it back included. */
  const hasRoom = (r: Recipe) => !r.fit || (distinct < distinctCap && (devices.get(r.id) ?? 0) < deviceCap && (!CARRIERS.has(r.template) || carriers < carrierCap) && (!SPATIAL.has(r.template) || (spatial < spatialCap && (devices.get(r.template) ?? 0) < layoutCap)) && (!isArrival(r.enter) || (arrivals < arrivalsCap && (devices.get(r.enter) ?? 0) < arrivalCap)));
  const partAt = (id: string) => { const i = cues.findIndex((c) => c.id === id); return [...meaning.parts].filter((p) => cues.findIndex((c) => c.id === p.from) <= i).at(-1) ?? meaning.parts[0]; };
  const seen = new Map<string, { recipe: Recipe; side: string }>();
  const directed = new Set(force.custom?.values() ?? []);
  const isDirected = (r: Recipe) => directed.has(r);
  const recent: Recipe[] = [];
  let lastPart: SongPart | undefined;
  let lastSide = rolled && seed % 2 ? 'left' : 'right';
  const offBeat = rolled ? seed % 4 : 0;
  let cutNo = 0;
  let quietLines = 0;
  // (a world's cuts are big changes of light: never quicker than two a second, whatever the tempo)
  const beatGap = (beats.at(-1)! - beats[0]) / Math.max(1, beats.length - 1);
  // (a song's own tempo sets the world's cutting: double time is cut on the half, a slow one on the beat)
  const halfTime = !calm && beatGap < 0.42 ? 2 : 1;
  const stepOf = (l: Level) => (W ? Math.max((calm ? W.pace.calmEvery : W.pace.every[l]) * halfTime, Math.ceil(0.5 / beatGap)) : l === 2 ? 2 : l === 1 ? 4 : 8);
  const levelAt = (sh: ShotOut) => { const x = cues.find((y) => y.id === sh.cue); return levelOf((x ? partAt(x.id) : meaning.parts[0]).tension, x ? charsPerSec(x) : 0, calm); };
  // the planner's share per move (buildCuts: a tenth of the cuts), counted on the cuts this plan makes
  const total = shots.reduce((n, sh) => n + Math.max(1, Math.ceil(beats.filter((b) => b >= sh.start && b < sh.end).length / stepOf(levelAt(sh)))), 0);
  const cap = W ? Infinity : Math.max(4, Math.ceil(total * 0.1));
  const used = new Map<string, number>();
  // a world's song: which lines came from the shared part of its pool, its loudest part, the scheme it starts on
  let sharedLines = 0;
  // a world's set pieces: on parts and key lines, or a long unsung stretch, far enough apart to stay events
  let lastPiece = -99;
  let pieceNo = seed % Math.max(1, W?.pieces.length ?? 1);
  // (a faster song fires them closer together, a slower one further apart; what fires is the lyric's call before the song's own order)
  const tempoK = Math.min(1.4, Math.max(0.7, 110 / Math.max(50, song.tempo)));
  const pieceOrder = W ? rollFx(W.pieces, 'pieces') : [];
  let lastPieceId = '';
  const pieceHere = (at: number, reason: boolean, words = '') => {
    if (!W?.pieces.length || !reason || at - lastPiece < (calm ? 14 : 10) * tempoK) return undefined;
    lastPiece = at;
    const asked = W.pieces.find((id) => id !== lastPieceId && W.pieceWords[id]?.test(words));
    let id = asked ?? pieceOrder[pieceNo++ % pieceOrder.length];
    if (id === lastPieceId) id = pieceOrder[pieceNo++ % pieceOrder.length];
    lastPieceId = id;
    return id;
  };
  const peakPart = W ? [...meaning.parts].sort((a, b) => b.tension - a.tension)[0] : undefined;
  let peaked = false;
  const startScheme = W ? W.start : 0;
  const schemeOf = (p: SongPart) => (W ? (startScheme + (calm ? meaning.parts.indexOf(p) : Math.floor(meaning.parts.indexOf(p) / 2))) % W.schemes : 0);
  const recentFx: string[] = [];
  const icon = themeIcon(cues.map((c) => c.text));
  let iconsUsed = 0;
  let marks = 0;
  let seals = 0;
  let leadsUsed = 0;
  let dusks = 0;
  let cracks = 0;
  let relays = 0;
  const ringedParts = new Set<SongPart>();
  const markCap = Math.max(1, Math.ceil(cues.length * MARK_SHARE));
  const exitsUsed = new Map<string, number>();
  const exitCap = Math.max(1, Math.ceil(cues.length * EXIT_SHARE));
  let lastExit: string | undefined;
  let tiles = 0;
  let lineNo = 0;
  let lastBeat = '';
  // each part blows up one line's key word, a line the reading named first (2026-11-04 gap 3: one type size everywhere)
  const blownParts = new Set<SongPart>();
  const namedKey = (id: string) => meaning.keys.find((k) => k.cue === id)?.phrase;
  const namedLater = (p: SongPart, after: number) => cues.some((x, i) => i > after && partAt(x.id) === p && !!namedKey(x.id) && !!blowOf(x, namedKey(x.id)));
  const planned = shots.map((s) => {
    const c = cues.find((x) => x.id === s.cue);
    const part = c ? partAt(c.id) : lastPart ?? meaning.parts[0];
    const level = levelOf(part.tension, c ? charsPerSec(c) : 0, calm);
    const newPart = part !== lastPart;
    lastPart = part;
    const n = beats.filter((b) => b >= s.start && b < s.end).length;
    const step = stepOf(level);
    const count = Math.max(1, Math.ceil(n / step));
    // cuts a world times itself: the song's beats, not the felt tempo the treatment counts in
    const shotBeats = W ? beats.filter((b) => b >= s.start && b < s.end) : [];
    quietLines = newPart ? 0 : quietLines + 1;
    // a layout with a shape of its own holds one quiet move for the whole line: a new one landing mid-reading would be a second event
    const cutsOf = (own: boolean, paper = false) => Array.from({ length: own ? 1 : count }, (_, i) => {
      const k = cutNo++ + (seed % 7);
      const first = i === 0;
      const list = first && newPart ? PART_TRANSITIONS[level] : first && quietLines % 2 === 1 ? LINE_TRANSITIONS[level] : [];
      // a song felt rather than shouted keeps to the quiet backgrounds whatever tension its reading gives a part
      // a sheet laid on a tinted plate is two papers doing one job
      const quietAll = W ? rollFx(calm ? W.quiet : W.grounds[level], 'ground') : (own ? QUIET_BACKGROUNDS : BACKGROUNDS)[calm ? 0 : level].filter((f) => !(paper && (f === 'overprint' || f === 'stitch')));
      // a reroll stands on its own set of grounds: the song's pools are wide enough that every plan would use all of them
      // (a style's own grounds first, as far as this level has them)
      const quiet = rolled ? rollFx(quietAll, 'set').slice(0, Math.max(6, Math.ceil(quietAll.length * 0.55))) : quietAll;
      // a reroll's parts stand on grounds of its own from the same pools (the song's mood and level keep them in tone)
      const wanted = rolled ? rollFx(quiet, `part${meaning.parts.indexOf(part)}`).slice(0, 3) : part.fx.map((f) => KIN[f] ?? f).filter((f) => quiet.includes(f));
      const pick = W && first && newPart && !peaked && part === peakPart && !paper ? (calm ? W.peak.calm : W.peak.loud) : W && (calm || level > 0) ? quietAll[(cutNo + (seed % quietAll.length)) % quietAll.length] : nextFx(wanted, rolled ? rollFx(quiet, 'pool') : quiet, used, cap, k, recentFx.slice(W ? -1 : -RECENT_FX));
      if (W && pick === (calm ? W.peak.calm : W.peak.loud)) peaked = true;
      recentFx.push(pick);
      const hand = first && c ? hands.get(c.id) : undefined;
      const handed = hand && HANDOFF_TRANSITION[hand.kind];
      if (W) {
        const going = first ? (newPart ? W.partIn[level] : W.lineIn[level]) : [];
        const at = first ? s.start : shotBeats[i * step];
        return { yields: true, beat: i * step, at, fx: pick, flow: '', label: '', words: [], sprite: '', size: 0, heart: false, dark: part === nightPart || (W.flip === 'peak' && first && newPart && part === peakPart && !calm), cam: W.cams[level][k % W.cams[level].length], flash: '', transition: handed ?? (going.length ? going[k % going.length] : ''), scheme: schemeOf(part), level: part.tension, ...(handed ? { transitionSec: +(hand.to - hand.from).toFixed(3), transitionDir: hand.dir } : {}) } as Record<string, unknown> & { beat: number; fx: string; cam: string; flash: string; transition: string; dark: boolean };
      }
      return { yields: true, ...(handed ? { transitionSec: +(hand.to - hand.from).toFixed(3), transitionDir: hand.dir } : {}), beat: i * step, fx: pick, flow: '', label: '', words: [], sprite: '', size: 0, heart: false, dark: level === 2 && first && (quietLines + offBeat) % 4 === 2, cam: CAMS[level][k % CAMS[level].length], flash: level === 2 && first && (quietLines + offBeat) % 4 === 0 && part !== nightPart ? 'white' : '', transition: handed ?? (hand ? '' : list.length ? list[k % list.length] : '') } as Record<string, unknown> & { beat: number; fx: string; cam: string; flash: string; transition: string; dark: boolean };
    });
    if (!c) {
      const gapCuts = cutsOf(false);
      const gapPiece = pieceHere(s.start, s.end - s.start >= 2.4);
      if (gapPiece) { gapCuts[0]['piece'] = gapPiece; gapCuts.splice(1); }
      return { shot: s.id, level: 0, chapter: '', lyric: { template: 'quiet', side: 'center' }, lines: [], cuts: gapCuts };
    }
    const again = seen.get(c.text);
    const roll = (salt: string, n: number) => mixed(`${seed}:${c.text}:${salt}`) % n;
    const marksOf = MARKS[level], cams = W?.textCams[level].length ? W.textCams[level] : TEXT_CAMS[level];
    const beat = beatOf.get(c.id);
    const uneasy = UNEASY.test(c.text) && !beat?.payoff;
    // how far a line leans comes from its block's shape: glyph count stands in for it here
    const textCam: TextCam = uneasy ? { kind: 'lean-settle', dir: roll('dir', 2) ? 1 : -1, amount: leanAngle(glyphs(c.text)) / 0.03 } : { kind: cams[roll('cam', cams.length)], dir: roll('dir', 2) ? 1 : -1, amount: beat?.payoff ? 0.5 : [0.7, 1, 1.5][level] * (0.75 + (seed % 37) / 100) };
    const sharedRoom = (r: Recipe) => !W || !!r.wline || sharedLines < Math.floor(lineNo * SHARED_SHARE + 1);
    const allowed = (r: Recipe) => (calm ? fitsCalm(r) && !r.wline?.loud : r.id !== 'build-calm') && sharedRoom(r) && hasRoom(r) && !(handNear(c.id) && FIXED_LAYOUT.has(r.template)) && !(isArrival(r.enter) && (hands.has(c.id) || lineNo - lastArrival < ARRIVAL_APART)) && !(force.rigs?.has(c.id) && CLIPPED_ENTER.has(r.enter)) && (!beat?.payoff || ['still', 'drift', 'float', 'tether-settle', 'balance-rest', 'side-light', 'ink-state', 'reflection-rest', 'frame-lights'].includes(r.idle)) && (!CARRIERS.has(r.template) || lineNo - lastCarrier >= CARRIER_APART) && (!SPATIAL.has(r.template) || lineNo - lastSpatial >= CARRIER_APART);
    const named = force.custom?.get(c.id) ?? RECIPES.find((r) => r.id === force.recipes?.get(c.id));
    // a chorus's first line goes up in lights on a paper, as its own moment, whatever it says
    const leads = leadIds.has(c.id) && !hands.has(c.id) && leadsUsed < LEAD_CAP;
    const lead = leads ? RECIPES.find((r) => r.level === (calm ? 0 : level) && r.enter === 'frame-run') : undefined;
    const pair = pairs.get(c.id);
    if (pair) {
      const worldPair = W && !W.handoffs;
      const r: Recipe = worldPair ? { ...PAIR_RECIPE.list, template: 'world-pair', enter: 'cut', exit: 'fade' } : PAIR_RECIPE[pair.kind];
      const ids = [c.id, ...pair.also];
      recent.push(r);
      lineNo += ids.length;
      const lines = ids.map((id, k) => {
        const x = cues.find((y) => y.id === id)!;
        // the shot's last line is the one that leaves it
        const out = !worldPair && k === ids.length - 1 && !hands.has(cues[cues.indexOf(x) + 1]?.id ?? '') ? exitFor(spoken(x.text), r.template, r.enter, beatOf.get(id)?.spare ?? 0, calm, exitsUsed, exitCap, lastExit, level, hash(`${seed}:${id}`) % 96) : undefined;
        if (out) {
          exitsUsed.set(out, (exitsUsed.get(out) ?? 0) + 1);
          lastExit = out;
        }
        if (worldPair) return { cue: id, budget: true, enter: 'cut', exit: 'fade', idle: 'still', trail: false, emphasis: keyOf(x.text, meaning.keys.find((y) => y.cue === id)?.phrase), method: 'color', symbol: 'sparkle', emphasis2: '', method2: 'color', zh: '', world: { set: W.pairSet, enter: W.pairLine.enters[0], exit: W.pairLine.exits[0], hold: W.pairLine.hold } };
        return { cue: id, budget: true, enter: k ? (pair.kind === 'chat' ? 'cut' : 'reply-land') : r.enter, exit: out ?? r.exit, idle: 'still', trail: false, emphasis: keyOf(x.text, meaning.keys.find((y) => y.cue === id)?.phrase), method: 'color', symbol: 'sparkle', emphasis2: '', method2: 'color', zh: '' };
      });
      return { shot: s.id, level: level / 2, chapter: '', lyric: { template: r.template, side: 'center', params: r.params ?? {} }, lines, cuts: cutsOf(true) };
    }
    // a chorus comes back with its recipe, as long as that does not push a device past its share of the song
    // (a stack the director made for one line is that line's: a repeat it lost does not inherit it)
    const repeat = again && !isDirected(again.recipe) && hasRoom(again.recipe) && !(isArrival(again.recipe.enter) && hands.has(c.id)) && sharedRoom(again.recipe) ? again.recipe : undefined;
    const canLead = !!lead && !named && (beat?.spare ?? 0) >= (lead.spare ?? 0) && glyphs(c.text) <= (lead.max ?? 99);
    if (canLead) leadsUsed += 1;
    const recipe = named ?? (canLead ? lead! : repeat ?? pickRecipe(c, level, recent, seed, allowed, beat?.spare ?? Infinity, part.what, lean, W?.recipes));
    if (W && !recipe.wline) sharedLines += 1;
    if (recipe.fit && !canLead) {
      devices.set(recipe.id, (devices.get(recipe.id) ?? 0) + 1);
      distinct += 1;
    }
    if (SPATIAL.has(recipe.template)) {
      spatial += 1;
      devices.set(recipe.template, (devices.get(recipe.template) ?? 0) + 1);
      lastSpatial = lineNo;
    }
    if (CARRIERS.has(recipe.template)) {
      if (!canLead) carriers += 1;
      lastCarrier = lineNo;
    }
    if (isArrival(recipe.enter)) {
      arrivals += 1;
      devices.set(recipe.enter, (devices.get(recipe.enter) ?? 0) + 1);
      lastArrival = lineNo;
    }
    lineNo += 1;
    const cuts = cutsOf(!W && (OWN_SHAPE(recipe.template) || isArrival(recipe.enter) || !!force.holds?.has(c.id)), CARRIERS.has(recipe.template));
    if (recipe.wline?.ground) { cuts[0].fx = recipe.wline.ground; cuts.splice(1); }
    // an entrance of the line's own is the shot's one event: no wipe or flash arrives on top of it
    if (isArrival(recipe.enter)) Object.assign(cuts[0], { transition: '', flash: '' });
    const side = again?.side ?? (recipe.sides.find((x) => x !== lastSide) ?? recipe.sides[0]);
    seen.set(c.text, { recipe, side });
    recent.push(recipe);
    lastSide = side;
    const key = keyOf(c.text, meaning.keys.find((k) => k.cue === c.id)?.phrase);
    // a hit marks the loud parts' opening lines; the tiled frame stays rare enough to surprise
    const hit = W ? (W.pace.hits.length && level === 2 && !recipe.wline && (newPart || quietLines % 4 === 0) ? W.pace.hits[0] : undefined) : level === 2 && !isArrival(recipe.enter) && (newPart || quietLines % 4 === 0) ? (tiles < 3 && newPart ? 'tile' : 'zoom') : undefined;
    if (hit === 'tile') tiles++;
    // the line's way out: the one the plan forces, else one its words ask for, never into a handoff
    const nextId = cues[cues.indexOf(cues.find((x) => x.id === c.id)!) + 1]?.id;
    // an entrance lands ahead of the voice, so spare seconds are the exit's; the renderer's gate is what has the last word
    const afford = beat?.spare ?? 0;
    const wayOut = force.exits?.get(c.id) ?? (recipe.wline || (W && !W.devices) || KEEPS_EXIT(recipe) || hands.has(nextId ?? '') || hands.has(c.id) || (recipe.exit as string) === 'fold-close' || OWN_EXIT.has(recipe.exit) ? undefined : exitFor(spoken(c.text), recipe.template, recipe.enter, afford, calm, exitsUsed, exitCap, lastExit, level, roll('exit', 96)));
    if (wayOut) {
      exitsUsed.set(wayOut, (exitsUsed.get(wayOut) ?? 0) + 1);
      lastExit = wayOut;
    }
    // a held sound draws its breath under the line; the song's icon goes with the words that name it
    const tail = heldTail(spoken(c.text), c.end, c.charStarts, c.charTimed);
    const paperLine = !W || W.devices;
    const breathes = paperLine && tail >= BREATH_MIN && TRACKED.has(recipe.template) && !recipe.state && marks < markCap;
    // the song's sign once to a frame: a line that signs off with it does not stand it beside the words as well
    const iconHere = paperLine && !!icon && icon.words.test(c.text) && !SEALS.test(c.text) && TRACKED.has(recipe.template) && iconsUsed < 3 && !recipe.state ? icon.symbol : undefined;
    if (breathes) marks += 1;
    if (iconHere) iconsUsed += 1;
    if (recipe.state === 'edge') cuts.forEach((x) => (x.dark = true));
    // the part the song falls into is printed the other way round; the change is a handoff of its own, between two readings
    if (part === nightPart) cuts.forEach((x) => (x.dark = true));
    const asksRing = KEEPS.test(c.text) && glyphs(c.text) <= 9;
    const keyRing = keyLines.has(c.id) && !ringedParts.has(part);
    const ringed = paperLine && (asksRing || keyRing) && TRACKED.has(recipe.template) && !recipe.state && !breathes && !iconHere && !ringedParts.has(part);
    if (ringed) ringedParts.add(part);
    const relays_ = paperLine && RELAYS.test(c.text) && [...key].length < glyphs(c.text) && !recipe.fit && (beat?.spare ?? 0) >= 0.3 && relays < markCap;
    if (relays_) relays += 1;
    // a promise is signed with the song's own sign; a song with no sign of its own has nothing to press
    if (W) { /* a world's grounds are its own: no shared scene comes in on a word */ } else if (DUSK.test(c.text) && dusks < 2 && !OWN_SHAPE(recipe.template)) {
      cuts[0].fx = 'horizon-light';
      cuts.splice(1);
      dusks += 1;
    } else if (CRACKS.test(c.text) && cracks < 2 && !OWN_SHAPE(recipe.template)) {
      cuts[0].fx = 'surface-crack';
      cuts.splice(1);
      cracks += 1;
    }
    const sealed = !W && !!icon && SEALS.test(c.text) && seals < 2 && !OWN_SHAPE(recipe.template);
    if (sealed) {
      Object.assign(cuts[0], { fx: 'fold-mark', mark: icon!.symbol });
      // it is the shot's one event: no other cut lands on it
      cuts.splice(1);
      seals += 1;
    }
    const fine = paperLine && !recipe.wline ? fineFor(c, key, lineNo, seed, fineTitle) : undefined;
    const hand = hands.get(c.id);
    // a line that travels shares its camera with the backdrop; never one a handoff is already carrying
    const rigRoom = (devices.get('rig') ?? 0) < deviceCap && distinct < distinctCap;
    const seeks = SEEK.test(spoken(c.text)) && TRACKED.has(recipe.template) && !recipe.fit;
    const rigKind = recipe.wline ? undefined : force.rigs?.get(c.id) ?? (recipe.template === 'panel-route' ? 'panel-track' : seeks && rigRoom ? 'phrase-track' : TRAVEL.test(c.text) && level > 0 && !calm && rigRoom ? (roll('rig', 2) ? 'arc' : 'ground') : undefined);
    const rig = rigKind && !hand && !CLIPPED_ENTER.has(recipe.enter) && !RIG_LAYOUT_OUT.has(recipe.template) ? rigFor(c, beat, key, rigKind, roll('dir', 2) ? 1 : -1, 0.75 + (seed % 51) / 100, rolled ? RIG_ROOM : undefined) : undefined;
    if (rig) {
      devices.set('rig', (devices.get('rig') ?? 0) + 1);
      if (!recipe.fit) distinct += 1;
      cuts[0]['rig'] = rig;
    }
    // the crossing band goes with the line's own beat of luck, not only the loudest parts: those lines are few
    // a world's line changes set on a beat in the room its reading leaves: one more picture, the same words
    const piece = pieceHere(s.start, newPart || keyLines.has(c.id), `${c.text} ${part.what}`);
    if (piece) { cuts[0]['piece'] = piece; cuts.splice(1); }
    const cueAt = cues.indexOf(c);
    const blowable = recipe.wline && W?.stress?.length && !piece && !W.columns[recipe.wline.set] && !blownParts.has(part) ? blowOf(c, namedKey(c.id)) : undefined;
    const blow = blowable && (namedKey(c.id) || !namedLater(part, cueAt)) ? { ...blowable, stress: W!.stress![meaning.parts.indexOf(part) % W!.stress!.length] } : undefined;
    if (blow) blownParts.add(part);
    // a blown-up key word holds its picture until the line is read: no change of set before
    const repose = (recipe.wline && W && !piece && !hasCall(c.id) ? reposeOf(c, recipe.wline.set, W, beat, beats, level, calm, roll) : []).filter((r) => !blow || r.at >= c.start + readingSec(c.text, c.start, c.end));
    // (a calm song's change of set stays on its quiet grounds)
    const reposeGrounds = calm && W?.quiet.length ? W.quiet : W?.grounds[level] ?? [];
    for (const r of repose) cuts.push({ ...cuts[0], at: r.at, repose: true, transition: '', beat: (cuts.at(-1)?.beat ?? 0) + 1, fx: reposeGrounds[(reposeGrounds.indexOf(cuts.at(-1)!.fx as string) + 1) % reposeGrounds.length] } as (typeof cuts)[number]);
    // cuts in time order, each a set's first frame when one lands there (a beat cut closer than a blink to a repose gives way)
    if (repose.length) { cuts.sort((x, y) => (Number(x['at']) || 0) - (Number(y['at']) || 0)); for (let i = cuts.length - 1; i > 0; i--) if (Number(cuts[i]['at']) - Number(cuts[i - 1]['at']) < 0.45 && !repose.some((r) => r.at === cuts[i - 1]['at'])) cuts.splice(i - 1, 1); }
    const held = recipe.wline && W?.beats ? beatOfLine(c, W.beats, beats, repose, lastBeat, roll('beat', 7)) : undefined;
    if (held) lastBeat = held.kind;
    const travel = W && recipe.wline ? [(roll('tx', 2) ? 1 : -1) * LINE_TRAVEL[level] / tempoK, (roll('ty', 2) ? 1 : -1) * LINE_TRAVEL[level] * 0.3 / tempoK] : undefined;
    const worldLine = recipe.wline ? { set: recipe.wline.set, enter: recipe.wline.enter, exit: recipe.wline.exit, hold: recipe.wline.hold, drift: travel, swell: calm ? 0.08 : 0.05, ...(repose.length ? { repose } : {}), ...(held ? { beat: { ...held, ...(W!.stepped ? { stepped: true } : {}) } } : {}), ...(blow ? { blow } : {}) } : undefined;
    const params = { ...recipe.params, ...(CARRIERS.has(recipe.template) ? { side } : {}), ...(recipe.id === 'band-stick' && roll('cross', 2) ? { cross: true } : {}) };
    return { shot: s.id, level: level / 2, chapter: '', lyric: { template: recipe.template, side, params }, lines: [{ cue: c.id, budget: true, ...(hit ? { hit } : {}), ...(fine ? { fine } : {}), ...(breathes ? { breath: +tail.toFixed(2) } : {}), ...(ringed ? { oval: true } : {}), ...(relays_ ? { relay: true } : {}), ...(iconHere ? { icon: iconHere } : {}), ...(recipe.state ? { inkState: recipe.state } : {}), ...(beat?.linger ? { linger: beat.linger } : {}), ...(hand ? { handoff: hand } : {}), ...(worldLine ? { world: worldLine } : {}), enter: recipe.enter, exit: wayOut ?? recipe.exit, idle: beat?.payoff && !recipe.state && recipe.idle !== 'reflection-rest' ? 'still' : breathes ? 'breath-rule' : recipe.idle, trail: !!recipe.trail && !wayOut, emphasis: key, method: breathes || relays_ || ringed ? 'color' : recipe.mark ?? marksOf[roll('mark', marksOf.length)], textCam: recipe.wline ? undefined : rig ? { ...textCam, rig } : recipe.enter === 'corner-land' ? { ...textCam, kind: 'tilt', amount: 0.6 } : textCam, symbol: 'sparkle', emphasis2: '', method2: 'color', zh: '' }], cuts };
  });
  const shotOf = (cue: string) => shots.find((s) => s.cue === (leaderOf.get(cue) ?? cue))?.id ?? shots[0].id;
  return {
    plan: {
      vision: { kinds: [calm ? 'mood' : 'attitude'], change: meaning.reading, why: 'line composer' },
      parts: meaning.parts.map((p) => ({ from: shotOf(p.from), shift: 'change', what: p.what, keep: { style: '', items: [] } })),
      meets: [], previews: [], clip: { from: shots[0].id, to: shots[0].id, why: '' }, backbone: meaning.reading, thread: { what: '', why: '' },
      document: false, print: 'duo', format: { pace: calm ? 'mixed' : 'quick', ground: 'flat', why: '' }, devices: { revise: 'caret', document: 'notebook', why: '' }, flowRule: '全部用原本方向', styles: [], finish: '', fresh: [], shots: planned,
    },
    shots,
  };
}
