import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import fragmentShader from '../shaders/mandelbulb.glsl?raw';
import albedoUrl  from '../textures/coast_sand_rocks_02_2k/textures/coast_sand_rocks_02.webp?url';
import normalUrl  from '../textures/coast_sand_rocks_02_2k/textures/coast_sand_rocks_02_nor_gl_2k.jpg?url';
import roughUrl   from '../textures/coast_sand_rocks_02_2k/textures/coast_sand_rocks_02_rough_2k.jpg?url';
import hdrUrl     from '../textures/tree_lined_driveway_2k.hdr?url';

function loadTex(url) {
  return new THREE.TextureLoader().load(url, (tex) => {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.needsUpdate = true;
  });
}

const albedoMap    = loadTex(albedoUrl);
const normalMap    = loadTex(normalUrl);
const roughnessMap = loadTex(roughUrl);

// 1×1 black placeholder — replaced once HDR finishes loading
const envMap = new THREE.DataTexture(new Uint8Array([0,0,0,255]), 1, 1, THREE.RGBAFormat);
envMap.needsUpdate = true;

new RGBELoader().load(hdrUrl, (tex) => {
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  uniforms.iEnvMap.value = tex;
});

const cam = {
  theta:      0.4,      // horizontal angle (radians)
  phi:        0.3,      // vertical angle (radians)
  radius:     5.5,      // distance from origin
  autoOrbit:  true,     // resumes when idle
  idleTimer:  0,        // seconds since last interaction
};

const julia = {
  animating:  true,
  time:       0,
  cx: 0.0, cy: 0.0, cz: 0.0,
};

const state = {
  power:      8.0,
  colorShift: 0.0,
  mode:       0,        // 0 = Mandelbulb, 1 = Julia 3D
  morphTime:  0.0,
  morphing:   true,
  morphSpeed: 1.0,      // multiplier: 0.25=slow, 1=normal, 4=fast
};

const uniforms = {
  iTime:       { value: 0 },
  iResolution: { value: new THREE.Vector2() },
  iPower:      { value: state.power },
  iColorShift: { value: state.colorShift },
  iAlbedoMap:    { value: albedoMap },
  iNormalMap:    { value: normalMap },
  iRoughnessMap: { value: roughnessMap },
  iMode:       { value: 0 },
  iJuliaC:     { value: new THREE.Vector3() },
  iEnvMap:     { value: envMap },
  // camera — computed in JS, passed to shader
  iCamPos:     { value: new THREE.Vector3() },
  iCamRight:   { value: new THREE.Vector3() },
  iCamUp:      { value: new THREE.Vector3() },
  iCamForward: { value: new THREE.Vector3() },
};

function updateCamera(dt) {
  if (cam.autoOrbit) {
    cam.theta += dt * 0.18;
  }

  const x = cam.radius * Math.sin(cam.theta) * Math.cos(cam.phi);
  const y = cam.radius * Math.sin(cam.phi);
  const z = cam.radius * Math.cos(cam.theta) * Math.cos(cam.phi);

  const pos     = new THREE.Vector3(x, y, z);
  const forward = pos.clone().negate().normalize();
  const worldUp = new THREE.Vector3(0, 1, 0);
  const right   = new THREE.Vector3().crossVectors(forward, worldUp).normalize();
  const up      = new THREE.Vector3().crossVectors(right, forward);

  uniforms.iCamPos.value.copy(pos);
  uniforms.iCamForward.value.copy(forward);
  uniforms.iCamRight.value.copy(right);
  uniforms.iCamUp.value.copy(up);
}

