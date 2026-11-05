// Style batch 4 (boards 2026-11-05, ~/Desktop/vj/output/風格第4批設計稿_2026-11-05), technology and objects: phone, blueprint,
// xerox. Each answers docs/research/2026-11-01-style-standard.md: a closed pool, its own material, moves and set pieces,
// rebuilt into the engine from its four boards the way batch 3 was (render/world-b4-*.ts, world-b4-sets.ts). Near
// neighbours kept apart on purpose: phone puts no line in a chat bubble or a window (JIZURA's own); blueprint keeps its
// words solid and draws only dimensions (no hollow flicker, no leader callouts); xerox is cut and pasted strips on fluoro
// stock with the lid's black and the drag, where brutalist is a clean poster on a grid with heads and a red band.
import type { FrameStack, LinePart, Scheme, StyleWorld } from './style-world';
import type { Level } from './lineplan-core';
import type { TextCamKind } from './render/text-cam';
import { B4_MIRRORS } from './render/world-b4-sets';

const stack = (o: Partial<FrameStack>): FrameStack => ({ grain: 0.1, paper: 0, tooth: 0, lift: 0, scan: 0, vignette: 0, flicker: 0, weave: 0, boil: 0, boilRate: 12, step: 0, koma: 0, ...o });
const lv = <T,>(a: T[], b: T[], c: T[]): Record<Level, T[]> => ({ 0: a, 1: b, 2: c });
const line = (set: string, levels: Level[], enters: string[], exits: string[], hold: string, o: Partial<LinePart> = {}): LinePart => ({ set, levels, enters, exits, hold, ...o });
const noText: Record<Level, TextCamKind[]> = lv([], [], []);
const scheme = (id: string, mood: Scheme['mood'], band: Scheme['band'], ground: string, ink: string, ink2: string, accent: string, plate: string, plateInk: string, faint: string, what: string): Scheme => ({ id, band, ground, ink, ink2, accent, plate, plateInk, faint, what, mood });

