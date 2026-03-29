precision highp float;

uniform vec2 iResolution;
uniform float iTime;
uniform float iViewScale;
uniform float iColorPalette;
uniform float iMaxIter;
uniform sampler2D iOrbitTex;
uniform float iOrbitLen;

#define MAX_ITER 512
#define ORBIT_SIZE 1024.0
#define TAU 6.28318530718

vec3 cospalette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
  return a + b * cos(TAU * (c * t + d));
}

vec3 getColor(float t, float palette) {
  t = fract(t);
  if (palette < 0.5) {
    return cospalette(t, vec3(0.5,0.4,0.3), vec3(0.5,0.4,0.3), vec3(1.0,1.0,1.0), vec3(0.00,0.10,0.20));
  } else if (palette < 1.5) {
    return cospalette(t, vec3(0.3,0.4,0.6), vec3(0.3,0.3,0.3), vec3(1.0,1.0,0.5), vec3(0.80,0.90,0.30));
  } else {
    return cospalette(t, vec3(0.4,0.5,0.3), vec3(0.3,0.3,0.2), vec3(0.9,0.7,0.8), vec3(0.00,0.15,0.40));
  }
}

vec4 fetchZdf(int idx) {
  float u = (float(idx) + 0.5) / ORBIT_SIZE;
  return texture2D(iOrbitTex, vec2(u, 0.5));
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * iResolution.xy) / iResolution.y;
  vec2 delta = uv * iViewScale;     // δc for this pixel

  int maxI = int(iMaxIter);
  int orbitLen = int(iOrbitLen);

  vec2 epsilon = vec2(0.0);         // perturbation starts at 0
  vec4 Zref4 = fetchZdf(0);
  int refIdx = 0;

  float smoothIt = 0.0;
  float minTrap = 1e10;
  bool inside = true;

  for (int i = 0; i < MAX_ITER; i++) {
    if (i >= maxI) break;

    // Correct double-double quadratic perturbation
    float ex = 2.0 * (Zref4.x * epsilon.x - Zref4.z * epsilon.y)
             + 2.0 * (Zref4.y * epsilon.x - Zref4.w * epsilon.y)
             + (epsilon.x * epsilon.x - epsilon.y * epsilon.y)
             + delta.x;

    float ey = 2.0 * (Zref4.x * epsilon.y + Zref4.z * epsilon.x)
             + 2.0 * (Zref4.y * epsilon.y + Zref4.w * epsilon.x)
             + 2.0 * epsilon.x * epsilon.y
             + delta.y;

    epsilon = vec2(ex, ey);

    // Advance reference orbit
    refIdx = min(refIdx + 1, orbitLen - 1);
    vec4 Znew4 = fetchZdf(refIdx);
    vec2 ZrefNew = vec2(Znew4.x, Znew4.z);

    // Full point for testing
    vec2 z = ZrefNew + epsilon;
    float r2 = dot(z, z);
    minTrap = min(minTrap, r2);

    if (r2 > 1024.0) {
      float log_zn = log(r2) * 0.5;
      float nu = log(log_zn / log(2.0)) / log(2.0);
      smoothIt = float(i) + 1.0 - nu;
      inside = false;
      break;
    }

    // Smart rebasing with glitch detection
    float eps2 = dot(epsilon, epsilon);
    float zRef2 = dot(ZrefNew, ZrefNew);
    float full_r2 = dot(z, z);
    float glitch = full_r2 / (zRef2 + 1e-12);

    if (refIdx >= orbitLen - 5 || eps2 > zRef2 || glitch < 1e-5 || eps2 > 4.0) {
      epsilon = z;                    // rebase perturbation to full value
      refIdx = 0;
      Zref4 = fetchZdf(0);
      continue;
    }

    Zref4 = Znew4;
  }

  // Coloring
  vec3 col;

  if (inside) {
    col = vec3(0.0); // 🖤 interior = black
  } else {
    float t = smoothIt / iMaxIter;

    vec3 wide = getColor(t * 3.5 + iTime * 0.02, iColorPalette);
    vec3 fine = getColor(t * 15.0, iColorPalette);

    col = mix(wide, fine, 0.28);
    col *= 0.55 + 0.45 * cos(smoothIt * 0.85);
  }

  // vignette + gamma (unchanged)
  col *= 1.0 - 0.22 * dot(uv, uv);
  col = pow(clamp(col, 0.0, 1.0), vec3(0.4545));

  gl_FragColor = vec4(col, 1.0);
}