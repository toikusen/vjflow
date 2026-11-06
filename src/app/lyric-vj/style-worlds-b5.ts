// Style batch 5 (owner-approved boards 2026-11-06, ~/Desktop/vj/output/風格第5批設計稿_2026-11-06; sources
// out/research/boards-b5/boards): embroidery, screentone, art-deco and notebook. Each answers
// docs/research/2026-11-01-style-standard.md: a closed pool, its own material, moves, pages and set pieces, rebuilt from its
// four boards the way batch 4 was (render/world-b5-*.ts, world-b5-sets.ts). The line is the one thing to read (the
// receipt's focus rule): one large lyric, every hoop, panel, plaque and page drawn round it and kept under it.
// Faces as the boards name them, within the font table (free-styles.spec.ts, owner 2026-11-06: three worlds a face):
// embroidery's letters are redrawn in thread (a satin fill and a cross-stitch grid), so its face is not counted, as the
// receipt's dots are not; art-deco's kana take Kaisei Tokumin, since cyanotype already pairs Noto Serif TC with Noto Serif
// JP. Near neighbours kept apart: embroidery is thread raised on a weave (not aizome's resist-dyed cloth, not crayon's
// strokes); screentone is a black-and-white manga page, tone sheets and vertical balloons (not popart's colour comic);
// art-deco is a strict axis, thin gold rules and stepped frames (not gothic-lolita's carving, not stained-glass's lead,
// not chiyogami's seigaiha); notebook is paper and pen only (no tape or stickers: that is scrapbook).
import type { FrameStack, LinePart, Scheme, StyleWorld } from './style-world';
import type { Level } from './lineplan-core';
import type { TextCamKind } from './render/text-cam';
import { B5_MIRRORS } from './render/world-b5-sets';

const stack = (o: Partial<FrameStack>): FrameStack => ({ grain: 0.1, paper: 0, tooth: 0, lift: 0, scan: 0, vignette: 0, flicker: 0, weave: 0, boil: 0, boilRate: 12, step: 0, koma: 0, ...o });
const lv = <T,>(a: T[], b: T[], c: T[]): Record<Level, T[]> => ({ 0: a, 1: b, 2: c });
const line = (set: string, levels: Level[], enters: string[], exits: string[], hold: string, o: Partial<LinePart> = {}): LinePart => ({ set, levels, enters, exits, hold, ...o });
const noText: Record<Level, TextCamKind[]> = lv([], [], []);
const scheme = (id: string, mood: Scheme['mood'], band: Scheme['band'], ground: string, ink: string, ink2: string, accent: string, plate: string, plateInk: string, faint: string, what: string): Scheme => ({ id, band, ground, ink, ink2, accent, plate, plateInk, faint, what, mood });