const phone: StyleWorld = {
  id: 'phone', name: '手機介面', language: 'phone', what: '一支手機的畫面：狀態列、鎖定畫面的大時鐘、播放卡、輸入框與鍵盤、來電畫面、搜尋框，72 px 圓角的螢幕，平塗硬邊',
  lyricRole: '歌詞是手機上你正在看的那行字：鎖定畫面時鐘的位置、正在打的那句、來電者的名字、搜尋框與第一條建議',
  family: 'ui',
  refuses: ['聊天氣泡', '框住歌詞的視窗', '品牌色與真實電信商', '顆粒與材質', '模糊與發光', '氣泡彈跳', '編出來的訊息內容'],
  type: { ja: { family: 'Noto Sans JP', weight: 500 }, tc: { family: 'Noto Sans TC', weight: 900 }, latin: 'Noto Sans TC', setting: '鎖定畫面的特粗黑體，後半句細而寬字距；輸入框中等字重；鍵盤與標籤是介面字', category: 'screen-sans' },
  palette: [
    // (board: ink #16141C, light #F4F3F7, vermilion #E2452B, aubergine #2B1F57, lilac #B9A6FF; night #101321; answer green
    // #1F7A52, decline red #C7321C; no brand colour). The ground is the lock screen's wallpaper and the call's lower panel.
    scheme('plum-lock', 'warm', 'dark', '#2B1F57', '#F7F5FF', '#B9A6FF', '#E2452B', '#F4F3F7', '#16141C', '#3B2D72', '茄紫的鎖定畫面，朱紅與丁香的圓弧'),
    scheme('ink-lock', 'cold', 'dark', '#1C2A57', '#F4F6FF', '#9FC0FF', '#E2452B', '#F3F4F8', '#16141C', '#2A3B70', '深藍的鎖定畫面'),
    scheme('wine-lock', 'warm', 'dark', '#3A1A3E', '#FFF5FA', '#F0A6C8', '#E2452B', '#F6F2F5', '#16141C', '#4E2754', '酒紫的鎖定畫面，粉色圓弧'),
    scheme('teal-lock', 'earth', 'dark', '#123C40', '#F2FAF9', '#8FD9CF', '#E2452B', '#F2F6F5', '#16141C', '#1E5257', '深青的鎖定畫面'),
    scheme('violet-lock', 'cold', 'mid', '#4B3C93', '#FFFFFF', '#C9BBFF', '#E2452B', '#F4F3F7', '#16141C', '#5A4AA6', '亮一點的紫色桌布'),
  ],
  groundBand: { band: 'dark', flip: 'none', why: '鎖定與輸入是暗的螢幕，來電與搜尋是亮的螢幕；字在暗頁是淺字，在亮頁是深墨字，每頁固定' },
  material: { surface: 'phone-type', core: 'ink', engine: 'ui/phone-screen', how: '螢幕：平塗硬邊；螢幕圓角 72 px、外圍黑色；按鍵圓角 16 px 加 3 px 硬邊底影；沒有顆粒、材質、模糊與發光' },
  frameStack: stack({ grain: 0, vignette: 0 }),
  timeBase: { fps: 0, unit: 'glyph', curve: 'key-step' },
  ownInk: true, sheet: true,
  layouts: { pair: 'phone/compose', shared: [], carriers: ['phone/call', 'phone/search'], lines: [
    line('phone/lock', [0, 1, 2], ['lock-swap', 'thumb-type'], ['swipe-up', 'thumb-delete'], 'screen-still', { max: 16, ground: 'phone/lock' }),
    line('phone/compose', [0, 1], ['thumb-type', 'lock-swap'], ['thumb-delete', 'swipe-up'], 'screen-still', { max: 30, ground: 'phone/compose' }),
    line('phone/call', [1, 2], ['lock-swap'], ['swipe-up'], 'screen-still', { max: 9, loud: true, ground: 'phone/call' }),
    line('phone/call-night', [2], ['lock-swap'], ['swipe-up'], 'screen-still', { max: 9, loud: true, ground: 'phone/call-night' }),
    line('phone/compose-day', [0, 1], ['thumb-type', 'lock-swap'], ['thumb-delete', 'swipe-up'], 'screen-still', { max: 30, ground: 'phone/compose-day' }),
    line('phone/search', [0, 1, 2], ['thumb-type', 'lock-swap'], ['thumb-delete', 'swipe-up'], 'screen-still', { max: 26, ground: 'phone/search' }),
  ] },
  motion: { enters: ['thumb-type', 'lock-swap'], exits: ['thumb-delete', 'swipe-up'], holds: ['screen-still'], curve: '字一個一個打進輸入框，游標跟在後面；鎖定畫面的字在拍點上一步換上來；來電的兩個鈕依拍呼吸 4%；搜尋建議往下長出來' },
  grounds: { levels: lv(['phone/compose', 'phone/search', 'phone/compose-day'], ['phone/lock', 'phone/search', 'phone/compose', 'phone/compose-day'], ['phone/call', 'phone/lock', 'phone/call-night']), quiet: ['phone/compose'] },
  decor: [{ id: 'phone/status-bar', why: '狀態列與圓角是「這是一支手機」的語言；時間是歌曲當下的位置', budget: '每頁一條' }, { id: 'phone/keyboard', why: '鍵盤是輸入的地方，用歌的文字：日文 12 鍵、中文注音', budget: '輸入與搜尋頁' }],
  transitions: { line: lv([''], ['screen-swipe', ''], ['screen-swipe']), part: lv(['screen-swipe'], ['screen-swipe'], ['screen-swipe']), own: ['screen-swipe'], banned: ['blurdissolve', 'ripple', 'wave', 'dipwhite', 'burst'], family: 'swipe' },
  peak: { loud: 'phone/call', calm: 'phone/compose', how: '快歌是來電，名字塞滿螢幕，兩個鈕依拍呼吸；慢歌是夜裡的輸入框，一個字一個字打' },
  pieces: ['notify-drop', 'battery-drain', 'signal-lost'],
  pieceWords: { 'notify-drop': /訊息|消息|信|電話|打給|找你|聯絡|メッセージ|連絡|返事|届け/, 'battery-drain': /累|沒電|疲|倦|撐不|力氣|限界|疲れ|電池/, 'signal-lost': /遠方|距離|斷了|失去|離開|消え|届かない|繋が|会えない|見えない/ },
  camera: { cams: lv([''], [''], ['', 'snap']), text: noText, note: '畫面就是螢幕，不平移；副歌進段只跳一下' },
  levels: { '0': '夜裡的輸入框或搜尋框', '1': '鎖定畫面的大時鐘', '2': '來電畫面', calm: '夜裡的輸入框' },
  pace: { every: [2, 2, 1], calmEvery: 8, repose: false, hits: [] },
  provenance: { source: 'own', process: '手機的系統介面：狀態列、鎖定畫面、輸入法、來電、搜尋', nearest: 'JIZURA 的聊天氣泡交錯彈出與視窗框', differs: '沒有聊天氣泡與視窗框；歌詞是介面本身的大字（時鐘、輸入中的字、來電者、搜尋），動作是打字與滑動' },
  acceptance: { fast: 'nun', calm: 'tsuzuki', hardest: '來電畫面的大字不壓到下面的按鈕區、搜尋框裡的長句不出框' },
};

