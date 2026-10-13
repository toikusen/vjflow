// Composition pass (program, after the director): the gap analysis found nearly every frame centred and every
// chorus laid out the same. This moves centred shots off-centre so two centred frames never follow each other, and
// makes the choruses escalate (the keyword grows chorus by chorus). Bleed is switched off: every review read the
// cropped keyword as a layout overflow.
import { uses } from './design';
import { LANGUAGES, type LanguageId } from './languages';
import { quietSpans } from './moments';
import { layerRect, sectionAt, type Rect } from './render/graphics';
import type { Shot, TreatmentV3 } from './treatment';

type Anchor = 'L' | 'C' | 'R';

/** The quiet template unless the song's design language leaves it out (terminal's big phosphor type has no thin mincho). */
// the shot pass runs before the design exists: the director's language is then on the treatment itself
const languageOf = (t: TreatmentV3) => t.design?.language ?? (t as { language?: LanguageId }).language;
const quietAllowed = (t: TreatmentV3) => !languageOf(t) || LANGUAGES[languageOf(t)!].templates.includes('quiet');

/** Shots the chorus skeleton never overwrites. */
const FIXED = new Set(['title-card', 'quiet']);

/** The song's hook as sung: the title without its bracketed reading or subtitle (第六感（THE SIXTH SENSE） → 第六感). */
export const titleHook = (title: string) => title.replace(/[（(［\[].*?[）)］\]]/g, '').trim();

/** Character ranges [from, to) where the hook appears in a line (case-insensitive for Latin titles). */
export function hookRanges(text: string, hook: string): [number, number][] {
  const chars = [...text.toLowerCase()];
  const h = [...hook.toLowerCase()];
  if (h.length < 2) return [];
  const out: [number, number][] = [];
  for (let i = 0; i + h.length <= chars.length; i++) if (h.every((c, k) => chars[i + k] === c)) out.push([i, (i += h.length - 1) + 1]);
  return out;
}

/** Per template: the param that places it horizontally and its values by anchor (absent = fixed composition). */
const PLACEMENT: Record<string, { param: string; values: Partial<Record<Anchor, string>> }> = {
  punch: { param: 'align', values: { L: 'left', C: 'center', R: 'right' } },
  'frame-split': { param: 'align', values: { L: 'left', C: 'center', R: 'right' } },
  typewriter: { param: 'position', values: { L: 'left', C: 'center' } },
  vertical: { param: 'position', values: { L: 'left', C: 'center', R: 'right' } },
  handwrite: { param: 'position', values: { L: 'left', C: 'center' } },
};

/** Where a shot sits: diagonal and per-word templates read as off-centre already. */
export function anchorOf(s: Shot): Anchor | undefined {
  if (['scatter', 'beat-cut', 'stair', 'quiet'].includes(s.template)) return undefined;
  const p = PLACEMENT[s.template];
  if (!p) return 'C';
  const v = s.params[p.param];
  if (s.template === 'punch' && s.params['bleed']) return 'C';
  return (Object.entries(p.values).find(([, x]) => x === v)?.[0] as Anchor) ?? 'C';
}

/**
 * Moves every second centred shot in a run to the side (alternating left/right, away from the previous shot's side)
 * and sets the choruses' keyword size from restrained (first) to full width (last). Returns the repairs made.
 */
