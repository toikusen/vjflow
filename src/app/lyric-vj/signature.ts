// The song signature: where a song happens and how its frame is built, written once by the director and kept through
// the song (docs/superpowers/specs/2026-10-13-song-identity-proposal.md). Same-language songs had come out as one
// skeleton (every silkscreen sky a 0–0.6 band over hills, every risograph photo the same centred box); the signature
// replaces only that skeleton — the sky bands and the ground silhouette — and keeps everything else the director placed.
import type { ArcPoint, Moment } from './moments';
import type { GraphicsLook, Layer, LookSection } from './render/graphics';

export const SCENES = ['sea', 'space', 'riverbank', 'land', 'none'] as const;
export const PICTURES = ['keep', 'band', 'circle', 'full'] as const;
export const LAYOUTS = ['round', 'linear', 'free'] as const;
export type Scene = (typeof SCENES)[number];
export type PictureRole = (typeof PICTURES)[number];

export interface Signature {
  /** Where and when the song happens, in a sentence from its concept and lyrics. */
  image: string;
  /** The ground: a sea under the horizon, open space with a planet rising, a long low river bank, the director's own
   * land (only its sky height set), or none (the ground left as the director made it). */
  scene: Scene;
  /** Sky height in verses and in choruses, from the top (0.25–0.75); the chorus may keep the verse's. */
  horizon?: number;
  chorusHorizon?: number;
  /** What photos do: stay as placed, a strip, a round window, the whole frame (inked when `ink` is set). */
  picture?: PictureRole;
  chorusPicture?: PictureRole;
  /** The main geometry: round (windows, orbits), linear (long lines, a diagonal rail in choruses) or free. */
  layout?: (typeof LAYOUTS)[number];
  /** The ink a full-frame photo is printed in. */
  ink?: string;
}

/** Marks the signature pass leaves, so its work can be taken back exactly (strip) and is never applied twice. */
type Marked = Layer & { sig?: 'added' | 'changed'; sigFrom?: Layer };
type MarkedSection = LookSection & { sigRemoved?: [number, Layer][] };

const HEX = /^#[0-9a-f]{6}$/i;
const H_RANGE = [0.25, 0.75] as const;

/** What is wrong with a signature: its types, ranges and allowed values (the director does not always keep a schema). */
export function signatureErrors(s: unknown): string[] {
  if (s === undefined) return [];
  if (!s || typeof s !== 'object' || Array.isArray(s)) return ['signature 必須是物件'];
  const g = s as Record<string, unknown>;
  const out: string[] = [];
  const known = new Set(['image', 'scene', 'horizon', 'chorusHorizon', 'picture', 'chorusPicture', 'layout', 'ink']);
  for (const k of Object.keys(g)) if (!known.has(k)) out.push(`signature 沒有欄位 ${k}`);
  if (typeof g['image'] !== 'string' || !g['image'].trim()) out.push('signature.image 必須是一句描述這首歌場景的文字');
  if (!SCENES.includes(g['scene'] as Scene)) out.push(`signature.scene 必須是 ${SCENES.join('／')} 之一`);
  for (const k of ['horizon', 'chorusHorizon'])
    if (g[k] !== undefined && !(typeof g[k] === 'number' && Number.isFinite(g[k]) && g[k] >= H_RANGE[0] && g[k] <= H_RANGE[1])) out.push(`signature.${k} 必須是 ${H_RANGE[0]}–${H_RANGE[1]} 的數字`);
  if (['sea', 'riverbank', 'land'].includes(g['scene'] as string) && g['horizon'] === undefined) out.push(`signature.scene ${g['scene']} 需要 horizon`);
  for (const k of ['picture', 'chorusPicture']) if (g[k] !== undefined && !PICTURES.includes(g[k] as PictureRole)) out.push(`signature.${k} 必須是 ${PICTURES.join('／')} 之一`);
  if (g['layout'] !== undefined && !LAYOUTS.includes(g['layout'] as (typeof LAYOUTS)[number])) out.push(`signature.layout 必須是 ${LAYOUTS.join('／')} 之一`);
  if (g['ink'] !== undefined && !(typeof g['ink'] === 'string' && HEX.test(g['ink']))) out.push('signature.ink 必須是 #rrggbb');
  return out;
}

/**
 * The director's signature as a treatment keeps it: the director fills every field (structured output) and writes
 * null where one is not used (no chorus horizon of its own, no ink); those are left out. Anything else is passed on as
 * written, for signatureErrors to report.
 */
