precision highp float;

uniform vec2 iResolution;
uniform sampler2D uVelocity;

uniform float uEdge;       // edge thickness in UV
uniform float uBounce;     // reflection factor
uniform float uFriction;   // tangential damping near wall

void main() {
  vec2 uv = gl_FragCoord.xy / iResolution;
  vec2 vel = texture2D(uVelocity, uv).xy;

  float left   = smoothstep(uEdge, 0.0, uv.x);
  float right  = smoothstep(1.0 - uEdge, 1.0, uv.x);
  float bottom = smoothstep(uEdge, 0.0, uv.y);
  float top    = smoothstep(1.0 - uEdge, 1.0, uv.y);

  // Reflect normal component when moving into the wall.
  if (left > 0.0 && vel.x < 0.0)  vel.x = -vel.x * uBounce;
  if (right > 0.0 && vel.x > 0.0) vel.x = -vel.x * uBounce;
  if (bottom > 0.0 && vel.y < 0.0) vel.y = -vel.y * uBounce;
  if (top > 0.0 && vel.y > 0.0)    vel.y = -vel.y * uBounce;

  // Extra damping close to walls to mimic boundary drag.
  float edgeAmt = max(max(left, right), max(bottom, top));
  vel *= mix(1.0, uFriction, edgeAmt);

  gl_FragColor = vec4(vel, 0.0, 1.0);
}

