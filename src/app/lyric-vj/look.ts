// Checks and repairs a director's graphic look (render/graphics.ts): known layer kinds only, colours that parse,
// numbers in range, photo assets that exist, sections sorted from the window start, and lyric colours that read
// against each section's field.
import { GraphicsLook, Layer, LAYER_KINDS, LookSection, spreadWindows } from './render/graphics';
import { contrast } from './contrast';
import { LOUD_TRANSITIONS, parseTransition } from './render/transition';

const HEX = /^#[0-9a-f]{6}$/i;

/** The section's ground colour: its first full-frame fill or paper layer. */
export function fieldOf(s: LookSection): string | undefined {
  const f = s.layers.find((l) => l.kind === 'fill' || l.kind === 'paper') as { color: string } | undefined;
  return f && HEX.test(f.color) ? f.color : undefined;
}

/**
 * Repairs a look; `boundaries` (song seconds where the music changes section) limits transitions to those changes.
 */
export function validateLook(look: GraphicsLook | undefined, assets: string[], start: number, boundaries?: number[]): { look?: GraphicsLook; fixes: string[] } {
  const fixes: string[] = [];
  if (!look?.sections?.length) return { fixes };
  const sections = look.sections
    .map((s) => {
      const layers = (s.layers ?? []).filter((l) => {
        const ok = (LAYER_KINDS as readonly string[]).includes(l.kind) || (l.kind === 'code' && typeof l.src === 'string');
        if (!ok) fixes.push(`移除未知圖層 ${l.kind}`);
        return ok;
      }).map((l) => cleanLayer(l, assets, fixes)).filter((l, i, all) => {
        // one scattered decoration per section: dots, hearts and sparkles all at once read as clutter (てぇてぇ chorus)
        const first = all.findIndex((x) => SCATTER.has(x.kind));
        if (!SCATTER.has(l.kind) || i === first) return true;
        fixes.push(`段落 ${Number(s.start).toFixed(1)}s 只留一種散布裝飾，移除 ${l.kind}`);
        return false;
      });
      const sec: LookSection = { start: Math.max(start, Number(s.start) || start), layers };
      const tr = typeof s.transition === 'string' ? parseTransition(s.transition) : s.transition;
      if (tr) sec.transition = tr;
      if (s.accent && HEX.test(s.accent)) sec.accent = s.accent;
      // lyric colour: dark on a light field, light on a dark one, whatever the director said
      const field = fieldOf(sec);
      const want = s.text && HEX.test(s.text) ? s.text : undefined;
      if (field) {
        const light = contrast(field, '#000000') > contrast(field, '#ffffff');
        if (want && contrast(want, field) >= 4.5) {
          if (light) sec.text = want;
        } else if (light) {
          sec.text = '#1a1a1a';
          if (want) fixes.push(`段落 ${sec.start.toFixed(1)}s 的字色和底色對比不足，改成深色`);
        } else if (want && contrast(want, field) < 4.5) fixes.push(`段落 ${sec.start.toFixed(1)}s 的字色和底色對比不足，改回白字`);
      }
      return sec;
    })
    .sort((a, b) => a.start - b.start);
  sections[0].start = start;
  // the first section has nothing to come in over; a loud transition never follows a loud one; at most half the
  // section changes (rounded down) get a shape, the later ones dropped; each kind twice at most
  delete sections[0].transition;
  let shaped = 0;
  const used = new Map<string, number>();
  sections.forEach((sec, i) => {
    if (!sec.transition) return;
    const before = sections[i - 1]?.transition;
    const again = (used.get(sec.transition.kind) ?? 0) >= 2;
    // only where the music changes section (within 1.5 s of a boundary), when the boundaries are known
    const offBeat = !!boundaries?.length && !boundaries.some((b) => Math.abs(b - sec.start) <= 1.5);
    if (offBeat || again || (before && LOUD_TRANSITIONS.has(before.kind) && LOUD_TRANSITIONS.has(sec.transition.kind)) || ++shaped > Math.floor((sections.length - 1) / 2)) {
      fixes.push(`段落 ${sec.start.toFixed(1)}s 的轉場 ${sec.transition.kind} 不在音樂換段處、太密或重複，改為直接切`);
      delete sec.transition;
      return;
    }
    used.set(sec.transition.kind, (used.get(sec.transition.kind) ?? 0) + 1);
  });
  // one operating system per song: Mac and Windows windows on the same desktop read as a mistake
  const os = sections.flatMap((s) => s.layers).find((l) => l.kind === 'ui' && (l.skin === 'mac' || l.skin === 'win'));
  if (os?.kind === 'ui') for (const l of sections.flatMap((s) => s.layers))
    if (l.kind === 'ui' && l.skin && l.skin !== 'term' && l.skin !== os.skin) {
      fixes.push(`視窗外觀統一為 ${os.skin === 'mac' ? 'Mac' : 'Windows'}`);
      l.skin = os.skin;
    }
  for (const sec of sections) {
    const before = JSON.stringify(sec.layers);
    sec.layers = spreadWindows(sec.layers);
    if (JSON.stringify(sec.layers) !== before) fixes.push(`段落 ${sec.start.toFixed(1)}s 的視窗疊在一起，已分開`);
  }
  // a multiplied photo over a dark silhouette sinks into it (Utsusemi's band read as buried in the hills): with a
  // skyline in the section, framed photos print normally
  for (const sec of sections)
    if (sec.layers.some((l) => l.kind === 'skyline'))
      for (const l of sec.layers)
        if (l.kind === 'photo' && l.mode !== 'full' && l.blend === 'multiply') {
          delete l.blend;
          fixes.push(`段落 ${sec.start.toFixed(1)}s 的照片不疊印在地景上`);
        }
  // and one look per desktop: phosphor glass next to a system window in the same section reads as two screens
  for (const sec of sections) {
    const wins = sec.layers.filter((l) => l.kind === 'ui');
    const first = wins[0]?.kind === 'ui' ? (wins[0].skin ?? 'term') : 'term';
    for (const l of wins) if (l.kind === 'ui' && (l.skin ?? 'term') !== first) {
      fixes.push(`段落 ${sec.start.toFixed(1)}s 的視窗外觀統一`);
      l.skin = first;
    }
  }
  return { look: { sections, ...(look.story?.length ? { story: look.story } : {}), ...(look.storyProps?.length ? { storyProps: look.storyProps } : {}) }, fixes };
}

