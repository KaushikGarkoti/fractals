/**
 * Mandelbrot — Real-Time GPU Renderer (Perturbation Theory + Orbit Rebasing)
 *
 * Architecture:
 *   - Fullscreen quad with a GLSL fragment shader
 *   - JS computes a reference orbit at float64 precision; stored in a 1024×1
 *     RGBA float32 texture (iOrbitTex).
 *   - GPU iterates only small perturbations (ε) around the reference orbit,
 *     rebasing when the perturbation grows too large.
 *   - Center tracked as plain JS float64 (cx, cy) for infinite-zoom accuracy.
 */

import * as THREE from 'three';
import { Decimal } from 'decimal.js';
import vertexShader   from './shaders/vertex.glsl?raw';
import fragmentShader from './shaders/fragment.glsl?raw';

Decimal.set({ precision: 40 }); // ~40 significant digits → accurate to zoom ~1e40

// ─── Renderer ─────────────────────────────────────────────────────────────────

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

// ─── Scene / Camera ───────────────────────────────────────────────────────────

const scene  = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

// ─── Reference orbit texture (1024 × 1, RGBA float32) ────────────────────────

const ORBIT_SIZE = 1024;
const orbitData  = new Float32Array(ORBIT_SIZE * 4);  // RGBA, one entry per slot

const orbitTex = new THREE.DataTexture(
  orbitData,
  ORBIT_SIZE, 1,
  THREE.RGBAFormat,
  THREE.FloatType
);
orbitTex.magFilter = THREE.NearestFilter;
orbitTex.minFilter = THREE.NearestFilter;

// ─── Uniforms ─────────────────────────────────────────────────────────────────

const uniforms = {
  iTime:         { value: 0.0 },
  iResolution:   { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
  iViewScale:    { value: 3.0 },
  iColorPalette: { value: 0.0 },
  iMaxIter:      { value: 100.0 },
  iOrbitTex:     { value: orbitTex },
  iOrbitLen:     { value: 0.0 },
};

scene.add(new THREE.Mesh(
  new THREE.PlaneGeometry(2, 2),
  new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader })
));

// ─── State ────────────────────────────────────────────────────────────────────

const PALETTES   = ['Fire', 'Electric', 'Emerald'];
let   paletteIndex = 0;

// Center: arbitrary-precision Decimal (40 digits). Zoom: float64 (fine up to ~1e38).
let cx   = new Decimal('-0.5');
let cy   = new Decimal('0');
let zoom = 1.0;

// ─── Split float64 → (hi, lo) float32 pair ────────────────────────────────────
// hi = nearest float32, lo = residual. GPU uses both for ~1e30 zoom accuracy.

function splitFloat64(x) {
  const hi = Math.fround(x);
  return [hi, x - hi];
}

// ─── Reference orbit computation (Decimal 40-digit, runs on JS side) ──────────

function computeOrbit() {
  const maxIter = Math.round(uniforms.iMaxIter.value);

  // Z_0 = (0, 0)
  orbitData[0] = 0;  orbitData[1] = 0;  orbitData[2] = 0;  orbitData[3] = 0;
  let zx = new Decimal(0), zy = new Decimal(0);
  let n  = 1;

  const limit = Math.min(maxIter, ORBIT_SIZE - 1);
  for (let i = 0; i < limit; i++) {
    const zx2 = zx.times(zx);
    const zy2 = zy.times(zy);
    if (zx2.plus(zy2).greaterThan(4096)) break;

    const nzx = zx2.minus(zy2).plus(cx);
    zy = zx.times(zy).times(2).plus(cy);
    zx = nzx;

    // Store as float64 hi+lo pairs: RGBA = (Zx_hi, Zx_lo, Zy_hi, Zy_lo)
    const [zxHi, zxLo] = splitFloat64(zx.toNumber());
    const [zyHi, zyLo] = splitFloat64(zy.toNumber());
    orbitData[n * 4]     = zxHi;
    orbitData[n * 4 + 1] = zxLo;
    orbitData[n * 4 + 2] = zyHi;
    orbitData[n * 4 + 3] = zyLo;
    n++;
  }

  uniforms.iOrbitLen.value = n;
  orbitTex.needsUpdate     = true;
}

// ─── Update everything after center / zoom change ─────────────────────────────

