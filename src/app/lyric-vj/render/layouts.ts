// Five layouts from the database's designer VJs that the library lacked:
// stack   — a build-up: each line lands big while the earlier ones are pushed up and back, piling toward a full frame
//           until the shot ends and everything clears at once (the drop)
// array   — a repeated word or call ("哼哼哈兮", "いつまでも") tiled across the frame in rows sliding opposite ways,
//           the sung line big and clear on top
// couplet — two parallel lines facing each other: the first set right-aligned on the left, the second left-aligned
//           on the right, a rule between them; the first stays up while the second is sung
// quote   — a line as spoken dialogue: big corner brackets drawn first, the words typed in between
// orbit   — the line set along an arc that slowly turns, characters following the curve
import * as THREE from 'three';
import { chunks, balancedRows } from '../phrases';
import { keywordRange } from './punch';
import { advanceOf, clamp01, easeOutBack, easeOutCubic, Glyph, GlyphStyle, makeGlyphs, placeRow, rowWidth, sizeCap } from './glyphs';
import { accentPulse, color, CueLayer, CueRuntime, emphasisOf, FrameFx, glyphMotion, readable, revealAt, settledAt, tagSource, TemplateRenderer } from './runtime';

const W = 1920;
const H = 1080;

/** Font size that sets the widest of rows at `share` of the frame width, within [lo, hi]. */
function fit(rows: string[], family: string, share: number, lo: number, hi: number) {
  const probe: GlyphStyle = { family, weight: 900, size: 100 };
  const widest = Math.max(1, ...rows.map((r) => [...r].reduce((w, c) => w + advanceOf(c, probe), 0)));
  return Math.round(Math.max(lo, Math.min(hi * sizeCap, (100 * share * W) / widest)));
}

/** Colours the emphasised glyphs (colour / glow) in the accent, the way every template does. */
function tint(rt: CueRuntime, glyphs: Glyph[]) {
  const accent = readable(rt.palette.accent, rt.palette.background, 7);
  for (const g of glyphs) {
    const m = g.src !== undefined ? emphasisOf(rt, g.src) : undefined;
    if (m === 'color' || m === 'glow') g.mesh.material.color = color(accent, m === 'glow' ? 1.1 : 1);
  }
}

/** How far through a short ease the k-th later arrival is at t (0 before it, 1 well after). */
const arrivals = (rt: CueRuntime, t: number, sec = 0.4) => (rt.later ?? []).reduce((s, a) => s + easeOutCubic((t - a) / sec), 0);