export function varyComposition(t: TreatmentV3, choruses: { start: number; end: number }[]): string[] {
  const fixes: string[] = [];
  // a language that sets type flush left (swiss grid): every placeable template goes left, nothing is centred
  const flushLeft = !!t.design?.language && !!LANGUAGES[t.design.language].text?.left;
  if (flushLeft)
    for (const s of t.shots) {
      const p = PLACEMENT[s.template];
      if (p?.values.L) s.params[p.param] = p.values.L;
    }
  let prev: Anchor | undefined;
  let side: Anchor = 'R';
  for (const s of t.shots) {
    const a = anchorOf(s);
    const place = PLACEMENT[s.template];
    if (!flushLeft && a === 'C' && prev === 'C' && place && !s.params['bleed']) {
      side = side === 'R' ? 'L' : 'R';
      const want = place.values[side] ?? place.values.L ?? place.values.R;
      if (want) {
        s.params[place.param] = want;
        fixes.push(`${s.id} 改為偏${want === 'left' ? '左' : '右'}，避免連續置中`);
        prev = want === 'left' ? 'L' : 'R';
        continue;
      }
    }
    if (a === 'L' || a === 'R') side = a;
    prev = a ?? prev;
  }
  // every chorus keeps the first chorus's skeleton (same templates in the same order); only the escalation below and
  // the drops' growing strength change, so a returning chorus reads as the same section turned up
  const inChorus = (c: { start: number; end: number }) => t.shots.filter((x) => x.start >= c.start - 0.5 && x.start < c.end && !FIXED.has(x.template));
  const skeleton = choruses.length ? inChorus(choruses[0]) : [];
  if (uses(t.design, 'skeleton')) choruses.slice(1).forEach((c) => {
    inChorus(c).forEach((s, i) => {
      const src = skeleton[Math.min(i, skeleton.length - 1)];
      if (!src || src.template === s.template) return;
      s.template = src.template;
      s.params = { ...structuredClone(src.params), dim: s.params['dim'] ?? src.params['dim'] };
      fixes.push(`${s.id} 沿用第一次副歌的版型 ${src.template}`);
    });
  });
  // chorus lines carry a large outlined echo of their keyword behind them (except where the type is already huge)
  // ponytail: only the chorus's first 12 s — an echo on every line becomes the next template look
  if (uses(t.design, 'echo')) for (const c of choruses) for (const s of inChorus(c)) if (s.template !== 'beat-cut' && s.start < c.start + 12) s.params['echo'] = true;
  // choruses escalate: keyword width rises chorus by chorus
  choruses.forEach((c, k) => {
    const last = k === choruses.length - 1;
    const width = choruses.length > 1 ? 0.62 + (0.3 * k) / (choruses.length - 1) : 0.8;
    for (const s of t.shots.filter((x) => x.template === 'punch' && x.start < c.end && x.end > c.start)) {
      s.params['keywordWidth'] = +width.toFixed(2);
      s.params['bleed'] = false;
      if (last) s.params['align'] = 'center';
    }
  });
  // quiet spans (breaks) drop the type down a register: thin mincho, small, still, left or centred
  let left = false;
  for (const q of uses(t.design, 'quiet') && quietAllowed(t) ? quietSpans(t.moments ?? []) : []) {
    for (const s of t.shots.filter((x) => x.template !== 'title-card' && Math.min(x.end, q.end) - Math.max(x.start, q.start) > 0.6 * (x.end - x.start))) {
      s.template = 'quiet';
      s.params = { position: left ? 'left' : 'center', dim: 0.7 };
      left = !left;
      fixes.push(`${s.id} 安靜段改用 quiet 版型`);
    }
  }
  // leaving a chorus, the next picture opens through the motif's shape (the engine's iris on 'wipe'): the motif
  // does a job instead of floating over the frame as a watermark
  for (const c of choruses) {
    const next = t.shots.find((s) => Math.abs(s.start - c.end) < 1.5 && s.start > c.start);
    if (next && next.transitionIn !== 'wipe') {
      next.transitionIn = 'wipe';
      fixes.push(`${next.id} 用主題物件形狀轉場離開副歌`);
    }
  }
  return fixes;
}

/**
 * Editor pass after the director (an editor's consistency rules): directional pairs alternate, strong
 * entrances are rationed, and a repeated lyric replays its first occurrence's entrance, exit and reveal. `same` maps a
 * repeated cue id to its first occurrence (structure.ts sameLines). Returns the repairs made.
 */
