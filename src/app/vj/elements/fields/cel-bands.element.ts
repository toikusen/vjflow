import { Container, TilingSprite } from 'pixi.js';
import { CENTER_X, CENTER_Y, FrameContext, STAGE_HEIGHT, STAGE_WIDTH } from '../../renderer/frame-context';
import { fullRect } from '../../renderer/layers/vj-layer';
import { BaseElement, ElementDef, ElementDeps } from '../element';

/** Tilted cel-shaded color bands under a drifting halftone screen. */
class CelBands extends BaseElement {
  private readonly halftone: TilingSprite;

  constructor(deps: ElementDeps) {
    super(deps);
    const cel = new Container();
    const band1 = fullRect(this.color(1), 0.55);
    band1.y = STAGE_HEIGHT * this.num('split');
    const band2 = fullRect(this.color(1));
    band2.y = STAGE_HEIGHT * (this.num('split') + 0.23);
    cel.addChild(fullRect(this.color(0)), band1, band2);
    cel.pivot.set(CENTER_X, CENTER_Y);
    cel.position.set(CENTER_X, CENTER_Y);
    cel.rotation = this.num('tilt');
    cel.scale.set(1.35);
    this.halftone = new TilingSprite({ texture: deps.textures.dots, width: STAGE_WIDTH, height: STAGE_HEIGHT });
    this.halftone.tint = this.color(3);
    this.halftone.alpha = 0.16;
    this.view.addChild(cel, this.halftone);
  }

  update({ time }: FrameContext): void {
    this.halftone.tilePosition.set(time * 20 * this.deps.speed, time * -12 * this.deps.speed);
  }
}

export const CEL_BANDS: ElementDef = {
  id: 'celBands',
  slot: 'field',
  energy: 0.55,
  traits: ['blocky'],
  params: { tilt: { kind: 'range', min: -0.25, max: 0.25 }, split: { kind: 'range', min: 0.45, max: 0.62 } },
  create: (d) => new CelBands(d),
};
