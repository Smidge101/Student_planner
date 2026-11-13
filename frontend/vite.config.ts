import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The dev server forwards /api to Django, so the browser sees one site:
// session cookies and CSRF work without any cross-origin setup.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // changeOrigin: false keeps the browser's Host header (localhost:5173),
    // which Django's CSRF check compares against the request's Origin.
    proxy: {
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: false },
      '/admin': { target: 'http://127.0.0.1:8000', changeOrigin: false },
    },
  },
})
