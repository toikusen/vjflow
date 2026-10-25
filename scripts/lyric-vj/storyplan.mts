// The song's screenplay, acted by things on its stage (render/stage.ts): who the story is about (people may never be
// shown: their things stand for them, as in LYKY), what they want, how it changes part by part and why, the one
// symbol carrying what the lyrics do not say, and then the staging: the place, its light, the things and where they
// stand, what happens to them on which line, and where the camera looks. Only the stage's actions exist; anything
// else is listed as missing. Recent songs' places, lights and symbols are told to the writer and kept out, so the
// stages do not all become one (stage-history.json).
//
// npx tsx scripts/lyric-vj/storyplan.mts --song <song.json> --treatment <old director's treatment> --sprites <props library>
//   --plan <typeplan dir> [--apply] --out <story.json>
import Anthropic from '@anthropic-ai/sdk';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { STAGE_ACTIONS, STAGE_FRAMES, StageCue, StageLayer } from '../../src/app/lyric-vj/render/stage';
import { bigWindows } from './boardplan.mts';

type Cue = { id: string; start: number; end: number; text: string };
export type Screenplay = {
  logline: string;
  people: string;
  want: string;
  symbol: { what: string; means: string };
  beats: { from: string; change: string; because: string }[];
  place: { surface: string; what: string; light: string; lightX: number; lightColor: string; lightLevel: number };
  things: { sprite: string; stands: string; x: number; z: number; size: number }[];
  script: { cue: string; beat: number; action: string; things: number[]; toX: number; toZ: number; level: number; look: string }[];
  shots: { cue: string; frame: string; focus: number; why: string }[];
  missing: { what: string; why: string }[];
};
export type StageHistory = { song: string; surface: string; place: string; light: string; symbol: string }[];

/**
 * The screenplay as a stage: cues on their lines (plus beats), unknown actions, frames, sprites and lines dropped,
 * positions kept on the surface; and the actions falling under a line that fills the frame, named (not seen there).
 */
export function toStage(sp: Screenplay, cues: Cue[], beat: number, sprites: Set<string>, look: { ink: string; paper: string; accent: string }, big: [number, number][] = []): { stage: StageLayer; hidden: string[] } {
  const at = (id: string) => cues.find((c) => c.id === id)?.start;
  const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, Number.isFinite(v) ? v : a));
  const keep = sp.things.map((x, i) => ({ x, i })).filter(({ x }) => sprites.has(x.sprite));
  const index = new Map(keep.map(({ i }, k) => [i, k]));
  // sizes kept to what the frame holds (a front 0.5 umbrella hid the glove), the front row off the bottom edge, and things
  // standing too close moved apart so none hides another
  const things = spread(keep.map(({ x }) => ({ sprite: x.sprite, x: clamp(x.x, 0.06, 0.94), z: clamp(x.z, 0, 0.85), size: clamp(x.size, 0.12, 0.36) })));
  const hidden: string[] = [];
  const script: StageCue[] = sp.script.flatMap((c) => {
    const t = at(c.cue);
    if (t === undefined || !STAGE_ACTIONS.includes(c.action as never)) return [];
    const ids = c.things.map((i) => index.get(i)).filter((i): i is number => i !== undefined);
    if (c.action !== 'light' && !ids.length) return [];
    const when = +(t + c.beat * beat).toFixed(2);
    if (c.action !== 'light' && big.some(([a, z]) => when >= a && when < z)) {
      hidden.push(`${when.toFixed(1)} s ${c.action}`);
      return [];
    }
    return [{ at: when, action: c.action as StageCue['action'], things: ids, ...(c.action === 'move' ? { to: { x: clamp(c.toX, 0.05, 0.95), z: clamp(c.toZ, 0, 1) } } : {}), ...(c.action === 'light' ? { level: clamp(c.level, 0, 1) } : {}) }];
  }).sort((x, y) => x.at - y.at);
  const shots = sp.shots.flatMap((s) => {
    const t = at(s.cue);
    return t === undefined || !STAGE_FRAMES.includes(s.frame as never) ? [] : [{ at: +t.toFixed(2), frame: s.frame as StageLayer['shots'][number]['frame'], focus: index.get(s.focus) ?? 0 }];
  }).sort((x, y) => x.at - y.at);
  const surface = (['table', 'ground', 'water', 'floor'].includes(sp.place.surface) ? sp.place.surface : 'ground') as StageLayer['surface'];
  const lightColor = /^#[0-9a-f]{6}$/i.test(sp.place.lightColor) ? sp.place.lightColor : '#ffd59a';
  return { stage: { surface, light: { x: clamp(sp.place.lightX, 0, 1), color: lightColor, level: clamp(sp.place.lightLevel, 0, 1) }, things, script, shots, ...look }, hidden };
}

/** Things standing within 0.14 across and 0.15 deep of one placed before them are pushed aside, alternately. */
export function spread<T extends { x: number; z: number }>(things: T[]): T[] {
  const out: T[] = [];
  for (const th of things) {
    let x = th.x;
    for (let k = 0; k < 6 && out.some((o) => Math.abs(o.x - x) < 0.14 && Math.abs(o.z - th.z) < 0.15); k++) x = Math.min(0.94, Math.max(0.06, th.x + (k % 2 ? -1 : 1) * 0.15 * Math.ceil((k + 1) / 2)));
    out.push({ ...th, x });
  }
  return out;
}

