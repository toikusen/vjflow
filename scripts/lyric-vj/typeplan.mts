// The whole song as kinetic type, planned in one director call: for every shot its lyric layout and a run of cuts on
// the beat, each naming one move of the renderer's kinetic layer (render/kinetic.ts), the song's words it is built from
// and which cut-out character stands in it — and for every lyric line its entrance, exit, hold motion and emphasis, the
// cut's camera, hit and transition, and the song's type finish. No drawing is generated and no code is written, so a
// song costs one call.
// npx tsx scripts/lyric-vj/typeplan.mts --song song.json --treatment treatment.json --sprites library --out <dir>
import Anthropic from '@anthropic-ai/sdk';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { NEEDS_ART, DOC_KINDS, GROUNDS, KINETIC_CAMS, KINETIC_FLASHES, KINETIC_FX, KINETIC_PRINTS, KineticLayer, THREAD_MARKS, ThreadMark } from '../../src/app/lyric-vj/render/kinetic';
import { TRANSITION_KINDS, transitionGuide } from '../../src/app/lyric-vj/render/transition';
import { LOOPS, QUIET_LOOPS } from '../../src/app/lyric-vj/render/kinetic-loops';
import { GLYPH_FINISHES } from '../../src/app/lyric-vj/design';
import { EMPHASIS_METHODS, ENTER_KINDS, EXIT_KINDS, IDLE_KINDS, REVISE_LOOKS } from '../../src/app/lyric-vj/treatment';
import { overCreator, useCap } from '../../src/app/lyric-vj/origin-rules';
import { TRANSITION_KINDS as ALL_TRANSITIONS } from '../../src/app/lyric-vj/render/transition';
import { capBy, capEach, capRound, DIAGRAM_FX, FLOWS, MORE, MOVE_SHARE, ROUND_FX } from '../../src/app/lyric-vj/render/kinetic-more';
import type { BoardLayer } from '../../src/app/lyric-vj/render/board';
import { Backdrop, capMotifs, COVER_FX, harvestBackdrops, legiblePair, motifOf, StoredLayer } from '../../src/app/lyric-vj/backdrops';
import { EMPH_HELP, ENTER_HELP, EXIT_HELP, FX_HELP, IDLE_HELP, SIDED, TEMPLATES } from './typehelp.mts';
import { TEMPLATES as TEMPLATE_SPECS } from '../../src/app/lyric-vj/templates';
import { feltTempo } from '../../src/app/lyric-vj/timeline';
import { unsungWindows } from '../../src/app/lyric-vj/structure';
import { cutTimes, holdGap, landedEnd, stripUnsungSprites, unsungRule } from './interludes.mts';
import { Assignment, bindSprites } from './bind-sprites.mts';
import { lessonsBlock, readLessons } from './lesson-rules.mts';

export { stripUnsungSprites };

const { values: a } = parseArgs({ options: {
  song: { type: 'string' }, treatment: { type: 'string' }, sprites: { type: 'string' }, out: { type: 'string' }, story: { type: 'string' },
  // ink, paper, accent, heart (the accent for the one the song loves)
  // unset: the song's own colours, from the director's colour script (its first ink, paper and accent)
  palette: { type: 'string' },
  model: { type: 'string', default: 'claude-opus-5-5' },
  // a demo of the whole kit: every move and kind used somewhere (off: a vocabulary picked for this song)
  showcase: { type: 'boolean', default: false },
  // what a part keeps on screen through its cuts (board.ts: a stage's lasting objects, an evidence board). Off: the
  // event sample passed 4 of 12 blind checks and sweet timer's run (2026-10-26) stacked boards over titles and sprites
  board: { type: 'boolean', default: false },
  // the user's choice: a small Traditional Chinese translation line under each sung line. The plan always carries the
  // translation, so turning it on later is a rebuild with --plan, not a new director call
  translate: { type: 'boolean', default: false },
  plan: { type: 'string' },
  // the accepted plan (the concept's noimg typeplan.json): kept as it is, one small call only places the sprites into its cuts
  bind: { type: 'string' },
  // the admin's rules from people's reports (beta lessons.json; lesson-rules.mts)
  lessons: { type: 'string' },
  // keep the language's own paper medium and grain (the style test: does the old look carry over to type-only?)
  'keep-medium': { type: 'boolean', default: false },
  // a treatment in the song's design language (its approved song): its section stacks become backdrops the planner
  // lays under passages of cuts (backdrops.ts)
  backdrops: { type: 'string' },
  // another version's typeplan.json whose visual direction (vision, parts, meets, previews, clip) this one follows:
  // the type-only and the props version of a song then share their parts and preview moments, to be compared
  vision: { type: 'string' },
} });
const env = join(homedir(), '.config/vjflow/anthropic.env');
for (const line of existsSync(env) ? readFileSync(env, 'utf8').split('\n') : []) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const out = a.out!;
mkdirSync(out, { recursive: true });
const song = JSON.parse(readFileSync(a.song!, 'utf8'));
const t = JSON.parse(readFileSync(a.treatment!, 'utf8'));
// the stretches nobody sings and the director's decision for each (no entry, or no interludes at all: backdrop)
const unsung = unsungWindows(song);
const script = (t.design?.colorScript ?? []) as { shadow?: string; highlight?: string; accent?: string }[];
/** The value seen most often across the colour script (its first entry is often a one-off title card). */
const most = (vals: (string | undefined)[]) => {
  const n = new Map<string, number>();
  for (const v of vals) if (v) n.set(v, (n.get(v) ?? 0) + 1);
  return [...n.entries()].sort((x, y) => y[1] - x[1]).map(([v]) => v);
};
const pair = most(script.map((c) => (c.shadow && c.highlight ? `${c.shadow},${c.highlight}` : undefined)))[0]?.split(',');
const accents = most(script.map((c) => c.accent));
const [ink, paper0, accent, heart] = a.palette
  ? a.palette.split(',')
  : [pair?.[0] ?? '#26489E', pair?.[1] ?? '#F5EFE4', accents[0] ?? '#FF6B2C', accents[1] ?? accents[0] ?? '#FF4F8B'];
// over a backdrop the twin inks are the type's only contrast: a pair too close takes the song's most legible colour.
// Seven to one, not 4.5: a mid grey-blue light ink (indigo's #8C93AE, 5.5 on navy) read on neither half of a mid sky
const [, paper] = a.backdrops
  ? legiblePair(ink, paper0, [...script.flatMap((c) => [c.shadow, c.highlight, c.accent]), ...(t.graphics?.sections ?? []).flatMap((x: { layers: { kind: string; color?: string }[] }) => x.layers.filter((l) => l.kind === 'paper' && l.color).map((l) => l.color!))].filter((c): c is string => !!c), 7)
  : [ink, paper0];
console.log(`palette: ink ${ink} paper ${paper} accent ${accent} heart ${heart}`);
// the songs planned before (newest last): moves most of them used are named, so this song reaches for them only when
// its lyric calls for them; a move reused still looks different here (knobs.ts)
const HISTORY = 'out/typeplan-history.json';
const history = (existsSync(HISTORY) ? JSON.parse(readFileSync(HISTORY, 'utf8')) : []) as { song: string; fx: Record<string, number>; motifs?: string[] }[];
const recent = history.filter((h) => h.song !== song.title).slice(-5);
// a stock picture (a disc, a city skyline) two of the recent songs stood on is kept to one backdrop here
const wornMotifs = new Set(['circle', 'city'].filter((m) => recent.filter((h) => h.motifs?.includes(m)).length >= 2));
const backdrops: Backdrop[] = (() => {
  if (!a.backdrops) return [];
  const b = JSON.parse(readFileSync(a.backdrops, 'utf8'));
  const bs = (b.design?.colorScript ?? []) as { shadow?: string; highlight?: string; accent?: string }[];
  const bp = most(bs.map((c) => (c.shadow && c.highlight ? `${c.shadow},${c.highlight}` : undefined)))[0]?.split(',') ?? [];
  // the song's own approved world (a code layer drawn for it, 世界のつづき's watercolor coast) is its backdrop, not
  // another song's picture: the new plan dropped it and lost what the user liked (2026-10-21)
  const own = new Set(a.backdrops === a.treatment ? ['code'] : []);
  return capMotifs(harvestBackdrops(b.graphics.sections, [bp[0], bp[1], most(bs.map((c) => c.accent))[0]].filter(Boolean), [ink, paper, accent], own), wornMotifs);
})();
if (backdrops.length) console.log(`backdrops: ${backdrops.map((x) => `${x.id} ${x.what}`).join(' | ')}`);
const sprites = a.sprites ? (JSON.parse(readFileSync(join(a.sprites, 'library.json'), 'utf8')).sprites as { id: string; what: string }[]) : [];
// what each prop is for in the song (props.mts plan: role and why), told to the planner beside the picture
const propRoles = (() => {
  const f = a.sprites ? join(a.sprites, '..', 'plan.json') : '';
  if (!f || !existsSync(f)) return new Map<string, string>();
  const items = (JSON.parse(readFileSync(f, 'utf8')).sheets ?? []).flatMap((x: { items: { id: string; role?: string; why?: string }[] }) => x.items);
  return new Map<string, string>(items.filter((x: { why?: string }) => x.why).map((x: { id: string; role?: string; why: string }) => [x.id, `${x.role ? `${x.role}：` : ''}${x.why}`]));
})();
const roleOf = (id: string) => propRoles.get(id) ?? propRoles.get(id.replace(/[._-][^._-]*$/, '')) ?? '';
const story = a.story && existsSync(a.story) ? (JSON.parse(readFileSync(a.story, 'utf8')).story as string) : '';
// the tempo the song is felt in (a ballad's doubled tempo cut it at twice its pace)
const felt = feltTempo(song);
if (felt.halved) console.log(`tempo: ${song.tempo.toFixed(1)} → ${felt.tempo.toFixed(1)} BPM（歌詞的密度像慢歌，偵測到的速度是兩倍）`);
song.tempo = felt.tempo;
const beats: number[] = felt.beats;
const cueText = (id: string) => song.cues.find((c: { id: string }) => c.id === id)?.text ?? '';
const sectionAt = (x: number) => (song.sections as { start: number; end: number; type: string; energy: number }[]).find((s) => x >= s.start && x < s.end);
const shots = (t.shots as { id: string; start: number; end: number }[]).map((s) => ({
  ...s,
  lines: t.cues.filter((c: { shot: string }) => c.shot === s.id).map((c: { cueId: string }) => ({ id: c.cueId, text: cueText(c.cueId) })) as { id: string; text: string }[],
  lyrics: t.cues.filter((c: { shot: string }) => c.shot === s.id).map((c: { cueId: string }) => cueText(c.cueId)).join(' / '),
  beats: beats.filter((b) => b >= s.start && b < s.end).length,
  part: sectionAt(s.start),
}));

