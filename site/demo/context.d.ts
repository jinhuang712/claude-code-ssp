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

/** Stylesheets imported for their side effect; Vite bundles them. */
declare module "*.css" {}
