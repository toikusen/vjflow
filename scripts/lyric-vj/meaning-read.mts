// The one cheap reading of a song's lyrics (claude-haiku-5-5, low effort unless asked): prompt, schema and call, shared by
// lineplan.mts (which caches it as <out>/meaning.json) and meaning-reread.mts (which re-asks without touching caches).
import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { momentsHelp, MOMENTS_SCHEMA } from '../../src/app/lyric-vj/signature-moments';
import { BACKGROUNDS, GROUND_HELP, Cue, Meaning, PALETTES } from './lineplan-core.mts';

export const READING_MODEL = 'claude-haiku-5-5';
/** USD per token for READING_MODEL (prompts under 100K tokens). */
export const READING_PRICE = { input: 0.1 / 1e6, output: 0.5 / 1e6 };

/** Loads ~/.config/vjflow/anthropic.env into process.env without overriding what is already set. */
export function loadAnthropicEnv(): void {
  const env = join(homedir(), '.config/vjflow/anthropic.env');
  for (const line of existsSync(env) ? readFileSync(env, 'utf8').split('\n') : []) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

/** A slow song (under 3 sung characters a second) gets the calm palette fallback and no busy backgrounds. */
export const isCalmSong = (cues: Cue[]): boolean => {
  const sungSec = cues.reduce((s, c) => s + Math.max(0, c.end - c.start), 0);
  return cues.reduce((s, c) => s + [...c.text.replace(/\s/g, '')].length, 0) / Math.max(1, sungSec) < 3;
};

/** The reading request for a song: the prompt text and its JSON schema (reading, palette, ground, parts, keys, moments). */
export function readingRequest(song: { title: string; cues: Cue[] }, calm = isCalmSong(song.cues)): { prompt: string; schema: object } {
  const cues = song.cues;
  const pool = [...new Set([...BACKGROUNDS[0], ...BACKGROUNDS[1], ...(calm ? [] : BACKGROUNDS[2])])];
  const HELP = readFileSync('src/app/lyric-vj/render/kinetic-more.ts', 'utf8');
  const helpOf = (fx: string) => GROUND_HELP[fx] ?? HELP.match(new RegExp(`\\b${fx}: \\{[^\\n]*?help: '([^']{0,40})`))?.[1] ?? fx;
  const schema = { type: 'object', additionalProperties: false, required: ['reading', 'palette', 'ground', 'parts', 'keys', 'moments'], properties: {
    reading: { type: 'string', description: '這首歌在說什麼、情緒怎麼走（一句，不超過 40 字）' },
    palette: { type: 'string', enum: Object.keys(PALETTES) },
    ground: { type: 'string', enum: ['flat', 'grain', 'gradient'] },
    parts: { type: 'array', description: '依序涵蓋整首的 4 到 10 段', items: { type: 'object', additionalProperties: false, required: ['from', 'tension', 'fx', 'what'], properties: {
      from: { type: 'string', description: '這段第一句的 id' }, tension: { type: 'number', description: '這段的情緒張力 0–1；副歌不一定最高，要看歌詞' },
      fx: { type: 'array', items: { type: 'string', enum: pool }, description: '這段的背景招式，三個，要符合這段的情緒和世界，不是逐詞配圖' }, what: { type: 'string', description: '這段的情緒（一句，引用一個歌詞裡的詞當根據）' },
    } } },
    moments: MOMENTS_SCHEMA,
    keys: { type: 'array', description: '逐句檢視全曲，列出所有有明確語意理由、值得形成視覺主次的候選詞組。重點可來自主題、情緒轉折、對比、決定或關係變化；不要為求稀少而漏列，也不要逐句湊數。每項提供 cue、phrase、why；沒有成立候選時回傳空陣列。', items: { type: 'object', additionalProperties: false, required: ['cue', 'phrase', 'why'], properties: { cue: { type: 'string' }, phrase: { type: 'string', description: '指定 cue 實際唱出的連續原文子字串，保留原字形，不得翻譯、改寫、拼接、補字或引用括號旁白。以完整且不扭曲句意的詞組為準，不為字數截斷詞組。' }, why: { type: 'string', description: '說明這個詞組在完整句意與前後文中的作用，以及為何值得強調；必須保留否定、疑問、願望、條件與反諷，不能只說它是關鍵詞。' } } } },
  } };
  const prompt = `讀這首歌的歌詞，判斷每段的情緒，替歌詞動態影片選配色和背景。只判斷整段的情緒和重點，不要逐句圖解；比喻、反諷、否定句要照真正的意思理解。\n歌名：${song.title}\n歌詞：\n${cues.map((c) => `${c.id} ${c.text}`).join('\n')}\n\n配色：\n${Object.entries(PALETTES).map(([k, v]) => `${k}：${v.what}`).join('\n')}\n\n背景招式：\n${pool.map((x) => `${x}：${helpOf(x)}`).join('\n')}\n\n${momentsHelp()}`;
  return { prompt, schema };
}

/** Asks READING_MODEL once (low effort, structured output) and returns the raw reading with its usage and cost. */
export async function readMeaning(song: { title: string; cues: Cue[] }, calm?: boolean, effort: 'low' | 'medium' | 'high' = 'low', maxTokens = 6000): Promise<{ meaning?: Meaning; usd: number; usage: { input: number; output: number }; stop: string | null }> {
  const { prompt, schema } = readingRequest(song, calm);
  const msg = await new Anthropic({ maxRetries: 2 }).messages.create({ model: READING_MODEL, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }], output_config: { effort, format: { type: 'json_schema', schema } } } as never) as Anthropic.Message;
  const text = msg.content.find((b) => b.type === 'text');
  const usage = { input: msg.usage.input_tokens, output: msg.usage.output_tokens };
  const usd = usage.input * READING_PRICE.input + usage.output * READING_PRICE.output;
  return { meaning: text && text.type === 'text' && msg.stop_reason === 'end_turn' ? JSON.parse(text.text) : undefined, usd, usage, stop: msg.stop_reason };
}

