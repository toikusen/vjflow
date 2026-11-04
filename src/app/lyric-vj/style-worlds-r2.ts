// The four worlds the 2026-11-04 audit condemned (現有風格審查: file, card, chalkboard, stained-glass), rebuilt from the
// owner-approved round-2 boards (風格設計稿_第二輪). Each answers docs/research/2026-11-01-style-standard.md: a closed pool,
// its own material, moves and grounds. Faces are the boards' own, kept to the rule that a Traditional Chinese face serves
// at most two worlds and no two worlds share a TC and Japanese pair: stained-glass leaves Noto Serif TC (four worlds) for
// Noto Serif HK 900, the heavy Ming no other world uses (Cactus Classical Serif, tried first, has no bold and read thin).
import type { FrameStack, LinePart, Scheme, StyleWorld } from './style-world';
import type { Level } from './lineplan-core';
import type { TextCamKind } from './render/text-cam';

const stack = (o: Partial<FrameStack>): FrameStack => ({ grain: 0.1, paper: 0, tooth: 0, lift: 0, scan: 0, vignette: 0, flicker: 0, weave: 0, boil: 0, boilRate: 12, step: 0, koma: 0, ...o });
const lv = <T,>(a: T[], b: T[], c: T[]): Record<Level, T[]> => ({ 0: a, 1: b, 2: c });
const line = (set: string, levels: Level[], enters: string[], exits: string[], hold: string, o: Partial<LinePart> = {}): LinePart => ({ set, levels, enters, exits, hold, ...o });
const noText: Record<Level, TextCamKind[]> = lv([], [], []);
const scheme = (id: string, mood: Scheme['mood'], band: Scheme['band'], ground: string, ink: string, ink2: string, accent: string, plate: string, plateInk: string, faint: string, what: string): Scheme => ({ id, band, ground, ink, ink2, accent, plate, plateInk, faint, what, mood });

