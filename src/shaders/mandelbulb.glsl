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
#define SURF_DIST  0.0001
#define MAX_DIST   14.0

// ─── HDR sampling ─────────────────────────────────────────────────────────

vec3 sampleHDR(vec3 dir) {
  vec3 d = normalize(dir);
  float u = fract(atan(d.z, d.x) / TAU + 0.5);
  float v = asin(clamp(d.y, -1.0, 1.0)) / PI + 0.5;
  return texture2D(iEnvMap, vec2(u, v)).rgb;
}

// ─── noise for micro-variation ────────────────────────────────────────────

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p);
  f = f*f*(3.0-2.0*f);
  return mix(
    mix(mix(hash(i.xy), hash(i.xy+vec2(1,0)), f.x),
        mix(hash(i.xy+vec2(0,1)), hash(i.xy+vec2(1,1)), f.x), f.y),
    mix(mix(hash(i.xy+i.z), hash(i.xy+vec2(1,0)+i.z), f.x),
        mix(hash(i.xy+vec2(0,1)+i.z), hash(i.xy+vec2(1,1)+i.z), f.x), f.y),
    f.z);
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
      sin(theta) * sin(phi),
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
    t += d * 0.5;  // sharper geometry
  }
  return vec3(-1.0, trap, float(MAX_STEPS));
}

// ─── normal ───────────────────────────────────────────────────────────────

vec3 calcNormal(vec3 p) {
  float e = 0.0003;
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
    vec3  p    = ro + rd * res.x;
    vec3  n    = calcNormal(p);
    float occ  = calcAO(p, n);

    vec3  viewDir = normalize(-rd);
    vec3  ld      = normalize(vec3(1.0, 1.5, 0.8));

    // 1. Blinn-Phong specular
    vec3  halfDir = normalize(ld + viewDir);
    float spec    = pow(max(dot(n, halfDir), 0.0), 64.0);

    float diff    = clamp(dot(n, ld), 0.0, 1.0);

    // 2. Correct env lighting — diffuse from normal, specular from reflection
    vec3 reflDir  = reflect(rd, n);
    vec3 envDiffuse = sampleHDR(n)       * 0.25;
    vec3 envSpec    = sampleHDR(reflDir) * 0.6;

    // 3. Surface color with micro-variation
    vec3 matCol = orbitColor(res.y, res.z);
    vec3 texCol = triplanar(p, n, 1.2);
    matCol = mix(matCol, matCol * texCol * 2.2, 0.75);
    float variation = noise(p * 3.0);
    matCol *= mix(0.85, 1.15, variation);

    col  = matCol * (diff * 0.9 + envDiffuse + 0.05) * occ;
    col += envSpec * spec * occ;

    // 4. Curvature-based edge enhancement
    float edge = pow(1.0 - abs(dot(n, viewDir)), 2.0);
    col += edge * 0.4;

    // 6. Ground contact — darken underside
    float ground = smoothstep(0.0, 1.0, p.y + 1.0);
    col *= mix(0.6, 1.0, ground);
  }

  // tonemap + gamma
  col = 1.0 - exp(-col * 1.8);
  col = pow(clamp(col, 0.0, 1.0), vec3(0.4545));

  gl_FragColor = vec4(col, 1.0);
}
