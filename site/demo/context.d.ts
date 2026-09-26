/** The sample session site/build.ts precomputes; web/vite.demo.config.ts serves it as this module. */
declare module "virtual:demo-context" {
  const demo: {
    /** The data context, with Dates encoded as { $date: iso } (see revive() in api.ts). */
    ctx: unknown;
    sample: { id: string; sessionId: string; cwd: string; project: string; model: string };
  };
  export default demo;
}
