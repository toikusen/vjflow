// chat — the line is a message in a chat thread that fills the frame (the database's phone videos: あいみょん
// 〈貴方解剖純愛歌〉, あれくん〈Couldn't stop fallin'〉): it is sent the moment it is sung, a bubble popping in above the
// input bar; each later message pushes the earlier ones up by its own height, and they fade at the top of the thread.
// Whose message it is comes from the shot (side): one person sending and never answered, two people, or alternating.
import * as THREE from 'three';
import { contrast } from '../contrast';
import { phraseBoundaries } from '../phrases';
import { advanceOf, clamp01, easeOutCubic, Glyph, GlyphStyle, makeGlyphs, placeRow, rowWidth, sizeCap } from './glyphs';
import { CueLayer, CueRuntime, tagSource, TemplateRenderer } from './runtime';

const W = 1920;
const H = 1080;
/** Where the newest message sits (its bottom edge, from the centre) and where the thread fades out (top). */
export const CHAT_BASE = -H * 0.3;
/** The thread's content area (frame px from the centre, y up): under the app's header, over its input bar
 * (kit.ts APP_TOP / APP_BOTTOM). Messages are clipped to it and fade out inside it. */
export const CHAT_TOP = H / 2 - 150;
export const CHAT_BOTTOM = -H / 2 + 112;
const FADE_SPAN = H * 0.12;
const CLIP = [new THREE.Plane(new THREE.Vector3(0, -1, 0), CHAT_TOP), new THREE.Plane(new THREE.Vector3(0, 1, 0), -CHAT_BOTTOM)];
const GAP = 22;

interface Bubble {
  rows: string[];
  size: number;
  w: number;
  h: number;
}

/**
 * How a line is set in a bubble: one to three rows no wider than the thread's column, at a size that reads on video.
 * Rows break only between phrases (phrases.ts: never inside a word, never before a small kana or a long mark), at a
 * space where the line has them, as evenly as they can, and no row is a lone character (「魔法にかかってしまったみた／い」).
 */
export function bubbleOf(text: string, family: string, base = 64, maxW = W * 0.5, advance: (c: string, s: GlyphStyle) => number = advanceOf): Bubble {
  const clean = text.replace(/[\s　]+/g, ' ').trim();
  const cs = [...clean];
  const spaces = cs.flatMap((c, k) => (c === ' ' ? [k, k + 1] : []));
  // the segmenter misses some phrase ends (「魔法にか|かって」): also after a particle that follows kanji or katakana
  // (魔法に, 君と) and after a te-form (かかって, 泣いて, 読んで)
  const extra = cs.flatMap((c, k) => ((/[にをはがでともへ]/.test(c) && /[\u30a0-\u30ff\p{Script=Han}]/u.test(cs[k - 1] ?? '')) || (/[てで]/.test(c) && /[っいん]/.test(cs[k - 1] ?? '')) ? [k + 1] : []));
  const bounds = [...new Set([0, cs.length, ...phraseBoundaries(clean), ...spaces, ...extra])].filter((b) => b === cs.length || !/[ぁぃぅぇぉっゃゅょーー、。！？!?）」』]/.test(cs[b] ?? '')).sort((a, b) => a - b);
  const sizes = [base, base * 0.88, base * 0.76].map((x) => Math.round(x * Math.min(1, sizeCap)));
  for (const size of sizes) {
    const st: GlyphStyle = { family, weight: 700, size };
    const piece = (a: number, b: number) => cs.slice(a, b).join('').trim();
    const width = (a: number, b: number) => [...piece(a, b)].reduce((w, c) => w + advance(c, st), 0);
    const glyphsIn = (a: number, b: number) => [...piece(a, b)].length;
    for (let rows = 1; rows <= 3; rows++) {
      // the split into `rows` rows that reads best: strong breaks first (the lyric's own spaces and punctuation, then
      // after a particle or a te-form, or where kana turns into kanji or katakana), only then the most even widths
      let best: { cost: number; cuts: number[] } | undefined;
      const walk = (from: number, left: number, cuts: number[], worst: number) => {
        if (left === 1) {
          const w = width(from, cs.length);
          if (w > maxW || glyphsIn(from, cs.length) < 2) return;
          const cost = cuts.reduce((n, c) => n + breakCost(cs, c), 0) * 1e5 + Math.max(worst, w);
          if (!best || cost < best.cost) best = { cost, cuts };
          return;
        }
        for (const b of bounds) {
          if (b <= from || b >= cs.length) continue;
          const w = width(from, b);
          if (w > maxW) break;
          if (glyphsIn(from, b) < 2) continue;
          walk(b, left - 1, [...cuts, b], Math.max(worst, w));
        }
      };
      walk(0, rows, [], 0);
      if (!best) continue;
      const edges = [0, ...(best as { cuts: number[] }).cuts, cs.length];
      const out = edges.slice(1).map((e, k) => piece(edges[k], e));
      const w = Math.max(...out.map((r, k) => width(edges[k], edges[k + 1]))) + size * 1.3;
      return { rows: out, size, w, h: out.length * size * 1.32 + size * 0.95 };
    }
  }
  // no phrase split fits even small: break anywhere at the smallest size
  const size = sizes[sizes.length - 1];
  const st: GlyphStyle = { family, weight: 700, size };
  const rows: string[] = [];
  let row = '';
  for (const ch of cs) {
    if (row && [...row + ch].reduce((w, c) => w + advance(c, st), 0) > maxW) {
      rows.push(row.trim());
      row = '';
    }
    row += ch;
  }
  if (row.trim()) rows.push(row.trim());
  const w = Math.max(...rows.map((r) => [...r].reduce((x, c) => x + advance(c, st), 0))) + size * 1.3;
  return { rows, size, w, h: rows.length * size * 1.32 + size * 0.95 };
}

