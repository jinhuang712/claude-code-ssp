/**
 * MCP servers that Claude Code starts from plugins.
 *
 * claude-hud's config reader (src/data/config-reader.ts) counts servers from ~/.claude.json,
 * settings files and .mcp.json only, so environment.counts said "1 MCPs" on a machine where
 * Claude Code actually loads ten: plugins bring their own servers. Two sources, as observed on
 * Claude Code 2.1.280:
 *
 *  - installed plugins (~/.claude/plugins/installed_plugins.json, format v2) that are enabled in
 *    `enabledPlugins` of the user or project settings; a plugin declares servers in its root
 *    `.mcp.json` and/or `.claude-plugin/plugin.json` → `mcpServers` (an object, or a path to one);
 *  - plugins synced from a claude.ai organisation (~/.claude/plugins/synced/<bucket>/<plugin>/),
 *    which Claude Code loads without an `enabledPlugins` entry (a synced plugin with a 9-server
 *    .mcp.json matched `/reload-plugins` reporting "9 plugin MCP servers").
 *
 * claude.ai connectors (Gmail, Calendar, …) are configured on the account, not on disk, so no
 * local file can count them. Everything here is best-effort: unreadable files count as zero.
 */
import * as fs from "node:fs";
import * as path from "node:path";

type Json = Record<string, unknown>;

function readJson(file: string): Json | null {
  try {
    const v = JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
    return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Json) : null;
  } catch {
    return null; // missing or malformed: contributes nothing
  }
}

/** Server names in an mcp.json-style object: `{ mcpServers: { name: … } }`. */
function serverNames(obj: Json | null): string[] {
  const servers = obj?.mcpServers;
  return typeof servers === "object" && servers !== null && !Array.isArray(servers) ? Object.keys(servers) : [];
}

/** All servers one plugin directory declares. */
function pluginServers(root: string): string[] {
  const names = new Set(serverNames(readJson(path.join(root, ".mcp.json"))));
  const manifest = readJson(path.join(root, ".claude-plugin", "plugin.json"));
  const decl = manifest?.mcpServers;
  if (typeof decl === "string") for (const n of serverNames(readJson(path.resolve(root, decl)))) names.add(n);
  else if (typeof decl === "object" && decl !== null && !Array.isArray(decl)) for (const n of Object.keys(decl)) names.add(n);
  return [...names];
}

/** `enabledPlugins` merged across the settings layers Claude Code reads (later layers win). */
function enabledPlugins(claudeDir: string, cwd: string | undefined): Set<string> {
  const layers = [path.join(claudeDir, "settings.json")];
  if (cwd) layers.push(path.join(cwd, ".claude", "settings.json"), path.join(cwd, ".claude", "settings.local.json"));
  const state = new Map<string, boolean>();
  for (const file of layers) {
    const ep = readJson(file)?.enabledPlugins;
    if (typeof ep === "object" && ep !== null) for (const [id, on] of Object.entries(ep as Json)) state.set(id, on === true);
  }
  return new Set([...state].filter(([, on]) => on).map(([id]) => id));
}

/** Number of distinct plugin-provided MCP servers (keyed plugin:server, as Claude Code namespaces them). */
export function countPluginMcpServers(claudeDir: string, cwd: string | undefined): number {
  const seen = new Set<string>();
  const pluginsDir = path.join(claudeDir, "plugins");

  const installed = readJson(path.join(pluginsDir, "installed_plugins.json"))?.plugins;
  if (typeof installed === "object" && installed !== null) {
    for (const id of enabledPlugins(claudeDir, cwd)) {
      const entries = (installed as Json)[id];
      const root = Array.isArray(entries) ? (entries[0] as { installPath?: unknown } | undefined)?.installPath : undefined;
      if (typeof root !== "string") continue;
      for (const s of pluginServers(root)) seen.add(`${id.split("@")[0]}:${s}`);
    }
  }

  let buckets: string[] = [];
  try {
    buckets = fs.readdirSync(path.join(pluginsDir, "synced")).filter((b) => !b.startsWith("."));
  } catch {
    /* no synced plugins */
  }
  for (const bucket of buckets) {
    let plugins: string[] = [];
    try {
      plugins = fs.readdirSync(path.join(pluginsDir, "synced", bucket)).filter((p) => !p.startsWith("."));
    } catch {
      continue;
    }
    for (const p of plugins) for (const s of pluginServers(path.join(pluginsDir, "synced", bucket, p))) seen.add(`${p}:${s}`);
  }
  return seen.size;
}
