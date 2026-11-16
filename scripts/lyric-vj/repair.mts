// A repair round for props the renderer had to cut out of a read line (graphics.ts keepClear, `code layer: lyric kept
// clear:`). Sent back as an ordinary problem, the director rebuilt the whole window (世界のつづき 68–88 s: new scenes, score
// 57) to fix one lighthouse. Here it may only move, resize or retime the props named in the findings — with what is drawn
// with them (the rock they stand on, their shadow, their light) — and the program holds it to that:
// - its answer is edits of the current code, each near a named prop's id in the code, none dropping, adding or rewriting
//   another prop's draw (scopedEdits)
// - the new drawing is rendered at the same times as the old one (background layer, sprite boxes tracked): every other
//   prop must stand where it stood, the shots without a named prop must come out the same (PSNR), the named shots must
//   be the same outside the named props' places, each named prop must take its base along (what the drawing paints
//   under its foot, logged per draw: a lighthouse moved off its rock fails), stay drawn and stay on the frame (checkRepair)
// - a repair that fails goes back once with what failed; a repair that passes but still has draws kept clear is kept
//   only if it has fewer
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export type Rect = { x0: number; y0: number; x1: number; y1: number };
/** One `code layer: lyric kept clear:` finding. */
export type Kept = { id: string; t: number; shot: number; cut: boolean };
/** A named prop: the shots (camera cuts) it was kept clear in and when. */
export type Named = { id: string; shots: number[]; times: number[] };
/** A shot's lines and the room they leave (graphics.ts logs it in --track renders), frame px. */
export type Room = { shot: number; from: number; to: number | null; lines: (Rect & { from: number; to: number })[]; rooms: Rect[] };
/**
 * One sprite draw on a tracked frame (frame px); `kept`: the keep-clear cut or faded it; `base`: what the drawing paints
 * under its foot along with it (graphics.ts baseDrawnWith), and `baseN` how many paints that is.
 */
export type Drawn = { id: string; x: number; y: number; w: number; h: number; a: number; kept: boolean; base?: Rect; baseN?: number };
export type Frame = { t: number; shot: number; drawn: Drawn[] };
export type Edit = { find: string; replace: string };
/** An RGB picture (rgb24 rows). */
export type Pic = { w: number; h: number; px: Uint8Array };

/** Parses the kept-clear findings (anywhere in a line: a render's progress shares its lines). */
export function parseKept(log: string): Kept[] {
  const re = /code layer: lyric kept clear: (\S+) (\d+)% inside the lyric box, (cut out and faded|faded) at ([\d.]+) s \(shot (\d+)\)/g;
  return [...log.matchAll(re)].map((m) => ({ id: m[1], cut: m[3] !== 'faded', t: Number(m[4]), shot: Number(m[5]) }));
}

/** The props to repair: kept-clear findings inside [from, to], by prop. */
export function namedOf(kept: Kept[], from = -Infinity, to = Infinity): Named[] {
  const by = new Map<string, Named>();
  for (const k of kept.filter((x) => x.t >= from && x.t <= to)) {
    const n = by.get(k.id) ?? (by.set(k.id, { id: k.id, shots: [], times: [] }), by.get(k.id)!);
    if (!n.shots.includes(k.shot)) n.shots.push(k.shot);
    n.times.push(k.t);
  }
  return [...by.values()].map((n) => ({ ...n, shots: n.shots.sort((a, b) => a - b), times: [...new Set(n.times)].sort((a, b) => a - b) }));
}

/** Each shot's lines and room, from `code layer: room <shot> {json}` lines. */
export function parseRooms(log: string): Map<number, Room> {
  const out = new Map<number, Room>();
  for (const m of log.matchAll(/code layer: room (\d+) (\{.*?\})(?=\s*(?:$|\n|code layer:|\s+frame ))/gm)) {
    try {
      out.set(Number(m[1]), { shot: Number(m[1]), ...JSON.parse(m[2]) });
    } catch {
      /* a malformed line: the shot has no room on record, the prompt says so */
    }
  }
  return out;
}

