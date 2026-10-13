// Design languages: complete visual grammars a song's VJ is built in. Each one says what the look is made of, what it
// must never slide into, how its colour and type work, which graphics.ts layers build it, how it moves, the one move
// saved for the peak, and how to draw it in code (craft) when the director writes the song's own layer. The director
// picks one per song and composes by its rules; the grammar, never a reference work's composition.

export type LanguageId =
  | 'silkscreen' | 'risograph' | 'dossier' | 'swiss' | 'terminal' | 'cel80s' | 'gameshow' | 'ukiyoe' | 'papercut' | 'crayon' | 'neon-stage'
  | 'art-deco' | 'blueprint' | 'ink-wash' | 'stained-glass' | 'spy-titles' | 'pictogram' | 'watercolor' | 'hologram' | 'silent-film' | 'woodcut' | 'midcentury' | 'paper-lantern'
  | 'screentone' | 'chiyogami' | 'aizome' | 'citypop' | 'y2k' | 'gothic-lolita' | 'embroidery' | 'chalkboard' | 'cyanotype' | 'claymation';

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
  /**
   * How to draw it in Canvas 2D when the director writes the song's code layer: the physical process the look comes
   * from turned into steps and numbers, the small motions that keep it alive, its transition, and the traps.
   */
  craft: string;
  /**
   * How the image model draws this look's props (English, replaces the default flat-sticker rules), and public-domain
   * artworks under scripts/lyric-vj/references/ it takes as a style reference for the first sheet.
   */
  props?: { style: string; reference?: string };
  /**
   * Full-bleed scene pictures as the drawing's worlds: only for handmade media, where the medium carries the picture
   * and the props are made of the same stuff (cut paper on 雙截棍 read as designed; generic anime scenery on sweet timer
   * read as AI and clashed with its props).
   */
  scenes?: boolean;
  /**
   * Proven to come out sellable in one pass (user-approved songs: dossier on LOVE YOU KILL YOU and てぇてぇ, pictogram
   * on てぇてぇ, risograph on プラトニックチョロイン, silkscreen on 行星, spy-titles on 雙截棍). The director picks only
   * from these; the rest (cel80s on sweet timer came out as a purple gradient with clip-art props) wait until a test
   * song passes the user's review.
   */
  proven?: boolean;
  /**
   * The style kit of a proven language: the user-approved song it was proven on (its frames are
   * scripts/lyric-vj/references/kits/<id>.jpg, shown to the director and the reviewer as the quality bar) and what
   * makes that look work, in words the drawing must follow.
   */
  kit?: { song: string; craft: string };
  /** false: the look is drawn only (no picture under it), so shots carry no photo. */
  photos?: false;
  /** Lyric glyph treatment: a hard dark offset copy (fraction of the glyph size); lyrics set flush left; `cap`
   * multiplies the templates' largest lyric size; `ink` is the one lyric colour whatever is behind it. */
  text?: { ghost?: [number, number]; left?: boolean; cap?: number; ink?: string };
  /** Two time-lagged colour ghosts trailing the lyrics (tape chroma, riso plates); absent = none. */
  chroma?: [string, string];
  /** Drawings per second for type and graphics motion (12 = on twos): the hand-made feel; absent = every frame. */
  koma?: number;
  /**
   * The shared decorations this language may use (SHARED_MOTIFS); the rest are stripped from its designs. Every one
   * of them in every language read as one template across the 28-style test.
   */
  own: SharedMotif[];
  /** Whether the song's program-drawn motif (motif.ts) belongs in this language. */
  motif: boolean;
  /** What kind of song it suits. */
  suits: string;
}

/** Decorations any language could reach for, which the 28-style test showed in nearly all of them (user: concentric
 * circles, rays, stamps, hexagons, hearts on 好き, big outlined words behind the lyrics; seigaiha leaking out of
 * ukiyoe into aizome and citypop; a keyword switching typeface mid-line). Each language owns only its native ones. */
export type SharedMotif = 'rings' | 'sunburst' | 'stamp' | 'seal' | 'numeral' | 'heart' | 'echo' | 'waves' | 'face';
export const SHARED_MOTIFS: Record<SharedMotif, string> = {
  rings: '同心圓圖層 rings',
  sunburst: '放射線圖層 sunburst',
  stamp: '印章字 stamp',
  seal: '方形印章 seal',
  numeral: '大數字 numeral',
  heart: '愛心（particles／shapes 的 heart、強調 symbol heart）',
  echo: '副歌背後的放大空心描邊字（technique echo）',
  waves: '青海波魚鱗紋（pattern waves）',
  face: '關鍵詞換字體（強調 face）',
};

