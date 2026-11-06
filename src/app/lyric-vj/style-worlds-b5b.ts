// Style batch 5 (2026-11-06, 風格第5批設計稿, owner-approved boards): scrapbook, watercolor, midcentury and claymation. Each
// answers docs/research/2026-11-01-style-standard.md: a closed pool, its own material, moves, pages and set pieces, rebuilt
// from its four boards the way batch 4 was (sources out/research/boards-b5/boards), with what the board review flagged
// fixed in the boards' spirit: watercolor's every page carries real watercolour (wet edges, granulation, glazes, blooms,
// a dry-brush end, the tooth), not words on colour blobs; midcentury is pushed to unmistakable fifties modern (atomic
// starbursts, boomerangs, kidneys, Bass's cut paper, plates out of register) and its citypop-like flat waves are gone;
// claymation's clay is crisp shapes (flat clay, hard rims, prints) on the face's own strokes, never a bevel and never a
// thickened letter. Faces as the boards name them, within the font rule (2026-11-06: a Traditional Chinese face serves at
// most three worlds): scrapbook Noto Sans HK 900, watercolor Noto Serif HK 900, midcentury Chocolate Classical Sans,
// claymation Huninn; kana faces chosen so no two worlds share both faces. Near neighbours kept apart: scrapbook is colour
// papers and one even sticker alphabet (not xerox's toner and ransom letters); watercolor is a taped sheet of glazes (not
// ink-wash's one ink, not crayon's wax); midcentury is cut paper and atomic shapes on cream stock (not citypop's buildings,
// pools and sea, not popart's dots); claymation is flat clay with hard rims (not papercut's paper, not crayon).
import type { FrameStack, LinePart, Scheme, StyleWorld } from './style-world';
import type { Level } from './lineplan-core';
import type { TextCamKind } from './render/text-cam';

const stack = (o: Partial<FrameStack>): FrameStack => ({ grain: 0.06, paper: 0, tooth: 0, lift: 0, scan: 0, vignette: 0, flicker: 0, weave: 0, boil: 0, boilRate: 12, step: 0, koma: 0, ...o });
const lv = <T,>(a: T[], b: T[], c: T[]): Record<Level, T[]> => ({ 0: a, 1: b, 2: c });
const line = (set: string, levels: Level[], enters: string[], exits: string[], hold: string, o: Partial<LinePart> = {}): LinePart => ({ set, levels, enters, exits, hold, ...o });
const noText: Record<Level, TextCamKind[]> = lv([], [], []);
const scheme = (id: string, mood: Scheme['mood'], band: Scheme['band'], ground: string, ink: string, ink2: string, accent: string, plate: string, plateInk: string, faint: string, what: string): Scheme => ({ id, band, ground, ink, ink2, accent, plate, plateInk, faint, what, mood });

