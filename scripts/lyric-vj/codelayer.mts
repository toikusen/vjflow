// The director writes the song's own drawing code — one Canvas2D layer (graphics.ts kind 'code') that
// joins each section's library layers — then checks it on test stills (errors, slowness, its own look at the frames)
// and revises. Writes <out>/treatment.json (the song's treatment with the code layer; --out may be --dir itself) and
// <out>/codelayer.json; the test renders go to <out>/codelayer/.
// npx tsx scripts/lyric-vj/codelayer.mts --song out/db/<id>/song.json --dir out/db/<id>/studio --out <dir>
import Anthropic from '@anthropic-ai/sdk';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

const { values: a } = parseArgs({ options: { song: { type: 'string' }, dir: { type: 'string' }, out: { type: 'string' }, model: { type: 'string', default: 'claude-opus-5-5' },
  // an approved earlier drawing (its codelayer.json and still_*.jpg) to build on, and the user's notes on what to keep or fix
  baseline: { type: 'string' }, feedback: { type: 'string' },
  // a sprite library (sprite_library.py: library.json, assets.json, contact.jpg): designed characters and props to act with
  sprites: { type: 'string' } } });
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

// camera cuts: with the lyric layouts (the shots), and every two bars through a long stretch without one, so the
// background is edited like the type rather than one framing per section
const cuts = (() => {
  const shotCuts: number[] = base.shots.map((x: { start: number }) => x.start).filter((x: number) => x > 0.5);
  const bars: number[] = song.downbeats ?? [];
  const out: number[] = [];
  const marks = [0, ...shotCuts, song.duration];
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
  title: song.title, duration: +song.duration.toFixed(1), bpm: +song.tempo.toFixed(1),
  concept: base.concept, language: base.design.language, font: base.design.font,
  arc: base.arc, moments: base.moments,
  cuts: cuts.map((t, i) => ({ shot: i + 1, at: t })),
  titleCards: base.shots.filter((x: { template: string }) => x.template === 'title-card').map((x: { start: number; end: number }) => ({ from: x.start, to: x.end })),
  sections: sections.map((s, i) => ({ index: i, start: s.start, end: sections[i + 1]?.start ?? +song.duration.toFixed(1), lyricColor: s.text ?? 'auto', layers: s.layers.map((l, j) => ({ index: j, ...l })) })),
  lyrics: song.cues.map((c: { start: number; text: string }) => `${c.start.toFixed(1)} ${c.text}`),
};

const SYSTEM = `你是頂尖的動態設計師，正在為一首日本偶像歌曲的歌詞 VJ 寫「這首歌專屬的背景動畫」。其他圖層來自共用元件庫，看起來像模板；你寫的這一層要讓這首歌一看就知道是設計師為它量身做的。`;
const RULES = `
寫一個 JavaScript 函式本體（不含 function 宣告），會被 new Function('ctx', 'f', src) 編譯，每一格呼叫一次：
- ctx：1920×1080 的 CanvasRenderingContext2D，已經畫好你下面保留的圖層；畫完會自動 restore。
- f.t：歌曲秒數；f.age：本段開始後的秒數；f.w、f.h：1920、1080。
- f.beat：{ since: 距上一拍秒數, pulse: 1→0 衰減的打拍力道, index: 第幾拍 }。BPM 和段落、高潮時間在下面的資料裡，可以直接寫死在程式裡。
- f.lyric：此刻歌詞在畫面上的矩形 {x0,y0,x1,y1}（像素），沒有歌詞時是 null。歌詞會畫在你上面。
- f.cam：此刻的鏡頭 { index, start, end, progress 0→1, count }。鏡頭在 cuts 的時間點硬切（index 0 是第一個切點之前），切點和歌詞版型換版同步。
- f.hash(a, b)：決定性雜訊 [0,1)。
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
17. 鏡頭要大膽：同一場景的相鄰鏡頭，在景別（遠景／中景／特寫）、角度、運鏡方向三者中至少改變兩項。`;

const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['idea', 'src', 'sections'],
  properties: {
    idea: { type: 'string', description: '這一層的設計想法，2–4 句繁體中文' },
    src: { type: 'string', description: '函式本體' },
    sections: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['index', 'order'], properties: { index: { type: 'integer' }, order: { type: 'array', items: { type: 'integer' } } } } },
  },
};
type Reply = { idea: string; src: string; sections: { index: number; order: number[] }[] };

