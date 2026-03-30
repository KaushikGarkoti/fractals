precision highp float;

uniform vec2  iResolution;
uniform float iTime;
uniform float iPower;
uniform float iColorShift;
uniform vec3      iLightDir;
uniform sampler2D iAlbedoMap;
uniform sampler2D iNormalMap;
uniform sampler2D iRoughnessMap;
uniform sampler2D iDispMap;
uniform float     iTexScale;
uniform float     iDispStrength;
uniform vec3      iColorTint;
uniform float     iCreviceDark;
uniform float     iNormalStrength;
uniform float     iRoughnessMix;
uniform float     iDetailIter;
uniform float     iNormalBlur;
uniform float     iSurfDist;
uniform float     iBailout;
uniform float     iGroundY;
uniform int   iMode;
uniform vec3  iJuliaC;
uniform vec3  iCamPos;
uniform vec3  iCamRight;
uniform vec3  iCamUp;
uniform vec3  iCamForward;
uniform sampler2D iEnvMap;
uniform float iAperture;
uniform float iFocalDist;
// Camera look
uniform float iDistortion;  // barrel lens distortion (0 = off)
uniform float iFog;         // atmospheric fog density (0 = off)
uniform float iGrain;       // film grain strength (0 = off)
uniform float iVignette;    // vignette strength (0 = off)
uniform float iFov;         // vertical FOV in degrees
uniform float iExposure;    // exposure multiplier before tonemapping
uniform float iWarmth;      // color temperature: >0 warm, <0 cool

#define PI        3.14159265359
#define TAU       6.28318530718
#define MAX_STEPS 256
#define SURF_DIST 0.0003
#define MAX_DIST  14.0

vec3 sampleHDR(vec3 dir) {
  vec3 d = normalize(dir);
  float u = fract(atan(d.z, d.x) / TAU + 0.5);
  float v = asin(clamp(d.y, -1.0, 1.0)) / PI + 0.5;
  return texture2D(iEnvMap, vec2(u, v)).rgb;
}

vec2 mandelbulbDE(vec3 pos) {
  vec3  z     = pos;
  float dr    = 1.0;
  float r     = 0.0;
  float trap  = 1e10;
  float power = iPower;
  vec3  c     = (iMode == 1) ? iJuliaC : pos;

  for (int i = 0; i < 50; i++) {
    if (float(i) >= iDetailIter) break;
    r = length(z);
    trap = min(trap, length(z));
    if (r > iBailout) break;

    float theta = acos(clamp(z.z / r, -1.0, 1.0));
    float phi   = atan(z.y, z.x);
    dr = pow(r, power - 1.0) * power * dr + 1.0;

    float zr = pow(r, power);
    theta *= power;
    phi   *= power;

    z = zr * vec3(sin(theta)*cos(phi), sin(phi)*sin(theta), cos(theta)) + c;
  }

  float dist = 0.5 * log(r) * r / dr;
  dist = max(dist, 0.00005);
  dist *= 0.9;

  return vec2(dist, trap);
}

vec3 march(vec3 ro, vec3 rd) {
  float t = 0.0, trap = 0.0;
  for (int i = 0; i < MAX_STEPS; i++) {
    vec2  res = mandelbulbDE(ro + rd * t);
    float d   = res.x;
    trap = res.y;
    if (d < iSurfDist) return vec3(t, trap, float(i));
    if (t > MAX_DIST)  break;
    t += d * 0.5;
  }
  return vec3(-1.0, trap, float(MAX_STEPS));
}

vec3 calcNormal(vec3 p) {
  const float e = 0.0007;
  vec2 k = vec2(1.0, -1.0);
  return normalize(
    k.xyy * mandelbulbDE(p + k.xyy*e).x +
    k.yyx * mandelbulbDE(p + k.yyx*e).x +
    k.yxy * mandelbulbDE(p + k.yxy*e).x +
    k.xxx * mandelbulbDE(p + k.xxx*e).x
  );
}

