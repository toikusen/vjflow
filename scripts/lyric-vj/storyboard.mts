// The storyboard director: for a language drawn by scene parts (idol Live), the design is written storyboard-first —
// the song's concept, then three key frames, then the scenes: what each says, which parts carry its lines, what
// happens when. No caption layouts are picked and no generic layout rules apply; what the parts cannot draw, or what
// the frame check would refuse, goes back to the director with the reasons.
//
//   npx tsx scripts/lyric-vj/storyboard.mts --song out/db/x/song.json --start 108 --end 147 --out out/research/x \
//     [--language idol-live] [--model claude-opus-5-5] [--attempts 3] [--replay raw0.json,raw1.json]
//
// --replay: the director's replies are read from files (one per attempt) instead of asked for: the whole flow is
// tested on saved replies without a paid call.
import Anthropic from '@anthropic-ai/sdk';
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { splitCalls } from '../../src/app/lyric-vj/calls';
import { finishDesign } from '../../src/app/lyric-vj/finish';
import { LANGUAGES, LanguageId } from '../../src/app/lyric-vj/languages';
import { EVENT_KINDS, PART_GUIDE, PART_KINDS, reusedSkeletons, Scene, sceneMotifs, sceneSkeleton, SceneTime } from '../../src/app/lyric-vj/scene';
import { techniqueRefs } from './dbrefs.mts';
import { LOUD_TRANSITIONS, TRANSITION_KINDS, transitionGuide, type TransitionKind } from '../../src/app/lyric-vj/render/transition';
import { MOMENT_KINDS, MOMENT_RULES } from '../../src/app/lyric-vj/moments';
import { analyzeStructure, chorusSpans } from '../../src/app/lyric-vj/structure';
import { TEMPLATES } from '../../src/app/lyric-vj/templates';
import { SongTimeline } from '../../src/app/lyric-vj/timeline';
import { cuesIn, TreatmentV3, validateTreatment } from '../../src/app/lyric-vj/treatment';
import { PRICES, streamed } from './claude.mts';

const { values: a } = parseArgs({
  options: {
    song: { type: 'string' }, start: { type: 'string' }, end: { type: 'string' }, out: { type: 'string' },
    language: { type: 'string', default: 'idol-live' }, model: { type: 'string', default: 'claude-opus-5-5' },
    attempts: { type: 'string', default: '3' }, replay: { type: 'string' },
    resume: { type: 'string' }, // an earlier run's dir: its replies and their errors (as checked now) start the conversation
    note: { type: 'string' }, // a person's direction for the next reply (added to the errors sent back; not a check)
    record: { type: 'boolean', default: false }, // add this song's design to the history the next songs must differ from
    budget: { type: 'string', default: '0.5' },
    'max-tokens': { type: 'string', default: '16000' }, // the longest one reply may be (a whole song needs more) // USD: the most this run may spend; it stops before a call that could pass it
  },
});
const song: SongTimeline = JSON.parse(readFileSync(a.song!, 'utf8'));
const win = { start: Number(a.start ?? 0), end: Number(a.end ?? song.duration) };
const out = a.out!;
mkdirSync(out, { recursive: true });
const language = a.language as LanguageId;
const lang = LANGUAGES[language];
if (!lang) throw new Error(`沒有 ${language} 這個設計語言`);
const cues = cuesIn(song, win);

