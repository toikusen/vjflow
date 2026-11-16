// Subject-video tier, phase 1: the director's script and subject brief for a window of a song in one of our proven
// languages, then candidate subject sheets for the buyer to pick from. The script decides what the protagonist is
// (a person, an object, an animal or a weather) from the lyrics, tells the story in a few shots — most of them the
// subject cut out and composited over the language's code-drawn grounds, a few full scenes where a real place matters —
// and names, per shot, which of our kinetic moves and text motions the line's meaning asks for. Nothing is fixed per
// song here: the shots, their count and their line map come from this song's lyrics, sections and tempo.
// Phase 2 (after the pick) draws stills and clips with the chosen sheet as reference and cuts on the song's beats.
//
// npx tsx scripts/lyric-vj/subject-script.mts --song out/db/<id>/song.json --from 3 --to 63.06 --language risograph \
//   --out out/research/video-tier/run2 [--stage script|sheets|pick|all] [--model claude-opus-5-5] [--image-model gemini-3-pro-image]
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { LANGUAGES, type LanguageId } from '../../src/app/lyric-vj/languages';
import { STYLE_WORLDS } from '../../src/app/lyric-vj/style-worlds';
import { type Candidate, cleanScript, type SubjectScript } from '../../src/app/lyric-vj/subject-script';
import { feltTempo } from '../../src/app/lyric-vj/timeline';
import { GROUND_HELP } from '../../src/app/lyric-vj/lineplan-core';
import { PRICES, streamed } from './claude.mts';
import { EMPH_HELP, ENTER_HELP, EXIT_HELP, FX_HELP, IDLE_HELP, TEMPLATES } from './typehelp.mts';

const { values: a } = parseArgs({
  options: {
    song: { type: 'string' }, from: { type: 'string' }, to: { type: 'string' }, language: { type: 'string', default: 'risograph' }, out: { type: 'string' },
    stage: { type: 'string', default: 'all' }, model: { type: 'string', default: 'claude-opus-5-5' }, 'image-model': { type: 'string', default: 'gemini-3-pro-image' },
  },
});
const IMAGE_PRICE: Record<string, number> = { 'gemini-3-pro-image': 0.134, 'gemini-3.1-flash-image': 0.101 };
const out = a.out!;
const from = Number(a.from), to = Number(a.to);
mkdirSync(join(out, 'sheets'), { recursive: true });
const ledgerPath = join(out, 'costs.json');
const ledger = (): { item: string; usd: number; at: string; model: string }[] => (existsSync(ledgerPath) ? JSON.parse(readFileSync(ledgerPath, 'utf8')) : []);
const charge = (item: string, usd: number, model: string) => writeFileSync(ledgerPath, JSON.stringify([...ledger(), { item, usd: +usd.toFixed(4), at: new Date().toISOString(), model }], null, 1));
const spent = () => ledger().reduce((s, x) => s + x.usd, 0);

const lang = LANGUAGES[a.language as LanguageId];
if (!lang) throw new Error(`unknown language ${a.language}`);
const world = STYLE_WORLDS.find((w) => w.language === a.language);
if (!world) throw new Error(`no style world for ${a.language}`);

type Cue = { id: string; start: number; end: number; text: string };
type Song = { title: string; tempo: number; beats: number[]; downbeats: number[]; cues: Cue[]; sections: { start: number; end: number; energy: number; type: string }[] };
const song: Song = JSON.parse(readFileSync(a.song!, 'utf8'));
const felt = feltTempo(song as never);
const cues = song.cues.filter((c) => c.start < to && c.end > from);
const scriptFile = join(out, 'script.json');

