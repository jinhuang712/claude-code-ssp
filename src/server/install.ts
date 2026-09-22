/**
 * Merge our statusLine entry into Claude Code's settings.json atomically, keeping a timestamped backup.
 * Structured JSON merge — never string replacement.
 *
 * The user's own statusline (claude-hud, a hand-written script, …) must survive whatever we do:
 *   - isOurStatusLine() is the single place that decides whether an entry is ours.
 *   - Installing over someone else's entry needs explicit consent (`confirmReplace`) and parks that
 *     entry under PREVIOUS_KEY. Installing over an older entry of *ours* (another checkout, an older
 *     plugin version) never touches PREVIOUS_KEY — earlier versions overwrote it with our own stale
 *     command, and the user's original was lost.
 *   - Uninstall only removes an entry that is ours, and puts PREVIOUS_KEY back if it holds a foreign one.
 *
 * Nothing here prints; the CLI and the HTTP API report results in their own way.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { getClaudeConfigDir } from "../data/claude-config-dir.js";

/** settings.json key holding the statusLine we replaced, restored by uninstall. */
export const PREVIOUS_KEY = "statusLine.previous.claude-code-ssp";

export interface InstallOptions {
  /** Override the launcher command; default resolves this checkout's src/cli/main.ts via bun. */
  command?: string;
  refreshInterval?: number;
  /** Required to replace a statusLine that isn't ours. Without it, install throws NeedsConfirmError. */
  confirmReplace?: boolean;
}

export function settingsPath(homeDir = os.homedir()): string {
  return path.join(getClaudeConfigDir(homeDir), "settings.json");
}

/**
 * Is this settings.json statusLine entry one that we wrote?
 * Every command we install runs `<plugin root>/src/cli/main.ts render`, where the plugin root is either
 * a checkout called claude-code-ssp or a Claude Code plugin-cache dir for the `ssp` plugin. claude-hud
 * and other tools use different entry points, so all three markers together don't collide with them.
 */
export function isOurStatusLine(entry: unknown): boolean {
  if (!entry || typeof entry !== "object") return false;
  const cmd = (entry as { command?: unknown }).command;
  if (typeof cmd !== "string") return false;
  return /src[\\/]cli[\\/]main\.ts/.test(cmd) && /\brender\b/.test(cmd) && /claude-code-ssp|[\\/]ssp[\\/]/.test(cmd);
}

/**
 * The bun binary to bake into the command. process.execPath is the *resolved* binary — under Homebrew
 * that's /opt/homebrew/Cellar/bun/<version>/bin/bun, which disappears after `brew upgrade` + cleanup and
 * silently blanks the statusline. The PATH entry (/opt/homebrew/bin/bun, ~/.bun/bin/bun) is a stable
 * symlink, so prefer it; fall back to execPath, then to a bare `bun` looked up at run time.
 */
export function stableBunPath(): string {
  const onPath = Bun.which("bun");
  if (onPath) return onPath;
  return path.basename(process.execPath).startsWith("bun") ? process.execPath : "bun";
}

/**
 * When we run from Claude Code's plugin cache (`…/plugins/cache/<marketplace>/<plugin>/<version>/`),
 * returns the per-plugin dir above the version dir. A plugin update installs a new version dir next to
 * the old one, so a command pinned to today's version would keep running stale code — or nothing,
 * once the old dir is cleaned up.
 */
export function pluginCacheBase(entry: string): string | null {
  const m = entry.match(/^(.*[\\/]plugins[\\/]cache[\\/][^\\/]+[\\/][^\\/]+)[\\/][^\\/]+[\\/]src[\\/]cli[\\/]main\.ts$/);
  return m ? m[1]! : null;
}

/** POSIX double-quoted string: only \ " $ ` are special inside double quotes. */
function dq(s: string): string {
  return `"${s.replace(/[\\"$`]/g, (c) => `\\${c}`)}"`;
}