export const EMBROIDERY_WORLD: StyleWorld = {
  id: 'embroidery', name: '刺繡', language: 'embroidery', what: '繃在木頭繡框裡的麻布：緞面針腳一針一針繡出的字，回針繡的外框，法式結粒繡的星，平針繡的海，十字繡的樣本布',
  lyricRole: '歌詞是繡在繃好的布上的字：大繡框裡兩色繡線兩行、夜藍小繡框裡的米白繡線、十字繡樣本布中間的大字、繡框裡兩行直排',
  family: 'layered',
  refuses: ['染出來的花紋', '筆觸與蠟筆', '模糊與發光', '寫實照片布料', '縫紉機字', '編出來的繡字'],
  type: { ja: { family: 'Noto Sans JP', weight: 900 }, tc: { family: 'Noto Sans HK', weight: 900 }, latin: 'Noto Sans HK', setting: '特粗黑體只當針腳的外形，每個字的針腳方向各不相同；樣本布上的字照十字格一格一針', category: 'satin-stitch' },
  palette: [
    // (board: linen #EEE6D4 / #F0E9DA, night linen #26365A; thread blue #1C2850, red #7A1B1B, cream #F2EBD9, gold #E3B758;
    // walls #2E4638 / #1B2030 / #B5533C). plate is the linen the words are stitched on, ink2 the night linen, faint the
    // cream thread that is stitched on it
    scheme('linen-pine', 'earth', 'dark', '#2E4638', '#1C2850', '#26365A', '#7A1B1B', '#EEE6D4', '#1C2850', '#F2EBD9', '松綠牆上的麻布繡框，藍紅繡線'),
    scheme('linen-olive', 'earth', 'dark', '#3B4630', '#1C2850', '#2A3A52', '#7A1B1B', '#F0E9DA', '#1C2850', '#F2EBD9', '橄欖牆上的麻布'),
    scheme('linen-brick', 'warm', 'mid', '#B5533C', '#1C2850', '#26365A', '#7A1B1B', '#F0E9DA', '#1C2850', '#F2EBD9', '赤陶牆上的大繡框'),
    scheme('linen-umber', 'warm', 'dark', '#5C3A2A', '#1C2850', '#2E3550', '#7A1B1B', '#EEE6D4', '#1C2850', '#F2EBD9', '深棕牆上的麻布'),
    scheme('night-navy', 'cold', 'dark', '#1B2030', '#1C2850', '#26365A', '#7A1B1B', '#EEE6D4', '#1C2850', '#F2EBD9', '夜藍牆，夜藍麻布與米白繡線'),
    scheme('night-slate', 'cold', 'dark', '#232A36', '#1C2850', '#22324F', '#7A1B1B', '#E9E4D8', '#1C2850', '#F2EBD9', '石板灰牆上的冷色麻布'),
  ],
  groundBand: { band: 'dark', flip: 'none', why: '字永遠繡在麻布上：亮的麻布配深色繡線，夜藍麻布配米白繡線；牆色由配色輪替帶入' },
  material: { surface: 'satin', core: 'ink2', engine: 'layered/needlework', how: '平紋麻布紗距 3.4 px，每條紗各自明暗；緞面針距 3.3 px、每針最長 46 px（超過就長短交錯），每針中段亮 20%、兩端暗 32%，每個字方向不同；回針繡外框虛線 9／3.5；繡線浮起的硬影 (3,4) 16%，邊緣不模糊' },
  frameStack: stack({ grain: 0.05, vignette: 0 }),
  timeBase: { fps: 0, unit: 'glyph', curve: 'needle-step' },
  ownInk: true, standsOnPlate: true, sheet: true,
  layouts: { pair: 'embroidery/night', shared: [], carriers: ['embroidery/hoop', 'embroidery/columns'], lines: [
    line('embroidery/hoop', [1, 2], ['needle-in', 'hoop-in'], ['unpick', 'hoop-out'], 'cloth-still', { max: 30, ground: 'embroidery/hoop' }),
    line('embroidery/night', [0, 1], ['needle-in', 'hoop-in'], ['hoop-out', 'unpick'], 'cloth-still', { max: 30, ground: 'embroidery/night' }),
    line('embroidery/sampler', [2], ['needle-in'], ['hoop-out'], 'cloth-still', { min: 2, max: 6, loud: true, ground: 'embroidery/sampler' }),
    line('embroidery/columns', [0, 1, 2], ['needle-in', 'hoop-in'], ['unpick'], 'cloth-still', { min: 4, max: 18, column: true, breaks: true, ground: 'embroidery/columns' }),
    line('embroidery/hoop-low', [0, 1], ['hoop-in', 'needle-in'], ['unpick', 'hoop-out'], 'cloth-still', { max: 24, ground: 'embroidery/hoop-low' }),
  ] },
  motion: { enters: ['needle-in', 'hoop-in'], exits: ['unpick', 'hoop-out'], holds: ['cloth-still'], curve: '字一針一針往前繡，一個字繡完才換下一個；換段時繡框往旁邊滑出去，換下一塊布；慢歌的結粒星一顆一顆打結出現' },
  grounds: { levels: lv(['embroidery/night', 'embroidery/columns', 'embroidery/hoop-low'], ['embroidery/hoop', 'embroidery/columns', 'embroidery/night', 'embroidery/hoop-low'], ['embroidery/sampler', 'embroidery/hoop']), quiet: ['embroidery/night'] },
  decor: [{ id: 'embroidery/hoop-rim', why: '木頭繡框的雙圈與銅螺絲說明這是一塊繃好的布，永遠圈住字', budget: '每頁一個' }, { id: 'embroidery/weave', why: '平紋麻布的經緯讓針腳有東西可以浮在上面', budget: '繡框裡滿版' }],
  transitions: { line: lv([''], ['hoop-swap', ''], ['hoop-swap']), part: lv(['hoop-swap'], ['hoop-swap'], ['hoop-swap']), own: ['hoop-swap'], banned: ['blurdissolve', 'ripple', 'glitch', 'burst', 'shatter'], family: 'hoop' },
  peak: { loud: 'embroidery/sampler', calm: 'embroidery/night', how: '快歌是十字繡樣本布，一個詞一格一針繡滿；慢歌夜藍小繡框，結粒星一顆一顆打上去' },
  pieces: ['knot-stars', 'running-wave', 'thread-line'],
  pieceWords: { 'knot-stars': /星|夜空|光|あかり|輝|閃|夢/, 'running-wave': /海|波|河|水|流|雨|涙|川|浪/, 'thread-line': /線|縫|結|牽|繋|絆|つなが|糸|編|連/ },
  camera: { cams: lv([''], [''], ['']), text: noText, note: '繡框掛在牆上，不旋轉；換段時才斜著推近一下' },
  levels: { '0': '夜藍小繡框或繡框裡的直排', '1': '大繡框裡兩色繡線', '2': '十字繡樣本布的大字', calm: '夜藍小繡框與結粒星' },
  pace: { every: [2, 2, 1], calmEvery: 8, repose: false, hits: [] },
  provenance: { source: 'own', process: '手繡：木頭繡框繃布、緞面繡、回針繡、法式結粒繡、平針繡、十字繡樣本布', nearest: '無（JIZURA 沒有刺繡零件）', differs: '和 aizome 的防染布不同，這裡是線浮在布面上；和 crayon、chalkboard 的筆觸不同，這裡是針腳' },
  acceptance: { fast: 'nun', calm: 'tsuzuki', hardest: '針腳方向各不相同的字仍一眼可讀、繡框永遠圈住整行字' },
};

