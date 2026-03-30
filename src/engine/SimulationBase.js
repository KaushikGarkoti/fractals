import * as THREE from 'three';
import vertexShader from '../shaders/vertex.glsl?raw';

function pickRenderTargetType(renderer) {
  // Prefer half-float/float for signed values (velocity) and more stable numerics.
  const caps = renderer.capabilities;
  const gl = renderer.getContext();

  const hasExt = (name) => {
    try {
      return !!gl.getExtension(name);
    } catch {
      return false;
    }
  };

  const isWebGL2 = !!caps?.isWebGL2;

  const supportsFloat = isWebGL2 || hasExt('EXT_color_buffer_float') || hasExt('WEBGL_color_buffer_float');
  if (supportsFloat) return THREE.FloatType;

  const supportsHalfFloat = isWebGL2 || hasExt('EXT_color_buffer_half_float') || hasExt('OES_texture_half_float');
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
    const rt = new THREE.WebGLRenderTarget(width, height, {
      type: this.type,
      format: this.format,
      // Stable fluids expects bilinear sampling during advection.
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
      // Avoid accidental mipmapping artifacts.
      generateMipmaps: false,
    });
    rt.texture.wrapS = THREE.ClampToEdgeWrapping;
    rt.texture.wrapT = THREE.ClampToEdgeWrapping;
    return rt;
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

