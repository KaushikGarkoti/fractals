precision highp float;

uniform vec2 iResolution;
uniform float iTime;
uniform float iViewScale;
uniform float iColorPalette;
uniform float iMaxIter;
uniform vec2 iCenter;
uniform int iVariant;
uniform float iPower;

// Julia constant
uniform vec2 iJuliaC;

#define MAX_ITER 512
#define TAU 6.28318530718

// ─── fbm warp (hybrid fractal+organic) ────────────────────────────────────
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  float a = hash(i), b = hash(i+vec2(1,0)), c = hash(i+vec2(0,1)), d = hash(i+vec2(1,1));
  vec2 u = f*f*(3.0-2.0*f);
  return mix(a,b,u.x) + (c-a)*u.y*(1.0-u.x) + (d-b)*u.x*u.y;
}
float fbm2(vec2 p) {
  return 0.5*noise(p) + 0.25*noise(p*2.0);
}

vec3 cospalette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
  return a + b * cos(TAU * (c * t + d));
}

vec3 getColor(float t, float palette) {
  t = fract(t);
  if (palette < 0.5) {
    return cospalette(t, vec3(0.5,0.4,0.3), vec3(0.5,0.4,0.3), vec3(1.0), vec3(0.00,0.10,0.20));
  } else if (palette < 1.5) {
    return cospalette(t, vec3(0.3,0.4,0.6), vec3(0.3), vec3(1.0,1.0,0.5), vec3(0.80,0.90,0.30));
  } else {
    return cospalette(t, vec3(0.4,0.5,0.3), vec3(0.3,0.3,0.2), vec3(0.9,0.7,0.8), vec3(0.00,0.15,0.40));
  }
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * iResolution.xy) / iResolution.y;
  vec2 z = iCenter + uv * iViewScale;

  vec2 c = iJuliaC;

  float smoothIt = 0.0;
  bool inside = true;

  for (int i = 0; i < MAX_ITER; i++) {
    if (i >= int(iMaxIter)) break;

    // subtle fbm warp — adds organic distortion without breaking structure
    vec2 warp = vec2(fbm2(z), fbm2(z + vec2(10.0, 0.0)));
    z += warp * 0.04;

    if (iVariant == 0) {
        // Classic Julia
        z = vec2(
        z.x*z.x - z.y*z.y,
        2.0*z.x*z.y
        ) + c;

    } else if (iVariant == 1) {
        // 🔥 Burning Ship
        z = vec2(abs(z.x), abs(z.y));
        z = vec2(
        z.x*z.x - z.y*z.y,
        2.0*z.x*z.y
        ) + c;

    } else if (iVariant == 2) {
        // 🌪 Tricorn
        z = vec2(z.x, -z.y);
        z = vec2(
        z.x*z.x - z.y*z.y,
        2.0*z.x*z.y
        ) + c;

    } else if (iVariant == 3) {
        // 🧬 Multibrot (power 3 example)
        float x = z.x;
        float y = z.y;

        z = vec2(
        x*x*x - 3.0*x*y*y,
        3.0*x*x*y - y*y*y
        ) + c;
    }

    float r2 = dot(z, z);

    if (r2 > 1024.0) {
      float log_zn = log(r2) * 0.5;
      float nu = log(log_zn / log(2.0)) / log(2.0);
      smoothIt = float(i) + 1.0 - nu;
      inside = false;
      break;
    }
  }

  vec3 col;

  if (inside) {
    col = vec3(0.0); // 🖤 match your Mandelbrot style
  } else {
    float t = smoothIt / iMaxIter;

    vec3 wide = getColor(t * 3.5 + iTime * 0.02, iColorPalette);
    vec3 fine = getColor(t * 15.0, iColorPalette);

    col = mix(wide, fine, 0.28);
    col *= 0.55 + 0.45 * cos(smoothIt * 0.85);
  }

  col *= 1.0 - 0.22 * dot(uv, uv);
  col = pow(clamp(col, 0.0, 1.0), vec3(0.4545));

  gl_FragColor = vec4(col, 1.0);
}