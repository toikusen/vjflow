import { BlurFilter, Container, Renderer, Sprite } from 'pixi.js';
import { FrameContext } from '../renderer/frame-context';
import { VjTextures } from '../renderer/textures';
import { Rng } from '../seeded-random';

export type Slot = 'field' | 'figure' | 'accent' | 'post';

/** Visual traits used by style grammars and the motif variety rule. */
export type Trait = 'rotation' | 'perspective' | 'lines' | 'blocky' | 'organic' | 'soft' | 'sharp' | 'strobe' | 'iconic' | 'shader';

export type ParamSpec = { kind: 'range'; min: number; max: number; int?: boolean } | { kind: 'choice'; options: readonly string[] };
export type ParamValues = Record<string, number | string>;

/** How a style draws shared elements: stroke character, glow and motion personality. */
export interface Skin {
  line: 'neon' | 'soft' | 'ink' | 'pastel' | 'film';
  lineWidth: number;
  /** 0 = sharp corners, 1 = fully rounded (dots instead of squares, round joins). */
  roundness: number;
  /** Additive blurred copy strength, 0..1; 0 = no glow pass at all. */
  glow: number;
  motion: 'snappy' | 'bouncy' | 'smooth' | 'slow';
  blend: 'add' | 'normal' | 'screen';
}

export interface ElementDeps {
  params: ParamValues;
  skin: Skin;
  /** [0] background, [1] primary, [2] highlight, [3] accent. */
  palette: number[];
  textures: VjTextures;
  rng: Rng;
  speed: number;
  density: number;
  /** Post elements only: the content they process. Their `view` replaces it in the scene. */
  target?: Container;
  /** Absent in unit tests; elements that need offscreen rendering then pass content through. */
  renderer?: Renderer;
}

export interface VjElement {
  readonly view: Container;
  /** `strength` 0..1: faint in a verse, full in a chorus. */
  update(ctx: FrameContext, strength: number): void;
  destroy(): void;
}

export interface ElementDef {
  id: string;
  slot: Slot;
  /** How intense the element feels, 0..1; matched against song arousal and scene target energy. */
  energy: number;
  traits: Trait[];
  /** Song-level parameters: sampled once per song so the same element differs across songs. */
  params: Record<string, ParamSpec>;
  create(deps: ElementDeps): VjElement;
}

export function sampleParams(specs: Record<string, ParamSpec>, rng: Rng): ParamValues {
  const out: ParamValues = {};
  for (const [key, spec] of Object.entries(specs)) {
    if (spec.kind === 'choice') out[key] = spec.options[Math.floor(rng() * spec.options.length)];
    else {
      const v = spec.min + (spec.max - spec.min) * rng();
      out[key] = spec.int ? Math.round(v) : v;
    }
  }
  return out;
}

/** Shapes a 1→0 beat pulse according to the skin's motion personality. */
export function shapePulse(motion: Skin['motion'], p: number): number {
  if (motion === 'snappy') return p * p;
  if (motion === 'bouncy') return p * (1 + 0.6 * Math.sin((1 - p) * Math.PI * 2));
  if (motion === 'slow') return Math.sqrt(p) * 0.5;
  return p;
}

/** Deterministic pseudo-random in [0,1) from an integer; keeps per-beat choices stable on seek. */
export const hash01 = (n: number): number => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

export const rgb = (color: number): Float32Array => new Float32Array([((color >> 16) & 255) / 255, ((color >> 8) & 255) / 255, (color & 255) / 255]);

export abstract class BaseElement implements VjElement {
  readonly view = new Container();

  constructor(protected readonly deps: ElementDeps) {}

  abstract update(ctx: FrameContext, strength: number): void;

  protected color(i: number): number {
    const p = this.deps.palette;
    return p[i % p.length];
  }

  protected rand(min: number, max: number): number {
    return min + (max - min) * this.deps.rng();
  }

  protected num(key: string): number {
    return Number(this.deps.params[key]);
  }

  protected str(key: string): string {
    return String(this.deps.params[key]);
  }

  protected get skin(): Skin {
    return this.deps.skin;
  }

  protected pulse(ctx: FrameContext): number {
    return shapePulse(this.skin.motion, ctx.beatPulse);
  }

  destroy(): void {
    this.view.destroy({ children: true });
  }
}

/**
 * Sharp display objects plus (when the skin glows) blurred additive twins driven identically.
 * Build each object through `add`, move the sharp one, then call `sync`.
 */
export class GlowPairs<T extends Container> {
  readonly sharp = new Container();
  readonly soft?: Container;
  readonly pairs: [T, T | undefined][] = [];

  constructor(parent: Container, skin: Skin) {
    if (skin.glow > 0) {
      this.soft = new Container();
      this.soft.filters = [new BlurFilter({ strength: 14, quality: 3, resolution: 0.5 })];
      this.soft.blendMode = 'add';
      parent.addChild(this.soft);
    }
    if (skin.blend !== 'normal') this.sharp.blendMode = skin.blend;
    parent.addChild(this.sharp);
  }

  add(make: () => T): T {
    const a = make();
    const b = this.soft ? make() : undefined;
    this.sharp.addChild(a);
    if (b) this.soft!.addChild(b);
    this.pairs.push([a, b]);
    return a;
  }

  sync(): void {
    for (const [a, b] of this.pairs) {
      if (!b) continue;
      b.position.copyFrom(a.position);
      b.scale.copyFrom(a.scale);
      b.rotation = a.rotation;
      b.alpha = a.alpha;
      b.visible = a.visible;
      if (a instanceof Sprite && b instanceof Sprite) {
        b.width = a.width;
        b.height = a.height;
        b.tint = a.tint;
      }
    }
  }

  setGlow(alpha: number): void {
    if (this.soft) this.soft.alpha = alpha;
  }
}
