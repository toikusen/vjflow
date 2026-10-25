// Scenes: a storyboard the director writes before any layout. A scene is a stretch of the song carried by several parts
// drawn together (an LED wall carrying the calls, a band carrying the lead, the stage light behind them), each bound to
// its own lines, place, layer and events. Shots made from scenes are locked: no generic pass reflows, merges or
// recolours their lines; what cannot be drawn is refused, never set as an ordinary caption instead.
import { splitCalls } from './calls';
import { phraseBoundaries } from './phrases';
import { TRANSITION_KINDS, TRANSITION_SEC, type TransitionKind } from './render/transition';

/** When something happens: a sung character, a line's start or end, a beat or downbeat counted from the scene's start,
 * or the scene's own start or end. */
export type SceneTime =
  | { cue: string; char: number }
  | { cue: string; edge: 'start' | 'end' }
  | { beat: number }
  | { downbeat: number }
  | { edge: 'start' | 'end' };

/** echo: a word of the line repeated behind the others (background; the line itself is carried by another part). */
export type LineRole = 'lead' | 'call' | 'shout' | 'echo' | 'object';

export interface SceneLine {
  cueId: string;
  /** lead: the line's main text (calls taken out); call: its bracketed calls, or the whole line when it is all call;
   * shout: the whole line. */
  role: LineRole;
}

export const PART_KINDS = ['stage', 'led', 'band', 'poster', 'ticket', 'fans', 'badge', 'shout', 'echo', 'object', 'title'] as const;
export type PartKind = (typeof PART_KINDS)[number];
export const EVENT_KINDS = ['flash', 'blackout', 'lightsUp', 'peel'] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export interface ScenePart {
  id: string;
  kind: PartKind;
  /** Draw order inside the scene: higher is in front. */
  z: number;
  lines?: SceneLine[];
  params?: Record<string, unknown>;
  events?: { kind: EventKind; at: SceneTime }[];
}

export interface Scene {
  id: string;
  start: number;
  end: number;
  /** What this stretch says (a feeling moving on is enough; no plot needed). */
  intent: string;
  parts: ScenePart[];
  /** How it hands over to the next scene. */
  /** cut, a white flash, lights out on the last beat, or one of the transitions (render/transition.ts) into the next. */
  exit?: 'cut' | 'flash' | 'blackout' | TransitionKind;
}

export interface Keyframe {
  label: string;
  at: SceneTime;
}

export interface SceneSong {
  beats: number[];
  downbeats: number[];
  cues: { id: string; start: number; end: number; text: string; charStarts?: number[]; charTimed?: boolean; review?: string[] }[];
}

/** One shown text a part carries: when it is up, what it says, which line it comes from. */
export interface ShownText {
  partId: string;
  cueId: string;
  role: LineRole;
  text: string;
  /** When it is sung (the text may show a little before). */
  at: number;
  from: number;
  to: number;
  /** The character timing it rests on was not matched to the voice. */
  uncertain: boolean;
  /** A 'row' LED wall's batch (calls set together at one size, in place from the first) and row in it. */
  batch?: string;
  row?: number;
}

/** Characters of a line whose timing comes from the audio: else spread evenly over the line, and flagged. */
function charTime(c: SceneSong['cues'][number], i: number): { t: number; uncertain: boolean } {
  const n = [...c.text].length;
  if (c.charTimed && c.charStarts?.length === n && !c.review?.length) return { t: c.charStarts[i], uncertain: false };
  return { t: c.start + (Math.min(n, Math.max(0, i)) / Math.max(1, n)) * (c.end - c.start), uncertain: true };
}

/** Seconds for a SceneTime, and whether it rests on an unverified character timing. Undefined when it cannot be found. */
export function resolveTime(at: SceneTime, scene: Pick<Scene, 'start' | 'end'>, song: SceneSong): { t: number; uncertain: boolean } | undefined {
  if ('cue' in at) {
    const c = song.cues.find((x) => x.id === at.cue);
    if (!c) return undefined;
    if ('edge' in at) return { t: at.edge === 'start' ? c.start : c.end, uncertain: false };
    if (!Number.isInteger(at.char) || at.char < 0 || at.char >= [...c.text].length) return undefined;
    return charTime(c, at.char);
  }
  if ('beat' in at || 'downbeat' in at) {
    const list = 'beat' in at ? song.beats : song.downbeats;
    const n = 'beat' in at ? at.beat : at.downbeat;
    const t = list.filter((b) => b >= scene.start - 0.05)[n];
    return t === undefined || t > scene.end + 0.05 ? undefined : { t, uncertain: false };
  }
  return { t: at.edge === 'start' ? scene.start : scene.end, uncertain: false };
}

/** Vertical presentation forms (︕︖︐) typed for vertical text read as wide blanks across: their horizontal marks. */
export const flatPunct = (text: string) => text.replace(/︕/g, '！').replace(/︖/g, '？').replace(/︐/g, '、');

/** How far ahead of its voice a text may show: a lead line a little (read as it is sung), a call or shout on its beat. */
/** The smallest story prop (height share of the frame) that reads as a thing in the scene rather than a sticker. */
export const OBJECT_MIN = 0.25;
/** The longest a scene may show only its ground, seconds. */
export const EMPTY_MAX = 6;
export const LEAD_IN = { lead: 0.3, call: 0.1, shout: 0.1, echo: 0, object: 0.15 } as const;