export function signatureFromDirector(s: unknown): Signature | undefined {
  if (s === undefined || s === null) return undefined;
  if (typeof s !== 'object' || Array.isArray(s)) return s as Signature;
  return Object.fromEntries(Object.entries(s).filter(([, v]) => v !== null)) as unknown as Signature;
}

/** How far before a section start a moment still belongs to it: section starts are snapped and land a few hundredths
 * after the beat (世界のつづき: a drop at 53.59 s, its section at 53.60 s). */
const SNAP = 0.25;

/**
 * Which sections are choruses: a drop, hold or finale falls in it, or the arc reaches its top level in it. A moment at
 * most SNAP before the next section's start belongs to the next section, never to this one.
 */
export function chorusSections(sections: { start: number }[], moments: Moment[] = [], arc: ArcPoint[] = []): boolean[] {
  const owner = (x: number) => {
    let k = -1;
    sections.forEach((s, i) => {
      if (x >= s.start - SNAP) k = i;
    });
    return k;
  };
  const up = sections.map(() => false);
  for (const m of moments) if (m.kind === 'drop' || m.kind === 'hold' || m.kind === 'finale') if (owner(m.at) >= 0) up[owner(m.at)] = true;
  for (const a of arc) if (a.level >= 3 && owner(a.start) >= 0) up[owner(a.start)] = true;
  return up;
}

