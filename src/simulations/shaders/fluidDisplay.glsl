precision highp float;

uniform vec2 iResolution;
uniform sampler2D uDyeTex;

void main() {
  vec2 uv = gl_FragCoord.xy / iResolution;
  vec4 dye = texture2D(uDyeTex, uv);

  // Simple filmic-ish tonemap; keeps dye bright without washing out.
  vec3 col = 1.0 - exp(-dye.rgb * 2.0);

  // Subtle vignette for depth.
  vec2 p = uv * 2.0 - 1.0;
  float vign = 1.0 - 0.35 * dot(p, p);
  col *= clamp(vign, 0.0, 1.0);

  gl_FragColor = vec4(col, 1.0);
}