const blueprint: StyleWorld = {
  id: 'blueprint', name: '藍圖', language: 'blueprint', what: '施工藍圖：普魯士藍底上的白色細線、方格、尺寸線、雙框與分區號、標題欄，工程楷書的說明字',
  lyricRole: '歌詞是圖紙上的說明文字：零件圖的註記、作圖頁上的兩行、練習格裡一格一字、說明 1. 2.',
  family: 'stroke',
  refuses: ['空心字', '藍晒反轉閃爍', '引線註解', '座標圓', '斜帶拼貼', '模糊與發光', '透視'],
  type: { ja: { family: 'Klee One', weight: 600 }, tc: { family: 'LXGW WenKai Mono TC', weight: 700 }, latin: 'LXGW WenKai Mono TC', setting: '等寬楷書工程字，白色實心；作圖頁細一級寬字距；練習格一格一字', category: 'drafting-hand' },
  palette: [
    // (board: blue #174A8C, line #E8F0FB; the diazo whiteprint is the same sheet reversed)
    scheme('prussian-sheet', 'cold', 'dark', '#174A8C', '#E8F0FB', '#BFD3EE', '#E8F0FB', '#E8F0FB', '#174A8C', '#2A5C9C', '普魯士藍的藍圖'),
    scheme('deep-sheet', 'earth', 'dark', '#123E78', '#E8F0FB', '#BFD3EE', '#E8F0FB', '#E8F0FB', '#123E78', '#244F8C', '深一點的藍圖'),
    scheme('night-sheet', 'warm', 'dark', '#0F335F', '#E6EEF8', '#B7CCE8', '#E6EEF8', '#E6EEF8', '#0F335F', '#1F4677', '舊圖紙的暗藍'),
    scheme('bright-sheet', 'cold', 'mid', '#1D5596', '#F0F5FC', '#C6D8EF', '#F0F5FC', '#F0F5FC', '#1D5596', '#3168A8', '新曬的亮藍'),
    scheme('whiteprint', 'warm', 'light', '#E9EEF4', '#174A8C', '#3D6AA6', '#174A8C', '#174A8C', '#E9EEF4', '#C9D6E6', '白底藍線的晒圖'),
  ],
  groundBand: { band: 'dark', flip: 'none', why: '藍圖是滿版均勻的藍；白底藍線的晒圖由配色輪替帶入' },
  material: { surface: 'plan-type', core: 'ink', engine: 'stroke/drafting', how: '外框 2／4 px，輪廓 3.5 px，尺寸線與作圖線 1.5 px，中心線 38-8-6-8 點劃線；40 px 細格 9%、200 px 粗格 18%，在字的位置挖空；紙面是均勻的藍加輕微的晒圖斑' },
  frameStack: stack({ grain: 0.06, vignette: 0 }),
  timeBase: { fps: 0, unit: 'line', curve: 'draft-order' },
  ownInk: true, sheet: true,
  layouts: { pair: 'blueprint/construct', shared: [], carriers: ['blueprint/lettering', 'blueprint/notes'], lines: [
    line('blueprint/part', [1, 2], ['pen-letter', 'drawing-lay'], ['sheet-off', 'eraser-out'], 'sheet-still', { max: 16, ground: 'blueprint/part' }),
    line('blueprint/construct', [0, 1, 2], ['pen-letter', 'drawing-lay'], ['eraser-out', 'sheet-off'], 'sheet-still', { max: 30, ground: 'blueprint/construct' }),
    line('blueprint/lettering', [2], ['pen-letter'], ['sheet-off'], 'sheet-still', { min: 2, max: 5, loud: true, ground: 'blueprint/lettering' }),
    line('blueprint/notes', [0, 1, 2], ['pen-letter', 'drawing-lay'], ['sheet-off', 'eraser-out'], 'sheet-still', { max: 24, ground: 'blueprint/notes' }),
  ] },
  motion: { enters: ['pen-letter', 'drawing-lay'], exits: ['sheet-off', 'eraser-out'], holds: ['sheet-still'], curve: '依繪圖順序畫：先拉中心線，再畫輪廓、尺寸線，字最後一個一個寫上；換段時下一張圖紙從右邊蓋上來' },
  grounds: { levels: lv(['blueprint/construct', 'blueprint/notes'], ['blueprint/part', 'blueprint/notes', 'blueprint/construct'], ['blueprint/lettering', 'blueprint/part']), quiet: ['blueprint/construct'] },
  decor: [{ id: 'blueprint/sheet-border', why: '雙框、分區號與標題欄說明這是一張圖紙；標題欄只放真資料', budget: '每張一套' }, { id: 'blueprint/grid', why: '方格是製圖紙，在字的位置挖空，線不穿過字', budget: '全張，9% 與 18%' }],
  transitions: { line: lv([''], ['sheet-turn', ''], ['sheet-turn']), part: lv(['sheet-turn'], ['sheet-turn'], ['sheet-turn']), own: ['sheet-turn'], banned: ['blurdissolve', 'ripple', 'wave', 'burst', 'shatter'], family: 'sheet' },
  peak: { loud: 'blueprint/lettering', calm: 'blueprint/construct', how: '快歌把喊的字放進練習格，一格一字；慢歌一張圓規作圖，下方一條很長的尺寸線' },
  pieces: ['compass-arc', 'dim-span', 'revision-cloud'],
  pieceWords: { 'compass-arc': /圓|圈|轉|繞|輪|円|回る|巡る|まわ|月/, 'dim-span': /遠|長|距離|廣|寬|遥|広|果て|海|天空|地平/, 'revision-cloud': /改|變|重來|錯|変わ|違う|直す|やり直|新しい/ },
  camera: { cams: lv([''], [''], ['', 'snap']), text: noText, note: '圖紙平放，不平移；副歌進段只跳一下' },
  levels: { '0': '作圖頁或說明 1. 2.', '1': '零件圖的註記', '2': '練習格一格一字', calm: '圓規作圖與一條長尺寸線' },
  pace: { every: [2, 2, 1], calmEvery: 8, repose: false, hits: [] },
  provenance: { source: 'own', process: '工程製圖：圖框分區、標題欄、尺寸線、中心線、剖面線、圓規作圖、工程字練習格', nearest: 'JIZURA 的藍晒線框反轉閃爍、引線註解與座標圓', differs: '字永遠是實心；只用尺寸線，不用引線與座標圓；不走斜帶拼貼' },
  acceptance: { fast: 'nun', calm: 'tsuzuki', hardest: '格線在字的位置挖空、尺寸線與零件圖不碰字' },
};

