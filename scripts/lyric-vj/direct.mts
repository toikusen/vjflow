// Director: Claude writes a treatment v3 for a window of the song; the program validates it and feeds errors back.
// npx tsx --tsconfig tsconfig.json scripts/lyric-vj/direct.mts --song out/indigo/song.json --start 68.6 --end 89.2 \
//   --style "..." --db ~/vjanalytics/out/results --out out/indigo/director
import Anthropic from '@anthropic-ai/sdk';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { timingGate } from '../../src/app/lyric-vj/timing-qa';
import { TEMPLATES } from '../../src/app/lyric-vj/templates';
import { SongTimeline } from '../../src/app/lyric-vj/timeline';
import { CAMERAS, cuesIn, EMPHASIS_METHODS, ENTER_KINDS, EXIT_KINDS, SYMBOLS, TRANSITIONS, ParamValue, TreatmentV3, validateTreatment } from '../../src/app/lyric-vj/treatment';
import { checkStyle, STYLES } from '../../src/app/lyric-vj/styles';
import { editorPass, planSides, stackRushed, varyComposition } from '../../src/app/lyric-vj/compose';
import { facesFor, FONTS, hanOf, scriptOf } from '../../src/app/lyric-vj/fonts';
import { MOTIF_FORMS, MOTIF_KINDS, MOTIF_RENDERS, MOTIF_VARIANTS } from '../../src/app/lyric-vj/motif';
import { PEAK_STYLES, TECHNIQUES } from '../../src/app/lyric-vj/design';
import { MEDIA } from '../../src/app/lyric-vj/medium';
import { LANGUAGES, LanguageId, PROVEN_LANGUAGES, keepOwnMotifs, SHARED_MOTIFS, type SharedMotif } from '../../src/app/lyric-vj/languages';
import { dropEmptyFrames, mainDecor, samenessIssues, validateLook } from '../../src/app/lyric-vj/look';
import { StoryPlan, validateStory } from '../../src/app/lyric-vj/render/story';
import { LAYER_KINDS } from '../../src/app/lyric-vj/render/graphics';

/** What a song was made with, so the next songs can be told apart from it (older records have a system). */
interface DesignRecord { song: string; language?: LanguageId; system?: string; decor?: string[]; font: string; medium?: string; motif?: string; peak?: string; grain?: number; paper?: number }
import { MOMENT_KINDS, MOMENT_RULES } from '../../src/app/lyric-vj/moments';
import { analyzeStructure, chorusSpans, describeStructure, keyWords, sameLines, splitSongTitle, suggestMoments, TITLE_CARDS, TitleCards, wantedTitleGaps } from '../../src/app/lyric-vj/structure';
import { sceneCount, Tier, TIERS } from '../../src/app/lyric-vj/tiers';
import { jobIdFor, jobStatus } from './status.mts';
import { phraseBoundaries, phrases } from '../../src/app/lyric-vj/phrases';
import { loadDb, references } from './references.mts';

const { values: a } = parseArgs({
  options: {
    unconfirmed: { type: 'boolean', default: false },
    song: { type: 'string' }, start: { type: 'string' }, end: { type: 'string' }, style: { type: 'string', default: '' },
    db: { type: 'string' }, out: { type: 'string' }, model: { type: 'string', default: 'claude-opus-5-5' },
    'style-id': { type: 'string', default: 'emotional' }, tier: { type: 'string', default: 'standard' }, job: { type: 'string' }, title: { type: 'string' },
    'exclude-ref': { type: 'string' }, // a database song's own VJ must not be its reference
    'title-cards': { type: 'string', default: 'ends' }, // none | ends | all (the user's choice)
    'design-only': { type: 'string' }, // existing treatment: rewrite only its design system
    history: { type: 'string', default: 'out/design-history.json' },
    language: { type: 'string' }, // the user's pick: build the song in this design language
    'design-language': { type: 'string' }, // with --design-only: redo the design in another language // designs of the songs made before: the next one must differ
    'keep-assets': { type: 'string' }, // existing treatment: rewrite shots/cues/design but keep its generated assets
    'qa-notes': { type: 'string' }, // with --design-only: frame-check findings (qa.mts) the new design must fix
  },
});
const env = join(homedir(), '.config/vjflow/anthropic.env');
if (!process.env['ANTHROPIC_API_KEY'] && existsSync(env)) {
  for (const line of readFileSync(env, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].trim();
  }
}
const PRICES: Record<string, [number, number]> = { 'claude-opus-5-5': [4, 20], 'claude-fable-5-1': [10, 50] };
const song: SongTimeline = JSON.parse(readFileSync(a.song!, 'utf8'));
// Chinese lyrics need Traditional Chinese faces (Japanese ones draw other glyph forms or miss characters)
const script = scriptOf(song.cues.map((c) => c.text).join(''));
const readable = (family: string) => hanOf(family) === undefined || (script === 'zh' ? hanOf(family) === 'tc' : hanOf(family) === 'ja');
// nothing is generated on unchecked lyric timing (the timing editor confirms it); --unconfirmed for internal tests
const gate = timingGate(song);
// VJ_UNCONFIRMED=1: Studio's "try before the timing is confirmed" (passed down to every render it starts)
if (gate && !a.unconfirmed && process.env['VJ_UNCONFIRMED'] !== '1') throw new Error(gate);
const win = { start: Number(a.start), end: Number(a.end) };
const out = a.out!;
mkdirSync(out, { recursive: true });

// ---- schema (structured output): only vocabulary the engine has
// params are a list of {key, value} pairs: one optional field per template parameter would exceed the API's limit
// on optional schema fields; values arrive as strings and are coerced back (the validator checks them per template)
const coerce = (v: string): ParamValue => (v === 'true' ? true : v === 'false' ? false : /^-?\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : v);
const str = { type: 'string' };
// the song's design system (design.ts): one font, kana scale, a duotone + one accent per section, texture
/** Spans of 20 s or more without lyrics (long interludes, humming): the graphics must keep changing there. */
function lyriclessGaps() {
  const cs = [...song.cues].sort((x, y) => x.start - y.start);
  return cs.slice(1).map((c, i) => ({ start: cs[i].end, end: c.start })).filter((g) => g.end - g.start >= 20);
}

