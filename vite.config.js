import { defineConfig } from 'vite'

export default defineConfig({
  base: '/fractals/',
  build: {
    rollupOptions: {
      output: {
        manualChunks: undefined
      }
    }
  },
  optimizeDeps: {
    include: ['three']
  }
})