/**
 * Detached helper: `bun vcs-refresh.ts <cwd>`. Spawned by resolveVcsStatus (vcs-cache.ts) when a
 * fresh git/jj status missed the render deadline. It finishes the status with the collectors' normal
 * timeouts and writes the cache, so the next render is up to date while the render itself exits
 * immediately. Never prints anything: its stdio is detached.
 */
import { refreshVcsCache } from "./vcs-cache.js";

const cwd = process.argv[2];
if (cwd) {
  try {
    await refreshVcsCache(cwd);
  } catch {
    /* nothing to report to: the next render retries */
  }
}
process.exit(0);
