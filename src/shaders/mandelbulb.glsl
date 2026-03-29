precision highp float;

uniform vec2  iResolution;
uniform float iTime;
uniform float iPower;
uniform float iColorShift;
uniform sampler2D iTexture;
uniform int   iMode;
uniform vec3  iJuliaC;
uniform vec3  iCamPos;
uniform vec3  iCamRight;
uniform vec3  iCamUp;
uniform vec3  iCamForward;
uniform sampler2D iEnvMap;

#define PI  3.14159265359
#define TAU 6.28318530718

#define MAX_STEPS  192
#define SURF_DIST  0.0005
#define MAX_DIST   14.0

// ─── HDR sampling ─────────────────────────────────────────────────────────

vec3 sampleHDR(vec3 dir) {
  vec3 d = normalize(dir);
  float u = fract(atan(d.z, d.x) / TAU + 0.5);
  float v = asin(clamp(d.y, -1.0, 1.0)) / PI + 0.5;
  return texture2D(iEnvMap, vec2(u, v)).rgb;
}

// ─── Mandelbulb DE ────────────────────────────────────────────────────────

vec2 mandelbulbDE(vec3 pos) {
  vec3  z     = pos;
  float dr    = 1.0;
  float r     = 0.0;
  float trap  = 1e10;
  float power = iPower;
  vec3  c     = (iMode == 1) ? iJuliaC : pos;

  for (int i = 0; i < 32; i++) {
    r = length(z);
    float t1 = dot(z, z);
    float t2 = abs(z.y) + abs(z.x) * 0.4;
    trap = min(trap, t1 * 0.5 + t2 * 0.5);
    if (r > 2.0) break;

    float theta = acos(clamp(z.z / r, -1.0, 1.0));
    float phi   = atan(z.y, z.x);
    dr = pow(r, power - 1.0) * power * dr + 1.0;

    float zr = pow(r, power);
    theta *= power;
    phi   *= power;

    z = zr * vec3(
      sin(theta) * cos(phi),
      sin(phi)   * sin(theta),
      cos(theta)
    ) + c;
  }

  float dist = max(0.00005, 0.5 * log(r) * r / dr);
  return vec2(dist, trap);
}

// ─── raymarch ─────────────────────────────────────────────────────────────

vec3 march(vec3 ro, vec3 rd) {
  float t = 0.0, trap = 0.0;
  for (int i = 0; i < MAX_STEPS; i++) {
    vec2  res = mandelbulbDE(ro + rd * t);
    float d   = res.x;
    trap = res.y;
    if (d < SURF_DIST) return vec3(t, trap, float(i));
    if (t > MAX_DIST)  break;
    t += d * 0.8;
  }
  return vec3(-1.0, trap, float(MAX_STEPS));
}

// ─── normal ───────────────────────────────────────────────────────────────

vec3 calcNormal(vec3 p) {
  float e = 0.001;
  vec2 k = vec2(1.0, -1.0);
  return normalize(
    k.xyy * mandelbulbDE(p + k.xyy*e).x +
    k.yyx * mandelbulbDE(p + k.yyx*e).x +
    k.yxy * mandelbulbDE(p + k.yxy*e).x +
    k.xxx * mandelbulbDE(p + k.xxx*e).x
  );
}

// ─── AO ───────────────────────────────────────────────────────────────────

float calcAO(vec3 p, vec3 n) {
  float occ = 0.0, w = 1.0;
  for (int i = 1; i <= 5; i++) {
    float d = float(i) * 0.08;
    occ += w * (d - mandelbulbDE(p + n * d).x);
    w   *= 0.55;
  }
  return clamp(1.0 - occ * 2.8, 0.0, 1.0);
}

// ─── soft shadow ──────────────────────────────────────────────────────────

float softShadow(vec3 ro, vec3 rd) {
  float t   = 0.02;
  float res = 1.0;
  for (int i = 0; i < 24; i++) {
    float h = mandelbulbDE(ro + rd * t).x;
    res = min(res, 8.0 * h / t);
    t += clamp(h, 0.02, 0.2);
    if (h < 0.001 || t > 6.0) break;
  }
  return clamp(res, 0.0, 1.0);
}