export const LANGUAGES: Record<LanguageId, DesignLanguage> = {
  silkscreen: {
    own: ['seal', 'rings'],
    proven: true,
    kit: { song: '理想混蛋〈行星〉', craft: '米白紙底（paper，grain 0.3）上用 2–4 階平塗色帶（bands）做天空與地景，色數少、每層帶 1–2px 錯位（ghosts）；天體、光點是平塗圓點；照片只以單色上墨（tint、multiply）放進色帶或內框；海報式邊框與小字標籤（frame border label）。畫面像一張張絲網印刷海報：平、色少、有錯位，不要漸層、不要寫實光影、不要描邊卡通貼圖。' },
    koma: 12,
    text: { ghost: [0.025, 0.018] },
    name: '絲網海報',
    essence: '一張剛從網版刷出來的海報：每個顏色是一道獨立的不透明油墨，最多六道；天空不是漸層而是一格一格的色帶；版與版之間總有一兩像素對不準；整張紙最亮的地方就是沒上墨的紙。',
    not: '不准有漸層、光暈、模糊、淡入淡出，也不是網點漫畫或向量插畫加雜訊。',
    colour: '每段只配一組最多 6 色的墨：亮天、暗天、遠景、中景、最暗的近景（同時是放字的地方），外加一個只用在太陽或關鍵字的稀有色。例：初夏清晨 #F7D3A1 #E99572 #8F7AA6 #3B6B76 #1B3439，稀有色 #FFF1C2；冬夜港口 #E6EEF1 #86B4C9 #2D6A8A #142F44，稀有色 #EC5A3F。進下一段時構圖不動，只把整組墨換掉。',
    type: '窄而粗的標題字直接印在天空色帶上，字距拉開；字色從底下那道墨挑對比最大的，不加任何陰影或光暈。',
    fonts: ['Zen Kaku Gothic New', 'Zen Old Mincho', 'Shippori Mincho'],
    layers: 'paper（米白紙）→ bands（3–5 階天空，from 0 to 0.6）是固定的底；上面每段挑 1–2 個主角，段落之間要換，不要每段都同一組：skyline（城市、山丘、樹林、山峰的平塗剪影）、blob（太陽或月亮，稀有色）、shapes（平塗幾何、星點）、botanical（植物剪影）、photo（band 橫幅，tint 成近景墨色；inset 小圖整首最多 2 段）、rings（只在歌詞講到軌道、迴圈、擴散時）。frame border 外框只放在開頭或結尾 1–2 段。每個色塊都加 ghosts [{dx:2,dy:1,color:深一階的墨}] 做出套印不準。',
    motion: '每行歌詞是一道墨，在拍點上被「刷」出來（wipe 進、cut 出），不准 fade；副歌整張換一組墨。',
    templates: ['stair', 'vertical', 'typewriter', 'quiet', 'title-card', 'stack', 'array'],
    native: '副歌爆點：整張海報在一拍之內換一組墨色——構圖一動不動，只有顏色翻面。',
    craft: '刷版過程：每個色塊是一個不透明 path，依「先淺後深」一道一道畫；每一道整體偏移 (dx,dy) = 該版的固定錯位（1–3px，每版不同、整首固定，不要每格亂跳）。色帶天空 = 4–6 個橫向矩形由上往下逐階變色，交界保持硬邊。紙紋：在最上層用 multiply 疊一張預先算好的低對比雜訊（亮度 0.94–1.0），整首共用、不要每格重算。活起來的方式：太陽或月亮每拍 1–2% 的呼吸、雲帶極慢橫移（每秒 3–6px）、鳥群用三角形逐拍換位置。轉場：新的一道墨從畫面一側像刮刀一樣刷過去（寬度 = 畫面，0.3–0.4 秒，ease-in-out），刷過的地方就是新的一版。坑：錯位每格重算會變成抖動；色帶數超過 6 就不像絲網了；不要用 globalAlpha 做半透明疊色（絲網墨是不透明的）。',
    props: { style: 'hand-pulled screen print: every colour one opaque flat ink layer (at most five inks per item), shapes cut with crisp stencil edges, the lightest areas left as bare paper colour, each colour layer 1-2px off register from the others, no outlines unless printed as their own black layer, no gradients (tone steps only as separate flat inks)' },
    // no scene plates: the approved 行星 is flat colour bands and inked photo strips; full-bleed scenes washed the look out
    scenes: false,
    motif: false,
    suits: '旅行、季節、城市、青春、晴朗或懷舊的歌',
  },
  risograph: {
    own: ['stamp'],
    proven: true,
    kit: { song: 'のんふぃく！〈プラトニックチョロイン〉', craft: '米白紙底（paper，grain 0.3–0.4）上兩色油墨（例如螢光粉＋藍）用 multiply 疊印，疊到的地方出現第三色；每個色塊、圓、印章、數字都帶另一色 3px 左右的錯位殘影（ghosts）；網點（halftone 15–75°、opacity 約 0.2）；照片只用單色上墨的內框或圓窗；大號印章字、數字、圓點當構圖元素。不要漸層天空、不要滿版不透明背景蓋掉紙紋、不要粗描邊亮面的卡通貼圖。' },
    chroma: ['#FF48B0', '#0078BF'],
    koma: 12,
    text: { ghost: [0.04, 0.03] },
    name: '孔版印刷',
    essence: '兩到三種半透明的螢光特色墨，疊在偏暖的白紙上：兩色疊到的地方自然變出第三色，每一版各自歪幾像素，中間調靠網點撐，其餘大片平塗加大量留白。',
    not: '不是 CMYK 普普網點，也不是不透明的絲網：這裡的墨是透明的，疊在一起會相乘變深。',
    colour: '只准 2–3 個特色墨加紙：螢光粉 #FF4FAE 配海軍藍 #1E64B4（疊出深紫）；陽光黃 #FFE30A 配翠綠 #00A36C；朱橘 #FF7036 配鈷藍 #3A57A8。紙用 #F5EFE4。',
    type: '粗黑體或圓體，字色只能是其中一個墨，可以再疊一個 2–3px 偏移的另一個墨當錯版影。',
    fonts: ['Zen Kaku Gothic New', 'M PLUS Rounded 1c', 'Zen Maru Gothic'],
    layers: 'paper（#F5EFE4）→ blob／shapes／bands 用墨色並 blend multiply 疊色 → pattern halftone（另一個墨、blend multiply、和其他版的角度差 15° 以上）→ photo（inset 或 circle，tint 成墨色、blend multiply）。每個色塊 ghosts 一個 3px 的另一墨色。',
    motion: '像一版接一版地印：在拍點上一個墨色接一個墨色出現；字用 wipe 或 slam，少用 fade。',
    templates: ['scatter', 'stair', 'beat-cut', 'vertical', 'quiet', 'title-card', 'stack', 'array', 'ribbon'],
    native: '最後一個墨色等到爆點才印上去：整段畫面一直少一色，爆點那一拍補齊。',
    craft: '印刷過程：每一版畫在自己的離屏 canvas（同一個形狀集合，只換墨色），合成時用 globalCompositeOperation = "multiply" 依序疊到紙上，每版各自固定偏移 2–4px、角度 0–0.4°。網點：用 createPattern 做一張 8–12px 的圓點小圖，旋轉到該版的角度（例 15°、75°）再填，點的大小依亮度變化。墨的顆粒：每版疊一層 destination-out 的極細斑點（覆蓋 3–6%），讓墨看起來沒有吃滿。活起來：版的偏移在每 2–4 拍「重新對位」一次（換一組固定值），不要連續晃。轉場：新畫面先只印第一版（單色），一拍後第二版疊上去成形。坑：用 source-over 疊會失去孔版的混色；三版以上會變髒；網點角度太接近會出現摩爾紋。',
    props: { style: 'risograph print in exactly two or three translucent fluorescent spot inks and no other colours (an object keeps those inks even when its real colour differs): overlapping inks mix into a third colour, mid-tones built from coarse halftone dots, each ink layer a few pixels off register, slightly uneven ink density and grain, no black outlines, no smooth gradients' },
    // no scene plates: the approved プラトニックチョロイン is overprinted shapes and inked photo windows; sweet timer v3
    // with full-bleed risograph scenes came out as one pale lavender haze
    scenes: false,
    motif: false,
    suits: '獨立、可愛、文青、元氣、有點古怪的偶像歌',
  },
  dossier: {
    own: ['stamp', 'numeral'],
    proven: true,
    kit: { song: '悲撃のヒロイン症候群〈LOVE YOU KILL YOU〉', craft: '像攤在桌上的檔案：暖米紙或深色桌面，顆粒明顯（grain 約 0.5），網點 multiply；道具是有柔和陰影、平塗加少量筆觸的插畫小物，擺在桌面上像證物；一條貫穿全片的線索（例：紅線）把道具連起來；格紙、膠帶、圖釘、封鎖線、聚光燈與暗角。不要滿版漸層天空，不要把道具排在地平線上。' },
    koma: 12,
    text: { ghost: [0.07, 0.06] },
    name: '網點檔案',
    essence: '一份用舊式印刷做的案件檔案：泛黃的檔案紙、兩三色網點疊印、超大粗標題帶錯位影、橡皮章、編號、標籤夾。格式一本正經，內容可以很荒謬。',
    not: '不是孔版的顆粒拼貼，也不是瑞士網格：每一格都要看得到網點、紙和印章的痕跡。',
    colour: '檔案紙 #EDE3CC、墨 #1C1917、一個主色（警示紅 #CF3A2B 或卷宗藍 #2C4E9E）加一個輔色（芥末黃 #E2B03A）。網點用主色和墨各一層，角度錯開。',
    type: '超粗黑體標題，下面疊一個 6–10px 偏移的主色錯位影；小字像打字機打的。',
    fonts: ['Zen Kaku Gothic New', 'DotGothic16'],
    layers: 'paper（檔案紙）→ pattern halftone（主色，blend multiply，角度 15）→ pattern halftone（墨，角度 45，opacity 0.3）→ numeral（巨大編號或關鍵字，主色，ghosts 墨色偏移）→ photo（inset，像證物照片，frame #ffffff，tilt）→ stamp（「確認済」「CASE 06」之類，主色，tilt）→ frame brackets。',
    motion: '每 2–4 秒翻一張「卡」：一個大標題配一件證物；印章在拍點上蓋下（scale 衝擊）。',
    templates: ['punch', 'beat-cut', 'stair', 'typewriter', 'title-card', 'quiet', 'stack', 'quote'],
    native: '副歌爆點：一枚巨大的橡皮章「砰」地蓋在畫面正中央。',
    craft: '檔案的質地：紙用米黃底加一層 multiply 的纖維雜訊（極淡的短斜線 1–2px，覆蓋 10%），四邊壓暗 8% 當翻舊的痕跡。照片網點化：把素材依亮度轉成 45° 網格的圓點（點徑 = 格距 × √(1-亮度)），格距 6–10px，整體 multiply。印章：外框是兩圈不規則圓或圓角方（半徑加 ±2% 的低頻雜訊），字在中間，最後用 destination-out 撒 10–15% 的斑點做出沒蓋實的缺墨；蓋下時 scale 1.25→1（0.12 秒，ease-out）並伴隨整格 2px 的震動一次。證物照片：白邊 12–20px、細陰影 0 6px 18px rgba(0,0,0,.25)、傾斜 ±3°、上方一截半透明膠帶。轉場：整張卡像被抽走（往一側 0.25 秒 ease-in），底下露出下一張。坑：網點太密會變灰色色塊；印章到處蓋就沒有份量（一段最多一個）。',
    props: { style: 'old offset-printed case file illustration: one or two ink colours plus black, coarse halftone dot shading, slightly misregistered colour, bold black keyline, a little paper-tooth roughness on the ink edges; like a cut-out from a 1960s technical manual or police file' },
    motif: false,
    suits: '偵探、謎、反抗、口號感、帶點黑色幽默的歌',
  },
  swiss: {
    own: ['numeral', 'echo', 'face'],
    text: { left: true },
    name: '瑞士網格',
    essence: '國際主義平面設計開始動：白紙、黑字、黑色長條、極淺的灰，整首只有一個飽和的訊號色；一切貼齊 12 欄網格，動作只發生在拍點，沒有彈跳。巨大的數字配極小的註記。',
    not: '不是簡報動畫（沒有漸層、光暈、裝置圖），也不是會飛會轉的歌詞特效：字不飛、不轉、不彈。',
    colour: '紙 #F3F1EC、墨 #121212、淺灰 #D8D5CE、一個訊號色（信號紅 #E2261C、國際藍 #2050FF 或 號誌黃 #FFC30A）。整首只用這一個訊號色。',
    type: '黑色無襯線黑體，大小對比要極端；字貼齊網格、靠左；不加陰影或光暈。',
    fonts: ['Zen Kaku Gothic New', 'Noto Serif JP'],
    layers: 'fill（紙色）→ swissgrid（淺灰格線、黑條、訊號色塊，每段換 seed）→ numeral（巨大數字或單一漢字，淺灰或訊號色，靠邊、可以超出畫面）。不要 photo、sparkles 或紙紋。',
    motion: '硬切，或滑進格點後停住；每 4 拍換一次構圖；沒有 fade、沒有 bounce。',
    templates: ['stair', 'typewriter', 'beat-cut', 'quiet', 'title-card', 'stack', 'array', 'couplet', 'tunnel'],
    native: '爆點：整個網格在一拍內反相成訊號色底、黑字，下一拍再翻回來。',
    craft: '網格先於一切：畫面寬 1920 切 12 欄（欄寬 = (1920 − 2×96 − 11×24) / 12），所有東西的 x 都取欄線、y 取 24px 的基線格；動畫只在兩個格點之間移動，終點必定落在格線上。長條：純色矩形，從一端長出（寬度用 ease-out，0.3–0.45 秒），長完就靜止。巨大數字：字重最粗，故意裁出畫面 10–30%。註記：10–12px 的小字貼在長條旁，像圖說。活起來：每一小節換一次構圖（元素硬切到新的格點），格線本身不動。轉場：訊號色的長條橫掃滿版再收回成新構圖的一條線。坑：元素沒貼格線會立刻顯得業餘；任何旋轉、漸層、陰影都會破功；訊號色超過畫面 10% 就失去「訊號」的意義。',
    props: { style: 'International Typographic Style pictograms: strictly geometric construction from circles, rectangles and 45/90 degree lines, solid black or one signal colour, uniform stroke weight, perfectly flat, no shading, no texture, no outlines around fills' },
    motif: false,
    suits: '冷靜、知性、都會、極簡、節奏精準的歌',
  },
  terminal: {
    own: [],
    name: '終端機',
    essence: '駭客的電腦桌面：黑玻璃上用磷光綠畫出一個個視窗——打指令的終端機、捲動的系統紀錄、程式碼、檔案列表、進度條、讀取中，歌詞說到斷線、錯誤、失去時才跳出紅色的 ERROR 警告。電腦就是故事的舞台：歌詞的情節變成連線、傳送、搜尋、當機、重新開機。冷、快、精準，有科技感和未來感。',
    not: '不是整首只有綠色數字雨（字元雨只在少數段落當背景），不是像素遊戲或可愛點陣，也不是科幻電影的半透明全息面板；不用照片。',
    colour: '玻璃 #020A04、磷光綠 #3DFF6E（主色：視窗、字幕）、亮白綠 #E8FFE8（強調字、選取列）、警告紅 #FF4040（只在歌詞真的說到錯誤、斷線、消失、崩壞時給 error 視窗和那幾個字；歌詞沒有這種內容就整首不用紅）、暗綠 #0B5A22（背景字元）。',
    type: '點陣或等寬字，磷光綠；字整體偏大、有大小對比：主歌用 typewriter 逐字打出（像在終端機輸入），旁白或系統訊息般的句子用 frame-split（frameWidth 0.75–0.9，像一個視窗），重點句和副歌用 beat-cut／stack 滿版大字。強調字用 color（accent 設亮白綠；歌詞說到錯誤、斷線時那個字才用警告紅）。',
    fonts: ['DotGothic16'],
    layers: 'fill（玻璃色）→ 每段落換一組電腦視窗（ui，2–4 個不同 type，位置分散在畫面四周，delay 錯開 0–3 秒依序跳出，lines 寫這首歌故事裡的內容：連線對象、傳送的訊息、搜尋的關鍵字、檔名）→ scanlines（vignette 0.6）。段落要有變化，整首像一段演出：主歌一兩個視窗慢慢打字、訊息累積（terminal＋log：打給誰、等回覆）；導歌 progress／loading 蓄力；副歌視窗變多變大，最高潮的副歌用 cascade 讓同一個視窗接連跳出一串；歌詞的關鍵字才觸發 error；安靜的段落（間奏、副歌前的停頓、結尾）只留一個 cursor，讓畫面喘口氣；間奏或橋段 files／code（回憶、檔案）；error 視窗只放在歌詞說到失敗、斷線、失去的段落，沒有這種歌詞就不用；視窗外觀：整首先決定這首歌的電腦是 Mac 還是 Windows（只選一種），歌詞貼近日常的段落（聊天、檔案、等待、搜尋）用 skin mac 或 win 的真實系統視窗，駭客感、失控、數位世界的段落用 skin term 的發光終端機；同一段只用一種外觀，兩種外觀要隨段落交替，不要整首都同一種；只有 1–2 個段落（例如最終副歌或當機的段落）在最底下加 chargrid rain（暗綠，cols 60–120）。shots 不放 asset（不用照片）。',
    motion: '歌詞逐字打出、游標閃爍；視窗依序跳出、紀錄持續捲動；爆點 error 視窗震動跳出；換段落像清屏後重新開視窗。',
    templates: ['typewriter', 'stack', 'array', 'title-card', 'frame-split', 'beat-cut', 'tunnel'],
    native: '爆點：字元在一拍內湧滿整個螢幕；那一段有 error 視窗（歌詞說到崩壞、斷線）時，四周再接連跳出好幾個 ERROR 視窗。',
    craft: '視窗：深色半透明底、2px 磷光框線、實心標題列（深色字）、右上三個小方框；內容用等寬字，終端機以每秒 16 字打出、紀錄每 0.5 秒捲一行、檔案列表的選取列（反白）隨拍往下。字元成像：把形狀畫進小離屏，依「 .:-=+*#%@」的濃度表挑字，等寬字一格一格畫回大畫面。資料流：每欄一條落下的字串，頭最亮、往上漸暗。掃描線：每 3px 一條 rgba(0,0,0,.25)，8% 桶狀暗角。游標：0.53 秒一個週期的方塊。坑：用非等寬字會亂；視窗擠在歌詞上（要分散在四周）；ERROR 和紅色跟歌詞無關就是硬塞；背景字元太亮會蓋過歌詞。',
    props: { style: 'monochrome green phosphor screen art: the item rendered in a single bright green (#3DFF6E) as a coarse pixel mosaic of square cells with one or two brightness levels on black, crisp blocky edges, no glow halo, no anti-aliasing smear, no other colours' },
    motif: false,
    photos: false,
    text: { cap: 1.4, ink: '#3DFF6E' },
    suits: '孤獨、網路、深夜、未來、機械感、科技、通訊、內省的歌',
  },
  cel80s: {
    own: ['sunburst'],
    chroma: ['#FF3AA7', '#3AF0FF'],
    koma: 12,
    name: '80 年代賽璐璐',
    essence: '錄影帶時代動畫長片的質感：噴槍漸層的夜景背景、霓虹從背後透出的光、濕路面的倒影，而且是透過錄影帶和映像管播出來的（色差暈染、掃描線、暗角）。',
    not: '不是現代萌系動畫、不是向量插畫，也不是膠片顆粒——這是錄影帶，不是電影膠卷。',
    colour: '夜空 #0C0B30→#3B1460、霓虹 洋紅 #FF3DA8、青 #3DEEFF、夕陽橘 #FF7B3C；暗部永遠偏藍紫。',
    type: '粗黑體或明朝，白字配一個霓虹色的錯位影（像透過光的光暈色）；標題做成霓虹招牌的感覺。',
    fonts: ['Zen Kaku Gothic New', 'Zen Old Mincho'],
    layers: 'photo full（夜景城市或海邊，tint 藍紫）→ fill（漸層 #0C0B30→透明，opacity 0.5）→ bands（夕陽色階：橙、桃紅、紫 3–4 階，from 0.45 to 0.7，像賽璐璐的分色夕陽）→ skyline city（2 層深藍紫，windows 霓虹黃，height 0.35，前景城市剪影）→ scanlines（vignette 0.5）。副歌加 speedlines（霓虹色）；sunburst 只在副歌爆點用。',
    motion: '背景緩緩平移；字用 slam 或 wipe 進場；副歌用集中線放射。',
    templates: ['punch', 'beat-cut', 'scatter', 'vertical', 'quiet', 'title-card', 'stack', 'quote', 'orbit', 'ribbon', 'tunnel'],
    native: '爆點：畫面像錄影帶開機——一條亮線在中央橫向展開成整個畫面，霓虹全部亮起。',
    craft: '賽璐璐上色：角色或物件只用兩階——底色平塗，再用 clip 把同一個形狀往光源反方向偏移後填暗一階，只剩一道月牙形的影；高光是一小塊不透明的亮色硬邊。噴槍背景：大面積用線性或放射漸層，再疊一層極細的雜訊（±2%）打散色帶。透過光：霓虹形狀畫在離屏，lighter 疊兩次（模糊 6px、20px，透明度 0.6、0.3）。錄影帶：最後把整張圖的紅、藍通道各錯開 2–3px（畫三次、用 lighter 混合單色版），掃描線 2px 一條，偶爾（每 6–10 秒一次）出現一條 6–12px 高的橫向雜訊帶往上滾。轉場：畫面上下壓扁成一條線再展開成新畫面（0.35 秒）。坑：通道錯位太大會讓字讀不清（字本身不要錯位，只錯背景）；漸層沒加雜訊會出現色階。',
    props: { style: '1980s anime cel: hard-edged cel paint with one darker shadow tone and one small bright highlight per colour, clean ink outline in a darker shade of each colour (not black), saturated night-time colours, glossy reflective details; no glow halo around the item' },
    motif: false,
    suits: '城市流行、復古、夜晚、戀愛、速度感的歌',
  },
  gameshow: {
    own: ['sunburst', 'numeral'],
    text: { ghost: [0.09, 0.09] },
    name: '節奏綜藝',
    essence: '節奏遊戲綜藝節目的平面向量世界：糖果色背景、同色系的斜紋、圓點或旋轉放射，粗墨線加硬投影；每個動作都踩在拍上。',
    not: '不是手繪，也不是簡報：沒有漸層、模糊、紋理或柔和陰影。',
    colour: '每段一個飽和底色加同色系淺一階的花紋：例 桃紅 #FF4088／#FF72A9、晴空藍 #2DB4FF／#6FCDFF、檸檬黃 #FFD43C／#FFE47D、草綠 #3DCB6C；墨 #1C1C30。',
    type: '超粗圓體或 POP 字，白字加 10px 墨色硬投影。',
    fonts: ['Mochiy Pop One', 'M PLUS Rounded 1c', 'Zen Maru Gothic'],
    layers: 'fill（糖果色底）→ pattern checker 或 dots（淺一階，scroll，像攝影棚背板）→ panels（count 2–3，像參賽者分割畫面，各格 tint 不同糖果色，line 墨色粗線）→ band marquee（上下各一條跑馬燈）→ frame ticket（題目卡，label 寫歌名或段落名）→ shapes star（白或黃，ghosts 墨色 10px 硬投影，pulse，少量）。sunburst 只在副歌當「答對了」的瞬間（spin 快）。每個段落像節目的不同關卡：開場、題目、搶答、結算。',
    motion: '每個詞在拍上蹦出來（slam、bounce）；每段換底色和花紋。',
    templates: ['beat-cut', 'scatter', 'punch', 'stair', 'title-card', 'quiet', 'stack', 'array', 'tunnel'],
    native: '副歌爆點：整個畫面「判定！」——一顆巨大的星星炸開，放射紋加速旋轉。',
    craft: '綜藝的打擊感來自三件事：硬投影（同形狀墨色往右下偏 8–12px，畫在下面，不模糊）、粗墨線（lineWidth 6–10，round join）、踩拍的縮放（每拍 scale 1.12→1，0.18 秒，ease-out，只給主角物件）。背景花紋：斜紋用 createPattern 的 45° 雙色條紋，以每秒 40–80px 平移；放射紋 16–24 道，交替兩色，緩轉（每秒 6–12°），副歌加速到 3 倍。跑馬燈：上下兩條色帶裡的字以等速往反方向捲。活起來：小星星沿固定路徑繞圈、每 2 拍閃一次。轉場：一個圓形從畫面中央擴張到滿版（新底色），0.25 秒，ease-in。坑：投影方向要整首一致；所有東西都在跳會變吵（每拍只讓 1–2 個主角跳）。',
    props: { style: 'rhythm-game TV show vector art: thick black outline of even width, candy-bright flat fills, one hard offset drop-shadow tone inside the shape, chunky simplified forms with a little bounce in their proportions' },
    motif: false,
    suits: '元氣、應援、MIX 多、派對感強的偶像歌',
  },
  ukiyoe: {
    own: ['seal', 'waves', 'face'],
    koma: 12,
    name: '浮世繪',
    essence: '一張江戶時代的木版畫：和紙底、細細的雙框、分版平塗的色面、黑色主版輪廓線、略微對不準的套色，天空和水面用暈染漸層（ぼかし），長條的霞分隔遠近，角落一枚朱紅落款。',
    not: '不是水墨，也不是動畫賽璐璐：沒有光影立體感，深度只來自橫向分層和霞帶。',
    colour: '普魯士藍 #213F78、淺藍 #7090C0、朱 #C64A3B、黃土 #D8B26B、墨 #1B1A18、和紙 #EEE3CA。',
    type: '古典明朝或毛筆字，優先直排；墨色字，外圍一圈和紙色的暈邊。',
    fonts: ['Zen Old Mincho', 'Shippori Mincho', 'Yuji Syuku'],
    layers: 'paper（和紙）→ bands（天空藍的暈染色階，from 0 to 0.35）→ pattern waves（青海波，藍，opacity 0.35，下半部）→ mist（白或米色的霞帶）→ photo（band 或 inset，tint 藍或朱，ghosts 2px）→ frame border（雙框）→ seal（朱色落款，歌名的 2–4 個字）。',
    motion: '畫面像捲軸一樣橫向移動；字用 fade 慢慢浮現或手寫出來；換段落時讓霞帶滑過去。',
    templates: ['vertical', 'handwrite', 'quiet', 'stair', 'title-card', 'couplet'],
    native: '爆點：一道巨浪（青海波）從畫面下方湧起蓋滿，落款隨之蓋下。',
    craft: '木版的順序：先畫色版（平塗、不透明，每版整體固定偏移 2–3px），最後才畫主版（墨線 2–4px，線寬沿長度微變：用兩條平行偏移的路徑填滿，兩端收細）。暈染（ぼかし）：天空或水只在一條邊上漸層——一個方向的線性漸層，從濃色到透明只佔色面的 25–40%，其餘平塗；漸層加 3% 的橫向細紋（每 2px 一條極淡的線）模仿木紋刷痕。霞：橫長的圓角帶，邊緣是兩三段階梯狀的弧，米白不透明，緩慢橫移。青海波：以同心半圓弧堆疊的 createPattern。活起來：浪頭的「爪」沿弧線每拍伸縮一次、霞帶以每秒 4–8px 漂移、落款蓋下時 scale 1.15→1。轉場：霞帶從一側滑過整個畫面，霞後面換成新的一張版畫。坑：沒有主版線就變成扁平插畫；漸層鋪滿整個色面會變成數位感；寫實照片放進來會破壞木版質感（照片要轉成兩三色平塗）。',
    props: {
      style: 'Edo-period woodblock print (ukiyo-e) in the manner of Hiroshige and Hokusai: every shape has a black key-block outline (2-4px, slightly varying width), colours are flat carved colour blocks, each colour block printed 2px off its outline (registration offset), bokashi gradient only along one edge of sky and water, a faint washi fibre texture inside the colour areas only, Prussian blue, vermilion, ochre and muted green ink. Great waves have claw-like foam fingers; water has fine parallel line patterns. No modern vector look, no smooth digital gradients, no 3D shading.',
      reference: 'ukiyoe_shellfish.jpg',
    },
    scenes: true,
    motif: false,
    suits: '和風、四季、祭典、物語、古典感的歌',
  },
  papercut: {
    own: [],
    koma: 12,
    text: { ghost: [0.04, 0.04] },
    name: '剪紙',
    essence: '一切都是用剪刀剪出來的紙，平貼在另一張紙上：紅紙是主角，細節只來自被剪掉的鏤空，紙有厚度、投下細細的影子；到了夜晚，光從剪紙後面透出來。',
    not: '不是皮影戲，也不是向量插畫：沒有描邊、沒有漸層。',
    colour: '紅紙 #C5112F、深紅 #8B0D21、底紙 白天 #F2E8D0／夜晚 #1F1632、金 #E3B24F。',
    type: '粗明朝或毛筆，紅字或金字，外圍一圈底紙色的暈邊。',
    fonts: ['Zen Old Mincho', 'Shippori Mincho'],
    layers: 'paper（底紙）→ shapes（圓、星、菱形的紅紙，ghosts 一個 4px 深色硬影）→ blob（大紅圓，ghosts 深紅 6px）→ photo（circle，tint 紅）。',
    motion: '紙片一片一片貼上去（小幅度 slam）；換段落像翻過一張紙。',
    templates: ['vertical', 'scatter', 'stair', 'handwrite', 'quiet', 'title-card', 'couplet', 'ribbon'],
    native: '爆點：背光亮起——夜色底紙上，所有紅色剪紙同時透出光來。',
    craft: '剪出來的邊：形狀的外緣不是完美曲線——每 12–20px 一個頂點，加 ±1px 的固定雜訊，剪刀的直線段要看得出來。鏤空：先畫整片紅紙，再用 destination-out 挖出花紋（重複的菱格、卷草、花瓣），鏤空邊緣同樣用剪刀邊。厚度：每片紙下方畫同形狀的深色影（偏移 3–6px、模糊 2px、透明度 0.35），越靠前的層偏移越大。背光：夜晚時在紙層後面放一個暖色放射漸層，鏤空的地方透出光（光只出現在挖掉的洞裡）。活起來：紙片有極小的擺動（繞頂端釘點 ±1.5°，每 2–4 秒一個週期），像被風吹。轉場：一整張紙從一角翻起（用 transform 的縱向縮放模擬翻頁，0.4 秒），翻過去是新的一張。坑：邊緣太平滑會像向量；影子方向要一致；鏤空太細碎在影片裡會糊掉（花紋最小 6px）。',
    props: { style: 'cut paper: each item is cut from one sheet of red paper (or one other solid colour), all detail made by cut-out holes and slits, with the clean slightly irregular edges of scissors; no outlines, no shading on the paper, no drawn lines; the cuts read as negative space' },
    scenes: true,
    motif: false,
    suits: '喜慶、祭典、傳統、熱烈、紅色主題的歌',
  },
  crayon: {
    own: ['heart'],
    koma: 8,
    name: '蠟筆繪本',
    essence: '一頁正在被畫出來的繪本：粗紙上的蠟筆筆觸，薄薄刷上的水彩把蠟筆藏住的東西顯出來，畫面一秒只有 8–12 張，帶著手繪的抖動。',
    not: '不是乾淨的向量，也不是寫實水彩：線條要抖，紙的凹凸要看得到。',
    colour: '紙 #F4EDDA；粉彩 天藍 #8AC6E6、桃粉 #F2A4B6、奶油黃 #F4DA78、嫩綠 #A6D38A；線色 #3B2F5C。',
    type: '手寫字或圓體，深紫藍色；適合搭配手寫版型。',
    fonts: ['Klee One', 'Yomogi', 'Zen Maru Gothic', 'Yusei Magic'],
    layers: 'paper（粗紙 grain 0.9）→ photo（拍立得或 inset，像貼在本子上的圖）→ shapes（星、心，粉彩，outline true）→ sparkles（奶油黃）。媒材選 crayon。',
    motion: '字用手寫或打字慢慢出現；畫面一秒 8–12 張，輕輕抖動。',
    templates: ['handwrite', 'typewriter', 'vertical', 'stair', 'quiet', 'title-card', 'quote', 'ribbon'],
    native: '爆點：一張新的畫頁在一拍之內被塗滿顏色。',
    craft: '蠟筆的筆觸：不是一條粗線，而是 6–12 條細線（lineWidth 1.5–2.5）沿同一路徑各自偏移 ±2px、透明度 0.5–0.8 疊起來；塗色區用同方向的斜線來回塗（間距 3–5px，角度隨區塊固定），故意留下沒塗到的白點。紙紋：一張預先算好的凹凸圖，蠟筆層用 destination-in 只留在凸起處（覆蓋 70–85%），就會有蠟筆跳過紙紋的感覺。抖動：所有線條的頂點每一張畫面（8–12fps）換一組 ±1.5px 的固定雜訊（用 hash(index, 畫面號)），不要每格亂跳。水彩刷：低透明度（0.2–0.35）的大色塊用 multiply 鋪在蠟筆下面，邊緣稍不規則。轉場：一大筆蠟筆從左到右塗過整個畫面（0.5 秒），塗過的地方是新頁。坑：抖動跟著每一格（30fps）跳會變成閃爍；線太粗太整齊就像向量。',
    props: { style: 'picture-book art in wax crayon over thin watercolour wash: visible crayon strokes with paper texture skipping through them, soft pastel colours, a wobbly hand-drawn outline in a darker crayon, the watercolour bleeding slightly past the lines' },
    scenes: true,
    motif: true,
    suits: '溫柔、可愛、童話、日常、夜空的歌',
  },
  'neon-stage': {
    own: [],
    name: '霓虹舞台',
    essence: '黑底上的霓虹訊號：細格線、取景器框、城市照片被壓成單色長條，副歌換成旋轉的放射紋和警示膠帶；一個程式畫的發光主題物件貫穿全曲。',
    not: '不是通用的電子音樂素材：不要彩虹色、不要滿畫面雷射，霓虹色只有一到兩種。',
    colour: '黑 #08070D、一個主霓虹（電光粉 #FF2E97 或冰青 #42EEFF）、一個輔助霓虹、白字。',
    type: '粗黑體白字，強調字用主霓虹色。',
    fonts: ['Zen Kaku Gothic New', 'M PLUS Rounded 1c'],
    layers: 'fill 黑 → pattern grid（主霓虹，opacity 0.2）→ photo band（tint 主霓虹）→ frame viewfinder；副歌加 band tape（輔助霓虹）、shapes cross、speedlines（主霓虹）。',
    motion: '主歌用直排和階梯；副歌逐詞切換；爆點閃白。',
    templates: ['punch', 'stair', 'vertical', 'scatter', 'beat-cut', 'typewriter', 'quiet', 'title-card', 'stack', 'array', 'orbit', 'ribbon', 'tunnel'],
    native: '爆點：主題物件變成一條隧道，放射條紋加速旋轉。',
    craft: '霓虹管：一條路徑畫三次——外層光暈 lineWidth 18、透明度 0.15、模糊 12px，中層 lineWidth 8、透明度 0.5，核心 lineWidth 2.5、接近白的主色；三層用 lighter 疊。管子在轉角要有圓角（lineJoin round），兩端要有接頭的暗段（像真的燈管）。點亮：開燈時先閃 2–3 下（亮 0.05 秒、暗 0.08 秒）再穩定，不同燈管錯開開。格線：1px、主霓虹、透明度 0.15–0.2，往畫面深處有透視收斂。活起來：電流感——核心亮度每拍 +8% 再回落；舞台燈的光束（三角形、放射漸層到透明）緩慢掃動。轉場：所有霓虹一起熄滅（0.1 秒內暗到 15%），新畫面的燈管依序點亮。坑：每個東西都發光就沒有重點（發光物件一個畫面 ≤ 3 個）；光暈蓋到歌詞會讀不清（歌詞區外才放霓虹）。',
    props: { style: 'neon sign tubing: the item drawn only as continuous bent glass tubes of one or two neon colours on their metal mounts, tubes of even thickness with rounded ends and small gaps where the tube turns, bright core colour, NO glow halo and no light spill (glow is added later)' },
    motif: true,
    suits: '電子、搖滾、地下偶像、強烈節奏的歌',
  },
  'art-deco': {
    own: ['sunburst'],
    koma: 12,
    name: '裝飾藝術',
    essence: '1930 年代會動的海報：暖黑底、金色的細線雕刻、象牙白，左右對稱的中軸構圖，扇形放射和階梯狀的框；轉場從中軸打開或收起。',
    not: '不是賭場式的金光閃閃，也不是現代漸層：線條細而規律，金色只當線條和金屬，不鋪大面積。',
    colour: '暖黑 #15110D、金 #D3AE3A、象牙 #EEE4CC、一個留給主角的飽和色（酒紅 #8C2030／孔雀綠 #1F6A50／珊瑚 #DE775B）。',
    type: '古典明朝或細襯線，象牙或金色字，字距放寬，置中對稱。',
    fonts: ['Zen Old Mincho', 'Shippori Mincho', 'Noto Serif JP'],
    layers: 'fill（暖黑）→ frame deco（金，階梯角的雙框、上下中央的扇形、兩側箭紋，這是主角）→ photo（inset 或 circle，tint 主角色，置中，frame 金）→ shapes diamond（金，小，左右對稱散布，outline true）→ bands（暖黑與深金 2–3 階，from 0.85 to 1，當階梯狀的底座）。sunburst 只在副歌爆點用一次（金，opacity 0.15），平常不要。',
    motion: '中軸對稱：字從中線往兩側展開；轉場從中軸打開或收起；動作優雅而緩慢。',
    templates: ['punch', 'vertical', 'stair', 'quiet', 'title-card', 'typewriter', 'couplet', 'orbit'],
    native: '副歌爆點：金色扇形從畫面下方中央一口氣展開。',
    craft: '金屬感：金色不是單一色——用 3 階（暗金 #8A6A1E、金 #D3AE3A、亮金 #F4DC8A）沿線條方向做細窄的線性漸層，並在 45° 方向疊一道緩慢移動的亮帶（寬 40–80px、透明度 0.4，每 6–10 秒掃過一次）。雕刻線：同心弧或平行線 1–1.5px、間距 4–8px，組成扇面、階梯框、太陽紋；所有圖案以中軸鏡射（畫一半，scale(-1,1) 畫另一半）。階梯框：矩形的四角以 3–4 段直角階梯內縮。活起來：扇形的線依序點亮（從中軸向兩側，每條延遲 0.03 秒）、中央徽章極慢地旋轉（每秒 1–2°）。轉場：左右兩扇門從中軸關上（0.35 秒，ease-in），再打開是新畫面。坑：大面積金色會俗氣（金只佔畫面 ≤ 15%）；不對稱的構圖會失去裝飾藝術的味道。',
    props: { style: '1930s Art Deco poster engraving: symmetrical stylised forms, gold fine-line engraving and stepped geometric bands, ivory and black fills, streamlined curves and sunburst fans, crisp metallic gold drawn as flat ochre with fine parallel hatching for shine' },
    motif: false,
    suits: '華麗、成熟、爵士、夜晚、復古優雅的歌',
  },
  blueprint: {
    own: ['stamp', 'numeral'],
    name: '藍圖',
    essence: '一張正在被畫出來的工程藍圖：普魯士藍的底、白色的技術線條、格線和標註，照著繪圖的順序一條條出現；整首唯一不是藍白的，是一枚紅色印章。',
    not: '不是科幻抬頭顯示，也沒有漸層：只有藍和白，紅色整首只出現在印章上。',
    colour: '藍 #19346C→#2B59A7、白線 #E6EFF8、印章紅 #D03A2C（只用一次）。',
    type: '等寬或點陣字，白色，像工程師手寫的標註；靠左對齊。',
    fonts: ['DotGothic16', 'Zen Kaku Gothic New'],
    layers: 'fill（藍）→ pattern grid（白，opacity 0.15，scale 60）→ pattern grid（白，opacity 0.08，scale 12）→ frame window 或 brackets（白，label 寫歌名或圖號）→ photo（inset，tint 藍，frame 白）。最後一次副歌才放 stamp（紅）。',
    motion: '線條像被畫出來：字用打字或手寫；畫面依序加線；不要閃光。',
    templates: ['typewriter', 'stair', 'frame-split', 'vertical', 'quiet', 'title-card', 'handwrite', 'orbit'],
    native: '爆點：一道掃描線從上往下掃過，定位框鎖定在畫面中央。',
    craft: '繪圖順序就是動畫：每條線用 setLineDash([長度, 長度]) 加 lineDashOffset 從 長度→0 畫出來（直線 0.2–0.5 秒、圓 0.6 秒，ease-out），先畫外框、再畫中心線、再畫細節、最後標註。線型：外形 2px 實線、隱藏線 1px 虛線（8,6）、中心線 1px 長短線（16,4,2,4）。尺寸標註：兩端箭頭加中間的數字，數字在線畫完後才出現。紙：藍底加一層 1px 白色細網格（間距 12、透明度 0.08）和粗網格（間距 60、透明度 0.15），四角加輕微的暗角。活起來：游標十字線沿正在畫的線移動、已畫完的區域偶爾出現一個小小的修正記號。轉場：整張圖往上捲動（像換一張圖紙），新圖紙從空白開始畫。坑：線條一次全部出現就失去「繪製中」的感覺；白線太粗會像粉筆畫。',
    props: { style: 'technical blueprint drawing: the item drawn only in thin white construction lines (outline, section lines, centre lines, small dimension ticks), orthographic or isometric view, no fills except very light white hatching, crisp uniform line weight' },
    motif: true,
    suits: '理工、未來、計畫、夢想、構築感的歌',
  },
  'ink-wash': {
    own: ['seal', 'face'],
    koma: 12,
    name: '水墨',
    essence: '宣紙上的寫意水墨：留白就是空間，一筆就是一座山、一道浪或一個動作；墨從淡灰到濃黑，唯一的顏色是一枚朱紅落款。',
    not: '不是浮世繪（沒有平塗色塊），也不是書法字帖：畫面以留白為主，墨要少。',
    colour: '宣紙 #F1ECE0、淡墨 #9B978D、濃墨 #1B1815、朱 #AE3024（只用在落款和一個小重點）。',
    type: '毛筆或古典明朝，墨色字，優先直排，大量留白。',
    fonts: ['Yuji Syuku', 'Zen Old Mincho', 'Shippori Mincho'],
    layers: 'paper（宣紙）→ skyline（type peaks，wash true，colors 淡墨到濃墨 2–3 層，height 0.45–0.6：由山頂往山腳淡入霧裡的墨山）→ mist（宣紙色，soft true，count 2–3，壓在山腳）→ ink（淡墨，count 2–3，size 220，opacity 0.35，像一筆暈開的墨）→ seal（朱，歌名 2 個字，畫面一角，小）。',
    motion: '墨慢慢暈開；字直排慢慢浮現；節奏多留白。',
    templates: ['vertical', 'handwrite', 'quiet', 'stair', 'title-card', 'couplet', 'ribbon'],
    native: '爆點：一滴濃墨在畫面中央暈開。',
    craft: '紙是底、墨只能往上加：每一筆都用 multiply 疊，同一處疊越多越黑，永遠不要用白色蓋回去。筆觸：沿路徑等距取點（每 3–5px），每點畫一個橢圓「筆印」，寬度依筆壓曲線（起筆漸粗、收筆漸細），速度快的地方筆印間距拉大、透明度下降，就會出現飛白；筆印邊緣加 ±10% 的大小雜訊。暈：濕墨筆觸畫在離屏，用 filter blur(3–8px) 後以 0.4–0.6 的透明度疊在原筆觸下面，邊緣比中心淡。山：三到四層墨色由淡到濃、由遠到近，遠山只畫一條稜線加往下的淡暈，霧氣（宣紙色的水平帶）隔開各層。活起來：墨在紙上緩慢擴散（暈的半徑每秒 +1–2px，直到上限）、霧氣橫向漂移、一隻鳥或一葉舟用兩三筆畫成並緩慢移動。轉場：一大筆濃墨橫掃過畫面，筆過之處變成新的畫面（從墨裡長出來）。坑：墨太多就失去留白的意境（墨的面積 ≤ 25%）；用純黑實心填色會像剪影而不是水墨。',
    props: { style: 'Chinese/Japanese ink-wash painting: the item painted with a few confident brush strokes in black ink, from pale grey wash to dense black, dry-brush texture at the stroke ends, most of the form suggested rather than outlined, no colour except at most one small vermilion touch' },
    scenes: true,
    motif: false,
    suits: '中華風、古風、禪意、山水、孤獨或抒情的歌',
  },
  'stained-glass': {
    own: [],
    name: '彩繪玻璃',
    essence: '從石造大殿內部看見的彩繪玻璃窗：深色鉛條框住寶石般的玻璃，只有被陽光照到的地方才活起來；光的顏色就代表時間。',
    not: '不是馬賽克磁磚，也不是霓虹：底色要暗，顏色只能從玻璃透出來。',
    colour: '兩個主色（鈷藍 #213C95、寶石紅 #9C1C34）加少量金 #D8A443、綠 #2F7B4E；鉛條 #151019。',
    type: '古典明朝或襯線，象牙白字，置中。',
    fonts: ['Zen Old Mincho', 'Shippori Mincho', 'Noto Serif JP'],
    layers: 'fill（深 #0F0C15）→ mosaic type rose（玫瑰窗，x 偏左或偏右 ±0.5，r 0.4–0.5）或 mosaic type lancet（三扇尖拱窗，陽光帶會掃過）：colors 主色加點綴色，color 鉛條色，opacity 0.85–0.95 → fill（#000，opacity 0.3–0.45，讓字清楚；字用象牙白）→ particles（spark，象牙白，少量，像光裡的塵）。',
    motion: '光慢慢在玻璃上移動；字從光裡浮現；莊嚴而緩慢。',
    templates: ['vertical', 'quiet', 'stair', 'title-card', 'punch', 'orbit'],
    native: '爆點：一道陽光斜斜地掃過整扇窗。',
    craft: '分割：玻璃片是一組不規則多邊形（在構圖的大形狀內做 Voronoi 或沿輪廓切），鉛條是多邊形邊界用 lineWidth 5–8、深色、round join 描出來，邊界交會處畫一個小圓點當焊點。玻璃：每片平塗主色，再疊一層本片內的放射漸層（中心亮 15%、邊緣暗 10%），加 2–4 道極淡的細紋（玻璃的氣泡與刮痕）。透光：一道斜向的光帶（寬 300–500px、白色、透明度 0.25、lighter）緩慢掃過窗面；被光照到的玻璃片亮度 +25%，地面或牆上出現同色的柔和投影光斑。活起來：雲影經過讓整扇窗的亮度緩慢起伏（±8%，每 8–12 秒）。轉場：光帶加強到整窗發白再淡回來，淡回時已是新的圖。坑：沒有暗色鉛條就變成彩色馬賽克；所有玻璃一樣亮會像塑膠（只讓被光照到的地方亮）。',
    props: { style: 'stained glass panel: the item built from jewel-coloured glass pieces held by thick dark lead lines of even width, each glass piece flat with subtle streaky texture, a few bright light-catching panes, deep cobalt, ruby, gold and green' },
    scenes: true,
    motif: false,
    suits: '神聖、命運、祈禱、悲劇、宏大的歌',
  },
  'spy-titles': {
    own: ['echo', 'face'],
    proven: true,
    kit: { song: '周杰倫〈雙截棍〉', craft: '滿版剪紙場景圖當世界，道具用同一種紙剪出來（紙的厚度、陰影、纖維），雙色加金；強烈對角構圖、剪影、片頭字卡式的大字；鏡頭在場景間移動，道具參與事件（擊打、飛出、展開）。不要通用插畫風的道具，不要把場景圖當小框貼。' },
    name: '諜報片頭',
    essence: '一部不存在的電影的剪紙四色片頭：剪影在由片頭字幕構成的布景裡移動，每個場景一個主色底，熱色只留給英雄和危險。',
    not: '不寫實、沒有漸層：只有四種墨色的平面剪紙。',
    colour: '四色一組：墨黑 #1C1815、奶油 #EEE3C8、熱紅 #D13C24、芥末 #E0A42B（或 炭黑 #171B23／骨白 #EBE5D5／深青 #208989／亮橘 #EF7B29）。',
    type: '粗黑體或襯線，奶油色或墨色字，常常斜排或嵌在色塊之間。',
    fonts: ['Zen Kaku Gothic New', 'Zen Old Mincho'],
    layers: 'fill（場景主色）→ skyline（type city，colors 主色的深淺 2 層）→ band solid（墨或熱紅，斜，像切開畫面）→ shapes circle（大，熱紅，少量）→ frame brackets（只放在有歌詞的段落，框住字；前奏、間奏沒有字就不放）。每段換主色。',
    motion: '剪影橫向移動、硬切換場；字斜切進場；節奏俐落。',
    templates: ['stair', 'scatter', 'beat-cut', 'punch', 'frame-split', 'quiet', 'title-card', 'stack', 'array', 'couplet', 'quote', 'tunnel'],
    native: '爆點：一塊黑色剪影從畫面一側橫掃過去，換到下一個場景。',
    craft: '剪紙的手感：所有形狀都是手剪的平面——邊緣是略帶角度的直線段（每 15–30px 一個轉折），沒有完美的圓；形狀之間故意留 2–4px 的縫，露出底色。構圖：大塊的斜切（20–35°）把畫面分成兩三個色區，人物剪影（帽子、風衣、槍、望遠鏡等）只用一個顏色；文字嵌在色塊之間，跟著色塊一起被切。動作：剪影只做平移和簡單的關節旋轉（像紙偶），每 2 拍換一個姿勢；色塊從畫外滑進來後硬停。活起來：遠景的城市剪影極慢橫移、探照燈的三角光束緩慢掃過。轉場：一塊墨黑的形狀（圓、門、槍口）從畫面一側掃過或從中央擴張成滿版，再縮回時已是新場景。坑：用超過四色就失去片頭感；圓滑的向量曲線會破壞剪紙感。',
    props: { style: '1960s spy-film title sequence cut-paper silhouettes: bold flat shapes in at most two colours (ink black plus one of cream, hot red or mustard), no interior detail except a few cut-out slits, crisp scissor-cut edges with a slight hand-made wobble, strong graphic poses, no outlines, no shading, no texture' },
    scenes: true,
    motif: false,
    suits: '帥氣、間諜、懸疑、爵士搖滾、酷的歌',
  },
  pictogram: {
    own: ['stamp'],
    proven: true,
    kit: { song: 'JAPANARIZM〈てぇてぇ〉', craft: '一段一個飽和純色底（fill）＋大圓點圖樣（dots，比底色淺一階）；物件是圖像模型畫的扁平圖示（粗幾何、無描邊、無陰影、顏色取自段落配色），大、清楚、置中構圖；鏡頭多、構圖大膽；印章字作為標題。不要用程式畫具體物件或人物，不要寫實光影。' },
    name: '圖形卡',
    essence: '用圓、半圓、方格拼成的節拍閃卡：每一拍，格子裡的圖形翻面換色；一段一個色系，用同一色的五個色調。',
    not: '不是插畫，也不是向量角色：只有幾何圖形和字。',
    colour: '一組五色加一個深色：例 番茄紅 #DE4A3B、葡萄紫 #6A51A2、松綠 #307A50、向日葵金 #E6B434、赭石 #C57B3B；奶油 #F3EDDE、墨 #1C1C23。一段只用一個顏色的五個色調。',
    type: '粗黑體或圓體，淺色調上放深色字，深色調上放奶油色字。',
    fonts: ['Zen Kaku Gothic New', 'M PLUS Rounded 1c', 'Zen Maru Gothic'],
    layers: 'fill（該段主色）→ pattern dots（同色淺一調，scale 120，opacity 0.5）→ shapes circle（大，深一調，pulse）→ swissgrid（細線，bars 帶透明感）。',
    motion: '每拍換一個圖形；字硬切；節拍精準。',
    templates: ['beat-cut', 'stair', 'punch', 'scatter', 'quiet', 'title-card', 'stack', 'array', 'tunnel'],
    native: '爆點：整面圓點格依序翻成強調色。',
    craft: '格子系統：畫面切成 4×3 或 6×4 的方格，每格只放一個基本形（圓、半圓、四分之一圓、方、三角），形狀貼齊格邊。翻面：每拍隨機（用 hash(格號, 拍號)）挑 1–3 格，把形狀繞 x 或 y 軸翻 180°（縮放 1→0→1，0.2 秒），翻到背面時換成另一個形狀或色調。色調：同一色相的五階明度（例 L 25/40/55/70/85），相鄰格不要同一階。圖示：需要具體東西時，用最少的幾何組合（雲 = 三個圓、房子 = 方加三角），不畫細節。活起來：一顆小圓沿格線移動、每拍換格。轉場：所有格子由左上往右下依序翻面（每格延遲 0.03 秒）。坑：加了漸層、陰影或描邊就不是圖形卡；色調太多會變花（一段 ≤ 5 階）。',
    props: { style: 'flash-card pictograms assembled from circles, half circles, quarter circles and squares only: two or three flat colours from one hue family, no outlines, no shading, chunky friendly geometry on an invisible grid' },
    motif: false,
    suits: '節奏明快、可愛、資訊感、電子流行的歌',
  },
  watercolor: {
    own: [],
    koma: 12,
    name: '水彩手帳',
    essence: '一頁親手畫出來的旅行手帳：透明水彩一層層疊色、乾筆的飛白，紙的白就是光，旁邊有手寫的筆記。',
    not: '不是蠟筆繪本（沒有蠟筆筆觸），也不是數位漸層：顏色分成 4–6 階。',
    colour: '紙 #F5EEE1；3–5 個水彩色（例 晨港：天 #F2E0C5、水 #9CB2C2、船 #5E7385）；一個重點色（朱 #C6462C）；墨線 #3B2F29。',
    type: '手寫字或圓體，墨色字，像寫在本子上。',
    fonts: ['Klee One', 'Yomogi', 'Zen Maru Gothic', 'Zen Kurenaido'],
    layers: 'paper（紙）→ ink（水彩色，count 4，size 300，opacity 0.4，blend multiply）→ photo（拍立得或 inset，tilt，像貼上去的照片）→ shapes（星或圓，重點色，小，outline true）。',
    motion: '顏色慢慢暈開；字一筆一筆寫出來；溫柔緩慢。',
    templates: ['handwrite', 'typewriter', 'vertical', 'stair', 'quiet', 'title-card', 'quote', 'orbit', 'ribbon'],
    native: '爆點：一團顏料從中央暈開。',
    craft: '透明疊色：每個色塊都畫 3–5 層，每層是同一形狀做兩三輪「中點位移」變形（每條邊中點沿法線推 ±邊長 8%，每輪幅度乘 0.6），以 multiply、透明度 0.08–0.15 填色；疊越多層越深，邊緣自然參差。水痕邊：每層填完再沿外緣描一圈同色 1.2–1.8px、透明度 0.3 的線，層層累積就是顏料在邊緣沉積的深色邊。留白：亮部直接不畫（紙的白就是光），不要用白色蓋。乾筆：大筆觸沿方向取樣，速度快的地方隨機斷開，露出紙紋。紙紋：最上層 multiply 一張低對比的冷壓紙紋理（亮度 0.92–1.0），整首共用一張預算好的圖。活起來：濕的顏色在 1–2 秒內慢慢暈開（形狀半徑 +3–6%，邊緣變淡）、雲緩慢漂、水面的反光短線閃爍。轉場：一團水從中央往外暈開，暈過的地方變成新畫面（形狀用同樣的中點位移，0.6–0.9 秒）。坑：疊色透明度太高會髒成灰；矩形色塊會出現接縫（大面積一定要用變形的多邊形）；整體太暗就不像水彩（亮部要多）。',
    props: { style: 'travel-sketchbook watercolour: transparent washes layered wet-on-dry, soft blooms and hard dried edges, white paper left as highlights, a thin loose ink-pen line sketch under the colour, slight dry-brush texture' },
    scenes: true,
    motif: false,
    suits: '旅行、日常、溫柔、回憶、青春的歌',
  },
  hologram: {
    own: [],
    name: '全像介面',
    essence: '物體被掃描成發光的線框，目標框鎖定、資訊引線拉出，數值在鎖定的那一刻變成強調色。一個冷色加一個暖色。',
    not: '不是駭客綠雨，也不是滿畫面雜訊：線條精準，資訊有層次。',
    colour: '冷色（薄荷 #62F0D2 或冰藍 #82D6FF）加暖色強調（琥珀橘 #FF8C3F）；底 #060A0F。',
    type: '等寬或點陣字，冷色字，數字和關鍵字用暖色。',
    fonts: ['DotGothic16', 'Zen Kaku Gothic New'],
    layers: 'fill（#060A0F）→ pattern grid（冷色，opacity 0.12）→ frame viewfinder 或 brackets（冷色，label 歌名或代號）→ chargrid（冷色，field rain，opacity 0.15）→ scanlines（opacity 0.3）。',
    motion: '掃描、鎖定、展開；字打出來；動作精準。',
    templates: ['typewriter', 'frame-split', 'stair', 'beat-cut', 'quiet', 'title-card', 'stack', 'orbit', 'tunnel'],
    native: '爆點：掃描線從上掃到下，目標框鎖定在中央。',
    craft: '線框物件：用 3D 點投影成 2D（簡單的透視：x/z、y/z），只畫邊線，1–1.5px、冷色；背面的線透明度降到 0.25。掃描：一條水平亮帶（高 6–10px、lighter）由上往下掃過物件，掃過的地方線條才出現（用 clip 的矩形高度控制），掃描帶後面留一段 0.3 秒的殘光。鎖定框：四個角括號從畫面四角飛到目標周圍（0.3 秒、ease-out），最後一下輕微過衝 3% 並發出一次閃光（暖色、0.08 秒）。資訊引線：從目標拉出折線到標籤，線先畫、字後打。數字：滾動計數器，鎖定時從冷色變暖色。活起來：物件緩慢自轉（每秒 6–10°）、雜訊線偶爾橫切而過、資料欄位每拍刷新一個值。轉場：整個畫面的線條斷成片段往外散開（0.3 秒），新物件從掃描中出現。坑：發光太強會糊；資訊太滿就變成噪音（一個畫面最多 3 個標籤）。',
    props: { style: 'holographic wireframe scan: the item drawn as thin evenly spaced contour and mesh lines in one cool cyan/mint colour, with a few accent lines in amber, transparent between the lines, no solid fills, crisp lines, no glow halo' },
    motif: true,
    suits: '科幻、電子、戰鬥、近未來、冷酷的歌',
  },
  'silent-film': {
    own: [],
    koma: 12,
    name: '默片',
    essence: '老電影院裡放映的默片：銀色單色、片門的晃動和刮痕、4:3 畫面，靠插卡字幕講故事，轉場用光圈收合。',
    not: '不是現代黑白攝影：要有片子本身的質地和字卡的排版。',
    colour: '單色銀：暗 #151310、亮 #E8E1D0；可以依段落整段染色（琥珀 #C8A268、夜藍 #3F5B7B、玫瑰 #B87B81）。',
    type: '古典襯線，置中，像插卡字幕，外加細框。',
    fonts: ['Zen Old Mincho', 'Shippori Mincho'],
    layers: 'fill（暗）→ photo（full，tint 染色）→ frame filmstrip 或 border（細框）→ scanlines（gap 2，vignette 0.8）。字卡段：fill 黑 → frame border 象牙。',
    motion: '畫面微晃；轉場用光圈收合；字卡淡入淡出。',
    templates: ['frame-split', 'quiet', 'vertical', 'typewriter', 'title-card', 'couplet', 'quote'],
    native: '爆點：光圈收到剩一個點，再打開成新的畫面。',
    craft: '放映的質地：整張畫面每格整體位移 ±1px（片門晃動，用 hash(格號)），亮度每格 ±3%（曝光閃爍），偶爾（每 2–4 秒）出現一條垂直的細刮痕（1px、亮或暗、存在 3–8 格）和幾點灰塵（2–4px 的不規則點，只存在 1 格）。顆粒：一張預先算好的細雜訊圖，每格以不同偏移疊上（overlay、透明度 0.12）。染色：最後整張用 multiply 疊一層段落色。片框：四角圓角的暗角（放射漸層到 0.8 黑）。字卡：黑底、象牙色古典字、雙線細框加四角的裝飾花紋。光圈：用 arc 做 clip，半徑從滿版收到 0 或從 0 打開（0.5–0.7 秒，ease-in-out），圓心可以停在主角身上。活起來：除了上述放映效果，畫面內的東西以 12fps 動。坑：刮痕和閃爍太多會累眼（刮痕同時 ≤ 1 條）；字卡不加框就像現代字幕。',
    props: { style: 'silent-film era illustration: monochrome silver-grey tones only, engraved/etched hatching for shading, a fine black outline, slightly soft vintage print quality, like a 1920s intertitle ornament or lantern slide' },
    motif: false,
    suits: '懷舊、浪漫、喜劇、悲劇、昭和復古的歌',
  },
  woodcut: {
    own: ['sunburst'],
    koma: 12,
    name: '木刻版畫',
    essence: '一塊會自己雕刻的木版：黑色是版面，白色只存在被刀刻掉的地方；最多加一個色版，只印在刻出來的白上。',
    not: '不是線稿插畫：以黑為主，白是刻痕，刀法粗而有力。',
    colour: '墨黑 #0D0C0B、紙白 #EEE6D4、一個色版（銅橘 #C6652F、普魯士藍 #2B4C7D 或牛血紅 #7B2020）。',
    type: '粗黑體或毛筆，紙白字刻在黑上，或黑字印在白紙上。',
    fonts: ['Zen Kaku Gothic New', 'Yuji Syuku', 'Zen Old Mincho'],
    layers: 'fill（墨黑）→ pattern stripes（紙白，scale 6，angle 斜，opacity 0.25，像刻痕）→ skyline（type peaks 或 trees，colors 紙白，height 0.3）→ blob（色版，刻出來的太陽或心）→ frame border（紙白）。',
    motion: '刻痕一刀一刀出現；字像被刻出來；剛硬。',
    templates: ['punch', 'stair', 'vertical', 'beat-cut', 'quiet', 'title-card', 'couplet'],
    native: '爆點：一塊黑色木版剪影橫掃過去，刻出新的畫面。',
    craft: '刻的邏輯：先鋪滿墨黑，再用紙白「刻」——每一刀是一個細長的楔形（一端尖、一端 2–5px 寬），沿形狀的輪廓或明暗方向排列；亮部刀痕密而寬，暗部疏而細，用刀痕的密度表現明暗（就像版畫的排線）。刀痕方向跟著形狀走（天空水平、山沿稜線、水面波浪）。版的質地：黑色區域疊一層極淡的木紋（沿一個方向的長雜訊，紙白、透明度 0.04–0.08），印刷不實的地方用 destination-out 撒 3–5% 的小白點。色版：一個顏色只出現在刻出的白上，整體錯位 2–3px。活起來：刀痕一刀一刀刻出來（每刀 0.04–0.08 秒，依順序）；光源的放射刀痕緩慢旋轉。轉場：一大片黑版從一側推過畫面，推過的地方重新被刻。坑：白色太多就變成線稿（白 ≤ 40%）；刀痕全部同方向會像條紋圖樣。',
    props: { style: 'relief woodcut: the item carved in solid black with white gouge marks giving form (parallel cut lines following the shape), rough confident knife edges, at most one extra flat colour printed only in carved-out areas, no grey tones' },
    scenes: true,
    motif: false,
    suits: '民謠、搖滾、憤怒、土地、命運感的歌',
  },
  midcentury: {
    own: [],
    koma: 12,
    name: '世紀中卡通',
    essence: '1950 年代的平面色塊和有限動畫：色塊故意印得偏離斷斷續續的輪廓幾像素，原子時代的星芒和迴旋鏢形狀，暖色紙底。',
    not: '不是現代扁平向量：顏色柔和、線條斷續、有印刷偏移。',
    colour: '暖紙 #F2E9D5、暖墨 #2C2521；柔和的互補色（珊瑚 #E7745B／芥末 #E3B43D／土耳其藍 #3CA49F）。每段一個底色。',
    type: '圓體或手寫感的字，暖墨色。',
    fonts: ['M PLUS Rounded 1c', 'Zen Maru Gothic', 'Yusei Magic'],
    layers: 'paper（暖紙）→ fill（段落底色，opacity 0.6）→ shapes star（芥末或珊瑚，ghosts 4px 偏移，pulse）→ blob（大，互補色，偏左或偏右）→ frame border（暖墨，細）。',
    motion: '畫面大多靜止、只有局部在動；字跳進場；節奏輕快。',
    templates: ['scatter', 'stair', 'punch', 'handwrite', 'quiet', 'title-card', 'array', 'ribbon'],
    native: '爆點：原子星芒從下方中央綻開。',
    craft: '印刷偏移：色塊和輪廓線分開畫——色塊是柔和的平塗、整體往右下偏 3–6px；輪廓線是暖墨 2–3px、刻意斷開（每段 20–60px 後空 4–10px），兩者對不準正是這個年代的味道。形狀語彙：迴旋鏢（兩段弧組成的不對稱弧形）、四到八芒的原子星（細長尖角）、腎形桌面、斜腳的家具、細長的天線；構圖偏不對稱，留白多。質地：底紙暖色加極淡的網點或細紋（透明度 0.06）。有限動畫：只讓局部動（手、眼睛、尾巴、天線），其他靜止；動作用 3–4 個關鍵姿勢直接切換（12fps），不做補間。活起來：原子星每拍閃爍旋轉 15°、背景的迴旋鏢圖案緩慢漂移。轉場：一個大色塊形狀（圓或迴旋鏢）從畫面一角滑過整個畫面帶出新底色（0.3 秒）。坑：輪廓線對得太準就變成現代向量；顏色太飽和就失去年代感。',
    props: { style: '1950s limited-animation cartoon: flat colour blocks deliberately printed a few pixels off a thin, broken black outline, atomic-age stylisation (boomerang and kidney shapes, starbursts), warm muted palette, no gradients' },
    motif: false,
    suits: '輕快、復古流行、可愛、懷舊美式的歌',
  },
  'paper-lantern': {
    own: [],
    koma: 12,
    name: '紙雕燈',
    essence: '一盞層層紙雕的燈箱：六到九層剪紙前後疊起來，後面的層亮而透、前面的層暗而實，暖光從背後透出來，窗戶和燈籠發亮。',
    not: '不是單層剪紙：深度來自明暗的階梯；光只有暖色。',
    colour: '一組由遠到近的明暗階梯（夜村：天 #0B1431 → 遠 #6B87C3 → 中 #405B93 → 前 #0F1633，窗光 #FFB964）；一個重點色。',
    type: '明朝或圓體，暖白字，外圍一圈深色暈邊。',
    fonts: ['Zen Old Mincho', 'Shippori Mincho', 'Zen Maru Gothic'],
    layers: 'fill（最後面那層的天色）→ skyline（type city 或 hills，colors 由遠到近 3–4 層，windows 暖色）→ sparkles（暖色，少量，像燈籠）→ mist（遠層色，opacity 0.4）。',
    motion: '各層緩慢視差；暖光像呼吸一樣明暗；轉場像換了一盞燈。',
    templates: ['vertical', 'quiet', 'stair', 'handwrite', 'title-card', 'orbit', 'ribbon'],
    native: '爆點：燈亮起來，暖光從背後透過所有紙層。',
    craft: '層的深度：6–9 層剪影由遠到近，每層一個平塗色——越遠越亮、越偏冷、越不飽和，越近越暗；每層邊緣是剪紙的參差（每 10–20px 一個轉折，±1px 雜訊）。透光：每層的上緣疊一條 2–4px 的暖色亮邊（光從後面繞過紙邊），窗戶和燈籠是挖空的洞，洞裡填暖色並用 lighter 疊一個小光暈（半徑 2–3 倍）。層間的影：每層在下一層上投一道柔影（往下偏 6–12px、模糊 8px、透明度 0.3）。視差：層越近移動越快（最近的層速度 = 最遠的 4–6 倍），鏡頭移動時才看得出深度。活起來：燈光呼吸（亮度 ±6%，每 3–5 秒）、窗戶一盞盞亮起或熄滅、螢火或燈籠緩慢上升。轉場：所有燈熄滅（0.3 秒）再依序亮起新的一盞燈箱。坑：層與層顏色太接近就變平；冷色的光會破壞溫暖感（光只用暖色）。',
    props: { style: 'layered paper-cut lightbox: the item cut as a dark solid silhouette with small translucent window cut-outs glowing warm amber from behind, two or three paper layers stacked with slightly different darkness, crisp cut edges, no glow halo outside the shape' },
    scenes: true,
    motif: false,
    suits: '夜晚、故鄉、祭典、思念、溫暖的歌',
  },
  screentone: {
    own: [],
    text: { ghost: [0.05, 0.05] },
    name: '漫畫網點',
    essence: '一頁少女漫畫在動：白紙黑線、網點紙貼出的灰階與漸層、分格框切開畫面，心情用背景的花、光點和集中線來說；最強烈的一刻整頁只剩一個大格。',
    not: '不是美漫普普（沒有粗彩色網點），也不是全彩動畫：除了一個淡淡的特色色，全部是黑白灰。',
    colour: '紙白 #FBFAF6、墨黑 #141414、網點灰（30%／60% 兩種密度）、一個特色色（櫻粉 #F29BB0 或天空藍 #8CC7EA），只用在花瓣或腮紅那種小地方。',
    type: '粗黑體的「台詞」放在對話框或直接壓在格子上，重要的字加粗加大；可直排。',
    fonts: ['Zen Kaku Gothic New', 'Zen Maru Gothic', 'Shippori Mincho'],
    layers: 'paper（紙白）→ pattern halftone（墨，scale 10–16，opacity 0.35，貼在畫面一側當網點紙）→ frame brackets 或 border（墨，當分格框）→ sparkles（白或特色色，當少女漫畫的光點）→ speedlines（墨，副歌的集中線）。',
    motion: '分格一格一格出現（硬切或從格邊滑入）；感情高漲時切到單一大格；字像台詞一樣蹦出。',
    templates: ['punch', 'vertical', 'beat-cut', 'quiet', 'title-card', 'stack', 'quote', 'tunnel'],
    native: '爆點：集中線從四周收向中央，整頁網點閃一下——漫畫裡「決定性的一格」。',
    craft: '網點紙：用 createPattern 做一張 45° 的圓點小圖（格距 8–12px，點徑隨灰階），貼在一塊不規則的區域上（用 clip），邊緣用美工刀感的直線切，偶爾故意貼歪 1–2°；漸層網點 = 同一格距、點徑從 0 漸大。分格：黑框 4–6px、格與格之間留 12–20px 白，格子可以斜切（10–15°），重要的鏡頭打破格框（物件超出框外）。效果背景：花朵（五瓣、只有輪廓或淡網點）、閃光（四芒星）、泡泡（細線圓）、集中線（從畫外往內、粗細漸變的楔形，留中央空白）。墨線：粗細有變化（起筆收筆細），用兩條偏移路徑填滿。活起來：花瓣緩慢飄落並旋轉、光點閃爍、集中線每拍收縮一次。轉場：翻頁——畫面像紙一樣從右下角捲起（用 transform 模擬，0.4 秒）。坑：顏色一多就不像漫畫；網點太細在影片裡會變成灰色雜訊（格距 ≥ 8px）。',
    props: { style: 'black-and-white shoujo manga ink: crisp G-pen black lines with varying thickness, grey areas filled with mechanical dot screentone (clearly visible dots), pure white highlights, at most one tiny pale pink accent, no colour fills otherwise' },
    scenes: true,
    motif: false,
    suits: '戀愛、青春、告白、戲劇性強的偶像歌',
  },
  chiyogami: {
    own: ['waves'],
    koma: 12,
    text: { ghost: [0.03, 0.03] },
    name: '千代紙',
    essence: '一疊印著傳統花紋的和紙：麻葉、市松、青海波、櫻花、菱紋，一張一張摺、疊、貼，構圖由紙片的形狀組成，紙的纖維和金粉在光下閃。',
    not: '不是浮世繪（沒有風景與主版線），也不是剪紙（紙不是主體，花紋才是）：重點是花紋本身。',
    colour: '每段一組三到四色的和色：例 紅梅 #D34A5A 配 若草 #A7C46A 配 金 #D9B04C；藍鼠 #6B7D9C 配 桜色 #F1C6CF 配 白 #F7F2E8；底紙 #F4ECDD。',
    type: '明朝或圓體，墨色或白字，可以放在一張素色的紙片上。',
    fonts: ['Zen Old Mincho', 'Shippori Mincho', 'Zen Maru Gothic'],
    layers: 'paper（底紙）→ pattern gingham 或 checker（花紋紙，一色，opacity 0.6）→ pattern waves（另一張花紋紙）→ shapes diamond（紙片，ghosts 3px 深色影）→ sparkles（金，少量，像金粉）。',
    motion: '紙片在拍上一張一張貼上或翻轉；摺紙像被摺出來；節奏輕盈。',
    templates: ['scatter', 'stair', 'vertical', 'punch', 'quiet', 'title-card', 'array', 'couplet', 'ribbon'],
    native: '爆點：一張花紋紙從中央像摺紙一樣展開，蓋滿畫面。',
    craft: '花紋：每種傳統紋用 createPattern 做成一個單位圖——麻葉（六芒的放射三角，線 1.5px）、市松（兩色方格）、青海波（同心半圓三四圈）、矢絣（交錯的箭羽）、櫻（五瓣小花散布），單位 40–80px，兩三色。紙片：每張紙是平塗底色加一種花紋，邊緣是撕或剪的參差（±1px），下面一道柔影（偏移 3–5px、模糊 3px、透明度 0.3）。摺紙：一張方紙沿對角線摺 = 一半的路徑用 scale 從 1 到 −1 翻過去，翻到背面換成素色；摺痕畫一條淡淡的亮線。金粉：極少量的小金點（2–3px），隨光掃過時閃一下。活起來：紙片微微飄動（±2°）、一隻紙鶴沿弧線緩慢飛、花紋本身極慢平移。轉場：一張新的花紋紙從畫面一側摺過來蓋住（像翻書），0.4 秒。坑：同時用太多種花紋會很亂（一個畫面 ≤ 3 種）；花紋太小在影片裡會糊（單位 ≥ 40px）。',
    props: { style: 'traditional Japanese chiyogami paper craft: each item folded or cut from patterned washi paper (asanoha, ichimatsu, seigaiha, sakura motifs printed in two or three colours with gold accents), crisp paper folds with one flat darker fold-shadow tone, no outlines' },
    scenes: true,
    motif: false,
    suits: '和風可愛、祭典、新年、少女、輕快的歌',
  },
  aizome: {
    own: [],
    koma: 12,
    name: '藍染',
    essence: '一匹剛從染缸拉起的藍染布：深淺不一的靛藍，綁紮、夾板留下的白色紋樣（絞り），邊緣滲開柔和；布的織紋和一點點縐摺。',
    not: '不是水彩（沒有暖色）、不是浮世繪（沒有輪廓線）：只有藍與白，紋樣都是「沒被染到」的地方。',
    colour: '靛藍的深淺：甕覗 #C9DCE6、淺蔥 #7FA8C2、縹 #3E6D99、藍 #1E3F6B、褐返 #10203A；留白是生成色 #F1EEE6。',
    type: '明朝或手寫，生成色字壓在深藍上，或深藍字在淺色布上。',
    fonts: ['Zen Old Mincho', 'Shippori Mincho', 'Klee One'],
    layers: 'fill（藍，深淺依段落）→ ink（較淺的藍，count 4，size 320，blend multiply，像布上深淺不一的染色）→ pattern shibori（生成色，scale 50–80，opacity 0.4–0.6：鹿子絞的白色小圈）或 pattern itajime（生成色，scale 140–200，opacity 0.4–0.6：板締的方格白紋）→ mist（淺蔥，soft true，opacity 0.3，像布的縐摺光）→ photo（inset，tint 藍，可有可無）。',
    motion: '藍色像在布裡慢慢滲開；畫面像布一樣輕輕飄動；轉場像把布掀開。',
    templates: ['vertical', 'quiet', 'stair', 'handwrite', 'title-card', 'couplet', 'ribbon'],
    native: '爆點：深藍從中心往外泡開，留下一圈圈白色的絞染紋。',
    craft: '染的邏輯和繪畫相反：先想「哪裡被綁住、沒染到」——底色是最深的藍，紋樣是白。絞り（綁紮）：同心圓或放射狀的白紋，每一圈的邊緣不是銳利線，而是向外滲出的羽化（用放射漸層從白到透明，寬度 6–12px）；夾板紋：重複的方格或菱形白塊，邊緣同樣滲開。深淺：同一塊布用 multiply 疊兩三層不同深的藍、各自是大幅變形的不規則形，形成染色不均。布：極淡的織紋（橫豎各一組 1px 細線，間距 3px，透明度 0.05）和一兩道柔和的縐摺陰影（長條、模糊 20px、透明度 0.15）。活起來：整塊布以低頻的正弦波起伏（每列位移 ±4px，緩慢移動），白紋緩慢擴散。轉場：一塊布從上方垂落蓋住畫面，再拉走露出新的紋樣。坑：白紋邊緣太銳利就像貼圖；加入藍以外的顏色會破壞染色感。',
    props: { style: 'indigo shibori dye: the item rendered in shades of indigo blue on cloth, its shapes and patterns formed by undyed white resist marks with soft bleeding edges, visible fine cloth weave texture, no colours other than indigo and off-white' },
    scenes: true,
    motif: false,
    suits: '夏天、清涼、寧靜、和風、成熟的歌',
  },
  citypop: {
    own: [],
    text: { ghost: [0.03, 0.03] },
    name: 'City Pop',
    essence: '一張 80 年代唱片封面般的度假插畫：大片晴空的噴槍漸層、泳池的水紋、棕櫚樹、白色建築的硬邊陰影、遠方的海平線與一輪落日；乾淨、明亮、有點寂寞。',
    not: '不是 80 年代賽璐璐（那是夜景加錄影帶），也不是蒸汽波（沒有紫粉網格和故障）：這裡是白天或黃昏，乾淨而安靜。',
    colour: '天空 #4FB3E8→#BDE6F7、泳池 #2EC4D6、白牆 #F7F4EE、陰影 #6F8FB8、棕櫚 #2F6E5A、落日 #FF8A5B／#FFC56E。',
    type: '細到中等粗細的黑體或英文襯線，白色或深藍色字，字距放寬，像唱片封面上的標題。',
    fonts: ['Zen Kaku Gothic New', 'Montserrat', 'Cormorant Garamond'],
    layers: 'fill（天空漸層，to 淺藍）→ bands（海與地平線，2–3 色）→ blob（落日，ghosts 無）→ skyline（type hills 或 city，colors 白牆與陰影 2 層）→ pattern stripes（泳池水面的反光條紋，白，opacity 0.2，下半部，scroll 慢）→ frame border（細白框，像唱片封面）。',
    motion: '畫面極慢地平移或推近；字淡入並停留很久；光影隨時間緩慢改變。',
    templates: ['stair', 'quiet', 'vertical', 'typewriter', 'title-card', 'orbit', 'ribbon'],
    native: '爆點：一輪帶橫條紋的落日從海平線升起。',
    craft: '噴槍天空：線性漸層 3–4 個色點，加一層極細的雜訊（±1.5%）防止色帶；雲是邊緣柔和的白色形狀（多個圓疊、模糊 6px）。硬邊陰影：建築、棕櫚、泳池邊都是平塗，陰影是同形狀偏移後的單一冷色（不模糊），光源方向整首一致（例如右上）。泳池：水面是青色平塗，上面是白色的焦散紋路——一組波動的細線（每條是正弦曲線，相位隨時間移動，線寬 2–3px、透明度 0.4）。棕櫚：葉子是幾片彎曲的細長葉形，繞著頂點以 ±3° 緩慢搖擺。落日：圓形裡用水平條紋 clip（下半部條紋漸寬漸疏）。活起來：水紋流動、棕櫚搖曳、遠方的帆船極慢移動、光線隨段落從正午變成黃昏（整體色溫慢慢變暖）。轉場：畫面向上平移，像唱片封套被抽出，下一張封面露出。坑：所有東西都動會失去度假的慵懶感（主歌幾乎靜止）；用霓虹或故障效果就變成蒸汽波。',
    props: { style: '1980s city-pop record-sleeve airbrush illustration: clean hard-edged shapes with smooth airbrushed gradients, bright clear daylight colours, crisp cool cast-shadow shapes on the item itself, glossy and tidy, no outlines' },
    motif: false,
    suits: '城市流行、夏日、度假、懷舊、戀愛的歌',
  },
  y2k: {
    own: ['heart'],
    chroma: ['#FF7AD9', '#7AE7FF'],
    name: 'Y2K',
    essence: '千禧年的數位樂觀：鍍鉻的星星與文字、半透明亮面塑膠、肥皂泡、珠光漸層、像素小圖示和閃亮的光芒；一切都閃閃發亮、圓潤、有點俗氣得可愛。',
    not: '不是蒸汽波（沒有懷舊的紫粉夕陽），也不是霓虹舞台（不是黑底）：這是明亮的、有光澤的。',
    colour: '底色要飽和、整段有對比：天青 #3FC8F2→亮粉 #FF5FC8 或 深藍紫 #2B1A6E→洋紅 #E0329B 的漸層，不要接近白色的珠光淡色（整片淡粉淡藍上放銀色和白色的東西會糊成一片空白）。點綴：萊姆 #C6F45A、鍍鉻銀 #E8EEF6、墨 #2A2A44。',
    type: '圓體或粗黑體，鍍鉻或白字，外圍一圈亮粉或天青的光邊；英文可以用寬體。',
    fonts: ['M PLUS Rounded 1c', 'Zen Maru Gothic', 'Montserrat'],
    layers: 'fill（飽和漸層，angle 斜）→ pattern grid（白，opacity 0.3，像早期 3D 介面的格線）→ shapes star 或 heart（萊姆或白，size 80–140，ghosts 墨色 6px 硬影，pulse，數量少而大）→ particles（bubble，白，像泡泡）→ sparkles（白）→ frame window（像舊式視窗介面，label 歌名）。',
    motion: '物件輕輕漂浮旋轉；閃光一閃一閃；字從小放大並彈一下。',
    templates: ['scatter', 'punch', 'beat-cut', 'stair', 'quiet', 'title-card', 'stack', 'array', 'orbit', 'ribbon', 'tunnel'],
    native: '爆點：一顆巨大的鍍鉻星芒在中央爆開，周圍一圈泡泡。',
    craft: '鍍鉻：形狀填一道「反射帶」的線性漸層——白 → 淺灰 → 白 → 中灰 → 白（色點 0, 0.4, 0.5, 0.6, 1），角度 135°；再沿邊緣描一條 2px 的亮白邊和一條深灰內邊；鍍鉻表面上方疊一個小小的四芒高光。亮面塑膠：半透明的平塗（透明度 0.6–0.75）加上方一塊白色的高光弧（像膠囊的反光），下方一道淡淡的同色陰影。泡泡：細的白色圓（1.5px）加一個小的偏位高光弧，內部極淡的彩虹漸層（透明度 0.15）。閃光：四芒星，中心亮、四臂細長，透明度隨時間閃爍。活起來：物件緩慢上下漂浮（±10px、週期 2–4 秒、彼此錯開）並緩轉、泡泡往上飄、閃光此起彼落。轉場：一個鍍鉻的圓形擴張到滿版，再縮小回新畫面（0.3 秒）。坑：全部都鍍鉻會刺眼（鍍鉻物件 ≤ 3 個）；漸層太多會髒，背景保持淡。',
    props: { style: 'Y2K glossy 3D-ish icon style: chrome and translucent glossy plastic surfaces, pearl gradients, a bright specular highlight, rounded bubbly forms, small sparkle accents, smooth and shiny (no black outline)' },
    motif: false,
    suits: '電子流行、未來感、可愛、少女、俏皮的歌',
  },
  'gothic-lolita': {
    own: ['heart'],
    koma: 12,
    text: { ghost: [0.04, 0.04] },
    name: '哥德蘿莉',
    essence: '黑與暗紅的華麗舞台：蕾絲與絲帶的花邊、玫瑰與荊棘、十字架和燭台、古典的雕花框；甜美與死亡並存，像一本裝幀精美的暗黑童話書。',
    not: '不是恐怖片（不要血腥寫實），也不是彩繪玻璃（不是神聖的光）：這是裝飾性的、戲劇性的暗黑美。',
    colour: '漆黑 #0C0A0D、暗紅 #6E0F1F、深紅 #A3162E、古金 #B8924A、骨白 #ECE4D6；一點點紫 #4A2A55。',
    type: '古典明朝或有襯線的字，骨白或深紅字；標題可加細的古金外框。',
    fonts: ['Zen Old Mincho', 'Shippori Mincho', 'Kaisei Decol'],
    layers: 'fill（漆黑）→ pattern checker 或 dots（暗紅，opacity 0.15，像錦緞）→ frame border 或 window（古金，雕花框，label 可留空）→ shapes cross 或 heart（深紅，ghosts 2px 黑影）→ sparkles（骨白，少量，像燭光）。',
    motion: '動作優雅、戲劇性；燭光搖曳；玫瑰花瓣緩緩落下；字從暗處浮現。',
    templates: ['vertical', 'punch', 'stair', 'quiet', 'title-card', 'couplet', 'quote'],
    native: '爆點：一道深紅的十字光從黑暗中打開。',
    craft: '蕾絲：沿畫面邊緣排一列重複的半圓扇形（每個扇形內有放射細線和小孔），用骨白、透明度 0.8，邊緣再一圈小圓點；蕾絲本身用 destination-out 挖出孔洞（在離屏完成再貼回）。錦緞：暗紅底上用同色系稍亮一階畫對稱的卷草紋（鏡射），透明度 0.15–0.25。玫瑰：一朵用 5–7 層彎曲花瓣（每層是貝茲曲線的弧，越內越暗越小）疊成，加兩片葉子和一段帶刺的莖。燭火：淚滴形，內白外黃再外橘，lighter 疊一個小光暈，搖曳 = 頂點左右 ±2px 的低頻擺動。古金框：細雙線加四角的卷草裝飾，線上一道緩慢移動的亮光。活起來：燭光搖曳、玫瑰花瓣沿弧線緩緩落下並翻轉、緞帶微微飄。轉場：黑色天鵝絨般的布幕從兩側合上再拉開（0.5 秒）。坑：全部都是紅會變恐怖片（紅只用在重點）；裝飾太滿會看不清歌詞（歌詞區保持暗而乾淨）。',
    props: { style: 'gothic lolita illustration: ornate black and deep crimson forms with ivory lace trims and fine gold filigree, elegant thin dark outline, rich but restrained shading in one darker tone, roses, ribbons and Victorian ornament detail' },
    motif: false,
    suits: '暗黑系、病嬌、哥德、視覺系、戲劇性的歌',
  },
  embroidery: {
    own: ['heart'],
    koma: 12,
    text: { ghost: [0.03, 0.03] },
    name: '刺繡',
    essence: '一塊繃在繡框裡的布：棉麻的織紋、彩色繡線一針一針繡出的圖案（平針、十字繡、鎖鏈繡），線有光澤和厚度；圖案是一針一針「繡」出來的。',
    not: '不是向量插畫（線不是平的），也不是蠟筆（沒有塗色）：所有圖形都由一段段有方向的針腳構成。',
    colour: '布 亞麻 #E9DFCB 或 深藍布 #2B3A55；繡線 珊瑚 #E26D5A、芥末 #E2B33C、薄荷 #7FC6A4、粉 #F2A7B5、白 #FAF6EE。',
    type: '圓體或手寫，字像用繡線繡上去（筆畫是一段段針腳）。',
    fonts: ['Zen Maru Gothic', 'Klee One', 'Yomogi'],
    layers: 'paper（布色，grain 0.6）→ pattern grid（布的織紋，深一階，scale 6，opacity 0.15）→ frame border（繡線色，像布邊的縫線）→ shapes heart 或 star（繡線色，outline true）→ sparkles（白，小，像亮片）。',
    motion: '圖案一針一針繡出來；字像被繡上；溫柔緩慢。',
    templates: ['handwrite', 'vertical', 'stair', 'scatter', 'quiet', 'title-card', 'quote', 'ribbon'],
    native: '爆點：一顆愛心沿著輪廓一針一針繡出來。',
    craft: '針腳：每一針是一段 6–14px 的短線，lineWidth 3–5、round cap；顏色用三階（暗、本色、亮）沿線的方向漸變（模擬絲線的光澤），針腳之間留 2–4px 間隙露出布。平針填色：同方向的針腳排滿區塊，相鄰行錯開半針；十字繡：每格兩條交叉的短線（格距 10–14px），整體像像素圖；鎖鏈繡：一串淚滴形的小環。繡的動畫：沿路徑依序顯示針腳（每針 0.02–0.04 秒），針腳出現時有一個極短的「拉緊」（長度從 0.8→1）。布：底色加織紋（橫豎 1px 細線、間距 4–6px、透明度 0.08–0.12），繡框是圓形木框（兩圈、木色漸層、上方一顆螺絲）。陰影：每針下方一道極淡的影（偏移 1px、透明度 0.25），讓線有厚度。活起來：新的圖案持續被繡出、亮片偶爾閃光、布在繡框裡極輕微地起伏。轉場：一條繡線從畫面一側拉過，把新畫面「縫」上來。坑：針腳太長就像虛線；所有線同一顏色沒有光澤會變平。',
    props: { style: 'hand embroidery: the item stitched in thick glossy cotton thread on linen, satin-stitch fills with visible parallel stitches catching the light, a backstitch outline, small french-knot details, each colour a different thread' },
    scenes: true,
    motif: false,
    suits: '溫柔、手作、懷舊、家庭、可愛的歌',
  },
  chalkboard: {
    own: ['heart', 'stamp'],
    koma: 8,
    name: '粉筆黑板',
    essence: '放學後教室裡的黑板：墨綠或炭黑的板面、粉筆字與塗鴉、擦過留下的白色殘影、角落的日期和值日生；字和圖都是粉筆一筆一筆寫的，粉筆灰會掉。',
    not: '不是蠟筆繪本（底是黑板不是紙），也不是手寫字型直接貼上：每一筆都要有粉筆的乾擦質感。',
    colour: '黑板 墨綠 #24423A 或炭黑 #23272A；粉筆 白 #F2F0E8、黃 #F2D46A、粉 #F1A6B6、淺藍 #9FD0EA；擦痕 rgba(255,255,255,0.08)。',
    type: '手寫或圓體，粉筆白字；強調用黃或粉筆；可以加底線、圈圈、箭頭。',
    fonts: ['Yomogi', 'Klee One', 'Yusei Magic', 'Zen Kurenaido'],
    layers: 'fill（黑板色）→ ink（白，count 4，size 260，opacity 0.06，像擦過的痕跡）→ shapes star 或 heart（粉筆色，outline true）→ frame border（木色，黑板邊框）→ stamp（日付、值日，粉筆色）。',
    motion: '字和圖一筆一筆寫出；寫錯就擦掉重寫；一秒 8 張的手寫抖動。',
    templates: ['handwrite', 'typewriter', 'stair', 'vertical', 'quiet', 'title-card', 'quote'],
    native: '爆點：一筆畫出一顆大星星，粉筆灰往外飛。',
    craft: '粉筆的筆觸：不是實線——沿路徑每 2–3px 取一點，每點畫 3–6 個 1–2px 的小點散布在筆寬內（筆寬 6–10px），點的透明度 0.5–0.9 隨機（固定種子），中間密、兩邊疏；粉筆在板面紋理的凹處會跳過（用一張預先算好的板面雜訊圖，低於門檻的點不畫）。擦痕：大片的半透明白色（0.04–0.1），方向一致的長弧形，邊緣柔和。黑板：底色加極淡的雜訊和一兩道舊擦痕，四周木框。粉筆灰：寫字時筆尖附近每格掉 1–3 個小白點，往下落並淡出。寫的動畫：依筆順把路徑一段段畫出（每筆 0.1–0.3 秒），一秒 8 張的抖動（每張換一組種子）。活起來：角落的小塗鴉（貓、太陽）偶爾被添一筆、窗外的光影在板面緩慢移動。轉場：板擦從一側擦過，擦過的地方留下白色擦痕，然後開始寫新的內容。坑：筆觸太乾淨就像字型；粉筆色太多會亂（白為主，彩色只做重點）。',
    props: { style: 'chalk drawing: the item drawn with chalk sticks in white and a few pastel chalk colours, dry grainy strokes with gaps where the chalk skipped, a slightly wobbly hand-drawn outline, light smudged fill, no clean fills' },
    scenes: true,
    motif: false,
    suits: '校園、青春、畢業、友情、懷念的歌',
  },
  cyanotype: {
    own: [],
    name: '藍曬',
    essence: '一張曬圖法做出的相片：深普魯士藍的紙上，放在上面的東西（葉子、花、羽毛、蕾絲、手）留下白色的剪影，邊緣因為光的滲透而柔和；紙張帶刷痕與水漬。',
    not: '不是藍圖（沒有技術線條），也不是藍染（沒有布紋）：只有曬出來的剪影和紙。',
    colour: '普魯士藍 #163A6E→#1F4E8C、剪影的白 #EEF3F6（中間調 #8FB0CC）、紙邊 #E9E4D8。',
    type: '細明朝或手寫，白字，像用白色墨水在曬圖紙上寫的標註。',
    fonts: ['Zen Old Mincho', 'Shippori Mincho', 'Klee One'],
    layers: 'fill（普魯士藍）→ ink（較淺的藍，count 3，size 360，opacity 0.25，像刷塗不均）→ botanical（白，type mixed 或 fern／leaf／flower／feather，count 5–8，size 320–420：放在紙上曬出來的植物與羽毛剪影，這是主角）→ skyline（type trees 或 hills，colors 白與中間調，height 0.2，只在部分段落）→ frame border（紙邊色，像沒曬到的邊）。',
    motion: '剪影慢慢「曬」出來（從淡到清晰）；畫面幾乎靜止；安靜的節奏。',
    templates: ['vertical', 'quiet', 'handwrite', 'stair', 'title-card', 'couplet', 'orbit', 'ribbon'],
    native: '爆點：一次「曝光」——畫面閃白，再退回藍色時，新的剪影已經曬好。',
    craft: '曬的邏輯：底是藍，形狀是白——每個物件是一個剪影，用白色平塗，但邊緣有 2–6px 的漸淡（光從物件邊緣滲進去，放射漸層或在離屏 blur 後疊回）；物件離紙越遠，邊越模糊、越淡（半透明物件如蕾絲、花瓣曬出中間調，透明度 0.5–0.7）。植物：葉形用貝茲曲線，葉脈是挖掉的細線（中間調）；蕾絲是重複的小孔圖案。紙：藍色區域疊一層方向一致的刷痕（寬刷、透明度 0.1、略帶深淺），四邊是沒曬到的米白紙邊，邊界參差（刷塗的邊緣）。曬出的動畫：剪影從透明度 0 到 1，邊緣模糊從 20px 收到 4px（像影像逐漸顯現，1–1.5 秒）。活起來：葉子極輕微地擺動（剪影本身是靜止的，但相鄰的新剪影依序曬出）、光線掃過時白色剪影微微發亮。轉場：整張紙曝光閃白，再退回藍色時換成新的構圖。坑：白色太純太銳利就像剪貼；顏色離開藍白兩色就不是藍曬。',
    props: { style: 'cyanotype photogram: the item appears as a white and pale-blue silhouette with soft light-bleed edges on deep Prussian blue, inner details as semi-transparent lighter blue, no other colours, no outlines' },
    scenes: true,
    motif: false,
    suits: '回憶、植物、安靜、思念、抒情的歌',
  },
  claymation: {
    own: ['heart'],
    koma: 12,
    text: { ghost: [0.05, 0.05] },
    name: '黏土動畫',
    essence: '一格一格拍出來的黏土定格動畫：圓潤、有厚度的黏土角色與道具，表面留著手指的壓痕，柔和的攝影棚燈光與接觸陰影，每秒 12 格的頓挫，物件落地會被壓扁。',
    not: '不是 3D 動畫（沒有完美光滑的表面），也不是剪紙（是立體的）：要有黏土的厚度、壓痕和定格的頓挫。',
    colour: '飽和但柔和的黏土色：番茄紅 #E2553F、檸檬黃 #F3CF4A、薄荷綠 #6CC79A、天藍 #6AAEE0、奶油 #F5E6C8；背景 #F1E3CF 或 #CBE3E6。',
    type: '超粗圓體，字像用黏土捏出來的（白字加深色描邊與小高光）。',
    fonts: ['Mochiy Pop One', 'M PLUS Rounded 1c', 'Zen Maru Gothic'],
    layers: 'photo full（黏土布景：生成的圖就是黏土做的場景，當整段的舞台）→ blob（黏土太陽、雲或大物件，ghosts 6px 深色接觸影，pulse）→ shapes circle（黏土小石子或糖果，黏土色，ghosts 4px 影，少量、放在畫面下緣像落在地上）→ sparkles（白，少量）。安靜段可用 fill（背景色）→ skyline hills（2–3 層黏土色，height 0.3，當捏出來的地面）→ blob。',
    motion: '每秒 12 格；物件彈跳落地時壓扁再回復；動作誇張而有重量。',
    templates: ['scatter', 'punch', 'beat-cut', 'stair', 'quiet', 'title-card', 'orbit', 'ribbon'],
    native: '爆點：一大團黏土「啪」地落到舞台上壓扁，再彈起來。',
    craft: '黏土的立體：每個形狀填一個放射漸層（光源在左上：亮 → 本色 → 暗一階，亮點偏左上 30%），邊緣再描一圈極細的暗色（1px、透明度 0.3）；左上加一小塊柔和的白色高光（橢圓、透明度 0.35–0.5）。壓痕：表面疊 3–6 個小橢圓（同色暗一階、透明度 0.15），像手指按過；邊緣不要完美圓，頂點加 ±2% 的雜訊。接觸陰影：物件下方一個扁橢圓（黑、透明度 0.25、模糊 6px），物件越高影越淡越小。定格：所有動作每秒 12 格，而且每一格整體位置加 ±0.5px 的微小偏移（手動擺放的不精確），用 hash(畫面號)。重量：落地時 scaleY 0.75、scaleX 1.2（以底部為軸），兩格內回到 1，再小彈一次；起跳前先壓扁一格（預備動作）。活起來：角色眨眼（兩格閉眼）、道具輕微晃動、背景的雲是黏土片緩慢移動。轉場：一大團黏土從畫外滾進來蓋住畫面，再被「捏」成新的場景（縮放 + 旋轉，0.4 秒）。坑：動作用 30 格補間就失去定格感；表面太光滑就像 3D。',
    props: { style: 'stop-motion plasticine model: soft rounded clay forms with visible thumbprints and tool marks, gentle studio-light shading and a soft highlight, saturated but soft clay colours, slightly imperfect handmade proportions, no outlines' },
    scenes: true,
    motif: false,
    suits: '可愛、童趣、搞笑、元氣、溫馨的歌',
  },
};