// one layer object with its parameters as key/value pairs: one optional property per parameter was too many for
// structured output (the grammar allows 24); values are coerced in toLook()
const LAYER_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['kind', 'params'],
  properties: {
    kind: { type: 'string', enum: [...LAYER_KINDS] },
    params: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['key', 'value'],
      properties: { key: { type: 'string' }, value: { type: 'string', description: '數字、true/false、#rrggbb、文字；colors 用逗號分隔；ghosts 用「dx,dy,#色;dx,dy,#色」' } } } },
  },
};
const GRAPHICS_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['sections'],
  properties: {
    sections: { type: 'array', description: '依段落的圖層組合，start 在段落交界（副歌、安靜段要和主歌不同）', items: { type: 'object', additionalProperties: false, required: ['start', 'text', 'accent', 'transition', 'layers'],
      properties: { start: { type: 'number' }, transition: { type: 'string', description: '這段怎麼蓋過上一段：空字串是直接切；或 "kind"、"kind:秒數"、"kind:秒數:#色"（色是走在邊緣的色帶）' }, text: { type: 'string', description: '#rrggbb 這段歌詞的字色（淺色底必填深色；深色底填空字串）' }, accent: { type: 'string', description: '#rrggbb 強調字色，或空字串' },
        layers: { type: 'array', description: '由下往上畫', items: LAYER_SCHEMA } } } },
  },
};
// story components (render/story.ts): the props the story needs and the behaviours placed in time
const STORY_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['props', 'items'],
  properties: {
    props: { type: 'array', description: '故事要用的具體物件（生圖模型會畫成素材）', items: { type: 'object', additionalProperties: false, required: ['id', 'what', 'hero'],
      properties: { id: { type: 'string', description: '英文小寫加點，例 furin.glass' }, what: { type: 'string', description: '英文的具體外觀描述（形狀、顏色、方向），給生圖模型' }, hero: { type: 'boolean', description: '貫穿全曲的主角物件' } } } },
    items: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['kind', 'why', 'prop', 'motion', 'x', 'y', 'size', 'params'],
      properties: {
        kind: { type: 'string', enum: ['hero', 'fly', 'pop', 'cards', 'thread', 'orbit', 'journey', 'morph', 'chapter', 'float'] },
        why: { type: 'string', description: '對應哪句歌詞或哪個段落、為什麼這樣演' },
        prop: { type: 'string', description: '物件 id（cards、thread、morph、chapter、float 填空字串）' },
        motion: { type: 'string', enum: ['hang', 'flutter', 'roll', 'sit', 'drift', 'still', ''] },
        x: { type: 'number' }, y: { type: 'number' }, size: { type: 'number', description: '物件高度佔畫面高的比例 0.1–0.5（cards、thread 填 0）' },
        params: { type: 'array', description: '其他參數 key/value：states（hero，"秒:狀態;秒:狀態"）、glow、at、dur、until、side、trail、through、from、to、every、style、texts（用 | 分隔）、props（用 , 分隔）、color、ink、a（"x,y"）、b、bend、loop、cut、width、r、period、tilt、pts（"x,y;x,y"）、steps（"秒:物件id;秒:物件id"）、text', items: { type: 'object', additionalProperties: false, required: ['key', 'value'], properties: { key: { type: 'string' }, value: { type: 'string' } } } },
      } } },
  },
};
const STORY_RULES = `故事（story）：程式已經做好幾種演出，你只決定用哪個、什麼時候、放哪裡、用什麼物件。歌詞裡有反覆出現或有象徵意義的具體物件（行星、風鈴、信、傘、花……）時，一定要用 hero 讓它貫穿全曲、首尾呼應；其他元件適合才用，不要為了用而用。歌詞完全沒有具體物件時才給空的 props 與 items。
- hero 主角物件：歌詞裡反覆出現或有象徵意義的一個具體物件（例：〈Utsusemi〉的風鈴）。states 依時間排列：show 出現、hide 收起、crack 裂開、shatter 碎掉、gather 碎片聚回、glow 發光。建議首尾呼應：前奏 show、中段 hide、歌詞講到它壞掉／失去時 crack→shatter、最後副歌 gather、結尾 glow。一首最多 1 個。
- fly：物件沿弧線從 side 那一側飛進來，停在 (x,y)，until 秒離開；through=true 是飛過去不停。trail 是拖曳的光點色。只在歌詞講到飛、離開、尋找、飄落時用，一首最多 3 個。
- pop：歌詞唱到某個具體東西時它出現 dur 秒（at 對準那個詞）。一首最多 4 個，只給歌詞裡真的有的東西。
- cards：卡片隨時間一張張落下疊起，to 秒一起清掉；style polaroid（props 放物件 id）、bubble 對話框、note 便條（texts 放短句）。用在回憶、訊息、清單類的段落，一首最多 2 組。
- thread：一條線從 a 長到 b（bend 彎曲度，loop 中間打結），cut 秒被剪斷落下。只在歌詞講到線、緣、羈絆、連結時用，一首最多 1 條。
- orbit：一個物件繞著 (x,y) 在傾斜的橢圓上轉（r 半徑 0.2–0.6，period 一圈幾秒，預設 6），from 到 to 秒。給行星、月亮、衛星、繞著某人轉的心情、循環。一首最多 1 個。
- journey：一個物件從 from 到 to 秒沿著 pts 的幾個點走一趟，留下虛線軌跡（trail 色），到終點後停在那裡。給旅程、回家、追尋、出發（紙飛機、船、車、小鳥）。一首最多 1 個，路線沿畫面上下緣或兩側走，不要穿過畫面中央。
- morph：一個形狀依序變成下一個（steps 例 "60:cube.box;75:star.gold;90:heart.red"，每個時間對準歌詞唱到那個東西），until 秒消失。給歌詞裡一連串有關聯的物件或象徵的轉變。一首最多 1 組，2–4 個形狀，props 每個都要列。
- chapter：章節字卡，at 秒從左邊滑進、dur 秒後離開，text 是 16 字以內的短標（例「第一章 夏」「01 出発」），color 卡色、ink 字色。只給歌曲有明確段落敘事（時間、季節、地點轉換）的時候，放在段落開頭，一首最多 5 張、不要每段都放。
- float：幾個物件（props 用逗號列 2–5 個）在畫面裡失重般慢慢漂、慢慢轉，from 到 to 秒。給宇宙、夢、無重力、記憶碎片飄散的段落（間奏或安靜段最好）。一首最多 1 組。
- motion 物件的動法要合它的本性：hang 吊著的（風鈴、燈籠）像鐘擺晃；flutter 只給有翅膀的昆蟲和鳥（偶爾拍翅）；葉子、花瓣、紙片這類飄落的東西用 drift；roll 會滾的（球、殼）滾進來；sit 放在地上的落下後停住；drift 漂浮的慢慢飄；still 招牌、建築這類本來就不動的完全不動。不要亂跳亂閃。
- 位置：歌詞大多在畫面中央，物件放在上緣、下緣或左右兩側（|y| ≥ 0.4 或 |x| ≥ 0.6），size 0.15–0.45；顏色要和背景有對比（淺色玻璃不要放淺色底上）。
- props 列出上面用到的每一個物件；what 用英文具體描述外觀，不要人物、不要文字。
- 寫法：prop、motion、x、y、size 是共用欄位；其他寫在 params 的 key/value，例 hero：{key:'states',value:'0:show;12:hide;95:crack;97:shatter;170:gather;205:glow'}；fly：at、dur、until、side、trail；pop：at、dur；cards：from、to、every、style、texts（a|b|c）或 props（id,id）、color、ink；thread：from、to、a（"-1,-0.6"）、b、bend、loop、cut、color。`;

/** The director's story in story.ts shapes: params are key/value strings (states "t:state;…", points "x,y"). */
function toStory(st: { props: StoryPlan['props']; items: { kind: string; why: string; prop: string; motion: string; x: number; y: number; size: number; params: { key: string; value: string }[] }[] } | undefined): StoryPlan | undefined {
  if (!st) return undefined;
  const pt = (v: string) => v.split(',').map(Number).slice(0, 2) as [number, number];
  return {
    props: st.props,
    items: st.items.map(({ params, prop, motion, ...rest }) => {
      const p: Record<string, unknown> = Object.fromEntries(params.map(({ key, value }) => {
        if (key === 'states') return [key, value.split(';').map((x) => x.split(':')).filter((x) => x.length === 2).map(([at, state]) => ({ at: Number(at), state: state.trim() }))];
        if (key === 'texts') return [key, value.split('|').map((x) => x.trim())];
        if (key === 'props') return [key, value.split(',').map((x) => x.trim()).filter(Boolean)];
        if (key === 'a' || key === 'b') return [key, pt(value)];
        if (key === 'pts') return [key, value.split(';').map((x) => pt(x)).filter((p) => p.length === 2 && p.every(Number.isFinite))];
        if (key === 'steps') return [key, value.split(';').map((x) => x.split(':')).filter((x) => x.length === 2).map(([at, prop]) => ({ at: Number(at), prop: prop.trim() }))];
        if (key === 'text') return [key, value];
        return [key, coerce(value)];
      }));
      // a fly's side is its `from`; cards and threads keep from/to as seconds
      if (rest.kind === 'fly') p['from'] = p['side'] ?? 'left';
      return { ...rest, ...(prop ? { prop } : {}), ...(motion ? { motion } : {}), ...p } as unknown as StoryPlan['items'][number];
    }),
  };
}

