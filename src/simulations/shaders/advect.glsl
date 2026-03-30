precision highp float;

uniform vec2 iResolution; // simulation texture size

uniform sampler2D uVelocity; // velocity field (for backtrace)
uniform sampler2D uSource;   // field being advected (vec4)

uniform float uDt;
uniform float uDissipation; // multiply by this to add damping

uniform float uMaxVelocity; // safety clamp (in UV/sec-ish units)
uniform float uVelocityScale;

void main() {
  vec2 uv = gl_FragCoord.xy / iResolution;

  vec2 vel = texture2D(uVelocity, uv).xy;
  vel = clamp(vel, vec2(-uMaxVelocity), vec2(uMaxVelocity));

  // Semi-Lagrangian advection: sample the source at the previous position.
  vec2 prevUV = uv - (uDt * uVelocityScale) * vel;
  prevUV = clamp(prevUV, 0.0, 1.0);

  vec4 src = texture2D(uSource, prevUV);
  gl_FragColor = src * uDissipation;
}