// ---------------------------------------------------------------------------------------------------------- stack
export const stack: TemplateRenderer = {
  persist: 'shot',
  cue(rt: CueRuntime): CueLayer {
    const text = rt.cue.text.replace(/[\s　]+/g, ' ').trim();
    const rows = [...text].length > 10 ? chunks(text, 2) : [text];
    const size = fit(rows, rt.fonts.display, 0.62, 96, 210);
    const style: GlyphStyle = { family: rt.fonts.display, weight: 900, size, shadow: true };
    const group = new THREE.Group();
    const lineH = size * 1.18;
    const rowGlyphs = rows.map((r) => makeGlyphs(r, style, color(rt.palette.text)));
    // lines land a little off-axis, alternating, so the pile reads as stacked, not as a list
    const k = rt.order ?? 0;
    const x0 = (k % 2 ? 1 : -1) * W * 0.06;
    rowGlyphs.forEach((gs, i) => placeRow(gs, x0, ((rows.length - 1) / 2 - i) * lineH - H * 0.12));
    const glyphs = rowGlyphs.flat();
    tagSource(glyphs, rt.cue.text);
    glyphs.forEach((g, i) => ((g.index = i), group.add(g.mesh)));
    tint(rt, glyphs);
    const blockH = rows.length * lineH;
    const tilt = (k % 2 ? 1 : -1) * 0.025;
    return {
      group,
      update(t: number) {
        const n = arrivals(rt, t);
        // pair (a fast song's stack, compose.ts stackRushed): only the line before stays, small in the upper part of
        // the frame, and goes as the next one lands; lines of any height never pile into each other
        const pair = !!rt.params['pair'];
        // each later line pushes this one up by its own height and back (smaller, dimmer)
        const scale = pair ? 1 - 0.3 * Math.min(1, n) : Math.pow(0.7, n);
        const lift = pair ? Math.min(1, n) * H * 0.4 : n * blockH * 0.78;
        // the line before stays at full strength, only smaller: dimmed it mixed into mid-tone grounds and could not be read
        const dim = pair ? (n <= 1 ? 1 : clamp01(2 - n)) : n > 0 ? Math.max(0.28, 1 - 0.32 * n) : 1;
        // pushed off the top of the frame: gone
        const off = pair ? 0 : clamp01((-H * 0.12 + lift - H * 0.42) / (H * 0.12));
        group.position.set(0, lift, 0);
        group.rotation.z = tilt * Math.min(1, n);
        group.scale.setScalar(scale);
        glyphs.forEach((g) => {
          const m = glyphMotion(rt, g, glyphs.length, t, 0.03);
          g.mesh.position.set(g.x + m.dx, g.y + m.dy, 0);
          g.mesh.scale.setScalar(m.scale);
          g.mesh.rotation.z = m.rot;
          g.mesh.material.opacity = m.opacity * dim * (1 - off);
        });
      },
      // one later line leaves this one at 70 % size and two-thirds bright, still read; the second pushes it out
      readable: () => [settledAt(rt, glyphs.length, 0.03), Math.min(rt.exitAt, rt.later?.[1] ?? Infinity)],
    };
  },
};

// ---------------------------------------------------------------------------------------------------------- array
export const array: TemplateRenderer = {
  cue(rt: CueRuntime): CueLayer {
    const p = rt.params;
    const text = rt.cue.text.replace(/[\s　]+/g, ' ').trim();
    const group = new THREE.Group();
    // the tiled word: the emphasised words, else the line's longest phrase, else the line
    const [k0, k1] = keywordRange(text, rt);
    const word = [...text].slice(k0, k1).join('').trim() || text;
    const rowsN = Math.round((p['rows'] as number) ?? 7);
    const tileSize = Math.round(Math.min(150, (H / rowsN) * 0.62));
    const tileStyle: GlyphStyle = { family: rt.fonts.display, weight: 900, size: tileSize };
    const decor = new THREE.Group();
    decor.userData['decor'] = true;
    group.add(decor);
    const tileColor = color(readable(rt.palette.accent, rt.palette.background, 3));
    const unit = `${word}　`;
    const unitW = [...unit].reduce((w, c) => w + advanceOf(c, tileStyle), 0) || 1;
    const per = Math.ceil((W * 1.6) / unitW) + 1;
    const rows: { g: THREE.Group; glyphs: Glyph[]; dir: number; y: number; w: number }[] = [];
    for (let r = 0; r < rowsN; r++) {
      const glyphs = makeGlyphs(unit.repeat(per), tileStyle, tileColor);
      placeRow(glyphs, 0, 0);
      const g = new THREE.Group();
      glyphs.forEach((x) => (x.mesh.position.set(x.x, x.y, 0), g.add(x.mesh)));
      const y = (rowsN / 2 - r - 0.5) * (H / rowsN);
      decor.add(g);
      rows.push({ g, glyphs, dir: r % 2 ? 1 : -1, y, w: unitW });
    }
    // the sung line, big and clear over the tiles
    const lines = [...text].length > 12 ? chunks(text, 2) : [text];
    const size = fit(lines, rt.fonts.display, 0.7, 110, 260);
    const style: GlyphStyle = { family: rt.fonts.display, weight: 900, size, shadow: true };
    const lineGlyphs = lines.map((l) => makeGlyphs(l, style, color(rt.palette.text)));
    lineGlyphs.forEach((gs, i) => placeRow(gs, 0, ((lines.length - 1) / 2 - i) * size * 1.15));
    const glyphs = lineGlyphs.flat();
    tagSource(glyphs, rt.cue.text);
    glyphs.forEach((g, i) => ((g.index = i), group.add(g.mesh)));
    tint(rt, glyphs);
    const speed = (p['speed'] as number) ?? 90;
    return {
      group,
      update(t: number, fx: FrameFx) {
        const pulse = accentPulse(t, rt.accentTimes);
        const since = t - rt.showFrom;
        const out = clamp01((t - rt.exitAt) / Math.max(0.08, rt.exitDur));
        rows.forEach((row, r) => {
          // rows sweep in one after another, then slide forever, alternate rows the other way
          const inn = easeOutCubic((since - r * 0.04) / 0.35);
          const x = ((row.dir * speed * since) % row.w) - row.dir * (1 - inn) * W * 0.3;
          row.g.position.set(x, row.y, 0);
          for (const g of row.glyphs) g.mesh.material.opacity = (0.16 + 0.22 * pulse) * inn * (1 - out);
        });
        glyphs.forEach((g) => {
          const m = glyphMotion(rt, g, glyphs.length, t, 0.03);
          g.mesh.position.set(g.x + m.dx, g.y + m.dy, 0);
          g.mesh.scale.setScalar(m.scale * (1 + 0.05 * pulse));
          g.mesh.rotation.z = m.rot;
          g.mesh.material.opacity = m.opacity;
        });
        fx.hit = Math.max(fx.hit, 0.35 * pulse);
      },
      readable: () => [settledAt(rt, glyphs.length, 0.03), rt.exitAt],
    };
  },
};