// one face for the whole video (the user, 2026-10-02): a line switched to the contrast face read as a stray font
const METHODS = EMPHASIS_METHODS.filter((m) => m !== 'face');
// halftone made the props mush when small (チョロイン 2026-10-20): props print in two inks or line; halftone stays in backdrops
const PRINTS = KINETIC_PRINTS.filter((x) => x !== 'halftone');
// a title card needs an intro to sit in: a line sung at 0.2 s shared the frame with it
const firstSung = Math.min(...song.cues.map((c: { start: number }) => c.start));
const titleRoom = firstSung >= 4;
// every move's look in this song (vary): the same move in another song comes with its own counts, sizes and speeds
const songKey = [...String(song.title ?? '')].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7);
// a slow song is told by holding still (Keep Your Fire Burning: a ballad cut every 2.8 s read as restless)
const meanEnergy = (song.sections as { energy: number }[]).reduce((a, x) => a + x.energy, 0) / Math.max(1, song.sections.length);
const slow = song.tempo < 95 && meanEnergy < 0.45;
// 0 calm … 1 lively: Keep Your Fire Burning (0.39, 77 BPM) comes to about 0.1, チョロイン (0.64, 128 BPM) to 0.8
const mood = +Math.max(0, Math.min(1, ((meanEnergy - 0.35) / 0.35) * 0.6 + ((song.tempo - 70) / 80) * 0.4)).toFixed(2);
const worn = Object.entries(recent.reduce((m, h) => (Object.keys(h.fx).forEach((f) => (m[f] = (m[f] ?? 0) + 1)), m), {} as Record<string, number>))
  .filter(([, n]) => n >= 3)
  .sort((a, b) => b[1] - a[1]);
