precision highp float;

// ── Base uniforms ─────────────────────────────────────────────────────────────
uniform vec2      iResolution;
uniform float     iTime;
uniform vec3      iLightDir;
uniform vec3      iCamPos;
uniform vec3      iCamRight;
uniform vec3      iCamUp;
uniform vec3      iCamForward;
uniform sampler2D iEnvMap;
uniform float     iGroundY;
// DoF
uniform float iAperture;
uniform float iFocalDist;
// Look
uniform float iDistortion;
uniform float iFog;
uniform float iGrain;
uniform float iVignette;
uniform float iFov;
uniform float iExposure;
uniform float iWarmth;

#define PI  3.14159265359
#define TAU 6.28318530718

// ── HDR equirectangular sampler ───────────────────────────────────────────────
vec3 sampleHDR(vec3 dir) {
  vec3 d = normalize(dir);
  float u = fract(atan(d.z, d.x) / TAU + 0.5);
  float v = asin(clamp(d.y, -1.0, 1.0)) / PI + 0.5;
  return texture2D(iEnvMap, vec2(u, v)).rgb;
}

// ── Vogel-disk sample for DoF lens ────────────────────────────────────────────
vec2 diskSample(int i, float phi) {
  float golden = 2.399963; // golden angle (radians)
  float r      = sqrt((float(i) + 0.5) / 8.0);
  float theta  = float(i) * golden + phi;
  return vec2(r * cos(theta), r * sin(theta));
}

// ── Implemented by scene shader ───────────────────────────────────────────────
// Returns linear HDR colour (before tonemapping).
vec3 renderScene(vec3 ro, vec3 rd);

// ── Main ──────────────────────────────────────────────────────────────────────
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * iResolution.xy) / iResolution.y;

  // Barrel lens distortion
  if (iDistortion > 0.0001) {
    uv *= 1.0 + iDistortion * dot(uv, uv);
  }

  vec3 ro = iCamPos;
  // focal = 0.5 / tan(fov/2) — 0.5 matches UV normalised by viewport height
  float focal = 0.5 / tan(radians(iFov) * 0.5);
  vec3 rd = normalize(iCamForward * focal + uv.x * iCamRight + uv.y * iCamUp);

  vec3 col;

  if (iAperture < 0.0001) {
    // Single ray — no DoF cost
    col = renderScene(ro, rd);
  } else {
    // Thin-lens DoF: 8 Vogel-disk samples, all aimed at the focal point
    vec3  focalPt = ro + rd * iFocalDist;
    // Per-pixel rotation breaks up the spiral pattern between neighbours
    float phi = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) * TAU;

    col = vec3(0.0);
    for (int s = 0; s < 8; s++) {
      vec2 lens = diskSample(s, phi) * iAperture;
      vec3 lro  = ro + iCamRight * lens.x + iCamUp * lens.y;
      vec3 lrd  = normalize(focalPt - lro);
      col += renderScene(lro, lrd);
    }
    col /= 8.0;
  }

  // Tonemapping (Reinhard) + exposure + color temperature + gamma
  col *= iExposure;
  col  = col / (col + vec3(1.0));
  col *= vec3(1.0 + iWarmth, 1.0, 1.0 - iWarmth);
  col  = pow(clamp(col, 0.0, 1.0), vec3(0.4545));

  // Vignette
  if (iVignette > 0.0001) {
    vec2 vuv = gl_FragCoord.xy / iResolution.xy * 2.0 - 1.0;
    col *= 1.0 - iVignette * dot(vuv, vuv);
  }

  // Film grain (time-animated so it flickers per-frame)
  if (iGrain > 0.0001) {
    float grain = fract(sin(dot(gl_FragCoord.xy + iTime * 317.53, vec2(12.9898, 78.233))) * 43758.5453);
    col += (grain - 0.5) * iGrain;
  }

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