/** Turns the director's key/value layers into graphics.ts layers. */
function toLook(g: { sections: { start: number; text: string; accent: string; layers: { kind: string; params: { key: string; value: string }[] }[] }[] }) {
  return {
    sections: g.sections.map((s) => ({
      start: s.start, text: s.text || undefined, accent: s.accent || undefined, transition: s.transition || undefined,
      layers: s.layers.map((l) => ({
        kind: l.kind,
        ...Object.fromEntries(l.params.map(({ key, value }) => {
          if (key === 'colors') return [key, value.split(',').map((x) => x.trim())];
          if (key === 'lines') return [key, value.split('|').map((x) => x.trim()).filter(Boolean)];
          if (key === 'ghosts') return [key, value.split(';').map((g) => g.split(',').map((x) => x.trim())).filter((p) => p.length === 3).map(([dx, dy, color]) => ({ dx: Number(dx), dy: Number(dy), color }))];
          return [key, coerce(value)];
        })),
      })),
    })),
  };
}
const GRAPHICS_RULES = `graphics（圖形層，最重要）：用下列圖層由下往上組出每個段落的畫面，嚴格照設計語言的圖層配方與色彩邏輯。
- 座標：x、y 為 -1..1（0 是中心，y 往上為正）；w、h、r、radius 是畫面比例；size、height、inset、gap 是像素（1920×1080）。
- 圖層：fill（純色，to 漸層）、paper（紙，grain）、pattern（type 是 grid／dots／stripes／gingham／checker／halftone／waves／genkou／shibori／itajime、scale 像素、angle、scroll 每秒像素）、photo（mode、asset 素材 id，不填用當下鏡頭的圖、tint、frame、tilt）、frame（type 是 border／filmstrip／viewfinder／brackets／window／ticket／deco、label）、rings、sparkles、sunburst（rays、spin）、band（type、y、angle、height、scroll、color2）、shapes（type、count、size、drift、outline）、blob（x、y、r）、bands（colors 階梯色帶，from 與 to 為 0..1）、stamp（text、size、tilt）、seal（text 2–4 字）、numeral（text、size 為畫面高比例）、scanlines（gap、vignette）、chargrid（cols、field、chars）、mist（count、y、soft true 是柔和的霧）、speedlines（count、inner）、swissgrid（color 格線、bars、signal、seed）、skyline（層疊剪影地景：type 是 city／hills／trees／peaks，colors 由遠到近，height 為畫面高比例 0–0.9，drift、windows 窗燈色、wash true 是由山頂淡入霧裡的墨色）、mosaic（彩繪玻璃：type 是 random／rose 玫瑰窗／lancet 尖拱窗，colors 寶石色、color 鉛條色、cells，rose 可設 x、y、r）、ink（墨暈：color 或 colors、count、size 像素）、botanical（藍曬植物剪影：type 是 fern／leaf／flower／feather／mixed，color、count、size 像素）、particles（飄落粒子：shape 是 dot／petal／leaf／snow／star／spark／heart／bubble／char，char 指定字元，color 可多色，count、size 像素（建議 24–44）、speed、dir 是 down／up／left／right、sway、opacity；有遠近景深）、panels（分格分屏：count 2–4、layout 是 vertical／horizontal／diagonal／grid、assets 每格的素材 id、tints 每格色調、line 分隔線色、gap 線寬；段落開始時各格依序滑入）、ui（一個電腦視窗：type 是 terminal 打指令／log 捲動的系統紀錄／code 程式碼／files 檔案列表（選取列隨拍往下）／error 錯誤警告（跳出時震一下，標題隨拍閃）／progress 進度條／loading 讀取中／cursor 安靜段用：沒有視窗，畫面上只有一行指令打完後游標獨自閃爍（lines 第一行是那行指令），cascade 2–8：同一個視窗每 0.45 秒再跳出一個、往右下疊成一串（失控、爆量的段落，例如副歌高潮或錯誤狂跳；一段最多一個），skin 視窗外觀（term 發光的終端機玻璃，預設／mac 真實的 Mac 視窗／win 真實的 Windows 視窗；mac 和 win 一首歌只能選一種，同一段的視窗外觀要一致，依歌詞情境決定哪幾段用系統視窗，例如聊天、檔案、日常電腦畫面），color 視窗色、alert 錯誤色、x、y、w、h（畫面比例）、title 標題列文字、lines 視窗內容（用「|」分隔的幾行短句，寫跟這首歌的故事有關的內容，英文或日文都可以）、delay 段落開始後幾秒跳出；疊 2–4 個不同的視窗就是一個桌面，會自動讓開歌詞）
- 共通：opacity、pulse（拍點跳動 0–1）、blend（multiply 疊印）、ghosts（套印偏移或硬投影的副本，最多 2 個）。
- 每個圖層的參數寫在 params 的 key/value 裡，例：{kind:'blob', params:[{key:'color',value:'#FBE6B4'},{key:'x',value:'0.5'},{key:'r',value:'0.2'},{key:'ghosts',value:'3,2,#EE9A73'}]}。
- 段落轉場（transition）：大多數段落直接切（空字串）；只在音樂真的換段時用（進副歌、爆點、橋段、間奏開始），一首最多一半的段落交界有轉場。選的形狀要合歌和設計語言：circle 圓形從某點展開、clock 時鐘掃一圈（時間、等待）、diagonal 斜切（俐落）、stripes 橫條交錯、quad 四格依序、brush 筆刷抹過（手作、墨）、liquid 液面上漲（水、海、淚）、impact 白閃加震波（爆點專用）、diamond 菱形展開、iris 光圈打開（電影感）、checker 棋盤翻牌、bars 等化器長條（電子、節奏）、drip 油漆滴落、zigzag 鋸齒撕開（激烈）、star 星形展開（夢幻、偶像、閃亮）、pinwheel 六片扇葉旋開（童趣、風車、旋轉）、corners 四角三角形向中間合攏（俐落、幾何）、grid 九宮格逐格翻開（節奏、拼貼）、ripple 從一點泛開的水波邊緣（水、雨、溫柔）、wave 柔和的波浪邊推過去（海、流動）。impact、checker、zigzag、bars、quad、drip、grid、pinwheel 是強烈的，不可以連續兩段用；同一種不要在一首裡重複超過兩次。
- 每段第一層必須是滿版的 fill 或 paper（或 photo full）。淺色底要設定 text 為深色。
- 底（fill、paper、bands、pattern、skyline）可以貫穿整首；裝飾（太陽月亮等圓、同心圓、外框、照片小圖、印章、幾何等）不要每段都放，同一個裝飾最多六成的段落。整首要像一系列不同的海報，不是同一張換顏色。
- 歌詞要清楚：歌詞會出現在畫面中央附近，那一帶不要放高對比的細碎圖案；照片與圖形是配角。
- 沒有歌詞的長段（20 秒以上的間奏或哼唱）每 10 秒左右換一次圖層組合，讓畫面持續有變化。
- 段落：至少 3 種組合（主歌、副歌、安靜段），整首最多 16 個 graphics 段落（同類段落重複時直接沿用，不要逐句細分），副歌最強烈；把設計語言的招牌動作放在最後一次副歌。
- stamp、seal、numeral 的文字用這首歌的歌名、關鍵詞或編號，不要放無關的字。numeral 只在那段歌詞裡真的唱到這個數字時才用；不要用數字當象徵（例如用「12」「0:00」暗示午夜），觀眾看不懂只會覺得突兀。seal 是方形印章，只用在印章本來就合理的設計（公文、和風），不要當裝飾到處蓋。`;
const DESIGN_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['font', 'accentFont', 'kanaScale', 'grain', 'paper', 'colorScript', 'peak', 'medium', 'techniques'],
  properties: {
    techniques: { type: 'array', items: { type: 'string', enum: Object.keys(TECHNIQUES) }, description: '這首歌要用的手法（依這首歌挑，不是每首都全用；不適合就不選）：' + Object.entries(TECHNIQUES).map(([k, v]) => `${k}：${v}`).join('；') },
    accentFont: { type: 'string', description: '搭配的英文字型（清單見設計規則）' },
    font: { type: 'string', description: '主字型（清單見設計規則）' },
    kanaScale: { type: 'number', description: '平假名相對漢字的大小 0.5–1（明朝、文學感用 0.55–0.7；POP、圓體可用 0.85–1）' },
    grain: { type: 'number', description: '底片顆粒 0–1' },
    paper: { type: 'number', description: '紙紋／印刷質感 0–1' },
    medium: { type: 'string', enum: Object.keys(MEDIA), description: '整支影片假裝是用什麼材料做的（疊在所有畫面上的後製層）：' + Object.entries(MEDIA).map(([k, v]) => `${k}：${v.label}`).join('；') },
    peak: { type: 'string', enum: Object.keys(PEAK_STYLES), description: '這首歌爆點的樣式（每首不同）：' + Object.entries(PEAK_STYLES).map(([k, v]) => `${k}：${v}`).join('；') },
    colorScript: { type: 'array', description: '依段落的色彩計畫，每個段落一筆', items: { type: 'object', additionalProperties: false, required: ['start', 'shadow', 'highlight', 'accent', 'duotone', 'image'],
      properties: { start: { type: 'number' }, shadow: { type: 'string', description: '#rrggbb 背景暗部色' }, highlight: { type: 'string', description: '#rrggbb 背景亮部色' },
        accent: { type: 'string', description: '#rrggbb 這段唯一的強調色' }, duotone: { type: 'number', description: '0–1，背景套雙色調的程度' },
        image: { type: 'number', description: '0–1，背景圖露出多少（1 全部；0 暗色質感底，只靠主題物件與文字撐畫面）' } } } },
  },
};
const MOTIF_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['kind', 'variant', 'render', 'sides', 'sections'],
  properties: {
    kind: { type: 'string', enum: Object.keys(MOTIF_KINDS), description: Object.entries(MOTIF_KINDS).map(([k, v]) => `${k}：${v}`).join('；') },
    variant: { type: 'string', description: '物件的造型：' + Object.entries(MOTIF_VARIANTS).map(([k, v]) => `${k} → ${Object.entries(v).map(([x, d]) => `${x}（${d}）`).join('、')}`).join('；') },
    render: { type: 'string', enum: Object.keys(MOTIF_RENDERS), description: '線條的畫法：' + Object.entries(MOTIF_RENDERS).map(([k, v]) => `${k}：${v}`).join('；') },
    sides: { type: 'integer', description: 'polygon 的邊數 3–12（其他物件填 6）' },
    sections: { type: 'array', description: '依段落的形態，每個段落一筆', items: { type: 'object', additionalProperties: false, required: ['start', 'form', 'intensity'],
      properties: { start: { type: 'number' }, form: { type: 'string', enum: Object.keys(MOTIF_FORMS), description: Object.entries(MOTIF_FORMS).map(([k, v]) => `${k}：${v}`).join('；') }, intensity: { type: 'number', description: '0–1' } } } },
  },
};
const MOTIF_RULES = `主題物件（motif，必須做）：
- 從歌名或核心歌詞轉譯出一個物件，整首貫穿（例：timer → 時鐘、第六感 → 六角形、天文 → 軌道）。物件由程式畫成線條，不是圖片。
- 造型（variant）與畫法（render）要配合設計語言，而且不能和最近做過的歌的主題物件相同（同一種物件時，造型或畫法至少換一個）。
- 物件要隨段落演變：主歌 center 或 off，副歌前 nested，副歌 tunnel 或 bleed，落ちサビ off 讓畫面休息，最後副歌用最強的形態。不要整首同一種形態。
- shards（零件飛散到整個畫面持續飛舞）是最吸睛的全畫面動態：間奏、轉折與爆點之後的段落優先使用，可以維持整段。
- mask 只能用在沒有歌詞的段落（有歌詞時外面壓暗會讓字看不清楚）。
- 沒有歌詞的前奏、間奏、尾奏（沒放標題卡時）一定要用會動的形態（nested、tunnel、shards、bleed，intensity ≥ 0.6），不能只剩背景與靜止的物件。
- 用 transitionIn wipe 的鏡頭，下一個畫面會從物件的形狀中打開（物件形狀的轉場）。
- 有物件的段落，背景圖是配角：物件與文字才是主角。`;
// font lists live in the prompt, not the schema: long enums made the structured-output grammar too large
const FONT_LIST = `主字型可選：${FONTS.filter((f) => f.roles.includes('display') && readable(f.family)).map((f) => `${f.family}（${f.feel}）`).join('、')}\n搭配英文字型可選：${FONTS.filter((f) => f.roles.includes('accent')).map((f) => `${f.family}（${f.feel}）`).join('、')}`;
const DESIGN_RULES = `設計系統（design，必須做；這是每首歌獨特性的關鍵）：
${FONT_LIST}
- 搭配字型：選一款英文字型與主字型搭配，只用在英文歌詞、歌手名與角落標籤（例：明朝＋優雅草寫、圓體＋圓潤手寫、點陣＋等寬）。
- 字型：從清單選一款最符合這首歌個性、也符合設計系統的字型，整首只用這一款。不要因為安全就選明朝或黑體；手帳系統偏手寫字或圓體、海報系統偏粗的黑體／POP／毛筆／點陣、電影系統偏細的明朝或襯線。
- 漢字大、假名小：kanaScale 讓平假名縮小，像設計師的排版；明朝體通常 0.55–0.7。
- 色彩計畫：每個段落一組「暗部色＋亮部色」的雙色調加上一個強調色。整體是單色系加一個強調色，不要多色雜亂；段落之間要換色（例如主歌冷灰藍、副歌轉暗底加一個鮮明強調色、落ちサビ降成近黑白）。強調色只用在關鍵詞與線條。
- 背景圖一律套雙色調（duotone 0.6–1），讓它看起來像設計素材而不是 AI 插畫；顆粒與紙紋依歌曲質感決定（復古、手帳、文學感可加紙紋）。
- 顏色要和歌曲情緒一致：歡快甜系不要用感傷的夕陽色，冷調內省不要用高飽和粉紫。
- image：依設計系統的範圍決定每段背景露出多少。
- peak：依歌曲個性選爆點樣式，不要每首都用放射光（rays）。
- medium：依歌曲的質地選媒材，它決定整支片「摸起來」是什麼材料，是讓背景不像 AI 插畫的關鍵。不要因為安全就選 clean；只有電子、未來、光感強的歌才用 clean。媒材要和字型、色彩是同一個世界（例：紙上手繪配明朝或手寫字；蠟筆配圓體；像素點陣配點陣字；底片配古典明朝）。
- 文字不要加描邊殘影（punch 的 outline 保持 false），乾淨的字比特效字更像設計師作品。`;
const SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['language', 'concept', 'styleAnchor', 'assets', 'shots', 'cues', 'arc', 'moments'],
  properties: {
    language: { type: 'string', enum: Object.keys(LANGUAGES), description: '這首歌的設計語言（先決定，鏡頭只能用它的模板）' },
    concept: { type: 'string', description: '繁體中文，一兩句：這段畫面的視覺故事' },
    styleAnchor: {
      type: 'object', additionalProperties: false, required: ['prompt', 'palette'],
      properties: {
        prompt: { type: 'string', description: 'English prompt shared by every asset: palette, light and mood only, never a rendering style (anime, photo, painting: the program adds it from the medium). Must say: no text, no letters, no logos.' },
        palette: { type: 'object', additionalProperties: false, required: ['background', 'text', 'accent', 'line', 'glow'],
          properties: Object.fromEntries(['background', 'text', 'accent', 'line', 'glow'].map((k) => [k, { type: 'string', description: '#rrggbb' }])) },
      },
    },
    assets: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'kind', 'prompt'],
      properties: { id: str, kind: { type: 'string', enum: ['image', 'video'] }, prompt: { type: 'string', description: 'English. Scene only, never any text.' },
        from: { type: 'string', description: 'video: id of the image used as its first frame' }, layering: { type: 'string', enum: ['single'] } } } },
    shots: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'start', 'end', 'template', 'params', 'camera', 'transitionIn'],
      properties: { id: str, start: { type: 'number' }, end: { type: 'number' }, template: { type: 'string', enum: Object.keys(TEMPLATES) },
        params: { type: 'array', description: '只列要改變預設值的參數', items: { type: 'object', additionalProperties: false, required: ['key', 'value'],
          properties: { key: { type: 'string', description: '模板的參數名稱' }, value: { type: 'string', description: '數字、true/false 或選項名稱' } } } },
        asset: str,
        camera: { type: 'string', enum: CAMERAS }, transitionIn: { type: 'string', enum: TRANSITIONS } } } },
    arc: { type: 'array', description: '情緒曲線：每個段落的強度', items: { type: 'object', additionalProperties: false, required: ['start', 'level'],
      properties: { start: { type: 'number' }, level: { type: 'integer', description: '0 安靜 … 3 最高潮' } } } },
    moments: { type: 'array', description: '段落交界的爆點', items: { type: 'object', additionalProperties: false, required: ['kind', 'at', 'dur', 'strength'],
      properties: { kind: { type: 'string', enum: MOMENT_KINDS }, at: { type: 'number' }, dur: { type: 'number', description: 'drop/finale 填 0' },
        strength: { type: 'number', description: '0.5–1.5，1 為標準' } } } },
    cues: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['cueId', 'shot', 'enter', 'exit', 'reveal'],
      properties: { cueId: str, shot: str, rows: { type: 'array', items: { type: 'integer' } },
        emphasis: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['from', 'to', 'method'],
          properties: { from: { type: 'integer' }, to: { type: 'integer' }, method: { type: 'string', enum: EMPHASIS_METHODS }, symbol: { type: 'string', enum: SYMBOLS, description: 'method 是 symbol 時必填' } } } },
        accents: { type: 'array', items: { type: 'integer' } },
        enter: { type: 'string', enum: ENTER_KINDS }, exit: { type: 'string', enum: EXIT_KINDS },
        reveal: { type: 'string', enum: ['line', 'word'], description: 'word：字以固定速度依序出現（在句子前段載完，之後整句停留）；line：整句一起進場' } } } },
  },
};

