import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/UFLMB/',
  publicDir: 'public',
  plugins: [react()],
  build: {
    copyPublicDir: true,
  },
})
