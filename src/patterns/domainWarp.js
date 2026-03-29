import * as THREE from 'three';
import fragmentShader from '../shaders/domainWarp.glsl?raw';

const state = {
  cx: 0,
  cy: 0,
  zoom: 1,

  palette: 0,

  warp: 0.6,
  mouseInfluence: 0.0,
};

const uniforms = {
  iTime: { value: 0 },
  iResolution: { value: new THREE.Vector2() },
  iViewScale: { value: 3 },
  iFreqScale: { value: 2.0 },
  iCenter: { value: new THREE.Vector2(0, 0) },
  iColorPalette: { value: 0 },

  iWarp: { value: state.warp },
  iMouseInfluence: { value: state.mouseInfluence },
};

export default {
  name: 'Domain Warp',

  fragmentShader,
  uniforms,

  init(w, h) {
    uniforms.iResolution.value.set(w, h);
    this.reset();
  },

  reset() {
    state.cx = 0;
    state.cy = 0;
    state.zoom = 1;
    state.warp = 0.6;
  },

  update(dt, mx, my, w, h) {
    uniforms.iTime.value += dt;

    uniforms.iViewScale.value = 3.0 / state.zoom;
    uniforms.iFreqScale.value = 2.0 * Math.sqrt(state.zoom);
    uniforms.iCenter.value.set(state.cx, state.cy);

    uniforms.iColorPalette.value = state.palette;

    // 🔥 mouse → warp influence
    const mxRel = mx / w;
    const myRel = my / h;

    state.mouseInfluence = (mxRel - 0.5) * 1.0;

    uniforms.iWarp.value = state.warp;
    uniforms.iMouseInfluence.value = state.mouseInfluence;

    return true;
  },

  zoomToward(x, y, factor, w, h) {
    const mxRel = x / h - w / (2 * h);
    const myRel = 0.5 - y / h;

    const viewScale = 3 / state.zoom;

    const px = state.cx + viewScale * mxRel;
    const py = state.cy + viewScale * myRel;

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
    if (key === 'c') {
      state.palette = (state.palette + 1) % 3;
      return true;
    }

    if (key === 'w') {
      state.warp = Math.min(2.0, state.warp + 0.1);
      return true;
    }

    if (key === 'q') {
      state.warp = Math.max(0.0, state.warp - 0.1);
      return true;
    }

    return false;
  },

  getHUD() {
    return `
      <div class="title">DOMAIN WARP</div>
      <div class="sep"></div>

      <span class="dim">Zoom</span>
      <span class="val">${state.zoom.toFixed(2)}×</span><br>

      <span class="dim">Warp</span>
      <span class="val">${state.warp.toFixed(2)}</span> <span class="dim">[W/Q]</span><br>

      <span class="dim">Palette</span>
      <span class="val">${state.palette}</span> <span class="dim">[C]</span><br>

      <div class="sep"></div>
      <span class="dim">Mouse affects warp</span>
    `;
  },
};