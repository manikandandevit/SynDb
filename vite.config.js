import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react(),
    // tailwindcss(),
  ],
  server: {
    host: "0.0.0.0",
    allowedHosts: [
      'rashly-nonarbitrary-brendon.ngrok-free.dev',
      '.ngrok-free.dev',
      '.ngrok.io'
    ],
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
