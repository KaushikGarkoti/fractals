precision highp float;

uniform vec2      iResolution; // simulation texture size
uniform sampler2D uVelocity;

uniform vec2  uPoint;   // UV in [0,1]
uniform vec2  uForce;   // velocity increment (already scaled by dt in JS or not; see usage)
uniform float uRadius;  // UV radius of the splat
uniform float uDt;      // timestep multiplier

void main() {
  vec2 uv = gl_FragCoord.xy / iResolution;
  vec2 vel = texture2D(uVelocity, uv).xy;

  vec2  d = uv - uPoint;
  float r2 = dot(d, d);
  float a  = exp(-r2 / max(1e-6, uRadius * uRadius));

  // Gaussian splat impulse.
  vel += uForce * a * uDt;

  gl_FragColor = vec4(vel, 0.0, 1.0);
}

