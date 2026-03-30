import * as THREE from 'three';
import { createScene } from '../engine/SceneBase.js';
import fragmentShader from '../shaders/mandelbulb.glsl?raw';
import albedoUrl from '../textures/cloud3.jpg?url';
import normalUrl from '../textures/coast_sand_rocks_02_2k/textures/coast_sand_rocks_02_nor_gl_2k.jpg?url';
import roughUrl  from '../textures/coast_sand_rocks_02_2k/textures/coast_sand_rocks_02_rough_2k.jpg?url';
import dispUrl   from '../textures/coast_sand_rocks_02_2k/textures/coast_sand_rocks_02_disp_2k.jpg?url';
import hdrUrl    from '../textures/tree_lined_driveway_2k.hdr?url';

// ── Textures ──────────────────────────────────────────────────────────────────

function loadTex(url) {
  return new THREE.TextureLoader().load(url, (t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.needsUpdate = true;
  });
}

const albedoMap      = loadTex(albedoUrl);
const normalMap      = loadTex(normalUrl);
const roughnessMap   = loadTex(roughUrl);
const displacementMap = loadTex(dispUrl);

// ── Scene state ───────────────────────────────────────────────────────────────

const state = {
  power:      8.0,
  colorShift: 0.0,
  mode:       0,       // 0 = Mandelbulb, 1 = Julia 3D
  morphTime:  0.0,
  morphing:   true,
  morphSpeed: 6.875,
};

const julia = {
  animating: true,
  time: 0,
  cx: 0.0, cy: 0.0, cz: 0.0,
};

// ── Scene ─────────────────────────────────────────────────────────────────────