// ─── triplanar ────────────────────────────────────────────────────────────

vec3 triplanar(vec3 p, vec3 n, float scale) {
  vec3 blend = pow(abs(n), vec3(4.0));
  blend /= blend.x + blend.y + blend.z;
  return texture2D(iTexture, p.yz * scale).rgb * blend.x
       + texture2D(iTexture, p.xz * scale).rgb * blend.y
       + texture2D(iTexture, p.xy * scale).rgb * blend.z;
}

// ─── orbit color ──────────────────────────────────────────────────────────

vec3 orbitColor(float trap, float steps) {
  float t = clamp(sqrt(trap) * 0.7, 0.0, 1.0);
  float s = steps / float(MAX_STEPS);
  vec3 col1 = vec3(0.12, 0.06, 0.18);
  vec3 col2 = vec3(0.55, 0.38, 0.22) + vec3(0.0, 0.12, 0.08) * sin(t * PI * 3.0 + iColorShift * TAU);
  vec3 col3 = vec3(0.90, 0.85, 0.75);
  float m1 = smoothstep(0.0, 0.45, t);
  float m2 = smoothstep(0.45, 1.0, t);
  vec3 col = mix(mix(col1, col2, m1), col3, m2 * 0.6);
  col *= 0.5 + 0.5 * (1.0 - s * 0.7);
  return col;
}

// ─── main ─────────────────────────────────────────────────────────────────

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
    vec3  n   = calcNormal(p);
    float occ = calcAO(p, n);

    // PBR params
    float roughness = 0.35;
    vec3  viewDir   = normalize(-rd);
    vec3  lightDir  = normalize(vec3(1.0, 1.5, 0.8));
    vec3  halfDir   = normalize(lightDir + viewDir);
    vec3  reflDir   = reflect(rd, n);

    float NdotL = max(dot(n, lightDir), 0.0);
    float NdotH = max(dot(n, halfDir),  0.0);

    // GGX-style specular
    float specPower = mix(16.0, 128.0, 1.0 - roughness);
    float spec      = pow(NdotH, specPower);

    // Schlick fresnel
    float fresnel = pow(1.0 - max(dot(viewDir, n), 0.0), 5.0);

    // env
    vec3 envSpec = sampleHDR(reflDir);
    vec3 envDiff = sampleHDR(n);

    // base color
    vec3 baseColor = orbitColor(res.y, res.z);
    vec3 texCol    = triplanar(p, n, 1.2);
    baseColor *= texCol * 2.0;

    // micro-variation
    float variation = fract(sin(dot(p.xy, vec2(12.9898, 78.233))) * 43758.5453);
    baseColor *= mix(0.85, 1.15, variation);

    // lighting combine — boosted contrast so surface reads solid
    vec3 diffuse  = baseColor * (NdotL * 1.2 + 0.2);
    vec3 specular = envSpec * spec * 0.8;
    specular     += envSpec * fresnel * 0.5;
    vec3 ambient  = envDiff * 0.3 * baseColor;

    col = (diffuse + ambient + specular) * occ;

    // surface density — thickens the look
    float density = exp(-res.x * 2.0);
    col *= mix(0.7, 1.0, density);

    // interior thickness illusion
    float thickness = smoothstep(0.0, 1.0, res.x * 0.5);
    col *= 0.8 + 0.2 * thickness;

    // soft shadow
    float shadow = softShadow(p + n * 0.01, lightDir);
    col *= shadow * 0.85 + 0.15;

    // edge enhancement
    float edge = pow(1.0 - abs(dot(n, viewDir)), 2.5);
    col += edge * 0.25;

    // atmospheric fog
    vec3  bg  = sampleHDR(rd) * 0.55;
    float fog = exp(-res.x * 0.08);
    col = mix(bg, col, fog);
  }

  // filmic tonemap
  col = col / (col + vec3(1.0));

  // warm grade
  col *= vec3(1.05, 1.0, 0.95);

  // gamma
  col = pow(clamp(col, 0.0, 1.0), vec3(0.4545));

  gl_FragColor = vec4(col, 1.0);
}
