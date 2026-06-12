import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5100,
    watch: { usePolling: true },   // needed inside Docker
    proxy: {
      '/api': {
        target: 'http://backend:5101',
        changeOrigin: true,
      },
    },
  },
})