export const FILE_WORLD: StyleWorld = {
  id: 'file', name: '案件檔案', language: 'dossier', what: '攤在牛皮紙夾上的案件檔案：打字的案件表、圖書館索引卡、分段的紙疊、紅格八行箋',
  lyricRole: '歌詞是案件編號下的條目：打在案件表上、寫在索引卡的藍線之間、或一句一格寫進八行箋',
  family: 'print',
  refuses: ['霓虹', '發光', '手寫塗鴉', '大色塊', '黑塗當主手法', '模糊漸層', '編出來的案號與數字'],
  type: { ja: { family: 'BIZ UDPMincho', weight: 700 }, tc: { family: 'UoqMunThenKhung', weight: 400 }, latin: 'Courier Prime', setting: '舊公文鉛字的明體大字，條目靠左；欄位與頁腳是打字機字', category: 'typed' },
  palette: [
    // (board: kraft #D6BE8A, paper #EFE6CF, ink #1C1917, stamp red #A8321F, file blue #2C4E9E, rule grey #8F8A7C)
    scheme('file-red', undefined, 'light', '#D6BE8A', '#1C1917', '#2C4E9E', '#A8321F', '#EFE6CF', '#1C1917', '#8F8A7C', '牛皮紙夾，印紅條目'),
    scheme('file-blue', undefined, 'light', '#C9B98E', '#1C1917', '#A8321F', '#2C4E9E', '#EEE8D6', '#1C1917', '#8F8A7C', '卷宗藍條目'),
    scheme('file-green', undefined, 'light', '#CDBB8C', '#1C1917', '#2C4E9E', '#2F6B4F', '#ECE6D0', '#1C1917', '#8F8A7C', '綠卷宗'),
  ],
  groundBand: { band: 'light', flip: 'none', why: '檔案一直是攤開的牛皮紙夾和紙，不翻底' },
  material: { core: 'accent', engine: 'print/dossier', how: '平的紙張疊在牛皮紙夾上，硬邊陰影右下 3/4 px；打字機一字一字打上去，紙跟著輕跳；紅色邊線、裝訂孔、表頭欄位是印好的' },
  frameStack: stack({ grain: 0.07, paper: 0, vignette: 0 }),
  timeBase: { fps: 0, unit: 'glyph', curve: 'typed-step' },
  ownInk: true, standsOnPlate: true, sheet: true,
  layouts: { pair: 'file/pair', shared: [], carriers: ['file/case', 'file/catalogue', 'file/letter'], lines: [
    // (the pair's own set: only ever two lines sharing a shot, never a line of its own)
    line('file/pair', [], ['type-in'], ['type-out'], 'paper-still', { ground: 'file/case' }),
    line('file/case', [1, 2], ['type-in', 'sheet-in'], ['sheet-pull', 'type-out'], 'paper-still', { max: 18, ground: 'file/case' }),
    line('file/catalogue', [0, 1], ['type-in', 'sheet-in'], ['type-out', 'sheet-pull'], 'paper-still', { max: 22, ground: 'file/catalogue' }),
    line('file/sections', [1, 2], ['sheet-in', 'type-in'], ['sheet-pull'], 'paper-still', { max: 18, ground: 'file/sections' }),
    line('file/letter', [0, 1, 2], ['type-in'], ['type-out'], 'paper-still', { column: true, min: 8, max: 22, ground: 'file/letter' }),
  ] },
  motion: { enters: ['type-in', 'sheet-in'], exits: ['sheet-pull', 'type-out'], holds: ['paper-still'], curve: '條目逐字打出來，每字落下紙輕跳；換段時最上面那張被抽走' },
  grounds: { levels: lv(['file/catalogue', 'file/letter'], ['file/case', 'file/sections', 'file/catalogue'], ['file/case', 'file/sections']), quiet: ['file/folder'] },
  decor: [{ id: 'file/margin-rule', why: '紅色邊線和裝訂孔說明這是一份檔案', budget: '每頁一套' }, { id: 'file/entry-no', why: '條目編號標出這一行是第幾條', budget: '每行一個' }],
  transitions: { line: lv([''], [''], ['']), part: lv(['sheet-swap'], ['sheet-swap'], ['sheet-swap']), own: ['sheet-swap'], banned: ['burst', 'spinzoom', 'ripple', 'blurdissolve'], family: 'file' },
  peak: { loud: 'file/sections', calm: 'file/catalogue', how: '快歌分頁籤的紙疊，最上面那張是這一段；慢歌一張索引卡' },
  pieces: [],
  camera: { cams: lv([''], ['', 'dolly'], ['dolly', 'snap']), text: noText, note: '檔案平放在桌上，鏡頭只慢慢靠近' },
  levels: { '0': '索引卡或八行箋', '1': '案件表與紙疊', '2': '紙疊與案件表', calm: '一張索引卡，一句兩行' },
  pace: { every: [2, 2, 1], calmEvery: 8, repose: false, hits: [] },
  provenance: { source: 'own', process: '打字機、索引卡、分段紙疊與八行箋', nearest: '黑塗文件版型', differs: '不用黑條遮蔽、編號加密集小字的版型或檔案夾書脊；條目大字靠左，欄位只放歌的真資料' },
  acceptance: { fast: 'nun', calm: 'tsuzuki', hardest: '兩行條目時第二行換紅字，條目編號對齊每一行' },
};

