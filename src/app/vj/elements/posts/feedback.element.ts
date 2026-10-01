import { Container, RenderTexture, Sprite } from 'pixi.js';
import { CENTER_X, CENTER_Y, FrameContext, STAGE_HEIGHT, STAGE_WIDTH } from '../../renderer/frame-context';
import { BaseElement, ElementDef, ElementDeps } from '../element';

/**
 * Video feedback: a slightly zoomed copy of the previous output is blended over the live scene,
 * so every frame keeps a fading share of all earlier ones (trails).
 * The field is opaque, hence the echo sits on top rather than underneath.
 * Two render textures ping-pong; without a renderer (tests) content passes through.
 */
class Feedback extends BaseElement {
  private readonly offscreen = new Container();
  private readonly echo = new Sprite();
  private readonly output = new Sprite();
  private textures: [RenderTexture, RenderTexture];

  constructor(deps: ElementDeps) {
    super(deps);
    const target = deps.target!;
    if (!deps.renderer) {
      this.view.addChild(target);
      this.textures = [] as unknown as [RenderTexture, RenderTexture];
      return;
    }
    const make = () => RenderTexture.create({ width: STAGE_WIDTH, height: STAGE_HEIGHT });
    this.textures = [make(), make()];
    this.echo.anchor.set(0.5);
    this.echo.position.set(CENTER_X, CENTER_Y);
    this.offscreen.addChild(target, this.echo);
    this.view.addChild(this.output);
  }

  update({ dt, energy, bass }: FrameContext, strength: number): void {
    const renderer = this.deps.renderer;
    if (!renderer) return;
    const [front, back] = this.textures;
    this.echo.texture = back;
    this.echo.scale.set(1 + this.num('zoom') * (0.5 + bass));
    this.echo.rotation = this.num('twist') * (0.5 + energy);
    // Frame-rate independent: the same trail length at 30 and 60 fps.
    this.echo.alpha = strength * Math.pow(this.num('persistence'), Math.max(dt, 1 / 60) * 60);
    renderer.render({ container: this.offscreen, target: front, clear: true });
    this.output.texture = front;
    this.textures = [back, front];
  }

  override destroy(): void {
    super.destroy();
    this.offscreen.destroy({ children: true });
    this.textures.forEach((t) => t.destroy(true));
  }
}

export const FEEDBACK: ElementDef = {
  id: 'feedback',
  slot: 'post',
  energy: 0.6,
  traits: ['shader'],
  params: {
    persistence: { kind: 'range', min: 0.5, max: 0.75 },
    zoom: { kind: 'range', min: 0.005, max: 0.025 },
    twist: { kind: 'range', min: -0.01, max: 0.01 },
  },
  create: (d) => new Feedback(d),
};
