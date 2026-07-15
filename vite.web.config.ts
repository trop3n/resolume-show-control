import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Standalone Vite config to run ONLY the renderer in a normal browser (design preview).
// A mock backend (installed in main.tsx when window.api is absent) stands in for the
// Electron main process, so there is no live Resolume / no filesystem here.
// `host: true` binds 0.0.0.0 so a Windows browser can reach the WSL2 dev server.
export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  plugins: [react()],
  server: {
    host: true,
    port: 5199,
    strictPort: true
  }
})
