/**
 * User widget plugins: any *.js / *.mjs / *.ts file in the plugin dirs whose default export is a
 * widget definition (or an array of them). Load failures are collected, never thrown.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { userConfigDir } from "./config.js";
import { registerWidget } from "./registry.js";
import type { FooterConfig, WidgetDefinition } from "./types.js";

export interface PluginLoadReport {
  dirs: string[];
  loaded: Array<{ file: string; ids: string[] }>;
  errors: Array<{ file: string; message: string }>;
}

export function pluginDirs(config: FooterConfig, cwd?: string): string[] {
  const dirs = [path.join(userConfigDir(), "widgets")];
  if (cwd) dirs.push(path.join(cwd, ".claude", "claude-code-ssp", "widgets"));
  for (const d of config.plugins.dirs) dirs.push(path.resolve(d));
  return [...new Set(dirs)];
}

function isDef(v: unknown): v is WidgetDefinition {
  return typeof v === "object" && v !== null && typeof (v as WidgetDefinition).id === "string" && typeof (v as WidgetDefinition).render === "function";
}

export async function loadPlugins(config: FooterConfig, cwd?: string): Promise<PluginLoadReport> {
  const report: PluginLoadReport = { dirs: pluginDirs(config, cwd), loaded: [], errors: [] };
  for (const dir of report.dirs) {
    let files: string[];
    try {
      files = fs.readdirSync(dir).filter((f) => /\.(m?js|ts)$/.test(f) && !f.endsWith(".d.ts"));
    } catch {
      continue;
    }
    for (const f of files.sort()) {
      const file = path.join(dir, f);
      try {
        const mod = (await import(pathToFileURL(file).href)) as { default?: unknown };
        const defs = Array.isArray(mod.default) ? mod.default : [mod.default];
        const ids: string[] = [];
        for (const d of defs) {
          if (!isDef(d)) throw new Error("default export is not a widget definition ({ id, render, ... })");
          registerWidget(d, "plugin", file);
          ids.push(d.id);
        }
        report.loaded.push({ file, ids });
      } catch (err) {
        report.errors.push({ file, message: err instanceof Error ? err.message : String(err) });
      }
    }
  }
  return report;
}