// moves that frame a picture show nothing without one: an empty arch window held an 8 s intro (Keep Your Fire Burning)
const DRAW_THREAD = false;
/** What a line must say for a sign beside it to belong there. */
const SIGN_WORDS: Record<string, RegExp> = {
  heart: /好き|愛|恋|心|胸|ハート|キス|ときめ|きゅん|love|heart|喜歡|愛/i,
  star: /星|スター|star|夢|輝|光|キラ/i,
  sparkle: /輝|光|キラ|煌|眩|shine|spark|閃/i,
  note: /歌|唄|音|メロディ|リズム|sing|song|music/i,
  flame: /火|炎|燃|灯|熱|fire|burn/i,
  drop: /涙|泣|雨|水|雫|tear|rain|淚/i,
  bolt: /雷|稲妻|衝|電|ビリ|shock|thunder/i,
  flower: /花|咲|桜|bloom|flower/i,
  // a mark the line already prints is said twice (信じられる？ with a ? sticker beside it, 世界のつづき 2026-10-21):
  // a question mark only by a question asked without one, never a shout mark
  question: /^(?!.*[？?]).*(なぜ|どうして|誰|why)/i,
  exclaim: /(?!)/,
  swirl: /迷|回|巡|渦|ぐるぐる|くらくら|spin/i,
};
// moves that point at a line (speed lines, a shout bubble, a stamp): over a cut no one sings they point at nothing
const EMPHATIC = new Set(['rays', 'bubble', 'stamp']);
// a page full of words (a wall, a code rain, a marquee, small type under a lens, a corridor or tunnel of words) is the
// picture of a fast, wordy song: under a sparse one (三年後的大雪, 2.5 characters a second) it read as noise over its
// feeling (2026-10-21)
const DENSE = new Set(['wall', 'ascii', 'marquee', 'lens', 'corridor', 'tunnel']);
const sungSec = song.cues.reduce((a: number, c: { start: number; end: number }) => a + Math.max(0, c.end - c.start), 0);
const perSec = song.cues.reduce((a: number, c: { text: string }) => a + [...c.text.replace(/\s/g, '')].length, 0) / Math.max(1, sungSec);
const wordy = perSec >= 4;
// a sparse, slow song (世界のつづき 1.6, 三年後的大雪 2.5 characters a second) is felt, not shouted: a burst of speed lines,
// a spinning star or star streaks in its chorus read as out of place, and a backdrop switching every few seconds as
// restless (2026-10-21): the loud moves are left out and each part of the song keeps one backdrop and move
const calm = perSec < 3;
// a calm song the director reads as mood: its type plain (no print finish, no offset ghost), set by the plan's vision
let quietType = false;
const LOUD = new Set(['splash', 'countdown', 'rays', 'totem', 'warp', 'meteor', 'fireworks', 'bolt', 'beams', 'stamp', 'glitch', 'kaleido', 'spiral', 'confetti', 'beatbg', 'invert', 'crack', 'tvoff']);
// the hidden-line ridges read as unnatural twice (我愛台妹 28 s, 世界のつづき's opening, 2026-10-21): kept in the
// renderer, no longer offered
const RETIRED = new Set(['ridges']);
// the 2026-10-25 openers and story devices print their own word in the middle of the frame: shown in the gallery, not
// yet given a rule for where they may land in a song (sweet timer laid four card stacks under its lines), so a real
// song only gets the quiet loops of that set
const UNTRIED = new Set(Object.keys(LOOPS).filter((k) => !QUIET_LOOPS.includes(k)));
console.log(`lyric density: ${perSec.toFixed(1)} chars/s${wordy ? '' : ' (no page-of-words moves)'}${calm ? ' (calm: no loud moves, one backdrop a part)' : ''}`);
// moves whose parts are the cut's words (a hanging tag, a burst, keycaps, a loop's nodes, chat bubbles): with fewer
// words than parts they hang empty boxes (an orange tag on a thread in 三年後的大雪's intro) or say a word twice
const WORDED: Record<string, number> = { hang: 1, bubble: 1, tiles: 1, flap: 1, chat: 1, strike: 1, morse: 1, beforeafter: 1, measure: 1, loop: 3, layers: 3 };
// learned 2026-10-21 (kittenjam, Motion Prompt #121–144): named to the director so they are weighed, not missed
const NEW_FX = ['cube', 'drum', 'tape', 'corridor', 'confetti', 'warp', 'flow', 'synth', 'bokeh', 'ridges', 'shapes', 'lens', 'layers', 'panels', 'path', 'goo', 'morph', 'glide'];
const [NEW_ENTERS, NEW_EXITS, NEW_IDLES, NEW_EMPH] = [['shuffle', 'settle', 'flicker', 'squash', 'windup', 'karaoke'], ['domino', 'pixel', 'shatter'], ['boil', 'hop', 'thump'], ['echo', 'weight', 'shine', 'faces']];
const MOVES = KINETIC_FX.filter((x) => (sprites.length || !NEEDS_ART.has(x)) && (wordy || !DENSE.has(x)) && !(calm && LOUD.has(x)) && !RETIRED.has(x) && (a.showcase || !UNTRIED.has(x)));
// the visual direction is decided first, in a call of its own (the plan's schema with it compiled past the API's
// grammar limit, and the direction is what the cuts are then laid against)
const VISION_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['vision', 'parts', 'meets', 'previews', 'clip'],
  properties: {
    vision: { type: 'object', additionalProperties: false, required: ['kinds', 'change', 'why'], description: '這首歌適合什麼視覺表達（先決定這個，再排其他）', properties: {
      kinds: { type: 'array', items: { type: 'string' }, description: '填 narrative、mood、attitude、abstract 其中一到幾個：narrative 敘事（有事件、前後因果）；mood 情緒（沒有事件，空間、光、密度跟著情緒累積和釋放）；attitude 態度／派對（姿態、場景文化、視覺語彙和節奏）；abstract 抽象（形狀、材質、運動回應音樂）。可以混用' },
      change: { type: 'string', description: '整首的畫面怎麼走，一句話（例如「光從窗外一點一點侵入房間」「一條街從空蕩到整條一起跳」）；有的歌的力量是停留或反覆，就照實寫' },
      why: { type: 'string', description: '為什麼這首歌是這種表達（一句）' },
    } },
    parts: { type: 'array', description: '整首的段落安排，照順序、涵蓋所有鏡頭（不必每段都換世界）', items: { type: 'object', additionalProperties: false, required: ['from', 'shift', 'what', 'warmth', 'order', 'keep', ...(backdrops.length ? ['backdrops'] : [])], properties: {
      from: { type: 'string', description: '這段從哪個鏡頭 id 開始' },
      shift: { type: 'string', description: '填 change、hold、return 之一：'+ 'change 改變（往前走一步）；hold 延續前一段；return 回到先前的狀態' },
      what: { type: 'string', description: '這段改變或延續了什麼（一句，例如「天黑了，街上開始有人」「同一個房間，光更多了」）' },
      warmth: { type: 'number', description: '這段畫面的冷暖 0–1（0 全冷、0.5 中性、1 最暖）：渲染器照這個值加暖光，預覽會量畫面實際的冷暖對照，寫了暖畫面就必須是暖的' },
      order: { type: 'number', description: '這段留在畫面上的東西有多整齊 0–1（1 整齊歸檔、0 歪斜溢出散開）：段落裡會從前一段的值慢慢變到這個值' },
      keep: { type: 'object', additionalProperties: false, required: ['style', 'items'], description: '整段一直留在畫面上的東西（換刀不換）；不需要就 style 空字串', properties: {
        style: { type: 'string', description: "填 evidence（證物卡：一張張釘上去、紅線串起來）、stage（這個地方一直在的一兩樣東西，例如整段都在的那座橋）或空字串" },
        items: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['sprite', 'word'], properties: { sprite: { type: 'string', description: sprites.length ? '道具圖 id' : '空字串（這首沒有道具圖）' }, word: { type: 'string', description: '同一個東西在沒有圖的版本印成卡片上的字：這首歌詞裡的短詞' } } }, description: '依出現順序；stage 最多 2 個、evidence 最多 8 個' },
      } },
      ...(backdrops.length ? { backdrops: { type: 'array', items: { type: 'string' }, description: '這段的世界用哪幾組構圖的 id（1–3 組，同一個世界的不同角度、區域；換段才換世界）' } } : {}),
    } } },
    meets: { type: 'array', description: '歌詞和畫面精準相遇的重點句：需要時才挑，可以是零句（抽象、氣氛的歌常常不需要）', items: { type: 'object', additionalProperties: false, required: ['cue', 'why'], properties: { cue: { type: 'string' }, why: { type: 'string', description: '為什麼這句要畫面直接對上它（一句）' } } } },
    previews: { type: 'array', description: '剛好六個：最能看出整首視覺變化的六個時點（鏡頭 id，照時間順序），先看這六張再決定要不要做整首', items: { type: 'object', additionalProperties: false, required: ['shot', 'note'], properties: { shot: { type: 'string' }, note: { type: 'string', description: '這張要看出什麼（一句）' } } } },
    clip: { type: 'object', additionalProperties: false, required: ['from', 'to', 'why'], description: '一段 15–25 秒、最能測試節奏、快切和轉場的片段（起訖鏡頭 id）', properties: { from: { type: 'string' }, to: { type: 'string' }, why: { type: 'string' } } },
  },
};
const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['backbone', 'thread', 'document', 'print', 'format', 'devices', 'flowRule', 'styles', 'shots', 'finish', 'fresh'],
  properties: {
    fresh: { type: 'array', description: '這首歌用到的新加入手法（沒用就空陣列）：每一個用在哪裡、為什麼適合', items: { type: 'object', additionalProperties: false, required: ['technique', 'cue', 'why'], properties: {
      technique: { type: 'string', description: '例如 fx:panels、enter:karaoke、exit:shatter' }, cue: { type: 'string', description: '用在的那句歌詞 id（背景招式寫它底下唱的那句）' }, why: { type: 'string', description: '那句歌詞的哪個意思讓它適合（一句）' },
    } } },
    backbone: { type: 'string', description: '整首的骨幹：這首歌自己給的結構（重複句、問答、時間推進、對比、藏頭字……）怎麼變成章節，一兩句話' },
    thread: { type: 'object', additionalProperties: false, required: ['what', 'why'], description: '重複出現、狀態一直變的東西（選填：沒有就 what 填空字串）', properties: {
      what: { type: 'string', description: '它是什麼、每次出現狀態怎麼變（可以是同一個人、同一個地方、一段動作、光慢慢侵入空間）；這首沒有就空字串' },
      why: { type: 'string', description: '為什麼是它（一句）' },
    } },
    document: { type: 'boolean', description: '整首用文件感：角落標章節名和第幾句（像設計圖、報告、大字報）；適合有主張、有條理、在說明或宣言的歌' },
    format: { type: 'object', additionalProperties: false, required: ['pace', 'ground', 'why'], description: '整支的版型', properties: {
      pace: { type: 'string', enum: ['quick', 'held', 'mixed'], description: 'quick 每 0.5–1 秒踩拍換一刀（派對、電子、快歌）；held 一個畫面停很久，字和背景慢慢動（抒情、敘事、慢歌）；mixed 主歌慢、副歌快' },
      ground: { type: 'string', enum: [...GROUNDS], description: '背景紙：flat 純色平塗（普普、俐落）；grain 有纖維和細點的印刷紙（報紙、復古、手作、懷舊）；gradient 往下漸深（黃昏、夜晚、空氣感）' },
      why: { type: 'string', description: '為什麼這首歌用這個節奏和紙（一句）' },
    } },
    devices: { type: 'object', additionalProperties: false, required: ['revise', 'document', 'why'], description: '有好幾種長相的手法，這首歌各用哪一種（整首固定）', properties: {
      revise: { type: 'string', enum: REVISE_LOOKS, description: '強調 revise 怎麼劃掉錯的詞：caret 劃線加校對插入符號（校稿、文件）；tape 修正帶抹白（學生、日常、改寫心意）；scribble 用筆亂塗掉（衝動、生氣、慌亂）；stamp 蓋上 VOID 作廢章（宣告、拒絕、規則）' },
      document: { type: 'string', enum: DOC_KINDS, description: 'document 開的時候是哪種文件：blueprint 設計圖（建造、計畫）；slate 電影場記板（電影、拍攝、戲劇）；casefile 機密檔案（諜報、推理、秘密）；notebook 筆記本（日記、學生、回憶）；ticket 票券（旅行、出發、約會）' },
      why: { type: 'string', description: '為什麼這首歌用這兩種（一句）' },
    } },
    flowRule: { type: 'string', description: '這首歌的畫面方向邏輯：什麼意思往哪個方向跑、為什麼（例如「時間往前用 ltr；回想的段落倒帶用 rtl；橋段下沉用 ttb」）。沒有特別理由就寫「全部用原本方向」' },
    styles: { type: 'array', description: '有風格可選的招式，這首歌用哪一種風格（整首固定，同一招不會一下這樣一下那樣）；只列這首會用到的', items: { type: 'object', additionalProperties: false, required: ['fx', 'style', 'why'], properties: { fx: { type: 'string', enum: Object.entries(MORE).filter(([, m]) => m.styles).map(([id]) => id) }, style: { type: 'integer', enum: [0, 1, 2, 3] }, why: { type: 'string', description: '為什麼這首歌用這個風格（一句）' } } } },
    print: { type: 'string', enum: [...PRINTS], description: '人物的印法：duo 雙色印刷、line 線稿一筆筆畫出來（回憶、日記、設計感）' },
    shots: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['shot', 'chapter', 'level', 'lyric', 'cuts', ...(backdrops.length ? ['backdrop'] : [])], properties: {
    shot: { type: 'string' },
    level: { type: 'number', description: '主線在這個鏡頭的狀態 0–1（0 幾乎看不見、0.3 小小的、0.6 明顯、1 最大最亮）：跟著故事走，不是跟著音量；前奏或還沒出現的地方可以 0' },
    ...(backdrops.length ? { backdrop: { type: 'string', enum: ['', ...backdrops.map((x) => x.id)], description: '鋪在這個鏡頭底下的段落構圖；空字串＝每一刀用自己的紙' } } : {}),
    chapter: { type: 'string', description: '分章時這個鏡頭屬於哪一章的短標籤（例如「FIG.02 — 夕暮れ」，同章同名）；這首不分章就空字串' },
    lyric: { type: 'object', additionalProperties: false, required: ['template', 'side'], properties: { template: { type: 'string', enum: Object.keys(TEMPLATES) }, side: { type: 'string', enum: ['left', 'right', 'center'] } } },
    lines: { type: 'array', description: '這個鏡頭的每一句歌詞', items: { type: 'object', additionalProperties: false, required: ['cue', 'enter', 'exit', 'idle', 'trail', 'emphasis', 'method', 'symbol', 'emphasis2', 'method2', 'zh'], properties: {
      cue: { type: 'string' }, enter: { type: 'string', enum: ENTER_KINDS }, exit: { type: 'string', enum: EXIT_KINDS }, idle: { type: 'string', enum: IDLE_KINDS }, trail: { type: 'boolean', description: '移動時拖殘影（配 dash、zoom、drop、gather 這類快速移動的進退場）' },
      emphasis: { type: 'string', description: '要強調的詞（這句歌詞裡原樣出現的一段），不強調就空字串' }, method: { type: 'string', enum: METHODS },
      emphasis2: { type: 'string', description: '第二個強調的詞（例如「不是X而是Y」的 Y），沒有就空字串' }, method2: { type: 'string', enum: METHODS },
      zh: { type: 'string', description: '這句的台灣繁體中文翻譯（自然、短，像字幕）' },
      symbol: { type: 'string', enum: ['heart', 'star', 'sparkle', 'note', 'flame', 'drop', 'bolt', 'exclaim', 'question', 'swirl', 'flower'], description: 'method 是 symbol 時旁邊放的符號' },
    } } },
    cuts: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['beat', 'fx', 'flow', 'label', 'words', 'sprite', 'size', 'heart', 'dark', 'cam', 'flash', 'transition'], properties: {
      beat: { type: 'integer', description: '從這個鏡頭的第幾拍開始（0 起算）' },
      fx: { type: 'string', enum: [...MOVES] },
      flow: { type: 'string', enum: ['', ...FLOWS], description: '這一刀的招式往哪跑（只對有方向的招式有用）：空字串＝招式原本的方向；要改就照 flowRule 寫的邏輯' },
      label: { type: 'string', description: '只給 measure 和 counter：量尺上標的、或計數器跑到的數字和單位，從這句歌詞想（例如「背伸び」→「+3 cm」、國中制服→「158 cm」、「積み上げた日々」→「1000 days」、歌詞裡的數字直接用）；同一首不要重複；其他招式空字串' },
      words: { type: 'array', items: { type: 'string' }, description: '這一刀背景用的詞（這首歌詞裡的詞 0–6 個）；大多數刀留空，沒人唱的刀一定留空' },
      sprite: { type: 'string', enum: ['', ...sprites.map((x) => x.id)], description: '站在這一刀裡的人物，空字串就是只有字和圖形' },
      size: { type: 'number', description: '人物高度佔畫面比例：0.5 遠、0.9 全身、1.6 特寫（從頭裁切）' },
      heart: { type: 'boolean', description: '強調色換成第二個強調色：只用在這首歌情緒最高或最心動的那幾刀' },
      dark: { type: 'boolean', description: '紙和墨對調成深色的一刀：用來分章（例如前奏尾奏、夜晚、內心）' },
      cam: { type: 'string', enum: ['', ...KINETIC_CAMS], description: '背景的鏡頭動作：snap 急推、roll 翻滾回正、flip 天地倒置、shake 震動、tilt 慢慢傾斜；pan 慢慢橫移、dolly 慢慢推近、crane 搖臂上升、orbit 繞著轉、vertigo 推軌變焦（人物大小不變、背後的世界衝過來：驚覺、暈眩、心一沉）、rack 焦點轉移（背景從模糊對焦：回過神、想起來）、ramp 變速（先衝快再放慢：衝擊後的餘韻）、freeze 定格（動作落定就停住：那一瞬間、時間停止）、tiltshift 移軸（上下模糊像微縮模型：小小的世界、旁觀）、pullback 從特寫拉遠（先看清一個小東西再看到全景：故事開頭、揭曉）；空字串不動' },
      flash: { type: 'string', enum: ['', ...KINETIC_FLASHES], description: '這一刀落下時閃兩格：black 黑幀、white 白幀、invert 反相；空字串不閃' },
      transition: { type: 'string', enum: ['', ...TRANSITION_KINDS], description: '從上一刀換到這一刀的轉場（形狀擦除、液體、碎裂等），空字串直接硬切' },
    } } },
  } } }, finish: { type: 'string', enum: ['', ...GLYPH_FINISHES], description: '整首歌詞字的印刷質感：dots 點陣、extrude 立體擠出、chalk 粉筆、distress 做舊、stripes 斜線、gradient 漸層；空字串素面' } },
};
type Line = { cue: string; enter: string; exit: string; idle: string; trail: boolean; emphasis: string; method: string; symbol: string; emphasis2: string; method2: string; zh: string };
type Cut = { beat: number; fx: string; flow?: string; label?: string; words: string[]; sprite: string; size: number; heart: boolean; dark: boolean; cam: string; flash: string; transition: string };
type Plan = { vision?: { kinds: string[]; change: string; why: string }; parts?: { from: string; shift: string; what: string; warmth?: number; order?: number; keep?: { style: string; items: { sprite: string; word: string }[] }; backdrops?: string[] }[]; meets?: { cue: string; why: string }[]; previews?: { shot: string; note: string }[]; clip?: { from: string; to: string; why: string }; fresh?: { technique: string; cue: string; why: string }[]; backbone: string; thread?: { what: string; mark?: string; sprite?: string; why: string }; document: boolean; print: string; format?: { pace: string; ground: string; why: string }; devices?: { revise: string; document: string; why: string }; flowRule?: string; styles?: { fx: string; style: number; why: string }[]; finish: string; shots: { shot: string; chapter: string; level?: number; backdrop?: string; lyric: { template: string; side: string }; lines: Line[]; cuts: Cut[] }[] };

