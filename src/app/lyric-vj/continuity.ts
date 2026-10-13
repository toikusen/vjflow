// Prop continuity in a drawing, measured from the sprite boxes the renderer logs (graphics.ts, --track): props that
// jump across the frame between two frames, pop in or out without an entrance, swell or shrink in a frame, sit on top
// of each other, or bob in place with nowhere to go. All of these read as broken or AI-made, and a reviewer looking
// at stills cannot see them — so the program measures them. Cuts (a new camera shot) are allowed to change anything.

export interface Box {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** globalAlpha the sprite was drawn with. */
  a: number;
}
export interface TrackFrame {
  t: number;
  shot: number;
  boxes: Box[];
}

/** Parses the renderer's "code layer: track <t> <shot> id:x,y,w,h,a;..." lines. */
export function parseTrack(log: string): TrackFrame[] {
  const out: TrackFrame[] = [];
  for (const line of log.split('\n')) {
    const m = /code layer: track (\S+) (\d+) ?(.*)$/.exec(line);
    if (!m) continue;
    const boxes = m[3]
      .split(';')
      .filter(Boolean)
      .map((b) => {
        const [id, rest] = b.split(':');
        const [x, y, w, h, a] = rest.split(',').map(Number);
        return { id, x, y, w, h, a };
      });
    out.push({ t: Number(m[1]), shot: Number(m[2]), boxes });
  }
  return out.sort((p, q) => p.t - q.t);
}

const cx = (b: Box) => b.x + b.w / 2;
const cy = (b: Box) => b.y + b.h / 2;
const area = (b: Box) => Math.max(1, b.w * b.h);
const overlap = (p: Box, q: Box) => Math.max(0, Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x)) * Math.max(0, Math.min(p.y + p.h, q.y + q.h) - Math.max(p.y, q.y));
/** The biggest copy of each sprite in a frame (a sprite may be drawn twice, e.g. a reflection). */
const byId = (f: TrackFrame) => {
  const m = new Map<string, Box>();
  for (const b of f.boxes) if (!m.has(b.id) || area(b) > area(m.get(b.id)!)) m.set(b.id, b);
  return m;
};

/** Continuity problems, in words for the director: hard ones (jumps, pops, overlaps) and bobbing (a hanging lantern may
 * swing on purpose: the director judges). Consecutive samples are frameSec apart. */
export function continuity(frames: TrackFrame[], frameSec = 1 / 30): { hard: string[]; bob: string[] } {
  const out = new Set<string>();
  const bob = new Set<string>();
  const at = (f: TrackFrame) => `${f.t.toFixed(2)} 秒（鏡頭 ${f.shot}）`;
  for (let i = 0; i + 1 < frames.length; i++) {
    const [f, g] = [frames[i], frames[i + 1]];
    if (g.t - f.t > frameSec * 1.6 || f.shot !== g.shot) continue;
    const [p, q] = [byId(f), byId(g)];
    for (const [id, b] of p) {
      const c = q.get(id);
      if (!c) {
        if (b.a >= 0.6) out.add(`${id} 在 ${at(f)} 一格之內直接消失（沒有退場動畫）`);
        continue;
      }
      const d = Math.hypot(cx(c) - cx(b), cy(c) - cy(b));
      if (d > Math.max(60, 0.3 * Math.max(b.w, b.h))) out.add(`${id} 在 ${at(f)} 一格之內瞬移了 ${Math.round(d)} 像素`);
      const r = area(c) / area(b);
      if (r > 1.6 || r < 0.6) out.add(`${id} 在 ${at(f)} 一格之內突然${r > 1 ? '變大' : '變小'}（${r.toFixed(1)} 倍）`);
    }
    for (const [id, c] of q) if (!p.has(id) && c.a >= 0.6) out.add(`${id} 在 ${at(g)} 一格之內突然出現（沒有進場動畫）`);
  }
  // props on top of each other: two different sprites covering much of the smaller one (boxes trimmed by a fifth on
  // every side: a sprite picture has clear margins around the object), once per pair and shot
  const trim = (b: Box): Box => ({ ...b, x: b.x + b.w * 0.2, y: b.y + b.h * 0.2, w: b.w * 0.6, h: b.h * 0.6 });
  const pairs = new Set<string>();
  for (const f of frames) {
    const list = [...byId(f).values()].map(trim);
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const [p, q] = [list[i], list[j]];
        const key = `${[p.id, q.id].sort().join('+')}@${f.shot}`;
        if (pairs.has(key) || overlap(p, q) <= 0.35 * Math.min(area(p), area(q)) || Math.min(p.a, q.a) <= 0.5) continue;
        pairs.add(key);
        out.add(`${p.id} 和 ${q.id} 在 ${at(f)} 疊在一起`);
      }
  }
  // bobbing in place: within a shot, a sprite that reverses direction again and again but ends where it started
  const shots = new Map<number, TrackFrame[]>();
  for (const f of frames) shots.set(f.shot, [...(shots.get(f.shot) ?? []), f]);
  for (const [shot, fs] of shots) {
    const ids = new Set(fs.flatMap((f) => f.boxes.map((b) => b.id)));
    for (const id of ids) {
      const path = fs.map((f) => byId(f).get(id)).filter((b): b is Box => !!b);
      if (path.length < 5) continue;
      const turns = (v: number[]) => v.slice(2).filter((_, k) => Math.sign(v[k + 1] - v[k]) * Math.sign(v[k + 2] - v[k + 1]) < 0).length;
      const xs = path.map(cx);
      const ys = path.map(cy);
      const range = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
      // where it is on average early in the shot versus late: near zero for a bob, large for a prop that travels
      const half = Math.floor(path.length / 2);
      const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / Math.max(1, v.length);
      const net = Math.hypot(mean(xs.slice(half)) - mean(xs.slice(0, half)), mean(ys.slice(half)) - mean(ys.slice(0, half)));
      if ((turns(xs) >= 2 || turns(ys) >= 2) && range > 4 && range < 70 && net < range * 0.6) bob.add(`${id} 在鏡頭 ${shot} 原地來回晃動、沒有要去哪裡（擺動 ${Math.round(range)} 像素）：靜止，或讓它真的移動、參與事件`);
    }
  }
  return { hard: [...out], bob: [...bob] };
}

/** Every continuity problem in one list (tests, reports). */
export const continuityProblems = (frames: TrackFrame[], frameSec = 1 / 30) => {
  const c = continuity(frames, frameSec);
  return [...c.hard, ...c.bob];
};
