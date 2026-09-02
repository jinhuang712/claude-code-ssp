/**
 * Config loading with three layers: defaults → user file → project file.
 * Objects deep-merge; `lines` replaces wholesale.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { FooterConfig, LineConfig } from "./types.js";

export const CONFIG_VERSION = 1 as const;

export function userConfigDir(env: NodeJS.ProcessEnv = process.env, homeDir = os.homedir()): string {
  const xdg = env.XDG_CONFIG_HOME && env.XDG_CONFIG_HOME.trim() ? env.XDG_CONFIG_HOME : path.join(homeDir, ".config");
  return path.join(xdg, "claude-code-ssp");
}

export function userConfigPath(env: NodeJS.ProcessEnv = process.env, homeDir = os.homedir()): string {
  const explicit = env.CLAUDE_CODE_SSP_CONFIG?.trim();
  if (explicit) return path.resolve(explicit.replace(/^~(?=$|[\\/])/, homeDir));
  return path.join(userConfigDir(env, homeDir), "config.json");
}

export function projectConfigPath(cwd: string): string {
  return path.join(cwd, ".claude", "claude-code-ssp.json");
}

export const DEFAULT_LINES: LineConfig[] = [
  {
    left: [{ widget: "project.path" }, { widget: "git.branch" }],
    right: [{ widget: "model.badge" }, { widget: "session.duration" }, { widget: "cost.session" }],
  },
  {
    left: [{ widget: "usage.windows" }],
    right: [{ widget: "context.bar" }],
  },
  {
    left: [{ widget: "tokens.session" }],
    right: [{ widget: "session.started" }, { widget: "session.lastReply" }],
  },
  {
    left: [{ widget: "activity.agents" }, { widget: "activity.todos" }],
  },
];

export const DEFAULT_CONFIG: FooterConfig = {
  version: CONFIG_VERSION,
  theme: "default",
  colorLevel: "auto",
  separator: " │ ",
  columnsOffset: 4,
  lines: DEFAULT_LINES,
  git: { enabled: true, cacheMs: 2000 },
  plugins: { dirs: [] },
  captureSamples: true,
};

export interface ConfigLayer {
  name: "defaults" | "user" | "project";
  path: string | null;
  exists: boolean;
  value: Partial<FooterConfig> | null;
  error?: string;
}

export interface EffectiveConfig {
  config: FooterConfig;
  layers: ConfigLayer[];
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Deep-merge where arrays and primitives from `over` replace `base`. */
export function mergeConfig<T>(base: T, over: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(over)) return (over === undefined ? base : (over as T));
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(over)) {
    if (v === undefined) continue;
    out[k] = isPlainObject(v) && isPlainObject(out[k]) ? mergeConfig(out[k], v) : v;
  }
  return out as T;
}

function readLayer(name: ConfigLayer["name"], filePath: string | null): ConfigLayer {
  if (!filePath) return { name, path: null, exists: false, value: null };
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!isPlainObject(parsed)) return { name, path: filePath, exists: true, value: null, error: "top-level value is not an object" };
    return { name, path: filePath, exists: true, value: parsed as Partial<FooterConfig> };
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === "ENOENT") return { name, path: filePath, exists: false, value: null };
    return { name, path: filePath, exists: true, value: null, error: e.message };
  }
}

/** Minimal shape validation; unknown keys are kept so plugins can stash settings. */
export function normalizeConfig(input: Partial<FooterConfig>): FooterConfig {
  const merged = mergeConfig(DEFAULT_CONFIG, input);
  const lines = Array.isArray(merged.lines) ? merged.lines.filter(isPlainObject) : DEFAULT_LINES;
  const cleanLine = (l: LineConfig): LineConfig => ({
    ...l,
    left: Array.isArray(l.left) ? l.left.filter((w) => isPlainObject(w) && typeof w.widget === "string") : [],
    center: Array.isArray(l.center) ? l.center.filter((w) => isPlainObject(w) && typeof w.widget === "string") : [],
    right: Array.isArray(l.right) ? l.right.filter((w) => isPlainObject(w) && typeof w.widget === "string") : [],
  });
  return {
    ...merged,
    version: CONFIG_VERSION,
    separator: typeof merged.separator === "string" ? merged.separator : DEFAULT_CONFIG.separator,
    colorLevel: ["auto", "truecolor", "256", "16", "none"].includes(merged.colorLevel as string) ? merged.colorLevel : "auto",
    columnsOffset: Number.isFinite(merged.columnsOffset) ? Math.max(0, Math.floor(Number(merged.columnsOffset))) : DEFAULT_CONFIG.columnsOffset,
    lines: lines.map(cleanLine),
    git: { enabled: merged.git?.enabled !== false, cacheMs: Number.isFinite(merged.git?.cacheMs) ? Number(merged.git.cacheMs) : 2000 },
    plugins: { dirs: Array.isArray(merged.plugins?.dirs) ? merged.plugins.dirs.filter((d) => typeof d === "string") : [] },
    captureSamples: merged.captureSamples !== false,
  };
}

export function loadEffectiveConfig(cwd: string | undefined, env: NodeJS.ProcessEnv = process.env): EffectiveConfig {
  const layers: ConfigLayer[] = [
    { name: "defaults", path: null, exists: true, value: DEFAULT_CONFIG },
    readLayer("user", userConfigPath(env)),
    readLayer("project", cwd ? projectConfigPath(cwd) : null),
  ];
  let acc: Partial<FooterConfig> = {};
  for (const layer of layers) if (layer.value) acc = mergeConfig(acc, layer.value);
  return { config: normalizeConfig(acc), layers };
}

export function writeUserConfig(config: Partial<FooterConfig>, env: NodeJS.ProcessEnv = process.env): string {
  const target = userConfigPath(env);
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ $schema: "https://github.com/jinhuang712/claude-code-ssp/schema/config.json", ...config }, null, 2) + "\n", { mode: 0o600 });
  fs.renameSync(tmp, target);
  return target;
}

export function writeProjectConfig(cwd: string, config: Partial<FooterConfig>): string {
  const target = projectConfigPath(cwd);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(config, null, 2) + "\n");
  fs.renameSync(tmp, target);
  return target;
}