/** The capped techniques, for the prompt: id and how often a song may use it. */
function rareList() {
  const ids = [...KINETIC_FX.map((x) => `fx:${x}`), ...ALL_TRANSITIONS.map((x) => `tr:${x}`), ...ENTER_KINDS.map((x) => `enter:${x}`), ...EXIT_KINDS.map((x) => `exit:${x}`), ...EMPHASIS_METHODS.map((x) => `emph:${x}`)];
  return ids.filter((id) => useCap(id) < Infinity).map((id) => `${id.split(':')[1]}（${useCap(id)} 次）`).join('、');
}
const prompt = `你是這首歌的歌詞 MV 導演。這支 MV 是「動態文字＋圖形背景」：故事和節奏由字、版面和背景說，不畫場景。
渲染器有這些招式（fx），每一刀用一招：
${MOVES.map((x) => `- ${x}：${FX_HELP[x]}`).join('\n')}
人物（去背圖，會被印成這首歌的三色，當貼紙站在圖形上；每一刀固定不動，換刀才換位置）：
${sprites.map((x) => `- ${x.id}：${x.what}${roleOf(x.id) ? `（${roleOf(x.id)}）` : ''}`).join('\n') || '（這首沒有人物圖：整支只用字、圖形和節奏說故事，sprite 一律空字串；需要「人」的地方用字的排法、圖表、符號暗示）'}

視覺方向（先決定整首怎麼表達，再排刀）：
- 先讀懂整首：它在說什麼、情緒怎麼走、有沒有自己的結構（重複句、問與答、時間推進、對比、藏頭字……）。把判斷寫進 backbone。
- 再決定這首適合什麼視覺表達（vision）：敘事、情緒、態度／派對、抽象，可以混用。故事是選項，不是必填：有的歌在表達態度、營造氣氛或讓人跟著節奏動，硬塞一段旅程反而奇怪。可以沒有主線，但不能只剩逐句配圖：整首要有一套成立的視覺方向，畫面之間要有關係。
- 段落安排（parts）：每段寫它改變或延續了什麼。可以往前走（change），也可以停留（hold）、反覆或回到先前的狀態（return）；有些歌的力量就是停留。如果把段落順序打亂畫面仍然成立，那通常只是素材集合，要重想。
- 同一段裡畫面的世界一致：可以換角度、景別、區域，也可以跟著音樂刻意跳切，但不要沒有理由換成不相干的畫面；快切很多也不能每切一次就重置世界。
- 重複出現的東西（thread，選填）：同一個人、同一個地方、一段動作、光慢慢侵入空間都可以；它再出現時觀眾認得，而且狀態已經不同。不要為了有而硬加。沒有就 what 空字串、level 全部 0。有的話每個鏡頭的 level 寫它當時的狀態；它不會另外畫在畫面上，而是讓構圖、招式、字${sprites.length ? '和道具' : ''}跟著它變。
- 歌詞只在關鍵處和畫面相遇（meets）：大部分時間畫面承接整段的情緒和世界；只有少數重點句才精準對上那句歌詞${sprites.length ? '（道具照那句歌詞出現，只在這些句子）' : ''}。不需要就零句。
${sprites.length ? '- 道具是這首歌的世界裡的東西：照段落的世界和變化出現，不是唱到什麼就出什麼。\n' : ''}- 每段的冷暖（warmth）和秩序（order）是渲染器真的會照著做的值，預覽會量畫面對照：寫了「暖色最飽滿」，那段的 warmth 就要高，backdrops 也要選暖的；寫了「整齊到失控」，order 就從 1 慢慢降到 0。不要用描述替畫面補完。
- 整段一直留在畫面上的東西（keep）：stage 是這個地方一直在的一兩樣東西（整段都在，不是一刀一張貼紙）；evidence 是證物卡，隨著段落一張張釘上、紅線串起來，秩序低的時候歪斜、溢出、散開。不需要就空。道具的長相要符合這段的情緒（失落、思念的段落不要可愛、童趣的造型）。
- 最後挑六個最能看出整首視覺變化的時點（previews），和一段 15–25 秒最能測節奏、快切和轉場的片段（clip）：正式做整首之前會先看這些。
- 下面是一箱可以用的手法，不是每首都要用，也不用全部用；只用適合這首歌的，不適合的寧可不用：
  · 章名卡：歌本身有清楚的章節時，chapter 填章名（同章同名，會印在文件感的角落）；沒有的話 chapter 全部填空字串（段落安排 parts 還是要寫）。
  · 文件感（document）：有主張、在說明或宣言、像報告或設計圖的歌才開；抒情、戀愛、日常小品通常不開。
  · 校對改寫（revise）：歌詞真的有「不是X而是Y」「〜じゃなくて〜」或改口才用，沒有就不要硬做。
  · 畫出意思的圖表（clock、gears、beforeafter、loop、measure、ecg、blueprint、tiles）：那句歌詞真的在講時間、分擔、改變、重複、差距、心跳、計畫、呼喊才用。
  · 呼應：副歌回到同一組招式、尾奏呼應前奏，大多數歌都適合。
- 節制：一刀只說一件事。關鍵句讓字停住（2–4 拍才換刀），只有背景在動。
- 背景上的字是質感，不是第二組歌詞：觀眾會把畫面上看得清楚的大字當成歌詞。所以背景的 words 少用（一半以上的刀不用詞，留空陣列，交給圖形和人物），要用就用能當圖案的方式（重複成牆、繞圈、很淡）；${unsungRule(unsung, t.interludes)}
- 轉場也要有意思（說明裡寫了適合的情境），段落交界才用大轉場，其他地方多用硬切或 push、whip 這類俐落的：${transitionGuide()}

規則：
- 每個鏡頭給一串刀（cuts），用拍點計，快慢照 format.pace：quick 副歌與高能量段大約每 1–2 拍換一刀、主歌 2–4 拍；held 每刀至少 4 拍、關鍵句 8 拍以上，靠字和背景本身的動態撐；mixed 主歌照 held、副歌照 quick。前奏、間奏、安靜段 4–8 拍。第一刀從第 0 拍開始。
- 版型（format）和手法的長相（devices）也是替這首歌設計的：不要每首都是「三色平塗＋一個角色＋快速換刀」，依曲風和歌詞的世界決定節奏和紙。
- 少見的手法（535 支歌詞 MV 裡只有一到四支用過，用多了就像在模仿那幾支）：${rareList()}。只在題材真的合適時用，一首最多一兩次。
- 招式跟著歌詞的意思選（說明裡括號是適合的情境，例如時間流逝用 tunnel 或 flap、腦中很亂用 wall 或 glitch、心跳用 bars 或 pulse、決心用 rays 或 stamp），同一招不要連續兩刀用。
${a.showcase ? '- 這是展示用的版本：整首要用到大部分的招式，同一招整首不超過 8 刀（副歌的記憶點除外）。' : `- 先依這首歌的曲風、速度和歌詞的世界，替整首挑一組自己的招式（大約 12–18 招），只用這組；不合這首歌氣氛的招式寧可不用（例如抒情歌不用 glitch、tvoff、hud，搞笑歌不用 talisman）。
- 每一段（主歌、副歌、橋段）只用 2–4 招，有一招是主角、其他是配角；段與段之間換組合，讓觀眾感覺到段落變了。副歌每次回到同一組。`}
- 人物和道具跟著段落的世界出現（重點句 meets 才照那句歌詞放）；不是每一刀都要有（純字與圖形的刀讓節奏有呼吸）。同一個人可以用遠、全身、特寫交替。
- 主歌詞由 lyric 的排法負責，side 放哪一側，人物會自動站在另一側。有人物的鏡頭不要放 center。排法：
${Object.entries(TEMPLATES).map(([k, v]) => `  ${k}：${v}`).join('\n')}
  （punch、scatter、beat-cut、array、orbit、ribbon、tunnel 佔滿畫面中央：用在副歌或關鍵句，那個鏡頭的人物放小或不放）
- 每一句歌詞（lines）自己決定進場、退場、停留動作和強調，跟著歌詞的意思和情緒選${a.showcase ? '，整首要用到大部分的種類，同一種不要連續三句' : '。整首挑 4–7 種進場、3–5 種退場當這首歌的字的個性，同一段的句子大多用同一組（重點句才換），強調只用在真正的關鍵詞（大約三分之一的句子）'}：
  進場：${Object.entries(ENTER_HELP).map(([k, v]) => `${k} ${v}`).join('、')}
  退場：${Object.entries(EXIT_HELP).map(([k, v]) => `${k} ${v}`).join('、')}
  停留：${Object.entries(IDLE_HELP).map(([k, v]) => `${k} ${v}`).join('、')}
  拖殘影（trail）：只配快速移動的進退場，${a.showcase ? '大約十分之一的句子' : '整首最多幾句'}。
  強調：${Object.entries(EMPH_HELP).filter(([k]) => METHODS.includes(k as never)).map(([k, v]) => `${k} ${v}`).join('、')}
- 每一刀可以加鏡頭動作（cam；後面幾種慢的電影鏡頭適合停久的刀，快切的刀用 snap、shake 這類一下就完的）、落下時的閃（flash）和轉場（transition）：大約三分之一的刀加 cam，flash 只用在段落交界或重拍，transition 用在換句或換段的那一刀；不要每一刀都加。
- 整首選一種歌詞字的質感（finish），跟這首歌的氣氛搭（背景是三色平面印刷感）。
- words 只用這首歌的歌詞裡的詞，不要自己造句；背景的大字不要用正在唱的那一句裡的詞（會跟主歌詞疊在一起變成疊影），用前後句或這首歌的關鍵詞。
- 大圓形的招式（${[...ROUND_FX].join('、')}）整首加起來不超過一成多的刀：同一種形狀反覆出現，整首會看起來都是圓圈。
- 清單裡有一批新加入的手法（背景 ${NEW_FX.filter((x) => MOVES.includes(x)).join('、')}；進場 ${NEW_ENTERS.join('、')}；退場 ${NEW_EXITS.join('、')}；停留 ${NEW_IDLES.join('、')}；強調 ${NEW_EMPH.join('、')}；轉場 pixelate、blinds、petals；鏡頭 pan、dolly、crane、orbit、vertigo、rack、ramp、freeze、tiltshift、pullback）。它們跟舊的一樣是選項：歌詞或故事剛好在講那件事（倒下、碎掉、一起唱、越來越大聲、好幾個地方同時發生……）就用，沒有就不要為了用而用；用了的話在 fresh 裡寫出用在哪句、為什麼。
- 副歌回到相同的招式組合當記憶點，但人物或詞要跟著歌詞變。
- 方向（flow）和風格（styles）是設計，不是隨機變化：先在 flowRule 寫下這首歌的方向邏輯，再照著用。
  · 方向帶意思：ltr 往前、時間前進、出發（橫書的閱讀方向）；rtl 倒帶、回想、逆行、抵抗、回頭（也是日文直書換行的方向，直排歌詞的歌用起來很自然）；ttb 落下、下沉、雨雪、失落、從天而降；btt 上升、成長、浮起、希望、升空。
  · 跟畫面連貫：同一段裡方向一致；人物面向或移動的方向、歌詞排法（直排）也要一起考慮。只有歌詞的意思轉了（回憶開始、墜落、起飛）才換方向。
  · 大多數歌整首用一兩個方向就夠；沒有理由就不要改，flow 留空。
  · 風格：每個有風格的招式整首只選一種（styles），跟歌的氣氛和那句的意思搭（例如心跳的歌用急促心跳、失戀的結尾用變成直線）；選不出理由就用 0。
${backdrops.length ? `段落構圖（這首歌的設計語言認可過的畫面骨架：紙、大形狀、色帶、網點、框；backdrop 選一組鋪在鏡頭底下）：
${backdrops.map((x) => `- ${x.id}：${x.what}`).join('\n')}
- 構圖是一段的世界，不是一刀的效果：每個鏡頭的 backdrop 從它所在段落（parts）的 backdrops 裡選；換段才換世界；副歌每次回到同一組。大部分有歌的鏡頭都鋪；前奏、間奏或要特別安靜的鏡頭可以留空字串。
- 鋪了構圖的鏡頭裡，每一刀只畫字和小圖形，疊在構圖上：不要用會蓋滿畫面的招式（${[...COVER_FX].join('、')}，用了那一刀會蓋掉構圖）；背景 words 更要少用。
- 主歌詞要跟構圖搭：色帶、色塊、框裡的空白可以放字（框住中央的框就把字放中間）；大圓、密集的網點和斜紋那一側不要放字，side 選另一側；圖表類招式也放在構圖空的地方。
` : ''}${worn.length ? `最近 ${recent.length} 首歌常用的招式（幾首用過）：${worn.map(([f, n]) => `${f}（${n}）`).join('、')}。這些不是不能用：歌詞真的在講那件事就用（同一招在這首歌會自動換成不同的數量、大小、速度）；但不要因為順手就拿它們，先想想有沒有更貼這首歌的招式。同一招整首最多佔一成的刀。\n` : ''}${t.concept ? `美術指導替這首歌定的概念（畫面的世界觀和故事，照著它走）：${t.concept}\n` : ''}${story ? `整首的故事：${story}\n` : ''}歌名：${song.title}
這首歌的速度 ${song.tempo.toFixed(0)} BPM，整首平均能量 ${meanEnergy.toFixed(2)}。${slow ? `這是慢歌、要讓情緒慢慢醞釀：format.pace 用 held（或主歌 held、只有最後的副歌稍快的 mixed）；一刀停久，靠字的進場、停留和背景構圖本身的慢動作撐住畫面；招式只選安靜的（微粒、星空、霧、緩慢的線和光），快閃、震動、爆炸、放射線、glitch、快速跑碼這類動感的招式整首不超過三刀，flash 和 cam 的 shake、snap 不用。\n` : ''}${titleRoom ? '' : `第一句在 ${firstSung.toFixed(1)} 秒就開始唱，沒有前奏可以放片頭：不要用 credits（團名和歌名不是一定要出現）。\n`}鏡頭（id、時間、拍數、段落類型與能量；底下是這個鏡頭的每一句歌詞 id 和內容）：
${shots.map((s) => `${s.id} ${s.start.toFixed(1)}–${s.end.toFixed(1)}s ${s.beats} 拍 ${s.part?.type ?? ''} ${(s.part?.energy ?? 0).toFixed(2)}${s.lines.length ? s.lines.map((l) => `\n  ${l.id} ${l.text}`).join('') : ' （沒有歌詞）'}`).join('\n')}

每個鏡頭都要輸出（照上面的順序，一個都不能少）。${lessonsBlock(readLessons(a.lessons), 'typeplan')}`;

