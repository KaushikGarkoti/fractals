import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import GUI from 'lil-gui';
import baseGLSL from './base.glsl?raw';

// ── Shared base uniforms for every 3-D scene ─────────────────────────────────

function makeBaseUniforms() {
  // 1×1 black placeholder — replaced once an HDR finishes loading
  const envMap = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat);
  envMap.needsUpdate = true;

  return {
    iResolution:  { value: new THREE.Vector2() },
    iTime:        { value: 0 },
    iLightDir:    { value: new THREE.Vector3(0.71, 0.84, 0.71) },
    iCamPos:      { value: new THREE.Vector3() },
    iCamRight:    { value: new THREE.Vector3() },
    iCamUp:       { value: new THREE.Vector3() },
    iCamForward:  { value: new THREE.Vector3() },
    iEnvMap:      { value: envMap },
    iGroundY:     { value: -1.4 },
    iAperture:    { value: 0.0 },
    iFocalDist:   { value: 4.0 },
    iDistortion:  { value: 0.05 },
    iFog:         { value: 0.0 },
    iGrain:       { value: 0.012 },
    iVignette:    { value: 0.3 },
    iFov:         { value: 35.0 },
    iExposure:    { value: 1.0 },
    iWarmth:      { value: 0.05 },
  };
}

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * createScene(options) → scene object compatible with main.js
 *
 * options:
 *   name           string          — display name
 *   fragmentShader string          — scene-only GLSL (no base uniforms, no main)
 *   uniforms       object          — scene-specific Three.js uniforms
 *   hdrUrl         string|null     — HDR environment map URL (loaded once)
 *   cameraDefaults object          — { theta, phi, radius } — initial camera
 *   cameraReset    object          — { theta, phi, radius } — values on 'R' key
 *   onInit(gui, uniforms)          — add scene-specific GUI folders
 *   onUpdate(dt, uniforms, cam)    — scene animation each frame
 *   onKey(key, uniforms, cam) → bool
 *   onGetHUD(uniforms, cam) → html string
 */