// -------------------------------------------------------------------------------------------------------- couplet
export const couplet: TemplateRenderer = {
  persist: 'next',
  cue(rt: CueRuntime): CueLayer {
    const text = rt.cue.text.replace(/[\s　]+/g, ' ').trim();
    // two lines sung back to back reach a template as one line with a break: they are the couplet's two halves
    // a long line on its own (a rap verse) is its own couplet: it is split evenly into the two halves (set on one side
    // of the gutter, 50 characters were shrunk to fit half the frame)
    const cut = rt.style.rows?.[0] ?? ([...text.replace(/ /g, '')].length > 20 ? [...rt.cue.text.trimEnd()].length - [...(balancedRows(rt.cue.text, 2)[1] ?? '')].length : undefined);
    const merged = cut !== undefined && cut > 0 && cut < [...rt.cue.text].length;
    const halves = merged ? [[...rt.cue.text].slice(0, cut).join('').trim(), [...rt.cue.text].slice(cut).join('').trim()] : [text];
    const firstHalf = (rt.order ?? 0) % 2 === 0;
    const group = new THREE.Group();
    const gutter = 70;
    // each half in as many even rows as it needs (a 25-character rap half in two rows was set too small to read)
    const rowsOf = (h: string) => ([...h].length > 18 ? balancedRows(h, 3) : [...h].length > 9 ? balancedRows(h, 2) : [h]);
    const size = fit(halves.flatMap(rowsOf), rt.fonts.display, 0.4, 96, 170);
    const style: GlyphStyle = { family: rt.fonts.display, weight: 900, size, shadow: true };
    const lineH = size * 1.2;
    // a half: the first hugs the centre from the left and sits higher, the second answers from the right, lower
    const parts = halves.map((h, k) => {
      const second = merged ? k === 1 : !firstHalf;
      const rows = rowsOf(h);
      const rowGlyphs = rows.map((r) => makeGlyphs(r, style, color(rt.palette.text)));
      rowGlyphs.forEach((gs, i) => {
        const w = rowWidth(gs);
        const y = (second ? -1 : 1) * size * 0.6 + ((rows.length - 1) / 2 - i) * lineH * (second ? 1 : 1) + (second ? -1 : 1) * ((rows.length - 1) / 2) * lineH;
        placeRow(gs, second ? gutter + w / 2 : -gutter - w / 2, y);
      });
      return { second, glyphs: rowGlyphs.flat(), rows: rows.length };
    });
    const glyphs = parts.flatMap((p) => p.glyphs);
    tagSource(glyphs, rt.cue.text);
    glyphs.forEach((g, i) => ((g.index = i), group.add(g.mesh)));
    tint(rt, glyphs);
    // the rule between the halves, drawn with the first one
    const rule = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: color(rt.palette.accent), transparent: true, depthTest: false, depthWrite: false }));
    if (merged || firstHalf) group.add(rule);
    const ruleH = lineH * Math.max(...parts.map((p) => p.rows)) * 2 + size * 1.4;
    const enterRt: CueRuntime = { ...rt, style: { ...rt.style, enter: rt.style.enter === 'cut' ? 'cut' : 'wipe' } };
    // in a merged pair the answer is sung where its first character is (its share of the line's time)
    const answerAt = merged ? rt.showFrom + (cut! / [...rt.cue.text].length) * (rt.cue.end - rt.cue.start) : Infinity;
    const answerRt: CueRuntime = { ...enterRt, showFrom: answerAt };
    const owner = new Map(parts.flatMap((p) => p.glyphs.map((g) => [g, p.second] as const)));
    return {
      group,
      update(t: number) {
        // once the answer arrives, the first half steps back
        const answered = easeOutCubic((t - Math.min(answerAt, rt.later?.[0] ?? Infinity)) / 0.4);
        glyphs.forEach((g) => {
          const second = owner.get(g)!;
          const m = glyphMotion(merged && second ? answerRt : enterRt, g, glyphs.length, t, 0.035);
          // mirrored entrances: each half slides in from its own side
          g.mesh.position.set(g.x + (second ? -m.dx : m.dx), g.y + m.dy, 0);
          g.mesh.scale.setScalar(m.scale);
          g.mesh.rotation.z = m.rot;
          g.mesh.material.opacity = m.opacity * (second ? 1 : 1 - 0.45 * answered);
        });
        const draw = easeOutCubic((t - rt.showFrom) / 0.5);
        const out = clamp01((t - rt.exitAt) / Math.max(0.08, rt.exitDur));
        rule.scale.set(3, Math.max(0.001, ruleH * draw), 1);
        rule.material.opacity = 0.85 * (1 - out);
      },
      readable: () => [Math.max(settledAt(enterRt, glyphs.length, 0.035), merged ? settledAt(answerRt, 1, 0.035) : 0), rt.exitAt],
    };
  },
};

