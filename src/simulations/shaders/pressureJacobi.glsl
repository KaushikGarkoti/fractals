precision highp float;

uniform vec2 iResolution;
uniform sampler2D uPressure;
uniform sampler2D uDivergence;

void main() {
  vec2 uv = gl_FragCoord.xy / iResolution;
  vec2 texel = 1.0 / iResolution;

  float pL = texture2D(uPressure, uv - vec2(texel.x, 0.0)).x;
  float pR = texture2D(uPressure, uv + vec2(texel.x, 0.0)).x;
  float pB = texture2D(uPressure, uv - vec2(0.0, texel.y)).x;
  float pT = texture2D(uPressure, uv + vec2(0.0, texel.y)).x;

  float div = texture2D(uDivergence, uv).x;

  // Jacobi iteration for Poisson solve:
  // p = (pL + pR + pB + pT - div) / 4
  float p = 0.25 * (pL + pR + pB + pT - div);
  gl_FragColor = vec4(p, 0.0, 0.0, 1.0);
}

