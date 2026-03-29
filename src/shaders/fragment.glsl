precision highp float;

uniform vec2      iResolution;
uniform float     iTime;
uniform float     iViewScale;
uniform float     iColorPalette;
uniform float     iMaxIter;
uniform sampler2D iOrbitTex;
uniform float     iOrbitLen;

#define MAX_ITER   512
#define ORBIT_SIZE 1024.0
#define TAU        6.28318530718

// ─── Cosine palette ────────────────────────────────────────────────────────────

vec3 cospalette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
  return a + b * cos(TAU * (c * t + d));
}

vec3 getColor(float t, float palette) {
  t = fract(t);
  if (palette < 0.5) {
    // Fire
    return cospalette(t, vec3(0.5,0.4,0.3), vec3(0.5,0.4,0.3), vec3(1.0,1.0,1.0), vec3(0.00,0.10,0.20));
  } else if (palette < 1.5) {
    // Electric
    return cospalette(t, vec3(0.3,0.4,0.6), vec3(0.3,0.3,0.3), vec3(1.0,1.0,0.5), vec3(0.80,0.90,0.30));
  } else {
    // Emerald
    return cospalette(t, vec3(0.4,0.5,0.3), vec3(0.3,0.3,0.2), vec3(0.9,0.7,0.8), vec3(0.00,0.15,0.40));
  }
}

// ─── Reference orbit texture fetch ────────────────────────────────────────────

// RGBA = (Zx_hi, Zx_lo, Zy_hi, Zy_lo) — float64 orbit stored as hi+lo float32 pairs
vec4 fetchZdf(int idx) {
  float u = (float(idx) + 0.5) / ORBIT_SIZE;
  return texture2D(iOrbitTex, vec2(u, 0.5));
}

// ─── Main ──────────────────────────────────────────────────────────────────────

void main() {
  // Screen UV → complex-plane delta from reference center
  vec2 uv    = (gl_FragCoord.xy - 0.5 * iResolution.xy) / iResolution.y;
  vec2 delta = uv * iViewScale;

  int   maxI    = int(iMaxIter);
  int   orbitLen = int(iOrbitLen);

  vec2  epsilon = vec2(0.0);
  // Z stored as (Zx_hi, Zx_lo, Zy_hi, Zy_lo) — float64 split into two float32s
  vec4  Zprev4  = vec4(0.0);   // Z_0 = (0,0)
  int   refIdx  = 0;

  float smoothIt = 0.0;
  float minTrap  = 1e10;
  bool  inside   = true;

  for (int i = 0; i < MAX_ITER; i++) {
    if (i >= maxI) break;

    // ε_{n+1} = 2·Z_n·ε_n + ε_n² + δ
    // Z_n = (Zprev4.x + Zprev4.y) + i*(Zprev4.z + Zprev4.w)
    // Both hi and lo contribute — this extends accurate zoom range to ~1e30
    float ex = 2.0*(Zprev4.x*epsilon.x - Zprev4.z*epsilon.y)
             + 2.0*(Zprev4.y*epsilon.x - Zprev4.w*epsilon.y)
             + epsilon.x*epsilon.x - epsilon.y*epsilon.y
             + delta.x;
    float ey = 2.0*(Zprev4.x*epsilon.y + Zprev4.z*epsilon.x)
             + 2.0*(Zprev4.y*epsilon.y + Zprev4.w*epsilon.x)
             + 2.0*epsilon.x*epsilon.y
             + delta.y;
    epsilon = vec2(ex, ey);
    refIdx++;

    vec4 Znew4 = fetchZdf(refIdx);
    // Absolute position for escape/rebase checks (hi term dominates)
    vec2 z = vec2(Znew4.x + epsilon.x, Znew4.z + epsilon.y);

    float r2 = dot(z, z);
    minTrap = min(minTrap, r2);

    if (r2 > 256.0) {
      smoothIt = float(i) + 2.0 - log2(log2(r2) * 0.5);
      inside   = false;
      break;
    }

    // Rebase: perturbation has grown too large or orbit exhausted
    if (refIdx >= orbitLen || dot(epsilon, epsilon) > r2) {
      epsilon = z;
      refIdx  = 0;
      Zprev4  = vec4(0.0);
    } else {
      Zprev4 = Znew4;
    }
  }

  vec3 col;

  if (inside) {
    // Interior: near-black with faint orbit-trap glow
    col = vec3(0.0, 0.01, 0.03) + getColor(sqrt(minTrap) * 0.8, iColorPalette) * 0.06;
  } else {
    float t = smoothIt / iMaxIter;

    // Two-scale coloring: large gradient + fine iteration bands
    vec3 wide = getColor(t * 3.5 + iTime * 0.02, iColorPalette);
    vec3 fine = getColor(t * 15.0,               iColorPalette);
    col = mix(wide, fine, 0.28);

    // Modulate by iteration bands (brings out fractal texture)
    col *= 0.55 + 0.45 * cos(smoothIt * 0.85);
  }

  // Subtle vignette
  col *= 1.0 - 0.22 * dot(uv, uv);

  col = pow(clamp(col, 0.0, 1.0), vec3(0.4545));
  gl_FragColor = vec4(col, 1.0);
}
