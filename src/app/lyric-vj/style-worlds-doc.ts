// document (感熱收據), built from its owner-approved boards (2026-11-05, ~/Desktop/vj/output/感熱收據設計稿_2026-11-05/a–d,
// sources out/research/boards-receipt/boards/receipt.html): the lyric is the transaction being printed. Each line prints
// as one item line on thermal paper; the chorus prints as the TOTAL in the paper's second colour (red, for totals only).
// Four scenes from the boards: the continuous feed, the receipt relay, the TOTAL close-up, the tear-off. Faces are the
// boards' own: Noto Sans TC 700 and Noto Sans JP 500, rasterised on the print head's dot grid (render/world-glyph-doc.ts).
// Noto Sans TC is a neutral face (a third world may share it); this is its second.
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
const ITEM = { enters: ['head-print', 'feed-step'], exits: ['tear-off', 'feed-out'] };

export const DOCUMENT_WORLD: StyleWorld = {
  id: 'document', name: '感熱收據', language: 'document', what: '正在印的感熱收據：每一句是一行品項，副歌是用紅色印的合計；印表機出紙口、撕紙齒條、切刀邊與手撕邊',
  lyricRole: '歌詞是正在印的交易：每一句是一行品項（編號與段落），副歌是雙線下用第二色紅印的合計',
  family: 'print',
  refuses: ['牛皮紙與索引標籤（file）', '碳粉髒污與拼貼（xerox）', '影印海報網格（brutalist）', '編出來的價格、數量、時間、店名、條碼', '直排字', '半透明紙條', '漂浮與彈跳', '紙張彎曲或柔性變形', '模糊轉場', '紅色用在合計以外'],
  type: { ja: { family: 'Noto Sans JP', weight: 500 }, tc: { family: 'Noto Sans TC', weight: 700 }, latin: 'Noto Sans TC', setting: '黑體柵格化到印字頭點格再印成圓點（點半徑 0.66 倍點距，筆畫實心）；繁中 48 點粗體、日文 48 點中黑；品項靠左一句一行，標籤是 24 點', category: 'thermal-dot' },
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
  ownInk: true, standsOnPlate: true, sheet: true, ownMoves: true,
  layouts: { pair: 'document/pair', shared: [], carriers: ['document/feed', 'document/feed-total', 'document/relay', 'document/total', 'document/tear'], lines: [
    // (the pair's own set: two quick verse lines printed as two item rows of one receipt)
    line('document/pair', [], ['head-print'], ['tear-off'], 'receipt-still', { ground: 'document/pair', chorus: false }),
    // verse lines are items: printed at the head of the continuous feed, on a new strip from the top printer, or on the
    // strip under the one just torn off
    line('document/feed', ALL, ITEM.enters, ITEM.exits, 'receipt-still', { max: 24, ground: 'document/feed', chorus: false }),
    line('document/relay', ALL, ['head-print', 'feed-step'], ['tear-off', 'feed-out'], 'receipt-still', { max: 18, breaks: true, ground: 'document/relay', chorus: false }),
    line('document/tear', [1, 2], ['head-print'], ['tear-off'], 'receipt-still', { max: 22, breaks: true, ground: 'document/tear', chorus: false }),
    // chorus lines are the TOTAL: under the double rule at the feed's head, or the TOTAL close-up
    line('document/feed-total', ALL, ['head-print', 'feed-step'], ['tear-off', 'feed-out'], 'receipt-still', { max: 24, ground: 'document/feed-total', chorus: true }),
    line('document/total', ALL, ['head-print'], ['tear-off', 'feed-out'], 'receipt-still', { max: 16, ground: 'document/total', chorus: true }),
  ] },
  motion: { enters: ['head-print', 'feed-step'], exits: ['tear-off', 'feed-out'], holds: ['receipt-still'], curve: '進紙一次走一格，先停再走；每句由上往下逐列印出，速度跟著句子長度；句末停兩三格，撕下的那張帶著硬影整片位移、轉一個小角度離開；不漂浮、不彈跳、紙不彎' },
  grounds: { levels: lv(['document/relay', 'document/feed'], ['document/feed', 'document/tear', 'document/relay'], ['document/feed', 'document/total']), quiet: ['document/idle'] },
  decor: [
    { id: 'document/printer', why: '出紙口（機身、出紙槽、撕紙齒條）說明紙是正在印出來的', budget: '每頁一個，在畫面上緣或下緣' },
    { id: 'document/item-no', why: '品項編號是這一句在歌裡的第幾句，段落欄是它在哪個段落；只放歌的真資料', budget: '每行一個編號、一個段落名' },
    { id: 'document/total-rule', why: '雙實線和「合計」標出這一句是副歌', budget: '只在合計上，一組' },
  ],
  transitions: { line: lv([''], [''], ['']), part: lv(['tear-swap'], ['tear-swap'], ['tear-swap']), own: ['tear-swap'], banned: ['blurdissolve', 'ripple', 'wave', 'dipwhite', 'burst', 'pagecurl', 'spinzoom'], family: 'tear' },
  peak: { loud: 'document/total', calm: 'document/relay', how: '快歌最高的那段是合計特寫，紅字大到看得見點；慢歌是一張新紙從上方出紙口垂下來' },
  pieces: ['rule-print', 'black-mark', 'partial-cut'],
  pieceWords: { 'rule-print': /寫|印|記|名|字|書|言葉|名前/, 'black-mark': /黑|夜|暗|影|闇|黒/, 'partial-cut': /斷|切|撕|分|別|離|割|切れ|別れ/ },
  camera: { cams: lv([''], [''], ['']), text: noText, note: '收據平放，鏡頭不動；只有紙在走' },
  levels: { '0': '新紙條從上方出紙口垂下，一句一張', '1': '連續進紙，最新一句印在印字頭前；撕下換行', '2': '連續進紙與合計特寫', calm: '收據接力，一句一張，留深色空白' },
  pace: { every: [2, 2, 1], calmEvery: 8, repose: false, hits: [] },
  provenance: { source: 'own', process: '感熱收據印表機：點陣印字頭、雙色感熱紙、切刀與撕紙齒條', nearest: 'JIZURA 的打字機紙條縱向吐出、直排字（docs/research/2026-10-31-jizura-frame-observations.md:12）', differs: '一律橫排的品項行，有合計結構；紙是不透明白紙；有出紙口與撕紙齒條；點陣只是材質，筆畫實心' },
  acceptance: { fast: 'nun', calm: 'tsuzuki', hardest: '副歌進來那一刻：上一句黑色品項在上，紅色合計印在雙線下，字不碰出紙口' },
};
