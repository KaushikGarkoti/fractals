precision highp float;

uniform vec2 iResolution;
uniform float iTime;
uniform float iViewScale;
uniform vec2 iCenter;
uniform float iColorPalette;
uniform vec2 iJuliaC;
uniform float iWarp;
uniform float iMouseInfluence;

#define MAX_ITER 512
#define TAU 6.28318530718

// ─── palette ───────────────────────────────────────────────────────────────

vec3 cospalette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
  return a + b * cos(TAU * (c * t + d));
}

vec3 getColor(float t, float palette) {
  t = fract(t);
  if (palette < 0.5) {
    return cospalette(t, vec3(0.5,0.4,0.3), vec3(0.5,0.4,0.3), vec3(1.0), vec3(0.00,0.10,0.20));
  } else if (palette < 1.5) {
    return cospalette(t, vec3(0.3,0.4,0.6), vec3(0.3), vec3(1.0,1.0,0.5), vec3(0.80,0.90,0.30));
  } else {
    return cospalette(t, vec3(0.4,0.5,0.3), vec3(0.3,0.3,0.2), vec3(0.9,0.7,0.8), vec3(0.00,0.15,0.40));
  }
}

// ─── noise / fbm ───────────────────────────────────────────────────────────

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p *= 2.0;
    a *= 0.5;
  }
  return v;
}

// ─── main ───────────────────────────────────────────────────────────────────

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * iResolution.xy) / iResolution.y;
  vec2 p = iCenter + uv * iViewScale;

  float t = iTime * 0.05;

  // domain warp applied to starting position
  vec2 warpField = vec2(
    fbm(p + vec2(0.0, 0.0) + t),
    fbm(p + vec2(5.2, 1.3) - t)
  );

  float warp = clamp(iWarp + iMouseInfluence, 0.0, 1.5);

  vec2 z = p + warp * warpField;
  vec2 c = iJuliaC;

  float smoothIt = 0.0;
  bool inside = true;

  for (int i = 0; i < MAX_ITER; i++) {
    float x = z.x*z.x - z.y*z.y + c.x;
    float y = 2.0*z.x*z.y + c.y;
    z = vec2(x, y);

    float r2 = dot(z, z);

    if (r2 > 1024.0) {
      float log_zn = log(r2) * 0.5;
      float nu = log(log_zn / log(2.0)) / log(2.0);
      smoothIt = float(i) + 1.0 - nu;
      inside = false;
      break;
    }
  }

  vec3 col;

  if (inside) {
    col = vec3(0.02, 0.02, 0.05);
  } else {
    float tcol = smoothIt / float(MAX_ITER);
    col = getColor(tcol * 2.0 + iTime * 0.02, iColorPalette);
  }

  col *= 1.0 - 0.25 * dot(uv, uv);
  col = pow(col, vec3(0.4545));

  gl_FragColor = vec4(col, 1.0);
}
