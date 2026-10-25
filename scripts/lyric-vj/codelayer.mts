// The director writes the song's own drawing code — one Canvas2D layer (graphics.ts kind 'code') that
// joins each section's library layers — then checks it on test stills (errors, slowness, its own look at the frames)
// and revises. Writes <out>/treatment.json (the song's treatment with the code layer; --out may be --dir itself) and
// <out>/codelayer.json; the test renders go to <out>/codelayer/.
// npx tsx scripts/lyric-vj/codelayer.mts --song out/db/<id>/song.json --dir out/db/<id>/studio --out <dir>
import Anthropic from '@anthropic-ai/sdk';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { continuity, parseTrack } from '../../src/app/lyric-vj/continuity';
import { LANGUAGES, LanguageId } from '../../src/app/lyric-vj/languages';

const { values: a } = parseArgs({ options: { song: { type: 'string' }, dir: { type: 'string' }, out: { type: 'string' }, model: { type: 'string', default: 'claude-opus-5-5' },
  // the viewers and checkers that look at stills (blind viewer, states judge, cast check): half the director's price
  'check-model': { type: 'string', default: 'claude-sonnet-5-5' },
  // an approved earlier drawing (its codelayer.json and still_*.jpg) to build on, and the user's notes on what to keep or fix
  baseline: { type: 'string' }, feedback: { type: 'string' },
  // a sprite library (sprite_library.py: library.json, assets.json, contact.jpg): designed characters and props to act with
  sprites: { type: 'string' },
  // the drawing owns the whole frame (it may drop every library layer but the ground and lay the page out itself)
  'full-scene': { type: 'boolean', default: false },
  // one event, its states planned with times and checked on the real renderer before anything else (no score gate)
  states: { type: 'boolean', default: false },
  // with --states: the director casts the event (people and the state drawings it needs), drawn in the song's style
  cast: { type: 'boolean', default: false },
  // the picture whose drawing style the cast is drawn in (default: the first prop sheet next to --sprites)
  'style-ref': { type: 'string' },
  // the song's characters as already drawn (songplan.mts): extra state drawings keep these people identical
  'cast-ref': { type: 'string' },
  // a hard cap on this run's API spend (USD): the next request is not sent once it is reached
  budget: { type: 'string' } } });
const env = join(homedir(), '.config/vjflow/anthropic.env');
for (const line of existsSync(env) ? readFileSync(env, 'utf8').split('\n') : []) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const out = a.out!;
const work = join(out, 'codelayer');
mkdirSync(work, { recursive: true });
const song = JSON.parse(readFileSync(a.song!, 'utf8'));
const base = JSON.parse(readFileSync(join(a.dir!, 'treatment.json'), 'utf8'));
// a rerun replaces the previous drawing
for (const s of base.graphics.sections) s.layers = s.layers.filter((l: { kind: string }) => l.kind !== 'code');
const sections: { start: number; layers: { kind: string }[]; text?: string }[] = base.graphics.sections;
// a treatment made for part of the song (direct.mts --start/--end) is drawn, rendered and reviewed over that part only
const W0 = Math.min(...base.shots.map((x: { start: number }) => x.start));
const W1 = Math.max(...base.shots.map((x: { end: number }) => x.end));
const cues: { id: string; start: number; end: number; text: string }[] = song.cues.filter((c: { start: number }) => c.start >= W0 - 0.01 && c.start < W1);

// camera cuts: with the lyric layouts (the shots), and every two bars through a long stretch without one, so the
// background is edited like the type rather than one framing per section
const cuts = (() => {
  const shotCuts: number[] = base.shots.map((x: { start: number }) => x.start).filter((x: number) => x > W0 + 0.5);
  const bars: number[] = song.downbeats ?? [];
  const out: number[] = [];
  const marks = [W0, ...shotCuts, W1];
  for (let i = 0; i + 1 < marks.length; i++) {
    if (i) out.push(marks[i]);
    if (marks[i + 1] - marks[i] > 6.5) {
      const inside = bars.filter((b) => b > marks[i] + 2.5 && b < marks[i + 1] - 2.5);
      for (let k = 3; k < inside.length; k += 4) out.push(inside[k]);
    }
  }
  // every cut lands on a beat (the nearest within 0.25 s): edits on the grid read as cut to the music
  const beats: number[] = song.beats ?? [];
  const onBeat = (x: number) => { const b = beats.reduce((p, q) => (Math.abs(q - x) < Math.abs(p - x) ? q : p), x); return Math.abs(b - x) <= 0.25 ? b : x; };
  return [...new Set(out.map((x) => +onBeat(x).toFixed(2)))].sort((x, y) => x - y);
})();

const brief = {
  title: song.title, duration: +W1.toFixed(1), ...(W0 > 0 || W1 < song.duration - 0.5 ? { window: { from: +W0.toFixed(1), to: +W1.toFixed(1), note: '只做這一段：畫面、故事、鏡頭都在這個範圍內完成' } } : {}), bpm: +song.tempo.toFixed(1),
  concept: base.concept, language: base.design.language, font: base.design.font,
  arc: base.arc, moments: base.moments,
  cuts: cuts.map((t, i) => ({ shot: i + 1, at: t })),
  // the lyric shots by id: what layouts names (the camera cuts above are numbered, these are not)
  lyricShots: base.shots.map((x: { id: string; start: number; end: number; template: string }) => ({ id: x.id, from: +x.start.toFixed(2), to: +x.end.toFixed(2), template: x.template })),
  titleCards: base.shots.filter((x: { template: string }) => x.template === 'title-card').map((x: { start: number; end: number }) => ({ from: x.start, to: x.end })),
  sections: sections.map((s, i) => ({ index: i, start: s.start, end: sections[i + 1]?.start ?? +W1.toFixed(1), lyricColor: s.text ?? 'auto', layers: s.layers.map((l, j) => ({ index: j, ...l })) })),
  lyrics: cues.map((c: { start: number; text: string }) => `${c.start.toFixed(1)} ${c.text}`),
  // instrumental stretches (over 4 s without a line): where the picture breathes on its own
  interludes: (() => {
    const cs = cues;
    const gaps = [{ from: W0, to: cs[0]?.start ?? W1 }, ...cs.slice(0, -1).map((c, i) => ({ from: c.end, to: cs[i + 1].start })), { from: cs[cs.length - 1]?.end ?? W0, to: W1 }];
    return gaps.filter((g) => g.to - g.from > 4).map((g) => ({ from: +g.from.toFixed(1), to: +g.to.toFixed(1) }));
  })(),
};

