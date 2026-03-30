import * as THREE from 'three';
import GUI from 'lil-gui';
import { SimulationBase, makePassMaterial } from '../engine/SimulationBase.js';

import curlShader               from './shaders/curl.glsl?raw';
import vorticityConfinementShader from './shaders/vorticityConfinement.glsl?raw';
import divergenceShader         from './shaders/divergence.glsl?raw';
import pressureJacobiShader     from './shaders/pressureJacobi.glsl?raw';
import subtractGradientShader   from './shaders/subtractGradient.glsl?raw';
import advectShader             from './shaders/advect.glsl?raw';
import addForceShader           from './shaders/addForce.glsl?raw';
import splatDyeShader           from './shaders/splatDye.glsl?raw';
import displayShader            from './shaders/fluidDisplay.glsl?raw';

// ── Config (matches reference defaults) ───────────────────────────────────────

const config = {
  SIM_RESOLUTION:       256,
  DYE_RESOLUTION:       1024,
  DENSITY_DISSIPATION:  0.98,
  VELOCITY_DISSIPATION: 0.99,
  PRESSURE_ITERATIONS:  40,
  CURL:                 10,
  SPLAT_RADIUS:         1.0,
  SPLAT_FORCE:          6000,
  running: true,
};

// ── Display uniforms (exposed to GUI) ─────────────────────────────────────────

const uniforms = {
  iTime:       { value: 0 },
  iResolution: { value: new THREE.Vector2() },
  uDyeTex:     { value: null },
  uVelocity:   { value: null },
  uCurl:       { value: null },
  uPressure:   { value: null },
  uExposure:   { value: 1.0 },
  uGlowRadius: { value: 0.0 },
  uColormap:   { value: 0.0 },
};

let gui = null;

// ── HSV → RGB (same as reference generateColor) ───────────────────────────────

function HSVtoRGB(h, s, v) {
  let r, g, b;
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    case 5: r = v; g = p; b = q; break;
  }
  // Reference multiplies by 0.15 to keep dye subtle
  return { r: r * 0.15, g: g * 0.15, b: b * 0.15 };
}

let cyclingHue = 0;

function generateColor() {
  return HSVtoRGB(cyclingHue % 1.0, 1.0, 1.0);
}

