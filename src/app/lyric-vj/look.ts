// Checks and repairs a director's graphic look (render/graphics.ts): known layer kinds only, colours that parse,
// numbers in range, photo assets that exist, sections sorted from the window start, and lyric colours that read
// against each section's field.
import { GraphicsLook, Layer, LAYER_KINDS, LookSection } from './render/graphics';
import { contrast } from './contrast';

const HEX = /^#[0-9a-f]{6}$/i;

/** The section's ground colour: its first full-frame fill or paper layer. */
export function fieldOf(s: LookSection): string | undefined {
  const f = s.layers.find((l) => l.kind === 'fill' || l.kind === 'paper') as { color: string } | undefined;
  return f && HEX.test(f.color) ? f.color : undefined;
}

/** Repairs a look in place-free fashion; returns the repaired look and what was changed. */
export function validateLook(look: GraphicsLook | undefined, assets: string[], start: number): { look?: GraphicsLook; fixes: string[] } {
  const fixes: string[] = [];
  if (!look?.sections?.length) return { fixes };
  const sections = look.sections
    .map((s) => {
      const layers = (s.layers ?? []).filter((l) => {
        const ok = (LAYER_KINDS as readonly string[]).includes(l.kind) || (l.kind === 'code' && typeof l.src === 'string');
        if (!ok) fixes.push(`移除未知圖層 ${l.kind}`);
        return ok;
      }).map((l) => cleanLayer(l, assets, fixes));
      const sec: LookSection = { start: Math.max(start, Number(s.start) || start), layers };
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
  return { look: { sections }, fixes };
}

function cleanLayer(l: Layer, assets: string[], fixes: string[]): Layer {
  const out = { ...l } as unknown as Record<string, unknown>;
  for (const [k, v] of Object.entries(out)) {
    // colours that don't parse fall back to a neutral grey rather than breaking the canvas
    if (/^(color|color2|to|tint|frame|bars|signal)$/.test(k) && typeof v === 'string' && !HEX.test(v) && !v.startsWith('rgba')) out[k] = '#808080';
    if (v === null) delete out[k];
  }
  // a numeral the director wrote as a number (1, not "1") broke every layer that spreads its text
  if ('text' in out && typeof out['text'] !== 'string') out['text'] = String(out['text'] ?? '');
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