// ---- prompt
const cues = cuesIn(song, win);
const beatsIn = (s: number, e: number) => song.beats.filter((b) => b >= s && b < e);
const cueLines = cues.map((c) => {
  const chars = [...c.text].map((ch, i) => `${i}:${ch}`).join(' ');
  const b = [...phraseBoundaries(c.text)].sort((x, y) => x - y).join(',');
  return `${c.id}｜${c.start.toFixed(2)}–${c.end.toFixed(2)}s｜拍數 ${beatsIn(c.start, c.end).length}｜時間可信度 ${c.confidence}｜「${c.text}」\n    字元索引：${chars}\n    詞：${phrases(c.text).join('／')}（強調與換行只能落在 ${b}）`;
}).join('\n');
const catalog = Object.values(TEMPLATES).map((t) =>
  `- ${t.id}：${t.description}\n  參數：${Object.entries(t.params).map(([k, p]) => `${k}（${p.description}；${p.type === 'number' ? `${p.min}–${p.max}` : p.type === 'enum' ? p.values.join('/') : 'true/false'}，預設 ${p.default}）`).join('；')}`).join('\n');
// structure from lyric repetition + energy (structure.ts); the analyzer's own sections are not reliable enough
const structure = analyzeStructure(song);
const inWin = (t: number) => t >= win.start - 0.5 && t <= win.end;
const sections = structure.sections.filter((s) => s.end > win.start && s.start < win.end).map((s) => `${s.start.toFixed(1)}–${s.end.toFixed(1)}s ${s.kind} 能量 ${s.energy.toFixed(2)}`).join('\n');
const suggested = suggestMoments(structure);
const spans = chorusSpans(structure);
const repeatSec = spans.slice(1).reduce((t, c) => t + Math.max(0, Math.min(c.end, win.end) - Math.max(c.start, win.start)), 0);
const idsIn = (x: { start: number; end: number }) => cues.filter((c) => c.start >= x.start - 0.01 && c.start < x.end).map((c) => c.id);
const repeatText = [
  spans.length > 1 ? `副歌共 ${spans.length} 次：${spans.map((c, k) => `#${k + 1} ${c.start.toFixed(1)}–${c.end.toFixed(1)}s（${idsIn(c)[0] ?? '—'}–${idsIn(c).slice(-1)[0] ?? '—'}）`).join('；')}。第 2 次起至少一半時間沿用 #1 的素材組。` : '',
  [...sameLines(song)].filter(([id]) => cues.some((c) => c.id === id)).map(([id, src]) => `${id}=${src}`).join(' ') ? `歌詞相同的句子（程式會自動沿用第一次的強調與換行）：${[...sameLines(song)].filter(([id]) => cues.some((c) => c.id === id)).map(([id, src]) => `${id}=${src}`).join(' ')}` : '',
].filter(Boolean).join('\n') || '（無）';
const titleCards = (a['title-cards'] as TitleCards) in TITLE_CARDS ? (a['title-cards'] as TitleCards) : 'ends';
const gaps = wantedTitleGaps(song, titleCards).filter((g) => g.end > win.start && g.start < win.end);
const meta = splitSongTitle(song.title);
const gapText = gaps.length
  ? `使用者選擇「${TITLE_CARDS[titleCards]}」。這些空白要放 title-card（前奏、尾奏用 center，間奏用 lower-left；一段空白用一個 title-card 鏡頭從頭蓋到尾，不受鏡頭長度上限限制）：${gaps.map((g) => `${g.start.toFixed(1)}–${g.end.toFixed(1)}s ${g.kind}`).join('；')}（歌名「${meta.title}」${meta.artist ? `、歌手「${meta.artist}」` : ''}）`
  : `使用者選擇「${TITLE_CARDS[titleCards]}」：不要用 title-card。`;