export const CARD_WORLD: StyleWorld = {
  id: 'card', name: '節拍閃卡', language: 'pictogram', what: '一張主卡加一疊牌：卡在節拍上翻面，卡角的圖示和四個點標出現在第幾拍',
  lyricRole: '歌詞是節拍上翻面的閃卡：一句一張，兩行時一行一張卡',
  family: 'print',
  refuses: ['手寫', '細明體', '照片', '發光', '隨機方格', '放射光', '3×4 翻牌矩陣', '懸掛擺盪卡'],
  type: { ja: { family: 'Zen Maru Gothic', weight: 900 }, tc: { family: 'Chiron GoRound TC', weight: 800 }, latin: 'Montserrat', setting: '真的粗圓體，卡面上一句一行靠左；兩行時一行一張卡', category: 'tile' },
  palette: [
    // (board: card #F6F0E2, ink #1C1C23, grape #5B4396 on #2E2452, pine #25693F on #1F5636, tomato #C4382A darkened to #A93224
    // so the cream reads at 5.8:1 on the red card, mustard #E2A93B)
    scheme('card-grape', 'warm', 'dark', '#2E2452', '#1C1C23', '#A93224', '#C4382A', '#F6F0E2', '#1C1C23', '#3A2E68', '葡萄紫的桌面'),
    scheme('card-pine', 'earth', 'dark', '#1F5636', '#1C1C23', '#A93224', '#25693F', '#F6F0E2', '#1C1C23', '#24603E', '松綠的桌面'),
    scheme('card-table', 'cold', 'light', '#EDE5D2', '#1C1C23', '#A93224', '#5B4396', '#F6F0E2', '#1C1C23', '#E2D8C0', '米色桌面，一手扇形牌'),
    scheme('card-tomato', 'warm', 'dark', '#6E2019', '#1C1C23', '#5B4396', '#E2A93B', '#F6F0E2', '#1C1C23', '#82281F', '番茄紅的桌面'),
  ],
  groundBand: { band: 'dark', flip: 'none', why: '卡是亮的，桌面是深色；字永遠站在卡面上，所以墨一直是深色；米色桌面那一套由配色輪替帶入' },
  material: { core: 'accent', engine: 'print/flash-card', how: '印刷閃卡：12 px 厚度、硬邊陰影 (22, 30) 30%；卡角圖示對應第 1–4 拍，右上四個點標出現在第幾拍；牌背是斜紋' },
  frameStack: stack({ grain: 0.05, paper: 0, vignette: 0 }),
  timeBase: { fps: 0, unit: 'beat', curve: 'beat-flip' },
  ownInk: true, standsOnPlate: true, sheet: true,
  layouts: { pair: 'card/main', shared: [], carriers: ['card/main', 'card/calm', 'card/pair', 'card/long'], lines: [
    line('card/main', [1, 2], ['card-flip', 'card-deal'], ['card-flip-out', 'card-toss'], 'card-rest', { max: 12 }),
    line('card/calm', [0], ['card-flip-slow', 'card-deal'], ['card-flip-out', 'card-toss'], 'card-rest', { max: 22 }),
    line('card/fan', [2], ['card-flip'], ['card-toss'], 'card-rest', { max: 7, loud: true, ground: 'card/fan' }),
    line('card/pair', [1, 2], ['card-deal', 'card-flip'], ['card-toss'], 'card-rest', { min: 8, max: 22, breaks: true, ground: 'card/pair' }),
    line('card/long', [1, 2], ['card-flip', 'card-deal'], ['card-toss', 'card-flip-out'], 'card-rest', { min: 13, max: 24 }),
  ] },
  motion: { enters: ['card-flip', 'card-flip-slow', 'card-deal'], exits: ['card-flip-out', 'card-toss'], holds: ['card-rest'], curve: '快歌每拍翻一張，翻到一半只看到卡的厚度；慢歌卡停得久、翻得慢' },
  grounds: { levels: lv(['card/table'], ['card/table'], ['card/table', 'card/fan']), quiet: ['card/deck'] },
  decor: [{ id: 'card/beat-pict', why: '卡角的四分之一圓、三角、方、橫條就是第 1–4 拍', budget: '每卡一個' }, { id: 'card/beat-pips', why: '右上四個點標出現在第幾拍', budget: '每卡一組' }],
  transitions: { line: lv([''], [''], ['']), part: lv(['deck-cut'], ['deck-cut'], ['deck-cut']), own: ['deck-cut'], banned: ['brush', 'ripple', 'blurdissolve', 'wave'], family: 'flip' },
  peak: { loud: 'card/fan', calm: 'card/table', how: '快歌一手牌扇開，主卡在前；慢歌一張不傾斜的卡' },
  pieces: [],
  camera: { cams: lv([''], [''], ['', 'snap']), text: noText, note: '牌在桌上，鏡頭不動' },
  levels: { '0': '一張不傾斜的卡', '1': '主卡加牌疊', '2': '扇形牌或兩張卡', calm: '一張卡，停得久' },
  pace: { every: [2, 1, 1], calmEvery: 8, repose: true, hits: [] },
  provenance: { source: 'own', process: '印刷閃卡與牌疊', nearest: '幾何拼貼風格', differs: '一張主卡加一手牌，不是網格翻牌或懸掛卡；圖示對應節拍' },
  acceptance: { fast: 'nun', calm: 'tsuzuki', hardest: '兩行時第二張紅卡上的米白字要讀得清楚' },
};

