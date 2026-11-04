// Style batch 3 (2026-11-04), the loud worlds: popart, gameshow, idol-live, y2k, psychedelic, graffiti, brutalist, citypop.
// Each answers docs/research/2026-11-01-style-standard.md: a closed pool, its own material, moves and set pieces. Two new
// engines arrive with them: the air (render/world-air.ts); graffiti was rebuilt from its round-2 board as stencil and paste-up. Near neighbours were kept
// apart on purpose: gameshow is a flat candy studio, idol-live a dark room of light; popart is three flat plates and dots,
// y2k is gloss, chrome and gradient.
import type { FrameStack, LinePart, Scheme, StyleWorld } from './style-world';
import type { Level } from './lineplan-core';
import type { TextCamKind } from './render/text-cam';
import { B3_MIRRORS } from './render/world-b3-sets';

const stack = (o: Partial<FrameStack>): FrameStack => ({ grain: 0.1, paper: 0, tooth: 0, lift: 0, scan: 0, vignette: 0.1, flicker: 0, weave: 0, boil: 0, boilRate: 12, step: 0, koma: 0, ...o });
const lv = <T,>(a: T[], b: T[], c: T[]): Record<Level, T[]> => ({ 0: a, 1: b, 2: c });
const line = (set: string, levels: Level[], enters: string[], exits: string[], hold: string, o: Partial<LinePart> = {}): LinePart => ({ set, levels, enters, exits, hold, ...o });
const noText: Record<Level, TextCamKind[]> = lv([], [], []);
const scheme = (id: string, mood: Scheme['mood'], band: Scheme['band'], ground: string, ink: string, ink2: string, accent: string, plate: string, plateInk: string, faint: string, what: string): Scheme => ({ id, band, ground, ink, ink2, accent, plate, plateInk, faint, what, mood });

const popart: StyleWorld = {
  id: 'popart', name: '普普漫畫', language: 'popart', what: '六〇年代美式漫畫的一頁：奶油色新聞紙、黑框分格、看得見的班戴網點，色版比黑版偏一點',
  lyricRole: '歌詞是這一格漫畫的台詞：說的進對話框，旁白進說明框，吼的是爆炸框上的擬聲字',
  family: 'print',
  refuses: ['漸層', '柔和陰影', '模糊', '發光', '四色以外的顏色', '照片', '手繪線條', '圓角膠囊底'],
  type: { ja: { family: 'Noto Serif JP', weight: 900 }, tc: { family: 'Noto Sans TC', weight: 900 }, latin: 'Bangers', setting: '對白粗黑體置中，旁白明朝體靠左；擬聲字黃字加黑框，青版錯位在下', category: 'comic-pop' },
  palette: [
    // (board: paper #F3EBD7, cyan #1E9FD6, magenta #E0337A, yellow #F6CF3F, key #151515)
    scheme('cmyk-news', 'warm', 'light', '#F3EBD7', '#151515', '#E0337A', '#1E9FD6', '#FFFDF6', '#151515', '#F6CF3F', '新聞紙上的洋紅、青、黃、黑'),
    scheme('cyan-first', 'cold', 'light', '#F3EBD7', '#151515', '#1E9FD6', '#E0337A', '#FFFDF6', '#151515', '#F6CF3F', '青版打頭的一頁'),
    scheme('yellow-stock', 'earth', 'mid', '#F6CF3F', '#151515', '#E0337A', '#1E9FD6', '#FFFDF6', '#151515', '#F6CF3F', '黃色印紙上的一頁'),
    scheme('cyan-page', 'cold', 'mid', '#1E9FD6', '#151515', '#E0337A', '#F6CF3F', '#FFFDF6', '#151515', '#F6CF3F', '青色印紙上的一頁'),
    scheme('pink-news', 'warm', 'light', '#F4DCD2', '#151515', '#1E9FD6', '#E0337A', '#FFFDF6', '#151515', '#F6CF3F', '粉色新聞紙'),
  ],
  groundBand: { band: 'light', flip: 'none', why: '一頁漫畫是奶油紙；黃色印紙那頁由配色輪替帶入' },
  material: { surface: 'comic-key', core: 'accent', engine: 'print/comic-page', how: '分格各有黑框，色版先印、黑版後壓並偏 (5, 3) px；陰影是轉角度的網點，大小表示深淺；擬聲字是黃字、黑框、青版錯位' },
  frameStack: stack({ grain: 0.1, paper: 0, vignette: 0 }),
  timeBase: { fps: 0, unit: 'beat', curve: 'pow-snap' },
  ownInk: true, standsOnPlate: true, sheet: true,
  layouts: { pair: 'popart/narration', shared: [], carriers: ['popart/balloon', 'popart/narration', 'popart/twin'], lines: [
    line('popart/balloon', [0, 1, 2], ['balloon-pop', 'plate-then-key'], ['balloon-shrink', 'panel-wipe'], 'page-still', { max: 16, ground: 'popart/strip' }),
    line('popart/balloon-r', [1, 2], ['balloon-pop', 'plate-then-key'], ['panel-wipe', 'balloon-shrink'], 'page-still', { max: 16, ground: 'popart/strip-r' }),
    line('popart/narration', [0, 1, 2], ['caption-slide', 'plate-then-key'], ['caption-slide-out', 'panel-wipe'], 'page-still', { max: 34, ground: 'popart/sea' }),
    line('popart/sfx', [2], ['sfx-stamp'], ['panel-wipe'], 'burst-flex', { max: 8, loud: true, ground: 'popart/blast' }),
    line('popart/twin', [0, 1, 2], ['balloon-pop', 'plate-then-key'], ['panel-wipe'], 'page-still', { min: 6, max: 18, column: true, ground: 'popart/triptych' }),
  ] },
  motion: { enters: ['balloon-pop', 'plate-then-key', 'caption-slide', 'sfx-stamp'], exits: ['balloon-shrink', 'panel-wipe', 'caption-slide-out'], holds: ['page-still', 'burst-flex'], curve: '對白框從尾巴的方向彈出，色版先到、黑版晚兩幀；旁白框只平移' },
  grounds: { levels: lv(['popart/sea', 'popart/strip'], ['popart/strip', 'popart/triptych', 'popart/strip-r'], ['popart/blast', 'popart/strip', 'popart/strip-r']), quiet: ['popart/sea'] },
  decor: [{ id: 'popart/halftone', why: '網點是印刷的陰影，越深點越大，只在分格裡', budget: '每格一片' }, { id: 'popart/gutter', why: '黑框與奶油色格線把一句話框成一格', budget: '每頁一套' }],
  transitions: { line: lv([''], ['panel-flip', ''], ['panel-flip']), part: lv(['panel-flip'], ['panel-flip'], ['panel-flip']), own: ['panel-flip'], banned: ['blurdissolve', 'ripple', 'dipwhite', 'wave'], family: 'panel' },
  peak: { loud: 'popart/blast', calm: 'popart/sea', how: '快歌整頁炸成爆炸框，擬聲字壓在上面；慢歌一格天空與海，旁白框' },
  pieces: ['speed-close', 'dot-breathe', 'comic-page-turn'],
  pieceWords: { 'speed-close': /砰|炸|爆|打|撞|衝|吼|叫|快|バン|ドン|速/, 'dot-breathe': /全部|滿|淹|溢|世界|すべて|全て|いっぱい|広/, 'comic-page-turn': /下一|然後|接著|翻|次|そして|それから|後|頁/ },
  camera: { cams: lv([''], [''], ['snap', '']), text: noText, note: '鏡頭就是頁面，不平移；只在爆點跳一下' },
  levels: { '0': '一格天空與海，旁白框', '1': '兩格或三格，對白框', '2': '爆炸框與擬聲字', calm: '一格天空與海' },
  pace: { every: [2, 2, 1], calmEvery: 8, repose: false, hits: [] },
  provenance: { source: 'own', process: '四色分版印刷、班戴網點、漫畫分格與對白框', nearest: '無', differs: '歌詞永遠在漫畫的容器裡（對白框、旁白框、擬聲字），陰影只用平網點，沒有漸層與膠帶斜紋' },
  acceptance: { fast: 'nun', calm: 'tsuzuki', hardest: '長句進對白框時框不壓字、字不出框' },
};

