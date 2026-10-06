// Design languages: complete visual grammars a song's VJ is built in, adapted for lyric VJs from the style guides of
// lemo-opuscar (MIT, github.com/lemomo-ai/lemo-opuscar): essence, what it is not, colour logic, type, motion and the
// one move native to the medium. The director picks one per song and composes graphics.ts layers by its rules;
// grammar only, never a reference work's composition.

export type LanguageId =
  | 'silkscreen' | 'risograph' | 'dossier' | 'swiss' | 'terminal' | 'cel80s' | 'gameshow' | 'ukiyoe' | 'papercut' | 'crayon' | 'neon-stage';

export interface DesignLanguage {
  name: string;
  /** What it is: the few facts that make the look. */
  essence: string;
  /** What it must not turn into. */
  not: string;
  /** Colour logic and example palettes. */
  colour: string;
  /** Lyric type: faces from our catalog, colour, treatment. */
  type: string;
  fonts: string[];
  /** Which graphics.ts layers build it, and how. */
  layers: string;
  /** Motion grammar for lyrics and graphics. */
  motion: string;
  templates: string[];
  /** The medium's own move, saved for the song's peak. */
  native: string;
  /** Lyric glyph treatment: a hard dark offset copy (fraction of the glyph size); lyrics set flush left. */
  text?: { ghost?: [number, number]; left?: boolean };
  /** Two time-lagged colour ghosts trailing the lyrics (tape chroma, riso plates); absent = none. */
  chroma?: [string, string];
  /** Drawings per second for type and graphics motion (12 = on twos): the hand-made feel; absent = every frame. */
  koma?: number;
  /** Whether the song's program-drawn motif (motif.ts) belongs in this language. */
  motif: boolean;
  /** What kind of song it suits. */
  suits: string;
}