export function editorPass(t: TreatmentV3, same: Map<string, string>): string[] {
  const fixes: string[] = [];
  // a title card needs time to be read as a title: under 6 s the gap stays a graphic beat, no names squeezed in
  for (const s of t.shots)
    if (s.template === 'title-card' && s.end - s.start < 6) {
      s.template = quietAllowed(t) ? 'quiet' : LANGUAGES[languageOf(t)!].templates.find((x) => x !== 'title-card')!;
      s.params = { position: 'center', dim: 0.5 };
      fixes.push(`${s.id} 間奏太短，不放歌名卡`);
    }
  // directional pairs alternate: consecutive stairs step from opposite sides, scatters rise then fall
  let stair: string | undefined;
  let dir: string | undefined;
  for (const s of t.shots) {
    if (s.template === 'stair') {
      if (s.params['side'] === stair) {
        s.params['side'] = stair === 'left' ? 'right' : 'left';
        fixes.push(`${s.id} 階梯方向和上一個相反`);
      }
      stair = s.params['side'] as string;
    }
    if (s.template === 'scatter') {
      if (s.params['direction'] === dir) s.params['direction'] = dir === 'up' ? 'down' : 'up';
      dir = s.params['direction'] as string;
    }
  }
  // strong entrances are rationed: two slams/pops in a row only when the second line carries emphasis
  const start = new Map(t.cues.map((c) => [c.cueId, c]));
  const strong = (e: string) => e === 'slam' || e === 'pop';
  let prevStrong = false;
  for (const c of t.cues) {
    if (strong(c.enter) && prevStrong && !(c.emphasis ?? []).length && !same.has(c.cueId)) {
      c.enter = 'wipe';
      fixes.push(`${c.cueId} 連續強烈進場，改為 wipe`);
    }
    prevStrong = strong(c.enter);
  }
  // a drawn sign is a rare accent, not a dictionary: a heart on every "love" and a flame on every "burn" read as
  // clip art (user, 行星 / 雙截棍) — two per song at most, the first two kept
  let signs = 0;
  for (const c of t.cues)
    if (c.emphasis?.some((e) => e.method === 'symbol')) {
      c.emphasis = c.emphasis.filter((e) => e.method !== 'symbol' || ++signs <= 2);
      if (signs > 2) fixes.push(`${c.cueId} 的強調符號超過一首 2 個，已移除`);
    }
  // the showy text effects are rationed per song (a whole song of flapping boards reads as a demo reel); repeated
  // lines are not counted, they replay their first occurrence below
  const used = new Map<string, number>();
  // rise is the quiet one, yet run4 put it on 19 of 世界のつづき's 28 lines: a quarter of the lines at most, the rest
  // keep a plain fade
  const own = t.cues.filter((c) => !same.has(c.cueId)).length;
  const CAP: Record<string, number> = { flap: 3, slot: 3, rise: Math.max(2, Math.floor(own / 4)) };
  for (const c of t.cues) {
    if (same.has(c.cueId) || !(c.enter in CAP)) continue;
    used.set(c.enter, (used.get(c.enter) ?? 0) + 1);
    if (used.get(c.enter)! > CAP[c.enter]) {
      const to = c.enter === 'rise' ? 'fade' : (used.get('rise') ?? 0) < CAP['rise'] ? 'rise' : 'fade';
      fixes.push(`${c.cueId} 的 ${c.enter} 進場超過一首 ${CAP[c.enter]} 句，改為 ${to}`);
      if (to === 'rise') used.set('rise', (used.get('rise') ?? 0) + 1);
      c.enter = to;
    }
  }
  let pours = 0;
  for (const c of t.cues)
    if (!same.has(c.cueId) && c.emphasis?.some((e) => e.method === 'liquid')) {
      c.emphasis = c.emphasis.map((e) => (e.method === 'liquid' && ++pours > 2 ? { ...e, method: 'hollow' as const } : e));
      if (pours > 2) fixes.push(`${c.cueId} 的 liquid 強調超過一首 2 個，改為 hollow`);
    }
  // a repeated lyric replays its first occurrence
  for (const [id, src] of same) {
    const c = start.get(id);
    const s0 = start.get(src);
    if (!c || !s0) continue;
    if (c.enter !== s0.enter || c.exit !== s0.exit || c.reveal !== s0.reveal) fixes.push(`${id} 重複歌詞沿用 ${src} 的進出場`);
    Object.assign(c, { enter: s0.enter, exit: s0.exit, reveal: s0.reveal, accents: s0.accents && [...s0.accents] });
  }
  return fixes;
}

