/**
 * The configurator as the GitHub Pages demo (built by site/build.ts into site/dist/demo). The same
 * app as vite.config.ts, plus site/demo/api.ts loaded before it, which answers the app's /api/*
 * calls in the browser with the real render engine. The engine's few node: imports go to browser
 * stand-ins (site/demo/node-shims.ts); nothing on the demo's render path touches the disk.
 *
 * Kept next to vite.config.ts so the React and Tailwind plugins resolve from web/node_modules.
 * It is not in scripts/web-hash.ts's inputs: it doesn't change web/dist.
 */
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import * as fs from "node:fs";
import * as path from "node:path";
import { defineConfig, type Plugin } from "vite";

const SITE = path.resolve(import.meta.dirname, "../site");
const SHIMS = path.join(SITE, "demo/node-shims.ts");
const DEMO_ENTRY = "/@demo-api";
/** The sample session site/build.ts precomputes; a virtual module, so no source imports a build artefact by path. */
const CONTEXT_ID = "virtual:demo-context";
const CONTEXT_FILE = path.join(SITE, ".build/demo-context.json");

/** Adds the in-browser API as the page's first module script, so it is in place before main.tsx fetches. */
function demoApi(): Plugin {
  return {
    name: "super-statusline-demo-api",
    // "\0" marks a virtual module, so no other plugin tries to read it from disk.
    resolveId: (id) => (id === DEMO_ENTRY ? path.join(SITE, "demo/api.ts") : id === CONTEXT_ID ? `\0${CONTEXT_ID}` : null),
    load: (id) => (id === `\0${CONTEXT_ID}` ? `export default ${fs.readFileSync(CONTEXT_FILE, "utf8")};` : null),
    // "pre": Vite collects the page's module scripts in its own HTML transform; a later hook's tag
    // would be left unbundled.
    transformIndexHtml: {
      order: "pre",
      handler: (html) =>
        html
          .replace('<script type="module" src="/src/main.tsx">', `<script type="module" src="${DEMO_ENTRY}"></script>\n    <script type="module" src="/src/main.tsx">`)
          .replace("<title>super-statusline</title>", "<title>super-statusline · demo</title>"),
    },
  };
}

export default defineConfig({
  // Relative asset URLs: the site is served from /<repo>/demo/ on GitHub Pages.
  base: "./",
  plugins: [react(), tailwindcss(), demoApi()],
  resolve: { alias: { "node:fs": SHIMS, "node:os": SHIMS, "node:path": SHIMS } },
  build: { outDir: path.join(SITE, "dist/demo"), emptyOutDir: true, chunkSizeWarningLimit: 1200 },
});
