import { Color, Container } from 'pixi.js';
import { ElementUse } from '../compose-scene';
import { VjElement } from '../elements/element';
import { ELEMENTS } from '../elements/registry';
import { CENTER_X, CENTER_Y, FrameContext } from './frame-context';
import { LayerDeps, VjLayer } from './layers/vj-layer';

/** A scene assembled from shared elements: field, figures and accents stacked, optionally wrapped by one post. */
export class CompositeLayer implements VjLayer {
  readonly view = new Container();
  private readonly content = new Container();
  private readonly parts: { element: VjElement; use: ElementUse }[] = [];
  private post?: { element: VjElement; use: ElementUse };

  constructor(deps: LayerDeps) {
    const { scene, style, textures, rng, renderer } = deps;
    this.view.pivot.set(CENTER_X, CENTER_Y);
    this.view.position.set(CENTER_X, CENTER_Y);
    const common = {
      skin: style.grammar!.skin,
      palette: scene.palette.map((c) => new Color(c).toNumber()),
      textures,
      rng,
      renderer,
      speed: Number(scene.parameters['speed'] ?? 1),
      density: Number(scene.parameters['density'] ?? 1),
    };
    for (const use of scene.composition ?? []) {
      const def = ELEMENTS[use.id];
      if (!def || def.slot === 'post') continue;
      const element = def.create({ ...common, params: use.params });
      this.content.addChild(element.view);
      this.parts.push({ element, use });
    }
    const postUse = scene.composition?.find((u) => ELEMENTS[u.id]?.slot === 'post');
    if (postUse) {
      this.post = { element: ELEMENTS[postUse.id].create({ ...common, params: postUse.params, target: this.content }), use: postUse };
      this.view.addChild(this.post.element.view);
    } else {
      this.view.addChild(this.content);
    }
  }

  update(ctx: FrameContext): void {
    for (const { element, use } of this.parts) element.update(ctx, use.strength);
    // Last: posts that render offscreen need the content already updated this frame.
    this.post?.element.update(ctx, this.post.use.strength);
  }

  destroy(): void {
    // Content elements first, so the post (which may own `content`) never destroys them twice.
    for (const { element } of this.parts) element.destroy();
    this.post?.element.destroy();
    if (!this.content.destroyed) this.content.destroy();
    this.view.destroy({ children: true });
  }
}
