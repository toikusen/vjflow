// frame-split: a thin frame (and corner brackets) draws itself at the start of the shot; the main row sits inside,
// remaining rows in small type outside the frame's lower right.
import * as THREE from 'three';
import { advanceOf, clamp01, easeOutBack, easeOutCubic, Glyph, GlyphStyle, makeGlyphs, placeRow, rowWidth } from './glyphs';
import { accentPulse, color, readable, CueLayer, CueRuntime, emphasisOf, FrameFx, glyphMotion, settledAt, ShotLayer, TemplateRenderer } from './runtime';
import { Palette, ParamValue, Shot } from '../treatment';

const W = 1920;
const H = 1080;
const STAGGER = 0.03;

export function frameBox(params: Record<string, ParamValue>) {
  const w = (params['frameWidth'] as number) * W;
  const h = (params['frameHeight'] as number) * H;
  // keep the frame, its brackets and the right-aligned sub rows inside a 90 px safe margin
  const room = Math.max(0, W / 2 - w / 2 - 90);
  const cx = { center: 0, left: -room, right: room }[params['align'] as string] ?? 0;
  return { w, h, cx: Math.sign(cx) * Math.min(Math.abs(cx), W * 0.16), cy: 40 + ((params['lift'] as number) ?? 0) };
}

/** Rows: explicit break indexes, else split at the first phrase space; spaces are dropped from the glyphs. */
export function splitRows(text: string, rows?: number[]): string[] {
  const chars = [...text];
  if (rows?.length) {
    const cuts = [0, ...rows, chars.length];
    return cuts.slice(1).map((c, i) => chars.slice(cuts[i], c).join('').trim()).filter(Boolean);
  }
  const parts = text.split(/[\s　]+/).filter(Boolean);
  // short lines (≤ 12 characters) stay on one row
  if (parts.join('').length <= 12) return [parts.join(' ')];
  return parts.length > 1 ? [parts[0], parts.slice(1).join(' ')] : parts;
}

const plane = (w: number, h: number, c: THREE.Color) =>
  new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: c, transparent: true, depthTest: false, depthWrite: false }));

