// Types mirrored from src/core/types.ts (kept small on purpose).
export interface Style {
  fg?: string;
  bg?: string;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
}
export interface WidgetInstance {
  widget: string;
  options?: Record<string, unknown>;
  style?: Style;
  label?: string | null;
}
export type Zone = "left" | "center" | "right";
export interface LineConfig {
  left?: WidgetInstance[];
  center?: WidgetInstance[];
  right?: WidgetInstance[];
  separator?: string;
  overflow?: "wrap" | "truncate" | "drop-right";
  minColumns?: number;
}
export interface ThemeDef {
  name: string;
  tokens: Record<string, string>;
  bar?: { filled: string; empty: string };
}
export interface FooterConfig {
  version: 1;
  theme: string | ThemeDef;
  colorLevel: "auto" | "truecolor" | "256" | "16" | "none";
  separator: string;
  bar?: { filled: string; empty: string };
  columnsOffset: number;
  lines: LineConfig[];
  git: { enabled: boolean; cacheMs: number };
  plugins: { dirs: string[] };
  captureSamples: boolean;
}
export interface JsonSchema {
  type?: string | string[];
  title?: string;
  description?: string;
  default?: unknown;
  enum?: unknown[];
  properties?: Record<string, JsonSchema>;
  minimum?: number;
  maximum?: number;
  [k: string]: unknown;
}
export interface WidgetManifest {
  id: string;
  name: string;
  description: string;
  category: string;
  schema: JsonSchema;
  defaults: Record<string, unknown>;
  sample?: string;
  source: "builtin" | "plugin";
  sourcePath?: string;
}
export interface SampleMeta {
  id: string;
  label: string;
  capturedAt: number | null;
  source: "live" | "fixture";
}
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
  paths: { user: string; project: string };
}
export interface RenderResult {
  lines: string[];
  errors: Array<{ widget: string; message: string }>;
  empty: Array<{ line: number; zone: Zone; index: number; widget: string; filled?: boolean }>;
  ms: number;
}

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

export interface DoctorReport {
  layers: Array<{ name: string; path: string | null; exists: boolean; error: string | null }>;
  plugins: { dirs: string[]; loaded: Array<{ file: string; ids: string[] }>; errors: Array<{ file: string; message: string }> };
  settings: { path: string; statusLine: unknown; error: string | null };
  lastPayload: { id: string; capturedAt: number | null; payload: unknown } | null;
}

export const api = {
  doctor: () => fetch("/api/doctor").then(j<DoctorReport>),
  config: () => fetch("/api/config").then(j<EffectiveConfig>),
  saveConfig: (config: Partial<FooterConfig>, scope: "user" | "project") =>
    fetch("/api/config", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ config, scope }) }).then(j<{ ok: true; path: string }>),
  widgets: () => fetch("/api/widgets").then(j<WidgetManifest[]>),
  themes: () => fetch("/api/themes").then(j<ThemeDef[]>),
  samples: () => fetch("/api/samples").then(j<SampleMeta[]>),
  render: (config: FooterConfig, sampleId: string | null, columns: number, fillEmpty = true) =>
    fetch("/api/render", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ config, sampleId, columns, fillEmpty }) }).then(j<RenderResult>),
  installPlan: () => fetch("/api/install").then(j<{ settingsFile: string; statusLine: Record<string, unknown>; previous: unknown }>),
  install: () => fetch("/api/install", { method: "POST" }).then(j<{ settingsFile: string; backup: string | null }>),
  reset: (sessionId?: string) => fetch("/api/reset", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId }) }).then(j<{ sessionId: string; baseline: { at: number } }>),
  undoReset: (sessionId: string) => fetch("/api/reset", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId, undo: true }) }).then(j<{ ok: true }>),
};
