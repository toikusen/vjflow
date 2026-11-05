// document (感熱收據), rebuilt from its owner-approved second boards (2026-11-05, ~/Desktop/vj/output/感熱收據設計稿_第二版_
// 2026-11-05/a–d, sources out/research/boards-receipt-v2/boards/receipt.html): the lyric is the item being printed on a
// narrow thermal roll with a receipt's whole anatomy round it, every number the song's own (world-doc-receipt.ts). The
// line being sung prints 倍角 and is the only large text; the camera keeps to the stretch of roll round it. The closing
// line (the last of the last chorus, song-parts.ts closingLine) prints in the paper's second colour with the 合計 under it.
// Faces are the boards' own: Noto Sans TC 700 and Noto Sans JP 500, rasterised on the print head's dot grid
// (render/world-glyph-doc.ts). Noto Sans TC is a neutral face (a third world may share it); this is its second.
import type { FrameStack, LinePart, Scheme, StyleWorld } from './style-world';
import type { Level } from './lineplan-core';
import type { TextCamKind } from './render/text-cam';

const stack = (o: Partial<FrameStack>): FrameStack => ({ grain: 0.05, paper: 0, tooth: 0, lift: 0, scan: 0, vignette: 0, flicker: 0, weave: 0, boil: 0, boilRate: 12, step: 0, koma: 0, ...o });
const lv = <T,>(a: T[], b: T[], c: T[]): Record<Level, T[]> => ({ 0: a, 1: b, 2: c });
const line = (set: string, levels: Level[], enters: string[], exits: string[], hold: string, o: Partial<LinePart> = {}): LinePart => ({ set, levels, enters, exits, hold, ...o });
const noText: Record<Level, TextCamKind[]> = lv([], [], []);
const scheme = (id: string, mood: Scheme['mood'], band: Scheme['band'], ground: string, ink: string, ink2: string, accent: string, plate: string, plateInk: string, faint: string, what: string): Scheme => ({ id, band, ground, ink, ink2, accent, plate, plateInk, faint, what, mood });

// (board: thermal paper #F7F6F1, print black #1D1D22, total red #B3221F; grounds graphite #1A1B1F (a, c), night blue
// #1B2A35 (b), tomato #D9542E (d); faint is the paper's rule grey)
const ALL: Level[] = [0, 1, 2];

