/**
 * Fingerprint of everything the web UI build reads, so a committed web/dist can be checked against
 * its sources without trusting file mtimes (git checkouts and pulls don't preserve them).
 *
 * web/dist is committed on purpose: marketplace installs clone the repo and should open the
 * configurator immediately, without a ~100 MB `bun install` + vite build on first run.
 *
 *   bun scripts/web-hash.ts           print the current source hash
 *   bun scripts/web-hash.ts --write   record it as web/dist/.source-hash (run right after a build)
 *   bun scripts/web-hash.ts --check   exit 1 if web/dist is missing or was built from other sources
 */
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

const WEB = path.resolve(import.meta.dir, "..", "web");
const STAMP = path.join(WEB, "dist", ".source-hash");

/** Inputs of `tsc -b && vite build`. Lockfiles are left out: they change without changing output. */
const INPUTS = ["src", "public", "index.html", "package.json", "vite.config.ts", "tsconfig.json", "tsconfig.app.json", "tsconfig.node.json"];

function files(rel: string): string[] {
  const abs = path.join(WEB, rel);
  if (!fs.existsSync(abs)) return [];
  if (!fs.statSync(abs).isDirectory()) return [rel];
  return fs
    .readdirSync(abs, { withFileTypes: true })
    .filter((e) => e.name !== ".DS_Store")
    .flatMap((e) => files(path.join(rel, e.name)));
}

/** sha256 over sorted (path, content) pairs; paths use "/" so the hash matches across platforms. */
export function webSourceHash(): string {
  const h = createHash("sha256");
  for (const rel of INPUTS.flatMap(files).sort()) {
    h.update(rel.split(path.sep).join("/"));
    h.update("\0");
    h.update(fs.readFileSync(path.join(WEB, rel)));
    h.update("\0");
  }
  return h.digest("hex");
}

export function recordedHash(): string | null {
  try {
    return fs.readFileSync(STAMP, "utf8").trim();
  } catch {
    return null;
  }
}

if (import.meta.main) {
  const arg = process.argv[2];
  const current = webSourceHash();
  if (arg === "--write") {
    fs.writeFileSync(STAMP, `${current}\n`);
  } else if (arg === "--check") {
    const ok = fs.existsSync(path.join(WEB, "dist", "index.html")) && recordedHash() === current;
    process.exit(ok ? 0 : 1);
  } else {
    console.log(current);
  }
}