/** The tracked frames at the asked times (a render also draws frames of its own, for its checks: those are left out). */
export function parseFrames(log: string, times: number[]): Frame[] {
  const want = new Set(times.map((t) => t.toFixed(2)));
  const out = new Map<string, Frame>();
  for (const m of log.matchAll(/code layer: track (\S+) (\d+) ?([^\n]*?)(?=\s*(?:$|\n|code layer:|\s+frame ))/gm)) {
    const key = Number(m[1]).toFixed(2);
    if (!want.has(key) || Math.abs(Number(m[1]) - Number(key)) > 1e-3 || out.has(key)) continue;
    const drawn = m[3].split(';').filter(Boolean).map((b) => {
      const [id, rest] = [b.slice(0, b.lastIndexOf(':')), b.slice(b.lastIndexOf(':') + 1)];
      const f = rest.split(',');
      const [x, y, w, h, a] = f.slice(0, 5).map(Number);
      const bb = f.slice(5).find((x) => x.startsWith('b'))?.slice(1).split('/').map(Number);
      return { id, x, y, w, h, a, kept: f.slice(5).includes('k'), ...(bb?.length === 5 ? { base: { x0: bb[0], y0: bb[1], x1: bb[2], y1: bb[3] }, baseN: bb[4] } : {}) };
    });
    out.set(key, { t: Number(key), shot: Number(m[2]), drawn });
  }
  return [...out.values()].sort((p, q) => p.t - q.t);
}

/** A bracket pair of the code and the pair it sits in (-1: the code's top level). */
type Pair = { open: number; close: number; ch: '(' | '[' | '{'; parent: number };
/**
 * The drawing's code as bracket pairs (strings, templates and comments skipped; regular expressions are not, which a
 * drawing seldom uses), enough to tell a prop's statement, its block and the helpers defined in it apart.
 */
