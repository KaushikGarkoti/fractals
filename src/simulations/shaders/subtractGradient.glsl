precision highp float;

uniform vec2 iResolution;
uniform sampler2D uVelocity;
uniform sampler2D uPressure;

void main() {
  vec2 uv = gl_FragCoord.xy / iResolution;
  vec2 texel = 1.0 / iResolution;

  vec2 vel = texture2D(uVelocity, uv).xy;

  float pL = texture2D(uPressure, uv - vec2(texel.x, 0.0)).x;
  float pR = texture2D(uPressure, uv + vec2(texel.x, 0.0)).x;
  float pB = texture2D(uPressure, uv - vec2(0.0, texel.y)).x;
  float pT = texture2D(uPressure, uv + vec2(0.0, texel.y)).x;

  // grad(P) approximated with central differences.
  vec2 gradP = 0.5 * vec2(pR - pL, pT - pB);
  vel -= gradP;

  gl_FragColor = vec4(vel, 0.0, 1.0);
}

