import * as THREE from 'three';
import fragmentShader from '../shaders/julia.glsl?raw';

const PRESETS = [
  { name: "🌀 Classic dendrite", cx: -0.70176, cy: -0.3842 },
  { name: "🌌 Seahorse style", cx: -0.745, cy: 0.113 },
  { name: "🔥 Lightning fractal", cx: 0.285, cy: 0.01 },
  { name: "🧬 Connected structure", cx: -0.4, cy: 0.6 },
];

const VARIANTS = [
  "Classic",
  "🔥 Burning Ship",
  "🌪 Tricorn",
  "🧬 Multibrot"
];

const state = {
  cx: 0,
  cy: 0,
  zoom: 1,
  palette: 0,

  juliaCx: -0.4,
  juliaCy: 0.6,

  mouseControl: true,
  presetIndex: 0,
  animating: false,
  time: 0,
  variant: 0, // 0=classic, 1=burning, 2=tricorn, 3=power
  power: 2,
};

const uniforms = {
  iTime: { value: 0 },
  iResolution: { value: new THREE.Vector2() },
  iViewScale: { value: 3 },
  iColorPalette: { value: 0 },
  iMaxIter: { value: 200 },
  iJuliaC: { value: new THREE.Vector2(state.juliaCx, state.juliaCy) },
  iCenter: { value: new THREE.Vector2(0, 0) },
  iVariant: { value: 0 },
  iPower: { value: 2 }
};

export default {
  name: 'Julia',

  fragmentShader,
  uniforms,

  // 🔥 expose presets to main.js
  getPresets() {
    return PRESETS;
  },

  // 🔥 apply preset
  setPreset(index) {
    const p = PRESETS[index];
    state.presetIndex = index;

    state.juliaCx = p.cx;
    state.juliaCy = p.cy;

    state.mouseControl = false; // disable mouse override

    uniforms.iJuliaC.value.set(state.juliaCx, state.juliaCy);
  },

  getVariants() {
    return VARIANTS;
  },

  setVariant(index) {
    state.variant = index;
  },

  init(w, h) {
    uniforms.iResolution.value.set(w, h);
    this.reset();
    state.mouseControl = true;

    uniforms.iJuliaC.value.set(state.juliaCx, state.juliaCy);
  },

  reset() {
    state.cx = 0;
    state.cy = 0;
    state.zoom = 1;
  },

  update(dt, mx, my, w, h) {
    uniforms.iTime.value += dt;
    uniforms.iCenter.value.set(state.cx, state.cy);
    uniforms.iVariant.value = state.variant;
    uniforms.iPower.value = state.power;
    const viewScale = 3.0 / state.zoom;
    uniforms.iViewScale.value = viewScale;

    uniforms.iMaxIter.value = Math.min(
      512,
      Math.floor(200 + 30 * Math.log2(state.zoom + 1))
    );

    uniforms.iColorPalette.value = state.palette;

     // 🔥 ANIMATION (runs every frame)
    if (state.animating) {
        state.time += dt;

        // 🎯 stay inside "good region"
        const baseX = -0.7;
        const baseY = 0.2;

        const rx = 0.2;
        const ry = 0.15;

        state.juliaCx = baseX + Math.sin(state.time * 0.6) * rx;
        state.juliaCy = baseY + Math.sin(state.time * 0.9) * ry;
    }

    // 🎯 Mouse → Julia parameter (polar mapping keeps c near Mandelbrot boundary)
    else if (state.mouseControl) {
      const mxRel = mx / h - w / (2 * h);
      const myRel = 0.5 - my / h;

      const angle = Math.atan2(myRel, mxRel);
      const dist = Math.sqrt(mxRel * mxRel + myRel * myRel);
      // map dist to radius in [0.35, 0.75] — keeps c near the Mandelbrot boundary
      const r = 0.35 + Math.min(dist / 0.7, 1.0) * 0.4;

      state.juliaCx = r * Math.cos(angle);
      state.juliaCy = r * Math.sin(angle);
    }
    uniforms.iJuliaC.value.set(state.juliaCx, state.juliaCy);

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

    if (key === 'j') {
        state.animating = !state.animating;

        // disable mouse when animating
        if (state.animating) state.mouseControl = false;

        return true;
    }

    // 🔥 toggle mouse control
    if (key === 'm') {
      state.mouseControl = !state.mouseControl;
      return true;
    }

    return false;
  },

  getHUD() {
    return `
      <div class="title">JULIA</div>
      <div class="sep"></div>
      <span class="dim">c = </span>
      <span class="val">${state.juliaCx.toFixed(3)}, ${state.juliaCy.toFixed(3)}</span><br>
      <span class="dim">Zoom</span>
      <span class="val">${state.zoom.toFixed(2)}×</span><br>
      <span class="dim">Palette</span>
      <span class="val">${state.palette}</span> <span class="dim">[C]</span><br>
      <span class="dim">Control</span>
      <span class="val">${state.mouseControl ? 'Mouse' : 'Preset'}</span> <span class="dim">[M]</span><br>
      <span class="dim">[J] animate</span>
    `;
  },
};