// ---- the reply's shape
const str = { type: 'string' };
// structured output allows few optional fields: a time is one fixed shape, a part's params a list of name/value pairs
// a time is one string (an object per time made the compiled grammar too large)
const TIME = {
  type: 'string',
  description: '時間點，一個字串：「char <cue> <n>」（cue 那句第 n 個字唱出，從 0 算）／「start <cue>」「end <cue>」（那句的句首、句尾）／「beat <n>」「downbeat <n>」（這段開始後第 n 拍、第 n 個強拍，從 0 算）／「sceneStart」「sceneEnd」（這段的開頭、結尾）',
};
const PARAM_NAMES = ['look', 'x', 'color', 'base', 'penlights', 'mode', 'y', 'height', 'idle', 'angle', 'size', 'ink', 'big', 'accent', 'accentColor', 'style', 'colors', 'color2', 'r', 'title', 'serial', 'stub', 'timer', 'w', 'h', 'word', 'alpha', 'crowd', 'crowdMotion', 'prop', 'motion'];
const NUMBER_PARAMS = new Set(['x', 'y', 'height', 'angle', 'size', 'r', 'w', 'h', 'alpha']);
const LIST_PARAMS = new Set(['penlights', 'colors']);
const PARAMS = {
  type: 'array', description: '元件參數，每個一筆 {name, value}；數字寫成數字字串，顏色陣列用逗號分隔，timer 寫 true／false',
  // (a plain string: the grammar of an enum this long plus the rest was too large to compile; the check names typos)
  items: { type: 'object', additionalProperties: false, required: ['name', 'value'], properties: { name: { type: 'string', description: `其中之一：${PARAM_NAMES.join('、')}` }, value: str } },
};
const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['concept', 'story', 'props', 'ideas', 'chosen', 'why', 'keyframes', 'storyboard', 'moments', 'design'],
  properties: {
    concept: { type: 'string', description: '這首歌的主題：一兩句，從歌詞和歌的個性來' },
    story: {
      type: 'object', additionalProperties: false, required: ['who', 'where', 'change', 'beats', 'signature'],
      description: '這段的故事：先寫故事，分鏡照故事走',
      properties: {
        who: { type: 'string', description: '誰在唱、對誰唱（從歌詞來：偶像對台下、粉絲對推、自己對自己…）' },
        where: { type: 'string', description: '在什麼情境、什麼場面（live 的哪個時刻、特典會、回家路上…）' },
        change: { type: 'string', description: '這段時間裡發生了什麼變化：從什麼狀態到什麼狀態' },
        beats: { type: 'array', description: '故事的節點，每段分鏡一個', items: { type: 'object', additionalProperties: false, required: ['scene', 'what'], properties: { scene: { type: 'string', description: '對應的分鏡 id' }, what: { type: 'string', description: '這一刻發生什麼、觀眾看到什麼' } } } },
        signature: { type: 'object', additionalProperties: false, required: ['what', 'scenes'], description: '只有這首歌才有的一個視覺元素（故事的主角）：換到別首歌就不成立的東西', properties: { what: { type: 'string', description: '是什麼、用哪個元件、放什麼這首歌專屬的內容、怎麼一段段變化' }, scenes: { type: 'array', items: str, description: '它出現在哪些分鏡（至少第一段和最後一段：首尾呼應）' } } },
      },
    },
    props: { type: 'array', description: '故事裡的具體物件（會生成插畫，用 object 元件放進畫面）：歌詞講到、觀眾一眼認得的東西；故事主角物件 hero=true（最多 1 個）', items: { type: 'object', additionalProperties: false, required: ['id', 'what', 'hero'], properties: { id: { type: 'string', description: '英文小寫加點，例 cat.white_sit' }, what: { type: 'string', description: '英文，給生圖的具體描述：形狀、顏色、姿勢；物件上不要有文字' }, hero: { type: 'boolean' } } } },
    ideas: { type: 'array', description: '2–3 個彼此不同的視覺點子（不是換顏色：構圖、文字怎麼成為畫面、Call 怎麼出現、高潮發生什麼都要不同）', items: { type: 'object', additionalProperties: false, required: ['idea', 'lyric', 'reference'], properties: { idea: { type: 'string', description: '畫面上會看到什麼' }, lyric: { type: 'string', description: '從哪句歌詞、哪個特點來' }, reference: { type: 'string', description: '參考了資料庫哪支影片的哪個手法（照抄清單裡的影片與時間），或寫「從歌詞自己想的」' } } } },
    chosen: { type: 'integer', description: '選了第幾個點子（從 0 算）' },
    why: { type: 'string', description: '為什麼這個點子最適合這首歌' },
    keyframes: { type: 'array', description: '三張關鍵畫面：主歌、Call 最密的地方、副歌（範圍內有的）', items: { type: 'object', additionalProperties: false, required: ['label', 'at'], properties: { label: { type: 'string', description: '畫面上有什麼、字怎麼構圖' }, at: TIME } } },
    storyboard: {
      type: 'array', items: {
        type: 'object', additionalProperties: false, required: ['id', 'start', 'end', 'intent', 'parts', 'exit', 'exitWhy'],
        properties: {
          id: str, start: { type: 'number' }, end: { type: 'number' }, intent: { type: 'string', description: '這段要表達什麼' }, exit: { type: 'string', description: `cut、flash、blackout，或轉場其中之一：${TRANSITION_KINDS.join('、')}。怎麼接到下一段：cut、flash（兩格白閃）、blackout（最後一拍熄燈），或轉場（下一段從這個形狀裡打開）` }, exitWhy: { type: 'string', description: '為什麼這樣接：對應故事在這一刻發生的事' },
          parts: {
            type: 'array', items: {
              type: 'object', additionalProperties: false, required: ['id', 'kind', 'z', 'lines', 'params', 'events'],
              properties: {
                id: str, kind: { type: 'string', description: `其中之一：${PART_KINDS.join('、')}` }, z: { type: 'integer' }, params: PARAMS,
                lines: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['cueId', 'role'], properties: { cueId: str, role: { type: 'string', description: 'lead、call、shout、echo、object 其中之一' } } } },
                events: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['kind', 'at'], properties: { kind: { type: 'string', description: `其中之一：${EVENT_KINDS.join('、')}` }, at: TIME } } },
              },
            },
          },
        },
      },
    },
    moments: { type: 'array', description: '這段的爆點：鋪陳（build：鏡頭慢慢推近）、炸開（drop：重推＋兩格白閃）、空拍（break）、停頓（hold）、結尾（finale：最重的一下）。副歌一定要有 drop 或 finale', items: { type: 'object', additionalProperties: false, required: ['kind', 'at', 'dur', 'strength'], properties: { kind: { type: 'string', description: `其中之一：${MOMENT_KINDS.join('、')}` }, at: { type: 'number' }, dur: { type: 'number', description: 'build/break/hold 的長度；drop/finale 填 0' }, strength: { type: 'number', description: '0.5–1.5' } } } },
    design: { type: 'object', additionalProperties: false, required: ['font', 'accent', 'background'], properties: { font: { type: 'string', description: `其中之一：${lang.fonts.join('、')}` }, accent: str, background: str } },
  },
};

