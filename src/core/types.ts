/**
 * Core contracts shared by the render engine, the widget registry, the CLI and the web server.
 * Everything here is plain data — no I/O.
 */
import type { RenderContext as DataContext } from "../data/types.js";

/** Theme token or literal color ("#rrggbb", "208", "red", "brightBlue"). */
export type Color = string;

export interface Style {
  fg?: Color;
  bg?: Color;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
}

export interface Segment {
  text: string;
  style?: Style;
  /** OSC 8 hyperlink target. */
  link?: string;
}

export type Zone = "left" | "center" | "right";

export type OverflowPolicy = "wrap" | "truncate" | "drop-right";

export interface WidgetInstance {
  /** Registry id, e.g. "context.bar". */
  widget: string;
  /** Widget-specific options validated against the widget's JSON schema. */
  options?: Record<string, unknown>;
  /** Style override applied on top of whatever the widget emits. */
  style?: Style;
  /** Optional label to prefix (widgets decide whether they honour it). */
  label?: string | null;
}

export interface LineConfig {
  left?: WidgetInstance[];
  center?: WidgetInstance[];
  right?: WidgetInstance[];
  /** Overrides the global separator for this line. */
  separator?: string;
  overflow?: OverflowPolicy;
  /** Hide the whole line when the terminal is narrower than this. */
  minColumns?: number;
}

export type ColorLevel = "auto" | "truecolor" | "256" | "16" | "none";

export interface ThemeTokens {
  fg: Color;
  muted: Color;
  accent: Color;
  ok: Color;
  warn: Color;
  crit: Color;
  model: Color;
  project: Color;
  git: Color;
  usage: Color;
  context: Color;
  [token: string]: Color;
}

export interface ThemeDef {
  name: string;
  tokens: ThemeTokens;
  /** Glyphs used by bar widgets. */
  bar?: { filled: string; empty: string };
}

export interface GitConfig {
  enabled: boolean;
  /** Milliseconds a cached git status stays valid when .git/HEAD and .git/index are unchanged. */
  cacheMs: number;
}

export interface PluginsConfig {
  /** Extra directories scanned for widget modules. */
  dirs: string[];
}

export interface FooterConfig {
  $schema?: string;
  version: 1;
  theme: string | ThemeDef;
  colorLevel: ColorLevel;
  separator: string;
  /** Cells subtracted from $COLUMNS to leave room for Claude Code's own footer padding. */
  columnsOffset: number;
  lines: LineConfig[];
  git: GitConfig;
  plugins: PluginsConfig;
  /** Persist the last stdin payload per session for the web preview. */
  captureSamples: boolean;
}

/** What widgets see. Read-only view over the harvested data context plus render-time facts. */
export interface Ctx extends DataContext {
  columns: number;
  now: number;
  theme: ThemeDef;
}

export interface WidgetApi {
  /** ok | warn | crit for a 0–100 value. */
  level(pct: number, warnAt?: number, critAt?: number): "ok" | "warn" | "crit";
  /** Progress bar using the theme's glyphs. */
  bar(pct: number, width?: number): string;
  /** 12345 → "12k", 1_234_567 → "1.2M". */
  tokens(n: number): string;
  /** Milliseconds → "3h 41m". */
  duration(ms: number): string;
  /** Unix seconds/ms or Date → relative "in 3h 41m" / "26m ago". */
  relative(when: number | Date, now?: number): string;
  seg(text: string, style?: Style): Segment;
}

export interface JsonSchema {
  type?: string | string[];
  title?: string;
  description?: string;
  default?: unknown;
  enum?: unknown[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  minimum?: number;
  maximum?: number;
  required?: string[];
  [k: string]: unknown;
}

export type WidgetCategory =
  | "model"
  | "project"
  | "git"
  | "context"
  | "usage"
  | "cost"
  | "session"
  | "activity"
  | "environment"
  | "misc";

export interface WidgetDefinition<O extends Record<string, unknown> = Record<string, unknown>> {
  id: string;
  name: string;
  description: string;
  category: WidgetCategory;
  schema: JsonSchema;
  defaults: O;
  /** Example output shown in the picker. */
  sample?: string;
  render(ctx: Ctx, opts: O, api: WidgetApi): Segment[] | string | null;
  /** Optional numeric value (0–100 or raw) for generic threshold coloring. */
  numeric?(ctx: Ctx, opts: O): number | null;
}

export interface RegisteredWidget extends WidgetDefinition {
  source: "builtin" | "plugin";
  sourcePath?: string;
}

/** Serializable manifest sent to the web UI. */
export interface WidgetManifest {
  id: string;
  name: string;
  description: string;
  category: WidgetCategory;
  schema: JsonSchema;
  defaults: Record<string, unknown>;
  sample?: string;
  source: "builtin" | "plugin";
  sourcePath?: string;
}

export interface RenderedLine {
  text: string;
  /** Visual width of the line after layout, for diagnostics. */
  width: number;
}

export interface RenderOptions {
  /** Preview only: when a widget has no data, print its sample text instead of dropping it. */
  fillEmpty?: boolean;
}

export interface RenderResult {
  lines: string[];
  /** Per-widget errors swallowed during render (plugin failures etc.). */
  errors: Array<{ widget: string; message: string }>;
  /** Widgets that rendered nothing for this payload; `filled` means the sample text stood in for it. */
  empty: Array<{ line: number; zone: Zone; index: number; widget: string; filled?: boolean }>;
  ms: number;
}

export function defineWidget<O extends Record<string, unknown>>(def: WidgetDefinition<O>): WidgetDefinition<O> {
  return def;
}
