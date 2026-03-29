import * as THREE from 'three';
import fragmentShader from '../shaders/waveField.glsl?raw';

const state = {
  cx: 0, cy: 0, zoom: 1,
  amplitude:  0.28,
  phaseShift: 0,    // set by mouse X
  ampMod:     1.0,  // set by mouse Y
  ribDensity: 1.0,
};

const uniforms = {
  iTime:        { value: 0 },
  iResolution:  { value: new THREE.Vector2() },
  iViewScale:   { value: 2.2 },
  iCenter:      { value: new THREE.Vector2(0, 0) },
  iAmplitude:   { value: state.amplitude },
  iPhaseShift:  { value: 0 },
  iAmpMod:      { value: 1.0 },
  iRibDensity:  { value: state.ribDensity },
};

export default {
  name: 'Wave Field',

  fragmentShader,
  uniforms,

  init(w, h) {
    uniforms.iResolution.value.set(w, h);
    this.reset();
  },

  reset() {
    state.cx = 0; state.cy = 0; state.zoom = 1;
    state.amplitude  = 0.28;
    state.ribDensity = 1.0;
  },

  update(dt, mx, my, w, h) {
    uniforms.iViewScale.value = 2.2 / state.zoom;
    uniforms.iCenter.value.set(state.cx, state.cy);

    // mouse X → phase shift (moves waves horizontally)
    state.phaseShift = mx / w - 0.5;
    // mouse Y → amplitude mod (top = tall waves, bottom = flat)
    state.ampMod = 0.4 + (1.0 - my / h) * 1.2;

    uniforms.iAmplitude.value  = state.amplitude;
    uniforms.iPhaseShift.value = state.phaseShift;
    uniforms.iAmpMod.value     = state.ampMod;
    uniforms.iRibDensity.value = state.ribDensity;

    return true;
  },

  zoomToward(x, y, factor, w, h) {
    const mxRel = x / h - w / (2 * h);
    const myRel = 0.5 - y / h;
    const vs = 2.2 / state.zoom;
    const px = state.cx + vs * mxRel;
    const py = state.cy + vs * myRel;
    state.zoom *= factor;
    const ns = 2.2 / state.zoom;
    state.cx = px - ns * mxRel;
    state.cy = py - ns * myRel;
  },

  pan(dx, dy, h) {
    const vs = 2.2 / state.zoom;
    state.cx -= dx / h * vs;
    state.cy += dy / h * vs;
  },

  onKey(key) {
    if (key === 'w') { state.ribDensity = Math.min(3.0, state.ribDensity + 0.2); return true; }
    if (key === 'q') { state.ribDensity = Math.max(0.1, state.ribDensity - 0.2); return true; }
    if (key === 'e') { state.amplitude  = Math.min(0.6, state.amplitude  + 0.04); return true; }
    if (key === 'a') { state.amplitude  = Math.max(0.05, state.amplitude - 0.04); return true; }
    return false;
  },

  getHUD() {
    return `
      <div class="title">WAVE FIELD</div>
      <div class="sep"></div>
      <span class="dim">Amplitude</span>
      <span class="val">${state.amplitude.toFixed(2)}</span> <span class="dim">[E/A]</span><br>
      <span class="dim">Rib density</span>
      <span class="val">${state.ribDensity.toFixed(1)}</span> <span class="dim">[W/Q]</span><br>
      <span class="dim">Zoom</span>
      <span class="val">${state.zoom.toFixed(2)}×</span><br>
      <div class="sep"></div>
      <span class="dim">Mouse X → phase &nbsp; Y → height</span>
    `;
  },
};