// one structured call (the client is made per call: a rebuild without a key never needs one)
const call = (content: string, schema: object, max: number) => new Anthropic({ maxRetries: 8 }).messages.stream({ model: a.model!, max_tokens: max, messages: [{ role: 'user', content }], output_config: { effort: 'medium', format: { type: 'json_schema', schema } } } as Anthropic.Messages.MessageStreamParams).finalMessage();

// --bind: the accepted plan's cuts with the drawn props placed into them. The person accepted the concept's cuts, lyric
// layouts, backdrops and pace (sweet timer's img re-plan turned 99 accepted cuts into 137 others), so none of that is
// re-decided: the call sees the fixed cuts and the props and says only which cut takes which prop at what size.
const BIND_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['assignments'],
  properties: { assignments: { type: 'array', description: '只列要放道具的刀', items: { type: 'object', additionalProperties: false, required: ['shot', 'beat', 'sprite', 'size', 'why'], properties: {
    shot: { type: 'string', description: '鏡頭 id（照企劃）' }, beat: { type: 'integer', description: '那一刀的 beat（照企劃，不能新增刀）' },
    sprite: { type: 'string', enum: sprites.map((x) => x.id) }, size: { type: 'number', description: '高度佔畫面比例：0.5 遠、0.9 全身、1.6 特寫' }, why: { type: 'string', description: '一句：為什麼這個東西在這一刀' },
  } } } },
};
const bindPrompt = (p: Plan) => `你是這首歌的歌詞 MV 導演。企劃已經定稿、也經人確認：每個鏡頭的版型、每一刀的招式、背景詞、構圖和節奏都不能改，也不能加刀或減刀。現在只做一件事：把這首歌畫好的道具／人物（去背圖，印成這首歌的三色，當貼紙站在歌詞的另一側；一刀之內不動，換刀才換位置）放進合適的刀裡。
道具（id：是什麼（在這首歌裡的角色））：
${sprites.map((x) => `- ${x.id}：${x.what}${roleOf(x.id) ? `（${roleOf(x.id)}）` : ''}`).join('\n')}
${t.concept ? `美術指導替這首歌定的概念：${t.concept}\n` : ''}${p.vision ? `這首歌的視覺方向：${p.vision.change}（${p.vision.kinds.join('+')}）\n` : ''}${p.parts?.length ? `段落的世界：\n${p.parts.map((x) => `- 從 ${x.from}：${x.what}${x.keep?.items?.length ? `（這段常在的東西：${x.keep.items.map((i) => i.word || i.sprite).filter(Boolean).join('、')}）` : ''}`).join('\n')}\n` : ''}${p.meets?.length ? `重點句（只有這些句子照歌詞放道具）：${p.meets.map((m) => `${m.cue} ${m.why}`).join('；')}\n` : ''}
規則：
- 道具跟著段落的世界出現，不是唱到什麼就出什麼；只有重點句才精準對上那句歌詞。
- 不是每一刀都要有：純字與圖形的刀讓節奏有呼吸，大約三分之一到一半的刀有道具就夠；${unsungRule(unsung, t.interludes)}
- 同一個東西連著幾刀出現時用遠（0.5）、全身（0.9）、特寫（1.6）交替，同一個鏡頭裡最多兩種道具，不要刀刀換東西。
- 歌詞在中央（side 是 center）或招式佔滿畫面中央（版型 punch、scatter、beat-cut、array、orbit、ribbon、tunnel；招式 ${[...COVER_FX].join('、')}）的刀：道具放小（size ≤ 0.6）或不放。
- 圖表類招式（${[...DIAGRAM_FX].join('、')}）的刀不放道具：圖表站在道具的位置。
- 道具和歌詞分站兩側，歌詞長的刀 size 不要超過 1.0。
- 同一個段落裡同一個道具保持一致（程式會讓同一個東西不跨側跳）。

鏡頭與刀（照企劃；beat 從 0 起算）：
${p.shots.map((ps) => { const s = shots.find((x) => x.id === ps.shot); return `${ps.shot} ${s ? `${s.start.toFixed(1)}–${s.end.toFixed(1)}s ${s.part?.type ?? ''}` : ''} 版型 ${ps.lyric.template}/${ps.lyric.side}${ps.backdrop ? ` 構圖 ${ps.backdrop}` : ''}${s?.lines.length ? s.lines.map((l) => `\n  ${l.id} ${l.text}`).join('') : '\n  （沒有歌詞）'}${ps.cuts.map((c) => `\n  刀 beat ${c.beat} ${c.fx}${c.words.length ? `（背景詞 ${c.words.join('、')}）` : ''}`).join('')}`; }).join('\n')}

只輸出要放道具的刀（assignments）。`;

