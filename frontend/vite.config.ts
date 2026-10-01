import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// The dev server forwards API calls to the backend, so the browser sees one origin
// and the backend needs no CORS setup. Override the target with VITE_BACKEND_URL.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiPrefix = env.VITE_API_PREFIX || '/api/v1'
  return {
    plugins: [react()],
    server: {
      proxy: {
        [apiPrefix]: { target: env.VITE_BACKEND_URL || 'http://127.0.0.1:8000', changeOrigin: true },
      },
    },
  }
})
