/**
 * environment.counts must include MCP servers that plugins bring (src/core/plugin-mcp.ts), not just
 * those in settings / .mcp.json — it said "1 MCPs" where Claude Code loaded ten.
 */
import { describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { countPluginMcpServers } from "../src/core/plugin-mcp";

function write(file: string, value: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof value === "string" ? value : JSON.stringify(value));
}

describe("countPluginMcpServers", () => {
  const claude = fs.mkdtempSync(path.join(os.tmpdir(), "ssp-plugmcp-"));
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "ssp-plugmcp-proj-"));
  const cache = path.join(claude, "plugins", "cache");
  // a@m: .mcp.json with two servers (enabled). b@m: plugin.json object (enabled only in the project).
  // c@m: plugin.json points at a file (disabled). d@m: enabled but has no servers.
  write(path.join(cache, "a", ".mcp.json"), { mcpServers: { one: {}, two: {} } });
  write(path.join(cache, "b", ".claude-plugin", "plugin.json"), { name: "b", mcpServers: { three: {} } });
  write(path.join(cache, "c", ".claude-plugin", "plugin.json"), { name: "c", mcpServers: "./servers.json" });
  write(path.join(cache, "c", "servers.json"), { mcpServers: { four: {} } });
  write(path.join(cache, "d", ".claude-plugin", "plugin.json"), { name: "d" });
  const entry = (p: string) => [{ scope: "user", installPath: path.join(cache, p) }];
  write(path.join(claude, "plugins", "installed_plugins.json"), { version: 2, plugins: { "a@m": entry("a"), "b@m": entry("b"), "c@m": entry("c"), "d@m": entry("d") } });
  write(path.join(claude, "settings.json"), { enabledPlugins: { "a@m": true, "c@m": false, "d@m": true } });
  write(path.join(project, ".claude", "settings.json"), { enabledPlugins: { "b@m": true } });
  // A synced (claude.ai org) plugin: loaded without an enabledPlugins entry.
  write(path.join(claude, "plugins", "synced", "bucket1", "design", ".mcp.json"), { mcpServers: { slack: {}, figma: {} } });
  write(path.join(claude, "plugins", "synced", ".bucket-bucket1"), "x");

  test("enabled installed plugins + synced plugins, disabled ones skipped", () => {
    expect(countPluginMcpServers(claude, undefined)).toBe(2 + 2); // a (one, two) + synced design (slack, figma)
    expect(countPluginMcpServers(claude, project)).toBe(2 + 1 + 2); // + b (three), enabled by the project
  });

  test("a missing or broken plugins dir counts zero instead of throwing", () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), "ssp-plugmcp-empty-"));
    expect(countPluginMcpServers(empty, undefined)).toBe(0);
    write(path.join(empty, "plugins", "installed_plugins.json"), "{not json");
    expect(countPluginMcpServers(empty, undefined)).toBe(0);
  });
});
