import { Filter, Sprite, Texture, UniformGroup } from 'pixi.js';
import { FrameContext, STAGE_HEIGHT, STAGE_WIDTH } from '../../renderer/frame-context';
import { BaseElement, ElementDef, ElementDeps, rgb } from '../element';
import { filterProgram } from '../shader';

const FRAGMENT = /* glsl */ `
in vec2 vTextureCoord;
out vec4 finalColor;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform float uTime;
uniform float uBass;
uniform float uEnergy;
uniform float uScale;
uniform float uWarp;
uniform float uSeed;
uniform vec3 uC0;
uniform vec3 uC1;
uniform vec3 uC2;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p *= 2.0;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = vTextureCoord * uInputSize.xy / uOutputFrame.zw;
  vec2 p = uv * vec2(1.78, 1.0) * uScale + uSeed;
  float t = uTime * 0.1;
  // Domain warping (Inigo Quilez): noise displaced by noise displaced by noise.
  vec2 q = vec2(fbm(p + t), fbm(p + vec2(5.2, 1.3) - t));
  vec2 r = vec2(fbm(p + uWarp * q + vec2(1.7, 9.2) + t * 1.5), fbm(p + uWarp * q + vec2(8.3, 2.8) - t));
  float f = fbm(p + uWarp * r);
  vec3 col = mix(uC0, uC1, clamp(f * f * 1.4, 0.0, 0.75));
  col = mix(col, uC2, clamp(length(q) * 0.3 * (0.3 + uBass), 0.0, 0.5));
  // Stay close to the background color so figures on top keep the focus; energy lets it surface.
  col = mix(uC0, col, 0.35 + 0.45 * uEnergy);
  finalColor = vec4(col, 1.0);
}
`;

/**
 * Full-screen domain-warped noise. Rendered at half resolution: the field is soft,
 * so the upscale is invisible and the fragment cost drops to a quarter.
 */
class ShaderFlow extends BaseElement {
  private readonly uniforms: UniformGroup;
  private clock = 0;

  constructor(deps: ElementDeps) {
    super(deps);
    this.uniforms = new UniformGroup({
      uTime: { value: 0, type: 'f32' },
      uBass: { value: 0, type: 'f32' },
      uEnergy: { value: 0, type: 'f32' },
      uScale: { value: this.num('scale'), type: 'f32' },
      uWarp: { value: this.num('warp'), type: 'f32' },
      uSeed: { value: this.num('seed'), type: 'f32' },
      uC0: { value: rgb(this.color(0)), type: 'vec3<f32>' },
      uC1: { value: rgb(this.color(1)), type: 'vec3<f32>' },
      uC2: { value: rgb(this.color(2)), type: 'vec3<f32>' },
    });
    const filter = new Filter({
      glProgram: filterProgram(FRAGMENT, 'vj-shader-flow'),
      resources: { flow: this.uniforms },
      resolution: 0.5,
    });
    const canvas = new Sprite(Texture.WHITE);
    canvas.width = STAGE_WIDTH;
    canvas.height = STAGE_HEIGHT;
    canvas.filters = [filter];
    this.view.addChild(canvas);
  }

  update({ dt, time, bass, energy }: FrameContext): void {
    // Seeks (dt = 0) jump straight to a time-derived phase so the picture stays a function of time.
    this.clock = dt > 0 ? this.clock + dt * this.deps.speed * this.num('flow') * (0.6 + energy) : time * this.deps.speed * this.num('flow');
    const u = this.uniforms.uniforms;
    u['uTime'] = this.clock;
    u['uBass'] = bass;
    u['uEnergy'] = energy;
  }
}

export const SHADER_FLOW: ElementDef = {
  id: 'shaderFlow',
  slot: 'field',
  energy: 0.45,
  traits: ['shader', 'organic'],
  params: {
    scale: { kind: 'range', min: 1.5, max: 4 },
    warp: { kind: 'range', min: 1, max: 4 },
    seed: { kind: 'range', min: 0, max: 100 },
    flow: { kind: 'range', min: 0.5, max: 1.5 },
  },
  create: (d) => new ShaderFlow(d),
};
