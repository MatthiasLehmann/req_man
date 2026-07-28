import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // Standard: nur localhost. Für Netzwerkzugriff via start.sh --host wird
    // VITE_HOST=0.0.0.0 gesetzt (bindet alle Interfaces).
    host: process.env.VITE_HOST || 'localhost',
    // Vite 6 blockt sonst Zugriffe über einen Hostnamen (z. B. mac.local).
    allowedHosts: process.env.VITE_ALLOW_ALL_HOSTS ? true : undefined,
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