export const SCRAPBOOK_WORLD: StyleWorld = {
  id: 'scrapbook', name: '剪貼簿', language: 'scrapbook', what: '相簿頁上疊著格紋、點點、條紋紙，每張有硬影；黑色相角夾著的卡片、撕邊紙、橫線索引卡、車縫線、紙膠帶、票根和牛皮紙吊牌，金色星星貼紙',
  lyricRole: '歌詞是一字一張的轉印貼紙（白底、灰色裁切線、硬影，每張各自歪一點），貼在相角卡片、撕邊紙、拼貼頁中間的長條紙或索引卡上',
  family: 'layered',
  refuses: ['碳粉影印', '拼湊不同字型的勒索字', '拍立得', '紙膠帶帶字', '吊牌上的直排歌詞', '牛皮紙資料夾', '模糊陰影', '漸層'],
  type: { ja: { family: 'M PLUS Rounded 1c', weight: 900 }, tc: { family: 'Noto Sans HK', weight: 900 }, latin: 'Courier Prime', setting: '超粗黑體字母貼紙，寬字距，每張貼紙歪 ±3.5°；票根和吊牌上的小字是細黑體', category: 'sticker' },
  palette: [
    // (board: sage #9FB39A, gingham red #C8443A, navy #24365C / #1D2B4A, cream #F7F1E6, ink #1E1D24, sticker red #B3261E)
    scheme('sage-page', 'warm', 'mid', '#9FB39A', '#1E1D24', '#C8443A', '#B3261E', '#FFFFFF', '#1E1D24', '#F7F1E6', '鼠尾草綠的相簿頁，紅格紋'),
    scheme('navy-dots', 'cold', 'dark', '#1D2B4A', '#1D2B4A', '#2E4570', '#B3261E', '#FFFFFF', '#1D2B4A', '#E9DFC9', '深藍點點頁，藍色撕邊紙'),
    scheme('tomato-stripe', 'warm', 'mid', '#C9584A', '#1E1D24', '#24365C', '#B3261E', '#FFFFFF', '#1E1D24', '#F7F1E6', '番茄紅條紋頁'),
    scheme('mint-page', 'cold', 'light', '#9FC2B6', '#1E1D24', '#24365C', '#B3261E', '#FFFFFF', '#1E1D24', '#F7F1E6', '薄荷綠的相簿頁，藍格紋'),
    scheme('mustard-page', 'earth', 'mid', '#E2B044', '#1E1D24', '#C8443A', '#B3261E', '#FFFFFF', '#1E1D24', '#FBF8F0', '芥黃的相簿頁'),
    scheme('blush-page', 'warm', 'light', '#E7B7AE', '#24365C', '#3E5C8A', '#B3261E', '#FFFFFF', '#24365C', '#FBF8F0', '淡粉的相簿頁，藍字貼紙'),
  ],
  groundBand: { band: 'mid', flip: 'none', why: '字永遠在貼紙的白底上；頁面的明暗（鼠尾草、深藍點點、番茄紅）由配色輪替帶入' },
  material: { surface: 'scrap-type', core: 'ink', engine: 'layered/scrapbook-papers', how: '每張紙是平塗或花紋紙加 (4,6) 28% 硬影；撕邊有白色紙芯；貼紙是字長出的白底（15 px）、灰色裁切線（2 px）和 (3,4) 32% 硬影，從不模糊；6% 紙紋' },
  frameStack: stack({ grain: 0.06 }),
  timeBase: { fps: 0, unit: 'glyph', curve: 'press-hold' },
  ownInk: true, standsOnPlate: true, sheet: true, printsParts: true,
  layouts: { pair: 'scrapbook/dots', shared: [], carriers: ['scrapbook/card', 'scrapbook/index'], lines: [
    line('scrapbook/card', [1, 2], ['sticker-press', 'sheet-slide'], ['sticker-peel', 'page-out'], 'sticker-still', { max: 20, ground: 'scrapbook/card' }),
    line('scrapbook/card-r', [1, 2], ['sticker-press', 'sheet-slide'], ['sticker-peel', 'page-out'], 'sticker-still', { max: 20, ground: 'scrapbook/card-r' }),
    line('scrapbook/dots', [0, 1], ['sticker-press', 'sheet-slide'], ['sticker-peel', 'page-out'], 'sticker-still', { max: 26, ground: 'scrapbook/dots' }),
    line('scrapbook/spread', [2], ['sticker-press'], ['sticker-peel'], 'sticker-still', { min: 2, max: 10, loud: true, ground: 'scrapbook/spread' }),
    line('scrapbook/index', [0, 1, 2], ['sticker-press', 'sheet-slide'], ['page-out', 'sticker-peel'], 'sticker-still', { max: 22, ground: 'scrapbook/index' }),
    line('scrapbook/index-r', [0, 1, 2], ['sheet-slide', 'sticker-press'], ['page-out', 'sticker-peel'], 'sticker-still', { max: 22, ground: 'scrapbook/index-r' }),
  ] },
  motion: { enters: ['sticker-press', 'sheet-slide'], exits: ['sticker-peel', 'page-out'], holds: ['sticker-still'], curve: '貼紙一張一張從邊角壓下去（先大一點再貼平）；整張紙從下面推進來；離場時從最後一張撕起；換段時翻到下一頁' },
  grounds: { levels: lv(['scrapbook/dots', 'scrapbook/index', 'scrapbook/index-r'], ['scrapbook/card', 'scrapbook/card-r', 'scrapbook/index', 'scrapbook/index-r', 'scrapbook/dots'], ['scrapbook/spread', 'scrapbook/card']), quiet: ['scrapbook/dots'] },
  decor: [{ id: 'scrapbook/papers', why: '疊在頁上的花紋紙和硬影是剪貼簿最先被認出來的東西，永遠在字下面', budget: '每頁三到五張' }, { id: 'scrapbook/tape', why: '紙膠帶把紙固定在頁上，只壓在紙角，從不帶字', budget: '每頁一到兩條' }, { id: 'scrapbook/ticket', why: '票根和吊牌只放真資料（開場的歌名、歌手，之後是段落和時間）', budget: '每頁一張' }],
  transitions: { line: lv([''], ['album-turn', ''], ['album-turn']), part: lv(['album-turn'], ['album-turn'], ['album-turn']), own: ['album-turn'], banned: ['whip', 'shakecut', 'glitch', 'blurdissolve', 'ripple', 'burst'], family: 'album' },
  peak: { loud: 'scrapbook/spread', calm: 'scrapbook/dots', how: '快歌整頁拼紙，中間一條撕邊紙貼大字貼紙；慢歌深藍點點頁，金色星星貼紙' },
  pieces: ['star-stickers', 'ticket-stub', 'pressed-leaf'],
  pieceWords: { 'star-stickers': /星|夜|光|閃|亮|夢|あかり|輝|キラ/, 'ticket-stub': /旅|車|站|票|去|走|出發|駅|電車|遠く/, 'pressed-leaf': /葉|花|春|秋|風|樹|森|草|季節|紅葉/ },
  camera: { cams: lv([''], [''], ['']), text: noText, note: '一頁攤開的相簿，不平移不旋轉；換段時翻頁' },
  levels: { '0': '點點頁的撕邊紙或索引卡', '1': '相角卡片上的貼紙', '2': '整頁拼紙中間的大字貼紙', calm: '深藍點點頁與星星貼紙' },
  pace: { every: [3, 2, 1], calmEvery: 10, repose: false, hits: [] },
  provenance: { source: 'own', process: '手作剪貼簿：花紋紙、相角、撕紙、車縫、紙膠帶、票根、轉印字母貼紙', nearest: 'JIZURA 的紙膠帶帶字滑入、拍立得、吊牌直排', differs: '紙膠帶從不帶字、沒有拍立得、吊牌只放小字；和 xerox 不同，這裡是彩色花紋紙和同一款貼紙字，沒有碳粉和勒索字' },
  acceptance: { fast: 'nun', calm: 'tsuzuki', hardest: '貼紙白底上的字永遠 4.5:1 以上，紙膠帶與票根從不碰字' },
};

