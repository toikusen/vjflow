import { Sprite, TilingSprite } from 'pixi.js';
import { CENTER_X, CENTER_Y, FrameContext, STAGE_HEIGHT, STAGE_WIDTH } from '../../renderer/frame-context';
import { centeredSprite, fullRect, gradientRect } from '../../renderer/layers/vj-layer';
import { BaseElement, ElementDef, ElementDeps } from '../element';

/** Pastel gradient with a scrolling dot pattern and a soft glow that pulses on the beat. */
class DotPattern extends BaseElement {
  private readonly dots: TilingSprite;
  private readonly glow: Sprite;

  constructor(deps: ElementDeps) {
    super(deps);
    const t = deps.textures;
    this.dots = new TilingSprite({ texture: t.dots, width: STAGE_WIDTH, height: STAGE_HEIGHT });
    this.dots.alpha = 0.35;
    this.dots.tileScale.set(this.num('dotScale'));
    this.glow = centeredSprite(t.glow, CENTER_X, CENTER_Y, this.color(1));
    this.glow.blendMode = 'add';
    this.view.addChild(fullRect(this.color(0)), gradientRect(t.fadeV, this.color(1), 0.55, true), this.dots, this.glow);
  }

  update(ctx: FrameContext): void {
    const drift = ctx.time * this.deps.speed;
    this.dots.tilePosition.set(drift * 30 * this.num('dirX'), drift * 18);
    const p = this.pulse(ctx);
    this.glow.scale.set(7 + p * 2.5);
    this.glow.alpha = 0.08 + p * 0.22;
  }
}

export const DOT_PATTERN: ElementDef = {
  id: 'dotPattern',
  slot: 'field',
  energy: 0.4,
  traits: ['soft'],
  params: { dotScale: { kind: 'range', min: 0.7, max: 1.6 }, dirX: { kind: 'range', min: -1, max: 1 } },
  create: (d) => new DotPattern(d),
};