/** One candidate's re-judgement by the verify pass (ids: k<i> for keys[i], m<i> for moments[i]). */
export interface Verdict {
  id: string;
  phraseSung: boolean;
  lineSupports: boolean;
  mapping: string;
  directionOk: boolean;
  wholeLineKey: boolean;
  /** A whole-line key narrowed to its emphasis core: a contiguous sung piece of the same line; '' when not narrowed. */
  narrowedPhrase: string;
  verdict: 'keep' | 'drop';
  reason: string;
}

/** The verify request: the whole lyric, every key and moment candidate with its evidence and why, one verdict each. */
export function verifyRequest(song: { title: string; cues: Cue[] }, m: Pick<Meaning, 'keys' | 'moments'>): { prompt: string; schema: object; ids: string[] } {
  const keys = m.keys.map((k, i) => ({ id: `k${i}`, line: `k${i} key｜句 ${k.cue}｜phrase「${k.phrase}」｜why：${k.why ?? ''}` }));
  const moments = (m.moments ?? []).map((x, i) => ({ id: `m${i}`, line: `m${i} moment ${x.form}/${x.variant}｜句 ${x.cues.join('+')}（證據句 ${x.evidenceCueId ?? x.cues.at(-1)}）｜word「${x.word}」｜why：${x.why}` }));
  const ids = [...keys, ...moments].map((x) => x.id);
  const forms = momentsHelp().split('\n').slice(1).join('\n');
  const prompt = `你是這支歌詞動態影片的導演。前一輪閱讀從歌詞裡提出了下面這些候選：key 是要做視覺主次、放大強調的詞組；moment 是用固定形式畫出來的專屬時刻。請逐一獨立重新判斷每個候選，只能對清單裡的 id 作答，不能新增候選，也不要因為名額或其他候選而保留或刪除。

逐項檢查：
(a) phraseSung：phrase／word 是否在那一句（moment 看證據句）原樣唱出。
(b) lineSupports：把整句連同否定、願望、疑問、條件、反諷一起讀，這句的真正意思是否支持這個形式（moment）或這個強調（key）。願望、否定、假設、反問不能當成已經發生的事。疑問句要分兩種：問「為什麼／怎麼會 X」的感嘆或反問（例如「どうして…消えてしまうの」），X 本身是確實發生的事，支持；問「X 會不會發生」或希望 X 發生（例如「期盼著…一瞬間」），X 沒有發生，不支持。
(c) mapping：若是比喻，寫出「本體→喻體」；若形式畫的是喻體或字面物件，而這句其實在講別的東西（例如句子講的是海的氣味，形式卻畫海浪），判為不支持。例外：句子本身明白說出「本體像／是喻體」的明喻或隱喻，而形式畫的正是這個喻體的動作或樣子（例如「回憶就像是那凋落的楓葉」→ 回憶→凋落的楓葉，畫飄落），這是句子自己給的畫面，判為支持；只有句子在講別的事、形式卻畫出喻體或字面物件時才不支持。不是比喻就寫「非比喻」。
(d) directionOk：主詞與受詞、誰對誰做了什麼，是否和 why 說的一致（例如「悲傷融化了從前」是悲傷把從前融化，不是悲傷自己消散）。
(e) wholeLineKey：key 的 phrase 是否就是整句或幾乎整句。是的話，除非這句很短而且整句本身就是重點，否則在 narrowedPhrase 填入同一句裡真正承載重點、原樣連續唱出的一段（不能換句、不能改字、補字或拼接），並以這段判斷 keep／drop；找不到這樣的一段就 drop。沒有收窄時 narrowedPhrase 填空字串；moment 一律填空字串。

verdict：以上都成立才 keep，否則 drop；reason 用一句話說明關鍵理由。

歌名：${song.title}
歌詞：
${song.cues.map((c) => `${c.id} ${c.text}`).join('\n')}

形式與它們畫的意思：
${forms}

候選：
${[...keys, ...moments].map((x) => x.line).join('\n')}`;
  const schema = { type: 'object', additionalProperties: false, required: ['verdicts'], properties: { verdicts: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'phraseSung', 'lineSupports', 'mapping', 'directionOk', 'wholeLineKey', 'narrowedPhrase', 'verdict', 'reason'], properties: {
    id: { type: 'string', enum: ids.length ? ids : ['none'] }, phraseSung: { type: 'boolean' }, lineSupports: { type: 'boolean' }, mapping: { type: 'string' },
    directionOk: { type: 'boolean' }, wholeLineKey: { type: 'boolean' }, narrowedPhrase: { type: 'string' }, verdict: { type: 'string', enum: ['keep', 'drop'] }, reason: { type: 'string' },
  } } } } };
  return { prompt, schema, ids };
}

