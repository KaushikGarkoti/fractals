// ── Scene-specific uniforms ───────────────────────────────────────────────────
uniform float iWarpStrength;
uniform float iWarpScale;
uniform float iWarpSpeed;
uniform float iBaseRadius;
uniform float iOctaves;       // fBm octaves during marching (keep ≤ 3)
uniform float iDetailOctaves; // extra octaves for color at hit point only
uniform vec3  iInnerColor;
uniform vec3  iOuterColor;
uniform float iRoughness;
uniform float iSurfDist;

#define MAX_STEPS 64
#define MAX_DIST  18.0

// ── Noise ─────────────────────────────────────────────────────────────────────

float hash3(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.x + p.y) * p.z);
}

float noise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash3(i),             hash3(i+vec3(1,0,0)), f.x),
        mix(hash3(i+vec3(0,1,0)), hash3(i+vec3(1,1,0)), f.x), f.y),
    mix(mix(hash3(i+vec3(0,0,1)), hash3(i+vec3(1,0,1)), f.x),
        mix(hash3(i+vec3(0,1,1)), hash3(i+vec3(1,1,1)), f.x), f.y),
    f.z);
}

float fbm(vec3 p, float octs) {
  float v = 0.0, a = 0.5, f = 1.0;
  for (int i = 0; i < 8; i++) {
    if (float(i) >= octs) break;
    v += a * noise3(p * f);
    f *= 2.07;
    a *= 0.5;
  }
  return v;
}

// ── Domain warp ───────────────────────────────────────────────────────────────

vec3 warp(vec3 p, float t, float octs) {
  vec3 q;
  q.x = fbm(p * iWarpScale + vec3(0.00, 0.00, t),        octs);
  q.y = fbm(p * iWarpScale + vec3(5.20, 1.30, t * 0.85), octs);
  q.z = fbm(p * iWarpScale + vec3(1.70, 9.20, t * 1.15), octs);
  return (q * 2.0 - 1.0) * iWarpStrength;
}

// ── SDFs ──────────────────────────────────────────────────────────────────────

// Full warped SDF — only used inside the bounding sphere during marching
vec2 sceneSDF(vec3 p) {
  float t    = iTime * iWarpSpeed * 0.12;
  vec3  disp = warp(p, t, iOctaves);
  float d    = length(p + disp) - iBaseRadius;
  float trap = clamp(length(disp) / (iWarpStrength + 0.001), 0.0, 1.0);
  return vec2(d, trap);
}

// Fast SDF (sphere only) — used for normals, AO, and shadow where warp cost is too high
float sceneSDFFast(vec3 p) {
  return length(p) - iBaseRadius;
}

// ── Ray marcher (bounding sphere skip) ───────────────────────────────────────

vec3 march(vec3 ro, vec3 rd) {
  float boundR = iBaseRadius + iWarpStrength + 0.3;
  float t = 0.0;
  float trap = 0.0;
  for (int i = 0; i < MAX_STEPS; i++) {
    vec3 p = ro + rd * t;
    // Outside bounding sphere — step cheaply without evaluating warp
    float bound = length(p) - boundR;
    float d;
    if (bound > 0.3) {
      d = bound;
    } else {
      vec2 res = sceneSDF(p);
      d    = res.x;
      trap = res.y;
    }
    if (d < iSurfDist) return vec3(t, trap, float(i));
    if (t > MAX_DIST)  break;
    t += d * 0.65;
  }
  return vec3(-1.0, 0.0, float(MAX_STEPS));
}

// ── Normals & lighting ────────────────────────────────────────────────────────

// Uses fast SDF (no warp) — warp perturbation applied at hit point separately
vec3 calcNormal(vec3 p) {
  const float e = 0.003;
  vec2 k = vec2(1.0, -1.0);
  return normalize(
    k.xyy * sceneSDFFast(p + k.xyy*e) +
    k.yyx * sceneSDFFast(p + k.yyx*e) +
    k.yxy * sceneSDFFast(p + k.yxy*e) +
    k.xxx * sceneSDFFast(p + k.xxx*e)
  );
}