const SYSTEM = `你是頂尖的動態設計師，正在為一首歌的歌詞 VJ 寫「這首歌專屬的背景動畫」。其他圖層來自共用元件庫，看起來像模板；你寫的這一層要讓這首歌一看就知道是設計師為它量身做的。`;
const RULES = `
寫一個 JavaScript 函式本體（不含 function 宣告），會被 new Function('ctx', 'f', src) 編譯，每一格呼叫一次：
- ctx：1920×1080 的 CanvasRenderingContext2D，已經畫好你下面保留的圖層；畫完會自動 restore。
- f.t：歌曲秒數；f.age：本段開始後的秒數；f.w、f.h：1920、1080。
- f.beat：{ since: 距上一拍秒數, pulse: 1→0 衰減的打拍力道, index: 第幾拍 }。BPM 和段落、高潮時間在下面的資料裡，可以直接寫死在程式裡。
- f.lyric：此刻歌詞在畫面上的矩形 {x0,y0,x1,y1}（像素），沒有歌詞時是 null。歌詞會畫在你上面。f.lyric 換句時會在 0.4 秒內滑到新位置；f.lyricWeight 是 0→1 的讓位權重（歌詞出現時漸增、離開時漸減），讓位的位移和縮放一律乘上它。
- f.cam：此刻的鏡頭 { index, start, end, progress 0→1, count }。鏡頭在 cuts 的時間點硬切（index 0 是第一個切點之前），切點和歌詞版型換版同步。
- f.hash(a, b)：決定性雜訊 [0,1)。
- f.cache：跨格保留的物件，用來存只算一次的離屏畫布或雜訊圖（例如 f.cache.paper ??= 建立紙紋()）。
- f.particles({ shape, char?, color, count, size, speed, dir, sway, opacity, seed })：畫一層有遠近景深、會飄動的粒子（shape：dot／petal／leaf／snow／star／spark／heart／bubble／char；dir：down／up／left／right）。用在場景的氛圍（花瓣、雪、星塵、泡泡、飄落的字），不要整首都鋪；間奏、副歌高潮、情緒句最適合。
- f.warp(img, x, y, w, h, zones, seed?)：像 ctx.drawImage(img, x, y, w, h) 一樣畫素材，但素材「本身」的軟部分會動（網格變形，同一陣風驅動全畫面）。zones 是 [{ kind, rect?, pin?, amp? }]：kind 有 'sway'（樹、草、花、枝：pin 固定端預設 bottom）、'flutter'（旗、布條、緞帶、頭髮：pin 預設 left）、'billow'（帆、窗簾、布幕鼓起）、'swing'（懸吊的燈籠、風鈴、招牌：繞頂端擺）、'pulse'（水母、心臟、燈光呼吸）、'ripple'（水面、浪面）；rect 是 [x0,y0,x1,y1]（素材的 0–1 比例），只有這塊會動、其餘保持硬（例如帆船只讓帆 [0.27,0.08,0.76,0.68] billow、船底的水 ripple，船身不動）；amp 是幅度（素材尺寸的比例，預設 0.02–0.08，不要超過 0.1）。每格最多 3 個 f.warp（每個約 5–10 毫秒）。
規則：
1. 完全決定性：只依 f 的值畫，不能用 Math.random、Date、requestAnimationFrame、全域狀態累積（每一格可能單獨被畫、也可能跳著畫）。
2. 效能：每格 10 毫秒內（不要每格建上萬個路徑、不要 getImageData、不要 filter: blur 大面積）。
3. 歌詞要看得清楚：f.lyric 範圍內（外擴 40px）只能留低對比、低細節的東西，主要的動態避開它或在它後面變安靜。歌詞顏色見每段 lyricColor（auto＝系統依底色挑深或淺）。
4. 要和整首歌的概念、語言、配色一致，跟著段落和能量變化：主歌克制、副歌和高潮（moments 的 drop/finale）全開、間奏要有明顯變化。從歌名或概念推出一條貫穿整支片的視覺規則（例如歌名「借一拍」→ 每個畫面先印黑版、紅版晚半拍才套上，並永遠留一點錯位），所有場景都遵守，結尾給它一個呼應；最強烈的手法（衝擊格、集中線、色版錯位）只在副歌和高潮全開。
5. 不要畫文字標題、歌名、人名。可以有裝飾性的字元或符號。
6. 每一段決定要保留哪些原本的元件庫圖層（layers 的 index），以及你的圖層放在哪裡：order 是由下到上的順序，-1 代表你的圖層。第一個必須是原本的底色 fill/paper（index 0）。可以拿掉看起來像模板、和你的動畫衝突的圖層。
7. 避開最常見的「AI 動態設計」樣子：瑞士網格加 UI 雜訊、時間碼、霓虹光暈、粒子場。要像這首歌的設計師才會想到的東西。
8. 用鏡頭說故事，像設計師剪 MV：每個場景是一個比畫面大的「世界」，每個鏡頭（f.cam.index）用不同的取景看它——遠景交代、特寫一個細節、沿著場景橫移、俯視、推近、從低角度仰看——用 ctx.translate/scale/rotate 做，鏡頭內用 f.cam.progress 做連續的緩動運鏡（推、移、搖），切點上構圖要明顯改變，相鄰鏡頭不要同一種取景。
9. 一段可以有好幾個鏡頭；長段落或重複的主歌可以換新場景。副歌回到同一個場景是好的記憶點，但每次副歌的鏡頭要不同、逐次加強，不能重複上一次副歌的取景。
10. 運鏡時歌詞區（f.lyric）依然要清楚：特寫和推近時，細節多的東西放在歌詞區外。
11. 不要在歌詞後面墊任何底板、卡片、薄霧或光暈（看起來笨重，使用者明確不要）：用構圖和運鏡讓出歌詞的位置。
12. 轉場不要用滿版的純色卡片、色塊掃過畫面（大色塊會閃）：硬切，或用場景裡的東西帶過去（物件掠過鏡頭、鏡頭甩到下一個場景）。
13. titleCards 是歌名卡出現的時段：這段時間背景的明暗不能翻轉（不能從深色場景切到淺色場景，反之亦然），否則歌名在某一邊會看不清楚。
14. 動畫原則：真實的緩動、預備動作、擠壓拉伸、錯開（stagger）、跟隨與重疊動作。禁止：通用的推入／滑入／旋轉甩入、整屏閃爍、沒有意義的漂浮粒子、只會放大縮小的「呼吸」。
15. 每個鏡頭＝一個主要動作（落在觀眾視線的焦點上）＋ 2–4 個取自該場景母題的小循環。不能有只剩底色、或只有極淡元素的鏡頭。
16. 轉場優先用「下一個場景的招牌元素」：從畫面裡的某個物件長出或帶出下一個場景（例如雲擴張成下一場的天空、電車窗變成下一場的畫面），看得見的時長約 0.4–0.5 秒並落在拍點上；做不到就乾淨硬切。
17. 鏡頭要大膽：同一場景的相鄰鏡頭，在景別（遠景／中景／特寫）、角度、運鏡方向三者中至少改變兩項。
17-1. 物件的位置、大小、出現與消失都要連續：除了鏡頭切點（f.cam.index 改變的那一格），任何物件都不能瞬間換位置、換大小、冒出來或消失；出場和退場要有動畫（落下、滑入、長出），讓位要用 f.lyricWeight 漸變，不要寫 if (f.lyric) 直接跳位。
17-2. 物理要合理：物件放在地面、水面或掛在東西上，不要漂浮；影子是畫在接地點正下方的扁平橢圓（低透明度），不是物件後面的灰色圓盤。
17-3. 動態系統（不像 AI 做的關鍵）：全片只用 3 種緩動曲線，各有用途——進場用減速（ease-out，例如 1-(1-p)^3）、退場用加速（ease-in）、鏡頭用兩端都緩（ease-in-out）；線性只能用在慢慢漂移。回彈（overshoot 1–7%）只給「真的落地或卡上」的那一下，全片最多 2 次，其他動作不准彈。移動距離越長時間越長（約 0.35 秒＋每 1000 像素 1.35 秒，鏡頭 0.6–2.4 秒）；同一時間只有 1 個主要動作＋最多 2 個輔助動作；任何東西每格移動不超過 60–80 像素，更快就改成拍點上的硬切。次要動作在主要動作進行到 55–75% 時才開始，兩者一起停下。鏡頭切點兩側要嘛都靜止，要嘛新鏡頭用舊鏡頭的速度延續。同一個物件不能用兩份交叉淡化，要讓同一個物件變形過去。
17-4. 一個強調色只代表一件事（例如「命運」「現在」「你」）：平常只佔畫面約 8%，全片最多鋪滿畫面一次（在最大的高潮）。不要到處用。
17-5. 一個故事物件（一條線、一個信物、一個形狀）貫穿每個鏡頭、在切點也不消失，最後在結尾收成一個畫面——要是這首歌獨有的東西，不要用單純的點、線、方塊敷衍。
17-6. 轉場：全片用 6–8 種，每種最多 2 次，另外選 1 種從故事物件長出來的「招牌轉場」，在開頭、中段、結尾各用一次；交叉淡化不能當預設，也不要閃白、光斑、故障、漩渦這類現成特效。
17-7. 故事性：先在 idea 裡寫出一條有起承轉合的故事線，每個段落是故事裡的一個「事件」（例如小舟從夏天的海岸出發→秋天沿岸航行→夜裡遇上巨浪→黎明抵達），物件要參與事件（被浪捲起、被風吹走、靠岸、被拾起），不是擺著當背景。禁止把幾個道具在地面排成一列再橫移鏡頭帶過；每個鏡頭要有主從關係：一個主角物件佔畫面大部分或被大膽裁切，其他是配角。
17-9. 軟的東西要真的動：樹、草、帆、旗、布、燈籠、風鈴、水母、水面用 f.warp 讓它自己擺動，取代整張圖上下漂浮或左右平移；硬的東西（船身、建築、鳥居、石頭、器物）不要 warp，它們用整體的位移、旋轉或擠壓來演。同一個鏡頭裡的風向一致。
17-12. 物件要屬於畫面，不是貼紙：同一時間畫面上最多 3 個素材；每個素材要有物理上的位置（放在地面、桌面、水面、掛在東西上，大小符合場景的透視和遠近），不要漂在空中、不要沒有理由地上下晃；兩個素材不能疊在一起。素材出現和離開都要有動畫（從畫外進來、落下、長出、淡入），不能一格之內冒出、消失、瞬移或突然變大變小——系統會逐格量測，違反就是必須修的錯誤。
17-13. 少而有關聯：全片的素材圍繞一個故事物件（它貫穿全片），配角只在歌詞真的提到時出現；不要每個場景都塞新的道具。
17-14. 間奏留白呼吸：資料裡的 interludes（超過 4 秒沒有歌詞）背景降成低能量——極慢的推鏡或漂移、明暗緩慢呼吸、少量環境微動（光、雲、水、粒子），不要在間奏塞新的事件或新道具；歌詞回來前一兩拍再把能量帶回來。片尾最後一句唱完後讓畫面慢慢減速，程式會自動淡出到黑。
17-10. 歌詞不能被素材蓋住：歌詞完整出現時，素材的不透明部分不能壓進 f.lyric 的矩形（系統會量測，蓋住超過 8% 就是必須修的錯誤）。用構圖、取景和 f.lyricWeight 讓位，不要把素材塞到歌詞後面。
17-11. 構圖是分區，不是閃躲：每個鏡頭先決定歌詞區和畫面區（例如直排歌詞在右三分之一，主角大浪佔左邊三分之二並被畫框大膽裁切；橫排歌詞在上方留白，主角物件佔下半部）。主角物件要大（畫面面積 25–60%），可以出框；配角少而小、有主從。不要為了避開歌詞把所有物件縮小推到角落，留下一片空的底色——那比壓到歌詞更糟。歌詞換位置時，主角跟著換邊或換景別。
17-15. 場景有一個光源（燭火、夕陽、路燈、窗光、螢幕）：先決定它在哪裡，再讓整個畫面服從它——地面和牆上有它照出的光暈（'lighter' 疊淡色徑向漸層，可以隨時間呼吸或閃動）、每個物件的影子朝遠離光源的方向拉長（柔邊，用 ctx.filter blur 只畫在影子上）、靠近光源的物件被照亮一點（同一張圖用 'lighter' 低透明度再疊一次）。光源的變化就是事件（燭火熄滅、夕陽沉下、路燈亮起）。
17-16. 物件放在一個有透視的承載面上（桌面、地面、斑馬線、水面）：畫出它的後緣和朝觀眾延伸的紋理線（木紋、地磚、斑馬線往消失點收），物件分前、中、後排，越前面越大、越低，前排的物件可以壓住後排的一部分（遮擋＝景深）；不要把物件排成同一條水平線。躺著的東西要真的躺平（花、筆、照片轉成接近水平），不要用尖端立在桌上。
17-17. 先排字再排物件：這段歌詞放哪一區、橫排或直排（lyricZone），物件群就放在另一側，鏡頭推近時也不能壓進字的那一側；字和物件一起構成畫面，不是字疊在物件上。
17-18. 段落之間的轉場最好是「前一個場景裡發生的事」：光源熄滅後只剩故事物件、物件被拉出畫面帶進下一場、門窗關上；選這個轉場的理由要寫在 idea 裡。
17-8. 具體的東西（浪、山、樹、建築、動物、器物）只能用素材庫的圖（f.img）畫，程式只畫背景、色面、紋樣、光和運鏡；素材庫沒有的具體物件就不要出現，不要用幾何圖形拼湊。`;

const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['idea', 'src', 'sections'],
  properties: {
    idea: { type: 'string', description: '這一層的設計想法，2–4 句繁體中文' },
    src: { type: 'string', description: '函式本體' },
    sections: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['index', 'order'], properties: { index: { type: 'integer' }, order: { type: 'array', items: { type: 'integer' } } } } },
    // the words are part of the picture: where each shot's lyrics sit (applied over the shot's template)
    layouts: { type: 'array', description: '（完整場景模式）每個歌詞鏡頭的排法：shot 是 lyricShots 裡的 id（例如 s24，不是 cuts 的編號）；template 是 vertical（直排）、stair（階梯橫排）、quiet（安靜小字）其中之一；side 是 left、right、center', items: { type: 'object', additionalProperties: false, required: ['shot', 'template', 'side'], properties: { shot: { type: 'string' }, template: { type: 'string' }, side: { type: 'string' } } } },
  },
};
type Layout = { shot: string; template: string; side: string };
type Reply = { idea: string; src: string; sections: { index: number; order: number[] }[]; layouts?: Layout[] };

// the storyboard comes before any code: where each section is, what happens, who acts; checked by the program, then
// the code follows it (a plan is cheap to fix, a drawing is not)
const STORY_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['rule', 'story', 'signature', 'beats'],
  properties: {
    rule: { type: 'string', description: '貫穿全片的視覺規則（從歌名或概念推出）' },
    story: { type: 'string', description: '起承轉合的故事線，3–5 句' },
    signature: { type: 'string', description: '招牌轉場：從故事物件長出的轉場，開頭、中段、結尾各一次' },
    beats: {
      type: 'array', description: '每個段落（sections 的 index）一筆',
      items: {
        type: 'object', additionalProperties: false, required: ['section', 'scene', 'framing', 'heroes', 'event', 'lyricZone'],
        properties: {
          section: { type: 'integer' },
          scene: { type: 'string', description: '場景圖 id；沒有場景圖時填空字串' },
          framing: { type: 'string', description: '取景與運鏡（景別、角度、怎麼動），每段要不同' },
          heroes: { type: 'array', items: { type: 'string' }, description: '這段演出的素材 id，最多 2 個：故事物件在前，配角只在歌詞提到時才出現' },
          event: { type: 'string', description: '這段發生的事件：物件做了什麼（甩、踢、飛、碎、落下…），不是擺著' },
          lyricZone: { type: 'string', enum: ['left', 'right', 'top', 'bottom', 'center'], description: '這段畫面留給歌詞的區域' },
        },
      },
    },
  },
};
type Story = { rule: string; story: string; signature: string; beats: { section: number; scene: string; framing: string; heroes: string[]; event: string; lyricZone: string }[] };

// a revision is an edit of the code, not a rewrite: each find is a unique stretch of the current code
const EDIT_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['idea', 'edits', 'sections'],
  properties: {
    idea: { type: 'string', description: '修改後的設計想法，2–4 句' },
    edits: { type: 'array', description: '要改的地方；沒有要改就給空陣列', items: { type: 'object', additionalProperties: false, required: ['find', 'replace'], properties: { find: { type: 'string', description: '目前程式裡只出現一次的一段原文（至少一整行）' }, replace: { type: 'string' } } } },
    sections: { type: 'array', description: '圖層順序有改才填，否則空陣列', items: { type: 'object', additionalProperties: false, required: ['index', 'order'], properties: { index: { type: 'integer' }, order: { type: 'array', items: { type: 'integer' } } } } },
  },
};
type Edit = { idea: string; edits: { find: string; replace: string }[]; sections: Reply['sections'] };

// overloaded (529) and rate limits: the SDK retries with backoff; a long design run should ride them out
const client = new Anthropic({ maxRetries: 8 });
const usage = { input: 0, output: 0 };
const RETRY = /terminated|socket|ECONNRESET|ECANCELED|timed out|overloaded|529|rate_limit|429/i;
/** One streamed request, asked again after a cut stream or an overload (the SDK retries only before the stream starts). */
async function streamed(params: Anthropic.Messages.MessageStreamParams, tries = 4): Promise<Anthropic.Messages.Message> {
  try {
    return await client.messages.stream(params).finalMessage();
  } catch (e) {
    if (tries <= 1 || !RETRY.test(`${(e as Error).message} ${((e as Error).cause as Error)?.message}`)) throw e;
    console.log(`stream failed (${(e as Error).message.slice(0, 80)}), retrying`);
    await new Promise((r) => setTimeout(r, (5 - tries) * 20_000));
    return streamed(params, tries - 1);
  }
}

// the cast's drawings (character.mts, per sheet)
let imageUSD = 0;
// the check model's calls, at its own price (Sonnet 5.5: $2 / $10 per MTok)
let checkUSD = 0;
const checked = (u: Anthropic.Messages.Usage) => void (checkUSD += (u.input_tokens * 2 + u.output_tokens * 10) / 1e6);
/**
 * The run's spend cap (--budget, USD, every call counted): before each request its likely cost is reserved, and a
 * request that could pass the cap is not sent (the run stops with what it has).
 */