export default createScene({
  name: 'Mandelbulb',
  fragmentShader,
  hdrUrl,
  cameraDefaults: { theta: 0.4, phi: 0.3, radius: 5.5, jitter: 0.008 },
  cameraReset:    { theta: 0.4, phi: 0.3, radius: 3.8 },

  uniforms: {
    iPower:          { value: state.power },
    iColorShift:     { value: state.colorShift },
    iAlbedoMap:      { value: albedoMap },
    iNormalMap:      { value: normalMap },
    iRoughnessMap:   { value: roughnessMap },
    iDispMap:        { value: displacementMap },
    iTexScale:       { value: 1.3 },
    iCreviceDark:    { value: 0.12 },
    iNormalStrength: { value: 0.14 },
    iRoughnessMix:   { value: 0.21 },
    iDispStrength:   { value: 0.08 },
    iColorTint:      { value: new THREE.Color('#a58888') },
    iDetailIter:     { value: 33.0 },
    iNormalBlur:     { value: 0.005 },
    iSurfDist:       { value: 0.005 },
    iBailout:        { value: 2.0 },
    iMode:           { value: 0 },
    iJuliaC:         { value: new THREE.Vector3() },
    // Camera / Look overrides (engine defaults differ)
    iFov:        { value: 90.0 },
    iExposure:   { value: 2.0 },
    iWarmth:     { value: 0.06 },
    iDistortion: { value: 0.3 },
  },

  onInit(gui, uniforms) {
    const shape = gui.addFolder('Shape');
    shape.add(uniforms.iDetailIter, 'value', 4, 50, 1).name('Detail iterations');
    shape.add(uniforms.iNormalBlur, 'value', 0.001, 0.05, 0.001).name('Normal blur');
    shape.add(uniforms.iSurfDist,   'value', 0.0001, 0.005, 0.0001).name('Surface dist');

    const tex = gui.addFolder('Texture');
    tex.add(uniforms.iTexScale,       'value', 0.1, 6.0, 0.05).name('Scale');
    tex.add(uniforms.iCreviceDark,    'value', 0.0, 1.0, 0.01).name('Crevice darkness');
    tex.add(uniforms.iNormalStrength, 'value', 0.0, 0.5, 0.01).name('Normal strength');
    tex.add(uniforms.iRoughnessMix,   'value', 0.0, 1.0, 0.01).name('Roughness mix');
    tex.add(uniforms.iDispStrength,   'value', 0.0, 0.08, 0.001).name('Displacement');
    const tintProxy = { color: '#a58888' };
    tex.addColor(tintProxy, 'color').name('Color tint').onChange(v => uniforms.iColorTint.value.set(v));

    const fractal = gui.addFolder('Fractal');
    fractal.add(state, 'morphing').name('Morph');
    fractal.add(state, 'morphSpeed', 0.125, 8.0, 0.125).name('Morph speed');
    fractal.add(state, 'power', 2.0, 12.0, 0.1).name('Power')
      .listen()
      .onChange(v => { state.morphing = false; uniforms.iPower.value = v; });
    fractal.add(uniforms.iBailout, 'value', 1.0, 6.0, 0.1).name('Bailout');
    fractal.add(state, 'colorShift', 0.0, 1.0, 0.01).name('Color shift');

    const juliaFolder = gui.addFolder('Julia C');
    juliaFolder.add(julia, 'cx', -1.0, 1.0, 0.001).name('cx').listen();
    juliaFolder.add(julia, 'cy', -1.0, 1.0, 0.001).name('cy').listen();
    juliaFolder.add(julia, 'cz', -1.0, 1.0, 0.001).name('cz').listen();
    juliaFolder.add(julia, 'animating').name('Animate').onChange(v => { julia.animating = v; });
    juliaFolder.close();
  },

  onUpdate(dt, uniforms) {
    if (state.morphing) {
      state.morphTime += dt * state.morphSpeed;
      const t     = state.morphTime;
      const drift = Math.sin(t * 0.11)       * 0.8
                  + Math.sin(t * 0.17 + 1.3) * 0.4
                  + Math.sin(t * 0.29 + 2.7) * 0.2;
      state.power = 7.5 + drift;
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
  },

  onKey(key, _uniforms) {
    if (key === 'p') { state.morphing = !state.morphing; return true; }
    if (key === 'e') { state.morphSpeed = Math.min(8.0, state.morphSpeed * 2); return true; }
    if (key === 'r') { state.morphSpeed = Math.max(0.125, state.morphSpeed / 2); return true; }
    if (!state.morphing) {
      if (key === 'w') { state.power = Math.min(12.0, state.power + 0.5); return true; }
      if (key === 'q') { state.power = Math.max(2.0,  state.power - 0.5); return true; }
    }
    if (key === 'c') { state.colorShift = fract(state.colorShift + 0.1); return true; }
    if (key === 'j') { state.mode = state.mode === 0 ? 1 : 0; return true; }
    if (state.mode === 1 && !julia.animating) {
      const step = 0.02;
      if (key === 'arrowleft')  { julia.cx -= step; return true; }
      if (key === 'arrowright') { julia.cx += step; return true; }
      if (key === 'arrowup')    { julia.cy += step; return true; }
      if (key === 'arrowdown')  { julia.cy -= step; return true; }
      if (key === 'z')          { julia.cz -= step; return true; }
      if (key === 'x')          { julia.cz += step; return true; }
    }
    if (key === ' ' && state.mode === 1) { julia.animating = !julia.animating; return true; }
    return false;
  },

  onGetHUD(uniforms, cam) {
    const c = uniforms.iJuliaC.value;
    return `
      <div class="title">MANDELBULB</div>
      <div class="sep"></div>
      <span class="dim">Mode</span>
      <span class="val">${state.mode === 0 ? 'Mandelbulb' : 'Julia 3D'}</span> <span class="dim">[J]</span><br>
      <span class="dim">Power</span> <span class="val">${state.power.toFixed(2)}</span>
      <span class="dim">${state.morphing ? '[P] stop' : '[P] start'}</span><br>
      <span class="dim">Morph speed</span> <span class="val">${state.morphSpeed.toFixed(2)}×</span> <span class="dim">[E/R]</span><br>
      <span class="dim">Color</span> <span class="val">${state.colorShift.toFixed(2)}</span> <span class="dim">[C]</span><br>
      <span class="dim">Zoom</span> <span class="val">${cam.radius.toFixed(2)}</span> <span class="dim">[scroll]</span><br>
      ${state.mode === 1 ? `
      <div class="sep"></div>
      <span class="dim">c = </span>
      <span class="val">${c.x.toFixed(3)}, ${c.y.toFixed(3)}, ${c.z.toFixed(3)}</span><br>
      <span class="dim">Animate</span> <span class="val">${julia.animating ? 'on' : 'off'}</span> <span class="dim">[Space]</span><br>
      ${!julia.animating ? '<span class="dim">← → ↑ ↓ c.xy &nbsp; Z/X c.z</span>' : ''}
      ` : ''}
      <div class="sep"></div>
      <span class="dim">Drag to orbit · ${cam.autoOrbit ? 'auto-orbit' : 'manual'}</span>
    `;
  },
});

function fract(x) { return x - Math.floor(x); }
