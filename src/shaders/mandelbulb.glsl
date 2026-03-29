precision highp float;

uniform vec2  iResolution;
uniform float iTime;
uniform float iPower;       // bulb power (8 = classic), W/Q key
uniform float iMaxDist;     // max raymarch distance
uniform float iColorShift;  // C key palette shift

#define PI  3.14159265359
#define TAU 6.28318530718

#define MAX_STEPS  96
#define SURF_DIST  0.0005
#define MAX_DIST   12.0

// ─── rotation helpers ──────────────────────────────────────────────────────

mat2 rot2(float a) { float c=cos(a),s=sin(a); return mat2(c,-s,s,c); }

vec3 rotX(vec3 p, float a) { p.yz = rot2(a) * p.yz; return p; }
vec3 rotY(vec3 p, float a) { p.xz = rot2(a) * p.xz; return p; }
vec3 rotZ(vec3 p, float a) { p.xy = rot2(a) * p.xy; return p; }

// ─── Mandelbulb distance estimator ────────────────────────────────────────
// returns vec2(distance, orbit_trap)

vec2 mandelbulbDE(vec3 pos) {
  vec3  z    = pos;
  float dr   = 1.0;
  float r    = 0.0;
  float trap = 1e10;   // orbit trap — min distance to origin over orbit
  float power = iPower;

  for (int i = 0; i < 12; i++) {
    r = length(z);

    trap = min(trap, dot(z, z));  // closest approach to origin

    if (r > 2.0) break;

    // convert to polar
    float theta = acos(clamp(z.z / r, -1.0, 1.0));
    float phi   = atan(z.y, z.x);
    dr = pow(r, power - 1.0) * power * dr + 1.0;

    // scale and rotate
    float zr = pow(r, power);
    theta *= power;
    phi   *= power;

    // back to cartesian
    z = zr * vec3(
      sin(theta) * cos(phi),
      sin(theta) * sin(phi),
      cos(theta)
    ) + pos;
  }

  float dist = 0.5 * log(r) * r / dr;
  return vec2(dist, trap);
}

// ─── raymarch ─────────────────────────────────────────────────────────────
// returns vec3(hit_dist, orbit_trap, steps)

vec3 march(vec3 ro, vec3 rd) {
  float t    = 0.0;
  float trap = 0.0;
  for (int i = 0; i < MAX_STEPS; i++) {
    vec2 res = mandelbulbDE(ro + rd * t);
    float d  = res.x;
    trap     = res.y;
    if (d < SURF_DIST) return vec3(t, trap, float(i));
    if (t > MAX_DIST)  break;
    t += d * 0.55;   // conservative step — avoids missing thin features
  }
  return vec3(-1.0, trap, float(MAX_STEPS));
}

// ─── surface normal (finite differences) ──────────────────────────────────

vec3 normal(vec3 p) {
  float e = 0.001;
  vec2 k = vec2(1.0, -1.0);
  return normalize(
    k.xyy * mandelbulbDE(p + k.xyy*e).x +
    k.yyx * mandelbulbDE(p + k.yyx*e).x +
    k.yxy * mandelbulbDE(p + k.yxy*e).x +
    k.xxx * mandelbulbDE(p + k.xxx*e).x
  );
}

// ─── ambient occlusion ────────────────────────────────────────────────────

float ao(vec3 p, vec3 n) {
  float occ = 0.0;
  float w    = 1.0;
  for (int i = 1; i <= 5; i++) {
    float d = float(i) * 0.08;
    occ += w * (d - mandelbulbDE(p + n * d).x);
    w   *= 0.55;
  }
  return clamp(1.0 - occ * 2.8, 0.0, 1.0);
}

// ─── color from orbit trap ────────────────────────────────────────────────

vec3 orbitColor(float trap, float steps) {
  float t = clamp(trap * 0.55, 0.0, 1.0);
  float s = steps / float(MAX_STEPS);

  // base hue from trap distance + user shift
  float hue  = fract(t * 0.6 + s * 0.3 + iColorShift);
  float sat  = 0.55 + 0.3 * sin(t * PI);
  float val  = 0.5  + 0.5 * (1.0 - s);

  // hsv → rgb
  vec4  K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3  p2 = abs(fract(vec3(hue) + K.xyz) * 6.0 - K.www);
  return val * mix(K.xxx, clamp(p2 - K.xxx, 0.0, 1.0), sat);
}

// ─── main ─────────────────────────────────────────────────────────────────

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * iResolution.xy) / iResolution.y;

  // ── camera: orbit around bulb, slowly rolling ──
  float camSpeed = 0.18;
  float camAngleY = iTime * camSpeed;
  float camAngleX = sin(iTime * camSpeed * 0.4) * 0.4;

  float camDist = 2.6 + sin(iTime * 0.11) * 0.3;  // gentle zoom pulse

  vec3 ro = vec3(
    camDist * sin(camAngleY) * cos(camAngleX),
    camDist * sin(camAngleX),
    camDist * cos(camAngleY) * cos(camAngleX)
  );

  // look at origin
  vec3 forward = normalize(-ro);
  vec3 right   = normalize(cross(forward, vec3(0.0, 1.0, 0.0)));
  vec3 up      = cross(right, forward);

  float fl = 1.6;  // focal length
  vec3 rd  = normalize(forward * fl + uv.x * right + uv.y * up);

  // ── fractal self-rotation ──
  // rotate the sample space so the bulb tumbles
  // applied inside the DE via rotating the query point
  // (cheaper than rotating camera rig)

  // ── march ──
  vec3 res = march(ro, rd);

  vec3 col;

  if (res.x < 0.0) {
    // background — deep space gradient
    float bg = pow(max(0.0, dot(rd, vec3(0.0, 1.0, 0.0)) * 0.5 + 0.5), 2.0);
    col = mix(vec3(0.01, 0.01, 0.03), vec3(0.03, 0.01, 0.06), bg);
  } else {
    vec3 p = ro + rd * res.x;
    vec3 n = normal(p);
    float occ = ao(p, n);

    // lighting — one key light + soft fill
    vec3 ld1  = normalize(vec3(1.0, 1.5, 0.8));
    vec3 ld2  = normalize(vec3(-1.0, -0.5, -1.0));
    float diff1 = clamp(dot(n, ld1), 0.0, 1.0);
    float diff2 = clamp(dot(n, ld2), 0.0, 1.0) * 0.25;
    float spec  = pow(clamp(dot(reflect(-ld1, n), -rd), 0.0, 1.0), 24.0) * 0.4;

    vec3 matCol = orbitColor(res.y, res.z);

    col  = matCol * (diff1 + diff2 + 0.08) * occ;
    col += vec3(1.0, 0.95, 0.9) * spec * occ;

    // depth fog
    float fog = exp(-res.x * 0.18);
    col = mix(vec3(0.01, 0.01, 0.03), col, fog);
  }

  // tonemap + gamma
  col = 1.0 - exp(-col * 1.6);
  col = pow(clamp(col, 0.0, 1.0), vec3(0.4545));

  gl_FragColor = vec4(col, 1.0);
}
