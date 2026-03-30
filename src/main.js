import * as THREE from 'three';
import vertexShader from './shaders/vertex.glsl?raw';

import mandelbrot from './fractals/mandelbrot.js';
import sierpinski from './fractals/sierpinski.js';
import julia from './fractals/julia';
import juliaWarp from './fractals/juliaWarp';
import domainWarp  from './patterns/domainWarp';
import waveField   from './patterns/waveField';
import mandelbulb  from './patterns/mandelbulb';
import sdfBlobs    from './patterns/sdfBlobs';
import warpField   from './patterns/warpField3d';
import fluidSim   from './simulations/fluidSim';

// ─── Registries ───────────────────────────────────────────────────────────────

const FRACTALS  = [mandelbrot, sierpinski, julia, juliaWarp];
const PATTERNS  = [domainWarp, waveField, mandelbulb, sdfBlobs, warpField]; // domain warp, interference, etc. go here
const SIMULATIONS = [fluidSim];

const ALL = [...FRACTALS, ...PATTERNS, ...SIMULATIONS];

// ─── Renderer ─────────────────────────────────────────────────────────────────

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

const scene  = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const geo    = new THREE.PlaneGeometry(2, 2);

const materials = {};
for (const f of ALL) {
  materials[f.name] = new THREE.ShaderMaterial({
    uniforms:       f.uniforms,
    vertexShader,
    fragmentShader: f.fragmentShader,
  });
}

const mesh = new THREE.Mesh(geo, materials[ALL[0].name]);
scene.add(mesh);

// ─── Active scene ─────────────────────────────────────────────────────────────

let current = ALL[0];
current.init(window.innerWidth, window.innerHeight, renderer);

// 🔥 NEW — preset dropdown
const presetSelect = document.createElement('select');
presetSelect.style.position = 'absolute';
presetSelect.style.bottom = '60px';
presetSelect.style.left = '50%';
presetSelect.style.transform = 'translateX(-50%)';
presetSelect.style.padding = '6px 10px';
presetSelect.style.borderRadius = '6px';
presetSelect.style.background = '#222';
presetSelect.style.color = '#fff';
presetSelect.style.display = 'none';
document.body.appendChild(presetSelect);

// 🔥 NEW — variant dropdown
const variantSelect = document.createElement('select');

variantSelect.style.position = 'absolute';
variantSelect.style.bottom = '100px'; // 👈 slightly above preset
variantSelect.style.left = '50%';
variantSelect.style.transform = 'translateX(-50%)';
variantSelect.style.padding = '6px 10px';
variantSelect.style.borderRadius = '6px';
variantSelect.style.background = '#222';
variantSelect.style.color = '#fff';
variantSelect.style.display = 'none';

document.body.appendChild(variantSelect);

// 🔥 NEW — update dropdown
function updatePresetDropdown(fractal) {
  presetSelect.innerHTML = '';

  if (!fractal.getPresets) {
    presetSelect.style.display = 'none';
    return;
  }

  const presets = fractal.getPresets();
  presetSelect.style.display = 'block';

  presets.forEach((p, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = p.name;
    presetSelect.appendChild(opt);
  });
}

function updateVariantDropdown(fractal) {
  variantSelect.innerHTML = '';

  if (!fractal.getVariants) {
    variantSelect.style.display = 'none';
    return;
  }

  const variants = fractal.getVariants();
  variantSelect.style.display = 'block';

  variants.forEach((v, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = v;
    variantSelect.appendChild(opt);
  });
}

// 🔥 NEW — handle preset selection
presetSelect.addEventListener('change', (e) => {
  const idx = parseInt(e.target.value);
  current.setPreset?.(idx);
  updateUI();
});

variantSelect.addEventListener('change', (e) => {
  const idx = parseInt(e.target.value);
  current.setVariant?.(idx);
  updateUI();
});

function switchTo(fractal) {
  current.dispose?.();
  current = fractal;
  mesh.material = materials[fractal.name];
  fractal.init(window.innerWidth, window.innerHeight, renderer);

  updatePresetDropdown(fractal);
  updateVariantDropdown(fractal);
  updateUI();
  lightPanel.style.display = fractal.setLight ? 'flex' : 'none';
}

