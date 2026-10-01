import { Sprite, TilingSprite } from 'pixi.js';
import { FrameContext, STAGE_HEIGHT, STAGE_WIDTH } from '../../renderer/frame-context';
import { fullRect } from '../../renderer/layers/vj-layer';
import { ParticleSystem } from '../../renderer/particle-system';
import { BaseElement, ElementDef, ElementDeps } from '../element';

/** 2.39:1 scope framing inside 16:9. */
const LETTERBOX = Math.round((STAGE_HEIGHT - STAGE_WIDTH / 2.39) / 2);

/** Film presentation on top of the scene: exposure lift on the bass, vignette, grain and letterbox. */
class FilmFrame extends BaseElement {
  private readonly exposure = fullRect(0xffffff, 0);
  private readonly grain: TilingSprite;

  constructor(deps: ElementDeps) {
    super(deps);
    const vignette = new Sprite(deps.textures.vignette);
    vignette.width = STAGE_WIDTH;
    vignette.height = STAGE_HEIGHT;
    this.grain = new TilingSprite({ texture: deps.textures.grain, width: STAGE_WIDTH, height: STAGE_HEIGHT });
    this.grain.alpha = 0.07;
    this.exposure.blendMode = 'add';
    const top = fullRect(0x000000);
    top.height = LETTERBOX;
    const bottom = fullRect(0x000000);
    bottom.height = LETTERBOX;
    bottom.y = STAGE_HEIGHT - LETTERBOX;
    this.view.addChild(this.exposure, vignette, this.grain, top, bottom);
  }

  update({ bass }: FrameContext): void {
    this.exposure.alpha = bass * 0.05;
    this.grain.tilePosition.set(this.rand(0, 256), this.rand(0, 256));
  }
}

/** Tiny glowing dust specks floating in a light beam. */
class Dust extends BaseElement {
  private readonly pool: ParticleSystem;

  constructor(deps: ElementDeps) {
    super(deps);
    this.pool = new ParticleSystem(deps.textures.glow, 180, 'add');
    this.view.addChild(this.pool.view);
  }

  update({ dt, treble }: FrameContext, strength: number): void {
    this.view.alpha = strength;
    for (let n = this.pool.emitCount((this.num('base') + treble * this.num('treble')) * this.deps.density, dt); n > 0; n--) {
      const p = this.pool.spawn();
      if (!p) break;
      p.x = this.rand(0, STAGE_WIDTH);
      p.y = this.rand(STAGE_HEIGHT * 0.2, STAGE_HEIGHT + 20);
      p.vx = this.rand(-15, 15);
      p.vy = -this.rand(10, 45);
      p.wobble = this.rand(10, 30);
      p.life = this.rand(3, 7);
      p.scale = p.scaleEnd = this.rand(0.03, 0.12);
      p.alpha = this.rand(0.5, 1);
      p.twinkle = true;
      p.tint = this.color(2);
    }
    this.pool.update(dt);
  }
}

export const FILM_FRAME: ElementDef = {
  id: 'filmFrame',
  slot: 'accent',
  energy: 0.3,
  traits: ['soft'],
  params: {},
  create: (d) => new FilmFrame(d),
};

export const DUST: ElementDef = {
  id: 'dust',
  slot: 'accent',
  energy: 0.2,
  traits: ['soft'],
  params: { base: { kind: 'range', min: 3, max: 8 }, treble: { kind: 'range', min: 20, max: 70 } },
  create: (d) => new Dust(d),
};
