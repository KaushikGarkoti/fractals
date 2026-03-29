import * as THREE from 'three';
import fragmentShader from '../shaders/mandelbulb.glsl?raw';

const state = {
  power:      8.0,
  colorShift: 0.0,
};

const uniforms = {
  iTime:       { value: 0 },
  iResolution: { value: new THREE.Vector2() },
  iPower:      { value: state.power },
  iMaxDist:    { value: 12.0 },
  iColorShift: { value: state.colorShift },
};

export default {
  name: 'Mandelbulb',

  fragmentShader,
  uniforms,

  init(w, h) {
    uniforms.iResolution.value.set(w, h);
  },

  reset() {
    state.power      = 8.0;
    state.colorShift = 0.0;
    uniforms.iPower.value      = state.power;
    uniforms.iColorShift.value = state.colorShift;
  },

  update(dt) {
    uniforms.iPower.value      = state.power;
    uniforms.iColorShift.value = state.colorShift;
    return false; // iTime driven by main.js render loop
  },

  // no pan/zoom — camera is fully animated
  zoomToward() {},
  pan() {},

  onKey(key) {
    if (key === 'w') { state.power = Math.min(12.0, state.power + 0.5); return true; }
    if (key === 'q') { state.power = Math.max(2.0,  state.power - 0.5); return true; }
    if (key === 'c') { state.colorShift = fract(state.colorShift + 0.1); return true; }
    return false;
  },

  getHUD() {
    return `
      <div class="title">MANDELBULB</div>
      <div class="sep"></div>
      <span class="dim">Power</span>
      <span class="val">${state.power.toFixed(1)}</span> <span class="dim">[W/Q]</span><br>
      <span class="dim">Color</span>
      <span class="val">${state.colorShift.toFixed(2)}</span> <span class="dim">[C]</span><br>
      <div class="sep"></div>
      <span class="dim">Camera auto-orbits</span>
    `;
  },
};

function fract(x) { return x - Math.floor(x); }