export const SCREENTONE_WORLD: StyleWorld = {
  id: 'screentone', name: '漫畫網點', language: 'screentone', what: '黑白漫畫的一頁：黑框加白色間隔的分格、45° 網點紙一階一階的漸層、集中線與速度線、爆炸對話框與直排橢圓框、旁白方框、擬聲字',
  lyricRole: '歌詞是台詞和擬聲字：爆炸框裡直排喊出來的話、旁白方框裡的直排、穿過分格的大擬聲字、兩個直排對話框',
  family: 'stroke',
  refuses: ['彩色', '彩色網點與粗外框（那是 popart）', '集中線衝入', '斜切三格推軌', '海報網格', '發光與模糊', '編出來的台詞'],
  type: { ja: { family: 'Zen Antique', weight: 400 }, tc: { family: 'Cactus Classical Serif', weight: 400 }, latin: 'Cactus Classical Serif', setting: '台詞用漫畫翻譯常用的明體，直排；擬聲字外圈黑 24%、內圈白 16% 再疊原字', category: 'manga-mincho' },
  palette: [
    // (board: #111 and white only, no third colour; the papers differ by a shade of stock, never by a hue)
    scheme('manga-white', 'cold', 'light', '#FFFFFF', '#111111', '#141414', '#111111', '#FFFFFF', '#111111', '#111111', '白色原稿紙'),
    scheme('manga-grey', 'cold', 'light', '#F2F2F0', '#111111', '#141414', '#111111', '#F2F2F0', '#111111', '#111111', '冷灰的單行本紙'),
    scheme('manga-cream', 'warm', 'light', '#F8F4E8', '#111111', '#141414', '#111111', '#F8F4E8', '#111111', '#111111', '米色的雜誌紙'),
    scheme('manga-ivory', 'warm', 'light', '#FBF7EE', '#111111', '#141414', '#111111', '#FBF7EE', '#111111', '#111111', '象牙色的單行本紙'),
    scheme('manga-pulp', 'earth', 'light', '#F1EDE2', '#111111', '#141414', '#111111', '#F1EDE2', '#111111', '#111111', '週刊誌的再生紙'),
    scheme('manga-straw', 'earth', 'light', '#F4EFDD', '#111111', '#141414', '#111111', '#F4EFDD', '#111111', '#111111', '略黃的舊漫畫紙'),
  ],
  groundBand: { band: 'light', flip: 'none', why: '漫畫原稿是白紙黑墨；暗的是網點的階數，不是翻底' },
  material: { surface: 'tone-type', core: 'ink', engine: 'stroke/manga-page', how: '網點 9 px 間距、45°，點半徑分四階 1.6／2.3／3.1，最深一階是黑底白點 2.4，一階一階不連續；框線 7 px、格與格之間留白；擬聲字外圈黑 24%、內圈白 16%，從字長出來不跨進字裡' },
  frameStack: stack({ grain: 0, vignette: 0 }),
  timeBase: { fps: 0, unit: 'beat', curve: 'panel-pop' },
  ownInk: true, sheet: true, callSlot: 'ink',
  layouts: { pair: 'screentone/narration', shared: [], carriers: ['screentone/shout', 'screentone/balloons', 'screentone/caption', 'screentone/burst'], lines: [
    line('screentone/shout', [1, 2], ['panel-pop', 'koma-cut'], ['koma-out', 'page-flip-out'], 'ink-still', { min: 4, max: 16, column: true, breaks: true, ground: 'screentone/shout' }),
    line('screentone/narration', [0, 1], ['koma-cut', 'panel-pop'], ['page-flip-out', 'koma-out'], 'ink-still', { min: 4, max: 20, column: true, breaks: true, ground: 'screentone/narration' }),
    line('screentone/sfx', [2], ['sfx-slam'], ['koma-out'], 'ink-still', { min: 1, max: 6, loud: true, ground: 'screentone/sfx' }),
    line('screentone/balloons', [0, 1, 2], ['panel-pop', 'koma-cut'], ['koma-out', 'page-flip-out'], 'ink-still', { min: 4, max: 18, column: true, breaks: true, ground: 'screentone/balloons' }),
    line('screentone/burst', [1, 2], ['panel-pop', 'koma-cut'], ['koma-out', 'page-flip-out'], 'ink-still', { max: 18, ground: 'screentone/burst' }),
    line('screentone/caption', [0, 1, 2], ['koma-cut', 'panel-pop'], ['page-flip-out', 'koma-out'], 'ink-still', { max: 30, ground: 'screentone/caption' }),
  ] },
  motion: { enters: ['panel-pop', 'koma-cut', 'sfx-slam'], exits: ['koma-out', 'page-flip-out'], holds: ['ink-still'], curve: '一格一格亮起來，台詞框跟著拍點彈出（只到 1.06，不過衝）；擬聲字在重音那一拍蓋上去，停兩格；換段時整頁翻走' },
  grounds: { levels: lv(['screentone/narration', 'screentone/caption', 'screentone/balloons'], ['screentone/shout', 'screentone/burst', 'screentone/balloons', 'screentone/caption', 'screentone/narration'], ['screentone/sfx', 'screentone/shout', 'screentone/burst', 'screentone/caption']), quiet: ['screentone/narration'] },
  decor: [{ id: 'screentone/panels', why: '黑框加白色間隔的分格是漫畫的頁，字永遠在一格裡或一個框裡', budget: '每頁一到四格' }, { id: 'screentone/tone', why: '網點紙一階一階的漸層和線網是黑白漫畫唯一的灰', budget: '每格一種網點' }],
  transitions: { line: lv([''], ['manga-flip', ''], ['manga-flip']), part: lv(['manga-flip'], ['manga-flip'], ['manga-flip']), own: ['manga-flip'], banned: ['blurdissolve', 'ripple', 'wave', 'glitch', 'dipwhite'], family: 'manga-page' },
  peak: { loud: 'screentone/sfx', calm: 'screentone/narration', how: '快歌一個大擬聲字穿過四格；慢歌一格寬的網點夜空，旁白方框直排' },
  pieces: ['tone-flash', 'scratch-stars', 'manga-speed'],
  pieceWords: { 'tone-flash': /驚|衝|怒|叫|喊|吼|炸|爆|叫ぶ|驚い|！|!/, 'scratch-stars': /星|光|夢|閃|輝|キラ|きらめ|夜空/, 'manga-speed': /跑|飛|衝|走|速|快|駆|走れ|飛ぶ|急/ },
  camera: { cams: lv([''], [''], ['']), text: noText, note: '一頁漫畫平放，不平移不旋轉；換段時斜著推近一下' },
  levels: { '0': '旁白方框或直排對話框', '1': '爆炸框裡的直排台詞', '2': '穿過分格的大擬聲字', calm: '網點夜空與旁白方框' },
  pace: { every: [2, 2, 1], calmEvery: 8, repose: false, hits: [] },
  provenance: { source: 'own', process: '日式黑白漫畫原稿：分格、網點紙、集中線、速度線、對話框、旁白框、手寫擬聲字', nearest: 'JIZURA 的集中線爆擊進場與斜切三格分鏡推軌；我們的 popart（彩色美式漫畫）', differs: '集中線只當背景，不衝入；換格用翻頁，不做三格推軌；純黑白、網點紙與直排框，沒有彩色網點與粗外框' },
  acceptance: { fast: 'nun', calm: 'tsuzuki', hardest: '擬聲字的細橫筆在外圈黑白環裡仍讀得出、直排框永遠圈住整行' },
};

