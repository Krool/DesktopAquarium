import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        collection: "collection.html",
        settings: "settings.html",
      },
    },
  },
});
