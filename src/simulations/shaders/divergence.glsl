precision highp float;

uniform vec2      iResolution;
uniform sampler2D uVelocity;

void main() {
  vec2 uv    = gl_FragCoord.xy / iResolution;
  vec2 texel = 1.0 / iResolution;

  float L = texture2D(uVelocity, uv - vec2(texel.x, 0.0)).x;
  float R = texture2D(uVelocity, uv + vec2(texel.x, 0.0)).x;
  float T = texture2D(uVelocity, uv + vec2(0.0, texel.y)).y;
  float B = texture2D(uVelocity, uv - vec2(0.0, texel.y)).y;

  // No-slip wall boundary: negate normal component at each edge
  vec2 C = texture2D(uVelocity, uv).xy;
  if (uv.x - texel.x < 0.0) L = -C.x;
  if (uv.x + texel.x > 1.0) R = -C.x;
  if (uv.y + texel.y > 1.0) T = -C.y;
  if (uv.y - texel.y < 0.0) B = -C.y;

  float div = 0.5 * (R - L + T - B);
  gl_FragColor = vec4(div, 0.0, 0.0, 1.0);
}
