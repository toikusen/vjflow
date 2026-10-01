import { Color, Container } from 'pixi.js';
import { ElementUse } from '../compose-scene';
import { ElementDeps, VjElement } from '../elements/element';
import { ELEMENTS } from '../elements/registry';
import { CENTER_X, CENTER_Y, FrameContext } from './frame-context';
import { LayerDeps, VjLayer } from './layers/vj-layer';

interface Part {
  element: VjElement;
  use: ElementUse;
}

/**
 * A scene assembled from shared elements: field, figures and accents stacked in `content`,
 * optionally wrapped by one post, moved by the skin's camera, with the style's overlays on top.
 */
export class CompositeLayer implements VjLayer {
  readonly view = new Container();
  private readonly body = new Container();
  private readonly content = new Container();
  private readonly parts: Part[] = [];
  private readonly overlays: Part[] = [];
  private readonly post?: Part;
  private readonly dolly: boolean;
  private readonly panDirection: number;

  constructor(deps: LayerDeps) {
    const { scene, style, textures, rng, renderer } = deps;
    const skin = style.grammar.skin;
    this.dolly = skin.camera === 'dolly';
    this.panDirection = rng() > 0.5 ? 1 : -1;
    for (const c of [this.view, this.body]) {
      c.pivot.set(CENTER_X, CENTER_Y);
      c.position.set(CENTER_X, CENTER_Y);
    }
    const common: Omit<ElementDeps, 'params'> = {
      skin,
      palette: scene.palette.map((c) => new Color(c).toNumber()),
      textures,
      rng,
      renderer,
      speed: Number(scene.parameters['speed'] ?? 1),
      density: Number(scene.parameters['density'] ?? 1),
    };
    const make = (use: ElementUse, target?: Container): Part => ({ element: ELEMENTS[use.id].create({ ...common, params: use.params, target }), use });

    for (const use of scene.composition ?? []) {
      const def = ELEMENTS[use.id];
      if (!def || def.slot === 'post' || use.overlay) continue;
      const part = make(use);
      this.content.addChild(part.element.view);
      this.parts.push(part);
    }
    const postUse = scene.composition?.find((u) => ELEMENTS[u.id]?.slot === 'post' && !u.overlay);
    if (postUse) this.post = make(postUse, this.content);
    this.body.addChild(this.post ? this.post.element.view : this.content);
    this.view.addChild(this.body);

    for (const use of scene.composition ?? []) {
      if (!use.overlay || !ELEMENTS[use.id]) continue;
      const part = make(use);
      this.view.addChild(part.element.view);
      this.overlays.push(part);
    }
  }

  update(ctx: FrameContext): void {
    for (const { element, use } of this.parts) element.update(ctx, use.strength);
    // Posts that render offscreen need the content already updated this frame.
    if (this.post) this.post.element.update(ctx, this.post.use.strength);
    for (const { element, use } of this.overlays) element.update(ctx, use.strength);
    if (this.dolly) {
      const p = ctx.sceneProgress;
      this.body.scale.set(1.06 + p * 0.08);
      this.body.position.set(CENTER_X + this.panDirection * (p - 0.5) * 90, CENTER_Y + Math.sin(ctx.time * 0.07) * 20);
    }
  }

  destroy(): void {
    // Content elements first, so the post (which may own `content`) never destroys them twice.
    for (const { element } of this.parts) element.destroy();
    this.post?.element.destroy();
    for (const { element } of this.overlays) element.destroy();
    if (!this.content.destroyed) this.content.destroy();
    this.view.destroy({ children: true });
  }
}