// ---- the prompt
const historyPath = join('out', 'storyboard-history.json');
const history: { song: string; concept: string; parts: string[]; skeletons?: string[]; motifs?: string[] }[] = (existsSync(historyPath) ? JSON.parse(readFileSync(historyPath, 'utf8')) : []).filter((h: { song: string }) => h.song !== song.title);
// the database's designers, for a director short of ideas: their techniques nearest this song's words and its language
const refs = techniqueRefs(`${cuesIn(song, win).map((c) => c.text).join(' ')} ${lang.name} ${lang.suits} Call 應援 口號 喊 重複 詞`, 24);
const SYSTEM = `你是${lang.name}歌詞 VJ 的導演。你先想這首歌的主題，再畫三張關鍵畫面，最後寫分鏡；引擎照分鏡逐格畫出來。

做法（照順序）：
1. concept：這首歌是什麼——從歌詞和歌的個性來，一兩句。
1.2 story：先寫這段的故事——誰在唱、對誰、在什麼情境、這段時間裡發生了什麼變化；分成節點，每段分鏡一個節點，分鏡的 intent 就是那個節點。寫出一個只有這首歌才有的視覺元素（signature）：用現有元件組出來，內容是這首歌專屬的（它的詞、它的場面、它的變化），換到別首歌就不成立。不要每段各自套元件，整段要像一個故事在往前走。
1.3 props：把故事裡講到的具體東西列出來（會生成插畫），用 object 元件放進畫面——就像車票一樣，讓觀眾看到故事裡的東西，而不是只有字。故事的主角物件 hero=true，在第一段和最後一段都出現。
${lang.bright ? `1.4 ${lang.name}的歌輕快正向：預設用明亮的底（gingham、stripes、bokeh），暗的舞台最多兩段，只留給故事真的需要的地方。\n` : ''}1.5 ideas：想 2–3 個彼此不同的視覺點子，每個寫從哪句歌詞來、參考了什麼；chosen 選一個，why 說為什麼。點子要能用下面的元件做出來，而且讓 concept 在畫面上看得見（例如歌在講「只剩一個詞」，畫面就要有那個詞洗滿或堆滿）。
2. keyframes：三張關鍵畫面（主歌、Call 最密的地方、副歌；範圍內沒有的就挑最有代表性的）。label 寫畫面上有什麼、字怎麼構圖，at 是分鏡裡的時間點。這三張會先渲染給人看，影片會照同一份分鏡做。
3. storyboard：把範圍切成幾段（每段一個情緒或一件事，通常 4–20 秒，段與段之間不重疊、合起來蓋滿有歌詞的地方）。每段寫 intent（這段要表達什麼；情緒推進就夠，不必編人物劇情），再用幾個元件組合出畫面：哪個元件承載哪幾句、放在哪、誰在前面（z）、什麼時候發生什麼事（events）、怎麼接到下一段（exit）。

元件（只有這些，程式畫不出別的；寫了不存在的會被退回，不會變成一般字幕）：
${PART_KINDS.map((k) => `- ${k}：${PART_GUIDE[k]}`).join('\n')}

歌詞的角色：
${(lang.lyricLayers ?? []).map((l) => `- ${l}`).join('\n')}
- 在分鏡裡：主唱是 role lead（放 band 或 poster），台下的 Call 是 role call（放 led）。三種角色是三種身分，不是三個固定位置：主唱休息時 Call 可以接管整面牆；沒有 Call 的段落不必擺 LED 牆。
- 每一句都要有元件承載；有括號 Call 的句子，主唱部分和 Call 部分各自要有元件。同一句的同一個角色只放一個元件。

畫面會被檢查（量的是最後輸出的畫面，從進場到退場）：字太小、被別的元件擋住、和別的字疊在一起、對比不足、停留太短、顯示期間字級改變，都會退回給你修。快句連著唱時用 band 的 stack 或 led 的 row，不要讓一句還沒讀完就被換掉。

轉場（exit）：除了 cut、flash、blackout，還有這些（照意義選，要合故事在那一刻發生的事，沒有哪一種是「副歌專用」）：${transitionGuide()}。強轉場（${[...LOUD_TRANSITIONS].join('、')}）不要連用，留給真正的段落變化。每段的 exitWhy 寫為什麼用這個轉場（對應故事的哪件事）。
爆點（moments）：${MOMENT_KINDS.map((k) => `${k}：${MOMENT_RULES[k].desc}`).join('；')}。副歌要是整段最強的畫面，一定要有 drop 或 finale。

主歌和副歌要有明顯的舞台反差（光、構圖、字的份量），但每首的反差方式由這首歌決定。
${history.length ? `\n之前的歌（這首不能重用它們的版面骨架：同一種舞台加同一組元件就算同一個版面，換顏色、換字型、換光不算新設計）：\n${history.slice(-6).map((h) => `- 〈${h.song}〉${h.concept}；用過的骨架：${(h.skeletons ?? []).join('、') || h.parts.join('、')}${h.motifs?.length ? `；它的畫面特徵（這首不能用）：${h.motifs.join('、')}` : ''}`).join('\n')}\n（骨架寫法：dark＝暗的舞台燈 spot/sweep/backlight，bright＝亮的底 gingham/stripes/bokeh，後面是那段用到的元件）` : ''}
${refs.length ? `\n沒有想法時，先看資料庫裡的設計師怎麼做（534 支歌詞 VJ 分析出來的手法，挑和這首歌詞有關的；用了就在 ideas 的 reference 寫出是哪支、幾分幾秒；現有元件做不到的部分不要寫進分鏡）：\n${refs.map((r) => `- ${r}`).join('\n')}` : ''}

色彩：${lang.colour}`;
const sections = (song.sections ?? []).filter((s) => s.end > win.start && s.start < win.end).map((s) => `${s.start.toFixed(1)}–${s.end.toFixed(1)}s ${s.type}（能量 ${s.energy.toFixed(2)}）`).join('\n');
const USER = `【歌曲】${song.title}
【範圍】${win.start}–${win.end} 秒；BPM 約 ${song.tempo.toFixed(0)}
【段落】
${sections}
【歌詞】（id 時間 歌詞；標「括號 Call」的句子括號裡是台下喊的；標「時間是估的」的句子逐字時間沒有對到人聲，綁在它的字上的事件同步不保證）
${cues.map((c) => `${c.id} ${c.start.toFixed(2)}–${c.end.toFixed(2)}s「${c.text}」${splitCalls(c.text).calls.length ? '（括號 Call）' : /^\s*[(（].*[)）]\s*$/.test(c.text) ? '（整句是台下的 Call：role call，放 led）' : ''}${c.charTimed && !c.review?.length ? '' : '（時間是估的）'}`).join('\n')}`;
writeFileSync(join(out, 'storyboard_prompt.txt'), `${SYSTEM}\n\n${USER}`);