/** What recent songs' stages leaned on, for the writer to keep away from (the last six). */
export const recentStages = (h: StageHistory, song: string) => h.filter((x) => x.song !== song).slice(-6);

if (process.argv[1]?.endsWith('storyplan.mts')) {
  const { values: a } = parseArgs({ options: { song: { type: 'string' }, treatment: { type: 'string' }, sprites: { type: 'string' }, plan: { type: 'string' }, apply: { type: 'boolean', default: false }, out: { type: 'string' }, history: { type: 'string', default: 'out/stage-history.json' }, model: { type: 'string', default: 'claude-opus-5-5' } } });
  const envFile = join(homedir(), '.config/vjflow/anthropic.env');
  for (const line of existsSync(envFile) ? readFileSync(envFile, 'utf8').split('\n') : []) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
  const song = JSON.parse(readFileSync(a.song!, 'utf8')) as { title: string; tempo: number; cues: Cue[] };
  const base = JSON.parse(readFileSync(a.treatment!, 'utf8')) as { concept?: string };
  const lib = JSON.parse(readFileSync(join(a.sprites!, 'library.json'), 'utf8')).sprites as { id: string; what: string }[];
  const roles = (() => {
    const f = join(a.sprites!, '..', 'plan.json');
    return existsSync(f) ? new Map<string, string>((JSON.parse(readFileSync(f, 'utf8')).sheets ?? []).flatMap((x: { items: { id: string; why?: string }[] }) => x.items).map((x: { id: string; why?: string }) => [x.id, x.why ?? ''])) : new Map<string, string>();
  })();
  const tr = JSON.parse(readFileSync(join(a.plan!, 'treatment.json'), 'utf8'));
  const tp = JSON.parse(readFileSync(join(a.plan!, 'typeplan.json'), 'utf8'));
  const big = bigWindows(tr.shots);
  const history: StageHistory = existsSync(a.history!) ? JSON.parse(readFileSync(a.history!, 'utf8')) : [];
  const recent = recentStages(history, song.title);
  const prompt = `你是〈${song.title}〉這支歌詞 MV 的編劇兼導演。這首歌要有劇情：先為這首歌寫一個劇本，再決定怎麼在舞台上演出來。
舊導演給這首歌的概念（可參考、可改寫）：${base.concept ?? ''}
新導演對這首歌的判斷：${(tp.vision?.kinds ?? []).join('＋')}；${tp.vision?.change ?? ''}

一、劇本（先寫，不要先想道具）
- logline：一句話的故事。people：故事裡的人（畫面上不會出現人，人只靠他們的東西被看見，像 LYKY 那樣用物件說故事）。want：他們想要什麼。
- symbol：一個貫穿全片、有雙重意義的象徵（畫面說出歌詞沒直接說的東西），它的狀態要跟著故事變。
- beats：每段一筆（from 是段落開始的那句歌詞 id），寫這段關係或處境「改變了什麼」和「因為什麼」。每段都要讓觀眾更懂這段關係，不能只是換一句歌詞的名詞；要有起承轉合，最後一段要回應開頭。

二、舞台（只有一個地方，整首都在這裡演）
- place：surface 是 table（桌面）、ground（地面、街道、橋）、water（水面）、floor（室內地板）之一；what 寫這是哪裡；light 寫光源是什麼（燭火、路燈、窗光、夕陽……），lightX 光源在畫面左右的位置 0–1，lightColor 光的顏色（#rrggbb），lightLevel 開場的亮度 0–1。
- things：舞台上的東西，只能用下面的道具圖 id；每個寫 stands（它在故事裡代表誰或什麼），x 左右 0–1、z 遠近 0（遠）–1（近）、size 0.15–0.5。主要的東西大、靠前；不要放跟劇本無關的東西，也不要把歌詞講到的名詞一個個擺出來（那是配圖，不是劇情）。
- script：發生的事，只能用這些動作：in（出現）、out（被拿走、消失）、fall（倒下）、move（移動到 toX/toZ）、dim（變暗、褪色）、light（光源亮度變成 level，例如燭火熄滅 level 0）、tie（用象徵的線綁住兩樣東西，things 兩個）、cut（剪斷那條線，things 同兩個）。每個動作寫 look：觀眾會看到什麼前後變化，以及它在劇本裡的意思。動作要由劇情推動，不是唱到某個詞就做。每段至少一個改變，副歌之間要有升級。
- shots：鏡頭（cue 換鏡的那句），frame 是 wide（全景）、close（靠近 focus 那樣東西）、low（低角度仰看）、top（俯看）；同一個地方隨故事換遠近和角度重訪，副歌每次比上一次更逼近或換角度；why 寫理由。
- 這些時段歌詞是整版大字，動作不要放在裡面（大字時舞台保持前一個狀態）：${big.map(([x, z]: [number, number]) => `${x.toFixed(1)}–${z.toFixed(1)} 秒`).join('、') || '無'}
- 做不到的演出寫進 missing（是什麼、為什麼需要），不要假裝做到。
${recent.length ? `最近幾首歌的舞台用過這些，這首要明顯不同（地方、光源、象徵都不要重複）：\n${recent.map((x) => `- ${x.song}：${x.place}／${x.light}／象徵 ${x.symbol}`).join('\n')}\n` : ''}
道具圖（可以用的 sprite id：長相｜原本為什麼畫它）：
${lib.map((x) => `- ${x.id}：${x.what}${roles.get(x.id) ? `｜${roles.get(x.id)}` : ''}`).join('\n')}
歌詞（id、開始秒數、內容）：
${song.cues.map((c) => `${c.id} ${c.start.toFixed(1)} ${c.text}`).join('\n')}
速度 ${song.tempo.toFixed(0)} BPM；script 的 beat 是從那句開始往後幾拍。`;
  const str = { type: 'string' }, num = { type: 'number' }, int = { type: 'integer' };
  const obj = (props: Record<string, object>) => ({ type: 'object', additionalProperties: false, required: Object.keys(props), properties: props });
  const SCHEMA = obj({
    logline: str, people: str, want: str, symbol: obj({ what: str, means: str }),
    beats: { type: 'array', items: obj({ from: str, change: str, because: str }) },
    place: obj({ surface: str, what: str, light: str, lightX: num, lightColor: str, lightLevel: num }),
    things: { type: 'array', items: obj({ sprite: str, stands: str, x: num, z: num, size: num }) },
    script: { type: 'array', items: obj({ cue: str, beat: num, action: str, things: { type: 'array', items: int }, toX: num, toZ: num, level: num, look: str }) },
    shots: { type: 'array', items: obj({ cue: str, frame: str, focus: int, why: str }) },
    missing: { type: 'array', items: obj({ what: str, why: str }) },
  });
  const msg = await new Anthropic({ maxRetries: 8 }).messages.stream({ model: a.model!, max_tokens: 32000, messages: [{ role: 'user', content: prompt }], output_config: { effort: 'high', format: { type: 'json_schema', schema: SCHEMA } } } as Anthropic.Messages.MessageStreamParams).finalMessage();
  const sp = JSON.parse(msg.content.find((b) => b.type === 'text')?.text ?? '{}') as Screenplay;
  const usd = (msg.usage.input_tokens * 4 + msg.usage.output_tokens * 20) / 1e6;
  const first = tr.graphics.sections.flatMap((s: { layers: { kind: string; ink?: string; paper?: string; dark?: boolean }[] }) => s.layers).find((l: { kind: string; dark?: boolean }) => l.kind === 'kinetic' && !l.dark);
  const { stage, hidden } = toStage(sp, song.cues, 60 / song.tempo, new Set(lib.map((x) => x.id)), { ink: first?.ink ?? '#222222', paper: first?.paper ?? '#f4ecdf', accent: '#C8442A' }, big);
  writeFileSync(a.out!, JSON.stringify({ screenplay: sp, stage, hidden, costUSD: +usd.toFixed(3) }, null, 1));
  console.log(`story: ${sp.logline}\n  people: ${sp.people}｜want: ${sp.want}\n  symbol: ${sp.symbol?.what}（${sp.symbol?.means}）\n  place: ${sp.place?.what}／${sp.place?.light}`);
  for (const b of sp.beats ?? []) console.log(`  beat ${b.from}: ${b.change}（${b.because}）`);
  for (const c of sp.script ?? []) console.log(`  ${c.cue}+${c.beat} ${c.action} [${c.things.join(',')}] ${c.look}`);
  for (const m of sp.missing ?? []) console.log(`  missing: ${m.what}（${m.why}）`);
  for (const h of hidden) console.log(`  dropped (under a full-frame line): ${h}`);
  console.log(`storyplan: ${stage.things.length} things, ${stage.script.length} cues, ${stage.shots.length} shots, $${usd.toFixed(3)}`);
  if (a.apply) {
    // the stage is the song's picture: per-cut stickers, stock discs and boards go; the moves and lyrics stay
    for (const s of tr.graphics.sections) {
      s.layers = s.layers.filter((l: { kind: string; type?: string }) => !(l.kind === 'blob' || (l.kind === 'shapes' && l.type === 'circle')));
      for (const l of s.layers) if (l.kind === 'kinetic') {
        l.stage = stage;
        delete l.sprite;
        delete l.board;
        // the story is the frame: a document's case numbers and stamps would tell another one (a blind viewer read 我愛台妹's
        // love story as a case file)
        delete l.meta;
      }
    }
    writeFileSync(join(a.plan!, 'treatment.story.json'), JSON.stringify(tr));
    writeFileSync(a.history!, JSON.stringify([...history.filter((x) => x.song !== song.title), { song: song.title, surface: stage.surface, place: sp.place?.what ?? '', light: sp.place?.light ?? '', symbol: sp.symbol?.what ?? '' }], null, 1));
    console.log(`applied → ${join(a.plan!, 'treatment.story.json')}`);
  }
}