const gameshow: StyleWorld = {
  id: 'gameshow', name: '益智綜藝', language: 'gameshow', what: '益智節目的題目卡、ABCD 答案格、提示卡與題號盤：棚藍布景、斜切的平面燈箱板、深藍硬投影、金色底線',
  lyricRole: '歌詞是這一題：題目卡上的題目、拆成答案格的字、提示卡、題號盤中間翻成歌詞的一列',
  family: 'ui',
  refuses: ['漸層', '模糊', '發光', '圓角', '警戒斜紋膠帶', '燈泡追逐框', '假的分數'],
  type: { ja: { family: 'Zen Kaku Gothic New', weight: 900 }, tc: { family: 'Noto Sans TC', weight: 900 }, latin: 'Bungee', setting: '超粗黑體深色字在白卡上；題號、字母與標籤是 Bungee', category: 'card-type' },
  palette: [
    // (board: studio blue #1636B8, deep navy #0B1A5C, red #C8102E darkened for 4.5:1 under white, gold #FFB400, white, ink #111428)
    scheme('studio-blue', 'cold', 'dark', '#1636B8', '#111428', '#C8102E', '#FFB400', '#FFFFFF', '#111428', '#2B4FD6', '棚藍布景'),
    scheme('final-navy', 'cold', 'dark', '#0B1A5C', '#111428', '#C8102E', '#FFB400', '#FFFFFF', '#111428', '#1636B8', '決賽的深藍棚'),
    scheme('red-round', 'warm', 'mid', '#A80D26', '#111428', '#FFB400', '#FFB400', '#FFFFFF', '#111428', '#C8102E', '紅色的搶答回合'),
    scheme('teal-round', 'earth', 'dark', '#0E5A6E', '#111428', '#C8102E', '#FFB400', '#FFFFFF', '#111428', '#1636B8', '青綠的加分回合'),
    scheme('purple-round', 'warm', 'dark', '#4A1E9E', '#111428', '#C8102E', '#FFB400', '#FFFFFF', '#111428', '#1636B8', '紫色的敗部復活'),
  ],
  groundBand: { band: 'dark', flip: 'none', why: '攝影棚是飽和的藍，決賽深藍、搶答紅輪替；字永遠在白卡或金卡上' },
  material: { surface: 'card-type', core: 'accent', engine: 'ui/quiz-graphics', how: '電視字卡：平塗色板、直角、深藍硬投影往右下 14 px、金色底線；最上面是掃描線與暗角' },
  frameStack: stack({ grain: 0.04, paper: 0, vignette: 0 }),
  timeBase: { fps: 0, unit: 'beat', curve: 'push-snap' },
  ownInk: true, standsOnPlate: true, sheet: false,
  layouts: { pair: 'gameshow/hint', shared: [], carriers: ['gameshow/question', 'gameshow/answers', 'gameshow/board'], lines: [
    line('gameshow/question', [0, 1, 2], ['push-in-left', 'tile-reveal'], ['push-out-right', 'tile-hide'], 'studio-still', { max: 14, ground: 'gameshow/round' }),
    line('gameshow/answers', [1, 2], ['tile-reveal'], ['tile-hide'], 'studio-still', { min: 2, max: 5, loud: true, ground: 'gameshow/round' }),
    line('gameshow/hint', [0, 1, 2], ['push-in-left', 'tile-reveal'], ['push-out-right', 'tile-hide'], 'studio-still', { max: 34, ground: 'gameshow/hint' }),
    line('gameshow/board', [2], ['tile-reveal'], ['tile-hide'], 'studio-still', { min: 3, max: 8, loud: true, ground: 'gameshow/board' }),
    line('gameshow/qa', [1, 2], ['push-in-left', 'tile-reveal'], ['push-out-right'], 'studio-still', { min: 6, max: 18, ground: 'gameshow/qa' }),
  ] },
  motion: { enters: ['push-in-left', 'tile-reveal'], exits: ['push-out-right', 'tile-hide'], holds: ['studio-still'], curve: '題目框從左側推入，答案格依唱到的字翻開；計時條一格一格熄滅' },
  grounds: { levels: lv(['gameshow/hint', 'gameshow/round'], ['gameshow/round', 'gameshow/qa', 'gameshow/hint'], ['gameshow/board', 'gameshow/qa', 'gameshow/round']), quiet: ['gameshow/hint'] },
  decor: [{ id: 'gameshow/hard-shadow', why: '深藍硬投影讓字卡離開布景，是電視字卡的深度', budget: '每張卡一個' }, { id: 'gameshow/gold-rule', why: '金色底線把題目卡標成這一題', budget: '每張卡一條' }],
  transitions: { line: lv([''], ['panel-push', ''], ['panel-push']), part: lv(['panel-push'], ['panel-push'], ['panel-push']), own: ['panel-push'], banned: ['blurdissolve', 'ripple', 'wave', 'shatter'], family: 'push' },
  peak: { loud: 'gameshow/board', calm: 'gameshow/hint', how: '快歌題號盤翻色，中間一列翻成歌詞；慢歌一張提示卡與計時條' },
  pieces: ['timer-drain', 'board-flip', 'right-answer'],
  pieceWords: { 'timer-drain': /時間|快|等|來不及|まだ|時|急|早く/, 'board-flip': /換|選|誰|哪|どっち|だれ|選べ|翻/, 'right-answer': /對|答|贏|勝|正解|成功|當たり|やった|できた/ },
  camera: { cams: lv([''], [''], ['', 'snap']), text: noText, note: '棚內定機，只在換關卡時跳' },
  levels: { '0': '提示卡與計時條', '1': '題目卡或 Q/A 橫幅', '2': '題號盤或答案格', calm: '一張提示卡' },
  pace: { every: [1, 1, 1], calmEvery: 6, repose: false, hits: [] },
  provenance: { source: 'own', process: '益智節目的題目卡、答案格、提示卡、題號盤', nearest: '警示黃風格', differs: '不用警戒膠帶與燈泡追逐框；歌詞是題目與答案，字卡直角平塗加深藍硬投影' },
  acceptance: { fast: 'nun', calm: 'tsuzuki', hardest: '題號盤上的數字不被標籤或字蓋住、每格字完整' },
};

