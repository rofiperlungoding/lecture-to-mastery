import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react()],

    server: {
      proxy: {
        '/api/functions': {
          target: env.VITE_SUPABASE_URL,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^/api/functions/, '/functions/v1'),
        },
      },
    },
  }
})