const suggestedText = suggested.moments.filter((m) => inWin(m.at)).map((m) => `${m.kind}@${m.at.toFixed(2)}${m.dur ? ` dur ${m.dur.toFixed(1)}` : ''} strength ${m.strength}`).join('；') || '（無）';
const db = a.db ? references(loadDb(a.db).filter((v) => v.video_id !== a['exclude-ref']), a.style + cues.map((c) => c.text).join('')) : { text: '（無）', ids: [] };

// the songs made before: this one must not look like them (another system, another font and medium)
const history: DesignRecord[] = existsSync(a.history!) ? JSON.parse(readFileSync(a.history!, 'utf8')) : [];
const recent = history.filter((r) => r.song !== song.title).slice(-3);
// languages rotate through the whole catalogue before one repeats (a 3-song window let 第六感's neon stage come back
// four songs later and read as the same design); fonts and motifs only avoid the last three
// only proven languages are on offer (a song a paying user gets must come out usable); the director picks what suits
// the song best among them, the ones used lately are flagged, and a repeat must look different (keepApart below)
const allowedLanguages = a.language && a.language in LANGUAGES ? [a.language as LanguageId] : PROVEN_LANGUAGES;
const recentLanguages = new Set(recent.map((r) => r.language).filter(Boolean));
const recentText = recent.length ? recent.map((r) => `- ${r.song}：${r.language ? `${LANGUAGES[r.language].name}（${r.language}）` : r.system}、字型 ${r.font}、媒材 ${r.medium ?? '—'}${r.motif ? `、主題物件 ${r.motif}` : ''}`).join('\n') : '（無）';
const SYSTEMS_TEXT = `設計語言（language，最重要的決定）：每首歌要像不同設計師做的。先依這首歌的個性選一種設計語言，鏡頭只能用它的模板。
${allowedLanguages.map((k) => `- ${k}（${LANGUAGES[k].name}）${recentLanguages.has(k) ? '【最近用過：最適合這首才選，選了就要讓配色、字型、媒材與質感明顯不同】' : ''}：${LANGUAGES[k].essence} 適合：${LANGUAGES[k].suits}。模板：${LANGUAGES[k].templates.join('、')}${LANGUAGES[k].kit ? `。質感要點（驗收通過的${LANGUAGES[k].kit!.song}）：${LANGUAGES[k].kit!.craft}` : ''}`).join('\n')}
最近做過的歌（這首要和它們明顯不同）：
${recentText}`;
const style = STYLES[a['style-id']!];
if (!style) throw new Error(`未知風格 ${a['style-id']}`);
const tier = a.tier as Tier;
if (!TIERS[tier]) throw new Error(`未知版本 ${a.tier}（still | standard | rich）`);
const scenes = sceneCount(tier, win, repeatSec);
const SYSTEM = `你是 Live House 大螢幕的歌詞 VJ 導演兼動態設計師。你為一段歌曲寫「企劃 v3」JSON，引擎會照著逐格渲染。
這次的風格是「${style.name}」：${style.description}

風格規則（必須遵守）：
${style.rules.map((r) => `- ${r}`).join('\n')}

版本「${TIERS[tier].name}」的素材規則（必須遵守）：
- ${TIERS[tier].rule}

一般原則：
- 歌詞文字與時間由程式擁有，你只決定呈現方式；cueId 必須來自清單。
- 鏡頭邊界放在某句歌詞開始或強拍上；鏡頭必須連續覆蓋整個範圍 ${win.start}–${win.end} 秒。可用的模板只有你選的 system 列出的模板。

${SYSTEMS_TEXT}
- 換色（color、glow）只給真正重要的詞：歌名的詞、副歌核心詞（關鍵詞清單見下方），整首最多約兩成的句子換色；其他想強調的用 scale（放大）。不是關鍵詞的換色會被程式改成 scale。
- 強調範圍用字元索引 [from, to)，選真正的關鍵字，而且必須是完整的詞，不可把一個詞切開（切開的會被自動擴展）；短句（12 字以內）不要換行；踩拍 accents 是該句開始後第幾拍（0 起算，必須小於該句拍數），挑重拍、不要每拍都踩。
- 時間可信度為 interpolated 的句子不要踩拍、用 fade。

文字動態（必須做）：
- 構圖：不要每個畫面都置中。用 align、position 讓畫面左右輪替；背景是圖片或專屬圖層、你不確定哪邊比較空時，填 auto 讓程式看背景把字放在最空的一側，副歌一次比一次大（第一次收斂、最後一次最大；不要用 bleed 出血，裁切的巨字會被看成排版錯誤）；程式也會自動錯開連續置中的鏡頭。
- reveal：主歌、敘事句、慢歌多用 word（字以固定速度依序載出，像在說話）；副歌的衝擊句可用 line 讓整句砸下。
- 系統有 beat-cut 時，副歌節奏強烈的句子可用它（每唱到一個詞就換一個構圖切入）。
- 重複的歌詞（第 2、3 次副歌）沿用畫面，讓副歌逐次升級：沒選 skeleton 時換版型；選了 skeleton 就沿用第一次副歌的版型順序，靠色彩和爆點升級（程式會照第一次副歌的版型排）。

文字手法（工具箱，不是清單：先想這首歌的個性和歌詞需要什麼，只挑真正適合的；很多歌只用其中一兩招、甚至一招都不用才是對的。抒情慢歌不會需要斬切或陣列，功夫或電子歌才可能用到。同一招整首最多用 2–4 次，用在最對的地方才有力）：
- 進場 ink：先描出字的輪廓、再填滿，像毛筆或墨水。適合書法感、和風、中國風、冷靜敘事的句子。
- 進場 flap：每個字像車站／機場的翻牌看板，翻過幾個字後停在正確的字。適合時刻、日期、地名、出發、等待、倒數，或復古、都會、旅行感的設計；一首最多 3 句。
- 進場 slot：每個字像拉霸機的轉輪，滾過幾個字後彈停。適合運氣、命運、選擇、賭注、遊戲感、普普的句子；一首最多 3 句，不要和 flap 同一首都用。
- 進場 focus：字從模糊的殘影收攏成清楚的字。適合回憶、夢、醒來、看清、淚眼、朦朧，抒情慢歌的主歌。
- 進場 rise：每個字從自己的底線後面升上來（線以下看不到）。安靜、確定、像雜誌排版的進場，適合敘事句、極簡或編輯感的設計；它是點綴不是預設，一首最多約四分之一的句子，其他句子用版型本身的進場。
- 退場 glitch：句尾像訊號斷掉一樣跳格、錯位、閃爍消失。適合電子、科技、情緒崩潰、「斷線」意象的句子。
- 退場 slash：一道光刃斜斜劃過，字被切成兩半錯開掉落。只給一首歌裡最有殺氣的 1–2 句（功夫、決鬥、斬斷、告別）。
- 強調 hollow：關鍵詞變成空心描邊字，和實心的其他字對比。適合「空」「透明」「消失」或想要冷調的關鍵詞。
- 強調 face：關鍵詞換成對比字體（黑體句子裡的關鍵詞變毛筆或明朝，明朝句子裡的變粗黑體）。一首最多 2–3 個詞，通常是歌名詞或副歌核心詞。
- 強調 mark：關鍵詞下面畫出一道手繪麥克筆底線（是底線，不是底板）。適合手帳、校園、可愛、日常系。
- 強調 liquid：關鍵詞先是空心字，再從底部像倒水一樣灌滿強調色，水面會微微晃。只給跟液體或「滿」有關的詞（海、淚、雨、酒、溢れる、滿），或情緒一路漲滿的那個詞；一首最多 2 個詞。
- 強調 symbol：在詞旁邊彈出一個小符號，symbol 填 heart、star、sparkle、note、flame、drop、bolt、exclaim、question、swirl、flower 之一；預設不用：字義對應不是理由（講到愛不代表要放愛心，講到燃不代表要放火），只有這個詞是整句的情緒重點、而且設計語言本身適合貼紙感（可愛、普普）時才用，一首最多 2 次。
- 括號裡的應援、和聲、呼喊（例如「(幹什麼?)」「（Hey!）」）程式會自動抽出成第二條小字軌，在主歌詞旁邊彈出，你不用處理，也不要把它們當強調範圍。
- 版型 stack：導歌／蓄力段（build）每句堆上來、舊句被往上推，鏡頭結束在 drop 上一起清掉。
- 版型 array：重複的口號或副歌標語鋪滿成陣列（例如「快使用雙截棍」），一首 2–3 次，通常在副歌。
- 版型 couplet：對仗、問答、你／我相對的兩句左右對望。
- 版型 quote：歌詞裡的對白、引用、某人說的話。
- 版型 orbit：夢幻、循環、時間、宇宙、旋轉意象的短句。
- 版型 ribbon：字沿著流動的波浪線，給風、河、海浪、流れ、飄這類「流動」的句子，一首 1–3 次。
- 版型 tunnel：關鍵詞排成往鏡頭衝的文字隧道，給衝刺、穿越、加速、墜落、無限的句子或副歌爆點，一首最多 2 次。
- 版型 frame-split（框住的字）：只給旁白、引述、內心話、系統訊息這類「被框起來才有意義」的句子，一首最多約 2 成的鏡頭；框是這個風格本身的東西（終端機視窗、默片字卡、圖面標題欄、抬頭顯示）才用。
- 版型怎麼挑：每一句挑最適合它的歌詞內容和這個風格的版型，適合比多樣重要；風格只適合一兩種版型就只用那一兩種，不要為了變化硬塞，但也不要整首只靠同一種撐。
- 冷卻句：副歌或高能段落中間，挑 1 句用 quiet 或 fade／line 讓它突然安靜、變小，下一句再回到衝擊；這種對比讓副歌更有力。只在歌詞或編曲真的有這個呼吸點時用（例如一句獨白、一個停頓），不要硬加。

情緒起伏（必須做）：
- arc：每個段落標強度 0–3（前奏、尾奏 0，主歌 1，導歌 2，副歌 3；安靜的落ちサビ或橋段降到 0–1）。引擎依強度調整背景亮度、飽和度、光暈、光粒子。
- moments：在段落交界放爆點，at 放在強拍上。
${MOMENT_KINDS.map((k) => `  - ${k}：${MOMENT_RULES[k].desc}（dur ${MOMENT_RULES[k].dur[1] ? `${MOMENT_RULES[k].dur[0]}–${MOMENT_RULES[k].dur[1]} 秒` : '填 0'}）`).join('\n')}
- 每次副歌第一拍放 drop，前面接 2–4 秒的 build；最後一次副歌改用 finale。歌曲有安靜下來的落ちサビ、或最後副歌前能量明顯下降的段落時放 break；最後副歌前可以放 0.5–0.8 秒的 hold（先收再放）。
- 多次副歌要有遞進：strength 一次比一次高（例如 1.0 → 1.15 → finale）。strength 0.8–1.3；Live House 大螢幕上爆點要明顯。
- 有 drop 或 finale 的那個鏡頭不需要再用 transitionIn flash（引擎會略過）。
- 素材描述用英文，畫面不可有任何文字。這個範圍${TIERS[tier].video ? `要 ${tier === 'rich' ? Math.ceil(scenes * 0.6) : 1}–${scenes} 組素材（每組 1 image + 1 video）` : `要 1–${scenes} 張 image，不要 video`}。`;