// --plan: rebuild the treatment from a plan already written (a renderer change, no new director call)
let usage = { input_tokens: 0, output_tokens: 0 };
let plan: Plan;
if (a.plan) plan = JSON.parse(readFileSync(a.plan, 'utf8')) as Plan;
else if (a.bind) {
  plan = JSON.parse(readFileSync(a.bind, 'utf8')) as Plan;
  if (sprites.length) {
    const msg = await call(bindPrompt(plan), BIND_SCHEMA, 16000);
    usage = { input_tokens: msg.usage.input_tokens, output_tokens: msg.usage.output_tokens };
    const bound = bindSprites(plan, (JSON.parse(msg.content.find((b) => b.type === 'text')?.text ?? '{"assignments":[]}') as { assignments: Assignment[] }).assignments, sprites);
    plan = bound.plan;
    console.log(`bind: ${bound.applied} cuts take a prop${bound.ignored.length ? `, dropped ${bound.ignored.join(' ')}` : ''}`);
  } else console.log('bind: no sprite library, the accepted plan stands as it is');
} else {
  const shared = a.vision ? (JSON.parse(readFileSync(a.vision, 'utf8')) as Plan) : undefined;
  const first = shared ? undefined : await call(`${prompt}\n\n這一步只決定整首的視覺方向（vision、parts、meets、previews、clip），刀和每一句之後再排。`, VISION_SCHEMA, 16000);
  const vision = (shared ? { vision: shared.vision, parts: shared.parts, meets: shared.meets, previews: shared.previews, clip: shared.clip } : JSON.parse(first!.content.find((b) => b.type === 'text')?.text ?? '{}')) as Pick<Plan, 'vision' | 'parts' | 'meets' | 'previews' | 'clip'>;
  console.log(`vision: ${vision.vision?.kinds?.join('+')}｜${vision.vision?.change}`);
  for (const x of vision.parts ?? []) console.log(`  part ${x.from} ${x.shift} ${x.what}${x.backdrops?.length ? ` [${x.backdrops.join(' ')}]` : ''}`);
  const msg = await call(`${prompt}\n\n已經定好的視覺方向（照著排刀，不要改）：\n${JSON.stringify(vision)}`, SCHEMA, 100000);
  usage = { input_tokens: (first?.usage.input_tokens ?? 0) + msg.usage.input_tokens, output_tokens: (first?.usage.output_tokens ?? 0) + msg.usage.output_tokens };
  plan = { ...(JSON.parse(msg.content.find((b) => b.type === 'text')?.text ?? '{"shots":[]}') as Plan), ...vision };
  // shots the plan left out or left without cuts: one more call asks for those alone (a skipped shot keeps the previous
  // backdrop running into it; it used to be a log line, then a hold for the admin — now it is filled before anyone sees it)
  const lacking = shots.filter((s) => !plan.shots.some((p) => p.shot === s.id && p.cuts?.length)).map((s) => s.id);
  if (lacking.length) {
    const again = await call(`${prompt}\n\n已經定好的視覺方向（照著排刀，不要改）：\n${JSON.stringify(vision)}\n\n上一版漏了這些鏡頭（沒有排、或沒有刀）：${lacking.join('、')}。只輸出這些鏡頭（shots 只含它們，每個都要有刀，照它們在歌裡的位置接上前後的段落），其他欄位照上一版填。`, SCHEMA, 32000);
    usage = { input_tokens: usage.input_tokens + again.usage.input_tokens, output_tokens: usage.output_tokens + again.usage.output_tokens };
    const fill = JSON.parse(again.content.find((b) => b.type === 'text')?.text ?? '{"shots":[]}') as Plan;
    const got = new Map(fill.shots.filter((p) => lacking.includes(p.shot) && p.cuts?.length).map((p) => [p.shot, p]));
    const order = new Map(shots.map((s, i) => [s.id, i]));
    plan.shots = [...plan.shots.filter((p) => !got.has(p.shot)), ...got.values()].sort((a, b) => (order.get(a.shot) ?? 1e9) - (order.get(b.shot) ?? 1e9));
    console.log(`plan: filled ${got.size}/${lacking.length} missing shots (${lacking.join(' ')})`);
  }
}
const usd = (usage.input_tokens * 4 + usage.output_tokens * 20) / 1e6;
if (!a.plan) writeFileSync(join(out, 'typeplan.json'), JSON.stringify({ ...plan, costUSD: +usd.toFixed(3), ...(a.bind ? { boundFrom: a.bind } : {}) }, null, 1));
// the history of moves and motifs is of plans made here; a bound plan's were recorded when it was made
if (!a.plan && !a.bind) {
  const fx: Record<string, number> = {};
  for (const c of plan.shots.flatMap((x) => x.cuts)) fx[c.fx] = (fx[c.fx] ?? 0) + 1;
  const motifs = [...new Set(plan.shots.flatMap((x) => backdrops.find((b) => b.id === x.backdrop)?.layers.map(motifOf) ?? []).filter(Boolean))];
  writeFileSync(HISTORY, JSON.stringify([...history.filter((h) => h.song !== song.title), { song: song.title, at: new Date().toISOString(), fx, motifs }], null, 1));
}

quietType = calm && !!plan.vision?.kinds?.includes('mood');
if (plan.flowRule) console.log(`flow: ${plan.flowRule}`);
for (const x of plan.styles ?? []) console.log(`style: ${x.fx} ${x.style} ${x.why}`);
settle(plan);
const { layers, missing, removed: unsungRemoved } = buildCuts(plan);
if (unsungRemoved) console.log(`interludes: removed ${unsungRemoved} pictures`);
const tr = structuredClone(t);
tr.graphics.sections = layers;
tr.graphics.story = [];
// flat print: no photo plates to grade, so the language's duotone and paper medium only greyed the inks
tr.design = { ...tr.design, ...(a['keep-medium'] ? {} : { medium: 'clean', grain: 0.1, paper: 0.2 }), colorScript: (tr.design.colorScript ?? []).map((c: object) => ({ ...c, duotone: 0, image: 1 })), ...(plan.finish && !quietType ? { finish: plan.finish } : {}), ...(quietType ? { quiet: true } : {}) };
// every line's own motion and emphasis (an emphasis word not found in the line is dropped)
const unknownCues: string[] = [];
const unknownShots: string[] = [];
for (const ps of plan.shots)
  for (const l of ps.lines ?? []) {
    const cue = tr.cues.find((c: { cueId: string }) => c.cueId === l.cue);
    if (!cue) { unknownCues.push(l.cue); continue; }
    Object.assign(cue, { enter: l.enter, exit: l.exit, idle: l.idle, trail: l.trail || undefined });
    const mark = (word: string, method: string) => {
      const at = word ? cueText(l.cue).indexOf(word) : -1;
      return at >= 0 ? [{ from: at, to: at + [...word].length, method, ...(method === 'symbol' ? { symbol: l.symbol || 'sparkle' } : {}) }] : [];
    };
    // tape, scribble and stamp hide the struck word: only with the word that replaces it (「不是X而是Y」's Y); a line
    // with no Y keeps its words readable under the strike (誰かの栄光 taped over read as a missing lyric)
    const noFace = (m: string) => (m === 'face' ? 'scale' : m);
    // a sign beside a word says what the line says (a heart by a line with no love in it read as off on a rousing
    // song): one that does not, the word is scaled instead
    const signFits = (sym: string) => (SIGN_WORDS[sym] ?? /./).test(cueText(l.cue));
    if (l.method === 'symbol' && !signFits(l.symbol)) l.method = 'scale';
    if (l.method2 === 'symbol' && !signFits(l.symbol)) l.method2 = 'scale';
    const marks = [...mark(l.emphasis, noFace(l.method)), ...(l.emphasis2 !== l.emphasis ? mark(l.emphasis2, noFace(l.method2)) : [])];
    const replaced = marks.length > 1;
    cue.emphasis = marks.map((e) => (e.method === 'revise' ? { ...e, look: replaced ? (plan.devices?.revise ?? 'caret') : 'caret' } : e));
  }
// the translation line under each sung line, timed with it
if (a.translate)
  tr.graphics.subtitles = plan.shots.flatMap((ps) => ps.lines ?? []).filter((l) => l.zh).flatMap((l) => {
    const c = song.cues.find((x: { id: string }) => x.id === l.cue);
    return c ? [{ start: c.start, end: c.end, text: l.zh }] : [];
  });
for (const p of plan.shots) {
  const shot = tr.shots.find((x: { id: string }) => x.id === p.shot);
  if (!shot) { unknownShots.push(p.shot); continue; }
  const side = p.lyric.side;
  shot.template = p.lyric.template;
  shot.params = p.lyric.template === 'vertical' ? { position: side, dim: 0, step: 0.6, lift: 60 } : p.lyric.template === 'stair' ? { side: side === 'center' ? 'right' : side, dim: 0 } : p.lyric.template === 'quiet' ? { position: side === 'right' ? 'auto' : side, dim: 0 } : SIDED.has(p.lyric.template) ? { position: side, dim: 0 } : { dim: 0 };
  // a side the template has no setting for (handwrite and typewriter go left, centre or auto): auto finds the empty side
  const pos = (TEMPLATE_SPECS[p.lyric.template]?.params as Record<string, { values?: string[] }> | undefined)?.['position'];
  if (pos?.values && shot.params.position && !pos.values.includes(shot.params.position)) shot.params.position = 'auto';
}
writeFileSync(join(out, 'treatment.json'), JSON.stringify(tr));
// what the plan left out or named wrongly (a shot with no cuts keeps the previous backdrop running into it): the
// delivery gate (beta/quality.mts) holds such a video for the admin instead of handing it over
writeFileSync(join(out, 'plan-check.json'), JSON.stringify({ missing, unknownShots: [...new Set(unknownShots)], unknownCues: [...new Set(unknownCues)] }, null, 1));
// no sprite library: a type-and-graphics-only video with no pictures at all
writeFileSync(join(out, 'assets.json'), a.sprites ? readFileSync(join(a.sprites, 'assets.json')) : '{}');
console.log(`typeplan: ${plan.shots.length}/${shots.length} shots, ${layers.length} cuts${missing.length ? `, missing ${missing.join(' ')}` : ''}, $${usd.toFixed(3)} (in ${usage.input_tokens}, out ${usage.output_tokens})`);

/** The warmth a part keeps from the warmest part before it: a third of how far that one went past neutral. */
export function residual(warmest: number) {
  return 0.5 + Math.max(0, warmest - 0.5) / 3;
}