const SCATTER = new Set(['shapes', 'particles', 'sparkles']);

function cleanLayer(l: Layer, assets: string[], fixes: string[]): Layer {
  const out = { ...l } as unknown as Record<string, unknown>;
  // a palette given as `colors` where the layer reads `color` drew black dots (shapes) or grey hearts (particles)
  const palette = Array.isArray(out['colors']) ? (out['colors'] as unknown[]).filter((c): c is string => typeof c === 'string' && HEX.test(c)) : [];
  if (palette.length && !(typeof out['color'] === 'string' && HEX.test(out['color']))) out['color'] = palette[0];
  for (const [k, v] of Object.entries(out)) {
    // colours that don't parse fall back to a neutral grey rather than breaking the canvas
    if (/^(color|color2|to|tint|frame|bars|signal|alert)$/.test(k) && typeof v === 'string' && !HEX.test(v) && !v.startsWith('rgba')) out[k] = '#808080';
    if (v === null) delete out[k];
  }
  // a numeral the director wrote as a number (1, not "1") broke every layer that spreads its text
  if ('text' in out && typeof out['text'] !== 'string') out['text'] = String(out['text'] ?? '');
  if (Array.isArray(out['lines'])) out['lines'] = (out['lines'] as unknown[]).map(String).slice(0, 12);
  if (l.kind === 'ui' && !['term', 'mac', 'win'].includes(out['skin'] as string)) delete out['skin'];
  if (l.kind === 'ui' && 'cascade' in out) out['cascade'] = Math.max(1, Math.min(8, Math.round(Number(out['cascade']) || 1)));
  if (typeof out['opacity'] === 'number') out['opacity'] = Math.min(1, Math.max(0, out['opacity'] as number));
  if (typeof out['pulse'] === 'number') out['pulse'] = Math.min(1, Math.max(0, out['pulse'] as number));
  if (l.kind === 'photo' && l.asset && !assets.includes(l.asset)) {
    fixes.push(`照片圖層的素材 ${l.asset} 不存在，改用當下鏡頭的圖`);
    delete out['asset'];
  }
  if (Array.isArray(out['ghosts'])) out['ghosts'] = (out['ghosts'] as { dx: number; dy: number; color: string }[]).filter((g) => HEX.test(g.color)).slice(0, 2);
  if (l.kind === 'bands' && !(l.colors ?? []).every((c) => HEX.test(c))) out['colors'] = (l.colors ?? []).filter((c) => HEX.test(c));
  return out as unknown as Layer;
}