const HIRA = /[\u3041-\u309f]/;
const KANA_KANJI = /[\u30a0-\u30ff\p{Script=Han}(（「『]/u;
/** How bad a row break before character `b` reads: 0 at a space or after punctuation, 1 after a particle or a te-form
 * or where hiragana turns into kanji or katakana, 3 anywhere else between phrases. */
export function breakCost(cs: string[], b: number): number {
  const [a, n] = [cs[b - 1] ?? '', cs[b] ?? ''];
  if (a === ' ' || n === ' ' || /[、。,.!?！？」』)）]/.test(a)) return 0;
  if (HIRA.test(a) && KANA_KANJI.test(n)) return 1;
  if (/[にをはがでともへのやよねてば]/.test(a) && HIRA.test(n)) return 1;
  return 3;
}

/** A bubble's plate as a texture: a rounded box with a small tail at the bottom on the sender's side. */
export function plate(w: number, h: number, fill: string, mine: boolean | undefined, glow?: string, corner = 1): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
  // room round the box for the tail, and for a glow (a message lit up over a dark scene)
  const pad = glow ? 48 : 16;
  const c = new OffscreenCanvas(Math.ceil(w + pad * 2), Math.ceil(h + pad * 2));
  const g = c.getContext('2d')!;
  g.fillStyle = fill;
  if (glow) {
    g.shadowColor = glow;
    g.shadowBlur = 36;
  }
  g.beginPath();
  g.roundRect(pad, pad, w, h, Math.min(h / 2, 44) * Math.max(0.15, Math.min(1, corner)));
  if (mine === undefined) {
    g.fill();
    const tex0 = new THREE.CanvasTexture(c as unknown as HTMLCanvasElement);
    tex0.colorSpace = THREE.SRGBColorSpace;
    return new THREE.Mesh(new THREE.PlaneGeometry(c.width, c.height), new THREE.MeshBasicMaterial({ map: tex0, transparent: true, depthTest: false, depthWrite: false }));
  }
  // the tail: a wedge growing out of the bottom edge at the sender's corner and tapering out and down, one shape with
  // the box (a thin separate curl read as a broken-off shard once the bubble glowed)
  const ex = mine ? pad + w : pad;
  const d = mine ? 1 : -1;
  const by = pad + h;
  const r = Math.min(h / 2, 44) * Math.max(0.15, Math.min(1, corner));
  g.moveTo(ex - d * (r + 22), by - 1);
  g.quadraticCurveTo(ex - d * 6, by + 1, ex + d * 10, by + 13);
  g.quadraticCurveTo(ex + d * 2, by + 2, ex, by - r * 0.6);
  g.lineTo(ex - d * (r + 22), by - 1);
  g.closePath();
  g.fill();
  const tex = new THREE.CanvasTexture(c as unknown as HTMLCanvasElement);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(c.width, c.height), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
}