// ---------------------------------------------------------------------------------------------------------- quote
export const quote: TemplateRenderer = {
  cue(rt: CueRuntime): CueLayer {
    const text = rt.cue.text.replace(/[\s　]+/g, ' ').trim().replace(/^[「『“"]|[」』”"]$/g, '');
    const latin = !/[぀-ヿ一-鿿]/.test(text);
    const rows = [...text].length > 11 ? chunks(text, 2) : [text];
    const size = fit(rows, rt.fonts.body, 0.6, 90, 170);
    const style: GlyphStyle = { family: rt.fonts.body, weight: 900, size, shadow: true };
    const group = new THREE.Group();
    const lineH = size * 1.3;
    const rowGlyphs = rows.map((r) => makeGlyphs(r, style, color(rt.palette.text)));
    const blockW = Math.max(...rowGlyphs.map((g) => rowWidth(g)));
    const left = -blockW / 2;
    // left-aligned like a line of dialogue
    rowGlyphs.forEach((gs, i) => placeRow(gs, left + rowWidth(gs) / 2 + i * size * 0.5, ((rows.length - 1) / 2 - i) * lineH));
    const glyphs = rowGlyphs.flat();
    tagSource(glyphs, rt.cue.text);
    glyphs.forEach((g, i) => ((g.index = i), group.add(g.mesh)));
    tint(rt, glyphs);
    // the brackets: big, in the accent, at the block's corners
    const [o, c] = latin ? ['“', '”'] : ['「', '」'];
    const markStyle: GlyphStyle = { family: rt.fonts.display, weight: 900, size: Math.round(size * 2.1) };
    const accent = color(readable(rt.palette.accent, rt.palette.background, 3));
    const open = makeGlyphs(o, markStyle, accent)[0];
    const close = makeGlyphs(c, markStyle, accent)[0];
    const top = ((rows.length - 1) / 2) * lineH;
    const bottom = -top;
    const lastW = rowWidth(rowGlyphs[rowGlyphs.length - 1]) + (rows.length - 1) * size * 0.5;
    open.x = left - size * 0.55;
    open.y = top + size * 0.55;
    close.x = left + lastW + size * 0.55;
    close.y = bottom - size * 0.55;
    group.add(open.mesh, close.mesh);
    // typed: a steady character rate over the first part of the line, after the opening bracket lands — unless readFix
    // landed the line at once (rushed): then the typing would eat the reading time it was given (sweet timer's five
    // short-read lines were all quotes typed over their read-cut), so the whole line is up with the bracket
    const typed: CueRuntime = rt.rushed ? rt : { ...rt, style: { ...rt.style, reveal: 'word', enter: rt.style.enter === 'ink' ? 'ink' : 'fade' }, showFrom: rt.showFrom + 0.15 * rt.pace };
    return {
      group,
      update(t: number) {
        const out = clamp01((t - rt.exitAt) / Math.max(0.08, rt.exitDur));
        const po = easeOutBack((t - rt.showFrom) / 0.3);
        open.mesh.position.set(open.x, open.y, 0);
        open.mesh.scale.setScalar(Math.max(0.001, po));
        open.mesh.material.opacity = clamp01((t - rt.showFrom) * 5) * (1 - out);
        // the closing bracket lands when the typing is done
        const done = revealAt(typed, 1) + 0.1;
        const pc = easeOutBack((t - done) / 0.3);
        close.mesh.position.set(close.x, close.y, 0);
        close.mesh.scale.setScalar(Math.max(0.001, pc));
        close.mesh.material.opacity = clamp01((t - done) * 5) * (1 - out);
        glyphs.forEach((g) => {
          const m = glyphMotion(typed, g, glyphs.length, t, 0.03);
          g.mesh.position.set(g.x + m.dx, g.y + m.dy, 0);
          g.mesh.scale.setScalar(m.scale);
          g.mesh.rotation.z = m.rot;
          g.mesh.material.opacity = m.opacity;
        });
      },
      readable: () => [settledAt(typed, glyphs.length, 0.03), rt.exitAt],
    };
  },
};