const xerox: StyleWorld = {
  id: 'xerox', name: '影印 zine', language: 'xerox', what: '影印機做的龐克傳單或 zine：黑白高反差、碳粉點、從報紙剪下貼好的標題字條、沒蓋蓋子留下的黑邊、拖影，印在彩色影印紙上',
  lyricRole: '歌詞是從報紙剪下的明體標題字條，貼好以後拿去影印',
  family: 'layered',
  refuses: ['網格與版心', '頁眉', '紅色帶', '漸層', '模糊與發光', '旋轉的字', '編出來的文字'],
  type: { ja: { family: 'Shippori Mincho B1', weight: 800 }, tc: { family: 'Shippori Mincho B1', weight: 800 }, latin: 'Courier Prime', setting: '粗明體報紙標題，碳粉邊；小字是 Courier 打字' , category: 'cut-headline' },
  palette: [
    // (board: toner #141414, copy white #F2F1EC, fluoro yellow #F1E64A, fluoro pink #F27DB4; more fluoro stock alike)
    scheme('fluoro-yellow', 'warm', 'light', '#F1E64A', '#141414', '#141414', '#141414', '#F2F1EC', '#141414', '#D9CF3C', '螢光黃的影印紙'),
    scheme('fluoro-pink', 'warm', 'mid', '#F27DB4', '#141414', '#141414', '#141414', '#F2F1EC', '#141414', '#D9649B', '螢光粉的影印紙'),
    scheme('copy-white', 'cold', 'light', '#F2F1EC', '#141414', '#141414', '#141414', '#F2F1EC', '#141414', '#D8D6CE', '白色影印紙'),
    scheme('fluoro-green', 'earth', 'light', '#B9E27A', '#141414', '#141414', '#141414', '#F2F1EC', '#141414', '#9FC862', '螢光綠的影印紙'),
    scheme('fluoro-orange', 'warm', 'mid', '#F6A75A', '#141414', '#141414', '#141414', '#F2F1EC', '#141414', '#DC8E44', '螢光橘的影印紙'),
  ],
  groundBand: { band: 'light', flip: 'none', why: '彩色影印紙，字永遠貼在白字條上；拖影的一頁是黑色玻璃上的一張影印（頁自己畫，不翻底）' },
  material: { surface: 'toner-type', core: 'plateInk', engine: 'paper/photocopy-paste', how: '字是碳粉：邊緣被影印機推動一點（位移 3.2 px／212 px 字），幾顆沒燒牢的碳粉點；字條切邊 2 px 加 (3, 3) 硬影；黑邊是 #121212 加橫向燈帶；碳粉點集中在黑邊旁 160 px 內' },
  frameStack: stack({ grain: 0.1, vignette: 0 }),
  timeBase: { fps: 0, unit: 'line', curve: 'lamp-pass' },
  ownInk: true, standsOnPlate: true, sheet: true,
  layouts: { pair: 'xerox/drag', shared: [], carriers: ['xerox/strips', 'xerox/columns'], lines: [
    line('xerox/strips', [1, 2], ['lamp-copy', 'paste-jolt'], ['copy-pull', 'lamp-out'], 'copy-still', { max: 18, ground: 'xerox/strips' }),
    line('xerox/blown', [0, 1], ['lamp-copy', 'paste-jolt'], ['lamp-out', 'copy-pull'], 'copy-still', { max: 30, ground: 'xerox/blown' }),
    line('xerox/drag', [2], ['lamp-copy'], ['copy-pull'], 'copy-still', { max: 8, loud: true, ground: 'xerox/drag' }),
    line('xerox/columns', [0, 1, 2], ['paste-jolt', 'lamp-copy'], ['copy-pull'], 'copy-still', { min: 5, max: 18, column: true, breaks: true, ground: 'xerox/columns' }),
  ] },
  motion: { enters: ['lamp-copy', 'paste-jolt'], exits: ['copy-pull', 'lamp-out'], holds: ['copy-still'], curve: '一句一句影印上來：燈管由左往右掃一次，字整塊出現；字條貼上時抖一下，不旋轉；副歌時每兩小節換一張紙色，拖影跟著音量往右拉長' },
  grounds: { levels: lv(['xerox/blown', 'xerox/columns'], ['xerox/strips', 'xerox/columns', 'xerox/blown'], ['xerox/drag', 'xerox/strips']), quiet: ['xerox/blown'] },
  decor: [{ id: 'xerox/lid-edge', why: '沒蓋上蓋子留下的黑邊與燈帶，碳粉點堆在旁邊，是影印的指紋', budget: '每頁至多一邊' }, { id: 'xerox/halftone-disc', why: '報紙照片的網點被放大，是剪貼的原稿', budget: '每頁至多一個，不碰字' }],
  transitions: { line: lv([''], ['lamp-pass', ''], ['lamp-pass']), part: lv(['lamp-pass'], ['lamp-pass'], ['lamp-pass']), own: ['lamp-pass'], banned: ['blurdissolve', 'ripple', 'wave', 'dipwhite', 'pagecurl'], family: 'lamp' },
  peak: { loud: 'xerox/drag', calm: 'xerox/blown', how: '快歌是黑色玻璃上的一張影印，大字的最後一筆被拖成碳粉條；慢歌一張曝白的紙、兩張字條和一條掃描線' },
  pieces: ['toner-spray', 'staple-down', 'scan-streak'],
  pieceWords: { 'toner-spray': /散|飛|炸|爆|噴|吼|叫|散る|飛ぶ|叫ぶ|弾け/, 'staple-down': /釘|留下|貼|記住|忘不|約束|ずっと|守る|永遠|忘れない/, 'scan-streak': /光|照|看見|映|写|明|鏡|光る|見つめ/ },
  camera: { cams: lv([''], [''], ['', 'snap']), text: noText, note: '影印紙平放，不平移；副歌進段只跳一下' },
  levels: { '0': '曝白的紙與兩張字條，或兩條直排字條', '1': '螢光紙上的字條與網點', '2': '黑色玻璃上被拖動的大字', calm: '曝白的紙與一條掃描線' },
  pace: { every: [2, 2, 1], calmEvery: 8, repose: false, hits: [] },
  provenance: { source: 'own', process: '影印機與剪貼：報紙標題字條、彩色影印紙、蓋子黑邊、碳粉、網點放大、拖動原稿', nearest: 'brutalist（影印海報的網格與紅色帶）', differs: '沒有網格、版心、頁眉與紅色帶；字是貼上去的字條，歪的、帶硬影，靠黑邊、拖影與彩色紙' },
  acceptance: { fast: 'nun', calm: 'tsuzuki', hardest: '拖影只從最後一個字往右，不回頭壓到字；字條上的長句不出條' },
};

/** Each mirrored set (world-b4-sets.ts) joins its world as a line of its own, on its mirrored page. */
for (const w of [phone, blueprint, xerox]) {
  const extra = w.layouts.lines.filter((l) => B4_MIRRORS[l.set]).map((l) => ({ ...l, set: `${l.set}-r`, ground: `${B4_MIRRORS[l.set]}-r` }));
  w.layouts.lines.push(...extra);
  for (const lvl of [0, 1, 2] as Level[]) w.grounds.levels[lvl] = [...new Set([...w.grounds.levels[lvl], ...extra.filter((l) => l.levels.includes(lvl)).map((l) => l.ground)])];
}

export const B4_WORLDS: StyleWorld[] = [phone, blueprint, xerox];
