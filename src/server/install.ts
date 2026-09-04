/**
 * Merge our statusLine entry into Claude Code's settings.json atomically, keeping a timestamped backup.
 * Structured JSON merge — never string replacement.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { getClaudeConfigDir } from "../data/claude-config-dir.js";

export interface InstallOptions {
  dryRun?: boolean;
  /** Override the launcher command; default resolves this checkout's src/cli/main.ts via bun. */
  command?: string;
  refreshInterval?: number;
}

export function settingsPath(homeDir = os.homedir()): string {
  return path.join(getClaudeConfigDir(homeDir), "settings.json");
}

export function defaultCommand(): string {
  const entry = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "cli", "main.ts");
  const bun = process.execPath.includes("bun") ? process.execPath : "bun";
  // COLUMNS is provided by Claude Code; we subtract a little for the built-in footer padding.
  return `${bun} ${JSON.stringify(entry)} render`;
}

function readSettings(file: string): Record<string, unknown> {
  try {
    const raw = fs.readFileSync(file, "utf8").replace(/^﻿/, "");
    const parsed = JSON.parse(raw) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw new Error(`cannot parse ${file}: ${(err as Error).message}`);
  }
}

function writeSettings(file: string, value: Record<string, unknown>): string | null {
  let backup: string | null = null;
  if (fs.existsSync(file)) {
    backup = `${file}.bak.${Date.now()}`;
    fs.copyFileSync(file, backup);
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n");
  fs.renameSync(tmp, file);
  return backup;
}

export interface InstallResult {
  settingsFile: string;
  backup: string | null;
  previous: unknown;
  statusLine: Record<string, unknown>;
  dryRun: boolean;
  /** True when settings.json already pointed at us — no write, no backup. Makes auto-ensure safe to call on every save. */
  unchanged?: boolean;
}

export function planInstall(opts: InstallOptions = {}): InstallResult {
  const file = settingsPath();
  const settings = readSettings(file);
  const statusLine: Record<string, unknown> = {
    type: "command",
    command: opts.command ?? defaultCommand(),
    padding: 0,
  };
  if (opts.refreshInterval) statusLine.refreshInterval = opts.refreshInterval;
  return { settingsFile: file, backup: null, previous: settings.statusLine, statusLine, dryRun: !!opts.dryRun };
}

export function install(opts: InstallOptions = {}): InstallResult {
  const plan = planInstall(opts);
  if (plan.dryRun) {
    console.log(JSON.stringify(plan, null, 2));
    return plan;
  }
  const settings = readSettings(plan.settingsFile);
  if (plan.previous && JSON.stringify(plan.previous) === JSON.stringify(plan.statusLine)) {
    console.log(`statusLine already installed in ${plan.settingsFile} — nothing to do`);
    return { ...plan, unchanged: true };
  }
  if (plan.previous && JSON.stringify(plan.previous) !== JSON.stringify(plan.statusLine)) {
    settings["statusLine.previous.claude-code-ssp"] = plan.previous;
  }
  settings.statusLine = plan.statusLine;
  plan.backup = writeSettings(plan.settingsFile, settings);
  console.log(`installed statusLine → ${plan.settingsFile}${plan.backup ? ` (backup: ${plan.backup})` : ""}`);
  return plan;
}

export function uninstall(): void {
  const file = settingsPath();
  const settings = readSettings(file);
  const prev = settings["statusLine.previous.claude-code-ssp"];
  if (prev) {
    settings.statusLine = prev;
    delete settings["statusLine.previous.claude-code-ssp"];
  } else {
    delete settings.statusLine;
  }
  const backup = writeSettings(file, settings);
  console.log(`statusLine ${prev ? "restored" : "removed"} in ${file}${backup ? ` (backup: ${backup})` : ""}`);
}