/**
 * Keeps a candidate only on a `keep` verdict whose own checks agree (sung, supported, right direction; a whole-line key
 * stays only if the verdict says so). A key's `narrowedPhrase` replaces its phrase only if that piece is sung word for
 * word in the same cue (the same literal check validMeaning applies); otherwise the key is dropped. A candidate with no
 * verdict is dropped; a duplicate verdict counts once (the first).
 */
export function applyVerdicts<M extends Pick<Meaning, 'keys' | 'moments'>>(m: M, verdicts: Verdict[], cues: { id: string; text: string }[]): { meaning: M; dropped: { id: string; why: string }[]; narrowed: { id: string; from: string; to: string }[] } {
  const byId = new Map<string, Verdict>();
  for (const v of verdicts) if (!byId.has(v.id)) byId.set(v.id, v);
  const dropped: { id: string; why: string }[] = [];
  const narrowed: { id: string; from: string; to: string }[] = [];
  const keepOf = (id: string) => {
    const v = byId.get(id);
    const why = !v ? 'no verdict' : v.verdict !== 'keep' ? `drop: ${v.reason}` : !v.phraseSung ? 'keep overruled: phrase not sung' : !v.lineSupports ? 'keep overruled: line does not support it' : !v.directionOk ? 'keep overruled: direction wrong' : '';
    if (why) dropped.push({ id, why });
    return !why;
  };
  const keys = m.keys.flatMap((k, i) => {
    const id = `k${i}`;
    if (!keepOf(id)) return [];
    const to = (byId.get(id)!.narrowedPhrase ?? '').trim();
    if (!to || to === k.phrase) return [k];
    if (!cues.find((c) => c.id === k.cue)?.text.includes(to)) { dropped.push({ id, why: `narrowed phrase 「${to}」 is not sung in ${k.cue}` }); return []; }
    narrowed.push({ id, from: k.phrase, to });
    return [{ ...k, phrase: to }];
  });
  return { meaning: { ...m, keys, moments: (m.moments ?? []).filter((_, i) => keepOf(`m${i}`)) }, dropped, narrowed };
}