/** Calls shouted this close (s) are one burst on a 'row' LED wall. */
export const ROW_GAP = 3;
/** Smallest type a part may set (px): the check refuses smaller, and an LED batch never packs past it. */
export const MIN_LEAD_PX = 72;
export const MIN_CALL_PX = 90;
const FRAME_W = 1920;
const FRAME_H = 1080;

/** Width of a text in ems (full-width characters 1, the rest about 0.6). */
export const emWidth = (text: string) => [...text].reduce((s, c) => s + (/[\u3000-\u9fff\uff00-\uffef]/.test(c) ? 1 : c === ' ' ? 0.3 : 0.6), 0);

/**
 * Calls of a burst packed into batches that stay put: each batch is set once at one size (rows of calls, at least
 * MIN_CALL_PX), its later calls lighting up in their places; a burst that cannot fit starts a new batch instead of
 * shrinking what is already up.
 */
export function ledBatches(texts: string[], rowsAllowed: number): { batch: number; row: number }[] {
  const perRow = (FRAME_W * 0.94) / MIN_CALL_PX / 1.05;
  const out: { batch: number; row: number }[] = [];
  let batch = 0, row = 0, used = 0;
  texts.forEach((t, i) => {
    const w = emWidth(t) + (used ? 0.6 : 0);
    if (i && used + w > perRow) {
      if (row + 1 < rowsAllowed) row++;
      else (batch++, (row = 0));
      used = 0;
    }
    used += emWidth(t) + (used ? 0.6 : 0);
    out.push({ batch, row });
  });
  return out;
}

/** Seconds a line needs to be read: as the generic check (12 characters a second, plus a second to find it). */
export const readSec = (text: string) => [...text.replace(/\s/g, '')].length / 12 + 1;
/**
 * The reading time a lead line can be asked for: its length's, but never more than the song gives it before the next
 * line is sung (less the next line's lead-in and a frame or two of entrance): a long line sung fast cannot stay
 * longer without holding the next one back.
 */
export function leadNeed(cueId: string, text: string, song: SceneSong): number {
  const c = song.cues.find((x) => x.id === cueId);
  const next = c && song.cues.filter((x) => x.start > c.start + 0.05).sort((a, b) => a.start - b.start)[0];
  return Math.max(callSec(text), Math.min(readSec(text), next ? next.start - c.start - 0.45 : Infinity));
}
/** A call is a word or two shouted: read at a glance. */
export const callSec = (text: string) => Math.min(readSec(text), 0.6);

/**
 * What each part shows and when. LED and band show one text at a time: each from its sung time (0.2 s ahead) until the
 * next text in the same part, or a hold after it is sung, or the scene's end.
 */
export function shownTexts(scene: Scene, song: SceneSong): ShownText[] {
  const out: ShownText[] = [];
  for (const p of scene.parts) {
    const items: Omit<ShownText, 'from' | 'to'>[] = [];
    for (const l of p.lines ?? []) {
      const c = song.cues.find((x) => x.id === l.cueId);
      if (!c) continue;
      const split = splitCalls(flatPunct(c.text));
      if (l.role === 'call' && split.calls.length) {
        const n = [...c.text].length;
        for (const k of split.calls) {
          const ct = charTime(c, Math.round(k.from * n));
          items.push({ partId: p.id, cueId: c.id, role: 'call', text: k.text, at: ct.t, uncertain: ct.uncertain });
        }
      } else {
        // a line that is all call is shown without its brackets
        const word = typeof p.params?.['word'] === 'string' ? flatPunct(p.params['word'] as string) : '';
        const text = l.role === 'lead' ? split.main : l.role === 'call' ? flatPunct(c.text).replace(/^\s*[(（]\s*|\s*[)）]\s*$/g, '') : l.role === 'echo' ? word : l.role === 'object' ? String(p.params?.['prop'] ?? '') : flatPunct(c.text);
        items.push({ partId: p.id, cueId: c.id, role: l.role, text, at: c.start, uncertain: false });
      }
    }
    // an object bound to no line is there from the start of the scene (an intro's alarm clock, an outro's medal)
    if (p.kind === 'object' && !(p.lines ?? []).length && String(p.params?.['prop'] ?? '').trim()) items.push({ partId: p.id, cueId: '', role: 'object', text: String(p.params!['prop']), at: scene.start + LEAD_IN.object, uncertain: false });
    items.sort((a, b) => a.at - b.at);
    // 'row' (LED): calls shouted close together stay up side by side until the burst is over; 'stack' (band): the
    // previous line moves up and stays while the next is sung; 'one': the next text replaces this one as it shows
    const mode = String(p.params?.['mode'] ?? 'one');
    // a peel (a ticket torn off) ends whatever the part shows at that moment
    const peels = (p.events ?? []).filter((e) => e.kind === 'peel').map((e) => resolveTime(e.at, scene, song)?.t).filter((t): t is number => t !== undefined);
    // a row wall's bursts, each packed into batches set at one size in fixed places
    const slot: { batch?: string; row?: number }[] = items.map(() => ({}));
    if (mode === 'row') {
      const rowsAllowed = Math.max(1, Math.min(2, Math.floor((Number(p.params?.['height'] ?? 0.62) * FRAME_H) / (MIN_CALL_PX * 1.4))));
      for (let i = 0, burst = 0; i < items.length; burst++) {
        let j = i + 1;
        while (j < items.length && items[j].at - items[j - 1].at <= ROW_GAP) j++;
        ledBatches(items.slice(i, j).map((x) => x.text), rowsAllowed).forEach((b, k) => (slot[i + k] = { batch: `${burst}.${b.batch}`, row: b.row }));
        i = j;
      }
    }
    items.forEach((it, i) => {
      let j = i + 1;
      if (mode === 'row') while (j < items.length && slot[j].batch === slot[i].batch) j++;
      if (mode === 'stack') j = i + 2;
      // an echo builds up over the scene: every line's copies stay
      if (it.role === 'echo') j = items.length;
      // the next text replaces this one as it shows (a little ahead of its voice)
      const next = items[j] ? items[j].at - LEAD_IN[items[j].role] : Infinity;
      const peel = peels.filter((t) => t > it.at).sort((a, b) => a - b)[0] ?? Infinity;
      const last = mode === 'row' ? items[j - 1].at : it.at;
      // a call stays up a moment for the crowd; a shout is gone soon after it is shouted; a lead line breathes after it
      const sungEnd = (song.cues.find((x) => x.id === it.cueId)?.end ?? it.at) - it.at;
      const hold = it.role === 'call' ? last - it.at + 2.5 : it.role === 'shout' ? sungEnd + 0.4 : it.role === 'echo' || it.role === 'object' ? Infinity : sungEnd + 1.2;
      out.push({ ...it, ...slot[i], from: Math.max(scene.start, it.at - LEAD_IN[it.role]), to: Math.min(next, it.at + hold, scene.end, peel) });
    });
  }
  // the lead sings one line at a time: a line on one part leaves as the next line comes up on another (a ticket's
  // line still up as the poster's arrived on it); a stacking band keeps its own two rows
  const leads = out.filter((x) => x.role === 'lead').sort((a, b) => a.from - b.from);
  for (const x of leads) {
    const stacking = String(scene.parts.find((p) => p.id === x.partId)?.params?.['mode'] ?? '') === 'stack';
    const next = leads.find((y) => y.from > x.from + 0.01 && y.partId !== x.partId);
    if (next && !stacking) x.to = Math.min(x.to, next.from);
  }
  return out;
}