function updateAll() {
  uniforms.iViewScale.value = 3.0 / zoom;
  uniforms.iMaxIter.value   = Math.min(512, Math.floor(100 + 15 * Math.log2(zoom + 1)));
  computeOrbit();
  updateUI();
}

// ─── Zoom toward a screen-space point (float64 arithmetic) ────────────────────

function zoomToward(screenX, screenY, factor) {
  const h = window.innerHeight;
  const w = window.innerWidth;

  // Screen-relative UV offsets (float64, fine — these are just pixel ratios)
  const mxRel = screenX / h - w / (2 * h);
  const myRel = 0.5 - screenY / h;

  const viewScale = new Decimal(3).div(zoom);

  // Complex-plane point under cursor (Decimal precision)
  const px = cx.plus(viewScale.times(mxRel));
  const py = cy.plus(viewScale.times(myRel));

  zoom = Math.max(0.3, Math.min(1e50, zoom * factor));

  const ns = new Decimal(3).div(zoom);
  cx = px.minus(ns.times(mxRel));
  cy = py.minus(ns.times(myRel));

  updateAll();
}

// ─── Mouse / drag to pan ──────────────────────────────────────────────────────

let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;

renderer.domElement.addEventListener('mousedown', (e) => {
  isDragging = true;
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
  renderer.domElement.style.cursor = 'grabbing';
});

// Track cursor position for fly-mode steering
let mouseX = window.innerWidth  * 0.5;
let mouseY = window.innerHeight * 0.5;

renderer.domElement.addEventListener('mousemove', (e) => {
  mouseX = e.clientX;
  mouseY = e.clientY;
  if (!isDragging) return;
  const vs = 3.0 / zoom;
  const h  = window.innerHeight;
  cx = cx.minus((e.clientX - lastMouseX) / h * vs);
  cy = cy.plus( (e.clientY - lastMouseY) / h * vs);
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
  updateAll();
});

renderer.domElement.addEventListener('mouseup',    () => { isDragging = false; renderer.domElement.style.cursor = 'crosshair'; });
renderer.domElement.addEventListener('mouseleave', () => { isDragging = false; renderer.domElement.style.cursor = 'crosshair'; });

renderer.domElement.style.cursor = 'crosshair';

// ─── Scroll to zoom ───────────────────────────────────────────────────────────

renderer.domElement.addEventListener('wheel', (e) => {
  e.preventDefault();
  const factor = e.deltaY > 0 ? 0.88 : 1.0 / 0.88;
  zoomToward(e.clientX, e.clientY, factor);
}, { passive: false });

// ─── Touch — single finger pan, two-finger pinch zoom ─────────────────────────

let lastTouchX    = 0;
let lastTouchY    = 0;
let lastPinchDist = 0;

renderer.domElement.addEventListener('touchstart', (e) => {
  if (e.touches.length === 1) {
    isDragging = true;
    lastTouchX = e.touches[0].clientX;
    lastTouchY = e.touches[0].clientY;
  } else if (e.touches.length === 2) {
    isDragging = false;
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    lastPinchDist = Math.sqrt(dx * dx + dy * dy);
  }
});

renderer.domElement.addEventListener('touchmove', (e) => {
  e.preventDefault();
  if (e.touches.length === 1 && isDragging) {
    const vs = 3.0 / zoom;
    const h  = window.innerHeight;
    cx = cx.minus((e.touches[0].clientX - lastTouchX) / h * vs);
    cy = cy.plus( (e.touches[0].clientY - lastTouchY) / h * vs);
    lastTouchX = e.touches[0].clientX;
    lastTouchY = e.touches[0].clientY;
    updateAll();
  } else if (e.touches.length === 2) {
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    const dist    = Math.sqrt(dx * dx + dy * dy);
    const factor  = dist / lastPinchDist;
    const touchCx = (e.touches[0].clientX + e.touches[1].clientX) * 0.5;
    const touchCy = (e.touches[0].clientY + e.touches[1].clientY) * 0.5;
    zoomToward(touchCx, touchCy, factor);
    lastPinchDist = dist;
  }
}, { passive: false });

renderer.domElement.addEventListener('touchend', () => { isDragging = false; });

// ─── Keyboard ─────────────────────────────────────────────────────────────────