/** The languages the director may choose from (see DesignLanguage.proven). */
export const PROVEN_LANGUAGES = (Object.keys(LANGUAGES) as LanguageId[]).filter((k) => LANGUAGES[k].proven);

type Prunable = {
  design?: { techniques?: string[] };
  shots?: { params?: Record<string, unknown>; asset?: string }[];
  assets?: unknown[];
  motif?: unknown;
  graphics?: { sections: { layers: { kind: string; type?: string; shape?: string }[] }[] };
  cues: { emphasis?: { method: string; symbol?: string }[] }[];
};

/**
 * Strips the shared decorations the language does not own (SHARED_MOTIFS) from a treatment, in place; echo also goes
 * when a motif is drawn (concentric lines behind big outlined words read as a mess). Returns what was removed.
 */
export function keepOwnMotifs(t: Prunable, id: LanguageId): string[] {
  const own = new Set<string>(LANGUAGES[id]?.own ?? []);
  const fixes = new Set<string>();
  const drop = (m: SharedMotif) => !own.has(m) && (fixes.add(`「${LANGUAGES[id]?.name ?? id}」不用${SHARED_MOTIFS[m]}，已移除`), true);
  const motifOf = (l: { kind: string; type?: string; shape?: string }): SharedMotif | undefined =>
    (['rings', 'sunburst', 'stamp', 'seal', 'numeral'] as const).find((k) => k === l.kind) ??
    (l.shape === 'heart' || (l.kind === 'shapes' && l.type === 'heart') ? 'heart' : l.kind === 'pattern' && l.type === 'waves' ? 'waves' : undefined);
  for (const sec of t.graphics?.sections ?? []) sec.layers = sec.layers.filter((l) => !(motifOf(l) && drop(motifOf(l)!)));
  if (t.design) {
    // absent techniques means "all" (design.ts uses()), so echo has to be taken out explicitly
    const tech = t.design.techniques ?? ['echo', 'skeleton', 'title-hook', 'flash', 'quiet'];
    const noEcho = (t.motif && tech.includes('echo') && (fixes.add('主題物件和空心大字不同時出現，已移除空心大字'), true)) || (tech.includes('echo') && drop('echo'));
    t.design.techniques = noEcho ? tech.filter((x) => x !== 'echo') : tech;
    // compose.ts has already written the echo onto the chorus shots by now
    if (!t.design.techniques.includes('echo')) for (const sh of t.shots ?? []) if (sh.params) delete sh.params['echo'];
  }
  for (const c of t.cues) if (c.emphasis) c.emphasis = c.emphasis.filter((e) => !((e.method === 'face' && drop('face')) || (e.method === 'symbol' && e.symbol === 'heart' && drop('heart'))));
  // a photo under a no-photo look still shows through the engine's exposure floor (a blue streak on terminal's glass)
  if (LANGUAGES[id]?.photos === false && (t.assets?.length || t.shots?.some((s) => s.asset))) {
    for (const sh of t.shots ?? []) delete sh.asset;
    t.assets = [];
    fixes.add(`「${LANGUAGES[id].name}」不用照片，已移除`);
  }
  return [...fixes];
}
