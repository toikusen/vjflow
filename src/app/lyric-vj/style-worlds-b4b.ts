// Style batch 4 (2026-11-05, 風格第4批設計稿, owner-approved boards): cyanotype, isometric and cel80s. Each answers
// docs/research/2026-11-01-style-standard.md: a closed pool, its own material, moves, pages and set pieces, rebuilt from its
// four boards the way batch 3 was (sources out/research/boards-b4/boards). Faces as the boards name them, within the font
// rule: cyanotype and isometric take the neutral Noto Serif TC and Noto Sans TC as a third world each (owner, 2026-11-05);
// isometric's kana take Zen Kaku Gothic New 900, since phone already pairs Noto Sans TC with Noto Sans JP. Near neighbours
// kept apart: cyanotype is brushed paper and silhouettes (not blueprint's ruled sheet, not aizome's cloth); cel80s is a
// dark anime title card, italic with a hard shadow and sunset bands (not idol-live's pastel merch, not citypop's buildings).
import type { FrameStack, LinePart, Scheme, StyleWorld } from './style-world';
import type { Level } from './lineplan-core';
import type { TextCamKind } from './render/text-cam';

const stack = (o: Partial<FrameStack>): FrameStack => ({ grain: 0.1, paper: 0, tooth: 0, lift: 0, scan: 0, vignette: 0, flicker: 0, weave: 0, boil: 0, boilRate: 12, step: 0, koma: 0, ...o });
const lv = <T,>(a: T[], b: T[], c: T[]): Record<Level, T[]> => ({ 0: a, 1: b, 2: c });
const line = (set: string, levels: Level[], enters: string[], exits: string[], hold: string, o: Partial<LinePart> = {}): LinePart => ({ set, levels, enters, exits, hold, ...o });
const noText: Record<Level, TextCamKind[]> = lv([], [], []);
const scheme = (id: string, mood: Scheme['mood'], band: Scheme['band'], ground: string, ink: string, ink2: string, accent: string, plate: string, plateInk: string, faint: string, what: string): Scheme => ({ id, band, ground, ink, ink2, accent, plate, plateInk, faint, what, mood });

