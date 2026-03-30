// ── Scene-specific uniforms ───────────────────────────────────────────────────
// Base uniforms (camera, light, look, env) are in engine/base.glsl

uniform float iSurfDist;
uniform float iBlend;
uniform float iBlobSpeed;
uniform float iBlobRadius;
uniform float iBlobOrbit;
uniform vec3  iBaseColor;
uniform vec3  iInnerColor;
uniform float iRoughness;

#define MAX_STEPS 128
#define MAX_DIST  20.0

// ── SDF primitives ────────────────────────────────────────────────────────────

float sdSphere(vec3 p, float r) {
  return length(p) - r;
}

// Smooth minimum — the magic that makes separate spheres merge into blobs
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// Returns (distance, blend_factor) — blend_factor tracks how "inside" we are
vec2 sminWithBlend(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  float d = mix(b, a, h) - k * h * (1.0 - h);
  return vec2(d, h);
}

// ── Scene ─────────────────────────────────────────────────────────────────────

// Returns (signed_dist, color_trap)
vec2 sceneSDF(vec3 p) {
  float t = iTime * iBlobSpeed;
  float r = iBlobRadius;
  float o = iBlobOrbit;

  // Central blob
  float d = sdSphere(p, r * 0.75);

  // 4 orbiting blobs — different frequencies so they never sync up
  vec3 b1 = vec3(sin(t * 0.70)         * o,       cos(t * 0.50)         * o * 0.5, cos(t * 0.70)         * o);
  vec3 b2 = vec3(cos(t * 0.61 + 2.09)  * o,       sin(t * 0.83 + 1.00)  * o * 0.4, sin(t * 0.61 + 2.09)  * o * 0.85);
  vec3 b3 = vec3(sin(t * 0.53 + 4.19)  * o * 0.9, cos(t * 0.31 + 0.52)  * o * 0.6, cos(t * 0.53 + 4.19)  * o);
  vec3 b4 = vec3(cos(t * 0.43 + 1.05)  * o * 1.1, sin(t * 0.59 + 3.00)  * o * 0.3, sin(t * 0.43 + 1.05)  * o * 0.95);

  d = smin(d, sdSphere(p - b1, r),          iBlend);
  d = smin(d, sdSphere(p - b2, r * 0.90),   iBlend);
  d = smin(d, sdSphere(p - b3, r * 0.85),   iBlend);
  d = smin(d, sdSphere(p - b4, r * 0.95),   iBlend);

  // Color trap: distance from origin — 0 at merge points, 1 at surface edges
  float trap = clamp(length(p) / (o + r), 0.0, 1.0);

  return vec2(d, trap);
}

// ── Ray marcher ───────────────────────────────────────────────────────────────

vec3 march(vec3 ro, vec3 rd) {
  float t = 0.0;
  for (int i = 0; i < MAX_STEPS; i++) {
    vec2  res = sceneSDF(ro + rd * t);
    float d   = res.x;
    if (d < iSurfDist) return vec3(t, res.y, float(i));
    if (t > MAX_DIST)  break;
    t += d * 0.75;
  }
  return vec3(-1.0, 0.0, float(MAX_STEPS));
}

// ── Lighting helpers ──────────────────────────────────────────────────────────

vec3 calcNormal(vec3 p) {
  const float e = 0.001;
  vec2 k = vec2(1.0, -1.0);
  return normalize(
    k.xyy * sceneSDF(p + k.xyy*e).x +
    k.yyx * sceneSDF(p + k.yyx*e).x +
    k.yxy * sceneSDF(p + k.yxy*e).x +
    k.xxx * sceneSDF(p + k.xxx*e).x
  );
}

float calcAO(vec3 p, vec3 n) {
  float occ = 0.0, w = 1.0;
  for (int i = 1; i <= 5; i++) {
    float d = float(i) * 0.12;
    occ += w * (d - sceneSDF(p + n * d).x);
    w   *= 0.55;
  }
  return clamp(1.0 - occ * 1.8, 0.0, 1.0);
}

float softShadow(vec3 ro, vec3 rd) {
  float t = 0.05, res = 1.0;
  for (int i = 0; i < 12; i++) {
    float h = sceneSDF(ro + rd * t).x;
    res = min(res, 8.0 * h / t);
    t  += clamp(h, 0.02, 0.3);
    if (h < 0.001 || t > 8.0) break;
  }
  return clamp(res, 0.0, 1.0);
}

// ── Scene render (called by engine main) ─────────────────────────────────────

vec3 renderScene(vec3 ro, vec3 rd) {
  vec3  res = march(ro, rd);
  vec3  col;
  float hitDist = -1.0;

  float groundY   = iGroundY;
  float groundT   = (rd.y < -0.0001) ? (groundY - ro.y) / rd.y : -1.0;
  bool  hitGround = groundT > 0.01 && (res.x < 0.0 || groundT < res.x);

  if (hitGround) {
    hitDist = groundT;
    vec3 gp       = ro + rd * groundT;
    vec3 lightDir = normalize(iLightDir);

    vec3  groundAlbedo = sampleHDR(vec3(0.1, -0.4, 0.3)) * 1.1;
    float gNdotL  = max(dot(vec3(0.0, 1.0, 0.0), lightDir), 0.0);
    float gShadow = softShadow(gp + vec3(0.0, 0.02, 0.0), lightDir);
    float gAO     = smoothstep(0.0, 3.5, length(gp) - 1.0);

    col = groundAlbedo * (gNdotL * gShadow * 0.9 + 0.15) * mix(0.3, 1.0, gAO);
    col = mix(col, sampleHDR(rd) * 0.55, smoothstep(0.0, 8.0, groundT));

  } else if (res.x < 0.0) {
    col = sampleHDR(rd) * 0.55;
  } else {
    hitDist = res.x;
    vec3  p   = ro + rd * res.x;
    vec3  n   = calcNormal(p);
    float occ = calcAO(p, n);

    vec3 viewDir  = -rd;
    vec3 lightDir = normalize(iLightDir);
    vec3 halfDir  = normalize(lightDir + viewDir);

    float NdotL = max(dot(n, lightDir), 0.0);

    // Surface colour — inner merge zones get iInnerColor, outer edges iBaseColor
    vec3 surfColor = mix(iInnerColor, iBaseColor, res.y);

    // Glossy surface
    float rough     = clamp(iRoughness, 0.05, 1.0);
    float specPower = mix(16.0, 512.0, 1.0 - rough);
    float spec      = pow(max(dot(n, halfDir), 0.0), specPower) * (1.0 - rough * 0.8);

    vec3 envSpec = sampleHDR(reflect(rd, n));
    vec3 envDiff = sampleHDR(n);

    vec3 diffuse  = surfColor * (NdotL * 1.1 + 0.08);
    vec3 ambient  = envDiff * 0.5 * surfColor;
    vec3 specular = envSpec * spec * 0.4;

    col  = (diffuse + ambient + specular) * occ;
    col *= softShadow(p + n * 0.03, lightDir) * 0.75 + 0.25;
  }

  // Fog
  if (iFog > 0.0001 && hitDist > 0.0) {
    float fogAmt = 1.0 - exp(-hitDist * iFog);
    col = mix(col, sampleHDR(rd) * 0.55, fogAmt * 0.85);
  }

  return col;
}