/** POSIX single-quoted string: nothing is special except the quote itself. */
function sq(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/** Quote a path only when it needs it, so ordinary installs keep the familiar `bun "…" render` shape. */
function maybeQuote(s: string): string {
  return /^[A-Za-z0-9_./~+-]+$/.test(s) ? s : JSON.stringify(s);
}

/**
 * The statusLine command for an entry point. From a plugin cache it is a small sh script that picks the
 * newest installed version at run time (the same approach claude-hud's installer uses); otherwise the
 * entry path is used as is.
 */
export function launcherCommand(entry: string, bun = stableBunPath()): string {
  const base = pluginCacheBase(entry);
  if (!base) return `${maybeQuote(bun)} ${JSON.stringify(entry)} render`;
  const script = [
    // Newest version dir that actually has our entry point; `sort -V` orders 0.10.0 after 0.9.0.
    `d=$(for x in ${dq(base)}/*/; do [ -f "\${x}src/cli/main.ts" ] && echo "$x"; done | sort -V | tail -n 1)`,
    // Print something instead of failing silently if the plugin was removed without uninstalling.
    `[ -n "$d" ] || { echo "claude-code-ssp: plugin files not found — run /plugin to reinstall"; exit 0; }`,
    `exec ${dq(bun)} "\${d}src/cli/main.ts" render`,
  ].join("; ");
  return `sh -c ${sq(script)}`;
}

export function defaultCommand(): string {
  const entry = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "cli", "main.ts");
  return launcherCommand(entry);
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

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** What install would do, without doing it. Also what GET /api/install returns. */
export interface InstallPlan {
  settingsFile: string;
  /** The statusLine entry install would write. */
  planned: Record<string, unknown>;
  /** settings.json's statusLine right now (null when there is none). */
  current: unknown;
  currentIsOurs: boolean;
  /** A foreign statusLine parked by an earlier install; uninstall restores it. */
  savedPrevious: unknown;
  /** Alias of `current`, kept for panels built before `current` existed. */
  previous: unknown;
}

export function planInstall(opts: InstallOptions = {}): InstallPlan {
  const file = settingsPath();
  const settings = readSettings(file);
  const current = settings.statusLine ?? null;
  const currentIsOurs = isOurStatusLine(current);
  // Reinstalling over our own entry keeps whatever the user added to it (refreshInterval, padding…);
  // only the command is ours to update.
  const planned: Record<string, unknown> = currentIsOurs && isPlainObject(current) ? { ...current } : { padding: 0 };
  planned.type = "command";
  planned.command = opts.command ?? defaultCommand();
  if (opts.refreshInterval) planned.refreshInterval = opts.refreshInterval;
  const saved = settings[PREVIOUS_KEY];
  return { settingsFile: file, planned, current, currentIsOurs, savedPrevious: saved !== undefined && !isOurStatusLine(saved) ? saved : null, previous: current };
}

/** Thrown when install would replace a statusLine that isn't ours and the caller didn't confirm. */
export class NeedsConfirmError extends Error {
  constructor(readonly current: unknown) {
    super("settings.json already has a statusLine that isn't claude-code-ssp's; confirm to replace it (it is kept for uninstall)");
  }
}

export interface InstallResult {
  settingsFile: string;
  backup: string | null;
  /** The statusLine entry that was overwritten (ours or foreign), null when there was none. */
  replaced: unknown;
  /** True when settings.json already had exactly this entry — no write, no backup. */
  unchanged: boolean;
  statusLine: Record<string, unknown>;
}

export function install(opts: InstallOptions = {}): InstallResult {
  const plan = planInstall(opts);
  const settings = readSettings(plan.settingsFile);
  // Heal settings left by the old bug where PREVIOUS_KEY got our own stale command: restoring that on
  // uninstall would just reinstall us.
  const legacyOwnPrevious = isOurStatusLine(settings[PREVIOUS_KEY]);
  if (plan.currentIsOurs && JSON.stringify(plan.current) === JSON.stringify(plan.planned) && !legacyOwnPrevious) {
    return { settingsFile: plan.settingsFile, backup: null, replaced: null, unchanged: true, statusLine: plan.planned };
  }
  if (plan.current !== null && !plan.currentIsOurs) {
    if (!opts.confirmReplace) throw new NeedsConfirmError(plan.current);
    // The newest foreign choice wins: if the user switched to another statusline after installing us,
    // that is the one they'd want back.
    settings[PREVIOUS_KEY] = plan.current;
  } else if (legacyOwnPrevious) {
    delete settings[PREVIOUS_KEY];
  }
  settings.statusLine = plan.planned;
  const backup = writeSettings(plan.settingsFile, settings);
  return { settingsFile: plan.settingsFile, backup, replaced: plan.current, unchanged: false, statusLine: plan.planned };
}

export interface UninstallResult {
  settingsFile: string;
  /** The foreign statusLine put back, if one was parked. */
  restored: unknown;
  /** False when the current statusLine isn't ours — then nothing was changed. */
  removed: boolean;
  backup: string | null;
}

export function uninstall(): UninstallResult {
  const file = settingsPath();
  const settings = readSettings(file);
  if (!isOurStatusLine(settings.statusLine)) return { settingsFile: file, restored: null, removed: false, backup: null };
  const prev = settings[PREVIOUS_KEY];
  const restorable = prev !== undefined && prev !== null && !isOurStatusLine(prev);
  if (restorable) settings.statusLine = prev;
  else delete settings.statusLine;
  delete settings[PREVIOUS_KEY];
  const backup = writeSettings(file, settings);
  return { settingsFile: file, restored: restorable ? prev : null, removed: true, backup };
}