/** What is wrong with a design's scenes (errors send it back to the director) and what is uncertain (warnings). */
export function checkScenes(scenes: Scene[], song: SceneSong, shotCues: Set<string>): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const bound = new Map<string, string[]>();
  scenes.forEach((s, i) => {
    if (!(s.end > s.start)) errors.push(`分鏡 ${s.id} 的時間不對（${s.start}–${s.end}）`);
    if (i > 0 && s.start < scenes[i - 1].end - 0.05) errors.push(`分鏡 ${scenes[i - 1].id}、${s.id} 時間重疊`);
    if (!s.intent?.trim()) errors.push(`分鏡 ${s.id} 沒寫這段要表達什麼（intent）`);
    if (!s.parts.length) errors.push(`分鏡 ${s.id} 沒有任何元件`);
    for (const p of s.parts) {
      if (!PART_KINDS.includes(p.kind)) {
        errors.push(`分鏡 ${s.id} 的元件 ${p.id} 是 ${p.kind}：程式沒有這個元件（有的是 ${PART_KINDS.join('、')}），不會改成一般字幕`);
        continue;
      }
      if (p.kind === 'stage' && p.lines?.length) errors.push(`分鏡 ${s.id} 的 ${p.id}：舞台光不能承載歌詞`);
      const wrong = (p.lines ?? []).filter((l) => !PART_ROLES[p.kind].includes(l.role));
      if (wrong.length) errors.push(`分鏡 ${s.id} 的 ${p.id}（${p.kind}）只能放 ${PART_ROLES[p.kind].join('／') || '沒有歌詞'}，不能放 ${wrong.map((l) => `${l.cueId} ${l.role}`).join('、')}`);
      if (p.kind === 'object' && !String(p.params?.['prop'] ?? '').trim()) errors.push(`分鏡 ${s.id} 的 ${p.id}：object 要填 prop（props 清單裡的物件 id）`);
      // a prop parked small in a corner reads as a sticker, not a thing in the story (the ticket worked: it is big)
      if (p.kind === 'object' && Number(p.params?.['size'] ?? 0.3) < OBJECT_MIN) errors.push(`分鏡 ${s.id} 的 ${p.id}：物件 size ${p.params?.['size']} 太小，像角落的貼紙；至少 ${OBJECT_MIN}（故事的主角物件 0.4 以上），讓它像車票一樣是畫面裡的實物`);
      if (p.kind === 'echo') {
        const w = flatPunct(String(p.params?.['word'] ?? ''));
        if (!w) errors.push(`分鏡 ${s.id} 的 ${p.id}：echo 要填 word（歌詞裡要重複的那個詞）`);
        else for (const l of p.lines ?? []) if (!flatPunct(song.cues.find((c) => c.id === l.cueId)?.text ?? '').includes(w)) errors.push(`分鏡 ${s.id} 的 ${p.id}：${l.cueId} 裡沒有「${w}」`);
      }
      for (const k of ['big', 'accent'] as const) {
        const w = p.params?.[k];
        if (p.kind === 'poster' && typeof w === 'string' && w && !(p.lines ?? []).some((l) => flatPunct(song.cues.find((c) => c.id === l.cueId)?.text ?? '').includes(flatPunct(w)))) errors.push(`分鏡 ${s.id} 的 ${p.id}：${k}「${w}」不在它的歌詞裡`);
      }
      for (const l of p.lines ?? []) {
        const c = song.cues.find((x) => x.id === l.cueId);
        if (!c) { errors.push(`分鏡 ${s.id} 的 ${p.id} 引用不存在的歌詞 ${l.cueId}`); continue; }
        if (c.start < s.start - 0.3 || c.start > s.end) errors.push(`分鏡 ${s.id} 的 ${p.id} 放了不在這段時間的歌詞 ${l.cueId}`);
        if (l.role === 'call' && !splitCalls(c.text).calls.length && p.kind !== 'led') errors.push(`${l.cueId} 沒有括號 Call，整句當 Call 只能放在 LED 牆`);
        if (l.role === 'shout' && [...c.text.replace(/\s/g, '')].length > 12) errors.push(`${l.cueId}「${c.text}」太長，不是喊聲（shout 只給 12 字以內）`);
        if (l.role === 'lead' && !splitCalls(c.text).main.trim()) errors.push(`${l.cueId} 整句是 Call，不能當主唱`);
        bound.set(`${l.cueId}:${l.role}`, [...(bound.get(`${l.cueId}:${l.role}`) ?? []), p.id]);
      }
      for (const e of p.events ?? []) {
        if (!EVENT_KINDS.includes(e.kind)) errors.push(`分鏡 ${s.id} 的 ${p.id} 事件 ${e.kind} 不存在（有的是 ${EVENT_KINDS.join('、')}）`);
        const r = resolveTime(e.at, s, song);
        if (!r) errors.push(`分鏡 ${s.id} 的 ${p.id} 事件 ${e.kind} 的時間找不到（${JSON.stringify(e.at)}）`);
        else if (r.t < s.start - 0.05 || r.t > s.end + 0.05) errors.push(`分鏡 ${s.id} 的 ${p.id} 事件 ${e.kind} 在這段之外（${r.t.toFixed(2)} 秒）`);
        else if (r.uncertain) warnings.push(`分鏡 ${s.id} 的 ${p.id} 事件 ${e.kind} 綁在沒有對到人聲的字上（${r.t.toFixed(2)} 秒），同步不保證`);
      }
    }
    errors.push(...contrastErrors(s));
    // a size asked for below the smallest readable type is refused before anything is drawn
    for (const p of s.parts) {
      const size = typeof p.params?.['size'] === 'number' ? (p.params['size'] as number) : undefined;
      if (size !== undefined && ['band', 'shout'].includes(p.kind) && size < (p.kind === 'band' ? MIN_LEAD_PX : MIN_CALL_PX)) errors.push(`分鏡 ${s.id} 的 ${p.id}：size ${size} 小於最小可讀字級 ${p.kind === 'band' ? MIN_LEAD_PX : MIN_CALL_PX}px`);
    }
    // two text parts of one scene in the same band of the frame at the same time land on each other
    // (an LED wall's type is sized to its calls, known only when drawn: the frame check measures it)
    const textParts = s.parts.filter((p) => ['band', 'poster', 'ticket', 'shout'].includes(p.kind) && p.lines?.length);
    const span = (p: ScenePart): [number, number] => {
      const y = typeof p.params?.['y'] === 'number' ? (p.params['y'] as number) : p.kind === 'band' ? -0.42 : p.kind === 'shout' ? 0.5 : p.kind === 'led' ? 0.2 : 0;
      // half-heights in the same −1..1 units: a poster's area, a ticket's card, a band's row or two, a shout's word
      const h = p.kind === 'poster' ? (typeof p.params?.['height'] === 'number' ? (p.params['height'] as number) : 0.86) : p.kind === 'ticket' ? 0.52 : 0.2;
      return [y - h, y + h];
    };
    const shown = shownTexts(s, song);
    for (let i = 0; i < textParts.length; i++)
      for (let j = i + 1; j < textParts.length; j++) {
        const [a, b] = [textParts[i], textParts[j]];
        const [a0, a1] = span(a), [b0, b1] = span(b);
        const together = shown.some((x) => x.partId === a.id && shown.some((y) => y.partId === b.id && x.from < y.to && y.from < x.to));
        // only parts of one kind are sure to fill the same space (two posters, two bands); a poster beside a band may
        // well leave it room, and the frame check measures that
        if (a.kind === b.kind && together && a0 < b1 && b0 < a1 && Math.min(a1, b1) - Math.max(a0, b0) > 0.1) errors.push(`分鏡 ${s.id} 的 ${a.id} 和 ${b.id} 同時出現在畫面同一區（y 重疊）：把其中一個移開，或讓它們不同時出現`);
      }
    // every line in a scene's time is carried by some part (none dropped on the floor)
    for (const id of shotCues) {
      const c = song.cues.find((x) => x.id === id);
      if (!c || c.start < s.start - 0.05 || c.start >= s.end) continue;
      const split = splitCalls(c.text);
      if (split.main.trim() && split.calls.length && !bound.has(`${id}:lead`)) errors.push(`${id}「${c.text}」的主唱部分沒有元件承載`);
      if (!bound.has(`${id}:lead`) && !bound.has(`${id}:call`) && !bound.has(`${id}:shout`)) errors.push(`${id}「${c.text}」在分鏡 ${s.id} 裡沒有元件承載`);
      if (split.calls.length && split.main.trim() && !bound.has(`${id}:call`)) errors.push(`${id} 的 Call（${split.calls.map((k) => k.text).join('、')}）沒有元件承載`);
    }
    // a long stretch with nothing but the ground (an intro under a lone title, an outro holding one still): the story
    // stops there; a title counts for its first seconds only
    {
      const spans = [...shownTexts(s, song).map((x) => [x.from, x.to] as const), ...(s.parts.some((p) => p.kind === 'title') ? [[s.start, s.start + EMPTY_MAX] as const] : [])].sort((a, b) => a[0] - b[0]);
      let at = s.start;
      for (const [f, t] of [...spans, [s.end, s.end] as const]) {
        if (f - at >= EMPTY_MAX) errors.push(`分鏡 ${s.id} 的 ${at.toFixed(1)}–${f.toFixed(1)} 秒畫面上只有底（沒有字也沒有物件）：放一個不綁歌詞的 object（整段都在）讓故事繼續，例如前奏響起的鬧鐘、結尾的獎牌`);
        at = Math.max(at, t);
      }
    }
    // reading time, as planned (the render check measures it again on the drawn frames), and room: a text a part
    // cannot hold at its smallest readable size is sent back to be carried by another part
    for (const x of shownTexts(s, song).filter((t) => t.role !== 'echo' && t.role !== 'object')) {
      const part = s.parts.find((p) => p.id === x.partId)!;
      const room = fits(part, x.text);
      if (room) errors.push(`${x.cueId}「${x.text}」放不進 ${x.partId}（${part.kind}）：${room}；換一個能承載這個長度的元件（${holders(x.text, x.role).join('、') || '沒有元件放得下一整句：拆成兩個元件各放一半時間'}），程式不會縮小字硬塞`);
      // a shout is read at a glance, like a call
      const need = x.role === 'lead' ? leadNeed(x.cueId, x.text, song) : callSec(x.text);
      if (x.to - x.from < need - 0.05) errors.push(`${x.cueId}「${x.text}」在 ${x.partId} 只停 ${(x.to - x.from).toFixed(1)} 秒，至少要 ${need.toFixed(1)} 秒：放到另一個元件或讓它停久一點`);
      if (x.uncertain) warnings.push(`${x.cueId}「${x.text}」的出現時間是估的（逐字時間沒有對到人聲）`);
    }
  });
  for (const [k, parts] of bound) if (parts.length > 1) errors.push(`${k.replace(':', ' 的 ')} 同時放在 ${parts.join('、')}`);
  return { errors, warnings };
}

