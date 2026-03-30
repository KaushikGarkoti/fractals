import * as THREE from 'three';
import { SimulationBase, makePassMaterial } from '../engine/SimulationBase.js';

import addForceShader from './shaders/addForce.glsl?raw';
import advectShader from './shaders/advect.glsl?raw';
import splatDyeShader from './shaders/splatDye.glsl?raw';
import displayShader from './shaders/fluidDisplay.glsl?raw';

const uniforms = {
  iTime: { value: 0 },
  iResolution: { value: new THREE.Vector2() },
  uDyeTex: { value: null },
};

const state = {
  // GPU grid is a scaled version of the screen.
  quality: 0.55,
  maxSim: 512,

  // Motion/injection.
  forceScale: 4.0,
  splatRadius: 0.04,
  dyeAmount: 10.0,

  velDamping: 0.985, // per ~frame at 60fps
  dyeDamping: 0.992, // per ~frame at 60fps

  maxVelocity: 0.9,
  running: true,
};

const tmpColor = new THREE.Color();
const tmpVec2 = new THREE.Vector2();

export default {
  name: 'Fluid Sim',
  fragmentShader: displayShader,
  uniforms,

  init(w, h, renderer) {
    // (Re)initialize simulation resources.
    this._disposeSim?.();

    this.renderer = renderer;
    this.base = new SimulationBase(renderer);

    this._lastW = w;
    this._lastH = h;
    this._hasPrevMouse = false;
    this._lastMouseX = 0;
    this._lastMouseY = 0;

    const simW = Math.max(48, Math.min(state.maxSim, Math.floor(w * state.quality)));
    const simH = Math.max(48, Math.min(state.maxSim, Math.floor(h * state.quality)));
    this._simW = simW;
    this._simH = simH;

    // Ping-pong state.
    this.vel = this.base.createPingPong(simW, simH);
    this.dye = this.base.createPingPong(simW, simH);

    // Pass materials.
    this._iRes = new THREE.Vector2(simW, simH);
    this._splatVel = makePassMaterial(addForceShader, {
      iResolution: { value: this._iRes.clone() },
      uVelocity: { value: this.vel.read.texture },
      uPoint: { value: new THREE.Vector2(0.5, 0.5) },
      uForce: { value: new THREE.Vector2(0, 0) },
      uRadius: { value: state.splatRadius },
      uDt: { value: 1 },
    });

    // Generic advection for velocity and dye.
    this._advect = makePassMaterial(advectShader, {
      iResolution: { value: this._iRes.clone() },
      uVelocity: { value: this.vel.read.texture },
      uSource: { value: this.dye.read.texture },
      uDt: { value: 1 },
      uDissipation: { value: 1 },
      uMaxVelocity: { value: state.maxVelocity },
      uVelocityScale: { value: 0.35 },
    });

    this._splatDye = makePassMaterial(splatDyeShader, {
      iResolution: { value: this._iRes.clone() },
      uDye: { value: this.dye.read.texture },
      uPoint: { value: new THREE.Vector2(0.5, 0.5) },
      uRadius: { value: state.splatRadius * 1.05 },
      uColor: { value: new THREE.Vector3(1.0, 0.3, 0.6) },
      uAmount: { value: state.dyeAmount },
      uDt: { value: 1 },
    });

    // Clear ping-pong textures.
    this.base.resetTarget(this.vel.read);
    this.base.resetTarget(this.vel.write);
    this.base.resetTarget(this.dye.read);
    this.base.resetTarget(this.dye.write);

    // Store for display.
    uniforms.uDyeTex.value = this.dye.read.texture;

    // Seed initial dye so the screen isn't black until first input.
    this.reset();
  },

  reset() {
    if (!this.base) return;
    this._hasPrevMouse = false;
    this.base.resetTarget(this.vel.read);
    this.base.resetTarget(this.vel.write);
    this.base.resetTarget(this.dye.read);
    this.base.resetTarget(this.dye.write);

    // Seed a tiny dye blob at center for instant feedback.
    this._splatDye.uniforms.uPoint.value.set(0.5, 0.5);
    this._splatDye.uniforms.uColor.value.set(1.0, 0.6, 0.9);
    this._splatDye.uniforms.uAmount.value = state.dyeAmount * 0.4;
    this._splatDye.uniforms.uDt.value = 1.0;
    this._splatDye.uniforms.uDye.value = this.dye.read.texture;
    this.base.renderTo(this.dye.write, this._splatDye);
    this.dye.swap();
    uniforms.uDyeTex.value = this.dye.read.texture;
  },

  update(dt, mx, my, w, h, renderer) {
    if (!this.base || !this.vel || !this.dye) return false;
    if (renderer !== this.renderer) return false;
    if (!state.running) return false;

    if (!this._hasPrevMouse) {
      this._hasPrevMouse = true;
      this._lastMouseX = mx;
      this._lastMouseY = my;
    }

    // Map screen coords (pixel space, y-down) → UV [0,1] (y-up).
    const u = mx / w;
    const v = 1.0 - my / h;
    tmpVec2.set(u, v);

    const dx = mx - this._lastMouseX;
    const dy = my - this._lastMouseY;
    this._lastMouseX = mx;
    this._lastMouseY = my;

    // Convert mouse motion to a velocity impulse.
    const velIncX = (dx / w) * state.forceScale;
    const velIncY = -(dy / h) * state.forceScale;
    const velIncMag = Math.hypot(velIncX, velIncY);

    // If the mouse isn't moving, keep the injection calm.
    const motion = Math.min(1.0, velIncMag * 6.0);
    const doSplat = motion >= 1e-4;

    // Dye color cycles with time so splats look alive.
    tmpColor.setHSL((this.uniforms.iTime.value * 0.06) % 1.0, 0.95, 0.58);

    const frameFactor = dt * 60.0;
    const velDiss = Math.pow(state.velDamping, frameFactor);
    const dyeDiss = Math.pow(state.dyeDamping, frameFactor);

    if (doSplat) {
      // --------------------
      // 1) Velocity splat
      // --------------------
      this._splatVel.uniforms.uVelocity.value = this.vel.read.texture;
      this._splatVel.uniforms.uPoint.value.copy(tmpVec2);
      this._splatVel.uniforms.uForce.value.set(velIncX, velIncY);
      this._splatVel.uniforms.uRadius.value = state.splatRadius;
      this._splatVel.uniforms.uDt.value = 1.0;
      this.base.renderTo(this.vel.write, this._splatVel);
      this.vel.swap();
    }

    // --------------------
    // 2) Velocity advection (self-transport)
    // --------------------
    this._advect.uniforms.uVelocity.value = this.vel.read.texture;
    this._advect.uniforms.uSource.value = this.vel.read.texture;
    this._advect.uniforms.uDt.value = dt;
    this._advect.uniforms.uDissipation.value = velDiss;
    this.base.renderTo(this.vel.write, this._advect);
    this.vel.swap();

    if (doSplat) {
      // --------------------
      // 3) Dye splat
      // --------------------
      this._splatDye.uniforms.uDye.value = this.dye.read.texture;
      this._splatDye.uniforms.uPoint.value.copy(tmpVec2);
      this._splatDye.uniforms.uColor.value.copy(tmpColor);
      this._splatDye.uniforms.uRadius.value = state.splatRadius * 1.05;
      this._splatDye.uniforms.uAmount.value = state.dyeAmount * motion;
      this._splatDye.uniforms.uDt.value = 1.0;
      this.base.renderTo(this.dye.write, this._splatDye);
      this.dye.swap();
    }

    // --------------------
    // 4) Dye advection (dye follows velocity)
    // --------------------
    this._advect.uniforms.uVelocity.value = this.vel.read.texture;
    this._advect.uniforms.uSource.value = this.dye.read.texture;
    this._advect.uniforms.uDt.value = dt;
    this._advect.uniforms.uDissipation.value = dyeDiss;
    this.base.renderTo(this.dye.write, this._advect);
    this.dye.swap();

    uniforms.uDyeTex.value = this.dye.read.texture;
    return true;
  },

  onKey(key) {
    if (key === ' ') {
      state.running = !state.running;
      return true;
    }

    if (key === 'r') {
      this.reset();
      return true;
    }

    if (key === 'c') {
      this.reset();
      return true;
    }

    if (key === 'f') {
      state.forceScale = Math.min(30.0, state.forceScale + 2.0);
      return true;
    }

    if (key === 'v') {
      state.forceScale = Math.max(2.0, state.forceScale - 2.0);
      return true;
    }

    return false;
  },

  getHUD() {
    return `
      <div class="title">FLUID SIM</div>
      <div class="sep"></div>
      <span class="dim">Inject</span> <span class="val">mouse motion</span><br>
      <span class="dim">Splat radius</span> <span class="val">${state.splatRadius.toFixed(3)}</span><br>
      <span class="dim">Force</span> <span class="val">${state.forceScale.toFixed(1)}</span><span class="dim"> [F/V]</span><br>
      <span class="dim">Velocity + Dye</span><span class="val">${state.running ? 'running' : 'paused'}</span><span class="dim"> [Space]</span><br>
      <span class="dim">Clear</span> <span class="val">[C]</span><br>
    `;
  },

  dispose() {
    this._disposeSim?.();
  },

  _disposeSim() {
    if (this._disposed) return;
    this._disposed = true;

    this.vel?.dispose?.();
    this.dye?.dispose?.();
    this._splatVel?.dispose?.();
    this._advect?.dispose?.();
    this._splatDye?.dispose?.();
    this.base = null;
  },
};

