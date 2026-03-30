import * as THREE from 'three';
import { createScene } from '../engine/SceneBase.js';
import fragmentShader from '../shaders/warpField.glsl?raw';
import hdrUrl from '../textures/tree_lined_driveway_2k.hdr?url';

export default createScene({
  name: 'Warp Field',
  fragmentShader,
  hdrUrl,
  cameraDefaults: { theta: 0.5, phi: 0.2, radius: 6.0 },
  cameraReset:    { theta: 0.5, phi: 0.2, radius: 6.0 },

  uniforms: {
    iSurfDist:      { value: 0.003 },
    iWarpStrength:  { value: 0.7 },
    iWarpScale:     { value: 1.1 },
    iWarpSpeed:     { value: 0.6 },
    iBaseRadius:    { value: 1.3 },
    iOctaves:       { value: 2.0 },        // kept low for marching perf
    iDetailOctaves: { value: 4.0 },        // richer at hit point only
    iInnerColor:    { value: new THREE.Color('#1a0533') },  // deep purple
    iOuterColor:    { value: new THREE.Color('#c084fc') },  // lilac
    iRoughness:     { value: 0.35 },
    // Look overrides
    iFov:           { value: 55.0 },
    iExposure:      { value: 1.6 },
    iWarmth:        { value: -0.03 },   // slightly cool
    iDistortion:    { value: 0.04 },
    iGrain:         { value: 0.01 },
    iVignette:      { value: 0.35 },
  },

  onInit(gui, uniforms) {
    const warp = gui.addFolder('Warp');
    warp.add(uniforms.iWarpStrength,  'value', 0.0,  2.0, 0.05).name('Strength');
    warp.add(uniforms.iWarpScale,     'value', 0.2,  4.0, 0.05).name('Scale');
    warp.add(uniforms.iWarpSpeed,     'value', 0.0,  3.0, 0.05).name('Speed');
    warp.add(uniforms.iBaseRadius,    'value', 0.3,  2.5, 0.05).name('Base radius');
    warp.add(uniforms.iOctaves,       'value', 1.0,  4.0, 1.0 ).name('March octaves');
    warp.add(uniforms.iDetailOctaves, 'value', 1.0,  6.0, 1.0 ).name('Detail octaves');

    const mat = gui.addFolder('Material');
    mat.add(uniforms.iRoughness, 'value', 0.0, 1.0, 0.02).name('Roughness');
    const innerProxy = { color: '#1a0533' };
    const outerProxy = { color: '#c084fc' };
    mat.addColor(innerProxy, 'color').name('Inner color').onChange(v => uniforms.iInnerColor.value.set(v));
    mat.addColor(outerProxy, 'color').name('Outer color').onChange(v => uniforms.iOuterColor.value.set(v));
  },

  onUpdate(_dt, _uniforms) {
    // Animation driven entirely by iTime in GLSL
  },

  onGetHUD(uniforms, cam) {
    return `
      <div class="title">WARP FIELD</div>
      <div class="sep"></div>
      <span class="dim">Strength</span> <span class="val">${uniforms.iWarpStrength.value.toFixed(2)}</span><br>
      <span class="dim">Scale</span>    <span class="val">${uniforms.iWarpScale.value.toFixed(2)}</span><br>
      <span class="dim">Speed</span>    <span class="val">${uniforms.iWarpSpeed.value.toFixed(2)}×</span><br>
      <span class="dim">Zoom</span>     <span class="val">${cam.radius.toFixed(2)}</span> <span class="dim">[scroll]</span><br>
      <span class="dim">Drag to orbit · ${cam.autoOrbit ? 'auto-orbit' : 'manual'}</span>
    `;
  },
});
