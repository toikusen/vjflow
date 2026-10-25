// A passage's events, storyboarded in what the board can actually do (board.ts BOARD_EVENTS): the director may imagine
// freely, but what it hands over is pieces and actions with times, each with what a viewer should see; an action the
// board cannot show is listed as missing instead of being quietly replaced by an empty frame. It also names the few
// scene pictures the passage needs (the photos in the evidence), so only those are made.
//
// npx tsx scripts/lyric-vj/boardplan.mts --song <song.json> --treatment <old director's treatment> --sprites <props library>
//   --from 34.5 --to 75 --idea "整齊歸檔 → 開始失控" --out <file.json>
// Whole song: --from 0 --to <end> --plan <typeplan dir> (its parts and its cuts: no event lands under a line filling
// the frame) and --apply to lay the board into that plan's treatment (<typeplan dir>/treatment.board.json).
import Anthropic from '@anthropic-ai/sdk';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { BOARD_EVENTS, BoardEvent, BoardItem } from '../../src/app/lyric-vj/render/board';

type Cue = { id: string; start: number; end: number; text: string };

/**
 * The props that may be evidence: a piece on the board reads as proof of a sung line, so only props drawn for a line
 * (role lyric or story, props.mts) qualify; mood and culture props stay scenery (a grilled squid and a goldfish bag
 * pinned as 我愛台妹's night-market evidence came from no lyric, 2026-10-22). Props with no recorded role pass.
 */
export function evidenceProps<T extends { id: string }>(lib: T[], roles: Map<string, string>): T[] {
  const roleOf = (id: string) => roles.get(id) ?? roles.get(id.replace(/[._-][^._-]*$/, ''));
  return lib.filter((x) => !['mood', 'culture'].includes(roleOf(x.id) ?? ''));
}
/** The worlds a song may take from its vision's first kind: a mood song a place at most, never events. */
export function modesFor(kinds: string[]): ('none' | 'world' | 'events')[] {
  return kinds[0] === 'mood' ? ['none', 'world'] : ['none', 'world', 'events'];
}

/**
 * Events need things to happen to: at least six pieces that are sung things or places with a picture (sprite or
 * scene), not words. Short of that the board is no evidence board: a world (its pieces kept) or nothing.
 */
export function gateMode(mode: 'none' | 'world' | 'events', items: BoardItem[]): 'none' | 'world' | 'events' {
  if (mode !== 'events') return mode;
  return items.filter((x) => x.sprite || x.scene).length >= 6 ? 'events' : 'world';
}

/** Layouts that fill the frame's middle with the line (typeplan.mts): a board event under them is not seen. */
export const FULL_FRAME = new Set(['punch', 'scatter', 'beat-cut', 'array', 'orbit', 'ribbon', 'tunnel']);

/** The stretches (song seconds) a line fills the frame: the shots laid out in a full-frame layout. */
export function bigWindows(shots: { start: number; end: number; template?: string }[]): [number, number][] {
  return shots.filter((s) => FULL_FRAME.has(s.template ?? '')).map((s) => [s.start, s.end]);
}

/**
 * A board for the version without pictures: each piece becomes a word from its own line, printed on its card (a word
 * the line does not contain falls back to the line's first four characters), the events kept as they are.
 */
export function asText(board: { items: BoardItem[]; events: BoardEvent[] }, sb: Storyboard, cues: Cue[], words: string[]) {
  const kept = sb.items.filter((x) => cues.some((c) => c.id === x.cue));
  return { ...board, items: board.items.map((x, i) => {
    const line = cues.find((c) => c.id === kept[i]?.cue)?.text ?? '';
    const w = (words[i] ?? '').trim();
    return { at: x.at, text: w && line.includes(w) ? w : [...line.replace(/\s/g, '')].slice(0, 4).join('') };
  }) };
}

/** A treatment with every board taken off its cuts (a song judged to need no evidence board). */
export function withoutBoards<T extends { graphics: { sections: { layers: { kind: string; board?: unknown }[] }[] } }>(t: T): T {
  for (const s of t.graphics.sections) for (const l of s.layers) delete l.board;
  return t;
}

/**
 * The board laid into a typeplan treatment: every cut carries it (the board is the song's place, drawn over the cut's
 * move in its own inks: board.ts), the parts' own boards replaced.
 */
