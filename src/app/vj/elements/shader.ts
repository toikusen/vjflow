import { GlProgram } from 'pixi.js';

/**
 * PixiJS v8's default filter vertex shader (filters/defaults/defaultFilter.vert).
 * Fragments recover 0..1 frame coordinates with `vTextureCoord * uInputSize.xy / uOutputFrame.zw`.
 */
export const FILTER_VERTEX = /* glsl */ `
in vec2 aPosition;
out vec2 vTextureCoord;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

vec4 filterVertexPosition(void) {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  return vec4(position, 0.0, 1.0);
}

vec2 filterTextureCoord(void) {
  return aPosition * (uOutputFrame.zw * uInputSize.zw);
}

void main(void) {
  gl_Position = filterVertexPosition();
  vTextureCoord = filterTextureCoord();
}
`;

/**
 * A filter program on the default vertex shader. Fragments run at highp because they redeclare
 * uInputSize/uOutputFrame, and WebGL refuses to link a uniform whose precision differs between stages.
 */
export const filterProgram = (fragment: string, name: string): GlProgram =>
  GlProgram.from({ vertex: FILTER_VERTEX, fragment, name, preferredFragmentPrecision: 'highp' });