export const CYANOTYPE_WORLD: StyleWorld = {
  id: 'cyanotype', name: '藍曬', language: 'cyanotype', what: '刷在白色水彩紙上的一塊普魯士藍藥水，邊緣是乾刷的毛邊；曬在上面的蕨葉、草穗、蕾絲留下白色剪影，星星是針孔',
  lyricRole: '歌詞是寫在透明片上、和植物一起曝光的白字：在兩片蕨葉之間、針孔星空下、蕾絲桌巾中間的空處，或兩張窄紙上直排',
  family: 'layered',
  refuses: ['直線與方格', '尺寸線', '布紋', '藍白以外的顏色', '發光', '模糊的光暈', '照片', '編出來的標註'],
  type: { ja: { family: 'Noto Serif JP', weight: 500 }, tc: { family: 'Noto Serif TC', weight: 700 }, latin: 'Courier Prime', setting: '白色粗明體置中，寬字距；日文細明朝；紙邊的鉛筆小字是打字機字', category: 'photogram' },
  palette: [
    // (board: Prussian #173C72 / #14335F / #1B4682, silhouette white #F4F6F8, paper #EFEBE1, pencil #77746C)
    scheme('prussian-print', 'cold', 'dark', '#173C72', '#F4F6F8', '#14335F', '#BFD3E6', '#EFEBE1', '#173C72', '#77746C', '普魯士藍的曬圖，米白水彩紙'),
    scheme('deep-print', 'cold', 'dark', '#14335F', '#F4F6F8', '#0F2A50', '#BFD3E6', '#EFEBE1', '#14335F', '#77746C', '曬得較久、較深的藍'),
    scheme('pale-print', 'earth', 'mid', '#2A5A92', '#F4F6F8', '#1B4682', '#D7E4F0', '#ECE8DC', '#173C72', '#6E6B63', '曬得較淺的藍，像陰天'),
    scheme('cool-paper', 'cold', 'dark', '#1B4682', '#F4F6F8', '#173C72', '#BFD3E6', '#E8EAE6', '#173C72', '#6E6F6B', '偏冷的白紙'),
    scheme('warm-paper', 'warm', 'dark', '#173C72', '#F4F6F8', '#14335F', '#BFD3E6', '#F1E6D2', '#173C72', '#7A7266', '偏暖的舊紙'),
  ],
  groundBand: { band: 'dark', flip: 'none', why: '字永遠在刷上藥水的藍上；紙只露在四邊，藍的深淺由配色輪替帶入' },
  material: { surface: 'cyan-type', core: 'ink2', engine: 'layered/sun-print', how: '刷塗的藥水：橫向刷痕，左右邊緣由兩層雜訊做出乾刷毛邊（每條最多斷一次），上下參差；六條暗帶是重疊的刷痕；剪影只出現在有藥水的地方，抬離紙面的葉子印成半透明' },
  frameStack: stack({ grain: 0.06, paper: 0, vignette: 0 }),
  timeBase: { fps: 0, unit: 'phrase', curve: 'develop-hold' },
  ownInk: true, sheet: true,
  layouts: { pair: 'cyanotype/stars', shared: [], carriers: ['cyanotype/doily', 'cyanotype/strips'], lines: [
    line('cyanotype/fern', [1, 2], ['expose-in', 'develop-in'], ['wash-out', 'lift-off'], 'print-still', { max: 16, ground: 'cyanotype/fern' }),
    line('cyanotype/stars', [0, 1, 2], ['develop-in', 'expose-in'], ['wash-out', 'lift-off'], 'print-still', { max: 34, ground: 'cyanotype/stars' }),
    line('cyanotype/doily', [1, 2], ['develop-in', 'expose-in'], ['wash-out'], 'print-still', { max: 10, loud: true, ground: 'cyanotype/doily' }),
    line('cyanotype/strips', [0, 1, 2], ['expose-in', 'develop-in'], ['wash-out'], 'print-still', { min: 5, max: 18, column: true, ground: 'cyanotype/strips' }),
  ] },
  motion: { enters: ['expose-in', 'develop-in'], exits: ['wash-out', 'lift-off'], holds: ['print-still'], curve: '換句時白光閃一下，新的一張由淡藍顯影到深藍，白字跟著顯出來；葉子不動；慢歌只讓針孔星星一顆一顆打開' },
  grounds: { levels: lv(['cyanotype/stars', 'cyanotype/strips'], ['cyanotype/fern', 'cyanotype/strips', 'cyanotype/stars'], ['cyanotype/doily', 'cyanotype/fern']), quiet: ['cyanotype/stars'] },
  decor: [{ id: 'cyanotype/brush-edge', why: '藥水是手刷上去的：左右邊緣的乾刷毛邊和上下的參差，是藍曬和藍圖最大的差別', budget: '每張紙一塊到三塊' }, { id: 'cyanotype/silhouette', why: '曬在紙上的植物和蕾絲留下白色剪影，是這個世界的主角，永遠排在字區外', budget: '每頁兩片到三片' }],
  transitions: { line: lv([''], ['exposure-flash', ''], ['exposure-flash']), part: lv(['exposure-flash'], ['exposure-flash'], ['exposure-flash']), own: ['exposure-flash'], banned: ['whip', 'shakecut', 'stripes', 'burst', 'shatter', 'ripple'], family: 'exposure' },
  peak: { loud: 'cyanotype/doily', calm: 'cyanotype/stars', how: '快歌一圈蕾絲桌巾，字在中間空的地方；慢歌針孔星空，下半段是較淺的海' },
  pieces: ['pinhole-open', 'frond-print', 'lace-print'],
  pieceWords: { 'pinhole-open': /星|夜|光|空|宇宙|あかり|星座|夜空/, 'frond-print': /葉|花|草|樹|森|春|夏|綠|緑|風/, 'lace-print': /回憶|記得|從前|思念|思い出|昔|記憶|手紙|約束|約定/ },
  camera: { cams: lv([''], [''], ['']), text: noText, note: '一張曬好的相紙，不平移不旋轉；換段時才被推近一下' },
  levels: { '0': '針孔星空或兩張窄紙', '1': '兩片蕨葉之間的標題', '2': '蕾絲桌巾中間的一句', calm: '針孔星空與較淺的海' },
  pace: { every: [3, 2, 1], calmEvery: 10, repose: false, hits: [] },
  provenance: { source: 'own', process: '藍曬（鐵鹽感光）：手刷藥水、放上植物與蕾絲在陽光下曝光、水洗顯影', nearest: '無', differs: '沒有方格與尺寸線（那是藍圖），沒有布紋（那是藍染）；字是透明片上的白字，剪影都排在字區外' },
  acceptance: { fast: 'nun', calm: 'tsuzuki', hardest: '蕨葉與蕾絲不碰字、刷痕暗帶上的白字仍有 4.5:1' },
};

