import { Container, Graphics, Sprite, Texture, TilingSprite } from 'pixi.js';
import { CENTER_X, CENTER_Y, FrameContext } from '../../renderer/frame-context';
import { Rng } from '../../seeded-random';
import { BaseElement, ElementDef, ElementDeps } from '../element';

/** Filled triangular spikes radiating from the origin, like a manga focus burst. */
export function spikes(rng: Rng, count: number, inner: number, outer: number, color: number): Graphics {
  const g = new Graphics();
  const r = (min: number, max: number) => min + (max - min) * rng();
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + r(-0.05, 0.05);
    const w = r(0.02, 0.06);
    const len = outer * r(0.7, 1);
    g.poly([Math.cos(a - w) * inner, Math.sin(a - w) * inner, Math.cos(a) * len, Math.sin(a) * len, Math.cos(a + w) * inner, Math.sin(a + w) * inner]);
  }
  return g.fill({ color });
}

interface SpeedLine {
  sprite: Sprite;
  angle: number;
  radius: number;
  velocity: number;
}

/** Radial speed lines rushing outwards; denser and faster with energy. */
class SpeedLines extends BaseElement {
  private readonly lines: SpeedLine[] = [];

  constructor(deps: ElementDeps) {
    super(deps);
    for (let i = 0; i < this.num('count'); i++) {
      const sprite = new Sprite(Texture.WHITE);
      sprite.anchor.set(0, 0.5);
      sprite.tint = this.color(2);
      this.view.addChild(sprite);
      const line = { sprite, angle: 0, radius: 0, velocity: 0 };
      this.reset(line, true);
      this.lines.push(line);
    }
  }

  private reset(line: SpeedLine, scatter: boolean): void {
    line.angle = this.rand(0, Math.PI * 2);
    line.radius = scatter ? this.rand(150, 1200) : this.rand(150, 350);
    line.velocity = this.rand(900, 2200);
    line.sprite.width = this.rand(120, 520);
    line.sprite.height = this.rand(0.4, 1.5) * this.skin.lineWidth;
    line.sprite.rotation = line.angle;
  }

  update({ dt, energy }: FrameContext, strength: number): void {
    this.view.alpha = Math.max(0, Math.min(1, 0.25 + (energy - 0.15) * 1.8)) * strength;
    const boost = (0.4 + energy * 1.4) * this.deps.speed;
    for (const line of this.lines) {
      line.radius += line.velocity * boost * dt;
      if (line.radius > 1300) this.reset(line, false);
      line.sprite.position.set(CENTER_X + Math.cos(line.angle) * line.radius, CENTER_Y + Math.sin(line.angle) * line.radius);
    }
  }
}

interface Panel {
  view: Container;
  baseX: number;
  baseY: number;
  targetX: number;
  targetY: number;
  targetRot: number;
}

const PANEL_LAYOUTS = [
  [[40, 40, 1100, 560], [1180, 40, 700, 340], [1180, 420, 700, 620], [40, 640, 1100, 400]],
  [[40, 40, 600, 1000], [680, 40, 1200, 480], [680, 560, 560, 480], [1280, 560, 600, 480]],
  [[40, 40, 1840, 420], [40, 500, 900, 540], [980, 500, 900, 540]],
];

/** Manga page panels that jolt one at a time on the beat. */
class MangaPanels extends BaseElement {
  private readonly panels: Panel[] = [];
  private lastBeat = -1;

  constructor(deps: ElementDeps) {
    super(deps);
    const fills = [this.color(1), 0xffffff, this.color(0), this.color(2)];
    const border = this.skin.lineWidth * 2;
    PANEL_LAYOUTS[this.num('layout')].forEach(([x, y, w, h], i) => {
      const view = new Container();
      const dots = new TilingSprite({ texture: deps.textures.dots, width: w, height: h });
      dots.tint = 0x000000;
      dots.alpha = 0.18;
      dots.tileScale.set(0.5 + i * 0.15);
      const slash = spikes(deps.rng, 10, 20, Math.max(w, h), i % 2 ? this.color(1) : 0xffffff);
      slash.position.set(w / 2, h / 2);
      slash.alpha = 0.35;
      const mask = new Graphics().rect(0, 0, w, h).fill({ color: 0xffffff });
      slash.mask = mask;
      view.addChild(new Graphics().rect(0, 0, w, h).fill({ color: fills[i % fills.length] }), dots, slash, mask, new Graphics().rect(0, 0, w, h).stroke({ width: border, color: 0x000000 }));
      view.pivot.set(w / 2, h / 2);
      view.position.set(x + w / 2, y + h / 2);
      this.view.addChild(view);
      this.panels.push({ view, baseX: x + w / 2, baseY: y + h / 2, targetX: 0, targetY: 0, targetRot: 0 });
    });
  }

  update(ctx: FrameContext, strength: number): void {
    if (ctx.beatIndex !== this.lastBeat && ctx.beatIndex >= 0) {
      this.lastBeat = ctx.beatIndex;
      const p = this.panels[ctx.beatIndex % this.panels.length];
      p.targetX = this.rand(-50, 50) * ctx.intensity;
      p.targetY = this.rand(-30, 30) * ctx.intensity;
      p.targetRot = this.rand(-0.05, 0.05);
    }
    const k = 1 - Math.exp(-ctx.dt / 0.12);
    for (const p of this.panels) {
      p.view.x += (p.baseX + p.targetX - p.view.x) * k;
      p.view.y += (p.baseY + p.targetY - p.view.y) * k;
      p.view.rotation += (p.targetRot - p.view.rotation) * k;
    }
    this.view.alpha = strength;
  }
}

/** A big rotating focus burst behind everything else. */
class Sunburst extends BaseElement {
  private readonly burst: Graphics;

  constructor(deps: ElementDeps) {
    super(deps);
    this.burst = spikes(deps.rng, this.num('rays'), 180, 1300, this.color(2));
    this.burst.position.set(CENTER_X, CENTER_Y);
    this.view.addChild(this.burst);
  }

  update(ctx: FrameContext, strength: number): void {
    this.burst.rotation = ctx.time * 0.25 * this.deps.speed * this.num('dir');
    this.burst.scale.set(0.8 + ctx.bass * 0.35 + this.pulse(ctx) * 0.1);
    this.burst.alpha = strength;
  }
}

export const SPEED_LINES: ElementDef = {
  id: 'speedLines',
  slot: 'figure',
  energy: 0.75,
  traits: ['lines', 'sharp', 'perspective'],
  params: { count: { kind: 'range', min: 70, max: 130, int: true } },
  create: (d) => new SpeedLines(d),
};

export const MANGA_PANELS: ElementDef = {
  id: 'mangaPanels',
  slot: 'figure',
  energy: 0.5,
  traits: ['blocky', 'iconic'],
  params: { layout: { kind: 'range', min: 0, max: PANEL_LAYOUTS.length - 1, int: true } },
  create: (d) => new MangaPanels(d),
};

export const SUNBURST: ElementDef = {
  id: 'sunburst',
  slot: 'figure',
  energy: 0.7,
  traits: ['rotation', 'sharp'],
  params: { rays: { kind: 'range', min: 16, max: 32, int: true }, dir: { kind: 'choice', options: ['1', '-1'] } },
  create: (d) => new Sunburst(d),
};
