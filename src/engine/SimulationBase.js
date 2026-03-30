import * as THREE from 'three';
import vertexShader from '../shaders/vertex.glsl?raw';

function pickRenderTargetType(renderer) {
  // Try to keep this robust across WebGL1/WebGL2. We prefer float, then half-float, then byte.
  const caps = renderer.capabilities;

  const hasExt = (name) => {
    // three.js sometimes stores extensions in `renderer.extensions`.
    try {
      return !!renderer.extensions?.has?.(name);
    } catch {
      return false;
    }
  };

  const supportsFloat = caps.isWebGL2 || hasExt('EXT_color_buffer_float') || hasExt('WEBGL_color_buffer_float');
  if (supportsFloat) return THREE.FloatType;

  const supportsHalfFloat = caps.isWebGL2 || hasExt('EXT_color_buffer_half_float') || hasExt('OES_texture_half_float');
  if (supportsHalfFloat) return THREE.HalfFloatType;

  return THREE.UnsignedByteType;
}

export class SimulationBase {
  constructor(renderer) {
    this.renderer = renderer;

    // Fullscreen quad scene/camera for offscreen simulation passes.
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quadGeo = new THREE.PlaneGeometry(2, 2);
    this.quad = new THREE.Mesh(this.quadGeo, null);
    this.scene.add(this.quad);

    this.type = pickRenderTargetType(renderer);
    this.format = THREE.RGBAFormat;
  }

  createRenderTarget(width, height) {
    return new THREE.WebGLRenderTarget(width, height, {
      type: this.type,
      format: this.format,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: false,
      stencilBuffer: false,
      // Avoid accidental mipmapping artifacts.
      generateMipmaps: false,
    });
  }

  createPingPong(width, height) {
    const read = this.createRenderTarget(width, height);
    const write = this.createRenderTarget(width, height);

    const pingPong = {
      read,
      write,
      swap() {
        const tmp = this.read;
        this.read = this.write;
        this.write = tmp;
      },
      dispose() {
        read.dispose();
        write.dispose();
      },
    };

    return pingPong;
  }

  renderTo(target, material) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.camera);
    // Ensure subsequent rendering (e.g. your main screen quad) targets the canvas.
    this.renderer.setRenderTarget(null);
  }

  resetTarget(target) {
    // Clear with transparent black to avoid NaNs/garbage across ping-pong.
    this.renderer.setRenderTarget(target);
    this.renderer.clear(true, true, true);
    this.renderer.setRenderTarget(null);
  }
}

export function makePassMaterial(fragmentShader, uniforms = {}) {
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
  });
}