export const LANGUAGES: Record<LanguageId, DesignLanguage> = {
  silkscreen: {
    koma: 12,
    text: { ghost: [0.025, 0.018] },
    name: '絲網海報',
    essence: '一張正在被印出來的旅行海報：4–6 色不透明平塗油墨，一色一層，天空用「階梯色帶」代替漸層，每層有 1–3 px 套印偏移，紙色本身是最亮的顏色。',
    not: '不是向量插畫加雜訊、不是網點漫畫：不准漸層、不准發光、不准淡入淡出。',
    colour: '每段一組 ≤ 6 色：亮天、深天、遠景、中景、近景（最暗，也是資訊帶）、一個稀有的強調色（太陽、關鍵字）。例：黎明 #F6CD98 #EE9A73 #9A7FA8 #3E7079 #1E3B3F 強調 #FBE6B4；夜港 #E8F0F2 #7FB3C8 #2F6E8E #173247 強調 #E8553D。換段落 = 同構圖換一組墨色（re-ink）。',
    type: '窄而粗的標題字印在天空裡、拉開字距；字色依底下的墨色挑對比，不加陰影光暈。',
    fonts: ['Zen Kaku Gothic New', 'Zen Old Mincho', 'Shippori Mincho'],
    layers: 'paper（米白紙）→ bands（3–5 色階梯天空，from 0 to 0.6）→ blob（太陽／月，強調色，ghosts 一個 2px 偏移的紙色或深色）→ shapes 或 photo（band 或 inset，tint 成近景墨色）→ frame border（細外框，像海報留白）。所有色塊 layer 加 ghosts [{dx:2,dy:1,color:深一階的墨}] 做套印。',
    motion: '歌詞一行一層、在拍點上「印」出來（wipe 進場、cut 退場），不准 fade；副歌換一組墨色。',
    templates: ['stair', 'vertical', 'frame-split', 'typewriter', 'quiet', 'title-card'],
    native: '副歌爆點：整張海報換一組墨色（re-ink）——構圖完全不變，只有顏色在一拍內換掉。',
    motif: false,
    suits: '旅行、季節、城市、青春、晴朗或懷舊的歌',
  },
  risograph: {
    chroma: ['#FF48B0', '#0078BF'],
    koma: 12,
    text: { ghost: [0.04, 0.03] },
    name: '孔版印刷',
    essence: '2–3 色半透明螢光特色墨疊印在暖白紙上：兩色重疊變出第三色，每個版各自偏移幾 px，中間調用網點，大面積平塗與大量留白。',
    not: '不是 CMYK 普普網點、不是不透明的絲網：墨是透明的、會相乘。',
    colour: '只用 2–3 個特色墨＋紙：例 螢光粉 #FF48B0 + 藍 #0078BF（疊出深紫）；黃 #FFE800 + 青 #00A95C；橘 #FF6C2F + 中藍 #3255A4。紙 #F4EEE2。',
    type: '粗黑體或圓體，字用其中一個墨色，可加一個 2–3px 偏移的另一墨色 ghost（套印錯位）。',
    fonts: ['Zen Kaku Gothic New', 'M PLUS Rounded 1c', 'Zen Maru Gothic'],
    layers: 'paper（#F4EEE2）→ blob／shapes／bands 用墨色並 blend multiply（疊色）→ pattern halftone（另一墨色、blend multiply、角度和其他版差 15° 以上）→ photo（inset 或 circle，tint 墨色、blend multiply）。每個色塊 ghosts 一個 3px 的另一墨色。',
    motion: '元素像一版一版印上去：在拍點上一個墨色接一個墨色出現；字用 wipe 或 slam，少用 fade。',
    templates: ['scatter', 'stair', 'beat-cut', 'vertical', 'quiet', 'title-card'],
    native: '最後一個墨色在爆點才「印」上來：之前畫面一直缺一色，爆點那拍補齊。',
    motif: false,
    suits: '獨立、可愛、文青、元氣、有點古怪的偶像歌',
  },
  dossier: {
    koma: 12,
    text: { ghost: [0.07, 0.06] },
    name: '網點檔案',
    essence: '一份復古印刷的案件檔案：米色檔案紙、2–3 色疊印網點、巨大粗標題帶錯位陰影、橡皮章、編號、檔案標籤。嚴肅的格式，內容可以很荒謬。',
    not: '不是孔版的顆粒拼貼、不是瑞士網格：每一格都要看得到網點、紙和印章。',
    colour: '紙 #EFE6D2、墨 #1D1A18、一個主色（紅 #D2382B 或藍 #2B4FA0）＋一個輔色（黃 #E8B530）。網點用主色與墨各一層，角度不同。',
    type: '超粗黑體標題，字下加一個 6–10px 偏移的主色 ghost；小字像打字機。',
    fonts: ['Zen Kaku Gothic New', 'DotGothic16'],
    layers: 'paper（檔案紙）→ pattern halftone（主色，blend multiply，角度 15）→ pattern halftone（墨，角度 45，opacity 0.3）→ numeral（巨大編號或關鍵字，主色，ghosts 墨色偏移）→ photo（inset，像證物照片，frame #ffffff，tilt）→ stamp（「確認済」「CASE 06」等，主色，tilt）→ frame brackets。',
    motion: '每 2–4 秒一張「卡」：一個大標題＋一個證物；印章在拍點上蓋下（scale 衝擊）。',
    templates: ['punch', 'beat-cut', 'stair', 'typewriter', 'title-card', 'quiet'],
    native: '副歌爆點：一個巨大的印章蓋滿畫面中央（橡皮章的「砰」）。',
    motif: false,
    suits: '偵探、謎、反抗、口號感、帶點黑色幽默的歌',
  },
  swiss: {
    text: { left: true },
    name: '瑞士網格',
    essence: '國際主義平面設計在動：白紙、黑字黑條、極淺灰、只有一個飽和的訊號色；一切貼齊 12 欄網格，每個動作落在拍點上，不彈跳。巨大的數字配極小的註記。',
    not: '不是 keynote（沒有漸層、光暈、裝置）、不是會飛會轉的歌詞動畫：字不飛、不轉、不彈。',
    colour: '紙 #F2F0EA、墨 #111111、淺灰 #D9D6CF、一個訊號色（紅 #E3241B、或藍 #1F4FFF、或黃 #FFC400）。整首只有這一個訊號色。',
    type: '黑色黑體，大小極端對比；字貼齊網格靠左；不加任何陰影光暈。',
    fonts: ['Zen Kaku Gothic New', 'Noto Serif JP'],
    layers: 'fill（紙色）→ swissgrid（淺灰格線、黑條、訊號色塊，seed 每段不同）→ numeral（巨大數字或一個漢字，淺灰或訊號色，靠邊、可超出畫面）。不要 photo、不要 sparkles、不要 paper 紋理。',
    motion: '硬切、滑入到格點後停住；每 4 拍換一次構圖；沒有 fade、沒有 bounce。',
    templates: ['stair', 'frame-split', 'typewriter', 'beat-cut', 'quiet', 'title-card'],
    native: '爆點：整個網格在一拍內翻成訊號色底、黑字（底色反相），下一拍翻回。',
    motif: false,
    suits: '冷靜、知性、都會、極簡、節奏精準的歌',
  },
  terminal: {
    name: '終端機',
    essence: '一台單色 CRT 終端機：琥珀或綠色磷光在暗玻璃上，有掃描線；所有圖像都是字元格上真正的字元，依濃度挑字。冷靜、機械、耐心，一個游標閃爍就是懸念。',
    not: '不是駭客綠雨、不是像素遊戲、不是科幻 HUD：沒有向量線條、沒有浮動面板。',
    colour: '玻璃 #0B0805、磷光 琥珀 #FFB000（或綠 #33FF66）、暗磷光 #6B3F00；整首只有一種磷光色。',
    type: '點陣或等寬字，磷光色；像在終端機裡被打出來（typewriter）。',
    fonts: ['DotGothic16'],
    layers: 'fill（玻璃色）→ chargrid（磷光色，field noise／radial／rain，cols 80–160）→ scanlines（vignette 0.6）。圖像只能由 chargrid 構成；照片不要用。',
    motion: '歌詞一個字一個字打出來，游標閃爍；段落切換像清屏。',
    templates: ['typewriter', 'quiet', 'vertical', 'title-card'],
    native: '爆點：字元場從稀疏的 . 一拍內填滿成最濃的 @#，像整個螢幕被點亮。',
    motif: false,
    suits: '孤獨、網路、深夜、未來、機械感、內省的歌',
  },
  cel80s: {
    chroma: ['#FF3AA7', '#3AF0FF'],
    koma: 12,
    name: '80 年代賽璐璐',
    essence: '黃金年代 OVA 的質感：噴槍漸層的夜景背景、霓虹透過光、濕地反射，播放在錄影帶與 CRT 上（色差暈染、掃描線、暗角）。',
    not: '不是現代萌系動畫、不是向量插畫、不是膠片顆粒（這是錄影帶）。',
    colour: '夜空 #0B0A2E→#3A1259、霓虹 洋紅 #FF3AA7、青 #3AF0FF、夕陽橘 #FF7A3A；暗部永遠帶藍紫。',
    type: '粗黑體或襯線，白字配一個霓虹色 ghost（透過光的光暈色）；標題字像霓虹招牌。',
    fonts: ['Zen Kaku Gothic New', 'Zen Old Mincho'],
    layers: 'photo full（城市或夜景，tint 藍紫）→ fill（漸層 #0B0A2E→透明，opacity 0.5）→ sunburst 或 rings（霓虹色，opacity 0.25）→ scanlines（vignette 0.5）。副歌加 speedlines（霓虹色）。',
    motion: '背景慢慢平移；字以 slam 或 wipe 進場；副歌集中線放射。',
    templates: ['punch', 'beat-cut', 'scatter', 'vertical', 'quiet', 'title-card'],
    native: '爆點：畫面像錄影帶「開機」——一條亮線展開成整個畫面，霓虹全亮。',
    motif: true,
    suits: '城市流行、復古、夜晚、戀愛、速度感的歌',
  },
  gameshow: {
    text: { ghost: [0.09, 0.09] },
    name: '節奏綜藝',
    essence: '節奏遊戲綜藝節目的平面向量：糖果色背景、同色系斜紋／圓點／旋轉放射、粗墨線與硬投影；每個動作都在拍上。',
    not: '不是手繪、不是 keynote：沒有漸層、模糊、紋理、柔陰影。',
    colour: '每段一個飽和底色＋同色系淺一階的圖紋：例 洋紅 #FF3E8A／#FF6FA8、天藍 #2EB7FF／#6CCFFF、檸檬 #FFD23F／#FFE27A、草綠 #3ECF6E；墨 #1B1B2F。',
    type: '超粗圓體或 POP 字，白字＋墨色 10px 硬投影（ghosts）。',
    fonts: ['Mochiy Pop One', 'M PLUS Rounded 1c', 'Zen Maru Gothic'],
    layers: 'fill（底色）→ pattern stripes 或 dots（淺一階，scroll）或 sunburst（淺一階，spin）→ shapes（star／heart／circle，白或黃，ghosts 墨色 10px 硬投影，pulse）→ band marquee 或 tape（上下）。',
    motion: '每個詞在拍上 pop（slam、bounce）；每段換底色與圖紋。',
    templates: ['beat-cut', 'scatter', 'punch', 'stair', 'title-card', 'quiet'],
    native: '副歌爆點：整個畫面「判定！」——一顆巨大的星形爆開＋放射旋轉加速。',
    motif: false,
    suits: '元氣、應援、MIX 多、派對感強的偶像歌',
  },
  ukiyoe: {
    koma: 12,
    name: '浮世繪',
    essence: '一張江戶木版畫：和紙、細雙框、分版平塗、黑色主版線、輕微套印偏移、天空與水用暈染（bokashi），霞（橫向長帶）分隔遠近，紅色落款。',
    not: '不是水墨、不是動畫賽璐璐：沒有光影立體感，深度只來自橫向分層與霞帶。',
    colour: '藍（ベロ藍 #1F3F7A、淺藍 #6E8FBF）、朱 #C8473A、黃土 #D9B36A、墨 #1A1A1A、和紙 #EFE4CC。',
    type: '古典明朝或毛筆字，直排優先，墨色字配和紙色暈邊。',
    fonts: ['Zen Old Mincho', 'Shippori Mincho', 'Yuji Syuku'],
    layers: 'paper（和紙）→ bands（天空藍的 bokashi 階梯，from 0 to 0.35）→ pattern waves（青海波，藍，opacity 0.35，下半部）→ mist（白或米色霞帶）→ photo（band 或 inset，tint 藍或朱，ghosts 2px）→ frame border（雙框）→ seal（朱色落款，歌名的 2–4 字）。',
    motion: '畫面像卷軸一樣橫移；字以 fade 慢慢顯現或手寫；段落以霞帶滑過轉場。',
    templates: ['vertical', 'handwrite', 'quiet', 'stair', 'frame-split', 'title-card'],
    native: '爆點：巨大的浪（青海波）從畫面下方湧起蓋滿，落款蓋下。',
    motif: false,
    suits: '和風、四季、祭典、物語、古典感的歌',
  },
  papercut: {
    koma: 12,
    text: { ghost: [0.04, 0.04] },
    name: '剪紙',
    essence: '一切都是剪刀剪出來的紙，平貼在另一張紙上：紅紙是主角，細節只來自剪掉的地方，紙有厚度投下細影；夜晚時光從背後透過剪紙。',
    not: '不是皮影戲、不是向量插畫：沒有描邊、沒有漸層。',
    colour: '紅紙 #C8102E、深紅 #8E0C1F、底紙 白天 #F3E9D2／夜 #1E1530、金 #E6B450。',
    type: '粗明朝或毛筆，紅或金字，配底紙色的暈邊。',
    fonts: ['Zen Old Mincho', 'Shippori Mincho'],
    layers: 'paper（底紙）→ shapes（circle／star／diamond 紅紙，ghosts 一個 4px 深色硬影）→ rings（虛線，金）→ blob（大紅圓，ghosts 深紅 6px）→ photo（circle，tint 紅）。',
    motion: '紙片一片片貼上（slam 小幅）；轉場像翻一張紙。',
    templates: ['vertical', 'scatter', 'stair', 'handwrite', 'quiet', 'title-card'],
    native: '爆點：背光亮起——夜色底紙上，所有紅色剪紙同時透出光來。',
    motif: false,
    suits: '喜慶、祭典、傳統、熱烈、紅色主題的歌',
  },
  crayon: {
    koma: 8,
    name: '蠟筆繪本',
    essence: '一頁正在被畫出來的繪本：粗紙上的蠟筆筆觸，水彩薄刷揭露蠟筆藏住的東西，一秒 8–12 張的抖動。',
    not: '不是乾淨向量、不是水彩寫實：線條要抖、紙齒要看得到。',
    colour: '紙 #F5EEDC；粉彩 天藍 #8CC8E8、桃 #F4A6B8、檸檬 #F6DC7A、草綠 #A8D58C；線 #3A2E5A。',
    type: '手寫或圓體，深紫藍字；可以搭配手寫版型。',
    fonts: ['Klee One', 'Yomogi', 'Zen Maru Gothic', 'Yusei Magic'],
    layers: 'paper（粗紙 grain 0.9）→ photo（polaroid 或 inset，像貼在本子上的圖）→ shapes（star／heart 粉彩，outline true）→ sparkles（檸檬色）。媒材選 crayon。',
    motion: '字用手寫或打字慢慢出現；畫面一秒 8–12 張微抖。',
    templates: ['handwrite', 'typewriter', 'vertical', 'stair', 'quiet', 'title-card'],
    native: '爆點：一張新的畫頁在一拍內被「塗滿」顏色。',
    motif: true,
    suits: '溫柔、可愛、童話、日常、夜空的歌',
  },
  'neon-stage': {
    name: '霓虹舞台',
    essence: '黑底上的霓虹訊號：細格線、取景器框、城市照片變成單色長條，副歌換成旋轉放射與警示膠帶；程式畫的發光主題物件貫穿全曲。',
    not: '不是通用 EDM 素材：不要彩虹、不要滿畫面雷射，霓虹色只有一到兩個。',
    colour: '黑 #07060C、一個主霓虹（洋紅 #FF2D95 或青 #3FF0FF）、一個輔助霓虹、白字。',
    type: '粗黑體白字，強調字用主霓虹色。',
    fonts: ['Zen Kaku Gothic New', 'M PLUS Rounded 1c'],
    layers: 'fill 黑 → pattern grid（主霓虹，opacity 0.2）→ photo band（tint 主霓虹）→ frame viewfinder；副歌 sunburst（主霓虹）＋ band tape（輔助霓虹）＋ shapes cross。',
    motion: '主歌直排與階梯；副歌逐詞切換；爆點閃白。',
    templates: ['punch', 'stair', 'vertical', 'scatter', 'beat-cut', 'frame-split', 'typewriter', 'quiet', 'title-card'],
    native: '爆點：主題物件變成隧道，放射條紋加速旋轉。',
    motif: true,
    suits: '電子、搖滾、地下偶像、強烈節奏的歌',
  },
};

/** Languages the director may pick: not one of the recent songs' languages, unless that leaves none. */
export function availableLanguages(recent: { language?: LanguageId }[]): LanguageId[] {
  const used = new Set(recent.map((r) => r.language));
  const free = (Object.keys(LANGUAGES) as LanguageId[]).filter((k) => !used.has(k));
  return free.length ? free : (Object.keys(LANGUAGES) as LanguageId[]);
}
