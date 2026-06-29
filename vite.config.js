/// <reference types="vitest" />
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  base: './',
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.{test,spec}.{ts,js}'],
    setupFiles: ['src/__tests__/setup.ts']
  }
})
