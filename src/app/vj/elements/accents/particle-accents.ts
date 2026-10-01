import { Sprite } from 'pixi.js';
import { CENTER_X, CENTER_Y, FrameContext, STAGE_HEIGHT, STAGE_WIDTH } from '../../renderer/frame-context';
import { fullRect } from '../../renderer/layers/vj-layer';
import { ParticleSystem } from '../../renderer/particle-system';
import { BaseElement, ElementDef, ElementDeps } from '../element';

/** Shared plumbing: one particle pool, emission scaled by the scene's density. */
abstract class ParticleAccent extends BaseElement {
  protected readonly pool: ParticleSystem;

  constructor(deps: ElementDeps, texture: keyof ElementDeps['textures'], capacity: number, additive: boolean) {
    super(deps);
    this.pool = new ParticleSystem(deps.textures[texture], capacity, additive ? 'add' : 'normal');
    this.view.addChild(this.pool.view);
  }

  protected emit(ratePerSecond: number, dt: number, configure: (p: NonNullable<ReturnType<ParticleSystem['spawn']>>) => void): void {
    for (let n = this.pool.emitCount(ratePerSecond * this.deps.density, dt); n > 0; n--) {
      const p = this.pool.spawn();
      if (!p) break;
      configure(p);
    }
  }

  update(ctx: FrameContext, strength: number): void {
    this.view.alpha = strength;
    this.spawn(ctx, strength);
    this.pool.update(ctx.dt);
  }

  protected abstract spawn(ctx: FrameContext, strength: number): void;
}

/** Treble-driven sparks shooting out from the center (or anywhere). */
class Sparks extends ParticleAccent {
  constructor(deps: ElementDeps) {
    super(deps, 'glow', 240, true);
  }

  protected spawn({ dt, treble, intensity }: FrameContext): void {
    const centered = this.str('origin') === 'center';
    this.emit(treble * treble * 90 * intensity, dt, (p) => {
      const a = this.rand(0, Math.PI * 2);
      const v = this.rand(500, 1400);
      p.x = centered ? CENTER_X + Math.cos(a) * 60 : this.rand(0, STAGE_WIDTH);
      p.y = centered ? CENTER_Y + Math.sin(a) * 60 : this.rand(0, STAGE_HEIGHT);
      p.vx = Math.cos(a) * v;
      p.vy = Math.sin(a) * v;
      p.life = this.rand(0.5, 1.1);
      p.scale = this.rand(0.1, 0.3);
      p.scaleEnd = p.scale * 0.3;
      p.tint = this.deps.rng() > 0.5 ? this.color(2) : this.color(3);
    });
  }
}

/** Soft bokeh orbs drifting slowly upwards; the calmest accent. */
class Orbs extends ParticleAccent {
  constructor(deps: ElementDeps) {
    super(deps, 'glow', 40, true);
  }

  protected spawn({ dt, energy }: FrameContext): void {
    this.emit(this.num('rate') * (0.5 + energy), dt, (p) => {
      p.x = this.rand(0, STAGE_WIDTH);
      p.y = STAGE_HEIGHT + 200;
      p.vy = -this.rand(30, 90) * this.deps.speed;
      p.wobble = this.rand(20, 60);
      p.life = this.rand(10, 16);
      p.scale = p.scaleEnd = this.rand(1.5, 4) * this.num('size');
      p.alpha = 0.35;
      p.twinkle = true;
      p.tint = [this.color(1), this.color(2), this.color(3)][Math.floor(this.rand(0, 3))];
    });
  }
}

/** Pastel bubbles rising from the bottom. */
class Bubbles extends ParticleAccent {
  constructor(deps: ElementDeps) {
    super(deps, 'bubble', 90, false);
  }

  protected spawn({ dt, energy, intensity }: FrameContext): void {
    this.emit(4 + energy * 20 * intensity, dt, (p) => {
      p.x = this.rand(0, STAGE_WIDTH);
      p.y = STAGE_HEIGHT + 80;
      p.vy = -this.rand(90, 220);
      p.wobble = this.rand(40, 120);
      p.life = this.rand(5, 9);
      p.scale = p.scaleEnd = this.rand(0.3, 1.1);
      p.alpha = 0.9;
      p.twinkle = true;
      p.tint = this.deps.rng() > 0.5 ? 0xffffff : this.color(2);
    });
  }
}