// ---- one reply into a treatment
const toTime = (t: Record<string, unknown>): SceneTime => {
  const cue = String(t['cue'] ?? ''), n = Number(t['n'] ?? 0);
  switch (t['kind']) {
    case 'char': return { cue, char: n };
    case 'start': case 'end': return { cue, edge: t['kind'] };
    case 'beat': return { beat: n };
    case 'downbeat': return { downbeat: n };
    case 'sceneEnd': return { edge: 'end' };
    default: return { edge: 'start' };
  }
};
/** A part's params from the reply's name/value list (a replayed reply may already hold them as an object). */
const toParams = (list: unknown): Record<string, unknown> => {
  if (!Array.isArray(list)) return (list ?? {}) as Record<string, unknown>;
  return Object.fromEntries(list.map(({ name, value }: { name: string; value: string }) => [name, NUMBER_PARAMS.has(name) ? Number(value) : LIST_PARAMS.has(name) ? value.split(',').map((x) => x.trim()).filter(Boolean) : name === 'timer' ? value === 'true' : value]));
};
/** A time string: "char c12 3", "start c12", "beat 4", "sceneEnd". */
const TIME_KINDS = ['char', 'start', 'end', 'beat', 'downbeat', 'sceneStart', 'sceneEnd'];
const strTime = (s: string): SceneTime => {
  const [kind, a = '', b = ''] = s.trim().split(/\s+/);
  const numeric = kind === 'beat' || kind === 'downbeat';
  return toTime({ kind, cue: numeric ? '' : a, n: Number(numeric ? a : b) || 0 });
};
/** A replayed reply written in the old shape (times as {cue, char} objects) still reads. */
const anyTime = (t: Record<string, unknown> | string): SceneTime => typeof t === 'string' ? strTime(t) : ('kind' in t ? toTime(t) : 'char' in t ? { cue: String(t['cue']), char: Number(t['char']) } : 'cue' in t ? { cue: String(t['cue']), edge: (t['edge'] as 'start' | 'end') ?? 'start' } : 'beat' in t ? { beat: Number(t['beat']) } : 'downbeat' in t ? { downbeat: Number(t['downbeat']) } : { edge: (t['edge'] as 'start' | 'end') ?? 'start' });
interface Reply {
  concept: string;
  keyframes: { label: string; at: Record<string, unknown> | string }[];
  storyboard: (Omit<Scene, 'parts'> & { parts: (Omit<Scene['parts'][number], 'events'> & { events: { kind: string; at: Record<string, unknown> | string }[] })[] })[];
  design: { font: string; accent: string; background: string };
  ideas: { idea: string; lyric: string; reference: string }[];
  story: { who: string; where: string; change: string; beats: { scene: string; what: string }[]; signature: { what: string; scenes: string[] } };
  moments: { kind: string; at: number; dur: number; strength: number }[];
  props: { id: string; what: string; hero: boolean }[];
  chosen: number;
  why: string;
}
function treatmentOf(r: Reply): TreatmentV3 {
  const storyboard: Scene[] = r.storyboard.map((s) => ({ ...s, parts: s.parts.map((p) => ({ ...p, params: toParams(p.params), events: p.events.map((e) => ({ kind: e.kind as never, at: anyTime(e.at) })) })) }));
  return {
    concept: r.concept,
    styleAnchor: { prompt: '', palette: { background: r.design.background, text: '#FFFFFF', accent: r.design.accent, line: '#FFFFFF', glow: r.design.accent } },
    assets: [], shots: [], cues: [],
    storyboard,
    keyframes: r.keyframes.map((k) => ({ label: k.label, at: anyTime(k.at) })),
    moments: (r.moments ?? []).map((m) => ({ kind: m.kind as never, at: m.at, ...(m.dur ? { dur: m.dur } : {}), strength: m.strength })),
    // the story's props: props.mts draws them, the object parts show them
    graphics: { sections: [{ start: win.start, layers: [] }], storyProps: r.props ?? [] } as never,
    design: {
      font: r.design.font, accentFont: 'Montserrat', kanaScale: 1, grain: 0, paper: 0,
      colorScript: [{ start: win.start, shadow: r.design.background, highlight: r.design.background, accent: r.design.accent, duotone: 0, image: 0 }],
      peak: 'vacuum', medium: 'clean', techniques: [], language,
    } as never,
  };
}