export function applyBoard<T extends { graphics: { sections: { layers: { kind: string; board?: unknown; ink?: string; paper?: string; dark?: boolean }[] }[] } }>(t: T, board: { items: BoardItem[]; events: BoardEvent[]; views?: { at: number; zoom: number; focus: number }[] }, from: number, to: number, accent: string, mode: 'world' | 'events' = 'events'): T {
  const first = t.graphics.sections.flatMap((s) => s.layers).find((l) => l.kind === 'kinetic' && !l.dark) ?? t.graphics.sections.flatMap((s) => s.layers).find((l) => l.kind === 'kinetic');
  const look = { ink: first?.ink, paper: first?.paper, accent, seed: 7 };
  const kind = mode === 'world' ? { style: 'stage', layout: 'scene', views: board.views ?? [] } : { style: 'evidence', layout: 'edges' };
  const b = { ...kind, items: board.items, events: board.events.map(({ at, kind, items, text }) => ({ at, kind, items, ...(text ? { text } : {}) })), from, to, order: [1, 1], ...look };
  // in a world the place's things are the song's pictures: the per-cut stickers go (one a line read as illustration)
  for (const s of t.graphics.sections) {
    // a world's landmark is the picture: stock discs in the backdrops would compete with it (a dark disc in every cut)
    if (mode === 'world') s.layers = s.layers.filter((l) => !(l.kind === 'blob' || (l.kind === 'shapes' && (l as { type?: string }).type === 'circle')));
    for (const l of s.layers) if (l.kind === 'kinetic') {
      l.board = b;
      if (mode === 'world') delete (l as { sprite?: string }).sprite;
    }
  }
  return t;
}
export type Storyboard = {
  mode?: 'none' | 'world' | 'events';
  why?: string;
  cites?: { cue: string; why: string }[];
  views?: { cue: string; zoom: number; focus: number }[];
  items: { sprite: string; scene: string; text: string; cue: string; why: string }[];
  events: { kind: string; cue: string; beat: number; items: number[]; text: string; look: string }[];
  missing: { action: string; why: string }[];
};

/**
 * The storyboard as board pieces and events in song seconds: each lands on its cue's start (events `beat` beats after
 * it), unknown kinds, pictures and cues dropped, pieces out of range dropped from events.
 */
export function toBoard(sb: Storyboard, cues: Cue[], beat: number, sprites: Set<string>, scenes: Set<string>, big: [number, number][] = []): { items: BoardItem[]; events: (BoardEvent & { look: string })[]; hidden: string[] } {
  const at = (id: string) => cues.find((c) => c.id === id)?.start;
  const kept = sb.items.flatMap((x) => {
    const t = at(x.cue);
    if (t === undefined) return [];
    const pic = sprites.has(x.sprite) ? { sprite: x.sprite } : scenes.has(x.scene) ? { scene: x.scene } : x.text.trim() ? { text: x.text.trim() } : undefined;
    return pic ? [{ ...pic, at: +t.toFixed(2) }] : [];
  });
  const events = sb.events.flatMap((e) => {
    const t = at(e.cue);
    if (t === undefined || !BOARD_EVENTS.includes(e.kind as never)) return [];
    const items = e.items.filter((i) => i >= 0 && i < kept.length);
    return [{ kind: e.kind as BoardEvent['kind'], at: +(t + e.beat * beat).toFixed(2), items, ...(e.text ? { text: e.text } : {}), look: e.look }];
  });
  // an event under a line filling the frame is not seen (我愛台妹's chorus hid 8 of 12): it is dropped and named
  const under = (at: number) => big.some(([a, z]) => at >= a && at < z);
  return { items: kept, events: events.filter((e) => !under(e.at)).sort((x, y) => x.at - y.at), hidden: events.filter((e) => under(e.at)).map((e) => `${e.at.toFixed(1)} s ${e.kind}`) };
}

