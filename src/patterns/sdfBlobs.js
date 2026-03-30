import * as THREE from 'three';
import { createScene } from '../engine/SceneBase.js';
import fragmentShader from '../shaders/sdfBlobs.glsl?raw';
import hdrUrl from '../textures/tree_lined_driveway_2k.hdr?url';

export default createScene({
  name: 'SDF Blobs',
  fragmentShader,
  hdrUrl,
  cameraDefaults: { theta: 0.5, phi: 0.25, radius: 7.0 },
  cameraReset:    { theta: 0.5, phi: 0.25, radius: 7.0 },

  uniforms: {
    iSurfDist:   { value: 0.002 },
    iBlend:      { value: 0.8 },
    iBlobSpeed:  { value: 0.4 },
    iBlobRadius: { value: 0.7 },
    iBlobOrbit:  { value: 1.4 },
    iBaseColor:  { value: new THREE.Color('#8ab4f8') },  // cool blue outer
    iInnerColor: { value: new THREE.Color('#f0c4ff') },  // warm lavender at merge points
    iRoughness:  { value: 0.25 },
    // Look overrides
    iFov:        { value: 60.0 },
    iExposure:   { value: 1.4 },
    iWarmth:     { value: 0.02 },
    iDistortion: { value: 0.0 },
    iGrain:      { value: 0.008 },
    iVignette:   { value: 0.25 },
  },

  onInit(gui, uniforms) {
    const blobs = gui.addFolder('Blobs');
    blobs.add(uniforms.iBlend,      'value', 0.05, 3.0,  0.05).name('Blend (softness)');
    blobs.add(uniforms.iBlobRadius, 'value', 0.2,  1.5,  0.05).name('Size');
    blobs.add(uniforms.iBlobOrbit,  'value', 0.3,  3.0,  0.05).name('Orbit radius');
    blobs.add(uniforms.iBlobSpeed,  'value', 0.0,  3.0,  0.05).name('Speed');
    blobs.add(uniforms.iRoughness,  'value', 0.0,  1.0,  0.02).name('Roughness');
    blobs.add(uniforms.iSurfDist,   'value', 0.0005, 0.01, 0.0005).name('Surface dist');

    const outerProxy = { color: '#8ab4f8' };
    const innerProxy = { color: '#f0c4ff' };
    blobs.addColor(outerProxy, 'color').name('Outer color').onChange(v => uniforms.iBaseColor.value.set(v));
    blobs.addColor(innerProxy, 'color').name('Inner (merge) color').onChange(v => uniforms.iInnerColor.value.set(v));
  },

  onUpdate(_dt, _uniforms) {
    // Animation is driven entirely by iTime in GLSL
  },

  onGetHUD(uniforms, cam) {
    return `
      <div class="title">SDF BLOBS</div>
      <div class="sep"></div>
      <span class="dim">Blend</span> <span class="val">${uniforms.iBlend.value.toFixed(2)}</span><br>
      <span class="dim">Speed</span> <span class="val">${uniforms.iBlobSpeed.value.toFixed(2)}×</span><br>
      <span class="dim">Zoom</span> <span class="val">${cam.radius.toFixed(2)}</span> <span class="dim">[scroll]</span><br>
      <span class="dim">Drag to orbit · ${cam.autoOrbit ? 'auto-orbit' : 'manual'}</span>
    `;
  },
});
