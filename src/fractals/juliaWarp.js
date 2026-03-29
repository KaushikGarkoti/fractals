import * as THREE from 'three';
import fragmentShader from '../shaders/juliaWarp.glsl?raw';

const PRESETS = [
  { name: "🌀 Classic dendrite", cx: -0.70176, cy: -0.3842 },
  { name: "🌌 Seahorse style",   cx: -0.745,   cy: 0.113  },
  { name: "🔥 Lightning fractal",cx: 0.285,    cy: 0.01   },
  { name: "🧬 Connected structure", cx: -0.4,  cy: 0.6    },
];

const state = {
  cx: 0, cy: 0, zoom: 1,
  palette: 0,
  juliaCx: -0.4,
  juliaCy: 0.6,
  mouseControl: true,
  animating: false,
  time: 0,
  warp: 0.3,
  mouseInfluence: 0.0,
};

const uniforms = {
  iTime:           { value: 0 },
  iResolution:     { value: new THREE.Vector2() },
  iViewScale:      { value: 3 },
  iCenter:         { value: new THREE.Vector2(0, 0) },
  iColorPalette:   { value: 0 },
  iJuliaC:         { value: new THREE.Vector2(state.juliaCx, state.juliaCy) },
  iWarp:           { value: state.warp },
  iMouseInfluence: { value: 0.0 },
};

export default {
  name: 'Julia Warp',

  fragmentShader,
  uniforms,

  getPresets() { return PRESETS; },

  setPreset(index) {
    const p = PRESETS[index];
    state.juliaCx = p.cx;
    state.juliaCy = p.cy;
    state.mouseControl = false;
    uniforms.iJuliaC.value.set(state.juliaCx, state.juliaCy);
  },

  init(w, h) {
    uniforms.iResolution.value.set(w, h);
    this.reset();
    state.mouseControl = true;
    uniforms.iJuliaC.value.set(state.juliaCx, state.juliaCy);
  },

  reset() {
    state.cx = 0; state.cy = 0; state.zoom = 1;
    state.warp = 0.3;
  },

  update(dt, mx, my, w, h) {
    uniforms.iViewScale.value = 3.0 / state.zoom;
    uniforms.iCenter.value.set(state.cx, state.cy);
    uniforms.iColorPalette.value = state.palette;

    // mouse horizontal → warp influence
    state.mouseInfluence = (mx / w - 0.5) * 0.8;
    uniforms.iWarp.value = state.warp;
    uniforms.iMouseInfluence.value = state.mouseInfluence;

    if (state.animating) {
      state.time += dt;
      state.juliaCx = -0.7 + Math.sin(state.time * 0.6) * 0.2;
      state.juliaCy =  0.2 + Math.sin(state.time * 0.9) * 0.15;
    } else if (state.mouseControl) {
      const mxRel = mx / h - w / (2 * h);
      const myRel = 0.5 - my / h;
      const angle = Math.atan2(myRel, mxRel);
      const r = 0.35 + Math.min(Math.sqrt(mxRel*mxRel + myRel*myRel) / 0.7, 1.0) * 0.4;
      state.juliaCx = r * Math.cos(angle);
      state.juliaCy = r * Math.sin(angle);
    }
    uniforms.iJuliaC.value.set(state.juliaCx, state.juliaCy);

    return true;
  },

  zoomToward(x, y, factor, w, h) {
    const mxRel = x / h - w / (2 * h);
    const myRel = 0.5 - y / h;
    const vs = 3 / state.zoom;
    const px = state.cx + vs * mxRel;
    const py = state.cy + vs * myRel;
    state.zoom *= factor;
    const ns = 3 / state.zoom;
    state.cx = px - ns * mxRel;
    state.cy = py - ns * myRel;
  },

  pan(dx, dy, h) {
    const vs = 3.0 / state.zoom;
    state.cx -= dx / h * vs;
    state.cy += dy / h * vs;
  },

  onKey(key) {
    if (key === 'c') { state.palette = (state.palette + 1) % 3; return true; }
    if (key === 'j') {
      state.animating = !state.animating;
      if (state.animating) state.mouseControl = false;
      return true;
    }
    if (key === 'm') { state.mouseControl = !state.mouseControl; return true; }
    if (key === 'w') { state.warp = Math.min(1.5, state.warp + 0.1); return true; }
    if (key === 'q') { state.warp = Math.max(0.0, state.warp - 0.1); return true; }
    return false;
  },

  getHUD() {
    return `
      <div class="title">JULIA WARP</div>
      <div class="sep"></div>
      <span class="dim">c = </span>
      <span class="val">${state.juliaCx.toFixed(3)}, ${state.juliaCy.toFixed(3)}</span><br>
      <span class="dim">Zoom</span>
      <span class="val">${state.zoom.toFixed(2)}×</span><br>
      <span class="dim">Warp</span>
      <span class="val">${state.warp.toFixed(2)}</span> <span class="dim">[W/Q]</span><br>
      <span class="dim">Palette</span>
      <span class="val">${state.palette}</span> <span class="dim">[C]</span><br>
      <span class="dim">Control</span>
      <span class="val">${state.mouseControl ? 'Mouse' : 'Preset'}</span> <span class="dim">[M]</span><br>
      <span class="dim">[J] animate</span>
    `;
  },
};
