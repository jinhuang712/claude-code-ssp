/**
 * The welcome page's one module script (web/vite.demo.config.ts puts it in the page).
 *
 * The page's styles and behaviour load everywhere. The configurator — its in-browser API
 * (./api.ts) and then the app itself (web/src/main.tsx, mounted into #root in section #try) — only
 * loads on a screen wide enough to use it: on a phone the section is hidden (site.css) and the
 * app, its fonts and its data would be downloaded for nothing. If a narrow window is widened
 * later, the configurator loads then.
 */
import "../site.css";
import "../landing";

/** Same breakpoint as site.css's desktop/phone split. */
const wide = matchMedia("(min-width: 50rem)");
let started = false;

async function startConfigurator(): Promise<void> {
  if (started || !wide.matches) return;
  started = true;
  // The API first: it replaces fetch for /api/*, and the app fetches as soon as it mounts.
  await import("./api");
  await import("virtual:app-main");
}

void startConfigurator();
wide.addEventListener("change", () => void startConfigurator());