export const ISOMETRIC_WORLD: StyleWorld = {
  id: 'isometric', name: '等角空間', language: 'isometric', what: '30° 等角投影的小世界：方塊、階梯、平台、牆角，每塊三個面三階平塗（頂面亮、左面中、右面暗），沒有描邊、沒有透視',
  lyricRole: '歌詞是貼在牆面上的字，只沿兩個牆面方向：樓梯側牆往右上、平台正面往右下、一塊方塊一個字、或牆角的一面牆',
  family: 'ui',
  refuses: ['透視', '描邊', '漸層', '陰影', '旋轉的鏡頭', '三個方向以外的線', '寫實材質', '發光'],
  type: { ja: { family: 'Zen Kaku Gothic New', weight: 900 }, tc: { family: 'Noto Sans TC', weight: 900 }, latin: 'Montserrat', setting: '超粗黑體，深墨字在淺色面上、白字在深色牆上；字跟著牆面變形', category: 'iso-wall' },
  palette: [
    // (board: grounds #2D3A8C, #151C47, #F0E9DA, #E9E2D3; block tones cream, coral, mustard, teal, deep teal, blue; ink #1C2350)
    scheme('night-blocks', 'cold', 'dark', '#2D3A8C', '#1C2350', '#FFFDF7', '#B8432F', '#EFE7D7', '#1C2350', '#4A56B0', '群青底上的積木'),
    scheme('deep-night', 'cold', 'dark', '#151C47', '#1C2350', '#FFFDF7', '#B8432F', '#EFE7D7', '#1C2350', '#4C7BE0', '深夜的海邊平台'),
    scheme('cream-day', 'warm', 'light', '#F0E9DA', '#1C2350', '#FFFDF7', '#B8432F', '#EFE7D7', '#1C2350', '#CFC4AE', '白天的米色城市'),
    scheme('sand-room', 'earth', 'light', '#E9E2D3', '#1C2350', '#FFFDF7', '#B8432F', '#EFE7D7', '#1C2350', '#CFC4AE', '沙色的房間'),
  ],
  groundBand: { band: 'dark', flip: 'none', why: '字永遠在方塊的面上；夜裡是群青底，白天是米色底，由配色輪替帶入' },
  material: { surface: 'iso-type', core: 'plateInk', engine: 'ui/isometric-blocks', how: '每塊方塊三個面三階平塗，不描邊不加漸層；牆面上的字用同一個等角變形貼上去；4% 顆粒' },
  frameStack: stack({ grain: 0.04, paper: 0, vignette: 0 }),
  timeBase: { fps: 0, unit: 'beat', curve: 'rise-snap' },
  ownInk: true, standsOnPlate: true, sheet: true,
  layouts: { pair: 'isometric/terrace', shared: [], carriers: ['isometric/stairs', 'isometric/blocks', 'isometric/corner'], lines: [
    line('isometric/stairs', [1, 2], ['block-rise', 'face-slide'], ['block-sink', 'face-slide-out'], 'iso-still', { max: 14, ground: 'isometric/stairs' }),
    line('isometric/terrace', [0, 1, 2], ['face-slide', 'block-rise'], ['face-slide-out', 'block-sink'], 'iso-still', { max: 30, ground: 'isometric/terrace' }),
    line('isometric/blocks', [2], ['block-rise'], ['block-sink'], 'iso-still', { min: 3, max: 6, loud: true, ground: 'isometric/blocks' }),
    line('isometric/corner', [0, 1, 2], ['face-slide', 'block-rise'], ['face-slide-out'], 'iso-still', { max: 18, ground: 'isometric/corner' }),
    line('isometric/corner-l', [0, 1, 2], ['face-slide', 'block-rise'], ['face-slide-out'], 'iso-still', { max: 18, ground: 'isometric/corner-l' }),
  ] },
  motion: { enters: ['block-rise', 'face-slide'], exits: ['block-sink', 'face-slide-out'], holds: ['iso-still'], curve: '牆從地面長上來，字跟著面一起升起；或沿自己的牆面方向滑進來；樓梯一拍亮一階；換段時鏡頭沿等角方向平移，不旋轉' },
  grounds: { levels: lv(['isometric/terrace', 'isometric/corner', 'isometric/corner-l'], ['isometric/stairs', 'isometric/corner', 'isometric/corner-l', 'isometric/terrace'], ['isometric/blocks', 'isometric/stairs']), quiet: ['isometric/terrace'] },
  decor: [{ id: 'isometric/props', why: '旁邊的小方塊和高柱是同一個積木世界的東西，說明這裡是一個空間，永遠不站在字上', budget: '每頁三到四塊' }, { id: 'isometric/tones', why: '三階明度就是光的方向：頂面亮、左面中、右面暗，不用陰影和漸層', budget: '每塊三面' }],
  transitions: { line: lv([''], ['tile-run', ''], ['tile-run']), part: lv(['tile-run'], ['tile-run'], ['tile-run']), own: ['tile-run'], banned: ['blurdissolve', 'ripple', 'wave', 'dipwhite', 'shatter', 'whip'], family: 'iso' },
  peak: { loud: 'isometric/blocks', calm: 'isometric/terrace', how: '快歌一個字一塊方塊，方塊逐階降低；慢歌海邊的米白平台，金色小方塊是星' },
  pieces: ['city-rise', 'cube-hop', 'gold-stars'],
  pieceWords: { 'city-rise': /城|街|樓|高|建|世界|都市|ビル|町|未來|未来/, 'cube-hop': /走|跳|步|跑|一步|歩|跳ね|走れ|前進/, 'gold-stars': /星|光|夜|亮|空|あかり|夢|輝/ },
  camera: { cams: lv([''], [''], ['']), text: noText, note: '鏡頭只在換段時沿等角方向平移，不旋轉、不加透視' },
  levels: { '0': '米白平台或牆角的一面牆', '1': '樓梯側牆、牆角', '2': '一字一塊的方塊城市', calm: '海邊的平台' },
  pace: { every: [2, 2, 1], calmEvery: 8, repose: false, hits: [] },
  provenance: { source: 'own', process: '等角投影的積木世界：方塊、樓梯、平台、牆角，三階平塗', nearest: '無', differs: '字跟著牆面以等角變形貼上，只有兩個牆面方向；沒有透視與描邊；跟 card 的平面翻卡不同，這裡是有體積的空間' },
  acceptance: { fast: 'nun', calm: 'tsuzuki', hardest: '斜的牆面上字仍好讀：字夠大、深墨對淺面、白字對深牆，牆永遠比字長' },
};