const idol: StyleWorld = {
  id: 'idol-live', name: '偶像周邊', language: 'idol-live', what: '偶像團體的周邊：粉色格紋上的應援團扇剪字、演唱會門票、成員色卡、歌單與大字卡',
  lyricRole: '歌詞是周邊上的字：團扇的剪字（深紫字、成員色外圈、白邊、細深紫線）、門票上的字、色卡上一字一張',
  family: 'layered',
  refuses: ['光棒', '舞台燈與光束', '黑底', '發光', '模糊的光暈', '愛心計數器', '彩虹同時出現'],
  type: { ja: { family: 'Zen Maru Gothic', weight: 900 }, tc: { family: 'Mochiy Pop One', weight: 400 }, latin: 'Fredoka', setting: '團扇剪字：深紫字，外圈依序是成員色、白、深紫細線；票券上是圓體', category: 'fan-cut' },
  palette: [
    // (board: base #FFF8FB, plum ink #2B2140; members pink #FF7EB6, blue #7CC0FF, mint #5FDCC0, lemon #FFDE5C, lilac #B79CFF)
    scheme('pink-merch', 'warm', 'light', '#FFF8FB', '#2B2140', '#FF7EB6', '#B79CFF', '#FFFFFF', '#2B2140', '#7CC0FF', '粉色格紋上的周邊'),
    scheme('lilac-merch', 'cold', 'light', '#F6F2FF', '#2B2140', '#B79CFF', '#FF7EB6', '#FFFFFF', '#2B2140', '#5FDCC0', '丁香色格紋'),
    scheme('mint-merch', 'earth', 'mid', '#E6FAF4', '#2B2140', '#5FDCC0', '#FF7EB6', '#FFFFFF', '#2B2140', '#FFDE5C', '薄荷色格紋'),
    scheme('lemon-merch', 'warm', 'light', '#FFFBE6', '#2B2140', '#FFDE5C', '#B79CFF', '#FFFFFF', '#2B2140', '#FF7EB6', '檸檬色格紋'),
    scheme('sky-merch', 'cold', 'light', '#EEF6FF', '#2B2140', '#7CC0FF', '#FF7EB6', '#FFFFFF', '#2B2140', '#5FDCC0', '天藍色格紋'),
  ],
  groundBand: { band: 'light', flip: 'none', why: '周邊是印在亮色紙上的，粉、丁香、薄荷格紋輪替；字永遠是深紫' },
  material: { surface: 'fan-letter', core: 'accent', engine: 'paper/merch', how: '團扇剪字：字先閉合再往外長出成員色、白、深紫三圈，每圈套得住；門票與卡片是白紙加接觸陰影；格紋是兩層 40 px 色條交叉' },
  frameStack: stack({ grain: 0.04, paper: 0, vignette: 0 }),
  timeBase: { fps: 0, unit: 'beat', curve: 'sticker-pop' },
  ownInk: true, standsOnPlate: true, sheet: true,
  layouts: { pair: 'idol-live/ticket', shared: [], carriers: ['idol-live/fan', 'idol-live/ticket', 'idol-live/card-col'], lines: [
    line('idol-live/fan', [0, 1, 2], ['sticker-pop', 'card-flip-in'], ['sticker-off', 'slide-away'], 'merch-still', { max: 20, ground: 'idol-live/fan' }),
    line('idol-live/ticket', [0, 1, 2], ['card-flip-in', 'sticker-pop'], ['slide-away', 'sticker-off'], 'merch-still', { max: 34, ground: 'idol-live/ticket' }),
    line('idol-live/cards', [1, 2], ['card-flip-in'], ['sticker-off'], 'merch-still', { min: 3, max: 6, loud: true, ground: 'idol-live/cards' }),
    line('idol-live/card-col', [0, 1, 2], ['sticker-pop', 'card-flip-in'], ['sticker-off'], 'merch-still', { min: 5, max: 14, column: true, ground: 'idol-live/setlist' }),
  ] },
  motion: { enters: ['sticker-pop', 'card-flip-in'], exits: ['sticker-off', 'slide-away'], holds: ['merch-still'], curve: '團扇字一個一個貼上去：先彈一下再落定；門票從畫面外滑入，色卡依拍翻面' },
  grounds: { levels: lv(['idol-live/ticket', 'idol-live/setlist'], ['idol-live/fan', 'idol-live/setlist', 'idol-live/ticket'], ['idol-live/cards', 'idol-live/fan']), quiet: ['idol-live/ticket'] },
  decor: [{ id: 'idol-live/gingham', why: '粉色格紋是周邊的紙，字與票都放在上面', budget: '全張' }, { id: 'idol-live/member-colour', why: '成員色只做外圈與色卡，字一律深紫，淺色也不會讓字讀不清', budget: '每字一色' }],
  transitions: { line: lv([''], ['merch-slide', ''], ['merch-slide']), part: lv(['merch-slide'], ['merch-slide'], ['merch-slide']), own: ['merch-slide'], banned: ['dipwhite', 'blurdissolve', 'ripple', 'wave'], family: 'slide' },
  peak: { loud: 'idol-live/cards', calm: 'idol-live/ticket', how: '快歌六張成員色卡依拍翻面，一卡一字；慢歌一張演唱會門票' },
  pieces: ['confetti-cut', 'sticker-row', 'stub-tear'],
  pieceWords: { 'confetti-cut': /最高|最棒|一起|全部|みんな|一緒|サイコー|愛してる|祝/, 'sticker-row': /你|君|あなた|きみ|大好き|喜歡|好き|心/, 'stub-tear': /再見|再會|走|離|さよなら|またね|行く|最後/ },
  camera: { cams: lv([''], [''], ['', 'snap']), text: noText, note: '周邊平放在桌上，鏡頭不動' },
  levels: { '0': '門票或直排大字卡', '1': '格紋上的團扇剪字', '2': '六張成員色卡', calm: '一張演唱會門票' },
  pace: { every: [2, 1, 1], calmEvery: 6, repose: false, hits: [] },
  provenance: { source: 'own', process: '偶像應援團扇剪字、演唱會門票、成員色卡、歌單', nearest: '無', differs: '不用光棒、舞台燈與 LED 歌詞牆；歌詞是周邊上的印刷與剪字，成員色只在外圈' },
  acceptance: { fast: 'nun', calm: 'tsuzuki', hardest: '每字的成員色外圈不壓到旁邊的字' },
};

