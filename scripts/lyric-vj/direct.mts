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
import { CAMERAS, cuesIn, EMPHASIS_METHODS, ENTER_KINDS, EXIT_KINDS, TRANSITIONS, ParamValue, TreatmentV3, validateTreatment } from '../../src/app/lyric-vj/treatment';
import { checkStyle, STYLES } from '../../src/app/lyric-vj/styles';
import { editorPass, varyComposition } from '../../src/app/lyric-vj/compose';
import { FONTS } from '../../src/app/lyric-vj/fonts';
import { MOTIF_FORMS, MOTIF_KINDS, MOTIF_RENDERS, MOTIF_VARIANTS } from '../../src/app/lyric-vj/motif';
import { PEAK_STYLES, TECHNIQUES } from '../../src/app/lyric-vj/design';
import { MEDIA } from '../../src/app/lyric-vj/medium';
import { LANGUAGES, availableLanguages, LanguageId } from '../../src/app/lyric-vj/languages';
import { validateLook } from '../../src/app/lyric-vj/look';
import { LAYER_KINDS } from '../../src/app/lyric-vj/render/graphics';

/** What a song was made with, so the next songs can be told apart from it (older records have a system). */
interface DesignRecord { song: string; language?: LanguageId; system?: string; font: string; medium?: string; motif?: string; peak?: string }
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
// nothing is generated on unchecked lyric timing (the timing editor confirms it); --unconfirmed for internal tests
const gate = timingGate(song);
if (gate && !a.unconfirmed) throw new Error(gate);
const win = { start: Number(a.start), end: Number(a.end) };
const out = a.out!;
mkdirSync(out, { recursive: true });