/** Short-lived sparkles scattered by the treble. */
class Twinkles extends ParticleAccent {
  constructor(deps: ElementDeps) {
    super(deps, 'sparkle', 140, true);
  }

  protected spawn({ dt, treble }: FrameContext): void {
    this.emit(treble * 45, dt, (p) => {
      p.x = this.rand(0, STAGE_WIDTH);
      p.y = this.rand(0, STAGE_HEIGHT);
      p.life = this.rand(0.3, 0.8);
      p.scale = this.rand(0.3, 0.9);
      p.scaleEnd = 0.1;
      p.spin = 2;
      p.twinkle = true;
    });
  }
}

/** Hearts and stars bursting from a random point on strong kicks. */
class IconBurst extends ParticleAccent {
  constructor(deps: ElementDeps) {
    super(deps, 'heart', 120, false);
    if (this.str('icon') === 'star') this.pool.view.children.forEach((s) => ((s as Sprite).texture = deps.textures.star));
  }

  protected spawn(ctx: FrameContext, strength: number): void {
    if (!ctx.beat || (ctx.bass <= 0.4 && ctx.hit === 0)) return;
    const count = Math.round((4 + (ctx.hit + ctx.bass) * 10 * ctx.intensity) * this.deps.density * strength);
    const cx = this.rand(300, STAGE_WIDTH - 300);
    const cy = this.rand(250, STAGE_HEIGHT - 250);
    for (let i = 0; i < count; i++) {
      const p = this.pool.spawn();
      if (!p) break;
      const a = (i / count) * Math.PI * 2 + this.rand(-0.2, 0.2);
      const v = this.rand(350, 750);
      p.x = cx;
      p.y = cy;
      p.vx = Math.cos(a) * v;
      p.vy = Math.sin(a) * v;
      p.drag = 0.08;
      p.gravity = 250;
      p.spin = this.rand(-4, 4);
      p.life = this.rand(0.9, 1.5);
      p.scale = this.rand(0.25, 0.5);
      p.scaleEnd = 0.1;
      p.tint = [this.color(1), this.color(2), this.color(3)][i % 3];
    }
  }
}

/** Full-screen white flash on strong hits. */
class HitFlash extends BaseElement {
  private readonly flash = fullRect(0xffffff, 0);
  private level = 0;

  constructor(deps: ElementDeps) {
    super(deps);
    this.flash.blendMode = 'add';
    this.view.addChild(this.flash);
  }

  update({ dt, hit }: FrameContext, strength: number): void {
    if (hit > 0) this.level = Math.max(this.level, hit);
    this.flash.alpha = this.level * 0.85 * strength;
    this.level *= Math.exp(-dt / 0.07);
  }
}

export const SPARKS: ElementDef = {
  id: 'sparks',
  slot: 'accent',
  energy: 0.7,
  traits: ['sharp'],
  params: { origin: { kind: 'choice', options: ['center', 'center', 'anywhere'] } },
  create: (d) => new Sparks(d),
};

export const ORBS: ElementDef = {
  id: 'orbs',
  slot: 'accent',
  energy: 0.15,
  traits: ['soft'],
  params: { rate: { kind: 'range', min: 0.8, max: 2.5 }, size: { kind: 'range', min: 0.7, max: 1.3 } },
  create: (d) => new Orbs(d),
};

export const BUBBLES: ElementDef = {
  id: 'bubbles',
  slot: 'accent',
  energy: 0.3,
  traits: ['soft'],
  params: {},
  create: (d) => new Bubbles(d),
};

export const TWINKLES: ElementDef = {
  id: 'twinkles',
  slot: 'accent',
  energy: 0.4,
  traits: ['soft'],
  params: {},
  create: (d) => new Twinkles(d),
};

export const ICON_BURST: ElementDef = {
  id: 'iconBurst',
  slot: 'accent',
  energy: 0.6,
  traits: ['iconic'],
  params: { icon: { kind: 'choice', options: ['heart', 'star'] } },
  create: (d) => new IconBurst(d),
};

export const HIT_FLASH: ElementDef = {
  id: 'hitFlash',
  slot: 'accent',
  energy: 0.85,
  traits: ['strobe'],
  params: {},
  create: (d) => new HitFlash(d),
};