/** The director's brief: the song's own data, the language's rules, the reference's clip rules and the schema. */
function prompt(): string {
  const beat = 60 / felt.tempo;
  const lines = cues.map((c) => {
    const sec = song.sections.find((s) => c.start >= s.start - 0.05 && c.start < s.end);
    return `${c.id} ${c.start.toFixed(2)}–${c.end.toFixed(2)} (${((c.end - c.start) / beat).toFixed(1)} 拍, ${sec?.type ?? '?'} 能量 ${sec?.energy.toFixed(2) ?? '?'}) ${c.text}`;
  }).join('\n');
  // the world's own grounds are drawn in world-grounds.ts; their words are not in GROUND_HELP
  const WORLD_GROUNDS: Record<string, string> = { 'riso/two-drum': '兩滾筒：兩組斜切的淡色色版慢慢橫向滾過紙面（印刷機在跑、前進）', 'riso/grain-block': '顆粒大色塊：左邊一大塊深墨斜版、右下一塊淡墨版，大面留白（安靜、停下來）' };
  const grounds = [...new Set([...Object.values(world.grounds.levels).flat(), ...world.grounds.quiet])].map((g) => `${g}（${GROUND_HELP[g] ?? WORLD_GROUNDS[g] ?? g}）`);
  const help = (h: Record<string, string>) => Object.entries(h).map(([k, v]) => `${k}: ${v}`).join('\n');
  return `你是這支歌詞 MV 的導演。這首歌〈${song.title}〉的 ${from}–${to} 秒要做成「主角影像 + 我們自己的動態字體與程式繪製世界」的版本，風格固定為「${lang.name}」（${a.language}）。
使用者看完上一版（每格都是 AI 整張場景、字只是排在旁邊、沒有轉場、沒有字體動態、沒有程式畫的圖）的評價是「還可以」。這一版要把我們整套系統用滿：風格自己的動態字體（進場、退場、停留、強調）、轉場、程式畫的底與圖形，全部依歌詞意義挑，不要展示、不要關鍵字觸發。

## 這首歌（視窗內的句子，時間、拍數、段落、段落能量 0–1）
速度 ${felt.tempo.toFixed(1)} bpm（一拍 ${beat.toFixed(3)} 秒）
${lines}

## 風格：${lang.name}
本質：${lang.essence}
不是：${lang.not}
顏色：${lang.colour}
字：${lang.type}
圖層：${lang.layers}
動：${lang.motion}
招牌爆點：${lang.native}
道具畫法（給生圖模型的英文）：${lang.props?.style ?? ''}
適合：${lang.suits}
風格世界的程式底（ground id，每個 cut-out 鏡頭選一個；quiet 給沒唱的段）：${grounds.join(', ')}；安靜底：${world.grounds.quiet.join(', ')}
風格世界自己的字動作：進場 ${world.motion.enters.join('/')}，退場 ${world.motion.exits.join('/')}，停留 ${world.motion.holds.join('/')}；轉場 ${world.transitions.own.join('/')}；爆點 ${world.peak.loud}（慢：${world.peak.calm}）
配色方案（scheme id: 說明）：${world.palette.map((p) => `${p.id}: ${p.what}`).join('；')}

## 主角（subject）
從歌詞決定主角是什麼：person 人、object 物件、animal 動物、phenomenon 自然現象（風、夕陽、雨）。不一定要是人：上一版畫高中生騎單車，人物一致性和手腳是最大的弱點；LYKY 那首用物件當主角成功過。非人類主角影片模型也比較穩。但要是歌詞真的在講人、以人才說得通，就選人，並用構圖把手腳藏掉。alternatives 寫你考慮過但沒選的主角和原因。

## 構圖規則（來自參考片 ゆのん「カルキュレイト」的分析，和上一版的檢討）
1. 絕大多數鏡頭是「主角去背（cutout）疊在程式畫的風格底上」：主角單獨生成在素色底、去背、以風格的墨色印在程式底上；很多鏡頭主角要小（高度 0.25–0.45）站在大片程式空間裡，字才有位置。只有少數（2–3 個）鏡頭是整張場景（scene）：開場、爆點，而且要有「真的需要一個地方」的理由。
2. VIDEO 鏡頭是 8 秒的生成片段，只用最乾淨的 0.3–1.5 秒（最長 3 秒）；長的停留用定格加剪輯鏡頭。動作要「收得住」：遠景／側面／俯視／剪影才准大動作（走、轉、騎、落），中景只准小幅（抬頭、轉身、呼吸、風吹），特寫只准眨眼、閉眼、微微側頭。禁止：走向鏡頭、手伸向鏡頭、握持物特寫、對嘴、生成片裡的鏡頭運動（運鏡都由我們的渲染器加）。
3. 手腳要藏：胸上景、背影、剪影、手插口袋、手在畫面外；物件主角沒有這個問題。
4. 鏡頭數：這段 ${(to - from).toFixed(0)} 秒約 10–16 個不同鏡頭，每個會重複用 2–5 次；主歌停留長、副歌短，實際切點由程式依這首的拍點與能量決定（你只給 lines：每句依序用哪些鏡頭，和可選的 beats 建議）。副歌不要只在 2–3 張圖之間來回閃。
5. 字永遠放在主角沒有的那一側（side 是主角那側；center 只給主角極小或極大、字壓不到的鏡頭）。上一版最大的抱怨是字壓在臉上。
6. 轉場：用風格自己的轉場與「先印第一版再疊第二版」的方式切鏡頭，不要每切都硬切、也不要每切都用同一招。

## 我們的動態字與程式圖形（只在歌詞意義合的地方用）
排版 template：
${help(TEMPLATES)}
進場 enter：
${help(ENTER_HELP)}
退場 exit：
${help(EXIT_HELP)}
停留 idle：
${help(IDLE_HELP)}
強調 emphasis：
${help(EMPH_HELP)}
程式畫的動態圖形 fx（鏡頭底下或主角周圍的程式圖形；大多數鏡頭 fx 留空，只有這句的意思真的需要時才用，一段最多 2–3 次）：
${help(FX_HELP)}

## 候選主角設計（candidates）
給 4–6 個候選，使用者會挑一個。每個都是同一個主角概念的不同設計（造型、服裝或形狀、在這風格的 2–3 色墨裡的配色重點、年齡感或材質感）；歌詞允許時也可以有不同主角選擇（例如一個候選是人、一個是物件）。idea 用繁體中文一句話（≤30 字）說設計想法；look 是給生圖模型的英文描述（具體：形狀、服裝、配件、哪些部位用哪個墨色、表情或姿態的氣質），不要寫風格說明（程式會加）；scheme 填上面的配色方案 id。

## 避免每首歌長得一樣
sameness 寫：這個腳本裡哪些東西是你覺得「換一首歌也會這樣做」的固定做法，提醒我們之後變成規則時要小心。

只回傳一個 JSON 物件，不要任何說明文字。格式：
{
 "subject": {"kind": "person|object|animal|phenomenon", "what": "英文，主角是什麼", "why": "繁中，為什麼", "alternatives": "繁中"},
 "story": "繁中，這段的故事 2–4 句（主角在這段裡發生什麼事）",
 "world": "繁中，程式底怎麼跟著故事走（哪一段用哪個 ground、墨色什麼時候換）",
 "peak": "繁中，爆點在哪一句、畫面怎麼做（用風格的招牌爆點）",
 "shots": [{"id": "S01", "kind": "still|video", "frame": "cutout|scene", "cues": ["c001"], "size": "wide|medium|close", "subject": "英文，姿勢或動作（video 寫會動的是什麼、鏡頭鎖定）", "place": "scene 鏡頭才填：英文，地方；加一句為什麼需要真的地方", "ground": "cutout 鏡頭填 ground id", "fx": "fx id 或空字串", "fxWhy": "繁中，為什麼這句要這個 fx（空字串＝不用）", "side": "left|right|center", "height": 0.35, "camera": "static|push|pan|parallax", "step": false, "why": "繁中，這個鏡頭對應歌詞的什麼"}],
 "lines": [{"cue": "c001", "shots": ["S01", "S02"], "beats": 4}],
 "text": [{"cue": "c001", "template": "template id", "enter": "enter id", "exit": "exit id", "idle": "idle id", "emphasis": "emphasis id 或空字串（只在有詞要強調時）", "why": "繁中，為什麼這句用這組"}],
 "candidates": [{"letter": "A", "idea": "繁中一句", "look": "English", "scheme": "scheme id"}],
 "sameness": "繁中"
}`;
}