export const frameSplit: TemplateRenderer = {
  shot(shot: Shot, params: Record<string, ParamValue>, palette: Palette): ShotLayer {
    const { w, h, cx, cy } = frameBox(params);
    const lw = params['lineWidth'] as number;
    const drawSec = params['drawSec'] as number;
    const group = new THREE.Group();
    const panel = plane(w, h, new THREE.Color('#000000'));
    panel.position.set(cx, cy, 0);
    group.add(panel);
    const lineColor = color(palette.line, 1.3);
    // top (→), right (↓), bottom (←), left (↑): each draws in a quarter of drawSec
    const sides = [
      { len: w, horiz: true, x0: cx - w / 2, y0: cy + h / 2, dir: 1 },
      { len: h, horiz: false, x0: cx + w / 2, y0: cy + h / 2, dir: -1 },
      { len: w, horiz: true, x0: cx + w / 2, y0: cy - h / 2, dir: -1 },
      { len: h, horiz: false, x0: cx - w / 2, y0: cy - h / 2, dir: 1 },
    ].map((s) => ({ ...s, mesh: plane(s.horiz ? s.len : lw, s.horiz ? lw : s.len, lineColor) }));
    sides.forEach((s) => group.add(s.mesh));
    const brackets: THREE.Mesh[] = [];
    if (params['brackets']) {
      const L = 44;
      const off = 16;
      for (const [sx, sy] of [[-1, 1], [1, 1], [1, -1], [-1, -1]]) {
        const bx = cx + sx * (w / 2 + off);
        const by = cy + sy * (h / 2 + off);
        const hBar = plane(L, lw * 2, lineColor);
        hBar.position.set(bx - (sx * L) / 2, by, 0);
        const vBar = plane(lw * 2, L, lineColor);
        vBar.position.set(bx, by - (sy * L) / 2, 0);
        const corner = new THREE.Group();
        corner.add(hBar, vBar);
        corner.userData = { bx, by };
        group.add(corner);
        brackets.push(corner as unknown as THREE.Mesh);
      }
    }
    const fadeOut = (t: number) => 1 - clamp01((t - (shot.end - 0.25)) / 0.25);
    return {
      group,
      update(t: number) {
        const k = fadeOut(t);
        (panel.material as THREE.MeshBasicMaterial).opacity = 0.22 * easeOutCubic((t - shot.start) / 0.4) * k;
        sides.forEach((s, i) => {
          const p = easeOutCubic((t - shot.start - (i * drawSec) / 4) / (drawSec / 4));
          const m = s.mesh;
          m.visible = p > 0;
          if (s.horiz) {
            m.scale.x = Math.max(1e-3, p);
            m.position.set(s.x0 + (s.dir * s.len * p) / 2, s.y0, 0);
          } else {
            m.scale.y = Math.max(1e-3, p);
            m.position.set(s.x0, s.y0 + (s.dir * s.len * p) / 2, 0);
          }
          (m.material as THREE.MeshBasicMaterial).opacity = k;
        });
        brackets.forEach((b, i) => {
          const p = easeOutBack((t - shot.start - drawSec - i * 0.04) / 0.25);
          b.visible = p > 0;
          b.scale.setScalar(Math.max(1e-3, p));
          b.position.set(b.userData['bx'] * (1 - b.scale.x), b.userData['by'] * (1 - b.scale.x), 0); // scale about the corner
          b.traverse((o) => ((o as THREE.Mesh).material ? (((o as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = k) : 0));
        });
      },
    };
  },

  cue(rt: CueRuntime): CueLayer {
    const { w, h, cx, cy } = frameBox(rt.params);
    const rows = splitRows(rt.cue.text, rt.style.rows);
    const group = new THREE.Group();
    const all = [...rt.cue.text];
    const indexIn = (row: string, j: number) => {
      // map a row character back to its index in the cue text, for emphasis lookups
      const start = all.join('').indexOf(row);
      return start < 0 ? -1 : [...all.join('').slice(0, start)].length + j;
    };
    // main row: fit inside the frame (88–168 px, sized for a live-house screen); overflow splits it in two
    let mainRows = [rows[0]];
    const fit = (text: string) => {
      const probe: GlyphStyle = { family: rt.fonts.body, weight: 900, size: 100 };
      const w100 = [...text].reduce((s, c) => s + advanceOf(c, probe), 0) || 1;
      return (100 * w * 0.86) / w100;
    };
    let size = Math.min(168, fit(rows[0]));
    if (size < 88) {
      const c = [...rows[0]];
      mainRows = [c.slice(0, Math.ceil(c.length / 2)).join(''), c.slice(Math.ceil(c.length / 2)).join('')];
      size = Math.max(88, Math.min(168, ...mainRows.map(fit)));
    }
    const style: GlyphStyle = { family: rt.fonts.body, weight: 900, size, shadow: true };
    const mainGlyphs: Glyph[] = [];
    mainRows.forEach((row, r) => {
      const gs = makeGlyphs(row, style, color(rt.palette.text, 1.05), 4);
      gs.forEach((g, j) => {
        const m = emphasisOf(rt, indexIn(row, j));
        if (m === 'color' || m === 'glow') g.mesh.material.color = color(readable(rt.palette.accent, rt.palette.background, 7), m === 'glow' ? 1.8 : 1.1);
        if (m === 'scale') g.mesh.userData['emph'] = 1.25;
      });
      placeRow(gs, cx, cy + ((mainRows.length - 1) / 2 - r) * size * 1.15, 4);
      mainGlyphs.push(...gs);
    });
    mainGlyphs.forEach((g, i) => (g.index = i));
    const subStyle: GlyphStyle = { family: rt.fonts.body, weight: 900, size: 92, shadow: true };
    const subGlyphs: Glyph[] = [];
    rows.slice(1).forEach((row, r) => {
      const gs = makeGlyphs(row, subStyle, color(rt.palette.text, 0.9), 6);
      const rw = rowWidth(gs, 6);
      placeRow(gs, cx + w / 2 - rw / 2, cy - h / 2 - 100 - r * 108, 6);
      subGlyphs.push(...gs);
    });
    subGlyphs.forEach((g, i) => (g.index = mainGlyphs.length + i));
    for (const g of [...mainGlyphs, ...subGlyphs]) group.add(g.mesh);
    const n = mainGlyphs.length + subGlyphs.length;

    return {
      group,
      update(t: number, _fx: FrameFx) {
        const pulse = accentPulse(t, rt.accentTimes);
        for (const g of [...mainGlyphs, ...subGlyphs]) {
          const m = glyphMotion(rt, g, n, t, STAGGER);
          const emph = (g.mesh.userData['emph'] as number) ?? 1;
          g.mesh.position.set(g.x + m.dx, g.y + m.dy, 0);
          g.mesh.scale.setScalar(m.scale * emph * (1 + 0.05 * pulse));
          g.mesh.rotation.z = m.rot;
          g.mesh.material.opacity = m.opacity;
        }
      },
      readable: () => [settledAt(rt, n, STAGGER), rt.exitAt],
    };
  },
};