// ---- the loop: ask (or replay), validate, send the reasons back
const replays = a.replay?.split(',') ?? [];
const attempts = replays.length || Math.max(1, Math.min(6, Number(a.attempts) || 3));
// a person's direction goes with the first ask too when nothing is resumed
const messages: Anthropic.Beta.Messages.BetaMessageParam[] = [{ role: 'user', content: USER + (a.note && !a.resume ? `\n\n【看過前一版的人的意見】${a.note}` : '') }];
const usage = { input: 0, output: 0 };
let checked: ReturnType<typeof validateTreatment> | undefined;
let reply: Reply | undefined;
/** A reply checked: the validated treatment and every error that sends it back. */
function judge(r: Reply) {
  const c = validateTreatment(treatmentOf(r), song, win, TEMPLATES);
  // a layout an earlier song already used is the same design recoloured: checkable, so it goes back
  const reused = reusedSkeletons(c.treatment.storyboard ?? [], history.map((h) => ({ song: h.song, skeletons: h.skeletons ?? [] })));
  const errs = [
    ...c.errors,
    ...(r.keyframes.length !== 3 ? ['keyframes 要剛好三張'] : []),
    ...(r.ideas?.length < 2 ? ['ideas 至少要兩個不同的點子'] : []),
    // the fields left as plain strings for the grammar's size: checked here (part kinds, roles and events by checkScenes)
    ...(!lang.fonts.includes(r.design?.font) ? [`design.font ${r.design?.font} 不在可用字型裡（${lang.fonts.join('、')}）`] : []),
    ...(r.moments ?? []).filter((m) => !(MOMENT_KINDS as string[]).includes(m.kind)).map((m) => `爆點 ${m.kind} 不存在（${MOMENT_KINDS.join('、')}）`),
    ...r.storyboard.flatMap((sc) => sc.parts.flatMap((p) => (p.lines ?? []).filter((l) => !['lead', 'call', 'shout', 'echo', 'object'].includes(l.role)).map((l) => `分鏡 ${sc.id} 的 ${p.id}：role ${l.role} 不存在`))),
    ...r.storyboard.flatMap((sc) => sc.parts.flatMap((p) => p.events.filter((e) => typeof e.at === 'string' && !TIME_KINDS.includes(e.at.trim().split(/\s+/)[0])).map((e) => `分鏡 ${sc.id} 的 ${p.id}：時間點「${e.at}」看不懂（${TIME_KINDS.join('、')}）`))),
    ...r.keyframes.filter((k) => typeof k.at === 'string' && !TIME_KINDS.includes(k.at.trim().split(/\s+/)[0])).map((k) => `關鍵畫面時間點「${k.at}」看不懂（${TIME_KINDS.join('、')}）`),
    ...r.storyboard.filter((sc) => sc.exit && !['cut', 'flash', 'blackout', ...TRANSITION_KINDS].includes(sc.exit)).map((sc) => `分鏡 ${sc.id} 的 exit ${sc.exit} 不存在（cut、flash、blackout、${TRANSITION_KINDS.join('、')}）`),
    ...r.storyboard.flatMap((sc) => sc.parts.flatMap((p) => (Array.isArray(p.params) ? (p.params as { name: string }[]) : []).filter((x) => !PARAM_NAMES.includes(x.name)).map((x) => `分鏡 ${sc.id} 的 ${p.id} 參數 ${x.name} 不存在`))),
    // the storyboard follows the story: every scene is one of its beats
    ...(r.story ? r.storyboard.filter((sc) => !r.story.beats.some((b) => b.scene === sc.id)).map((sc) => `分鏡 ${sc.id} 沒有對應故事的節點（story.beats）：每段分鏡都要是故事裡的一刻`) : ['要先寫 story（故事）']),
    // the song's own element runs through it, first scene to last
    ...(r.story && (!r.story.signature?.what?.trim() || !r.story.signature.scenes?.includes(r.storyboard[0]?.id) || !r.story.signature.scenes?.includes(r.storyboard[r.storyboard.length - 1]?.id)) ? [`story.signature（這首歌獨有的元素）要寫清楚，而且第一段（${r.storyboard[0]?.id}）和最後一段（${r.storyboard[r.storyboard.length - 1]?.id}）都要出現：首尾呼應`] : []),
    // the story is told with things, not only words: its props are drawn and placed
    ...r.storyboard.flatMap((sc) => sc.parts.filter((p) => p.kind === 'object').map((p) => String(toParams(p.params)['prop'] ?? '')).filter((id) => id && !(r.props ?? []).some((x) => x.id === id)).map((id) => `分鏡 ${sc.id} 的物件 ${id} 沒有列在 props：要先列出（what 寫給生圖的描述）`)),
    ...((r.props ?? []).filter((x) => !r.storyboard.some((sc) => sc.parts.some((p) => p.kind === 'object' && String(toParams(p.params)['prop']) === x.id))).map((x) => `props 的 ${x.id} 沒有放進任何分鏡：用不到就拿掉`)),
    ...(() => {
      const sung = r.storyboard.filter((sc) => sc.parts.some((p) => (p.lines ?? []).some((l) => l.role === 'lead')));
      const told = sung.filter((sc) => sc.parts.some((p) => ['object', 'ticket'].includes(p.kind)));
      return sung.length && told.length < Math.ceil(sung.length / 2) ? [`有歌詞的 ${sung.length} 段裡只有 ${told.length} 段有故事物件（object 或 ticket）：故事要用畫面上的東西說，至少一半的段落要有歌詞講到的東西`] : [];
    })(),
    // the opening says what is playing
    ...(cues.length && cues[0].start - win.start >= 3 && !r.storyboard[0]?.parts.some((p) => p.kind === 'title') ? [`開頭（${win.start}–${cues[0].start.toFixed(1)} 秒）沒有歌詞，第一段要放 title 元件：歌名和團名要清楚`] : []),
    ...(lang.bright ? (() => {
      const dark = r.storyboard.filter((sc) => sc.parts.some((p) => p.kind === 'stage' && ['spot', 'sweep', 'backlight'].includes(String(toParams(p.params)['look']))));
      return dark.length > 2 ? [`${lang.name}的歌輕快正向，預設用明亮的底（gingham、stripes、bokeh）：暗的舞台（spot、sweep、backlight）最多兩段，現在有 ${dark.length} 段（${dark.map((x) => x.id).join('、')}）`] : [];
    })() : []),
    // loud transitions are rationed: two in a row read as a showreel
    ...r.storyboard.slice(1).filter((sc, i) => LOUD_TRANSITIONS.has(sc.exit as TransitionKind) && LOUD_TRANSITIONS.has(r.storyboard[i].exit as TransitionKind)).map((sc) => `分鏡 ${sc.id} 和前一段連續用了強轉場（${r.storyboard[r.storyboard.indexOf(sc) - 1].exit}、${sc.exit}）：強轉場留給真正的段落變化`),
    // the chorus is the strongest moment: it has a drop or the finale
    ...((song.sections ?? []).filter((x) => x.type === 'chorus' && x.end > win.start + 2 && x.start < win.end - 2).length && !(r.moments ?? []).some((m) => (m.kind === 'drop' || m.kind === 'finale') && (song.sections ?? []).some((x) => x.type === 'chorus' && m.at >= x.start - 1 && m.at <= x.end)) ? ['副歌要有 drop 或 finale：副歌是整段最強的畫面'] : []),
    ...reused.map((x) => `分鏡 ${x.scene} 的版面骨架（${x.skeleton}）和〈${x.song}〉一樣：換一種構圖或元件組合，不是換顏色`),
    // a background element that became an earlier song's look (its waving penlights) makes this one read as that song
    ...(c.treatment.storyboard ?? []).flatMap((sc) => sceneMotifs(sc).flatMap((m) => history.filter((h) => h.motifs?.includes(m)).map((h) => `分鏡 ${sc.id} 的台下觀眾（${m.split(':').slice(1).join('、')}）和〈${h.song}〉一模一樣：要用觀眾就換一種拿法或動法（crowd、crowdMotion），讓它成為這首自己的設計`))),
  ];
  return { checked: c, errs };
}
/** The frame check (render.mts stills) on a design: its scene findings as errors to send back. */
function frameErrors(t: TreatmentV3, attempt: number): string[] {
  const dir = join(out, `frames_${attempt}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'treatment.json'), JSON.stringify(t, null, 1));
  try {
    execFileSync('npx', ['tsx', 'scripts/lyric-vj/render.mts', '--song', a.song!, '--treatment', join(dir, 'treatment.json'), '--start', String(win.start), '--end', String(win.end), '--keyframes', '--out', dir], { stdio: 'pipe', env: { ...process.env, VJ_UNCONFIRMED: '1' } });
  } catch (e) {
    return [`畫面檢查沒有跑完：${String((e as { stderr?: Buffer }).stderr ?? e).slice(-300)}`];
  }
  const check = JSON.parse(readFileSync(join(dir, 'check.json'), 'utf8')) as { scene?: string[] };
  return (check.scene ?? []).map((x) => `畫面檢查：${x}（改位置、大小、時間或換元件）`);
}

// --resume: the earlier conversation rebuilt from its saved replies, each answered with its errors as checked now
let first = 0;
if (a.resume) {
  // every saved reply in order, whatever number the earlier run started at (a resumed run starts after its own)
  const saved = readdirSync(a.resume).map((f) => /^storyboard_raw_(\d+)\.json$/.exec(f)?.[1]).filter((n): n is string => !!n).map(Number).sort((x, y) => x - y);
  if (!saved.length) throw new Error(`${a.resume} 裡沒有導演的回覆可以接續`);
  for (const k of saved) {
    first = k + 1;
    const raw = readFileSync(join(a.resume, `storyboard_raw_${k}.json`), 'utf8');
    const j = judge(JSON.parse(raw) as Reply);
    // the frame check's findings for this reply, as recorded (judge alone does not render): a clean static check is
    // not a clean reply
    const recorded = existsSync(join(a.resume, 'attempts.jsonl')) ? readFileSync(join(a.resume, 'attempts.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as { attempt: number; errors?: string[] }).filter((r) => r.attempt === k).flatMap((r) => r.errors ?? []).filter((e) => e.startsWith('畫面檢查')) : [];
    if (!j.errs.length) j.errs.push(...recorded);
    const last = k === saved[saved.length - 1];
    const note = last && a.note ? `\n\n看過影片的人的意見（請照著改）：${a.note}` : '';
    messages.push({ role: 'assistant', content: [{ type: 'text', text: raw }] }, { role: 'user', content: (j.errs.length ? `請修正後重新輸出：\n${j.errs.map((e) => `- ${e}`).join('\n')}` : '請重新輸出。') + note });
    console.log(`resume: reply ${k} → ${j.errs.length} errors`);
  }
}
for (let attempt = first; attempt < first + attempts; attempt++) {
  let text: string;
  let content: Anthropic.Beta.Messages.BetaContentBlockParam[] = [];
  if (replays.length) text = readFileSync(replays[attempt - first], 'utf8');
  else {
    // the budget is a cap, not an estimate: the reply may be at most what is left after the prompt (input counted
    // generously: about a token per character of Japanese and Chinese), and below a usable length the run stops
    const [pin, pout] = PRICES[a.model!] ?? [NaN, NaN];
    const spent = (usage.input * pin + usage.output * pout) / 1e6;
    const inEst = JSON.stringify([SYSTEM, messages]).length * 1.1;
    const room = Math.floor(((Number(a.budget) - spent - (inEst * pin) / 1e6) * 1e6) / pout);
    // a whole song is a long storyboard: room for it (still under the budget)
    const maxTokens = Math.min(Number(a['max-tokens']) || 16000, room);
    if (!(maxTokens >= Math.min(6000, Number(a['max-tokens']) || 16000))) {
      console.log(`預算上限 $${a.budget}：已花 $${spent.toFixed(3)}，剩下的不夠再問一次，停止`);
      appendFileSync(join(out, 'attempts.jsonl'), JSON.stringify({ pass: 'storyboard', attempt, stopped: 'budget', spentUSD: +spent.toFixed(3) }) + '\n');
      break;
    }
    const msg = await streamed({
      model: a.model!, max_tokens: maxTokens, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      system: SYSTEM, messages,
    } as never);
    usage.input += msg.usage.input_tokens;
    usage.output += msg.usage.output_tokens;
    appendFileSync(join(out, 'usage.jsonl'), JSON.stringify({ attempt, input: msg.usage.input_tokens, output: msg.usage.output_tokens, maxTokens, spentUSD: +(((usage.input * pin + usage.output * pout) / 1e6).toFixed(4)) }) + '\n');
    if (msg.stop_reason === 'refusal' || msg.stop_reason === 'max_tokens') throw new Error(`沒有產出分鏡（${msg.stop_reason}，已花 $${((usage.input * pin + usage.output * pout) / 1e6).toFixed(3)}）`);
    text = msg.content.find((b) => b.type === 'text')?.text ?? '';
    content = msg.content as never;
  }
  writeFileSync(join(out, `storyboard_raw_${attempt}.json`), text);
  reply = JSON.parse(text) as Reply;
  const j = judge(reply);
  checked = j.checked;
  const errs = j.errs;
  // what only the drawn frames show (type pushed out by the camera, parts landing on each other as they move): the
  // design that passes its checks is rendered once as stills and the frame check's findings go back the same way
  if (!errs.length) errs.push(...frameErrors(checked.treatment, attempt));
  // every attempt is kept as it came (the first is the result; a retry only answers checkable errors)
  appendFileSync(join(out, 'attempts.jsonl'), JSON.stringify({ pass: 'storyboard', attempt, replay: !!replays.length, errors: errs, warnings: checked.fixes.filter((x) => x.startsWith('注意')) }) + '\n');
  console.log(`storyboard attempt ${attempt}: ${errs.length} errors`);
  if (!errs.length) break;
  if (replays.length) continue;
  messages.push({ role: 'assistant', content }, { role: 'user', content: `請修正後重新輸出：\n${errs.map((e) => `- ${e}`).join('\n')}` });
}
if (!checked || !reply) throw new Error('沒有分鏡');
const fin = finishDesign(checked.treatment, { language, choruses: chorusSpans(analyzeStructure(song)), cues: song.cues, duration: song.duration, music: song.sections, start: win.start, title: song.title });
checked.fixes.push(...fin.fixes);
checked.errors.push(...fin.errors);
writeFileSync(join(out, 'treatment.json'), JSON.stringify(checked.treatment, null, 1));
const [pin, pout] = PRICES[a.model!] ?? [NaN, NaN];
const costUSD = replays.length ? 0 : +((usage.input * pin + usage.output * pout) / 1e6).toFixed(3);
writeFileSync(join(out, 'director.json'), JSON.stringify({ mode: 'storyboard', model: a.model, replay: !!replays.length, costUSD, concept: reply.concept, story: reply.story, ideas: reply.ideas, chosen: reply.chosen, why: reply.why, errors: checked.errors, fixes: checked.fixes }, null, 1));
if (!checked.errors.length && !replays.length) {
  // a song is recorded once its design is accepted (the frames and a person's look), not when it merely validates
  if (a['record']) {
    const all = (existsSync(historyPath) ? JSON.parse(readFileSync(historyPath, 'utf8')) : []).filter((h: { song: string }) => h.song !== song.title);
    all.push({ song: song.title, concept: reply.concept, parts: [...new Set(reply.storyboard.flatMap((s) => s.parts.map((p) => p.kind)))], skeletons: [...new Set((checked.treatment.storyboard ?? []).map(sceneSkeleton))], motifs: [...new Set((checked.treatment.storyboard ?? []).flatMap(sceneMotifs))] });
    writeFileSync(historyPath, JSON.stringify(all, null, 1));
  }
}
console.log(JSON.stringify({ costUSD, concept: reply.concept, errors: checked.errors, fixes: checked.fixes }, null, 1));
if (checked.errors.length) process.exit(1);
