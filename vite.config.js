import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: '/hutfinder/',
  plugins: [react()],
  server: {
    proxy: {
      // Local development only: forwards /hrs/* to hut-reservation.org so the
      // browser can read live availability without a cross-origin (CORS) block.
      // In production this same data comes from the serverless function instead.
      '/hrs': {
        target: 'https://www.hut-reservation.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/hrs/, '/api/v1/reservation'),
      },
    },
  },
})
