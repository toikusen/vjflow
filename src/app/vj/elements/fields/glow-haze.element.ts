import { Sprite } from 'pixi.js';
import { CENTER_Y, FrameContext, STAGE_WIDTH } from '../../renderer/frame-context';
import { centeredSprite, fullRect } from '../../renderer/layers/vj-layer';
import { BaseElement, ElementDef, ElementDeps } from '../element';

/** Solid background with a large colored haze that breathes with the bass. */
class GlowHaze extends BaseElement {
  private readonly haze: Sprite;

  constructor(deps: ElementDeps) {
    super(deps);
    this.haze = centeredSprite(deps.textures.glow, STAGE_WIDTH * this.num('x'), CENTER_Y, this.color(1));
    this.haze.scale.set(18, 12);
    this.haze.blendMode = 'add';
    this.view.addChild(fullRect(this.color(0)), this.haze);
  }

  update({ bass }: FrameContext): void {
    this.haze.alpha = 0.1 + bass * 0.25;
  }
}

export const GLOW_HAZE: ElementDef = {
  id: 'glowHaze',
  slot: 'field',
  energy: 0.5,
  traits: ['soft'],
  params: { x: { kind: 'range', min: 0.3, max: 0.7 } },
  create: (d) => new GlowHaze(d),
};
