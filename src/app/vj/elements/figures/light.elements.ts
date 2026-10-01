import { Sprite } from 'pixi.js';
import { CENTER_X, CENTER_Y, FrameContext } from '../../renderer/frame-context';
import { centeredSprite } from '../../renderer/layers/vj-layer';
import { ParticleSystem } from '../../renderer/particle-system';
import { BaseElement, ElementDef, ElementDeps } from '../element';

const FLARE_STEPS = [0.55, 0.9, 1.25, 1.6, 2.1];
const SOURCE_Y = -140;

interface Ray {
  sprite: Sprite;
  base: number;
  offset: number;
}

/** God rays from an off-screen source, with a lens-flare chain across the frame. */
class LightRays extends BaseElement {
  private readonly sourceX: number;
  private readonly source: Sprite;
  private readonly rays: Ray[] = [];
  private readonly flares: Sprite[] = [];
  private phase = 0;

  constructor(deps: ElementDeps) {
    super(deps);
    const t = deps.textures;
    this.sourceX = CENTER_X + this.num('sourceX');
    this.source = centeredSprite(t.glow, this.sourceX, SOURCE_Y, this.color(2));
    this.source.blendMode = 'add';
    this.view.addChild(this.source);
    for (let i = 0; i < this.num('count'); i++) {
      const sprite = new Sprite(t.ray);
      sprite.anchor.set(0.5, 0);
      sprite.position.set(this.sourceX, SOURCE_Y);
      sprite.width = this.rand(140, 420);
      sprite.height = 1900;
      sprite.blendMode = 'add';
      sprite.tint = i % 3 ? this.color(2) : this.color(3);
      this.view.addChild(sprite);
      this.rays.push({ sprite, base: this.rand(-1, 1), offset: this.rand(0, 10) });
    }
    FLARE_STEPS.forEach((_, i) => {
      const f = centeredSprite(i % 2 ? t.ring : t.glow, 0, 0, i % 2 ? this.color(3) : this.color(2));
      f.blendMode = 'add';
      f.scale.set(0.4 + (i % 3) * 0.35);
      this.view.addChild(f);
      this.flares.push(f);
    });
  }

  update(ctx: FrameContext, strength: number): void {
    const { dt, time, energy, bass, intensity } = ctx;
    this.phase += dt * (0.08 + energy * 0.7) * this.deps.speed;
    this.source.scale.set(9 + bass * 6);
    this.source.alpha = (0.45 + bass * 0.55) * strength;
    for (const r of this.rays) {
      r.sprite.rotation = r.base + Math.sin(this.phase + r.offset) * 0.18;
      r.sprite.alpha = (0.12 + bass * 0.45 * intensity) * (0.7 + 0.3 * Math.sin(time * 1.3 + r.offset)) * strength;
    }
    const dx = CENTER_X - this.sourceX;
    const dy = CENTER_Y - SOURCE_Y;
    const pulse = this.pulse(ctx);
    this.flares.forEach((f, i) => {
      f.position.set(this.sourceX + dx * FLARE_STEPS[i], SOURCE_Y + dy * FLARE_STEPS[i]);
      f.alpha = (0.08 + bass * 0.3 + pulse * 0.05) * (i % 2 ? 0.8 : 0.5) * strength;
    });
  }
}

/** Soft rings released from the center every other beat. */
class Halos extends BaseElement {
  private readonly core: Sprite;
  private readonly pool: ParticleSystem;

  constructor(deps: ElementDeps) {
    super(deps);
    this.core = centeredSprite(deps.textures.glow, CENTER_X, CENTER_Y, this.color(2));
    this.core.blendMode = 'add';
    this.pool = new ParticleSystem(deps.textures.ring, 12, 'add');
    this.view.addChild(this.core, this.pool.view);
  }

  update(ctx: FrameContext, strength: number): void {
    this.core.scale.set(4 + ctx.bass * 3);
    this.core.alpha = (0.2 + ctx.bass * 0.3) * strength;
    if (ctx.beat && ctx.beatIndex % this.num('every') === 0) {
      const p = this.pool.spawn();
      if (p) {
        p.x = CENTER_X;
        p.y = CENTER_Y;
        p.life = 3 / this.deps.speed;
        p.scale = 0.6;
        p.scaleEnd = this.num('reach');
        p.alpha = (0.3 + ctx.bass * 0.5) * strength;
        p.tint = this.color(2);
      }
    }
    this.pool.update(ctx.dt);
  }
}

/** Anamorphic lens flare: a hot core with long horizontal streaks. */
class AnamorphicFlare extends BaseElement {
  private readonly core: Sprite;
  private readonly streaks: Sprite[];

  constructor(deps: ElementDeps) {
    super(deps);
    const y = CENTER_Y + this.num('offsetY');
    this.core = centeredSprite(deps.textures.glow, CENTER_X, y, this.color(2));
    this.streaks = [this.color(2), this.color(3)].map((tint) => centeredSprite(deps.textures.glow, CENTER_X, y, tint));
    [this.core, ...this.streaks].forEach((s) => (s.blendMode = 'add'));
    this.view.addChild(this.core, ...this.streaks);
  }

  update({ energy, bass }: FrameContext, strength: number): void {
    this.core.scale.set(2.5 + bass * 2);
    this.core.alpha = (0.3 + energy * 0.5) * strength;
    this.streaks.forEach((s, i) => {
      s.width = 2600 + energy * 800;
      s.height = (i ? 6 : 14) + bass * (i ? 10 : 26);
      s.y = this.core.y + (i ? 26 : 0);
      s.alpha = (0.5 + energy * 0.5) * (i ? 0.6 : 1) * strength;
    });
  }
}

export const LIGHT_RAYS: ElementDef = {
  id: 'lightRays',
  slot: 'figure',
  energy: 0.45,
  traits: ['lines', 'soft'],
  params: { count: { kind: 'range', min: 7, max: 14, int: true }, sourceX: { kind: 'range', min: -420, max: 380 } },
  create: (d) => new LightRays(d),
};

export const HALOS: ElementDef = {
  id: 'halos',
  slot: 'figure',
  energy: 0.35,
  traits: ['organic', 'soft'],
  params: { every: { kind: 'range', min: 1, max: 2, int: true }, reach: { kind: 'range', min: 5, max: 8 } },
  create: (d) => new Halos(d),
};

export const ANAMORPHIC_FLARE: ElementDef = {
  id: 'anamorphicFlare',
  slot: 'figure',
  energy: 0.4,
  traits: ['soft'],
  params: { offsetY: { kind: 'range', min: -160, max: 160 } },
  create: (d) => new AnamorphicFlare(d),
};