/** What a stop keeps (the states stage sets it to its best version so far). */
let onStop: () => void = () => {};
function guard(reserve: number) {
  const spent = (usage.input * 4 + usage.output * 20) / 1e6 + imageUSD + checkUSD;
  if (!a.budget || spent + reserve <= Number(a.budget)) return;
  console.log(`##STEP 再問一次可能超過花費上限 $${a.budget}（已花 $${spent.toFixed(2)}），停止`);
  console.log(`stopped: budget $${a.budget} (spent $${spent.toFixed(3)}, next call reserved $${reserve})`);
  onStop();
  process.exit(3);
}
// with a baseline the director refines an approved design instead of inventing a new one: the baseline sets the craft
// level, and variety comes from the camera rather than from new props
const BASELINE_RULES = `
基準設計（使用者認可）：下面附上這首歌先前那一版專屬圖層的設計想法、程式碼與成品截圖。它的場景造型、物件的細緻度與配色是這一版的「最低水準」。
18. 以基準的場景和物件為主（例如電車、冰棒、雲、貓、螢光棒、月亮），保留它們的造型與畫法，用鏡頭（取景、特寫、運鏡）創造變化。不要把好的設計換成更普通的東西。
19. 可以有人物或角色，但必須是有設計的角色：有清楚的造型特徵（髮型、服裝、表情、比例）、和場景同樣的畫法與細緻度、在每個場景裡有合理的姿勢與動作。火柴人、三角形加圓頭這種隨便的符號人一律不要；做不到這個水準就不要放人物。
20. 新增的任何物件都必須和基準一樣細緻（圓角、描邊、高光、層次、配色一致）；做不到就不要加。寧可少一個場景，也不要胡亂加素材。
21. 特寫和推近會放大物件、暴露粗糙：被放大的物件要補細節（高光、紋理、描邊、陰影），不能只是放大簡單幾何。
22. 基準裡偏空、偏弱的畫面（幾乎只有底色的）可以用同樣的畫法補強，但不要換掉整個場景的概念。`;
const sprites = a.sprites ? (JSON.parse(readFileSync(join(a.sprites, 'library.json'), 'utf8')) as { sprites: { id: string; w: number; h: number; what: string }[] }).sprites : [];
const SPRITE_RULES = `
素材庫（生圖模型設計、已去背的角色與道具，附總覽圖）：用 f.img('<id>') 取得圖片（CanvasImageSource，載入失敗時是 null，要先判斷），用 ctx.drawImage 畫。清單（id、原始像素寬高、內容）：
${sprites.map((x) => `${x.id} ${x.w}×${x.h} ${x.what}`).join('\n')}
23. 具體的東西（人物、貓、冰棒、電車、站牌、螢光棒、勳章、星星、棉花糖、吉祥物）一律用素材庫的圖，不要再用程式畫它們。程式負責背景、天空、地面、雲、光線、圖樣、幾何造型、運鏡、轉場和讓素材「演」：位置、移動路徑、換格、擠壓拉伸（以腳底為軸）、彈跳、出場與退場。
24. 素材放大不要超過原始像素的 1.3 倍（會糊）；特寫就用原尺寸附近。動作要用換格：走路用 girl.walk1→walk2→walk3 以每秒 8–10 格一頓一頓循環，配合位移；跳躍用 crouch→jump；揮手在 wave 與 stand 間切換。
${a.cast ? '25. 人物由選角步驟畫好後加入素材庫：照選角規則演（停著的姿勢、背影、特寫、狀態圖換張），不要做全身走路之類的逐格動作。' : sprites.some((x) => x.id.startsWith('girl.')) ? `25. 角色是故事的主角：少女（girl.*）貫穿全曲，帶出每段歌詞的情境（例如「進んだ一歩」就讓她一步步走），取代腳印這類看不懂的象徵；雲朵吉祥物（cloud.*）只在副歌出現當作那朵大雲的分身。貓、冰棒、電車等道具在對應的段落出場。` : '25. 不要有人物或吉祥物角色（少量動作格做出的角色動畫看起來單調、不流暢）：每個鏡頭的焦點由道具、場景和運鏡擔任，讓道具自己「演」——出場、聚集、整齊地隨拍子動作。'}
27. 素材庫優先於基準：基準裡用程式畫的貓、冰棒、電車、站牌、螢光棒、腳印、人物，全部換成素材庫的圖；基準的構圖、場景安排、配色和鏡頭保留。
26. 素材要和場景印在同一張紙上：腳下用場景的深色畫一個扁平的硬邊影子（不要模糊陰影），必要時整體 globalAlpha 0.95–1；不要加外框。素材上不要寫字；冰棒棒子上的「あたり」用程式在 pop.stick 上寫。`;
const baseline = a.baseline ? JSON.parse(readFileSync(join(a.baseline, 'codelayer.json'), 'utf8')) as { idea: string; src: string } : undefined;
const baseStills = a.baseline ? readdirSync(a.baseline).filter((f) => /^still_.*\.jpg$/.test(f)).sort((x, y) => parseFloat(x.slice(6)) - parseFloat(y.slice(6))) : [];
const notes = a.feedback ? readFileSync(a.feedback, 'utf8').trim() : '';
// how to draw this song's language in code (languages.ts craft), plus the general method every language shares
const lang = base.design?.language ? LANGUAGES[base.design.language as LanguageId] : undefined;
const RECIPES = `

這首歌的畫風「${lang?.name ?? '—'}」要畫得像真的那種材料和製作過程，而不是扁平的向量圖：
${lang ? `【畫法】${lang.craft}` : ''}
【通用畫法】
1. 由下往上分層：先用平塗把構圖和明暗擺對（大面積），再用這個畫風的「材料處理」重畫一次（筆觸、網點、刻痕、透明疊色），小物件和素材另外一層畫（不要讓大面積的處理把小東西打碎），最後補線和高光。
2. 材料的物理過程就是畫法：先想這種畫在現實裡怎麼做出來（刷版、刻木、疊透明顏料、放映膠片），把那個過程寫成程式。
3. 顏色按區域給一小組色（天、地、主體各 3–5 色），筆觸或色點從該區的色組取色，比整張隨機抖動顏色好看得多。
4. 小東西要比直覺大：在影片裡 40px 以下的細節幾乎看不見。
5. 每個鏡頭至少一個主要動作加兩三個這個畫風特有的小循環（浪頭、燈光呼吸、雲漂），讓畫是活的，而不是靜止的圖在移動。
6. 確定性：所有亂數用 f.hash 種子；重的東西（紙紋、雜訊圖、靜態背景）只算一次：存在 f.cache（每個程式一個、跨格保留的物件；內容必須只由種子決定），每格只做合成。
7. 合成的坑：在畫面上用 destination-out 會挖出透明洞（影片裡變黑），挖洞要在離屏完成再貼回；source-in／source-atop 會清掉同一畫布上不相干的東西，先在離屏畫完再合成；每格開始前重設 lineWidth、globalAlpha、composite 等狀態。`;

// lessons: the user's notes on earlier songs (Studio appends them), so a new song starts from what was learned
const lessonsFile = join('out', 'design-lessons.md');
const lessons = existsSync(lessonsFile) ? readFileSync(lessonsFile, 'utf8').trim().split('\n').slice(-40).join('\n') : '';
// the song's scene pictures: full-bleed worlds the drawing stages its props in (made by assets.mts --scenes)
const scenePics: Record<string, { kind: string; url: string }> = existsSync(join(a.dir!, 'assets', 'assets.json')) ? JSON.parse(readFileSync(join(a.dir!, 'assets', 'assets.json'), 'utf8')) : {};
// only a handmade medium carries scene pictures (languages.ts scenes); elsewhere the drawing paints its own world
const scenes = !LANGUAGES[base.design?.language as LanguageId]?.scenes ? [] : ((base.assets ?? []) as { id: string; kind: string; prompt: string }[]).filter((x) => x.kind === 'image' && scenePics[x.id] && existsSync(scenePics[x.id].url));
const SCENE_RULES = `

場景圖（生圖模型畫好的滿版場景，這首歌的「世界」）：用 f.scene('<id>') 取得（CanvasImageSource，載入失敗時是 null，要先判斷），用 ctx.drawImage 畫。清單（下面也附了縮圖）：
${scenes.map((x) => `${x.id}：${x.prompt.slice(0, 120)}`).join('\n')}
28. 每個段落用一張場景圖當背景世界：等比放大蓋滿畫面，在上面運鏡（推、移、搖、局部特寫；放大不超過 1.6 倍以免糊），素材庫的道具在場景的前景演出、參與事件。有場景圖可用時，不要再用程式的幾何圖形畫山、街道、建築、屋頂、雲和煙。場景跟著歌詞走：歌詞講到哪裡，畫面就到哪個場景；同一張場景可以在不同段落用不同取景再出現。
29. 為了歌詞清楚、全片色調一致，可以在場景上疊一層半透明的暗色或語言主色（globalCompositeOperation 'multiply' 或低透明度填色）；不要在歌詞後面畫底板。歌詞放在場景本身較暗、較空的區域。`;
// graphic languages: the component-library design underneath is the look (sweet timer v3: every code layer that
// repainted the background scored below the plain base), so the drawing only adds the story on top of it
const OVERLAY_RULES = `

這個設計語言沒有場景圖：畫面的背景、版面、色塊、紙紋、網點、印章都由底層設計負責，而且已經是驗收過的水準。
28. 專屬圖層只疊在底層上面，負責讓道具演出故事（物件進場、移動到底層的圓窗或色塊裡、互動、被翻開帶出下一段），不要重畫背景：不要畫天空、地面、地平線、山、街道、建築，也不要畫任何超過畫面三分之一的不透明色塊或漸層。
29. 畫面大部分時間要看得到底層設計；專屬圖層的東西加起來最多佔畫面四分之一。`;
const sceneSheet = scenes.flatMap((x) => {
  const jpg = join(work, `scene_${x.id}.jpg`);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', scenePics[x.id].url, '-vf', 'scale=480:-1', '-q:v', '5', jpg]);
  return [{ type: 'text' as const, text: `場景 ${x.id}：` }, { type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data: readFileSync(jpg).toString('base64') } }];
});
// what designers do in backgrounds, transitions, interludes and camera (knowledge.mts), to pick from per song
const toolboxFile = join('out', 'knowledge', 'toolbox.md');
const TOOLBOX = existsSync(toolboxFile) ? `\n\n設計師常用手法（從大量設計師做的歌詞 MV 整理出來；依這首歌挑適合的，背景、轉場、過門、鏡頭的部分由你這一層做）：\n${readFileSync(toolboxFile, 'utf8')}` : '';
// full scene: the drawing answers for the whole picture, so it may lay out the whole picture (a flat language stays flat)
const FULL_SCENE_RULES = `

完整場景模式：這一層負責整個畫面，畫面好不好看由你負責。
28. 你可以拿掉元件庫的所有圖層，只留底色（sections 的 order 給 [0, -1]）：條紋、照片框、裝飾都可以不要；背景、版面、色面、遮擋、轉換都由你畫。
29. 平面的設計語言可以維持平面（不必畫成立體場景），但構圖、主從、留白和事件要由你安排；照這個語言的材料畫法（紙紋、網點、疊印等）。
30. 歌詞也是畫面的一部分：用 layouts 決定每個鏡頭的歌詞排法（vertical 直排／stair 階梯橫排／quiet 安靜小字，放 left、right 或 center），主角放在另一側，字不要切過人物的臉和身體。`;
const intro = `${RULES}${RECIPES}${TOOLBOX}${lessons ? `\n\n使用者對之前其他歌的意見（通用的部分都適用這首）：\n${lessons}` : ''}${baseline ? BASELINE_RULES : ''}${sprites.length ? SPRITE_RULES : ''}${a['full-scene'] ? FULL_SCENE_RULES : scenes.length ? SCENE_RULES : OVERLAY_RULES}${notes ? `\n\n使用者對上一版的意見（必須照做）：\n${notes}` : ''}\n\n這首歌的資料：\n${JSON.stringify(brief)}`;
const spriteSheet = a.sprites
  ? [{ type: 'text' as const, text: '素材庫總覽（每張下面是 id）：' }, { type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data: readFileSync(join(a.sprites, 'contact.jpg')).toString('base64') } }]
  : [];
// the language's style kit: the user-approved song in this language is the bar for texture and craft (sweet timer v2
// shipped a purple gradient with clip-art props because nothing showed the director what this look must feel like)
const kitFile = join('scripts/lyric-vj/references/kits', `${base.design?.language}.jpg`);
const kit = lang?.kit && existsSync(kitFile) ? { ...lang.kit, image: readFileSync(kitFile).toString('base64') } : undefined;
const kitSheet = kit
  ? [
    { type: 'text' as const, text: `質感基準（同一個設計語言、使用者驗收通過的作品：${kit.song}）。這首歌的故事、配色、場景都要不同，但材質、手感、完成度要達到這個水準：${kit.craft}\n專屬圖層畫在這首歌的紙紋／網點等底層之上：不要用不透明的滿版背景把底層蓋掉。` },
    { type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data: kit.image } },
  ]
  : [];
const messages: Anthropic.Messages.MessageParam[] = [{
  role: 'user',
  content: baseline
    ? [
      { type: 'text', text: intro },
      { type: 'text', text: `基準設計的想法：${baseline.idea}\n\n基準設計的程式碼：\n${baseline.src}\n\n基準設計的成品截圖，時間依序為 ${baseStills.map((f) => parseFloat(f.slice(6))).join('、')} 秒：` },
      ...baseStills.map((f) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data: readFileSync(join(a.baseline!, f)).toString('base64') } })),
      ...kitSheet,
      ...spriteSheet,
      ...sceneSheet,
    ]
    : [{ type: 'text', text: intro }, ...kitSheet, ...spriteSheet, ...sceneSheet],
}];
/** The first draft is planned at high effort; revisions are edits at medium (planning and judging cost more than editing). */
async function ask(effort: Effort = 'medium', tries = 4): Promise<Reply> {
  return call<Reply>(SCHEMA, effort, tries);
}