const client = new Anthropic();
const usage = { input: 0, output: 0 };
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
${sprites.some((x) => x.id.startsWith('girl.')) ? `25. 角色是故事的主角：少女（girl.*）貫穿全曲，帶出每段歌詞的情境（例如「進んだ一歩」就讓她一步步走），取代腳印這類看不懂的象徵；雲朵吉祥物（cloud.*）只在副歌出現當作那朵大雲的分身。貓、冰棒、電車等道具在對應的段落出場。` : '25. 不要有人物或吉祥物角色（少量動作格做出的角色動畫看起來單調、不流暢）：每個鏡頭的焦點由道具、場景和運鏡擔任，讓道具自己「演」——出場、聚集、整齊地隨拍子動作。'}
27. 素材庫優先於基準：基準裡用程式畫的貓、冰棒、電車、站牌、螢光棒、腳印、人物，全部換成素材庫的圖；基準的構圖、場景安排、配色和鏡頭保留。
26. 素材要和場景印在同一張紙上：腳下用場景的深色畫一個扁平的硬邊影子（不要模糊陰影），必要時整體 globalAlpha 0.95–1；不要加外框。素材上不要寫字；冰棒棒子上的「あたり」用程式在 pop.stick 上寫。`;
const baseline = a.baseline ? JSON.parse(readFileSync(join(a.baseline, 'codelayer.json'), 'utf8')) as { idea: string; src: string } : undefined;
const baseStills = a.baseline ? readdirSync(a.baseline).filter((f) => /^still_.*\.jpg$/.test(f)).sort((x, y) => parseFloat(x.slice(6)) - parseFloat(y.slice(6))) : [];
const notes = a.feedback ? readFileSync(a.feedback, 'utf8').trim() : '';
// lessons: the user's notes on earlier songs (Studio appends them), so a new song starts from what was learned
const lessonsFile = join('out', 'design-lessons.md');
const lessons = existsSync(lessonsFile) ? readFileSync(lessonsFile, 'utf8').trim().split('\n').slice(-40).join('\n') : '';
const intro = `${RULES}${lessons ? `\n\n使用者對之前其他歌的意見（通用的部分都適用這首）：\n${lessons}` : ''}${baseline ? BASELINE_RULES : ''}${sprites.length ? SPRITE_RULES : ''}${notes ? `\n\n使用者對上一版的意見（必須照做）：\n${notes}` : ''}\n\n這首歌的資料：\n${JSON.stringify(brief)}`;
const spriteSheet = a.sprites
  ? [{ type: 'text' as const, text: '素材庫總覽（每張下面是 id）：' }, { type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data: readFileSync(join(a.sprites, 'contact.jpg')).toString('base64') } }]
  : [];
const messages: Anthropic.Messages.MessageParam[] = [{
  role: 'user',
  content: baseline
    ? [
      { type: 'text', text: intro },
      { type: 'text', text: `基準設計的想法：${baseline.idea}\n\n基準設計的程式碼：\n${baseline.src}\n\n基準設計的成品截圖，時間依序為 ${baseStills.map((f) => parseFloat(f.slice(6))).join('、')} 秒：` },
      ...baseStills.map((f) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data: readFileSync(join(a.baseline!, f)).toString('base64') } })),
      ...spriteSheet,
    ]
    : [{ type: 'text', text: intro }, ...spriteSheet],
}];
/** The first draft is planned at high effort; revisions are edits at medium (after skillry's plan/build/judge split). */
async function ask(effort: 'high' | 'medium' = 'medium'): Promise<Reply> {
  const msg = await client.messages
    .stream({ model: a.model!, max_tokens: 128000, system: SYSTEM, messages, output_config: { effort, format: { type: 'json_schema', schema: SCHEMA } } } as Anthropic.Messages.MessageStreamParams)
    .finalMessage();
  usage.input += msg.usage.input_tokens;
  usage.output += msg.usage.output_tokens;
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
    return { ...s, layers: layers.some((l) => l.kind === 'code') ? layers : [...layers, code] };
  });
  return t;
}

// stills across the song: a verse, the first drop, an interlude, the finale
const drop = base.moments.find((m: { kind: string }) => m.kind === 'drop')?.at ?? song.duration * 0.3;
const fin = base.moments.find((m: { kind: string }) => m.kind === 'finale')?.at ?? song.duration * 0.75;
// review stills: one inside each of 12 shots spread over the song (the drop and finale among them), so the director
// sees its camera work, not one framing per section
const mid = (i: number) => { const c = [0, ...cuts, song.duration]; return (c[i] + c[i + 1]) / 2; };
const picks = [...new Set([...Array.from({ length: 10 }, (_, k) => Math.round((k * cuts.length) / 9)), cuts.findIndex((c) => c > drop), cuts.findIndex((c) => c > fin)].filter((i) => i >= 0 && i <= cuts.length))].sort((x, y) => x - y);
const times = picks.map((i) => +Math.min(song.duration - 1, mid(i)).toFixed(2));

// pictures may still be generating (Studio runs both at once): test renders go without them then; the sprite library
// joins them in one manifest
const songPics = join(a.dir!, 'assets', 'assets.json');
const pics = join(out, 'assets.merged.json');
writeFileSync(pics, JSON.stringify({
  ...(existsSync(songPics) ? JSON.parse(readFileSync(songPics, 'utf8')) : {}),
  ...(a.sprites ? JSON.parse(readFileSync(join(a.sprites, 'assets.json'), 'utf8')) : {}),
}));

// every shot's middle and 0.3 s later, background only: how much moves and how much is more than the ground colour
const shotMids = (() => { const c = [0, ...cuts, song.duration]; return c.slice(0, -1).map((x, i) => +((x + c[i + 1]) / 2).toFixed(2)); })();
const REVIEW_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['verdict', 'issues'],
  properties: {
    verdict: { type: 'string', description: '整體評語，2–3 句' },
    issues: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['shot', 'problem', 'fix'], properties: { shot: { type: 'integer' }, problem: { type: 'string' }, fix: { type: 'string' } } } },
  },
};
type Review = { verdict: string; issues: { shot: number; problem: string; fix: string }[] };

function test(r: Reply, round: number) {
  const file = join(work, `treatment_r${round}.json`);
  writeFileSync(file, JSON.stringify(apply(r)));
  const dir = join(work, `stills_r${round}`);
  const render = (stills: number[], out: string, extra: string[] = []) => {
    try {
      return execFileSync('npx', ['tsx', 'scripts/lyric-vj/render.mts', '--song', a.song!, '--treatment', file, ...(existsSync(pics) ? ['--assets', pics] : []), '--start', '0', '--end', String(song.duration), '--stills', stills.map((x) => x.toFixed(2)).join(','), '--out', out, ...extra], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      return String((e as { stderr?: string }).stderr ?? e);
    }
  };
  const log = render(times, dir);
  const problems = [...new Set(log.split('\n').filter((l) => /code layer:|page error:/.test(l)))];
  const images = times.map((x) => {
    const jpg = join(dir, `s_${x.toFixed(2)}.jpg`);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', join(dir, `still_${x.toFixed(2)}.png`), '-vf', 'scale=960:-1', '-q:v', '4', jpg]);
    return readFileSync(jpg).toString('base64');
  });
  // shot QA on the background alone (lyrics would count as motion)
  const qaDir = join(work, `qa_r${round}`);
  render(shotMids.flatMap((x) => [x, x + 0.3]), qaDir, ['--layer', 'back']);
  const qaFile = join(qaDir, 'qa.json');
  execFileSync('uv', ['run', '-q', '--with', 'numpy', '--with', 'pillow', 'python', 'scripts/lyric-vj/shot_qa.py', qaDir, shotMids.map((x) => x.toFixed(2)).join(','), qaFile], { stdio: ['ignore', 'ignore', 'inherit'] });
  const qa: { shot: number; motion: number; detail: number }[] = JSON.parse(readFileSync(qaFile, 'utf8'));
  const weak = qa.filter((x) => x.motion < 0.02 || x.detail < 0.08).map((x) => `鏡頭 ${x.shot}：${x.motion < 0.02 ? `幾乎不動（${(x.motion * 100).toFixed(1)}% 的畫面在 0.3 秒內有變化）` : ''}${x.detail < 0.08 ? `偏空（只有 ${(x.detail * 100).toFixed(1)}% 的畫面不是底色）` : ''}`);
  // transitions: three cuts across the song, a strip of frames through each (0.1 s before to 0.45 s after)
  const tcuts = [cuts[Math.floor(cuts.length * 0.2)], cuts[Math.floor(cuts.length * 0.5)], cuts[Math.floor(cuts.length * 0.8)]].filter((x) => x !== undefined);
  const offs = [-0.1, 0.1, 0.25, 0.45];
  const tDir = join(work, `trans_r${round}`);
  render(tcuts.flatMap((c) => offs.map((o) => c + o)), tDir);
  const strips = tcuts.map((c) => {
    const jpg = join(tDir, `strip_${c.toFixed(2)}.jpg`);
    const ins = offs.flatMap((o) => ['-i', join(tDir, `still_${(c + o).toFixed(2)}.png`)]);
    execFileSync('ffmpeg', ['-v', 'error', '-y', ...ins, '-filter_complex', `${offs.map((_, i) => `[${i}]scale=480:-1[s${i}]`).join(';')};${offs.map((_, i) => `[s${i}]`).join('')}hstack=${offs.length}`, '-q:v', '4', jpg]);
    return readFileSync(jpg).toString('base64');
  });
  return { file, problems, images, weak, strips, tcuts };
}

/** A reviewer who did not make it: sees only the stills, the brief and the user's standards. */
async function review(images: string[], weak: string[], strips: string[], tcuts: number[]): Promise<Review> {
  const msg = await client.messages
    .stream({
      model: a.model!, max_tokens: 16000,
      system: '你是嚴格的 MV 審片總監，沒有參與這支片的製作。你只看成品截圖，指出會讓觀眾覺得粗糙、普通、像模板或 AI 做的地方，以及看不清楚歌詞的地方。',
      messages: [{
        role: 'user', content: [
          { type: 'text', text: `這是一首日本偶像歌曲的歌詞 VJ 背景動畫（歌詞疊在上面）。概念：${base.concept}\n使用者的標準：設計師等級（目標 80/100）；歌詞永遠清楚；不要大色塊閃爍、不要歌詞底板；物件和人物要有設計感、不能隨便畫；鏡頭要多且大膽；每首歌獨一無二。${notes ? `\n使用者對上一版的意見：\n${notes}` : ''}\n量測（只看背景）可能有問題的鏡頭：${weak.length ? weak.join('；') : '無'}\n以下截圖時間依序為 ${times.join('、')} 秒，分別是鏡頭 ${picks.join('、')}。列出最重要的問題（最多 10 條，最嚴重的先），每條寫哪個鏡頭、問題、具體怎麼改。` },
          ...images.map((data) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data } })),
          { type: 'text', text: `以下 ${strips.length} 條是轉場（${tcuts.map((x) => x.toFixed(1)).join('、')} 秒的切點，每條由左到右是切點前 0.1 秒、後 0.1、0.25、0.45 秒）：好的轉場用下一個場景的招牌元素帶出下一場（從畫面裡的物件長出、擴張、甩過去），或是乾淨的硬切；滿版色塊掃過、普通的推入／滑入／淡入淡出都算問題。` },
          ...strips.map((data) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data } })),
        ],
      }],
      output_config: { effort: 'high', format: { type: 'json_schema', schema: REVIEW_SCHEMA } },
    } as Anthropic.Messages.MessageStreamParams)
    .finalMessage();
  usage.input += msg.usage.input_tokens;
  usage.output += msg.usage.output_tokens;
  return JSON.parse(msg.content.find((b) => b.type === 'text')?.text ?? '{"verdict":"","issues":[]}');
}

const began = Date.now();
let reply = await ask('high');
console.log('idea:', reply.idea);
for (let round = 1; round <= 3; round++) {
  const r = test(reply, round);
  console.log(`round ${round}: ${r.problems.length ? r.problems.join(' | ') : 'no errors'}; weak shots: ${r.weak.length}`);
  if (round === 3) break;
  const rv = await review(r.images, r.weak, r.strips, r.tcuts);
  writeFileSync(join(work, `review_r${round}.json`), JSON.stringify({ ...rv, weak: r.weak }, null, 1));
  console.log(`review ${round}: ${rv.verdict} (${rv.issues.length} issues)`);
  messages.push({
    role: 'user',
    content: [
      { type: 'text', text: `${r.problems.length ? `渲染時的問題（必須修）：\n${r.problems.join('\n')}\n\n` : '渲染沒有錯誤。\n\n'}量測（只看背景）可能偏空或偏靜的鏡頭：${r.weak.length ? r.weak.join('；') : '無'}\n\n獨立審片的意見（沒有參與製作的人）：${rv.verdict}\n${rv.issues.map((x) => `- 鏡頭 ${x.shot}：${x.problem} → ${x.fix}`).join('\n')}\n\n以下是成品截圖（歌詞已疊上），時間依序為 ${times.join('、')} 秒，分別是鏡頭 ${picks.join('、')}。逐條判斷審片意見（同意就改，不同意可以不改），${baseline ? '物件的細緻度和設計感不能比基準差，' : ''}${round === 2 ? '這是最後一次修改機會。' : ''}如果已經達到你滿意的水準且沒有錯誤，原樣回傳同一份；否則回傳修改後的完整版本。` },
      ...r.images.map((data) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data } })),
    ],
  });
  const next = await ask();
  if (next.src === reply.src && JSON.stringify(next.sections) === JSON.stringify(reply.sections) && !r.problems.length) break;
  reply = next;
  console.log('revised:', reply.idea);
}
writeFileSync(join(out, 'treatment.json'), JSON.stringify(apply(reply)));
const usd = (usage.input * 4 + usage.output * 20) / 1e6;
writeFileSync(join(out, 'codelayer.json'), JSON.stringify({ ...reply, seconds: Math.round((Date.now() - began) / 1000), ...usage, costUSD: +usd.toFixed(3) }, null, 1));
console.log(`done: ${Math.round((Date.now() - began) / 1000)}s, $${usd.toFixed(3)}`);
