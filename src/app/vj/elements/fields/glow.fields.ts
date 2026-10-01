import { Sprite } from 'pixi.js';
import { CENTER_X, FrameContext, STAGE_HEIGHT, STAGE_WIDTH } from '../../renderer/frame-context';
import { centeredSprite, fullRect, gradientRect } from '../../renderer/layers/vj-layer';
import { BaseElement, ElementDef, ElementDeps } from '../element';

/** Plain sky: background color fading into the primary from the top. Quiet base for light figures. */
class SkyGradient extends BaseElement {
  constructor(deps: ElementDeps) {
    super(deps);
    this.view.addChild(fullRect(this.color(0)), gradientRect(deps.textures.fadeV, this.color(1), this.num('depth')));
  }

  update(): void {}
}

/** Soft aurora curtains waving across the upper half. */
class Aurora extends BaseElement {
  private readonly bands: Sprite[] = [];
  private phase = 0;

  constructor(deps: ElementDeps) {
    super(deps);
    this.view.addChild(fullRect(this.color(0)), gradientRect(deps.textures.fadeV, this.color(1), 0.75));
    for (let i = 0; i < this.num('bands'); i++) {
      const band = centeredSprite(deps.textures.glow, CENTER_X, 260 + i * 110, i % 2 ? this.color(3) : this.color(2));
      band.width = 3200;
      band.height = 260;
      band.blendMode = 'add';
      this.view.addChild(band);
      this.bands.push(band);
    }
  }

  update({ dt, energy }: FrameContext): void {
    this.phase += dt * (0.08 + energy * 0.7) * this.deps.speed;
    this.bands.forEach((b, i) => {
      b.y = 260 + i * 110 + Math.sin(this.phase * 1.5 + i) * 70;
      b.rotation = Math.sin(this.phase + i * 0.7) * 0.08;
      b.alpha = 0.18 + energy * 0.3;
    });
  }
}

/** Dark set with large drifting film light leaks. */
class LightLeak extends BaseElement {
  private readonly leaks: Sprite[] = [];

  constructor(deps: ElementDeps) {
    super(deps);
    this.view.addChild(fullRect(this.color(0)), gradientRect(deps.textures.fadeV, this.color(3), 0.35, true));
    for (let i = 0; i < this.num('count'); i++) {
      const leak = centeredSprite(deps.textures.glow, this.rand(200, STAGE_WIDTH - 200), this.rand(150, STAGE_HEIGHT - 150), i ? this.color(3) : this.color(1));
      leak.scale.set(this.rand(8, 14), this.rand(6, 10));
      leak.blendMode = 'add';
      this.view.addChild(leak);
      this.leaks.push(leak);
    }
  }

  update({ dt, time, energy, intensity }: FrameContext): void {
    const t = time * this.deps.speed;
    this.leaks.forEach((leak, i) => {
      leak.x += Math.sin(t * 0.05 + i * 2) * 12 * dt;
      leak.y += Math.cos(t * 0.04 + i) * 8 * dt;
      const flicker = 0.85 + 0.15 * Math.sin(t * 0.9 + i * 1.7) * Math.sin(t * 0.37 + i);
      leak.alpha = (0.45 + energy * 0.45 * intensity) * flicker;
    });
  }
}

export const SKY_GRADIENT: ElementDef = {
  id: 'skyGradient',
  slot: 'field',
  energy: 0.3,
  traits: ['soft'],
  params: { depth: { kind: 'range', min: 0.5, max: 0.85 } },
  create: (d) => new SkyGradient(d),
};

export const AURORA: ElementDef = {
  id: 'aurora',
  slot: 'field',
  energy: 0.3,
  traits: ['soft', 'organic'],
  params: { bands: { kind: 'range', min: 4, max: 7, int: true } },
  create: (d) => new Aurora(d),
};

export const LIGHT_LEAK: ElementDef = {
  id: 'lightLeak',
  slot: 'field',
  energy: 0.3,
  traits: ['soft'],
  params: { count: { kind: 'range', min: 2, max: 4, int: true } },
  create: (d) => new LightLeak(d),
};
