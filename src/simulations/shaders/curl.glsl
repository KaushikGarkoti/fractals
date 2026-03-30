precision highp float;

uniform vec2      iResolution;
uniform sampler2D uVelocity;

void main() {
  vec2 uv    = gl_FragCoord.xy / iResolution;
  vec2 texel = 1.0 / iResolution;

  float L = texture2D(uVelocity, uv - vec2(texel.x, 0.0)).y;
  float R = texture2D(uVelocity, uv + vec2(texel.x, 0.0)).y;
  float T = texture2D(uVelocity, uv + vec2(0.0, texel.y)).x;
  float B = texture2D(uVelocity, uv - vec2(0.0, texel.y)).x;

  float vorticity = R - L - T + B;
  gl_FragColor = vec4(0.5 * vorticity, 0.0, 0.0, 1.0);
}