export const CHALK_WORLD: StyleWorld = {
  id: 'chalkboard', name: '粉筆黑板', language: 'chalkboard', what: '放學後的深綠黑板：一筆一筆寫、寫完就擦，粉筆灰落到板溝',
  lyricRole: '歌詞是寫在黑板上的一堂課，寫完就擦',
  family: 'stroke',
  refuses: ['日期與值日生假資料', '數學公式', '筆畫飛入組字', '紅藍鋸齒條', '零散的星星與漩渦', '發光', '人物', '印章'],
  type: { ja: { family: 'Yomogi', weight: 400 }, tc: { family: 'Iansui', weight: 400 }, latin: 'Cormorant Garamond', setting: '細手寫，像粉筆；第二行換黃粉筆', category: 'chalk-hand' },
  palette: [
    // (board: slate #22423A, chalk white #F2F0E8, yellow #F2D46A, pink #F1A6B6, tray aluminium #7D8784)
    // (plate is the tray's aluminium, plateInk the dark of its shadowed lip)
    scheme('school-green', undefined, 'dark', '#22423A', '#F2F0E8', '#F2D46A', '#F1A6B6', '#7D8784', '#141A17', '#3F5F56', '墨綠黑板'),
    scheme('coal-board', undefined, 'dark', '#23272A', '#F4F2EA', '#F2D46A', '#9FD0EA', '#7D8784', '#141A17', '#41474B', '炭黑黑板'),
    scheme('night-slate', undefined, 'dark', '#1F2D3A', '#F2F0E8', '#F2D46A', '#F1A6B6', '#7D8784', '#141A17', '#3A4B5A', '藍黑黑板'),
    scheme('deep-green', undefined, 'dark', '#1D3A33', '#F2F0E8', '#F2D46A', '#F1A6B6', '#7D8784', '#141A17', '#355349', '深一點的墨綠黑板'),
    scheme('worn-green', undefined, 'mid', '#3A5A50', '#F4F2EA', '#F4DA78', '#F6B4C2', '#7D8784', '#141A17', '#4F6D63', '擦了一整天、變淡的綠黑板'),
  ],
  groundBand: { band: 'dark', flip: 'none', why: '整首都是深色黑板，不翻底' },
  material: { surface: 'chalk', core: 'ink2', engine: 'stroke/chalk', how: '粉末卡在板面凹處，筆畫邊有毛邊，壓力輕的地方跳過板面留下小孔；板擦留下很淡的寬弧帶' },
  frameStack: stack({ grain: 0.08, vignette: 0.3, step: 8, koma: 8 }),
  timeBase: { fps: 8, unit: 'glyph', curve: 'hand-pressure' },
  ownInk: true, sheet: true,
  layouts: { pair: 'chalkboard/lesson', shared: [], carriers: ['chalkboard/lesson'], lines: [
    line('chalkboard/lesson', [1, 2], ['chalk-hand', 'chalk-press', 'chalk-run'], ['eraser-pass', 'chalk-fade', 'palm-smear'], 'chalk-still', { max: 20 }),
    line('chalkboard/slow', [0, 1], ['chalk-hand', 'chalk-run'], ['eraser-pass', 'chalk-fade'], 'chalk-still', { max: 24 }),
    line('chalkboard/ring', [2], ['chalk-press', 'chalk-hand'], ['eraser-pass'], 'chalk-still', { max: 7, loud: true }),
    line('chalkboard/centre', [1, 2], ['chalk-press', 'chalk-run'], ['eraser-pass', 'palm-smear'], 'chalk-still', { max: 16 }),
    line('chalkboard/columns', [0, 1, 2], ['chalk-hand'], ['eraser-pass', 'palm-smear'], 'chalk-still', { column: true, min: 8, max: 22 }),
  ] },
  motion: { enters: ['chalk-hand', 'chalk-press', 'chalk-run'], exits: ['eraser-pass', 'chalk-fade', 'palm-smear'], holds: ['chalk-still'], curve: '寫的快慢，八張一秒；板擦由右往左' },
  grounds: { levels: lv(['chalkboard/slate'], ['chalkboard/slate', 'chalkboard/worn'], ['chalkboard/worn', 'chalkboard/slate']), quiet: ['chalkboard/after-class'] },
  decor: [{ id: 'chalkboard/tray', why: '黑板下緣的板溝、粉筆和板擦，說明這是真的黑板', budget: '每鏡固定' }, { id: 'chalkboard/mark', why: '底線、圈重點加箭頭、分欄線：老師寫板書時真的會畫的線', budget: '每句一種' }],
  transitions: { line: lv([''], [''], ['']), part: lv(['wipe-pass'], ['wipe-pass'], ['wipe-pass']), own: ['wipe-pass'], banned: ['shatter', 'burst', 'spinzoom', 'whip'], family: 'wipe' },
  peak: { loud: 'chalkboard/worn', calm: 'chalkboard/after-class', how: '快歌一句圈起來；慢歌空教室的光慢慢移過板面' },
  pieces: ['eraser-arcs', 'ring-word', 'board-slide'],
  pieceWords: { 'eraser-arcs': /忘|消|擦|回|やり直|重|再/, 'ring-word': /就是|一定|最|絕對|必|答|記|覚/, 'board-slide': /下一|明天|下|次|明日|未來|新/ },
  camera: { cams: lv([''], ['', 'dolly'], ['snap', 'dolly']), text: noText, note: '站在教室中間看黑板' },
  levels: { '0': '一句慢慢寫，底下一條長線', '1': '兩行板書', '2': '短句寫大、圈起來', calm: '一句一擦，光慢慢走' },
  pace: { every: [2, 2, 1], calmEvery: 8, repose: true, hits: [] },
  provenance: { source: 'own', process: '粉筆粉末、板面紋理、板擦弧痕', nearest: '無', differs: '整個世界的動作只有寫與擦；裝飾只有老師真的會畫的線' },
  acceptance: { fast: 'nun', calm: 'tsuzuki', hardest: '粉筆質感下繁中細筆畫仍清楚' },
};

