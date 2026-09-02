#!/usr/bin/env node
// Thin launcher: prefer bun for startup speed, fall back to node running the bundled dist.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, "..", "dist", "main.js");
const r = spawnSync(process.execPath, [dist, ...process.argv.slice(2)], { stdio: "inherit" });
process.exit(r.status ?? 1);