// what designers do, from the database of designer lyric videos (knowledge.mts): a toolbox to pick from per song
const toolboxFile = join('out', 'knowledge', 'toolbox.md');
const TOOLBOX = existsSync(toolboxFile) ? `\n\n設計師常用手法（從大量設計師做的歌詞 MV 整理出來；是工具箱不是清單，依這首歌挑適合的，引擎做得到的才用）：\n${readFileSync(toolboxFile, 'utf8')}` : '';
const expectShots = Math.round((win.end - win.start) / ((style.shotSec[0] + style.shotSec[1]) / 2));
const USER = `${TOOLBOX ? `${TOOLBOX}\n\n` : ''}【輸出要求】shots 大約 ${expectShots} 個（每個 ${style.shotSec[0]}–${style.shotSec[1]} 秒，連續覆蓋整個範圍）；cues 必須包含下列全部 ${cues.length} 句。\n\n【這首歌的說明】\n${a.style ? `${a.style}\n` : ''}${describeStructure(structure)}\n\n【程式建議的爆點】（依結構產生，可以調整強度與長度，位置除非有明確理由不要改）\n${suggestedText}\n\n【關鍵詞（可以換色的詞）】\n${keyWords(song).join('、') || '（無）'}\n\n【重複段落】\n${repeatText}\n\n【標題卡】\n${gapText}\n\n【範圍】${win.start}–${win.end} 秒；BPM 約 ${song.tempo.toFixed(0)}\n【段落】\n${sections}\n【強拍】${song.downbeats.filter((b) => b >= win.start && b < win.end).map((b) => b.toFixed(2)).join(' ')}\n\n【歌詞】\n${cueLines}\n\n【模板】\n${catalog}\n\n【VJ 資料庫參考】（50 支歌詞 VJ 的分析，是觀察與推測，不是規則）\n${db.text}`;
writeFileSync(join(out, 'prompt.txt'), SYSTEM + '\n\n' + USER);

// overloaded (529) and rate limits: the SDK retries with backoff; a long design run should ride them out
const client = new Anthropic({ maxRetries: 8 });
/**
 * One streamed reply, retried when the connection drops mid-stream ("terminated"): the SDK's own retries only cover
 * a request that fails before the reply starts, and a paid song must not fail on a dropped connection.
 */
async function streamed(params: Anthropic.Beta.Messages.MessageStreamParams) {
  for (let k = 0; ; k++) {
    // a stream that goes silent never ends on its own (one waited 3 hours): no event for 5 minutes counts as dropped
    const stream = client.beta.messages.stream(params);
    let idle: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      clearTimeout(idle);
      idle = setTimeout(() => stream.abort(), 5 * 60_000);
    };
    arm();
    stream.on('streamEvent', arm);
    try {
      return await stream.finalMessage();
    } catch (e) {
      const dropped = stream.aborted || e instanceof Anthropic.APIConnectionError || /terminated|ECONNRESET|socket hang up|other side closed/i.test(String((e as Error)?.message) + String((e as { cause?: unknown })?.cause));
      if (!dropped || k >= 2) throw e;
      console.error(`連線中斷，重試第 ${k + 1} 次：${(e as Error).message}`);
    } finally {
      clearTimeout(idle);
    }
  }
}
const keep: TreatmentV3 | undefined = a['keep-assets'] ? JSON.parse(readFileSync(a['keep-assets'], 'utf8')) : undefined;
const keepText = keep
  ? `\n\n【已生成的素材：只能用這些，不可新增或修改素材（assets 欄位照抄即可，程式會沿用原本的）】\n${keep.assets.map((x) => `- ${x.id}（${x.kind}${x.from ? `，from ${x.from}` : ''}）：${x.prompt}`).join('\n')}\n背景風格：${keep.styleAnchor.prompt}`
  : '';

