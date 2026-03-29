precision highp float;

uniform vec2 iResolution;
uniform float iTime;
uniform float iViewScale;
uniform float iFreqScale;
uniform vec2 iCenter;
uniform float iColorPalette;

uniform float iWarp;
uniform float iMouseInfluence;

#define TAU 6.28318530718
#define MAX_OCTAVES 8

// ─── cosine palette ────────────────────────────────────────────────────────

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

// ─── noise ─────────────────────────────────────────────────────────────────

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

  return mix(a, b, u.x) +
         (c - a) * u.y * (1.0 - u.x) +
         (d - b) * u.x * u.y;
}

// ─── fbm ───────────────────────────────────────────────────────────────────

float fbm(vec2 p, float octaves) {
  float v = 0.0;
  float a = 0.5;

  for (int i = 0; i < MAX_OCTAVES; i++) {
    if (float(i) >= octaves) break;
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

  // 🔥 zoom-aware scaling
  float zoomFactor = 1.0 / iViewScale;

  // more detail when zooming in
  float octaves = clamp(3.0 + log(zoomFactor) * 1.2, 3.0, float(MAX_OCTAVES));

  // slow motion at deeper zoom
  float speed = max(0.01, 0.05 + 0.02 * log(zoomFactor));
  float t = iTime * speed;

  // base coordinates
  vec2 base = p * iFreqScale;

  // first warp layer
  vec2 q = vec2(
    fbm(base + vec2(0.0, 0.0) + t * 2.0, octaves),
    fbm(base + vec2(5.2, 1.3) - t * 2.0, octaves)
  );

  // second warp layer
  vec2 r = vec2(
    fbm(base + 4.0 * q + vec2(1.7, 9.2), octaves),
    fbm(base + 4.0 * q + vec2(8.3, 2.8), octaves)
  );

  // stable warp strength
  float warp = clamp(iWarp + iMouseInfluence, 0.0, 2.0);

  // final field
  float f = fbm(base + warp * r, octaves);

  // 🔥 contrast shaping (makes patterns pop)
  f = pow(f, 1.3);

  // 🎨 color
  vec3 col = getColor(f * 1.2 + t * 0.5, iColorPalette);

  // vignette
  col *= 1.0 - 0.25 * dot(uv, uv);

  gl_FragColor = vec4(col, 1.0);
}