/** Whose line it is: the shot's side, `alternate` taking turns from the first line, which is the other person's. */
export function isMine(side: unknown, order: number): boolean {
  if (side === 'left') return false;
  if (side === 'alternate') return order % 2 === 1;
  return true;
}

/**
 * The camera on the thread: `zoom` (1–2) is how close it sits on the shot's first message, scaled about the thread's
 * bottom-right corner; when the next message arrives it pulls back to the whole chat in 0.45 s, the close-up line
 * staying in the thread above. Later lines of the shot are seen from the whole chat.
 */
export function cameraAt(zoom: number, order: number, showFrom: number, later: number[], t: number): number {
  const z = Math.min(2, Math.max(1, zoom));
  const back = order === 0 ? later[0] : order === 1 ? showFrom : -Infinity;
  if (z === 1 || back === -Infinity) return 1;
  if (back === undefined || t < back) return z;
  return z + (1 - z) * easeOutCubic((t - back) / 0.45);
}

/**
 * Where the close-up is taken from and how close it may go, from the shot's first message: the thread's bottom corner
 * on that message's side (a left message zoomed about the right corner left the frame), and no closer than keeps the
 * whole bubble in the frame and under the header.
 */
export function closeUp(zoom: number, first: { w: number; h: number }, mine: boolean): { zoom: number; px: number; py: number } {
  const edge = W * 0.43;
  const z = Math.min(Math.max(1, zoom), (W * 0.9) / first.w, ((CHAT_TOP - CHAT_BASE) * 0.95) / first.h);
  return { zoom: Math.max(1, z), px: (mine ? 1 : -1) * (edge + W * 0.01), py: CHAT_BASE };
}

/** How tall an attachment stands in the thread: a photo message or a sticker (px). */
export const ATTACH_H = { photo: H * 0.36, sticker: H * 0.26 } as const;

/** The shot's attachment as its params give it: a photo or a sticker, sent at a time, by me or them; none if unset. */
export function attachmentOf(p: Record<string, unknown>, shotStart: number) {
  const kind = p['attachKind'];
  const id = String(p['attach'] ?? '').trim();
  if ((kind !== 'photo' && kind !== 'sticker') || !id) return undefined;
  return { kind, id: kind === 'sticker' && !id.startsWith('spr:') ? `spr:${id}` : id, at: shotStart + Number(p['attachAt'] ?? 0), mine: p['attachVoice'] !== 'them' } as const;
}