/** One director turn in the running conversation, answered in the given schema (retries cut streams and overloads). */
// output (mostly thinking) was most of a segment's cost: an edit at medium thought for ~29k tokens ($0.58)
type Effort = 'high' | 'medium' | 'low';
async function call<T>(schema: object, effort: Effort = 'medium', tries = 4): Promise<T> {
  guard(0.9);
  const msg = await client.messages
    // the conversation is resent every round (rules, toolbox, stills): cached for an hour, since renders and checks run between turns
    .stream({ model: a.model!, max_tokens: 128000, system: SYSTEM, messages, cache_control: { type: 'ephemeral', ttl: '1h' }, output_config: { effort, format: { type: 'json_schema', schema } } } as Anthropic.Messages.MessageStreamParams)
    .finalMessage()
    // the SDK retries failed requests but not a stream cut mid-way (a long plan streams for many minutes)
    .catch((e: Error) => {
      // a stream cut mid-way, or an overload / rate limit reported inside the stream: wait, then ask again
      if (tries <= 1 || !RETRY.test(`${e.message} ${(e.cause as Error)?.message}`)) throw e;
      console.log(`stream failed (${e.message.slice(0, 80)}), retrying`);
      step(`連線中斷或伺服器忙碌，${(5 - tries) * 20} 秒後自動重試（不用處理）`);
      return undefined;
    });
  if (!msg) {
    await new Promise((r) => setTimeout(r, (5 - tries) * 20_000));
    return call<T>(schema, effort, tries - 1);
  }
  // counted as uncached input: an hour's cache write bills 2×, a read 0.05× (Opus 5.5)
  usage.input += msg.usage.input_tokens + 2 * (msg.usage.cache_creation_input_tokens ?? 0) + 0.05 * (msg.usage.cache_read_input_tokens ?? 0);
  usage.output += msg.usage.output_tokens;
  const u = msg.usage;
  console.log(`call: in ${u.input_tokens} write ${u.cache_creation_input_tokens ?? 0} read ${u.cache_read_input_tokens ?? 0} out ${u.output_tokens} $${((u.input_tokens * 4 + 8 * (u.cache_creation_input_tokens ?? 0) + 0.2 * (u.cache_read_input_tokens ?? 0) + u.output_tokens * 20) / 1e6).toFixed(2)}`);
  // a high-effort plan can think past the output limit; plan again at medium before giving up
  if (msg.stop_reason === 'max_tokens' && effort === 'high') return console.log('ran out of tokens at high effort, retrying at medium'), step('想得太長，改用精簡模式重寫'), call<T>(schema, 'medium');
  if (msg.stop_reason === 'max_tokens') throw new Error('director ran out of tokens');
  messages.push({ role: 'assistant', content: msg.content as Anthropic.Messages.ContentBlockParam[] });
  const text = msg.content.find((b) => b.type === 'text')?.text ?? '';
  return JSON.parse(text);
}

/** The treatment with the code layer placed per section. */
function apply(r: Reply) {
  const t = structuredClone(base);
  t.graphics.sections = sections.map((s, i) => {
    const order = r.sections.find((x) => x.index === i)?.order ?? [0, -1, ...s.layers.slice(1).map((_, j) => j + 1)];
    const field = order[0] === 0 ? order : [0, ...order.filter((x) => x !== 0)];
    const code = { kind: 'code', src: r.src, cuts };
    const layers = field.map((j) => (j === -1 ? code : s.layers[j])).filter(Boolean);
    // a section the drawing lays out alone (ground and code) drops the layers the signature had set aside too, or the
    // signature puts them back under the drawing (an orange rail across 黄昏サイクル's eye)
    const { sigRemoved, ...rest } = s as typeof s & { sigRemoved?: unknown };
    const alone = field.every((j) => j === -1 || j === 0);
    return { ...(alone ? rest : { ...rest, sigRemoved }), layers: layers.some((l) => l.kind === 'code') ? layers : [...layers, code] };
  });
  // the lyric layouts the drawing composed around (full scene): vertical / stair / quiet, on a side
  for (const l of r.layouts ?? []) {
    // an id, or a number counting the lyric shots (the director wrote 0 and 1 for s24 and s25)
    const shot = t.shots.find((x: { id: string }) => x.id === l.shot) ?? (/^\d+$/.test(l.shot) ? t.shots[Number(l.shot)] : undefined);
    if (!shot || !['vertical', 'stair', 'quiet'].includes(l.template)) continue;
    const side = ['left', 'right', 'center'].includes(l.side) ? l.side : 'left';
    shot.template = l.template;
    shot.params = l.template === 'vertical' ? { position: side, dim: 0, step: 0.6, lift: 60 } : l.template === 'stair' ? { side: side === 'center' ? 'right' : side, dim: 0 } : { position: side === 'right' ? 'auto' : side, dim: 0 };
  }
  return t;
}

// stills across the song: a verse, the first drop, an interlude, the finale
const drop = base.moments.find((m: { kind: string }) => m.kind === 'drop')?.at ?? W0 + (W1 - W0) * 0.3;
const fin = base.moments.find((m: { kind: string }) => m.kind === 'finale')?.at ?? W0 + (W1 - W0) * 0.75;
// review stills: one inside each of 12 shots spread over the song (the drop and finale among them), so the director
// sees its camera work, not one framing per section
const mid = (i: number) => { const c = [W0, ...cuts, W1]; return (c[i] + c[i + 1]) / 2; };
const picks = [...new Set([...Array.from({ length: 10 }, (_, k) => Math.round((k * cuts.length) / 9)), cuts.findIndex((c) => c > drop), cuts.findIndex((c) => c > fin)].filter((i) => i >= 0 && i <= cuts.length))].sort((x, y) => x - y);
const times = picks.map((i) => +Math.min(W1 - 0.5, mid(i)).toFixed(2));

// pictures may still be generating (Studio runs both at once): test renders go without them then; the sprite library
// joins them in one manifest
const songPics = join(a.dir!, 'assets', 'assets.json');
const pics = join(out, 'assets.merged.json');
// the cast a stopped run drew (codelayer/cast.json) stays in the manifest: a resumed run builds on those drawings
const castFile = join(work, 'cast.json');
const castKept = existsSync(castFile) && existsSync(pics) ? (() => {
  const prev = JSON.parse(readFileSync(pics, 'utf8'));
  return Object.fromEntries((JSON.parse(readFileSync(castFile, 'utf8')).added as { id: string }[]).filter((x) => prev[`spr:${x.id}`]).map((x) => [`spr:${x.id}`, prev[`spr:${x.id}`]]));
})() : {};
writeFileSync(pics, JSON.stringify({
  ...castKept,
  ...(existsSync(songPics) ? JSON.parse(readFileSync(songPics, 'utf8')) : {}),
  ...(a.sprites ? JSON.parse(readFileSync(join(a.sprites, 'assets.json'), 'utf8')) : {}),
}));

// every shot's middle and 0.3 s later, background only: how much moves and how much is more than the ground colour
/** The lowest final review score a drawing may ship with: below it the run fails instead of handing over a video. */
const PASS = 75;
const shotMids = (() => { const c = [W0, ...cuts, W1]; return c.slice(0, -1).map((x, i) => +((x + c[i + 1]) / 2).toFixed(2)); })();
const REVIEW_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['verdict', 'score', 'issues'],
  properties: {
    verdict: { type: 'string', description: '整體評語，2–3 句' },
    score: { type: 'integer', description: `0–100。80＝設計師等級、付費的人會滿意；${PASS}＝最低可交付；60＝看得出是模板或 AI、質感不足（大片空底色、通用貼圖、沒有材質）；照實打，不要客氣` },
    issues: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['shot', 'problem', 'fix'], properties: { shot: { type: 'integer' }, problem: { type: 'string' }, fix: { type: 'string' } } } },
  },
};
type Review = { verdict: string; score: number; issues: { shot: number; problem: string; fix: string }[] };

/**
 * Renders the drawing and measures it. The renders (review stills, lyric-cover stills, per-shot background pairs,
 * transition strips, jump pairs) run at once. Problems are what the director must fix: render errors, sprites over
 * the lyrics, and the checks that used to come back as review notes — a flat slab over the frame, a washed-out grey
 * frame, a story that sits in one scene or never visits some.
 */
/** Deletes the rounds' continuity, jump, transition and ghost renders; the drawing and review stills stay. */
function sweepChecks() {
  for (const d of existsSync(work) ? readdirSync(work) : []) if (/^(track|jump|trans|ghost)_r\d+$/.test(d)) rmSync(join(work, d), { recursive: true, force: true });
}