// --stage prompt: the brief written out for a read, no call made
if (a.stage === 'prompt') writeFileSync(join(out, 'script_prompt.md'), prompt());

if (a.stage === 'script' || a.stage === 'all') {
  if (!existsSync(scriptFile)) {
    const text = prompt();
    writeFileSync(join(out, 'script_prompt.md'), text);
    let made: SubjectScript | undefined;
    for (let k = 0; k < 3 && !made; k++) {
      const msg = await streamed({ model: a.model!, max_tokens: 32000, messages: [{ role: 'user', content: text }], output_config: { effort: 'high' } } as Anthropic.Beta.Messages.MessageStreamParams);
      const [pin, pout] = PRICES[a.model!] ?? [5, 25];
      charge(`script try ${k + 1}`, (msg.usage.input_tokens * pin + msg.usage.output_tokens * pout) / 1e6, a.model!);
      const body = msg.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('');
      try {
        const m = JSON.parse(body.slice(body.indexOf('{'), body.lastIndexOf('}') + 1)) as SubjectScript;
        const bad = (['shots', 'lines', 'text', 'candidates'] as const).filter((f) => !m[f]?.length);
        if (!m.subject || bad.length) { writeFileSync(join(out, `script.incomplete.${k + 1}.json`), body); console.log(`script: incomplete (${bad.join(', ')}; ${msg.stop_reason}), asked again`); continue; }
        made = m;
      } catch { console.log(`script: unreadable (${msg.stop_reason}), asked again`); }
    }
    if (!made) throw new Error('script: no usable answer after three tries');
    const kept = cleanScript(made, {
      cues: cues.map((c) => c.id),
      grounds: [...Object.values(world.grounds.levels).flat(), ...world.grounds.quiet],
      fx: Object.keys(FX_HELP),
      templates: Object.keys(TEMPLATES),
      enters: [...Object.keys(ENTER_HELP), ...world.motion.enters],
      exits: [...Object.keys(EXIT_HELP), ...world.motion.exits],
      idles: [...Object.keys(IDLE_HELP), ...world.motion.holds],
      emphases: Object.keys(EMPH_HELP),
      schemes: world.palette.map((p) => p.id),
    }, (m) => console.warn(m));
    writeFileSync(scriptFile, JSON.stringify(kept, null, 1));
  }
  const s = JSON.parse(readFileSync(scriptFile, 'utf8')) as SubjectScript;
  const md = [
    `# ${song.title} ${from}–${to} s — ${lang.name} subject script`, '',
    `**Subject** (${s.subject.kind}): ${s.subject.what}`, `- why: ${s.subject.why}`, `- alternatives: ${s.subject.alternatives}`, '',
    `**Story**: ${s.story}`, '', `**World**: ${s.world}`, '', `**Peak**: ${s.peak}`, '',
    '| id | kind | frame | size | side | h | ground | fx | subject | why |', '|---|---|---|---|---|---|---|---|---|---|',
    ...s.shots.map((x) => `| ${x.id} | ${x.kind.toUpperCase()} | ${x.frame} | ${x.size} | ${x.side} | ${x.height} | ${x.ground ?? ''} | ${x.fx}${x.fxWhy ? ` (${x.fxWhy})` : ''} | ${x.subject}${x.place ? ` — ${x.place}` : ''} | ${x.why} |`), '',
    '| cue | shots | beats | template | enter | exit | idle | emphasis | why |', '|---|---|---|---|---|---|---|---|---|',
    ...s.lines.map((l) => { const t = s.text.find((x) => x.cue === l.cue); const c = cues.find((x) => x.id === l.cue); return `| ${l.cue} ${c?.text ?? ''} | ${l.shots.join(' ')} | ${l.beats ?? ''} | ${t?.template ?? ''} | ${t?.enter ?? ''} | ${t?.exit ?? ''} | ${t?.idle ?? ''} | ${t?.emphasis ?? ''} | ${t?.why ?? ''} |`; }), '',
    '## Candidates', ...s.candidates.map((c) => `- **${c.letter}** (${c.scheme}): ${c.idea} — ${c.look}`), '',
    `**Sameness risk**: ${s.sameness}`,
  ].join('\n');
  writeFileSync(join(out, 'script.md'), md);
  console.log(`script: ${s.subject.kind} — ${s.subject.what}; ${s.shots.length} shots (${s.shots.filter((x) => x.kind === 'video').length} video, ${s.shots.filter((x) => x.frame === 'scene').length} scene), ${s.candidates.length} candidates`);
}

