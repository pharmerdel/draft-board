import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH || '/',
  server: {
    proxy: {
      '/__fantasypros': {
        target: 'https://www.fantasypros.com',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/__fantasypros/, ''),
      },
    },
  },
})