async function test(r: Reply, round: number) {
  // earlier rounds' check renders (~1 GB each) are never read again: three rounds of them filled the disk mid-run
  sweepChecks();
  const file = join(work, `treatment_r${round}.json`);
  writeFileSync(file, JSON.stringify(apply(r)));
  const dir = join(work, `stills_r${round}`);
  const once = (stills: number[], out: string, extra: string[] = []) =>
    new Promise<string>((resolve) => {
      // both streams: the renderer reports code-layer problems on stderr, also when the render succeeds
      const p = spawn('npx', ['tsx', 'scripts/lyric-vj/render.mts', '--song', a.song!, '--treatment', file, ...(existsSync(pics) ? ['--assets', pics] : []), '--start', String(W0), '--end', String(W1), '--stills', stills.map((x) => x.toFixed(2)).join(','), '--out', out, ...extra]);
      let log = '';
      p.stdout.on('data', (d) => (log += d));
      p.stderr.on('data', (d) => (log += d));
      p.on('close', () => resolve(log));
      p.on('error', (e) => resolve(`${log}\n${e.message}`));
    });
  // six renders run at once and one sometimes dies loading (fonts on a slow network): the stills it left out get one
  // more try, and whatever is still missing is skipped by the checks below
  const render = async (stills: number[], out: string, extra: string[] = []) => {
    const log = await once(stills, out, extra);
    // missing, or cut short (a render that died while writing leaves a broken file behind)
    const missing = stills.filter((x) => { const f = join(out, `still_${x.toFixed(2)}.png`); return !existsSync(f) || statSync(f).size < 2000; });
    return missing.length ? `${log}\n${await once(missing, out, extra)}` : log;
  };
  // the middle of every lyric line, rendered only to let the renderer measure sprites hiding the lyric
  const mids = cues.map((c: { start: number; end: number }) => +((c.start + c.end) / 2).toFixed(2));
  const qaDir = join(work, `qa_r${round}`);
  // transitions: three cuts across the song, a strip of frames through each (0.1 s before to 0.45 s after)
  const tcuts = [cuts[Math.floor(cuts.length * 0.2)], cuts[Math.floor(cuts.length * 0.5)], cuts[Math.floor(cuts.length * 0.8)]].filter((x) => x !== undefined);
  const offs = [-0.1, 0.1, 0.25, 0.45];
  const tDir = join(work, `trans_r${round}`);
  // jumps: 1/30 s pairs where each lyric line appears (a drawing that makes room by snapping jumps right there)
  const jDir = join(work, `jump_r${round}`);
  const jTimes = cues.map((c: { start: number }) => +(c.start - 0.2).toFixed(2)).filter((x: number) => x > 0.5 && !cuts.some((c) => Math.abs(c - x) < 0.15));
  // continuity: around every shot's middle, six samples (two of them one frame apart) with each sprite's box logged
  const cSec = 1 / 30;
  const trackTimes = shotMids.flatMap((m, i) => {
    const [a0, b0] = [i ? cuts[i - 1] : W0, i < cuts.length ? cuts[i] : W1];
    return [m - 0.5, m - 0.25, m, m + cSec, m + 0.25, m + 0.5].filter((x) => x > a0 + 0.05 && x < b0 - 0.05);
  });
  const [log, coverLog, qaLog, , , trackLog] = await Promise.all([
    render(times, dir),
    render(mids, join(work, `cover_r${round}`)),
    render(shotMids.flatMap((x) => [x, x + 0.3]), qaDir, ['--layer', 'back']),
    render(tcuts.flatMap((c) => offs.map((o) => c + o)), tDir),
    render(jTimes.flatMap((x: number) => [x, x + 0.03]), jDir, ['--layer', 'back']),
    render(trackTimes, join(work, `track_r${round}`), ['--layer', 'back', '--track']),
  ]);
  const cont = continuity(parseTrack(trackLog), cSec);
  const lines = [...log.split('\n'), ...coverLog.split('\n'), ...qaLog.split('\n')];
  const problems = [...new Set(lines.filter((l) => /code layer:|page error:/.test(l) && !l.includes('scene-use') && !l.includes('code layer: track')))];
  // props that jump, pop, swell or sit on each other inside a shot (the user's complaints on sweet timer)
  problems.push(...cont.hard.slice(0, 20).map((x) => `物件不連續：${x}`));
  // a render that failed (a slow network while the page loaded its fonts) is tried once more; a still that is still
  // missing is left out rather than ending the run
  const stillOf = (x: number) => join(dir, `still_${x.toFixed(2)}.png`);
  const images = times.filter((x) => existsSync(stillOf(x))).map((x) => {
    const jpg = join(dir, `s_${x.toFixed(2)}.jpg`);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', stillOf(x), '-vf', 'scale=960:-1', '-q:v', '4', jpg]);
    return readFileSync(jpg).toString('base64');
  });
  if (!images.length) throw new Error('檢查畫面全部渲染失敗');
  // shot QA on the background alone (lyrics would count as motion)
  const qaFile = join(qaDir, 'qa.json');
  execFileSync('uv', ['run', '-q', '--with', 'numpy', '--with', 'pillow', 'python', 'scripts/lyric-vj/shot_qa.py', qaDir, shotMids.map((x) => x.toFixed(2)).join(','), qaFile], { stdio: ['ignore', 'ignore', 'inherit'] });
  const qa: { shot: number; t: number; motion: number; detail: number; flat: number; spread: number; sat: number }[] = JSON.parse(readFileSync(qaFile, 'utf8'));
  const weak = qa.filter((x) => x.motion < 0.02 || x.detail < 0.08).map((x) => `鏡頭 ${x.shot}：${x.motion < 0.02 ? `幾乎不動（${(x.motion * 100).toFixed(1)}% 的畫面在 0.3 秒內有變化）` : ''}${x.detail < 0.08 ? `偏空（只有 ${(x.detail * 100).toFixed(1)}% 的畫面不是底色）` : ''}`);
  // with scene pictures, a frame mostly one flat colour is a slab over the scene, and a low-spread low-saturation
  // frame is a grey wash over it (both came back from review as "covers the scene" on 雙截棍)
  if (scenes.length)
    for (const x of qa) {
      if (x.flat > 0.45) problems.push(`鏡頭 ${x.shot}（${x.t} 秒）：一塊單色蓋住畫面 ${Math.round(x.flat * 100)}%（色塊／底板），拿掉或縮小，讓場景露出來`);
      else if (x.spread < 0.09 && x.sat < 0.12) problems.push(`鏡頭 ${x.shot}（${x.t} 秒）：畫面灰濛濛（明暗與飽和度都太低），拿掉灰色覆蓋層，保持場景原本的濃度`);
    }
  // scene rotation: which scene each shot shows (reported by the renderer)
  if (scenes.length >= 3) {
    const byShot = new Map<number, string>();
    for (const l of qaLog.split('\n')) {
      const m = /scene-use (\d+) (\S+)/.exec(l);
      if (m) byShot.set(Number(m[1]), m[2].split(',')[0]);
    }
    const order = [...byShot.entries()].sort((x, y) => x[0] - y[0]).map(([, id]) => id);
    const unused = scenes.map((x) => x.id).filter((id) => !order.includes(id));
    if (unused.length > Math.floor(scenes.length / 3)) problems.push(`這些場景完全沒用到：${unused.join('、')}（故事要走過它們）`);
    let run = 1;
    for (let i = 1; i < order.length; i++) {
      run = order[i] === order[i - 1] ? run + 1 : 1;
      if (run === 5) problems.push(`場景 ${order[i]} 連續用了 5 個以上的鏡頭（到第 ${i} 個），故事沒有往前走：換場景或明顯換取景`);
    }
    const blank = [...Array(shotMids.length).keys()].filter((k) => !byShot.has(k));
    if (blank.length > shotMids.length / 3) problems.push(`有 ${blank.length} 個鏡頭沒有用任何場景圖（只有程式畫的底）：${blank.slice(0, 8).join('、')}`);
  }
  const strips = tcuts.flatMap((c) => {
    const frames = offs.map((o) => join(tDir, `still_${(c + o).toFixed(2)}.png`)).filter((f) => existsSync(f));
    if (frames.length < 2) return [];
    const jpg = join(tDir, `strip_${c.toFixed(2)}.jpg`);
    execFileSync('ffmpeg', ['-v', 'error', '-y', ...frames.flatMap((f) => ['-i', f]), '-filter_complex', `${frames.map((_, i) => `[${i}]scale=480:-1[s${i}]`).join(';')};${frames.map((_, i) => `[s${i}]`).join('')}hstack=${frames.length}`, '-q:v', '4', jpg]);
    return [readFileSync(jpg).toString('base64')];
  });
  const jFile = join(jDir, 'jumps.json');
  try {
    execFileSync('uv', ['run', '-q', '--with', 'numpy', '--with', 'pillow', 'python', 'scripts/lyric-vj/jump_qa.py', jDir, jTimes.map((x: number) => x.toFixed(2)).join(','), jFile], { stdio: ['ignore', 'ignore', 'inherit'] });
  } catch {
    /* a missing still: no jump report this round */
  }
  const jumps: string[] = existsSync(jFile) ? (JSON.parse(readFileSync(jFile, 'utf8')) as { t: number; diff: number }[]).filter((x) => x.diff > 4).map((x) => `${x.t.toFixed(2)} 秒（一格之內畫面變了 ${x.diff.toFixed(1)}）`) : [];
  return { file, problems, images, weak: [...weak, ...jumps.map((j) => `歌詞出現時物件瞬間跳動：${j}`), ...cont.bob.slice(0, 10)], strips, tcuts };
}

/** A reviewer who did not make it: sees only the stills, the brief and the user's standards. */
async function review(images: string[], weak: string[], strips: string[], tcuts: number[]): Promise<Review> {
  guard(0.4);
  const msg = await streamed({
      model: a.model!, max_tokens: 16000,
      system: '你是嚴格的 MV 審片總監，沒有參與這支片的製作。你只看成品截圖，指出會讓觀眾覺得粗糙、普通、像模板或 AI 做的地方，以及看不清楚歌詞的地方。',
      messages: [{
        role: 'user', content: [
          { type: 'text', text: `這是一首歌的歌詞 VJ 背景動畫（歌詞疊在上面）。概念：${base.concept}\n使用者的標準：設計師等級（目標 80/100）；歌詞永遠清楚；不要大色塊閃爍、不要歌詞底板；物件和人物要有設計感、不能隨便畫；鏡頭要多且大膽；每首歌獨一無二；要有故事性（每段是故事裡的一個事件，物件參與事件），道具在地面排成一列橫移、或用幾何圖形拼湊的具體物件（浪、山、動物）都是嚴重問題；要看得出是這個設計語言（不是通用的扁平插畫）。${notes ? `\n使用者對上一版的意見：\n${notes}` : ''}\n量測（只看背景）可能有問題的鏡頭：${weak.length ? weak.join('；') : '無'}\n以下截圖時間依序為 ${times.join('、')} 秒，分別是鏡頭 ${picks.join('、')}。列出最重要的問題（最多 10 條，最嚴重的先），每條寫哪個鏡頭、問題、具體怎麼改。` },
          ...images.map((data) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data } })),
          ...(kit ? [{ type: 'text' as const, text: `對照：這是同一個設計語言、使用者驗收通過的作品（${kit.song}）。故事不同沒關係，但材質、手感、完成度明顯不如它（例如沒有紙紋網點、大片空底色、通用貼圖）就是不及格，分數要反映出來。這個語言該有的樣子：${kit.craft}` }, { type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data: kit.image } }] : []),
          { type: 'text', text: `以下 ${strips.length} 條是轉場（${tcuts.map((x) => x.toFixed(1)).join('、')} 秒的切點，每條由左到右是切點前 0.1 秒、後 0.1、0.25、0.45 秒）：好的轉場用下一個場景的招牌元素帶出下一場（從畫面裡的物件長出、擴張、甩過去），或是乾淨的硬切；滿版色塊掃過、普通的推入／滑入／淡入淡出都算問題。` },
          ...strips.map((data) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data } })),
        ],
      }],
      output_config: { effort: 'high', format: { type: 'json_schema', schema: REVIEW_SCHEMA } },
    } as Anthropic.Messages.MessageStreamParams);
  usage.input += msg.usage.input_tokens;
  usage.output += msg.usage.output_tokens;
  return JSON.parse(msg.content.find((b) => b.type === 'text')?.text ?? '{"verdict":"","issues":[]}');
}

/**
 * A second reader tries to refute each review issue against the same frames: an issue that is
 * wrong, invisible at normal speed, or whose fix would make things worse is dropped before the director acts on it.
 */
async function verify(rv: Review, images: string[], strips: string[]): Promise<Review> {
  guard(0.2);
  if (!rv.issues.length) return rv;
  const msg = await streamed({
      model: a.model!, max_tokens: 8000,
      system: '你是審片意見的查核者。你的工作是試著推翻每一條意見：對照截圖，判斷它是否真的存在、正常播放時看不看得出來、照它改會不會更好。只保留站得住的意見。',
      messages: [{
        role: 'user', content: [
          { type: 'text', text: `審片意見（編號從 0 開始）：\n${rv.issues.map((x, i) => `${i}. 鏡頭 ${x.shot}：${x.problem} → ${x.fix}`).join('\n')}\n\n以下是同一批截圖（時間依序 ${times.join('、')} 秒，鏡頭 ${picks.join('、')}）與轉場條。回傳要保留的編號。` },
          ...[...images, ...strips].map((data) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data } })),
        ],
      }],
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: { type: 'object', additionalProperties: false, required: ['keep'], properties: { keep: { type: 'array', items: { type: 'integer' } } } } } },
    } as Anthropic.Messages.MessageStreamParams);
  usage.input += msg.usage.input_tokens;
  usage.output += msg.usage.output_tokens;
  const keep = new Set<number>(JSON.parse(msg.content.find((b) => b.type === 'text')?.text ?? '{"keep":[]}').keep ?? []);
  const kept = rv.issues.filter((_, i) => keep.has(i));
  console.log(`verify: kept ${kept.length}/${rv.issues.length} review issues`);
  return { ...rv, issues: kept.length ? kept : rv.issues.slice(0, 3) };
}

const began = Date.now();
/** What the run is doing, in words for the person waiting (Studio shows it under the progress bar). */
const step = (what: string) => console.log(`##STEP ${what}`);

/** Program checks on a storyboard: every section planned, real scenes and props, the story moving through scenes. */
function checkStory(st: Story): string[] {
  const errs: string[] = [];
  const ids = new Set(sprites.map((x) => x.id));
  const sceneIds = new Set(scenes.map((x) => x.id));
  const missing = sections.map((_, i) => i).filter((i) => !st.beats.some((b) => b.section === i));
  if (missing.length) errs.push(`這些段落沒有分鏡：${missing.join('、')}`);
  for (const b of st.beats) {
    if (scenes.length && !sceneIds.has(b.scene)) errs.push(`段落 ${b.section} 的場景 ${b.scene || '（空）'} 不存在，請從場景清單選`);
    if (b.heroes.length > 2) errs.push(`段落 ${b.section} 用了 ${b.heroes.length} 個素材：每段最多 2 個（故事物件加一個配角），太多會像貼紙拼貼`);
    const bad = b.heroes.filter((h) => !ids.has(h));
    if (bad.length) errs.push(`段落 ${b.section} 的素材 ${bad.join('、')} 不在素材庫`);
    if (!b.event.trim() || /^(無|沒有|none)$/i.test(b.event.trim())) errs.push(`段落 ${b.section} 沒有事件：每段要有物件做的事`);
  }
  if (scenes.length >= 3) {
    const order = [...st.beats].sort((x, y) => x.section - y.section).map((b) => b.scene);
    const used = new Set(order);
    if (used.size < Math.min(scenes.length, Math.ceil(sections.length / 2))) errs.push(`只用了 ${used.size} 個場景，至少要走過 ${Math.min(scenes.length, Math.ceil(sections.length / 2))} 個（場景清單：${scenes.map((x) => x.id).join('、')}）`);
    for (let i = 2; i < order.length; i++) if (order[i] === order[i - 1] && order[i] === order[i - 2]) errs.push(`段落 ${i - 2}–${i} 連續三段都在場景 ${order[i]}，故事要往前走`);
    const frames = st.beats.map((b) => b.framing.trim());
    if (new Set(frames).size < frames.length * 0.7) errs.push('很多段落的取景寫得一樣：每段的景別、角度或運鏡要不同');
  }
  return errs;
}

