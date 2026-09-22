import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
  rollupOptions: {
    input: {
      main: fileURLToPath(new URL('./index.html', import.meta.url)),
      notfound: fileURLToPath(new URL('./404.html', import.meta.url)),
      // Folders rather than imprint.html, so /imprint/ works the same in
      // `npm run dev` and on GitHub Pages.
      faq: fileURLToPath(new URL('./faq/index.html', import.meta.url)),
      imprint: fileURLToPath(new URL('./imprint/index.html', import.meta.url)),
      privacy: fileURLToPath(new URL('./privacy/index.html', import.meta.url)),
    },
  },
},
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