// ---------------------------------------------------------------------------------------------------------- orbit
export const orbit: TemplateRenderer = {
  cue(rt: CueRuntime): CueLayer {
    const p = rt.params;
    const text = rt.cue.text.replace(/[\s　]+/g, ' ').trim();
    const size = [...text].length > 12 ? 124 : 156;
    const style: GlyphStyle = { family: rt.fonts.display, weight: 900, size, shadow: true };
    const glyphs = makeGlyphs(text, style, color(rt.palette.text));
    tagSource(glyphs, rt.cue.text);
    const arcLen = rowWidth(glyphs, size * 0.06);
    // the arc spans at most 150° so no character tips past readable; a long line gets a bigger circle
    const sweep = Math.min((150 * Math.PI) / 180, arcLen / 380);
    const R = arcLen / sweep;
    const cy = -R + H * 0.1 + size * 0.5; // the top of the circle sits a little above centre
    const group = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(R - size * 0.72, R - size * 0.7, 160), new THREE.MeshBasicMaterial({ color: color(rt.palette.accent), transparent: true, depthTest: false, depthWrite: false }));
    ring.position.set(0, cy, 0);
    ring.userData['decor'] = true; // the circle runs past the frame on purpose: not part of the lyric's box
    group.add(ring);
    // each glyph's angle along the arc, reading left to right over the top
    let s = -arcLen / 2;
    const angles = glyphs.map((g) => {
      const a = (s + g.advance / 2) / R;
      s += g.advance + size * 0.06;
      return a;
    });
    glyphs.forEach((g, i) => ((g.index = i), group.add(g.mesh)));
    tint(rt, glyphs);
    const dir = p['direction'] === 'ccw' ? -1 : 1;
    return {
      group,
      update(t: number) {
        const since = t - rt.showFrom;
        const out = clamp01((t - rt.exitAt) / Math.max(0.08, rt.exitDur));
        // the whole ring turns slowly while the line is up (about 8° over a long line)
        const turn = dir * 0.035 * since;
        ring.material.opacity = 0.3 * easeOutCubic(since / 0.6) * (1 - out);
        ring.rotation.z = turn;
        glyphs.forEach((g, i) => {
          const m = glyphMotion(rt, g, glyphs.length, t, 0.035);
          // characters slide in along the curve from behind
          const a = angles[i] - turn + dir * (m.dx / R) * 4;
          g.mesh.position.set(Math.sin(a) * R, cy + Math.cos(a) * R + m.dy, 0);
          g.mesh.rotation.z = -a + m.rot;
          g.mesh.scale.setScalar(m.scale);
          g.mesh.material.opacity = m.opacity;
        });
      },
      readable: () => [settledAt(rt, glyphs.length, 0.035), rt.exitAt],
    };
  },
};