/** Applies an edit to the code; the finds that do not match exactly once come back as errors. */
function applyEdits(cur: Reply, e: Edit): { next: Reply; errs: string[] } {
  let src = cur.src;
  const errs: string[] = [];
  for (const [k, x] of e.edits.entries()) {
    const n = x.find ? src.split(x.find).length - 1 : 0;
    if (n !== 1) {
      errs.push(`第 ${k + 1} 個修改的 find ${n === 0 ? '在目前程式裡找不到' : `出現了 ${n} 次`}：${x.find.slice(0, 80)}`);
      continue;
    }
    src = src.replace(x.find, () => x.replace);
  }
  return { next: { idea: e.idea || cur.idea, src, sections: e.sections.length ? e.sections : cur.sections, layouts: cur.layouts }, errs };
}

/** A revision as edits; finds that miss are sent back once, then the director rewrites in full. */
async function revise(cur: Reply): Promise<Reply> {
  let e = await call<Edit>(EDIT_SCHEMA, 'low');
  let { next, errs } = applyEdits(cur, e);
  if (errs.length) {
    messages.push({ role: 'user', content: `這些修改套不上（find 必須是目前程式裡原樣只出現一次的一段）：\n${errs.join('\n')}\n請重新給這幾個修改（其他已經套上了，不要重複）。` });
    e = await call<Edit>(EDIT_SCHEMA, 'low');
    ({ next, errs } = applyEdits(next, e));
  }
  if (errs.length) {
    messages.push({ role: 'user', content: '修改還是套不上：請直接回傳修改後的完整程式。' });
    return ask();
  }
  return next;
}

// ---- key states (--states): the event's states, planned with times, rendered by the real renderer at those times and
// judged by someone who did not make them — is each state there, can a viewer tell what it is, and does one become
// the next — before any other check (a plan said "the eye closes" and no frame ever showed it)
const STATES_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['event', 'states'],
  properties: {
    event: { type: 'string', description: '這段要演出的那一個事件，一句話（歌詞本身講的事）' },
    states: { type: 'array', description: '事件的 3 個狀態：前、中、後，時間由小到大', items: { type: 'object', additionalProperties: false, required: ['at', 'what', 'look'], properties: { at: { type: 'number', description: '秒（歌曲時間）' }, what: { type: 'string', description: '這一刻的狀態' }, look: { type: 'string', description: '觀眾在畫面上靠什麼認出這個狀態：具體的形狀、位置、大小、明暗、顏色' } } } },
  },
};
type States = { event: string; states: { at: number; what: string; look: string }[] };
const JUDGE_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['states', 'moves'],
  properties: {
    states: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['index', 'present', 'readable', 'why'], properties: { index: { type: 'integer' }, present: { type: 'boolean', description: '畫面上真的有 look 描述的東西' }, readable: { type: 'boolean', description: '沒看過說明的觀眾，看這張畫面就認得出這個狀態' }, why: { type: 'string', description: '看到了什麼、缺什麼' } } } },
    moves: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['from', 'gradual', 'why'], properties: { from: { type: 'integer', description: '從第幾個狀態到下一個' }, gradual: { type: 'boolean', description: '連續格裡看得出一個狀態逐漸變成下一個（不是突然換一張圖）' }, why: { type: 'string' } } } },
    layout: { type: 'array', description: '構圖問題（沒有就給空陣列）：線條、色塊或物件切過人物的臉或身體、壓住歌詞；歌詞和底色對比不足看不清楚；畫面有大片空白、主角太小（主要人物不到畫面高度的一半就算太小）或被擠到邊緣、一半出框；兩個人物分不清誰是誰', items: { type: 'object', additionalProperties: false, required: ['at', 'problem', 'severe'], properties: { at: { type: 'number', description: '哪一張（秒）' }, problem: { type: 'string', description: '具體在畫面哪裡、什麼問題、怎麼改' }, severe: { type: 'boolean', description: '嚴重：觀眾會直接看壞——歌詞被擋住或看不清、人物的臉被切過或出框、分不清誰是誰。其他（留白偏多、人物偏小、位置不夠好）不算嚴重' } } } },
  },
};
type Judge = { blind?: string; states: { index: number; present: boolean; readable: boolean; why: string }[]; moves: { from: number; gradual: boolean; why: string }[]; layout: { at: number; problem: string; severe: boolean }[] };

/** The director plans the event's states after the storyboard (checked: three, in order, inside the window). */
async function planStates(recast = false): Promise<States> {
  step(recast ? '選角後，導演用畫好的人物重寫三個狀態' : '導演寫出事件的前、中、後三個狀態和時間點');
  messages.push({ role: 'user', content: `${recast ? '人物和狀態圖已經畫好：照實際畫出來的人物和狀態圖重寫三個狀態（what 和 look 都用畫好的東西描述，例如誰出現、哪一張狀態圖），不要再用選角前的設定。' : ''}第 1.5 步：這段只演一個事件。寫出它的 3 個狀態（前、中、後）：每個狀態的時間點（${W0.toFixed(1)}–${W1.toFixed(1)} 秒之間，由小到大）、這一刻是什麼狀態、觀眾在畫面上靠什麼認出它。` });
  let st = await call<States>(STATES_SCHEMA, 'medium');
  for (let k = 0; k < 2; k++) {
    const t = st.states.map((x) => x.at);
    const errs = [
      ...(st.states.length !== 3 ? [`要剛好 3 個狀態（現在 ${st.states.length} 個）`] : []),
      ...(t.some((x) => x < W0 + 0.3 || x > W1 - 0.3) ? [`時間點要在 ${(W0 + 0.3).toFixed(1)}–${(W1 - 0.3).toFixed(1)} 秒之間`] : []),
      ...(t.some((x, i) => i && x - t[i - 1] < 1) ? ['狀態之間至少隔 1 秒，時間由小到大'] : []),
    ];
    if (!errs.length) break;
    messages.push({ role: 'user', content: `狀態要修正：\n${errs.map((x) => `- ${x}`).join('\n')}` });
    st = await call<States>(STATES_SCHEMA, 'medium');
  }
  console.log(`event: ${st.event} | ${st.states.map((x) => `${x.at}s ${x.what}`).join(' → ')}`);
  writeFileSync(join(work, 'states.json'), JSON.stringify(st, null, 1));
  return st;
}

/** Stills of the drawing at the given times, by the same renderer the video uses; jpg base64 by time. */
async function stillsAt(r: Reply, stills: number[], out: string): Promise<Record<string, string>> {
  const file = join(work, 'treatment_states.json');
  writeFileSync(file, JSON.stringify(apply(r)));
  rmSync(out, { recursive: true, force: true });
  await new Promise<void>((resolve) => {
    const p = spawn('npx', ['tsx', 'scripts/lyric-vj/render.mts', '--song', a.song!, '--treatment', file, ...(existsSync(pics) ? ['--assets', pics] : []), '--start', String(W0), '--end', String(W1), '--stills', stills.map((x) => x.toFixed(2)).join(','), '--out', out]);
    p.on('close', () => resolve());
    p.on('error', () => resolve());
  });
  const got: Record<string, string> = {};
  for (const t of stills) {
    const png = join(out, `still_${t.toFixed(2)}.png`);
    if (!existsSync(png)) continue;
    const jpg = png.replace(/\.png$/, '.jpg');
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', png, '-vf', 'scale=960:-1', '-q:v', '4', jpg]);
    got[t.toFixed(2)] = readFileSync(jpg).toString('base64');
  }
  return got;
}

/** Each state's still and the frames between consecutive states, judged by a reviewer who did not make them. */
async function judgeStates(r: Reply, st: States, k: number): Promise<{ judge: Judge; pass: number; total: number; images: string[] }> {
  const t = st.states.map((x) => x.at);
  const between = t.slice(0, -1).flatMap((x, i) => [0.2, 0.4, 0.6, 0.8].map((u) => +(x + (t[i + 1] - x) * u).toFixed(2)));
  const all = [...t, ...between].sort((x, y) => x - y);
  const got = await stillsAt(r, all, join(work, `states_r${k}`));
  const at = (x: number) => got[x.toFixed(2)];
  // 1. a viewer told nothing: what happens in these frames (the intent must not leak into what is "seen")
  guard(0.2);
  const seen = await streamed({ model: a['check-model']!, max_tokens: 6000, system: '你是第一次看這支 MV 的觀眾。你沒有任何說明，只看畫面。', messages: [{ role: 'user', content: [
      { type: 'text', text: `這是一支歌詞 MV 裡連續 ${all.length} 個時間點的畫面（依時間順序，秒數標在每張前面）。請回答：每張畫面看到什麼；連起來發生了什麼事；最後出現的東西或人讓你想到什麼、和前面的畫面有什麼關係、靠哪些線索判斷；有沒有哪裡看不懂或可能被誤解。` },
      ...all.flatMap((x) => (at(x) ? [{ type: 'text' as const, text: `${x} 秒：` }, { type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data: at(x) } }] : [])),
    ] }] } as Anthropic.Messages.MessageStreamParams);
  checked(seen.usage);
  const blind = seen.content.find((b) => b.type === 'text')?.text ?? '';
  // 2. the intent held against what the viewer saw: a state counts as readable only if the viewer named it unprompted
  guard(0.25);
  const content: Anthropic.Messages.ContentBlockParam[] = [{ type: 'text', text: `導演想演的事件：${st.event}\n一位沒有任何說明的觀眾看完這些畫面後這樣描述：\n${blind}\n\n下面是每個狀態的畫面與導演的意圖。逐一判斷：「有出現」＝畫面上真的有描述的東西；「看得懂」＝上面那位觀眾自己說出了這個狀態（沒說出來、或理解成別的意思，就是看不懂，即使畫面上有）；每段狀態之間的連續格，看得出一個狀態逐漸變成下一個嗎。最後逐張檢查構圖（layout）：線條或色塊切過人物的臉、壓住歌詞；歌詞和底色對比不足；大片空白或主角被擠到邊緣出框；兩個人物分不清。` }];
  st.states.forEach((x, i) => {
    content.push({ type: 'text', text: `狀態 ${i}（${x.at} 秒）應該是：${x.what}；觀眾應該靠這個認出來：${x.look}` });
    if (at(x.at)) content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: at(x.at) } });
    else content.push({ type: 'text', text: '（這張沒有渲染出來）' });
  });
  t.slice(0, -1).forEach((_, i) => {
    content.push({ type: 'text', text: `狀態 ${i} → ${i + 1} 之間的連續格（${between.slice(i * 4, i * 4 + 4).join('、')} 秒）：` });
    for (const x of between.slice(i * 4, i * 4 + 4)) if (at(x)) content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: at(x) } });
  });
  const msg = await streamed({ model: a['check-model']!, max_tokens: 8000, system: '你是審片的查核者：拿導演的意圖去對照觀眾實際看到的，不替畫面補上觀眾沒看出來的意思。', messages: [{ role: 'user', content }], output_config: { effort: 'high', format: { type: 'json_schema', schema: JUDGE_SCHEMA } } } as Anthropic.Messages.MessageStreamParams);
  checked(msg.usage);
  const judge = JSON.parse(msg.content.find((b) => b.type === 'text')?.text ?? '{}') as Judge;
  judge.layout ??= [];
  // a composition without severe problems counts as one more item to pass: an event that reads over a line cutting her
  // face is not done; minor ones never ran out (3–7 per segment in every round of a whole song), so they do not block
  judge.layout = judge.layout.filter((x) => x.severe);
  const pass = judge.states.filter((x) => x.present && x.readable).length + judge.moves.filter((x) => x.gradual).length + (judge.layout.length ? 0 : 1);
  writeFileSync(join(work, `states_r${k}.json`), JSON.stringify({ blind, ...judge }, null, 1));
  return { judge: { ...judge, blind } as Judge, pass, total: st.states.length * 2, images: st.states.map((x) => at(x.at)).filter(Boolean) };
}

// ---- the cast (--cast): the people and state drawings the event needs, designed by the director and drawn by the
// image model in the song's style, one sheet per group that must match (one person, one eye in its three states)
const CAST_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['why', 'sheets'],
  properties: {
    why: { type: 'string', description: '這個事件需要哪些人物和狀態圖、為什麼（觀眾要靠它們認出事件）' },
    sheets: { type: 'array', description: '1–2 張：同一張上的圖會畫成一致的造型與比例（例如同一個人的不同姿勢，或同一隻眼睛的睜開／半閉／閉上）', items: { type: 'object', additionalProperties: false, required: ['id', 'items'], properties: { id: { type: 'string' }, items: { type: 'array', description: '2–4 個', items: { type: 'object', additionalProperties: false, required: ['id', 'what'], properties: { id: { type: 'string', description: '英文小寫加點，例 boy.bike_back、eye.half' }, what: { type: 'string', description: '英文，給生圖的具體描述：誰（一定寫性別與年紀，例如 a teenage boy／a teenage girl）、外型（髮型、髮色、服裝、和其他人物的區別）、姿勢、角度、取景；同一張的狀態圖要寫「the exact same … same framing」，也要再寫一次性別' } } } } } } },
  },
};
type Cast = { why: string; sheets: { id: string; items: { id: string; what: string }[] }[] };
const CAST_RULES = `
人物與狀態圖（選角）：
- 故事裡的「誰」用人物演，不要用物件代替（之前用粉紅蝴蝶結代表「君」，觀眾連不起來）。人物之間外型要明顯不同（性別、髮型、服裝、顏色），觀眾才不會認錯人；照歌詞決定主角的性別（例如「僕」）。每張圖的描述都要寫清楚性別（只寫髮型和制服，生圖會畫成別的性別）。
- 動作用 2–4 張狀態圖在拍點上直接換張（例如眼睛睜開→半閉→閉上），不要交叉淡化（兩張重疊會像在融化），也不要用程式扭曲整張圖做動作。
- 全身動作（走路、騎車）做不好就不要做：用停著的姿勢、背影、局部特寫、裁切來演。
- 人物圖裡已經畫了的東西（例如他身邊的腳踏車、手上的照片）不要在同一個畫面再放一個單獨的貼圖：同一樣東西出現兩次會很突兀；道具只有在故事需要、而人物圖裡沒有時才放。
- 現實和回憶可以用不同畫法（例如回憶只用一個特色墨），但要是刻意且一致的決定。`;