const y2k: StyleWorld = {
  id: 'y2k', name: 'Y2K', language: 'y2k', what: '2000 年前後的 CD 單曲封套：冰白或深靛底、漸層硬邊刀形、細線軌道、星芒，48 px 點格',
  lyricRole: '歌詞是封套上的標題：粗黑體壓在左上，旁邊是向量刀形與軌道細線',
  family: 'emissive',
  refuses: ['發光暈染', '掃描線', '鍍鉻泡泡', '紫粉夕陽與透視格線', '故障雜訊', '模糊', '圓角膠囊底'],
  type: { ja: { family: 'Zen Kaku Gothic New', weight: 900 }, tc: { family: 'Noto Sans TC', weight: 900 }, latin: 'Michroma', setting: '超粗黑體靠左，字距收緊；小字是寬扁的 Michroma 大字距', category: 'cd-title' },
  palette: [
    // (board: ice #EDF1F7, navy #141A4D, periwinkle #7C8CFF, lilac #C4A8FF, aqua #5FE0D3, lime #D6FF4F only on the sparkles)
    scheme('ice-hook', 'cold', 'light', '#EDF1F7', '#141A4D', '#7C8CFF', '#3F4FD9', '#FFFFFF', '#141A4D', '#C4A8FF', '冰白封套，深靛字'),
    scheme('night-orbit', 'cold', 'dark', '#1F2A8C', '#F4F6FF', '#7C8CFF', '#D6FF4F', '#F4F6FF', '#141A4D', '#C4A8FF', '深靛夜色封套，白字'),
    scheme('lilac-sleeve', 'warm', 'light', '#F1EDFB', '#141A4D', '#C4A8FF', '#5B3FD0', '#FFFFFF', '#141A4D', '#5FE0D3', '丁香白封套'),
    scheme('aqua-night', 'earth', 'dark', '#123A6B', '#F4F6FF', '#5FE0D3', '#D6FF4F', '#F4F6FF', '#141A4D', '#7C8CFF', '深海藍夜色封套'),
    scheme('violet-night', 'warm', 'dark', '#2E1F7A', '#F4F6FF', '#C4A8FF', '#D6FF4F', '#F4F6FF', '#141A4D', '#5FE0D3', '深紫夜色封套'),
  ],
  groundBand: { band: 'light', flip: 'none', why: '冰白封套為主，深靛夜色由配色輪替帶入，同一套構圖印成暗版' },
  material: { surface: 'cd-type', core: 'ink2', engine: 'vector/cd-sleeve', how: '向量印刷：刀形是兩道弧夾出的硬邊色塊，內填長春藍、丁香、水綠的漸層；軌道是 1.5 px 細線，一條虛線；星芒四角內凹，白到萊姆到水綠' },
  frameStack: stack({ grain: 0.05, paper: 0, vignette: 0 }),
  timeBase: { fps: 0, unit: 'beat', curve: 'sweep-hold' },
  ownInk: true, sheet: true,
  layouts: { pair: 'y2k/ring', shared: [], carriers: ['y2k/hook', 'y2k/fan'], lines: [
    line('y2k/hook', [1, 2], ['glyph-rise', 'glyph-slide'], ['glyph-lift-out', 'glyph-slide-out'], 'sleeve-still', { max: 14, ground: 'y2k/hook' }),
    line('y2k/ring', [0, 1, 2], ['glyph-slide', 'glyph-rise'], ['glyph-lift-out', 'glyph-slide-out'], 'sleeve-still', { max: 34, ground: 'y2k/ring' }),
    line('y2k/fan', [1, 2], ['glyph-rise'], ['glyph-slide-out', 'glyph-lift-out'], 'sleeve-still', { max: 12, ground: 'y2k/fan' }),
    line('y2k/column', [0, 1, 2], ['glyph-rise', 'glyph-slide'], ['glyph-lift-out'], 'sleeve-still', { min: 5, max: 18, column: true, ground: 'y2k/column' }),
  ] },
  motion: { enters: ['glyph-rise', 'glyph-slide'], exits: ['glyph-lift-out', 'glyph-slide-out'], holds: ['sleeve-still'], curve: '標題不變形，只做逐字的位移淡入；刀形沿弧線掃入，星芒在拍點縮放並轉 45°' },
  grounds: { levels: lv(['y2k/ring', 'y2k/column'], ['y2k/hook', 'y2k/column', 'y2k/ring'], ['y2k/fan', 'y2k/hook']), quiet: ['y2k/ring'] },
  decor: [{ id: 'y2k/orbit', why: '軌道細線把刀形與星芒連成一個封套構圖，虛線那條在流動', budget: '每張兩到三條' }, { id: 'y2k/dot-grid', why: '淺底的 48 px 點格是封套印刷的底紋', budget: '淺底全張' }],
  transitions: { line: lv([''], ['blade-wipe', ''], ['blade-wipe']), part: lv(['blade-wipe'], ['blade-wipe'], ['blade-wipe']), own: ['blade-wipe'], banned: ['shatter', 'burst', 'blurdissolve', 'ripple'], family: 'blade' },
  peak: { loud: 'y2k/fan', calm: 'y2k/ring', how: '快歌扇形刀片依拍展開；慢歌一圈虹彩環與軌道' },
  pieces: ['spark-burst', 'blade-sweep', 'orbit-flow'],
  pieceWords: { 'spark-burst': /星|閃|光|亮|夢|キラ|輝|スター|あかり/, 'blade-sweep': /飛|快|衝|風|走|速|飛ん|走れ|風/, 'orbit-flow': /轉|繞|圈|世界|地球|回|まわ|巡|世界|空/ },
  camera: { cams: lv([''], [''], ['', 'snap']), text: noText, note: '封套不動；副歌只在進段時跳一下' },
  levels: { '0': '夜色虹彩環或直排封套', '1': '刀形與軌道封套', '2': '扇形刀片', calm: '虹彩環與軌道' },
  pace: { every: [2, 2, 1], calmEvery: 8, repose: false, hits: [] },
  provenance: { source: 'own', process: '千禧年 CD 單曲封套的向量刀形、漸層與軌道細線', nearest: '蒸氣波、糖果風格', differs: '不用紫粉夕陽、格線、泡泡與發光；冷色漸層只在硬邊刀形裡，字是粗黑體標題' },
  acceptance: { fast: 'nun', calm: 'tsuzuki', hardest: '刀形與軌道不碰標題字' },
};

