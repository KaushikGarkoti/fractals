/**
 * Fractal Explorer — GPU Renderer
 *
 * Adding a new fractal:
 *   1. Create src/shaders/myfractal.glsl
 *   2. Create src/fractals/myfractal.js  (implement the fractal module interface)
 *   3. Import and add it to the FRACTALS array below — done.
 */

import * as THREE from 'three';
import vertexShader from './shaders/vertex.glsl?raw';

import mandelbrot from './fractals/mandelbrot.js';
import sierpinski from './fractals/sierpinski.js';

// ─── Fractal registry ─────────────────────────────────────────────────────────
// To add a new fractal: import it above and push it into this array.

const FRACTALS = [mandelbrot, sierpinski];

// ─── Renderer ─────────────────────────────────────────────────────────────────

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

const scene  = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const geo    = new THREE.PlaneGeometry(2, 2);

// Pre-compile one ShaderMaterial per fractal so switching is instant.
const materials = {};
for (const f of FRACTALS) {
  materials[f.name] = new THREE.ShaderMaterial({
    uniforms:       f.uniforms,
    vertexShader,
    fragmentShader: f.fragmentShader,
  });
}

const mesh = new THREE.Mesh(geo, materials[FRACTALS[0].name]);
scene.add(mesh);

// ─── Active fractal ───────────────────────────────────────────────────────────

let current = FRACTALS[0];
current.init();

function switchTo(fractal) {
  current = fractal;
  mesh.material = materials[fractal.name];
  fractal.init();
  updateUI();
}

// ─── Dropdown ─────────────────────────────────────────────────────────────────

const selectEl = document.getElementById('fractal-select');
for (const f of FRACTALS) {
  const opt = document.createElement('option');
  opt.value = f.name;
  opt.textContent = f.name;
  selectEl.appendChild(opt);
}
selectEl.value = current.name;
selectEl.addEventListener('change', () => {
  const f = FRACTALS.find(f => f.name === selectEl.value);
  if (f) switchTo(f);
});

// ─── Mouse / drag ─────────────────────────────────────────────────────────────

let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;
let mouseX     = window.innerWidth  * 0.5;
let mouseY     = window.innerHeight * 0.5;

renderer.domElement.addEventListener('mousedown', (e) => {
  isDragging = true;
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
  renderer.domElement.style.cursor = 'grabbing';
});

renderer.domElement.addEventListener('mousemove', (e) => {
  mouseX = e.clientX;
  mouseY = e.clientY;
  if (!isDragging) return;
  current.pan(e.clientX - lastMouseX, e.clientY - lastMouseY, window.innerHeight);
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
  updateUI();
});

renderer.domElement.addEventListener('mouseup',    () => { isDragging = false; renderer.domElement.style.cursor = 'crosshair'; });
renderer.domElement.addEventListener('mouseleave', () => { isDragging = false; renderer.domElement.style.cursor = 'crosshair'; });
renderer.domElement.style.cursor = 'crosshair';

// ─── Scroll to zoom ───────────────────────────────────────────────────────────

renderer.domElement.addEventListener('wheel', (e) => {
  e.preventDefault();
  const factor = e.deltaY > 0 ? 0.88 : 1.0 / 0.88;
  current.zoomToward(e.clientX, e.clientY, factor, window.innerWidth, window.innerHeight);
  updateUI();
}, { passive: false });

// ─── Touch ────────────────────────────────────────────────────────────────────

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
  const w = window.innerWidth, h = window.innerHeight;
  if (e.touches.length === 1 && isDragging) {
    current.pan(e.touches[0].clientX - lastTouchX, e.touches[0].clientY - lastTouchY, h);
    lastTouchX = e.touches[0].clientX;
    lastTouchY = e.touches[0].clientY;
    updateUI();
  } else if (e.touches.length === 2) {
    const dx   = e.touches[0].clientX - e.touches[1].clientX;
    const dy   = e.touches[0].clientY - e.touches[1].clientY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const tcx  = (e.touches[0].clientX + e.touches[1].clientX) * 0.5;
    const tcy  = (e.touches[0].clientY + e.touches[1].clientY) * 0.5;
    current.zoomToward(tcx, tcy, dist / lastPinchDist, w, h);
    lastPinchDist = dist;
    updateUI();
  }
}, { passive: false });

renderer.domElement.addEventListener('touchend', () => { isDragging = false; });

// ─── Keyboard ─────────────────────────────────────────────────────────────────

document.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();

  // R always resets the active fractal
  if (key === 'r') { current.reset(); updateUI(); return; }

  // Delegate everything else to the active fractal
  const handled = current.onKey(key, mouseX, mouseY, window.innerWidth, window.innerHeight);
  if (handled) updateUI();
  if (key === ' ') e.preventDefault();
});

// ─── Resize ───────────────────────────────────────────────────────────────────

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  for (const f of FRACTALS) {
    f.uniforms.iResolution.value.set(window.innerWidth, window.innerHeight);
  }
});

// ─── HUD ──────────────────────────────────────────────────────────────────────

const uiEl  = document.getElementById('ui');
const fpsEl = document.getElementById('fps');

function updateUI() {
  uiEl.innerHTML = current.getHUD();
}

// ─── FPS counter ──────────────────────────────────────────────────────────────

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

// ─── Render loop ──────────────────────────────────────────────────────────────

const clock = new THREE.Clock();
let   lastT = 0;

function animate() {
  requestAnimationFrame(animate);

  const now = clock.getElapsedTime();
  const dt  = Math.min(now - lastT, 0.1);
  lastT = now;

  // Update universal time + resolution uniforms on active fractal
  current.uniforms.iTime.value = now;
  current.uniforms.iResolution.value.set(window.innerWidth, window.innerHeight);

  const changed = current.update(dt, mouseX, mouseY, window.innerWidth, window.innerHeight);
  if (changed) updateUI();

  renderer.render(scene, camera);
  updateFPS(performance.now());
}

// ─── Init ─────────────────────────────────────────────────────────────────────

for (const f of FRACTALS) {
  f.uniforms.iResolution.value.set(window.innerWidth, window.innerHeight);
}

updateUI();
animate();