// ---- schema (structured output): only vocabulary the engine has
// params are a list of {key, value} pairs: one optional field per template parameter would exceed the API's limit
// on optional schema fields; values arrive as strings and are coerced back (the validator checks them per template)
const coerce = (v: string): ParamValue => (v === 'true' ? true : v === 'false' ? false : /^-?\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : v);
const str = { type: 'string' };
// the song's design system (design.ts): one font, kana scale, a duotone + one accent per section, texture
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
    sections: { type: 'array', description: '依段落的圖層組合，start 在段落交界（副歌、安靜段要和主歌不同）', items: { type: 'object', additionalProperties: false, required: ['start', 'text', 'accent', 'layers'],
      properties: { start: { type: 'number' }, text: { type: 'string', description: '#rrggbb 這段歌詞的字色（淺色底必填深色；深色底填空字串）' }, accent: { type: 'string', description: '#rrggbb 強調字色，或空字串' },
        layers: { type: 'array', description: '由下往上畫', items: LAYER_SCHEMA } } } },
  },
};
/** Turns the director's key/value layers into graphics.ts layers. */
function toLook(g: { sections: { start: number; text: string; accent: string; layers: { kind: string; params: { key: string; value: string }[] }[] }[] }) {
  return {
    sections: g.sections.map((s) => ({
      start: s.start, text: s.text || undefined, accent: s.accent || undefined,
      layers: s.layers.map((l) => ({
        kind: l.kind,
        ...Object.fromEntries(l.params.map(({ key, value }) => {
          if (key === 'colors') return [key, value.split(',').map((x) => x.trim())];
          if (key === 'ghosts') return [key, value.split(';').map((g) => g.split(',').map((x) => x.trim())).filter((p) => p.length === 3).map(([dx, dy, color]) => ({ dx: Number(dx), dy: Number(dy), color }))];
          return [key, coerce(value)];
        })),
      })),
    })),
  };
}
const GRAPHICS_RULES = `graphics（圖形層，最重要）：用下列圖層由下往上組出每個段落的畫面，嚴格照設計語言的圖層配方與色彩邏輯。
- 座標：x、y 為 -1..1（0 是中心，y 往上為正）；w、h、r、radius 是畫面比例；size、height、inset、gap 是像素（1920×1080）。
- 圖層：fill（純色，to 漸層）、paper（紙，grain）、pattern（type、scale 像素、angle、scroll 每秒像素）、photo（mode、asset 素材 id，不填用當下鏡頭的圖、tint、frame、tilt）、frame（type、label）、rings、sparkles、sunburst（rays、spin）、band（type、y、angle、height、scroll、color2）、shapes（type、count、size、drift、outline）、blob（x、y、r）、bands（colors 階梯色帶，from 與 to 為 0..1）、stamp（text、size、tilt）、seal（text 2–4 字）、numeral（text、size 為畫面高比例）、scanlines（gap、vignette）、chargrid（cols、field、chars）、mist（count、y）、speedlines（count、inner）、swissgrid（color 格線、bars、signal、seed）。
- 共通：opacity、pulse（拍點跳動 0–1）、blend（multiply 疊印）、ghosts（套印偏移或硬投影的副本，最多 2 個）。
- 每個圖層的參數寫在 params 的 key/value 裡，例：{kind:'blob', params:[{key:'color',value:'#FBE6B4'},{key:'x',value:'0.5'},{key:'r',value:'0.2'},{key:'ghosts',value:'3,2,#EE9A73'}]}。
- 每段第一層必須是滿版的 fill 或 paper（或 photo full）。淺色底要設定 text 為深色。
- 歌詞要清楚：歌詞會出現在畫面中央附近，那一帶不要放高對比的細碎圖案；照片與圖形是配角。
- 段落：至少 3 種組合（主歌、副歌、安靜段），整首最多 14 個 graphics 段落（同類段落重複時直接沿用，不要逐句細分），副歌最強烈；把設計語言的招牌動作放在最後一次副歌。
- stamp、seal、numeral 的文字用這首歌的歌名、關鍵詞或編號，不要放無關的字。`;
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
const FONT_LIST = `主字型可選：${FONTS.filter((f) => f.roles.includes('display')).map((f) => `${f.family}（${f.feel}）`).join('、')}\n搭配英文字型可選：${FONTS.filter((f) => f.roles.includes('accent')).map((f) => `${f.family}（${f.feel}）`).join('、')}`;
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
          properties: { from: { type: 'integer' }, to: { type: 'integer' }, method: { type: 'string', enum: EMPHASIS_METHODS } } } },
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
const allowedLanguages = a.language && a.language in LANGUAGES ? [a.language as LanguageId] : availableLanguages(history.filter((r) => r.song !== song.title).slice(-(Object.keys(LANGUAGES).length - 1)));
const recentText = recent.length ? recent.map((r) => `- ${r.song}：${r.language ? `${LANGUAGES[r.language].name}（${r.language}）` : r.system}、字型 ${r.font}、媒材 ${r.medium ?? '—'}${r.motif ? `、主題物件 ${r.motif}` : ''}`).join('\n') : '（無）';
const SYSTEMS_TEXT = `設計語言（language，最重要的決定）：每首歌要像不同設計師做的。先依這首歌的個性選一種設計語言，鏡頭只能用它的模板。
${(Object.keys(LANGUAGES) as LanguageId[]).map((k) => `- ${k}（${LANGUAGES[k].name}）${allowedLanguages.includes(k) ? '' : '【最近已用過，這首不可選】'}：${LANGUAGES[k].essence} 適合：${LANGUAGES[k].suits}。模板：${LANGUAGES[k].templates.join('、')}`).join('\n')}
最近做過的歌（這首要和它們明顯不同）：
${recentText}`;
const style = STYLES[a['style-id']!];
if (!style) throw new Error(`未知風格 ${a['style-id']}`);
const tier = a.tier as Tier;
if (!TIERS[tier]) throw new Error(`未知版本 ${a.tier}（still | standard | rich）`);
const scenes = sceneCount(tier, win, repeatSec);
const SYSTEM = `你是日本地下偶像 Live House 的歌詞 VJ 導演兼動態設計師。你為一段歌曲寫「企劃 v3」JSON，引擎會照著逐格渲染。
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
- 構圖：不要每個畫面都置中。用 align、position 讓畫面左右輪替，副歌一次比一次大（第一次收斂、最後一次最大；不要用 bleed 出血，裁切的巨字會被看成排版錯誤）；程式也會自動錯開連續置中的鏡頭。
- reveal：主歌、敘事句、慢歌多用 word（字以固定速度依序載出，像在說話）；副歌的衝擊句可用 line 讓整句砸下。
- 系統有 beat-cut 時，副歌節奏強烈的句子可用它（每唱到一個詞就換一個構圖切入）。
- 重複的歌詞（第 2、3 次副歌）沿用畫面但換版型，讓副歌逐次升級。

情緒起伏（必須做）：
- arc：每個段落標強度 0–3（前奏、尾奏 0，主歌 1，導歌 2，副歌 3；安靜的落ちサビ或橋段降到 0–1）。引擎依強度調整背景亮度、飽和度、光暈、光粒子。
- moments：在段落交界放爆點，at 放在強拍上。
${MOMENT_KINDS.map((k) => `  - ${k}：${MOMENT_RULES[k].desc}（dur ${MOMENT_RULES[k].dur[1] ? `${MOMENT_RULES[k].dur[0]}–${MOMENT_RULES[k].dur[1]} 秒` : '填 0'}）`).join('\n')}
- 每次副歌第一拍放 drop，前面接 2–4 秒的 build；最後一次副歌改用 finale。歌曲有安靜下來的落ちサビ、或最後副歌前能量明顯下降的段落時放 break；最後副歌前可以放 0.5–0.8 秒的 hold（先收再放）。
- 多次副歌要有遞進：strength 一次比一次高（例如 1.0 → 1.15 → finale）。strength 0.8–1.3；Live House 大螢幕上爆點要明顯。
- 有 drop 或 finale 的那個鏡頭不需要再用 transitionIn flash（引擎會略過）。
- 素材描述用英文，畫面不可有任何文字。這個範圍${TIERS[tier].video ? `要 ${tier === 'rich' ? Math.ceil(scenes * 0.6) : 1}–${scenes} 組素材（每組 1 image + 1 video）` : `要 1–${scenes} 張 image，不要 video`}。`;

