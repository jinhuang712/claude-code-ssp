import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5178,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:4877",
        // The API only answers requests whose Host and Origin are its own (drive-by / DNS-rebinding
        // protection, see src/server/guard.ts). The dev page lives on :5178, so the proxy speaks for it.
        changeOrigin: true,
        configure: (proxy) =>
          proxy.on("proxyReq", (req) => {
            if (req.getHeader("origin")) req.setHeader("origin", "http://127.0.0.1:4877");
            req.removeHeader("sec-fetch-site");
          }),
      },
    },
  },
  build: { outDir: "dist", emptyOutDir: true, chunkSizeWarningLimit: 800 },
});
