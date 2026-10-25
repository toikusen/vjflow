// The phone's other two lyric layouts besides the chat (database: 夜光性アミューズ〈まっしぐら恋心〉's notification
// cards and the input field with its cursor, Sou〈ブルースクリーン〉's typed notepad):
// notify — each line is a notification card dropping in at the top of a lock screen, the newest on top, older ones
//          pushed down and fading near the bottom
// input  — the line is typed into a big input field at the bottom of the screen as it is sung; when it is over it is
//          sent (flies up and away) or deleted character by character (typed, then not sent)
import * as THREE from 'three';
import { bubbleOf, plate } from './chat';
import { clamp01, easeOutCubic, Glyph, GlyphStyle, makeGlyphs, placeRow, rowWidth } from './glyphs';
import { CueLayer, CueRuntime, revealAt, tagSource, TemplateRenderer } from './runtime';

const W = 1920;
const H = 1080;
/** Where the newest card's top sits (under a lock screen's clock) and where the stack fades out (bottom). */
const CARD_TOP = H * 0.1;
const CARD_FADE = -H * 0.38;

export const notify: TemplateRenderer = {
  persist: 'shot',
  cue(rt: CueRuntime): CueLayer {
    const family = rt.fonts.body;
    const size = Number(rt.params['size'] ?? 60);
    const b = bubbleOf(rt.cue.text, family, size, W * 0.5);
    const head = size * 0.95;
    const cw = W * 0.64;
    const ch = b.h + head;
    const group = new THREE.Group();
    const card = plate(cw, ch, 'rgba(244,244,247,0.94)', undefined);
    card.renderOrder = -1;
    card.position.set(0, -ch / 2, 0);
    group.add(card);
    // the app's icon and name, then the line
    const icon = plate(size * 0.9, size * 0.9, rt.palette.accent, undefined);
    icon.position.set(-cw / 2 + size * 1.0, -size * 0.72, 0);
    group.add(icon);
    // who it is from: the sender's name (the screen has changed hands: her messages on his locked phone)
    const from = String(rt.params['from'] ?? '').trim();
    const label = makeGlyphs(`${from || 'メッセージ'} · 今`, { family, weight: 600, size: Math.round(size * 0.55) }, '#6C6C70');
    placeRow(label, -cw / 2 + size * 1.7 + rowWidth(label) / 2, -size * 0.72);
    const style: GlyphStyle = { family, weight: 700, size: b.size };
    const rows = b.rows.map((r) => makeGlyphs(r, style, '#1C1C1E'));
    rows.forEach((gs, i) => placeRow(gs, -cw / 2 + size * 0.85 + rowWidth(gs) / 2, -head - b.size * 0.75 - i * b.size * 1.32));
    const glyphs: Glyph[] = rows.flat();
    tagSource(glyphs, rt.cue.text);
    [...label, ...glyphs].forEach((g, i) => ((g.index = i), group.add(g.mesh)));
    // later cards push this one down by their heights
    const heights = (rt.laterText ?? []).map((x) => bubbleOf(x, family, size, W * 0.5).h + head + 18);
    const drop = (t: number) => (rt.later ?? []).reduce((s, a, k) => s + easeOutCubic((t - a) / 0.25) * (heights[k] ?? ch + 18), 0);
    const goneFrom = (() => {
      let d = 0;
      for (const [k, a] of (rt.later ?? []).entries()) {
        d += heights[k] ?? ch + 18;
        if (CARD_TOP - d - ch < CARD_FADE) return a;
      }
      return Infinity;
    })();
    return {
      group,
      update(t: number) {
        // slides down from above the top of the screen in 0.25 s
        const k = clamp01((t - rt.showFrom) / 0.25);
        const y = CARD_TOP + (1 - easeOutCubic(k)) * 120 - drop(t);
        group.position.set(0, y, 0);
        const fade = clamp01((y - ch - CARD_FADE) / (H * 0.1));
        const leave = clamp01(1 - (t - rt.exitAt) / Math.max(0.08, rt.exitDur));
        const a = (t >= rt.showFrom ? easeOutCubic(k) : 0) * fade * leave;
        card.material.opacity = a;
        icon.material.opacity = a;
        [...label, ...glyphs].forEach((g) => {
          g.mesh.position.set(g.x, g.y, 0);
          g.mesh.material.opacity = a;
        });
      },
      readable: () => [rt.showFrom + 0.25, Math.min(rt.exitAt + rt.exitDur * 0.5, goneFrom)],
    };
  },
};