/** The shot a scene is drawn in. */
export const sceneShotId = (sceneId: string) => `sb-${sceneId}`;

/**
 * Makes the shots of a storyboard: one locked 'scene' shot per scene (shots inside a scene go, shots across its edges
 * are trimmed), and every line sung in a scene styled in its shot. Returns how many lines it took over.
 */
export function applyStoryboard(t: {
  storyboard?: Scene[];
  shots: { id: string; start: number; end: number; template: string; params: Record<string, unknown>; camera: string; transitionIn: string }[];
  cues: { cueId: string; shot: string; enter: string; exit: string; reveal?: string }[];
}, cues: { id: string; start: number }[]): number {
  if (!t.storyboard?.length) return 0;
  const inScene = (x: number) => t.storyboard!.find((s) => x >= s.start - 0.05 && x < s.end - 0.05);
  let shots = t.shots.filter((s) => !t.storyboard!.some((b) => s.start >= b.start - 0.05 && s.end <= b.end + 0.05));
  for (const b of t.storyboard) {
    shots = shots.map((s) => (s.start < b.start && s.end > b.start ? { ...s, end: b.start } : s.start < b.end && s.end > b.end ? { ...s, start: b.end } : s));
    shots.push({ id: sceneShotId(b.id), start: b.start, end: b.end, template: 'scene', params: { scene: b.id }, camera: 'static', transitionIn: 'cut' });
  }
  t.shots = shots.sort((a, b) => a.start - b.start);
  let n = 0;
  for (const c of cues) {
    const b = inScene(c.start);
    if (!b) continue;
    const style = t.cues.find((x) => x.cueId === c.id);
    const locked = { cueId: c.id, shot: sceneShotId(b.id), enter: 'cut', exit: 'cut', reveal: 'line' };
    if (style) Object.assign(style, locked);
    else t.cues.push(locked);
    n++;
  }
  return n;
}