if (process.argv[1]?.endsWith('boardplan.mts')) {
  // --text-from <boardplan.json>: the same board for the type-only version, its pieces turned into words (asText)
  const { values: a } = parseArgs({ options: { 'text-from': { type: 'string' }, song: { type: 'string' }, treatment: { type: 'string' }, sprites: { type: 'string' }, from: { type: 'string' }, to: { type: 'string' }, idea: { type: 'string' }, out: { type: 'string' }, plan: { type: 'string' }, apply: { type: 'boolean', default: false }, model: { type: 'string', default: 'claude-opus-5-5' } } });
  const envFile = join(homedir(), '.config/vjflow/anthropic.env');
  for (const line of existsSync(envFile) ? readFileSync(envFile, 'utf8').split('\n') : []) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
  const song = JSON.parse(readFileSync(a.song!, 'utf8')) as { title: string; tempo: number; cues: Cue[] };
  if (a['text-from']) {
    const src = JSON.parse(readFileSync(a['text-from'], 'utf8')) as { mode?: string; storyboard: Storyboard; board: { items: BoardItem[]; events: BoardEvent[] } };
    // a world without pictures would be words standing about a calm song nobody is singing: the place is left to the
    // backdrops and the warmth, the plan's treatment kept as it is
    if (src.mode === 'world' || src.mode === 'none') {
      // and the parts' own boards go: a song judged to have no events shows none (evidence cards had stayed in)
      const tr = withoutBoards(JSON.parse(readFileSync(join(a.plan ?? '.', 'treatment.json'), 'utf8')));
      // the same place as the version with pictures, its stock discs gone with it
      if (src.mode === 'world') for (const sec of tr.graphics.sections) sec.layers = sec.layers.filter((l: { kind: string; type?: string }) => !(l.kind === 'blob' || (l.kind === 'shapes' && l.type === 'circle')));
      if (a.plan) writeFileSync(join(a.plan, 'treatment.board.json'), JSON.stringify(tr));
      console.log('boardplan (type only): a world has no pictures to lay here, treatment kept');
      process.exit(0);
    }
    const kept = src.storyboard.items.filter((x) => song.cues.some((c) => c.id === x.cue));
    const ask = `下面是歌詞 MV 證物板上的證物，每張對應一句歌詞。這個版本沒有圖，每張證物要換成印在卡片上的一個詞：從那句歌詞裡原樣挑 2–5 個字，最能代表這張證物。照順序回傳 words。\n${kept.map((x, i) => `${i + 1}. 證物：${x.sprite || x.scene || x.text}（${x.why}）｜歌詞：${song.cues.find((c) => c.id === x.cue)?.text}`).join('\n')}`;
    const msg = await new Anthropic({ maxRetries: 8 }).messages.create({ model: 'claude-sonnet-5-5', max_tokens: 2000, messages: [{ role: 'user', content: ask }], output_config: { format: { type: 'json_schema', schema: { type: 'object', additionalProperties: false, required: ['words'], properties: { words: { type: 'array', items: { type: 'string' } } } } } } } as Anthropic.Messages.MessageCreateParamsNonStreaming);
    const words = JSON.parse((msg.content.find((b) => b.type === 'text') as { text: string }).text).words as string[];
    const board = asText(src.board, src.storyboard, song.cues, words);
    writeFileSync(a.out!, JSON.stringify({ storyboard: src.storyboard, board, scenes: [], costUSD: +((msg.usage.input_tokens * 3 + msg.usage.output_tokens * 15) / 1e6).toFixed(3) }, null, 1));
    console.log(`boardplan (type only): ${board.items.map((x) => x.text).join('、')}`);
    if (a.plan) {
      const tr = JSON.parse(readFileSync(join(a.plan, 'treatment.json'), 'utf8'));
      writeFileSync(join(a.plan, 'treatment.board.json'), JSON.stringify(applyBoard(tr, board, Number(a.from ?? 0), Number(a.to ?? 9999), '#D8264F')));
      console.log(`applied → ${join(a.plan, 'treatment.board.json')}`);
    }
    process.exit(0);
  }
  const t = JSON.parse(readFileSync(a.treatment!, 'utf8')) as { concept?: string; assets?: { id: string; prompt?: string }[] };
  const propPlan = join(a.sprites!, '..', 'plan.json');
  const roles = new Map<string, string>(existsSync(propPlan) ? (JSON.parse(readFileSync(propPlan, 'utf8')).sheets ?? []).flatMap((x: { items: { id: string; role?: string }[] }) => x.items).filter((x: { role?: string }) => x.role).map((x: { id: string; role: string }) => [x.id, x.role]) : []);
  const lib = evidenceProps(JSON.parse(readFileSync(join(a.sprites!, 'library.json'), 'utf8')).sprites as { id: string; what: string }[], roles);
  const [from, to] = [Number(a.from), Number(a.to)];
  const cues = song.cues.filter((c) => c.start >= from && c.start < to);
  const planned = a.plan ? (JSON.parse(readFileSync(join(a.plan, 'treatment.json'), 'utf8')) as { shots: { id: string; start: number; end: number; template?: string }[]; graphics: { sections: { layers: { kind: string }[] }[] } }) : undefined;
  const tp = a.plan ? JSON.parse(readFileSync(join(a.plan, 'typeplan.json'), 'utf8')) : {};
  const parts = (tp.parts ?? []) as { from: string; shift: string; what: string }[];
  // a song the director reads as mood first carries no events: its feeling builds, not a chain of things happening
  // (三年後的大雪 was handed a red-thread evidence board on a time contrast and abstract words, 2026-10-23)
  const allowed = modesFor(tp.vision?.kinds ?? []);
  const big = planned ? bigWindows(planned.shots).filter(([x, z]) => z > from && x < to) : [];
  const prompt = `你是〈${song.title}〉這支歌詞 MV 的導演，現在只做 ${from}–${to} 秒這一段的分鏡。這段要表達：${a.idea}
整支的概念：${t.concept ?? ''}

先判斷這首歌需要哪一種世界（mode，這首可選：${allowed.join('、')}），每個判斷都要引用歌詞（cites：歌詞 id 和為什麼）。新導演已判斷這首的表達是：${(tp.vision?.kinds ?? []).join('＋') || '未定'}（${tp.vision?.why ?? ''}）。抽象的詞（擁抱、思念、再見）不是可以累積的東西：
- none：歌詞裡沒有跨兩段以上反覆出現的場景或意象、也沒有明確的時間對照（態度、派對、抽象的歌常常是這樣）。不用世界，交給文字和節奏；items、events、views 都空。
- world：有一個歌詞反覆回到的地方或意象，但歌詞沒有支持「東西發生改變、後段還留著結果」：做一個持續的地方，不排事件。items 只能用道具圖（sprite，去背的東西會站在地上；不要用場景圖或字），第一個是這個地方的地標（歌詞唱到的），其餘 2–5 個是歌詞唱到、屬於這個地方的東西，唱到時出現、之後一直在；views 安排遠近重訪（zoom 1 是全景，1.4–1.8 是靠近 focus 那一樣東西），換段落才換；events 空。
- events：歌詞有一串具體的東西或地方能累積，而且有「對象＋改變前後＋先後依據」，後段還會保留或回看結果：用證物板（下面的動作），views 空。
慢歌、字少只決定節奏，不能直接推定需要故事。

如果是 events：畫面上有一面證物板，整段一直在（換刀不換，歌詞在另一側）。你可以自由構想，但交出來的分鏡只能用證物板做得到的動作：
- link：把幾張證物用紅線依序連起來（線一段段長出來）
- reach：紅線從最後一張證物往外拉出板子、拉到畫面外
- loosen：幾張證物的圖釘彈掉，照片掛著一角歪下來晃
- scatter：幾張證物脫離板子，被甩飛出畫面
- stamp：一個大印章蓋在板上（text 是章上的字，要是這段歌詞裡的詞）
- cut：紅線被剪斷、垂下消失
做不到的動作不要假裝做到：寫進 missing，說它是什麼、為什麼需要。
${parts.length ? `整首的段落安排（照這個走，每段改變或延續了什麼）：\n${parts.map((p) => `- ${planned?.shots.find((x) => x.id === p.from)?.start.toFixed(1) ?? '?'} 秒起（${p.shift}）：${p.what}`).join('\n')}\n` : ''}${big.length ? `這些時段歌詞是整版大字，證物板上的事件在大字底下看不到，不要把事件放在裡面（大字時板子保持前一個狀態就好）：${big.map(([x, z]) => `${x.toFixed(1)}–${z.toFixed(1)} 秒`).join('、')}\n` : ''}${to - from > 90 ? '整首只安排 3–5 個主要事件（失控、剪斷、甩飛、蓋章這類），每個前後要有停留，讓觀眾看清楚發生了什麼；釘上照片和連線是配角，跟著段落累積就好。事件太多會互相搶注意力。\n' : ''}每張證物都要是它那句歌詞真的講到的東西或地方（觀眾會把板上每一張當成「這句歌詞的證據」）；歌詞沒提到的地方或東西，就算符合概念也不要釘上去。
證物（items，依釘上去的順序，最多 ${to - from > 90 ? 12 : 8} 張；每張在它那句歌詞開始時釘上）：照片裡放場景圖（scene）或道具圖（sprite），都沒有才用字（text）。只挑這段真的需要的場景圖，越少越好。
每個事件寫 look：觀眾在畫面上會看到什麼前後變化（一句）。事件要讓「整齊歸檔」到「開始失控」看得出來，不是只換排版。

場景圖（可以用的 scene id）：
${(t.assets ?? []).map((x) => `- ${x.id}：${(x.prompt ?? '').slice(0, 120)}`).join('\n')}
道具圖（可以用的 sprite id）：
${lib.map((x) => `- ${x.id}：${x.what}`).join('\n')}
這段的歌詞（id、開始秒數、內容）：
${cues.map((c) => `${c.id} ${c.start.toFixed(1)} ${c.text}`).join('\n')}
速度 ${song.tempo.toFixed(0)} BPM；事件的 beat 是從那句開始往後幾拍。`;
  const SCHEMA = { type: 'object', additionalProperties: false, required: ['mode', 'why', 'cites', 'views', 'items', 'events', 'missing'], properties: {
    mode: { type: 'string', enum: allowed },
    why: { type: 'string' },
    cites: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['cue', 'why'], properties: { cue: { type: 'string' }, why: { type: 'string' } } } },
    views: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['cue', 'zoom', 'focus'], properties: { cue: { type: 'string' }, zoom: { type: 'number' }, focus: { type: 'integer' } } } },
    items: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['sprite', 'scene', 'text', 'cue', 'why'], properties: { sprite: { type: 'string' }, scene: { type: 'string' }, text: { type: 'string' }, cue: { type: 'string' }, why: { type: 'string' } } } },
    events: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['kind', 'cue', 'beat', 'items', 'text', 'look'], properties: { kind: { type: 'string' }, cue: { type: 'string' }, beat: { type: 'number' }, items: { type: 'array', items: { type: 'integer' } }, text: { type: 'string' }, look: { type: 'string' } } } },
    missing: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['action', 'why'], properties: { action: { type: 'string' }, why: { type: 'string' } } } },
  } };
  const msg = await new Anthropic({ maxRetries: 8 }).messages.stream({ model: a.model!, max_tokens: 16000, messages: [{ role: 'user', content: prompt }], output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } } } as Anthropic.Messages.MessageStreamParams).finalMessage();
  const sb = JSON.parse(msg.content.find((b) => b.type === 'text')?.text ?? '{}') as Storyboard;
  const usd = (msg.usage.input_tokens * 4 + msg.usage.output_tokens * 20) / 1e6;
  const board = toBoard(sb, song.cues, 60 / song.tempo, new Set(lib.map((x) => x.id)), new Set((t.assets ?? []).map((x) => x.id)), big);
  let mode = gateMode(allowed.includes(sb.mode ?? 'none') ? (sb.mode ?? 'none') : 'world', board.items);
  // a world's things stand in the place: cut-outs only (a whole scene picture set on the ground read as a card)
  if (mode === 'world') board.items = board.items.filter((x) => x.sprite);
  if (mode === 'world' && !board.items.length) mode = 'none';
  // a world keeps its things and only changes how it is looked at; it has no events
  const views = mode === 'world' ? (sb.views ?? []).flatMap((v) => {
    const at = song.cues.find((c) => c.id === v.cue)?.start;
    return at === undefined ? [] : [{ at: +at.toFixed(2), zoom: Math.min(2, Math.max(1, v.zoom)), focus: Math.max(0, Math.min(board.items.length - 1, v.focus)) }];
  }).sort((x, y) => x.at - y.at) : [];
  if (mode === 'world') board.events = [];
  console.log(`mode: ${mode}｜${sb.why ?? ''}`);
  for (const c of sb.cites ?? []) console.log(`  cite ${c.cue}: ${c.why}`);
  const scenes = [...new Set(board.items.flatMap((x) => (x.scene ? [x.scene] : [])))];
  writeFileSync(a.out!, JSON.stringify({ storyboard: sb, mode, board: { ...board, views }, scenes, costUSD: +usd.toFixed(3) }, null, 1));
  console.log(`boardplan: ${board.items.length} pieces, ${board.events.length} events, scenes ${scenes.join(' ') || 'none'}, $${usd.toFixed(3)}`);
  for (const e of board.events) console.log(`  ${e.at.toFixed(1)} s ${e.kind} [${e.items?.join(',')}]${e.text ? ` 「${e.text}」` : ''} → ${e.look}`);
  for (const m of sb.missing) console.log(`  missing: ${m.action}（${m.why}）`);
  for (const h of board.hidden) console.log(`  dropped (under a full-frame line): ${h}`);
  if (a.apply && a.plan && mode !== 'none') {
    const tr = JSON.parse(readFileSync(join(a.plan, 'treatment.json'), 'utf8'));
    writeFileSync(join(a.plan, 'treatment.board.json'), JSON.stringify(applyBoard(tr, { ...board, views }, from, to, '#D8264F', mode)));
    console.log(`applied → ${join(a.plan, 'treatment.board.json')}`);
  }
}