// --design-only <treatment>: keep shots, assets and cue styles; only the design system is (re)written
/**
 * The design pass: font, kana scale, colour script, peak style and motif for a treatment whose shots are set. A
 * separate call (one schema with everything was too large for structured output); motif rules are checked and fed
 * back up to twice.
 */
/**
 * A song on the same medium as a recent one keeps its texture apart: grain and paper close to that song's (both within
 * 0.1) move by 0.15, so two paper songs never come out with the same speckle.
 */
function keepApart(t: TreatmentV3, fixes: string[]) {
  const d = t.design;
  if (!d) return;
  for (const r of recent) {
    if (r.medium !== d.medium || r.grain === undefined || r.paper === undefined) continue;
    if (Math.abs(d.grain - r.grain) < 0.1 && Math.abs(d.paper - r.paper) < 0.1) {
      d.grain = +(d.grain > 0.3 ? d.grain - 0.15 : d.grain + 0.15).toFixed(2);
      fixes.push(`媒材 ${d.medium} 和「${r.song}」相同且質感太接近，顆粒改為 ${d.grain}`);
    }
  }
}

async function designPass(base: TreatmentV3, language: LanguageId): Promise<{ checked: ReturnType<typeof validateTreatment>; usage: { input: number; output: number } }> {
  const sys = { ...LANGUAGES[language], fonts: facesFor(LANGUAGES[language].fonts, script) };
  const sysText = `【設計語言】${sys.name}（${language}）
- 本質：${sys.essence}
- 不是：${sys.not}
- 色彩：${sys.colour}
- 字：${sys.type} 字型只能從這些選：${sys.fonts.join('、')}
- 圖層：${sys.layers}
- 動態：${sys.motion}
- 招牌動作（放在歌曲最高潮）：${sys.native}
${sys.motif ? '' : '- 這個語言沒有主題物件（motif）；故事（story）的物件不受影響，照故事規則做。\n'}- 共用裝飾：這個語言只能用 ${sys.own.length ? sys.own.map((m) => SHARED_MOTIFS[m]).join('、') : '（沒有）'}；${(Object.keys(SHARED_MOTIFS) as SharedMotif[]).filter((m) => !sys.own.includes(m)).map((m) => SHARED_MOTIFS[m]).join('、')} 都不准用（每個風格都用會變成同一個模板），改用這個語言自己的圖形。能用的也只在歌詞或故事需要時才用。\n【最近做過的歌】這首的字型要和它們不同：\n${recentText}${(() => {
    const same = history.filter((r) => r.song !== song.title && r.language === language && r.decor?.length);
    return same.length ? `\n【同風格做過的歌用過的主要裝飾】這首要換成不同的組合：\n${same.map((r) => `- ${r.song}：${r.decor!.join('、')}`).join('\n')}` : '';
  })()}`;
  const qaNotes = a['qa-notes'] && existsSync(a['qa-notes']) ? `\n\n【上一版設計的畫面檢查發現這些問題，這一版必須避免】\n${readFileSync(a['qa-notes'], 'utf8')}` : '';
  const userD = `為這首歌設計 design、graphics、story${sys.motif ? ' 與 motif' : ''}。企劃的鏡頭與歌詞版型已定，你決定字型、色彩、質感、爆點樣式，以及畫面的圖形：graphics 是用程式畫的圖層組合（取代滿版背景圖），依段落切換。\n\n${sysText}\n\n${GRAPHICS_RULES}\n\n${DESIGN_RULES}\n\n${STORY_RULES}\n\n${sys.motif ? MOTIF_RULES : ''}\n\n【歌曲】${song.title}\n【概念】${base.concept}\n【背景圖的內容】\n${base.assets.filter((x) => x.kind === 'image').map((x) => `- ${x.id}: ${x.prompt}`).join('\n')}\n【結構】${describeStructure(structure)}\n【段落】\n${sections}\n【鏡頭】\n${base.shots.map((x) => `${x.id} ${x.start.toFixed(1)}–${x.end.toFixed(1)}s ${x.template}`).join('\n')}\n【關鍵詞】${keyWords(song).join('、')}\n【歌詞】\n${cues.map((c) => `${c.start.toFixed(1)}s ${c.text}`).join('\n')}`;
  const dMessages: Anthropic.Beta.Messages.BetaMessageParam[] = [{ role: 'user', content: userD + qaNotes }];
  let checked!: ReturnType<typeof validateTreatment>;
  const usage = { input: 0, output: 0 };
  for (let attempt = 0; attempt < 3; attempt++) {
    const msg = await streamed({
        model: a.model!, max_tokens: 48000, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
        output_config: { effort: 'high', format: { type: 'json_schema', schema: { type: 'object', additionalProperties: false, required: sys.motif ? ['design', 'graphics', 'story', 'motif'] : ['design', 'graphics', 'story'], properties: sys.motif ? { design: DESIGN_SCHEMA, graphics: GRAPHICS_SCHEMA, story: STORY_SCHEMA, motif: MOTIF_SCHEMA } : { design: DESIGN_SCHEMA, graphics: GRAPHICS_SCHEMA, story: STORY_SCHEMA } } } },
        system: '你是歌詞 VJ 的資深動態設計總監，為每首歌建立獨特的字體與色彩系統。',
        messages: dMessages,
      } as Anthropic.Beta.Messages.MessageStreamParams);
    usage.input += msg.usage.input_tokens;
    usage.output += msg.usage.output_tokens;
    const text = msg.content.find((b) => b.type === 'text')?.text;
    if (msg.stop_reason === 'refusal' || !text) throw new Error(`沒有產出設計（${msg.stop_reason}）`);
    if (msg.stop_reason === 'max_tokens') throw new Error('設計輸出超過長度上限（graphics 段落太多）');
    const out2 = JSON.parse(text);
    base.design = { ...out2.design, language };
    base.motif = sys.motif ? out2.motif : undefined;
    // transitions only where the music changes section (analysed structure)
    base.graphics = validateLook(toLook(out2.graphics) as never, base.assets.map((x) => x.id), win.start, song.sections?.map((x) => x.start)).look;
    // the story rides on the look: its items drawn over every section, its props drawn by props.mts
    writeFileSync(join(out, 'story.raw.json'), JSON.stringify(out2.story ?? null, null, 1));
    const story = validateStory(toStory(out2.story), song.duration);
    if (story.fixes.length) console.log(`story: ${story.fixes.join(' | ')}`);
    if (base.graphics) base.graphics = { ...base.graphics, story: story.items.length ? story.items : undefined, storyProps: out2.story?.props?.length ? out2.story.props : undefined } as never;
    checked = validateTreatment(base, song, win, TEMPLATES);
    const usedFonts = recent.map((r) => r.font);
    const errs = [
      ...(!sys.fonts.includes(out2.design.font) ? [`字型必須從「${sys.name}」的字型挑：${sys.fonts.join('、')}`] : []),
      ...(usedFonts.includes(out2.design.font) && sys.fonts.some((f) => !usedFonts.includes(f)) ? [`字型 ${out2.design.font} 最近的歌用過，換一款：${sys.fonts.filter((f) => !usedFonts.includes(f)).join('、')}`] : []),
      // a motif shape (kind + variant) is never reused across songs: sweet timer's clock came back in another song
      ...(base.motif && history.filter((r) => r.song !== song.title).some((r) => (r.motif ?? '').startsWith(`${base.motif!.kind}/${base.motif!.variant ?? ''}/`) || (r.motif === base.motif!.kind && !base.motif!.variant)) ? [`主題物件 ${base.motif!.kind}/${base.motif!.variant ?? ''} 以前的歌用過：換一種物件或造型（已用過：${history.filter((r) => r.motif).map((r) => r.motif).join('、')}）`] : []),
      ...lyriclessGaps().filter((g) => (base.graphics?.sections ?? []).filter((x) => x.start > g.start + 0.5 && x.start < g.end - 2).length < Math.min(3, Math.floor((g.end - g.start) / 10))).map((g) => `${g.start.toFixed(1)}–${g.end.toFixed(1)} 秒沒有歌詞（間奏或哼唱），graphics 要在裡面換 ${Math.min(3, Math.floor((g.end - g.start) / 10))} 次以上的圖層組合，用設計語言的大型圖形或招牌動作讓畫面有變化`),
      // same language, different materials: every earlier song in this language, not only the recent three
      ...samenessIssues(base.graphics, history.filter((r) => r.song !== song.title && r.language === language)),
      ...(!base.graphics || base.graphics.sections.length < 3 ? ['graphics 至少要有 3 個段落（主歌、副歌、安靜段各有不同的圖層組合）'] : []),
      ...checked.errors, ...checkStyle(checked.treatment, style, song, win, tier, titleCards).filter((e) => e.includes('主題物件'))];
    console.log(`design attempt ${attempt}: ${errs.length} errors`);
    if (!errs.length) break;
    dMessages.push({ role: 'assistant', content: msg.content as Anthropic.Beta.Messages.BetaContentBlockParam[] }, { role: 'user', content: `請修正後重新輸出：\n${errs.map((e) => `- ${e}`).join('\n')}` });
  }
  // grain is texture, not a filter: a heavy one greys every frame (LOVE YOU KILL YOU at 0.45); new designs keep it light
  if (checked.treatment.design && checked.treatment.design.grain > 0.25) {
    checked.fixes.push(`顆粒 ${checked.treatment.design.grain} 太重，調為 0.25`);
    checked.treatment.design.grain = 0.25;
  }
  // the chorus skeleton and echo follow the techniques this pass just chose (run before it, an unset list meant "all"
  // and a skeleton the director then dropped stayed applied)
  checked.fixes.push(...varyComposition(checked.treatment, chorusSpans(structure)));
  checked.fixes.push(...keepOwnMotifs(checked.treatment as never, language));
  keepApart(checked.treatment, checked.fixes);
  checked.fixes.push(...dropEmptyFrames(checked.treatment.graphics, song.cues, song.duration));
  // lines sung faster than they read stay up while the next lands (fast idol songs and rap lost half their lines)
  checked.fixes.push(...stackRushed(checked.treatment, song.cues));
  // last: the lines take the side the design leaves free (readability outranks the off-centre variety pass)
  checked.fixes.push(...planSides(checked.treatment));
  return { checked, usage };
}

