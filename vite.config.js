import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Base path must match your GitHub repo name exactly
// e.g. if your repo is github.com/zacharydelaney/draft-board
// then base should be '/draft-board/'
export default defineConfig({
  plugins: [react()],
  base: '/draft-board/',
})