/** Each cast drawing checked against its description by a viewer: wrong gender, hair or clothes, or two people alike. */
async function checkCast(added: { id: string; what: string }[], manifest: Record<string, { url: string }>): Promise<{ id: string; problem: string }[]> {
  guard(0.2);
  const content: Anthropic.Messages.ContentBlockParam[] = [{ type: 'text', text: '下面每張圖都附了它應該畫成的樣子。逐張檢查：性別、年紀、髮型、髮色、服裝、姿勢和描述一致嗎？不同的人物之間看得出是不同的人嗎（同一個人的不同狀態要看起來是同一個人）？只列出不符的，全部正確就給空陣列。' }];
  for (const x of added) {
    const jpg = manifest[`spr:${x.id}`].url.replace(/\.png$/, '.check.jpg');
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', manifest[`spr:${x.id}`].url, '-vf', 'scale=-1:360', '-q:v', '4', jpg]);
    content.push({ type: 'text', text: `${x.id} 應該是：${x.what}` }, { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: readFileSync(jpg).toString('base64') } });
  }
  const msg = await streamed({ model: a['check-model']!, max_tokens: 4000, messages: [{ role: 'user', content }], output_config: { effort: 'medium', format: { type: 'json_schema', schema: { type: 'object', additionalProperties: false, required: ['wrong'], properties: { wrong: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'problem'], properties: { id: { type: 'string' }, problem: { type: 'string', description: '英文：哪裡不符、應該怎樣' } } } } } } } } } as Anthropic.Messages.MessageStreamParams);
  checked(msg.usage);
  return (JSON.parse(msg.content.find((b) => b.type === 'text')?.text ?? '{"wrong":[]}').wrong ?? []) as { id: string; problem: string }[];
}

/** The director casts the event; each sheet is drawn in the song's style, keyed, and joins the sprite library. */
async function castStage(st: States) {
  step('導演決定人物和事件需要的狀態圖');
  messages.push({ role: 'user', content: `第 1.7 步（選角）：${CAST_RULES}\n這個事件（${st.event}）需要哪些人物和狀態圖？列出要畫的圖，分成 1–2 張（同一張上的會畫成一致）。素材庫已經有的東西不用再畫（整首共用的人物已經在素材庫：要新的狀態圖時，描述寫成同一個人）。如果素材庫已經夠用，sheets 給空陣列。` });
  const cast = await call<Cast>(CAST_SCHEMA, 'medium');
  console.log(`cast: ${cast.sheets.map((x) => `${x.id}[${x.items.map((i) => i.id).join(',')}]`).join(' ')} — ${cast.why}`);
  const dir = join(work, 'cast');
  mkdirSync(dir, { recursive: true });
  const ref = a['cast-ref'] ?? a['style-ref'] ?? (a.sprites ? readdirSync(join(a.sprites, '..')).filter((f) => /^sheet.*\.jpg$/.test(f)).map((f) => join(a.sprites!, '..', f))[0] : undefined);
  const lang2 = lang ? ` Art direction of this video: ${lang.name} — ${lang.essence} Colour: ${lang.colour}` : '';
  const added: { id: string; w: number; h: number; what: string }[] = [];
  const manifest = JSON.parse(readFileSync(pics, 'utf8'));
  for (const sh of cast.sheets.slice(0, 2)) {
    const items = sh.items.slice(0, 4);
    const instr = join(dir, `instruction_${sh.id}.txt`);
    writeFileSync(instr, `CHARACTER SHEET for a music video.${a['cast-ref'] ? ' The reference image shows the characters of this video: anyone listed below who appears there must be drawn identical to it (same face, hair colour, hairstyle, clothes, proportions), in exactly its drawing style, inks, halftone and grain.' : ref ? ' The reference image is a prop sheet of this video: draw the items listed below in exactly its drawing style, inks, halftone and grain, so they belong to the same print.' : lang2}
Draw the items listed below, each one separate, in a ${items.length} columns x 1 row grid, all at the same scale, with generous empty space around every item, on a perfectly flat chroma-key green background #00B140 (no gradient, no floor, no cast shadows, no borders, no extra objects). Do not use any green close to #00B140 in the items.
The characters are designed, not generic: clear silhouette, simple confident shapes, faces drawn with few strokes (no realistic rendering, no glossy anime shading), the same proportions in every item. Items described as the same thing must match exactly (same face, hair, clothes, framing).
Absolutely no text, letters, numbers or labels anywhere.`);
    const dirs = join(dir, `dirs_${sh.id}.json`);
    writeFileSync(dirs, JSON.stringify([{ id: sh.id, prompt: items.map((x, i) => `${i + 1} ${x.what}`).join('; ') }]));
    step(`畫人物與狀態圖：${sh.id}`);
    execFileSync('npx', ['tsx', 'scripts/lyric-vj/character.mts', ...(ref ? ['--ref', ref] : []), '--directions', dirs, '--instruction', instr, '--out', dir], { stdio: ['ignore', 'ignore', 'inherit'] });
    imageUSD += 0.101;
    const sheet = join(dir, `${sh.id}.jpg`);
    if (!existsSync(sheet)) throw new Error(`人物表 ${sh.id} 沒有畫出來`);
    const keyed = join(dir, sh.id);
    execFileSync('uv', ['run', '-q', '--with', 'numpy', '--with', 'pillow', '--with', 'scipy', 'python', 'scripts/lyric-vj/key_sprites.py', sheet, keyed, '--min', '0.003'], { stdio: ['ignore', 'ignore', 'inherit'] });
    // the drawings in reading order; stray specks (a half-keyed ghost) are far smaller than the drawings
    const frames = (JSON.parse(readFileSync(join(keyed, 'frames.json'), 'utf8')).frames as { file: string; w: number; h: number; x?: number; sheetIndex: number }[]);
    const big = [...frames].sort((x, y) => y.w * y.h - x.w * x.h).slice(0, items.length).sort((x, y) => (x.x ?? x.sheetIndex) - (y.x ?? y.sheetIndex));
    if (big.length < items.length) console.log(`cast ${sh.id}: ${big.length} of ${items.length} drawings came out`);
    big.forEach((fr, i) => {
      const it = items[i];
      manifest[`spr:${it.id}`] = { kind: 'image', url: join(process.cwd(), keyed, fr.file) };
      added.push({ id: it.id, w: fr.w, h: fr.h, what: it.what });
    });
  }
  // what was drawn, held against what was asked: gender, hair, clothes, and the people telling apart (a "short black
  // hair, navy uniform" narrator came back a girl, next to a girl)
  const wrong = added.length ? await checkCast(added, manifest) : [];
  if (wrong.length) console.log(`cast check: ${wrong.map((x) => `${x.id} ${x.problem}`).join(' | ')}`);
  for (const sh of cast.sheets.slice(0, 2).filter((x) => x.items.some((i) => wrong.some((w) => w.id === i.id)))) {
    const items = sh.items.slice(0, 4);
    const fix = wrong.filter((w) => items.some((i) => i.id === w.id)).map((w) => `${w.id}: ${w.problem}`).join('; ');
    const dirs = join(dir, `dirs_${sh.id}.json`);
    // the redo starts from the sheet as drawn: the same people (face, hair colour, clothes), only the faults changed — a
    // redo from the style reference alone came back as a different girl
    writeFileSync(dirs, JSON.stringify([{ id: `${sh.id}.redo`, prompt: `Redraw the reference sheet with the same characters (same face, hair colour, clothes, drawing style and layout): ${items.map((x, i) => `${i + 1} ${x.what}`).join('; ')}. Fix exactly this and keep everything else: ${fix}` }]));
    step(`人物畫得不對，重畫：${sh.id}`);
    execFileSync('npx', ['tsx', 'scripts/lyric-vj/character.mts', '--ref', join(dir, `${sh.id}.jpg`), '--directions', dirs, '--instruction', join(dir, `instruction_${sh.id}.txt`), '--out', dir], { stdio: ['ignore', 'ignore', 'inherit'] });
    imageUSD += 0.101;
    const sheet = join(dir, `${sh.id}.redo.jpg`);
    if (!existsSync(sheet)) continue;
    const keyed = join(dir, `${sh.id}.redo`);
    execFileSync('uv', ['run', '-q', '--with', 'numpy', '--with', 'pillow', '--with', 'scipy', 'python', 'scripts/lyric-vj/key_sprites.py', sheet, keyed, '--min', '0.003'], { stdio: ['ignore', 'ignore', 'inherit'] });
    const frames = (JSON.parse(readFileSync(join(keyed, 'frames.json'), 'utf8')).frames as { file: string; w: number; h: number; x?: number; sheetIndex: number }[]);
    const big = [...frames].sort((x, y) => y.w * y.h - x.w * x.h).slice(0, items.length).sort((x, y) => (x.x ?? x.sheetIndex) - (y.x ?? y.sheetIndex));
    if (big.length < items.length) continue;
    big.forEach((fr, i) => {
      manifest[`spr:${items[i].id}`] = { kind: 'image', url: join(process.cwd(), keyed, fr.file) };
      const x = added.find((y) => y.id === items[i].id);
      if (x) Object.assign(x, { w: fr.w, h: fr.h });
    });
  }
  writeFileSync(pics, JSON.stringify(manifest));
  sprites.push(...added);
  writeFileSync(join(work, 'cast.json'), JSON.stringify({ cast, added }, null, 1));
  // the director sees what was drawn before it writes the code
  const shots = added.map((x) => {
    const jpg = join(dir, `${x.id}.preview.jpg`);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', (manifest[`spr:${x.id}`] as { url: string }).url, '-vf', 'scale=-1:360', '-q:v', '4', jpg]);
    return [{ type: 'text' as const, text: `${x.id}（${x.w}×${x.h}）：` }, { type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data: readFileSync(jpg).toString('base64') } }];
  }).flat();
  messages.push({ role: 'user', content: [{ type: 'text', text: `人物與狀態圖畫好了，已加入素材庫（用 f.img('<id>') 取得）。照上面的選角規則用它們：${CAST_RULES}` }, ...shots] });
}

/**
 * The states stage: judged, then fixed by the kind of failure — a state missing from the frame is a rewrite, one that
 * is there but unclear (or a jump between states) is an edit — until all pass, two rounds bring no gain or three rounds are done (then the
 * run stops at its preview: no video). After it passes, the program's technical check runs once; the review is advice.
 */