/** A poster line's phrases: split at spaces and sentence marks (kept on the phrase before), with each phrase's first
 * character index in the line. */
export function posterPhrases(text: string, breakLong = true): { text: string; start: number }[] {
  const out: { text: string; start: number }[] = [];
  const chars = [...text];
  let cur = '', start = 0;
  chars.forEach((c, i) => {
    if (/\s/.test(c)) {
      if (cur) out.push({ text: cur, start });
      cur = '';
      start = i + 1;
      return;
    }
    cur += c;
    if (/[！？!?、。]/.test(c) && i < chars.length - 1 && !/[！？!?」]/.test(chars[i + 1])) {
      out.push({ text: cur, start });
      cur = '';
      start = i + 1;
    }
  });
  if (cur) out.push({ text: cur, start });
  // a phrase too long to set large is broken once more at the word boundary nearest its middle (引きちぎり|踊れ！)
  return out.flatMap((ph) => {
    const n = [...ph.text].length;
    if (!breakLong || n <= POSTER_ROW) return [ph];
    const chars = [...ph.text];
    // both rows a real word: at least three characters, and the second never opens on a sound that cannot start one
    const cut = [...phraseBoundaries(ph.text)].filter((b) => b >= 3 && n - b >= 3 && !/[んっゃゅょぁぃぅぇぉーッャュョ]/.test(chars[b]) && !/[っッ]/.test(chars[b - 1])).sort((x, y) => Math.abs(x - n / 2) - Math.abs(y - n / 2))[0];
    if (!cut) return [ph];
    return [{ text: chars.slice(0, cut).join(''), start: ph.start }, { text: chars.slice(cut).join(''), start: ph.start + cut }];
  });
}
/** Characters a poster row holds before it is broken at a word boundary. */
export const POSTER_ROW = 6;