const expectShots = Math.round((win.end - win.start) / ((style.shotSec[0] + style.shotSec[1]) / 2));
const USER = `【輸出要求】shots 大約 ${expectShots} 個（每個 ${style.shotSec[0]}–${style.shotSec[1]} 秒，連續覆蓋整個範圍）；cues 必須包含下列全部 ${cues.length} 句。\n\n【這首歌的說明】\n${a.style ? `${a.style}\n` : ''}${describeStructure(structure)}\n\n【程式建議的爆點】（依結構產生，可以調整強度與長度，位置除非有明確理由不要改）\n${suggestedText}\n\n【關鍵詞（可以換色的詞）】\n${keyWords(song).join('、') || '（無）'}\n\n【重複段落】\n${repeatText}\n\n【標題卡】\n${gapText}\n\n【範圍】${win.start}–${win.end} 秒；BPM 約 ${song.tempo.toFixed(0)}\n【段落】\n${sections}\n【強拍】${song.downbeats.filter((b) => b >= win.start && b < win.end).map((b) => b.toFixed(2)).join(' ')}\n\n【歌詞】\n${cueLines}\n\n【模板】\n${catalog}\n\n【VJ 資料庫參考】（50 支歌詞 VJ 的分析，是觀察與推測，不是規則）\n${db.text}`;
writeFileSync(join(out, 'prompt.txt'), SYSTEM + '\n\n' + USER);