const psychedelic: StyleWorld = {
  id: 'psychedelic', name: '七〇迷幻', language: 'psychedelic', what: '七〇年代絹印演唱會海報：茄紫底上層層彩虹拱、靶心太陽、圓角隧道或流動的直色帶，標題是一塊招牌字',
  lyricRole: '歌詞是海報的標題：奶油色字被一圈暗紫外框和一圈色帶包成一塊招牌',
  family: 'print',
  refuses: ['冷色螢光', '發光', '金屬', '模糊', '故障', '照片', '字後方的圓角膠囊底'],
  type: { ja: { family: 'Shippori Antique B1', weight: 400 }, tc: { family: 'Shippori Antique B1', weight: 400 }, latin: 'Shrikhand', setting: '復古圓潤黑體，奶油色，外圈先閉合再長出暗紫框與色帶', category: 'poster-ring' },
  palette: [
    // (board: plum #3A1B55, orange #F2672E, pink #F59AC0, mustard #F3BC3E, cream #F7E8C9, teal #1E8C86)
    scheme('plum-poster', 'warm', 'dark', '#3A1B55', '#F7E8C9', '#F2672E', '#F59AC0', '#F7E8C9', '#3A1B55', '#F3BC3E', '茄紫底的海報'),
    scheme('teal-poster', 'cold', 'dark', '#173F45', '#F7E8C9', '#F2672E', '#F59AC0', '#F7E8C9', '#3A1B55', '#F3BC3E', '深青綠底的海報'),
    scheme('wine-poster', 'earth', 'mid', '#6B2440', '#F7E8C9', '#F3BC3E', '#F59AC0', '#F7E8C9', '#3A1B55', '#F2672E', '酒紅底的海報'),
    scheme('rust-poster', 'warm', 'mid', '#8A3A1C', '#F7E8C9', '#F59AC0', '#1E8C86', '#F7E8C9', '#3A1B55', '#F3BC3E', '鐵鏽紅底的海報'),
    scheme('night-poster', 'cold', 'dark', '#1C1440', '#F7E8C9', '#1E8C86', '#F59AC0', '#F7E8C9', '#3A1B55', '#F3BC3E', '深夜藍紫的海報'),
  ],
  groundBand: { band: 'dark', flip: 'none', why: '絹印海報印在深色紙上，茄紫、深青綠、酒紅輪替；字永遠是奶油色加暗紫外框' },
  material: { surface: 'poster-fill', core: 'ink2', engine: 'print/screen-poster', how: '絹印：每色一版平塗、硬邊；字的外框先閉合（補滿字腔與字間）再往外長，一圈暗紫、一圈色帶，每圈都套得住；紙紋與暗角在最上面' },
  frameStack: stack({ grain: 0.09, paper: 0, vignette: 0 }),
  timeBase: { fps: 0, unit: 'beat', curve: 'band-step' },
  ownInk: true, sheet: true,
  layouts: { pair: 'psychedelic/sun', shared: [], carriers: ['psychedelic/arch', 'psychedelic/tunnel'], lines: [
    line('psychedelic/arch', [1, 2], ['sign-rise', 'band-reveal'], ['sign-sink', 'band-cover'], 'poster-still', { max: 14, ground: 'psychedelic/arches' }),
    line('psychedelic/sun', [0, 1, 2], ['band-reveal', 'sign-rise'], ['band-cover', 'sign-sink'], 'poster-still', { max: 34, ground: 'psychedelic/sun' }),
    line('psychedelic/tunnel', [2], ['sign-rise'], ['sign-sink'], 'poster-still', { max: 8, loud: true, ground: 'psychedelic/tunnel' }),
    line('psychedelic/flow', [0, 1, 2], ['band-reveal', 'sign-rise'], ['band-cover'], 'poster-still', { min: 5, max: 18, column: true, ground: 'psychedelic/flow' }),
  ] },
  motion: { enters: ['sign-rise', 'band-reveal'], exits: ['sign-sink', 'band-cover'], holds: ['poster-still'], curve: '字本身不動；拱形與隧道的色帶依拍往外一圈一圈推，形狀不變' },
  grounds: { levels: lv(['psychedelic/sun', 'psychedelic/flow'], ['psychedelic/arches', 'psychedelic/flow', 'psychedelic/sun'], ['psychedelic/tunnel', 'psychedelic/arches']), quiet: ['psychedelic/sun'] },
  decor: [{ id: 'psychedelic/sign-ring', why: '暗紫外框與色帶把一行字包成一塊招牌，是海報標題的做法', budget: '每行一塊' }, { id: 'psychedelic/vignette', why: '海報邊緣的暗角是印刷的墨重', budget: '全張' }],
  transitions: { line: lv([''], ['band-rise', ''], ['band-rise']), part: lv(['band-rise'], ['band-rise'], ['band-rise']), own: ['band-rise'], banned: ['shatter', 'whip', 'stripes', 'shakecut'], family: 'bands' },
  peak: { loud: 'psychedelic/tunnel', calm: 'psychedelic/sun', how: '快歌圓角隧道，標題在消失點；慢歌一顆靶心太陽在呼吸' },
  pieces: ['colour-push', 'sun-bloom', 'wave-swell'],
  pieceWords: { 'colour-push': /快|衝|轉|飛|跳|吼|速|回|まわ|跳ね/, 'sun-bloom': /太陽|陽|朝|日|光|暖|昇|あたた|暁|輝/, 'wave-swell': /海|浪|波|搖|晃|揺|ゆれ|流れ|水|風/ },
  camera: { cams: lv([''], [''], ['', 'snap']), text: noText, note: '海報不動，只在副歌進段跳一下' },
  levels: { '0': '靶心太陽或流動直色帶', '1': '彩虹拱', '2': '圓角隧道', calm: '靶心太陽慢慢呼吸' },
  pace: { every: [2, 2, 2], calmEvery: 8, repose: false, hits: [] },
  provenance: { source: 'own', process: '七〇年代絹印海報的平塗色版、外框招牌字、彩虹拱與歐普隧道', nearest: '無', differs: '字是閉合外框的招牌，背景是平塗色帶，沒有同心漩渦、發光或冷色' },
  acceptance: { fast: 'nun', calm: 'tsuzuki', hardest: '外框不漏進字腔、相鄰字的外框不壓到字' },
};