// --------------------------------------------------------------------------------------------------------- ribbon
/** The x on a sampled curve where its arc length reaches s (table of cumulative lengths, linear between samples). */
export function atLength(xs: number[], ls: number[], s: number) {
  let i = 1;
  while (i < ls.length - 1 && ls[i] < s) i++;
  const k = (s - ls[i - 1]) / Math.max(1e-6, ls[i] - ls[i - 1]);
  return xs[i - 1] + (xs[i] - xs[i - 1]) * k;
}

/**
 * The line rides a slow travelling wave across the frame like a ribbon in the wind: every character sits on the
 * curve and turns with it, a thin band in the accent runs under the words. A long line takes two ribbons.
 */
export const ribbon: TemplateRenderer = {
  cue(rt: CueRuntime): CueLayer {
    const p = rt.params;
    const text = rt.cue.text.replace(/[\s　]+/g, ' ').trim();
    const rows = [...text].length > 16 ? chunks(text, 2) : [text];
    const size = fit(rows, rt.fonts.display, 0.7, 72, 150);
    const style: GlyphStyle = { family: rt.fonts.display, weight: 900, size, shadow: true };
    const group = new THREE.Group();
    const rowGlyphs = rows.map((r) => makeGlyphs(r, style, color(rt.palette.text)));
    const glyphs = rowGlyphs.flat();
    tagSource(glyphs, rt.cue.text);
    glyphs.forEach((g, i) => ((g.index = i), group.add(g.mesh)));
    tint(rt, glyphs);
    const flow = p['flow'] === 'left' ? -1 : 1;
    const A = size * 0.5;
    const lambda = W * 0.85;
    const SEG = 120;
    const x0 = -W * 0.46;
    const x1 = W * 0.46;
    // the band: a strip of quads along the curve, rebuilt each frame
    const bands = rows.map(() => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((SEG + 1) * 2 * 3), 3));
      geo.setIndex(Array.from({ length: SEG }, (_, i) => [i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2]).flat());
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: color(readable(rt.palette.accent, rt.palette.background, 3)), transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
      m.renderOrder = -1;
      m.userData['decor'] = true;
      group.add(m);
      return m;
    });
    const rowY = (r: number) => ((rows.length - 1) / 2 - r) * size * 1.9 - (rows.length > 1 ? 0 : H * 0.02);
    return {
      group,
      update(t: number) {
        const since = t - rt.showFrom;
        const out = clamp01((t - rt.exitAt) / Math.max(0.08, rt.exitDur));
        rowGlyphs.forEach((gs, r) => {
          const phase = flow * since * 1.1 + r * 1.3;
          const y = (x: number) => rowY(r) + A * Math.sin((2 * Math.PI * x) / lambda - phase);
          const xs: number[] = [];
          const ls: number[] = [];
          for (let i = 0; i <= SEG; i++) {
            const x = x0 + ((x1 - x0) * i) / SEG;
            xs.push(x);
            ls.push(i ? ls[i - 1] + Math.hypot(x - xs[i - 1], y(x) - y(xs[i - 1])) : 0);
          }
          const total = ls[SEG];
          // the band draws itself along the curve as the line comes in, under the baseline
          const pos = bands[r].geometry.getAttribute('position') as THREE.BufferAttribute;
          const grow = easeOutCubic(since / 0.7);
          const half = size * 0.05;
          for (let i = 0; i <= SEG; i++) {
            const x = x0 + (xs[i] - x0) * grow;
            const yy = y(x) - size * 0.58;
            pos.setXYZ(i * 2, x, yy - half, 0);
            pos.setXYZ(i * 2 + 1, x, yy + half, 0);
          }
          pos.needsUpdate = true;
          bands[r].material.opacity = 0.55 * (1 - out);
          const width = rowWidth(gs, size * 0.04);
          let s = (total - width) / 2;
          gs.forEach((g) => {
            const m = glyphMotion(rt, g, glyphs.length, t, 0.035);
            // characters slide in along the curve from the side the wave flows from
            const at = Math.min(total, Math.max(0, s + g.advance / 2 + flow * m.dx * 4));
            const x = atLength(xs, ls, at);
            const slope = (y(x + 1) - y(x - 1)) / 2;
            g.mesh.position.set(x, y(x) + m.dy, 0);
            g.mesh.rotation.z = Math.atan(slope) + m.rot;
            g.mesh.scale.setScalar(m.scale);
            g.mesh.material.opacity = m.opacity;
            s += g.advance + size * 0.04;
          });
        });
      },
      readable: () => [settledAt(rt, glyphs.length, 0.035), rt.exitAt],
    };
  },
};