if (a['design-only']) {
  const prev = JSON.parse(readFileSync(a['design-only'], 'utf8')) as TreatmentV3;
  const lang = (a['design-language'] && a['design-language'] in LANGUAGES ? a['design-language'] : prev.design?.language ?? 'neon-stage') as LanguageId;
  const { checked, usage: u } = await designPass(prev, lang);
  writeFileSync(join(out, 'treatment.json'), JSON.stringify(checked.treatment, null, 1));
  const [pin, pout] = PRICES[a.model!] ?? [NaN, NaN];
  const costUSD = +((u.input * pin + u.output * pout) / 1e6).toFixed(3);
  writeFileSync(join(out, 'director.json'), JSON.stringify({ model: a.model, mode: 'design-only', costUSD, design: checked.treatment.design, motif: checked.treatment.motif, errors: checked.errors, fixes: checked.fixes }, null, 1));
  console.log(JSON.stringify({ costUSD, design: checked.treatment.design, motif: checked.treatment.motif, errors: checked.errors }, null, 1));
  process.exit(0);
}
const messages: Anthropic.Beta.Messages.BetaMessageParam[] = [{ role: 'user', content: USER + keepText }];
let usage = { input: 0, output: 0 };
const began = Date.now();
const status = jobStatus(a.job ?? jobIdFor(out), { title: a.title ?? `${song.title} ${win.start}–${win.end}s`, tier, style: style.name });
status.stage('director', { state: 'running', done: 0, total: 3, message: undefined });
process.on('uncaughtExceptionMonitor', (e) => status.stage('director', { state: 'failed', message: String(e).slice(0, 300) }));
let result: ReturnType<typeof validateTreatment> | undefined;
let chosen: LanguageId = 'neon-stage';
for (let attempt = 0; attempt < 3; attempt++) {
  const message = await streamed({
      model: a.model!, max_tokens: 64000, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
      output_config: { effort: 'high', format: { type: 'json_schema', schema: SCHEMA } },
      system: SYSTEM, messages,
    } as Anthropic.Beta.Messages.MessageStreamParams);
  usage = { input: usage.input + message.usage.input_tokens, output: usage.output + message.usage.output_tokens };
  if (message.stop_reason === 'refusal') throw new Error(`Refused: ${JSON.stringify(message.stop_details)}`);
  if (message.stop_reason === 'max_tokens') throw new Error('Output was cut off at max_tokens');
  const text = message.content.find((b) => b.type === 'text')?.text;
  if (!text) throw new Error(`No text in response (stop_reason ${message.stop_reason})`);
  const draft = JSON.parse(text) as TreatmentV3;
  if (keep) {
    draft.assets = keep.assets;
    draft.styleAnchor = keep.styleAnchor;
  }
  for (const sh of draft.shots) {
    const pairs = sh.params as unknown as { key: string; value: string }[];
    sh.params = Object.fromEntries(pairs.map((x) => [x.key, coerce(x.value)]));
  }
  writeFileSync(join(out, `draft_${attempt}.json`), JSON.stringify(draft, null, 1));
  result = validateTreatment(draft, song, win, TEMPLATES);
  // a short answer that leaves lines unstyled must be sent back, not silently filled with defaults
  const styled = new Set(draft.cues.map((c) => c.cueId));
  const missing = cues.filter((c) => !styled.has(c.id)).map((c) => c.id);
  if (missing.length) result.errors.push(`這些歌詞沒有樣式，每一句都必須在 cues 裡：${missing.join(', ')}`);
  result.errors.push(...checkStyle(result.treatment, style, song, win, tier, titleCards));
  chosen = (draft as unknown as { language: LanguageId }).language;
  const lang = LANGUAGES[chosen];
  if (!lang) result.errors.push(`language ${chosen} 不存在`);
  else {
    if (!allowedLanguages.includes(chosen)) result.errors.push(`language ${chosen} 不在可選的設計語言裡，請改選：${allowedLanguages.join('、')}`);
    const bad = draft.shots.filter((x) => !lang.templates.includes(x.template));
    if (bad.length) result.errors.push(`「${lang.name}」不能用這些模板：${bad.map((x) => `${x.id}=${x.template}`).join('、')}（可用：${lang.templates.join('、')}）`);
  }
  console.log(`attempt ${attempt}: ${result.errors.length} errors, ${result.fixes.length} fixes`);
  status.stage('director', { done: attempt + 1, message: result.errors.length ? `第 ${attempt + 1} 次：${result.errors.length} 個問題，請導演修正` : undefined });
  if (!result.errors.length) break;
  messages.push({ role: 'assistant', content: message.content as Anthropic.Beta.Messages.BetaContentBlockParam[] });
  messages.push({ role: 'user', content: `程式驗證未通過，請修正後輸出完整的企劃 JSON：\n${result.errors.map((e) => `- ${e}`).join('\n')}` });
}
// a shot a little off the style's pacing still renders fine: after the last attempt it is a note, not a failed song
// (neon-stage on 第六感 died on one 8.6 s shot where the style asks 3.5–8)
const pacing = (e: string) => /^鏡頭 \S+ 長 [\d.]+ 秒，這個風格要/.test(e);
if (result && result.errors.length && result.errors.every(pacing)) {
  result.fixes.push(...result.errors.map((e) => `接受：${e}`));
  result.errors = [];
}
if (!result || result.errors.length) throw new Error('導演 3 次仍未通過驗證：\n' + result?.errors.join('\n'));
result.fixes.push(...editorPass(result.treatment, sameLines(song)));
// second call: the design system and motif for these shots
// saved so a failed design pass can be retried alone: --design-only <out>/shots.json
writeFileSync(join(out, 'shots.json'), JSON.stringify({ ...result.treatment, design: { ...result.treatment.design, language: chosen } }, null, 1));
const designed = await designPass(result.treatment, chosen);
usage = { input: usage.input + designed.usage.input, output: usage.output + designed.usage.output };
result = { ...designed.checked, fixes: [...result.fixes, ...designed.checked.fixes] };
writeFileSync(join(out, 'treatment.json'), JSON.stringify(result.treatment, null, 1));
const [pin, pout] = PRICES[a.model!] ?? [NaN, NaN];
const report = { model: a.model, seconds: Math.round((Date.now() - began) / 1000), ...usage, costUSD: +((usage.input * pin + usage.output * pout) / 1e6).toFixed(3), references: db.ids, fixes: result.fixes };
writeFileSync(join(out, 'director.json'), JSON.stringify(report, null, 1));
{
  const d = result.treatment.design!;
  const rec: DesignRecord = { song: song.title, language: chosen, decor: mainDecor(result.treatment.graphics), font: d.font, medium: d.medium, motif: result.treatment.motif && `${result.treatment.motif.kind}/${result.treatment.motif.variant ?? ''}/${result.treatment.motif.render ?? 'neon'}`, peak: d.peak, grain: d.grain, paper: d.paper };
  writeFileSync(a.history!, JSON.stringify([...history.filter((r) => r.song !== song.title), rec], null, 1));
}
status.stage('director', { state: 'done', costUSD: report.costUSD, message: undefined });
console.log(JSON.stringify(report, null, 1));