/** One subject sheet per candidate: the subject in the language's inks on bare paper, several views, nothing else. */
async function drawSheet(c: Candidate) {
  const file = join(out, 'sheets', `${c.letter}.jpg`);
  if (existsSync(file)) return;
  const scheme = world.palette.find((p) => p.id === c.scheme) ?? world.palette[0];
  const text = `Subject reference sheet for a ${lang.name} music video, printed as a ${a.language} print. ${lang.props?.style ?? ''} Inks: ${scheme.what} — use only ink ${scheme.ink}, ink ${scheme.accent} and their overprint, on bare paper ${scheme.paper}; no other colours, no black outlines, no gradients.\nSubject: ${c.look}\nDraw this same subject four times side by side on the bare paper, clearly separated and not overlapping, all the same size: front view, three-quarter view, side profile facing left, back view. Then, at the right, one larger close-up of its most characteristic detail (the face or head if it has one, otherwise its key part). The same design, proportions and ink placement in every view. Plain bare paper around every figure: no ground, no shadow on the ground, no scene, no frame, no panel borders, no text, no letters, no labels, no logo.`;
  writeFileSync(file.replace(/\.jpg$/, '.txt'), text);
  for (const f of [join(homedir(), '.config/vjflow/gemini.env')]) if (existsSync(f)) for (const line of readFileSync(f, 'utf8').split('\n')) { const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; }
  const ai = new GoogleGenAI({ apiKey: process.env['GEMINI_API_KEY'] });
  const model = a['image-model']!;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let r: any;
  for (let k = 0; k < 3 && !r?.output_image?.data; k++) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      r = await (ai as any).interactions.create({ model, input: [{ type: 'text', text }], response_format: { type: 'image', mime_type: 'image/jpeg', aspect_ratio: '16:9', image_size: '2K' } });
    } catch (e) {
      if (k >= 2) throw e;
      await new Promise((ok) => setTimeout(ok, 8000 * 3 ** k));
    }
  }
  if (!r?.output_image?.data) throw new Error(`no image for ${file}: ${JSON.stringify(r).slice(0, 300)}`);
  writeFileSync(file, Buffer.from(r.output_image.data, 'base64'));
  charge(`sheet ${c.letter}.jpg`, IMAGE_PRICE[model] ?? 0.134, model);
  console.log(`sheet ${file}`);
}

if (a.stage === 'sheets' || a.stage === 'all') {
  const s = JSON.parse(readFileSync(scriptFile, 'utf8')) as SubjectScript;
  await Promise.all(s.candidates.map(drawSheet));
}

if (a.stage === 'pick' || a.stage === 'all') {
  const s = JSON.parse(readFileSync(scriptFile, 'utf8')) as SubjectScript;
  const items = s.candidates.filter((c) => existsSync(join(out, 'sheets', `${c.letter}.jpg`))).map((c) => ({ file: join(out, 'sheets', `${c.letter}.jpg`), label: c.letter, text: `${c.idea}（${c.scheme}）` }));
  const list = join(out, 'sheets', 'pick.json');
  writeFileSync(list, JSON.stringify(items, null, 1));
  execFileSync('uv', ['run', '--with', 'pillow', 'python', 'scripts/lyric-vj/contact_sheet.py', list, join(out, 'sheets', 'pick.jpg'), '--cols', '2'], { stdio: 'inherit' });
}
console.log(JSON.stringify({ spentUSD: +spent().toFixed(3) }));
