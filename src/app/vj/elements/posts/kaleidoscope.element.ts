import { Filter, UniformGroup } from 'pixi.js';
import { FrameContext } from '../../renderer/frame-context';
import { BaseElement, ElementDef, ElementDeps } from '../element';
import { filterProgram } from '../shader';

const FRAGMENT = /* glsl */ `
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform float uSegments;
uniform float uRotation;
uniform float uMix;

void main() {
  vec2 frame = uOutputFrame.zw;
  vec2 uv = vTextureCoord * uInputSize.xy / frame;
  float aspect = frame.x / frame.y;
  vec2 c = uv - 0.5;
  c.x *= aspect;
  float r = length(c);
  float seg = 6.2831853 / uSegments;
  float a = mod(atan(c.y, c.x) + uRotation, seg);
  a = abs(a - seg * 0.5);
  vec2 k = vec2(cos(a), sin(a)) * r;
  k.x /= aspect;
  vec2 src = (k + 0.5) * frame / uInputSize.xy;
  finalColor = mix(texture(uTexture, vTextureCoord), texture(uTexture, src), uMix);
}
`;

/** Mirrors the scene into N wedges around the center; slowly turns with the music. */
class Kaleidoscope extends BaseElement {
  private readonly uniforms = new UniformGroup({
    uSegments: { value: 6, type: 'f32' },
    uRotation: { value: 0, type: 'f32' },
    uMix: { value: 1, type: 'f32' },
  });
  private angle = 0;

  constructor(deps: ElementDeps) {
    super(deps);
    this.uniforms.uniforms['uSegments'] = this.num('segments');
    const target = deps.target!;
    target.filters = [new Filter({ glProgram: filterProgram(FRAGMENT, 'vj-kaleidoscope'), resources: { k: this.uniforms } })];
    this.view.addChild(target);
  }

  update({ dt, energy }: FrameContext, strength: number): void {
    this.angle += dt * this.deps.speed * (0.05 + energy * 0.25);
    this.uniforms.uniforms['uRotation'] = this.angle;
    this.uniforms.uniforms['uMix'] = strength;
  }
}

export const KALEIDOSCOPE: ElementDef = {
  id: 'kaleidoscope',
  slot: 'post',
  energy: 0.7,
  traits: ['shader'],
  params: { segments: { kind: 'range', min: 4, max: 10, int: true } },
  create: (d) => new Kaleidoscope(d),
};
