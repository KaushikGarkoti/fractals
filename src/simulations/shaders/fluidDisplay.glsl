precision highp float;

uniform vec2      iResolution;
uniform sampler2D uDyeTex;
uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform sampler2D uPressure;
uniform float     uExposure;
uniform float     uGlowRadius;
uniform float     uColormap;

vec3 acesFilm(vec3 x) {
  float a = 2.51;
  float b = 0.03;
  float c = 2.43;
  float d = 0.59;
  float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

void main() {
  vec2 uv = gl_FragCoord.xy / iResolution;

  // Dye colour
  vec3 dye = texture2D(uDyeTex, uv).rgb;

  // Velocity mapped to a subtle colour offset (same as reference)
  vec3 vdata = (texture2D(uVelocity, uv).rgb * 0.5 + 0.5) * 0.007;
  float cdata = texture2D(uCurl, uv).r * 0.01;

  // Gray base (0.6) shifted by velocity — gives the "liquid body" background
  float x = 0.6 + vdata.x;
  float y = 0.6 + vdata.y;
  float z = 0.6 + vdata.z;
  vec3 vcol = vec3(x, y, z);

  // Dye sits on top of the velocity background
  vec3 fcol = dye + vcol * 0.25;

  fcol *= uExposure;

  // ACES filmic tonemap — same as reference
  gl_FragColor = vec4(acesFilm(fcol), 1.0);
}