/** One verify call's say on one candidate: kept after that call's applyVerdicts checks, the phrase it keeps, its reason. */
export interface Vote { run: number; verdict: 'keep' | 'drop' | 'none'; kept: boolean; phrase?: string; reason: string }

/** A candidate's votes across the verify calls and the outcome: kept on a majority, with the agreed phrase (keys only). */
export interface VoteRecord { id: string; votes: Vote[]; keepVotes: number; kept: boolean; phrase?: string }

/**
 * Majority vote over independent verify calls on the same candidates. Each call's verdicts go through applyVerdicts
 * first, so a keep vote is one that survives that call's own checks (sung, supported, direction, a narrowing sung in the
 * cue). A candidate stays only if more than half the calls keep it. A kept key takes the phrase most keeping calls agree
 * on (the original or one narrowing) when at least two agree and no other phrase ties it; otherwise its original phrase.
 */
export function voteVerdicts<M extends Pick<Meaning, 'keys' | 'moments'>>(m: M, runs: Verdict[][], cues: { id: string; text: string }[]): { meaning: M; votes: VoteRecord[]; dropped: { id: string; why: string }[]; narrowed: { id: string; from: string; to: string }[] } {
  const applied = runs.map((verdicts) => ({ verdicts, ...applyVerdicts(m, verdicts, cues) }));
  const need = Math.floor(runs.length / 2) + 1;
  const recordOf = (id: string, original?: string): VoteRecord => {
    const votes = applied.map((r, run): Vote => {
      const v = r.verdicts.find((x) => x.id === id);
      const drop = r.dropped.find((d) => d.id === id);
      const phrase = original === undefined || drop ? undefined : r.narrowed.find((n) => n.id === id)?.to ?? original;
      return { run, verdict: v?.verdict ?? 'none', kept: !drop, ...(phrase !== undefined ? { phrase } : {}), reason: drop?.why ?? v?.reason ?? '' };
    });
    const keepVotes = votes.filter((x) => x.kept).length;
    const kept = keepVotes >= need;
    if (!kept || original === undefined) return { id, votes, keepVotes, kept };
    const count = new Map<string, number>();
    for (const x of votes) if (x.phrase !== undefined) count.set(x.phrase, (count.get(x.phrase) ?? 0) + 1);
    const ranked = [...count].sort((p, q) => q[1] - p[1]);
    const agreed = ranked[0][1] >= 2 && (ranked.length < 2 || ranked[1][1] < ranked[0][1]) ? ranked[0][0] : original;
    return { id, votes, keepVotes, kept, phrase: agreed };
  };
  const keyVotes = m.keys.map((k, i) => recordOf(`k${i}`, k.phrase));
  const momentVotes = (m.moments ?? []).map((_, i) => recordOf(`m${i}`));
  const votes = [...keyVotes, ...momentVotes];
  const dropped = votes.filter((r) => !r.kept).map((r) => ({ id: r.id, why: `${r.keepVotes}/${runs.length} keep: ${r.votes.filter((x) => !x.kept).map((x) => x.reason).join(' | ')}` }));
  const narrowed = keyVotes.flatMap((r, i) => (r.kept && r.phrase !== m.keys[i].phrase ? [{ id: r.id, from: m.keys[i].phrase, to: r.phrase! }] : []));
  const keys = m.keys.flatMap((k, i) => (keyVotes[i].kept ? [{ ...k, phrase: keyVotes[i].phrase! }] : []));
  return { meaning: { ...m, keys, moments: (m.moments ?? []).filter((_, i) => momentVotes[i].kept) }, votes, dropped, narrowed };
}

