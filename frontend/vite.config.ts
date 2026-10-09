import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // ProseMirror (Kern von TipTap) als eigener Chunk, damit der Editor-Chunk unter
        // 500 kB bleibt. Wird nur von Seiten mit Rich-Text geladen, nicht beim Start.
        // prosemirror-markdown bleibt draußen: es hängt an markdown-it (sonst zirkuläre Chunks).
        manualChunks(id) {
          if (/node_modules[\\/](prosemirror-(?!markdown)[^\\/]+|orderedmap|rope-sequence|w3c-keyname)[\\/]/.test(id)) {
            return 'vendor-prosemirror';
          }
        },
      },
    },
  },
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
