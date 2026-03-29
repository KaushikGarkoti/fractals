precision highp float;

uniform vec2  iResolution;
uniform float iTime;
uniform vec2  iCenter;
uniform float iViewScale;
uniform float iColorPalette;
uniform float iMaxIter;

#define MAX_ITER 128
#define TAU      6.28318530718
#define S3       1.7320508075688772  // sqrt(3)

// ─── Shared palette ───────────────────────────────────────────────────────────

vec3 cospalette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
  return a + b * cos(TAU * (c * t + d));
}

vec3 getColor(float t, float palette) {
  t = fract(t);
  if (palette < 0.5)
    return cospalette(t, vec3(0.5,0.4,0.3), vec3(0.5,0.4,0.3), vec3(1.0,1.0,1.0), vec3(0.00,0.10,0.20));
  else if (palette < 1.5)
    return cospalette(t, vec3(0.3,0.4,0.6), vec3(0.3,0.3,0.3), vec3(1.0,1.0,0.5), vec3(0.80,0.90,0.30));
  else
    return cospalette(t, vec3(0.4,0.5,0.3), vec3(0.3,0.3,0.2), vec3(0.9,0.7,0.8), vec3(0.00,0.15,0.40));
}

// ─── Main ─────────────────────────────────────────────────────────────────────

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * iResolution.xy) / iResolution.y;

  // World position in Sierpinski fractal space.
  // Triangle vertices: A=(0,0), B=(1,0), C=(0.5, S3/2)
  vec2 p = iCenter + uv * iViewScale;

  // Reject pixels outside the bounding equilateral triangle.
  // Edges: AB → y >= 0,  AC → y <= S3*x,  BC → y <= S3*(1-x)
  if (p.y < 0.0 || p.y > S3 * p.x || p.y > S3 * (1.0 - p.x)) {
    gl_FragColor = vec4(0.02, 0.02, 0.05, 1.0);
    return;
  }

  // ─── IFS escape-time iteration ─────────────────────────────────────────────
  // At each step: determine which sub-triangle p is in, then scale by 2 from
  // that vertex to zoom back into the original triangle.
  // If p falls into none of the three sub-triangles → it's in the middle "hole"
  // → escape (this is the fractal boundary).
  //
  // Sub-triangles (after removing the middle upside-down triangle):
  //   A region: A=(0,0),      midAB=(0.5,0),      midAC=(0.25, S3/4)
  //   B region: midAB=(0.5,0), B=(1,0),            midBC=(0.75, S3/4)
  //   C region: midAC=(0.25, S3/4), midBC=(0.75, S3/4), C=(0.5, S3/2)
  //
  // No floating-point precision tricks needed: each iteration only multiplies
  // by 2 and shifts, so accuracy doesn't decay with depth.

  int maxI    = int(iMaxIter);
  int escapeI = -1;

  for (int i = 0; i < MAX_ITER; i++) {
    if (i >= maxI) break;

    bool inA = p.y >= 0.0      && p.y <= S3 * p.x         && p.y <= S3 * (0.5 - p.x);
    bool inB = p.y >= 0.0      && p.y <= S3 * (p.x - 0.5) && p.y <= S3 * (1.0 - p.x) && p.x >= 0.5;
    bool inC = p.y >= S3 * 0.25 && p.y <= S3 * p.x        && p.y <= S3 * (1.0 - p.x);

    if (!inA && !inB && !inC) {
      // Middle hole — escaped
      escapeI = i;
      break;
    }

    // Scale by 2 from the containing sub-triangle's original vertex
    if      (inA) p  = p * 2.0;
    else if (inB) p  = p * 2.0 - vec2(1.0, 0.0);
    else          p  = p * 2.0 - vec2(0.5, S3 * 0.5);
  }

  // ─── Coloring ──────────────────────────────────────────────────────────────

  vec3 col;

  if (escapeI < 0) {
    // Interior (on the fractal dust): near-black
    col = vec3(0.0, 0.01, 0.02);
  } else {
    float fi = float(escapeI);
    float t  = fi / iMaxIter;

    vec3 wide = getColor(t * 4.0 + iTime * 0.03, iColorPalette);
    vec3 fine = getColor(fi * 0.15,              iColorPalette);
    col = mix(wide, fine, 0.35);
    col *= 0.6 + 0.4 * cos(fi * 0.9);
  }

  col *= 1.0 - 0.2 * dot(uv, uv);
  col  = pow(clamp(col, 0.0, 1.0), vec3(0.4545));
  gl_FragColor = vec4(col, 1.0);
}