float calcAO(vec3 p, vec3 n) {
  float occ = 0.0, w = 1.0;
  for (int i = 1; i <= 3; i++) {        // 3 samples (was 5)
    float d = float(i) * 0.15;
    occ += w * (d - sceneSDFFast(p + n * d));
    w   *= 0.55;
  }
  return clamp(1.0 - occ * 1.8, 0.0, 1.0);
}

float softShadow(vec3 ro, vec3 rd) {
  float t = 0.05, res = 1.0;
  for (int i = 0; i < 6; i++) {         // 6 steps (was 10)
    float h = sceneSDFFast(ro + rd * t);
    res = min(res, 7.0 * h / t);
    t  += clamp(h, 0.03, 0.4);
    if (h < 0.001 || t > 8.0) break;
  }
  return clamp(res, 0.0, 1.0);
}

// ── Scene render ──────────────────────────────────────────────────────────────

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
    vec3 groundAlbedo = sampleHDR(vec3(0.1, -0.4, 0.3)) * 1.1;
    float gNdotL  = max(dot(vec3(0,1,0), lightDir), 0.0);
    float gShadow = softShadow(gp + vec3(0, 0.02, 0), lightDir);
    float gAO     = smoothstep(0.0, 3.5, length(gp) - 1.0);
    col = groundAlbedo * (gNdotL * gShadow * 0.9 + 0.15) * mix(0.3, 1.0, gAO);
    col = mix(col, sampleHDR(rd) * 0.55, smoothstep(0.0, 8.0, groundT));

  } else if (res.x < 0.0) {
    col = sampleHDR(rd) * 0.55;
  } else {
    hitDist = res.x;
    vec3 p = ro + rd * res.x;

    // Fast sphere normal, then perturb with warp gradient (one warp eval each axis)
    vec3 n = calcNormal(p);

    float t = iTime * iWarpSpeed * 0.12;
    float e = 0.06;
    float w0 = length(warp(p,               t, iOctaves));
    float wx = length(warp(p + vec3(e,0,0), t, iOctaves));
    float wy = length(warp(p + vec3(0,e,0), t, iOctaves));
    float wz = length(warp(p + vec3(0,0,e), t, iOctaves));
    vec3 wGrad = vec3(wx - w0, wy - w0, wz - w0) / e;
    n = normalize(n + wGrad * 0.6);

    float occ = calcAO(p, n);

    vec3  viewDir  = -rd;
    vec3  lightDir = normalize(iLightDir);
    vec3  halfDir  = normalize(lightDir + viewDir);
    float NdotL    = max(dot(n, lightDir), 0.0);

    // Color from warp — detail octaves evaluated once here
    vec3  dispHi   = warp(p, t, iDetailOctaves);
    float detailT  = clamp(length(dispHi) / (iWarpStrength + 0.001), 0.0, 1.0);
    vec3  surfColor = mix(iInnerColor, iOuterColor, detailT);

    // Extra swirl tint
    float swirl = fbm(p * iWarpScale * 1.4 + vec3(t * 0.4, 0.0, t * 0.25), iDetailOctaves);
    surfColor = mix(surfColor, surfColor * vec3(1.2, 0.85, 1.4), swirl * 0.3);

    float rough     = clamp(iRoughness, 0.05, 1.0);
    float specPower = mix(16.0, 512.0, 1.0 - rough);
    float spec      = pow(max(dot(n, halfDir), 0.0), specPower) * (1.0 - rough * 0.8);

    vec3 envSpec = sampleHDR(reflect(rd, n));
    vec3 envDiff = sampleHDR(n);

    col  = (surfColor * (NdotL * 1.1 + 0.08) + envDiff * 0.5 * surfColor + envSpec * spec * 0.35) * occ;
    col *= softShadow(p + n * 0.05, lightDir) * 0.75 + 0.25;
  }

  if (iFog > 0.0001 && hitDist > 0.0) {
    float fogAmt = 1.0 - exp(-hitDist * iFog);
    col = mix(col, sampleHDR(rd) * 0.55, fogAmt * 0.85);
  }

  return col;
}
