precision highp float;

uniform vec2 iResolution;
uniform sampler2D uDye;

uniform vec2  uPoint;  // UV [0,1]
uniform float uRadius; // UV radius
uniform vec3  uColor;  // injection color
uniform float uAmount; // density/amplitude
uniform float uDt;      // timestep multiplier

void main() {
  vec2 uv = gl_FragCoord.xy / iResolution;
  vec4 dye = texture2D(uDye, uv);

  vec2  d = uv - uPoint;
  float r2 = dot(d, d);
  float a  = exp(-r2 / max(1e-6, uRadius * uRadius));

  dye.rgb += uColor * a * uAmount * uDt;
  dye.a   += a * uAmount * uDt;

  gl_FragColor = dye;
}

