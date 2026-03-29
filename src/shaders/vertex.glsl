// Passthrough vertex shader.
// The fullscreen quad is a PlaneGeometry(2,2), which already spans
// NDC space [-1,1]×[-1,1], so no matrix transform is needed.
void main() {
  gl_Position = vec4(position, 1.0);
}
