precision highp float;

uniform vec2  iResolution;
uniform float iTime;
uniform float iViewScale;
uniform vec2  iCenter;
uniform float iAmplitude;
uniform float iPhaseShift;  // mouse X → shifts all phases
uniform float iAmpMod;      // mouse Y → scales amplitude
uniform float iRibDensity;  // W/Q key

#define TAU      6.28318530718
#define N_WAVES  6
#define N_RIBBON 4

// ─── color ─────────────────────────────────────────────────────────────────

vec3 hsv(float h, float s, float v) {
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(vec3(h) + K.xyz) * 6.0 - K.www);
  return v * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), s);
}

// ─── noise for cloud background ────────────────────────────────────────────

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  float a = hash(i), b = hash(i+vec2(1,0)), c = hash(i+vec2(0,1)), d = hash(i+vec2(1,1));
  vec2 u = f*f*(3.0-2.0*f);
  return mix(a,b,u.x) + (c-a)*u.y*(1.0-u.x) + (d-b)*u.x*u.y;
}

// ─── main ───────────────────────────────────────────────────────────────────

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * iResolution.xy) / iResolution.y;

  // mild perspective warp — waves converge slightly like a stage
  uv.x *= 1.0 + uv.y * 0.15;

  vec2 p = iCenter + uv * iViewScale;

  vec3 col = vec3(0.0);

  for (int i = 0; i < N_WAVES; i++) {
    float fi   = float(i);
    float fn   = float(N_WAVES);

    // Fourier harmonics — each wave is a multiple of the base frequency
    float freq  = (fi + 1.0) * 1.3;
    float speed = 0.35 + fi * 0.07;
    float phase = fi * TAU / fn
                + iTime * speed
                + iPhaseShift * TAU * 2.0;

    float amp = iAmplitude * iAmpMod / (1.0 + fi * 0.28);

    // wave shape: fundamental + second harmonic for richer curves
    float yw = amp * sin(freq * p.x + phase)
             + amp * 0.3 * sin(freq * 2.0 * p.x - phase * 1.4);

    float dist = abs(p.y - yw);

    // wave color — each harmonic gets its own hue
    vec3 waveCol = hsv(fi / fn + iTime * 0.012, 0.85, 1.0);

    // sharp core line
    float core = exp(-dist * 130.0);
    // wide soft halo
    float halo = exp(-dist * 16.0) * 0.35;

    // rib modulation: brightens at regular x intervals (the mesh look)
    float ribFreq = iRibDensity * (6.0 + fi * 1.5);
    float rib = pow(max(0.0, sin(p.x * ribFreq + phase * 0.4)), 3.0);

    col += waveCol * ((core * (0.55 + 0.45 * rib)) + halo);

    // ribbon strands: N_RIBBON faint parallel curves above/below
    for (int r = 1; r <= N_RIBBON; r++) {
      float fr  = float(r);
      float sep = 0.018 * amp * fr;
      float da  = abs(p.y - yw - sep);
      float db  = abs(p.y - yw + sep);
      float strand = (exp(-da * 160.0) + exp(-db * 160.0)) * (0.18 / fr);
      col += waveCol * strand;
    }
  }

  // ── background: deep space with faint nebula clouds ──────────────────────
  float cloudA = noise(uv * 3.0 + vec2(iTime * 0.04, 0.0));
  float cloudB = noise(uv * 5.0 - vec2(0.0, iTime * 0.03));
  float cloud  = cloudA * cloudB * 0.18;

  vec3 bgTop = vec3(0.04, 0.01, 0.10);
  vec3 bgBot = vec3(0.08, 0.03, 0.04);
  vec3 bg = mix(bgTop, bgBot, uv.y * 0.5 + 0.5) + vec3(0.3, 0.15, 0.5) * cloud;

  col = bg + col;

  // HDR tonemap
  col = 1.0 - exp(-col * 1.4);

  // vignette
  col *= 1.0 - 0.55 * pow(dot(uv * 0.75, uv * 0.75), 1.2);

  gl_FragColor = vec4(col, 1.0);
}