document.addEventListener('keydown', (e) => {
  const scx = window.innerWidth  * 0.5;
  const scy = window.innerHeight * 0.5;
  switch (e.key.toLowerCase()) {
    case 'c':
      paletteIndex = (paletteIndex + 1) % PALETTES.length;
      uniforms.iColorPalette.value = paletteIndex;
      updateUI();
      break;
    case 'r':
      cx   = new Decimal('-0.5');
      cy   = new Decimal('0');
      zoom = 1.0;
      updateAll();
      break;
    case 'f':
    case ' ':
      e.preventDefault();
      flyMode = !flyMode;
      updateUI();
      break;
    case '+':
    case '=':
      if (flyMode) { flySpeed = Math.min(16.0, flySpeed * 1.5); updateUI(); }
      else zoomToward(scx, scy, 1.5);
      break;
    case '-':
      if (flyMode) { flySpeed = Math.max(0.5, flySpeed / 1.5); updateUI(); }
      else zoomToward(scx, scy, 1.0 / 1.5);
      break;
  }
});

// ─── Resize ───────────────────────────────────────────────────────────────────

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  uniforms.iResolution.value.set(window.innerWidth, window.innerHeight);
});

// ─── HUD ──────────────────────────────────────────────────────────────────────

const uiEl  = document.getElementById('ui');
const fpsEl = document.getElementById('fps');

function fmtCoord(v) {
  // v is a Decimal — show enough digits to reflect current zoom depth
  const digits = Math.max(3, Math.floor(Math.log10(zoom)) + 3);
  return v.toFixed(Math.min(digits, 38));
}

function fmtZoom(z) {
  if (z < 1000) return `${z.toFixed(1)}×`;
  // Scientific notation: e.g. 1.23e10×
  const exp = Math.floor(Math.log10(z));
  const man = z / Math.pow(10, exp);
  return `${man.toFixed(2)}e${exp}×`;
}

function updateUI() {
  const flyLine = flyMode
    ? `<span class="val">FLY ▶  ${flySpeed.toFixed(1)}×/s</span>  <span class="dim">[+−] speed</span><br>`
    : `<span class="dim">FLY off</span>  <span class="dim">[F / Space]</span><br>`;
  uiEl.innerHTML = `
    <div class="title">MANDELBROT</div>
    <div class="sep"></div>
    <span class="dim">Re  </span><span class="val">${fmtCoord(cx)}</span><br>
    <span class="dim">Im  </span><span class="val">${fmtCoord(cy)}</span><br>
    <span class="dim">Zoom</span><span class="val"> ${fmtZoom(zoom)}</span><br>
    <span class="dim">Iter</span><span class="val"> ${Math.round(uniforms.iMaxIter.value)}</span><br>
    <div class="sep"></div>
    ${flyLine}
    <span class="dim">Palette </span><span class="val">${PALETTES[paletteIndex]}</span>  <span class="dim">[C]</span><br>
    <span class="dim">Drag to pan · [R] reset</span>
  `;
}

// ─── FPS Counter ──────────────────────────────────────────────────────────────

let fpsSamples  = [];
let lastFpsTime = performance.now();

function updateFPS(now) {
  fpsSamples.push(now);
  fpsSamples = fpsSamples.filter(t => now - t < 1000);
  if (now - lastFpsTime > 200) {
    fpsEl.textContent = `${fpsSamples.length} fps`;
    lastFpsTime = now;
  }
}

// ─── Fly mode ─────────────────────────────────────────────────────────────────

let flyMode  = false;
let flySpeed = 2.0;   // zoom multiplier per second (2 = 2× per second)

// ─── Render Loop ──────────────────────────────────────────────────────────────

const clock = new THREE.Clock();
let   lastT = 0;

function animate() {
  requestAnimationFrame(animate);

  const now = clock.getElapsedTime();
  const dt  = Math.min(now - lastT, 0.1); // cap dt to avoid jump on tab restore
  lastT = now;

  uniforms.iTime.value = now;

  if (flyMode) {
    zoomToward(mouseX, mouseY, Math.pow(flySpeed, dt));
  }

  renderer.render(scene, camera);
  updateFPS(performance.now());
}

// ─── Init ─────────────────────────────────────────────────────────────────────

updateAll();
animate();