float calcAO(vec3 p, vec3 n) {
  float occ = 0.0, w = 1.0;
  for (int i = 1; i <= 5; i++) {
    float d = float(i) * 0.08;
    occ += w * (d - mandelbulbDE(p + n * d).x);
    w   *= 0.55;
  }
  return clamp(1.0 - occ * 1.5, 0.0, 1.0);
}

float softShadow(vec3 ro, vec3 rd) {
  float t = 0.02, res = 1.0;
  for (int i = 0; i < 8; i++) {
    float h = mandelbulbDE(ro + rd * t).x;
    res = min(res, 6.0 * h / t);
    t += clamp(h, 0.04, 0.25);
    if (h < 0.002 || t > 4.0) break;
  }
  return clamp(res, 0.0, 1.0);
}

vec3 triplanarAlbedo(vec3 p, vec3 blend, float scale) {
  return texture2D(iAlbedoMap, p.yz * scale).rgb * blend.x
       + texture2D(iAlbedoMap, p.xz * scale).rgb * blend.y
       + texture2D(iAlbedoMap, p.xy * scale).rgb * blend.z;
}

float triplanarDisp(vec3 p, vec3 blend, float scale) {
  return texture2D(iDispMap, p.yz * scale).r * blend.x
       + texture2D(iDispMap, p.xz * scale).r * blend.y
       + texture2D(iDispMap, p.xy * scale).r * blend.z;
}

float triplanarRoughness(vec3 p, vec3 blend, float scale) {
  return texture2D(iRoughnessMap, p.yz * scale).r * blend.x
       + texture2D(iRoughnessMap, p.xz * scale).r * blend.y
       + texture2D(iRoughnessMap, p.xy * scale).r * blend.z;
}

vec3 triplanarNormal(vec3 p, vec3 n, vec3 blend, float scale) {
  vec3 tnX = texture2D(iNormalMap, p.yz * scale).rgb * 2.0 - 1.0;
  vec3 tnY = texture2D(iNormalMap, p.xz * scale).rgb * 2.0 - 1.0;
  vec3 tnZ = texture2D(iNormalMap, p.xy * scale).rgb * 2.0 - 1.0;

  vec3 wX = vec3(tnX.z * sign(n.x), tnX.y, tnX.x * abs(n.x));
  vec3 wY = vec3(tnY.x, tnY.z * sign(n.y), tnY.y * abs(n.y));
  vec3 wZ = vec3(tnZ.x, tnZ.y, tnZ.z * sign(n.z));

  vec3 mapped = wX * blend.x + wY * blend.y + wZ * blend.z;
  return normalize(n + mapped * iNormalStrength);
}

// Returns a point on a unit disk using Vogel spiral (good distribution for few samples)
vec2 diskSample(int i, float phi) {
  float golden = 2.399963;
  float r      = sqrt((float(i) + 0.5) / 8.0);
  float theta  = float(i) * golden + phi;
  return vec2(r * cos(theta), r * sin(theta));
}

