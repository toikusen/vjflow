import { Container, Graphics } from 'pixi.js';
import { CENTER_X, CENTER_Y, FrameContext, STAGE_WIDTH } from '../../renderer/frame-context';
import { fullRect } from '../../renderer/layers/vj-layer';
import { ParticleSystem } from '../../renderer/particle-system';
import { BaseElement, ElementDef, ElementDeps } from '../element';
import { spikes } from '../figures/manga.elements';

const IMPACT_DURATION = 0.14;

/** Manga impact frame: on a strong hit, a full-screen inverted burst flashes for a few frames. */
class ImpactFrame extends BaseElement {
  private readonly frame = new Container();
  private readonly bg = fullRect(0x000000);
  private readonly burst: Graphics;
  private remaining = 0;

  constructor(deps: ElementDeps) {
    super(deps);
    this.burst = spikes(deps.rng, 40, 60, 1400, 0xffffff);
    this.burst.position.set(CENTER_X, CENTER_Y);
    this.frame.addChild(this.bg, this.burst);
    this.frame.visible = false;
    this.view.addChild(this.frame);
  }

  update({ dt, hit, beatIndex }: FrameContext, strength: number): void {
    if (hit > 0) {
      this.remaining = IMPACT_DURATION;
      const inverted = beatIndex % 2 === 0;
      this.bg.tint = inverted ? 0xffffff : 0x000000;
      this.burst.tint = inverted ? 0x000000 : 0xffffff;
      this.burst.rotation = this.rand(0, Math.PI);
    }
    this.frame.visible = this.remaining > 0;
    this.frame.alpha = strength;
    this.remaining -= dt;
  }
}

/** Paper-like shards falling from the top, driven by the mids. */
class Shards extends BaseElement {
  private readonly pool: ParticleSystem;

  constructor(deps: ElementDeps) {
    super(deps);
    this.pool = new ParticleSystem(deps.textures.sparkle, 80);
    this.view.addChild(this.pool.view);
  }

  update({ dt, mid, intensity }: FrameContext, strength: number): void {
    this.view.alpha = strength;
    for (let n = this.pool.emitCount(mid * 25 * intensity * this.deps.density, dt); n > 0; n--) {
      const p = this.pool.spawn();
      if (!p) break;
      p.x = this.rand(0, STAGE_WIDTH);
      p.y = -40;
      p.vx = this.rand(-200, 200);
      p.vy = this.rand(500, 1000);
      p.spin = this.rand(-6, 6);
      p.life = 1.6;
      p.scale = p.scaleEnd = this.rand(0.4, 1);
      p.tint = this.deps.rng() > 0.5 ? 0xffffff : this.color(1);
    }
    this.pool.update(dt);
  }
}

export const IMPACT_FRAME: ElementDef = {
  id: 'impactFrame',
  slot: 'accent',
  energy: 0.85,
  traits: ['strobe'],
  params: {},
  create: (d) => new ImpactFrame(d),
};

export const SHARDS: ElementDef = {
  id: 'shards',
  slot: 'accent',
  energy: 0.6,
  traits: ['sharp'],
  params: {},
  create: (d) => new Shards(d),
};
