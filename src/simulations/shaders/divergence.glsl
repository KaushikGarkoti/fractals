precision highp float;

uniform vec2 iResolution;
uniform sampler2D uVelocity; // encoded as signed velocity in xy

void main() {
  vec2 uv = gl_FragCoord.xy / iResolution;
  vec2 texel = 1.0 / iResolution;

  // Neighbor velocities (2D grid).
  float vxL = texture2D(uVelocity, uv - vec2(texel.x, 0.0)).x;
  float vxR = texture2D(uVelocity, uv + vec2(texel.x, 0.0)).x;
  float vyB = texture2D(uVelocity, uv - vec2(0.0, texel.y)).y;
  float vyT = texture2D(uVelocity, uv + vec2(0.0, texel.y)).y;

  // Divergence: dVx/dx + dVy/dy (grid spacing assumed 1).
  float div = 0.5 * ((vxR - vxL) + (vyT - vyB));

  gl_FragColor = vec4(div, 0.0, 0.0, 1.0);
}