export const WATERCOLOR_WORLD: StyleWorld = {
  id: 'watercolor', name: '水彩', language: 'watercolor', what: '四邊貼著紙膠帶的冷壓水彩紙：透明的色層一層疊一層，乾掉的邊緣比較深，顏料有顆粒，回水留下花邊，筆尾乾掉成飛白，潑點；紙白是光',
  lyricRole: '歌詞是畫上去的字（字裡有濃淡、邊緣積深），或用留白膠保留下來的白字，周圍的水彩在字邊積出深邊',
  family: 'wet',
  refuses: ['模糊', '單色水墨', '蠟筆質感', '橫線格與手帳貼紙', '軟邊光暈', '色塊上直接放字', '照片', '漸層色帶'],
  type: { ja: { family: 'Shippori Mincho B1', weight: 800 }, tc: { family: 'Noto Serif HK', weight: 900 }, latin: 'Cormorant Garamond', setting: '粗明體，畫出來的字或留白字，寬字距；小字是細明體', category: 'painted' },
  palette: [
    // (board: paper #FBF8F1, indigo #1F3270, Prussian #1E4A6E, crimson #7E1620, ochre #EDB54E, cyan #7FB3C2, rose #D96A7A, tree green #1E5A5A)
    scheme('indigo-crimson', 'cold', 'light', '#FBF8F1', '#1F3270', '#7E1620', '#1E5A5A', '#FBF8F1', '#22356E', '#5A5650', '靛藍與深紅，米白冷壓紙'),
    scheme('prussian-sienna', 'earth', 'light', '#FBF8F1', '#1E4A6E', '#8E3A12', '#7E1620', '#FBF8F1', '#1D3A5E', '#5A5650', '普魯士藍與焦赭'),
    scheme('sap-rose', 'warm', 'light', '#FAF6EE', '#1E5A5A', '#7E1620', '#22356E', '#FAF6EE', '#1E4A4A', '#5A5650', '樹綠與玫瑰紅，暖白紙'),
    scheme('sepia-night', 'earth', 'light', '#F8F3E8', '#4A2A18', '#1F3270', '#7E1620', '#F8F3E8', '#2A2440', '#5A5650', '深褐與佩恩灰的夜'),
    scheme('rose-madder', 'warm', 'light', '#FBF5F0', '#7E1620', '#1F3270', '#1E5A5A', '#FBF5F0', '#5E1A30', '#5A5650', '茜紅與靛藍，暖白紙'),
    scheme('cool-sheet', 'cold', 'light', '#F6F7F4', '#22356E', '#5A1E5E', '#7E1620', '#F6F7F4', '#1F2E5E', '#5A5650', '冷白紙，群青與紫'),
  ],
  groundBand: { band: 'light', flip: 'part', why: '畫出來的字在紙白上；夜空和直筆畫的頁面是深色水彩，字留白，段落之間翻面' },
  material: { surface: 'wc-paint', core: 'ink2', engine: 'wet/watercolour-glaze', how: '每層水彩逐像素算：基本濃度 × 緩慢流動 + 0.42 × e^(−距邊 / 3.5 px) 的乾邊積色、12% 顆粒、第二種顏料在色層裡漂、回水花邊與潮線、筆尾飛白、潑點；色層用 multiply 疊出第三色；沒有任何模糊' },
  frameStack: stack({ grain: 0.04 }),
  timeBase: { fps: 0, unit: 'phrase', curve: 'brush-hold' },
  ownInk: true, sheet: true, printsParts: true,
  layouts: { pair: 'watercolor/night', shared: [], carriers: ['watercolor/strokes', 'watercolor/strokes-l'], lines: [
    line('watercolor/wash', [1, 2], ['brush-in', 'wash-in'], ['wash-dry', 'lift-out'], 'paper-still', { max: 18, ground: 'watercolor/wash' }),
    line('watercolor/wash-r', [1, 2], ['brush-in', 'wash-in'], ['wash-dry', 'lift-out'], 'paper-still', { max: 18, ground: 'watercolor/wash-r' }),
    line('watercolor/night', [0, 1], ['wash-in', 'brush-in'], ['wash-dry', 'lift-out'], 'paper-still', { max: 30, ground: 'watercolor/night' }),
    line('watercolor/bloom', [2], ['brush-in'], ['wash-dry'], 'paper-still', { min: 2, max: 6, loud: true, ground: 'watercolor/bloom' }),
    line('watercolor/strokes', [0, 1, 2], ['wash-in', 'brush-in'], ['wash-dry'], 'paper-still', { min: 5, max: 12, column: true, ground: 'watercolor/strokes' }),
    line('watercolor/strokes-l', [0, 1, 2], ['wash-in', 'brush-in'], ['wash-dry', 'lift-out'], 'paper-still', { min: 5, max: 12, column: true, ground: 'watercolor/strokes-l' }),
  ] },
  motion: { enters: ['brush-in', 'wash-in'], exits: ['wash-dry', 'lift-out'], holds: ['paper-still'], curve: '字從左往右一段一段刷進來；留白字由周圍的水彩收邊顯出來；停留時不動；換段時一層淡彩從左往右刷過' },
  grounds: { levels: lv(['watercolor/night', 'watercolor/strokes', 'watercolor/strokes-l'], ['watercolor/wash', 'watercolor/wash-r', 'watercolor/strokes', 'watercolor/strokes-l', 'watercolor/night'], ['watercolor/bloom', 'watercolor/wash']), quiet: ['watercolor/night'] },
  decor: [{ id: 'watercolor/washes', why: '透明色層的乾邊、顆粒、回水和疊色就是水彩本身；永遠在字下面，字區外才有大面積的色', budget: '每頁兩到四層' }, { id: 'watercolor/splatter', why: '筆甩出來的潑點證明是手畫的，從不落在字上', budget: '每頁一叢' }, { id: 'watercolor/tape', why: '四邊的紙膠帶是畫紙被固定在板上的樣子，也是畫面的邊', budget: '四條' }],
  transitions: { line: lv([''], ['glaze-sweep', ''], ['glaze-sweep']), part: lv(['glaze-sweep'], ['glaze-sweep'], ['glaze-sweep']), own: ['glaze-sweep'], banned: ['whip', 'shakecut', 'glitch', 'shatter', 'burst', 'stripes'], family: 'glaze' },
  peak: { loud: 'watercolor/bloom', calm: 'watercolor/night', how: '快歌幾個大字各自帶回水花邊，後面兩層淡彩疊出第三色；慢歌夜空留白字，下面是乾筆刷過的海' },
  pieces: ['splatter', 'bloom-open', 'glaze-moon'],
  pieceWords: { splatter: /雨|淚|涙|水|濺|滴|海|波|雫/, 'bloom-open': /花|開|咲|春|綻|芽/, 'glaze-moon': /月|夜|空|光|あかり|星/ },
  camera: { cams: lv([''], [''], ['']), text: noText, note: '一張貼在板上的畫紙，不平移不旋轉' },
  levels: { '0': '夜空留白字或兩道直筆畫', '1': '黃土色層上的畫出來的字', '2': '幾個大字帶回水花邊', calm: '夜空與乾筆刷過的海' },
  pace: { every: [3, 2, 1], calmEvery: 10, repose: false, hits: [] },
  provenance: { source: 'own', process: '透明水彩：濕畫、乾邊、疊色、留白膠、回水、乾筆、潑點，四邊紙膠帶固定', nearest: 'JIZURA 的手帖風格', differs: '不是手帳頁：沒有橫線、貼紙和手寫字；是一張貼在板上的畫紙，字是畫出來或留白的' },
  acceptance: { fast: 'nun', calm: 'tsuzuki', hardest: '每一頁都要看得出水彩（乾邊、顆粒、疊色、回水），字邊仍然清楚、對比 4.5:1' },
};