export function codeMap(src: string) {
  const pairs: Pair[] = [];
  const stack: number[] = [];
  const close: Record<string, Pair['ch']> = { ')': '(', ']': '[', '}': '{' };
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') i = src.indexOf('\n', i) < 0 ? src.length : src.indexOf('\n', i);
    else if (c === '/' && src[i + 1] === '*') i = src.indexOf('*/', i + 2) < 0 ? src.length : src.indexOf('*/', i + 2) + 1;
    else if (c === "'" || c === '"' || c === '`') {
      for (i++; i < src.length && src[i] !== c; i++) if (src[i] === '\\') i++;
    } else if (c === '(' || c === '[' || c === '{') {
      pairs.push({ open: i, close: src.length, ch: c, parent: stack.length ? stack[stack.length - 1] : -1 });
      stack.push(pairs.length - 1);
    } else if (c in close && stack.length && pairs[stack[stack.length - 1]].ch === close[c]) pairs[stack.pop()!].close = i;
  }
  const kids = new Map<number, Pair[]>();
  for (const q of pairs) kids.set(q.parent, [...(kids.get(q.parent) ?? []), q]);
  const root: Pair = { open: -1, close: src.length, ch: '{', parent: -2 };
  const at = (k: number) => (k < 0 ? root : pairs[k]);
  /** The innermost pair round position p, of the given kinds (the whole code when none). */
  const around = (p: number, kinds = '([{'): Pair => {
    let best = -1;
    for (const [k, q] of pairs.entries()) if (q.open < p && q.close > p && kinds.includes(q.ch) && (best < 0 || q.open > pairs[best].open)) best = k;
    return at(best);
  };
  const indexOf = (b: Pair) => (b === root ? -1 : pairs.indexOf(b));
  /** Where a block's statements end: `;` at its own depth, or a nested `{…}` not followed by else, catch, a call… */
  const ends = (b: Pair) => {
    const own = (kids.get(indexOf(b)) ?? []).sort((x, y) => x.open - y.open);
    const out: number[] = [];
    let k = 0;
    for (let i = b.open + 1; i < b.close; i++) {
      if (k < own.length && own[k].open === i) {
        const q = own[k++];
        i = q.close;
        if (q.ch === '{' && !/^\s*(else|catch|finally|while|\)|,|\.|;|\[|\(|\?|:|\|\||&&)/.test(src.slice(q.close + 1, q.close + 12))) out.push(i);
        continue;
      }
      if (src[i] === ';') out.push(i);
    }
    return out;
  };
  const endsOf = new Map<Pair, number[]>();
  /** The statement round position p in the block it sits in: [start, end) of the code. */
  const statement = (p: number): [number, number] => {
    const b = around(p, '{');
    const e = endsOf.get(b) ?? (endsOf.set(b, ends(b)), endsOf.get(b)!);
    return [Math.max(b.open, ...e.filter((x) => x < p)) + 1, Math.min(b.close, ...e.filter((x) => x >= p).map((x) => x + 1))];
  };
  /**
   * The named functions the code defines (`function f(…){…}`, `const f = (…) => {…}`): [header, end of body]. Callbacks
   * written inline (a forEach's arrow) belong to the statement they are in.
   */
  const helpers: [number, number][] = [];
  for (const m of src.matchAll(/function\s+[\w$]+\s*\(|(?:const|let|var)\s+[\w$]+\s*=\s*(?:\([^()]*\)|[\w$]+)\s*=>\s*\{/g)) {
    let body = m.index! + m[0].length - 1;
    if (m[0].startsWith('function')) {
      const params = pairs.find((q) => q.ch === '(' && q.open === body);
      body = params ? src.indexOf('{', params.close) : -1;
    }
    const q = pairs.find((x) => x.ch === '{' && x.open === body);
    if (q) helpers.push([m.index!, q.close + 1]);
  }
  return { around, statement, helpers };
}

const lit = (id: string) => new RegExp(`(['"\`])${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\1`, 'g');
const count = (s: string, id: string) => (s.match(lit(id)) ?? []).length;

/** How much of the code (characters changed) one repair may touch. */
export const MAX_CHANGED = 4000;

/**
 * Applies a repair's edits under its scope, all against the code as it was (positions and anchors from the original,
 * so one edit cannot widen the next one's reach). A named prop is anchored where its id is passed to a call (not a
 * registry's key); an edit may change only the blocks such a call stands in, and in them:
 * - no statement that names another prop (its draw, a wrapper passing its id, a registry listing it), nor a named
 *   function defined there that draws no named prop (a shared helper such as the one every prop is drawn with)
 * - no prop brought in, and the named props' ids neither dropped nor added (a moved draw keeps its one call)
 * - at most MAX_CHANGED characters in all, counting accepted edits only
 * Edits that break a rule are not applied and come back as errors; the rest are. `known`: every prop id the song may
 * draw (its sprite library).
 */
export function scopedEdits(src: string, edits: Edit[], named: string[], known: string[]): { src: string; errs: string[]; applied: number } {
  const map = codeMap(src);
  const errs: string[] = [];
  const others = known.filter((id) => !named.includes(id));
  const anchors = named.flatMap((id) => [...src.matchAll(lit(id))].map((m) => m.index!).filter((p) => map.around(p + 1).ch === '(' && !/^\s*:/.test(src.slice(p + id.length + 2))));
  const blocks = anchors.map((p) => map.around(p, '{'));
  const fenced = others.flatMap((id) => [...src.matchAll(lit(id))].map((m) => ({ id, span: map.statement(m.index!) })));
  const helpers = map.helpers.filter(([h0, h1]) => !anchors.some((p) => p > h0 && p < h1));
  const taken: { at: number; end: number; e: Edit }[] = [];
  let changed = 0;
  for (const [k, e] of edits.entries()) {
    const tag = `第 ${k + 1} 個修改（${e.find.slice(0, 60)}…）`;
    const n = e.find ? src.split(e.find).length - 1 : 0;
    if (n !== 1) {
      errs.push(`${tag}：find ${n === 0 ? '在目前程式裡找不到' : `出現了 ${n} 次`}`);
      continue;
    }
    const at = src.indexOf(e.find);
    const end = at + e.find.length;
    const over = ([a, b]: [number, number]) => at < b && end > a;
    if (taken.some((x) => over([x.at, x.end]))) errs.push(`${tag}：和前面的修改重疊`);
    else if (!blocks.some((b) => at > b.open && end <= b.close)) errs.push(`${tag}：不在指名素材（${named.join('、')}）所在的那一段程式裡，超出這一輪能改的範圍`);
    else if (fenced.some((x) => over(x.span))) errs.push(`${tag}：改到了沒有指名的素材 ${[...new Set(fenced.filter((x) => over(x.span)).map((x) => x.id))].join('、')} 的那一句（它們要原樣保留）`);
    else if (helpers.some(over)) errs.push(`${tag}：改到了共用的函式定義（其他素材也用它畫）`);
    else if (others.some((id) => count(e.replace, id))) errs.push(`${tag}：加了新的素材 ${others.filter((id) => count(e.replace, id)).join('、')}`);
    else if (named.some((id) => count(e.find, id) > count(e.replace, id))) errs.push(`${tag}：把指名的素材拿掉了：只能移動、縮放或改時間，不能刪掉`);
    else if (named.some((id) => count(e.find, id) < count(e.replace, id))) errs.push(`${tag}：多寫了一次指名素材的 id：用同一個呼叫移動它（包在 ctx.save/translate/scale/restore 裡），不要複製它`);
    else if (changed + Math.max(e.find.length, e.replace.length) > MAX_CHANGED) errs.push(`${tag}：這一輪改動超過 ${MAX_CHANGED} 字，修補只能是小幅修改`);
    else {
      changed += Math.max(e.find.length, e.replace.length);
      taken.push({ at, end, e });
    }
  }
  let out = src;
  for (const x of [...taken].sort((p, q) => q.at - p.at)) out = out.slice(0, x.at) + x.e.replace + out.slice(x.end);
  return { src: out, errs, applied: taken.length };
}

/** The treatment with its drawing's code replaced (every code layer that ran `from`); nothing else of it changes. */
export function withSrc<T extends { graphics: { sections: { layers: { kind: string; src?: string }[] }[] } }>(t: T, from: string, to: string): T {
  const c = structuredClone(t);
  for (const s of c.graphics.sections) for (const l of s.layers) if (l.kind === 'code' && l.src === from) l.src = to;
  return c;
}

const boxOf = (d: Drawn): Rect => ({ x0: d.x, y0: d.y, x1: d.x + d.w, y1: d.y + d.h });
/** Where a named prop and what is drawn with it may change: its box padded sideways and below for its base and shadow. */
export const placeOf = (d: Drawn): Rect => ({ x0: d.x - 0.6 * d.w, y0: d.y - 0.1 * d.h, x1: d.x + 1.6 * d.w, y1: d.y + 1.35 * d.h });

/** PSNR (dB) of b against a over the pixels outside `allow` (picture px); Infinity when they are the same. */
export function psnrOutside(a: Pic, b: Pic, allow: Rect[] = []): number {
  let se = 0;
  let n = 0;
  for (let y = 0; y < a.h; y++)
    for (let x = 0; x < a.w; x++) {
      if (allow.some((r) => x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1)) continue;
      const i = (y * a.w + x) * 3;
      for (let c = 0; c < 3; c++) se += (a.px[i + c] - b.px[i + c]) ** 2;
      n += 3;
    }
  if (!n || !se) return Infinity;
  return 10 * Math.log10((255 * 255) / (se / n));
}

/**
 * Shots without a named prop: the same picture. The same code rendered twice came out bit-identical at all 126 samples
 * of 世界のつづき 68–88 s (A/A, PSNR ∞), so any visible change there is the repair's; 60 dB leaves room for another GPU.
 */
export const SAME_DB = 60;
/**
 * Named shots outside the named props' places: the same picture but for faint light the props carry (a lighthouse's
 * beam). A/A is ∞; in-scope repairs measured 39.5–43.1 dB there, a redrawn scene ~15.
 */
export const NEAR_DB = 35;
/** The share of a prop that may cross the frame's edge where the drawing had it whole. */
const EDGE = 0.03;
const offShare = (d: Drawn, W: number, H: number) => 1 - (Math.max(0, Math.min(d.x + d.w, W) - Math.max(d.x, 0)) * Math.max(0, Math.min(d.y + d.h, H) - Math.max(d.y, 0))) / Math.max(1, d.w * d.h);

/** One sample of the old and the new drawing: tracked frames and the background pictures (`scale`: picture px per frame px). */
export type Sample = { before: Frame; after?: Frame; a?: Pic; b?: Pic };

/**
 * What the new drawing broke (in words for the director; empty: the repair keeps to its scope), and how many draws of
 * the named props are still kept clear. Every other prop must stand where it stood (2 px, alpha 0.02); shots without a
 * named prop must be the same picture (SAME_DB), named shots the same outside the named props' places (NEAR_DB); each
 * named prop must still be drawn in each shot it was in, still stand on all of the base it was drawn with (as many of
 * those paints under its foot: one moved off its rock keeps only its shadow) and stay on the frame.
 */
export function checkRepair(samples: Sample[], named: Named[], scale: number, W = 1920, H = 1080): { errs: string[]; kept: number; keptBefore: number; worstSame: number; worstNear: number; unseen: number } {
  const ids = new Set(named.map((n) => n.id));
  const shots = new Set(named.flatMap((n) => n.shots));
  const errs = new Set<string>();
  let [kept, keptBefore, worstSame, worstNear, unseen] = [0, 0, Infinity, Infinity, 0];
  const seenIn = new Map<string, { before: boolean; after: boolean }>();
  for (const s of samples) {
    const at = `${s.before.t.toFixed(2)} 秒（鏡頭 ${s.before.shot}）`;
    // (counted in the named shots only: the same prop kept clear elsewhere in the song is not this repair's)
    const mine = shots.has(s.before.shot);
    if (mine) keptBefore += s.before.drawn.filter((d) => ids.has(d.id) && d.kept).length;
    if (!s.after) {
      unseen++;
      continue;
    }
    if (mine) kept += s.after.drawn.filter((d) => ids.has(d.id) && d.kept).length;
    // every other prop where it was
    const rest = (f: Frame) => f.drawn.filter((d) => !ids.has(d.id)).map((d) => `${d.id}@${Math.round(d.x / 2)},${Math.round(d.y / 2)},${Math.round(d.w / 2)},${Math.round(d.h / 2)},${(d.a * 50).toFixed(0)}`).sort();
    const [p, q] = [rest(s.before), rest(s.after)];
    const moved = [...new Set(p.filter((x) => !q.includes(x)).concat(q.filter((x) => !p.includes(x))).map((x) => x.slice(0, x.indexOf('@'))))];
    // (a box a pixel off from rounding is the same box)
    const near = (x: Drawn, y: Drawn) => x.id === y.id && Math.abs(x.x - y.x) <= 2 && Math.abs(x.y - y.y) <= 2 && Math.abs(x.w - y.w) <= 2 && Math.abs(x.h - y.h) <= 2 && Math.abs(x.a - y.a) <= 0.02;
    const off = moved.filter((id) => {
      const [bs, as] = [s.before.drawn.filter((d) => d.id === id), s.after!.drawn.filter((d) => d.id === id)];
      return bs.length !== as.length || bs.some((d, i) => !near(d, as[i]));
    });
    if (off.length) errs.add(`${at}：沒有指名的素材 ${off.join('、')} 的位置、大小或透明度變了`);
    for (const n of named) {
      const [bs, as] = [s.before.drawn.filter((d) => d.id === n.id), s.after.drawn.filter((d) => d.id === n.id)];
      const k = `${n.id}@${s.before.shot}`;
      const v = seenIn.get(k) ?? { before: false, after: false };
      seenIn.set(k, { before: v.before || bs.length > 0, after: v.after || as.length > 0 });
      // the biggest draw of it is the prop (a reflection or a shadow drawn with the same picture is smaller)
      const big = (xs: Drawn[]) => xs.reduce<Drawn | undefined>((m, d) => (!m || d.w * d.h > m.w * m.h ? d : m), undefined);
      const [b0, a0] = [big(bs), big(as)];
      if (!b0 || !a0) continue;
      // (retiring through the edge is an exit, not a move off the frame: faded out by then, or cut out of the line at
      // that moment in the old drawing anyway)
      if (offShare(b0, W, H) <= EDGE && offShare(a0, W, H) > EDGE && a0.a > 0.02 && !b0.kept) errs.add(`${at}：${n.id} 被移出畫面（${Math.round(offShare(a0, W, H) * 100)}% 在框外）`);
      // what it stood on goes with it: every paint of its base still under its foot
      if ((b0.baseN ?? 0) > (a0.baseN ?? 0)) {
        errs.add(`${at}：${n.id} 離開了它站的地方（和它一起畫的底座有 ${b0.baseN} 筆在它腳下，現在只剩 ${a0.baseN ?? 0} 筆：底座要和它一起移動、縮放）`);
      }
    }
    // a sample whose pictures are missing is not passed unseen
    if (!s.a || !s.b) {
      unseen++;
      continue;
    }
    if (!shots.has(s.before.shot)) {
      const v = psnrOutside(s.a, s.b);
      worstSame = Math.min(worstSame, v);
      if (v < SAME_DB) errs.add(`${at}：這個鏡頭沒有指名的素材，畫面卻變了（PSNR ${v.toFixed(1)} dB）`);
      continue;
    }
    const allow = [...s.before.drawn, ...s.after.drawn].filter((d) => ids.has(d.id)).flatMap((d) => [placeOf(d), ...(d.base ? [d.base] : [])]).map((r) => ({ x0: r.x0 * scale, y0: r.y0 * scale, x1: r.x1 * scale, y1: r.y1 * scale }));
    const v = psnrOutside(s.a, s.b, allow);
    worstNear = Math.min(worstNear, v);
    if (v < NEAR_DB) errs.add(`${at}：指名素材以外的畫面也變了（PSNR ${v.toFixed(1)} dB）：只能動指名的素材和它的底座`);
  }
  for (const [k, v] of seenIn) if (v.before && !v.after) errs.add(`${k.replace('@', ' 在鏡頭 ')} 不見了：只能移動、縮放或改時間，不能拿掉`);
  if (unseen) errs.add(`有 ${unseen} 個取樣時間沒有畫面（渲染失敗），無法確認，不採用`);
  return { errs: [...errs], kept, keptBefore, worstSame, worstNear, unseen };
}

/** A still as an RGB picture `w` px wide (ffmpeg), for the comparisons. */
export function readPic(file: string, w = 480): Pic {
  const h = Math.round((w * 1080) / 1920);
  const px = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-vf', `scale=${w}:${h}:flags=area`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: w * h * 3 + 1024 });
  return { w, h, px: new Uint8Array(px.buffer, px.byteOffset, px.length) };
}

/** The repair round's prompt: what to fix, where it may go, and the rules the program holds it to. */
export function repairPrompt(src: string, named: Named[], rooms: Map<number, Room>, frames: Frame[], cams: { index: number; start: number; end: number }[]): string {
  const boxes = (id: string, shot: number) =>
    frames
      .filter((f) => f.shot === shot)
      .flatMap((f) => f.drawn.filter((d) => d.id === id).slice(0, 1).map((d) => `${f.t.toFixed(2)}s ${Math.round(d.x)},${Math.round(d.y)},${Math.round(d.x + d.w)},${Math.round(d.y + d.h)}${d.kept ? '（被挖空）' : ''}`))
      .filter((_, i, a) => a.length <= 8 || i % Math.ceil(a.length / 8) === 0)
      .join('；');
  const r = (x: Rect) => `${x.x0},${x.y0},${x.x1},${x.y1}`;
  const list = named.map((n) => `- ${n.id}：被挖空在 ${n.times.slice(0, 12).map((t) => t.toFixed(1)).join('、')} 秒\n${n.shots.map((s) => {
    const c = cams.find((x) => x.index === s);
    const room = rooms.get(s);
    return `  鏡頭 ${s}（f.cam.index === ${s}，${c ? `${c.start.toFixed(2)}–${c.end.toFixed(2)} 秒` : ''}）：它在畫面上的框 x0,y0,x1,y1：${boxes(n.id, s) || '（沒有取樣）'}\n  這個鏡頭的歌詞框：${room?.lines.map((l) => `${l.from.toFixed(1)}–${l.to.toFixed(1)} 秒 ${r(l)}`).join('；') || '（未知）'}\n  歌詞留下的空位：${room ? (room.rooms.length ? room.rooms.map(r).join('；') : '沒有空位（只能縮小、改時間，或讓它在歌詞出現前離開、歌詞結束後再回來）') : '（未知）'}`;
  }).join('\n')}`).join('\n');
  return `修補回合：下面的素材在歌詞閱讀時壓進了歌詞框，被系統挖空、淡掉（觀眾看到它被切掉或消失）。這一輪不是重畫：只准移動、縮放或改出場時間這些素材，連同和它一起畫的東西（它站的底座：岩石、島、地面的一塊；它的影子、倒影；從它發出的光），其他所有東西——別的素材、場景、天空、海、雲、鏡頭運動、配色、時間軸——都必須和現在一模一樣。

程式會自動檢查，違反任何一條這次修改就會被退回：
1. 只用 edits 改程式（find 是目前程式裡原樣只出現一次的一段，replace 是改好的內容），每一段都要在指名素材的程式附近；不能改到、刪掉或新增其他素材，不能拿掉指名的素材；全部改動不超過 ${MAX_CHANGED} 字。sections 給空陣列。
2. 新舊兩版在同樣的時間點逐格渲染比對：沒有指名素材的鏡頭畫面要完全相同；有指名素材的鏡頭，除了指名素材和它底座、影子附近以外要相同；其他素材的位置大小要完全相同。所以修改要用 f.cam.index 限定在下面列出的鏡頭裡，其他鏡頭走原本的程式。
3. 素材要帶著它的底座一起動：移動後它腳下的東西（岩石、影子）要跟著它，不能讓燈塔站在海上、留下空的岩石。做法：把底座、素材、影子、光束包在同一個 ctx.save(); ctx.translate(dx, dy); ctx.scale(s, s)（以腳底為中心）…; ctx.restore() 裡，或讓它們共用同一組新座標。
4. 素材要留在畫面裡（不能被移出框外），而且每個列出的鏡頭裡都還看得到它。
5. 目標：歌詞閱讀時素材完全不進歌詞框。位置放進歌詞留下的空位（畫面像素 1920×1080，下面列出）；空位不夠時可以縮小（但保持看得清楚），或改時間（歌詞出現前離開、歌詞結束後再回來，進出要有動畫：在畫面裡淡出淡入或縮小放大；從畫面邊緣出去時要在出框前淡到透明，否則算被移出畫面）。你的程式在鏡頭變換之下畫，畫面座標和你的世界座標不同：可以用 f.fit(x, y, w, h)——給素材在目前座標的矩形，回傳移進這個鏡頭空位後的矩形 [x, y, w, h]——用新舊矩形腳底的差當整組的位移、寬度比當縮放。

要修的素材（框是畫面像素 x0,y0,x1,y1）：
${list}

目前的程式：
${src}`;
}

/** What the repair round needs from its caller: renders of a drawing's code and the director's turn. */
export type RepairIO = {
  /** Renders the treatment with this code at the stills into `dir`, background layer, sprite boxes tracked; the log. */
  track: (src: string, stills: number[], dir: string) => Promise<string>;
  /** Renders whole frames (the lyric over it) at the stills into `dir`, for the director's eyes and the sheets. */
  view: (src: string, stills: number[], dir: string) => Promise<string>;
  /** One director turn in the repair conversation (the caller keeps it): text and JPEG stills (base64) in, edits out. */
  ask: (text: string, images: string[]) => Promise<{ idea: string; edits: Edit[] }>;
  log?: (line: string) => void;
};
export type RepairResult = { src: string; named: Named[]; keptBefore: number; kept: number; attempts: { errs: string[]; kept?: number; idea: string }[]; accepted: boolean };

/** The sample times: every 0.25 s through the window (off the cuts), and the middle of every other shot of the song. */
export function sampleTimes(cuts: number[], from: number, to: number, end: number): number[] {
  const marks = [0, ...cuts, end];
  const grid: number[] = [];
  for (let t = Math.ceil(from * 4) / 4; t <= to + 1e-6; t += 0.25) if (!cuts.some((c) => Math.abs(c - t) < 0.06)) grid.push(+t.toFixed(2));
  const mids = marks.slice(0, -1).map((x, i) => +((x + marks[i + 1]) / 2).toFixed(2)).filter((m) => m < from || m > to);
  return [...new Set([...grid, ...mids])].sort((a, b) => a - b);
}

/**
 * The repair round: renders the drawing at the sample times, names the props kept clear there, asks the director for a
 * scoped repair and holds it to its scope (scopedEdits, checkRepair) for at most `attempts` director turns. A repair that
 * passes every check and keeps none clear ends it; one that passes with fewer kept clear is kept as the best so far.
 * Returns the code to keep (the old code when no repair passed).
 */
export async function runRepair(o: { src: string; known: string[]; cuts: number[]; from: number; to: number; end: number; work: string; io: RepairIO; attempts?: number }): Promise<RepairResult> {
  const say = o.io.log ?? ((x: string) => console.log(x));
  const times = sampleTimes(o.cuts, o.from, o.to, o.end);
  const cams = [0, ...o.cuts].map((s, i) => ({ index: i, start: s, end: o.cuts[i] ?? o.end }));
  const pics = (dir: string, fs: Frame[]) => new Map(fs.map((f) => [f.t, (() => { try { return readPic(join(dir, `still_${f.t.toFixed(2)}.png`)); } catch { return undefined; } })()]));
  const bDir = join(o.work, 'before');
  const bLog = await o.io.track(o.src, times, bDir);
  const before = parseFrames(bLog, times);
  const rooms = parseRooms(bLog);
  // the named props: drawn kept clear at a sample inside the window
  const kept: Kept[] = before.filter((f) => f.t >= o.from && f.t <= o.to).flatMap((f) => f.drawn.filter((d) => d.kept).map((d) => ({ id: d.id, t: f.t, shot: f.shot, cut: true })));
  const named = namedOf(kept);
  // (counted over every sample, as checkRepair counts the new drawing's)
  const all = before.filter((f) => named.some((x) => x.shots.includes(f.shot))).reduce((n, f) => n + f.drawn.filter((d) => d.kept && named.some((x) => x.id === d.id)).length, 0);
  const result: RepairResult = { src: o.src, named, keptBefore: all, kept: all, attempts: [], accepted: false };
  say(`repair: ${before.length}/${times.length} samples, ${kept.length} kept-clear draws: ${named.map((n) => `${n.id} (shots ${n.shots.join(',')})`).join('; ') || 'none'}`);
  if (!named.length) return result;
  const bPics = pics(bDir, before);
  // what the director sees: a frame where each named prop is cut, per shot (at most 6)
  const viewTimes = [...new Set(named.flatMap((n) => n.shots.map((s) => { const ts = n.times.filter((t) => before.find((f) => f.t === t)?.shot === s); return ts[Math.floor(ts.length / 2)]; })))].filter((t) => t !== undefined).sort((a, b) => a - b).slice(0, 6);
  const jpgs = async (src: string, dir: string) => {
    await o.io.view(src, viewTimes, dir);
    return viewTimes.flatMap((t) => {
      const png = join(dir, `still_${t.toFixed(2)}.png`);
      const jpg = join(dir, `v_${t.toFixed(2)}.jpg`);
      try {
        execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', png, '-vf', 'scale=960:-1', '-q:v', '4', jpg]);
        return [readFileSync(jpg).toString('base64')];
      } catch {
        return [];
      }
    });
  };
  const ids = named.map((n) => n.id);
  let cur = o.src;
  let text = repairPrompt(o.src, named, rooms, before, cams);
  let images = await jpgs(o.src, join(o.work, 'view_before'));
  const lead = `以下截圖（歌詞已疊上）依序是 ${viewTimes.map((t) => t.toFixed(2)).join('、')} 秒。`;
  text = `${text}\n\n${lead}`;
  for (let k = 1; k <= (o.attempts ?? 2); k++) {
    // (a failed turn — an API error, an empty reply, the budget — ends the round with the best repair so far)
    let r: Awaited<ReturnType<RepairIO['ask']>>;
    try {
      r = await o.io.ask(text, images);
    } catch (e) {
      say(`repair ${k}: director turn failed (${(e as Error).message.slice(0, 120)}), stopping with the best so far`);
      result.attempts.push({ errs: [`導演回覆失敗：${(e as Error).message.slice(0, 120)}`], idea: '' });
      break;
    }
    const scoped = scopedEdits(cur, r.edits, ids, o.known);
    const attempt: RepairResult['attempts'][number] = { errs: [...scoped.errs], idea: r.idea };
    result.attempts.push(attempt);
    if (scoped.errs.length || !scoped.applied) {
      if (!scoped.applied) attempt.errs.push('沒有任何修改套用上');
      say(`repair ${k}: edits rejected: ${attempt.errs.join(' | ')}`);
      text = `這次的修改被退回（程式沒有套用任何一個，目前程式維持上一版）：\n${attempt.errs.map((x) => `- ${x}`).join('\n')}\n請重新給 edits（對目前程式）。`;
      images = [];
      continue;
    }
    const aDir = join(o.work, `after_${k}`);
    const aLog = await o.io.track(scoped.src, times, aDir);
    const after = parseFrames(aLog, times);
    const aPics = pics(aDir, after);
    const check = checkRepair(before.map((f) => ({ before: f, after: after.find((g) => g.t === f.t), a: bPics.get(f.t), b: aPics.get(f.t) })), named, 480 / 1920);
    attempt.errs.push(...check.errs);
    attempt.kept = check.kept;
    say(`repair ${k}: kept clear ${check.keptBefore} -> ${check.kept}; worst PSNR untouched ${check.worstSame.toFixed(1)} dB, named shots outside props ${check.worstNear.toFixed(1)} dB; ${check.unseen} samples unseen; ${check.errs.length ? `rejected: ${check.errs.slice(0, 6).join(' | ')}` : 'in scope'}`);
    writeFileSync(join(aDir, 'check.json'), JSON.stringify({ ...check, worstSame: String(check.worstSame), worstNear: String(check.worstNear) }, null, 1));
    if (check.errs.length) {
      text = `這次的修改沒有通過檢查，已經退回（目前程式維持上一版）：\n${check.errs.slice(0, 12).map((x) => `- ${x}`).join('\n')}\n請對目前程式重新給 edits。`;
      images = await jpgs(scoped.src, join(o.work, `view_${k}`));
      text += `\n以下是被退回那一版的截圖（${viewTimes.map((t) => t.toFixed(2)).join('、')} 秒）。`;
      continue;
    }
    // in scope: kept, the best so far when fewer of its draws are kept clear; one that did not help is dropped, and the
    // director is told which code its next edits apply to
    const better = check.kept < result.kept;
    if (better) Object.assign(result, { src: scoped.src, kept: check.kept, accepted: true });
    cur = result.src;
    if (!check.kept) break;
    const still = after.filter((f) => named.some((x) => x.shots.includes(f.shot)) && f.drawn.some((d) => ids.includes(d.id) && d.kept)).map((f) => `${f.t.toFixed(2)} 秒（鏡頭 ${f.shot}）：${f.drawn.filter((d) => ids.includes(d.id) && d.kept).map((d) => `${d.id} 在 ${Math.round(d.x)},${Math.round(d.y)},${Math.round(d.x + d.w)},${Math.round(d.y + d.h)}`).join('、')}`);
    text = better
      ? `這次的修改通過了範圍檢查並保留了（目前程式＝套用你這次 edits 之後的版本），但還有 ${check.kept} 格被挖空：\n${still.slice(0, 16).join('\n')}\n請對目前程式再給 edits，把這些也移開。`
      : `這次的修改通過了範圍檢查，但被挖空的格數沒有減少（${result.kept} → ${check.kept}），所以沒有保留：目前程式維持你這次修改之前的版本，下一次的 edits 要對那一版寫。還被挖空的：\n${still.slice(0, 16).join('\n')}`;
    images = await jpgs(scoped.src, join(o.work, `view_${k}`));
    text += `\n以下是目前版本的截圖（${viewTimes.map((t) => t.toFixed(2)).join('、')} 秒）。`;
  }
  return result;
}
