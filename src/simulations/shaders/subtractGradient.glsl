precision highp float;

uniform vec2      iResolution;
uniform sampler2D uVelocity;
uniform sampler2D uPressure;

void main() {
  vec2 uv    = gl_FragCoord.xy / iResolution;
  vec2 texel = 1.0 / iResolution;

  float pL = texture2D(uPressure, uv - vec2(texel.x, 0.0)).x;
  float pR = texture2D(uPressure, uv + vec2(texel.x, 0.0)).x;
  float pB = texture2D(uPressure, uv - vec2(0.0, texel.y)).x;
  float pT = texture2D(uPressure, uv + vec2(0.0, texel.y)).x;
  float pC = texture2D(uPressure, uv).x;

  // No-slip wall boundary: use center pressure at each edge (zero gradient)
  if (uv.x - texel.x < 0.0) pL = pC;
  if (uv.x + texel.x > 1.0) pR = pC;
  if (uv.y - texel.y < 0.0) pB = pC;
  if (uv.y + texel.y > 1.0) pT = pC;

  vec2 vel  = texture2D(uVelocity, uv).xy;
  vel -= 0.5 * vec2(pR - pL, pT - pB);

  gl_FragColor = vec4(vel, 0.0, 1.0);
}
