import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/auth':     { target: 'http://localhost:8000', changeOrigin: true },
      '/stalls':   { target: 'http://localhost:8000', changeOrigin: true },
      '/menu':     { target: 'http://localhost:8000', changeOrigin: true },
      '/orders':   { target: 'http://localhost:8000', changeOrigin: true },
      '/reviews':  { target: 'http://localhost:8000', changeOrigin: true },
      '/admin':    { target: 'http://localhost:8000', changeOrigin: true },
      '/health':   { target: 'http://localhost:8000', changeOrigin: true },
      '/payments': { target: 'http://localhost:8000', changeOrigin: true },
      '/wallet':   { target: 'http://localhost:8000', changeOrigin: true },
      '/ai':       { target: 'http://localhost:8000', changeOrigin: true },
    },
  },
})
