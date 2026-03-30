import * as THREE from 'three';
import fragmentShader from '../shaders/sierpinski.glsl?raw';

// ─── Constants ────────────────────────────────────────────────────────────────

const S3 = Math.sqrt(3);

// Equilateral triangle: A=(0,0), B=(1,0), C=(0.5, S3/2)
// Centroid at (0.5, S3/6). Default view: centroid centered, full triangle visible.
const DEFAULT_CX    = 0.5;
const DEFAULT_CY    = S3 / 6; 
const DEFAULT_SCALE = 0.75;  // iViewScale at default zoom (fits the triangle)

// ─── Uniforms ─────────────────────────────────────────────────────────────────

export const uniforms = {
  iTime:         { value: 0.0 },
  iResolution:   { value: new THREE.Vector2() },
  iCenter:       { value: new THREE.Vector2(DEFAULT_CX, DEFAULT_CY) },
  iViewScale:    { value: DEFAULT_SCALE },
  iColorPalette: { value: 0.0 },
  iMaxIter:      { value: 48.0 },
};

// ─── State ────────────────────────────────────────────────────────────────────

const PALETTES = ['Fire', 'Electric', 'Emerald'];
let cx    = DEFAULT_CX;
let cy    = DEFAULT_CY;
let scale = DEFAULT_SCALE;  // world units per screen height

// ─── Helpers ──────────────────────────────────────────────────────────────────

function updateAll() {
  uniforms.iCenter.value.set(cx, cy);
  uniforms.iViewScale.value = scale;
  // More iterations as we zoom in (each iter doubles effective resolution)
  const zoomDepth = Math.log2(DEFAULT_SCALE / scale + 1);
  uniforms.iMaxIter.value = Math.min(128, Math.floor(24 + zoomDepth * 12));
}

function zoomToward(screenX, screenY, factor, w, h) {
  // Convert screen point to fractal-space offset from center
  const mxRel = (screenX / h - w / (2 * h)) * scale;
  const myRel = (0.5 - screenY / h) * scale;
  // World point under cursor (stays fixed through zoom)
  const px = cx + mxRel;
  const py = cy + myRel;
  scale = Math.max(1e-13, Math.min(5.0, scale / factor));
  cx = px - (screenX / h - w / (2 * h)) * scale;
  cy = py - (0.5 - screenY / h) * scale;
  updateAll();
}

function fmtZoom(s) {
  const z = DEFAULT_SCALE / s;
  if (z < 1000) return `${z.toFixed(1)}×`;
  const exp = Math.floor(Math.log10(z));
  return `${(z / Math.pow(10, exp)).toFixed(2)}e${exp}×`;
}

// ─── Fractal module ───────────────────────────────────────────────────────────

export default {
  name: 'Sierpiński',
  fragmentShader,
  uniforms,

  init() {
    updateAll();
  },

  reset() {
    cx    = DEFAULT_CX;
    cy    = DEFAULT_CY;
    scale = DEFAULT_SCALE;
    uniforms.iColorPalette.value = 0.0;
    updateAll();
  },

  update(_dt, _mx, _my) {
    // no fly mode
  },

  zoomToward(x, y, factor, w, h) {
    zoomToward(x, y, factor, w, h);
  },

  pan(dx, dy, h) {
    cx -= (dx / h) * scale;
    cy += (dy / h) * scale;
    updateAll();
  },

  onKey(key, mouseX, mouseY, w, h) {
    switch (key) {
      case 'c':
        uniforms.iColorPalette.value = (uniforms.iColorPalette.value + 1) % PALETTES.length;
        return true;
      case '+':
      case '=':
        zoomToward(w / 2, h / 2, 1.5, w, h);
        return true;
      case '-':
        zoomToward(w / 2, h / 2, 1 / 1.5, w, h);
        return true;
    }
    return false;
  },

  getHUD() {
    const palette = PALETTES[Math.round(uniforms.iColorPalette.value)];
    return `
      <div class="title">SIERPIŃSKI</div>
      <div class="sep"></div>
      <span class="dim">Re  </span><span class="val">${cx.toFixed(8)}</span><br>
      <span class="dim">Im  </span><span class="val">${cy.toFixed(8)}</span><br>
      <span class="dim">Zoom</span><span class="val"> ${fmtZoom(scale)}</span><br>
      <span class="dim">Iter</span><span class="val"> ${Math.round(uniforms.iMaxIter.value)}</span><br>
      <div class="sep"></div>
      <span class="dim">Palette </span><span class="val">${palette}</span>  <span class="dim">[C]</span><br>
      <span class="dim">Drag to pan · [R] reset</span>
    `;
  },
};