export const chat: TemplateRenderer = {
  persist: 'shot',
  // a photo or a sticker sent in the thread: a message without words, pushed up by the lines after it like any other
  shot(shot, params, _palette, ctx) {
    const group = new THREE.Group();
    const at = attachmentOf(params, shot.start);
    const tex = at && ctx.texture?.(at.id);
    if (!at || !tex) return { group, update: () => undefined };
    const img = tex.image as { width: number; height: number };
    const h = ATTACH_H[at.kind];
    const w = Math.min(W * 0.4, (h * img.width) / Math.max(1, img.height));
    const edge = W * 0.43;
    const cx = at.mine ? edge - w / 2 : -edge + w / 2;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false });
    mat.clippingPlanes = CLIP;
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    pic.position.set(cx, h / 2, 0);
    const inner = new THREE.Group();
    // a photo sits in a rounded white frame like a sent picture; a sticker stands on its own
    if (at.kind === 'photo') {
      const frame = plate(w + 16, h + 16, '#FFFFFF', undefined, undefined, 0.5);
      frame.material.clippingPlanes = CLIP;
      frame.position.set(cx, h / 2, 0);
      frame.renderOrder = -1;
      inner.add(frame);
    }
    inner.add(pic);
    group.add(inner);
    const size = Number(params['size'] ?? 64);
    return {
      group,
      update(t: number) {
        const later = (ctx.lines?.(shot.id) ?? []).filter((l) => l.at > at.at);
        const lift = later.reduce((s, l) => s + easeOutCubic((t - l.at) / 0.16) * (bubbleOf(l.text, ctx.fonts.body, size).h + GAP), 0);
        const k = clamp01((t - at.at) / 0.22);
        const sc = 0.6 + 0.4 * easeOutCubic(k);
        const anchorX = at.mine ? cx + w / 2 : cx - w / 2;
        inner.position.set(anchorX * (1 - sc), CHAT_BASE + lift, 0);
        inner.scale.setScalar(sc);
        const top = CHAT_BASE + lift + h;
        const a = (t >= at.at && t < shot.end ? 1 : 0) * clamp01((CHAT_TOP - top) / FADE_SPAN);
        inner.children.forEach((m) => ((m as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>).material.opacity = a));
      },
    };
  },
  cue(rt: CueRuntime): CueLayer {
    const p = rt.params;
    const order = rt.order ?? 0;
    // the line's own voice (the director marked who says it) before the shot's side
    const mine = rt.style.voice ? rt.style.voice === 'me' : isMine(p['side'], order);
    const family = rt.fonts.body;
    const size = Number(p['size'] ?? 64);
    const b = bubbleOf(rt.cue.text, family, size);
    const firstText = (rt.shotText ?? [rt.cue.text])[0] ?? rt.cue.text;
    const firstMine = rt.firstVoice ? rt.firstVoice === 'me' : isMine(p['side'], 0);
    const view = closeUp(Number(p['zoom'] ?? 1), order === 0 ? b : bubbleOf(firstText, family, size), firstMine);
    const zoom = view.zoom;
    const accent = rt.palette.accent;
    // the other person's bubble: light grey in a light app, dark grey in dark mode
    const dark = p['theme'] === 'dark';
    const other = dark ? '#2C2C2E' : '#ECECEF';
    // white on a dark bubble, near-black on a light one
    const ink = mine ? (contrast('#FFFFFF', accent) >= 3 ? '#FFFFFF' : '#1C1C1E') : dark ? '#F2F2F7' : '#1C1C1E';
    // camera (zoom) → send (pop, push up) → the message, built at the close-up's resolution and scaled down, so the
    // type is crisp when the camera is close
    const group = new THREE.Group();
    const sent = new THREE.Group();
    const inner = new THREE.Group();
    group.add(sent);
    sent.add(inner);
    const R = zoom;
    inner.scale.setScalar(1 / R);
    const bubble = plate(b.w * R, b.h * R, mine ? accent : other, mine, p['glow'] ? (mine ? accent : '#FFFFFF') : undefined, Number(p['corner'] ?? 1));
    bubble.renderOrder = -1;
    inner.add(bubble);
    // the thread's column: messages hug the right edge (mine) or the left (theirs), like a real chat
    const edge = W * 0.43;
    const cx = mine ? edge - b.w / 2 : -edge + b.w / 2;
    bubble.position.set(cx * R, (b.h / 2) * R, 0);
    const style: GlyphStyle = { family, weight: 700, size: Math.round(b.size * R) };
    const rows = b.rows.map((r) => makeGlyphs(r, style, ink));
    const lh = b.size * 1.32 * R;
    rows.forEach((gs, i) => {
      const left = (cx - b.w / 2 + b.size * 0.65) * R;
      placeRow(gs, left + rowWidth(gs) / 2, (b.h / 2) * R + ((rows.length - 1) / 2 - i) * lh);
    });
    const glyphs: Glyph[] = rows.flat();
    tagSource(glyphs, rt.cue.text);
    glyphs.forEach((g, i) => ((g.index = i), inner.add(g.mesh)));
    // the read mark beside my message, small and grey, as a real thread shows it
    const meta: Glyph[] = mine && p['read'] !== 'none' ? makeGlyphs('既読', { family, weight: 600, size: Math.round(b.size * 0.42 * R) }, '#B4B4BC') : [];
    placeRow(meta, (cx - b.w / 2 - b.size * 0.85) * R, b.size * 0.32 * R);
    meta.forEach((g) => inner.add(g.mesh));
    // later messages of the same shot, set the same way: each pushes this one up by its own height
    const heights = (rt.laterText ?? []).map((x) => bubbleOf(x, family, size).h + GAP);
    // the shot's attachment, sent after this line, pushes it up too
    const att = attachmentOf(p, rt.shot.start);
    const attLift = (t: number) => (att && att.at > rt.showFrom ? easeOutCubic((t - att.at) / 0.16) * (ATTACH_H[att.kind] + GAP) : 0);
    const liftAt = (t: number) => (rt.later ?? []).reduce((s, a, k) => s + easeOutCubic((t - a) / 0.16) * (heights[k] ?? b.h + GAP), 0) + attLift(t);
    // the time this message's top passes into the fade at the top of the thread
    const fadeFrom = (() => {
      let lift = 0;
      const pushes = [...(rt.later ?? []).map((a, k) => ({ a, h: heights[k] ?? b.h + GAP })), ...(att && att.at > rt.showFrom ? [{ a: att.at, h: ATTACH_H[att.kind] + GAP }] : [])].sort((x, y) => x.a - y.a);
      for (const { a, h } of pushes) {
        lift += h;
        if (CHAT_BASE + lift + b.h > CHAT_TOP - FADE_SPAN * 0.5) return a;
      }
      return Infinity;
    })();
    // the camera's pivot: the thread's bottom corner on the first message's side
    const [px, py] = [view.px, view.py];
    for (const m of [bubble.material, ...glyphs.map((g) => g.mesh.material), ...meta.map((g) => g.mesh.material)]) m.clippingPlanes = CLIP;
    return {
      group,
      update(t: number) {
        const cam = cameraAt(zoom, order, rt.showFrom, rt.later ?? [], t);
        group.scale.setScalar(cam);
        group.position.set(px * (1 - cam), py * (1 - cam), 0);
        // sent: the bubble grows from its tail corner in 0.22 s, never past its own size (an overshoot pressed it into
        // the message above, which had moved up by exactly that size)
        const k = clamp01((t - rt.showFrom) / 0.22);
        const pop = k <= 0 ? 0 : easeOutCubic(k);
        const lift = liftAt(t);
        const top = CHAT_BASE + lift + b.h;
        // gone by the time its top reaches the header (the clip takes whatever is left)
        const fade = clamp01((CHAT_TOP - top) / FADE_SPAN);
        // scaled about the bubble's outer bottom corner (where the tail is), so it grows out of the sender's side
        const anchorX = mine ? cx + b.w / 2 : cx - b.w / 2;
        const sc = Math.max(0.001, 0.6 + 0.4 * pop);
        sent.position.set(anchorX * (1 - sc), CHAT_BASE + lift, 0);
        sent.scale.setScalar(sc);
        const leave = rt.exitAt < Infinity ? clamp01(1 - (t - rt.exitAt) / Math.max(0.08, rt.exitDur)) : 1;
        // the thread ends with its shot: the next shot is another screen (its first message must not land on this one's last)
        const a = (k > 0 && t < rt.shot.end ? 1 : 0) * fade * leave;
        bubble.material.opacity = a;
        // the words arrive with their bubble, whole (a message is sent at once, not typed into the thread)
        glyphs.forEach((g) => {
          g.mesh.position.set(g.x, g.y, 0);
          g.mesh.material.opacity = a;
        });
        meta.forEach((g) => {
          g.mesh.position.set(g.x, g.y, 0);
          g.mesh.material.opacity = a * clamp01((t - rt.showFrom - 0.6) / 0.2);
        });
      },
      readable: () => [rt.showFrom + 0.22, Math.min(rt.exitAt + rt.exitDur * 0.5, fadeFrom)],
    };
  },
};