export const MIDCENTURY_WORLD: StyleWorld = {
  id: 'midcentury', name: '世紀中', language: 'midcentury', what: '五〇年代的唱片封套和 Saul Bass 片頭：米色厚紙上手剪的色紙，原子星芒、迴力鏢、腎形、剪紙人形的黑條，絹印的芥黃、青、橘紅、橄欖，套色微微錯開，石版印刷的顆粒',
  lyricRole: '歌詞是印在封套上的標題字：壓在手剪的色條上、在黃昏色裡、一字一塊斜切面往上爬、或唱片封套的兩條左齊色帶',
  family: 'print',
  refuses: ['波浪', '建築與泳池', '夜景', '網點', '漫畫格', '漸層', '發光', '自創人物'],
  type: { ja: { family: 'Shippori Antique B1', weight: 400 }, tc: { family: 'Chocolate Classical Sans', weight: 400 }, latin: 'Montserrat', setting: '古典黑體，字距略寬；小字字距 0.18em，用長破折號隔開', category: 'sleeve' },
  palette: [
    // (board: cream #F1E6CC, mustard #D9A426, teal #1F5F5B, orange #D2582A, olive #4E5226, ink #1E1B18)
    scheme('cream-sleeve', 'warm', 'light', '#F1E6CC', '#1E1B18', '#1F5F5B', '#B8461F', '#D9A426', '#1E1B18', '#F1E6CC', '米色封套，芥黃與青的色條'),
    scheme('mustard-sleeve', 'earth', 'mid', '#D9A426', '#1E1B18', '#1F5F5B', '#1F5F5B', '#E0A82E', '#1E1B18', '#F1E6CC', '芥黃封套，黑與米色的色條'),
    scheme('teal-print', 'cold', 'light', '#E9E0C8', '#1E1B18', '#245E6E', '#B8461F', '#E0A82E', '#1E1B18', '#F1E6CC', '偏冷的灰米，藍青色條'),
    scheme('olive-print', 'earth', 'light', '#EFE4C6', '#1E1B18', '#4E5226', '#B8461F', '#D9A426', '#1E1B18', '#F1E6CC', '橄欖與芥黃'),
    scheme('orange-sleeve', 'warm', 'light', '#F1E6CC', '#1E1B18', '#1F5F5B', '#1F5F5B', '#E07B39', '#1E1B18', '#F1E6CC', '橘紅色條的封套'),
  ],
  groundBand: { band: 'light', flip: 'part', why: '多數頁是米色厚紙；黃昏頁是加黑的深青，米色字，段落之間翻面' },
  material: { surface: 'mc-type', core: 'ink', engine: 'print/screen-print-cut', how: '絹印平塗，色版之間用 multiply 疊出第三色，色條的黑版錯開 16 px；手剪的邊有細微抖動；字的第二版錯開 3% 字級；石版顆粒是清楚的小點，沒有模糊' },
  frameStack: stack({ grain: 0.05 }),
  timeBase: { fps: 12, unit: 'beat', curve: 'limited-steps' },
  ownInk: true, sheet: true, printsParts: true,
  layouts: { pair: 'midcentury/dusk', shared: [], carriers: ['midcentury/cut', 'midcentury/sleeve'], lines: [
    line('midcentury/cut', [1, 2], ['pull-in', 'cut-slide'], ['cut-away', 'pull-out'], 'print-hold', { max: 20, ground: 'midcentury/cut' }),
    line('midcentury/cut-r', [1, 2], ['cut-slide', 'pull-in'], ['cut-away', 'pull-out'], 'print-hold', { max: 20, ground: 'midcentury/cut-r' }),
    line('midcentury/dusk', [0, 1], ['pull-in', 'cut-slide'], ['pull-out', 'cut-away'], 'print-hold', { max: 28, ground: 'midcentury/dusk' }),
    line('midcentury/planes', [2], ['pull-in'], ['cut-away'], 'print-hold', { min: 3, max: 6, loud: true, ground: 'midcentury/planes' }),
    line('midcentury/sleeve', [0, 1, 2], ['cut-slide', 'pull-in'], ['cut-away', 'pull-out'], 'print-hold', { max: 22, ground: 'midcentury/sleeve' }),
  ] },
  motion: { enters: ['pull-in', 'cut-slide'], exits: ['cut-away', 'pull-out'], holds: ['print-hold'], curve: '一版一版拉印進來（四格硬步）；剪紙從左邊滑進來停住；有限動畫，每秒 8 到 12 張；換段時一塊芥黃剪紙斜切掃過' },
  grounds: { levels: lv(['midcentury/dusk', 'midcentury/sleeve'], ['midcentury/cut', 'midcentury/cut-r', 'midcentury/sleeve', 'midcentury/dusk'], ['midcentury/planes', 'midcentury/cut']), quiet: ['midcentury/dusk'] },
  decor: [{ id: 'midcentury/atomic', why: '原子星芒、斯普尼克、迴力鏢和腎形是一眼認出五〇年代的符號，排在字區外', budget: '每頁兩到三個' }, { id: 'midcentury/bass-cut', why: 'Saul Bass 式的剪紙黑條和錯版的黑版，讓色塊是「印出來、剪出來」的', budget: '每頁一組' }],
  transitions: { line: lv([''], ['cut-wipe', ''], ['cut-wipe']), part: lv(['cut-wipe'], ['cut-wipe'], ['cut-wipe']), own: ['cut-wipe'], banned: ['blurdissolve', 'ripple', 'wave', 'glitch', 'dipwhite'], family: 'cut' },
  peak: { loud: 'midcentury/planes', calm: 'midcentury/dusk', how: '快歌一字一塊斜切面往上爬；慢歌黃昏的原子星芒和迴力鏢' },
  pieces: ['sputnik', 'boomerang-fly', 'atom-orbit'],
  pieceWords: { sputnik: /宇宙|未來|未来|衛星|星空|銀河|ロケット|宇宙船/, 'boomerang-fly': /回來|回去|回頭|轉身|帰って|戻って|戻る|ブーメラン/, 'atom-orbit': /心跳|鼓動|ドキドキ|原子|胸が/ },
  camera: { cams: lv([''], [''], ['']), text: noText, note: '一張印好的封套，不平移不旋轉；換段時剪紙斜切掃過' },
  levels: { '0': '黃昏頁或封套的兩條色帶', '1': '手剪色條上的標題字', '2': '一字一塊斜切面', calm: '黃昏的原子星芒' },
  pace: { every: [2, 2, 1], calmEvery: 8, repose: false, hits: [] },
  provenance: { source: 'own', process: '五〇年代唱片封套與 Saul Bass 片頭：手剪色紙、絹印套色、原子圖樣、石版顆粒', nearest: '無', differs: '和 citypop 不同：沒有建築、泳池、夜景和海浪；和 popart 不同：沒有網點與漫畫格；形狀全是剪紙和原子圖樣' },
  acceptance: { fast: 'nun', calm: 'tsuzuki', hardest: '錯版的第二版不讓筆畫糊在一起，色條上的字仍有 4.5:1' },
};