/**
 * Warm light over a part, from its warmth (0 cold .. 1 warmest): none at or under 0.5, else a dusk glow rising from
 * the bottom, screened, as strong as the warmth is high.
 */
export function warmWash(warmth: number | undefined): StoredLayer[] {
  if (warmth === undefined || warmth <= 0.5) return [];
  const k = Math.min(1, (warmth - 0.5) / 0.5);
  return [{ kind: 'fill', color: '#F59A4E', to: '#F59A4E00', angle: 270, opacity: +(0.25 + 0.5 * k).toFixed(2), blend: 'screen' } as unknown as StoredLayer];
}

/**
 * The things a part keeps on screen (board.ts): its items landing one by one on the part's sung lines, spread evenly
 * when there are more items than lines; its order eased from the part before. Items without a picture in this
 * version are printed as their word.
 */
export function boardOf(p: Pick<Plan, 'parts'>, part: NonNullable<Plan['parts']>[number]): BoardLayer | undefined {
  const style = part.keep?.style;
  if (style !== 'evidence' && style !== 'stage') return undefined;
  const ids = new Set(sprites.map((x) => x.id));
  const items = (part.keep?.items ?? []).slice(0, style === 'stage' ? 2 : 8).flatMap((x): { sprite?: string; text?: string; word?: string }[] => (ids.has(x.sprite) ? [{ sprite: x.sprite, word: x.word?.trim() }] : x.word?.trim() ? [{ text: x.word.trim() }] : []));
  if (!items.length) return undefined;
  const parts = p.parts ?? [];
  const k = parts.indexOf(part);
  const at = (id: string) => shots.find((x) => x.id === id);
  const from = at(part.from)?.start ?? 0;
  const to = (k + 1 < parts.length ? at(parts[k + 1].from)?.start : undefined) ?? song.duration ?? song.cues.at(-1).end;
  const sung = song.cues.filter((c: { start: number }) => c.start >= from && c.start < to).map((c: { start: number }) => c.start as number);
  const lands = (i: number) => (sung.length >= items.length ? sung[Math.floor((i * sung.length) / items.length)] : from + ((to - from) * 0.8 * i) / items.length);
  const order = clamp01(part.order ?? 1);
  const before = k > 0 ? clamp01(parts[k - 1].order ?? order) : order;
  // a picture kept from a moment nobody sings to the part's end, inside a backdrop window, is printed as its word
  const landed = items.map((x, i) => ({ ...x, at: +lands(i).toFixed(2) }));
  const kept = stripUnsungSprites(landed.map((x) => ({ ...x, end: to })), unsung, t.interludes).cuts.flatMap(({ end: _, word, ...x }, i) => (x.sprite || !landed[i].sprite ? [x] : word ? [{ text: word, at: x.at }] : []));
  return { style, from, to, order: [before, order], items: kept };
}
function clamp01(x: number) {
  return Math.min(1, Math.max(0, x));
}

/** The plan's part a shot falls in (the last part starting at or before it). */
export function partOf(p: Pick<Plan, 'parts'>, shot: string) {
  const at = (id: string) => shots.findIndex((x) => x.id === id);
  const i = at(shot);
  return [...(p.parts ?? [])].filter((x) => at(x.from) >= 0 && at(x.from) <= i).sort((x, y) => at(y.from) - at(x.from))[0];
}

/**
 * The plan's cuts as look sections: snapped to the shot's beats, at most one per 0.45 s, the same move never twice in
 * a row, and the character on the side away from the lyric.
 */
export function buildCuts(p: Plan) {
  const sections: { start: number; layers: (KineticLayer | StoredLayer)[]; transition?: { kind: string } }[] = [];
  // a backdrop runs on across the shots that keep it: its motion counts from the first of them
  let held = { id: '', t0: 0 };
  // the thread's level of the cut before: each cut eases from it
  let threadLevel = 0;
  const missing: string[] = [];
  let removed = 0;
  let last = '';
  let shown = { sprite: '', side: '' };
  // round moves past their share of the song are swapped for the director's other moves (capRound)
  const order = shots.flatMap((s) => [...(p.shots.find((x) => x.shot === s.id)?.cuts ?? [])].sort((x, y) => x.beat - y.beat).map((c) => ({ c, shot: s.id })));
  const shotIds = order.map((o) => o.shot);
  // then the rare moves (origins.ts) past their one or two uses
  const rare = capEach(capBy(capRound(order.map((o) => o.c.fx), shotIds), shotIds, (f) => (useCap(`fx:${f}`) < Infinity ? f : undefined), (f) => useCap(`fx:${f}`)), shotIds, 4, (f) => useCap(`fx:${f}`));
  const capped = new Map(rare.map((f, i) => [order[i].c, f]));
  // the swap for a repeat must not push another move past its share (capEach): sparkle went from 14 to 17
  const moveCap = Math.max(4, Math.ceil(order.length * MOVE_SHARE));
  const ran = new Map<string, number>();
  // held cuts hold four beats at least (a held ballad still changed every 1.2 s); longer holds are the director's call
  // (forcing eight in quiet parts dropped Keep Your Fire Burning's title card from its intro)
  const beatSec = 60 / song.tempo;
  // a calm song's part: its first cut's move, backdrop and clock run on under every later cut of the part (calm)
  let warmest = 0;
  let hold: { part: unknown; back?: Backdrop; fx: string; at: number; seed: number; words: string[] } | undefined;
  const gapAt = (_energy: number, chorus: boolean) => holdGap(p.format?.pace, chorus, beatSec);
  const transitions = new Map<string, number>();
  const variants = new Map<string, number>();
  const labels = new Set<string>();
  for (const s of shots) {
    const ps = p.shots.find((x) => x.shot === s.id);
    if (!ps?.cuts.length) {
      missing.push(s.id);
      continue;
    }
    const bs = beats.filter((b) => b >= s.start && b < s.end);
    // a calm song's part keeps the backdrop it opened with
    // a part's world: a shot's backdrop outside its part's set takes the part's first (a part may change angle or
    // area, not jump to an unrelated picture)
    const allowed = partOf(p, s.id)?.backdrops?.filter((id) => backdrops.some((x) => x.id === id)) ?? [];
    const bid = ps.backdrop && allowed.length && !allowed.includes(ps.backdrop) ? allowed[0] : ps.backdrop;
    // a calm song holds through the director's parts (holding through the song's verse kept 三年後的大雪's memory
    // blue when its part turned red mid-verse, 2026-10-21); a plan without parts holds through the song's sections
    const part = partOf(p, s.id);
    const partKey: unknown = part ?? s.part;
    const back = calm && hold?.part === partKey ? hold.back : backdrops.find((x) => x.id === bid);
    const board = a.board && part ? boardOf(p, part) : undefined;
    if ((back?.id ?? '') !== held.id) held = { id: back?.id ?? '', t0: s.start };
    const away = ps.lyric.side === 'left' ? 'right' : ps.lyric.side === 'right' ? 'left' : 'center';
    const sorted = [...ps.cuts].sort((x, y) => x.beat - y.beat);
    const times = cutTimes(beats, s, sorted);
    const gap = gapAt(s.part?.energy ?? 0.5, s.part?.type === 'chorus');
    for (const [i, c] of sorted.entries()) {
      const at = times[i];
      if (at >= s.end - 0.05) continue;
      // a shot's first cut always lands (it carries the shot's backdrop: a held ballad skipped one and kept the last
      // shot's sky for 6 s); the hold applies between the cuts inside a shot
      if (i > 0 && sections.length && at - sections[sections.length - 1].start < gap) continue;
      const want = capped.get(c) ?? c.fx;
      let fx = KINETIC_FX.includes(want as never) ? want : 'wall';
      // no intro to hold a title card: the cut takes the song's quiet stars instead
      if (fx === 'credits' && !titleRoom) fx = 'stars';
      if (!MOVES.includes(fx)) fx = 'motes';
      // the same move twice in a row: the next one in the list that is not round (capRound counted the circles)
      // (and never a round move straight after another: pulse, bleed, pulse closing 三年後的大雪 read as circles again)
      const afterRound = ROUND_FX.has(last);
      for (let k = 1; k < KINETIC_FX.length && (fx === last || ((k > 1 || afterRound) && ROUND_FX.has(fx)) || !MOVES.includes(fx) || (k > 1 && (ran.get(fx) ?? 0) >= moveCap)); k++) fx = KINETIC_FX[(KINETIC_FX.indexOf(want as never) + k) % KINETIC_FX.length];
      last = fx;
      ran.set(fx, (ran.get(fx) ?? 0) + 1);
      const nextBeat = [...ps.cuts].sort((x, y) => x.beat - y.beat).find((x) => x.beat > c.beat)?.beat;
      const cutEnd = nextBeat === undefined ? s.end : (bs[nextBeat] ?? s.end);
      // nobody sings over the whole cut and the director chose backdrop there: no figure, prop or illustration
      // (checked to the next cut that lands: a skipped next cut leaves this layer up into what follows)
      const runsTo = landedEnd(times, i, gap, s.end);
      const sprite = stripUnsungSprites([{ at, end: runsTo, sprite: c.sprite }], unsung, t.interludes).cuts[0].sprite ?? '';
      // a diagram under a centred lyric would sit on it: it takes a side, alternating
      // a diagram, or a character, under a centred lyric would sit on it: it takes a side, alternating, a figure smaller
      // (a mic stand stood behind きゅんとさせてほしい)
      const figure = !!sprite && !DIAGRAM_FX.has(fx);
      const side = (DIAGRAM_FX.has(fx) || figure) && away === 'center' ? (sections.length % 2 ? 'left' : 'right') : away;
      const size = Math.min(figure && away === 'center' ? 0.75 : 1.7, Math.max(0.4, c.size || 0.85));
      // the words behind are texture: none from the lines sung over the cut (恋に恋 walled behind 恋に恋 read as the
      // lyric twice), the title card's excepted
      // (and the line just sung: 色褪せた空 walled right after it was sung read as an echo of the lyric)
      const sung = song.cues.filter((x: { start: number; end: number }) => x.start < cutEnd && x.end > at - 3).map((x: { text: string }) => x.text).join(' ');
      // a chapter card is read: over a sung line it reads as a lyric nobody sings (この路の果て across 世界のつづき's
      // chorus, 2026-10-22), so it lands only where nobody sings
      const sungOver = song.cues.some((x: { start: number; end: number }) => x.start < cutEnd && x.end > at);
      if (fx === 'chapter' && sungOver) fx = 'motes';
      // a calm song's backgrounds carry no words at all: a lyric word drawn while another line is sung read as an extra
      // line (星あかり in its constellation, chorus after chorus)
      const words = fx === 'credits' ? c.words : calm && fx !== 'chapter' ? [] : [...new Set(c.words.filter((w) => w.trim() && !sung.includes(w.trim())).map((w) => w.trim()))];
      if (words.length < (WORDED[fx] ?? 0)) fx = 'motes';
      // (a title or chapter card still lands on its own: the held intro swallowed 世界のつづき's title)
      const held2 = calm && hold?.part === partKey && fx !== 'credits' && fx !== 'chapter' ? hold : undefined;
      // the held move keeps its own words: a line sung earlier must not stay up under the next ones
      // a held part keeps its world (the backdrop and its clock), not its move: freezing the move too left 三年後的大雪
      // 10 visible changes in a song of 91 cuts, and the user preferred the version that changed (2026-10-23)
      const layer: KineticLayer = { kind: 'kinetic', fx: fx as KineticLayer['fx'], words, ink, paper, accent: c.heart ? heart : accent, seed: sections.length + 1, side, size, flip: side === 'left' };
      // a diagram stands where the character would
      if (sprite && !DIAGRAM_FX.has(fx)) layer.sprite = sprite;
      // the same thing on the next cut but across the frame reads as it jumping there (sweet timer's moon and carriage
      // swapped sides with the lyric): it sits that cut out
      if (layer.sprite && !sameSpot(shown, layer.sprite, side)) delete layer.sprite;
      // the picture the strip took would have been drawn (not a diagram, not across the frame, not on the board)
      const tookPicture = !!c.sprite && !sprite && !DIAGRAM_FX.has(fx) && sameSpot(shown, c.sprite, side) && !board?.items.some((x) => x.sprite === c.sprite);
      if (tookPicture) removed++;
      shown = { sprite: layer.sprite ?? '', side };
      if (c.dark) layer.dark = true;
      // the song's one variant of the move, and its direction when the move has one (MORE flows)
      const style = p.styles?.find((x) => x.fx === fx)?.style;
      // a variant few of the 535 videos use is a technique of its own: past its one or two uses the cut takes the plain one
      if (style && MORE[fx]?.styles?.[style]) {
        const n = (variants.get(`${fx}#${style}`) ?? 0) + 1;
        variants.set(`${fx}#${style}`, n);
        if (n <= useCap(`fx:${fx}#${style}`)) layer.style = style;
      }
      if (c.flow && MORE[fx]?.flows?.includes(c.flow as never)) layer.flow = c.flow as KineticLayer['flow'];
      if (p.print && p.print !== 'duo' && PRINTS.includes(p.print as never)) layer.print = p.print as KineticLayer['print'];
      if (p.format?.ground && p.format.ground !== 'flat') layer.ground = p.format.ground as KineticLayer['ground'];
      // the thread is the plan the backdrops, moves and props follow, never an object of its own on screen: a drawn
      // flame looked cheap, a growing lantern in the corner of every cut (indigo, Keep Your Fire Burning) read as
      // ugly clutter unrelated to the cut and covered it (2026-10-21)
      if (DRAW_THREAD && p.thread?.sprite && sprites.some((x) => x.id === p.thread!.sprite)) {
        const level = Math.max(0, Math.min(1, ps.level ?? 0));
        // a lyric set on the right puts the thread in the top left corner
        if (level > 0 || threadLevel > 0) layer.thread = { mark: (THREAD_MARKS.includes(p.thread.mark as never) ? p.thread.mark : 'star') as ThreadMark, level, from: threadLevel, sprite: p.thread.sprite, ...(ps.lyric.side === 'right' ? { left: true } : {}) };
        threadLevel = level;
      }
      layer.bpm = song.tempo;
      layer.song = songKey;
      layer.mood = mood;
      Object.assign(layer, { at: +at.toFixed(3), len: +(song.duration ?? song.cues.at(-1).end).toFixed(1) });
      if (calm && !held2 && fx !== 'credits' && fx !== 'chapter') hold = { part: partKey, back, fx, at, seed: layer.seed!, words };
      // the director's reading, once a song (a repeat takes the one made from the song)
      if ((fx === 'measure' || fx === 'counter') && c.label && !labels.has(c.label)) labels.add((layer.label = c.label.slice(0, 12)));
      // a cut no one sings over: its words are texture, so they are not taken for lyrics
      const until = runsTo;
      // (a title card and a chapter card are read on purpose: hushed, the opening title sank into the dark paper)
      if (!song.cues.some((x: { start: number; end: number }) => x.start < until && x.end > at) && fx !== 'credits' && fx !== 'chapter') {
        layer.hush = true;
        if (EMPHATIC.has(fx)) layer.fx = 'motes';
      }
      if (p.document) {
        // the line being sung when the cut lands, counted through the song
        const n = song.cues.findLastIndex((x: { start: number }) => x.start <= at + 0.05);
        layer.meta = { fig: ps.chapter || undefined, kind: (p.devices?.document ?? 'blueprint') as NonNullable<KineticLayer['meta']>['kind'], n: Math.max(1, n + 1), total: song.cues.length };
      }
      if (c.cam) layer.cam = c.cam as KineticLayer['cam'];
      if (c.flash) layer.flash = c.flash as KineticLayer['flash'];
      // a rare transition past its one or two uses becomes a hard cut
      const tk = c.transition && sections.length && !held2 ? c.transition : '';
      if (tk) transitions.set(tk, (transitions.get(tk) ?? 0) + 1);
      // a move that paints the whole frame would hide the backdrop: that cut keeps its own paper
      if (board) {
        layer.board = board;
        // a thing the part keeps on screen is not printed again as the cut's figure
        if (layer.sprite && board.items.some((x) => x.sprite === layer.sprite)) delete layer.sprite;
      }
      // the part's warmth as light, measured back in the preview (a red memory part had drawn blue)
      // memory leaves some warmth behind: back in the present a part keeps a share of the warmest part before it
      if (part?.warmth !== undefined) warmest = Math.max(warmest, part.warmth);
      const wash = warmWash(part?.warmth === undefined ? undefined : Math.max(part.warmth, residual(warmest)));
      const over = [...(back && !COVER_FX.has(fx) ? [...back.layers.map((l) => ({ ...l, t0: held.t0 })), { ...layer, bare: true }] : [layer]), ...wash];
      sections.push({ start: +at.toFixed(3), layers: over, ...(tk && transitions.get(tk)! <= useCap(`tr:${tk}`) ? { transition: { kind: tk } } : {}) });
    }
  }
  if (sections.length) sections[0].start = 0;
  return { layers: sections, missing, removed };
}