/** Darken (k < 1) or lighten (k > 1) a #rrggbb ink. */
const shade = (hex: string, k: number) =>
  '#' +
  [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16))
    .map((v) => (k <= 1 ? Math.min(255, Math.round(v * k)) : Math.round(v + (255 - v) * (k - 1))).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();

const isSky = (l: Layer) => l.kind === 'bands' && (l.from ?? 0) === 0 && l.colors.length >= 2;
const added = (l: Layer): Marked => ({ ...l, sig: 'added' }) as Marked;
const changed = (l: Marked, patch: Record<string, unknown>): Marked => {
  const from = l.sigFrom ?? l;
  return { ...from, ...patch, sig: 'changed', sigFrom: from } as Marked;
};

/** The look as the director made it: added layers dropped, changed ones restored, replaced ones put back. */
export function stripSignature(look: GraphicsLook | undefined): GraphicsLook | undefined {
  if (!look) return look;
  const out = structuredClone(look);
  out.sections = out.sections.map((s0) => {
    const { sigRemoved, ...s } = s0 as MarkedSection;
    const layers: Layer[] = (s.layers as Marked[]).filter((l) => l.sig !== 'added').map((l) => (l.sigFrom ?? l) as Layer);
    for (const [i, l] of sigRemoved ?? []) layers.splice(Math.min(i, layers.length), 0, l);
    return { ...s, layers };
  });
  return out;
}

/**
 * The look with the signature's skeleton. Pure: the input is not modified; applying to an already signed look starts
 * from the director's own (stripSignature), so applying twice equals applying once. A section with no sky bands keeps
 * its ground; `keep` leaves photos exactly as placed.
 */
export function applySignature(look0: GraphicsLook, sig: Signature, moments: Moment[] = [], arc: ArcPoint[] = []): GraphicsLook {
  const look = stripSignature(look0)!;
  const up = chorusSections(look.sections, moments, arc);
  let flip = 0;
  look.sections = look.sections.map((s, i) => {
    const chorus = up[i];
    const hz = chorus ? (sig.chorusHorizon ?? sig.horizon) : sig.horizon;
    const sky = s.layers.find(isSky) as Extract<Layer, { kind: 'bands' }> | undefined;
    const reground = !!sky && (sig.scene === 'sea' || sig.scene === 'space' || sig.scene === 'riverbank') && (sig.scene === 'space' || hz !== undefined);
    const removed: [number, Layer][] = [];
    let layers: Marked[] = [];
    s.layers.forEach((l, j) => {
      if (reground && (l === sky || l.kind === 'skyline')) removed.push([j, l]);
      else if (sig.scene === 'land' && l === sky && hz !== undefined) layers.push(changed(l, { to: hz }));
      else layers.push(l);
    });
    // the director's own ground from the horizon down (a sea it drew for the signature, 世界のつづき): no second one
    const ownGround = hz !== undefined && s.layers.some((l) => l.kind === 'bands' && l !== sky && Math.abs((l.from ?? 0) - hz) <= 0.02 && (l.to ?? 1) >= 0.98);
    if (reground && sky) {
      const inks = sky.colors;
      let ground: Marked[] = [];
      if (sig.scene === 'sea' && ownGround) ground = [added({ kind: 'bands', colors: inks, from: 0, to: hz })];
      else if (sig.scene === 'sea')
        // sky to the horizon, then two sea inks alternating: the seam stripes the bands print read as glints
        ground = [added({ kind: 'bands', colors: inks, from: 0, to: hz }), added({ kind: 'bands', colors: Array.from({ length: 6 }, (_, k) => (k % 2 ? shade(inks[0], 0.8) : shade(inks[1], 0.9))), from: hz, to: 1 })];
      else if (sig.scene === 'riverbank') ground = [added({ kind: 'bands', colors: inks, from: 0, to: hz })];
      else {
        ground = [added({ kind: 'bands', colors: inks, from: 0, to: 1 })];
        // a planet rising from the bottom, unless the director already put one there; it is ground, never moved
        if (!layers.some((l) => l.kind === 'blob' && (l.y ?? 0) < -0.8 && (l.r ?? 0) >= 0.4))
          ground.push(added({ kind: 'blob', x: chorus ? 0 : 0.45, y: chorus ? -1 : -1.05, r: chorus ? 0.75 : 0.42, color: chorus ? shade(inks[inks.length - 1], 1.25) : shade(inks[0], 0.7), fixed: true }));
      }
      const k = layers.findIndex((l) => l.kind === 'paper');
      layers.splice(k + 1, 0, ...ground);
    }
    const role = (chorus ? (sig.chorusPicture ?? sig.picture) : sig.picture) ?? 'keep';
    // a framed photo over a skyline prints normally (look.ts would repair a multiply there and the signed look fail)
    const flat = (l: Layer) => (layers.some((x) => x.kind === 'skyline') && l.kind === 'photo' && l.blend === 'multiply' ? { blend: undefined } : {});
    layers = layers.map((l) => {
      // a story frame is the screenplay's own picture, laid out by it: the song's picture role leaves it whole (it shrank
      // 三年後的大雪's story frames into small circles on black, 2026-10-23)
      if (l.kind !== 'photo' || role === 'keep' || (l as { own?: boolean }).own) return l;
      if (role === 'band') return changed(l, { ...flat(l), mode: 'band', y: sig.scene === 'riverbank' || hz === undefined ? -0.62 : Math.round((1 - 2 * hz - 0.18) * 100) / 100 });
      if (role === 'circle') {
        flip ^= 1;
        return changed(l, { ...flat(l), mode: 'circle', w: chorus ? 0.36 : 0.24, x: chorus ? 0 : flip ? 0.5 : -0.5, y: chorus ? 0.05 : -0.1 });
      }
      return changed(l, { mode: 'full', ...(sig.ink ? { tint: sig.ink } : {}) });
    });
    if (sig.scene === 'sea' && chorus && hz !== undefined) {
      // the chorus sun rises on the horizon: the director's own sun, moved (none is added)
      const sun = layers.findIndex((l) => l.kind === 'blob' && l.sig !== 'added');
      if (sun >= 0) layers[sun] = changed(layers[sun], { x: 0, y: Math.round((1 - 2 * hz) * 100) / 100, r: 0.3 });
    }
    // linear is a preference for long lines: a chorus that has one of the director's own (a stripe, a tape, level or
    // slanted) keeps it, and only a chorus with none gets a rail, low in the frame, under where lines are read
    // (世界のつづき 211 s: a second slant over the director's own crossed 「夢のつづきで」)
    // a section the drawing lays out itself (its code layer over the ground alone) gets no rail it did not ask for
    const drawn = layers.some((l) => l.kind === 'code') && layers.every((l) => l.kind === 'code' || l.kind === 'paper' || l.kind === 'fill');
    if (sig.layout === 'linear' && chorus && !drawn && !layers.some((l) => l.kind === 'band' && l.sig !== 'added'))
      layers.push(added({ kind: 'band', type: 'solid', y: -0.62, angle: -10, height: 70, color: s.accent ?? sig.ink ?? '#3A57A8' }));
    const out: MarkedSection = { ...s, layers };
    if (removed.length) out.sigRemoved = removed;
    return out;
  });
  return look;
}