export const CEL80S_WORLD: StyleWorld = {
  id: 'cel80s', name: '八〇動畫', language: 'cel80s', what: '八〇年代電視動畫的片頭與片尾：噴槍的夕暮與夜空、細長菱形組成的十字星芒、平行速度線、暗色的賽璐璐色帶，粉紅、青、紫，一點膠片顆粒',
  lyricRole: '歌詞是動畫的標題卡和字幕：斜體標題字（奶油色、靛色內圈、洋紅外圈、硬投影），夕暮裡的白色字幕，眼位卡的一個大字，片尾的兩行直排',
  family: 'film',
  refuses: ['透視格線', '霓虹空心字', '發光', '錄影帶時間碼', '黑底彩邊加顆粒', '粉彩格紋', '平塗建築與泳池', '霓虹閃爍'],
  type: { ja: { family: 'Zen Kaku Gothic New', weight: 900 }, tc: { family: 'Shippori Antique B1', weight: 400 }, latin: 'Righteous', setting: '標題字斜 9°，奶油色填色、靛色內圈 8%、洋紅外圈 20%、硬投影 7%；字幕白色粗黑體寬字距；英文小字 Righteous', category: 'anime-title' },
  palette: [
    // (board: indigo #1D1645, deep #120C30, violet #4B2A84, magenta #E0407E, cyan #33C3DD, cream #FFF4E2, yellow #FFD24A, peach #FF9F7A)
    scheme('anime-dusk', 'warm', 'dark', '#1D1645', '#FFF4E2', '#E0407E', '#FFD24A', '#4B2A84', '#120C30', '#33C3DD', '靛色夜空，洋紅外圈'),
    scheme('anime-night', 'cold', 'dark', '#161236', '#FFF4E2', '#33C3DD', '#FFD24A', '#3A2470', '#0C0824', '#E0407E', '深夜的片頭，青色外圈'),
    scheme('anime-sunset', 'warm', 'mid', '#4B2A84', '#FFF4E2', '#E0407E', '#FFD24A', '#6A3FA8', '#1D1645', '#33C3DD', '紫色的夕暮'),
    scheme('anime-ending', 'earth', 'dark', '#1D1645', '#FFF4E2', '#FF9F7A', '#FFD24A', '#4B2A84', '#120C30', '#33C3DD', '片尾的蜜桃色外圈'),
  ],
  groundBand: { band: 'dark', flip: 'none', why: '動畫的片頭片尾都是暗色的夜空與夕暮；字在暗色色帶或暗色面板上' },
  material: { surface: 'cel-type', core: 'accent', engine: 'film/anime-cel', how: '噴槍天空是漸層，其他全部硬邊賽璐璐：速度線是尖頭長條，星芒是細長菱形，色帶與斜切面板平塗；標題字三層描邊從字長出來，從不跨進字裡；8% 顆粒加少量白色片塵' },
  frameStack: stack({ grain: 0.08, paper: 0, vignette: 0 }),
  timeBase: { fps: 0, unit: 'beat', curve: 'cel-snap' },
  ownInk: true, sheet: true,
  layouts: { pair: 'cel80s/dusk', shared: [], carriers: ['cel80s/title', 'cel80s/ending'], lines: [
    line('cel80s/title', [1, 2], ['cel-zoom', 'streak-wipe'], ['cel-cut-out', 'streak-out'], 'cel-still', { max: 16, ground: 'cel80s/title' }),
    line('cel80s/dusk', [0, 1, 2], ['streak-wipe', 'cel-zoom'], ['streak-out', 'cel-cut-out'], 'cel-still', { max: 34, ground: 'cel80s/dusk' }),
    line('cel80s/eyecatch', [2], ['cel-zoom'], ['cel-cut-out'], 'cel-still', { min: 2, max: 6, loud: true, ground: 'cel80s/eyecatch' }),
    line('cel80s/ending', [0, 1, 2], ['streak-wipe'], ['streak-out'], 'cel-still', { min: 5, max: 18, column: true, ground: 'cel80s/ending' }),
  ] },
  motion: { enters: ['cel-zoom', 'streak-wipe'], exits: ['cel-cut-out', 'streak-out'], holds: ['cel-still'], curve: '標題用頓格放大進場：連續三張賽璐璐，最後一格停住；星芒在拍點縮放一次，速度線一直往左流；慢歌只讓流星劃過一次；不做霓虹閃爍' },
  grounds: { levels: lv(['cel80s/dusk', 'cel80s/ending'], ['cel80s/title', 'cel80s/ending', 'cel80s/dusk'], ['cel80s/eyecatch', 'cel80s/title']), quiet: ['cel80s/dusk'] },
  decor: [{ id: 'cel80s/streaks', why: '速度線是動畫表現速度的方法，一直往左流，藏在標題色帶後面', budget: '上下兩區' }, { id: 'cel80s/glints', why: '十字星芒是八〇動畫的光，用細長菱形畫，不加光暈', budget: '每頁四到六顆，不碰字' }],
  transitions: { line: lv([''], ['cel-wipe', ''], ['cel-wipe']), part: lv(['cel-wipe'], ['cel-wipe'], ['cel-wipe']), own: ['cel-wipe'], banned: ['blurdissolve', 'ripple', 'dipwhite', 'wave', 'glitch'], family: 'cel' },
  peak: { loud: 'cel80s/eyecatch', calm: 'cel80s/dusk', how: '快歌眼位卡：一個大字在夕陽色帶裡；慢歌夕暮的白色字幕，流星劃過一次' },
  pieces: ['glint-burst', 'shooting-star', 'speed-rush'],
  pieceWords: { 'glint-burst': /閃|光|亮|夢|輝|キラ|きらめ|奇蹟/, 'shooting-star': /流星|流れ|星|願|夜空|願い/, 'speed-rush': /快|衝|飛|跑|速|走|急|走れ|飛ぶ|駆け/ },
  camera: { cams: lv([''], [''], ['']), text: noText, note: '畫面是一張張賽璐璐，不平移；換段時斜切進來一次' },
  levels: { '0': '夕暮的字幕或片尾的兩行直排', '1': '速度線前的標題卡', '2': '眼位卡的大字', calm: '夕暮與流星' },
  pace: { every: [2, 2, 1], calmEvery: 8, repose: false, hits: [] },
  provenance: { source: 'own', process: '八〇年代電視動畫的片頭片尾：噴槍背景、賽璐璐色帶、十字星芒、速度線、標題字', nearest: 'JIZURA 的透視格線、霓虹空心字、錄影帶 HUD', differs: '沒有透視格線、空心字和時間碼；字是實心斜體加硬投影；跟 idol-live 的粉彩格紋周邊、citypop 的平塗建築都不同' },
  acceptance: { fast: 'nun', calm: 'tsuzuki', hardest: '三層描邊的字不糊、描邊不跨進字裡，速度線永遠在色帶後面' },
};

export const B4B_WORLDS: StyleWorld[] = [CYANOTYPE_WORLD, ISOMETRIC_WORLD, CEL80S_WORLD];
