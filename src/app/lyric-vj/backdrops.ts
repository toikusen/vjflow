import { contrast } from './contrast';
// Section backdrops: the old director's approved layer stacks (paper, big shapes, bands, halftone, frames) kept as
// presets the kinetic planner lays under several cuts, so a look holds across a passage instead of changing every cut.

/** A graphics layer as stored in a treatment (graphics.ts Layer; loose, read from JSON). */
export type StoredLayer = { kind: string } & Record<string, unknown>;

export interface Backdrop {
  id: string;
  layers: StoredLayer[];
  /** What it looks like and where its big shapes sit, for the planner. */
  what: string;
}

/**
 * Layers that are pictures or words of the song they were made for, never carried to another song; and concentric
 * rings, which under type read as circles meaning nothing (2026-10-20).
 */
const DROP = new Set(['photo', 'stamp', 'seal', 'numeral', 'ui', 'sprite', 'card', 'thread', 'code', 'kinetic', 'rings']);

/** Moves that paint the whole frame: over a backdrop they hide it (beatbg flooded the riso splice white). */
export const COVER_FX = new Set(['film', 'neon', 'tvoff', 'beatbg', 'tear', 'invert']);

const NAME: Record<string, string> = { halftone: '網點', stripes: '斜紋鋪滿', gingham: '格子紋', dots: '圓點紋', circle: '圓', star: '星星', triangle: '三角', ticket: '票券', speedlines: '速度線', blob: '不規則色塊', botanical: '植物剪影', border: '邊', mist: '霧', skyline: '地平線剪影', sunburst: '放射光' };
const name = (v: unknown) => NAME[String(v)] ?? String(v);
/** A colour in words a director can see by: how dark, and which hue (深紫, 橘, 淺金…). */
export function tone(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex));
  if (!m) return String(hex);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  const light = l < 0.18 ? '深' : l < 0.4 ? '暗' : l > 0.78 ? '淺' : '';
  if (d < 0.08) return l < 0.18 ? '黑' : l > 0.85 ? '白' : '灰';
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  const hue = h < 15 ? '紅' : h < 40 ? '橘' : h < 65 ? '金' : h < 160 ? '綠' : h < 200 ? '青' : h < 250 ? '藍' : h < 290 ? '紫' : h < 335 ? '粉' : '紅';
  return light + hue;
}
const tones = (cs: unknown) => (Array.isArray(cs) ? [...new Set(cs.map((c) => tone(String(c))))].join('→') : tone(String(cs)));
const where = (y: unknown) => (Number(y) > 0.3 ? '上方' : Number(y) < -0.3 ? '下方' : '中間');
const pct = (v: unknown) => `${Math.round(Number(v) * 100)}%`;

/** One layer in a few words: what it is and where it sits (empty for the plain paper). */
function say(l: StoredLayer): string {
  switch (l.kind) {
    case 'paper':
    case 'fill':
      return '';
    case 'code':
      return '這首歌原本畫好的整首場景（跟著歌曲時間一路演下去，道具也在裡面）';
    case 'pattern':
      return l['type'] === 'halftone' || l['type'] === 'stripes' ? name(l['type']) : name(l['type']).replace(/紋?$/, '紋');
    case 'bands':
      return `色帶（畫面高度 ${pct(l['from'])}–${pct(l['to'])}：${tones(l['colors'])}）`;
    case 'band':
      return `橫越的${tone(String(l['color']))}斜色帶（${Number(l['y']) < 0 ? '下半' : '上半'}）`;
    case 'blob':
      return `${tone(String(l['color']))}大圓（太陽或星球，在${where(l['y'])}）`;
    case 'shapes':
      return Number(l['size']) >= 150 ? `大${name(l['type'])}×${l['count']}（漂在畫面各處）` : `小${name(l['type'])}`;
    case 'frame':
      return `${name(l['type'])}框（框住畫面中央，字放框內）`;
    case 'particles':
      return `${tone(String(l['color']))}飄動的微粒×${l['count'] ?? ''}`;
    default:
      return name(l.kind);
  }
}

/**
 * The approved stacks of a treatment as backdrops in another song's colours: pictures and words dropped, `from`
 * colours (ink, paper, accent) swapped for `to`, one preset per distinct look.
 */