const graffiti: StyleWorld = {
  id: 'graffiti', name: '街頭模板噴印', language: 'graffiti', what: '一面漆過的灰泥牆：先滾一塊補漆，再用割好的模板噴字；旁邊是貼上去的絹印海報、膠帶和貼紙',
  lyricRole: '歌詞是割好的模板噴在補漆塊上的字：字腔要留橋，所以斷口在割模板的人一定得留的地方',
  family: 'wall',
  refuses: ['漸層', '模糊', '發光', '霧狀噴漆暈開', '漆滴', '手寫塗鴉 tag', '字型外框', '字後光暈', '編出來的文字'],
  type: { ja: { family: 'WDXL Lubrifont JP N', weight: 400 }, tc: { family: 'WDXL Lubrifont TC', weight: 400 }, latin: 'Big Shoulders Stencil Display', setting: '窄身工業黑體做成真的模板：字腔通往外面最細的那段筆畫切一道橋；海報與貼紙是模板窄體大寫', category: 'stencil-cut' },
  palette: [
    // (board: wall #8E8B84 under PaintedPlaster016, stencil black #151515, spray red #B3221A, navy #1C2A5C, poster orange
    // #E4572E, poster blue #2D72B8, sticker yellow #F0C02C, paper #F1EEE6, buff #E9E4D7)
    scheme('paste-up', 'earth', 'mid', '#8E8B84', '#151515', '#B3221A', '#E4572E', '#E9E4D7', '#1C2A5C', '#2D72B8', '灰泥牆上的補漆與海報'),
    scheme('night-wall', 'cold', 'dark', '#3A3835', '#151515', '#B3221A', '#E4572E', '#E9E4D7', '#1C2A5C', '#2D72B8', '夜裡的同一面牆'),
    scheme('yellow-paste', 'warm', 'mid', '#7C7A74', '#151515', '#B3221A', '#F0C02C', '#E9E4D7', '#1C2A5C', '#2D72B8', '黃色海報貼滿的牆'),
    scheme('blue-paste', 'cold', 'dark', '#5E5B56', '#151515', '#B3221A', '#2D72B8', '#E9E4D7', '#1C2A5C', '#E4572E', '藍色海報的暗牆'),
    scheme('white-wall', 'earth', 'light', '#C9C4BA', '#151515', '#B3221A', '#E4572E', '#E9E4D7', '#1C2A5C', '#2D72B8', '刷過的淺色牆'),
  ],
  groundBand: { band: 'mid', flip: 'none', why: '牆是中灰的灰泥；字永遠噴在淺色補漆或海報紙上，夜牆與淺牆由配色輪替帶入' },
  material: { surface: 'stencil', core: 'ink2', engine: 'wall/stencil-paste', how: '字是真的模板：字腔通往外面最細的筆畫切一道橋；漆是實的，邊外 2–6 px 有硬邊的單顆飛沫（6 %／1 %）；牆是 PaintedPlaster016 照片；海報是撕邊平塗加網點漸層，膠帶與貼紙都是硬邊' },
  frameStack: stack({ grain: 0.06, paper: 0, vignette: 0 }),
  timeBase: { fps: 0, unit: 'line', curve: 'slap-and-spray' },
  ownInk: true, standsOnPlate: true, sheet: true,
  layouts: { pair: 'graffiti/navy', shared: [], carriers: ['graffiti/buff', 'graffiti/navy', 'graffiti/strips'], lines: [
    line('graffiti/buff', [0, 1, 2], ['stencil-sweep', 'stencil-lift'], ['buff-out', 'peel-off'], 'paste-still', { max: 16, ground: 'graffiti/paste-up' }),
    line('graffiti/navy', [0, 1], ['stencil-lift', 'stencil-sweep'], ['buff-out'], 'paste-still', { max: 24, ground: 'graffiti/navy-buff' }),
    line('graffiti/wall', [2], ['stencil-sweep'], ['peel-off'], 'paste-still', { max: 8, loud: true, ground: 'graffiti/poster-wall' }),
    line('graffiti/strips', [0, 1, 2], ['stencil-lift'], ['peel-off'], 'paste-still', { min: 5, max: 18, column: true, ground: 'graffiti/strips' }),
  ] },
  motion: { enters: ['stencil-sweep', 'stencil-lift'], exits: ['buff-out', 'peel-off'], holds: ['paste-still'], curve: '模板啪一下貼上，噴罐沿著字掃過，字一段一段出現；換句時新海報從一角刷平，舊的撕掉；字本身不變形' },
  grounds: { levels: lv(['graffiti/navy-buff', 'graffiti/strips'], ['graffiti/paste-up', 'graffiti/strips', 'graffiti/navy-buff'], ['graffiti/poster-wall', 'graffiti/paste-up']), quiet: ['graffiti/navy-buff'] },
  decor: [{ id: 'graffiti/paste-ups', why: '貼上去的絹印海報、膠帶與貼紙是街頭牆面的語言；上面只印歌名與歌手', budget: '每頁一組，不碰字' }, { id: 'graffiti/buff', why: '補漆塊是寫手噴字前先滾的底，字一定在上面', budget: '每句一塊' }],
  transitions: { line: lv([''], ['paste-sweep', ''], ['paste-sweep']), part: lv(['paste-sweep'], ['paste-sweep'], ['paste-sweep']), own: ['paste-sweep'], banned: ['blurdissolve', 'dipwhite', 'ripple', 'wave'], family: 'paste' },
  peak: { loud: 'graffiti/poster-wall', calm: 'graffiti/navy-buff', how: '快歌整面牆貼滿撕過的海報，中間滾一大塊補漆噴大字；慢歌一塊補漆、深藍模板字與一道噴線' },
  pieces: ['sticker-slap', 'poster-tear', 'buff-roll'],
  pieceWords: { 'sticker-slap': /貼|拍|打|跳|衝|叫|吼|貼る|叩|跳ね/, 'poster-tear': /撕|破|裂|忘|離|走|捨|破れ|裂け|離れ/, 'buff-roll': /重來|蓋|塗|抹|消|新|やり直|塗り|消し|新し/ },
  camera: { cams: lv([''], [''], ['', 'snap']), text: noText, note: '站在牆前不動；爆點只跳一下' },
  levels: { '0': '一塊補漆、深藍模板字，或兩條直排海報', '1': '補漆塊與旁邊的海報、貼紙', '2': '整面海報牆上的大字', calm: '一塊補漆與一道噴線' },
  pace: { every: [2, 2, 1], calmEvery: 8, repose: false, hits: [] },
  provenance: { source: 'own', process: '真的模板切橋（字腔推出斷點）、補漆、絹印海報網點、膠帶與貼紙', nearest: 'brutalist', differs: 'brutalist 是影印紙上的網格版面；這裡是牆、補漆、撕邊海報與貼紙，字是割好的模板噴出來的' },
  acceptance: { fast: 'nun', calm: 'tsuzuki', hardest: '滿牆海報時補漆塊上的模板字仍完整清楚，貼紙與海報不碰字' },
};