/** A round send button with an up arrow, as a texture. */
function sendButton(d: number, accent: string) {
  const c = new OffscreenCanvas(Math.ceil(d), Math.ceil(d));
  const g = c.getContext('2d')!;
  g.fillStyle = accent;
  g.beginPath();
  g.arc(d / 2, d / 2, d / 2, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#FFFFFF';
  g.lineWidth = d * 0.1;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(d / 2, d * 0.74);
  g.lineTo(d / 2, d * 0.28);
  g.moveTo(d * 0.32, d * 0.45);
  g.lineTo(d / 2, d * 0.28);
  g.lineTo(d * 0.68, d * 0.45);
  g.stroke();
  const tex = new THREE.CanvasTexture(c as unknown as HTMLCanvasElement);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(d, d), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
}

export const input: TemplateRenderer = {
  cue(rt: CueRuntime): CueLayer {
    const family = rt.fonts.body;
    const size = Number(rt.params['size'] ?? 76);
    const b = bubbleOf(rt.cue.text, family, size, W * 0.7);
    const fw = Math.max(W * 0.5, b.w + size * 1.6);
    const fh = b.h + size * 0.4;
    const y0 = -H * 0.18;
    const group = new THREE.Group();
    const field = plate(fw, fh, '#FFFFFF', undefined);
    field.renderOrder = -1;
    field.position.set(0, y0, 0);
    group.add(field);
    const style: GlyphStyle = { family, weight: 600, size: b.size };
    const rows = b.rows.map((r) => makeGlyphs(r, style, '#1C1C1E'));
    rows.forEach((gs, i) => placeRow(gs, -fw / 2 + size * 0.7 + rowWidth(gs) / 2, y0 + ((rows.length - 1) / 2 - i) * b.size * 1.32));
    const glyphs: Glyph[] = rows.flat();
    tagSource(glyphs, rt.cue.text);
    glyphs.forEach((g, i) => ((g.index = i), group.add(g.mesh)));
    const cursor = plate(6, size * 1.1, rt.palette.accent, undefined);
    group.add(cursor);
    // the send button at the field's right end: a round accent button with an arrow, so it reads as a message being
    // written, not a caption box
    const btn = sendButton(size * 1.15, rt.palette.accent);
    btn.position.set(fw / 2 + size * 0.95, y0, 0);
    group.add(btn);
    const n = glyphs.length;
    // typed with the voice: each character when it is sung, where the aligner timed the characters; else at the
    // steady reveal every template uses (the line is whole within its first quarter)
    const voice = rt.cue.charTimed && rt.cue.charStarts?.length === [...rt.cue.text].length ? rt.cue.charStarts : undefined;
    // the whole line must still be up long enough to read (the render check's bar: characters / 12 + 1 s): a slow
    // voice is followed proportionally, squeezed to finish by then
    const latest = Math.max(rt.showFrom + 0.2, rt.exitAt - (n / 12 + 1));
    const sungEnd = voice ? Math.max(...voice) : 0;
    const squeeze = voice && sungEnd > latest ? (latest - rt.showFrom) / Math.max(0.01, sungEnd - rt.showFrom) : 1;
    const typedAt = (i: number) => {
      const src = glyphs[i]?.src;
      if (!voice || src === undefined || voice[src] === undefined) return revealAt(rt, i / Math.max(1, n - 1));
      return rt.showFrom + Math.max(0, voice[src] - rt.showFrom) * squeeze;
    };
    // after the line: sent (lifts away), deleted (backspaced), or held (left in the field unsent, the cursor blinking)
    const after = rt.params['after'] === 'delete' ? 'delete' : rt.params['after'] === 'hold' ? 'hold' : 'send';
    const send = after === 'send';
    return {
      group,
      update(t: number) {
        const shown = glyphs.filter((_, i) => t >= typedAt(i)).length;
        // the exit: sent (the whole field lifts away) or deleted backwards, a character at a time
        const out = clamp01((t - rt.exitAt) / Math.max(0.08, rt.exitDur));
        const kept = after === 'delete' ? Math.round(shown * (1 - out)) : shown;
        const a = (t >= rt.showFrom ? clamp01((t - rt.showFrom) / 0.12) : 0) * (after === 'delete' ? 1 : 1 - out);
        group.position.set(0, send ? easeOutCubic(out) * H * 0.35 : 0, 0);
        field.material.opacity = a;
        // the button lights when the line is typed out, and dims again as it is deleted
        btn.material.opacity = a * (kept >= n ? 1 : 0.35);
        glyphs.forEach((g, i) => {
          g.mesh.position.set(g.x, g.y, 0);
          g.mesh.material.opacity = i < kept ? a : 0;
        });
        // the cursor after the last typed character, blinking
        const last = glyphs[Math.max(0, kept - 1)];
        const cx = kept ? last.x + last.advance / 2 + 8 : -fw / 2 + size * 0.7;
        cursor.position.set(cx, last ? last.y : y0, 0);
        cursor.material.opacity = a * (Math.floor(t / 0.5) % 2 === 0 ? 1 : 0.15);
      },
      readable: () => [typedAt(n - 1), rt.exitAt],
    };
  },
};