/** What each part does and the params it reads (the storyboard director's catalogue; one source with the drawing). */
export const PART_GUIDE: Record<PartKind, string> = {
  stage: '舞台光或背景（不放歌詞）。params：look spot（一盞追光，x 是燈的位置 −1..1）／sweep（兩側掃動的燈）／backlight（舞台後方往外炸的背光）／gingham（base 底色上 color 的格紋）／stripes（base 到 color 的漸層上飄動的白色斜條紋）／bokeh（color 到 base 的光暈上各色光斑）；color 光的顏色；base 地板與空間的底色；penlights 台下觀眾手上燈的顏色陣列（空陣列＝沒有觀眾）；crowd 觀眾拿什麼 sticks（螢光棒）／hearts（愛心燈）／uchiwa（應援扇剪影）／phones（手機燈海）；crowdMotion 怎麼動 wave（各自揮）／sync（全場同步左右擺）／pulse（不動、跟拍子閃）。events：flash（兩格純白）、blackout（熄燈，直到 lightsUp）、lightsUp。',
  led: 'LED 牆（點陣字）。可放 call（括號裡台下喊的）或整句都是 Call 的句子。params：mode one（一次一個，新的取代舊的）／row（喊得很近的 Call 整批並排，位置和字級從第一個就固定，放不下自動換行或換下一批）；color；y 牆的中心 −1..1；height 牆高占畫面比例；idle 沒有 Call 時暗暗跑的字（團名或歌名）。',
  band: '斜帶（一條橫過畫面的色帶，主唱歌詞印在上面，每句滑入）。只放 lead。params：mode one／stack（快句時前一句往上推、兩行同字級）；angle 角度（度）；y 位置 −1..1；size 字級上限；color 帶子顏色；ink 字的顏色。',
  ticket: '特典券／票券（歌詞印在票面上，唱到哪印到哪；一張票一句，新的一句換一張票從上方落下）。只放 lead，一句最多兩行、每行約 13 字。params：x、y 位置 −1..1；angle 傾斜（度）；color 票根顏色；title 票面上的小字（例：CHEKI × 1）；serial 編號；stub 票根上的大字（例：特典券）；timer true 顯示倒數計時器，倒數到 peel 事件。events：peel（票面沿撕線被撕走、甩出畫面）。',
  fans: '應援扇（うちわ）。一句歌詞拆成詞組，一支扇子一個詞組（最多 4 支，每支最多兩行、每行約 5 字），唱到那個詞組時從下方彈上來，隨拍晃。放 lead 或 shout。params：colors 每支扇子的顏色陣列；y 位置；r 扇面大小（預設 270）。',
  badge: '缶バッジ（徽章）。放 call：每個 Call 喊的那一拍別上一顆徽章（最多兩行、每行約 3 字）。params：x、y 第一顆的位置 −1..1，之後的往左排；r 大小（預設 180）；color 徽章顏色。',
  object: '故事物件（插畫，像車票一樣是畫面裡的實物）：歌詞講到的具體東西（貓、冰棒、飯碗、電車、鬧鐘…），唱到那句時出現，之後輕輕呼吸，不亂飄、不擋字。lines 放 role object（綁一句歌詞，唱到時出現）；不綁歌詞就是整段都在（前奏、間奏、結尾沒有歌詞時用它讓故事繼續）。params：prop 物件 id（要列在 props）；x、y 位置 −1..1；size 高度占畫面比例（0.25–0.6，主角物件 0.4 以上）；motion pop（彈出）／drop（從上方落下）／slide（從側邊滑入）；angle 傾斜（度）。同一個物件可以在好幾段出現，讓故事連起來。',
  title: '標題：歌名和團名的大字（開頭、結尾）。params：color、accent（團名的顏色）、y、style slab／sticker／round。',
  echo: '詞的回音（背景）：歌詞裡的一個詞（word），每唱到一次就在背景多疊一層，越疊越大或洗滿畫面——同一個詞一直重複的歌用。只放 role echo（不承載歌詞：那句還是要由別的元件清楚呈現；它不受閱讀檢查，但會被前面的字擋住）。params：word 要重複的詞（必須在歌詞裡）；mode stack（往上堆、一層比一層大）／fill（一行一行洗滿畫面）；color；style slab／sticker；alpha 透明度（0.1–0.5，預設 0.28）。',
  shout: '喊聲字（貼紙字：實心主色、白色和深色粗外框、傾斜，逐字隨喊聲彈出、震動）。放 shout（12 字以內的掛け声）。params：y 位置；angle 傾斜（度）；color、color2 填色的上下兩色。',
  poster: '巨字海報（一句歌詞拆成詞組，往下錯落排成海報，每個詞組唱到時重擊進場）。只放 lead，一次一句。params：big 要放到巨大的那個詞（必須是歌詞裡的字）；accent 用強調色的詞；color 字色；accentColor 強調色；y、height 海報占的區域（中心 −1..1、高度占畫面比例，預設 0、0.86：旁邊有斜帶或徽章時要讓出位置）；style 字的材質 slab（粗黑體）／sticker（貼紙字）／round（白色圓體配深色細框）。適合字少、有份量的句子；長句會被縮小，太小會被檢查退回。',
};

