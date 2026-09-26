/** The sample session site/build.ts precomputes; web/vite.demo.config.ts serves it as this module. */
declare module "virtual:demo-context" {
  const demo: {
    /** The data context, with Dates encoded as { $date: iso } (see revive() in api.ts). */
    ctx: unknown;
    sample: { id: string; sessionId: string; cwd: string; project: string; model: string };
  };
  export default demo;
}

/**
 * The configurator's entry, web/src/main.tsx (mounts into #root). Resolved by
 * web/vite.demo.config.ts; typed as a side-effect module here, since the site's tsconfig has no JSX.
 */
declare module "virtual:app-main" {}

/**
 * The configurator's language and appearance stores (web/src/i18n/index.ts, web/src/theme.ts):
 * only what the page's switches use, typed here for the same reason as virtual:app-main.
 */
declare module "virtual:app-lang" {
  export const useLang: {
    getState(): { lang: "en" | "zh"; setLang(l: "en" | "zh"): void };
    subscribe(cb: (s: { lang: "en" | "zh" }) => void): () => void;
  };
}
declare module "virtual:app-theme" {
  export const useTheme: {
    getState(): { pref: "system" | "light" | "dark"; setPref(p: "system" | "light" | "dark"): void };
    subscribe(cb: (s: { pref: "system" | "light" | "dark" }) => void): () => void;
  };
}

/** Stylesheets imported for their side effect; Vite bundles them. */
declare module "*.css" {}