export const DOCUMENT_WORLD: StyleWorld = {
  id: 'document', name: '感熱收據', language: 'document', what: '從印表機送出的窄長感熱收據：店名區、分隔列、品項列與時間欄、數量列、小計、合計、條碼、謝謝光臨，全是歌的真資料',
  lyricRole: '正在唱的那一句是正在印的品項，倍角全黑印出，是畫面上唯一的大字；唱過的句子縮成淡色的品項列，最後一次副歌的最後一句用紅色印，接著印合計',
  family: 'print',
  refuses: ['牛皮紙與索引標籤（file）', '碳粉髒污與拼貼（xerox）', '影印海報網格（brutalist）', '編出來的價格、數量、時間、店名、條碼（全部是歌的真資料）', '整張收據塞滿小字（鏡頭只拍正在印的那一段）', '直排字', '半透明紙條', '漂浮與彈跳', '紙張彎曲或柔性變形', '模糊轉場', '紅色用在最後一句與合計以外'],
  type: { ja: { family: 'Noto Sans JP', weight: 500 }, tc: { family: 'Noto Sans TC', weight: 700 }, latin: 'Noto Sans TC', setting: '黑體柵格化到印字頭點格再印成圓點（點半徑 0.66 倍點距，筆畫實心）；正在唱的那句 48 點倍角，至少是最大小字的 2.5 倍；品項列、店名區、數量列是 24 點的小字，顏色較淡', category: 'thermal-dot' },
  palette: [
    scheme('receipt-graphite', 'earth', 'dark', '#1A1B1F', '#1D1D22', '#24262B', '#B3221F', '#F7F6F1', '#1D1D22', '#C9C8C2', '石墨灰桌面，白色感熱紙'),
    scheme('receipt-night', 'cold', 'dark', '#1B2A35', '#1D1D22', '#24262B', '#B3221F', '#F7F6F1', '#1D1D22', '#C9C8C2', '深藍夜色，收據接力'),
    scheme('receipt-tomato', 'warm', 'mid', '#D9542E', '#1D1D22', '#24262B', '#B3221F', '#F7F6F1', '#1D1D22', '#C9C8C2', '番茄紅，撕下換行'),
    // (one more counter a reading, so two songs read alike still land on different counters)
    scheme('receipt-teal', 'cold', 'dark', '#183A3F', '#1D1D22', '#24262B', '#B3221F', '#F7F6F1', '#1D1D22', '#C9C8C2', '深青綠的櫃檯'),
    scheme('receipt-ochre', 'warm', 'mid', '#B8742A', '#1D1D22', '#24262B', '#B3221F', '#F7F6F1', '#1D1D22', '#C9C8C2', '土黃色的櫃檯'),
    scheme('receipt-moss', 'earth', 'dark', '#2A3328', '#1D1D22', '#24262B', '#B3221F', '#F7F6F1', '#1D1D22', '#C9C8C2', '苔綠的櫃檯'),
  ],
  groundBand: { band: 'dark', flip: 'none', why: '字永遠印在白色感熱紙上，底只是紙後面的桌面；換段時配色在石墨、深藍、番茄紅之間輪替，不翻底' },
  material: { surface: 'thermal', core: 'accent', engine: 'print/thermal-head', how: '感熱紙由印字頭一列一列加熱變色：字先柵格化到 48 點的點格，每點印成半徑 0.66 倍點距的圓點，相鄰點連成實心筆畫，點只在筆畫邊緣看得到；紙邊是切刀齒、手撕齒或紙捲直邊；硬影不模糊；出紙口是深色機身、出紙槽、鋼製撕紙齒條' },
  frameStack: stack({ grain: 0.05, vignette: 0 }),
  timeBase: { fps: 0, unit: 'line', curve: 'step-feed' },
  ownInk: true, standsOnPlate: true, sheet: true, ownMoves: true, callSlot: 'plateInk',
  layouts: { pair: 'document/pair', shared: [], carriers: ['document/feed', 'document/sheet', 'document/total'], lines: [
    // (the pair's own set: two quick lines printed as two rows at the head)
    line('document/pair', [], ['head-print'], ['feed-out'], 'receipt-still', { ground: 'document/pair', closing: false }),
    // every line but the closing one is an item: printed at the head of the feed (a), or, in a quiet part, on the slip
    // lying still (b); one of the two a level, so the camera keeps to one receipt through a part
    line('document/feed', [1, 2], ['head-print', 'feed-step'], ['feed-out'], 'receipt-still', { max: 30, ground: 'document/feed', closing: false }),
    line('document/sheet', [0], ['head-print'], ['feed-out'], 'receipt-still', { max: 30, ground: 'document/sheet', closing: false }),
    // the closing line (the last of the last chorus) is the receipt's last item, in red, the 合計 under it (c)
    // (tear-off, in motion's list, is the part's slip torn away: the page draws it, world-doc-receipt tornSlip)
    line('document/total', ALL, ['head-print'], ['feed-out'], 'receipt-still', { max: 40, ground: 'document/total', closing: true }),
  ] },
  motion: { enters: ['head-print', 'feed-step'], exits: ['feed-out', 'tear-off'], holds: ['receipt-still'], curve: '進紙一次走一格，先停再走：每句開始時紙把前面的品項往上送一列，這一句由上往下逐列印出；印完之後讀的時候什麼都不動；換段時舊的那張帶著硬影整片撕走，半秒內離開；不漂浮、不彈跳、紙不彎' },
  grounds: { levels: lv(['document/sheet', 'document/feed'], ['document/feed', 'document/sheet'], ['document/feed']), quiet: ['document/idle'] },
  decor: [
    { id: 'document/printer', why: '出紙口（機身、出紙槽、撕紙齒條）說明紙是正在印出來的', budget: '進紙頁一個，在畫面下緣' },
    { id: 'document/shop', why: '店名區（歌手、歌名、輸出日期、BPM、歌曲編號、總行數）說明這是一張收據；只放歌的真資料', budget: '只在歌的開頭與撕下換段後，墨量算在預算裡' },
    { id: 'document/item-row', why: '唱過的句子是品項列：編號、句子、點線、開始時間；淡色、小字，越舊越淡', budget: '最多 5 列，總墨量不超過正在唱那句的 0.8 倍' },
    { id: 'document/tail', why: '小計、合計、條碼（歌曲編號的 Code 128）、謝謝光臨只在段落結束出現：撕下的那張帶著它們離開，或最後一句唱完後印出來', budget: '一個段落一次' },
  ],
  transitions: { line: lv([''], [''], ['']), part: lv(['tear-swap'], ['tear-swap'], ['tear-swap']), own: ['tear-swap'], banned: ['blurdissolve', 'ripple', 'wave', 'dipwhite', 'burst', 'pagecurl', 'spinzoom'], family: 'tear' },
  peak: { loud: 'document/feed', calm: 'document/sheet', how: '快歌最高的那段是連續進紙，倍角字壓在撕紙齒條上方；慢歌是一張收據靜靜放在桌上' },
  pieces: [],
  pieceWords: {},
  camera: { cams: lv([''], [''], ['']), text: noText, note: '鏡頭只拍收據正在印的那一段（比整張收據近），不動；只有紙在走' },
  levels: { '0': '收據平放在桌上，倍角字下面是還沒印的紙', '1': '連續進紙，最新一句印在撕紙齒條上方；換段時撕下', '2': '連續進紙，最後一句的合計特寫', calm: '收據平放，一句一句往下印，留白多' },
  pace: { every: [2, 2, 1], calmEvery: 8, repose: false, hits: [] },
  provenance: { source: 'own', process: '感熱收據印表機：點陣印字頭、雙色感熱紙、切刀與撕紙齒條', nearest: 'JIZURA 的打字機紙條縱向吐出、直排字（docs/research/2026-10-31-jizura-frame-observations.md:12）', differs: '一律橫排的品項行，有合計結構；紙是不透明白紙；有出紙口與撕紙齒條；點陣只是材質，筆畫實心' },
  acceptance: { fast: 'nun', calm: 'tsuzuki', hardest: '換段那一刻：舊的那張帶著小計、條碼撕走，新收據的店名區和這一句同時出現，歌詞還是畫面上最大、最黑、唯一在讀的字' },
};
