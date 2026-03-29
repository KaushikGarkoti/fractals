import * as THREE from 'three';
import { Decimal } from 'decimal.js';
import fragmentShader from '../shaders/fragment.glsl?raw';

Decimal.set({ precision: 80 });

// ─── Orbit texture (1024×1 RGBA float32) ─────────────────────────────────────

const ORBIT_SIZE = 1024;
const orbitData  = new Float32Array(ORBIT_SIZE * 4);

const orbitTex = new THREE.DataTexture(
  orbitData, ORBIT_SIZE, 1,
  THREE.RGBAFormat, THREE.FloatType
);
orbitTex.magFilter = THREE.NearestFilter;
orbitTex.minFilter = THREE.NearestFilter;

// ─── Uniforms ─────────────────────────────────────────────────────────────────

export const uniforms = {
  iTime:         { value: 0.0 },
  iResolution:   { value: new THREE.Vector2() },
  iViewScale:    { value: 3.0 },
  iColorPalette: { value: 0.0 },
  iMaxIter:      { value: 100.0 },
  iOrbitTex:     { value: orbitTex },
  iOrbitLen:     { value: 0.0 },
};

// ─── State ────────────────────────────────────────────────────────────────────

const PALETTES   = ['Fire', 'Electric', 'Emerald', 'Radiance'];
let cx       = new Decimal('-0.5');
let cy       = new Decimal('0');
let zoom     = 1.0;
let flyMode  = false;
let flySpeed = 2.0;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function splitFloat64(x) {
  const hi = Math.fround(x);
  return [hi, x - hi];
}

function computeOrbit() {
  orbitData[0] = 0; orbitData[1] = 0; orbitData[2] = 0; orbitData[3] = 0;
  let zx = new Decimal(0), zy = new Decimal(0);
  let n  = 1;

  for (let i = 0; i < ORBIT_SIZE - 1; i++) {
    const zx2 = zx.times(zx);
    const zy2 = zy.times(zy);
    if (zx2.plus(zy2).greaterThan(1024)) break;

    const nzx = zx2.minus(zy2).plus(cx);
    zy = zx.times(zy).times(2).plus(cy);
    zx = nzx;

    const [zxHi, zxLo] = splitFloat64(zx.toNumber());
    const [zyHi, zyLo] = splitFloat64(zy.toNumber());
    const idx = n * 4;
    orbitData[idx]     = zxHi;
    orbitData[idx + 1] = zxLo;
    orbitData[idx + 2] = zyHi;
    orbitData[idx + 3] = zyLo;
    n++;
  }

  uniforms.iOrbitLen.value = n;
  orbitTex.needsUpdate = true;
}

function updateAll() {
  uniforms.iViewScale.value = 3.0 / zoom;
  uniforms.iMaxIter.value   = Math.min(512, Math.floor(200 + 30 * Math.log2(zoom + 1)));
  computeOrbit();
}

function zoomToward(screenX, screenY, factor, w, h) {
  const mxRel    = screenX / h - w / (2 * h);
  const myRel    = 0.5 - screenY / h;
  const viewScale = new Decimal(3).div(zoom);
  const px = cx.plus(viewScale.times(mxRel));
  const py = cy.plus(viewScale.times(myRel));
  zoom = Math.max(0.3, Math.min(1e50, zoom * factor));
  const ns = new Decimal(3).div(zoom);
  cx = px.minus(ns.times(mxRel));
  cy = py.minus(ns.times(myRel));
  updateAll();
}

function fmtZoom(z) {
  if (z < 1000) return `${z.toFixed(1)}×`;
  const exp = Math.floor(Math.log10(z));
  return `${(z / Math.pow(10, exp)).toFixed(2)}e${exp}×`;
}

// ─── Fractal module ───────────────────────────────────────────────────────────

export default {
  name: 'Mandelbrot',
  fragmentShader,
  uniforms,

  init() {
    updateAll();
  },

  reset() {
    cx       = new Decimal('-0.5');
    cy       = new Decimal('0');
    zoom     = 1.0;
    flyMode  = false;
    flySpeed = 2.0;
    updateAll();
  },

  update(dt, mouseX, mouseY, w, h) {
    if (!flyMode) return false;
    zoomToward(mouseX, mouseY, Math.pow(flySpeed, dt), w, h);
    return true;
  },

  zoomToward(x, y, factor, w, h) {
    zoomToward(x, y, factor, w, h);
  },

  pan(dx, dy, h) {
    const vs = 3.0 / zoom;
    cx = cx.minus(dx / h * vs);
    cy = cy.plus(dy  / h * vs);
    updateAll();
  },

  onKey(key, mouseX, mouseY, w, h) {
    switch (key) {
      case 'c':
        uniforms.iColorPalette.value = (uniforms.iColorPalette.value + 1) % PALETTES.length;
        return true;
      case 'f':
      case ' ':
        flyMode = !flyMode;
        return true;
      case '+':
      case '=':
        if (flyMode) flySpeed = Math.min(16.0, flySpeed * 1.5);
        else zoomToward(mouseX, mouseY, 1.5, w, h);
        return true;
      case '-':
        if (flyMode) flySpeed = Math.max(0.5, flySpeed / 1.5);
        else zoomToward(mouseX, mouseY, 1 / 1.5, w, h);
        return true;
    }
    return false;
  },

  getHUD() {
    const digits  = Math.max(3, Math.floor(Math.log10(zoom)) + 3);
    const palette = PALETTES[Math.round(uniforms.iColorPalette.value)];
    const flyLine = flyMode
      ? `<span class="val">FLY ▶  ${flySpeed.toFixed(1)}×/s</span>  <span class="dim">[+−] speed</span><br>`
      : `<span class="dim">FLY off</span>  <span class="dim">[F / Space]</span><br>`;
    return `
      <div class="title">MANDELBROT</div>
      <div class="sep"></div>
      <span class="dim">Re  </span><span class="val">${cx.toFixed(Math.min(digits, 38))}</span><br>
      <span class="dim">Im  </span><span class="val">${cy.toFixed(Math.min(digits, 38))}</span><br>
      <span class="dim">Zoom</span><span class="val"> ${fmtZoom(zoom)}</span><br>
      <span class="dim">Iter</span><span class="val"> ${Math.round(uniforms.iMaxIter.value)}</span><br>
      <div class="sep"></div>
      ${flyLine}
      <span class="dim">Palette </span><span class="val">${palette}</span>  <span class="dim">[C]</span><br>
      <span class="dim">Drag to pan · [R] reset</span>
    `;
  },
};