const client = new Anthropic();
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
async function designPass(base: TreatmentV3, language: LanguageId): Promise<{ checked: ReturnType<typeof validateTreatment>; usage: { input: number; output: number } }> {
  const sys = LANGUAGES[language];
  const sysText = `【設計語言】${sys.name}（${language}）
- 本質：${sys.essence}
- 不是：${sys.not}
- 色彩：${sys.colour}
- 字：${sys.type} 字型只能從這些選：${sys.fonts.join('、')}
- 圖層：${sys.layers}
- 動態：${sys.motion}
- 招牌動作（放在歌曲最高潮）：${sys.native}
${sys.motif ? '' : '- 這個語言沒有主題物件。\n'}【最近做過的歌】這首的字型要和它們不同：\n${recentText}`;
  const userD = `為這首歌設計 design、graphics${sys.motif ? ' 與 motif' : ''}。企劃的鏡頭與歌詞版型已定，你決定字型、色彩、質感、爆點樣式，以及畫面的圖形：graphics 是用程式畫的圖層組合（取代滿版背景圖），依段落切換。\n\n${sysText}\n\n${GRAPHICS_RULES}\n\n${DESIGN_RULES}\n\n${sys.motif ? MOTIF_RULES : ''}\n\n【歌曲】${song.title}\n【概念】${base.concept}\n【背景圖的內容】\n${base.assets.filter((x) => x.kind === 'image').map((x) => `- ${x.id}: ${x.prompt}`).join('\n')}\n【結構】${describeStructure(structure)}\n【段落】\n${sections}\n【鏡頭】\n${base.shots.map((x) => `${x.id} ${x.start.toFixed(1)}–${x.end.toFixed(1)}s ${x.template}`).join('\n')}\n【關鍵詞】${keyWords(song).join('、')}\n【歌詞】\n${cues.map((c) => `${c.start.toFixed(1)}s ${c.text}`).join('\n')}`;
  const dMessages: Anthropic.Beta.Messages.BetaMessageParam[] = [{ role: 'user', content: userD }];
  let checked!: ReturnType<typeof validateTreatment>;
  const usage = { input: 0, output: 0 };
  for (let attempt = 0; attempt < 3; attempt++) {
    const msg = await client.beta.messages
      .stream({
        model: a.model!, max_tokens: 48000, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
        output_config: { effort: 'high', format: { type: 'json_schema', schema: { type: 'object', additionalProperties: false, required: sys.motif ? ['design', 'graphics', 'motif'] : ['design', 'graphics'], properties: sys.motif ? { design: DESIGN_SCHEMA, graphics: GRAPHICS_SCHEMA, motif: MOTIF_SCHEMA } : { design: DESIGN_SCHEMA, graphics: GRAPHICS_SCHEMA } } } },
        system: '你是日本偶像歌詞 VJ 的資深動態設計總監，為每首歌建立獨特的字體與色彩系統。',
        messages: dMessages,
      } as Anthropic.Beta.Messages.MessageStreamParams)
      .finalMessage();
    usage.input += msg.usage.input_tokens;
    usage.output += msg.usage.output_tokens;
    const text = msg.content.find((b) => b.type === 'text')?.text;
    if (msg.stop_reason === 'refusal' || !text) throw new Error(`沒有產出設計（${msg.stop_reason}）`);
    if (msg.stop_reason === 'max_tokens') throw new Error('設計輸出超過長度上限（graphics 段落太多）');
    const out2 = JSON.parse(text);
    base.design = { ...out2.design, language };
    base.motif = sys.motif ? out2.motif : undefined;
    base.graphics = validateLook(toLook(out2.graphics) as never, base.assets.map((x) => x.id), win.start).look;
    checked = validateTreatment(base, song, win, TEMPLATES);
    const usedFonts = recent.map((r) => r.font);
    const errs = [
      ...(!sys.fonts.includes(out2.design.font) ? [`字型必須從「${sys.name}」的字型挑：${sys.fonts.join('、')}`] : []),
      ...(usedFonts.includes(out2.design.font) && sys.fonts.some((f) => !usedFonts.includes(f)) ? [`字型 ${out2.design.font} 最近的歌用過，換一款：${sys.fonts.filter((f) => !usedFonts.includes(f)).join('、')}`] : []),
      ...(base.motif && recent.some((r) => r.motif === `${base.motif!.kind}/${base.motif!.variant ?? ''}/${base.motif!.render ?? 'neon'}`) ? ['主題物件的種類、造型、畫法和最近的歌完全相同：換一個造型（variant）或畫法（render）'] : []),
      ...(!base.graphics || base.graphics.sections.length < 3 ? ['graphics 至少要有 3 個段落（主歌、副歌、安靜段各有不同的圖層組合）'] : []),
      ...checked.errors, ...checkStyle(checked.treatment, style, song, win, tier, titleCards).filter((e) => e.includes('主題物件'))];
    console.log(`design attempt ${attempt}: ${errs.length} errors`);
    if (!errs.length) break;
    dMessages.push({ role: 'assistant', content: msg.content as Anthropic.Beta.Messages.BetaContentBlockParam[] }, { role: 'user', content: `請修正後重新輸出：\n${errs.map((e) => `- ${e}`).join('\n')}` });
  }
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
  const message = await client.beta.messages
    .stream({
      model: a.model!, max_tokens: 64000, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
      output_config: { effort: 'high', format: { type: 'json_schema', schema: SCHEMA } },
      system: SYSTEM, messages,
    } as Anthropic.Beta.Messages.MessageStreamParams)
    .finalMessage();
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
    if (!allowedLanguages.includes(chosen)) result.errors.push(`language ${chosen} 最近的歌已用過，請改選：${allowedLanguages.join('、')}`);
    const bad = draft.shots.filter((x) => !lang.templates.includes(x.template));
    if (bad.length) result.errors.push(`「${lang.name}」不能用這些模板：${bad.map((x) => `${x.id}=${x.template}`).join('、')}（可用：${lang.templates.join('、')}）`);
  }
  console.log(`attempt ${attempt}: ${result.errors.length} errors, ${result.fixes.length} fixes`);
  status.stage('director', { done: attempt + 1, message: result.errors.length ? `第 ${attempt + 1} 次：${result.errors.length} 個問題，請導演修正` : undefined });
  if (!result.errors.length) break;
  messages.push({ role: 'assistant', content: message.content as Anthropic.Beta.Messages.BetaContentBlockParam[] });
  messages.push({ role: 'user', content: `程式驗證未通過，請修正後輸出完整的企劃 JSON：\n${result.errors.map((e) => `- ${e}`).join('\n')}` });
}
if (!result || result.errors.length) throw new Error('導演 3 次仍未通過驗證：\n' + result?.errors.join('\n'));
result.fixes.push(...varyComposition(result.treatment, chorusSpans(structure)));
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
  const rec: DesignRecord = { song: song.title, language: chosen, font: d.font, medium: d.medium, motif: result.treatment.motif && `${result.treatment.motif.kind}/${result.treatment.motif.variant ?? ''}/${result.treatment.motif.render ?? 'neon'}`, peak: d.peak };
  writeFileSync(a.history!, JSON.stringify([...history.filter((r) => r.song !== song.title), rec], null, 1));
}
status.stage('director', { state: 'done', costUSD: report.costUSD, message: undefined });
console.log(JSON.stringify(report, null, 1));