// Core scene render — returns linear HDR color (before tonemapping)
vec3 renderScene(vec3 ro, vec3 rd) {
  vec3 res = march(ro, rd);
  vec3 col;
  float hitDist = -1.0; // tracked for fog

  float groundY   = iGroundY;
  float groundT   = (rd.y < -0.0001) ? (groundY - ro.y) / rd.y : -1.0;
  bool  hitGround = groundT > 0.01 && (res.x < 0.0 || groundT < res.x);

  if (hitGround) {
    hitDist = groundT;
    vec3  gp          = ro + rd * groundT;
    vec3  groundNorm  = vec3(0.0, 1.0, 0.0);
    vec3  lightDir    = normalize(iLightDir);

    vec3  groundAlbedo = sampleHDR(vec3(0.1, -0.4, 0.3)) * 1.1;

    float gNdotL  = max(dot(groundNorm, lightDir), 0.0);
    float gShadow = softShadow(gp + groundNorm * 0.02, lightDir);

    float distToMB = length(gp);
    float gAO = smoothstep(0.0, 2.5, distToMB - 1.0);

    col = groundAlbedo * (gNdotL * gShadow * 0.9 + 0.15) * mix(0.3, 1.0, gAO);

    float horizonFade = smoothstep(0.0, 6.0, groundT);
    col = mix(col, sampleHDR(rd) * 0.55, horizonFade);

  } else if (res.x < 0.0) {
    // Sky — no fog applied
    col = sampleHDR(rd) * 0.55;
  } else {
    hitDist = res.x;
    vec3  p   = ro + rd * res.x;

    vec3 n1 = calcNormal(p);
    vec3 n2 = calcNormal(p + iNormalBlur);
    vec3 n3 = calcNormal(p - iNormalBlur);
    vec3  n   = normalize(n1 + n2 + n3);

    float occ = calcAO(p, n);

    vec3  viewDir  = -rd;
    vec3  lightDir = normalize(iLightDir);
    vec3  halfDir  = normalize(lightDir + viewDir);

    vec3 tblend = pow(abs(n), vec3(1.5));
    tblend /= (tblend.x + tblend.y + tblend.z);
    vec3 tPos = p;

    n = triplanarNormal(tPos, n, tblend, iTexScale);

    float eps = 0.02;
    float dC = triplanarDisp(tPos,              tblend, iTexScale);
    float dX = triplanarDisp(tPos + vec3(eps,0,0), tblend, iTexScale);
    float dY = triplanarDisp(tPos + vec3(0,eps,0), tblend, iTexScale);
    float dZ = triplanarDisp(tPos + vec3(0,0,eps), tblend, iTexScale);
    vec3 dispGrad = vec3(dX - dC, dY - dC, dZ - dC) / eps;
    n = normalize(n + dispGrad * iDispStrength * 8.0);

    float NdotL = max(dot(n, lightDir), 0.0);

    float roughMap = triplanarRoughness(tPos, tblend, iTexScale);
    float roughness = clamp(mix(0.75, roughMap, iRoughnessMix), 0.3, 1.0);
    float specPower = mix(8.0, 128.0, 1.0 - roughness);
    float spec = pow(max(dot(n, halfDir), 0.0), specPower);
    spec *= (1.0 - roughness);
    spec = pow(spec, 1.5);

    vec3 reflDir = reflect(rd, n);
    vec3 envSpec = sampleHDR(reflDir);
    vec3 envDiff = sampleHDR(n);

    vec3 albedo = triplanarAlbedo(tPos, tblend, iTexScale);
    float depth = clamp(sqrt(res.y) * 0.8, 0.0, 1.0);
    vec3 baseColor = albedo * iColorTint * mix(iCreviceDark, 1.0, depth);

    vec3 diffuse  = baseColor * (NdotL * 1.2 + 0.1);
    vec3 ambient  = envDiff * 0.4 * baseColor;
    vec3 specular = envSpec * spec * 0.06;

    col = (diffuse + ambient + specular) * occ;

    float shadow = softShadow(p + n * 0.01, lightDir);
    col *= shadow * 0.8 + 0.2;
  }

  // Atmospheric fog — exponential falloff toward sky colour
  if (iFog > 0.0001 && hitDist > 0.0) {
    float fogAmt = 1.0 - exp(-hitDist * iFog);
    col = mix(col, sampleHDR(rd) * 0.55, fogAmt * 0.85);
  }

  return col;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * iResolution.xy) / iResolution.y;

  // Barrel lens distortion
  if (iDistortion > 0.0001) {
    uv *= 1.0 + iDistortion * dot(uv, uv);
  }

  vec3 ro = iCamPos;
  // focal = 0.5 / tan(fov/2) — 0.5 matches UV normalised by height
  float focal = 0.5 / tan(radians(iFov) * 0.5);
  vec3 rd = normalize(iCamForward * focal + uv.x * iCamRight + uv.y * iCamUp);

  vec3 col;

  if (iAperture < 0.0001) {
    col = renderScene(ro, rd);
  } else {
    vec3 focalPt = ro + rd * iFocalDist;
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

  // Tonemapping + color grade + gamma
  col *= iExposure;
  col = col / (col + vec3(1.0));  // Reinhard
  col *= vec3(1.0 + iWarmth, 1.0, 1.0 - iWarmth);  // color temperature
  col = pow(clamp(col, 0.0, 1.0), vec3(0.4545));

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