/** The roles each part can carry. */
export const PART_ROLES: Record<PartKind, LineRole[]> = {
  stage: [], led: ['call', 'lead'], band: ['lead'], poster: ['lead'], ticket: ['lead'], fans: ['lead', 'shout'], badge: ['call'], shout: ['shout'], echo: ['echo'], object: ['object'], title: [],
};

/**
 * The text broken into at most `rows` rows of at most `em` ems, at word boundaries (spaces, sentence marks, then the
 * word segmenter's boundaries; never before a sound that cannot start a word). Undefined when it cannot fit.
 */
export function wrapRows(text: string, em: number, rows: number): string[] | undefined {
  const chars = [...text.trim()];
  if (emWidth(text) <= em) return [text.trim()];
  if (rows <= 1) return undefined;
  const cuts = [...phraseBoundaries(text.trim())].filter((b) => b > 0 && b < chars.length && !/[んっゃゅょぁぃぅぇぉーッャュョ！？!?、。」]/.test(chars[b]) && !/[っッ]/.test(chars[b - 1]));
  // the latest cut that leaves a first row within the width, then the rest wrapped the same way
  for (const b of cuts.sort((x, y) => y - x)) {
    const first = chars.slice(0, b).join('').trim();
    if (emWidth(first) > em) continue;
    const rest = wrapRows(chars.slice(b).join(''), em, rows - 1);
    if (rest) return [first, ...rest];
  }
  return undefined;
}

/** Ems a row of a part holds at the smallest readable size, and how many rows (frame 1920 px wide). */
export function partRoom(p: ScenePart): { em: number; rows: number; boards?: number } {
  const n = (k: string, d: number) => (typeof p.params?.[k] === 'number' ? (p.params[k] as number) : d);
  switch (p.kind) {
    case 'band': return { em: (FRAME_W * 0.82) / MIN_LEAD_PX, rows: 1 };
    case 'poster': return { em: (FRAME_W * 0.72) / MIN_LEAD_PX, rows: 1, boards: 4 };
    case 'ticket': return { em: (n('w', 1420) - 420) / MIN_LEAD_PX, rows: 2 };
    case 'fans': return { em: (n('r', 270) * 1.55) / MIN_LEAD_PX, rows: 2, boards: 4 };
    case 'badge': return { em: (n('r', 180) * 1.6) / MIN_CALL_PX, rows: 2 };
    case 'shout': return { em: (FRAME_W * 0.8) / MIN_CALL_PX, rows: 1 };
    default: return { em: (FRAME_W * 0.94) / MIN_CALL_PX, rows: 1 };
  }
}

/** The part kinds that take this role and hold this text at their default size: named when a line does not fit. */
export function holders(text: string, role: string): string[] {
  return (Object.keys(PART_ROLES) as PartKind[])
    .filter((k) => k !== 'stage' && (PART_ROLES[k] as string[]).includes(role) && !fits({ kind: k, params: {} } as ScenePart, text));
}

/** Why a text does not fit a part (undefined when it does): posters and fans set each phrase on its own row or board. */
export function fits(p: ScenePart, text: string): string | undefined {
  if (p.kind === 'stage' || p.kind === 'led') return undefined;
  const r = partRoom(p);
  if (r.boards) {
    // a fan board wraps its phrase inside it; a poster breaks a long phrase into rows of its own
    const ph = posterPhrases(text, p.kind === 'poster');
    if (ph.length > r.boards) return `拆成 ${ph.length} 個詞組，最多 ${r.boards} 個`;
    const bad = ph.find((x) => !wrapRows(x.text, r.em, r.rows));
    return bad ? `「${bad.text}」超過 ${r.rows} 行、每行約 ${Math.floor(r.em)} 字` : undefined;
  }
  return wrapRows(text, r.em, r.rows) ? undefined : `超過 ${r.rows} 行、每行約 ${Math.floor(r.em)} 字`;
}