const MAX_ROUNDS = 3;
async function stateStage(st: States): Promise<never> {
  let best = -1, still = 0, k = 1, bestReply = reply, bestRound = 1;
  let judged = await judgeStates(reply, st, k);
  let bestJudged = judged;
  for (;;) {
    console.log(`states r${k}: ${judged.pass}/${judged.total} — ${judged.judge.states.map((x) => `${x.index}:${x.present ? (x.readable ? 'ok' : '不懂') : '沒有'}`).join(' ')} ${judged.judge.moves.map((x) => `${x.from}→:${x.gradual ? 'ok' : '跳'}`).join(' ')} 構圖:${judged.judge.layout.length ? judged.judge.layout.length + ' 個問題' : 'ok'}`);
    if (judged.pass === judged.total) break;
    if (judged.pass > best) [best, still, bestReply, bestRound, bestJudged] = [judged.pass, 0, reply, k, judged];
    else still++;
    onStop = () => writeFileSync(join(out, 'treatment.preview.json'), JSON.stringify(apply(bestReply)));
    // the best version came by round 3 in 10 of 11 segments of a whole song: later rounds only spent money
    if (still >= 2 || k >= MAX_ROUNDS) {
      // stopped: the best version stays as the preview (its treatment and state stills), no video
      writeFileSync(join(out, 'treatment.preview.json'), JSON.stringify(apply(bestReply)));
      writeFileSync(join(out, 'codelayer_failed.json'), JSON.stringify({ ...bestReply, story, states: st, judge: bestJudged.judge, bestRound, ...usage, imageUSD, checkUSD }, null, 1));
      console.log(`##STEP ${still >= 2 ? '連續兩輪沒有進步' : `修了 ${k} 輪`}，停止；保留第 ${bestRound} 輪（${best}/${judged.total}）當預覽（codelayer/states_r${bestRound}）`);
      console.log(`stopped: best states ${best}/${judged.total} (round ${bestRound}) after ${k} rounds`);
      process.exit(2);
    }
    // a round worse than the best goes back to the best and fixes that (building on a worse rewrite lost a good one)
    const back = judged.pass < best;
    if (back) [reply, judged] = [bestReply, bestJudged];
    const missing = judged.judge.states.filter((x) => !x.present);
    const notes2 = [...judged.judge.states.filter((x) => !(x.present && x.readable)).map((x) => `- 狀態 ${x.index}（${st.states[x.index]?.at} 秒）${x.present ? '有出現但看不懂' : '沒有出現'}：${x.why}`), ...judged.judge.moves.filter((x) => !x.gradual).map((x) => `- 狀態 ${x.from}→${x.from + 1} 不是逐漸變化：${x.why}`), ...judged.judge.layout.map((x) => `- 構圖（${x.at} 秒）：${x.problem}`)].join('\n');
    messages.push({
      role: 'user', content: [
        { type: 'text', text: `${back ? `上一輪的修改比第 ${bestRound} 輪差，回到第 ${bestRound} 輪的版本繼續修。目前的程式（第 ${bestRound} 輪）：\n${reply.src}\n\n` : ''}沒參與製作的觀眾看了這些狀態畫面：\n${notes2}\n${missing.length ? '有狀態根本沒畫出來：這段的構圖要重新安排，回傳完整的新程式（idea、src、sections、layouts），已經成立的狀態保留原本的做法。' : '狀態都在，但不夠清楚、變化是跳的或構圖有問題：用 edits 修改。'}以下是目前各狀態的畫面：` },
        ...judged.images.map((data) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data } })),
      ],
    });
    step(`第 ${k} 輪：${back ? `回到第 ${bestRound} 輪，` : ''}${missing.length ? '狀態沒畫出來，重寫這段' : '狀態不清楚，修改'}`);
    reply = missing.length ? await ask('medium') : await revise(reply);
    save(reply, k + 1, story);
    judged = await judgeStates(reply, st, ++k);
  }
  step('事件狀態通過，做技術檢查');
  const r = await test(reply, k);
  console.log(`technical: ${r.problems.length ? r.problems.join(' | ') : 'no errors'}`);
  if (r.problems.length) {
    messages.push({ role: 'user', content: `程式量測到的問題（必須修好，不要動到事件的狀態）：\n${r.problems.join('\n')}\n用 edits 修改。` });
    const next = await revise(reply);
    const again = await judgeStates(next, st, k + 1);
    if (again.pass === again.total) reply = next;
    else console.log('technical fix broke the states: kept the version whose states pass');
  }
  // advice only: the review no longer decides whether this ships
  const rv = await review(r.images, r.weak, r.strips, r.tcuts);
  console.log(`review (advice): ${rv.score} — ${rv.verdict}`);
  writeFileSync(join(work, 'review_states.json'), JSON.stringify(rv, null, 1));
  const usd = (usage.input * 4 + usage.output * 20) / 1e6 + imageUSD + checkUSD;
  writeFileSync(join(out, 'treatment.json'), JSON.stringify(apply(reply)));
  writeFileSync(join(out, 'codelayer.json'), JSON.stringify({ ...reply, story, states: st, review: rv, seconds: Math.round((Date.now() - began) / 1000), ...usage, costUSD: +usd.toFixed(3) }, null, 1));
  writeFileSync(savedFile, '{}');
  console.log(`done: ${Math.round((Date.now() - began) / 1000)}s, $${usd.toFixed(3)}`);
  process.exit(0);
}

// a run that failed part-way resumes from its last finished round (same design, props, scenes and notes)
const runKey = JSON.stringify([base.concept, base.design, sprites.map((x) => x.id), scenes.map((x) => x.id), notes ?? '', baseline?.idea ?? '']);
const savedFile = join(work, 'progress.json');
const saved = existsSync(savedFile) ? (JSON.parse(readFileSync(savedFile, 'utf8')) as { key: string; reply: Reply; round: number; story?: Story }) : undefined;
const resume = saved?.key === runKey ? saved : undefined;
const save = (reply: Reply, round: number, story?: Story) => writeFileSync(savedFile, JSON.stringify({ key: runKey, reply, round, story }));

let reply: Reply;
let story: Story | undefined;
let states: States | undefined;
let firstRound = 1;
if (resume) {
  step(`接續上次中斷的進度（第 ${resume.round} 輪）`);
  reply = resume.reply;
  story = resume.story;
  firstRound = resume.round;
  messages.push({ role: 'assistant', content: JSON.stringify(reply) });
  // a states run that stopped part-way goes back to its states stage, with the cast it drew
  if (a.states && existsSync(join(work, 'states.json'))) states = JSON.parse(readFileSync(join(work, 'states.json'), 'utf8'));
  if (existsSync(castFile)) sprites.push(...(JSON.parse(readFileSync(castFile, 'utf8')).added as typeof sprites).filter((x) => castKept[`spr:${x.id}`] && !sprites.some((y) => y.id === x.id)));
} else if (baseline) {
  step('導演依你的意見和目前版本，構思修改並寫新版畫面');
  reply = await ask('high');
} else {
  step('導演構思故事和分鏡（每段的場景、事件、主角）');
  (messages[0].content as Anthropic.Messages.ContentBlockParam[]).push({ type: 'text', text: '第一步只做分鏡，不要寫程式：照 beats 的格式，每個段落（sections 的 index）一筆，決定場景、取景、主角素材、事件、歌詞區。分鏡要讓故事走過場景、每段有事件、取景每段不同。' });
  story = await call<Story>(STORY_SCHEMA, 'high');
  for (let k = 0; k < 2; k++) {
    const errs = checkStory(story);
    if (!errs.length) break;
    console.log(`story check: ${errs.join(' | ')}`);
    step('分鏡有問題，導演修正分鏡');
    messages.push({ role: 'user', content: `分鏡檢查沒通過，請修正後輸出完整分鏡：\n${errs.map((x) => `- ${x}`).join('\n')}` });
    story = await call<Story>(STORY_SCHEMA, 'high');
  }
  console.log('story:', story.story);
  writeFileSync(join(work, 'story.json'), JSON.stringify(story, null, 1));
  if (a.states) states = await planStates();
  // the states are written again on what was actually drawn: a judge held to the pre-cast plan (a ribbon) failed the
  // version where she appeared, and the rewrite that followed lost it
  if (a.states && a.cast && states) {
    await castStage(states);
    states = await planStates(true);
  }
  step('照分鏡寫畫面程式');
  messages.push({ role: 'user', content: `分鏡通過。第二步：照這份分鏡寫程式（每段的場景、取景、主角、事件、歌詞區都要做到），輸出 idea、src、sections。${states ? `\n事件的每個狀態在它的時間點（at）都必須在畫面上清楚呈現 look 寫的樣子，狀態之間要看得到連續的變化：\n${states.states.map((x) => `- ${x.at} 秒：${x.what}（觀眾靠：${x.look}）`).join('\n')}` : ''}` });
  reply = await ask('medium');
}
console.log('idea:', reply.idea);
save(reply, firstRound, story);
if (a.states && states) await stateStage(states);

let last: Awaited<ReturnType<typeof test>> | undefined;
for (let round = firstRound; round <= 3; round++) {
  step(`第 ${round} 輪：渲染檢查畫面（物理、跳動、歌詞遮擋、色塊、灰霧、場景輪替）`);
  const r = await test(reply, round);
  last = r;
  console.log(`round ${round}: ${r.problems.length ? r.problems.join(' | ') : 'no errors'}; weak shots: ${r.weak.length}`);
  if (round === 3) break;
  // one independent review, in the first round only: later rounds fix what the program measures, not taste
  let reviewText = '';
  if (round === firstRound) {
    step(`第 ${round} 輪：獨立審片（只看一次）`);
    const rv = await verify(await review(r.images, r.weak, r.strips, r.tcuts), r.images, r.strips);
    writeFileSync(join(work, `review_r${round}.json`), JSON.stringify({ ...rv, weak: r.weak }, null, 1));
    console.log(`review ${round}: ${rv.score} — ${rv.verdict} (${rv.issues.length} issues)`);
    reviewText = `\n\n獨立審片的意見（沒有參與製作的人）：${rv.verdict}\n${rv.issues.map((x) => `- 鏡頭 ${x.shot}：${x.problem} → ${x.fix}`).join('\n')}\n逐條判斷審片意見（同意就改，不同意可以不改）。`;
  } else if (!r.problems.length) break;
  messages.push({
    role: 'user',
    content: [
      { type: 'text', text: `${r.problems.length ? `程式量測到的問題（必須全部修好）：\n${r.problems.join('\n')}\n\n` : '程式量測沒有問題。\n\n'}量測（只看背景）可能偏空或偏靜的鏡頭：${r.weak.length ? r.weak.join('；') : '無'}${reviewText}\n\n以下是成品截圖（歌詞已疊上），時間依序為 ${times.join('、')} 秒，分別是鏡頭 ${picks.join('、')}。${baseline ? '物件的細緻度和設計感不能比基準差。' : ''}用 edits 修改程式：每個 find 是目前程式裡原樣只出現一次的一段，replace 是改好的內容；沒有要改就給空的 edits。` },
      ...r.images.map((data) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data } })),
    ],
  });
  step(`第 ${round} 輪：導演修改（只改有問題的地方）`);
  const next = await revise(reply);
  if (next.src === reply.src && JSON.stringify(next.sections) === JSON.stringify(reply.sections) && !r.problems.length) break;
  reply = next;
  console.log('revised:', reply.idea);
  save(reply, round + 1, story);
}
// the quality gate: a fresh review of the finished drawing; below PASS the director gets one more round on its notes,
// and if it is still below, the run fails rather than hand a paying user something unusable
step('最終品質審查');
let final = await review(last!.images, last!.weak, last!.strips, last!.tcuts);
console.log(`final review: ${final.score} — ${final.verdict}`);
if (final.score < PASS) {
  messages.push({ role: 'user', content: `最終審片只有 ${final.score} 分（最低可交付 ${PASS}）：${final.verdict}\n${final.issues.map((x) => `- 鏡頭 ${x.shot}：${x.problem} → ${x.fix}`).join('\n')}\n這一輪要把質感拉上來（材質、構圖、畫面不要空），不要只修小地方。用 edits 修改程式。` });
  step(`品質不足（${final.score} 分），導演加修一輪`);
  // the extra round may fail outright (a rewrite too long for one reply): then the fallback below still applies
  try {
    const next = await revise(reply);
    const r4 = await test(next, 4);
    if (r4.problems.length) console.log(`round 4: ${r4.problems.join(' | ')}`);
    step('最終品質審查（加修後）');
    const again = await review(r4.images, r4.weak, r4.strips, r4.tcuts);
    console.log(`final review: ${again.score} — ${again.verdict}`);
    if (again.score > final.score) [reply, last, final] = [next, r4, again];
  } catch (e) {
    console.log(`extra round failed: ${(e as Error).message}`);
  }
}
// the rounds' check renders (continuity tracks, jump and transition stills: about 1 GB a round) are spent once the
// run ends either way; only the drawing and the review stills stay
sweepChecks();
const usd = (usage.input * 4 + usage.output * 20) / 1e6;
const record = { ...reply, story, score: final.score, verdict: final.verdict, seconds: Math.round((Date.now() - began) / 1000), ...usage, costUSD: +usd.toFixed(3) };
if (final.score < PASS) {
  // a drawing below the bar stops the song here: the plain library look is not a finished video (黄昏サイクル shipped
  // as bicycle stickers over stripes); the drawing and its stills stay for a look at what went wrong
  writeFileSync(join(out, 'codelayer_failed.json'), JSON.stringify(record, null, 1));
  writeFileSync(savedFile, '{}');
  console.log(`##STEP 專屬圖層 ${final.score} 分未達 ${PASS}，停止：不輸出整首（問題畫面在 codelayer/stills_r*）`);
  console.log(`stopped: drawing scored ${final.score} < ${PASS} (${final.verdict})`);
  process.exit(2);
}
writeFileSync(join(out, 'treatment.json'), JSON.stringify(apply(reply)));
writeFileSync(join(out, 'codelayer.json'), JSON.stringify(record, null, 1));
// a finished run starts the next one fresh
writeFileSync(savedFile, '{}');
console.log(`done: ${Math.round((Date.now() - began) / 1000)}s, $${usd.toFixed(3)}`);
