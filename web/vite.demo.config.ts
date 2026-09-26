/**
 * The GitHub Pages site (built by site/build.ts into site/dist): the welcome page with the
 * configurator mounted inside it — one page, one scroll.
 *
 * The page is this app's index.html replaced by site/.build/index.html (site/index.html with the
 * presets rendered in), whose one module script is site/demo/entry.ts. That entry loads the page's
 * CSS and behaviour, and on a wide screen site/demo/api.ts (the app's /api/* answered in the
 * browser, by the real render engine) followed by the app itself. The engine's few node: imports
 * go to browser stand-ins (site/demo/node-shims.ts); nothing on the page's render path touches the
 * disk.
 *
 * Kept next to vite.config.ts so the React and Tailwind plugins resolve from web/node_modules and
 * Tailwind scans the app's sources as usual. It is not in scripts/web-hash.ts's inputs: it doesn't
 * change web/dist.
 */
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import * as fs from "node:fs";
import * as path from "node:path";
import { defineConfig, type Plugin } from "vite";

const SITE = path.resolve(import.meta.dirname, "../site");
const SHIMS = path.join(SITE, "demo/node-shims.ts");
/** The page, with the presets already rendered in (site/build.ts writes it before building). */
const PAGE = path.join(SITE, ".build/index.html");
const ENTRY_ID = "/@demo-entry";
/** The sample session site/build.ts precomputes; a virtual module, so no source imports a build artefact by path. */
const CONTEXT_ID = "virtual:demo-context";
const CONTEXT_FILE = path.join(SITE, ".build/demo-context.json");
/**
 * App modules by names the site's sources can import without type-checking the app: its entry,
 * and its language and appearance stores. They resolve to the app's own files, so the page gets
 * the very module instances the app uses (one store each, not a copy).
 */
const APP_MODULES: Record<string, string> = {
  "virtual:app-main": "src/main.tsx",
  "virtual:app-lang": "src/i18n/index.ts",
  "virtual:app-theme": "src/theme.ts",
};

function welcomePage(): Plugin {
  return {
    name: "super-statusline-welcome-page",
    // "\0" marks a virtual module, so no other plugin tries to read it from disk.
    resolveId: (id) => {
      if (id === ENTRY_ID) return path.join(SITE, "demo/entry.ts");
      if (id === CONTEXT_ID) return `\0${CONTEXT_ID}`;
      if (APP_MODULES[id]) return path.resolve(import.meta.dirname, APP_MODULES[id]);
      return null;
    },
    load: (id) => (id === `\0${CONTEXT_ID}` ? `export default ${fs.readFileSync(CONTEXT_FILE, "utf8")};` : null),
    // "pre": the whole document is swapped before Vite collects its scripts and assets.
    transformIndexHtml: { order: "pre", handler: () => fs.readFileSync(PAGE, "utf8") },
  };
}

export default defineConfig({
  // Relative asset URLs: the site is served from /<repo>/ on GitHub Pages.
  base: "./",
  plugins: [react(), tailwindcss(), welcomePage()],
  resolve: { alias: { "node:fs": SHIMS, "node:os": SHIMS, "node:path": SHIMS } },
  build: { outDir: path.join(SITE, "dist"), emptyOutDir: true, chunkSizeWarningLimit: 1200 },
});