export default {
  name: 'Mandelbulb',
  fragmentShader,
  uniforms,

  init(w, h) {
    uniforms.iResolution.value.set(w, h);
    updateCamera(0);
  },

  reset() {
    state.power      = 8.0;
    state.colorShift = 0.0;
    cam.theta        = 0.4;
    cam.phi          = 0.3;
    cam.radius       = 3.8;
    cam.autoOrbit    = true;
  },

  update(dt) {
    // idle timer — resume auto-orbit after 3s of no interaction
    if (!cam.autoOrbit) {
      cam.idleTimer += dt;
      if (cam.idleTimer > 3.0) cam.autoOrbit = true;
    }

    updateCamera(dt);

    if (state.morphing) {
      state.morphTime += dt * state.morphSpeed;
      const t = state.morphTime;
      // sum of sines at irrational ratios — never repeats, always drifting
      // centered at 6, amplitude ±2.5 → range [3.5, 8.5]
      const drift = Math.sin(t * 0.11)        * 0.8
                  + Math.sin(t * 0.17 + 1.3)  * 0.4
                  + Math.sin(t * 0.29 + 2.7)  * 0.2;
      state.power = 7.5 + drift; // range [6.5, 8.5] — stays in "solid ball" regime
    }

    uniforms.iPower.value      = state.power;
    uniforms.iColorShift.value = state.colorShift;
    uniforms.iMode.value       = state.mode;

    if (state.mode === 1 && julia.animating) {
      julia.time += dt;
      const t = julia.time;
      julia.cx = 0.28 * Math.sin(t * 0.13);
      julia.cy = 0.28 * Math.sin(t * 0.09 + 1.1);
      julia.cz = 0.28 * Math.sin(t * 0.11 + 2.4);
    }
    uniforms.iJuliaC.value.set(julia.cx, julia.cy, julia.cz);

    return true;
  },

  // ── drag to orbit ────────────────────────────────────────────────────────
  pan(dx, dy) {
    cam.theta     -= dx * 0.006;
    cam.phi        = Math.max(-1.2, Math.min(1.2, cam.phi + dy * 0.006));
    cam.autoOrbit  = false;
    cam.idleTimer  = 0;
  },

  // ── scroll to zoom ───────────────────────────────────────────────────────
  zoomToward(_x, _y, factor) {
    cam.radius     = Math.max(1.6, Math.min(8.0, cam.radius / factor));
    cam.autoOrbit  = false;
    cam.idleTimer  = 0;
  },

  onKey(key) {
    if (key === 'p') { state.morphing = !state.morphing; return true; }
    if (key === 'e') { state.morphSpeed = Math.min(8.0, state.morphSpeed * 2); return true; }
    if (key === 'r') { state.morphSpeed = Math.max(0.125, state.morphSpeed / 2); return true; }
    if (!state.morphing) {
      if (key === 'w') { state.power = Math.min(12.0, state.power + 0.5); return true; }
      if (key === 'q') { state.power = Math.max(2.0,  state.power - 0.5); return true; }
    }
    if (key === 'c') { state.colorShift = fract(state.colorShift + 0.1); return true; }
    if (key === 'j') {
      state.mode = state.mode === 0 ? 1 : 0;
      return true;
    }
    // Julia c manual nudge (when animation paused)
    if (state.mode === 1 && !julia.animating) {
      const step = 0.02;
      if (key === 'arrowleft')  { julia.cx -= step; return true; }
      if (key === 'arrowright') { julia.cx += step; return true; }
      if (key === 'arrowup')    { julia.cy += step; return true; }
      if (key === 'arrowdown')  { julia.cy -= step; return true; }
      if (key === 'z')          { julia.cz -= step; return true; }
      if (key === 'x')          { julia.cz += step; return true; }
    }
    if (key === ' ' && state.mode === 1) {
      julia.animating = !julia.animating;
      return true;
    }
    return false;
  },

  getHUD() {
    const c = uniforms.iJuliaC.value;
    return `
      <div class="title">MANDELBULB</div>
      <div class="sep"></div>
      <span class="dim">Mode</span>
      <span class="val">${state.mode === 0 ? 'Mandelbulb' : 'Julia 3D'}</span> <span class="dim">[J]</span><br>
      <span class="dim">Power</span>
      <span class="val">${state.power.toFixed(2)}</span>
      <span class="dim">${state.morphing ? '[P] stop' : '[P] start'}</span><br>
      <span class="dim">Morph speed</span>
      <span class="val">${state.morphSpeed.toFixed(2)}×</span> <span class="dim">[E/R]</span><br>
      <span class="dim">Color</span>
      <span class="val">${state.colorShift.toFixed(2)}</span> <span class="dim">[C]</span><br>
      <span class="dim">Zoom</span>
      <span class="val">${cam.radius.toFixed(2)}</span> <span class="dim">[scroll]</span><br>
      ${state.mode === 1 ? `
      <div class="sep"></div>
      <span class="dim">c = </span>
      <span class="val">${c.x.toFixed(3)}, ${c.y.toFixed(3)}, ${c.z.toFixed(3)}</span><br>
      <span class="dim">Animate</span>
      <span class="val">${julia.animating ? 'on' : 'off'}</span> <span class="dim">[Space]</span><br>
      ${!julia.animating ? '<span class="dim">← → ↑ ↓ c.xy &nbsp; Z/X c.z</span>' : ''}
      ` : ''}
      <div class="sep"></div>
      <span class="dim">Drag to orbit · ${cam.autoOrbit ? 'auto-orbit' : 'manual'}</span>
    `;
  },
};

function fract(x) { return x - Math.floor(x); }
