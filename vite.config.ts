import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
		// Backend persistence writes JSON files under /data during dev.
		// Without ignoring it, Vite can detect file changes and trigger full page reloads.
		watch: {
			ignored: ['**/data/**'],
		},
    proxy: {
      '/api/replicate': {
        target: 'https://api.replicate.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/replicate/, ''),
      },
      '/api/auth': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
      '/api/admin': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
      '/api/usage': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
      '/api/users': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
      '/api/health': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (
              id.includes('/react/') ||
              id.includes('/react-dom/') ||
              id.includes('/react-router-dom/')
            ) {
              return 'vendor-react';
            }
            if (
              id.includes('/@radix-ui/') ||
              id.includes('/lucide-react/') ||
              id.includes('/class-variance-authority/') ||
              id.includes('/clsx/') ||
              id.includes('/tailwind-merge/')
            ) {
              return 'vendor-ui';
            }
            if (id.includes('/mind-elixir/')) {
              return 'vendor-mindmap';
            }
            if (id.includes('/jspdf/') || id.includes('/html2canvas/')) {
              return 'vendor-export';
            }
            if (id.includes('/react-markdown/')) {
              return 'vendor-markdown';
            }
          }
        },
      },
    },
  },
})
