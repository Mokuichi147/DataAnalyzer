import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import removeConsole from 'vite-plugin-remove-console'

export default defineConfig({
  plugins: [
    react(),
    removeConsole({
      // 本番環境でのみconsole.logを削除
      includes: ['log'],
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      buffer: 'buffer',
    },
  },
  optimizeDeps: {
    exclude: ['@duckdb/duckdb-wasm'],
    include: ['buffer'],
  },
  define: {
    global: 'globalThis',
  },
  server: {
    fs: {
      allow: ['..'],
    },
  },
})