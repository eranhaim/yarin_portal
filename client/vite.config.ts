import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // The 3D mascot chunk (three.js) is about 0.9 MB. It loads lazily, only on pages that show the mascot.
    chunkSizeWarningLimit: 1000,
  },
  server: {
    // In development, forward API calls to the Express server.
    // In production, Caddy does the same job (see client/Caddyfile).
    proxy: {
      '/api': 'http://localhost:4100',
    },
  },
})