export const GLASS_WORLD: StyleWorld = {
  id: 'stained-glass', name: '彩繪玻璃', language: 'stained-glass', what: '日光穿過鉛條玻璃窗：寶石色的玻璃透著光，光帶慢慢掃過，銘文帶上的字等光轉過來才亮',
  lyricRole: '歌詞是窗上的銘文帶：一整片淡色透明玻璃，用深色玻璃彩繪寫字',
  family: 'emissive',
  refuses: ['人物聖像', '十字架與宗教符號', '平塗色塊', '放射光線', '粒子', '隨機三角剖分', '碎裂線穿過字'],
  type: { ja: { family: 'Kaisei Tokumin', weight: 800 }, tc: { family: 'Noto Serif HK', weight: 900 }, latin: 'Cormorant Garamond', setting: '粗明體，銘文帶置中或直排在尖拱窗裡；圓花窗裡的短句切成兩行填滿', category: 'serif-heavy' },
  palette: [
    // (board: lead #17141B, inscription ink #2A1D1A, pale glass #EEE8CF, cobalt #2F5FB8, ruby #B3263C, amber #C98A1C, emerald #2A8A5C, violet #6C4A9C)
    scheme('cobalt-ruby', 'cold', 'mid', '#5E5A54', '#2A1D1A', '#2F5FB8', '#B3263C', '#F4EFDB', '#2A8A5C', '#C98A1C', '鈷藍與紅寶'),
    scheme('emerald-gold', 'earth', 'mid', '#5A5C52', '#2A1D1A', '#2A8A5C', '#C98A1C', '#F2F0DA', '#2F5FB8', '#B3263C', '翠綠與琥珀'),
    scheme('amethyst', 'warm', 'mid', '#5C5658', '#2A1D1A', '#6C4A9C', '#B3263C', '#F4EEE0', '#2F5FB8', '#C98A1C', '紫水晶'),
    scheme('rose-sun', 'warm', 'mid', '#605A52', '#2A1D1A', '#B3263C', '#2F5FB8', '#F6EFDA', '#2A8A5C', '#C98A1C', '紅寶玫瑰窗'),
  ],
  groundBand: { band: 'mid', flip: 'none', why: '石牆是暗的，窗是全場最亮的東西；銘文帶是淡色透明玻璃上的深色字' },
  material: { engine: 'emissive/leaded-light', core: 'ink2', how: '日光從背後穿過有色玻璃：每片玻璃中間最透、邊緣最濃，光帶掃到哪一片那片就整片亮起來；鉛條不透光，一直是暗的' },
  frameStack: stack({ grain: 0.06, vignette: 0.1 }),
  timeBase: { fps: 0, unit: 'line', curve: 'slow-sun' },
  ownInk: true, standsOnPlate: true, sheet: true,
  layouts: { pair: 'stained-glass/transom', shared: [], carriers: ['stained-glass/transom', 'stained-glass/lancet', 'stained-glass/lancets', 'stained-glass/predella'], lines: [
    line('stained-glass/transom', [0, 1, 2], ['light-come', 'pane-in'], ['light-go', 'pane-out'], 'glass-still', { min: 6, max: 20, ground: 'stained-glass/transom' }),
    line('stained-glass/lancet', [0, 1, 2], ['light-come', 'pane-in'], ['light-go'], 'glass-still', { column: true, max: 14, ground: 'stained-glass/rose-lancet' }),
    line('stained-glass/lancet-l', [0, 1, 2], ['light-come', 'pane-in'], ['light-go'], 'glass-still', { column: true, max: 14, ground: 'stained-glass/lancet-rose' }),
    line('stained-glass/roundel', [1, 2], ['pane-in', 'light-come'], ['pane-out'], 'glass-still', { max: 6, loud: true, ground: 'stained-glass/rose' }),
    line('stained-glass/predella', [0, 1, 2], ['light-come', 'pane-in'], ['light-go', 'pane-out'], 'glass-still', { max: 10, ground: 'stained-glass/predella' }),
    line('stained-glass/lancets', [0, 1, 2], ['light-come', 'pane-in'], ['light-go'], 'glass-still', { column: true, min: 10, max: 20, breaks: true, ground: 'stained-glass/lancets' }),
  ] },
  motion: { enters: ['light-come', 'pane-in'], exits: ['light-go', 'pane-out'], holds: ['glass-still'], curve: '太陽在一句裡慢慢移動，光帶掃過哪一片，那片就整片亮' },
  grounds: { levels: lv(['stained-glass/transom', 'stained-glass/rose-lancet', 'stained-glass/predella'], ['stained-glass/transom', 'stained-glass/lancets', 'stained-glass/predella'], ['stained-glass/rose', 'stained-glass/transom']), quiet: ['stained-glass/window'] },
  decor: [{ id: 'stained-glass/came', why: '鉛條是玻璃的骨架，銘文帶只有外圍雙鉛框，裡面沒有鉛條', budget: '全畫面一套' }, { id: 'stained-glass/quatrefoil', why: '四葉飾是窗的花格，不是宗教符號', budget: '每窗 4 個內' }],
  transitions: { line: lv([''], [''], ['']), part: lv(['light-turn'], ['light-turn'], ['light-turn']), own: ['light-turn'], banned: ['whip', 'shakecut', 'stripes', 'burst', 'shatter'], family: 'light' },
  peak: { loud: 'stained-glass/rose', calm: 'stained-glass/window', how: '快歌滿版圓花窗，銘文在中間的圓裡；慢歌光從一邊慢慢爬過來' },
  pieces: ['sun-sweep', 'cloud-pass', 'dawn-rise'],
  pieceWords: { 'sun-sweep': /光|天|星|日|太陽|空|朝|明|輝/, 'cloud-pass': /雲|影|暗|夜|雨|陰|曇/, 'dawn-rise': /醒|起|開始|天亮|暁|夜明け|始/ },
  camera: { cams: lv(['', 'dolly'], ['dolly'], ['dolly', 'snap']), text: noText, note: '教堂裡的人不會亂走' },
  levels: { '0': '一扇窗，光慢慢爬', '1': '寬窗或四扇尖拱窗', '2': '滿版圓花窗', calm: '一扇窗一句，光慢慢爬' },
  pace: { every: [2, 2, 1], calmEvery: 8, repose: false, hits: [] },
  provenance: { source: 'own', process: '有色玻璃的透光、鉛條結構與太陽移動', nearest: '無', differs: '字是銘文帶上的彩繪，不用宗教圖像；光是一帶帶掃過整片玻璃' },
  acceptance: { fast: 'nun', calm: 'tsuzuki', hardest: '光帶掃到銘文帶時字仍清楚，不被洗白' },
};