/**
 * The audit's rules on the plan (origins.ts): rare line motions past their uses swapped for the song's commonest, and
 * no more than MAX_PER_CREATOR of one creator's own forms in the song (the rest switched to another variant).
 */
function settle(p: Plan) {
  // a layout that cannot sit where the director put it takes a side it has, and the character goes to the other one
  // (quiet on the right fell back to auto, which found the character's side empty-looking and sat on the figure)
  for (const ps of p.shots) ps.lyric.side = lyricSide(ps.lyric.template, ps.lyric.side);
  const lines = p.shots.flatMap((s) => s.lines ?? []);
  for (const key of ['enter', 'exit'] as const) {
    const count = new Map<string, number>();
    for (const l of lines) count.set(l[key], (count.get(l[key]) ?? 0) + 1);
    const common = [...count].filter(([k]) => useCap(`${key}:${k}`) === Infinity).sort((a, b) => b[1] - a[1])[0]?.[0];
    const used = new Map<string, number>();
    for (const l of lines) {
      used.set(l[key], (used.get(l[key]) ?? 0) + 1);
      if (common && used.get(l[key])! > useCap(`${key}:${l[key]}`)) l[key] = common;
    }
  }
  const cuts = p.shots.flatMap((s) => s.cuts);
  const style = (fx: string) => p.styles?.find((x) => x.fx === fx)?.style ?? 0;
  const forms: [string, boolean, () => void][] = [
    ['device:kinetic-format', (p.format?.pace ?? 'quick') === 'quick' && (p.format?.ground ?? 'flat') === 'flat', () => (p.format = { ...(p.format ?? { pace: 'quick', why: '' }), ground: 'grain' })],
    ['device:document', p.document && (p.devices?.document ?? 'blueprint') === 'blueprint', () => (p.devices = { ...(p.devices ?? { revise: 'caret', why: '' }), document: 'notebook' })],
    ['emph:revise', lines.some((l) => l.method === 'revise' || l.method2 === 'revise') && (p.devices?.revise ?? 'caret') === 'caret', () => (p.devices = { ...(p.devices ?? { document: 'blueprint', why: '' }), revise: 'tape' })],
    ['fx:ecg', cuts.some((c) => c.fx === 'ecg') && style('ecg') !== 2, () => cuts.forEach((c) => c.fx === 'ecg' && (c.fx = 'metronome'))],
    ['fx:tiles', cuts.some((c) => c.fx === 'tiles') && style('tiles') === 0, () => (p.styles = [...(p.styles ?? []).filter((x) => x.fx !== 'tiles'), { fx: 'tiles', style: 2, why: 'origin rule' }])],
    ['fx:blueprint', cuts.some((c) => c.fx === 'blueprint') && style('blueprint') === 0, () => (p.styles = [...(p.styles ?? []).filter((x) => x.fx !== 'blueprint'), { fx: 'blueprint', style: 1, why: 'origin rule' }])],
  ];
  const used = forms.filter(([, on]) => on);
  const over = overCreator(used.map(([id]) => id));
  for (const [id, , swap] of used) if (over.includes(id)) swap();
  console.log(`origins: own forms ${used.map(([id]) => id).join(' ') || 'none'}${over.length ? `; switched ${over.join(' ')}` : ''}`);
}

/** The side a lyric layout can take nearest the director's: stair has no centre; quiet, typewriter, handwrite no right. */
/** Whether a sprite may show at this side after the last cut's: anything new may, the same one only where it stood. */
export function sameSpot(last: { sprite: string; side: string }, sprite: string, side: string) {
  return last.sprite !== sprite || last.side === side;
}
export function lyricSide(template: string, side: string): string {
  if (template === 'stair' && side === 'center') return 'right';
  if (['quiet', 'typewriter', 'handwrite'].includes(template) && side === 'right') return 'left';
  return side;
}