export const CLAYMATION_WORLD: StyleWorld = {
  id: 'claymation', name: '黏土', language: 'claymation', what: '平整的黏土板上壓著黏土字和黏土條、黏土球：每塊都是一種平塗的黏土色，左上一道亮邊、右下一道暗邊、一個硬的接觸陰影，表面是指紋和工具壓痕',
  lyricRole: '歌詞是捏好壓在黏土板上的字（字形是字體本身的筆畫，不加粗，筆畫不相黏），或壓在兩條擀平的黏土條上',
  family: 'layered',
  refuses: ['斜角浮雕', '連續明暗的立體光', '模糊陰影', '加粗到筆畫相黏', '漸層', '照片', '發光', '同心圓靶心紋'],
  type: { ja: { family: 'Zen Maru Gothic', weight: 900 }, tc: { family: 'Huninn', weight: 400 }, latin: 'Fredoka', setting: '圓體，字距略寬，不加粗；亮邊、暗邊和接觸陰影都是硬邊形狀', category: 'clay' },
  palette: [
    // (board: teal slab #2E8C8A, night #1F2C5C, yellow #F2C04B, blue #3A63B8, cream clay #FFF1D6, pink #F59AB0, orange #F2683C)
    scheme('teal-slab', 'cold', 'dark', '#1A5E5C', '#FFF1D6', '#5E1620', '#F7D35C', '#F2C04B', '#2A2440', '#F59AB0', '深青黏土板，奶油色字'),
    scheme('night-slab', 'cold', 'dark', '#1F2C5C', '#F6EBD7', '#5E1620', '#F4D46A', '#F2C04B', '#2A2440', '#F7A8BC', '夜藍黏土板'),
    scheme('blue-slab', 'cold', 'dark', '#2E4F9E', '#FFF1D6', '#5E1620', '#F7D35C', '#F5CF6A', '#2A2440', '#F59AB0', '藍色黏土板'),
    scheme('plum-slab', 'warm', 'dark', '#4E2A5E', '#FFF1D6', '#5E1620', '#F7D35C', '#F2C04B', '#2A2440', '#F7A8BC', '梅子色黏土板'),
    scheme('tomato-slab', 'warm', 'dark', '#8A2A2A', '#FFF1D6', '#5E1620', '#F7D35C', '#F2C04B', '#2A2440', '#F7A8BC', '番茄紅黏土板'),
    scheme('olive-slab', 'earth', 'dark', '#3E4A22', '#FFF1D6', '#5E1620', '#F7D35C', '#F2C04B', '#2A2440', '#F59AB0', '橄欖綠黏土板'),
    scheme('brick-slab', 'earth', 'dark', '#7A2E22', '#FFF1D6', '#5E1620', '#F7D35C', '#F2C04B', '#2A2440', '#F59AB0', '磚紅黏土板'),
  ],
  groundBand: { band: 'dark', flip: 'none', why: '字在深色黏土板上是奶油色；拼字頁和黏土條是淺色黏土，上面是深色字' },
  material: { surface: 'clay-type', core: 'ink', engine: 'layered/flat-clay', how: '每塊黏土一種平塗色；體積是兩道從自身輪廓偏移出來的硬邊（左上亮、右下暗）加一個硬的接觸陰影；指紋是三道開口的同心弧、工具壓痕是短直線，只在筆畫厚的地方；字不加粗' },
  frameStack: stack({ grain: 0.04 }),
  timeBase: { fps: 12, unit: 'glyph', curve: 'on-twos' },
  ownInk: true, sheet: true, printsParts: true,
  layouts: { pair: 'claymation/night', shared: [], carriers: ['claymation/strips', 'claymation/strips-r'], lines: [
    line('claymation/slab', [0, 1, 2], ['squash-in', 'roll-in'], ['squash-out', 'pop-off'], 'clay-boil', { max: 20, ground: 'claymation/slab' }),
    line('claymation/night', [0, 1], ['squash-in', 'roll-in'], ['squash-out', 'pop-off'], 'clay-boil', { max: 28, ground: 'claymation/night' }),
    line('claymation/letters', [2], ['squash-in'], ['pop-off'], 'clay-boil', { min: 2, max: 6, loud: true, ground: 'claymation/letters' }),
    line('claymation/strips', [0, 1], ['roll-in', 'squash-in'], ['squash-out', 'pop-off'], 'clay-boil', { max: 22, ground: 'claymation/strips' }),
    line('claymation/strips-r', [1], ['roll-in', 'squash-in'], ['squash-out', 'pop-off'], 'clay-boil', { max: 22, ground: 'claymation/strips-r' }),
  ] },
  motion: { enters: ['squash-in', 'roll-in'], exits: ['squash-out', 'pop-off'], holds: ['clay-boil'], curve: '字一個一個壓扁落下再彈起（一秒 12 張）；或滾進來；停留時每兩格微微抖一下（黏土動畫的 boil）；換段時一塊新黏土板滑進來' },
  grounds: { levels: lv(['claymation/night', 'claymation/slab', 'claymation/strips'], ['claymation/slab', 'claymation/strips', 'claymation/strips-r', 'claymation/night'], ['claymation/letters', 'claymation/slab']), quiet: ['claymation/night'] },
  decor: [{ id: 'claymation/coils', why: '擀出來的黏土條、黏土球是捏黏土的人手邊的東西，同樣的硬邊做法，排在字區外', budget: '每頁一到三組' }, { id: 'claymation/prints', why: '指紋和工具壓痕是黏土唯一的質地，取代斜角浮雕和漸層', budget: '每塊兩到三個' }],
  transitions: { line: lv([''], ['slab-slide', ''], ['slab-slide']), part: lv(['slab-slide'], ['slab-slide'], ['slab-slide']), own: ['slab-slide'], banned: ['blurdissolve', 'ripple', 'glitch', 'dipwhite', 'shatter'], family: 'clay' },
  peak: { loud: 'claymation/letters', calm: 'claymation/night', how: '快歌一字一種黏土色壓在淺色黏土板上；慢歌夜藍板上的奶油色字，下面三條黏土海' },
  pieces: ['ball-bounce', 'clay-stars', 'clay-flower'],
  pieceWords: { 'ball-bounce': /跳|彈|走|跑|蹦|踊|跳ね|はね|歩/, 'clay-stars': /星|夜|光|閃|あかり|輝/, 'clay-flower': /花|春|咲|開|芽/ },
  camera: { cams: lv([''], [''], ['']), text: noText, note: '桌上的一塊黏土板，攝影機不動；換段時換一塊板' },
  levels: { '0': '夜藍板或兩條黏土條', '1': '黏土板上的字和一條黏土蛇', '2': '一字一色的大字', calm: '夜藍板與黏土海' },
  pace: { every: [2, 2, 1], calmEvery: 8, repose: false, hits: [] },
  provenance: { source: 'own', process: '黏土定格動畫：平塗的黏土色、壓痕、硬的接觸陰影、一秒 12 張', nearest: '無', differs: '不用浮雕光影和漸層，體積只靠硬邊形狀；字不加粗；和 papercut 的紙、crayon 的蠟筆不同' },
  acceptance: { fast: 'nun', calm: 'tsuzuki', hardest: '筆畫密的字（雙、星、海）筆畫不相黏，深色板上的字 4.5:1 以上' },
};

export const B5B_WORLDS: StyleWorld[] = [SCRAPBOOK_WORLD, WATERCOLOR_WORLD, MIDCENTURY_WORLD, CLAYMATION_WORLD];