const brutalist: StyleWorld = {
  id: 'brutalist', name: '影印海報', language: 'brutalist', what: '影印機印出來的海報：96 px 版心、頂部粗線與小字頁眉、分欄細線、一條訊號紅色帶、碳粉點與影印機的暗邊',
  lyricRole: '歌詞是影印海報上的大標題，整塊留在版心之內',
  family: 'print',
  refuses: ['漸層', '陰影', '發光', '淡入淡出', '旋轉的字', '超出版心', '警戒斜紋'],
  type: { ja: { family: 'Chiron Hei HK', weight: 900 }, tc: { family: 'Chiron Hei HK', weight: 900 }, latin: 'Space Mono', setting: '港式黑體最粗，字距收緊；頁眉與小字是等寬字', category: 'black-gothic' },
  palette: [
    // (board: copy paper #ECEAE3, ink #121212, signal red #BC180E darkened so red on paper passes 4.5:1)
    scheme('copy-white', 'cold', 'light', '#ECEAE3', '#121212', '#BC180E', '#BC180E', '#F2F0EA', '#121212', '#CFCCC3', '影印紙黑字'),
    scheme('copy-grey', 'earth', 'mid', '#D9D6CD', '#121212', '#BC180E', '#9E140C', '#F2F0EA', '#121212', '#BDB9AF', '影印第十次的灰紙'),
    scheme('copy-black', 'warm', 'dark', '#121212', '#F2F0EA', '#BC180E', '#E8584C', '#F2F0EA', '#121212', '#2A2A28', '反白的黑紙'),
    scheme('copy-cream', 'warm', 'light', '#EFE8D6', '#121212', '#BC180E', '#9E140C', '#F2F0EA', '#121212', '#D6CDB6', '泛黃的影印紙'),
    scheme('copy-blue', 'cold', 'light', '#E3E7EC', '#121212', '#BC180E', '#9E140C', '#F2F0EA', '#121212', '#C6CDD6', '藍灰的影印紙'),
  ],
  groundBand: { band: 'light', flip: 'none', why: '影印紙為主，反白黑紙由配色輪替帶入；場面 c 永遠是黑紙紅格' },
  material: { surface: 'xerox-type', core: 'ink2', engine: 'print/photocopy', how: '影印：字是實黑，幾顆沒燒牢的碳粉點；碳粉點散在整張紙上，邊緣有影印機的暗邊；版面由粗細線與紅色帶分割' },
  frameStack: stack({ grain: 0.12, paper: 0, vignette: 0 }),
  timeBase: { fps: 0, unit: 'beat', curve: 'xerox-cut' },
  ownInk: true, sheet: true,
  layouts: { pair: 'brutalist/footer', shared: [], carriers: ['brutalist/headline', 'brutalist/cells'], lines: [
    line('brutalist/headline', [1, 2], ['hard-cut', 'grid-jump'], ['hard-off', 'pull-off'], 'copier-feed', { max: 12, ground: 'brutalist/headline' }),
    line('brutalist/footer', [0, 1, 2], ['hard-cut', 'grid-jump'], ['hard-off', 'pull-off'], 'copier-feed', { max: 34, ground: 'brutalist/footer' }),
    line('brutalist/cells', [2], ['hard-cut'], ['hard-off'], 'copier-feed', { max: 5, loud: true, ground: 'brutalist/cells' }),
    line('brutalist/columns', [0, 1, 2], ['hard-cut', 'grid-jump'], ['hard-off'], 'copier-feed', { min: 5, max: 18, column: true, ground: 'brutalist/columns' }),
  ] },
  motion: { enters: ['hard-cut', 'grid-jump'], exits: ['hard-off', 'pull-off'], holds: ['copier-feed'], curve: '硬切代替淡入；字整塊出現，沿網格跳格；整張每兩幀抖 1 px' },
  grounds: { levels: lv(['brutalist/footer', 'brutalist/columns'], ['brutalist/headline', 'brutalist/columns', 'brutalist/footer'], ['brutalist/cells', 'brutalist/headline']), quiet: ['brutalist/footer'] },
  decor: [{ id: 'brutalist/rules', why: '粗細線與頁眉把一張紙分成版面，字永遠在版心裡', budget: '每張一套' }, { id: 'brutalist/toner', why: '碳粉點是影印機的指紋，整首同一台', budget: '全張' }],
  transitions: { line: lv(['black-bar-sweep', ''], ['black-bar-sweep'], ['black-bar-sweep']), part: lv(['black-bar-sweep'], ['black-bar-sweep'], ['black-bar-sweep']), own: ['black-bar-sweep'], banned: ['blurdissolve', 'ripple', 'dipwhite', 'pagecurl'], family: 'bar' },
  peak: { loud: 'brutalist/cells', calm: 'brutalist/footer', how: '快歌反白黑紙上四格紅框依序反白；慢歌一條紅線下的兩行字' },
  pieces: ['band-pull', 'toner-drag', 'rule-slam'],
  pieceWords: { 'band-pull': /新|換|貼|來|起|拉|張|貼|立て/, 'toner-drag': /重複|再|一樣|又|繰り返|また|同じ|何度/, 'rule-slam': /不|否|拒|停|閉|打|黙|やめ|止|一/ },
  camera: { cams: lv([''], [''], ['', 'snap']), text: noText, note: '貼在牆上不動；爆點只跳一下' },
  levels: { '0': '紅線下的兩行字或直排', '1': '大標題與紅色帶', '2': '反白黑紙與四格紅框', calm: '紅線下的兩行字' },
  pace: { every: [1, 1, 1], calmEvery: 6, repose: false, hits: [] },
  provenance: { source: 'own', process: '影印海報：網格、粗細線、頁眉小字、碳粉', nearest: '警示風格', differs: '沒有警戒斜紋與發光；字整塊在 96 px 版心之內，動作全是硬切' },
  acceptance: { fast: 'nun', calm: 'tsuzuki', hardest: '大標題留在版心內、每個字完整' },
};