const hexLum = (hex: string): number | undefined => {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return undefined;
  const n = parseInt(m[1], 16);
  const c = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * c((n >> 16) & 255) + 0.7152 * c((n >> 8) & 255) + 0.0722 * c(n & 255);
};
/** WCAG contrast of two colours (undefined unless both are #rrggbb). */
export function contrastOf(a: string, b: string): number | undefined {
  const [x, y] = [hexLum(a), hexLum(b)];
  if (x === undefined || y === undefined) return undefined;
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
/** Flat type against the colour it is printed on, known before rendering: a band's ink on its band, a flat poster on the
 * stage's ground (both of a pastel stage's colours). Outlined materials (sticker, round, LED dots) carry their own. */
export function contrastErrors(s: Scene): string[] {
  const out: string[] = [];
  const stage = s.parts.find((p) => p.kind === 'stage');
  const grounds = stage ? [stage.params?.['base'], ...(['gingham', 'stripes', 'bokeh'].includes(String(stage.params?.['look'])) ? [stage.params?.['color']] : [])].filter((x): x is string => typeof x === 'string') : ['#050505'];
  const need = (p: ScenePart, ink: string, on: string[], what: string) => {
    for (const g of on) {
      const c = contrastOf(ink, g);
      if (c !== undefined && c < 4.5) out.push(`分鏡 ${s.id} 的 ${p.id}：${what} ${ink} 在 ${g} 上對比只有 ${c.toFixed(1)}:1（至少 4.5:1），換深一點或淺一點的顏色`);
    }
  };
  for (const p of s.parts) {
    const str = (k: string, d: string) => (typeof p.params?.[k] === 'string' ? (p.params[k] as string) : d);
    if (p.kind === 'band') need(p, str('ink', '#000000'), [str('color', '#FFFFFF')], '字色');
    if (p.kind === 'poster' && ['slab', 'print'].includes(str('style', 'slab'))) {
      need(p, str('color', '#FFFFFF'), grounds, '字色');
      if (p.params?.['accent']) need(p, str('accentColor', '#FF1F4B'), grounds, '強調色');
    }
    if (p.kind === 'led') need(p, str('color', '#FF1F4B'), ['#050505'], 'LED 顏色');
    // an echo is background, but one that cannot be seen is no echo: its colour, as laid over the ground at its
    // opacity, must stand apart from it
    if (p.kind === 'echo') {
      const a = Math.min(0.5, Math.max(0.1, typeof p.params?.['alpha'] === 'number' ? (p.params['alpha'] as number) : 0.28));
      for (const g of grounds) {
        const c = contrastOf(blend(g, str('color', '#FFFFFF'), a), g);
        if (c !== undefined && c < 1.4) out.push(`分鏡 ${s.id} 的 ${p.id}：回音 ${str('color', '#FFFFFF')}（透明度 ${a}）疊在 ${g} 上幾乎看不見（${c.toFixed(2)}:1，至少 1.4:1），換和底色差多一點的顏色或提高 alpha`);
      }
    }
  }
  return out;
}

/** A scene's skeleton: its stage look and the kinds of parts on it (what reads as "the same layout" across songs). */
export function sceneSkeleton(s: Scene): string {
  const stage = s.parts.find((p) => p.kind === 'stage');
  const kinds = [...new Set(s.parts.filter((p) => p.kind !== 'stage').map((p) => p.kind))].sort();
  // spot, sweep and backlight are one dark stage; gingham, stripes and bokeh one bright ground (a band and a wall on a
  // dark stage read as the same layout whichever light is on)
  const look = String(stage?.params?.['look'] ?? 'none');
  const ground = ['spot', 'sweep', 'backlight'].includes(look) ? 'dark' : ['gingham', 'stripes', 'bokeh'].includes(look) ? 'bright' : look;
  // the crowd's penlights are as much a part of the layout as the parts on stage (てぇてぇ's waving sticks read as
  // i REVOLUTION's stage again)
  const crowd = Array.isArray(stage?.params?.['penlights']) && (stage!.params!['penlights'] as unknown[]).length ? '+penlights' : '';
  return `${ground}${crowd}|${kinds.join('+')}`;
}

/** Scenes whose skeleton an earlier song already used (stage look and parts): the same layout recoloured. */
export function reusedSkeletons(scenes: Scene[], earlier: { song: string; skeletons: string[] }[]): { scene: string; skeleton: string; song: string }[] {
  return scenes.flatMap((s) => {
    const k = sceneSkeleton(s);
    const hit = earlier.find((e) => e.skeletons.includes(k));
    return hit ? [{ scene: s.id, skeleton: k, song: hit.song }] : [];
  });
}

/** `top` laid over `base` at opacity `a` (#rrggbb, straight sRGB mix as the canvas does). */
function blend(base: string, top: string, a: number): string {
  const p = (h: string) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  if (!/^#[0-9a-f]{6}$/i.test(base) || !/^#[0-9a-f]{6}$/i.test(top)) return base;
  const [b, t] = [p(base), p(top)];
  return '#' + b.map((v, i) => Math.round(v * (1 - a) + t[i] * a).toString(16).padStart(2, '0')).join('');
}

/** The background elements that become a song's look (the crowd's penlights): one song's, not every song's. */
export function sceneMotifs(s: Scene): string[] {
  const stage = s.parts.find((p) => p.kind === 'stage');
  // a crowd is the same crowd only if it holds the same things and moves the same way: a new song may bring the
  // crowd back, held and moving its own way
  if (!(Array.isArray(stage?.params?.['penlights']) && (stage!.params!['penlights'] as unknown[]).length)) return [];
  return [`penlights:${String(stage!.params!['crowd'] ?? 'sticks')}:${String(stage!.params!['crowdMotion'] ?? 'wave')}`];
}

/** How long the scene's opening transition from the scene before runs (0 for a cut, a flash or lights out). */
export function enterSec(scenes: Scene[], s: Scene): number {
  const prev = scenes[scenes.indexOf(s) - 1];
  const kind = prev?.exit;
  return prev && Math.abs(prev.end - s.start) < 0.1 && kind && (TRANSITION_KINDS as string[]).includes(kind) ? TRANSITION_SEC[kind as TransitionKind] : 0;
}

/** The moments a storyboard plays (moments.ts kinds): build-ups push in, drops and the finale hit. */
export interface SceneMoment { kind: string; at: number; dur?: number; strength?: number }

/** The camera over a scene at t: how far it has pushed in (build-ups grow it, drops punch it), and whether a drop's
 * two white frames are on. */
export function momentCamera(moments: SceneMoment[], t: number): { zoom: number; flash: boolean } {
  let zoom = 1, flash = false;
  for (const m of moments) {
    const k = m.strength ?? 1;
    if (m.kind === 'build' && m.dur && t >= m.at - m.dur && t < m.at) zoom += 0.05 * k * ((t - (m.at - m.dur)) / m.dur);
    if ((m.kind === 'drop' || m.kind === 'finale') && t >= m.at) {
      zoom += (m.kind === 'finale' ? 0.12 : 0.08) * k * Math.exp(-(t - m.at) / 0.18);
      if (t < m.at + 0.067) flash = true;
    }
  }
  return { zoom, flash };
}
