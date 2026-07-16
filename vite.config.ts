import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        devOptions: { enabled: true },
        includeAssets: ['favicon.svg', 'icons/*.svg'],
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.ts',
        injectManifest: {
          rollupOptions: {
            output: {
              inlineDynamicImports: true,
            },
          },
        },
        manifest: {
          name: 'Lecture-to-Mastery',
          short_name: 'L2M',
          description: 'Turn lectures into structured summaries, flashcards, quizzes, and interactive study tools powered by AI.',
          theme_color: '#3366FF',
          background_color: '#F4F5F7',
          display: 'standalone',
          orientation: 'any',
          start_url: '/',
          scope: '/',
          icons: [
            { src: '/icons/icon-192.svg', sizes: '192x192', type: 'image/svg+xml' },
            { src: '/icons/icon-512.svg', sizes: '512x512', type: 'image/svg+xml' },
            { src: '/icons/icon-512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any' },
            { src: '/icons/icon-maskable.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'maskable' },
          ],
        },
      }),
    ],

    server: {
      proxy: {
        '/api/functions': {
          target: env.VITE_SUPABASE_URL,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/functions/, '/functions/v1'),
          // F1: Increase proxy timeout from default 30s → 120s to prevent
          // 502 when edge functions take long (Mistral AI calls can be slow).
          timeout: 120_000,
          proxyTimeout: 120_000,
        },
      },
    },

    build: {
      chunkSizeWarningLimit: 800,
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            // Stable vendor chunk for React ecosystem
            if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') ||
                id.includes('node_modules/@tanstack/react-router') ||
                id.includes('node_modules/@supabase/supabase-js') ||
                id.includes('node_modules/zustand')) {
              return 'vendor'
            }
            // UI icons — changes less frequently than app code
            if (id.includes('node_modules/lucide-react')) {
              return 'vendor-icons'
            }
            // Font loading
            if (id.includes('node_modules/@fontsource/inter')) {
              return 'vendor-fonts'
            }
            // Heavy graph library — lazy-loaded, keep out of main vendor chunk
            if (id.includes('node_modules/@xyflow/react')) {
              return 'vendor-xyflow'
            }
          },
        },
      },
    },
  }
})