export function harvestBackdrops(sections: { layers: StoredLayer[] }[], from: string[], to: string[], keep: ReadonlySet<string> = new Set()): Backdrop[] {
  const swap = new Map(from.map((c, i) => [c.toLowerCase(), to[i]]));
  const recolor = (v: unknown): unknown =>
    typeof v === 'string' ? (swap.get(v.toLowerCase()) ?? v) : Array.isArray(v) ? v.map(recolor) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, recolor(x)])) : v;
  const seen = new Set<string>();
  const out: Backdrop[] = [];
  // named by the section it comes from, so the ids stay put whatever the de-duplication keeps
  for (const [i, s] of sections.entries()) {
    // of what the signature added (signature.ts) only the sky and ground bands mean anything away from the section they
    // were made for: its planets floated mid-frame as dark discs
    // a disc under 6 % of the frame is a dot, not a sun or a candle (an orange speck sat under Keep Your Fire Burning's
    // ending). ponytail: one song's threshold; small discs another language uses on purpose would need a kind of their own
    const speck = (l: StoredLayer) => l.kind === 'blob' && Number(l['r'] ?? 1) < 0.06;
    const layers = s.layers.filter((l) => (!DROP.has(l.kind) || keep.has(l.kind)) && !speck(l) && !(l['sig'] === 'added' && l.kind !== 'bands')).map((l) => {
      // signature marks (signature.ts) go too: the renderer strips layers marked added and rebuilds them from the
      // section they were made for, so a carried sky vanished (Keep Your Fire Burning's silkscreen bands)
      const { label: _label, text: _text, sig: _sig, sigFrom: _from, ...rest } = recolor(l) as StoredLayer;
      return rest as StoredLayer;
    });
    const what = layers.map(say).filter(Boolean).join('＋') || '素紙';
    // the same stack only when every layer is the same: a dusk and a night sky read alike in words were one preset
    // and the director never saw the other (Keep Your Fire Burning 147.7 s folded into 43.6 s)
    const same = JSON.stringify(layers);
    if (seen.has(same)) continue;
    seen.add(same);
    out.push({ id: `B${i + 1}`, layers, what });
  }
  return out;
}

/** The stock picture a layer leans on: a sun or planet disc, a city skyline (undefined for anything else). */
export const motifOf = (l: StoredLayer): 'circle' | 'city' | undefined =>
  l.kind === 'blob' || (l.kind === 'shapes' && l['type'] === 'circle') ? 'circle' : l.kind === 'skyline' && l['type'] === 'city' ? 'city' : undefined;

/** The horizons a capped city skyline becomes, in turn. */
const OTHER_SKYLINES = ['hills', 'peaks', 'trees'];

/**
 * The old director reaches for the same pictures in every song (a disc on 9 of 三年後的大雪's 16 sections, a city
 * skyline on 14 of Tokyo Drift's): each stays on at most two backdrops of the song, one when the recent songs already
 * leaned on it (`worn`). Past that a disc goes and a city skyline becomes another horizon.
 */
export function capMotifs(backdrops: Backdrop[], worn: ReadonlySet<string> = new Set()): Backdrop[] {
  const used = new Map<string, number>();
  let other = 0;
  return backdrops.map((b) => {
    const here = new Set(b.layers.map(motifOf).filter((m): m is 'circle' | 'city' => !!m));
    const keep = new Set([...here].filter((m) => (used.get(m) ?? 0) < (worn.has(m) ? 1 : 2)));
    here.forEach((m) => keep.has(m) && used.set(m, (used.get(m) ?? 0) + 1));
    if (keep.size === here.size) return b;
    const layers = b.layers.flatMap((l) => {
      const m = motifOf(l);
      if (!m || keep.has(m)) return [l];
      return m === 'city' ? [{ ...l, type: OTHER_SKYLINES[other++ % OTHER_SKYLINES.length] }] : [];
    });
    return { ...b, layers, what: layers.map(say).filter(Boolean).join('＋') || '素紙' };
  });
}

/**
 * Two inks a backdrop can be read through: when the song's pair is too close (Keep Your Fire Burning's two navies vanished
 * on the night sky), the second becomes the candidate with most contrast against the first.
 */
export function legiblePair(ink: string, paper: string, candidates: string[], min = 4.5): [string, string] {
  if (contrast(ink, paper) >= min) return [ink, paper];
  const best = [paper, ...candidates].reduce((a, b) => (contrast(ink, b) > contrast(ink, a) ? b : a));
  return [ink, best];
}