/** USD ceiling for one verify call; a call over it fails the pass. */
export const MAX_VERIFY_USD_PER_CALL = 0.5;

/**
 * A system line that differs per verify call (run index and a random nonce) and says nothing about the task. Identical
 * requests sent together came back near-identical (2026-11-10: tsuzuki echoes 0/3 in one vote, 3/3 in the next), so
 * each call gets its own prefix.
 */
export const verifyNonce = (run: number, runs: number): string => `review ${run + 1}/${runs} · ${randomUUID().slice(0, 8)}`;

/**
 * The verify pass: `runs` (default 3) independent READING_MODEL calls on the same user prompt re-judge every key and
 * moment candidate, and voteVerdicts keeps the majority. No temperature or seed is sent (default sampling); each call's
 * system line is a verifyNonce. A call that does not finish, or costs over MAX_VERIFY_USD_PER_CALL, fails the pass.
 */
export async function verifyCandidates<M extends Meaning>(song: { title: string; cues: Cue[] }, m: M, effort: 'low' | 'medium' | 'high' = 'medium', maxTokens = 16000, runs = 3): Promise<{ meaning: M; runs: Verdict[][]; votes: VoteRecord[]; dropped: { id: string; why: string }[]; narrowed: { id: string; from: string; to: string }[]; usd: number; usage: { input: number; output: number }; calls: { usd: number; usage: { input: number; output: number } }[]; stop: string | null }> {
  const { prompt, schema, ids } = verifyRequest(song, m);
  if (!ids.length) return { meaning: m, runs: [], votes: [], dropped: [], narrowed: [], usd: 0, usage: { input: 0, output: 0 }, calls: [], stop: null };
  const client = new Anthropic({ maxRetries: 2 });
  const one = async (_: unknown, run: number) => {
    const msg = await client.messages.create({ model: READING_MODEL, max_tokens: maxTokens, system: verifyNonce(run, runs), messages: [{ role: 'user', content: prompt }], output_config: { effort, format: { type: 'json_schema', schema } } } as never) as Anthropic.Message;
    const text = msg.content.find((b) => b.type === 'text');
    const usage = { input: msg.usage.input_tokens, output: msg.usage.output_tokens };
    const usd = usage.input * READING_PRICE.input + usage.output * READING_PRICE.output;
    if (usd > MAX_VERIFY_USD_PER_CALL) throw new Error(`verify call cost $${usd.toFixed(4)} > $${MAX_VERIFY_USD_PER_CALL}`);
    if (!text || text.type !== 'text' || msg.stop_reason !== 'end_turn') throw new Error(`verify pass did not finish (${msg.stop_reason})`);
    return { verdicts: (JSON.parse(text.text) as { verdicts: Verdict[] }).verdicts, usd, usage };
  };
  const calls = await Promise.all(Array.from({ length: runs }, one));
  const usage = { input: calls.reduce((t, c) => t + c.usage.input, 0), output: calls.reduce((t, c) => t + c.usage.output, 0) };
  return { ...voteVerdicts(m, calls.map((c) => c.verdicts), song.cues), runs: calls.map((c) => c.verdicts), usd: calls.reduce((t, c) => t + c.usd, 0), usage, calls: calls.map(({ usd, usage: u }) => ({ usd, usage: u })), stop: 'end_turn' };
}
