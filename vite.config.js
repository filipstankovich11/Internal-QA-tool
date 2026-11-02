import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5001',
        // api/scorecard_v8.json is also imported by the frontend (the shared V8
        // rubric) — serve it from disk instead of forwarding it to Flask.
        bypass: req => (req.url.split('?')[0].endsWith('.json') ? req.url : undefined),
      },
    }
  }
})