export default {
  name: 'Fluid Sim',
  fragmentShader: displayShader,
  uniforms,

  init(w, h, renderer) {
    this._disposeSim?.();
    this._disposed = false;
    this.renderer = renderer;
    this.base = new SimulationBase(renderer);
    this._hasPrevMouse = false;
    this._lastMouseX = 0;
    this._lastMouseY = 0;

    const aspect = w / h;

    // Sim grid (low-res for physics)
    const simW = config.SIM_RESOLUTION;
    const simH = Math.round(config.SIM_RESOLUTION / aspect);

    // Dye grid (high-res for visuals)
    const dyeW = config.DYE_RESOLUTION;
    const dyeH = Math.round(config.DYE_RESOLUTION / aspect);

    this._simW = simW; this._simH = simH;
    this._dyeW = dyeW; this._dyeH = dyeH;
    this._aspect = aspect;

    // Ping-pong FBOs
    this.vel      = this.base.createPingPong(simW, simH);
    this.dye      = this.base.createPingPong(dyeW, dyeH);
    this.pressure = this.base.createPingPong(simW, simH);
    this.divergence = this.base.createRenderTarget(simW, simH);
    this.curl       = this.base.createRenderTarget(simW, simH);

    const simRes = new THREE.Vector2(simW, simH);
    const dyeRes = new THREE.Vector2(dyeW, dyeH);

    // ── Pass materials ──────────────────────────────────────────────────────

    this._curlPass = makePassMaterial(curlShader, {
      iResolution: { value: simRes.clone() },
      uVelocity:   { value: this.vel.read.texture },
    });

    this._vorticityPass = makePassMaterial(vorticityConfinementShader, {
      iResolution: { value: simRes.clone() },
      uVelocity:   { value: this.vel.read.texture },
      uDt:         { value: 1.0 },
      uEps:        { value: config.CURL },
    });

    this._divergencePass = makePassMaterial(divergenceShader, {
      iResolution: { value: simRes.clone() },
      uVelocity:   { value: this.vel.read.texture },
    });

    this._pressurePass = makePassMaterial(pressureJacobiShader, {
      iResolution: { value: simRes.clone() },
      uPressure:   { value: this.pressure.read.texture },
      uDivergence: { value: this.divergence.texture },
    });

    this._subtractPass = makePassMaterial(subtractGradientShader, {
      iResolution: { value: simRes.clone() },
      uVelocity:   { value: this.vel.read.texture },
      uPressure:   { value: this.pressure.read.texture },
    });

    this._advectVel = makePassMaterial(advectShader, {
      iResolution:    { value: simRes.clone() },
      uVelocity:      { value: this.vel.read.texture },
      uSource:        { value: this.vel.read.texture },
      uDt:            { value: 1.0 },
      uDissipation:   { value: 1.0 },
      uMaxVelocity:   { value: 1.0 },
      uVelocityScale: { value: 1.0 },
    });

    this._advectDye = makePassMaterial(advectShader, {
      iResolution:    { value: dyeRes.clone() },
      uVelocity:      { value: this.vel.read.texture },
      uSource:        { value: this.dye.read.texture },
      uDt:            { value: 1.0 },
      uDissipation:   { value: 1.0 },
      uMaxVelocity:   { value: 1.0 },
      uVelocityScale: { value: 1.0 },
    });

    this._splatVel = makePassMaterial(addForceShader, {
      iResolution: { value: simRes.clone() },
      uVelocity:   { value: this.vel.read.texture },
      uPoint:      { value: new THREE.Vector2(0.5, 0.5) },
      uForce:      { value: new THREE.Vector2(0, 0) },
      uRadius:     { value: config.SPLAT_RADIUS / 100.0 },
      uDt:         { value: 1.0 },
    });

    this._splatDye = makePassMaterial(splatDyeShader, {
      iResolution: { value: dyeRes.clone() },
      uDye:        { value: this.dye.read.texture },
      uPoint:      { value: new THREE.Vector2(0.5, 0.5) },
      uRadius:     { value: (config.SPLAT_RADIUS / 100.0) * 1.05 },
      uColor:      { value: new THREE.Color(0.15, 0.12, 0.09) },
      uAmount:     { value: 1.0 },
      uDt:         { value: 1.0 },
    });

    // Clear all
    for (const t of [this.vel.read, this.vel.write, this.dye.read, this.dye.write,
                     this.pressure.read, this.pressure.write, this.divergence, this.curl]) {
      this.base.resetTarget(t);
    }

    // Wire display uniforms
    uniforms.uDyeTex.value   = this.dye.read.texture;
    uniforms.uVelocity.value = this.vel.read.texture;
    uniforms.uCurl.value     = this.curl.texture;
    uniforms.uPressure.value = this.pressure.read.texture;

    this.reset();

    // GUI
    if (gui) gui.destroy();
    gui = new GUI({ title: 'Fluid Sim' });

    const display = gui.addFolder('Display');
    display.add(uniforms.uExposure, 'value', 0.2, 4.0, 0.1).name('Exposure');

    const sim = gui.addFolder('Simulation');
    sim.add(config, 'CURL',                0, 60,  1).name('Vorticity');
    sim.add(config, 'PRESSURE_ITERATIONS', 4, 40,  1).name('Pressure iters');
    sim.add(config, 'DENSITY_DISSIPATION', 0.9, 1.0, 0.001).name('Dye dissipation');
    sim.add(config, 'VELOCITY_DISSIPATION',0.9, 1.0, 0.001).name('Vel dissipation');
    sim.add(config, 'SPLAT_RADIUS',        0.05, 1.0, 0.01).name('Splat radius');
    sim.close();
  },

  reset() {
    if (!this.base) return;
    this._hasPrevMouse = false;
    for (const t of [this.vel.read, this.vel.write, this.dye.read, this.dye.write,
                     this.pressure.read, this.pressure.write, this.divergence, this.curl]) {
      this.base.resetTarget(t);
    }
    // Seed 15 random splats like the reference (multipleSplats(15))
    this._multipleSplats(15);
    uniforms.uDyeTex.value = this.dye.read.texture;
  },

  _multipleSplats(count) {
    for (let i = 0; i < count; i++) {
      const color = HSVtoRGB(Math.random(), 1.0, 1.0);
      const x  = Math.random();
      const y  = Math.random();
      // Large random velocity like reference (±SPLAT_FORCE * 0.45)
      const dx = config.SPLAT_FORCE * (Math.random() - 0.5) * 0.45;
      const dy = config.SPLAT_FORCE * (Math.random() - 0.5) * 0.45;
      this._splat(x, y, dx, dy, color);
    }
  },

  _splat(x, y, dx, dy, color) {
    const r = (config.SPLAT_RADIUS / 100.0) * Math.max(this._aspect, 1.0);

    // Velocity splat
    this._splatVel.uniforms.uVelocity.value = this.vel.read.texture;
    this._splatVel.uniforms.uPoint.value.set(x, y);
    this._splatVel.uniforms.uForce.value.set(dx / this._simW, dy / this._simH);
    this._splatVel.uniforms.uRadius.value = r;
    this._splatVel.uniforms.uDt.value = 1.0;
    this.base.renderTo(this.vel.write, this._splatVel);
    this.vel.swap();

    // Dye splat
    this._splatDye.uniforms.uDye.value = this.dye.read.texture;
    this._splatDye.uniforms.uPoint.value.set(x, y);
    this._splatDye.uniforms.uColor.value.setRGB(color.r, color.g, color.b);
    this._splatDye.uniforms.uRadius.value = r * 1.05;
    this._splatDye.uniforms.uAmount.value = 1.0;
    this._splatDye.uniforms.uDt.value = 1.0;
    this.base.renderTo(this.dye.write, this._splatDye);
    this.dye.swap();
  },

  update(dt, mx, my, w, h, renderer) {
    if (!this.base || !this.vel) return false;
    if (renderer !== this.renderer) return false;
    if (!config.running) return false;

    dt = Math.min(dt, 0.016666);
    cyclingHue += dt * 10 * 0.03;

    // Track mouse delta
    if (!this._hasPrevMouse) {
      this._hasPrevMouse = true;
      this._lastMouseX = mx;
      this._lastMouseY = my;
    }
    const u  = mx / w;
    const v  = 1.0 - my / h;
    const ddx = (mx - this._lastMouseX) / w  * config.SPLAT_FORCE;
    const ddy = -(my - this._lastMouseY) / h * config.SPLAT_FORCE;
    this._lastMouseX = mx;
    this._lastMouseY = my;

    const moving = Math.hypot(ddx, ddy) > 0.1;
    if (moving) {
      const col = generateColor();
      this._splat(u, v, ddx, ddy, col);
    }

    // ── Simulation step ────────────────────────────────────────────────────

    // 1. Curl
    this._curlPass.uniforms.uVelocity.value = this.vel.read.texture;
    this.base.renderTo(this.curl, this._curlPass);

    // 2. Vorticity confinement
    this._vorticityPass.uniforms.uVelocity.value = this.vel.read.texture;
    this._vorticityPass.uniforms.uDt.value = dt;
    this._vorticityPass.uniforms.uEps.value = config.CURL;
    this.base.renderTo(this.vel.write, this._vorticityPass);
    this.vel.swap();

    // 3. Divergence
    this._divergencePass.uniforms.uVelocity.value = this.vel.read.texture;
    this.base.renderTo(this.divergence, this._divergencePass);

    // 4. Pressure solve (Jacobi)
    this.base.resetTarget(this.pressure.read);
    for (let i = 0; i < config.PRESSURE_ITERATIONS; i++) {
      this._pressurePass.uniforms.uPressure.value = this.pressure.read.texture;
      this.base.renderTo(this.pressure.write, this._pressurePass);
      this.pressure.swap();
    }

    // 5. Gradient subtract
    this._subtractPass.uniforms.uVelocity.value = this.vel.read.texture;
    this._subtractPass.uniforms.uPressure.value = this.pressure.read.texture;
    this.base.renderTo(this.vel.write, this._subtractPass);
    this.vel.swap();

    // 6. Advect velocity
    this._advectVel.uniforms.uVelocity.value   = this.vel.read.texture;
    this._advectVel.uniforms.uSource.value      = this.vel.read.texture;
    this._advectVel.uniforms.uDt.value          = dt;
    this._advectVel.uniforms.uDissipation.value = config.VELOCITY_DISSIPATION;
    this.base.renderTo(this.vel.write, this._advectVel);
    this.vel.swap();

    // 7. Advect dye
    this._advectDye.uniforms.uVelocity.value   = this.vel.read.texture;
    this._advectDye.uniforms.uSource.value      = this.dye.read.texture;
    this._advectDye.uniforms.uDt.value          = dt;
    this._advectDye.uniforms.uDissipation.value = config.DENSITY_DISSIPATION;
    this.base.renderTo(this.dye.write, this._advectDye);
    this.dye.swap();

    // Update display uniforms
    uniforms.uDyeTex.value   = this.dye.read.texture;
    uniforms.uVelocity.value = this.vel.read.texture;
    uniforms.uCurl.value     = this.curl.texture;
    uniforms.uPressure.value = this.pressure.read.texture;

    return true;
  },

  onKey(key) {
    if (key === ' ')  { config.running = !config.running; return true; }
    if (key === 'r')  { this.reset(); return true; }
    if (key === 'k')  { this._multipleSplats(5); return true; }
    return false;
  },

  getHUD() {
    return `
      <div class="title">FLUID SIM</div>
      <div class="sep"></div>
      <span class="dim">Drag</span> <span class="val">inject fluid</span><br>
      <span class="dim">Vorticity</span> <span class="val">${config.CURL}</span><br>
      <span class="dim">Pressure iters</span> <span class="val">${config.PRESSURE_ITERATIONS}</span><br>
      <span class="dim">Status</span> <span class="val">${config.running ? 'running' : 'paused'}</span> <span class="dim">[Space]</span><br>
      <span class="dim">Splat [K] · Reset [R]</span>
    `;
  },

  dispose() {
    if (gui) { gui.destroy(); gui = null; }
    this._disposeSim?.();
  },

  _disposeSim() {
    if (this._disposed) return;
    this._disposed = true;
    this.vel?.dispose?.();
    this.dye?.dispose?.();
    this.pressure?.dispose?.();
    this.divergence?.dispose?.();
    this.curl?.dispose?.();
    this.base = null;
  },
};
