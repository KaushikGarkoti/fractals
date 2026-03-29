precision highp float;

uniform vec2  iResolution;
uniform float iTime;
uniform float iPower;
uniform float iColorShift;
uniform sampler2D iAlbedoMap;
uniform sampler2D iNormalMap;
uniform sampler2D iRoughnessMap;
uniform int   iMode;
uniform vec3  iJuliaC;
uniform vec3  iCamPos;
uniform vec3  iCamRight;
uniform vec3  iCamUp;
uniform vec3  iCamForward;
uniform sampler2D iEnvMap;

#define PI        3.14159265359
#define TAU       6.28318530718
#define MAX_STEPS 192
#define SURF_DIST 0.0005
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

  for (int i = 0; i < 32; i++) {
    r = length(z);
    trap = min(trap, dot(z,z) * 0.5 + (abs(z.y) + abs(z.x) * 0.4) * 0.5);
    if (r > 2.0) break;

    float theta = acos(clamp(z.z / r, -1.0, 1.0));
    float phi   = atan(z.y, z.x);
    dr = pow(r, power - 1.0) * power * dr + 1.0;

    float zr = pow(r, power);
    theta *= power;
    phi   *= power;

    z = zr * vec3(sin(theta)*cos(phi), sin(phi)*sin(theta), cos(theta)) + c;
  }

  return vec2(max(0.00005, 0.5 * log(r) * r / dr), trap);
}

vec3 march(vec3 ro, vec3 rd) {
  float t = 0.0, trap = 0.0;
  for (int i = 0; i < MAX_STEPS; i++) {
    vec2  res = mandelbulbDE(ro + rd * t);
    float d   = res.x;
    trap = res.y;
    if (d < SURF_DIST) return vec3(t, trap, float(i));
    if (t > MAX_DIST)  break;
    // smaller step near surface prevents tunnelling through thin walls
    t += d * (d < 0.01 ? 0.45 : 0.75);
  }
  return vec3(-1.0, trap, float(MAX_STEPS));
}

