import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5178,
    proxy: { "/api": "http://127.0.0.1:4877" },
  },
  build: { outDir: "dist", emptyOutDir: true, chunkSizeWarningLimit: 800 },
});