// --------------------------------------------------------------------------------------------------------- tunnel
/** A point at distance s along a centred rectangle's edge (clockwise from the top-left corner) and its text angle. */
export function rectEdge(s: number, hw: number, hh: number): [number, number, number] {
  const L = 4 * (hw + hh);
  s = ((s % L) + L) % L;
  if (s < 2 * hw) return [-hw + s, hh, 0];
  s -= 2 * hw;
  if (s < 2 * hh) return [hw, hh - s, -Math.PI / 2];
  s -= 2 * hh;
  if (s < 2 * hw) return [hw - s, -hh, Math.PI];
  s -= 2 * hw;
  return [-hw, -hh + s, Math.PI / 2];
}

/**
 * The line's key word repeated on the four walls of a tunnel that rushes toward the camera (rings of text growing
 * out of the centre and passing the frame), the sung line big and clear in front.
 */
export const tunnel: TemplateRenderer = {
  cue(rt: CueRuntime): CueLayer {
    const p = rt.params;
    const text = rt.cue.text.replace(/[\s　]+/g, ' ').trim();
    const group = new THREE.Group();
    const [k0, k1] = keywordRange(text, rt);
    const word = [...text].slice(k0, k1).join('').trim() || text;
    const unit = `${word}　`;
    const TILE = 72;
    const GROW = 1.6; // a ring at depth z draws its glyphs at TILE × GROW × z
    const tileStyle: GlyphStyle = { family: rt.fonts.display, weight: 900, size: TILE };
    const unitW = [...unit].reduce((w, c) => w + advanceOf(c, tileStyle), 0) || 1;
    // one ring's worth of the word at depth 1 (perimeter of the frame-sized rectangle)
    const per = Math.max(1, Math.floor((2 * (W + H)) / (unitW * GROW)));
    const tileColor = color(readable(rt.palette.accent, rt.palette.background, 3));
    const decor = new THREE.Group();
    decor.userData['decor'] = true;
    group.add(decor);
    const N = 5;
    const rings = Array.from({ length: N }, () => {
      const gs = makeGlyphs(unit.repeat(per), tileStyle, tileColor);
      const g = new THREE.Group();
      gs.forEach((x) => g.add(x.mesh));
      decor.add(g);
      const ws = gs.map((x) => x.advance);
      const total = ws.reduce((a, b) => a + b, 0);
      return { g, gs, ws, total };
    });
    const lines = [...text].length > 12 ? chunks(text, 2) : [text];
    const size = fit(lines, rt.fonts.display, 0.62, 100, 230);
    const style: GlyphStyle = { family: rt.fonts.display, weight: 900, size, shadow: true };
    const lineGlyphs = lines.map((l) => makeGlyphs(l, style, color(rt.palette.text)));
    lineGlyphs.forEach((gs, i) => placeRow(gs, 0, ((lines.length - 1) / 2 - i) * size * 1.15));
    const glyphs = lineGlyphs.flat();
    tagSource(glyphs, rt.cue.text);
    glyphs.forEach((g, i) => ((g.index = i), group.add(g.mesh)));
    tint(rt, glyphs);
    const speed = (p['speed'] as number) ?? 0.22;
    const dir = p['direction'] === 'in' ? -1 : 1;
    return {
      group,
      update(t: number, fx: FrameFx) {
        const pulse = accentPulse(t, rt.accentTimes);
        const since = t - rt.showFrom;
        const out = clamp01((t - rt.exitAt) / Math.max(0.08, rt.exitDur));
        const inn = easeOutCubic(since / 0.4);
        rings.forEach((ring, k) => {
          const u = (((k / N + dir * since * speed) % 1) + 1) % 1;
          const z = 0.05 * 32 ** u; // 0.05 deep in the centre → 1.6 past the frame
          // born faint in the depth, gone as it passes the camera
          const a = clamp01(u / 0.25) * clamp01((1.6 - z) / 0.5) * inn * (1 - out) * (0.22 + 0.16 * pulse);
          const sc = GROW * z;
          // the word runs along the inside of the walls: the rectangle is inset by half a glyph
          const hw = Math.max(1, (W / 2) * z - (TILE * sc) / 2);
          const hh = Math.max(1, (H / 2) * z - (TILE * sc) / 2);
          const scaleS = (4 * (hw + hh)) / ring.total;
          let s = 0;
          ring.gs.forEach((g, i) => {
            const [x, y, rot] = rectEdge((s + ring.ws[i] / 2) * scaleS, hw, hh);
            g.mesh.position.set(x, y, 0);
            g.mesh.rotation.z = rot;
            g.mesh.scale.setScalar(sc);
            g.mesh.material.opacity = a;
            s += ring.ws[i];
          });
          // nearer rings over farther ones
          ring.g.renderOrder = Math.round(z * 100) - 300;
          ring.g.traverse((o) => (o.renderOrder = ring.g.renderOrder));
        });
        glyphs.forEach((g) => {
          const m = glyphMotion(rt, g, glyphs.length, t, 0.03);
          g.mesh.position.set(g.x + m.dx, g.y + m.dy, 0);
          g.mesh.scale.setScalar(m.scale * (1 + 0.04 * pulse));
          g.mesh.rotation.z = m.rot;
          g.mesh.material.opacity = m.opacity;
        });
        fx.hit = Math.max(fx.hit, 0.3 * pulse);
      },
      readable: () => [settledAt(rt, glyphs.length, 0.03), rt.exitAt],
    };
  },
};
