precision highp float;

uniform vec2 iResolution;
uniform sampler2D uVelocity;

uniform float uTime;
uniform float uDt;
uniform float uStrength;
uniform float uScale;
uniform float uSwirl;

// Cheap "universal" vector field: produces gentle motion everywhere.
// Projection (pressure solve) later enforces incompressibility.
vec2 field(vec2 uv) {
  vec2 p = uv * uScale;

  float a = sin((p.x + p.y) * 1.7 + uTime * 0.18);
  float b = cos((p.x - p.y) * 1.3 - uTime * 0.21);
  float c = sin(p.x * 2.1 + p.y * 1.9 + uTime * 0.12);
  float d = cos(p.x * 1.5 - p.y * 2.2 - uTime * 0.14);

  // Rotate-ish combination for swirling look.
  vec2 f = vec2(a + c, b + d);
  f = normalize(f + 1e-6);
  // swirl factor: pushes perpendicular component stronger.
  vec2 perp = vec2(-f.y, f.x);
  return mix(f, perp, uSwirl) * uStrength;
}

void main() {
  vec2 uv = gl_FragCoord.xy / iResolution;
  vec2 vel = texture2D(uVelocity, uv).xy;

  vec2 f = field(uv);
  vel += f * uDt;

  gl_FragColor = vec4(vel, 0.0, 1.0);
}