// ─── Dropdown ─────────────────────────────────────────────────────────────────

const selectEl = document.getElementById('fractal-select');

function buildDropdown() {
  selectEl.innerHTML = '';
  const groups = [
    { label: 'Fractals', items: FRACTALS },
    { label: 'Patterns', items: PATTERNS },
    { label: 'Simulations', items: SIMULATIONS },
  ];
  for (const group of groups) {
    if (group.items.length === 0) continue;
    const grp = document.createElement('optgroup');
    grp.label = group.label;
    for (const f of group.items) {
      const opt = document.createElement('option');
      opt.value = f.name;
      opt.textContent = f.name;
      grp.appendChild(opt);
    }
    selectEl.appendChild(grp);
  }
  selectEl.value = current.name;
}

buildDropdown();

selectEl.addEventListener('change', () => {
  const f = ALL.find(f => f.name === selectEl.value);
  if (f) switchTo(f);
});

// 🔥 NEW — initialize preset dropdown on load
updatePresetDropdown(current);

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
  current.pan?.(e.clientX - lastMouseX, e.clientY - lastMouseY, window.innerHeight);
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
  current.zoomToward?.(e.clientX, e.clientY, factor, window.innerWidth, window.innerHeight);
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
    current.pan?.(e.touches[0].clientX - lastTouchX, e.touches[0].clientY - lastTouchY, h);
    lastTouchX = e.touches[0].clientX;
    lastTouchY = e.touches[0].clientY;
    updateUI();
  } else if (e.touches.length === 2) {
    const dx   = e.touches[0].clientX - e.touches[1].clientX;
    const dy   = e.touches[0].clientY - e.touches[1].clientY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const tcx  = (e.touches[0].clientX + e.touches[1].clientX) * 0.5;
    const tcy  = (e.touches[0].clientY + e.touches[1].clientY) * 0.5;
    current.zoomToward?.(tcx, tcy, dist / lastPinchDist, w, h);
    lastPinchDist = dist;
    updateUI();
  }
}, { passive: false });

renderer.domElement.addEventListener('touchend', () => { isDragging = false; });

// ─── Keyboard ─────────────────────────────────────────────────────────────────

document.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();

  if (key === 'r') { current.reset(); updateUI(); return; }

  const handled = current.onKey(key, mouseX, mouseY, window.innerWidth, window.innerHeight);
  if (handled) updateUI();

  if (key === ' ') e.preventDefault();
});

// ─── Resize ───────────────────────────────────────────────────────────────────

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  for (const f of ALL) {
    f.uniforms.iResolution.value.set(window.innerWidth, window.innerHeight);
  }
});

// ─── HUD ──────────────────────────────────────────────────────────────────────

const uiEl  = document.getElementById('ui');
const fpsEl = document.getElementById('fps');

function updateUI() {
  uiEl.innerHTML = current.getHUD();
}

// ─── Light panel ──────────────────────────────────────────────────────────────

const lightPanel  = document.getElementById('light-panel');
const lightAzEl   = document.getElementById('light-az');
const lightElEl   = document.getElementById('light-el');
const lightAzVal  = document.getElementById('light-az-val');
const lightElVal  = document.getElementById('light-el-val');

lightPanel.style.display = current.setLight ? 'flex' : 'none';

lightAzEl.addEventListener('input', () => {
  lightAzVal.textContent = lightAzEl.value + '°';
  current.setLight?.(Number(lightAzEl.value), Number(lightElEl.value));
});

lightElEl.addEventListener('input', () => {
  lightElVal.textContent = lightElEl.value + '°';
  current.setLight?.(Number(lightAzEl.value), Number(lightElEl.value));
});

// ─── FPS ──────────────────────────────────────────────────────────────────────

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

  current.uniforms.iTime.value = now;
  current.uniforms.iResolution.value.set(window.innerWidth, window.innerHeight);

  const changed = current.update(dt, mouseX, mouseY, window.innerWidth, window.innerHeight, renderer);
  if (changed) updateUI();

  renderer.render(scene, camera);
  updateFPS(performance.now());
}

// ─── Init ─────────────────────────────────────────────────────────────────────

for (const f of ALL) {
  f.uniforms.iResolution.value.set(window.innerWidth, window.innerHeight);
}

updateUI();
animate();