export function createScene(options) {
  const {
    name,
    fragmentShader: sceneGLSL,
    uniforms: sceneUniforms = {},
    hdrUrl         = null,
    cameraDefaults = {},
    cameraReset    = null,
    onInit,
    onUpdate,
    onKey:     sceneOnKey,
    onGetHUD,
  } = options;

  // Merge uniforms — base first so scene values win on collision
  const uniforms = { ...makeBaseUniforms(), ...sceneUniforms };

  // Load HDR once into iEnvMap (base handles the placeholder until ready)
  if (hdrUrl) {
    new RGBELoader().load(hdrUrl, (tex) => {
      tex.wrapS      = THREE.RepeatWrapping;
      tex.wrapT      = THREE.ClampToEdgeWrapping;
      tex.minFilter  = THREE.LinearFilter;
      tex.magFilter  = THREE.LinearFilter;
      tex.needsUpdate = true;
      uniforms.iEnvMap.value = tex;
    });
  }

  // ── Camera state ────────────────────────────────────────────────────────────
  const initCam = {
    theta:  cameraDefaults.theta  ?? 0.4,
    phi:    cameraDefaults.phi    ?? 0.3,
    radius: cameraDefaults.radius ?? 5.5,
  };
  const resetCam = cameraReset
    ? { theta: cameraReset.theta ?? initCam.theta, phi: cameraReset.phi ?? initCam.phi, radius: cameraReset.radius ?? initCam.radius }
    : { ...initCam };

  const cam = {
    theta:        initCam.theta,
    phi:          initCam.phi,
    radius:       initCam.radius,
    autoOrbit:    false,
    orbitEnabled: false,
    idleTimer:    0,
    jitter:       cameraDefaults.jitter ?? 0.003,
  };

  // ── Light state ─────────────────────────────────────────────────────────────
  const light = { azimuth: 187, elevation: 21 };

  let camTime = 0;
  let gui     = null;

  function lightDir() {
    const az = light.azimuth   * Math.PI / 180;
    const el = light.elevation * Math.PI / 180;
    return new THREE.Vector3(
      Math.cos(el) * Math.sin(az),
      Math.sin(el),
      Math.cos(el) * Math.cos(az),
    );
  }

  function updateCamera(dt) {
    camTime += dt;
    if (cam.autoOrbit) cam.theta += dt * 0.18;

    const x = cam.radius * Math.sin(cam.theta) * Math.cos(cam.phi);
    const y = cam.radius * Math.sin(cam.phi);
    const z = cam.radius * Math.cos(cam.theta) * Math.cos(cam.phi);

    const pos     = new THREE.Vector3(x, y, z);
    const forward = pos.clone().negate().normalize();
    const worldUp = new THREE.Vector3(0, 1, 0);
    const right   = new THREE.Vector3().crossVectors(forward, worldUp).normalize();
    const up      = new THREE.Vector3().crossVectors(right, forward);

    if (cam.jitter > 0) {
      pos.addScaledVector(right, Math.sin(camTime * 1.3) * cam.jitter);
      pos.addScaledVector(up,    Math.cos(camTime * 1.7) * cam.jitter);
    }

    uniforms.iCamPos.value.copy(pos);
    uniforms.iCamForward.value.copy(forward);
    uniforms.iCamRight.value.copy(right);
    uniforms.iCamUp.value.copy(up);
  }

  // ── Scene object ─────────────────────────────────────────────────────────────
  return {
    name,
    // base.glsl is prepended so its forward declaration of renderScene() is
    // visible to main() before the scene implementation appears below it.
    fragmentShader: baseGLSL + '\n' + sceneGLSL,
    uniforms,

    init(w, h) {
      uniforms.iResolution.value.set(w, h);
      updateCamera(0);

      if (gui) gui.destroy();
      gui = new GUI({ title: name });

      // Scene-specific folders first (Shape, Texture, Fractal, …)
      if (onInit) onInit(gui, uniforms);

      // Base folders at the bottom
      const lighting = gui.addFolder('Lighting');
      lighting.add(light, 'azimuth',   0, 360, 1).name('Light Az°');
      lighting.add(light, 'elevation', 0,  90, 1).name('Light El°');
      lighting.add(uniforms.iGroundY, 'value', -3.0, 0.0, 0.05).name('Ground height');
      lighting.add(cam, 'orbitEnabled').name('Auto-orbit').onChange(v => {
        cam.autoOrbit = v;
        cam.idleTimer = 0;
      });

      const camera = gui.addFolder('Camera / DoF');
      camera.add(uniforms.iFov,       'value', 20.0, 90.0, 0.5  ).name('FOV°');
      camera.add(uniforms.iAperture,  'value',  0.0,  0.06, 0.001).name('Aperture (0=off)');
      camera.add(uniforms.iFocalDist, 'value',  0.5,  8.0,  0.05 ).name('Focal distance');
      camera.close();

      const look = gui.addFolder('Look');
      look.add(uniforms.iExposure,   'value',  0.2,  3.0,  0.05 ).name('Exposure');
      look.add(uniforms.iWarmth,     'value', -0.15, 0.15, 0.005).name('Warmth');
      look.add(cam,                  'jitter',  0.0,  0.02, 0.001).name('Handheld jitter');
      look.add(uniforms.iDistortion, 'value',   0.0,  0.3,  0.005).name('Lens distortion');
      look.add(uniforms.iFog,        'value',   0.0,  0.15, 0.005).name('Fog density');
      look.add(uniforms.iGrain,      'value',   0.0,  0.06, 0.002).name('Film grain');
      look.add(uniforms.iVignette,   'value',   0.0,  0.8,  0.01 ).name('Vignette');
      look.close();
    },

    dispose() {
      if (gui) { gui.destroy(); gui = null; }
    },

    reset() {
      cam.theta        = resetCam.theta;
      cam.phi          = resetCam.phi;
      cam.radius       = resetCam.radius;
      cam.autoOrbit    = false;
      cam.orbitEnabled = false;
      cam.idleTimer    = 0;
    },

    update(dt) {
      // Idle-timer: resume orbit after 3 s only when the user has it enabled
      if (cam.orbitEnabled && !cam.autoOrbit) {
        cam.idleTimer += dt;
        if (cam.idleTimer > 3.0) cam.autoOrbit = true;
      }

      updateCamera(dt);
      uniforms.iLightDir.value.copy(lightDir());

      if (onUpdate) onUpdate(dt, uniforms, cam);

      return true;
    },

    pan(dx, dy) {
      cam.theta     -= dx * 0.006;
      cam.phi        = Math.max(-1.2, Math.min(1.2, cam.phi + dy * 0.006));
      cam.autoOrbit  = false;
      cam.idleTimer  = 0;
    },

    zoomToward(_x, _y, factor) {
      cam.radius    = Math.max(1.6, Math.min(8.0, cam.radius / factor));
      cam.autoOrbit = false;
      cam.idleTimer = 0;
    },

    onKey(key) {
      if (sceneOnKey) return sceneOnKey(key, uniforms, cam);
      return false;
    },

    setLight(az, el) {
      light.azimuth   = az;
      light.elevation = el;
    },

    getLightState() { return { ...light }; },

    getHUD() {
      if (onGetHUD) return onGetHUD(uniforms, cam);
      return `
        <div class="sep"></div>
        <span class="dim">Zoom</span> <span class="val">${cam.radius.toFixed(2)}</span> <span class="dim">[scroll]</span><br>
        <span class="dim">Drag to orbit · ${cam.autoOrbit ? 'auto-orbit' : 'manual'}</span>
      `;
    },
  };
}
