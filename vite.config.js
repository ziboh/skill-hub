/// <reference types="vitest" />
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    watch: {
      ignored: ["**/.*"],
    },
  },
  base: "./",
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("vue")) return "vendor-vue";
            if (
              id.includes("@codemirror") ||
              id.includes("codemirror") ||
              id.includes("@lezer")
            )
              return "vendor-codemirror";
            if (id.includes("highlight.js") || id.includes("prismjs"))
              return "vendor-highlight";
            return "vendor";
          }
        },
      },
    },
  },
  test: {
    environment: "happy-dom",
    include: ["src/**/*.{test,spec}.{ts,js}"],
    setupFiles: ["src/__tests__/setup.ts"],
  },
});