export const ART_DECO_WORLD: StyleWorld = {
  id: 'art-deco', name: '裝飾藝術', language: 'art-deco', what: '一九二〇到三〇年代的戲院招牌與電影海報：嚴格中軸對稱，黑或祖母綠底，金色細線的日芒、階梯框角、扇形紋與山形紋，瘦高的字',
  lyricRole: '歌詞是戲院招牌和海報上的標題字：日芒前的黑色字牌、祖母綠的階梯拱窗、扇形紋中間的米色匾額、兩根階梯柱上的直排',
  family: 'print',
  refuses: ['金屬漸層', '粒子閃光', '雕花與暗黑童話', '鉛條與透光', '青海波與日本紋樣', '發光', '斜放的字'],
  type: { ja: { family: 'Kaisei Tokumin', weight: 800 }, tc: { family: 'Noto Serif TC', weight: 900 }, latin: 'Noto Serif TC', setting: '特粗明體橫向壓成 75%、加大字距，置中；第二句金色；小字是寬字距的細明體', category: 'deco-condensed' },
  palette: [
    // (board: black #101014, gold #C9A45C / #E3C987, cream #EFE3C8, emerald #0D4A3C; gold only on 1.2–2.6 px lines and the
    // second phrase, never a metal gradient). ink cream, ink2 the pale gold phrase, faint the gold rule, plate the cream plaque
    scheme('deco-onyx', 'warm', 'dark', '#101014', '#EFE3C8', '#E3C987', '#C9A45C', '#EFE3C8', '#101014', '#C9A45C', '黑底金線'),
    scheme('deco-umber', 'warm', 'dark', '#1A1511', '#EFE3C8', '#E3C987', '#C9A45C', '#EFE3C8', '#1A1511', '#C9A45C', '深棕底金線，舊戲院'),
    scheme('deco-emerald', 'earth', 'dark', '#0D4A3C', '#EFE3C8', '#E3C987', '#C9A45C', '#EFE3C8', '#0D4A3C', '#C9A45C', '祖母綠底金線'),
    scheme('deco-jade', 'earth', 'dark', '#123B33', '#EFE3C8', '#E3C987', '#C9A45C', '#EFE3C8', '#123B33', '#C9A45C', '深玉綠底金線'),
    scheme('deco-midnight', 'cold', 'dark', '#0F1626', '#EFE3C8', '#E3C987', '#C9A45C', '#EFE3C8', '#0F1626', '#C9A45C', '午夜藍底金線'),
    scheme('deco-slate', 'cold', 'dark', '#15171C', '#E8E6E0', '#D7DBE0', '#AEB4BC', '#E8E6E0', '#15171C', '#AEB4BC', '石墨底銀線'),
  ],
  groundBand: { band: 'dark', flip: 'none', why: '戲院招牌在夜裡、海報是黑或祖母綠底；亮的只有字和金線，匾額是米色' },
  material: { surface: 'deco-type', core: 'ink2', engine: 'print/deco-poster', how: '字是平塗的米色與淡金，不加金屬漸層；金線 1.2 到 2.6 px，日芒三條一粗；階梯框兩條平行線；扇形紋與山形紋都是細線；6% 紙紋' },
  frameStack: stack({ grain: 0.06, paper: 0, vignette: 0 }),
  timeBase: { fps: 0, unit: 'phrase', curve: 'axis-open' },
  ownInk: true, sheet: true,
  layouts: { pair: 'art-deco/arch', shared: [], carriers: ['art-deco/marquee', 'art-deco/plaque', 'art-deco/pillars'], lines: [
    line('art-deco/marquee', [0, 1, 2], ['axis-open', 'deco-rise'], ['axis-close', 'deco-fall'], 'marquee-still', { max: 30, ground: 'art-deco/marquee' }),
    line('art-deco/arch', [0, 1], ['deco-rise', 'axis-open'], ['deco-fall', 'axis-close'], 'marquee-still', { max: 30, ground: 'art-deco/arch' }),
    line('art-deco/marquee-low', [0, 1, 2], ['deco-rise', 'axis-open'], ['deco-fall', 'axis-close'], 'marquee-still', { max: 30, ground: 'art-deco/marquee-low' }),
    line('art-deco/plaque', [1, 2], ['axis-open'], ['axis-close'], 'marquee-still', { min: 2, max: 10, loud: true, ground: 'art-deco/plaque' }),
    line('art-deco/pillars', [0, 1, 2], ['deco-rise', 'axis-open'], ['deco-fall'], 'marquee-still', { min: 4, max: 18, column: true, breaks: true, ground: 'art-deco/pillars' }),
  ] },
  motion: { enters: ['axis-open', 'deco-rise'], exits: ['axis-close', 'deco-fall'], holds: ['marquee-still'], curve: '從中軸往兩側對稱打開，日芒的線一條一條畫出來，字最後整行亮起；換段時兩扇門往中間關上再打開' },
  grounds: { levels: lv(['art-deco/arch', 'art-deco/pillars', 'art-deco/marquee', 'art-deco/marquee-low'], ['art-deco/marquee', 'art-deco/marquee-low', 'art-deco/pillars', 'art-deco/arch', 'art-deco/plaque'], ['art-deco/plaque', 'art-deco/marquee', 'art-deco/marquee-low']), quiet: ['art-deco/arch'] },
  decor: [{ id: 'art-deco/sunburst', why: '從中軸下方放射的日芒是裝飾藝術最認得出的線，永遠在字牌後面', budget: '每頁一組' }, { id: 'art-deco/stepped-frame', why: '階梯狀的框角與雙線把字牌框住，嚴格中軸對稱', budget: '每頁一個框' }],
  transitions: { line: lv([''], ['deco-doors', ''], ['deco-doors']), part: lv(['deco-doors'], ['deco-doors'], ['deco-doors']), own: ['deco-doors'], banned: ['blurdissolve', 'ripple', 'glitch', 'whip', 'shakecut'], family: 'doors' },
  peak: { loud: 'art-deco/plaque', calm: 'art-deco/arch', how: '快歌滿版扇形紋中間一塊米色階梯匾額；慢歌祖母綠的階梯拱窗，下方山形紋的海' },
  pieces: ['deco-rays', 'chevron-climb', 'diamond-scatter'],
  pieceWords: { 'deco-rays': /光|太陽|朝|陽|輝|晴|明|日|照/, 'chevron-climb': /上|昇|升|高|登|頂|上が|昇る|飛/, 'diamond-scatter': /星|夜|鑽|寶|宝|きらめ|星座|夢/ },
  camera: { cams: lv([''], [''], ['']), text: noText, note: '海報沿中軸，不平移不旋轉；換段時沿中軸推近一下' },
  levels: { '0': '祖母綠拱窗或兩根柱上的直排', '1': '日芒前的黑色字牌', '2': '扇形紋中間的米色匾額', calm: '拱窗與山形紋的海' },
  pace: { every: [2, 2, 1], calmEvery: 8, repose: false, hits: [] },
  provenance: { source: 'own', process: '裝飾藝術時期的戲院招牌與電影海報：中軸對稱、日芒、階梯框、扇形紋、山形紋、瘦高字', nearest: 'JIZURA 的「金夜風格」（細節沒有足夠資料比對）', differs: '嚴格中軸、只畫細線、階梯框；沒有金屬漸層與粒子閃光；扇紋有放射線、海是山形紋，不用青海波' },
  acceptance: { fast: 'nun', calm: 'tsuzuki', hardest: '壓窄的特粗明體筆畫不黏在一起、日芒的線永遠在字牌後面不穿過字' },
};