/**
 * Puts each placeable shot's lyrics on the side its section's objects (windows, photos, stamps…) leave free, decided
 * with the design instead of dodged at render time (dodging pushed objects into corners and left the frame empty).
 * A third of the frame counts as busy over 25 % covered in the lyric band (the middle 60 % of the height); the line
 * moves only to a side at most half as busy. Returns the repairs made.
 */
export function planSides(t: TreatmentV3): string[] {
  const g = t.graphics;
  if (!g?.sections?.length) return [];
  const fixes: string[] = [];
  const W = 1920;
  const H = 1080;
  const band = { y0: H * 0.2, y1: H * 0.8 };
  const thirds: Record<Anchor, Rect> = { L: { x0: 0, x1: W / 3, ...band }, C: { x0: W / 3, x1: (2 * W) / 3, ...band }, R: { x0: (2 * W) / 3, x1: W, ...band } };
  const cover = (a: Rect, b: Rect) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  const area = (W / 3) * (band.y1 - band.y0);
  for (const s of t.shots) {
    const place = PLACEMENT[s.template];
    if (!place || s.params['bleed'] || s.params[place.param] === 'auto') continue;
    const rects = sectionAt(g, (s.start + s.end) / 2).layers.map(layerRect).filter((r): r is Rect => !!r);
    // a full-frame object (a photo backdrop) is ground, not something in the way
    const objects = rects.filter((r) => (r.x1 - r.x0) * (r.y1 - r.y0) < W * H * 0.6);
    const busy = (k: Anchor) => objects.reduce((n, r) => n + cover(r, thirds[k]), 0) / area;
    const now = anchorOf(s) ?? 'C';
    if (busy(now) <= 0.25) continue;
    const best = (Object.keys(place.values) as Anchor[]).sort((a, b) => busy(a) - busy(b))[0];
    if (best === now || busy(best) > busy(now) / 2) continue;
    s.params[place.param] = place.values[best]!;
    fixes.push(`${s.id} 的歌詞移到${{ L: '左', C: '中', R: '右' }[best]}側，讓開這段的物件`);
  }
  return fixes;
}

/**
 * Lines sung faster than they can be read (shorter than characters / 12 + 1 s, the render check's bar) leave before
 * anyone reads them when each replaces the last. A shot where most lines are like that becomes a stack (each line
 * stays up, smaller, while the next lands) where the language has one. At most half of the lyric shots change, the
 * most rushed first, so a fast song does not turn into one long stack. Returns the repairs made.
 */
export function stackRushed(t: TreatmentV3, cues: { id: string; start: number; end: number; text: string }[]): string[] {
  const lang = languageOf(t);
  if (lang && !LANGUAGES[lang].templates.includes('stack')) return [];
  const byId = new Map(cues.map((c) => [c.id, c]));
  const rushed = (c?: { start: number; end: number; text: string }) => !!c && c.end - c.start < [...c.text.replace(/\s/g, '')].length / 12 + 1;
  const lyricShots = t.shots.filter((s) => t.cues.some((c) => c.shot === s.id));
  const candidates = lyricShots
    .filter((s) => !['title-card', 'quiet', 'stack', 'array'].includes(s.template))
    .map((s) => {
      const lines = t.cues.filter((c) => c.shot === s.id);
      return { s, n: lines.length, fast: lines.filter((c) => rushed(byId.get(c.cueId))).length };
    })
    .filter((x) => x.n >= 2 && x.fast * 2 >= x.n)
    .sort((a, b) => b.fast / b.n - a.fast / a.n);
  const fixes: string[] = [];
  for (const { s, n, fast } of candidates.slice(0, Math.floor(lyricShots.length / 2))) {
    fixes.push(`${s.id} 有 ${fast}/${n} 句唱得比讀得快，改用 stack 讓前一句留在畫面上`);
    s.template = 'stack';
    s.params = { dim: s.params['dim'] ?? 0.35, pair: true };
  }
  return fixes;
}
