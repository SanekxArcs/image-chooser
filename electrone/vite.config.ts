import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: 'src/renderer',
  base: './',
  build: {
    outDir: '../../out/renderer',
    emptyOutDir: true,
    target: 'chrome130',
  },
  worker: {
    format: 'es',
  },
  plugins: [react()],
})
