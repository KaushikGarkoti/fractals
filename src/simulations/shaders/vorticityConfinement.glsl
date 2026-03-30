precision highp float;

uniform vec2 iResolution;
uniform sampler2D uVelocity; // xy = velocity
uniform float uDt;
uniform float uEps;

float curlAt(vec2 uv, vec2 texel) {
  // 2D curl scalar: w = dVy/dx - dVx/dy
  float vxL = texture2D(uVelocity, uv - vec2(texel.x, 0.0)).x;
  float vxR = texture2D(uVelocity, uv + vec2(texel.x, 0.0)).x;
  float vxB = texture2D(uVelocity, uv - vec2(0.0, texel.y)).x;
  float vxT = texture2D(uVelocity, uv + vec2(0.0, texel.y)).x;

  float vyL = texture2D(uVelocity, uv - vec2(texel.x, 0.0)).y;
  float vyR = texture2D(uVelocity, uv + vec2(texel.x, 0.0)).y;
  float vyB = texture2D(uVelocity, uv - vec2(0.0, texel.y)).y;
  float vyT = texture2D(uVelocity, uv + vec2(0.0, texel.y)).y;

  float dVyDx = 0.5 * (vyR - vyL);
  float dVxDy = 0.5 * (vxT - vxB);
  return dVyDx - dVxDy;
}

void main() {
  vec2 uv = gl_FragCoord.xy / iResolution;
  vec2 texel = 1.0 / iResolution;

  float wC = curlAt(uv, texel);

  float wL = curlAt(uv - vec2(texel.x, 0.0), texel);
  float wR = curlAt(uv + vec2(texel.x, 0.0), texel);
  float wB = curlAt(uv - vec2(0.0, texel.y), texel);
  float wT = curlAt(uv + vec2(0.0, texel.y), texel);

  vec2 gradAbsW = 0.5 * vec2(abs(wR) - abs(wL), abs(wT) - abs(wB));
  vec2 N = normalize(gradAbsW + 1e-6);

  // Force: eps * (N.y, -N.x) * w
  vec2 force = uEps * vec2(N.y, -N.x) * wC;

  vec2 vel = texture2D(uVelocity, uv).xy;
  vel += uDt * force;

  gl_FragColor = vec4(vel, 0.0, 1.0);
}