export const NOTEBOOK_WORLD: StyleWorld = {
  id: 'notebook', name: '筆記本', language: 'notebook', what: '攤開的筆記本：淡藍橫線、紅色邊線、線圈和打洞、頁首的編號與日期欄，麥克筆、原子筆、鉛筆寫的字，圈字、劃線、螢光筆和旁點',
  lyricRole: '歌詞是自己寫在筆記本上的字：麥克筆寫的兩行加螢光筆、鉛筆寫的一句加波浪線、記者簿上框兩圈的大字、直排格本的兩行',
  family: 'stroke',
  refuses: ['紙膠帶與貼紙', '稿紙格', '視窗框', '粉筆與蠟筆', '模糊與發光', '編出來的筆記內容'],
  type: { ja: { family: 'LXGW Marker Gothic', weight: 400 }, tc: { family: 'LXGW Marker Gothic', weight: 400 }, latin: 'Noto Sans TC', setting: '麥克筆黑體，每個字各自轉 ±2°、上下偏一點，像手寫；鉛筆頁淡一點帶石墨顆粒；印刷的標籤是細黑體', category: 'marker-hand' },
  palette: [
    // (board: paper #FBF9F3, rules #A7C6E6, margin #E07F7F, ink #1C1C22, ballpoint #2443A3, highlighter #FFE24F, pencil
    // #3E4048, desk #2A2A30). plate the page, ink the marker, ink2 the pencil, accent the ballpoint, faint the rule
    scheme('ruled-white', 'cold', 'dark', '#2A2A30', '#1C1C22', '#3E4048', '#2443A3', '#FBF9F3', '#1C1C22', '#A7C6E6', '深灰桌上的白色橫線本'),
    scheme('ruled-navy', 'cold', 'dark', '#232A3A', '#1C1C22', '#3E4048', '#2443A3', '#F8F8F4', '#1C1C22', '#A7C6E6', '藏青桌上的白紙'),
    scheme('ruled-cream', 'warm', 'dark', '#3A2E28', '#1C1C22', '#3E4048', '#2443A3', '#F6F2E7', '#1C1C22', '#9DB3CC', '深棕桌上的米色筆記本'),
    scheme('ruled-ivory', 'warm', 'dark', '#2E2622', '#1C1C22', '#3E4048', '#2443A3', '#FAF5E8', '#1C1C22', '#A7C6E6', '舊桌上的象牙紙'),
    scheme('ruled-moss', 'earth', 'dark', '#2F3B36', '#1C1C22', '#3E4048', '#2443A3', '#FBF9F3', '#1C1C22', '#A7C6E6', '墨綠桌上的筆記本'),
    scheme('ruled-oak', 'earth', 'mid', '#5A4636', '#1C1C22', '#3E4048', '#2443A3', '#F8F5EC', '#1C1C22', '#A7C6E6', '橡木桌上的筆記本'),
  ],
  groundBand: { band: 'dark', flip: 'none', why: '桌面是深色，字永遠寫在紙上；紙色和桌色由配色輪替帶入' },
  material: { surface: 'marker-type', core: 'ink2', engine: 'stroke/notebook-pen', how: '麥克筆字每個字各自轉 ±2°、上下偏一點；橫線 2 px，在字的周圍 8 px 斷開（紙色描邊）；原子筆畫 5 px；鉛筆頁帶 10% 石墨顆粒；紙紋 multiply 22%' },
  frameStack: stack({ grain: 0.05, paper: 0, vignette: 0 }),
  timeBase: { fps: 0, unit: 'glyph', curve: 'pen-stroke' },
  ownInk: true, standsOnPlate: true, sheet: true,
  layouts: { pair: 'notebook/dotted', shared: [], carriers: ['notebook/spiral', 'notebook/reporter', 'notebook/vertical'], lines: [
    line('notebook/spiral', [0, 1, 2], ['pen-write', 'leaf-in'], ['erase-out', 'leaf-off'], 'notebook-still', { max: 30, ground: 'notebook/spiral' }),
    line('notebook/dotted', [0, 1], ['pencil-write', 'leaf-in'], ['erase-out', 'leaf-off'], 'notebook-still', { max: 30, ground: 'notebook/dotted' }),
    line('notebook/reporter', [1, 2], ['pen-write'], ['leaf-off'], 'notebook-still', { min: 3, max: 16, loud: true, ground: 'notebook/reporter' }),
    line('notebook/vertical', [0, 1, 2], ['pen-write', 'leaf-in'], ['erase-out'], 'notebook-still', { min: 4, max: 18, column: true, breaks: true, ground: 'notebook/vertical' }),
  ] },
  motion: { enters: ['pen-write', 'pencil-write', 'leaf-in'], exits: ['erase-out', 'leaf-off'], holds: ['notebook-still'], curve: '字照順序一個一個寫出來；圈字、劃線、螢光筆在重拍上一筆畫完；換段時翻頁' },
  grounds: { levels: lv(['notebook/dotted', 'notebook/vertical', 'notebook/spiral'], ['notebook/spiral', 'notebook/vertical', 'notebook/dotted', 'notebook/reporter'], ['notebook/reporter', 'notebook/spiral']), quiet: ['notebook/dotted'] },
  decor: [{ id: 'notebook/binding', why: '線圈和打洞說明這是一本筆記本，永遠在紙邊，不碰字', budget: '每頁一排' }, { id: 'notebook/rules', why: '淡藍橫線、紅色邊線或直排格線是紙本身，在字的周圍斷開', budget: '每頁一種' }],
  transitions: { line: lv([''], ['notebook-turn', ''], ['notebook-turn']), part: lv(['notebook-turn'], ['notebook-turn'], ['notebook-turn']), own: ['notebook-turn'], banned: ['blurdissolve', 'ripple', 'glitch', 'burst', 'shatter'], family: 'leaf' },
  peak: { loud: 'notebook/reporter', calm: 'notebook/dotted', how: '快歌記者簿上麥克筆大字框兩圈，原子筆小字加兩條底線；慢歌鉛筆字加一條波浪線' },
  pieces: ['doodle-star', 'margin-arrow', 'tick-list'],
  pieceWords: { 'doodle-star': /星|夜|夢|願|あかり|光/, 'margin-arrow': /走|去|向|前|往|進|向か|行く|進め/, 'tick-list': /記得|記住|約定|答應|約束|覚え|忘れない|忘不/ },
  camera: { cams: lv([''], [''], ['']), text: noText, note: '筆記本攤在桌上，鏡頭不動；換段時翻頁' },
  levels: { '0': '鉛筆寫的點線頁或直排格本', '1': '線圈本上的麥克筆兩行', '2': '記者簿上框兩圈的大字', calm: '鉛筆字加波浪線' },
  pace: { every: [2, 2, 1], calmEvery: 8, repose: false, hits: [] },
  provenance: { source: 'own', process: '大人的筆記用品：線圈筆記本、記者簿、直排格本，麥克筆、原子筆、鉛筆、螢光筆', nearest: 'JIZURA 的記事本 UI 視窗與稿紙格落字', differs: '沒有視窗框；直排頁是格線不是稿紙格；只有紙和筆，沒有貼的東西（那是 scrapbook）' },
  acceptance: { fast: 'nun', calm: 'tsuzuki', hardest: '橫線在字旁斷開不穿過字、螢光筆與圈線不碰到筆畫' },
};

/** Each turned set (world-b5-sets B5_MIRRORS) joins its world as a line of its own, on its turned page. */
for (const w of [EMBROIDERY_WORLD, SCREENTONE_WORLD, NOTEBOOK_WORLD]) {
  const extra = w.layouts.lines.filter((l) => B5_MIRRORS.includes(l.set)).map((l) => ({ ...l, set: `${l.set}-r`, ground: `${l.ground}-r` }));
  w.layouts.lines.push(...extra);
  for (const lvl of [0, 1, 2] as Level[]) w.grounds.levels[lvl] = [...new Set([...w.grounds.levels[lvl], ...extra.filter((l) => l.levels.includes(lvl)).map((l) => l.ground)])];
}

export const B5_WORLDS: StyleWorld[] = [EMBROIDERY_WORLD, SCREENTONE_WORLD, ART_DECO_WORLD, NOTEBOOK_WORLD];