vec3 calcNormal(vec3 p) {
  // epsilon ~1.5x SURF_DIST for consistent precision
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
  return clamp(1.0 - occ * 2.8, 0.0, 1.0);
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

vec3 blend3(vec3 n) {
  vec3 b = abs(n);
  return b / (b.x + b.y + b.z);
}

vec3 triplanarAlbedo(vec3 p, vec3 blend, float scale) {
  return texture2D(iAlbedoMap, p.yz * scale).rgb * blend.x
       + texture2D(iAlbedoMap, p.xz * scale).rgb * blend.y
       + texture2D(iAlbedoMap, p.xy * scale).rgb * blend.z;
}

float triplanarRoughness(vec3 p, vec3 blend, float scale) {
  return texture2D(iRoughnessMap, p.yz * scale).r * blend.x
       + texture2D(iRoughnessMap, p.xz * scale).r * blend.y
       + texture2D(iRoughnessMap, p.xy * scale).r * blend.z;
}

// Triplanar normal map — decode each face, rotate into world space, blend
vec3 triplanarNormal(vec3 p, vec3 n, vec3 blend, float scale) {
  // decode [0,1] → [-1,1], GL convention (Y-up)
  vec3 tnX = texture2D(iNormalMap, p.yz * scale).rgb * 2.0 - 1.0;
  vec3 tnY = texture2D(iNormalMap, p.xz * scale).rgb * 2.0 - 1.0;
  vec3 tnZ = texture2D(iNormalMap, p.xy * scale).rgb * 2.0 - 1.0;

  // reorient each tangent-space normal into world space using the surface normal
  // swizzle: X-face uses (y,z,x) axes, Y-face (x,z,y), Z-face (x,y,z)
  vec3 wX = vec3(tnX.z * sign(n.x), tnX.y, tnX.x * abs(n.x));
  vec3 wY = vec3(tnY.x, tnY.z * sign(n.y), tnY.y * abs(n.y));
  vec3 wZ = vec3(tnZ.x, tnZ.y, tnZ.z * sign(n.z));

  // scale down tangent offsets so geometric normal dominates, texture only perturbs
  vec3 mapped = wX * blend.x + wY * blend.y + wZ * blend.z;
  return normalize(n + mapped * 0.4);
}

vec3 orbitColor(float trap, float steps) {
  float t = clamp(sqrt(trap) * 0.7, 0.0, 1.0);
  float s = steps / float(MAX_STEPS);
  // deep crevice → mid surface → outer highlights: dark gray → lavender-gray → light warm gray
  vec3 col1 = vec3(0.18, 0.16, 0.22);  // dark purple-gray (deep crevices)
  vec3 col2 = vec3(0.55, 0.52, 0.62) + vec3(0.04, 0.0, 0.06) * sin(t * PI * 2.0 + iColorShift * TAU);
  vec3 col3 = vec3(0.82, 0.80, 0.86);  // light lavender-gray (outer surface)
  vec3 col  = mix(mix(col1, col2, smoothstep(0.0, 0.45, t)), col3, smoothstep(0.45, 1.0, t) * 0.7);
  return col * (0.6 + 0.4 * (1.0 - s * 0.5));
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * iResolution.xy) / iResolution.y;

  vec3 ro = iCamPos;
  vec3 rd = normalize(iCamForward * 1.6 + uv.x * iCamRight + uv.y * iCamUp);

  vec3 res = march(ro, rd);
  vec3 col;

  if (res.x < 0.0) {
    col = sampleHDR(rd) * 0.55;
  } else {
    vec3  p   = ro + rd * res.x;

    // smooth normals: average 3 sample points to suppress micro-bump flicker
    const float nBlur = 0.003;
    vec3 n1 = calcNormal(p);
    vec3 n2 = calcNormal(p + nBlur);
    vec3 n3 = calcNormal(p - nBlur);
    vec3  n   = normalize(n1 + n2 + n3);

    float occ = calcAO(p, n);

    vec3  viewDir  = -rd;
    vec3  lightDir = normalize(vec3(1.0, 1.5, 0.8));
    vec3  halfDir  = normalize(lightDir + viewDir);

    // triplanar blend weights (shared by all texture samples)
    vec3 tblend = blend3(n);
    float tScale = 0.8;
    vec3  tPos   = p * 0.5;

    // normal map — perturb the smoothed geometric normal
    n = triplanarNormal(tPos, n, tblend, tScale);

    float NdotL = max(dot(n, lightDir), 0.0);

    // roughness from map, remapped so dark=smooth, bright=rough
    float roughness = clamp(triplanarRoughness(tPos, tblend, tScale), 0.3, 1.0);
    float specPower = mix(8.0, 128.0, 1.0 - roughness);
    float spec = pow(max(dot(n, halfDir), 0.0), specPower);
    spec *= (1.0 - roughness);
    spec = pow(spec, 1.5);

    vec3 reflDir = reflect(rd, n);
    vec3 envSpec = sampleHDR(reflDir);
    vec3 envDiff = sampleHDR(n);

    vec3 baseColor = orbitColor(res.y, res.z);

    // use albedo luminance only — adds surface value variation without shifting hue
    vec3  albedo    = triplanarAlbedo(tPos, tblend, tScale);
    float albedoLum = dot(albedo, vec3(0.299, 0.587, 0.114));
    baseColor *= mix(0.8, 1.15, albedoLum);

    float cavity = smoothstep(0.0, 1.0, res.y * 0.2);
    baseColor *= 0.8 + 0.2 * cavity;

    baseColor *= mix(0.85, 1.15, fract(sin(dot(p.xy, vec2(12.9898, 78.233))) * 43758.5453));

    vec3 diffuse  = baseColor * (NdotL * 1.4 + 0.05);
    vec3 specular = envSpec * spec * 0.15;

    float fresnel = pow(1.0 - max(dot(viewDir, n), 0.0), 5.0);
    specular += envSpec * fresnel * 0.08;

    col = diffuse * (1.0 - spec) + specular;

    vec3 ambient = envDiff * 0.35 * baseColor;
    col = (col + ambient) * occ * 1.3;

    col *= mix(0.7, 1.0, exp(-res.x * 2.0));
    col *= 0.8 + 0.2 * smoothstep(0.0, 1.0, res.x * 0.5);

    float shadow = softShadow(p + n * 0.01, lightDir);
    col *= shadow * 0.85 + 0.15;

    col += pow(1.0 - abs(dot(n, viewDir)), 2.5) * 0.08;
  }

  col = col / (col + vec3(1.0));
  col *= vec3(1.05, 1.0, 0.95);
  col = pow(clamp(col, 0.0, 1.0), vec3(0.4545));

  gl_FragColor = vec4(col, 1.0);
}