/**
 * The assets a treatment can show. With a graphic look the full-frame plates are hidden, so pictures appear only
 * through photo layers: their own asset, or the shot's picture when the layer names none (and a video's source still).
 */
export function neededAssets(t: { assets: { id: string; kind: string; from?: string }[]; shots: { asset?: string }[]; graphics?: GraphicsLook }): Set<string> {
  if (!t.graphics?.sections?.length) return new Set(t.assets.map((x) => x.id));
  const photos = t.graphics.sections.flatMap((s) => s.layers).filter((l): l is Extract<Layer, { kind: 'photo' }> => l.kind === 'photo');
  const ids = new Set(photos.map((l) => l.asset).filter((x): x is string => !!x));
  if (photos.some((l) => !l.asset)) for (const s of t.shots) if (s.asset) ids.add(s.asset);
  for (const x of t.assets) if (x.kind === 'video' && ids.has(x.id) && x.from) ids.add(x.from);
  return ids;
}

// ground layers (paper, colour fields, landscape silhouettes) carry a look from section to section; everything else is
// a decoration, and a decoration in every section turns the song into one fixed template
const GROUND = new Set(['fill', 'paper', 'bands', 'pattern', 'scanlines', 'skyline']);
const decorKey = (l: Layer): string | undefined => {
  if (GROUND.has(l.kind) || l.kind === 'code') return undefined;
  const sub = (l as { type?: string; mode?: string }).type ?? (l as { mode?: string }).mode;
  return ['frame', 'photo', 'ui', 'shapes', 'band'].includes(l.kind) && sub ? `${l.kind}/${sub}` : l.kind;
};

/** Each decoration of a look and the share of its sections it appears in. */
export function decorShare(look: GraphicsLook | undefined): Map<string, number> {
  const out = new Map<string, number>();
  const n = look?.sections.length ?? 0;
  for (const s of look?.sections ?? []) for (const k of new Set(s.layers.map(decorKey).filter((x): x is string => !!x))) out.set(k, (out.get(k) ?? 0) + 1 / n);
  return out;
}

/** The decorations that define a look (in at least 30 % of its sections), recorded per song to keep the next apart. */
export const mainDecor = (look: GraphicsLook | undefined) => [...decorShare(look)].filter(([, v]) => v >= 0.3).map(([k]) => k).sort();

/**
 * Repetition problems for the director: a decoration in over 60 % of a song's sections (four or more), and two or more
 * of a look's main decorations shared with an earlier song in the same language (three silkscreen songs came out as
 * the same sun, rings, border and photo inset).
 */
export function samenessIssues(look: GraphicsLook | undefined, earlier: { song: string; decor?: string[] }[]): string[] {
  const n = look?.sections.length ?? 0;
  const out: string[] = [];
  if (n >= 4)
    for (const [k, v] of decorShare(look))
      if (v > 0.6) out.push(`裝飾「${k}」出現在 ${Math.round(v * n)}/${n} 個段落：同一個裝飾每段都有就成了固定模板，最多放在六成的段落，其他段落換別的圖形`);
  const mine = mainDecor(look);
  for (const r of earlier) {
    const same = mine.filter((k) => r.decor?.includes(k));
    if (same.length >= 2) out.push(`和同風格的「${r.song}」用了一樣的主要裝飾（${same.join('、')}）：同風格也要換素材，這首至少換掉其中 ${same.length - 1} 個，改用這個語言的其他圖層`);
  }
  return out;
}

/**
 * A bracket or viewfinder frame marks where the words are; over a stretch with no lyric (the intro before the first
 * line, an instrumental) it frames empty space and reads as a mistake. Removes those frames from sections no lyric
 * overlaps (`lines` are the sung spans, `end` the song's end). Returns the repairs made.
 */
export function dropEmptyFrames(look: GraphicsLook | undefined, lines: { start: number; end: number }[], end: number): string[] {
  const fixes: string[] = [];
  const secs = look?.sections ?? [];
  secs.forEach((s, i) => {
    const to = secs[i + 1]?.start ?? end;
    if (lines.some((l) => l.start < to && l.end > s.start)) return;
    const before = s.layers.length;
    s.layers = s.layers.filter((l) => !(l.kind === 'frame' && (l.type === 'brackets' || l.type === 'viewfinder')));
    if (s.layers.length < before) fixes.push(`段落 ${s.start.toFixed(1)}s 沒有歌詞，移除框住空白的框`);
  });
  return fixes;
}