const citypop: StyleWorld = {
  id: 'citypop', name: 'City Pop', language: 'citypop', what: '八〇年代平塗海報或唱片封套：白色建築與硬邊陰影、泳池、色帶分層的夜海與平面月亮、窗戶一層層亮起的天際線',
  lyricRole: '歌詞是封套上的標題：明體寬字距，旁邊一行草寫英文',
  family: 'air',
  refuses: ['寫實夕陽', '噴槍漸層', '霓虹發光', '故障', '紫粉網格', '模糊', '快速切換'],
  type: { ja: { family: 'Shippori Mincho', weight: 800 }, tc: { family: 'Noto Serif TC', weight: 900 }, latin: 'Yellowtail', setting: '粗明體寬字距，停很久；草寫英文只做小標', category: 'sleeve-serif' },
  palette: [
    // (board: sky #45B4E2, cream #F7EFDF, pink #F2A1B8, coral #EC6650, navy #1B2A5C, pool #1F84C6)
    scheme('noon-facade', 'cold', 'light', '#F7EFDF', '#1B2A5C', '#F2A1B8', '#B53A2A', '#FFFFFF', '#1B2A5C', '#45B4E2', '白天的封套，深藍字'),
    scheme('afternoon-wall', 'warm', 'light', '#F4EEE2', '#1B2A5C', '#F2A1B8', '#B53A2A', '#FFFFFF', '#1B2A5C', '#8DD5F0', '午後的粉牆'),
    scheme('night-drive', 'warm', 'dark', '#1B2350', '#F7EFDF', '#B65A86', '#F2A1B8', '#F7EFDF', '#1B2A5C', '#45B4E2', '夜裡的封套，奶油字'),
    scheme('mint-noon', 'earth', 'light', '#EEF6EF', '#1B2A5C', '#F2A1B8', '#B53A2A', '#FFFFFF', '#1B2A5C', '#45B4E2', '薄荷色的正午'),
    scheme('midnight-sea', 'cold', 'dark', '#141C44', '#F7EFDF', '#6A3A7E', '#F2A1B8', '#F7EFDF', '#1B2A5C', '#45B4E2', '深夜的海'),
  ],
  groundBand: { band: 'light', flip: 'none', why: '同一張封套有白天與夜晚兩種光，由配色輪替帶入' },
  material: { surface: 'sleeve-type', core: 'ink2', engine: 'flat/sleeve-paint', how: '平塗：每塊顏色硬邊，陰影是切出來的一塊深色，水面是一列列硬邊的波光，夜海是分層色帶；沒有漸層、沒有模糊' },
  frameStack: stack({ grain: 0.06, paper: 0, vignette: 0.16 }),
  timeBase: { fps: 0, unit: 'phrase', curve: 'slow-fade-hold' },
  ownInk: true, sheet: true,
  layouts: { pair: 'citypop/sea-title', shared: [], carriers: ['citypop/facade-title', 'citypop/column'], lines: [
    line('citypop/facade-title', [0, 1, 2], ['wide-fade', 'line-fade'], ['slow-fade', 'wide-out'], 'cover-still', { max: 15, ground: 'citypop/facade' }),
    line('citypop/sea-title', [0, 1, 2], ['line-fade', 'wide-fade'], ['slow-fade', 'wide-out'], 'cover-still', { max: 34, ground: 'citypop/moon' }),
    line('citypop/skyline-title', [1, 2], ['wide-fade'], ['wide-out', 'slow-fade'], 'cover-still', { max: 10, ground: 'citypop/skyline' }),
    line('citypop/column', [0, 1, 2], ['line-fade', 'wide-fade'], ['slow-fade'], 'cover-still', { min: 5, max: 16, column: true, ground: 'citypop/colonnade' }),
  ] },
  motion: { enters: ['wide-fade', 'line-fade'], exits: ['slow-fade', 'wide-out'], holds: ['cover-still'], curve: '字用寬字距淡入，停很久；鏡頭幾乎不動，只極慢平移' },
  grounds: { levels: lv(['citypop/moon', 'citypop/colonnade'], ['citypop/facade', 'citypop/colonnade', 'citypop/moon'], ['citypop/skyline', 'citypop/facade']), quiet: ['citypop/moon'] },
  decor: [{ id: 'citypop/cast-shadow', why: '建築的硬邊陰影說明陽光的方向，隨時間慢慢轉角度', budget: '每張一道' }, { id: 'citypop/pool-glint', why: '泳池與海面的硬邊波光在原地輪流明滅', budget: '下緣' }],
  transitions: { line: lv([''], ['sleeve-pull', ''], ['sleeve-pull']), part: lv(['sleeve-pull'], ['sleeve-pull'], ['sleeve-pull']), own: ['sleeve-pull'], banned: ['shatter', 'whip', 'shakecut', 'stripes'], family: 'sleeve' },
  peak: { loud: 'citypop/skyline', calm: 'citypop/moon', how: '快歌夜景天際線，窗戶依拍一層層亮；慢歌色帶夜海與平面月亮' },
  pieces: ['glint-run', 'star-rise', 'shadow-turn'],
  pieceWords: { 'glint-run': /水|海|泳|池|光|夏|プール|波|きらめ/, 'star-rise': /星|夜|月|晚|空|あかり|夜|月/, 'shadow-turn': /影|午後|陽|時間|日|夕|影|時/ },
  camera: { cams: lv([''], [''], ['']), text: noText, note: '鏡頭幾乎不動，封套極慢地被掃過' },
  levels: { '0': '夜海與月亮，或白柱與粉牆', '1': '白色建築與泳池', '2': '夜景天際線', calm: '色帶夜海與平面月亮' },
  pace: { every: [3, 3, 2], calmEvery: 10, repose: false, hits: [] },
  provenance: { source: 'own', process: '八〇年代平塗插畫封套：建築、硬邊陰影、泳池、分層夜海', nearest: '夕陽漸層風格', differs: '沒有寫實夕陽與噴槍漸層；全部平塗硬邊，字是寬字距明體標題' },
  acceptance: { fast: 'nun', calm: 'tsuzuki', hardest: '快歌時仍不快切，寬字距長句放得下' },
};

/** Each mirrored set (world-b3-sets.ts) joins its world as a line of its own, on its mirrored page. */
for (const w of [popart, gameshow, idol, y2k, psychedelic, graffiti, brutalist, citypop]) {
  const extra = w.layouts.lines.filter((l) => B3_MIRRORS[l.set]).map((l) => ({ ...l, set: `${l.set}-r`, ground: `${B3_MIRRORS[l.set]}-r` }));
  w.layouts.lines.push(...extra);
  for (const lvl of [0, 1, 2] as Level[]) w.grounds.levels[lvl] = [...new Set([...w.grounds.levels[lvl], ...extra.filter((l) => l.levels.includes(lvl)).map((l) => l.ground)])];
}

export const LOUD_WORLDS: StyleWorld[] = [popart, gameshow, idol, y2k, psychedelic, graffiti, brutalist, citypop];
