import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The FastAPI backend listens on PORT, default 3001. Proxying /api keeps the
// client on relative paths, so the same build works when the backend serves
// frontend/dist itself.
const BACKEND = process.env.BACKEND_URL || 'http://localhost:3001'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/api': { target: BACKEND, changeOrigin: true },
    },
  },
})
